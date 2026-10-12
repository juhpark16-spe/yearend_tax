"""기본공제 제외 가족의 지출 공제 가능 항목 (국세청 '부양가족 공제요건' 표) + 표 셀 주민번호 마스킹"""
from backend.rule_engine.resident_validator import ResidentValidator, deductible_expenses


def test_income_over_parent_only_medical():
    r = ResidentValidator.validate_dependent("고부친", "PARENT", "1942-01-01", income_over_limit=True)
    assert not r.is_basic_eligible
    assert r.deductible_expenses == ["의료비"]
    assert "의료비는 공제됩니다" in r.expense_note


def test_age_over_child_keeps_education_card_donation():
    r = ResidentValidator.validate_dependent("고영수", "CHILD", "2000-01-01")
    assert not r.is_basic_eligible
    assert r.deductible_expenses == ["의료비", "교육비", "신용카드 등", "기부금"]
    assert r.expense_note.endswith("기부금은 공제됩니다.")


def test_eligible_parent_no_education_and_sibling_no_card():
    assert "교육비" not in deductible_expenses("PARENT", True, True)
    assert "신용카드 등" not in deductible_expenses("SIBLING", True, True)
    r = ResidentValidator.validate_dependent("고부친", "PARENT", "1942-01-01")
    assert r.is_basic_eligible and r.is_elderly and r.expense_note == ""


def test_table_cells_rrn_masked():
    from backend.parser.pdf_parser import PDFParser
    masked = PDFParser()._mask_tables([[["박주현", "800101-2234567"], [None, "1,000"]]])
    assert masked[0][0][1].startswith("800101-") and "2234567" not in masked[0][0][1]
    assert masked[0][1] == [None, "1,000"]
