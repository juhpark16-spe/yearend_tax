"""2-C 게스트 세션 분리 테스트
- 게스트마다 고유 토큰 → 서로의 세션 접근 차단
- 위조·만료 토큰 거부, 운영 환경에서도 게스트 토큰 허용
- 게스트 자료 삭제(DELETE /auth/guest), 만료 게스트 정리
"""
import time

from fastapi.testclient import TestClient

from backend.core.config import settings
from backend.security import guest as guest_mod


def _guest(client: TestClient) -> dict:
    res = client.post("/api/v1/auth/guest")
    assert res.status_code == 200
    body = res.json()
    assert body["guest_token"].startswith("guest.") and body["guest_id"].startswith("guest-")
    return {"Authorization": f"Bearer {body['guest_token']}"}


def test_two_guests_do_not_share_sessions(client: TestClient):
    g1, g2 = _guest(client), _guest(client)
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=g1).json()["session_id"]
    assert client.get(f"/api/v1/sessions/{sid}", headers=g1).status_code == 200
    other = client.get(f"/api/v1/sessions/{sid}", headers=g2)
    assert other.status_code == 403
    assert client.post("/api/v1/calculate", json={"session_id": sid}, headers=g2).status_code == 403
    assert client.get(f"/api/v1/audit/{sid}", headers=g2).status_code == 403
    assert client.get(f"/api/v1/sessions/{sid}").status_code == 401


def test_tampered_and_expired_guest_tokens_rejected(client: TestClient):
    token = _guest(client)["Authorization"].split(" ", 1)[1]
    prefix, gid, exp, sig = token.split(".")
    other_gid = ("0" if gid[0] != "0" else "1") + gid[1:]
    forged = f"{prefix}.{other_gid}.{exp}.{sig}"
    assert client.post("/api/v1/sessions", json={"tax_year": 2025},
                       headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    past = int(time.time()) - 10
    expired = f"guest.{gid}.{past}.{guest_mod._sign(gid, past)}"
    res = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers={"Authorization": f"Bearer {expired}"})
    assert res.status_code == 401 and "만료" in res.json()["detail"]


def test_guest_token_allowed_in_production(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    g = _guest(client)
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=g).json()["session_id"]
    assert client.get(f"/api/v1/sessions/{sid}", headers=g).status_code == 200
    # 운영 환경에서 데모 토큰·X-User-Id 로는 세션 생성 불가
    assert client.post("/api/v1/sessions", json={"tax_year": 2025},
                       headers={"X-User-Id": "someone"}).status_code == 401


def test_delete_guest_data_removes_sessions(client: TestClient):
    g = _guest(client)
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=g).json()["session_id"]
    res = client.delete("/api/v1/auth/guest", headers=g)
    assert res.status_code == 200 and res.json()["deleted_sessions"] == 1
    assert client.get(f"/api/v1/sessions/{sid}", headers=g).status_code == 404
    # 로그인 사용자(비게스트)는 이 경로로 자료를 지울 수 없음
    assert client.delete("/api/v1/auth/guest", headers={"X-User-Id": "user-1"}).status_code == 401


def test_expired_guest_data_purged(client: TestClient, monkeypatch):
    g = _guest(client)
    sid = client.post("/api/v1/sessions", json={"tax_year": 2025}, headers=g).json()["session_id"]
    # 유효 시간을 0으로 보고 정리 → 방금 만든 게스트도 만료 대상
    monkeypatch.setattr(guest_mod, "_ttl_seconds", lambda: -1)
    _guest(client)  # 새 게스트 발급 시 만료 게스트 정리
    monkeypatch.undo()
    assert client.get(f"/api/v1/sessions/{sid}", headers=g).status_code == 404
