"""서버 자료 보존 기간 관리 (서버에 자료가 쌓이는 문제 방지)

- 마지막 사용(세션 updated_at) 후 DATA_RETENTION_DAYS(기본 30일)가 지난 세션은 문서·입력·결과·감사로그와 함께 삭제
- 만료된 게스트 계정과 그 자료 삭제 (GUEST_SESSION_TTL_HOURS)
- 2-C 이전 공용 기본 사용자(worker@selftax.com) 세션은 누구도 열 수 없으므로 삭제
- 세션이 하나도 남지 않은 자동 생성 계정(@auth.selftax, @guest.selftax) 정리
- 요청 처리 중에는 1시간에 한 번만 실행 (purge_if_due)
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.models.session import TaxSession
from backend.models.user import User

logger = logging.getLogger(__name__)

LEGACY_SHARED_DEMO_EMAIL = "worker@selftax.com"
AUTO_ACCOUNT_DOMAINS = ("@auth.selftax", "@guest.selftax")
_PURGE_INTERVAL_SECONDS = 3600
_last_purge = 0.0
_lock = threading.Lock()


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def purge_stale_data(db: Session, now: Optional[datetime] = None) -> Dict[str, int]:
    """보존 기간이 지난 서버 자료를 삭제하고 삭제 건수를 돌려준다."""
    from backend.security.guest import purge_expired_guest_data

    now = now or datetime.now(timezone.utc)
    stats = {"expired_guests": 0, "stale_sessions": 0, "legacy_sessions": 0, "empty_accounts": 0}

    try:
        stats["expired_guests"] = purge_expired_guest_data(db)
    except Exception:
        db.rollback()
        logger.exception("만료 게스트 정리 실패")

    cutoff = now - timedelta(days=max(1, int(getattr(settings, "DATA_RETENTION_DAYS", 30) or 30)))
    for sess in db.query(TaxSession).all():
        last_used = _aware(sess.updated_at) or _aware(sess.created_at)
        if last_used is not None and last_used < cutoff:
            db.delete(sess)
            stats["stale_sessions"] += 1

    legacy = db.query(User).filter(User.email == LEGACY_SHARED_DEMO_EMAIL).first()
    if legacy is not None:
        for sess in list(legacy.sessions or []):
            db.delete(sess)
            stats["legacy_sessions"] += 1
        db.delete(legacy)
    db.flush()

    for user in db.query(User).all():
        if str(user.email or "").endswith(AUTO_ACCOUNT_DOMAINS) and not user.sessions:
            db.delete(user)
            stats["empty_accounts"] += 1
    db.commit()
    if any(stats.values()):
        logger.info("서버 자료 보존 기간 정리: %s", stats)
    return stats


def purge_if_due(db: Session) -> None:
    """마지막 정리 후 1시간이 지났을 때만 정리 (요청 경로에서 호출)"""
    global _last_purge
    now = time.monotonic()
    with _lock:
        if _last_purge and now - _last_purge < _PURGE_INTERVAL_SECONDS:
            return
        _last_purge = now
    try:
        purge_stale_data(db)
    except Exception:
        db.rollback()
        logger.exception("서버 자료 보존 기간 정리 실패")


def reset_purge_timer() -> None:
    global _last_purge
    with _lock:
        _last_purge = 0.0


def delete_user_data(db: Session, user_key: str) -> int:
    """요청자 본인의 서버 자료(모든 세션)를 즉시 삭제하고 삭제한 세션 수를 돌려준다."""
    from backend.security.auth import resolve_user_id

    user = db.query(User).filter(User.id == resolve_user_id(user_key)).first()
    if not user:
        return 0
    sessions = list(user.sessions or [])
    for sess in sessions:
        db.delete(sess)
    if str(user.email or "").endswith(AUTO_ACCOUNT_DOMAINS):
        db.delete(user)
    db.commit()
    return len(sessions)
