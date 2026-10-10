"""RAG 기반 AI 세무 해설기 (TaxExplainer)
- LangChain 및 국세청 지식베이스(RAG) 연동
- Tax Engine 계산 결과를 주입받아 국세청 출처 페이지와 법조문을 인용한 쉬운 해설 생성
- GPT는 설명만 수행 (계산 금지), 오프라인/테스트용 결정론적 Fallback 해설기 내장
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document

from backend.core.config import settings
from backend.rag.prompt import (
    TAX_EXPLANATION_SYSTEM_PROMPT,
    TAX_EXPLANATION_USER_PROMPT_TEMPLATE,
)
from backend.rag.retriever import RAGRetriever
from backend.schemas.explanation import ExplanationDTO


class TaxExplainer:
    """Tax Engine 연계 RAG 해설기
    """

    def __init__(self, retriever: Optional[RAGRetriever] = None):
        self.retriever = retriever or RAGRetriever()

    def _call_llm(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """OpenAI LLM을 호출하여 해설 텍스트(JSON)를 취득합니다."""
        if not settings.OPENAI_API_KEY or not settings.OPENAI_API_KEY.startswith("sk-"):
            return None

        try:
            from langchain_openai import ChatOpenAI
            llm = ChatOpenAI(
                openai_api_key=settings.OPENAI_API_KEY,
                model_name=settings.OPENAI_MODEL or "gpt-4o",
                temperature=0.2,
                timeout=10,
            )
            from langchain_core.messages import HumanMessage, SystemMessage
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ]
            response = llm.invoke(messages)
            return response.content
        except Exception as e:
            print(f"[TaxExplainer] LLM 호출 실패 또는 미설정 (Fallback 모드 작동): {e}")
            return None

    def _build_deterministic_fallback(
        self,
        top_doc: Document,
        tax_result: Dict[str, Any],
        query: str,
        category: str,
    ) -> ExplanationDTO:
        """API 키가 없거나 외부 통신 실패 시 국세청 공식 자료와 계산 수치를 결합한 결정론적 해설 생성"""
        meta = top_doc.metadata
        page = int(meta.get("page", 1))
        title = meta.get("title", f"2025년 귀속 {category} 연말정산 해설")
        section = meta.get("section", "소득 및 세액공제")
        legal_basis = meta.get("legal_basis", "소득세법 및 조세특례제한법")

        gross_salary = tax_result.get("gross_salary") or tax_result.get("total_salary", 0)
        final_tax = tax_result.get("final_decision_tax") or tax_result.get("final_tax", 0)
        refund_amount = tax_result.get("final_refund_amount") or tax_result.get("refund_amount", 0)
        calculated_tax = tax_result.get("calculated_tax", 0)
        taxable_income = tax_result.get("taxable_standard") or tax_result.get("taxable_income", 0)

        refund_desc = f"{abs(refund_amount):,}원 환급 예정" if refund_amount <= 0 else f"{refund_amount:,}원 추가 납부 예정"

        summary = (
            f"귀하의 2025년 총급여 {gross_salary:,}원에 대한 과세표준은 {taxable_income:,}원이며, "
            f"산출세액 {calculated_tax:,}원에서 법정 공제를 차감하여 최종 결정세액은 {final_tax:,}원({refund_desc})으로 정산되었습니다."
        )

        reason = (
            f"국세청 '2025년 귀속 연말정산 신고안내'({section}, p.{page})에 따르면, "
            f"{category} 항목은 법정 요건을 엄격히 적용하여 결정론적 Tax Engine에 의해 정확히 연산되었습니다.\n"
            f"- 근거 가이드 요약: {top_doc.page_content[:200]}...\n"
            f"- 기납부세액과 최종 결정세액의 차액에 따라 {refund_desc}입니다."
        )

        return ExplanationDTO(
            title=title,
            summary=summary,
            reason=reason,
            page=page,
            references=[
                legal_basis,
                f"국세청 '2025년 귀속 연말정산 신고안내' p.{page}",
            ],
        )

    def explain(
        self,
        tax_result: Dict[str, Any],
        query: str,
        category: Optional[str] = None,
    ) -> ExplanationDTO:
        """Tax Engine 계산 결과와 질의를 국세청 가이드 문서와 연결하여 ExplanationDTO를 생성합니다.
        
        Args:
            tax_result: Tax Engine 계산 결과 딕셔너리 (또는 TaxResult 모델 속성)
            query: 사용자 질문 또는 설명 요청
            category: 공제 카테고리 (신용카드, 의료비, 월세 등)
            
        Returns:
            ExplanationDTO (title, summary, reason, page, references)
        """
        target_cat = category or "연말정산 종합"
        search_query = f"{target_cat} {query}".strip()

        # 1. RAG 지식베이스 검색
        retrieved_docs = self.retriever.retrieve(query=search_query, top_k=3, section=category)
        if not retrieved_docs:
            retrieved_docs = [
                Document(
                    page_content="국세청 2025년 귀속 연말정산 법정 공제 및 세율 가이드라인",
                    metadata={"title": "연말정산 종합안내", "page": 1, "legal_basis": "소득세법 제55조"}
                )
            ]

        top_doc = retrieved_docs[0]
        meta = top_doc.metadata

        # 2. 추가 세무 세부내용 포맷팅
        additional_info_parts = []
        for key in ["child_tax_credit", "tax_credit_child", "tax_credit_marriage", "marriage_tax_credit",
                    "tax_credit_pension_account", "pension_credit", "standard_tax_credit", "income_deduction_limit_excess"]:
            if key in tax_result and tax_result[key]:
                additional_info_parts.append(f"- {key}: {tax_result[key]:,}원")
        additional_details = "\n".join(additional_info_parts) if additional_info_parts else "- 특이사항 없음"

        # 3. LLM 사용자 프롬프트 구성
        gross_salary = tax_result.get("gross_salary") or tax_result.get("total_salary", 0)
        earned_income_deduction = tax_result.get("earned_income_deduction", 0)
        taxable_income = tax_result.get("taxable_standard") or tax_result.get("taxable_income", 0)
        calculated_tax = tax_result.get("calculated_tax", 0)
        tax_credits = tax_result.get("tax_credits") or (calculated_tax - tax_result.get("final_tax", calculated_tax))
        final_tax = tax_result.get("final_decision_tax") or tax_result.get("final_tax", 0)
        prepaid_tax = tax_result.get("total_prepaid_tax") or tax_result.get("prepaid_tax", 0)
        refund_amount = tax_result.get("final_refund_amount") or tax_result.get("refund_amount", 0)

        user_prompt = TAX_EXPLANATION_USER_PROMPT_TEMPLATE.format(
            document_title=meta.get("title", "국세청 연말정산 신고안내"),
            source_page=meta.get("page", 1),
            legal_basis=meta.get("legal_basis", "소득세법"),
            context_content=top_doc.page_content,
            gross_salary=gross_salary,
            earned_income_deduction=earned_income_deduction,
            taxable_income=taxable_income,
            calculated_tax=calculated_tax,
            tax_credits=tax_credits,
            final_tax=final_tax,
            prepaid_tax=prepaid_tax,
            refund_amount=refund_amount,
            additional_tax_details=additional_details,
            target_category=target_cat,
            user_query=query,
        )

        # 4. LLM 호출
        llm_output = self._call_llm(TAX_EXPLANATION_SYSTEM_PROMPT, user_prompt)

        # 5. 파싱 시도
        if llm_output:
            try:
                # JSON 코드블록 제거
                cleaned = re.sub(r"```json\s*", "", llm_output)
                cleaned = re.sub(r"```\s*$", "", cleaned).strip()
                parsed = json.loads(cleaned)
                return ExplanationDTO(
                    title=str(parsed.get("title", meta.get("title", "연말정산 세액 해설"))),
                    summary=str(parsed.get("summary", "")),
                    reason=str(parsed.get("reason", "")),
                    page=int(parsed.get("page", meta.get("page", 1))),
                    references=list(parsed.get("references", [meta.get("legal_basis", "소득세법")])),
                )
            except Exception as e:
                print(f"[TaxExplainer] JSON 파싱 오류: {e}, Fallback으로 전환")

        # 6. Fallback 반환
        return self._build_deterministic_fallback(
            top_doc=top_doc,
            tax_result=tax_result,
            query=query,
            category=target_cat,
        )
