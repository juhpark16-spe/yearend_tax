"""증빙 문서 업로드, 파싱 및 분류 서비스 (DocumentService)
- API_v1.0.md & ERD_v1.0.md 준수
"""
from __future__ import annotations

import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber
from sqlalchemy.orm import Session

from backend.models.document import Document, DocumentType
from backend.models.session import TaxSession, TaxSessionStatus
from backend.parser.classifier import DocumentClassifier
from backend.parser.extractor import DocumentEntityExtractor
from backend.parser.pdf_parser import PDFParser
from backend.security.pii_mask import PIIMasker


class DocumentService:
    """PDF 업로드, OCR/텍스트 추출, PII 마스킹 및 문서 4종 자동 분류 서비스
    """

    def __init__(self, db: Session):
        self.db = db
        self.masker = PIIMasker()
        self.pdf_parser = PDFParser()
        self.classifier = DocumentClassifier()
        self.extractor = DocumentEntityExtractor()

    def mask_pii(self, text: str) -> str:
        """주민등록번호 등 민감 정보를 [RRN Omitted] 형태로 안전하게 마스킹합니다.
        """
        return self.masker.mask_rrn(text, mode="omitted")

    def extract_text_from_pdf(self, file_bytes: bytes) -> str:
        """pdfplumber를 통해 PDF 바이너리에서 원문 텍스트를 추출합니다.
        """
        text, _ = self.pdf_parser.extract_text_with_pdfplumber(file_bytes)
        return text

    def classify_document(self, text: str, filename: str = "") -> Tuple[DocumentType, float, Dict[str, Any]]:
        """문서 텍스트와 파일명을 기반으로 4종(HOMETAX, WITHHOLDING, RESIDENT, FAMILY)으로 자동 분류합니다.
        """
        doc_type_str, conf, meta = self.classifier.classify(text, filename)
        doc_type = DocumentType[doc_type_str]
        return doc_type, conf, meta

    def extract_document_entities(self, text: str, doc_type: DocumentType) -> Dict[str, Any]:
        """문서 유형별 주요 금액 및 인적 사항 엔티티를 파싱합니다.
        """
        return self.extractor.extract(doc_type.value, text)

    def process_and_save_upload(
        self,
        session_id: str,
        filename: str,
        file_bytes: bytes,
    ) -> Document:
        """PDF 파일 업로드 시 텍스트 추출, PII 마스킹, 분류 및 DB 영속화를 한 번에 처리합니다.
        """
        sess_uuid = uuid.UUID(session_id)
        # 새로운 통합 PDFParser 호출
        parsed_doc = self.pdf_parser.parse_pdf(file_bytes, filename)
        doc_type_enum = DocumentType[parsed_doc.doc_type]

        # 같은 세션에 같은 파일(같은 이름·같은 서류 종류)을 다시 올리면 이전 분석 결과를 교체한다 (중복 누적 방지)
        for old in (
            self.db.query(Document)
            .filter(Document.session_id == sess_uuid, Document.original_filename == filename,
                    Document.doc_type == doc_type_enum)
            .all()
        ):
            self.db.delete(old)

        document = Document(
            session_id=sess_uuid,
            doc_type=doc_type_enum,
            original_filename=filename,
            confidence_score=parsed_doc.confidence_score,
            parsed_json=parsed_doc.extracted_entities,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(document)

        # 세션 상태 갱신 (UPLOADED -> PARSED)
        session = self.db.query(TaxSession).filter(TaxSession.id == sess_uuid).first()
        if session:
            session.status = TaxSessionStatus.PARSED
            session.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(document)
        return document

    def get_document(self, document_id: str) -> Optional[Document]:
        """문서 ID로 문서 조회
        """
        try:
            doc_uuid = uuid.UUID(document_id)
            return self.db.query(Document).filter(Document.id == doc_uuid).first()
        except (ValueError, AttributeError):
            return None
