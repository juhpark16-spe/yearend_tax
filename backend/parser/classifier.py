"""문서 4종 자동 분류기 (DocumentClassifier)
- HOMETAX, WITHHOLDING, RESIDENT, FAMILY 자동 분류 및 신뢰도 산출
- PRD_v3.0.md, SRS_v3.0.md 준수
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple


class DocumentClassifier:
    """문서 본문 텍스트 및 파일명 키워드 가중치 기반 문서 자동 분류기
    """

    # 서식별 핵심 키워드 및 가중치 정의
    CLASSIFICATION_RULES: Dict[str, Dict[str, Any]] = {
        "WITHHOLDING": {
            "name": "근로소득 원천징수영수증",
            "strong_keywords": ["근로소득원천징수영수증", "근로소득 원천징수영수증", "원천징수의무자", "징수의무자"],
            "normal_keywords": ["총급여", "기납부세액", "결정세액", "소득세법 시행규칙 [별지 제24호서식]", "원천징수", "withholding", "주(현)", "종(전)"],
            "category": "소득/원천징수"
        },
        "HOMETAX": {
            "name": "국세청 홈택스 소득·세액공제 증명서",
            "strong_keywords": ["소득·세액공제증명서", "소득세액공제증명서", "연말정산간소화", "편리한 연말정산", "국세청장 직인"],
            "normal_keywords": ["국세청", "hometax", "간소화", "신용카드", "의료비", "보험료", "교육비", "주택자금", "연금저축"],
            "category": "소득·세액공제 증빙"
        },
        "RESIDENT": {
            "name": "주민등록표 등본",
            "strong_keywords": ["주민등록표등본", "주민등록표 등본", "주민등록표(등본)", "세대주와의 관계"],
            "normal_keywords": ["세대주", "세대구성원", "전입일자", "주민등록등본", "등본", "resident"],
            "category": "세대/인적공제 증빙"
        },
        "FAMILY": {
            "name": "가족관계증명서",
            "strong_keywords": ["가족관계증명서", "가족관계등록부", "등록기준지", "가족관계 증명서"],
            "normal_keywords": ["가족관계", "부모", "배우자", "자녀", "family", "기본증명서"],
            "category": "부양가족 가족관계 증빙"
        }
    }

    @classmethod
    def classify(cls, text: str, filename: str = "") -> Tuple[str, float, Dict[str, Any]]:
        """문서 텍스트와 파일명을 분석하여 최적의 서식 코드와 신뢰도를 반환합니다.
        
        Args:
            text: 문서 텍스트
            filename: 원본 파일명 (선택)
            
        Returns:
            Tuple[doc_type, confidence_score, meta_info]
        """
        combined = f"{filename} {text}".lower().replace(" ", "")
        raw_combined = f"{filename} {text}"

        scores: Dict[str, float] = {doc_type: 0.0 for doc_type in cls.CLASSIFICATION_RULES}

        # 파일명 기반 사전 가중치
        fn_lower = filename.lower()
        if "원천" in fn_lower or "withholding" in fn_lower:
            scores["WITHHOLDING"] += 3.0
        if "간소화" in fn_lower or "hometax" in fn_lower or "공제증명" in fn_lower:
            scores["HOMETAX"] += 3.0
        if "등본" in fn_lower or "resident" in fn_lower:
            scores["RESIDENT"] += 3.0
        if "가족" in fn_lower or "family" in fn_lower:
            scores["FAMILY"] += 3.0

        for doc_type, rule in cls.CLASSIFICATION_RULES.items():
            # 강한 키워드 매칭 (가중치 4.0)
            for kw in rule["strong_keywords"]:
                if kw in raw_combined or kw.replace(" ", "") in combined:
                    scores[doc_type] += 4.0

            # 일반 키워드 매칭 (가중치 1.0)
            for kw in rule["normal_keywords"]:
                if kw in raw_combined or kw.lower() in combined:
                    scores[doc_type] += 1.0

        # 최고 득점 서식 선별
        best_type = max(scores, key=scores.get)
        best_score = scores[best_type]

        if best_score >= 6.0:
            confidence = min(0.99, 0.90 + (best_score * 0.01))
        elif best_score >= 3.0:
            confidence = 0.85
        elif best_score >= 1.0:
            confidence = 0.70
        else:
            # 매칭 키워드가 매우 적을 때 기본값은 HOMETAX로 간주하되 낮은 신뢰도 부여
            best_type = "HOMETAX"
            confidence = 0.50

        rule_info = cls.CLASSIFICATION_RULES.get(best_type, {})
        meta = {
            "detected_name": rule_info.get("name", "미분류 서식"),
            "category": rule_info.get("category", "기타"),
            "all_scores": scores
        }

        return best_type, round(confidence, 2), meta
