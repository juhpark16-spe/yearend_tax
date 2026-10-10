"""사용자 정보 ORM 모델 (Users)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.session import TaxSession


class User(Base):
    """사용자 정보 모델 (Users)
    - ERD: Users 테이블 명세 준수
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="사용자 고유 식별자"
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
        comment="사용자 이메일 (계정 식별)"
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="사용자 성명"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        comment="생성 일시"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="수정 일시"
    )

    # 1:N 관계: TaxSessions
    sessions: Mapped[list[TaxSession]] = relationship(
        "TaxSession",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} name={self.name}>"
