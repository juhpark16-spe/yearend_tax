"""SRS_v3.0.md 기반 API v1 엔드포인트 및 세법 엔진 통합 테스트 스위트
"""
import io
import uuid
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(client: TestClient):
    """게스트 토큰을 받은 클라이언트 (익명 요청은 세션 API에서 401)"""
    token = client.post("/api/v1/auth/guest").json()["guest_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


def test_session_lifecycle(client: TestClient):
    """세션 생성 및 상태 조회 라이프사이클 테스트 (F-AUTH / F-SESSION)"""
    # 1. 신규 세션 생성
    create_payload = {
        "tax_year": 2025,
        "is_sme_youth": True,
        "is_newly_married": True
    }
    response = client.post("/api/v1/sessions", json=create_payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert "session_id" in data
    assert data["status"] == "UPLOADED"
    session_id = data["session_id"]

    # 2. 세션 상세 조회
    get_res = client.get(f"/api/v1/sessions/{session_id}")
    assert get_res.status_code == 200
    session_data = get_res.json()
    assert session_data["session_id"] == session_id
    assert session_data["tax_year"] == 2025
    assert session_data["is_sme_youth"] is True


def test_document_upload_and_ocr(client: TestClient):
    """다중 문서 업로드, PII 마스킹, OCR 분류 테스트 (F-DOC-01, F-DOC-02, F-DOC-03)"""
    # 1. 세션 생성
    sess_res = client.post("/api/v1/sessions", json={"tax_year": 2025})
    session_id = sess_res.json()["session_id"]

    # 2. 가상 PDF 바이너리 업로드 (홈택스 소득·세액공제증명서 키워드 포함)
    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Title (hometax_sample) >>\nendobj\n"
    files = [
        ("files", ("2025_hometax_sample.pdf", io.BytesIO(pdf_content), "application/pdf")),
    ]
    data = {"session_id": session_id}

    upload_res = client.post("/api/v1/upload", data=data, files=files)
    assert upload_res.status_code == 200, upload_res.text
    docs = upload_res.json()
    assert len(docs) == 1
    doc = docs[0]
    assert doc["file_name"] == "2025_hometax_sample.pdf"
    assert doc["doc_type"] in ["HOMETAX", "WITHHOLDING", "RESIDENT", "FAMILY"]

    # 3. OCR 엔드포인트 직접 호출 검증
    ocr_payload = {
        "raw_text": "소득·세액공제증명서 국세청장 직인 주민등록번호 900101-1234567 신용카드 15,000,000원",
        "document_id": doc["document_id"]
    }
    ocr_res = client.post("/api/v1/ocr", json=ocr_payload)
    assert ocr_res.status_code == 200
    ocr_data = ocr_res.json()
    assert ocr_data["doc_type"] == "HOMETAX"
    assert ocr_data["confidence_score"] >= 0.5
    # 주민등록번호 마스킹 확인
    parsed_json = ocr_data["parsed_json"]
    assert "900101-1234567" not in str(parsed_json)


def test_validation_engine(client: TestClient):
    """부양가족 요건 및 소득 검증 테스트 (F-FAMILY, F-VALIDATE)"""
    sess_res = client.post("/api/v1/sessions", json={"tax_year": 2025})
    session_id = sess_res.json()["session_id"]

    # 본인 + 만 75세 모친(소득 0) + 만 10세 자녀 + 소득 초과 배우자(연 소득 5000만)
    payload = {
        "session_id": session_id,
        "dependents": [
            {
                "name": "홍길동",
                "relation": "SELF",
                "birth_date": "1990-05-15",
                "annual_income": 60000000
            },
            {
                "name": "김모친",
                "relation": "PARENT",
                "birth_date": "1950-01-01",  # 만 75세 -> 기본공제 + 경로우대
                "annual_income": 0
            },
            {
                "name": "홍자녀",
                "relation": "CHILD",
                "birth_date": "2015-08-20",  # 만 10세 -> 기본공제 대상
                "annual_income": 0
            },
            {
                "name": "이배우자",
                "relation": "SPOUSE",
                "birth_date": "1992-03-10",
                "annual_income": 30000000  # 소득 100만 초과 -> 부적격
            }
        ]
    }

    val_res = client.post("/api/v1/validate", json=payload)
    assert val_res.status_code == 200, val_res.text
    val_data = val_res.json()
    # 배우자 소득 초과가 errors 목록에 감지되어야 함
    all_messages = val_data.get("errors", []) + val_data.get("warnings", [])
    assert any("이배우자" in msg for msg in all_messages)
    assert any("100만 원을 초과" in msg for msg in all_messages)


def test_tax_calculation_and_audit(client: TestClient):
    """2025 개정 세법 계산 및 감사 로그(AuditLog) 검증 (F-ENGINE, F-REPORT)"""
    # 1. 세션 생성
    sess_res = client.post("/api/v1/sessions", json={
        "tax_year": 2025,
        "is_sme_youth": False,
        "is_newly_married": True
    })
    session_id = sess_res.json()["session_id"]

    # 2. 세액 계산 요청 (연봉 55,000,000원, 신혼부부 혼인세액공제 적용)
    calc_payload = {
        "session_id": session_id,
        "override_salary": 55000000
    }
    calc_res = client.post("/api/v1/calculate", json=calc_payload)
    assert calc_res.status_code == 200, calc_res.text
    calc_data = calc_res.json()

    assert calc_data["total_salary"] == 55000000
    assert calc_data["taxable_income"] > 0
    assert calc_data["calculated_tax"] > 0
    assert calc_data["final_tax"] >= 0

    # 3. 정산 결과 상세 조회 (GET /result/{id})
    result_res = client.get(f"/api/v1/result/{session_id}")
    assert result_res.status_code == 200
    result_data = result_res.json()
    assert result_data["total_gross_salary"] == 55000000
    assert len(result_data["audit_logs"]) >= 5

    # 4. 감사 로그 7단계 조회 (GET /audit/{id})
    audit_res = client.get(f"/api/v1/audit/{session_id}")
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert audit_data["total_steps"] >= 5
    step_names = [item["step_name"] for item in audit_data["logs"]]
    assert any("근로소득공제" in name for name in step_names)
    assert any("산출세액" in name for name in step_names)


def test_zero_state_handling(client: TestClient):
    """자료 미입력 시 0원 안전 반환 테스트 (Zero-State Handling)"""
    sess_res = client.post("/api/v1/sessions", json={"tax_year": 2025})
    session_id = sess_res.json()["session_id"]

    # 연봉 미입력 및 서류 미업로드 상태에서 계산
    calc_res = client.post("/api/v1/calculate", json={"session_id": session_id})
    assert calc_res.status_code == 200
    calc_data = calc_res.json()
    assert calc_data["total_salary"] == 0
    assert calc_data["taxable_income"] == 0
    assert calc_data["calculated_tax"] == 0
    assert calc_data["final_tax"] == 0
    assert calc_data["refund_amount"] == 0


def test_rag_and_checklist_and_pdf(client: TestClient):
    """RAG 지식 검색, 체크리스트, PDF 리포트 스트림 엔드포인트 검증 (F-RAG, F-DOC)"""
    # 1. RAG 지식 검색
    rag_payload = {
        "query": "월세 세액공제 요건과 한도가 어떻게 되나요?",
        "section": "월세"
    }
    rag_res = client.post("/api/v1/rag/search", json=rag_payload)
    assert rag_res.status_code == 200
    rag_data = rag_res.json()
    assert "answer" in rag_data
    assert "source_page" in rag_data
    assert "legal_basis" in rag_data

    # 1-2. AI Explanation DTO 엔드포인트 검증 (POST /rag/explain)
    explain_payload = {
        "query": "월세 세액공제 요건과 한도가 어떻게 되나요?",
        "section": "월세액"
    }
    explain_res = client.post("/api/v1/rag/explain", json=explain_payload)
    assert explain_res.status_code == 200
    explain_data = explain_res.json()
    assert "title" in explain_data
    assert "summary" in explain_data
    assert "reason" in explain_data
    assert "page" in explain_data
    assert isinstance(explain_data["page"], int)
    assert "references" in explain_data
    assert isinstance(explain_data["references"], list)

    # 2. 체크리스트 질문 조회
    chk_res = client.post("/api/v1/checklist")
    assert chk_res.status_code == 200
    chk_data = chk_res.json()
    assert "questions" in chk_data
    assert len(chk_data["questions"]) >= 3

    # 3. PDF 리포트 다운로드 스트림
    sess_res = client.post("/api/v1/sessions", json={"tax_year": 2025})
    session_id = sess_res.json()["session_id"]
    client.post("/api/v1/calculate", json={"session_id": session_id, "override_salary": 45000000})

    pdf_res = client.get(f"/api/v1/report/pdf/{session_id}")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert len(pdf_res.content) > 0


def test_dual_routing_compatibility(client: TestClient):
    """/upload 와 /tax/upload, /calculate 와 /tax/calculate 이중 라우팅 호환성 검증"""
    sess_res = client.post("/api/v1/tax/sessions", json={"tax_year": 2025})
    assert sess_res.status_code == 200
    session_id = sess_res.json()["session_id"]

    # /tax/calculate 접두사 호출
    calc_res1 = client.post("/api/v1/tax/calculate", json={"session_id": session_id, "override_salary": 50000000})
    assert calc_res1.status_code == 200

    # /calculate 직접 호출
    calc_res2 = client.post("/api/v1/calculate", json={"session_id": session_id, "override_salary": 50000000})
    assert calc_res2.status_code == 200
    assert calc_res1.json()["calculated_tax"] == calc_res2.json()["calculated_tax"]
