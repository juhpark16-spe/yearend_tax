"""3-A 세액 엔진 보정 테스트
- 자녀세액공제 만 8세 이상 요건
- 교육비 1인별·구분별 한도
- 표준세액공제 선택 시 특별소득공제 이중 적용 방지
- 결정세액 = 기납부세액(차감 0원)일 때 환급으로 표시하지 않음
"""
import math

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.models.user import User
from backend.models.session import TaxSession, TaxSessionStatus
from backend.models.deduction import WorkplaceIncome, WorkplaceType, ExpenseDeduction
from backend.models.family_member import Dependent, RelationType
from backend.services.tax_calculation_service import TaxCalculationService


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    try:
        yield s
    finally:
        s.close()


def _session(db, salary, prepaid=1_000_000, deps=(), expense=None, email="t@example.com"):
    user = User(email=email, name="테스트")
    db.add(user)
    db.commit()
    ts = TaxSession(user_id=user.id, tax_year=2025, status=TaxSessionStatus.PARSED)
    db.add(ts)
    db.commit()
    db.add(WorkplaceIncome(session_id=ts.id, workplace_type=WorkplaceType.CURRENT, company_name="테스트",
                           gross_salary=salary, prepaid_income_tax=prepaid))
    db.add(Dependent(session_id=ts.id, name="본인", relation=RelationType.SELF,
                     annual_income_amount=salary, is_basic_deduction=True))
    for name, birth in deps:
        db.add(Dependent(session_id=ts.id, name=name, relation=RelationType.CHILD, birth_date=birth,
                         annual_income_amount=0, is_basic_deduction=True))
    if expense:
        db.add(ExpenseDeduction(session_id=ts.id, **expense))
    db.commit()
    return ts


def _step(logs, step, name=None):
    for l in logs:
        if l.step == step and (name is None or l.step_name == name):
            return l
    raise AssertionError(f"step {step} {name} not found")


def test_child_credit_counts_only_age_8_or_older(db):
    ts = _session(db, 60_000_000, deps=[("여섯살", "2019-03-01"), ("열살", "2015-03-01")])
    result, logs = TaxCalculationService(db).calculate_and_save(session_id=str(ts.id))
    assert result.tax_credit_child == 250_000  # 만 8세 이상 1명


def test_child_credit_unknown_birth_is_counted(db):
    ts = _session(db, 60_000_000, deps=[("생년미상", None)])
    result, _ = TaxCalculationService(db).calculate_and_save(session_id=str(ts.id))
    assert result.tax_credit_child == 250_000


def test_education_base_applies_per_person_limits():
    calc = TaxCalculationService.calculate_education_base
    two_univ = [{"name": "첫째", "category": "대학생", "amount": 8_000_000},
                {"name": "둘째", "category": "대학생", "amount": 10_000_000}]
    assert calc(two_univ)["base"] == 8_000_000 + 9_000_000

    mixed = [{"name": "본인", "category": "본인", "amount": 12_000_000},
             {"name": "셋째", "category": "초·중·고등학생", "amount": 2_800_000},
             {"name": "셋째", "category": "중.고등학생(교복구입비)", "amount": 987_000},
             {"name": "셋째", "category": "초.중.고등학생(현장학습비)", "amount": 400_000},
             {"name": "넷째", "category": "장애인특수교육", "amount": 5_000_000},
             {"name": "넷째", "category": "대학원", "amount": 3_000_000},
             {"name": "다섯째", "category": "초·중·고등학생", "amount": 2_000_000, "needs_review": True}]
    r = calc(mixed)
    assert r["per_person"] == {"본인": 12_000_000, "셋째": 3_000_000, "넷째": 5_000_000}
    assert calc(None, 5_000_000)["base"] == 3_000_000  # 인별 내역 없으면 1인 300만 원 기준


def test_education_credit_uses_raw_details_in_pipeline(db):
    details = [{"name": "첫째", "category": "대학생", "amount": 8_000_000},
               {"name": "둘째", "category": "대학생", "amount": 8_000_000}]
    ts = _session(db, 90_000_000, prepaid=8_000_000,
                  expense={"education_child": 16_000_000, "raw_details": {"education_details": details}})
    result, logs = TaxCalculationService(db).calculate_and_save(session_id=str(ts.id))
    special = _step(logs, 5, "특별세액공제 및 표준세액공제 비교")
    assert special.input_snapshot["edu_credit"] == 2_400_000  # 1,600만 × 15% (기존 45만 상한 해소)


def test_standard_credit_does_not_keep_special_income_deduction(db):
    # 건강보험료 50만 원만 있는 경우: 특별공제(약 7.5만 원 절세) < 표준 13만 원 → 표준 선택
    ts = _session(db, 40_000_000, expense={"health_insurance": 500_000})
    result, logs = TaxCalculationService(db).calculate_and_save(session_id=str(ts.id))
    assert result.standard_tax_credit == 130_000
    # 표준세액공제를 택하면 건강보험료 소득공제는 적용되지 않아야 한다
    earned_income = 40_000_000 - (7_500_000 + (40_000_000 - 15_000_000) * 15 // 100)
    assert result.taxable_standard == earned_income - 1_500_000
    assert result.total_special_income_deduction == 0
    assert "표준세액공제 선택" in _step(logs, 3).explanation


def test_special_kept_when_it_saves_more(db):
    ts = _session(db, 40_000_000, expense={"health_insurance": 2_500_000, "employment_insurance": 400_000})
    result, _ = TaxCalculationService(db).calculate_and_save(session_id=str(ts.id))
    assert result.standard_tax_credit == 0
    assert result.total_special_income_deduction == 2_900_000


def test_zero_balance_is_not_reported_as_refund(db):
    probe = _session(db, 50_000_000, prepaid=0, email="probe@example.com")
    r1, _ = TaxCalculationService(db).calculate_and_save(session_id=str(probe.id))
    ts = _session(db, 50_000_000, prepaid=r1.final_decision_tax, email="zero@example.com")
    r2, logs = TaxCalculationService(db).calculate_and_save(session_id=str(ts.id))
    assert r2.final_refund_amount == 0
    last = _step(logs, 7)
    assert last.output_snapshot["is_refund"] is False
    assert "같아" in last.explanation


def test_rag_explain_accepts_screen_payload_numbers_only(client, monkeypatch):
    from backend.core.config import settings
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")  # LLM 없이 결정론적 해설 경로
    captured = {}
    from backend.ai import explanation_service as es
    orig = es.TaxExplanationService.explain_tax_payload

    def spy(self, payload, query="", category=None):
        captured["payload"] = payload
        return orig(self, payload=payload, query=query, category=category)

    monkeypatch.setattr(es.TaxExplanationService, "explain_tax_payload", spy)
    res = client.post("/api/v1/rag/explain", json={
        "category": "연말정산 종합",
        "query": "왜 이 금액인가요?",
        "payload": {"gross_salary": 71500000, "final_refund_amount": -3166500,
                    "name": "홍길동", "rrn": "900101-1234567", "calculated_tax": "abc"},
    })
    assert res.status_code == 200
    body = res.json()
    assert body["title"] and body["summary"] and isinstance(body["page"], int)
    assert captured["payload"] == {"gross_salary": 71500000, "final_refund_amount": -3166500}


def test_donation_credit_by_type_matches_law():
    calc = TaxCalculationService.calculate_donation_credit
    details = [
        {"type": "정치자금기부금", "amount": 5_000},
        {"type": "고향사랑기부금", "amount": 100_000},
        {"type": "고향사랑기부금(특별재난지역)", "amount": 100_000},
        {"type": "특례기부금", "amount": 50_000},
        {"type": "우리사주조합기부금", "amount": 210_000},
        {"type": "일반기부금(종교단체외)", "amount": 1_200_000},
    ]
    r = calc(details, earned_income=106_320_000)
    assert r["political"] == 4_545                 # 5,000 × 100/110
    assert r["hometown"] == 90_909 + 30_000        # 10만 × 100/110 + 특별재난 10만 × 30%
    assert r["special"] == 7_500 and r["employee_stock"] == 31_500 and r["general"] == 180_000
    assert r["total"] == 344_454
    assert r["separate"] == 4_545 + 120_909 + 31_500


def test_donation_political_hometown_only_for_self_and_limits():
    calc = TaxCalculationService.calculate_donation_credit
    r = calc([{"type": "정치자금기부금", "amount": 100_000, "is_self": False},
              {"type": "고향사랑기부금", "amount": 6_000_000}], earned_income=50_000_000)
    assert r["political"] == 0
    assert r["hometown"] == 90_909 + math.floor(4_900_000 * 0.15)  # 연 500만 원 한도
    fallback = calc(None, earned_income=50_000_000, fallback_amount=1_000_000)
    assert fallback["general"] == 150_000 and fallback["mode"] == "FALLBACK_GENERAL"


def test_separate_donation_credit_kept_with_standard_credit(db):
    # 특별공제 없음 → 표준세액공제 선택, 고향사랑기부금 공제는 함께 적용
    ts = _session(db, 40_000_000, prepaid=0,
                  expense={"raw_details": {"donation_details": [{"type": "고향사랑기부금", "amount": 100_000}]}})
    result, logs = TaxCalculationService(db).calculate_and_save(session_id=str(ts.id))
    assert result.standard_tax_credit == 130_000
    sep = _step(logs, 5, "정치자금·고향사랑·우리사주 기부금 세액공제")
    assert sep.calculated_amount == 90_909
