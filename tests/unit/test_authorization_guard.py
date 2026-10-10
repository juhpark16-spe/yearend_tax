"""종단간 인가(Authorization) 가드 및 세션 소유권 대조 테스트 스위트
- user_id / Supabase Auth UID 대조
- 본인 세션 접근 (200 OK)
- 타인 세션 접근 차단 (403 Forbidden)
- 비로그인 사용자의 보호 세션 접근 차단 (403 Forbidden)
- 존재하지 않는 세션 접근 (404 Not Found)
"""
import base64
import json
import uuid
import pytest
from fastapi.testclient import TestClient

from backend.security.auth import extract_sub_from_jwt, resolve_user_id


def make_dummy_jwt(sub: str) -> str:
    """테스트용 서명 미포함 JWT 토큰 생성 (header.payload.signature)"""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"sub": sub, "email": f"{sub}@example.com"}).encode()).decode().rstrip("=")
    sig = "dummysig"
    return f"{header}.{payload}.{sig}"


def test_jwt_sub_extractor_and_uuid_resolver():
    """JWT sub 추출 및 결정론적 UUID 변환 유닛 테스트"""
    test_uid = str(uuid.uuid4())
    jwt_token = make_dummy_jwt(test_uid)

    extracted = extract_sub_from_jwt(f"Bearer {jwt_token}")
    assert extracted == test_uid

    # 데모 토큰 형식 테스트
    demo_extracted = extract_sub_from_jwt("Bearer demo-token-user-123")
    assert demo_extracted == "user-123"

    # UUID 변환 검증
    res_uuid = resolve_user_id(test_uid)
    assert res_uuid == uuid.UUID(test_uid)

    # 비-UUID 문자열의 UUID 변환 (결정론적)
    str_uuid = resolve_user_id("google-demo-999")
    assert isinstance(str_uuid, uuid.UUID)
    assert str_uuid == resolve_user_id("google-demo-999")


def test_session_owner_allow_own_session(client: TestClient):
    """본인 소유 세션 접근 시 200 OK 허용 검증"""
    user_a_id = str(uuid.uuid4())
    user_a_jwt = make_dummy_jwt(user_a_id)

    # User A의 세션 생성 (X-User-Id 헤더 전송)
    create_res = client.post(
        "/api/v1/sessions",
        json={"tax_year": 2025},
        headers={"X-User-Id": user_a_id}
    )
    assert create_res.status_code == 200
    session_id = create_res.json()["session_id"]
    assert create_res.json()["user_id"] == user_a_id

    # 1. User A가 X-User-Id 헤더로 세션 조회 -> 200 OK
    get_res = client.get(
        f"/api/v1/sessions/{session_id}",
        headers={"X-User-Id": user_a_id}
    )
    assert get_res.status_code == 200
    assert get_res.json()["session_id"] == session_id

    # 2. User A가 Authorization: Bearer <jwt> 헤더로 세션 조회 -> 200 OK
    get_res_jwt = client.get(
        f"/api/v1/sessions/{session_id}",
        headers={"Authorization": f"Bearer {user_a_jwt}"}
    )
    assert get_res_jwt.status_code == 200
    assert get_res_jwt.json()["session_id"] == session_id


def test_session_owner_forbidden_for_other_user(client: TestClient):
    """타인 소유 세션 접근 시 403 Forbidden 차단 검증"""
    user_a_id = str(uuid.uuid4())
    user_b_id = str(uuid.uuid4())
    user_b_jwt = make_dummy_jwt(user_b_id)

    # User A 세션 생성
    create_res = client.post(
        "/api/v1/sessions",
        json={"tax_year": 2025},
        headers={"X-User-Id": user_a_id}
    )
    assert create_res.status_code == 200
    session_id = create_res.json()["session_id"]

    # 1. User B가 X-User-Id 헤더로 User A 세션 조회 시도 -> 403 Forbidden
    forbidden_res = client.get(
        f"/api/v1/sessions/{session_id}",
        headers={"X-User-Id": user_b_id}
    )
    assert forbidden_res.status_code == 403
    assert "접근 권한이 없습니다" in forbidden_res.json()["detail"]

    # 2. User B가 JWT 토큰으로 User A 세션 계산 시도 -> 403 Forbidden
    calc_res = client.post(
        "/api/v1/calculate",
        json={"session_id": session_id},
        headers={"Authorization": f"Bearer {user_b_jwt}"}
    )
    assert calc_res.status_code == 403
    assert "접근 권한이 없습니다" in calc_res.json()["detail"]

    # 3. User B가 User A 세션 데이터 검증 시도 -> 403 Forbidden
    val_res = client.post(
        "/api/v1/validate",
        json={"session_id": session_id, "dependents": []},
        headers={"X-User-Id": user_b_id}
    )
    assert val_res.status_code == 403
    assert "접근 권한이 없습니다" in val_res.json()["detail"]

    # 4. User B가 User A 세션 감사 로그 조회 시도 -> 403 Forbidden
    audit_res = client.get(
        f"/api/v1/audit/{session_id}",
        headers={"X-User-Id": user_b_id}
    )
    assert audit_res.status_code == 403
    assert "접근 권한이 없습니다" in audit_res.json()["detail"]

    # 5. User B가 User A 결과 PDF 다운로드 시도 -> 403 Forbidden
    pdf_res = client.get(
        f"/api/v1/report/pdf/{session_id}",
        headers={"X-User-Id": user_b_id}
    )
    assert pdf_res.status_code == 403
    assert "접근 권한이 없습니다" in pdf_res.json()["detail"]


def test_session_owner_forbidden_for_anonymous_user(client: TestClient):
    """로그인 사용자 세션에 비인증(헤더 없음) 접근 시 403 Forbidden 차단 검증"""
    user_a_id = str(uuid.uuid4())

    create_res = client.post(
        "/api/v1/sessions",
        json={"tax_year": 2025},
        headers={"X-User-Id": user_a_id}
    )
    assert create_res.status_code == 200
    session_id = create_res.json()["session_id"]

    # 헤더 없이 조회 -> 403 Forbidden
    anon_res = client.get(f"/api/v1/sessions/{session_id}")
    assert anon_res.status_code == 403
    assert "접근 권한이 없습니다" in anon_res.json()["detail"]


def test_session_not_found(client: TestClient):
    """존재하지 않는 세션 접근 시 404 Not Found 검증"""
    random_session_id = str(uuid.uuid4())
    res = client.get(
        f"/api/v1/sessions/{random_session_id}",
        headers={"X-User-Id": str(uuid.uuid4())}
    )
    assert res.status_code == 404
    assert "세션을 찾을 수 없습니다" in res.json()["detail"]


def test_demo_user_compatibility(client: TestClient):
    """비로그인 데모 사용자의 세션 생성 및 조회 하위 호환성 검증"""
    # 비로그인(헤더 없음) 세션 생성
    create_res = client.post("/api/v1/sessions", json={"tax_year": 2025})
    assert create_res.status_code == 200
    session_id = create_res.json()["session_id"]

    # 비로그인 세션 조회 허용 (200 OK)
    get_res = client.get(f"/api/v1/sessions/{session_id}")
    assert get_res.status_code == 200
    assert get_res.json()["session_id"] == session_id


def test_security_headers_middleware(client: TestClient):
    """보안 응답 헤더 미들웨어(X-Content-Type-Options, X-Frame-Options, Referrer-Policy) 검증"""
    res = client.get("/health")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

