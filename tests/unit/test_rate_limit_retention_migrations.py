"""9. 요청 횟수 제한 / 10. 서버 자료 보존 기간 / 11. Alembic 단일 DB 구조 관리"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from backend.core.config import settings
from backend.core.database import Base, SessionLocal
from backend.core import rate_limit


def _guest(client):
    return {"Authorization": "Bearer " + client.post("/api/v1/auth/guest").json()["guest_token"]}


# ---------------------------------------------------------------- 9. 요청 횟수 제한
def test_guest_issue_rate_limited_per_ip(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_GUEST", "3/600")
    codes = [client.post("/api/v1/auth/guest").status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    res = client.post("/api/v1/auth/guest")
    assert res.status_code == 429 and int(res.headers["Retry-After"]) > 0
    assert "요청이 너무 많습니다" in res.json()["detail"]


def test_ai_limit_per_user_and_per_ip(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_AI", "2/600")
    monkeypatch.setattr(settings, "RATE_LIMIT_AI_PER_IP", "3/600")
    g1, g2 = _guest(client), _guest(client)
    body = {"query": "월세 세액공제 요건"}
    r = [client.post("/api/v1/rag/search", json=body, headers=g1).status_code for _ in range(3)]
    assert r[:2] != [429, 429] and r[2] == 429                    # 사용자당 2회
    assert client.post("/api/v1/rag/search", json=body, headers=g2).status_code != 429  # IP 3회째
    assert client.post("/api/v1/rag/search", json=body, headers=g2).status_code == 429  # IP 한도 초과 (토큰 재발급 우회 차단)


def test_rate_limit_can_be_disabled(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_GUEST", "1/600")
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)
    assert all(client.post("/api/v1/auth/guest").status_code == 200 for _ in range(3))


def test_parse_rule():
    assert rate_limit.parse_rule("10/600") == (10, 600)


# ---------------------------------------------------------------- 10. 서버 자료 누적 방지
def test_upload_reuses_latest_session_and_replaces_same_file(client: TestClient):
    g = _guest(client)
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    ids = set()
    for _ in range(3):
        res = client.post("/api/v1/upload", files={"files": ("a.pdf", pdf, "application/pdf")}, headers=g)
        assert res.status_code == 200
        ids.add(res.json()[0]["session_id"])
    assert len(ids) == 1                                   # 업로드마다 새 세션을 만들지 않음
    from backend.models.document import Document
    import uuid
    db = SessionLocal()
    try:
        docs = db.query(Document).filter(Document.session_id == uuid.UUID(ids.pop())).all()
        assert len(docs) == 1                              # 같은 파일 재업로드는 교체
    finally:
        db.close()


def test_user_can_delete_own_server_data(client: TestClient):
    g, other = _guest(client), _guest(client)
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=g).json()["session_id"]
    assert client.delete(f"/api/v1/sessions/{sid}", headers=other).status_code == 403
    assert client.delete(f"/api/v1/sessions/{sid}", headers=g).json()["deleted_sessions"] == 1
    client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=g)
    client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=g)
    assert client.delete("/api/v1/me/data", headers=g).json()["deleted_sessions"] == 2
    assert client.delete("/api/v1/me/data").status_code == 401


def test_retention_purges_stale_and_legacy_sessions():
    from backend.models.session import TaxSession, TaxSessionStatus
    from backend.models.user import User
    from backend.services.data_retention import LEGACY_SHARED_DEMO_EMAIL, purge_stale_data

    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    now = datetime.now(timezone.utc)
    u = User(email="u@example.com", name="u")
    legacy = User(email=LEGACY_SHARED_DEMO_EMAIL, name="근로자")
    db.add_all([u, legacy]); db.commit()
    old = TaxSession(user_id=u.id, tax_year=2025, status=TaxSessionStatus.PARSED,
                     created_at=now - timedelta(days=60), updated_at=now - timedelta(days=45))
    fresh = TaxSession(user_id=u.id, tax_year=2025, status=TaxSessionStatus.PARSED, created_at=now, updated_at=now)
    shared = TaxSession(user_id=legacy.id, tax_year=2025, status=TaxSessionStatus.PARSED, created_at=now, updated_at=now)
    db.add_all([old, fresh, shared]); db.commit()
    stats = purge_stale_data(db, now=now)
    assert stats["stale_sessions"] == 1 and stats["legacy_sessions"] == 1
    remaining = db.query(TaxSession).all()
    assert [s.id for s in remaining] == [fresh.id]
    assert db.query(User).filter(User.email == LEGACY_SHARED_DEMO_EMAIL).count() == 0


# ---------------------------------------------------------------- 11. Alembic 단일 DB 구조 관리
def test_migrations_create_schema_matching_models(tmp_path):
    from backend.core.migrations import ensure_database_schema, schema_differences

    url = f"sqlite:///{tmp_path / 'fresh.db'}"
    eng = create_engine(url)
    head = ensure_database_schema(eng, url)
    names = set(inspect(eng).get_table_names())
    assert {"alembic_version", "tax_sessions", "audit_logs"} <= names
    assert schema_differences(eng) == []                  # 마이그레이션 결과 = 현재 모델
    assert ensure_database_schema(eng, url) == head        # 두 번 실행해도 안전


def test_legacy_create_all_db_is_stamped(tmp_path):
    from alembic.migration import MigrationContext
    from backend.core.migrations import ensure_database_schema

    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    eng = create_engine(url)
    import backend.models  # noqa: F401
    Base.metadata.create_all(eng)                          # 예전 방식으로 만든 DB
    head = ensure_database_schema(eng, url)
    with eng.connect() as conn:
        assert MigrationContext.configure(conn).get_current_revision() == head


def test_production_refuses_unmigrated_db(tmp_path, monkeypatch):
    from backend.core.migrations import ensure_database_schema

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "DB_AUTO_MIGRATE", None)
    url = f"sqlite:///{tmp_path / 'empty.db'}"
    with pytest.raises(RuntimeError, match="alembic upgrade head"):
        ensure_database_schema(create_engine(url), url)
