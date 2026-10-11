"""등본 및 간소화 가족 구성원 정합성 매칭 모듈 (FamilyMatcher)
- 주민등록등본 세대원과 국세청 간소화 제공 동의자 간의 명단 대조 및 일치 판정
- PRD_v3.0.md 준수
"""
from __future__ import annotations

from typing import Any, Dict, List, Set, Tuple


class FamilyMatcher:
    """주민등록표 등본상의 세대 구성원과 홈택스 간소화상 공제 대상 가족 구성원을 교차 검증하는 모듈
    """

    @classmethod
    def match_family_members(
        cls,
        resident_members: List[Dict[str, Any]],
        hometax_dependents: List[Dict[str, Any]],
    ) -> Tuple[bool, List[str], List[str]]:
        """등본 구성원과 홈택스 간소화 등록 인원을 비교하여 일치 여부와 유의사항을 도출합니다.
        
        Args:
            resident_members: 등본 파싱 결과 세대원 목록 [{"name": "홍길동", "relation": "SELF", ...}]
            hometax_dependents: 간소화/수기 등록된 부양가족 목록 [{"name": "홍길동", ...}]
            
        Returns:
            Tuple[일치여부(bool), 경고메시지목록(List[str]), 불일치인물명단(List[str])]
        """
        warnings: List[str] = []
        unmatched_names: List[str] = []

        # 등본(RESIDENT)이 업로드되지 않았다면 대조할 기준이 없으므로 판정하지 않습니다.
        if not resident_members:
            return True, [], []

        resident_names: Set[str] = {m.get("name", "").strip() for m in resident_members if m.get("name")}
        hometax_names: Set[str] = {d.get("name", "").strip() for d in hometax_dependents if d.get("name")}
        relation_of: Dict[str, str] = {
            d.get("name", "").strip(): str(d.get("relation", "")).upper()
            for d in hometax_dependents if d.get("name")
        }

        # 1. 간소화에는 있으나 등본에 없는 가족 (주민등록상 별거 부모님 등)
        separated_family = sorted(hometax_names - resident_names)
        for name in separated_family:
            rel = relation_of.get(name, "")
            if rel == "SELF":
                # 본인은 동거 요건 대상이 아니므로 명단 누락(파싱 누락 등)만 알립니다.
                continue
            unmatched_names.append(name)
            if rel in ("PARENT", "GRANDPARENT", "부모", "직계존속"):
                hint = "주거 형편상 별거 중이더라도 실제로 부양하는 직계존속이면 공제받을 수 있습니다."
            elif rel in ("SPOUSE", "CHILD", "배우자", "자녀", "직계비속"):
                hint = "배우자·직계비속은 주소가 달라도 공제받을 수 있으니 관계만 확인해주세요."
            else:
                hint = "형제자매 등은 원칙적으로 동거(일시퇴거 포함)해야 공제받을 수 있습니다."
            warnings.append(
                f"[{name}] 님은 주민등록등본상 세대 구성원에 포함되어 있지 않습니다. {hint}"
            )

        # 2. 등본에는 있으나 간소화 자료가 없는 가족 (조회 미동의자 등)
        missing_in_hometax = sorted(resident_names - hometax_names)
        for name in missing_in_hometax:
            warnings.append(
                f"주민등록등본상 동거 가족인 [{name}] 님의 국세청 간소화 자료가 등록되지 않았습니다. "
                f"홈택스에서 부양가족 자료제공 동의가 완료되었는지 확인 바랍니다."
            )

        # 등본과 간소화 명단이 완전히 일치하는지 여부
        is_matched = len(separated_family) == 0

        return is_matched, warnings, unmatched_names
