"""DB 구조 관리 (Alembic 단일 기준)

이전에는 서버 시작 시 `Base.metadata.create_all()`로 표를 만들고 Alembic 마이그레이션도 따로 있어,
모델을 바꾸면 기존 DB에 새 컬럼이 생기지 않는 등 두 방식이 어긋날 위험이 있었다.
이제 DB 구조는 Alembic 마이그레이션(alembic/versions)으로만 바꾼다.

서버 시작 시 `ensure_database_schema()`:
1. Alembic 기록이 없는 기존 DB(예전 create_all로 만든 DB)는 현재 모델과 구조가 같은지 비교해
   같으면 최신 버전으로 표시(stamp)하고, 다르면 이유를 알려 주고 중단한다.
2. 최신 버전이 아니면
   - 개발 환경(또는 DB_AUTO_MIGRATE=True): 자동으로 `alembic upgrade head`
   - 운영 환경(기본): 시작을 멈추고 배포 단계에서 `alembic upgrade head`를 실행하도록 안내

모델을 바꿀 때: `alembic revision --autogenerate -m "설명"` → 생성 파일 검토 → `alembic upgrade head`
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from backend.core.config import settings

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _alembic_config(database_url: str):
    from alembic.config import Config

    cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    cfg.attributes["configure_logger"] = False
    cfg.attributes["database_url"] = database_url
    return cfg


def _auto_migrate_enabled() -> bool:
    flag: Optional[bool] = getattr(settings, "DB_AUTO_MIGRATE", None)
    if flag is not None:
        return bool(flag)
    return str(getattr(settings, "ENVIRONMENT", "")).lower() != "production"


def schema_differences(engine: Engine):
    """현재 DB와 ORM 모델의 구조 차이 목록 (없으면 빈 목록)"""
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    import backend.models  # noqa: F401 — 모든 모델을 metadata에 등록
    from backend.core.database import Base

    with engine.connect() as conn:
        return compare_metadata(MigrationContext.configure(conn), Base.metadata)


def ensure_database_schema(engine: Optional[Engine] = None, database_url: Optional[str] = None) -> str:
    """DB를 최신 마이그레이션 버전으로 맞추고 현재 버전을 돌려준다."""
    from alembic import command
    from alembic.migration import MigrationContext
    from alembic.script import ScriptDirectory

    if engine is None:
        from backend.core.database import engine as default_engine

        engine = default_engine
    url = database_url or str(engine.url.render_as_string(hide_password=False))
    cfg = _alembic_config(url)
    head = ScriptDirectory.from_config(cfg).get_current_head()

    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_revision()
        tables = set(inspect(conn).get_table_names())
    app_tables = tables - {"alembic_version"}

    if current is None and app_tables:
        diffs = schema_differences(engine)
        if diffs:
            raise RuntimeError(
                "Alembic 기록이 없는 기존 DB의 구조가 현재 모델과 다릅니다. DB를 백업한 뒤 새 DB로 시작하거나 "
                f"구조를 맞춘 다음 'alembic stamp head'를 실행하세요. (차이 {len(diffs)}건)"
            )
        command.stamp(cfg, "head")
        logger.info("기존 DB를 Alembic 최신 버전(%s)으로 표시했습니다.", head)
        return head

    if current != head:
        if not _auto_migrate_enabled():
            raise RuntimeError(
                f"DB 마이그레이션이 필요합니다 (현재 {current or '없음'} → 최신 {head}). "
                "배포 단계에서 'alembic upgrade head'를 먼저 실행하세요."
            )
        command.upgrade(cfg, "head")
        logger.info("DB를 Alembic 최신 버전(%s)으로 올렸습니다.", head)
    return head
