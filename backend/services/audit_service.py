"""정산 결과 및 감사 로그 서비스 (AuditService)
- PRD_v3.0.md, SRS_v3.0.md, API_v1.0.md 준수
- 7단계 계산 증빙(Audit Trail) 생성, 중복 방지, sequence 순서 보장 및 조회
- PII 실시간 인메모리 마스킹 적용 (주민등록번호 등 원본 노출 원천 차단)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from sqlalchemy.orm import Session

from backend.models.audit_log import AuditLog
from backend.models.tax_result import TaxResult
from backend.schemas.tax_schema import AuditLogItem
from backend.security.pii_mask import PIIMasker


class AuditService:
    """최종 세액 계산 결과 및 단계별 계산 근거(Audit Trail) 관리 서비스
    """

    def __init__(self, db: Session):
        self.db = db

    def get_tax_result(self, identifier: str) -> Optional[TaxResult]:
        """세션 UUID 또는 정산 결과 UUID로 TaxResult를 조회합니다.
        """
        try:
            target_uuid = uuid.UUID(identifier)
        except (ValueError, AttributeError):
            return None

        # 1. session_id로 조회 시도
        res = self.db.query(TaxResult).filter(TaxResult.session_id == target_uuid).first()
        if res:
            return res

        # 2. tax_result_id(id)로 조회 시도
        return self.db.query(TaxResult).filter(TaxResult.id == target_uuid).first()

    def get_audit_logs(self, identifier: str) -> List[AuditLog]:
        """세션 ID 또는 TaxResult ID로 기록된 모든 단계별 계산 근거 로그를 순서대로 조회합니다.
        - sequence_order 기준 오름차순 정렬 보장
        """
        tax_result = self.get_tax_result(identifier)
        if not tax_result:
            return []

        return (
            self.db.query(AuditLog)
            .filter(AuditLog.tax_result_id == tax_result.id)
            .order_by(AuditLog.sequence_order.asc())
            .all()
        )

    def _sanitize_snapshot(self, data: Any) -> Any:
        """스냅샷 데이터 내 주민등록번호 등 PII 민감 정보를 재귀적으로 마스킹합니다."""
        if isinstance(data, dict):
            return {k: self._sanitize_snapshot(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._sanitize_snapshot(v) for v in data]
        elif isinstance(data, str):
            return PIIMasker.mask_rrn(data, mode="omitted")
        return data

    def create_audit_log_entry(
        self,
        tax_result_id: uuid.UUID,
        sequence_order: int,
        step: int,
        step_name: str,
        calculation_type: Optional[str] = None,
        input_snapshot: Optional[Dict[str, Any]] = None,
        base_value: Optional[int] = 0,
        calculated_amount: Optional[int] = 0,
        output_snapshot: Optional[Dict[str, Any]] = None,
        legal_formula: Optional[str] = None,
        legal_basis: Optional[str] = None,
        explanation: Optional[str] = None,
        metadata_json: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """단일 감사 로그 레코드를 생성하여 DB 세션에 추가합니다 (Commit은 호출자가 일괄 트랜잭션으로 처리)."""
        safe_input = self._sanitize_snapshot(input_snapshot) if input_snapshot else {}
        safe_output = self._sanitize_snapshot(output_snapshot) if output_snapshot else {}
        safe_meta = self._sanitize_snapshot(metadata_json) if metadata_json else {}

        log_entry = AuditLog(
            tax_result_id=tax_result_id,
            sequence_order=sequence_order,
            step=step,
            step_name=step_name,
            calculation_type=calculation_type,
            input_snapshot=safe_input,
            base_value=base_value,
            calculated_amount=calculated_amount,
            output_snapshot=safe_output,
            legal_formula=legal_formula,
            legal_basis=legal_basis,
            explanation=explanation,
            metadata_json=safe_meta,
            logged_at=datetime.now(timezone.utc),
        )
        self.db.add(log_entry)
        return log_entry

    def record_audit_logs(
        self,
        tax_result_id: uuid.UUID,
        steps_data: List[Dict[str, Any]],
        replace: bool = True,
    ) -> List[AuditLog]:
        """복수의 계산 단계 감사 로그를 원자적으로 기록합니다.
        - replace=True 시 기존 기록된 AuditLog를 삭제하여 재계산 시 중복을 방지합니다.
        - sequence_order는 1부터 순차적으로 부여됩니다.
        """
        if replace:
            self.db.query(AuditLog).filter(AuditLog.tax_result_id == tax_result_id).delete()
            self.db.flush()

        created_logs: List[AuditLog] = []
        for idx, item in enumerate(steps_data, start=1):
            log = self.create_audit_log_entry(
                tax_result_id=tax_result_id,
                sequence_order=item.get("sequence_order") or item.get("seq") or idx,
                step=item.get("step") if isinstance(item.get("step"), int) else item.get("step_number", 1),
                step_name=item.get("step_name") or item.get("name") or str(item.get("step", f"단계 {idx}")),
                calculation_type=item.get("calculation_type"),
                input_snapshot=item.get("input_snapshot") or item.get("inputs"),
                base_value=item.get("base_value") or item.get("base", 0),
                calculated_amount=item.get("calculated_amount") or item.get("output_value") or item.get("amount", 0),
                output_snapshot=item.get("output_snapshot") or item.get("outputs"),
                legal_formula=item.get("legal_formula") or item.get("formula"),
                legal_basis=item.get("legal_basis"),
                explanation=item.get("explanation"),
                metadata_json=item.get("metadata_json") or item.get("meta"),
            )
            created_logs.append(log)

        return created_logs

    @staticmethod
    def to_item_dto(log: AuditLog) -> AuditLogItem:
        """AuditLog ORM 모델을 AuditLogItem Pydantic DTO로 변환합니다."""
        return AuditLogItem(
            id=str(log.id),
            tax_result_id=str(log.tax_result_id),
            sequence=log.sequence_order,
            sequence_order=log.sequence_order,
            step=log.step,
            step_name=log.step_name,
            calculation_type=log.calculation_type,
            input_snapshot=log.input_snapshot or {},
            base_value=log.base_value,
            formula=log.legal_formula,
            legal_formula=log.legal_formula,
            output_value=log.calculated_amount,
            calculated_amount=log.calculated_amount,
            output_snapshot=log.output_snapshot or {},
            legal_basis=log.legal_basis,
            explanation=log.explanation,
            created_at=log.logged_at.isoformat() if log.logged_at else None,
            logged_at=log.logged_at.isoformat() if log.logged_at else None,
        )
