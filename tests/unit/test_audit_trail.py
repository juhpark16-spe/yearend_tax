"""7단계 세액 계산 증빙(Audit Trail) 종합 검증 테스트 스위트
- PRD_v3.0.md, SRS_v3.0.md, API_v1.0.md 준수 검증
- 10대 요구사항 단위/통합 테스트:
  1. 정상 계산 시 7단계 AuditLog 생성
  2. sequence 순서 정상 여부
  3. TaxResult와 AuditLog FK 연결
  4. 입력 데이터가 없는 항목의 0원 처리
  5. 여러 공제/감면 항목 Audit 기록
  6. 개인정보가 AuditLog에 원문으로 저장되지 않는지
  7. TaxResult 삭제 시 AuditLog cascade 삭제
  8. 재계산 시 AuditLog 중복 여부
  9. Audit 조회 API 정상 응답
  10. 기존 세금 계산 결과가 Audit 구현 전과 동일한지
"""
import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from backend.main import app
from backend.core.database import Base
from backend.models.user import User
from backend.models.session import TaxSession, TaxSessionStatus
from backend.models.deduction import WorkplaceIncome, WorkplaceType, ExpenseDeduction
from backend.models.family_member import Dependent, RelationType
from backend.models.tax_result import TaxResult
from backend.models.audit_log import AuditLog
from backend.services.tax_calculation_service import TaxCalculationService
from backend.services.audit_service import AuditService


@pytest.fixture
def db_session():
    """In-memory SQLite DB Session 픽스처"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def test_user_session(db_session):
    """표준 테스트 사용자 및 세션 생성"""
    user = User(email="audit_tester@example.com", name="홍길동")
    db_session.add(user)
    db_session.commit()

    tax_session = TaxSession(
        user_id=user.id,
        tax_year=2025,
        status=TaxSessionStatus.PARSED,
        is_sme_youth=True,
        is_newly_married=True,
    )
    db_session.add(tax_session)
    db_session.commit()
    return user, tax_session


# -----------------------------------------------------------------------------
# 1. 정상 계산 시 7단계 AuditLog 생성
# -----------------------------------------------------------------------------
def test_1_audit_trail_seven_steps_generated(db_session, test_user_session):
    user, session = test_user_session
    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=60_000_000,
    )

    steps_present = {log.step for log in audit_logs}
    for expected_step in range(1, 8):
        assert expected_step in steps_present, f"Step {expected_step}이 AuditLog에 누락되었습니다."


# -----------------------------------------------------------------------------
# 2. sequence 순서 정상 여부 (1부터 단조 증가 연속 정수)
# -----------------------------------------------------------------------------
def test_2_audit_sequence_order(db_session, test_user_session):
    user, session = test_user_session
    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=50_000_000,
    )

    sequences = [log.sequence_order for log in audit_logs]
    assert sequences == list(range(1, len(audit_logs) + 1)), "sequence_order가 1부터 순차 증가해야 합니다."
    assert all(log.sequence == log.sequence_order for log in audit_logs)


# -----------------------------------------------------------------------------
# 3. TaxResult와 AuditLog FK 연결
# -----------------------------------------------------------------------------
def test_3_tax_result_and_audit_fk_relationship(db_session, test_user_session):
    user, session = test_user_session
    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=45_000_000,
    )

    for log in audit_logs:
        assert log.tax_result_id == tax_result.id
        assert log.tax_result is not None
        assert log.tax_result.id == tax_result.id


# -----------------------------------------------------------------------------
# 4. 입력 데이터가 없는 항목의 0원 처리
# -----------------------------------------------------------------------------
def test_4_zero_state_audit_explanation(db_session, test_user_session):
    user, session = test_user_session
    session.is_sme_youth = False
    session.is_newly_married = False
    db_session.commit()

    service = TaxCalculationService(db=db_session)
    # 총급여 0원인 상태
    tax_result, audit_logs = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=0,
    )

    assert tax_result.total_gross_salary == 0
    assert tax_result.calculated_tax == 0
    assert len(audit_logs) >= 7

    # 0원 항목 설명 및 산출값 검증
    for log in audit_logs:
        if log.calculated_amount == 0:
            assert log.explanation is not None and len(log.explanation) > 0
            # '0원' 또는 '없' 또는 '미' 등의 사유 표현 포함
            assert any(word in log.explanation for word in ["0원", "없", "미", "해당 없음", "대상"])


# -----------------------------------------------------------------------------
# 5. 여러 공제/감면 항목 Audit 개별 기록 (Step 5 상세 분리)
# -----------------------------------------------------------------------------
def test_5_individual_tax_credit_breakdown(db_session, test_user_session):
    user, session = test_user_session
    # 자녀 및 지출내역 추가
    child = Dependent(
        session_id=session.id,
        name="홍아이",
        relation=RelationType.CHILD,
        annual_income_amount=0,
        is_basic_deduction=True,
    )
    db_session.add(child)

    exp = ExpenseDeduction(
        session_id=session.id,
        personal_pension_saving=3_000_000,
        monthly_rent_paid=5_000_000,
    )
    db_session.add(exp)
    db_session.commit()

    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=50_000_000,
    )

    step_5_logs = [l for l in audit_logs if l.step == 5]
    calc_types = [l.calculation_type for l in step_5_logs]

    # 중기감면, 근로소득공제, 자녀세액공제, 혼인공제, 연금계좌, 특별/표준, 월세 개별 기록 확인
    assert "TAX_REDUCTION_SME" in calc_types
    assert "TAX_CREDIT_EARNED_INCOME" in calc_types
    assert "TAX_CREDIT_CHILD" in calc_types
    assert "TAX_CREDIT_MARRIAGE" in calc_types
    assert "TAX_CREDIT_PENSION" in calc_types
    assert "TAX_CREDIT_SPECIAL_OR_STANDARD" in calc_types
    assert "TAX_CREDIT_MONTHLY_RENT" in calc_types


# -----------------------------------------------------------------------------
# 6. 개인정보가 AuditLog에 원문으로 저장되지 않는지 (PII 보호)
# -----------------------------------------------------------------------------
def test_6_pii_masking_in_audit_snapshots(db_session, test_user_session):
    user, session = test_user_session
    audit_svc = AuditService(db_session)

    # 민감 주민등록번호가 포함된 스냅샷으로 로그 생성 시도
    raw_rrn = "950101-1234567"
    raw_snapshot = {
        "user_name": "홍길동",
        "resident_id": raw_rrn,
        "family": [{"name": "배우자", "rrn": "960202-2345678"}],
    }

    dummy_tax_result_id = uuid.uuid4()
    entry = audit_svc.create_audit_log_entry(
        tax_result_id=dummy_tax_result_id,
        sequence_order=1,
        step=1,
        step_name="개인정보 마스킹 검증",
        input_snapshot=raw_snapshot,
    )

    # 원문 주민등록번호 뒷자리가 저장되지 않고 [RRN Omitted]로 마스킹되었는지 검증
    saved_snapshot_str = str(entry.input_snapshot)
    assert raw_rrn not in saved_snapshot_str, "원문 주민등록번호가 AuditLog input_snapshot에 저장되었습니다."
    assert "2345678" not in saved_snapshot_str, "가족의 주민등록번호 뒷자리가 마스킹되지 않았습니다."
    assert "[RRN Omitted]" in saved_snapshot_str or "950101-*******" in saved_snapshot_str


# -----------------------------------------------------------------------------
# 7. TaxResult 삭제 시 AuditLog cascade 삭제
# -----------------------------------------------------------------------------
def test_7_tax_result_cascade_delete(db_session, test_user_session):
    user, session = test_user_session
    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=40_000_000,
    )
    result_id = tax_result.id

    # 생성된 AuditLog 확인
    logs_before = db_session.query(AuditLog).filter(AuditLog.tax_result_id == result_id).all()
    assert len(logs_before) > 0

    # TaxResult 삭제
    db_session.delete(tax_result)
    db_session.commit()

    # Cascade로 AuditLog도 전부 삭제되었는지 검증
    logs_after = db_session.query(AuditLog).filter(AuditLog.tax_result_id == result_id).all()
    assert len(logs_after) == 0


# -----------------------------------------------------------------------------
# 8. 재계산 시 AuditLog 중복 여부 (Replace 동작)
# -----------------------------------------------------------------------------
def test_8_audit_log_idempotent_recalculation(db_session, test_user_session):
    user, session = test_user_session
    service = TaxCalculationService(db=db_session)

    # 1차 계산
    tax_result, logs_1 = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=40_000_000,
    )
    count_1 = len(logs_1)

    # 2차 재계산 (동일 세션에 연봉 변경)
    tax_result, logs_2 = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=60_000_000,
    )
    count_2 = len(logs_2)

    # DB에 누적되지 않고 정확히 2차 계산 결과의 개수만 존재하는지 확인
    all_db_logs = db_session.query(AuditLog).filter(AuditLog.tax_result_id == tax_result.id).all()
    assert len(all_db_logs) == count_2, f"재계산 시 중복이 발생했습니다. 예상 {count_2}, 실제 {len(all_db_logs)}"
    assert tax_result.total_gross_salary == 60_000_000


# -----------------------------------------------------------------------------
# 9. Audit 조회 API 정상 응답
# -----------------------------------------------------------------------------
def test_9_audit_api_endpoint_response(client: TestClient):
    # 1. 세션 생성
    s_res = client.post("/api/v1/sessions", json={"tax_year": 2025, "is_newly_married": True})
    assert s_res.status_code == 200
    session_id = s_res.json()["session_id"]

    # 2. 계산 수행
    c_res = client.post("/api/v1/calculate", json={"session_id": session_id, "override_salary": 45_000_000})
    assert c_res.status_code == 200

    # 3. Audit API 호출 (GET /api/v1/audit/{session_id})
    a_res = client.get(f"/api/v1/audit/{session_id}")
    assert a_res.status_code == 200
    audit_data = a_res.json()

    assert audit_data["session_id"] == session_id
    assert audit_data["total_steps"] >= 7
    first_log = audit_data["logs"][0]

    # 신규 필드 직렬화 확인
    assert "step" in first_log
    assert "calculation_type" in first_log
    assert "legal_basis" in first_log
    assert "explanation" in first_log
    assert "input_snapshot" in first_log


# -----------------------------------------------------------------------------
# 10. 기존 세금 계산 결과가 Audit 구현 전과 동일한지 (결정론적 일관성)
# -----------------------------------------------------------------------------
def test_10_tax_engine_calculation_invariance(db_session, test_user_session):
    user, session = test_user_session
    service = TaxCalculationService(db=db_session)

    # 총급여 5,000만 원, 단독 가구
    tax_result, audit_logs = service.calculate_and_save(
        session_id=str(session.id),
        override_salary=50_000_000,
    )

    # 1) 근로소득공제: 750만 + (5000만 - 1500만) * 0.15 = 750만 + 525만 = 12,250,000원
    assert tax_result.earned_income_deduction == 12_250_000
    # 2) 근로소득금액: 5000만 - 1225만 = 37,750,000원
    assert tax_result.earned_income_amount == 37_750_000
    # 3) 인적공제: 본인 150만 원
    assert tax_result.total_personal_deduction == 1_500_000
    # 4) 과세표준: 3775만 - 150만 = 36,250,000원
    assert tax_result.taxable_standard == 36_250_000
    # 5) 산출세액: 1400만*0.06 + (3625만 - 1400만)*0.15 = 84만 + 333.75만 = 4,177,500원
    assert tax_result.calculated_tax == 4_177_500
    # AuditLog가 동일한 결정론적 수치를 보장하고 있음을 확인
    calc_log = next(l for l in audit_logs if l.step == 4)
    assert calc_log.calculated_amount == 4_177_500
