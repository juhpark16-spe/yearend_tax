"""JWT 서명 검증·데모 토큰·임의 문자열 차단 테스트 (2-A)"""
import time
import uuid

import pytest
from fastapi import HTTPException
from jose import jwt

from backend.core.config import settings
from backend.security import auth
from backend.security.auth import extract_sub_from_jwt

SECRET = "test-jwt-secret-for-unit-tests-only"


def _token(sub: str, secret: str = SECRET, exp_delta: int = 3600, aud: str = "authenticated") -> str:
    return jwt.encode({"sub": sub, "aud": aud, "exp": int(time.time()) + exp_delta}, secret, algorithm="HS256")


@pytest.fixture
def verify_mode(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", SECRET, raising=False)
    monkeypatch.setattr(settings, "SUPABASE_URL", "", raising=False)
    monkeypatch.setattr(settings, "SUPABASE_JWT_AUDIENCE", "authenticated", raising=False)
    yield


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    yield


def test_valid_signed_token_is_accepted(verify_mode):
    uid = str(uuid.uuid4())
    assert extract_sub_from_jwt(f"Bearer {_token(uid)}") == uid


def test_forged_signature_is_rejected(verify_mode):
    forged = _token(str(uuid.uuid4()), secret="attacker-secret")
    with pytest.raises(HTTPException) as e:
        extract_sub_from_jwt(f"Bearer {forged}")
    assert e.value.status_code == 401


def test_expired_token_is_rejected(verify_mode):
    with pytest.raises(HTTPException) as e:
        extract_sub_from_jwt(f"Bearer {_token(str(uuid.uuid4()), exp_delta=-10)}")
    assert e.value.status_code == 401 and "만료" in e.value.detail


def test_wrong_audience_is_rejected(verify_mode):
    with pytest.raises(HTTPException):
        extract_sub_from_jwt(f"Bearer {_token(str(uuid.uuid4()), aud='other')}")


def test_raw_string_is_not_a_user_id():
    victim = str(uuid.uuid4())
    assert extract_sub_from_jwt(victim) is None
    assert extract_sub_from_jwt(f"Bearer {victim}") is None


def test_demo_token_only_in_development(production):
    with pytest.raises(HTTPException):
        extract_sub_from_jwt("Bearer demo-token-user-123")


def test_production_without_verification_config_rejects_jwt(production, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "", raising=False)
    monkeypatch.setattr(settings, "SUPABASE_URL", "", raising=False)
    unsigned = _token(str(uuid.uuid4()), secret="anything")
    with pytest.raises(HTTPException):
        extract_sub_from_jwt(f"Bearer {unsigned}")


def test_forged_token_cannot_open_other_users_session(client, verify_mode):
    owner = str(uuid.uuid4())
    res = client.post("/api/v1/sessions", json={"tax_year": 2025},
                      headers={"Authorization": f"Bearer {_token(owner)}"})
    assert res.status_code == 200
    sid = res.json()["session_id"]
    forged = _token(owner, secret="attacker-secret")
    r2 = client.get(f"/api/v1/sessions/{sid}", headers={"Authorization": f"Bearer {forged}"})
    assert r2.status_code == 401
    r3 = client.get(f"/api/v1/sessions/{sid}", headers={"Authorization": f"Bearer {_token(owner)}"})
    assert r3.status_code == 200


def test_ocr_document_lookup_requires_owner(client):
    owner = str(uuid.uuid4())
    other = str(uuid.uuid4())
    files = {"files": ("sample.pdf", b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", "application/pdf")}
    up = client.post("/api/v1/upload", files=files, headers={"X-User-Id": owner})
    if up.status_code != 200:
        pytest.skip("업로드 파서가 최소 PDF를 처리하지 못하는 환경")
    doc_id = up.json()[0]["document_id"]
    r = client.post("/api/v1/ocr", json={"document_id": doc_id}, headers={"X-User-Id": other})
    assert r.status_code == 403
    r_ok = client.post("/api/v1/ocr", json={"document_id": doc_id}, headers={"X-User-Id": owner})
    assert r_ok.status_code == 200
