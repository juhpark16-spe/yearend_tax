"""정산 세션 ORM 모델 (TaxSessions)
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.user import User
    from backend.models.document import Document
    from backend.models.family_member import Dependent
    from backend.models.deduction import ExpenseDeduction, WorkplaceIncome
    from backend.models.tax_result import TaxResult


class TaxSessionStatus(str, enum.Enum):
    """세션 진행 상태 Enum
    """
    UPLOADED = "UPLOADED"
    PARSED = "PARSED"
    CALCULATED = "CALCULATED"
    COMPLETED = "COMPLETED"


class TaxSession(Base):
    """연말정산 세션 모델 (TaxSessions)
    - ERD: TaxSessions 테이블 명세 준수
    """
    __tablename__ = "tax_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="정산 세션 식별자"
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="소유 사용자 ID"
    )
    tax_year: Mapped[int] = mapped_column(
        Integer,
        default=2025,
        nullable=False,
        comment="정산 대상 귀속 연도 (예: 2025)"
    )
    status: Mapped[TaxSessionStatus] = mapped_column(
        Enum(TaxSessionStatus, native_enum=False, length=20),
        default=TaxSessionStatus.UPLOADED,
        nullable=False,
        comment="진행 상태 (UPLOADED, PARSED, CALCULATED, COMPLETED)"
    )
    is_sme_youth: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="중소기업 청년 소득세 감면 대상 여부"
    )
    is_newly_married: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="당해 과세기간 혼인신고 여부"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        comment="세션 개설 일시"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="세션 최종 변경 일시"
    )

    # N:1 관계: User
    user: Mapped[User] = relationship(
        "User",
        back_populates="sessions"
    )

    # 1:N 관계: Documents
    documents: Mapped[list[Document]] = relationship(
        "Document",
        back_populates="session",
        cascade="all, delete-orphan"
    )

    # 1:N 관계: WorkplaceIncomes (근무지 소득 내역)
    workplace_incomes: Mapped[list[WorkplaceIncome]] = relationship(
        "WorkplaceIncome",
        back_populates="session",
        cascade="all, delete-orphan"
    )

    # 1:N 관계: Dependents (부양가족)
    dependents: Mapped[list[Dependent]] = relationship(
        "Dependent",
        back_populates="session",
        cascade="all, delete-orphan"
    )

    # 1:1 관계: ExpenseDeductions (지출 공제 명세)
    expense_deductions: Mapped[Optional[ExpenseDeduction]] = relationship(
        "ExpenseDeduction",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan"
    )

    # 1:1 관계: TaxResults (정산 결과)
    tax_result: Mapped[Optional[TaxResult]] = relationship(
        "TaxResult",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan"
    )

    # 하위 호환성용 alias 프로퍼티
    @property
    def family_members(self) -> list[Dependent]:
        return self.dependents

    @property
    def deductions(self) -> Optional[ExpenseDeduction]:
        return self.expense_deductions

    def __repr__(self) -> str:
        return f"<TaxSession id={self.id} user_id={self.user_id} tax_year={self.tax_year} status={self.status}>"
