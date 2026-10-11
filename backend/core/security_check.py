"""서버 시작 시 비밀 키·보안 설정 점검 (2-D 비밀 키 정리)

- 운영 환경(ENVIRONMENT=production)에서 치명적인 설정 누락이 있으면 서버를 띄우지 않는다.
  · SECRET_KEY 가 기본값이거나 32자 미만
  · Supabase 로그인 토큰 서명 검증 설정(SUPABASE_URL 또는 SUPABASE_JWT_SECRET) 없음
- 그 밖의 권장 사항은 경고 로그로만 남긴다. (값 자체는 절대 로그에 남기지 않는다)
"""
from __future__ import annotations

import logging
from typing import List, Tuple

from backend.core.config import settings

logger = logging.getLogger(__name__)

PLACEHOLDER_SECRET = "change-this-secret-key-in-production"


def collect_security_issues(cfg=settings) -> Tuple[List[str], List[str]]:
    """(치명적 오류 목록, 경고 목록) — 운영 환경 기준으로 판정"""
    errors: List[str] = []
    warnings: List[str] = []
    is_production = str(getattr(cfg, "ENVIRONMENT", "")).lower() == "production"

    secret = str(getattr(cfg, "SECRET_KEY", "") or "")
    if secret == PLACEHOLDER_SECRET or len(secret) < 32:
        (errors if is_production else warnings).append("SECRET_KEY가 기본값이거나 32자 미만입니다.")

    if not (getattr(cfg, "SUPABASE_URL", "") or getattr(cfg, "SUPABASE_JWT_SECRET", "")):
        (errors if is_production else warnings).append(
            "로그인 토큰 서명 검증 설정(SUPABASE_URL 또는 SUPABASE_JWT_SECRET)이 없습니다.")

    if not getattr(cfg, "GUEST_TOKEN_SECRET", ""):
        warnings.append("GUEST_TOKEN_SECRET이 없어 SECRET_KEY로 게스트 토큰을 서명합니다.")

    if is_production:
        origins = [str(o) for o in (getattr(cfg, "BACKEND_CORS_ORIGINS", []) or [])]
        if any("localhost" in o or "127.0.0.1" in o for o in origins):
            warnings.append("운영 환경 CORS 허용 목록에 localhost 주소가 있습니다.")
        if str(getattr(cfg, "DATABASE_URL", "")).startswith("sqlite"):
            warnings.append("운영 환경에서 SQLite를 사용 중입니다.")
    return errors, warnings


def enforce_security_settings(cfg=settings) -> None:
    errors, warnings = collect_security_issues(cfg)
    for w in warnings:
        logger.warning("[보안 설정] %s", w)
    if errors:
        raise RuntimeError("운영 환경 보안 설정 오류: " + " / ".join(errors))
