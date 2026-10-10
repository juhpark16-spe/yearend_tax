"""연말정산 결과 ORM 모델 (TaxResults)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.session import TaxSession
    from backend.models.audit_log import AuditLog


class TaxResult(Base):
    """최종 세액 및 환급액 산출 결과 모델 (TaxResults)
    - ERD: TaxResults 테이블 명세 준수
    """
    __tablename__ = "tax_results"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="정산 결과 식별자"
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tax_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
        comment="정산 세션 ID"
    )

    # 1. 소득금액
    total_gross_salary: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="합산 총급여액"
    )
    earned_income_deduction: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="근로소득공제액"
    )
    earned_income_amount: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="근로소득금액"
    )

    # 2. 소득공제
    total_personal_deduction: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="인적공제 합계"
    )
    total_pension_deduction: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="연금보험료공제 합계"
    )
    total_special_income_deduction: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="특별소득공제 합계"
    )
    total_other_income_deduction: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="그 밖의 소득공제 합계"
    )
    income_deduction_limit_excess: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="소득공제 종합한도 초과액 (2500만 초과분)"
    )

    # 3. 과세표준 및 산출세액
    taxable_standard: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="과세표준"
    )
    calculated_tax: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="산출세액"
    )

    # 4. 세액감면 및 세액공제
    tax_reduction_sme: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="중소기업 취업 청년 감면세액"
    )
    tax_credit_earned_income: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="근로소득세액공제"
    )
    tax_credit_child: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="자녀세액공제"
    )
    tax_credit_marriage: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="혼인세액공제 (50만원)"
    )
    tax_credit_pension_account: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="연금계좌세액공제"
    )
    tax_credit_special: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="특별세액공제 (보험/의료/교육/기부)"
    )
    tax_credit_monthly_rent: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="월세액 세액공제"
    )
    standard_tax_credit: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="적용 표준세액공제 (비교선택 시 13만원)"
    )

    # 5. 결정세액 및 정산 환급/납부액
    final_decision_tax: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="결정세액"
    )
    total_prepaid_tax: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="합산 기납부세액"
    )
    final_refund_amount: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False, comment="차감징수세액 (음수:환급, 양수:납부)"
    )
    calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        comment="계산 수행 일시"
    )

    # 1:1 관계: TaxSession
    session: Mapped[TaxSession] = relationship(
        "TaxSession",
        back_populates="tax_result"
    )

    # 1:N 관계: AuditLogs
    audit_logs: Mapped[list[AuditLog]] = relationship(
        "AuditLog",
        back_populates="tax_result",
        cascade="all, delete-orphan",
        order_by="AuditLog.sequence_order"
    )

    # 하위 호환성용 alias 프로퍼티
    @property
    def total_salary(self) -> int:
        return self.total_gross_salary

    @property
    def taxable_income(self) -> int:
        return self.taxable_standard

    @property
    def final_tax(self) -> int:
        return self.final_decision_tax

    @property
    def prepaid_tax(self) -> int:
        return self.total_prepaid_tax

    @property
    def refund_amount(self) -> int:
        return self.final_refund_amount

    def __repr__(self) -> str:
        return f"<TaxResult id={self.id} session_id={self.session_id} final_tax={self.final_decision_tax} refund={self.final_refund_amount}>"
