"""개인정보보호(PII) 마스킹 모듈
원칙: 원본 주민등록번호 메모리 즉시 삭제, DB 저장 및 LLM 전달 금지
"""
import re


class PIIMasker:
    """주민등록번호 및 개인식별정보 마스킹 처리기
    """
    RRN_PATTERN = re.compile(r'(\d{6})[- ]?([1-4])\d{6}')

    @classmethod
    def mask_rrn(cls, text: str) -> str:
        """주민등록번호 뒷자리를 마스킹(예: 900101-1******)으로 변환합니다.
        
        Args:
            text: 원본 텍스트
            
        Returns:
            마스킹 처리된 텍스트
        """
        # 기능 구현 전 스켈레톤 상태
        return cls.RRN_PATTERN.sub(r'\1-\2******', text)

    @classmethod
    def mask_address(cls, address: str) -> str:
        """주소 정보를 시, 구 단위까지만 남기고 상세 주소를 마스킹합니다.
        
        Args:
            address: 원본 주소 문자열
            
        Returns:
            시, 구까지만 표기된 주소 문자열
        """
        # 기능 구현 전 스켈레톤 상태
        return address
