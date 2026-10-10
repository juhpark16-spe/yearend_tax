"""소득 및 지출 공제 ORM 모델 (ExpenseDeductions & WorkplaceIncomes)
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    JSON,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.session import TaxSession


class WorkplaceType(str, enum.Enum):
    """근무지 구분 Enum
    """
    CURRENT = "CURRENT"      # 주(현) 근무지
    PREVIOUS = "PREVIOUS"    # 종(전) 근무지


class WorkplaceIncome(Base):
    """근무지 소득 레코드 모델 (WorkplaceIncomes)
    - ERD: WorkplaceIncomes 테이블 명세 준수
    """
    __tablename__ = "workplace_incomes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="근무지 소득 레코드 식별자"
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tax_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="정산 세션 ID"
    )
    workplace_type: Mapped[WorkplaceType] = mapped_column(
        Enum(WorkplaceType, native_enum=False, length=20),
        nullable=False,
        comment="근무지 구분 (CURRENT, PREVIOUS)"
    )
    company_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="사업체 상호명"
    )
    business_number: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="사업자등록번호 (XXX-XX-XXXXX)"
    )
    period_start: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="근무 시작일"
    )
    period_end: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="근무 종료일"
    )
    gross_salary: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
        comment="비과세 제외 총급여액"
    )
    non_taxable_salary: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
        comment="비과세 소득 총액"
    )
    prepaid_income_tax: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
        comment="기납부 소득세액 (종전근무지는 결정세액)"
    )
    prepaid_local_tax: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
        comment="기납부 지방소득세액"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        comment="생성 일시"
    )

    # N:1 관계: TaxSession
    session: Mapped[TaxSession] = relationship(
        "TaxSession",
        back_populates="workplace_incomes"
    )

    def __repr__(self) -> str:
        return f"<WorkplaceIncome id={self.id} session_id={self.session_id} company={self.company_name} type={self.workplace_type}>"


class ExpenseDeduction(Base):
    """지출 공제 명세 모델 (ExpenseDeductions)
    - ERD: ExpenseDeductions 테이블 명세 준수
    """
    __tablename__ = "expense_deductions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="지출 공제 명세 식별자"
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tax_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
        comment="정산 세션 ID"
    )

    # 공적연금 및 4대보험
    national_pension: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="국민연금 공적연금 납입액"
    )
    health_insurance: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="국민건강보험 및 노인장기요양보험료"
    )
    employment_insurance: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="고용보험료"
    )

    # 신용카드 등 사용금액
    credit_card_general: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="일반 신용카드 지출액"
    )
    debit_card_cash: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="체크카드 및 현금영수증 지출액"
    )
    market_transport: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="전통시장 및 대중교통 이용액"
    )
    culture_sports: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="도서공연 및 체육시설(수영/헬스) 지출액"
    )

    # 주택자금
    housing_rent_loan: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="주택임차차입금 원리금 상환액"
    )
    housing_subscription: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="주택청약종합저축 납입액"
    )
    mortgage_interest: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="장기주택저당차입금 이자상환액"
    )

    # 연금계좌
    personal_pension_saving: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="개인 연금저축 납입액"
    )
    irp_saving: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="퇴직연금(IRP) 추가 납입액"
    )

    # 특별세액공제 대상 지출
    medical_general: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="일반 부양가족 의료비"
    )
    medical_special: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="본인/65세이상/장애인 의료비"
    )
    education_child: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="취학전/초중고/대학생 교육비"
    )
    monthly_rent_paid: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="당해 과세연도 지급 월세액"
    )

    # 세부 원본 JSON
    raw_details: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="세부 지출 및 홈택스 파싱 JSON 내역"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="수정 일시"
    )

    # 1:1 관계: TaxSession
    session: Mapped[TaxSession] = relationship(
        "TaxSession",
        back_populates="expense_deductions"
    )

    # 하위 호환성용 alias 프로퍼티
    @property
    def card_amount(self) -> int:
        return self.credit_card_general + self.debit_card_cash

    @property
    def medical_amount(self) -> int:
        return self.medical_general + self.medical_special

    @property
    def education_amount(self) -> int:
        return self.education_child

    @property
    def housing_amount(self) -> int:
        return self.housing_rent_loan + self.housing_subscription + self.mortgage_interest

    def __repr__(self) -> str:
        return f"<ExpenseDeduction id={self.id} session_id={self.session_id}>"


# 기존 Deduction 클래스명과 완벽 호환
Deduction = ExpenseDeduction
