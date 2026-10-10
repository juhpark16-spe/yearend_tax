"""AI 세무 해설 서비스 (TaxExplanationService)
- Tax Engine 계산 결과를 국세청 RAG 지식베이스와 결합하여 쉬운 근거 해설 제공
- PRD_v3.0.md, API_v1.0.md, SRS_v3.0.md 준수
- ExplanationDTO(title, summary, reason, page, references) 반환
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from backend.models.tax_result import TaxResult
from backend.rag.explainer import TaxExplainer
from backend.schemas.explanation import ExplanationDTO
from backend.services.tax_calculation_service import TaxCalculationService


class TaxExplanationService:
    """Tax Engine 결과 기반 AI 해설 서비스
    """

    def __init__(self, db: Optional[Session] = None, explainer: Optional[TaxExplainer] = None):
        self.db = db
        self.explainer = explainer or TaxExplainer()

    def explain_tax_payload(
        self,
        payload: Dict[str, Any],
        query: str = "연말정산 결과 및 공제 내역을 설명해 주세요.",
        category: Optional[str] = None,
    ) -> ExplanationDTO:
        """독립적인 계산 결과 딕셔너리에 대해 국세청 가이드 연계 ExplanationDTO를 생성합니다.
        
        Args:
            payload: 총급여, 과표, 산출세액, 공제내역 등이 포함된 딕셔너리
            query: 사용자 질문
            category: 공제 항목 분류 (선택)
            
        Returns:
            ExplanationDTO
        """
        return self.explainer.explain(
            tax_result=payload,
            query=query,
            category=category,
        )

    def explain_tax_result_by_session(
        self,
        session_id: str,
        category: Optional[str] = None,
        user_question: Optional[str] = None,
    ) -> ExplanationDTO:
        """세션 ID에 대한 TaxResult를 조회하여 국세청 근거 페이지가 포함된 ExplanationDTO를 생성합니다.
        
        Args:
            session_id: 정산 세션 UUID 문자열
            category: 특정 공제 항목 (예: '신용카드', '월세액', '의료비' 등)
            user_question: 사용자의 구체적 질의 (미입력 시 기본 안내 생성)
            
        Returns:
            ExplanationDTO
        """
        if self.db is None:
            raise ValueError("데이터베이스 세션(Session)이 필요합니다.")

        sess_uuid = uuid.UUID(session_id)
        tax_res = self.db.query(TaxResult).filter(TaxResult.session_id == sess_uuid).first()

        # 정산 결과가 아직 저장되지 않은 경우 즉시 계산
        if not tax_res:
            calc_svc = TaxCalculationService(self.db)
            tax_res, _ = calc_svc.calculate_and_save(session_id=session_id)

        # TaxResult 속성을 딕셔너리로 직렬화
        res_dict = {
            "total_gross_salary": tax_res.total_gross_salary,
            "gross_salary": tax_res.total_gross_salary,
            "earned_income_deduction": tax_res.earned_income_deduction,
            "taxable_standard": tax_res.taxable_standard,
            "taxable_income": tax_res.taxable_standard,
            "calculated_tax": tax_res.calculated_tax,
            "tax_credits": tax_res.calculated_tax - tax_res.final_decision_tax,
            "final_decision_tax": tax_res.final_decision_tax,
            "final_tax": tax_res.final_decision_tax,
            "total_prepaid_tax": tax_res.total_prepaid_tax,
            "prepaid_tax": tax_res.total_prepaid_tax,
            "final_refund_amount": tax_res.final_refund_amount,
            "refund_amount": tax_res.final_refund_amount,
            "total_personal_deduction": tax_res.total_personal_deduction,
            "total_pension_deduction": tax_res.total_pension_deduction,
            "total_special_income_deduction": tax_res.total_special_income_deduction,
            "total_other_income_deduction": tax_res.total_other_income_deduction,
            "income_deduction_limit_excess": tax_res.income_deduction_limit_excess,
            "tax_reduction_sme": tax_res.tax_reduction_sme,
            "tax_credit_earned_income": tax_res.tax_credit_earned_income,
            "tax_credit_child": tax_res.tax_credit_child,
            "tax_credit_marriage": tax_res.tax_credit_marriage,
            "tax_credit_pension_account": tax_res.tax_credit_pension_account,
            "tax_credit_special": tax_res.tax_credit_special,
            "tax_credit_monthly_rent": tax_res.tax_credit_monthly_rent,
            "standard_tax_credit": tax_res.standard_tax_credit,
        }

        query = user_question or f"{category or '연말정산 종합 세액'} 산출 근거 및 공제 사유를 설명해 주세요."
        return self.explainer.explain(
            tax_result=res_dict,
            query=query,
            category=category,
        )

    def explain_all_sections(self, session_id: str) -> List[ExplanationDTO]:
        """해당 세션에서 적용된 주요 공제 항목별 해설 카드 목록을 일괄 생성합니다."""
        sections = ["신용카드", "주택자금", "월세액", "자녀세액공제", "연금계좌", "표준세액공제"]
        explanations: List[ExplanationDTO] = []

        for sec in sections:
            try:
                dto = self.explain_tax_result_by_session(session_id=session_id, category=sec)
                explanations.append(dto)
            except Exception as e:
                print(f"[TaxExplanationService] 섹션 {sec} 해설 생성 오류: {e}")
                continue

        return explanations
