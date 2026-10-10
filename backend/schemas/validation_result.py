"""규칙 엔진 검증 결과 Pydantic DTO (Validation Result Schemas)
- PRD_v3.0.md, ERD_v2.0.md, API_v1.0.md 준수
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from backend.schemas.checklist import ChecklistQuestionItem


class DependentValidationDetail(BaseModel):
    """부양가족 1인에 대한 적격성 판정 결과"""
    name: str = Field(..., description="부양가족 성명")
    relation: str = Field(..., description="관계 (SELF, SPOUSE, PARENT, CHILD, SIBLING)")
    age: Optional[int] = Field(None, description="만 나이")
    annual_income: int = Field(0, description="연간 소득금액")
    is_basic_eligible: bool = Field(True, description="기본공제(150만) 대상 여부")
    is_elderly: bool = Field(False, description="경로우대(만 70세 이상 100만) 해당 여부")
    is_disabled: bool = Field(False, description="장애인 추가공제(200만) 해당 여부")
    is_single_parent: bool = Field(False, description="한부모 추가공제(100만) 해당 여부")
    disqualification_reasons: List[str] = Field(default_factory=list, description="부적격 사유 목록")


class DuplicateCheckDetail(BaseModel):
    """중복 공제 의심 및 적발 상세"""
    rule_code: str = Field(..., description="중복 규칙 코드 (DUP_CHILD_SPOUSE, DUP_PARENT_SIBLING 등)")
    target_name: str = Field(..., description="대상자 성명")
    severity: str = Field(default="WARNING", description="심각도 (WARNING, ERROR)")
    message: str = Field(..., description="경고 또는 차단 메시지")


class WorkplaceValidationDetail(BaseModel):
    """근무지 원천징수 정합성 검증 상세"""
    current_workplace_count: int = Field(0, description="주(현) 근무지 수")
    previous_workplace_count: int = Field(0, description="종(전) 근무지 수")
    total_gross_salary: int = Field(0, description="합산 과세 총급여")
    total_prepaid_tax: int = Field(0, description="합산 기납부 소득세")
    is_valid_structure: bool = Field(True, description="근무지 구조 유효 여부")
    notes: List[str] = Field(default_factory=list, description="근무지 관련 메모")


class MissingDeductionItem(BaseModel):
    """놓치기 쉬운 누락 공제 추천 항목"""
    category: str = Field(..., description="공제 분류 (월세, 안경, 체육시설, 청약 등)")
    title: str = Field(..., description="항목 제목")
    description: str = Field(..., description="누락 방지 안내 설명")
    estimated_tax_saving: Optional[str] = Field(None, description="예상 절세 효과 안내")


class ValidationResult(BaseModel):
    """Rule Engine 최종 종합 검증 결과 DTO"""
    model_config = ConfigDict(from_attributes=True)

    session_id: str = Field(..., description="정산 세션 UUID")
    is_valid: bool = Field(..., description="전체 공제 적격성 통과 여부 (오류 없으면 True)")
    matched: bool = Field(True, description="등본과 간소화 간 가족 구성원 일치 여부")
    warnings: List[str] = Field(default_factory=list, description="과다공제 주의 및 유의사항 목록")
    errors: List[str] = Field(default_factory=list, description="법정 부적격 오류 목록 (공제 배제)")
    dependents: List[DependentValidationDetail] = Field(default_factory=list, description="부양가족별 적격성 상세")
    workplace_summary: WorkplaceValidationDetail = Field(
        default_factory=WorkplaceValidationDetail,
        description="근무지 합산 요약"
    )
    duplicates: List[DuplicateCheckDetail] = Field(default_factory=list, description="중복 공제 탐지 내역")
    missing_deductions: List[MissingDeductionItem] = Field(default_factory=list, description="누락된 공제 추천 목록")
    checklist_questions: List[ChecklistQuestionItem] = Field(default_factory=list, description="자가진단 체크리스트 문항")
    details: Dict[str, Any] = Field(default_factory=dict, description="기존 API 호환용 세부 딕셔너리")
