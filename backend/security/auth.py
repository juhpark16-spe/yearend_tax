"""사용자 인증 및 세션 소유권 인가(Authorization) 가드 모듈
- Supabase Auth JWT 및 사용자 ID (UID) 추출
- 세션 소유자와 요청자 대조를 통한 종단간 인가 가드 제공
"""
from __future__ import annotations

import base64
import json
import time
import uuid
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import get_db
from backend.models.session import TaxSession
from backend.models.user import User
from backend.services.tax_session_service import TaxSessionService


def resolve_user_id(user_id_str: Optional[str]) -> Optional[uuid.UUID]:
    """문자열 형태의 user_id를 UUID로 변환합니다.
    표준 UUID 문자열이면 그대로 변환하고,
    데모 사용자 등 임의 문자열인 경우 uuid5(NAMESPACE_DNS)로 결정론적 UUID를 생성합니다.
    """
    if not user_id_str:
        return None
    try:
        return uuid.UUID(str(user_id_str))
    except (ValueError, AttributeError):
        return uuid.uuid5(uuid.NAMESPACE_DNS, str(user_id_str))


_JWKS_CACHE: dict = {"keys": None, "fetched_at": 0.0}
_JWKS_TTL_SECONDS = 3600


def _is_production() -> bool:
    return str(getattr(settings, "ENVIRONMENT", "")).lower() == "production"


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _fetch_jwks() -> list:
    """Supabase 프로젝트의 공개키(JWKS)를 가져와 1시간 캐시한다."""
    now = time.time()
    if _JWKS_CACHE["keys"] is not None and now - _JWKS_CACHE["fetched_at"] < _JWKS_TTL_SECONDS:
        return _JWKS_CACHE["keys"]
    base = str(getattr(settings, "SUPABASE_URL", "") or "").rstrip("/")
    if not base:
        return []
    import urllib.request
    with urllib.request.urlopen(f"{base}/auth/v1/.well-known/jwks.json", timeout=5) as resp:
        keys = json.loads(resp.read().decode("utf-8")).get("keys", [])
    _JWKS_CACHE.update({"keys": keys, "fetched_at": now})
    return keys


def _verification_configured() -> bool:
    return bool(getattr(settings, "SUPABASE_JWT_SECRET", "") or getattr(settings, "SUPABASE_URL", ""))


def _verify_jwt(token: str) -> dict:
    """서명·만료·audience를 검증하고 payload를 반환한다. 실패 시 401.
    - SUPABASE_JWT_SECRET 설정 시: HS256 (Supabase 레거시 JWT 시크릿)
    - SUPABASE_URL 설정 시: JWKS 공개키 (ES256/RS256, Supabase 신규 서명키)
    """
    from jose import JWTError, jwt as jose_jwt

    audience = getattr(settings, "SUPABASE_JWT_AUDIENCE", "authenticated") or None
    options = {"verify_aud": bool(audience)}
    try:
        header = jose_jwt.get_unverified_header(token)
        alg = header.get("alg", "")
        secret = getattr(settings, "SUPABASE_JWT_SECRET", "")
        if alg == "HS256":
            if not secret:
                raise _unauthorized("인증 토큰 서명을 검증할 수 없습니다.")
            return jose_jwt.decode(token, secret, algorithms=["HS256"], audience=audience, options=options)
        keys = _fetch_jwks()
        key = next((k for k in keys if k.get("kid") == header.get("kid")), None)
        if key is None:
            raise _unauthorized("인증 토큰의 서명 키를 찾을 수 없습니다.")
        return jose_jwt.decode(token, key, algorithms=[alg], audience=audience, options=options)
    except HTTPException:
        raise
    except JWTError as e:
        if "expired" in str(e).lower():
            raise _unauthorized("인증 토큰이 만료되었습니다. 다시 로그인해 주세요.")
        raise _unauthorized("유효하지 않은 인증 토큰입니다.")
    except Exception:
        raise _unauthorized("인증 토큰을 검증하지 못했습니다.")


def _decode_unverified(token: str) -> dict:
    """개발 환경 전용: 서명 검증 설정이 없을 때 payload만 해석한다 (만료 시간은 확인)."""
    parts = token.split(".")
    payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
    exp = payload.get("exp")
    if isinstance(exp, (int, float)) and exp < time.time():
        raise _unauthorized("인증 토큰이 만료되었습니다. 다시 로그인해 주세요.")
    return payload


def extract_sub_from_jwt(token: str) -> Optional[str]:
    """Authorization 토큰에서 사용자 식별자(sub)를 추출한다.
    - 운영 환경: 서명 검증을 통과한 JWT만 인정 (검증 설정이 없으면 거부)
    - 개발 환경: 서명 검증 설정이 있으면 검증, 없으면 payload 해석 + 만료 확인
    - demo-token-<uid> 는 개발 환경에서만 허용
    - JWT 형식이 아닌 임의 문자열은 사용자 ID로 인정하지 않는다
    """
    clean_token = (token or "").strip()
    if clean_token.lower().startswith("bearer "):
        clean_token = clean_token[7:].strip()
    if not clean_token:
        return None

    if clean_token.startswith("demo-token-"):
        if _is_production():
            raise _unauthorized("운영 환경에서는 데모 토큰을 사용할 수 없습니다.")
        return clean_token[len("demo-token-"):] or None

    if clean_token.count(".") != 2:
        return None

    if _verification_configured():
        payload = _verify_jwt(clean_token)
    elif _is_production():
        raise _unauthorized("서버에 토큰 서명 검증 설정(SUPABASE_URL 또는 SUPABASE_JWT_SECRET)이 없습니다.")
    else:
        try:
            payload = _decode_unverified(clean_token)
        except HTTPException:
            raise
        except Exception:
            return None

    sub = payload.get("sub") or payload.get("user_id")
    return str(sub) if sub else None


def get_current_user_id(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> Optional[str]:
    """요청 헤더(Authorization 또는 X-User-Id)로부터 현재 로그인된 사용자의 ID를 추출합니다.
    - 보안 강화: 프로덕션 환경에서는 위조 가능한 X-User-Id 헤더를 무시하고 오직 Authorization(JWT)만 신뢰합니다.
    - 개발/테스트 환경에서는 로컬 테스트 하위 호환성을 위해 X-User-Id를 보조적으로 허용합니다.
    """
    # 1. Authorization 헤더가 있으면 토큰에서 sub 추출
    if authorization:
        sub = extract_sub_from_jwt(authorization)
        if sub:
            return sub

    # 2. X-User-Id 헤더 (프로덕션 환경에서는 BOLA/IDOR 방지를 위해 차단)
    is_production = getattr(settings, "ENVIRONMENT", "").lower() == "production"
    if x_user_id and x_user_id.strip():
        if is_production:
            # 프로덕션에서는 X-User-Id를 통한 신원 조작 차단
            return None
        return x_user_id.strip()

    return None


def verify_session_owner_manual(
    session_id: str,
    current_user_id: Optional[str],
    db: Session,
) -> TaxSession:
    """세션 소유자 검증 핵심 로직:
    - 세션이 존재하지 않으면 404 Not Found
    - 요청자와 세션 소유자가 불일치하면 403 Forbidden
    """
    session_svc = TaxSessionService(db)
    session = session_svc.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"세션을 찾을 수 없습니다: {session_id}",
        )

    # 기본 데모 사용자 식별
    default_user = session_svc.get_or_create_default_user()
    is_default_session = (session.user_id == default_user.id)

    if current_user_id:
        requester_uuid = resolve_user_id(current_user_id)
        if session.user_id != requester_uuid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="접근 권한이 없습니다. 해당 세션의 소유자가 아닙니다.",
            )
    else:
        # 인증 헤더 없이 접근한 경우:
        # 데모 세션인 경우에만 허용하고, 특정 사용자 소유 세션인 경우 차단
        if not is_default_session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="접근 권한이 없습니다. 해당 세션의 소유자가 아닙니다.",
            )

    return session


def verify_session_owner(
    session_id: str,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> TaxSession:
    """FastAPI Depends용 세션 소유자 검증 가드"""
    return verify_session_owner_manual(session_id, current_user_id, db)
