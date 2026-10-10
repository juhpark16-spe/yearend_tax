"""통합 PDF OCR 파서 모듈 (PDFParser)
- 1차: pdfplumber (텍스트 레이어 및 표 추출, 컨텍스트 매니저로 메모리 누수 방지)
- 2차: pypdf (pdfplumber 실패 시 보조 추출)
- 3차: 스캔본/촬영본 대비 GPT-4o Vision 클라우드 OCR Fallback (공백 제외 20자 미만 시)
- 원본 PDF 디스크 저장 절대 금지 (인메모리 io.BytesIO 처리)
- 추출 즉시 주민등록번호 인메모리 마스킹 처리
- PRD_v3.0.md, ERD_v2.0.md, API_v1.0.md 준수
"""
from __future__ import annotations

import io
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber
from pypdf import PdfReader

from backend.core.config import settings
from backend.parser.classifier import DocumentClassifier
from backend.parser.extractor import DocumentEntityExtractor
from backend.schemas.ocr_output import OCRParsedDocument
from backend.security.pii_mask import PIIMasker


class PDFParser:
    """국세청 연말정산 간소화 PDF, 원천징수영수증, 주민등록등본, 가족관계증명서 통합 파서
    """

    def __init__(self, openai_api_key: Optional[str] = None):
        self.masker = PIIMasker()
        self.classifier = DocumentClassifier()
        self.extractor = DocumentEntityExtractor()
        self.openai_api_key = openai_api_key or getattr(settings, "OPENAI_API_KEY", None) or os.getenv("OPENAI_API_KEY")

    def extract_text_with_pdfplumber(self, file_bytes: bytes) -> Tuple[str, List[List[List[Optional[str]]]]]:
        """pdfplumber를 컨텍스트 매니저로 감싸 메모리 누수 없이 텍스트와 표를 추출합니다.
        
        Returns:
            Tuple[추출 텍스트, 추출된 표 목록]
        """
        extracted_pages: List[str] = []
        all_tables: List[List[List[Optional[str]]]] = []

        # 메모리 누수 방지: 컨텍스트 매니저 강제
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted_pages.append(text)
                tables = page.extract_tables()
                if tables:
                    all_tables.extend(tables)

        full_text = "\n\n--- PAGE BREAK ---\n\n".join(extracted_pages)
        return full_text, all_tables

    def extract_text_with_pypdf(self, file_bytes: bytes) -> str:
        """pypdf를 사용하여 보조적으로 텍스트를 추출합니다."""
        extracted_pages: List[str] = []
        reader = PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            t = page.extract_text()
            if t:
                extracted_pages.append(t)
        return "\n\n--- PAGE BREAK ---\n\n".join(extracted_pages)

    def _call_vision_fallback(self, file_bytes: bytes, file_name: str) -> str:
        """스캔본/이미지형 PDF 감지 시 GPT-4o-mini Vision 클라우드 OCR 파이프라인으로 전환합니다.
        
        - pypdfium2를 통해 인메모리로 각 페이지를 렌더링 (디스크 저장 금지)
        - ThreadPoolExecutor를 사용해 병렬로 Vision API를 호출하여 처리 속도 극대화
        - 프롬프트에 주민등록번호 뒷자리 마스킹 지침 부여
        - 텍스트 길이가 공백 제외 20자 미만일 때 발동합니다.
        """
        api_key = self.openai_api_key or getattr(settings, "OPENAI_API_KEY", None) or os.getenv("OPENAI_API_KEY")
        if not api_key:
            return f"[스캔본 이미지 서류 감지: {file_name}] OpenAI API 키가 설정되지 않아 Vision OCR을 진행할 수 없습니다. 수기 확인이 필요합니다."

        try:
            import base64
            import concurrent.futures
            import pypdfium2 as pdfium
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
            pdf = pdfium.PdfDocument(file_bytes)
            total_pages = len(pdf)

            # 최대 20페이지까지 처리 (연말정산 간소화 자료 통상 분량)
            pages_to_process = min(total_pages, 20)

            # 1. 인메모리 이미지 렌더링 (pypdfium2 PdfDocument 객체는 메인 스레드에서 접근)
            page_b64_list: List[Tuple[int, str]] = []
            for i in range(pages_to_process):
                page = pdf[i]
                img = page.render(scale=1.5).to_pil()
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=80)
                page_b64_list.append((i, base64.b64encode(buf.getvalue()).decode("utf-8")))

            # 2. 개별 페이지 Vision OCR 호출 함수
            def ocr_single_page(item: Tuple[int, str]) -> Tuple[int, str]:
                idx, b64_img = item
                try:
                    resp = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    "당신은 국세청 연말정산 간소화 서식 전문 분석 OCR AI입니다.\n"
                                    "1. 첫 줄에 반드시 해당 서식의 표준 헤더(대괄호 포함)를 명시하세요: "
                                    "[건강보험료], [고용보험료], [국민연금보험료], [보장성 보험], [의료비], [교육비], [신용카드], [직불카드 등], [현금영수증], [주택자금], [월세액], [기부금], [연금계좌] 중 해당하는 것을 반드시 작성하세요. "
                                    "(직불/체크카드는 [직불카드 등], 주택마련저축/주택임차차입금은 [주택자금]으로 표기)\n"
                                    "2. 인적사항(성명, 주민등록번호)을 상단에 '성명: 홍길동', '주민등록번호: 750101-*******' 형태로 명확히 추출하세요.\n"
                                    "3. 현금영수증 서식은 [현금영수증 사용금액 집계]와 [현금영수증 사용내역]을 명확히 구분하여 첫 줄 헤더를 작성하세요.\n"
                                    "4. 해당 페이지의 '총합계', '인별합계금액', '합계금액'을 '인별합계금액: 000원', '총합계: 000원', '합계금액: 000원' 형태로 명확하게 기재하세요.\n"
                                    "5. 주민등록번호 뒷자리는 반드시 970412-******* 형태로 마스킹하세요."
                                )
                            },
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": f"국세청 연말정산 서류 [{file_name}]의 {idx+1}페이지 서식 헤더와 모든 항목명, 그리고 최종 합계/인별합계 금액을 텍스트로 충실히 추출해주세요."},
                                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}
                                ]
                            }
                        ],
                        max_tokens=1500
                    )
                    return idx, resp.choices[0].message.content or ""
                except Exception:
                    return idx, ""

            # 3. ThreadPoolExecutor로 병렬 호출
            max_workers = min(pages_to_process, 6)
            results = ["" for _ in range(pages_to_process)]
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [executor.submit(ocr_single_page, item) for item in page_b64_list]
                for future in concurrent.futures.as_completed(futures):
                    page_idx, text = future.result()
                    results[page_idx] = text

            valid_texts = [t for t in results if t.strip()]
            if valid_texts:
                return "\n\n--- PAGE BREAK ---\n\n".join(valid_texts)

        except Exception as e:
            pass

        # Vision API 호출 실패 또는 에러 시
        return f"[스캔본 이미지 서류 감지: {file_name}] 수기 입력 및 직접 확인이 필요한 서류입니다."

    def parse_pdf(self, file_bytes: bytes, file_name: str) -> OCRParsedDocument:
        """PDF 바이너리 스트림을 수신하여 텍스트 추출, 마스킹, 분류, 엔티티 구조화를 일괄 수행합니다.
        
        Args:
            file_bytes: 업로드된 PDF 원본 바이트 (메모리 내에서만 유지)
            file_name: 파일명
            
        Returns:
            OCRParsedDocument DTO
        """
        raw_text = ""
        tables: List[List[List[Optional[str]]]] = []
        parser_engine = "pdfplumber"
        is_ocr_fallback = False
        page_count = 1

        # 1. 1차 시도: pdfplumber 우선 사용 (컨텍스트 매니저로 메모리 누수 방지)
        try:
            raw_text, tables = self.extract_text_with_pdfplumber(file_bytes)
            # 페이지 수 카운트
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                page_count = len(pdf.pages)
        except Exception:
            raw_text = ""

        # 2. 2차 시도: 텍스트 추출 실패 시 pypdf 보조 사용
        clean_text_len = len(re.sub(r'\s+', '', raw_text))
        if clean_text_len < 20:
            try:
                pypdf_text = self.extract_text_with_pypdf(file_bytes)
                if len(re.sub(r'\s+', '', pypdf_text)) > clean_text_len:
                    raw_text = pypdf_text
                    parser_engine = "pypdf"
                    clean_text_len = len(re.sub(r'\s+', '', raw_text))
            except Exception:
                pass

        # 3. 3차 시도: 공백 제외 텍스트가 20자 미만인 경우 (스캔본/이미지 PDF) -> GPT-4o Vision fallback
        if clean_text_len < 20:
            is_ocr_fallback = True
            parser_engine = "gpt4o_vision"
            raw_text = self._call_vision_fallback(file_bytes, file_name)

        # 4. 즉시 PII 마스킹 (메모리 상에서 주민등록번호 즉각 마스킹)
        masked_text = self.masker.mask_rrn(raw_text, mode="omitted")

        # 5. 서식 4종 자동 분류 (classifier)
        doc_type, confidence, class_meta = self.classifier.classify(masked_text, file_name)

        # 6. 서식별 엔티티 추출 (extractor)
        entities = self.extractor.extract(doc_type, masked_text, filename=file_name, tables=tables)
        entities["classification_meta"] = class_meta
        entities["is_ocr_fallback"] = is_ocr_fallback

        return OCRParsedDocument(
            file_name=file_name,
            doc_type=doc_type,
            confidence_score=confidence,
            raw_text_masked=masked_text,
            is_ocr_fallback=is_ocr_fallback,
            parser_engine=parser_engine,
            page_count=page_count,
            extracted_entities=entities,
            tables=tables,
        )

    def classify_document(self, text: str, filename: str = "") -> Dict[str, Any]:
        """하위 호환성용 메서드: 텍스트 기반 분류 결과 사전 반환"""
        doc_type, conf, meta = self.classifier.classify(text, filename)
        return {
            "type": doc_type.lower(),
            "doc_type": doc_type,
            "confidence": conf,
            "meta": meta
        }
