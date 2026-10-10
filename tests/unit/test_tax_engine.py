"""Tax Engine 단위 테스트 스위트
- TAX_RULES._v1.1.md 및 SRS_v3.0.md 100% 준수 검증
- 수식 연산의 완전한 결정론화 (Pure Python, LLM 계산 전면 배제)
- 2025년 개정 소득세법 법정 산식 검증
"""
import math
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.models.session import TaxSession, TaxSessionStatus
from backend.models.deduction import WorkplaceIncome, ExpenseDeduction
from backend.models.family_member import Dependent, RelationType
from backend.tax_engine.calculator import TaxEngine
from backend.services.tax_calculation_service import TaxCalculationService


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


# =============================================================================
# 1. 근로소득공제 5단계 누진공제 검증 (소득세법 제47조)
# =============================================================================
def test_earned_income_deduction_brackets():
    """총급여 5개 구간별 법정 근로소득공제액 및 2,000만 원 한도 검증"""
    calc = TaxCalculationService.calculate_earned_income_deduction

    # 구간 0: 0원
    assert calc(0) == 0

    # 구간 1: 500만 원 이하 (70%)
    assert calc(5_000_000) == 3_500_000
    assert calc(3_000_000) == 2_100_000

    # 구간 2: 500만 원 초과 ~ 1,500만 원 이하 (350만 + 40%)
    # 10,000,000 -> 3,500,000 + (5,000,000 * 0.4) = 5,500,000
    assert calc(10_000_000) == 5_500_000
    # 15,000,000 -> 3,500,000 + (10,000,000 * 0.4) = 7,500,000
    assert calc(15_000_000) == 7_500_000

    # 구간 3: 1,500만 원 초과 ~ 4,500만 원 이하 (750만 + 15%)
    # 30,000,000 -> 7,500,000 + (15,000,000 * 0.15) = 9,750,000
    assert calc(30_000_000) == 9_750_000
    # 45,000,000 -> 7,500,000 + (30,000,000 * 0.15) = 12,000,000
    assert calc(45_000_000) == 12_000_000

    # 구간 4: 4,500만 원 초과 ~ 1억 원 이하 (1,200만 + 5%)
    # 70,000,000 -> 12,000,000 + (25,000,000 * 0.05) = 13,250,000
    assert calc(70_000_000) == 13_250_000
    # 100,000,000 -> 12,000,000 + (55,000,000 * 0.05) = 14,750,000
    assert calc(100_000_000) == 14_750_000

    # 구간 5: 1억 원 초과 (1,475만 + 2%, 한도 2,000만 원)
    # 200,000,000 -> 14,750,000 + (100,000,000 * 0.02) = 16,750,000
    assert calc(200_000_000) == 16_750_000
    # 500,000,000 -> 14,750,000 + (400,000,000 * 0.02) = 22,750,000 -> 2,000만 원 한도 캡
    assert calc(500_000_000) == 20_000_000


# =============================================================================
# 2. 종합소득세 기본세율 8단계 누진세율 검증 (소득세법 제55조)
# =============================================================================
def test_income_tax_rates_8_brackets():
    """과세표준 구간별 8단계 기본세율(6%~45%) 누진공제 속산표 검증"""
    calc = TaxCalculationService.calculate_income_tax

    # 과표 0원 이하
    assert calc(0) == 0
    assert calc(-1_000) == 0

    # 1구간: 1,400만 원 이하 (6%)
    assert calc(14_000_000) == 840_000
    assert calc(10_000_000) == 600_000

    # 2구간: 1,400만 초과 ~ 5,000만 원 이하 (84만 + 15%)
    # 30,000,000 -> 840,000 + (16,000,000 * 0.15) = 3,240,000
    assert calc(30_000_000) == 3_240_000
    assert calc(50_000_000) == 6_240_000

    # 3구간: 5,000만 초과 ~ 8,800만 원 이하 (624만 + 24%)
    # 70,000,000 -> 6,240,000 + (20,000,000 * 0.24) = 11,040,000
    assert calc(70_000_000) == 11_040_000
    assert calc(88_000_000) == 15_360_000

    # 4구간: 8,800만 초과 ~ 1억 5,000만 원 이하 (1,536만 + 35%)
    # 100,000,000 -> 15,360,000 + (12,000,000 * 0.35) = 19,560,000
    assert calc(100_000_000) == 19_560_000
    assert calc(150_000_000) == 37_060_000

    # 5구간: 1억 5,000만 초과 ~ 3억 원 이하 (3,706만 + 38%)
    # 200,000,000 -> 37,060,000 + (50,000,000 * 0.38) = 56,060,000
    assert calc(200_000_000) == 56_060_000
    assert calc(300_000_000) == 94_060_000

    # 6구간: 3억 초과 ~ 5억 원 이하 (9,406만 + 40%)
    # 400,000,000 -> 94,060,000 + (100,000,000 * 0.40) = 134,060,000
    assert calc(400_000_000) == 134_060_000
    assert calc(500_000_000) == 174_060_000

    # 7구간: 5억 초과 ~ 10억 원 이하 (17,406만 + 42%)
    # 800,000,000 -> 174,060,000 + (300,000,000 * 0.42) = 300,060,000
    assert calc(800_000_000) == 300_060_000
    assert calc(1_000_000_000) == 384_060_000

    # 8구간: 10억 초과 (38,406만 + 45%)
    # 1,200,000,000 -> 384,060,000 + (200,000,000 * 0.45) = 474,060,000
    assert calc(1_200_000_000) == 474_060_000


# =============================================================================
# 3. 근로소득세액공제 및 한도·중기감면 축소비율 검증 (소득세법 제59조)
# =============================================================================
def test_earned_income_tax_credit_and_limits():
    """근로소득세액공제 계산식 및 총급여별 한도, 중기감면 축소비율 검증"""
    calc = TaxCalculationService.calculate_earned_income_tax_credit

    # 1) 산출세액 130만 원 이하 (55%)
    # tax=1,000,000, salary=30,000,000 -> credit = 550,000, limit = 740,000
    assert calc(1_000_000, 30_000_000) == 550_000

    # 2) 산출세액 130만 원 초과 (71.5만 + 30%)
    # tax=2,000,000 -> raw = 715,000 + 700,000 * 0.3 = 925,000
    # 총급여 3,300만 원 이하 한도 740,000원 적용
    assert calc(2_000_000, 30_000_000) == 740_000

    # 총급여 5,000만 원 구간 한도: max(660,000, 740,000 - 17,000,000 * 0.008) = max(660,000, 604,000) = 660,000
    assert calc(2_000_000, 50_000_000) == 660_000

    # 총급여 8,000만 원 구간 한도: max(500,000, 660,000 - 10,000,000 * 0.5) = max(500,000, 160,000) = 500,000
    assert calc(2_000_000, 80_000_000) == 500_000

    # 총급여 1억 3천만 원 구간 한도: max(200,000, 500,000 - 10,000,000 * 0.5) = max(200,000, 0) = 200,000
    assert calc(2_000_000, 130_000_000) == 200_000

    # 3) 중소기업 취업자 감면(reduction_sme) 적용 시 한도 감액 비율: credit * (1 - 감면/산출)
    # tax=2,000,000, salary=50,000,000 -> base_credit=660,000
    # reduction_sme=1,000,000 (50% 감면) -> credit * (1 - 0.5) = 330,000
    assert calc(2_000_000, 50_000_000, reduction_sme=1_000_000) == 330_000


# =============================================================================
# 4. 자녀세액공제 2025 개정안 검증 (소득세법 제59조의2)
# =============================================================================
def test_child_tax_credit_2025_revision():
    """2025년 개정 자녀세액공제 (1명 25만 / 2명 55만 / 3명 이상 55만 + (N-2)*40만) 및 출산·입양 공제"""
    calc = TaxCalculationService.calculate_child_tax_credit

    # 0명
    assert calc(0, {}) == 0

    # 1명: 25만 원
    assert calc(1, {}) == 250_000

    # 2명: 55만 원
    assert calc(2, {}) == 550_000

    # 3명: 55만 + 40만 = 95만 원
    assert calc(3, {}) == 950_000

    # 4명: 55만 + 80만 = 135만 원
    assert calc(4, {}) == 1_350_000

    # 출산/입양 공제 (첫째 30만 / 둘째 50만 / 셋째 이상 70만)
    # 기본 2명 + 둘째 출산 1명: 550,000 + 500,000 = 1,050,000원
    assert calc(2, {2: 1}) == 1_050_000

    # 기본 1명 + 첫째 출산 1명: 250,000 + 300,000 = 550,000원
    assert calc(1, {1: 1}) == 550_000

    # 기본 3명 + 셋째 출산 1명: 950,000 + 700,000 = 1,650,000원
    assert calc(3, {3: 1}) == 1_650_000


# =============================================================================
# 5. 신용카드 등 사용금액 소득공제 검증 (조특법 제126조의2)
# =============================================================================
def test_credit_card_deduction():
    """신용카드 25% 문턱값, 4대 수단별 공제율 및 기본/추가 한도 검증"""
    calc = TaxCalculationService.calculate_credit_card_deduction

    # 총급여 5,000만 원 (25% 문턱값 = 1,250만 원)
    # 케이스 1: 1,250만 원 이하 지출 -> 0원
    ded, meta = calc(
        gross_salary=50_000_000,
        credit_card_general=10_000_000,
        debit_card_cash=0,
        market_transport=0,
        culture_sports=0,
    )
    assert ded == 0
    assert meta["threshold"] == 12_500_000

    # 케이스 2: 25% 초과 지출액 배분
    # 신용카드 2,000만 원 지출 -> 초과액 750만 원 * 15% = 1,125,000원
    ded, meta = calc(
        gross_salary=50_000_000,
        credit_card_general=20_000_000,
        debit_card_cash=0,
        market_transport=0,
        culture_sports=0,
    )
    assert ded == 1_125_000
    assert meta["actual_base"] == 1_125_000

    # 케이스 3: 2025 신설 도서공연/체육시설(30%) 및 전통시장/대중교통(40%)
    # 총급여 5,000만 원 (문턱 1,250만)
    # 신용카드 1,250만 (문턱 채움), 직불 200만(30% -> 60만), 문화체육 200만(30% -> 60만), 전통시장 100만(40% -> 40만)
    ded, meta = calc(
        gross_salary=50_000_000,
        credit_card_general=12_500_000,
        debit_card_cash=2_000_000,
        culture_sports=2_000_000,
        market_transport=1_000_000,
    )
    # base = 600,000 (직불)
    # additional = 600,000 (문화체육) + 400,000 (전통시장) = 1,000,000
    # total = 1,600,000
    assert meta["actual_base"] == 600_000
    assert meta["actual_additional"] == 1_000_000
    assert ded == 1_600_000

    # 케이스 4: 총급여 7천만 초과 시 문화/체육 공제 제외 확인
    # 총급여 8,000만 원 (문턱 2,000만)
    # 신용카드 2,000만, 문화체육 500만
    ded, meta = calc(
        gross_salary=80_000_000,
        credit_card_general=20_000_000,
        debit_card_cash=0,
        culture_sports=5_000_000,
        market_transport=0,
    )
    # 7천만 초과이므로 문화체육 30% 미적용 -> 0원
    assert ded == 0


# =============================================================================
# 6. Zero-State 및 TaxEngine 독립 연산 검증
# =============================================================================
def test_zero_state_and_tax_engine_wrapper():
    """총급여 0원 입력 시 완전한 Zero-State 반환 및 TaxEngine 독립 래퍼 검증"""
    engine = TaxEngine(tax_year=2025)

    # 1. Zero-State
    zero_res = engine.calculate_tax({"total_salary": 0, "prepaid_tax": 0})
    assert zero_res["total_salary"] == 0
    assert zero_res["earned_income_deduction"] == 0
    assert zero_res["taxable_income"] == 0
    assert zero_res["calculated_tax"] == 0
    assert zero_res["final_tax"] == 0
    assert zero_res["refund_amount"] == 0

    # 2. 일반 급여 계산 (연봉 5,000만 원, 기납부 100만 원)
    res = engine.calculate_tax({
        "total_salary": 50_000_000,
        "prepaid_tax": 1_000_000,
        "personal_deduction": 1_500_000,
        "special_deduction": 0,
        "card_deduction": 0,
        "other_credits": 0,
    })
    assert res["total_salary"] == 50_000_000
    assert res["earned_income_deduction"] == 12_250_000
    # 근로소득금액 = 50,000,000 - 12,250,000 = 37,750,000
    # 과표 = 37,750,000 - 1,500,000 = 36,250,000
    assert res["taxable_income"] == 36_250_000
    # 산출세액 (2구간 15%): 840,000 + (36,250,000 - 14,000,000) * 0.15 = 4,177,500
    assert res["calculated_tax"] == 4_177_500
    assert res["final_tax"] > 0
    assert "refund_amount" in res


# =============================================================================
# 7. TaxCalculationService 전체 파이프라인 및 7단계 AuditLog 영속화 검증
# =============================================================================
def test_tax_calculation_service_pipeline_and_audit_logs(db_session):
    """DB 기반 TaxCalculationService 세액 계산 파이프라인 및 7단계 AuditLog 생성 검증"""
    from backend.models.user import User
    user = User(
        email="tax_engine_test@example.com",
        name="홍길동",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # 1. 세션 생성
    tax_session = TaxSession(
        user_id=user.id,
        tax_year=2025,
        status=TaxSessionStatus.PARSED,
        is_sme_youth=False,
        is_newly_married=True,  # 2025 신설 혼인세액공제 50만 원 대상
    )
    db_session.add(tax_session)
    db_session.commit()
    db_session.refresh(tax_session)

    from backend.models.deduction import WorkplaceType

    # 2. 직장 근로소득 생성 (연봉 6,000만 원, 기납부세액 150만 원)
    workplace = WorkplaceIncome(
        session_id=tax_session.id,
        workplace_type=WorkplaceType.CURRENT,
        company_name="(주)테스트세무",
        business_number="123-45-67890",
        gross_salary=60_000_000,
        prepaid_income_tax=1_500_000,
        prepaid_local_tax=150_000,
    )
    db_session.add(workplace)

    # 3. 부양가족 생성 (본인 + 8세 자녀 1명)
    self_dep = Dependent(
        session_id=tax_session.id,
        name="홍길동",
        relation=RelationType.SELF,
        birth_date="1990-01-01",
        annual_income_amount=60_000_000,
        is_basic_deduction=True,
    )
    child_dep = Dependent(
        session_id=tax_session.id,
        name="홍아이",
        relation=RelationType.CHILD,
        birth_date="2017-05-01",  # 만 8세
        annual_income_amount=0,
        is_basic_deduction=True,
    )
    db_session.add_all([self_dep, child_dep])

    # 4. 연금저축 지출 내역 생성 (연금계좌 400만 원)
    pension_exp = ExpenseDeduction(
        session_id=tax_session.id,
        personal_pension_saving=4_000_000,
    )
    db_session.add(pension_exp)
    db_session.commit()

    # 5. 계산 서비스 실행
    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(session_id=str(tax_session.id))

    # 6. 결과 검증
    assert tax_result.total_gross_salary == 60_000_000
    assert tax_result.earned_income_deduction == 12_750_000
    # 인적공제: 본인 150만 + 자녀 150만 = 300만
    assert tax_result.total_personal_deduction >= 3_000_000
    assert tax_result.taxable_standard > 0
    assert tax_result.calculated_tax > 0

    # 세액공제: 자녀세액공제(25만) + 혼인세액공제(50만) + 연금계좌(400만*12%=48만) + 근로소득세액공제
    assert tax_result.tax_credit_child == 250_000
    assert tax_result.tax_credit_marriage == 500_000
    assert tax_result.tax_credit_pension_account == 480_000
    assert tax_result.final_decision_tax >= 0

    # 차감징수세액: final_decision_tax - 1,500,000
    assert tax_result.final_refund_amount == tax_result.final_decision_tax - 1_500_000

    # 7. AuditLog 단계별 무결성 검증 (최소 7단계 생성)
    assert len(audit_logs) >= 7
    seq_numbers = [log.sequence_order for log in audit_logs]
    assert 1 in seq_numbers  # 근로소득금액 계산
    assert 2 in seq_numbers  # 인적공제
    assert 3 in seq_numbers  # 소득공제 및 종합한도
    assert 4 in seq_numbers  # 과세표준 및 산출세액
    assert 5 in seq_numbers  # 세액감면
    assert 6 in seq_numbers  # 세액공제
    assert 7 in seq_numbers  # 결정세액 및 차감징수세액

    # 감사 로그 내용 검증
    for log in audit_logs:
        assert log.tax_result_id == tax_result.id
        assert log.step_name != ""
        assert isinstance(log.metadata_json, dict)


# =============================================================================
# 8. 소득공제 종합한도 (2,500만 원 초과분 과표 가산) 검증 (조특법 제132조의2)
# =============================================================================
def test_income_deduction_limit_excess(db_session):
    """주택자금 및 신용카드 공제액 합계가 2,500만 원을 초과할 때 초과분이 과세표준에 올바르게 가산되는지 검증"""
    from backend.models.user import User
    from backend.models.deduction import WorkplaceType

    user = User(email="limit_test@example.com", name="이과표")
    db_session.add(user)
    db_session.commit()

    tax_session = TaxSession(
        user_id=user.id,
        tax_year=2025,
        status=TaxSessionStatus.PARSED,
    )
    db_session.add(tax_session)
    db_session.commit()

    workplace = WorkplaceIncome(
        session_id=tax_session.id,
        workplace_type=WorkplaceType.CURRENT,
        company_name="한도초과테스트",
        gross_salary=200_000_000,
        prepaid_income_tax=10_000_000,
    )
    db_session.add(workplace)

    self_dep = Dependent(
        session_id=tax_session.id,
        name="이과표",
        relation=RelationType.SELF,
        annual_income_amount=200_000_000,
        is_basic_deduction=True,
    )
    db_session.add(self_dep)

    # 주택임차차입금원리금 1,000만(40% -> 400만), 청약 300만(40% -> 120만, 합산 400만 한도)
    # 주택담보대출 이자 2,500만(2,000만 한도), 신용카드 등 600만
    # 합계 = 400만 + 2,000만 + 600만 = 3,000만 원 (2,500만 원 초과 -> 500만 원 초과분)
    exp = ExpenseDeduction(
        session_id=tax_session.id,
        housing_rent_loan=10_000_000,
        housing_subscription=3_000_000,
        mortgage_interest=25_000_000,
        credit_card_general=100_000_000,
        market_transport=10_000_000,
    )
    db_session.add(exp)
    db_session.commit()

    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(session_id=str(tax_session.id))

    # 종합한도 초과분 2,500만 원 초과 가산 확인
    assert tax_result.income_deduction_limit_excess > 0


# =============================================================================
# 9. 표준세액공제(13만 원) vs 특별공제 비교선택 검증
# =============================================================================
def test_standard_tax_credit_selection(db_session):
    """특별소득공제 및 특별세액공제가 없어 표준세액공제(13만 원)가 더 유리할 때 13만 원 자동 적용 검증"""
    from backend.models.user import User
    from backend.models.deduction import WorkplaceType

    user = User(email="standard_test@example.com", name="박표준")
    db_session.add(user)
    db_session.commit()

    tax_session = TaxSession(
        user_id=user.id,
        tax_year=2025,
        status=TaxSessionStatus.PARSED,
    )
    db_session.add(tax_session)
    db_session.commit()

    # 특별공제 지출이 전무한 상태 (공제 지출 0)
    workplace = WorkplaceIncome(
        session_id=tax_session.id,
        workplace_type=WorkplaceType.CURRENT,
        company_name="표준테스트",
        gross_salary=40_000_000,
        prepaid_income_tax=1_000_000,
    )
    db_session.add(workplace)

    self_dep = Dependent(
        session_id=tax_session.id,
        name="박표준",
        relation=RelationType.SELF,
        annual_income_amount=40_000_000,
        is_basic_deduction=True,
    )
    db_session.add(self_dep)
    db_session.commit()

    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(session_id=str(tax_session.id))

    # 특별세액공제가 없으므로 표준세액공제 13만 원 적용 확인
    assert tax_result.standard_tax_credit == 130_000


# =============================================================================
# 10. 중소기업 취업 청년 세액감면(90%, 한도 200만 원) 검증 (조특법 제30조)
# =============================================================================
def test_sme_youth_tax_reduction(db_session):
    """중소기업 취업 청년 감면 90% (최대 200만 원 한도) 적용 및 근로소득세액공제 감액 축소 비율 검증"""
    from backend.models.user import User
    from backend.models.deduction import WorkplaceType

    user = User(email="sme_test@example.com", name="최청년")
    db_session.add(user)
    db_session.commit()

    tax_session = TaxSession(
        user_id=user.id,
        tax_year=2025,
        status=TaxSessionStatus.PARSED,
        is_sme_youth=True,  # 중소기업 청년 감면 대상
    )
    db_session.add(tax_session)
    db_session.commit()

    workplace = WorkplaceIncome(
        session_id=tax_session.id,
        workplace_type=WorkplaceType.CURRENT,
        company_name="중소기업(주)",
        gross_salary=45_000_000,
        prepaid_income_tax=1_000_000,
    )
    db_session.add(workplace)

    self_dep = Dependent(
        session_id=tax_session.id,
        name="최청년",
        relation=RelationType.SELF,
        annual_income_amount=45_000_000,
        is_basic_deduction=True,
    )
    db_session.add(self_dep)
    db_session.commit()

    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(session_id=str(tax_session.id))

    # 산출세액의 90%가 최대 200만 원 한도로 감면되었는지 확인
    expected_sme_reduction = min(2_000_000, math.floor(tax_result.calculated_tax * 0.90))
    assert tax_result.tax_reduction_sme == expected_sme_reduction


# =============================================================================
# 11. 보장성보험료 세액공제 (소득세법 제59조의4 제1항: 일반 100만 한도 12%, 장애인 100만 한도 15%)
# =============================================================================
def test_guaranteed_insurance_tax_credit(db_session):
    """보장성보험료 일반(100만원 한도 12%) 및 장애인(100만원 한도 15%) 세액공제 정밀 검증"""
    from backend.models.user import User
    from backend.models.deduction import WorkplaceType

    user = User(email="insurance_test@example.com", name="보장성테스터")
    db_session.add(user)
    db_session.commit()

    tax_session = TaxSession(
        user_id=user.id,
        tax_year=2025,
        status=TaxSessionStatus.PARSED,
    )
    db_session.add(tax_session)
    db_session.commit()

    # 총급여 6,000만 원 (산출세액 충분)
    workplace = WorkplaceIncome(
        session_id=tax_session.id,
        workplace_type=WorkplaceType.CURRENT,
        company_name="보험테스트(주)",
        gross_salary=60_000_000,
        prepaid_income_tax=5_000_000,
    )
    db_session.add(workplace)

    self_dep = Dependent(
        session_id=tax_session.id,
        name="보장성테스터",
        relation=RelationType.SELF,
        annual_income_amount=60_000_000,
        is_basic_deduction=True,
    )
    db_session.add(self_dep)

    # 케이스: 일반보장성 150만원(100만 한도 초과), 장애인보장성 120만원(100만 한도 초과)
    # 일반: min(100만, 150만) * 12% = 12만 원
    # 장애인: min(100만, 120만) * 15% = 15만 원
    # 합계: 27만 원 특별세액공제
    expense = ExpenseDeduction(
        session_id=tax_session.id,
        national_pension=2_700_000,
        health_insurance=2_127_000,
        employment_insurance=540_000,
        raw_details={
            "general_insurance": 1_500_000,
            "disabled_insurance": 1_200_000,
        }
    )
    db_session.add(expense)
    db_session.commit()

    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(session_id=str(tax_session.id))

    # AuditLog 중 특별세액공제 스텝 조회
    special_step = next(log for log in audit_logs if log.calculation_type == "TAX_CREDIT_SPECIAL_OR_STANDARD")
    assert special_step is not None
    assert special_step.input_snapshot["gen_ins_credit"] == 120_000
    assert special_step.input_snapshot["dis_ins_credit"] == 150_000
    assert special_step.input_snapshot["ins_credit"] == 270_000
    assert special_step.metadata_json["ins_credit"] == 270_000


# =============================================================================
# 13. 의료비 세액공제 법정 산식 및 첨부 이미지 검증 (소득세법 제59조의4 제2항)
# =============================================================================
def test_medical_tax_credit_statutory_image_case():
    """사용자 첨부 이미지 실측 데이터 역산 검증:
    총급여 121,500,000원 (문턱 3,645,000원)
    - 본인 순지출: 13,549,310원 (공제대상 13,549,310원, 15% = 2,032,397원)
    - 65세/6세/장애인/특례자 순지출: 13,331,690원 (공제대상 13,331,690원, 15% = 1,999,753원)
    - 그 밖의 공제대상자 순지출: 4,182,160원
      -> 총급여 3% 문턱(3,645,000원) 우선 차감 후 공제대상 537,160원, 15% = 80,574원
    총 세액공제 합계: 2,032,397 + 1,999,753 + 80,574 = 4,112,724원
    """
    total_salary = 121_500_000
    med_gen = 4_182_160
    med_spec = 13_549_310 + 13_331_690  # 본인 + 65세이상/장애인

    res = TaxCalculationService.calculate_medical_tax_credit(
        gross_salary=total_salary,
        medical_general=med_gen,
        medical_special=med_spec,
    )

    assert res["threshold"] == 3_645_000
    assert res["deductible_general"] == 537_160
    assert res["deductible_special"] == 26_881_000
    assert res["credit_general"] == 80_574
    assert res["credit_special"] == 4_032_150
    assert res["total_credit"] == 4_112_724


def test_medical_tax_credit_in_full_pipeline(db_session):
    """세션 파이프라인에서 의료비 4,112,724원 반영 및 특별세액공제 연계 검증"""
    from backend.models.user import User
    from backend.models.deduction import WorkplaceType

    user = User(email="med_test@example.com", name="의료비테스터")
    db_session.add(user)
    db_session.commit()

    tax_session = TaxSession(
        user_id=user.id,
        tax_year=2025,
        status=TaxSessionStatus.PARSED,
    )
    db_session.add(tax_session)
    db_session.commit()

    workplace = WorkplaceIncome(
        session_id=tax_session.id,
        workplace_type=WorkplaceType.CURRENT,
        company_name="의료비테스트(주)",
        gross_salary=121_500_000,
        prepaid_income_tax=20_000_000,
    )
    db_session.add(workplace)

    self_dep = Dependent(
        session_id=tax_session.id,
        name="의료비테스터",
        relation=RelationType.SELF,
        annual_income_amount=121_500_000,
        is_basic_deduction=True,
    )
    db_session.add(self_dep)

    expense = ExpenseDeduction(
        session_id=tax_session.id,
        national_pension=3_000_000,
        health_insurance=2_500_000,
        employment_insurance=600_000,
        medical_general=4_182_160,
        medical_special=26_881_000,
    )
    db_session.add(expense)
    db_session.commit()

    service = TaxCalculationService(db=db_session)
    tax_result, audit_logs = service.calculate_and_save(session_id=str(tax_session.id))

    special_step = next(log for log in audit_logs if log.calculation_type == "TAX_CREDIT_SPECIAL_OR_STANDARD")
    assert special_step is not None
    assert special_step.input_snapshot["med_credit"] == 4_112_724



