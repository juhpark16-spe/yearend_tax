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

from sqlalchemy.exc import IntegrityError
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

        # 최저사용금액: 총급여의 25% (원 미만 버림)
        threshold = math.floor(gross_salary * 0.25)
        is_under_70m = gross_salary <= 70000000
        culture_eligible = culture_sports if is_under_70m else 0

        # 공제율 적용 금액 (국세청 서식: 사용액 × 공제율, 원 미만 버림)
        rate_amt_credit = math.floor(credit_card_general * 0.15)
        rate_amt_debit = math.floor(debit_card_cash * 0.30)
        rate_amt_culture = math.floor(culture_eligible * 0.30)
        rate_amt_mt = math.floor(market_transport * 0.40)
        total_rate_amt = rate_amt_credit + rate_amt_debit + rate_amt_culture + rate_amt_mt

        # 공제제외금액: 최저사용금액을 공제율이 낮은 것부터(신용 15% → 직불·현금·문화 30% → 전통시장·대중교통 40%) 채운다
        amt15 = credit_card_general
        amt30 = debit_card_cash + culture_eligible
        total_spent = amt15 + amt30 + market_transport
        if threshold <= amt15:
            excluded = math.floor(threshold * 0.15)
        elif threshold <= amt15 + amt30:
            excluded = math.floor(amt15 * 0.15 + (threshold - amt15) * 0.30)
        elif threshold <= total_spent:
            excluded = math.floor(amt15 * 0.15 + amt30 * 0.30 + (threshold - amt15 - amt30) * 0.40)
        else:
            excluded = total_rate_amt

        possible = max(0, total_rate_amt - excluded)
        # 기본 공제한도: 총급여 7천만 이하 300만, 초과 250만
        base_limit = 3000000 if is_under_70m else 2500000
        actual_base = min(possible, base_limit)
        # 추가공제: min(한도 초과액, 전통시장·대중교통·문화체육 공제율 금액, 추가한도 300만/200만) — 조특법 제126조의2
        add_limit = 3000000 if is_under_70m else 2000000
        actual_additional = min(max(0, possible - base_limit), rate_amt_culture + rate_amt_mt, add_limit)

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
    def truncate_under_10(amount: int) -> int:
        """10원 미만 버림 (0원 쪽으로): 12,345 → 12,340, -12,345 → -12,340"""
        a = int(amount)
        return (abs(a) // 10 * 10) * (1 if a >= 0 else -1)

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
    @staticmethod
    def age_in_tax_year(birth_date: Optional[str], tax_year: int = 2025) -> Optional[int]:
        """생년월일(YYYY-MM-DD, YYYYMMDD, YYMMDD) → 과세연도 기준 나이"""
        digits = "".join(ch for ch in str(birth_date or "") if ch.isdigit())
        if len(digits) >= 8:
            year = int(digits[:4])
        elif len(digits) >= 6:
            yy = int(digits[:2])
            year = 2000 + yy if yy <= tax_year % 100 else 1900 + yy
        else:
            return None
        return tax_year - year

    @staticmethod
    def calculate_education_base(details: Optional[List[Dict[str, Any]]], fallback_amount: int = 0) -> Dict[str, Any]:
        """교육비 세액공제 대상금액을 1인별·구분별 한도로 산출 (소득세법 제59조의4 ③)
        - 본인·장애인특수교육비: 한도 없음
        - 대학생: 1인당 900만 원 / 취학전아동·초중고: 1인당 300만 원
        - 교복구입비 1인당 50만 원, 현장체험학습비 1인당 30만 원 (초중고 300만 원 한도 안에 포함)
        - 대학원: 근로자 본인만 / '확인 필요'로 제외된 항목(included=False)은 제외
        """
        if not details:
            # 인별 내역이 없으면 화면(교육비 입력)에서 1인별 한도를 적용해 넘긴 공제대상 합계를 그대로 쓴다
            base = max(0, int(fallback_amount or 0))
            return {"base": base, "per_person": {}, "mode": "FALLBACK_SCREEN_TOTAL"}
        per: Dict[str, Dict[str, int]] = {}
        for d in details:
            if d.get("included") is False or d.get("needs_review"):
                continue
            amt = int(d.get("amount") or d.get("raw_amount") or 0)
            if amt <= 0:
                continue
            name = str(d.get("name") or "본인")
            cat = str(d.get("category") or "")
            b = per.setdefault(name, {"self": 0, "special": 0, "univ": 0, "school": 0, "uniform": 0, "trip": 0})
            if cat == "본인":
                b["self"] += amt
            elif cat == "장애인특수교육":
                b["special"] += amt
            elif cat == "대학생":
                b["univ"] += amt
            elif "교복" in cat:
                b["uniform"] += amt
            elif "현장학습" in cat or "체험학습" in cat:
                b["trip"] += amt
            elif cat == "대학원":
                continue
            else:
                b["school"] += amt
        per_person: Dict[str, int] = {}
        for name, b in per.items():
            school = min(3_000_000, b["school"] + min(500_000, b["uniform"]) + min(300_000, b["trip"]))
            univ = min(9_000_000, b["univ"])
            limited = min(9_000_000, school + univ) if (school and univ) else school + univ
            per_person[name] = b["self"] + b["special"] + limited
        return {"base": sum(per_person.values()), "per_person": per_person, "mode": "PER_PERSON"}

    @staticmethod
    def _rate_15_30(amount: int) -> int:
        """1천만 원 이하 15%, 초과분 30%"""
        a = max(0, int(amount))
        return math.floor(a * 0.15) if a <= 10000000 else math.floor(10000000 * 0.15 + (a - 10000000) * 0.30)

    DONATION_CARRYOVER_YEARS = 10

    @staticmethod
    def carryover_kind_of(type_str: str) -> str:
        t = str(type_str or "").replace(" ", "")
        if "특례" in t or "법정" in t:
            return "special"
        if "종교단체외" in t:
            return "general"
        if "종교" in t:
            return "religious"
        return "general"

    @classmethod
    def normalize_donation_carryover(cls, items: Optional[List[Dict[str, Any]]], tax_year: int = 2025) -> List[Dict[str, Any]]:
        """전년도 이월 기부금: 기부연도 [과세연도-10, 과세연도-1], 금액>0, 기부연도 빠른 순"""
        out = []
        for it in items or []:
            try:
                year = int(it.get("year") or 0)
                amount = int(str(it.get("amount") or 0).replace(",", "") or 0)
            except (TypeError, ValueError):
                continue
            if amount <= 0 or not (tax_year - cls.DONATION_CARRYOVER_YEARS <= year <= tax_year - 1):
                continue
            out.append({"year": year, "kind": cls.carryover_kind_of(it.get("type")), "amount": amount, "used": 0})
        return sorted(out, key=lambda e: e["year"])

    @classmethod
    def calculate_donation_credit(
        cls,
        details: Optional[List[Dict[str, Any]]],
        earned_income: int,
        fallback_amount: int = 0,
        carryover: Optional[List[Dict[str, Any]]] = None,
        tax_year: int = 2025,
    ) -> Dict[str, Any]:
        """기부금 세액공제 (소득세법 제59조의4 ④, 제61조, 조특법 제76조·제58조·제88조의4 ⑬)
        공제대상금액 한도는 앞 종류의 공제대상금액을 빼고 아래 순서로 계산한다 (화면 엔진과 동일).
        ① 정치자금(본인): 근로소득금액 100% — 10만 원 이하 100/110, 초과 15%, 3천만 초과분 25%
        ② 고향사랑(본인): (근로소득금액 − ①) 100%, 연 2,000만 원 — 10만 원 이하 100/110, 초과 15%(특별재난지역 30%)
        ③ 특례: (근로소득금액 − ① − ②) 100%
        ④ 우리사주조합(본인): (근로소득금액 − ① − ② − ③) 30%
        ⑤ 일반: 기준 = 근로소득금액 − ①~④, 종교단체 기부금이 있으면 기준×10% + min(기준×20%, 종교단체 외),
           없으면 기준×30% (종교단체 외 먼저)
        특례·우리사주·일반 공제율: 합계 1천만 원 이하 15%, 초과 30% (③→④→⑤ 순 구간 적용)
        전년도 이월 특례·일반기부금(10년)은 같은 종류의 당해연도 기부금보다 먼저, 기부연도 빠른 순으로 한도를 쓴다.
        정치자금·고향사랑·우리사주조합 기부금은 조특법 세액공제로 표준세액공제와 함께 받을 수 있다(separate).
        """
        paid = {"political": 0, "home_general": 0, "home_disaster": 0, "employee_stock": 0,
                "special": 0, "general": 0, "religious": 0}
        if details:
            for d in details:
                amt = int(d.get("amount") or 0)
                if amt <= 0:
                    continue
                t = str(d.get("type") or "")
                is_self = d.get("is_self", True) is not False
                if "정치" in t:
                    if is_self:
                        paid["political"] += amt
                elif "고향" in t:
                    if is_self:
                        paid["home_disaster" if "특별재난" in t else "home_general"] += amt
                elif "우리사주" in t:
                    if is_self:
                        paid["employee_stock"] += amt
                elif "특례" in t or "법정" in t:
                    paid["special"] += amt
                elif "종교단체일반" in t.replace(" ", "") or ("종교" in t and "종교단체외" not in t.replace(" ", "")):
                    paid["religious"] += amt
                else:
                    paid["general"] += amt
        else:
            # 종류별 내역이 없으면 종교단체 외 일반기부금으로 본다
            paid["general"] = max(0, int(fallback_amount or 0))

        entries = cls.normalize_donation_carryover(carryover, tax_year)
        carry_paid = {"special": 0, "general": 0, "religious": 0}
        for e in entries:
            carry_paid[e["kind"]] += e["amount"]

        def use_carry(kind: str, room: int) -> int:
            left, used = max(0, room), 0
            for e in entries:
                if e["kind"] != kind:
                    continue
                u = min(e["amount"], left)
                e["used"] = u
                left -= u
                used += u
            return used

        ei = max(0, int(earned_income or 0))
        # ① 정치자금
        pol = min(paid["political"], ei)
        political = (math.floor(min(pol, 100000) * 100 / 110)
                     + math.floor(min(max(0, pol - 100000), 29900000) * 0.15)
                     + math.floor(max(0, pol - 30000000) * 0.25))
        # ② 고향사랑
        home_limit = max(0, min(20000000, ei - pol))
        home_total = min(paid["home_general"] + paid["home_disaster"], home_limit)
        home_over = max(0, home_total - 100000)
        home_dis_over = min(paid["home_disaster"], home_over)
        hometown = (math.floor(min(home_total, 100000) * 100 / 110)
                    + math.floor(home_dis_over * 0.30)
                    + math.floor((home_over - home_dis_over) * 0.15))
        # ③ 특례 (이월분 먼저)
        spec_room = max(0, ei - pol - home_total)
        spec_carry = use_carry("special", spec_room)
        spec_elig = min(paid["special"], spec_room - spec_carry)
        # ④ 우리사주조합
        after_special = max(0, ei - pol - home_total - spec_carry - spec_elig)
        emp_elig = min(paid["employee_stock"], math.floor(after_special * 0.30))
        # ⑤ 일반 (종교단체 외 → 종교단체, 각각 이월분 먼저)
        gen_base = max(0, after_special - emp_elig)
        has_religious = paid["religious"] + carry_paid["religious"] > 0
        non_rel_total = paid["general"] + carry_paid["general"]
        gen_limit = (math.floor(gen_base * 0.10) + min(math.floor(gen_base * 0.20), non_rel_total)
                     if has_religious else math.floor(gen_base * 0.30))
        room = gen_limit
        gen_carry = use_carry("general", room)
        room -= gen_carry
        gen_elig = min(paid["general"], room)
        room -= gen_elig
        rel_carry = use_carry("religious", room)
        room -= rel_carry
        rel_elig = min(paid["religious"], room)

        tier = {"used": 0}

        def tier_credit(amt: int) -> int:
            low = min(amt, max(0, 10000000 - tier["used"]))
            tier["used"] += amt
            return math.floor(low * 0.15 + (amt - low) * 0.30)

        chunks = {}
        for key, amt in (("special_carry", spec_carry), ("special", spec_elig), ("employee_stock", emp_elig),
                         ("general_carry", gen_carry), ("general", gen_elig),
                         ("religious_carry", rel_carry), ("religious", rel_elig)):
            chunks[key] = {"amount": amt, "credit": tier_credit(amt)}
        employee_stock = chunks["employee_stock"]["credit"]
        special = chunks["special_carry"]["credit"] + chunks["special"]["credit"]
        general = chunks["general_carry"]["credit"] + chunks["general"]["credit"]
        religious = chunks["religious_carry"]["credit"] + chunks["religious"]["credit"]

        return {
            "paid": paid,
            "carryover_paid": carry_paid,
            "carryover_entries": entries,
            "limit_excess": {
                "special": max(0, paid["special"] - spec_elig),
                "general": max(0, paid["general"] - gen_elig),
                "religious": max(0, paid["religious"] - rel_elig),
            },
            "chunks": chunks,
            "political": political, "hometown": hometown, "employee_stock": employee_stock,
            "special": special, "general": general, "religious": religious,
            "special_pack": special + general + religious,
            "separate": political + hometown + employee_stock,
            "total": political + hometown + employee_stock + special + general + religious,
            "mode": "BY_TYPE" if details else "FALLBACK_GENERAL",
        }

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
                # 소득요건(연 소득금액 100만 원)은 부양가족에게만 적용 (본인의 장애인·경로우대 추가공제는 유지)
                if dep.relation != RelationType.SELF and dep.annual_income_amount > 1000000:
                    continue
                # 부양가족 단계에서 기본공제 '해당없음'(나이요건 미충족 등)으로 판정된 사람은 제외
                if dep.relation != RelationType.SELF and dep.is_basic_deduction is False:
                    continue

                if dep.relation == RelationType.SPOUSE:
                    spouse_deduction += 1500000
                elif dep.relation != RelationType.SELF:
                    dependents_deduction += 1500000
                    # 자녀세액공제: 기본공제 대상 자녀 중 만 8세 이상 (생년 미상이면 포함)
                    if dep.relation == RelationType.CHILD:
                        child_age = self.age_in_tax_year(dep.birth_date)
                        if child_age is None or child_age >= 8:
                            children_eligible_count += 1

                if dep.is_elderly:
                    elderly_deduction += 1000000
                if dep.is_disabled:
                    disabled_deduction += 2000000
                # 출산·입양 세액공제: 해당 과세연도 출생·입양 자녀 (첫째 1, 둘째 2, 셋째 이상 3)
                if dep.relation == RelationType.CHILD and dep.birth_order and dep.birth_order >= 1:
                    order_key = min(3, int(dep.birth_order))
                    birth_order_counts[order_key] = birth_order_counts.get(order_key, 0) + 1

        exp = self.db.query(ExpenseDeduction).filter(ExpenseDeduction.session_id == sess_uuid).first()

        # 본인 추가공제 (소득세법 제51조, 화면 엔진과 동일 기준)
        #  - 한부모: 본인 100만 원
        #  - 부녀자: 근로소득금액 3천만 원 이하 여성 근로자 본인 50만 원 (한부모와 중복 시 한부모 우선)
        self_flags = ((exp.raw_details or {}).get("self_additional") if exp else None) or {}
        woman_deduction = 0
        if total_salary > 0:
            if self_flags.get("single_parent"):
                single_parent_deduction = 1000000
            elif self_flags.get("woman") and earned_income_amount <= 30000000:
                woman_deduction = 500000

        total_personal_deduction = (
            self_deduction +
            spouse_deduction +
            dependents_deduction +
            elderly_deduction +
            disabled_deduction +
            single_parent_deduction +
            woman_deduction
        )

        # 1) 연금보험료 공제
        national_pension = exp.national_pension if exp and exp.national_pension > 0 else 0
        total_pension_deduction = national_pension

        # 2) 특별소득공제
        health_ins = exp.health_insurance if exp and exp.health_insurance > 0 else 0
        emp_ins = exp.employment_insurance if exp and exp.employment_insurance > 0 else 0
        housing_rent_loan = exp.housing_rent_loan if exp else 0
        housing_rent_ded = math.floor(housing_rent_loan * 0.40)
        # 주택청약종합저축: 총급여 7천만 원 이하 (납입 300만 원 한도 × 40%)
        housing_sub = min(3000000, exp.housing_subscription) if (exp and total_salary <= 70000000) else 0
        housing_sub_ded = math.floor(housing_sub * 0.40)
        # 주택임차차입금(특별소득공제) + 주택마련저축(조특법 제87조, 그 밖의 소득공제) 합계 연 400만 원
        combined_housing_saving = min(4000000, housing_rent_ded + housing_sub_ded)
        housing_sub_part = min(housing_sub_ded, combined_housing_saving)
        housing_rent_part = combined_housing_saving - housing_sub_part
        mortgage_interest = exp.mortgage_interest if exp else 0
        mortgage_ded = min(20000000, mortgage_interest)
        # 특별소득공제 (소득세법 제52조): 건강·고용보험료, 주택임차차입금, 장기주택저당차입금 이자
        total_special_income_deduction = health_ins + emp_ins + housing_rent_part + mortgage_ded

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
        # 그 밖의 소득공제 (조세특례제한법) — raw_details의 납입액 기준
        rd_other = (exp.raw_details if exp and exp.raw_details else {}) or {}
        # 개인연금저축 (조특법 제86조, 2000.12.31 이전 가입분): 납입액 40%, 72만 원 한도
        personal_pension_old_ded = min(720000, math.floor(int(rd_other.get("personal_pension_old_paid", 0) or 0) * 0.40))
        # 소기업·소상공인 공제부금 (조특법 제86조의3): 근로소득금액 4천만 이하 500만 / 1억 이하 300만 / 초과 200만
        small_biz_limit = 5000000 if earned_income_amount <= 40000000 else (3000000 if earned_income_amount <= 100000000 else 2000000)
        small_biz_ded = min(small_biz_limit, int(rd_other.get("small_biz_paid", 0) or 0))
        # 장기집합투자증권저축 (조특법 제91조의16): 총급여 8천만 이하, 납입액 40%, 240만 원 한도
        #   국세청 간소화 자료가 제공한 공제대상금액(가입요건 반영)이 있으면 그 값을 우선 사용
        long_invest_ded = min(
            2400000,
            int(rd_other.get("long_invest_nts_deductible", 0) or 0)
            + math.floor(int(rd_other.get("long_invest_paid", 0) or 0) * 0.40),
        ) if total_salary <= 80000000 else 0
        # 벤처투자조합 출자 등 (조특법 제16조): 출자액 10%, 300만 원 한도 (화면 엔진과 동일 기준)
        venture_fund_ded = min(3000000, math.floor(int(rd_other.get("venture_fund_paid", 0) or 0) * 0.10))
        extra_other_deductions = personal_pension_old_ded + small_biz_ded + long_invest_ded + venture_fund_ded

        total_other_income_deduction = card_deduction + extra_other_deductions + housing_sub_part
        # 소득공제 종합한도(조특법 제132조의2, 2,500만 원) 대상 중 특별소득공제가 아닌 항목 (개인연금저축은 제외)
        limit_target_other = card_deduction + small_biz_ded + long_invest_ded + venture_fund_ded + housing_sub_part

        # 4) 종합한도 초과액
        target_limit_sum = housing_rent_part + mortgage_ded + limit_target_other
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
                "single_parent_deduction": single_parent_deduction,
                "woman_deduction": woman_deduction,
                "pension_deduction": total_pension_deduction,
                "special_income_deduction": total_special_income_deduction,
                "other_income_deduction": total_other_income_deduction,
                "card_deduction": card_deduction,
                "personal_pension_old_deduction": personal_pension_old_ded,
                "small_biz_deduction": small_biz_ded,
                "long_invest_deduction": long_invest_ded,
                "venture_fund_deduction": venture_fund_ded,
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
        edu_details = (exp.raw_details.get("education_details") if exp and exp.raw_details else None) or None
        edu_calc = self.calculate_education_base(edu_details, edu_spent)
        edu_credit = math.floor(edu_calc["base"] * 0.15) if total_salary > 0 else 0

        donation_spent = (exp.raw_details.get("donation_amount", 0) if exp and exp.raw_details else 0)
        donation_details = (exp.raw_details.get("donation_details") if exp and exp.raw_details else None) or None
        donation_carryover = (exp.raw_details.get("donation_carryover") if exp and exp.raw_details else None) or None
        tax_year = int(getattr(session, "tax_year", None) or 2025)
        don_calc = self.calculate_donation_credit(
            donation_details, earned_income_amount if total_salary > 0 else 0, donation_spent if total_salary > 0 else 0,
            carryover=donation_carryover if total_salary > 0 else None, tax_year=tax_year)
        don_credit = don_calc["special_pack"]               # 특별세액공제(특례·일반 기부금)
        tax_credit_donation_separate = don_calc["separate"]  # 정치자금·고향사랑·우리사주조합 (표준세액공제와 병행)

        tax_credit_special = ins_credit + med_credit + edu_credit + don_credit

        tax_credit_monthly_rent = 0
        if exp and exp.monthly_rent_paid > 0 and total_salary <= 80000000 and total_salary > 0 and mortgage_ded == 0:
            rent_paid = min(10000000, exp.monthly_rent_paid)
            rent_rate = 0.17 if total_salary <= 55000000 else 0.15
            tax_credit_monthly_rent = math.floor(rent_paid * rent_rate)

        # 연금계좌세액공제 산출액 (소득세법 제59조의3) — 표준/특별 비교에도 쓰이므로 먼저 계산
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

        # ---------------------------------------------------------------------
        # 세액감면·공제 적용순서 (소득세법 제60조, 원천세과-830, 2023.09.13.)
        #   ① 세액감면(중소기업 취업자)
        #   ② 이월공제 불가 세액공제: 근로소득 → 혼인 → 자녀 → 보장성보험 → 의료비 → 교육비
        #      → 정치자금 → 고향사랑 → 우리사주조합 → 표준세액공제 → 월세
        #   ③ 이월공제 가능 세액공제(소득세법 제61조, 10년): 특례(이월분 → 당해분) → 일반·종교단체 외(이월 → 당해)
        #      → 일반·종교단체(이월 → 당해)
        #   ④ 연금계좌: 감면·공제 합계가 산출세액을 초과하면 그 초과액을 한도로 공제받지 않은 것으로 봄
        # 각 공제는 앞선 감면·공제를 차감하고 남은 산출세액 범위 안에서만 적용된다. (화면 엔진 taxCalculator.js와 동일)
        # ---------------------------------------------------------------------
        chunks = don_calc["chunks"]

        def _allocate_credits(ct: int, sme: int, earned: int, use_standard: bool):
            sp = (lambda v: 0) if use_standard else (lambda v: v)
            order = [
                ("세액감면(중소기업 취업자)", sme, "세액감면"),
                ("근로소득세액공제", earned, "이월공제 불가"),
                ("혼인세액공제", tax_credit_marriage, "이월공제 불가"),
                ("자녀세액공제", tax_credit_child, "이월공제 불가"),
                ("보장성보험료", sp(ins_credit), "이월공제 불가"),
                ("의료비", sp(med_credit), "이월공제 불가"),
                ("교육비", sp(edu_credit), "이월공제 불가"),
                ("정치자금기부금", don_calc["political"], "이월공제 불가"),
                ("고향사랑기부금", don_calc["hometown"], "이월공제 불가"),
                ("우리사주조합기부금", don_calc["employee_stock"], "이월공제 불가"),
                ("표준세액공제", 130000 if use_standard else 0, "이월공제 불가"),
                ("월세액", sp(tax_credit_monthly_rent), "이월공제 불가"),
                ("특례기부금(이월분)", sp(chunks["special_carry"]["credit"]), "이월공제 가능"),
                ("특례기부금", sp(chunks["special"]["credit"]), "이월공제 가능"),
                ("일반기부금(종교단체 외·이월분)", sp(chunks["general_carry"]["credit"]), "이월공제 가능"),
                ("일반기부금(종교단체 외)", sp(chunks["general"]["credit"]), "이월공제 가능"),
                ("일반기부금(종교단체·이월분)", sp(chunks["religious_carry"]["credit"]), "이월공제 가능"),
                ("일반기부금(종교단체)", sp(chunks["religious"]["credit"]), "이월공제 가능"),
                ("연금계좌", tax_credit_pension_account_before_cap, "초과분 미공제 간주"),
            ]
            remaining = max(0, ct)
            alloc = []
            for label, amount, group in order:
                applied = min(max(0, int(amount or 0)), remaining)
                remaining -= applied
                alloc.append({"label": label, "computed": int(amount or 0), "applied": applied, "group": group})
            return alloc, remaining, max(0, ct - sum(c["applied"] for c in alloc))

        # 표준세액공제(13만 원)는 특별소득공제(건강·고용보험료, 주택자금)·특별세액공제·월세세액공제를
        # 모두 신청하지 않는 경우에만 적용된다 (소득세법 제59조의4 ⑨). 두 경우를 모두 끝까지 계산해
        # (표준 쪽은 특별소득공제를 빼고 과세표준·산출세액부터 다시) 결정세액이 더 적은 쪽을 택한다(같으면 특별).
        def _basic_tax(taxable: int):
            ct = self.calculate_income_tax(taxable)
            sme = min(2000000, math.floor(ct * 0.90)) if (session.is_sme_youth and ct > 0) else 0
            earned = self.calculate_earned_income_tax_credit(calculated_tax=ct, gross_salary=total_salary, reduction_sme=sme)
            return ct, sme, earned

        std_excess = max(0, limit_target_other - 25000000)
        std_income_deductions = total_personal_deduction + total_pension_deduction + total_other_income_deduction - std_excess
        std_taxable = max(0, earned_income_amount - std_income_deductions)
        std_ct, std_sme, std_earned = _basic_tax(std_taxable)
        tax_if_special = _allocate_credits(calculated_tax, tax_reduction_sme, tax_credit_earned_income, False)[2]
        tax_if_standard = _allocate_credits(std_ct, std_sme, std_earned, True)[2]
        special_pack_benefit = tax_if_standard - tax_if_special  # 비교 기록용 (양수면 특별세액공제가 유리)

        standard_tax_credit = 0
        if total_salary > 0 and tax_if_standard < tax_if_special:
            standard_tax_credit = 130000
            tax_credit_special = 0
            tax_credit_monthly_rent = 0
            # 특별소득공제를 제외한 과세표준·산출세액으로 다시 확정하고 앞 단계 감사 기록도 갱신
            removed_special_income = total_special_income_deduction
            taxable_standard, calculated_tax = std_taxable, std_ct
            tax_reduction_sme, tax_credit_earned_income = std_sme, std_earned
            total_special_income_deduction = 0
            income_deduction_limit_excess = std_excess
            total_income_deductions = std_income_deductions
            note = f" (표준세액공제 선택으로 특별소득공제 {removed_special_income:,}원 미적용 기준으로 재계산)"
            for st in audit_steps:
                if st.get("step") == 3:
                    st["calculated_amount"] = taxable_standard
                    st.setdefault("output_snapshot", {})["taxable_standard"] = taxable_standard
                    st["explanation"] = f"근로소득금액 {earned_income_amount:,}원에서 소득공제 합계 {total_income_deductions:,}원을 공제하여 과세표준 {taxable_standard:,}원이 산출되었습니다." + note
                elif st.get("step") == 4:
                    st["base_value"] = taxable_standard
                    st["calculated_amount"] = calculated_tax
                    st["output_snapshot"] = {"taxable_standard": taxable_standard, "calculated_tax": calculated_tax}
                    st["explanation"] = f"과세표준 {taxable_standard:,}원에 대해 법정 기본세율을 적용하여 산출세액 {calculated_tax:,}원이 산출되었습니다." + note
                elif st.get("step_name") == "중소기업 취업자 소득세 감면":
                    st["calculated_amount"] = tax_reduction_sme
                    st["output_snapshot"] = {"tax_reduction_sme": tax_reduction_sme}
                elif st.get("step_name") == "근로소득 세액공제":
                    st["calculated_amount"] = tax_credit_earned_income
                    st["output_snapshot"] = {"tax_credit_earned_income": tax_credit_earned_income}

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
                "donation_mode": don_calc["mode"],
                "donation_special": don_calc["special"],
                "donation_general": don_calc["general"],
                "donation_religious": don_calc["religious"],
                "tax_credit_special": tax_credit_special,
                "standard_tax_credit": standard_tax_credit,
                "final_tax_if_special": tax_if_special,
                "final_tax_if_standard": tax_if_standard,
            },
            "base_value": 130000 if standard_tax_credit > 0 else tax_credit_special,
            "calculated_amount": standard_tax_credit if standard_tax_credit > 0 else tax_credit_special,
            "output_snapshot": {
                "applied_mode": "STANDARD" if standard_tax_credit > 0 else "SPECIAL",
                "special_credit": tax_credit_special,
                "standard_credit": standard_tax_credit,
            },
            "legal_formula": "결정세액 비교: [특별소득공제 + 특별세액공제(보험료·의료비·교육비·특례/일반기부금) + 월세] vs [특별소득공제 제외 재계산 + 표준세액공제 13만 원] 중 결정세액이 적은 쪽",
            "legal_basis": "소득세법 제59조의4(특별세액공제 및 표준세액공제)",
            "explanation": (
                f"표준세액공제를 택한 결정세액 {tax_if_standard:,}원이 특별세액공제를 택한 경우 {tax_if_special:,}원보다 적어 표준세액공제(130,000원)가 적용되었습니다."
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

        # 6-1) 정치자금·고향사랑·우리사주조합 기부금 세액공제 (조특법, 표준세액공제와 병행 가능)
        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "정치자금·고향사랑·우리사주 기부금 세액공제",
            "calculation_type": "TAX_CREDIT_DONATION_SEPARATE",
            "input_snapshot": {
                "political_paid": don_calc["paid"].get("political", 0),
                "hometown_paid": don_calc["paid"].get("home_general", 0) + don_calc["paid"].get("home_disaster", 0),
                "hometown_disaster_paid": don_calc["paid"].get("home_disaster", 0),
                "employee_stock_paid": don_calc["paid"].get("employee_stock", 0),
                "donation_mode": don_calc["mode"],
            },
            "base_value": don_calc["paid"].get("political", 0) + don_calc["paid"].get("home_general", 0)
                          + don_calc["paid"].get("home_disaster", 0) + don_calc["paid"].get("employee_stock", 0),
            "calculated_amount": tax_credit_donation_separate,
            "output_snapshot": {
                "political_credit": don_calc["political"],
                "hometown_credit": don_calc["hometown"],
                "employee_stock_credit": don_calc["employee_stock"],
            },
            "legal_formula": "정치자금·고향사랑: 10만 원 이하 100/110 + 초과분 15%(고향사랑 특별재난지역 30%, 정치자금 3천만 초과 25%) / 우리사주: 근로소득금액 30% 한도 × 15%(1천만 초과 30%)",
            "legal_basis": "조세특례제한법 제76조(정치자금), 제58조(고향사랑기부금), 제88조의4(우리사주조합기부금)",
            "explanation": (
                f"정치자금 {don_calc['political']:,}원, 고향사랑 {don_calc['hometown']:,}원, 우리사주조합 {don_calc['employee_stock']:,}원의 기부금 세액공제가 적용되었습니다."
                if tax_credit_donation_separate > 0
                else "해당 없음: 정치자금·고향사랑·우리사주조합 기부 내역이 없습니다 (0원)."
            ),
            "metadata_json": {"political": don_calc["political"], "hometown": don_calc["hometown"], "employee_stock": don_calc["employee_stock"]},
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


        credit_allocation, remaining_tax, _ = _allocate_credits(
            calculated_tax, tax_reduction_sme, tax_credit_earned_income, standard_tax_credit > 0)
        applied_map = {c["label"]: c["applied"] for c in credit_allocation}
        tax_credit_pension_account = applied_map["연금계좌"]
        available_tax_after_reduction = max(0, calculated_tax - tax_reduction_sme)

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
            "output_snapshot": {
                "tax_credit_pension_account": tax_credit_pension_account,
                "tax_credit_pension_account_before_cap": tax_credit_pension_account_before_cap,
            },
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

        # 산출세액 부족으로 공제받지 못한 특례·일반기부금 세액은 다음 과세기간 이월공제 대상(10년)
        donation_carryover_credit = sum(
            c["computed"] - c["applied"] for c in credit_allocation if c["group"] == "이월공제 가능"
        )

        # 다음 과세기간으로 이월되는 특례·일반기부금 (공제대상금액 기준, 10년)
        #  = 당해연도 한도초과액 + 산출세액 부족으로 공제받지 못한 금액(세액을 공제대상금액으로 환산)
        #  - 이월분은 기부연도가 빠른 것부터 공제된 것으로 보고, 10년이 지난 이월분은 소멸
        #  - 표준세액공제를 택하면 당해연도 기부금은 공제·이월하지 않고, 전년도 이월분은 그대로 이월
        use_std = standard_tax_credit > 0

        def _unapplied_amount(chunk: Dict[str, int], applied: int) -> int:
            if chunk["credit"] <= 0:
                return 0
            return math.floor(chunk["amount"] * (chunk["credit"] - applied) / chunk["credit"] + 0.5)

        donation_carryover_next: Dict[str, Any] = {"special": 0, "general": 0, "religious": 0, "expired": 0, "entries": []}
        for kind, carry_label, cur_label in (
            ("special", "특례기부금(이월분)", "특례기부금"),
            ("general", "일반기부금(종교단체 외·이월분)", "일반기부금(종교단체 외)"),
            ("religious", "일반기부금(종교단체·이월분)", "일반기부금(종교단체)"),
        ):
            carry_chunk, cur_chunk = chunks[f"{kind}_carry"], chunks[kind]
            applied_left = 0 if use_std else max(0, carry_chunk["amount"] - _unapplied_amount(carry_chunk, applied_map[carry_label]))
            for e in don_calc["carryover_entries"]:
                if e["kind"] != kind:
                    continue
                here = min(e["used"], applied_left)
                applied_left -= here
                rem = e["amount"] - here
                expires = e["year"] <= tax_year - self.DONATION_CARRYOVER_YEARS
                donation_carryover_next["entries"].append(
                    {"year": e["year"], "kind": kind, "amount": e["amount"], "applied": here, "remaining": rem, "expires": expires})
                if expires:
                    donation_carryover_next["expired"] += rem
                else:
                    donation_carryover_next[kind] += rem
            if not use_std:
                cur_next = don_calc["limit_excess"][kind] + _unapplied_amount(cur_chunk, applied_map[cur_label])
                if cur_next > 0:
                    donation_carryover_next["entries"].append(
                        {"year": tax_year, "kind": kind, "amount": cur_next, "applied": 0, "remaining": cur_next, "expires": False})
                    donation_carryover_next[kind] += cur_next
        donation_carryover_next["total"] = (
            donation_carryover_next["special"] + donation_carryover_next["general"] + donation_carryover_next["religious"])

        # 적용순서대로 배분한 실제 적용액 합계 (세액감면 제외분이 세액공제 합계)
        final_tax_credits = sum(c["applied"] for c in credit_allocation) - applied_map["세액감면(중소기업 취업자)"]

        audit_steps.append({
            "sequence_order": len(audit_steps) + 1,
            "step": 5,
            "step_name": "세액감면·공제 적용순서별 배분",
            "calculation_type": "TAX_CREDIT_ALLOCATION",
            "input_snapshot": {c["label"]: c["computed"] for c in credit_allocation},
            "base_value": calculated_tax,
            "calculated_amount": final_tax_credits + applied_map["세액감면(중소기업 취업자)"],
            "output_snapshot": {"applied": {c["label"]: c["applied"] for c in credit_allocation},
                                "order": [c["label"] for c in credit_allocation],
                                "groups": {c["label"]: c["group"] for c in credit_allocation},
                                "donation_carryover_credit": donation_carryover_credit,
                                "donation_carryover_next": donation_carryover_next},
            "legal_formula": (
                "산출세액 범위 안에서 ① 세액감면 → ② 이월공제 불가 세액공제(근로소득 → 혼인 → 자녀 → 보험료 → 의료비 → 교육비 "
                "→ 정치자금 → 고향사랑 → 우리사주 → 표준세액공제 → 월세) → ③ 이월공제 가능 세액공제(특례 → 일반(종교단체 외) "
                "→ 일반(종교단체) 기부금, 같은 종류는 전년도 이월분 먼저) → ④ 연금계좌(초과분은 공제받지 않은 것으로 봄) 순으로 차감"
            ),
            "legal_basis": "소득세법 제60조(세액공제 적용의 순서 등), 소득세법 제61조(기부금 이월공제), 원천세과-830(2023.09.13.), 조세특례제한법 제127조",
            "explanation": (
                "산출세액이 부족해 일부 공제가 다 적용되지 못했습니다: "
                + ", ".join(f"{c['label']} {c['computed'] - c['applied']:,}원" for c in credit_allocation if c["applied"] < c["computed"])
                + (f" (특례·일반기부금 미공제 세액 {donation_carryover_credit:,}원은 다음 과세기간부터 10년간 이월공제 대상)"
                   if donation_carryover_credit > 0 else "")
                + (f" — 다음 과세기간 이월 기부금 {donation_carryover_next['total']:,}원" if donation_carryover_next["total"] > 0 else "")
                if any(c["applied"] < c["computed"] for c in credit_allocation)
                else (
                    "모든 세액감면·공제가 산출세액 범위 안에서 전액 적용되었습니다."
                    if any(c["applied"] > 0 for c in credit_allocation)
                    else "해당 없음: 적용할 세액감면·공제가 없습니다 (0원)."
                )
            ),
            "metadata_json": {"remaining_tax": remaining_tax, "donation_carryover_credit": donation_carryover_credit},
        })

        # ---------------------------------------------------------------------
        # STEP 6. 결정세액 확정 (Step 6)
        # ---------------------------------------------------------------------
        final_decision_tax = max(0, available_tax_after_reduction - final_tax_credits)
        # 차감징수세액은 원천징수영수증과 같이 10원 미만을 버린다 (환급·추가납부 모두 0원 쪽으로 버림)
        final_refund_amount = self.truncate_under_10(final_decision_tax - total_prepaid_tax)
        # 지방소득세: 결정세액의 10%, 차감징수세액 10원 미만 버림
        final_local_tax = math.floor(final_decision_tax * 0.1)
        total_prepaid_local_tax = sum(int(getattr(wp, "prepaid_local_tax", 0) or 0) for wp in (workplaces or []))
        final_local_refund_amount = self.truncate_under_10(final_local_tax - total_prepaid_local_tax)

        if total_salary == 0:
            calculated_tax = 0
            tax_reduction_sme = 0
            tax_credit_earned_income = 0
            final_decision_tax = 0
            final_refund_amount = 0
            total_prepaid_tax = 0
            final_tax_credits = 0
            final_local_tax = 0
            total_prepaid_local_tax = 0
            final_local_refund_amount = 0

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
                "is_refund": final_refund_amount < 0,
                "final_local_tax": final_local_tax,
                "total_prepaid_local_tax": total_prepaid_local_tax,
                "final_local_refund_amount": final_local_refund_amount,
            },
            "legal_formula": "차감징수세액 = 결정세액 - 기납부세액, 소득세·지방소득세 각각 10원 미만 버림 (음수: 환급, 양수: 추가납부)",
            "legal_basis": "소득세법 제137조(연말정산 차감징수)",
            "explanation": (
                f"기납부세액({total_prepaid_tax:,}원)이 결정세액({final_decision_tax:,}원)보다 많아 {abs(final_refund_amount):,}원을 환급받습니다."
                if final_refund_amount < 0
                else (
                    f"결정세액({final_decision_tax:,}원)이 기납부세액({total_prepaid_tax:,}원)보다 많아 {final_refund_amount:,}원을 추가 납부해야 합니다."
                    if final_refund_amount > 0
                    else f"결정세액과 기납부세액({total_prepaid_tax:,}원)이 같아 환급·추가납부가 없습니다."
                )
            ),
            "metadata_json": {
                "final_decision_tax": final_decision_tax,
                "total_prepaid_tax": total_prepaid_tax,
                "final_refund_amount": final_refund_amount,
                "is_refund": final_refund_amount < 0,
            },
        })

        # ---------------------------------------------------------------------
        # STEP 8. DB 저장 및 영속화 (TaxResult & AuditLogs - 단일 트랜잭션)
        # ---------------------------------------------------------------------
        result_values = {
            "total_gross_salary": total_salary,
            "earned_income_deduction": earned_income_deduction,
            "earned_income_amount": earned_income_amount,
            "total_personal_deduction": total_personal_deduction,
            "total_pension_deduction": total_pension_deduction,
            "total_special_income_deduction": total_special_income_deduction,
            "total_other_income_deduction": total_other_income_deduction,
            "income_deduction_limit_excess": income_deduction_limit_excess,
            "taxable_standard": taxable_standard,
            "calculated_tax": calculated_tax,
            "tax_reduction_sme": tax_reduction_sme,
            "tax_credit_earned_income": tax_credit_earned_income,
            "tax_credit_child": tax_credit_child,
            "tax_credit_marriage": tax_credit_marriage,
            "tax_credit_pension_account": tax_credit_pension_account,
            "tax_credit_special": tax_credit_special,
            "tax_credit_monthly_rent": tax_credit_monthly_rent,
            "standard_tax_credit": standard_tax_credit,
            "final_decision_tax": final_decision_tax,
            "total_prepaid_tax": total_prepaid_tax,
            "final_refund_amount": final_refund_amount,
            "calculated_at": datetime.now(timezone.utc),
        }

        def _apply(obj: TaxResult) -> TaxResult:
            for key, value in result_values.items():
                setattr(obj, key, value)
            return obj

        tax_result = self.db.query(TaxResult).filter(TaxResult.session_id == sess_uuid).first()
        if tax_result:
            _apply(tax_result)
        else:
            # 같은 세션 계산 요청이 동시에 두 번 오면(화면 자동 검증 + 사용자 실행 등) 한쪽이 먼저 행을 만든다.
            # 그때는 UNIQUE 충돌을 잡아 이미 생긴 행을 갱신한다.
            try:
                with self.db.begin_nested():
                    tax_result = _apply(TaxResult(session_id=sess_uuid))
                    self.db.add(tax_result)
                    self.db.flush()
            except IntegrityError:
                tax_result = _apply(
                    self.db.query(TaxResult).filter(TaxResult.session_id == sess_uuid).one()
                )

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
