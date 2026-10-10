"""자가진단 체크리스트 Pydantic DTO (Checklist Schemas)
- PRD_v3.0.md, API_v1.0.md 준수
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChecklistQuestionItem(BaseModel):
    """자가진단 체크리스트 단일 문항 DTO"""
    id: str = Field(..., description="체크리스트 질문 고유 ID (예: 'chk_med_insurance')")
    category: str = Field(..., description="공제 분류 (의료비, 주택, 부양가족, 혼인, 신용카드 등)")
    question: str = Field(..., description="사용자 질문 본문")
    description: Optional[str] = Field(None, description="세법 유의사항 및 도움말 설명")
    deduction_item: Optional[str] = Field(None, description="연관 공제 항목명")
    action_type: str = Field(default="BOOLEAN", description="입력 타입 (BOOLEAN, NUMBER, SELECT)")
    warning_if_true: Optional[str] = Field(None, description="'예' 선택 시 안내할 주의 문구")
    warning_if_false: Optional[str] = Field(None, description="'아니오' 선택 시 공제 제외 안내 문구")


class ChecklistUserAnswer(BaseModel):
    """사용자가 제출한 체크리스트 응답 DTO"""
    question_id: str = Field(..., description="질문 ID")
    answer: bool = Field(..., description="사용자 선택 값 (True: 예, False: 아니오)")
    details: Optional[Dict[str, Any]] = Field(default_factory=dict, description="추가 입력값")


class ChecklistSubmissionRequest(BaseModel):
    """체크리스트 일괄 제출 요청 DTO"""
    session_id: str = Field(..., description="정산 세션 ID")
    answers: List[ChecklistUserAnswer] = Field(default_factory=list, description="질문별 응답 목록")


class ChecklistResponse(BaseModel):
    """체크리스트 문항 목록 응답 DTO"""
    session_id: Optional[str] = Field(None, description="세션 ID")
    total_count: int = Field(0, description="생성된 질문 총 개수")
    questions: List[ChecklistQuestionItem] = Field(default_factory=list, description="질문 목록")
