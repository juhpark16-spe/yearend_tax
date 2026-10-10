"""Rule Engine 단위 테스트 스위트
- ResidentValidator, FamilyMatcher, DuplicateChecker, WithholdingValidator, ChecklistGenerator, RuleEngine
- PRD_v3.0.md, ERD_v2.0.md, API_v1.0.md 준수
"""
import pytest

from backend.rule_engine.checklist_generator import ChecklistGenerator
from backend.rule_engine.duplicate_checker import DuplicateChecker
from backend.rule_engine.engine import RuleEngine
from backend.rule_engine.family_matcher import FamilyMatcher
from backend.rule_engine.resident_validator import ResidentValidator
from backend.rule_engine.withholding_validator import WithholdingValidator
from backend.schemas.validation_result import ValidationResult


# ============================================================================
# 1. ResidentValidator (부양가족 적격성 판정)
# ============================================================================

def test_resident_validator_self_always_eligible():
    """본인은 나이나 소득에 무관하게 항상 기본공제 적격 판정"""
    detail = ResidentValidator.validate_dependent(
        name="홍길동",
        relation="SELF",
        birth_date="1985-05-15",
        annual_income=70000000,
    )
    assert detail.is_basic_eligible is True
    assert len(detail.disqualification_reasons) == 0


def test_resident_validator_elderly_parent():
    """만 75세 모친(소득 0): 기본공제 적격 + 경로우대(100만) 추가공제 해당"""
    detail = ResidentValidator.validate_dependent(
        name="김모친",
        relation="PARENT",
        birth_date="1950-01-01",
        annual_income=0,
        tax_year=2025,
    )
    assert detail.is_basic_eligible is True
    assert detail.is_elderly is True
    assert detail.age == 75


def test_resident_validator_child_age_limit():
    """만 20세 초과 비장애인 자녀: 나이 초과 부적격"""
    detail = ResidentValidator.validate_dependent(
        name="홍성인",
        relation="CHILD",
        birth_date="2000-03-01",  # 만 25세
        annual_income=0,
        is_disabled=False,
        tax_year=2025,
    )
    assert detail.is_basic_eligible is False
    assert any("만 20세 이하 요건을 초과" in r for r in detail.disqualification_reasons)


def test_resident_validator_disabled_child_exemption():
    """장애인 자녀: 만 20세 초과하더라도 나이 요건 배제되어 기본공제 적격"""
    detail = ResidentValidator.validate_dependent(
        name="홍장애",
        relation="CHILD",
        birth_date="1998-05-10",  # 만 27세
        annual_income=500000,
        is_disabled=True,
        tax_year=2025,
    )
    assert detail.is_basic_eligible is True
    assert detail.is_disabled is True


def test_resident_validator_income_exceeded():
    """소득 100만 원 초과 배우자: 소득 요건 미충족 부적격"""
    detail = ResidentValidator.validate_dependent(
        name="이배우자",
        relation="SPOUSE",
        birth_date="1990-07-20",
        annual_income=25000000,
        tax_year=2025,
    )
    assert detail.is_basic_eligible is False
    assert any("100만 원을 초과" in r for r in detail.disqualification_reasons)


# ============================================================================
# 2. FamilyMatcher (등본 vs 간소화 명단 매칭)
# ============================================================================

def test_family_matcher_perfect_match():
    """등본과 간소화 명단이 완전 일치할 때"""
    resident_members = [
        {"name": "홍길동", "relation": "SELF"},
        {"name": "이영희", "relation": "SPOUSE"},
    ]
    hometax_dependents = [
        {"name": "홍길동", "relation": "SELF"},
        {"name": "이영희", "relation": "SPOUSE"},
    ]
    is_matched, warnings, unmatched = FamilyMatcher.match_family_members(
        resident_members, hometax_dependents
    )
    assert is_matched is True
    assert len(warnings) == 0
    assert len(unmatched) == 0


def test_family_matcher_separated_family_warning():
    """등본에 없는 별거 가족이 간소화에 등록된 경우 경고 발생"""
    resident_members = [{"name": "홍길동", "relation": "SELF"}]
    hometax_dependents = [
        {"name": "홍길동", "relation": "SELF"},
        {"name": "김부모", "relation": "PARENT"},  # 등본에 없음
    ]
    is_matched, warnings, unmatched = FamilyMatcher.match_family_members(
        resident_members, hometax_dependents
    )
    assert is_matched is False
    assert "김부모" in unmatched
    assert any("주민등록등본상 세대 구성원에 포함되어 있지 않습니다" in w for w in warnings)


# ============================================================================
# 3. DuplicateChecker (중복/과다공제 탐지)
# ============================================================================

def test_duplicate_checker_working_spouse_child():
    """맞벌이 부부인 경우 자녀 이중공제 위험 경고 탐지"""
    dependents = [
        {"name": "홍자녀", "relation": "CHILD"},
    ]
    duplicates = DuplicateChecker.check_all_duplicates(
        dependents=dependents,
        is_spouse_working=True
    )
    assert any(d.rule_code == "DUP_CHILD_SPOUSE" for d in duplicates)


def test_duplicate_checker_sibling_card_disallowed():
    """형제자매 명의의 신용카드 지출액 공제 제외 경고 탐지"""
    dependents = [
        {"name": "홍동생", "relation": "SIBLING"},
    ]
    deductions = {
        "credit_card_general": 5000000,
        "debit_card_cash": 0
    }
    duplicates = DuplicateChecker.check_all_duplicates(
        dependents=dependents,
        deductions=deductions
    )
    assert any(d.rule_code == "DISALLOW_SIBLING_CARD" for d in duplicates)


# ============================================================================
# 4. WithholdingValidator (근무지 합산 정합성)
# ============================================================================

def test_withholding_validator_single_current():
    """주근무지 1곳 + 종전근무지 1곳: 정상 유효 판정"""
    workplaces = [
        {"company_name": "현 직장", "workplace_type": "CURRENT", "gross_salary": 40000000, "prepaid_tax": 1000000},
        {"company_name": "전 직장", "workplace_type": "PREVIOUS", "gross_salary": 20000000, "prepaid_tax": 500000},
    ]
    summary = WithholdingValidator.validate_workplaces(workplaces)
    assert summary.is_valid_structure is True
    assert summary.current_workplace_count == 1
    assert summary.previous_workplace_count == 1
    assert summary.total_gross_salary == 60000000
    assert summary.total_prepaid_tax == 1500000


def test_withholding_validator_duplicate_current():
    """주근무지 2곳 등록: 비정상 구조(is_valid_structure=False) 경고"""
    workplaces = [
        {"company_name": "직장A", "workplace_type": "CURRENT", "gross_salary": 30000000},
        {"company_name": "직장B", "workplace_type": "CURRENT", "gross_salary": 30000000},
    ]
    summary = WithholdingValidator.validate_workplaces(workplaces)
    assert summary.is_valid_structure is False
    assert any("주된 근무지는 반드시 1곳" in n for n in summary.notes)


# ============================================================================
# 5. ChecklistGenerator (자가진단 질문 및 누락공제)
# ============================================================================

def test_checklist_generator_medical_insurance():
    """의료비 지출 시 실손보험금 차감 질문 자동 생성"""
    deductions = {"medical_general": 2000000}
    questions, missing = ChecklistGenerator.generate_all(
        total_salary=50000000,
        deductions=deductions
    )
    q_ids = [q.id for q in questions]
    assert "chk_med_insurance" in q_ids
    # 누락 공제 추천에 안경 구입비 포함 여부
    assert any("안경" in m.title for m in missing)


# ============================================================================
# 6. RuleEngine Facade 통합 테스트
# ============================================================================

def test_rule_engine_validate_session():
    """RuleEngine 파사드를 통한 종합 검증 결과(ValidationResult) 반환 테스트"""
    engine = RuleEngine(db=None)

    dependents = [
        {"name": "홍길동", "relation": "SELF", "birth_date": "1990-01-01", "annual_income": 60000000},
        {"name": "김모친", "relation": "PARENT", "birth_date": "1952-05-10", "annual_income": 0},
        {"name": "이배우자", "relation": "SPOUSE", "birth_date": "1992-08-15", "annual_income": 30000000},  # 부적격
    ]
    workplaces = [
        {"company_name": "현재회사", "workplace_type": "CURRENT", "gross_salary": 60000000, "prepaid_tax": 2000000},
    ]

    result = engine.validate_session(
        session_id="00000000-0000-0000-0000-000000000001",
        custom_dependents=dependents,
        custom_workplaces=workplaces,
    )

    assert isinstance(result, ValidationResult)
    # 소득 초과 배우자가 있으므로 is_valid는 False
    assert result.is_valid is False
    assert any("이배우자" in err for err in result.errors)
    assert len(result.dependents) == 3
    assert len(result.checklist_questions) > 0
    assert len(result.missing_deductions) > 0
