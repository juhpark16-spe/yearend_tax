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


def extract_sub_from_jwt(token: str) -> Optional[str]:
    """JWT 토큰의 페이로드에서 sub(사용자 식별자) 클레임을 추출하고 유효성(만료시간 등)을 검증합니다.
    - 토큰 만료시간(exp)이 지난 경우 401 Unauthorized 발생
    - payload 디코딩 및 sub 클레임 정합성 확인
    """
    try:
        clean_token = token.strip()
        if clean_token.lower().startswith("bearer "):
            clean_token = clean_token[7:].strip()

        # 데모 토큰 형식 대응 (예: demo-token-<uid>)
        if clean_token.startswith("demo-token-"):
            return clean_token[len("demo-token-"):]

        parts = clean_token.split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1]
            rem = len(payload_b64) % 4
            if rem > 0:
                payload_b64 += "=" * (4 - rem)
            payload_bytes = base64.urlsafe_b64decode(payload_b64)
            payload_json = json.loads(payload_bytes.decode("utf-8"))

            # 만료 시간(exp) 검증
            exp = payload_json.get("exp")
            if exp is not None and isinstance(exp, (int, float)):
                if exp < time.time():
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="인증 토큰이 만료되었습니다. 다시 로그인해 주세요.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )

            user_sub = payload_json.get("sub") or payload_json.get("user_id")
            if user_sub:
                return str(user_sub)
        elif clean_token:
            return clean_token
    except HTTPException:
        raise
    except Exception:
        pass
    return None


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
