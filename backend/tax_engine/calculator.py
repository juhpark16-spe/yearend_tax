"""연말정산 세액 계산 엔진 (Tax Engine)
- TAX_RULES._v1.1.md 및 SRS_v3.0.md 준수
- 수식 연산의 완전한 결정론화 (Pure Python, LLM 계산 배제)
"""
from typing import Any, Dict
from backend.services.tax_calculation_service import TaxCalculationService


class TaxEngine:
    """2025년 귀속 대한민국 소득세법 결정론적 세액 계산기
    """

    def __init__(self, tax_year: int = 2025):
        self.tax_year = tax_year

    def calculate_earned_income_deduction(self, total_salary: int) -> int:
        """근로소득공제 계산 (한도: 2,000만 원)"""
        return TaxCalculationService.calculate_earned_income_deduction(total_salary)

    def calculate_income_tax(self, tax_base: int) -> int:
        """과세표준 8단계 기본세율 적용 산출세액 계산"""
        return TaxCalculationService.calculate_income_tax(tax_base)

    def calculate_tax(self, payload: Dict[str, Any]) -> Dict[str, int]:
        """최종 산출세액, 결정세액, 환급/추징세액 계산 (스켈레톤 및 독립 실행 지원)
        """
        total_salary = payload.get("total_salary", 0)
        prepaid_tax = payload.get("prepaid_tax", 0)

        if total_salary == 0:
            return {
                "total_salary": 0,
                "earned_income_deduction": 0,
                "taxable_income": 0,
                "calculated_tax": 0,
                "tax_credits": 0,
                "final_tax": 0,
                "prepaid_tax": prepaid_tax,
                "refund_amount": -prepaid_tax if prepaid_tax > 0 else 0
            }

        # 1. 근로소득공제
        earned_income_deduction = self.calculate_earned_income_deduction(total_salary)
        earned_income_amount = max(0, total_salary - earned_income_deduction)

        # 2. 인적공제 (본인 기본공제 150만 원)
        personal_deduction = payload.get("personal_deduction", 1500000)
        special_deduction = payload.get("special_deduction", 0)
        card_deduction = payload.get("card_deduction", 0)

        total_deductions = personal_deduction + special_deduction + card_deduction
        taxable_income = max(0, earned_income_amount - total_deductions)

        # 3. 산출세액
        calculated_tax = self.calculate_income_tax(taxable_income)

        # 4. 세액공제
        reduction_sme = payload.get("reduction_sme", 0)
        earned_income_credit = TaxCalculationService.calculate_earned_income_tax_credit(
            calculated_tax=calculated_tax,
            gross_salary=total_salary,
            reduction_sme=reduction_sme
        )
        # 보장성보험료 세액공제 (일반 100만원 한도 12% + 장애인 100만원 한도 15%)
        gen_ins = payload.get("general_insurance", payload.get("insurance", 0))
        dis_ins = payload.get("disabled_insurance", 0)
        ins_credit = min(120000, int(min(1000000, gen_ins) * 0.12)) + min(150000, int(min(1000000, dis_ins) * 0.15))

        # 의료비 세액공제
        med_credit = payload.get("medical_credit", 0)
        if med_credit == 0 and ("medical_general" in payload or "medical_special" in payload):
            med_res = TaxCalculationService.calculate_medical_tax_credit(
                gross_salary=total_salary,
                medical_general=payload.get("medical_general", 0),
                medical_special=payload.get("medical_special", 0),
                medical_premature=payload.get("medical_premature", 0),
                medical_infertility=payload.get("medical_infertility", 0),
            )
            med_credit = med_res["total_credit"]

        other_credits = payload.get("other_credits", 0) + ins_credit + med_credit
        tax_credits = min(calculated_tax, reduction_sme + earned_income_credit + other_credits)

        # 5. 결정세액 및 차감징수세액
        final_tax = max(0, calculated_tax - tax_credits)
        refund_amount = final_tax - prepaid_tax

        return {
            "total_salary": total_salary,
            "earned_income_deduction": earned_income_deduction,
            "taxable_income": taxable_income,
            "calculated_tax": calculated_tax,
            "tax_credits": tax_credits,
            "final_tax": final_tax,
            "prepaid_tax": prepaid_tax,
            "refund_amount": refund_amount
        }
