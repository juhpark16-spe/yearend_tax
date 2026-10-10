"""RAG + AI 설명 시스템 단위 테스트 (test_rag_system.py)
- LangChain, FAISS VectorStore, Markdown 로더 및 분할기 검증
- Tax Engine 계산 결과 주입 및 국세청 출처 페이지 명시 ExplanationDTO 검증
"""
import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.core.database import Base
from backend.models.user import User
from backend.models.session import TaxSession, TaxSessionStatus
from backend.models.deduction import WorkplaceIncome, WorkplaceType, ExpenseDeduction
from backend.rag.loader import MarkdownDocumentLoader
from backend.rag.splitter import TaxDocumentSplitter
from backend.rag.vector_store import (
    DeterministicTaxEmbeddings,
    FAISSVectorStoreManager,
)
from backend.rag.retriever import RAGRetriever
from backend.rag.explainer import TaxExplainer
from backend.ai.explanation_service import TaxExplanationService
from backend.schemas.explanation import ExplanationDTO


@pytest.fixture
def test_db():
    """In-memory SQLite DB Session 픽스처"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# =============================================================================
# 1. MarkdownDocumentLoader 테스트
# =============================================================================
def test_markdown_document_loader():
    """마크다운 문서 로드 및 YAML Frontmatter 메타데이터 파싱 검증"""
    loader = MarkdownDocumentLoader(data_dir="rag_data/markdown")
    docs = loader.load()

    assert len(docs) >= 5, "최소 5개 이상의 국세청 마크다운 문서가 로드되어야 합니다."

    # 월세액 문서 검증
    rent_docs = [d for d in docs if "monthly_rent" in d.metadata.get("filename", "")]
    assert len(rent_docs) == 1
    rent_doc = rent_docs[0]
    assert rent_doc.metadata["page"] == 24
    assert "8,000만 원" in rent_doc.page_content
    assert rent_doc.metadata["category"] == "월세액"


# =============================================================================
# 2. TaxDocumentSplitter 테스트
# =============================================================================
def test_tax_document_splitter():
    """청크 분할 시 메타데이터(출처 페이지, 제목) 보존 및 인덱스 부여 검증"""
    loader = MarkdownDocumentLoader(data_dir="rag_data/markdown")
    docs = loader.load()

    splitter = TaxDocumentSplitter(chunk_size=400, chunk_overlap=50)
    split_docs = splitter.split_documents(docs)

    assert len(split_docs) >= len(docs)
    for chunk in split_docs:
        assert "page" in chunk.metadata
        assert "chunk_index" in chunk.metadata
        assert chunk.metadata["page"] > 0
        assert len(chunk.page_content) > 0


# =============================================================================
# 3. DeterministicTaxEmbeddings & FAISSVectorStoreManager 테스트
# =============================================================================
def test_vector_store_build_and_search(tmp_path):
    """FAISS 인덱스 생성, 디렉터리 저장/로드 및 유사도 검색 검증"""
    embeddings = DeterministicTaxEmbeddings(dimension=384)
    q_vec = embeddings.embed_query("신용카드 소득공제")
    assert len(q_vec) == 384

    mgr = FAISSVectorStoreManager(
        persist_dir=tmp_path / "vector",
        index_name="test_index",
        embeddings=embeddings,
    )

    vs = mgr.build_from_markdown(markdown_dir="rag_data/markdown")
    assert vs is not None
    assert vs.index.ntotal > 0

    # 저장된 파일 확인
    assert (tmp_path / "vector" / "test_index.faiss").exists()
    assert (tmp_path / "vector" / "test_index.pkl").exists()

    # 검색 쿼리 실행
    search_results = mgr.similarity_search("월세액 세액공제", k=2)
    assert len(search_results) == 2
    assert any("월세" in doc.page_content for doc in search_results)


# =============================================================================
# 4. RAGRetriever 테스트
# =============================================================================
def test_rag_retriever():
    """RAGRetriever가 출처 페이지와 법조문이 포함된 국세청 문서를 정확히 반환하는지 검증"""
    retriever = RAGRetriever(vector_store_path="rag_data/vector")
    res = retriever.search_tax_guideline(query="월세 세액공제 요건", section="월세액")

    assert res["source_page"] == 24
    assert "월세" in res["answer"]
    assert res["confidence"] >= 0.8
    assert "2025" in res["title"]


# =============================================================================
# 5. TaxExplainer 및 ExplanationDTO 테스트
# =============================================================================
def test_tax_explainer_explanation_dto():
    """Tax Engine 계산 결과를 주입받아 ExplanationDTO(title, summary, reason, page, references) 생성 검증"""
    explainer = TaxExplainer()

    mock_tax_result = {
        "gross_salary": 50_000_000,
        "total_salary": 50_000_000,
        "earned_income_deduction": 12_250_000,
        "taxable_income": 36_250_000,
        "taxable_standard": 36_250_000,
        "calculated_tax": 4_177_500,
        "final_tax": 3_517_500,
        "final_decision_tax": 3_517_500,
        "prepaid_tax": 4_000_000,
        "refund_amount": -482_500,
        "final_refund_amount": -482_500,
    }

    dto = explainer.explain(
        tax_result=mock_tax_result,
        query="신용카드 공제액 산출 근거를 알려주세요.",
        category="신용카드",
    )

    assert isinstance(dto, ExplanationDTO)
    assert dto.title != ""
    assert dto.summary != ""
    assert dto.reason != ""
    assert isinstance(dto.page, int)
    assert dto.page > 0  # 출처 페이지 반드시 반환
    assert len(dto.references) > 0  # 참조 법조문 목록 반환


# =============================================================================
# 6. TaxExplanationService 엔드-투-엔드 세션 테스트
# =============================================================================
def test_explanation_service_with_db_session(test_db):
    """DB 세션과 연동하여 TaxResult 조회 및 AI 해설 DTO 파이프라인 검증"""
    # 1. 사용자 및 세션 생성
    user = User(email="ai_test@example.com", name="김해설")
    test_db.add(user)
    test_db.commit()

    tax_session = TaxSession(
        user_id=user.id,
        tax_year=2025,
        status=TaxSessionStatus.PARSED,
    )
    test_db.add(tax_session)
    test_db.commit()

    # 2. 급여 및 월세액 지출 등록
    workplace = WorkplaceIncome(
        session_id=tax_session.id,
        workplace_type=WorkplaceType.CURRENT,
        company_name="AI테크",
        gross_salary=48_000_000,
        prepaid_income_tax=1_200_000,
    )
    test_db.add(workplace)
    test_db.commit()

    # 3. 서비스 실행
    service = TaxExplanationService(db=test_db)
    dto = service.explain_tax_result_by_session(
        session_id=str(tax_session.id),
        category="월세액",
        user_question="월세 공제를 받으려면 어떤 조건이 필요한가요?",
    )

    assert isinstance(dto, ExplanationDTO)
    assert dto.page == 24  # 국세청 월세액 가이드 페이지
    assert "월세" in dto.title or "월세" in dto.summary
    assert len(dto.references) >= 1
