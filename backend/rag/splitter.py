"""마크다운 문서 분할 모듈 (TaxDocumentSplitter)
- LangChain TextSplitter 기반
- 국세청 문서의 헤더 구조 및 단락 의미 보존 분할
- 청크별 메타데이터(출처 페이지, 제목, 법조문 등) 상속 및 유지
"""
from __future__ import annotations

from typing import List, Optional
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


class TaxDocumentSplitter:
    """국세청 마크다운 세법 문서 전용 텍스트 분할기
    """

    def __init__(
        self,
        chunk_size: int = 800,
        chunk_overlap: int = 150,
        separators: Optional[List[str]] = None,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", " ", ""]

        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=self.separators,
        )

    def split_documents(self, documents: List[Document]) -> List[Document]:
        """LangChain Document 리스트를 분할하고 청크 메타데이터를 상속합니다.
        
        Args:
            documents: 분할할 원본 LangChain Document 리스트
            
        Returns:
            메타데이터가 보존된 분할된 Document 청크 리스트
        """
        split_docs: List[Document] = []

        for doc in documents:
            chunks = self._splitter.split_text(doc.page_content)
            for idx, chunk in enumerate(chunks):
                chunk_meta = dict(doc.metadata)
                chunk_meta["chunk_index"] = idx
                chunk_meta["total_chunks"] = len(chunks)

                split_docs.append(
                    Document(
                        page_content=chunk.strip(),
                        metadata=chunk_meta,
                    )
                )

        return split_docs
