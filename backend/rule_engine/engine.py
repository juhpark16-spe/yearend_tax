"""통합 규칙 검증 엔진 (RuleEngine)
- Pure Python 규칙 기반 검증 (GPT 미사용)
- SQLAlchemy 모델 연동 및 Pydantic DTO (ValidationResult) 반환
- 부양가족, 중복공제, 근무지 합산, 누락공제 및 자가진단 체크리스트 통합 오케스트레이션
- PRD_v3.0.md, ERD_v2.0.md, API_v1.0.md 준수
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models.deduction import ExpenseDeduction, WorkplaceIncome
from backend.models.document import Document, DocumentType
from backend.models.family_member import Dependent
from backend.models.session import TaxSession
from backend.rule_engine.checklist_generator import ChecklistGenerator
from backend.rule_engine.duplicate_checker import DuplicateChecker
from backend.rule_engine.family_matcher import FamilyMatcher
from backend.rule_engine.resident_validator import ResidentValidator
from backend.rule_engine.withholding_validator import WithholdingValidator
from backend.schemas.validation_result import ValidationResult


class RuleEngine:
    """국세청 연말정산 서식 및 세법 적격성을 전수 판정하는 규칙 기반 엔진
    """

    def __init__(self, db: Optional[Session] = None):
        self.db = db
        self.family_matcher = FamilyMatcher()
        self.duplicate_checker = DuplicateChecker()
        self.resident_validator = ResidentValidator()
        self.withholding_validator = WithholdingValidator()
        self.checklist_generator = ChecklistGenerator()

    def validate_session(
        self,
        session_id: str,
        custom_dependents: Optional[List[Dict[str, Any]]] = None,
        custom_workplaces: Optional[List[Dict[str, Any]]] = None,
        custom_deductions: Optional[Dict[str, Any]] = None,
        is_spouse_working: bool = False,
    ) -> ValidationResult:
        """특정 정산 세션의 모든 서류와 공제 입력값을 종합 검증하여 ValidationResult를 반환합니다.
        
        Args:
            session_id: 정산 세션 UUID 문자열
            custom_dependents: 직접 전달된 부양가족 목록 (옵션)
            custom_workplaces: 직접 전달된 근무지 목록 (옵션)
            custom_deductions: 직접 전달된 공제 지출 내역 (옵션)
            is_spouse_working: 맞벌이 여부
            
        Returns:
            ValidationResult Pydantic DTO
        """
        sess_uuid = None
        try:
            sess_uuid = uuid.UUID(session_id)
        except (ValueError, AttributeError):
            pass

        session: Optional[TaxSession] = None
        if self.db and sess_uuid:
            session = self.db.query(TaxSession).filter(TaxSession.id == sess_uuid).first()

        tax_year = session.tax_year if session else 2025
        is_sme_youth = session.is_sme_youth if session else False
        is_newly_married = session.is_newly_married if session else False

        # -------------------------------------------------------------
        # 1. 부양가족 데이터 수집 및 적격성 검증 (ResidentValidator)
        # -------------------------------------------------------------
        target_dependents: List[Dict[str, Any]] = []
        if custom_dependents is not None:
            target_dependents = custom_dependents
        elif self.db and sess_uuid:
            db_deps = self.db.query(Dependent).filter(Dependent.session_id == sess_uuid).all()
            for d in db_deps:
                target_dependents.append({
                    "name": d.name,
                    "relation": d.relation.value if hasattr(d.relation, "value") else str(d.relation),
                    "birth_date": d.birth_date,
                    "annual_income": d.annual_income_amount,
                    "is_disabled": d.is_disabled,
                    "is_basic_deduction": bool(getattr(d, "is_basic_deduction", True)),
                })

        validated_dependents = self.resident_validator.validate_all(target_dependents, tax_year=tax_year)
        # 중복공제·등본 대조·누락공제는 실제로 기본공제를 신청한 가족만 대상으로 합니다.
        claimed_dependents = [d for d in target_dependents if d.get("is_basic_deduction", True)]

        # -------------------------------------------------------------
        # 2. 근무지 데이터 수집 및 합산 검증 (WithholdingValidator)
        # -------------------------------------------------------------
        target_workplaces: List[Dict[str, Any]] = []
        if custom_workplaces is not None:
            target_workplaces = custom_workplaces
        elif self.db and sess_uuid:
            db_wps = self.db.query(WorkplaceIncome).filter(WorkplaceIncome.session_id == sess_uuid).all()
            for w in db_wps:
                target_workplaces.append({
                    "company_name": w.company_name,
                    "workplace_type": w.workplace_type.value if hasattr(w.workplace_type, "value") else str(w.workplace_type),
                    "gross_salary": w.gross_salary,
                    "prepaid_tax": w.prepaid_income_tax,
                })

        workplace_summary = self.withholding_validator.validate_workplaces(target_workplaces)

        # -------------------------------------------------------------
        # 3. 공제 지출 데이터 수집
        # -------------------------------------------------------------
        target_deductions: Dict[str, Any] = {}
        if custom_deductions is not None:
            target_deductions = custom_deductions
        elif self.db and sess_uuid:
            db_exp = self.db.query(ExpenseDeduction).filter(ExpenseDeduction.session_id == sess_uuid).first()
            if db_exp:
                target_deductions = {
                    "credit_card_general": db_exp.credit_card_general,
                    "debit_card_cash": db_exp.debit_card_cash,
                    "medical_general": db_exp.medical_general,
                    "medical_special": db_exp.medical_special,
                    "monthly_rent_paid": db_exp.monthly_rent_paid,
                    "housing_subscription": db_exp.housing_subscription,
                }

        # -------------------------------------------------------------
        # 4. 등본 vs 간소화 가족 매칭 (FamilyMatcher)
        # -------------------------------------------------------------
        resident_members: List[Dict[str, Any]] = []
        if self.db and sess_uuid:
            res_doc = self.db.query(Document).filter(
                Document.session_id == sess_uuid,
                Document.doc_type == DocumentType.RESIDENT
            ).first()
            if res_doc and res_doc.parsed_json:
                resident_members = res_doc.parsed_json.get("members", [])

        is_matched, match_warnings, _ = self.family_matcher.match_family_members(
            resident_members=resident_members,
            hometax_dependents=claimed_dependents,
            listed_dependents=target_dependents,
        )

        # -------------------------------------------------------------
        # 5. 중복 공제 탐지 (DuplicateChecker)
        # -------------------------------------------------------------
        duplicates = self.duplicate_checker.check_all_duplicates(
            dependents=claimed_dependents,
            deductions=target_deductions,
            is_spouse_working=is_spouse_working
        )

        # -------------------------------------------------------------
        # 6. 체크리스트 및 누락공제 추천 생성 (ChecklistGenerator)
        # -------------------------------------------------------------
        checklist_questions, missing_deductions = self.checklist_generator.generate_all(
            total_salary=workplace_summary.total_gross_salary,
            dependents=claimed_dependents,
            deductions=target_deductions,
            is_sme_youth=is_sme_youth,
            is_newly_married=is_newly_married
        )

        # -------------------------------------------------------------
        # 7. 경고(Warnings) 및 오류(Errors) 집계
        # -------------------------------------------------------------
        all_warnings: List[str] = list(match_warnings)
        all_errors: List[str] = []

        # 근무지 관련 메모/경고 합산
        for note in workplace_summary.notes:
            all_warnings.append(note)

        # 부양가족 부적격 사유 오류화
        for dep in validated_dependents:
            if dep.claimed and not dep.is_basic_eligible:
                for r in dep.disqualification_reasons:
                    all_errors.append(f"[{dep.name}] {r}")

        # 중복 공제 결과 합산
        for dup in duplicates:
            # 메시지에 이미 [이름]이 들어 있으면 접두어를 다시 붙이지 않습니다.
            tag = f"[{dup.target_name}]"
            text = dup.message if tag in dup.message else f"{tag} {dup.message}"
            if dup.severity == "ERROR":
                all_errors.append(text)
            else:
                all_warnings.append(text)

        is_valid = len(all_errors) == 0

        # 기존 API 명세와의 하위 호환 details 구성
        details = {
            "dependents": [d.model_dump() for d in validated_dependents],
            "workplaces_summary": workplace_summary.model_dump(),
            "duplicates_count": len(duplicates),
            "missing_deductions_count": len(missing_deductions),
            "checklist_count": len(checklist_questions),
        }

        return ValidationResult(
            session_id=session_id,
            is_valid=is_valid,
            matched=is_matched,
            warnings=all_warnings,
            errors=all_errors,
            dependents=validated_dependents,
            workplace_summary=workplace_summary,
            duplicates=duplicates,
            missing_deductions=missing_deductions,
            checklist_questions=checklist_questions,
            details=details,
        )
