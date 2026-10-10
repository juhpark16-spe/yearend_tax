"""국세청 연말정산 안내서 RAG 검색 모듈 (RAGRetriever)
- LangChain FAISS VectorStore 기반 시맨틱 검색
- 핵심 공제 문서 메타데이터(출처 페이지, 법조문, 섹션 등) 기반 필터링 및 랭킹
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from langchain_core.documents import Document

from backend.rag.vector_store import FAISSVectorStoreManager


class RAGRetriever:
    """국세청 공식 자료 기반 RAG 검색기
    """

    def __init__(
        self,
        vector_store_path: Union[str, Path] = "rag_data/vector",
        index_name: str = "tax_faiss_index",
    ):
        self.vector_store_path = Path(vector_store_path)
        self.index_name = index_name
        self.manager = FAISSVectorStoreManager(
            persist_dir=self.vector_store_path,
            index_name=self.index_name,
        )
        # 인덱스가 없을 경우 자동 로드 또는 빌드
        self.manager.get_or_create()

    def retrieve(
        self,
        query: str,
        top_k: int = 3,
        section: Optional[str] = None,
    ) -> List[Document]:
        """쿼리와 가장 관련성이 높은 국세청 세법 Document 청크 목록을 반환합니다.
        
        Args:
            query: 세법 및 공제 요건 질의 (예: '월세 세액공제 요건')
            top_k: 검색할 상위 청크 수
            section: 공제 분류 필터 (선택)
            
        Returns:
            유사도 순 정렬된 LangChain Document 리스트
        """
        filter_dict = {"category": section} if section else None
        try:
            docs = self.manager.similarity_search(query, k=top_k, filter_dict=filter_dict)
            if docs:
                return docs
        except Exception:
            pass

        # 필터링 결과가 없거나 실패 시 전체 검색
        return self.manager.similarity_search(query, k=top_k)

    def search_tax_guideline(
        self,
        query: str,
        section: Optional[str] = None,
        top_k: int = 3,
    ) -> Dict[str, Any]:
        """국세청 가이드 본문 및 출처 페이지를 검색하여 구조화된 딕셔너리로 반환합니다.
        
        Args:
            query: 질의 내용
            section: 공제 분류 (옵션)
            top_k: 검색할 문서 수
            
        Returns:
            query, answer, source_page, legal_basis, section, title 등을 포함한 딕셔너리
        """
        docs = self.retrieve(query=query, top_k=top_k, section=section)

        if not docs:
            return {
                "query": query,
                "answer": "해당 공제 항목에 대한 국세청 가이드라인을 찾을 수 없습니다.",
                "source_page": 1,
                "legal_basis": "소득세법 및 조세특례제한법",
                "section": section or "일반",
                "title": "2025년 귀속 연말정산 신고안내",
                "confidence": 0.5,
                "context_documents": [],
            }

        top_doc = docs[0]
        meta = top_doc.metadata

        # 출처 페이지 및 법조문 추출
        source_page = int(meta.get("page", 1))
        title = meta.get("title", "2025년 귀속 연말정산 신고안내")
        sec = meta.get("section", section or "일반")
        category = meta.get("category", section or "공제안내")

        # 법조문 추출 (본문 첫머리 또는 메타데이터)
        legal_basis = meta.get("legal_basis", "")
        if not legal_basis:
            import re
            m = re.search(r"\((소득세법[^\)]+|조세특례제한법[^\)]+)\)", top_doc.page_content)
            legal_basis = m.group(1) if m else "소득세법 및 조세특례제한법"

        answer_text = (
            f"[{title}]\n\n"
            f"📌 관련 법조문: {legal_basis}\n\n"
            f"{top_doc.page_content}\n\n"
            f"※ 국세청 '2025년 귀속 연말정산 신고안내' 책자 p.{source_page} 발췌 기준"
        )

        return {
            "query": query,
            "answer": answer_text,
            "source_page": source_page,
            "legal_basis": legal_basis,
            "section": category,
            "title": title,
            "confidence": 0.95,
            "context_documents": [d.page_content for d in docs],
        }
