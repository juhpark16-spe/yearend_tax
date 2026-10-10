"""마크다운 문서 로더 모듈 (MarkdownDocumentLoader)
- LangChain Document 구조 연동
- 국세청 신고안내 마크다운 및 YAML Frontmatter 메타데이터(출처 페이지, 법조문, 섹션 등) 추출
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import yaml
from langchain_core.documents import Document


class MarkdownDocumentLoader:
    """국세청 연말정산 안내서 마크다운 파일 로더
    """

    def __init__(self, data_dir: Union[str, Path] = "rag_data/markdown"):
        self.data_dir = Path(data_dir)

    @staticmethod
    def parse_frontmatter(content: str) -> Tuple[Dict[str, Any], str]:
        """YAML Frontmatter를 파싱하여 메타데이터와 순수 본문 분리"""
        frontmatter_pattern = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
        match = frontmatter_pattern.match(content)

        if match:
            fm_text = match.group(1)
            body = content[match.end():]
            try:
                metadata = yaml.safe_load(fm_text) or {}
            except Exception:
                metadata = {}
            return metadata, body
        return {}, content

    def load_file(self, file_path: Union[str, Path]) -> Document:
        """단일 마크다운 파일을 로드하여 LangChain Document로 반환"""
        path = Path(file_path)
        with open(path, "r", encoding="utf-8") as f:
            raw_content = f.read()

        metadata, body = self.parse_frontmatter(raw_content)

        # 기본 메타데이터 보강
        metadata.setdefault("source", str(path.resolve()))
        metadata.setdefault("filename", path.name)
        metadata.setdefault("title", path.stem)
        metadata.setdefault("category", path.stem)
        metadata.setdefault("page", int(metadata.get("page", 1)))
        metadata.setdefault("section", "일반")
        metadata.setdefault("document", "2025년 귀속 연말정산 신고안내")

        return Document(page_content=body.strip(), metadata=metadata)

    def load(self) -> List[Document]:
        """지정된 디렉터리의 모든 .md 파일을 로드하여 Document 리스트로 반환"""
        if not self.data_dir.exists():
            return []

        documents: List[Document] = []
        for file_path in sorted(self.data_dir.glob("*.md")):
            try:
                doc = self.load_file(file_path)
                documents.append(doc)
            except Exception as e:
                print(f"Error loading {file_path}: {e}")
                continue

        return documents
