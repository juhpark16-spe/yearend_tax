"""OCR 및 PDF 파싱 출력 데이터 스키마 (Pydantic DTO)
- PRD_v3.0.md, ERD_v2.0.md, API_v1.0.md 준수
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class WithholdingWorkplaceEntity(BaseModel):
    """원천징수영수증 근무지 및 소득 엔티티"""
    company_name: str = Field(default="", description="사업체 상호명")
    business_number: Optional[str] = Field(default=None, description="사업자등록번호")
    period_start: Optional[str] = Field(default=None, description="근무 시작일 (YYYY-MM-DD)")
    period_end: Optional[str] = Field(default=None, description="근무 종료일 (YYYY-MM-DD)")
    gross_salary: int = Field(default=0, description="비과세 제외 총급여액")
    non_taxable_salary: int = Field(default=0, description="비과세 소득 총액")
    prepaid_income_tax: int = Field(default=0, description="기납부 소득세 (종전지는 결정세액)")
    prepaid_local_tax: int = Field(default=0, description="기납부 지방소득세")


class HometaxDeductionEntity(BaseModel):
    """홈택스 소득·세액공제증명서 파싱 엔티티"""
    # 4대보험 & 공적연금
    national_pension: int = Field(default=0, description="국민연금 납입액")
    health_insurance: int = Field(default=0, description="건강보험료")
    employment_insurance: int = Field(default=0, description="고용보험료")
    # 신용카드 등
    credit_card_general: int = Field(default=0, description="일반 신용카드")
    debit_card_cash: int = Field(default=0, description="체크카드/현금영수증")
    market_transport: int = Field(default=0, description="전통시장/대중교통")
    culture_sports: int = Field(default=0, description="도서공연/체육시설(수영/헬스)")
    # 주택자금
    housing_rent_loan: int = Field(default=0, description="주택임차차입금 원리금")
    housing_subscription: int = Field(default=0, description="주택청약저축")
    mortgage_interest: int = Field(default=0, description="장기주택저당차입금 이자")
    # 연금계좌
    personal_pension_saving: int = Field(default=0, description="개인연금저축")
    irp_saving: int = Field(default=0, description="퇴직연금(IRP)")
    # 세액공제
    medical_general: int = Field(default=0, description="일반 의료비")
    medical_special: int = Field(default=0, description="본인/65세이상/장애인 의료비")
    education_child: int = Field(default=0, description="교육비")
    monthly_rent_paid: int = Field(default=0, description="지급 월세액")
    donation_amount: int = Field(default=0, description="기부금 납입액")


class ResidentFamilyMemberEntity(BaseModel):
    """주민등록등본 / 가족관계증명서 세대원 엔티티"""
    name: str = Field(..., description="성명")
    relation: str = Field(default="SELF", description="관계 (SELF, SPOUSE, PARENT, CHILD, SIBLING)")
    birth_date: Optional[str] = Field(default=None, description="생년월일 (YYYY-MM-DD)")
    masked_identifier: Optional[str] = Field(default=None, description="마스킹된 식별자")
    is_householder: bool = Field(default=False, description="세대주 여부")


class ResidentDocumentEntity(BaseModel):
    """주민등록표등본 종합 엔티티"""
    householder_name: Optional[str] = Field(default=None, description="세대주 성명")
    masked_address: Optional[str] = Field(default=None, description="시/구 단위 마스킹 주소지")
    members: List[ResidentFamilyMemberEntity] = Field(default_factory=list, description="세대 구성원 목록")


class OCRParsedDocument(BaseModel):
    """통합 OCR 파싱 결과 DTO"""
    model_config = ConfigDict(from_attributes=True)

    file_name: str = Field(..., description="원본 파일명")
    doc_type: str = Field(..., description="분류 유형 (HOMETAX, WITHHOLDING, RESIDENT, FAMILY, UNKNOWN)")
    confidence_score: float = Field(default=1.0, description="자동 분류 신뢰도 (0.00 ~ 1.00)")
    raw_text_masked: str = Field(default="", description="PII 마스킹 완료된 전체 텍스트")
    is_ocr_fallback: bool = Field(default=False, description="이미지 스캔본/Vision Fallback 발동 여부")
    parser_engine: str = Field(default="pdfplumber", description="사용된 파서 엔진 (pdfplumber, pypdf, gpt4o_vision)")
    page_count: int = Field(default=1, description="문서 페이지 수")
    extracted_entities: Dict[str, Any] = Field(default_factory=dict, description="구조화된 추출 엔티티 JSON")
    tables: List[List[List[Optional[str]]]] = Field(default_factory=list, description="추출된 표 데이터")
    parsed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="파싱 완료 일시"
    )
