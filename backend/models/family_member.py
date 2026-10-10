"""부양가족 정보 ORM 모델 (Dependents / FamilyMembers)
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.session import TaxSession


class RelationType(str, enum.Enum):
    """부양가족 관계 구분 Enum
    """
    SELF = "SELF"
    SPOUSE = "SPOUSE"
    PARENT = "PARENT"
    CHILD = "CHILD"
    SIBLING = "SIBLING"


class Dependent(Base):
    """부양가족 인적공제 레코드 모델 (Dependents)
    - ERD: Dependents 테이블 명세 준수
    """
    __tablename__ = "dependents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="부양가족 레코드 식별자"
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tax_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="정산 세션 ID"
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="가족 성명"
    )
    relation: Mapped[RelationType] = mapped_column(
        Enum(RelationType, native_enum=False, length=20),
        nullable=False,
        comment="관계 코드 (SELF, SPOUSE, PARENT, CHILD, SIBLING)"
    )
    birth_date: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="생년월일 (YYYY-MM-DD)"
    )
    masked_identifier: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="마스킹된 주민식별문자열"
    )
    annual_income_amount: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
        comment="연간 소득금액 합계"
    )
    is_disabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="장애인 해당 여부"
    )
    is_basic_deduction: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="기본공제 대상 판정 여부"
    )
    is_elderly: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="경로우대 추가공제 대상 여부 (만 70세 이상)"
    )
    birth_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="당해 연도 출산/입양 순위 (1:첫째, 2:둘째, 3:셋째이상)"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        comment="생성 일시"
    )

    # N:1 관계: TaxSession
    session: Mapped[TaxSession] = relationship(
        "TaxSession",
        back_populates="dependents"
    )

    # 하위 호환용 alias 프로퍼티
    @property
    def rrn_masked(self) -> Optional[str]:
        return self.masked_identifier

    @property
    def is_eligible(self) -> bool:
        return self.is_basic_deduction

    def __repr__(self) -> str:
        return f"<Dependent id={self.id} session_id={self.session_id} name={self.name} relation={self.relation}>"


# 기존 FamilyMember 클래스명과 완벽 호환
FamilyMember = Dependent
