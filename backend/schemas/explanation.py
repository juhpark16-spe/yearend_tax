"""RAG 및 AI 해설 관련 Pydantic DTO (ExplanationDTO)
- PRD_v3.0.md & API_v1.0.md 준수
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ExplanationDTO(BaseModel):
    """세액 계산 결과 및 국세청 공식 자료 연계 AI 해설 DTO"""
    title: str = Field(..., description="공제 항목 또는 해설 제목")
    summary: str = Field(..., description="사용자 친화적 핵심 요약 설명")
    reason: str = Field(..., description="법정 산식 및 Tax Engine 계산 결과에 기반한 구체적 산출 사유")
    page: int = Field(..., description="국세청 연말정산 신고안내 책자 출처 페이지")
    references: List[str] = Field(default_factory=list, description="관련 법조문 및 공식 문서 출처 목록")


class TaxExplanationRequest(BaseModel):
    """AI 세액 해설 요청 DTO"""
    session_id: Optional[str] = Field(None, description="정산 세션 UUID (선택)")
    category: Optional[str] = Field(None, description="특정 공제 항목 카테고리 (예: '신용카드', '월세액', '자녀세액공제' 등)")
    section: Optional[str] = Field(None, description="공제 분류 (category alias)")
    query: Optional[str] = Field(None, description="세법 질의 (user_question alias)")
    user_question: Optional[str] = Field(None, description="사용자 질문 또는 설명 요청")
    payload: Optional[Dict[str, Any]] = Field(None, description="세션 없이 해설할 계산 결과 수치 (화면 엔진 결과, 숫자 항목만 사용)")
