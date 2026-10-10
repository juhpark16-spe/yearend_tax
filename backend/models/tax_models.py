"""연말정산 데이터베이스 ORM 모델 브릿지 모듈 (하위 호환 유지)
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
    "User",
    "TaxSession",
    "TaxSessionStatus",
    "Document",
    "DocumentType",
    "Dependent",
    "FamilyMember",
    "RelationType",
    "ExpenseDeduction",
    "Deduction",
    "WorkplaceIncome",
    "WorkplaceType",
    "TaxResult",
    "AuditLog",
]
