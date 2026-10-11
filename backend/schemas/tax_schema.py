"""연말정산 API DTO 및 스키마 (Pydantic Schemas)
- API_v1.0.md & ERD_v1.0.md 준수
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from backend.models.session import TaxSessionStatus
from backend.models.document import DocumentType
from backend.models.family_member import RelationType
from backend.models.deduction import WorkplaceType


# ============================================================================
# 1. Tax Session Schemas & DTO
# ============================================================================

class SessionCreateRequest(BaseModel):
    """세션 생성 요청 DTO"""
    user_id: Optional[str] = Field(None, description="소유 사용자 UUID (미입력 시 기본 사용자 할당)")
    tax_year: int = Field(default=2025, description="정산 대상 귀속 연도 (기본 2025)")
    is_sme_youth: bool = Field(default=False, description="중소기업 청년 소득세 감면 대상 여부")
    is_newly_married: bool = Field(default=False, description="당해 과세기간 혼인신고 여부")


class SessionResponse(BaseModel):
    """세션 정보 응답 DTO"""
    model_config = ConfigDict(from_attributes=True)

    session_id: str = Field(..., description="정산 세션 UUID")
    user_id: str = Field(..., description="소유 사용자 UUID")
    tax_year: int = Field(..., description="정산 대상 귀속 연도")
    status: str = Field(..., description="진행 상태 (UPLOADED, PARSED, CALCULATED, COMPLETED)")
    is_sme_youth: bool = Field(..., description="중소기업 청년 감면 여부")
    is_newly_married: bool = Field(..., description="혼인신고 공제 여부")
    created_at: str = Field(..., description="세션 생성 일시")
    updated_at: str = Field(..., description="세션 수정 일시")


# ============================================================================
# 2. Document & OCR Schemas & DTO
# ============================================================================

class DocumentUploadResponse(BaseModel):
    """문서 업로드 응답 DTO"""
    model_config = ConfigDict(from_attributes=True)

    document_id: str = Field(..., description="생성된 문서 UUID")
    session_id: str = Field(..., description="소속 세션 UUID")
    file_name: str = Field(..., description="업로드 원본 파일명")
    doc_type: str = Field(..., description="자동 감지 문서 유형 (HOMETAX, WITHHOLDING, RESIDENT, FAMILY)")
    confidence_score: float = Field(default=1.0, description="분류 신뢰도 (0.00 ~ 1.00)")
    status: str = Field(default="uploaded", description="처리 상태 (uploaded, parsed)")
    created_at: str = Field(..., description="업로드 일시")
    parsed_json: Dict[str, Any] = Field(default_factory=dict, description="엔티티 파싱 결과")


class DocumentOCRRequest(BaseModel):
    """문서 OCR 및 분석 요청 DTO"""
    document_id: Optional[str] = Field(None, description="분석할 문서 UUID")
    session_id: Optional[str] = Field(None, description="정산 세션 UUID")
    raw_text: Optional[str] = Field(None, description="직접 전달 텍스트 (옵션)")


class DocumentOCRResponse(BaseModel):
    """문서 OCR 및 분류 응답 DTO"""
    document_id: Optional[str] = Field(None, description="문서 UUID")
    doc_type: str = Field(..., description="분류된 문서 종류 (HOMETAX, WITHHOLDING, RESIDENT, FAMILY)")
    confidence_score: float = Field(..., description="분류 신뢰도")
    parsed_json: Dict[str, Any] = Field(default_factory=dict, description="엔티티 파싱 결과")
    masked_preview: Optional[str] = Field(None, description="PII 마스킹 처리된 텍스트 미리보기")


class DocumentClassifyResponse(BaseModel):
    """문서 자동 분류 응답 DTO (하위 호환)"""
    type: str = Field(..., description="문서 종류 코드")
    confidence: float = Field(..., description="신뢰도")
    summary: Optional[Dict[str, Any]] = None


# ============================================================================
# 3. Validation Schemas & DTO
# ============================================================================

class DependentValidationItem(BaseModel):
    """부양가족 검증 입력 데이터"""
    name: str
    relation: str = "CHILD"
    birth_date: Optional[str] = None
    annual_income: int = 0
    is_disabled: bool = False


class WorkplaceValidationItem(BaseModel):
    """근무지 검증 입력 데이터"""
    company_name: str
    workplace_type: str = "CURRENT"
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    gross_salary: int = 0
    prepaid_tax: int = 0


class ValidationRequest(BaseModel):
    """부양가족 및 중도이직 검증 요청 DTO"""
    session_id: str = Field(..., description="정산 세션 UUID")
    dependents: Optional[List[DependentValidationItem]] = Field(None, description="검증 대상 부양가족 목록")
    workplaces: Optional[List[WorkplaceValidationItem]] = Field(None, description="검증 대상 근무지 목록")


class ValidationResponse(BaseModel):
    """검증 결과 응답 DTO"""
    is_valid: bool = Field(..., description="적격성 종합 통과 여부")
    matched: bool = Field(True, description="부양가족/근무지 일치 여부")
    warnings: List[str] = Field(default_factory=list, description="유의 및 주의사항 목록")
    errors: List[str] = Field(default_factory=list, description="부적격 오류 목록")
    details: Dict[str, Any] = Field(default_factory=dict, description="상세 판정 내역")


# ============================================================================
# 4. Tax Calculation Schemas & DTO
# ============================================================================

class WorkplaceInput(BaseModel):
    """근무지 소득 입력 (주(현)/종(전))"""
    workplace_type: str = Field("CURRENT", description="CURRENT | PREVIOUS")
    company_name: str = Field("근무지", max_length=200)
    business_number: Optional[str] = None
    gross_salary: int = Field(0, ge=0)
    non_taxable_salary: int = Field(0, ge=0)
    prepaid_income_tax: int = Field(0, ge=0)
    prepaid_local_tax: int = Field(0, ge=0)


class DependentInput(BaseModel):
    """부양가족 입력 (주민번호 원문은 받지 않음)"""
    name: str = Field(..., max_length=50)
    relation: str = Field(..., description="SELF | SPOUSE | PARENT | CHILD | SIBLING")
    birth_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    annual_income_amount: int = Field(0, ge=0)
    is_disabled: bool = False
    is_elderly: bool = False
    is_basic_deduction: bool = True
    birth_order: int = Field(0, ge=0, le=3)


class ExpenseInput(BaseModel):
    """공제 지출 입력 (ExpenseDeduction 컬럼 + raw_details 세부)"""
    national_pension: int = Field(0, ge=0)
    health_insurance: int = Field(0, ge=0)
    employment_insurance: int = Field(0, ge=0)
    credit_card_general: int = Field(0, ge=0)
    debit_card_cash: int = Field(0, ge=0)
    market_transport: int = Field(0, ge=0)
    culture_sports: int = Field(0, ge=0)
    housing_rent_loan: int = Field(0, ge=0)
    housing_subscription: int = Field(0, ge=0)
    mortgage_interest: int = Field(0, ge=0)
    personal_pension_saving: int = Field(0, ge=0)
    irp_saving: int = Field(0, ge=0)
    medical_general: int = Field(0, ge=0)
    medical_special: int = Field(0, ge=0)
    education_child: int = Field(0, ge=0)
    monthly_rent_paid: int = Field(0, ge=0)
    raw_details: Dict[str, Any] = Field(default_factory=dict)


class SessionInputsRequest(BaseModel):
    """화면 입력 자료를 세션에 저장 (기존 근무지·부양가족·공제 자료를 교체)"""
    workplaces: List[WorkplaceInput] = Field(default_factory=list)
    dependents: List[DependentInput] = Field(default_factory=list)
    expense: ExpenseInput = Field(default_factory=ExpenseInput)
    is_newly_married: Optional[bool] = None
    is_sme_youth: Optional[bool] = None


class SessionInputsResponse(BaseModel):
    session_id: str
    workplaces: int
    dependents: int
    saved: bool = True


class TaxCalculateRequest(BaseModel):
    """세액 계산 요청 DTO"""
    session_id: str = Field(..., description="정산 세션 UUID")
    override_salary: Optional[int] = Field(None, description="임의 총급여 재지정 (옵션)")
    override_deductions: Optional[Dict[str, Any]] = Field(None, description="임의 공제액 재지정 (옵션)")


class TaxCalculateResponse(BaseModel):
    """세액 계산 결과 응답 DTO"""
    session_id: str = Field(..., description="정산 세션 UUID")
    total_salary: int = Field(..., description="총급여액")
    earned_income_deduction: int = Field(0, description="근로소득공제액")
    taxable_income: int = Field(..., description="과세표준")
    calculated_tax: int = Field(..., description="산출세액")
    tax_credits: int = Field(..., description="세액감면 및 세액공제 합계")
    final_tax: int = Field(..., description="결정세액 (소득세 기준)")
    prepaid_tax: int = Field(..., description="기납부세액")
    refund_amount: int = Field(..., description="차감징수세액 (음수: 환급, 양수: 추가납부)")
    is_refund: bool = Field(True, description="환급 여부")
    total_personal_deduction: int = Field(0, description="인적공제 합계")
    total_special_income_deduction: int = Field(0, description="특별소득공제 합계")
    audit_steps_count: int = Field(0, description="생성된 계산 감사 단계 수")


# ============================================================================
# 5. RAG & AI Assistant Schemas & DTO
# ============================================================================

class RAGSearchRequest(BaseModel):
    """국세청 자료 RAG 질의 DTO"""
    query: str = Field(..., description="세법 및 공제 요건 질의 (예: '월세 세액공제 요건')")
    section: Optional[str] = Field(None, description="공제 분류 (의료비, 교육비, 월세, 기부금 등)")
    top_k: int = Field(default=3, description="검색할 연관 문서 수")


class RAGSearchResponse(BaseModel):
    """RAG 검색 결과 응답 DTO"""
    query: str = Field(..., description="입력 질의")
    answer: str = Field(..., description="국세청 가이드라인 기반 AI 해설")
    source_page: Optional[int] = Field(1, description="국세청 안내서 출처 페이지")
    legal_basis: Optional[str] = Field(None, description="관련 법적 근거 조문")
    section: Optional[str] = Field(None, description="공제 항목 섹션")
    title: Optional[str] = Field("2025년 귀속 연말정산 신고안내", description="출처 문서명")
    confidence: float = Field(0.95, description="답변 신뢰도")


class ChecklistQuestion(BaseModel):
    """자가진단 체크리스트 문항"""
    id: str
    category: str
    question: str
    description: Optional[str] = None


class ChecklistResponse(BaseModel):
    """체크리스트 질문 목록 응답 DTO"""
    questions: List[ChecklistQuestion]


# ============================================================================
# 6. Result & Audit Log Schemas & DTO
# ============================================================================

class AuditLogItem(BaseModel):
    """감사 로그 항목 DTO (7단계 계산 증빙 및 세부 공제 항목별 역추적 지원)"""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: Optional[str] = Field(None, description="감사 로그 UUID")
    tax_result_id: Optional[str] = Field(None, description="정산 결과 UUID")
    sequence: int = Field(default=1, description="계산 순서 번호 (1부터 순차 증가)")
    sequence_order: int = Field(default=1, description="계산 순서 번호 (호환용)")
    step: int = Field(default=1, description="계산 단계 (1~7)")
    step_name: str = Field(..., description="연산 단계명")
    calculation_type: Optional[str] = Field(None, description="계산 분류 유형 (INCOME, DEDUCTION, TAX_BASE, TAX_RATE, TAX_CREDIT, FINAL_TAX, REFUND)")
    input_snapshot: Optional[Dict[str, Any]] = Field(default_factory=dict, description="계산에 사용된 입력값 스냅샷 (PII 마스킹 완료)")
    base_value: Optional[int] = Field(None, description="기준 금액")
    formula: Optional[str] = Field(None, description="적용 계산식")
    legal_formula: Optional[str] = Field(None, description="적용 법조문 및 산식 설명")
    output_value: Optional[int] = Field(None, description="계산 결과 금액")
    calculated_amount: Optional[int] = Field(None, description="산출/공제 금액")
    output_snapshot: Optional[Dict[str, Any]] = Field(default_factory=dict, description="계산 결과 스냅샷")
    legal_basis: Optional[str] = Field(None, description="적용 법령/공제 기준 (예: 소득세법 제47조)")
    explanation: Optional[str] = Field(None, description="사용자 친화적 설명")
    created_at: Optional[str] = Field(None, description="기록 일시")
    logged_at: Optional[str] = Field(None, description="기록 일시 (호환용)")


class AuditLogResponse(BaseModel):
    """감사 로그 조회 응답 DTO"""
    session_id: str = Field(..., description="세션 UUID")
    tax_result_id: Optional[str] = Field(None, description="정산 결과 UUID")
    total_steps: int = Field(0, description="기록된 총 연산 단계 수")
    logs: List[AuditLogItem] = Field(default_factory=list, description="단계별 감사 로그 목록")


class TaxResultDetailResponse(BaseModel):
    """최종 정산 결과 상세 응답 DTO"""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="정산 결과 UUID")
    session_id: str = Field(..., description="세션 UUID")
    total_gross_salary: int
    earned_income_deduction: int
    earned_income_amount: int
    total_personal_deduction: int
    total_pension_deduction: int
    total_special_income_deduction: int
    total_other_income_deduction: int
    taxable_standard: int
    calculated_tax: int
    tax_credits_total: int
    final_decision_tax: int
    total_prepaid_tax: int
    final_refund_amount: int
    is_refund: bool
    calculated_at: str
    audit_logs: List[AuditLogItem] = Field(default_factory=list)
