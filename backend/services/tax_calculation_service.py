"""연말정산 2025년 귀속 결정론적 세액 계산 엔진 및 감사 추적 서비스 (TaxCalculationService)
- TAX_RULES._v1.1.md 및 SRS_v3.0.md 100% 준수
- LLM 확률적 연산 배제, 100% Pure Python 기반 결정론적(Deterministic) 계산 엔진
- 과세표준 8단계 누진세율, 2025 개정 자녀/혼인/월세/신용카드/연금계좌/표준세액공제 비교선택 완비
- 단계별 감사 로그(AuditLog) 영속화 및 Zero-State 완벽 지원
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.models.audit_log import AuditLog
from backend.models.deduction import ExpenseDeduction, WorkplaceIncome
from backend.models.family_member import Dependent, RelationType
from backend.models.session import TaxSession, TaxSessionStatus
from backend.models.tax_result import TaxResult
from backend.services.audit_service import AuditService


class TaxCalculationService:
    """2025년 귀속 대한민국 소득세법 및 조세특례제한법 기준 연말정산 정밀 계산 엔진
    """

    def __init__(self, db: Session):
        self.db = db

    # =========================================================================
    # 1. 근로소득공제 (소득세법 제47조, 한도: 2,000만 원)
    # =========================================================================
    @staticmethod
    def calculate_earned_income_deduction(salary: int) -> int:
        """총급여액에 따른 5단계 법정 근로소득공제액 산출 (최대 2,000만 원 한도)"""
        s = max(0, salary)
        if s == 0:
            return 0
        if s <= 5000000:
            ded = math.floor(s * 0.7)
        elif s <= 15000000:
            ded = math.floor(3500000 + (s - 5000000) * 0.4)
        elif s <= 45000000:
            ded = math.floor(7500000 + (s - 15000000) * 0.15)
        elif s <= 100000000:
            ded = math.floor(12000000 + (s - 45000000) * 0.05)
        else:
            ded = math.floor(14750000 + (s - 100000000) * 0.02)
        return min(20000000, ded)

    # =========================================================================
    # 2. 종합소득세 기본세율 적용 산출세액 (소득세법 제55조, 2025년 8단계 누진세율)
    # =========================================================================
    @staticmethod
    def calculate_income_tax(tax_base: int) -> int:
        """과세표준 구간별 8단계 기본세율(6%~45%) 누진공제 속산표 적용"""
        tb = max(0, tax_base)
        if tb <= 0:
            return 0
        elif tb <= 14000000:
            return math.floor(tb * 0.06)
        elif tb <= 50000000:
            return math.floor(840000 + (tb - 14000000) * 0.15)
        elif tb <= 88000000:
            return math.floor(6240000 + (tb - 50000000) * 0.24)
        elif tb <= 150000000:
            return math.floor(15360000 + (tb - 88000000) * 0.35)
        elif tb <= 300000000:
            return math.floor(37060000 + (tb - 150000000) * 0.38)
        elif tb <= 500000000:
            return math.floor(94060000 + (tb - 300000000) * 0.40)
        elif tb <= 1000000000:
            return math.floor(174060000 + (tb - 500000000) * 0.42)
        else:
            return math.floor(384060000 + (tb - 1000000000) * 0.45)

    # =========================================================================
    # 3. 근로소득세액공제 (소득세법 제59조, TAX_RULES 5.2 준수)
    # =========================================================================
    @staticmethod
    def calculate_earned_income_tax_credit(
        calculated_tax: int,
        gross_salary: int,
        reduction_sme: int = 0
    ) -> int:
        """산출세액 기준 근로소득세액공제 산출 및 총급여별 한도·중기감면 감액 적용"""
        if calculated_tax <= 0 or gross_salary <= 0:
            return 0

        # 기본 산출액
        if calculated_tax <= 1300000:
            credit = calculated_tax * 0.55
        else:
            credit = 715000 + (calculated_tax - 1300000) * 0.3

        # 총급여 구간별 법정 공제 한도 산출식 (TAX_RULES 5.2)
        if gross_salary <= 33000000:
            limit = 740000
        elif gross_salary <= 70000000:
            limit = max(660000, math.floor(740000 - (gross_salary - 33000000) * 0.008))
        elif gross_salary <= 120000000:
            limit = max(500000, math.floor(660000 - (gross_salary - 70000000) * 0.5))
        else:
            limit = max(200000, math.floor(500000 - (gross_salary - 120000000) * 0.5))

        base_credit = min(math.floor(credit), limit)

        # 중소기업 취업자 소득세 감면 적용 시 감액 비율 적용: credit * (1 - 감면세액 / 산출세액)
        if reduction_sme > 0 and calculated_tax > 0:
            ratio = max(0.0, 1.0 - (reduction_sme / calculated_tax))
            base_credit = math.floor(base_credit * ratio)

        return base_credit

    # =========================================================================
    # 4. 신용카드 등 사용금액 소득공제 (조특법 제126조의2, TAX_RULES 3.1)
    # =========================================================================
    @staticmethod
    def calculate_credit_card_deduction(
        gross_salary: int,
        credit_card_general: int,
        debit_card_cash: int,
        market_transport: int,
        culture_sports: int,
    ) -> Tuple[int, Dict[str, Any]]:
        """신용카드, 체크카드, 문화체육(2025 신설), 전통시장/대중교통 소득공제 계산"""
        if gross_salary <= 0:
            return 0, {
                "threshold": 0,
                "base_deduction": 0,
                "additional_deduction": 0,
                "actual_base": 0,
                "actual_additional": 0,
                "total_deduction": 0,
            }

        # 최저사용금액: 총급여의 25%
        threshold = math.floor(gross_salary * 0.25)
        is_under_70m = gross_salary <= 70000000
        culture_eligible = culture_sports if is_under_70m else 0

        # 총 사용금액
        total_spent = credit_card_general + debit_card_cash + culture_eligible + market_transport

        # 최저사용금액(문턱) 순차 차감: 납세자에게 유리하도록 낮은 공제율 순(신용 15% -> 직불 30% -> 문화체육 30% -> 전통시장/교통 40%) 차감
        rem_threshold = threshold

        # 1) 신용카드 (15%)
        threshold_cc = min(credit_card_general, rem_threshold)
        rem_threshold -= threshold_cc
        excess_cc = credit_card_general - threshold_cc

        # 2) 직불/현금영수증 (30%)
        threshold_dc = min(debit_card_cash, rem_threshold)
        rem_threshold -= threshold_dc
        excess_dc = debit_card_cash - threshold_dc

        # 3) 도서공연/체육 (30%)
        threshold_cs = min(culture_eligible, rem_threshold)
        rem_threshold -= threshold_cs
        excess_cs = culture_eligible - threshold_cs

        # 4) 전통시장/대중교통 (40%)
        threshold_mt = min(market_transport, rem_threshold)
        rem_threshold -= threshold_mt
        excess_mt = market_transport - threshold_mt

        # 공제율 적용
        rate_amt_credit = math.floor(excess_cc * 0.15)
        rate_amt_debit = math.floor(excess_dc * 0.30)
        rate_amt_culture = math.floor(excess_cs * 0.30)
        rate_amt_mt = math.floor(excess_mt * 0.40)

        # 1. 기본공제 (신용카드 + 직불/현금영수증)
        base_target_amt = rate_amt_credit + rate_amt_debit
        base_limit = 3000000 if is_under_70m else 2500000
        actual_base = min(base_target_amt, base_limit)

        # 2. 추가공제 (도서공연/체육시설 + 전통시장/대중교통)
        additional_target_amt = rate_amt_culture + rate_amt_mt
        add_limit = 3000000 if is_under_70m else 2000000
        actual_additional = min(additional_target_amt, add_limit)

        total_card_deduction = actual_base + actual_additional

        meta = {
            "threshold": threshold,
            "total_spent": total_spent,
            "base_limit": base_limit,
            "additional_limit": add_limit,
            "actual_base": actual_base,
            "actual_additional": actual_additional,
            "general_deduction": actual_base,
            "additional_deduction": actual_additional,
            "total_deduction": total_card_deduction,
        }
        return total_card_deduction, meta

    # =========================================================================
    # 5. 자녀세액공제 산출 (소득세법 제59조의2, TAX_RULES 5.3 2025 개정안)
    # =========================================================================
    @staticmethod
    def calculate_child_tax_credit(eligible_children_count: int, birth_order_counts: Dict[int, int]) -> int:
        """기본공제 대상 자녀(8세 이상) 및 당해 연도 출산/입양 자녀 세액공제 계산
        - 1명: 25만 원 / 2명: 55만 원 / 3명 이상: 55만 원 + (2명 초과 1명당 40만 원)
        - 출산/입양: 첫째 30만 원, 둘째 50만 원, 셋째 이상 70만 원
        """
        if eligible_children_count <= 0 and not birth_order_counts:
            return 0

        # 1. 기본공제 대상 자녀 공제
        base_child_credit = 0
        if eligible_children_count == 1:
            base_child_credit = 250000
        elif eligible_children_count == 2:
            base_child_credit = 550000
        elif eligible_children_count >= 3:
            base_child_credit = 550000 + (eligible_children_count - 2) * 400000

        # 2. 출산 및 입양 추가 세액공제
        birth_credit = 0
        birth_credit += birth_order_counts.get(1, 0) * 300000  # 첫째
        birth_credit += birth_order_counts.get(2, 0) * 500000  # 둘째
        birth_credit += birth_order_counts.get(3, 0) * 700000  # 셋째 이상

        return base_child_credit + birth_credit

    # =========================================================================
    # 5-1. 연금계좌 세액공제 공제한도 (2024년~)
    #  - 연금저축계좌 600만원 (퇴직연금 합산 시 900만원) + min(ISA납입액 x 10%, 300만원)
    #  - 한도 차감순서: 퇴직연금 > 연금저축 > ISA퇴직연금 > ISA연금저축
    # =========================================================================
    @staticmethod
    def _allocate_pension_limits(paid: Dict[str, int]) -> Dict[str, Any]:
        irp = max(0, int(paid.get("irp", 0) or 0))
        saving = max(0, int(paid.get("saving", 0) or 0))
        isa_irp = max(0, int(paid.get("isa_irp", 0) or 0))
        isa_saving = max(0, int(paid.get("isa_saving", 0) or 0))

        isa_extra = min(math.floor((isa_irp + isa_saving) * 0.1), 3000000)
        saving_limit = 6000000 + isa_extra
        total_limit = 9000000 + isa_extra

        # 1. 일반 연금계좌(기본한도 900만원, 연금저축 600만원) 차감
        remain_base_total = 9000000
        remain_base_saving = 6000000

        a_irp = min(irp, remain_base_total)
        remain_base_total -= a_irp

        a_saving = min(saving, remain_base_saving, remain_base_total)
        remain_base_total -= a_saving
        remain_base_saving -= a_saving

        # 2. ISA 연금계좌 차감 (잔여 기본한도 + ISA 추가한도)
        remain_isa_total = remain_base_total + isa_extra
        remain_isa_saving = remain_base_saving + isa_extra

        a_isa_irp = min(isa_irp, remain_isa_total)
        remain_isa_total -= a_isa_irp

        a_isa_saving = min(isa_saving, remain_isa_saving, remain_isa_total)

        return {
            "applied": {"irp": a_irp, "saving": a_saving, "isa_irp": a_isa_irp, "isa_saving": a_isa_saving},
            "total": a_irp + a_saving + a_isa_irp + a_isa_saving,
            "isa_extra": isa_extra,
            "saving_limit": saving_limit,
            "total_limit": total_limit,
        }

    # =========================================================================
    # 5-2. 의료비 세액공제 (소득세법 제59조의4 제2항)
    # =========================================================================
    @staticmethod
    def calculate_medical_tax_credit(
        gross_salary: int,
        medical_general: int,
        medical_special: int,
        medical_premature: int = 0,
        medical_infertility: int = 0,
    ) -> Dict[str, Any]:
        """의료비 세액공제 계산 (소득세법 제59조의4 제2항 완벽 준수)
        - 최저사용금액(총급여 3%)을 그 밖의 공제대상자(일반의료비, 15%, 한도 700만)에서 최우선 차감
        - 잔여 문턱금액을 본인/65세이상/6세이하/장애인/특례자(15%, 한도 무제한) -> 미숙아·선천성(20%, 한도 무제한) -> 난임시술비(30%, 한도 무제한) 순으로 차감
        """
        if gross_salary <= 0:
            return {
                "threshold": 0,
                "deductible_general": 0,
                "deductible_special": 0,
                "deductible_premature": 0,
                "deductible_infertility": 0,
                "credit_general": 0,
                "credit_special": 0,
                "credit_premature": 0,
                "credit_infertility": 0,
                "total_credit": 0,
            }

        threshold = math.floor(gross_salary * 0.03)
        rem_threshold = threshold

        # 1) 일반의료비 (연 700만 원 한도, 15%)에서 최저사용금액 우선 차감
        deductible_general = 0
        if medical_general > 0:
            if medical_general >= rem_threshold:
                deductible_general = min(7000000, medical_general - rem_threshold)
                rem_threshold = 0
            else:
                deductible_general = 0
                rem_threshold -= medical_general

        # 2) 본인, 65세 이상, 6세 이하, 장애인, 건강보험산정특례자 (한도 없음, 15%)
        deductible_special = 0
        if medical_special > 0:
            if medical_special >= rem_threshold:
                deductible_special = medical_special - rem_threshold
                rem_threshold = 0
            else:
                deductible_special = 0
                rem_threshold -= medical_special

        # 3) 미숙아·선천성이상아 의료비 (한도 없음, 20%)
        deductible_premature = 0
        if medical_premature > 0:
            if medical_premature >= rem_threshold:
                deductible_premature = medical_premature - rem_threshold
                rem_threshold = 0
            else:
                deductible_premature = 0
                rem_threshold -= medical_premature

        # 4) 난임시술비 (한도 없음, 30%)
        deductible_infertility = 0
        if medical_infertility > 0:
            deductible_infertility = max(0, medical_infertility - rem_threshold)
            rem_threshold = 0

        credit_general = math.floor(deductible_general * 0.15)
        credit_special = math.floor(deductible_special * 0.15)
        credit_premature = math.floor(deductible_premature * 0.20)
        credit_infertility = math.floor(deductible_infertility * 0.30)

        total_credit = credit_general + credit_special + credit_premature + credit_infertility

        return {
            "threshold": threshold,
            "deductible_general": deductible_general,
            "deductible_special": deductible_special,
            "deductible_premature": deductible_premature,
            "deductible_infertility": deductible_infertility,
            "credit_general": credit_general,
            "credit_special": credit_special,
            "credit_premature": credit_premature,
            "credit_infertility": credit_infertility,
            "total_credit": total_credit,
        }

    # =========================================================================
    # 6. 세액 계산 및 감사 추적 메인 파이프라인
    # =========================================================================
    def calculate_and_save(
        self,
        session_id: str,
        override_salary: Optional[int] = None,
        override_deductions: Optional[Dict[str, Any]] = None,
    ) -> Tuple[TaxResult, List[AuditLog]]:
        """세션의 모든 입력값 및 서류 파싱 결과를 바탕으로 2025 세법에 따라 정밀 세액을 계산하고 영속화합니다.
        """
        sess_uuid = uuid.UUID(session_id)
        session = self.db.query(TaxSession).filter(TaxSession.id == sess_uuid).first()
        if not session:
            raise ValueError(f"세션을 찾을 수 없습니다: {session_id}")

        audit_steps: List[Dict[str, Any]] = []

        # ---------------------------------------------------------------------
        # STEP 1. 총급여/소득 및 기납부세액 집계 (Step 1)
        # ---------------------------------------------------------------------
        total_salary = 0
        total_prepaid_tax = 0

        workplaces = self.db.query(WorkplaceIncome).filter(WorkplaceIncome.session_id == sess_uuid).all()
        workplaces_snapshot = []
        if workplaces:
            for wp in workplaces:
                total_salary += wp.gross_salary
                total_prepaid_tax += wp.prepaid_income_tax
                workplaces_snapshot.append({
                    "workplace_name": getattr(wp, "company_name", None) or getattr(wp, "workplace_name", "근무지"),
                    "gross_salary": wp.gross_salary,
                    "prepaid_tax": wp.prepaid_income_tax,
                })
        else:
            total_salary = override_salary if override_salary is not None else 0
            total_prepaid_tax = 0

        if override_salary is not None:
            total_salary = override_salary

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 1,
            "step_name": "총급여/소득 집계",
            "calculation_type": "GROSS_SALARY",
            "input_snapshot": {
                "workplaces": workplaces_snapshot,
                "override_salary": override_salary,
                "workplace_count": len(workplaces),
            },
            "base_value": total_salary,
            "calculated_amount": total_salary,
            "output_snapshot": {
                "total_gross_salary": total_salary,
                "total_prepaid_tax": total_prepaid_tax,
            },
            "legal_formula": "총급여액 = 주(현)근무지 과세총급여 + 종(전)근무지 과세총급여 (비과세 제외)",
            "legal_basis": "소득세법 제14조(과세표준의 계산), 제20조(근로소득)",
            "explanation": (
                f"2025년 총급여액은 {total_salary:,}원입니다."
                if total_salary > 0
                else "등록된 근로소득(총급여)이 없어 0원으로 산정되었습니다."
            ),
            "metadata_json": {"workplace_count": len(workplaces), "total_prepaid_tax": total_prepaid_tax},
        })

        # ---------------------------------------------------------------------
        # STEP 2. 근로소득금액 (Step 2)
        # ---------------------------------------------------------------------
        earned_income_deduction = self.calculate_earned_income_deduction(total_salary)
        earned_income_amount = max(0, total_salary - earned_income_deduction)

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 2,
            "step_name": "근로소득공제 및 근로소득금액",
            "calculation_type": "EARNED_INCOME",
            "input_snapshot": {"gross_salary": total_salary},
            "base_value": total_salary,
            "calculated_amount": earned_income_amount,
            "output_snapshot": {
                "earned_income_deduction": earned_income_deduction,
                "earned_income_amount": earned_income_amount,
            },
            "legal_formula": "근로소득금액 = 총급여액 - 소득세법 제47조 근로소득공제 속산표 적용 (한도 2,000만 원)",
            "legal_basis": "소득세법 제47조(근로소득공제)",
            "explanation": (
                f"총급여 {total_salary:,}원에서 법정 근로소득공제 {earned_income_deduction:,}원을 차감하여 근로소득금액은 {earned_income_amount:,}원입니다."
                if total_salary > 0
                else "총급여가 0원이므로 근로소득공제 및 근로소득금액이 0원입니다."
            ),
            "metadata_json": {
                "earned_income_deduction": earned_income_deduction,
                "earned_income_amount": earned_income_amount,
            },
        })

        # ---------------------------------------------------------------------
        # 소득공제 세부 계산 (인적, 연금, 특별, 기타)
        # ---------------------------------------------------------------------
        dependents = self.db.query(Dependent).filter(Dependent.session_id == sess_uuid).all()

        self_deduction = 1500000 if total_salary > 0 else 0
        spouse_deduction = 0
        dependents_deduction = 0
        elderly_deduction = 0
        disabled_deduction = 0
        single_parent_deduction = 0
        children_eligible_count = 0
        birth_order_counts: Dict[int, int] = {}

        if total_salary > 0:
            for dep in dependents:
                if dep.annual_income_amount > 1000000:
                    continue

                if dep.relation == RelationType.SPOUSE:
                    spouse_deduction += 1500000
                elif dep.relation != RelationType.SELF:
                    dependents_deduction += 1500000
                    if dep.relation == RelationType.CHILD:
                        children_eligible_count += 1

                if dep.is_elderly:
                    elderly_deduction += 1000000
                if dep.is_disabled:
                    disabled_deduction += 2000000
                if dep.birth_order and dep.birth_order in (1, 2, 3):
                    birth_order_counts[dep.birth_order] = birth_order_counts.get(dep.birth_order, 0) + 1

        total_personal_deduction = (
            self_deduction +
            spouse_deduction +
            dependents_deduction +
            elderly_deduction +
            disabled_deduction +
            single_parent_deduction
        )

        exp = self.db.query(ExpenseDeduction).filter(ExpenseDeduction.session_id == sess_uuid).first()

        # 1) 연금보험료 공제
        national_pension = exp.national_pension if exp and exp.national_pension > 0 else 0
        total_pension_deduction = national_pension

        # 2) 특별소득공제
        health_ins = exp.health_insurance if exp and exp.health_insurance > 0 else 0
        emp_ins = exp.employment_insurance if exp and exp.employment_insurance > 0 else 0
        housing_rent_loan = exp.housing_rent_loan if exp else 0
        housing_rent_ded = math.floor(housing_rent_loan * 0.40)
        housing_sub = min(3000000, exp.housing_subscription) if exp else 0
        housing_sub_ded = math.floor(housing_sub * 0.40)
        combined_housing_saving = min(4000000, housing_rent_ded + housing_sub_ded)
        mortgage_interest = exp.mortgage_interest if exp else 0
        mortgage_ded = min(20000000, mortgage_interest)
        total_special_income_deduction = health_ins + emp_ins + combined_housing_saving + mortgage_ded

        # 3) 그 밖의 소득공제 (신용카드 등)
        cc_gen = exp.credit_card_general if exp else 0
        dc_cash = exp.debit_card_cash if exp else 0
        mt_trans = exp.market_transport if exp else 0
        cs_sport = exp.culture_sports if exp else 0

        card_deduction, card_meta = self.calculate_credit_card_deduction(
            gross_salary=total_salary,
            credit_card_general=cc_gen,
            debit_card_cash=dc_cash,
            market_transport=mt_trans,
            culture_sports=cs_sport,
        )
        total_other_income_deduction = card_deduction

        # 4) 종합한도 초과액
        target_limit_sum = combined_housing_saving + mortgage_ded + total_other_income_deduction
        income_deduction_limit_excess = max(0, target_limit_sum - 25000000)

        total_income_deductions = (
            total_personal_deduction +
            total_pension_deduction +
            total_special_income_deduction +
            total_other_income_deduction -
            income_deduction_limit_excess
        )

        # ---------------------------------------------------------------------
        # STEP 3. 과세표준 (Step 3)
        # ---------------------------------------------------------------------
        taxable_standard = max(0, earned_income_amount - total_income_deductions)

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 3,
            "step_name": "과세표준",
            "calculation_type": "TAXABLE_STANDARD",
            "input_snapshot": {
                "earned_income_amount": earned_income_amount,
                "personal_deduction": total_personal_deduction,
                "pension_deduction": total_pension_deduction,
                "special_income_deduction": total_special_income_deduction,
                "other_income_deduction": total_other_income_deduction,
                "income_deduction_limit_excess": income_deduction_limit_excess,
                "total_deductions": total_income_deductions,
            },
            "base_value": earned_income_amount,
            "calculated_amount": taxable_standard,
            "output_snapshot": {
                "taxable_standard": taxable_standard,
                "total_income_deductions": total_income_deductions,
            },
            "legal_formula": "과세표준 = max(0, 근로소득금액 - 종합소득공제합계 + 종합한도초과액)",
            "legal_basis": "소득세법 제48조~제52조, 조세특례제한법 제126조의2, 제132조의2",
            "explanation": (
                f"근로소득금액 {earned_income_amount:,}원에서 소득공제 합계 {total_income_deductions:,}원을 공제하여 과세표준 {taxable_standard:,}원이 산출되었습니다."
                if earned_income_amount > 0
                else "소득금액이 0원이므로 과세표준은 0원입니다."
            ),
            "metadata_json": {
                "earned_income_amount": earned_income_amount,
                "total_deductions": total_income_deductions,
                "personal_deduction": total_personal_deduction,
                "pension_deduction": total_pension_deduction,
                "special_income_deduction": total_special_income_deduction,
                "card_deduction": card_deduction,
                "taxable_standard": taxable_standard,
            },
        })

        # ---------------------------------------------------------------------
        # STEP 4. 산출세액 (Step 4)
        # ---------------------------------------------------------------------
        calculated_tax = self.calculate_income_tax(taxable_standard)

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 4,
            "step_name": "산출세액",
            "calculation_type": "CALCULATED_TAX",
            "input_snapshot": {"taxable_standard": taxable_standard},
            "base_value": taxable_standard,
            "calculated_amount": calculated_tax,
            "output_snapshot": {
                "taxable_standard": taxable_standard,
                "calculated_tax": calculated_tax,
            },
            "legal_formula": "산출세액 = 과세표준 × 2025년 8단계 누진세율(6%~45%) - 누진공제액",
            "legal_basis": "소득세법 제55조(세율)",
            "explanation": (
                f"과세표준 {taxable_standard:,}원에 대해 법정 기본세율을 적용하여 산출세액 {calculated_tax:,}원이 산출되었습니다."
                if taxable_standard > 0
                else "과세표준이 0원이므로 산출세액은 0원입니다."
            ),
            "metadata_json": {
                "taxable_standard": taxable_standard,
                "calculated_tax": calculated_tax,
            },
        })

        # ---------------------------------------------------------------------
        # STEP 5. 세액공제/감면 (Step 5 개별 항목 기록 및 종합)
        # ---------------------------------------------------------------------
        # 1) 중소기업 취업자 감면
        tax_reduction_sme = 0
        if session.is_sme_youth and calculated_tax > 0:
            tax_reduction_sme = min(2000000, math.floor(calculated_tax * 0.90))

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "중소기업 취업자 소득세 감면",
            "calculation_type": "TAX_REDUCTION_SME",
            "input_snapshot": {
                "is_sme_youth": session.is_sme_youth,
                "calculated_tax": calculated_tax,
            },
            "base_value": calculated_tax,
            "calculated_amount": tax_reduction_sme,
            "output_snapshot": {"tax_reduction_sme": tax_reduction_sme},
            "legal_formula": "감면세액 = min(2,000,000, 산출세액 × 90%)",
            "legal_basis": "조세특례제한법 제30조(중소기업 취업자에 대한 소득세 감면)",
            "explanation": (
                f"중소기업 취업 청년 90% 감면 규정(한도 200만 원)에 따라 {tax_reduction_sme:,}원이 감면되었습니다."
                if tax_reduction_sme > 0
                else "해당 없음: 중소기업 취업 청년 감면 대상이 아니거나 산출세액이 0원입니다."
            ),
            "metadata_json": {"is_sme_youth": session.is_sme_youth, "reduction_amount": tax_reduction_sme},
        })

        # 2) 근로소득세액공제
        tax_credit_earned_income = self.calculate_earned_income_tax_credit(
            calculated_tax=calculated_tax,
            gross_salary=total_salary,
            reduction_sme=tax_reduction_sme,
        )

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "근로소득 세액공제",
            "calculation_type": "TAX_CREDIT_EARNED_INCOME",
            "input_snapshot": {
                "calculated_tax": calculated_tax,
                "gross_salary": total_salary,
                "reduction_sme": tax_reduction_sme,
            },
            "base_value": calculated_tax,
            "calculated_amount": tax_credit_earned_income,
            "output_snapshot": {"tax_credit_earned_income": tax_credit_earned_income},
            "legal_formula": "산출세액 130만 이하 55%, 초과분 30% (총급여별 한도 20만~74만 원, 감면비율 차감)",
            "legal_basis": "소득세법 제59조(근로소득세액공제)",
            "explanation": (
                f"산출세액에 대해 법정 근로소득 세액공제 {tax_credit_earned_income:,}원이 적용되었습니다."
                if tax_credit_earned_income > 0
                else "해당 없음: 산출세액이 없거나 근로소득 세액공제 금액이 0원입니다."
            ),
            "metadata_json": {"tax_credit_earned_income": tax_credit_earned_income},
        })

        # 3) 자녀세액공제
        tax_credit_child = self.calculate_child_tax_credit(children_eligible_count, birth_order_counts)

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "자녀 세액공제",
            "calculation_type": "TAX_CREDIT_CHILD",
            "input_snapshot": {
                "eligible_children_count": children_eligible_count,
                "birth_order_counts": birth_order_counts,
            },
            "base_value": children_eligible_count,
            "calculated_amount": tax_credit_child,
            "output_snapshot": {
                "tax_credit_child": tax_credit_child,
                "children_eligible_count": children_eligible_count,
            },
            "legal_formula": "1명 25만 / 2명 55만 / 3명 이상 55만 + (N-2)×40만 + 출산·입양 추가공제(첫째 30만/둘째 50만/셋째 70만)",
            "legal_basis": "소득세법 제59조의2(자녀세액공제)",
            "explanation": (
                f"2025 개정 자녀세액공제 규정에 따라 기본공제 대상 자녀 {children_eligible_count}명 및 출산입양 세액공제로 {tax_credit_child:,}원이 적용되었습니다."
                if tax_credit_child > 0
                else "해당 없음: 기본공제 대상 자녀(8세 이상) 또는 당해연도 출산·입양 자녀가 없습니다 (0원)."
            ),
            "metadata_json": {
                "children_eligible_count": children_eligible_count,
                "birth_order_counts": birth_order_counts,
                "tax_credit_child": tax_credit_child,
            },
        })

        # 4) 신혼부부 혼인세액공제
        tax_credit_marriage = 500000 if (session.is_newly_married and total_salary > 0) else 0

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "신혼부부 혼인 세액공제",
            "calculation_type": "TAX_CREDIT_MARRIAGE",
            "input_snapshot": {
                "is_newly_married": session.is_newly_married,
                "gross_salary": total_salary,
            },
            "base_value": 500000 if session.is_newly_married else 0,
            "calculated_amount": tax_credit_marriage,
            "output_snapshot": {"tax_credit_marriage": tax_credit_marriage},
            "legal_formula": "혼인신고 당해연도 1회 50만 원 한시 공제",
            "legal_basis": "조세특례제한법 제98조의3(혼인세액공제)",
            "explanation": (
                f"신혼부부 혼인 세액공제 500,000원이 적용되었습니다."
                if tax_credit_marriage > 0
                else "해당 없음: 신혼부부 혼인세액공제 대상이 아니거나 미신청 상태입니다 (0원)."
            ),
            "metadata_json": {"is_newly_married": session.is_newly_married, "tax_credit_marriage": tax_credit_marriage},
        })

        # 6) 특별세액공제 및 표준세액공제 비교선택
        # 보장성보험료 세액공제 (소득세법 제59조의4 제1항):
        # - 일반보장성보험: 연 100만 원 한도 12% 공제율 (최대 12만 원)
        # - 장애인전용보장성보험: 연 100만 원 한도 15% 공제율 (최대 15만 원)
        raw_details_ins = (exp.raw_details if exp and exp.raw_details else {}) or {}
        gen_ins_paid = int(raw_details_ins.get("general_insurance", 0) or raw_details_ins.get("insurance_general", 0) or 0)
        dis_ins_paid = int(raw_details_ins.get("disabled_insurance", 0) or raw_details_ins.get("insurance_disabled", 0) or 0)

        # 단일 합계만 있거나 raw_details가 비어있는 경우 호환 처리
        if gen_ins_paid == 0 and dis_ins_paid == 0:
            single_ins = int(raw_details_ins.get("insurance_guaranteed", 0) or raw_details_ins.get("insurance", 0) or 0)
            if single_ins > 0:
                gen_ins_paid = single_ins

        gen_ins_credit = min(120000, math.floor(min(1000000, gen_ins_paid) * 0.12)) if total_salary > 0 else 0
        dis_ins_credit = min(150000, math.floor(min(1000000, dis_ins_paid) * 0.15)) if total_salary > 0 else 0
        ins_credit = gen_ins_credit + dis_ins_credit

        raw_details_exp = (exp.raw_details if exp and exp.raw_details else {}) or {}
        med_gen = int(raw_details_exp.get("medical_general", exp.medical_general if exp else 0) or 0)
        med_spec = int(raw_details_exp.get("medical_special", exp.medical_special if exp else 0) or 0)
        med_self = int(raw_details_exp.get("medical_self", 0) or 0)
        med_premature = int(raw_details_exp.get("medical_premature", 0) or 0)
        med_infertility = int(raw_details_exp.get("medical_infertility", 0) or 0)
        med_spec_combined = med_spec + med_self

        med_calc = self.calculate_medical_tax_credit(
            gross_salary=total_salary,
            medical_general=med_gen,
            medical_special=med_spec_combined,
            medical_premature=med_premature,
            medical_infertility=med_infertility,
        )
        med_credit = med_calc["total_credit"]

        edu_spent = exp.education_child if exp else 0
        edu_credit = min(450000, math.floor(edu_spent * 0.15)) if total_salary > 0 else 0

        donation_spent = (exp.raw_details.get("donation_amount", 0) if exp and exp.raw_details else 0)
        don_credit = math.floor(min(10000000, donation_spent) * 0.15 + max(0, donation_spent - 10000000) * 0.30)

        tax_credit_special = ins_credit + med_credit + edu_credit + don_credit

        tax_credit_monthly_rent = 0
        if exp and exp.monthly_rent_paid > 0 and total_salary <= 80000000 and total_salary > 0 and mortgage_ded == 0:
            rent_paid = min(10000000, exp.monthly_rent_paid)
            rent_rate = 0.17 if total_salary <= 55000000 else 0.15
            tax_credit_monthly_rent = math.floor(rent_paid * rent_rate)

        special_pack_benefit = (
            math.floor((health_ins + emp_ins + combined_housing_saving + mortgage_ded) * 0.15) +
            tax_credit_special +
            tax_credit_monthly_rent
        )
        standard_tax_credit = 0
        if total_salary > 0 and special_pack_benefit < 130000:
            standard_tax_credit = 130000

        if standard_tax_credit > 0:
            tax_credit_special = 0
            tax_credit_monthly_rent = 0

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "특별세액공제 및 표준세액공제 비교",
            "calculation_type": "TAX_CREDIT_SPECIAL_OR_STANDARD",
            "input_snapshot": {
                "gen_ins_paid": gen_ins_paid,
                "dis_ins_paid": dis_ins_paid,
                "gen_ins_credit": gen_ins_credit,
                "dis_ins_credit": dis_ins_credit,
                "ins_credit": ins_credit,
                "med_credit": med_credit,
                "edu_credit": edu_credit,
                "don_credit": don_credit,
                "tax_credit_special": tax_credit_special,
                "standard_tax_credit": standard_tax_credit,
            },
            "base_value": 130000 if standard_tax_credit > 0 else tax_credit_special,
            "calculated_amount": standard_tax_credit if standard_tax_credit > 0 else tax_credit_special,
            "output_snapshot": {
                "applied_mode": "STANDARD" if standard_tax_credit > 0 else "SPECIAL",
                "special_credit": tax_credit_special,
                "standard_credit": standard_tax_credit,
            },
            "legal_formula": "특별세액공제(일반보험12%+장애인보험15%+의료비15%+교육비15%+기부금) vs 표준세액공제 13만 원 중 유리한 항목 선택",
            "legal_basis": "소득세법 제59조의4(특별세액공제 및 표준세액공제)",
            "explanation": (
                "표준세액공제(130,000원)가 특별세액공제 혜택보다 커 표준세액공제가 자동 적용되었습니다."
                if standard_tax_credit > 0
                else (
                    f"특별세액공제 합계 {tax_credit_special:,}원(일반보험 {gen_ins_credit:,}원, 장애인보험 {dis_ins_credit:,}원 포함)이 적용되었습니다."
                    if tax_credit_special > 0
                    else "해당 없음: 특별세액공제 대상 지출이 없습니다 (0원)."
                )
            ),
            "metadata_json": {
                "standard_tax_credit": standard_tax_credit,
                "tax_credit_special": tax_credit_special,
                "gen_ins_credit": gen_ins_credit,
                "dis_ins_credit": dis_ins_credit,
                "ins_credit": ins_credit,
            },
        })

        # 7) 월세액 세액공제
        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "월세액 세액공제",
            "calculation_type": "TAX_CREDIT_MONTHLY_RENT",
            "input_snapshot": {
                "monthly_rent_paid": exp.monthly_rent_paid if exp else 0,
                "gross_salary": total_salary,
                "is_standard_credit_applied": standard_tax_credit > 0,
            },
            "base_value": exp.monthly_rent_paid if exp else 0,
            "calculated_amount": tax_credit_monthly_rent,
            "output_snapshot": {"tax_credit_monthly_rent": tax_credit_monthly_rent},
            "legal_formula": "월세 지급액(연 1,000만 원 한도) × 15%(총급여 5.5천만 이하 17%)",
            "legal_basis": "조세특례제한법 제95조의2(월세액에 대한 세액공제)",
            "explanation": (
                f"무주택 근로자 월세 납입액에 대해 세액공제 {tax_credit_monthly_rent:,}원이 적용되었습니다."
                if tax_credit_monthly_rent > 0
                else "해당 없음: 월세 납입 증빙이 없거나 표준세액공제 선택 등으로 미적용되었습니다 (0원)."
            ),
            "metadata_json": {"tax_credit_monthly_rent": tax_credit_monthly_rent},
        })

        # 8) 연금계좌세액공제 (세액감면·공제 적용순서상 후순위로 공제)
        #   - 공제한도: 연금저축 600만 (퇴직연금 합산 900만) + min(ISA납입액 x 10%, 300만)
        #   - 한도 차감순서: 퇴직연금 > 연금저축 > ISA퇴직연금 > ISA연금저축
        #   - 공제율: 총급여 5,500만원 이하 15%, 초과 12%
        raw_details = (exp.raw_details if exp and exp.raw_details else {}) or {}
        pension_paid = {
            "irp": (exp.irp_saving if exp else 0) or 0,
            "saving": (exp.personal_pension_saving if exp else 0) or 0,
            "isa_irp": int(raw_details.get("isa_irp_saving", 0) or 0),
            "isa_saving": int(raw_details.get("isa_pension_saving", 0) or 0),
        }
        pension_alloc = self._allocate_pension_limits(pension_paid)
        pension_saving = pension_alloc["applied"]["saving"] + pension_alloc["applied"]["isa_saving"]
        irp_saving = pension_alloc["applied"]["irp"] + pension_alloc["applied"]["isa_irp"]
        pension_account_total = pension_alloc["total"]
        pension_rate = 0.15 if total_salary <= 55000000 else 0.12
        tax_credit_pension_account_before_cap = math.floor(pension_account_total * pension_rate)

        # 앞선 감면·공제를 차감하고 남은 산출세액 범위 안에서만 연금계좌세액공제 적용
        credits_before_pension = (
            tax_credit_marriage +
            tax_credit_child +
            tax_credit_special +
            tax_credit_monthly_rent +
            standard_tax_credit
        )
        available_tax_after_reduction = max(0, calculated_tax - tax_reduction_sme)
        remaining_before_pension = max(
            0,
            available_tax_after_reduction - min(available_tax_after_reduction, tax_credit_earned_income + credits_before_pension),
        )
        tax_credit_pension_account = min(tax_credit_pension_account_before_cap, remaining_before_pension)

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "연금계좌 세액공제",
            "calculation_type": "TAX_CREDIT_PENSION",
            "input_snapshot": {
                "pension_paid": pension_paid,
                "pension_saving": pension_saving,
                "irp_saving": irp_saving,
                "pension_account_total": pension_account_total,
                "pension_rate": pension_rate,
                "isa_extra_limit": pension_alloc["isa_extra"],
                "saving_limit": pension_alloc["saving_limit"],
                "total_limit": pension_alloc["total_limit"],
            },
            "base_value": pension_account_total,
            "calculated_amount": tax_credit_pension_account,
            "output_snapshot": {"tax_credit_pension_account": tax_credit_pension_account},
            "legal_formula": (
                "연금저축계좌 600만(퇴직연금 합산 900만) + min(ISA납입액×10%, 300만) 한도 내 납입액 × 15%(총급여 5,500만 초과 12%), "
                "한도 차감순서: 퇴직연금 > 연금저축 > ISA퇴직연금 > ISA연금저축, 세액감면·공제 적용순서상 후순위 공제"
            ),
            "legal_basis": "소득세법 제59조의3(연금계좌세액공제)",
            "explanation": (
                f"연금계좌 공제대상 납입액 {pension_account_total:,}원(연금저축 {pension_saving:,}원 + 퇴직연금 {irp_saving:,}원, ISA 추가한도 {pension_alloc['isa_extra']:,}원)에 "
                f"{int(pension_rate*100)}% 공제율이 적용되어 {tax_credit_pension_account:,}원이 후순위로 공제되었습니다."
                if tax_credit_pension_account > 0
                else "해당 없음: 연금저축 및 IRP 납입 내역이 없거나 앞선 공제로 남은 산출세액이 없습니다 (0원)."
            ),
            "metadata_json": {
                "pension_account_total": pension_account_total,
                "tax_credit_pension_account_before_cap": tax_credit_pension_account_before_cap,
                "tax_credit_pension_account": tax_credit_pension_account,
            },
        })

        # 세액감면·공제 적용순서: 세액감면 → 근로소득 → 결혼 → 자녀 → 보장성보험 → 의료비 → 교육비 → 기부(정치·고향)
        #   → (표준) → 납세조합 → 주택차입금 → 월세 → 특례·우리사주·일반기부 → 외국납부 → 연금계좌(후순위)

        raw_tax_credits = (
            tax_credit_earned_income +
            tax_credit_child +
            tax_credit_marriage +
            tax_credit_pension_account +
            tax_credit_special +
            tax_credit_monthly_rent +
            standard_tax_credit
        )

        final_tax_credits = min(available_tax_after_reduction, raw_tax_credits)

        # ---------------------------------------------------------------------
        # STEP 6. 결정세액 확정 (Step 6)
        # ---------------------------------------------------------------------
        final_decision_tax = max(0, available_tax_after_reduction - final_tax_credits)
        final_refund_amount = final_decision_tax - total_prepaid_tax

        if total_salary == 0:
            calculated_tax = 0
            tax_reduction_sme = 0
            tax_credit_earned_income = 0
            final_decision_tax = 0
            final_refund_amount = 0
            total_prepaid_tax = 0
            final_tax_credits = 0

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 6,
            "step_name": "결정세액 확정",
            "calculation_type": "DECISION_TAX",
            "input_snapshot": {
                "calculated_tax": calculated_tax,
                "tax_reduction_sme": tax_reduction_sme,
                "final_tax_credits": final_tax_credits,
            },
            "base_value": calculated_tax,
            "calculated_amount": final_decision_tax,
            "output_snapshot": {
                "final_decision_tax": final_decision_tax,
                "tax_reduction_sme": tax_reduction_sme,
                "final_tax_credits": final_tax_credits,
            },
            "legal_formula": "결정세액 = max(0, 산출세액 - 세액감면 - 세액공제)",
            "legal_basis": "소득세법 제137조(근로소득세액에 대한 연말정산)",
            "explanation": (
                f"산출세액 {calculated_tax:,}원에서 세액감면({tax_reduction_sme:,}원) 및 세액공제({final_tax_credits:,}원)를 차감한 최종 결정세액은 {final_decision_tax:,}원입니다."
                if final_decision_tax > 0
                else "산출세액이 전액 공제/감면되어 최종 결정세액은 0원입니다."
            ),
            "metadata_json": {
                "calculated_tax": calculated_tax,
                "tax_reduction_sme": tax_reduction_sme,
                "final_tax_credits": final_tax_credits,
                "final_decision_tax": final_decision_tax,
            },
        })

        # ---------------------------------------------------------------------
        # STEP 7. 기납부세액 및 최종 차감징수(환급/납부)세액 (Step 7)
        # ---------------------------------------------------------------------
        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 7,
            "step_name": "기납부세액 및 최종 환급/추가납부세액",
            "calculation_type": "FINAL_REFUND",
            "input_snapshot": {
                "final_decision_tax": final_decision_tax,
                "total_prepaid_tax": total_prepaid_tax,
            },
            "base_value": total_prepaid_tax,
            "calculated_amount": final_refund_amount,
            "output_snapshot": {
                "final_decision_tax": final_decision_tax,
                "total_prepaid_tax": total_prepaid_tax,
                "final_refund_amount": final_refund_amount,
                "is_refund": final_refund_amount <= 0,
            },
            "legal_formula": "차감징수세액 = 결정세액 - 기납부세액 (음수: 환급, 양수: 추가납부)",
            "legal_basis": "소득세법 제137조(연말정산 차감징수)",
            "explanation": (
                f"기납부세액({total_prepaid_tax:,}원)이 결정세액({final_decision_tax:,}원)보다 많아 {abs(final_refund_amount):,}원을 환급받습니다."
                if final_refund_amount <= 0
                else f"결정세액({final_decision_tax:,}원)이 기납부세액({total_prepaid_tax:,}원)보다 많아 {final_refund_amount:,}원을 추가 납부해야 합니다."
            ),
            "metadata_json": {
                "final_decision_tax": final_decision_tax,
                "total_prepaid_tax": total_prepaid_tax,
                "final_refund_amount": final_refund_amount,
                "is_refund": final_refund_amount <= 0,
            },
        })

        # ---------------------------------------------------------------------
        # STEP 8. DB 저장 및 영속화 (TaxResult & AuditLogs - 단일 트랜잭션)
        # ---------------------------------------------------------------------
        tax_result = self.db.query(TaxResult).filter(TaxResult.session_id == sess_uuid).first()
        if not tax_result:
            tax_result = TaxResult(session_id=sess_uuid)
            self.db.add(tax_result)

        tax_result.total_gross_salary = total_salary
        tax_result.earned_income_deduction = earned_income_deduction
        tax_result.earned_income_amount = earned_income_amount
        tax_result.total_personal_deduction = total_personal_deduction
        tax_result.total_pension_deduction = total_pension_deduction
        tax_result.total_special_income_deduction = total_special_income_deduction
        tax_result.total_other_income_deduction = total_other_income_deduction
        tax_result.income_deduction_limit_excess = income_deduction_limit_excess
        tax_result.taxable_standard = taxable_standard
        tax_result.calculated_tax = calculated_tax
        tax_result.tax_reduction_sme = tax_reduction_sme
        tax_result.tax_credit_earned_income = tax_credit_earned_income
        tax_result.tax_credit_child = tax_credit_child
        tax_result.tax_credit_marriage = tax_credit_marriage
        tax_result.tax_credit_pension_account = tax_credit_pension_account
        tax_result.tax_credit_special = tax_credit_special
        tax_result.tax_credit_monthly_rent = tax_credit_monthly_rent
        tax_result.standard_tax_credit = standard_tax_credit
        tax_result.final_decision_tax = final_decision_tax
        tax_result.total_prepaid_tax = total_prepaid_tax
        tax_result.final_refund_amount = final_refund_amount
        tax_result.calculated_at = datetime.now(timezone.utc)

        self.db.flush()

        # AuditService를 통해 원자적 기록 및 중복 제거
        audit_service = AuditService(self.db)
        created_logs = audit_service.record_audit_logs(
            tax_result_id=tax_result.id,
            steps_data=audit_steps,
            replace=True,
        )

        # 세션 상태 갱신 (CALCULATED)
        session.status = TaxSessionStatus.CALCULATED
        session.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(tax_result)

        return tax_result, created_logs
