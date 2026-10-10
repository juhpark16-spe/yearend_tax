"""계산 감사 로그 ORM 모델 (AuditLogs)
- PRD_v3.0.md, SRS_v3.0.md, API_v1.0.md 준수
- 7단계 계산 증빙 및 세부 공제 항목별 역추적 지원
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.tax_result import TaxResult


class AuditLog(Base):
    """세액 계산 근거 및 감사 추적 모델 (AuditLogs)
    - 사용자에게 최종 환급금이 '왜 이 금액인지' 7단계로 증빙하는 데이터
    """
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="로그 고유 식별자"
    )
    tax_result_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tax_results.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="정산 결과 ID"
    )
    sequence_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="계산 순서 번호 (1부터 순차 증가)"
    )
    step: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="계산 단계 (1~7)"
    )
    step_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="연산 단계명 (예: 총급여액 산정, 근로소득공제)"
    )
    calculation_type: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="계산 분류 유형 (INCOME, DEDUCTION, TAX_BASE, TAX_RATE, TAX_CREDIT, FINAL_TAX, REFUND)"
    )
    input_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="계산에 사용된 입력값 스냅샷 (PII 마스킹 완료)"
    )
    base_value: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
        default=0,
        comment="기초 입력/기준 수치"
    )
    calculated_amount: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
        default=0,
        comment="산출 및 공제 금액"
    )
    output_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="계산 결과 스냅샷"
    )
    legal_formula: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="적용 법정 수식 및 한도 조항 설명"
    )
    legal_basis: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        comment="적용 법령/공제 기준 (예: 소득세법 제47조)"
    )
    explanation: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="사용자에게 보여줄 쉬운 설명"
    )
    metadata_json: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="추가 계산 메타데이터 JSON"
    )
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        comment="기록 일시"
    )

    # N:1 관계: TaxResult
    tax_result: Mapped[TaxResult] = relationship(
        "TaxResult",
        back_populates="audit_logs"
    )

    # 하위 호환성 및 편의용 alias 프로퍼티
    @property
    def sequence(self) -> int:
        return self.sequence_order

    @property
    def formula(self) -> Optional[str]:
        return self.legal_formula

    @property
    def output_value(self) -> Optional[int]:
        return self.calculated_amount

    @property
    def created_at(self) -> datetime:
        return self.logged_at

    @property
    def amount(self) -> Optional[int]:
        return self.calculated_amount

    @property
    def description(self) -> Optional[str]:
        return self.explanation or self.legal_formula

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} tax_result_id={self.tax_result_id} "
            f"seq={self.sequence_order} step={self.step} step_name={self.step_name}>"
        )
