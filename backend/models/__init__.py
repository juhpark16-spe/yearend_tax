"""Models Package - AI 셀프 연말정산 데이터베이스 ORM 모델
- ERD_v1.0.md 명세 준수
"""
from backend.models.user import User
from backend.models.session import TaxSession, TaxSessionStatus
from backend.models.document import Document, DocumentType
from backend.models.family_member import Dependent, FamilyMember, RelationType
from backend.models.deduction import (
    ExpenseDeduction,
    Deduction,
    WorkplaceIncome,
    WorkplaceType,
)
from backend.models.tax_result import TaxResult
from backend.models.audit_log import AuditLog

__all__ = [
    # 엔티티 클래스
    "User",
    "TaxSession",
    "Document",
    "Dependent",
    "FamilyMember",
    "ExpenseDeduction",
    "Deduction",
    "WorkplaceIncome",
    "TaxResult",
    "AuditLog",
    # 열거형 Enum
    "TaxSessionStatus",
    "DocumentType",
    "RelationType",
    "WorkplaceType",
]
