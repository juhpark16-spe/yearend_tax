"""자가진단 체크리스트 및 누락 공제 추천 생성기 (ChecklistGenerator)
- 실손보험금 차감, 월세 무주택 요건, 안경 구입비, 취학전 학원비, 혼인신고 등 동적 질문 생성
- PRD_v3.0.md 준수
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from backend.schemas.checklist import ChecklistQuestionItem
from backend.schemas.validation_result import MissingDeductionItem


class ChecklistGenerator:
    """근로자의 정산 입력값 및 공제 항목을 분석하여 과다공제 방지 질문과 절세 기회를 동적으로 생성하는 엔진
    """

    @classmethod
    def generate_all(
        cls,
        total_salary: int = 0,
        dependents: Optional[List[Dict[str, Any]]] = None,
        deductions: Optional[Dict[str, Any]] = None,
        is_sme_youth: bool = False,
        is_newly_married: bool = False,
    ) -> Tuple[List[ChecklistQuestionItem], List[MissingDeductionItem]]:
        """체크리스트 질문 목록과 누락 공제 추천 목록을 생성합니다."""
        questions: List[ChecklistQuestionItem] = []
        missing_items: List[MissingDeductionItem] = []

        deps = dependents or []
        ded = deductions or {}

        # -------------------------------------------------------------
        # 1. 의료비: 실손보험금 차감 및 안경 구입비
        # -------------------------------------------------------------
        med_amount = ded.get("medical_general", 0) + ded.get("medical_special", 0)
        if med_amount > 0:
            questions.append(ChecklistQuestionItem(
                id="chk_med_insurance",
                category="의료비",
                question="실손의료보험금으로 보전(환급)받은 금액이 있다면 해당 금액을 의료비에서 차감하셨나요?",
                description="실손보험금으로 보전받은 금액은 세법상 본인이 직접 지출한 의료비가 아니므로 공제 대상에서 제외해야 합니다 (미차감 시 가산세 대상).",
                deduction_item="의료비세액공제",
                action_type="BOOLEAN",
                warning_if_false="실손보험 수령액을 차감하지 않고 전액 공제 신청하면 국세청 사후 검증 시 추징될 수 있습니다."
            ))

        missing_items.append(MissingDeductionItem(
            category="의료비",
            title="시력보정용 안경 및 콘택트렌즈 구입비",
            description="홈택스 간소화에서 누락되기 쉬운 안경·렌즈 구입 영수증은 기본공제 대상자 1인당 연 50만 원까지 의료비 공제가 가능합니다.",
            estimated_tax_saving="최대 75,000원 세액공제"
        ))

        # -------------------------------------------------------------
        # 2. 주택자금: 월세 세액공제 및 주택청약 무주택확인서
        # -------------------------------------------------------------
        monthly_rent = ded.get("monthly_rent_paid", 0)
        if monthly_rent > 0 or total_salary <= 80000000:
            questions.append(ChecklistQuestionItem(
                id="chk_housing_rent",
                category="주택자금",
                question="과세기간 종료일(12월 31일) 현재 무주택 세대의 세대주(또는 세대원)로서 주민등록등본상 주소지에 전입신고를 완료하셨나요?",
                description="2025년 기준 총급여 8,000만 원 이하 무주택 근로자만 연 1,000만 원 한도로 월세액의 15~17% 세액공제를 받을 수 있습니다.",
                deduction_item="월세세액공제",
                action_type="BOOLEAN",
                warning_if_false="전입신고가 되지 않았거나 유주택 세대인 경우 월세액 세액공제를 받을 수 없습니다."
            ))

        if ded.get("housing_subscription", 0) > 0:
            questions.append(ChecklistQuestionItem(
                id="chk_housing_sub",
                category="주택자금",
                question="주택청약종합저축 소득공제를 위해 해당 은행에 '무주택확인서'를 연도 내에 제출하셨나요?",
                description="은행에 무주택확인서를 제출하여 등록되어 있어야 연 300만 원 한도 내 40% 소득공제가 적용됩니다.",
                deduction_item="주택청약종합저축",
                action_type="BOOLEAN"
            ))

        # -------------------------------------------------------------
        # 3. 교육비: 취학 전 아동 학원비
        # -------------------------------------------------------------
        has_child = any(str(d.get("relation", "")).upper() in ("CHILD", "자녀") for d in deps)
        if has_child:
            missing_items.append(MissingDeductionItem(
                category="교육비",
                title="취학 전 아동(미취학) 학원 및 체육시설 수강료",
                description="초등학교 입학 전 자녀의 미술·음악·태권도·수영 학원비는 1인당 연 300만 원 한도 내에서 15% 교육비 세액공제가 가능합니다.",
                estimated_tax_saving="자녀 1인당 최대 45만 원 세액공제"
            ))

        # -------------------------------------------------------------
        # 4. 2025 개정 세법: 혼인세액공제 & 체육시설 신용카드 공제
        # -------------------------------------------------------------
        if not is_newly_married:
            questions.append(ChecklistQuestionItem(
                id="chk_marriage",
                category="혼인세액공제",
                question="2024년 1월 1일 ~ 2026년 12월 31일 사이에 혼인신고를 하셨나요?",
                description="신혼부부 혼인세액공제(생애 1회, 1인당 50만 원, 부부 합산 100만 원) 혜택을 받을 수 있습니다.",
                deduction_item="혼인세액공제",
                action_type="BOOLEAN"
            ))

        missing_items.append(MissingDeductionItem(
            category="신용카드",
            title="수영장 및 체육시설(헬스장) 이용료 소득공제 (2025년 신설)",
            description="총급여 7,000만 원 이하 근로자가 지출한 수영장, 헬스장 이용료는 문화비와 합산하여 30%의 높은 소득공제율이 적용됩니다.",
            estimated_tax_saving="30% 소득공제율 적용"
        ))

        # -------------------------------------------------------------
        # 5. 중소기업 취업 청년 감면 확인
        # -------------------------------------------------------------
        if not is_sme_youth and total_salary > 0:
            questions.append(ChecklistQuestionItem(
                id="chk_sme_youth",
                category="세액감면",
                question="현재 재직 중인 회사가 중소기업이며, 취업 당시 만 15세~34세 청년에 해당하시나요?",
                description="중소기업 취업 청년 소득세 감면은 5년간 소득세의 90%(연 200만 원 한도)를 감면해 드립니다.",
                deduction_item="중소기업청년소득세감면",
                action_type="BOOLEAN"
            ))

        return questions, missing_items
