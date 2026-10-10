"""증빙 문서 ORM 모델 (Documents)
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import DateTime, Enum, Float, ForeignKey, JSON, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.session import TaxSession


class DocumentType(str, enum.Enum):
    """문서 분류 종류 Enum
    """
    HOMETAX = "HOMETAX"
    WITHHOLDING = "WITHHOLDING"
    RESIDENT = "RESIDENT"
    FAMILY = "FAMILY"


class Document(Base):
    """업로드 및 파싱된 증빙 문서 모델 (Documents)
    - ERD: Documents 테이블 명세 준수
    """
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="문서 레코드 식별자"
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tax_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="정산 세션 ID"
    )
    doc_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, native_enum=False, length=30),
        nullable=False,
        comment="문서 종류 (HOMETAX, WITHHOLDING, RESIDENT, FAMILY)"
    )
    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="업로드 원본 파일명"
    )
    confidence_score: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=1.0,
        comment="자동 분류 신뢰도 점수 (0.00 ~ 1.00)"
    )
    parsed_json: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="파싱 및 PII 마스킹 완료된 엔티티 JSON"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        comment="업로드 및 처리 일시"
    )

    # N:1 관계: TaxSession
    session: Mapped[TaxSession] = relationship(
        "TaxSession",
        back_populates="documents"
    )

    # 하위 호환성용 alias
    @property
    def file_name(self) -> str:
        return self.original_filename

    @property
    def confidence(self) -> int:
        return int((self.confidence_score or 1.0) * 100)

    def __repr__(self) -> str:
        return f"<Document id={self.id} session_id={self.session_id} doc_type={self.doc_type} filename={self.original_filename}>"
