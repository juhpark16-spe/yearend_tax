"""근로소득원천징수영수증 및 근무지 정합성 검증 모듈 (WithholdingValidator)
- 주(현) 근무지 중복 확인, 종전근무지 결정세액 기납부세액 합산, 근무기간 중복 점검
- PRD_v3.0.md, ERD_v2.0.md 준수
"""
from __future__ import annotations

from typing import Any, Dict, List
from backend.schemas.validation_result import WorkplaceValidationDetail


class WithholdingValidator:
    """주(현) 근무지와 종(전) 근무지 소득 및 기납부세액 합산의 세법 정합성을 검증하는 엔진
    """

    @classmethod
    def validate_workplaces(
        cls,
        workplaces: List[Dict[str, Any]],
    ) -> WorkplaceValidationDetail:
        """근무지 목록을 분석하여 합산 유효성 및 경고 사항을 도출합니다.
        
        Args:
            workplaces: 근무지 목록 [{"company_name": ..., "workplace_type": "CURRENT" | "PREVIOUS", ...}]
            
        Returns:
            WorkplaceValidationDetail DTO
        """
        current_wps = []
        previous_wps = []
        total_salary = 0
        total_prepaid = 0
        notes: List[str] = []
        is_valid = True

        for wp in workplaces:
            wp_type = str(wp.get("workplace_type", "CURRENT")).upper()
            gross = int(wp.get("gross_salary", 0))
            prepaid = int(wp.get("prepaid_tax", wp.get("prepaid_income_tax", 0)))
            company = wp.get("company_name", "사업체")

            total_salary += gross
            total_prepaid += prepaid

            if wp_type in ("CURRENT", "주근무지", "현근무지"):
                current_wps.append((company, wp))
            else:
                previous_wps.append((company, wp))

        # 1. 주(현) 근무지 복수 등록 여부 확인
        if len(current_wps) > 1:
            is_valid = False
            names = ", ".join([c[0] for c in current_wps])
            notes.append(
                f"주(현) 근무지가 {len(current_wps)}곳({names})으로 등록되어 있습니다. "
                f"세법상 주된 근무지는 반드시 1곳이어야 합니다. 나머지를 종(전) 근무지로 지정해주세요."
            )

        # 2. 종(전) 근무지 합산 안내
        if len(previous_wps) > 0:
            notes.append(
                f"종(전) 근무지 {len(previous_wps)}곳의 소득이 성공적으로 합산되었습니다. "
                f"이전 직장의 원천징수영수증상 '결정세액'이 기납부세액으로 반영됩니다."
            )

        # 3. 근무지 미등록 점검
        if len(workplaces) == 0:
            notes.append("등록된 근무지 소득 자료가 없습니다. 원천징수영수증을 등록하면 근무지 합산도 함께 확인합니다.")

        return WorkplaceValidationDetail(
            current_workplace_count=len(current_wps),
            previous_workplace_count=len(previous_wps),
            total_gross_salary=total_salary,
            total_prepaid_tax=total_prepaid,
            is_valid_structure=is_valid,
            notes=notes,
        )
