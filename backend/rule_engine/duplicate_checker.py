"""중복 및 과다공제 탐지 모듈 (DuplicateChecker)
- 맞벌이 부부 자녀 중복공제, 형제자매 간 부모 중복공제, 형제자매 신용카드 공제 제외 등 검증
- PRD_v3.0.md 준수
"""
from __future__ import annotations

from typing import Any, Dict, List
from backend.schemas.validation_result import DuplicateCheckDetail


class DuplicateChecker:
    """국세청 연말정산 가산세 발생 위험이 높은 중복·과다공제를 사전에 탐지하는 검증기
    """

    @classmethod
    def check_all_duplicates(
        cls,
        dependents: List[Dict[str, Any]],
        deductions: Optional[Dict[str, Any]] = None,
        is_spouse_working: bool = False,
    ) -> List[DuplicateCheckDetail]:
        """부양가족 및 지출 항목에서 발생 가능한 중복 공제 위험을 전수 조사합니다.
        
        Args:
            dependents: 부양가족 목록
            deductions: 지출 공제 항목 (신용카드, 의료비 등)
            is_spouse_working: 배우자 근로/소득 유무 (맞벌이 여부)
            
        Returns:
            탐지된 중복 공제 상세 목록 (List[DuplicateCheckDetail])
        """
        duplicates: List[DuplicateCheckDetail] = []

        # 1. 맞벌이 부부의 동일 자녀 이중 기본공제 위험 점검
        if is_spouse_working:
            for dep in dependents:
                rel = str(dep.get("relation", "")).upper()
                name = dep.get("name", "자녀")
                if rel in ("CHILD", "자녀", "직계비속"):
                    duplicates.append(DuplicateCheckDetail(
                        rule_code="DUP_CHILD_SPOUSE",
                        target_name=name,
                        severity="WARNING",
                        message=(
                            f"[{name}] 자녀는 맞벌이 부부 중 한 사람만 기본공제 및 자녀세액공제를 받아야 합니다. "
                            f"배우자가 이미 공제 신청을 했는지 반드시 확인해주세요 (이중공제 시 가산세 부과)."
                        )
                    ))

        # 2. 형제자매 간 부모님 이중공제 주의 점검
        for dep in dependents:
            rel = str(dep.get("relation", "")).upper()
            name = dep.get("name", "부모님")
            if rel in ("PARENT", "부모", "직계존속"):
                duplicates.append(DuplicateCheckDetail(
                    rule_code="DUP_PARENT_SIBLING",
                    target_name=name,
                    severity="WARNING",
                    message=(
                        f"[{name}] 직계존속은 다른 형제자매가 이미 기본공제를 적용받지 않았는지 확인이 필요합니다. "
                        f"실제 주로 부양하는 1인만 공제받을 수 있습니다."
                    )
                ))

        # 3. 형제자매의 신용카드 지출액 공제 불가 점검
        has_sibling = any(str(d.get("relation", "")).upper() in ("SIBLING", "형제자매") for d in dependents)
        if has_sibling and deductions:
            card_total = (deductions.get("credit_card_general", 0) + deductions.get("debit_card_cash", 0))
            if card_total > 0:
                duplicates.append(DuplicateCheckDetail(
                    rule_code="DISALLOW_SIBLING_CARD",
                    target_name="형제자매 지출",
                    severity="WARNING",
                    message=(
                        "형제자매가 기본공제 대상자이더라도, 형제자매 명의의 신용카드/체크카드 사용금액은 "
                        "소득세법상 근로자의 신용카드 등 소득공제 대상에 합산할 수 없습니다."
                    )
                ))

        # 4. 동일 부양가족 중복 등록 점검 (이름 + 관계 중복)
        seen_names = set()
        for dep in dependents:
            name = dep.get("name", "").strip()
            if not name:
                continue
            if name in seen_names:
                duplicates.append(DuplicateCheckDetail(
                    rule_code="DUP_SAME_DEPENDENT",
                    target_name=name,
                    severity="ERROR",
                    message=f"동일한 부양가족 [{name}] 님이 중복 등록되어 있습니다."
                ))
            seen_names.add(name)

        return duplicates
