"""FAISS 기반 Vector Store 관리 모듈 (FAISSVectorStoreManager)
- LangChain FAISS VectorStore 연동
- 국세청 세법 마크다운 문서 인덱싱, 영속화 및 유사도 검색
- OpenAI Embeddings 및 결정론적 로컬 임베딩(오프라인/테스트) 완비
"""
from __future__ import annotations

import hashlib
import math
import os
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_community.vectorstores import FAISS

from backend.core.config import settings
from backend.rag.loader import MarkdownDocumentLoader
from backend.rag.splitter import TaxDocumentSplitter


class DeterministicTaxEmbeddings(Embeddings):
    """오프라인 및 테스트 환경에서 100% 재현 가능한 결정론적 384차원 텍스트 임베딩
    - 주요 세법 키워드 및 N-gram 해시 투영 기반 코사인 유사도 보장
    """

    def __init__(self, dimension: int = 384):
        self.dimension = dimension

    def _text_to_vector(self, text: str) -> List[float]:
        vec = [0.0] * self.dimension
        if not text:
            return vec

        # 한글/영문/숫자 토큰화
        tokens = re.findall(r"[\w가-힣]+", text.lower())
        if not tokens:
            return vec

        for token in tokens:
            # 토큰별 해시 슬롯 3개 활성화
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx1 = h % self.dimension
            idx2 = (h >> 16) % self.dimension
            idx3 = (h >> 32) % self.dimension
            weight = 1.0 + math.log(1.0 + len(token))

            vec[idx1] += weight
            vec[idx2] += weight * 0.5
            vec[idx3] += weight * 0.25

        # L2 정규화 (코사인 유사도 연산 최적화)
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._text_to_vector(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._text_to_vector(text)


def get_default_embeddings() -> Embeddings:
    """환경 변수에 따라 OpenAI 또는 결정론적 로컬 임베딩 객체 반환"""
    if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.startswith("sk-"):
        try:
            from langchain_openai import OpenAIEmbeddings
            return OpenAIEmbeddings(
                openai_api_key=settings.OPENAI_API_KEY,
                model="text-embedding-3-small"
            )
        except Exception:
            pass
    return DeterministicTaxEmbeddings(dimension=384)


class FAISSVectorStoreManager:
    """FAISS 기반 국세청 세법 지식베이스 인덱스 매니저
    """

    def __init__(
        self,
        persist_dir: Union[str, Path] = "rag_data/vector",
        index_name: str = "tax_faiss_index",
        embeddings: Optional[Embeddings] = None,
    ):
        self.persist_dir = Path(persist_dir)
        self.index_name = index_name
        self.embeddings = embeddings or get_default_embeddings()
        self.vector_store: Optional[FAISS] = None

    def build_from_markdown(
        self,
        markdown_dir: Union[str, Path] = "rag_data/markdown",
        chunk_size: int = 800,
        chunk_overlap: int = 150,
    ) -> FAISS:
        """마크다운 디렉터리로부터 문서를 읽고 분할하여 FAISS 인덱스를 생성합니다."""
        loader = MarkdownDocumentLoader(data_dir=markdown_dir)
        raw_docs = loader.load()

        if not raw_docs:
            # 기본 Fallback 도큐먼트
            raw_docs = [
                Document(
                    page_content="2025년 귀속 연말정산 신고안내 기본 지침",
                    metadata={"title": "연말정산 기본", "page": 1, "section": "일반"}
                )
            ]

        splitter = TaxDocumentSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        split_docs = splitter.split_documents(raw_docs)

        self.vector_store = FAISS.from_documents(split_docs, self.embeddings)
        self.save()
        return self.vector_store

    def save(self) -> None:
        """현재 인덱스를 디렉터리에 영속화합니다."""
        if self.vector_store is None:
            raise ValueError("영속화할 FAISS VectorStore 인스턴스가 존재하지 않습니다.")
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self.vector_store.save_local(
            folder_path=str(self.persist_dir),
            index_name=self.index_name
        )

    def load(self) -> bool:
        """디렉터리로부터 저장된 FAISS 인덱스를 로드합니다."""
        faiss_file = self.persist_dir / f"{self.index_name}.faiss"
        pkl_file = self.persist_dir / f"{self.index_name}.pkl"

        if not (faiss_file.exists() and pkl_file.exists()):
            return False

        try:
            self.vector_store = FAISS.load_local(
                folder_path=str(self.persist_dir),
                embeddings=self.embeddings,
                index_name=self.index_name,
                allow_dangerous_deserialization=True,
            )
            # 저장된 인덱스와 현재 임베딩의 차원이 다르면(예: OpenAI ↔ 로컬 임베딩 전환) 재색인
            expected_dim = len(self.embeddings.embed_query("차원 확인"))
            if getattr(self.vector_store.index, "d", expected_dim) != expected_dim:
                print(f"FAISS 인덱스 차원 불일치 ({self.vector_store.index.d} != {expected_dim}) → 재색인")
                self.vector_store = None
                return False
            return True
        except Exception as e:
            print(f"FAISS 로드 실패 (재색인 필요): {e}")
            return False

    def get_or_create(
        self,
        markdown_dir: Union[str, Path] = "rag_data/markdown",
        force_rebuild: bool = False
    ) -> FAISS:
        """인덱스가 존재하면 로드하고, 없거나 재생성 플래그 활성화 시 마크다운에서 빌드합니다."""
        if not force_rebuild and self.load():
            return self.vector_store

        return self.build_from_markdown(markdown_dir=markdown_dir)

    def similarity_search(
        self,
        query: str,
        k: int = 3,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        """쿼리와 가장 유사한 k개의 문서를 검색합니다."""
        if self.vector_store is None:
            self.get_or_create()

        return self.vector_store.similarity_search(query, k=k, filter=filter_dict)

    def similarity_search_with_score(
        self,
        query: str,
        k: int = 3,
    ) -> List[Tuple[Document, float]]:
        """유사도 점수와 함께 k개의 문서를 반환합니다."""
        if self.vector_store is None:
            self.get_or_create()

        return self.vector_store.similarity_search_with_score(query, k=k)
