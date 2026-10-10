"""부양가족 및 중도이직 적격성 검증 서비스 (ValidationService)
- API_v1.0.md 준수
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models.family_member import Dependent, RelationType
from backend.models.deduction import WorkplaceIncome, WorkplaceType
from backend.models.session import TaxSession
from backend.rule_engine.engine import RuleEngine


class ValidationService:
    """부양가족 공제 적격성 및 중도이직 근무지 합산 유효성 검증 서비스
    """

    def __init__(self, db: Session):
        self.db = db
        self.engine = RuleEngine(db=db)

    def validate_dependent(
        self,
        name: str,
        relation: str,
        birth_date: Optional[str] = None,
        annual_income: int = 0,
        is_disabled: bool = False,
        current_year: int = 2025,
    ) -> Dict[str, Any]:
        """부양가족 1인의 2025 세법상 기본공제 적격성을 판정합니다.
        
        규정:
        - 연간 소득금액 100만 원 이하 (근로소득만 있는 경우 총급여 500만 원 이하)
        - 나이 요건:
          * 배우자: 나이 제한 없음
          * 직계존속: 만 60세 이상 (2025년 기준 1965.12.31 이전 출생)
          * 직계비속(자녀): 만 20세 이하 (2025년 기준 2005.01.01 이후 출생)
          * 형제자매: 만 20세 이하 또는 만 60세 이상
          * 장애인: 나이 요건 무관 (소득 요건만 충족 시 공제 가능)
        """
        is_eligible = True
        reasons: List[str] = []

        rel_upper = relation.upper()

        # 1. 소득 요건 검증 (연간 소득금액 100만원 초과 여부)
        if annual_income > 1000000:
            is_eligible = False
            reasons.append(f"연간 소득금액({annual_income:,}원)이 법정 기준인 100만 원을 초과하여 기본공제 대상에서 제외됩니다.")

        # 2. 나이 계산
        age = None
        if birth_date:
            try:
                birth_year = int(birth_date.split("-")[0]) if "-" in birth_date else int(birth_date[:4])
                age = current_year - birth_year
            except (ValueError, IndexError):
                pass

        # 3. 관계별 나이 요건 검증 (장애인은 나이 제한 없음)
        if not is_disabled and age is not None:
            if rel_upper in ("CHILD", "자녀", "직계비속"):
                if age > 20:
                    is_eligible = False
                    reasons.append(f"자녀(만 {age}세)는 만 20세를 초과하여 기본공제 대상이 아닙니다 (장애인 제외).")
            elif rel_upper in ("PARENT", "부모", "직계존속"):
                if age < 60:
                    is_eligible = False
                    reasons.append(f"부모님(만 {age}세)은 만 60세 미만으로 기본공제 대상이 아닙니다 (장애인 제외).")
            elif rel_upper in ("SIBLING", "형제자매"):
                if 20 < age < 60:
                    is_eligible = False
                    reasons.append(f"형제자매(만 {age}세)는 만 20세 이하 또는 만 60세 이상 기준을 미충족합니다.")

        return {
            "name": name,
            "relation": relation,
            "age": age,
            "is_eligible": is_eligible,
            "reasons": reasons,
        }

    def validate_session_data(
        self,
        session_id: str,
        custom_dependents: Optional[List[Dict[str, Any]]] = None,
        custom_workplaces: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """세션에 등록된 부양가족 및 근무지 정보를 전수 검증합니다.
        새 RuleEngine 모듈과 연동하여 중복 공제, 누락 공제, 자가진단 질문도 일괄 생성합니다.
        """
        vr = self.engine.validate_session(
            session_id=session_id,
            custom_dependents=custom_dependents,
            custom_workplaces=custom_workplaces,
        )
        return {
            "is_valid": vr.is_valid,
            "matched": vr.matched,
            "warnings": vr.warnings,
            "errors": vr.errors,
            "details": vr.details,
            "missing_deductions": [m.model_dump() for m in vr.missing_deductions],
            "duplicates": [d.model_dump() for d in vr.duplicates],
            "checklist": [q.model_dump() for q in vr.checklist_questions],
        }
