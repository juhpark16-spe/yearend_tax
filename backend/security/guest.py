"""게스트(로그인 없이 둘러보기) 세션 분리 모듈

- 게스트마다 서버가 서명한 고유 토큰(guest.<id>.<만료>.<서명>)을 발급해, 게스트끼리 같은 계정(기본 사용자)을
  공유하지 않도록 한다. 세션 소유권 검사는 로그인 사용자와 똑같이 적용된다.
- 서명: HMAC-SHA256(GUEST_TOKEN_SECRET 또는 SECRET_KEY). 둘 다 기본값이면 프로세스마다 임의 키를 만들며
  (서버 재시작 시 기존 게스트 토큰은 무효), 운영 환경에서는 GUEST_TOKEN_SECRET 설정을 권장한다.
- 만료: GUEST_SESSION_TTL_HOURS (기본 24시간). 만료된 게스트의 서버 자료는 새 게스트 발급 시 정리된다.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status

from backend.core.config import settings

logger = logging.getLogger(__name__)

GUEST_TOKEN_PREFIX = "guest."
GUEST_USER_PREFIX = "guest-"
GUEST_EMAIL_DOMAIN = "guest.selftax"
_PLACEHOLDER_SECRET = "change-this-secret-key-in-production"
_RUNTIME_SECRET = secrets.token_bytes(32)


def _secret() -> bytes:
    configured = str(getattr(settings, "GUEST_TOKEN_SECRET", "") or "")
    if not configured:
        key = str(getattr(settings, "SECRET_KEY", "") or "")
        configured = "" if key == _PLACEHOLDER_SECRET else key
    if not configured:
        if str(getattr(settings, "ENVIRONMENT", "")).lower() == "production":
            logger.warning("GUEST_TOKEN_SECRET/SECRET_KEY 미설정: 게스트 토큰을 임시 키로 서명합니다 (재시작 시 무효).")
        return _RUNTIME_SECRET
    return configured.encode("utf-8")


def _ttl_seconds() -> int:
    hours = int(getattr(settings, "GUEST_SESSION_TTL_HOURS", 24) or 24)
    return max(1, hours) * 3600


def _sign(guest_hex: str, exp: int) -> str:
    mac = hmac.new(_secret(), f"{guest_hex}.{exp}".encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail,
                         headers={"WWW-Authenticate": "Bearer"})


def issue_guest_token() -> dict:
    """새 게스트 식별자와 서명 토큰을 발급한다."""
    guest_hex = uuid.uuid4().hex
    exp = int(time.time()) + _ttl_seconds()
    token = f"{GUEST_TOKEN_PREFIX}{guest_hex}.{exp}.{_sign(guest_hex, exp)}"
    return {
        "guest_token": token,
        "guest_id": f"{GUEST_USER_PREFIX}{guest_hex}",
        "expires_at": datetime.fromtimestamp(exp, tz=timezone.utc).isoformat(),
    }


def is_guest_token(token: str) -> bool:
    return (token or "").startswith(GUEST_TOKEN_PREFIX)


def verify_guest_token(token: str) -> str:
    """게스트 토큰의 서명·만료를 확인하고 게스트 사용자 키(guest-<hex>)를 돌려준다. 실패 시 401."""
    parts = (token or "")[len(GUEST_TOKEN_PREFIX):].split(".")
    if len(parts) != 3:
        raise _unauthorized("유효하지 않은 게스트 토큰입니다.")
    guest_hex, exp_str, sig = parts
    try:
        uuid.UUID(hex=guest_hex)
        exp = int(exp_str)
    except (ValueError, TypeError):
        raise _unauthorized("유효하지 않은 게스트 토큰입니다.")
    if not hmac.compare_digest(sig, _sign(guest_hex, exp)):
        raise _unauthorized("유효하지 않은 게스트 토큰입니다.")
    if exp < time.time():
        raise _unauthorized("게스트 이용 시간이 만료되었습니다. 다시 시작해 주세요.")
    return f"{GUEST_USER_PREFIX}{guest_hex}"


def is_guest_user_key(user_key: Optional[str]) -> bool:
    return str(user_key or "").startswith(GUEST_USER_PREFIX)


def guest_email(user_key: str) -> str:
    return f"{user_key}@{GUEST_EMAIL_DOMAIN}"


def purge_expired_guest_data(db) -> int:
    """만료 시간이 지난 게스트 사용자와 그 세션(문서·입력·결과·감사로그 포함)을 삭제한다."""
    from backend.models.user import User

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=_ttl_seconds())
    removed = 0
    for user in db.query(User).filter(User.email.like(f"%@{GUEST_EMAIL_DOMAIN}")).all():
        created = user.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if created is not None and created < cutoff:
            db.delete(user)
            removed += 1
    if removed:
        db.commit()
    return removed


def delete_guest_data(db, user_key: str) -> int:
    """해당 게스트의 서버 자료(세션 전체)를 즉시 삭제한다. 삭제한 세션 수를 돌려준다."""
    from backend.models.user import User
    from backend.security.auth import resolve_user_id

    user = db.query(User).filter(User.id == resolve_user_id(user_key)).first()
    if not user:
        return 0
    count = len(user.sessions or [])
    db.delete(user)
    db.commit()
    return count
