"""RAG Package
- 국세청 공식 가이드 기반 출처 명시 RAG 시스템
"""
from backend.rag.loader import MarkdownDocumentLoader
from backend.rag.splitter import TaxDocumentSplitter
from backend.rag.vector_store import FAISSVectorStoreManager, DeterministicTaxEmbeddings
from backend.rag.retriever import RAGRetriever
from backend.rag.explainer import TaxExplainer
from backend.schemas.explanation import ExplanationDTO

__all__ = [
    "MarkdownDocumentLoader",
    "TaxDocumentSplitter",
    "FAISSVectorStoreManager",
    "DeterministicTaxEmbeddings",
    "RAGRetriever",
    "TaxExplainer",
    "ExplanationDTO",
]
