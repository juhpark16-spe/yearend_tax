"""개인정보보호(PII) 실시간 인메모리 마스킹 모듈
- PRD_v3.0.md, SRS_v3.0.md 준수
- 주민등록번호 정규식: (?<![0-9])(\d{6})[- ]?([1-8]\d{6})(?![0-9])
- 원본 주민등록번호 메모리 즉시 마스킹, DB 저장 및 LLM 전달 원천 차단
"""
from __future__ import annotations

import re
from typing import Optional


class PIIMasker:
    """주민등록번호 및 개인식별정보(PII) 실시간 인메모리 마스킹 처리기
    """

    # SRS_v3.0.md 규격: 앞뒤 숫자 연속을 배제한 완벽한 13자리 주민등록번호 패턴
    # Group 1: 생년월일 6자리
    # Group 2: 뒷자리 7자리 (첫째자리는 1~8)
    RRN_PATTERN = re.compile(r'(?<![0-9])(\d{6})[- ]?([1-8]\d{6})(?![0-9])')

    # 성별 1자리 포함 패턴 (예: 900101-1****** 마스킹용)
    RRN_GENDER_PATTERN = re.compile(r'(?<![0-9])(\d{6})[- ]?([1-8])\d{6}(?![0-9])')

    # 전화번호 패턴 (010-XXXX-XXXX)
    PHONE_PATTERN = re.compile(r'(?<![0-9])(01[016789])[- ]?(\d{3,4})[- ]?(\d{4})(?![0-9])')

    # 이메일 패턴
    EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')

    @classmethod
    def mask_rrn(cls, text: str, mode: str = "omitted") -> str:
        """텍스트 내의 모든 주민등록번호를 즉시 마스킹합니다.
        
        Args:
            text: 원본 텍스트
            mode: "omitted" -> 'YYMMDD-[RRN Omitted]'
                  "asterisk" -> 'YYMMDD-G******' (G: 성별 지시자 1~8)
                  
        Returns:
            마스킹된 안전한 텍스트
        """
        if not text:
            return ""

        if mode == "asterisk":
            return cls.RRN_GENDER_PATTERN.sub(r'\1-\2******', text)
        else:
            # SRS_v3.0.md 표준: 뒷자리를 [RRN Omitted]로 치환
            return cls.RRN_PATTERN.sub(r'\1-[RRN Omitted]', text)

    @classmethod
    def mask_address(cls, address: str) -> str:
        """주소 정보를 시/도, 시/군/구 단위까지만 보존하고 상세 주소를 마스킹합니다.
        
        예시:
        - '서울특별시 강남구 테헤란로 123 4층' -> '서울특별시 강남구 [상세주소 마스킹]'
        - '경기도 성남시 분당구 판교역로 235' -> '경기도 성남시 분당구 [상세주소 마스킹]'
        """
        if not address:
            return ""

        # 시/도 + 시/군/구 패턴 추출
        addr_match = re.search(
            r'(([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도))\s+([가-힣]+(?:시|군|구)(?:\s+[가-힣]+구)?))',
            address
        )
        if addr_match:
            base_region = addr_match.group(1)
            return f"{base_region} [상세주소 마스킹]"

        # 매칭 실패 시 앞의 두 단어만 남기고 마스킹
        tokens = address.strip().split()
        if len(tokens) >= 2:
            return f"{tokens[0]} {tokens[1]} [상세주소 마스킹]"
        return address

    @classmethod
    def mask_phone(cls, text: str) -> str:
        """휴대폰 번호 중간 또는 뒷자리를 마스킹합니다 (예: 010-****-5678)."""
        if not text:
            return ""
        return cls.PHONE_PATTERN.sub(r'\1-****-\3', text)

    @classmethod
    def mask_all_pii(cls, text: str) -> str:
        """주민등록번호 및 주요 개인정보를 일괄 마스킹 처리합니다."""
        if not text:
            return ""
        masked = cls.mask_rrn(text, mode="omitted")
        masked = cls.mask_phone(masked)
        return masked
