"""부양가족 인적공제 적격성 판정 모듈 (ResidentValidator)
- 소득 요건(100만 이하), 나이 요건(만20세 이하, 만60세 이상), 장애인, 추가공제(경로우대, 한부모) 판정
- 2025년 귀속 대한민국 소득세법 제50조, 제51조 준수
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from backend.schemas.validation_result import DependentValidationDetail


EXPENSE_LABELS = ("보장성보험료", "의료비", "교육비", "신용카드 등", "기부금")


def deductible_expenses(relation: str, income_ok: bool, age_ok: bool) -> List[str]:
    """국세청 연말정산 안내 '부양가족 공제요건' 표 기준, 그 가족의 지출로 공제되는 항목.

    - 보장성보험료: 나이·소득 요건 모두 필요
    - 의료비: 나이·소득 요건 없음 (근로기간 지출분)
    - 교육비: 소득 요건만 (직계존속 제외 — 장애인특수교육비는 소득 요건 없고 직계존속도 가능)
    - 신용카드 등: 소득 요건만 (형제자매 제외)
    - 기부금: 소득 요건만 (정치자금·고향사랑·우리사주조합 기부금은 본인만)
    """
    rel = relation.upper()
    if rel in ("SELF", "본인", "세대주"):
        return list(EXPENSE_LABELS)
    is_parent = rel in ("PARENT", "부모", "직계존속", "부", "모")
    is_sibling = rel in ("SIBLING", "형제자매", "형제", "자매")
    items = []
    if income_ok and age_ok:
        items.append("보장성보험료")
    items.append("의료비")
    if income_ok and not is_parent:
        items.append("교육비")
    if income_ok and not is_sibling:
        items.append("신용카드 등")
    if income_ok:
        items.append("기부금")
    return items


def expense_note(items: List[str]) -> str:
    if items == ["의료비"]:
        return "기본공제는 제외되지만 의료비는 공제됩니다 (나이·소득 요건 없음)."
    last = items[-1]
    josa = "은" if (ord(last[-1]) - 0xAC00) % 28 else "는"
    return f"기본공제는 제외되지만 {'·'.join(items)}{josa} 공제됩니다."


class ResidentValidator:
    """부양가족 1인 또는 목록 전체의 기본공제 및 추가공제 법정 적격성을 판정하는 엔진
    """

    TAX_YEAR: int = 2025

    @classmethod
    def calculate_age(cls, birth_date: Optional[str], tax_year: int = 2025) -> Optional[int]:
        """생년월일(YYYY-MM-DD 또는 YYYYMMDD)로부터 당해 과세연도 기준 만 나이를 계산합니다."""
        if not birth_date:
            return None
        clean_date = birth_date.replace(".", "-").replace("/", "-").strip()
        try:
            birth_year = int(clean_date.split("-")[0]) if "-" in clean_date else int(clean_date[:4])
            return tax_year - birth_year
        except (ValueError, IndexError):
            return None

    @classmethod
    def validate_dependent(
        cls,
        name: str,
        relation: str,
        birth_date: Optional[str] = None,
        annual_income: int = 0,
        is_disabled: bool = False,
        is_single_parent_candidate: bool = False,
        tax_year: int = 2025,
        income_over_limit: bool = False,
    ) -> DependentValidationDetail:
        """단일 부양가족의 기본공제 및 추가공제 적격성을 판정합니다.
        
        Args:
            name: 성명
            relation: 관계 코드 (SELF, SPOUSE, PARENT, CHILD, SIBLING 등)
            birth_date: 생년월일 문자열
            annual_income: 연간 소득금액 합계 (원)
            is_disabled: 장애인 등록 여부
            is_single_parent_candidate: 한부모 후보 여부
            tax_year: 정산 귀속 연도 (기본 2025)
            
        Returns:
            DependentValidationDetail DTO
        """
        reasons: List[str] = []
        is_basic_eligible = True
        income_ok = True
        age_ok = True
        rel_upper = relation.upper()

        age = cls.calculate_age(birth_date, tax_year)

        # -------------------------------------------------------------
        # 1. 본인은 항상 기본공제 대상
        # -------------------------------------------------------------
        if rel_upper in ("SELF", "본인", "세대주"):
            return DependentValidationDetail(
                name=name,
                relation="SELF",
                age=age,
                annual_income=annual_income,
                is_basic_eligible=True,
                is_elderly=(age is not None and age >= 70),
                is_disabled=is_disabled,
                is_single_parent=False,
                disqualification_reasons=[],
                deductible_expenses=list(EXPENSE_LABELS),
            )

        # -------------------------------------------------------------
        # 2. 소득 요건 검증 (연간 소득금액 100만 원 이하, 근로소득만 있을 시 총급여 500만 원 이하)
        # -------------------------------------------------------------
        if annual_income > 1000000:
            is_basic_eligible = False
            income_ok = False
            reasons.append(
                f"연간 소득금액({annual_income:,}원)이 법정 기준인 100만 원을 초과하여 기본공제 대상에서 제외됩니다."
            )
        elif income_over_limit:
            is_basic_eligible = False
            income_ok = False
            reasons.append(
                "연간 소득금액 100만 원(근로소득만 있으면 총급여 500만 원) 초과로 입력되어 기본공제 대상에서 제외됩니다."
            )

        # -------------------------------------------------------------
        # 3. 나이 요건 검증 (장애인은 나이 요건 배제)
        # -------------------------------------------------------------
        if not is_disabled and age is not None:
            if rel_upper in ("SPOUSE", "배우자", "처", "남편"):
                # 배우자는 나이 요건 제한 없음
                pass
            elif rel_upper in ("PARENT", "부모", "직계존속", "부", "모"):
                # 직계존속은 만 60세 이상 (2025년 기준 1965.12.31 이전 출생)
                if age < 60:
                    is_basic_eligible = False
                    age_ok = False
                    reasons.append(
                        f"직계존속(만 {age}세)은 만 60세 이상 요건을 미충족합니다 (1965년 12월 31일 이전 출생자만 가능)."
                    )
            elif rel_upper in ("CHILD", "자녀", "직계비속", "자"):
                # 직계비속은 만 20세 이하 (2025년 기준 2005.01.01 이후 출생)
                if age > 20:
                    is_basic_eligible = False
                    age_ok = False
                    reasons.append(
                        f"직계비속(만 {age}세)은 만 20세 이하 요건을 초과합니다 (2005년 1월 1일 이후 출생자만 가능)."
                    )
            elif rel_upper in ("SIBLING", "형제자매", "형제", "자매"):
                # 형제자매는 만 20세 이하 또는 만 60세 이상
                if 20 < age < 60:
                    is_basic_eligible = False
                    age_ok = False
                    reasons.append(
                        f"형제자매(만 {age}세)는 만 20세 이하 또는 만 60세 이상 요건을 미충족합니다."
                    )

        # -------------------------------------------------------------
        # 4. 추가공제 판정
        # -------------------------------------------------------------
        # 1) 경로우대: 기본공제 대상자 중 만 70세 이상 (1955.12.31 이전 출생)
        is_elderly = bool(is_basic_eligible and age is not None and age >= 70)

        # 2) 한부모 공제
        is_single_parent = bool(is_single_parent_candidate and is_basic_eligible and rel_upper in ("CHILD", "자녀"))

        expenses = deductible_expenses(rel_upper, income_ok, age_ok)

        return DependentValidationDetail(
            deductible_expenses=expenses,
            expense_note="" if is_basic_eligible else expense_note(expenses),
            name=name,
            relation=rel_upper,
            age=age,
            annual_income=annual_income,
            is_basic_eligible=is_basic_eligible,
            is_elderly=is_elderly,
            is_disabled=is_disabled,
            is_single_parent=is_single_parent,
            disqualification_reasons=reasons,
        )

    @classmethod
    def validate_all(
        cls,
        dependents: List[Dict[str, Any]],
        tax_year: int = 2025,
    ) -> List[DependentValidationDetail]:
        """부양가족 전체 목록을 일괄 검증합니다."""
        results: List[DependentValidationDetail] = []
        for d in dependents:
            item = cls.validate_dependent(
                name=d.get("name", "부양가족"),
                relation=str(d.get("relation", "CHILD")),
                birth_date=d.get("birth_date"),
                annual_income=int(d.get("annual_income", d.get("annual_income_amount", 0))),
                is_disabled=bool(d.get("is_disabled", False)),
                tax_year=tax_year,
                income_over_limit=bool(d.get("income_over_limit", False)),
            )
            item.claimed = bool(d.get("is_basic_deduction", True))
            results.append(item)
        return results
