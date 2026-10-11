"""FastAPI v1 API 라우터 구현
- API_v1.0.md 명세 및 엔드포인트 구현 (Upload, OCR, Validate, Calculate, RAG Search, Result, Audit)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import get_db
from backend.models.session import TaxSession, TaxSessionStatus
from backend.schemas.tax_schema import (
    AuditLogItem,
    AuditLogResponse,
    ChecklistQuestion,
    ChecklistResponse,
    DocumentClassifyResponse,
    DocumentOCRRequest,
    DocumentOCRResponse,
    DocumentUploadResponse,
    RAGSearchRequest,
    RAGSearchResponse,
    SessionCreateRequest,
    SessionInputsRequest,
    SessionInputsResponse,
    SessionResponse,
    TaxCalculateRequest,
    TaxCalculateResponse,
    TaxResultDetailResponse,
    ValidationRequest,
    ValidationResponse,
)
from backend.schemas.explanation import ExplanationDTO, TaxExplanationRequest
from backend.services.data_retention import delete_user_data, purge_if_due
from backend.core.rate_limit import limit_ai, limit_default, limit_guest_issue, limit_upload
from backend.security.guest import (
    delete_guest_data,
    is_guest_user_key,
    issue_guest_token,
)
from backend.security.auth import (
    get_current_user_id,
    verify_session_owner,
    verify_session_owner_manual,
)
from backend.services.audit_service import AuditService
from backend.services.document_service import DocumentService
from backend.services.rag_service import RAGService
from backend.ai.explanation_service import TaxExplanationService
from backend.services.tax_calculation_service import TaxCalculationService
from backend.services.tax_session_service import TaxSessionService
from backend.services.validation_service import ValidationService

router = APIRouter(tags=["Tax"])


# ============================================================================
# 1. Tax Session Endpoints
# ============================================================================

@router.post("/auth/guest", summary="게스트(로그인 없이 둘러보기) 전용 토큰 발급", dependencies=[Depends(limit_guest_issue)])
def issue_guest(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """게스트마다 고유 식별자와 서버 서명 토큰을 발급한다 (게스트끼리 세션·자료를 공유하지 않음).
    발급할 때 보존 기간이 지난 서버 자료(만료 게스트 포함)를 함께 정리한다 (1시간에 한 번).
    """
    purge_if_due(db)
    return issue_guest_token()


@router.delete("/auth/guest", summary="현재 게스트의 서버 자료 즉시 삭제", dependencies=[Depends(limit_default)])
def delete_guest(
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """게스트가 둘러보기를 끝내거나 창을 닫을 때 서버에 남은 세션·문서·결과·감사로그를 지운다."""
    if not current_user_id or not is_guest_user_key(current_user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="게스트 토큰이 필요합니다.")
    return {"deleted_sessions": delete_guest_data(db, current_user_id)}


@router.delete("/sessions/{session_id}", summary="내 세션과 그 서버 자료 삭제", dependencies=[Depends(limit_default)])
@router.delete("/tax/sessions/{session_id}", summary="내 세션 삭제 (alias)", dependencies=[Depends(limit_default)])
def delete_session(
    session_id: str,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """세션 소유자만 삭제할 수 있으며 문서·입력·결과·감사로그가 함께 삭제된다."""
    session = verify_session_owner_manual(session_id, current_user_id, db)
    db.delete(session)
    db.commit()
    return {"deleted_sessions": 1}


@router.delete("/me/data", summary="내 서버 자료 전체 삭제", dependencies=[Depends(limit_default)])
def delete_my_data(
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """로그인 사용자·게스트 모두 자기 서버 자료(모든 세션)를 즉시 지울 수 있다."""
    if not current_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="로그인하거나 '로그인 없이 둘러보기'로 시작해 주세요.")
    return {"deleted_sessions": delete_user_data(db, current_user_id)}


@router.post("/sessions", response_model=SessionResponse, summary="신규 연말정산 세션 생성", dependencies=[Depends(limit_default)])
@router.post("/tax/sessions", response_model=SessionResponse, summary="신규 연말정산 세션 생성 (alias)", dependencies=[Depends(limit_default)])
def create_session(
    request: SessionCreateRequest,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> SessionResponse:
    """단일 사용자의 2025 귀속 연말정산 작업을 위한 세션을 발급합니다.
    """
    purge_if_due(db)
    svc = TaxSessionService(db)
    # 세션 소유자는 인증 토큰 기준으로만 정한다 (요청 본문의 user_id는 개발 환경 하위 호환용)
    is_production = str(getattr(settings, "ENVIRONMENT", "")).lower() == "production"
    target_user_id = current_user_id or (None if is_production else request.user_id)
    if not target_user_id:
        # 게스트도 /auth/guest 로 고유 토큰을 받아야 하며, 공용 기본 사용자로 세션을 만들지 않는다
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인하거나 '로그인 없이 둘러보기'로 시작해 주세요.",
        )
    session = svc.create_session(
        user_id=target_user_id,
        tax_year=request.tax_year,
        is_sme_youth=request.is_sme_youth,
        is_newly_married=request.is_newly_married,
    )
    return SessionResponse(
        session_id=str(session.id),
        user_id=str(session.user_id),
        tax_year=session.tax_year,
        status=session.status.value,
        is_sme_youth=session.is_sme_youth,
        is_newly_married=session.is_newly_married,
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat(),
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse, summary="세션 상태 및 진행 단계 조회", dependencies=[Depends(limit_default)])
@router.get("/tax/sessions/{session_id}", response_model=SessionResponse, summary="세션 상태 및 진행 단계 조회 (alias)", dependencies=[Depends(limit_default)])
def get_session(
    session_id: str,
    session: TaxSession = Depends(verify_session_owner),
    db: Session = Depends(get_db)
) -> SessionResponse:
    """세션의 현재 진행 상태를 조회합니다.
    """
    return SessionResponse(
        session_id=str(session.id),
        user_id=str(session.user_id),
        tax_year=session.tax_year,
        status=session.status.value,
        is_sme_youth=session.is_sme_youth,
        is_newly_married=session.is_newly_married,
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat(),
    )


@router.put("/sessions/{session_id}/inputs", response_model=SessionInputsResponse, summary="화면 입력 자료(근무지·부양가족·공제) 저장", dependencies=[Depends(limit_default)])
@router.put("/tax/sessions/{session_id}/inputs", response_model=SessionInputsResponse, summary="화면 입력 자료 저장 (alias)", dependencies=[Depends(limit_default)])
def save_session_inputs(
    session_id: str,
    request: SessionInputsRequest,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> SessionInputsResponse:
    """세액 계산(/calculate)에 쓰일 입력 자료를 세션에 저장합니다. 기존 자료는 교체됩니다.
    주민등록번호 원문은 받지 않으며, 생년월일·관계·소득·장애 여부만 저장합니다."""
    from backend.models.deduction import ExpenseDeduction, WorkplaceIncome, WorkplaceType
    from backend.models.family_member import Dependent, RelationType

    session = verify_session_owner_manual(session_id, current_user_id, db)
    sid = session.id
    session.updated_at = datetime.now(timezone.utc)  # 마지막 사용 시각 (보존 기간 기준)
    db.query(WorkplaceIncome).filter(WorkplaceIncome.session_id == sid).delete()
    db.query(Dependent).filter(Dependent.session_id == sid).delete()
    db.query(ExpenseDeduction).filter(ExpenseDeduction.session_id == sid).delete()

    for w in request.workplaces:
        wtype = WorkplaceType.PREVIOUS if str(w.workplace_type).upper() == "PREVIOUS" else WorkplaceType.CURRENT
        db.add(WorkplaceIncome(
            session_id=sid, workplace_type=wtype, company_name=w.company_name or "근무지",
            business_number=w.business_number, gross_salary=w.gross_salary,
            non_taxable_salary=w.non_taxable_salary, prepaid_income_tax=w.prepaid_income_tax,
            prepaid_local_tax=w.prepaid_local_tax,
        ))
    for d in request.dependents:
        try:
            rel = RelationType(str(d.relation).upper())
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"알 수 없는 관계: {d.relation}")
        db.add(Dependent(
            session_id=sid, name=d.name, relation=rel, birth_date=d.birth_date,
            annual_income_amount=d.annual_income_amount, is_disabled=d.is_disabled,
            is_elderly=d.is_elderly, is_basic_deduction=d.is_basic_deduction, birth_order=d.birth_order,
        ))
    db.add(ExpenseDeduction(session_id=sid, **request.expense.model_dump()))
    if request.is_newly_married is not None:
        session.is_newly_married = request.is_newly_married
    if request.is_sme_youth is not None:
        session.is_sme_youth = request.is_sme_youth
    db.commit()
    return SessionInputsResponse(session_id=str(sid), workplaces=len(request.workplaces), dependents=len(request.dependents))


# ============================================================================
# 2. Document Upload Endpoint (POST /upload & POST /tax/upload)
# ============================================================================

@router.post("/upload", response_model=List[DocumentUploadResponse], summary="PDF 문서 업로드 및 마스킹", dependencies=[Depends(limit_upload)])
@router.post("/tax/upload", response_model=List[DocumentUploadResponse], summary="PDF 문서 업로드 및 마스킹 (alias)", dependencies=[Depends(limit_upload)])
async def upload_documents(
    files: List[UploadFile] = File(..., description="업로드할 연말정산 PDF 파일 목록"),
    session_id: Optional[str] = Form(None, description="소속 정산 세션 ID (미지정 시 신규 자동발급)"),
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> List[DocumentUploadResponse]:
    """다중 PDF 업로드 시 인메모리 PII 마스킹, 4종 자동 분류 및 Document 엔티티를 DB에 영속화합니다.
    """
    session_svc = TaxSessionService(db)
    if not session_id:
        if not current_user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="로그인하거나 '로그인 없이 둘러보기'로 시작해 주세요.",
            )
        # 업로드마다 새 세션을 만들지 않고, 요청자의 가장 최근 세션을 이어서 쓴다 (서버 자료 누적 방지)
        purge_if_due(db)
        latest = session_svc.get_latest_session_for_user(current_user_id)
        target_session_id = str((latest or session_svc.create_session(user_id=current_user_id)).id)
    else:
        # 기존 세션 소유자 인가 검증
        verify_session_owner_manual(session_id, current_user_id, db)
        target_session_id = session_id

    doc_svc = DocumentService(db)
    uploaded_responses: List[DocumentUploadResponse] = []
    MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

    for f in files:
        filename = f.filename or ""
        # 1. 확장자 및 Content-Type 검증 (f.filename.lower().endswith(".pdf") 및 application/pdf)
        if not filename.lower().endswith(".pdf") or (f.content_type and f.content_type != "application/pdf"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PDF 파일만 업로드할 수 있습니다."
            )

        # 2. 파일 크기 20MB 이하 제한 체크
        file_bytes = await f.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="파일 크기는 20MB를 초과할 수 없습니다."
            )

        filename = filename or "uploaded_document.pdf"
        doc = doc_svc.process_and_save_upload(
            session_id=target_session_id,
            filename=filename,
            file_bytes=file_bytes
        )
        uploaded_responses.append(
            DocumentUploadResponse(
                document_id=str(doc.id),
                session_id=str(doc.session_id),
                file_name=doc.original_filename,
                doc_type=doc.doc_type.value,
                confidence_score=doc.confidence_score or 1.0,
                status="parsed",
                created_at=doc.created_at.isoformat(),
                parsed_json=doc.parsed_json or {},
            )
        )

    return uploaded_responses


# ============================================================================
# 3. Document OCR & Classification Endpoint (POST /ocr & POST /tax/classify)
# ============================================================================

@router.post("/ocr", response_model=DocumentOCRResponse, summary="문서 OCR 텍스트 분석 및 4종 분류", dependencies=[Depends(limit_upload)])
@router.post("/tax/ocr", response_model=DocumentOCRResponse, summary="문서 OCR 분석 (alias)", dependencies=[Depends(limit_upload)])
@router.post("/tax/classify", response_model=DocumentOCRResponse, summary="문서 4종 분류 (alias)", dependencies=[Depends(limit_upload)])
def ocr_and_classify_document(
    request: Optional[DocumentOCRRequest] = None,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> DocumentOCRResponse:
    """파싱된 텍스트 기반 문서 4종(HOMETAX, WITHHOLDING, RESIDENT, FAMILY) 분류 및 엔티티 추출
    """
    doc_svc = DocumentService(db)

    # 1. document_id가 주어진 경우 해당 문서 레코드에서 조회 (문서가 속한 세션의 소유자만 허용)
    if request and request.document_id:
        doc = doc_svc.get_document(request.document_id)
        if doc:
            verify_session_owner_manual(str(doc.session_id), current_user_id, db)
            return DocumentOCRResponse(
                document_id=str(doc.id),
                doc_type=doc.doc_type.value,
                confidence_score=doc.confidence_score or 1.0,
                parsed_json=doc.parsed_json or {},
                masked_preview=f"[Document: {doc.original_filename}] PII 마스킹 및 파싱 완료",
            )

    # 2. raw_text가 직접 전달된 경우
    raw_text = request.raw_text if request and request.raw_text else ""
    masked_text = doc_svc.mask_pii(raw_text)
    doc_type, confidence, summary = doc_svc.classify_document(masked_text)
    entities = doc_svc.extract_document_entities(masked_text, doc_type)
    entities.update(summary)

    return DocumentOCRResponse(
        document_id=request.document_id if request else None,
        doc_type=doc_type.value,
        confidence_score=confidence,
        parsed_json=entities,
        masked_preview=masked_text[:200] if masked_text else "입력 텍스트 없음",
    )


# ============================================================================
# 4. Validation Endpoint (POST /validate & POST /tax/validate)
# ============================================================================

@router.post("/validate", response_model=ValidationResponse, summary="부양가족 적격성 및 중도이직 근무지 합산 검증", dependencies=[Depends(limit_default)])
@router.post("/tax/validate", response_model=ValidationResponse, summary="부양가족 및 중도이직 검증 (alias)", dependencies=[Depends(limit_default)])
def validate_tax_data(
    request: ValidationRequest,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> ValidationResponse:
    """부양가족 기본공제 요건(소득금액 100만 이하, 나이 요건) 및 중도이직 근무지 합산 유효성을 검증합니다.
    """
    # 세션 소유자 인가 가드
    verify_session_owner_manual(request.session_id, current_user_id, db)

    val_svc = ValidationService(db)

    custom_deps = None
    if request.dependents:
        custom_deps = [d.model_dump() for d in request.dependents]

    custom_workplaces = None
    if request.workplaces:
        custom_workplaces = [w.model_dump() for w in request.workplaces]

    res = val_svc.validate_session_data(
        session_id=request.session_id,
        custom_dependents=custom_deps,
        custom_workplaces=custom_workplaces,
    )

    return ValidationResponse(
        is_valid=res["is_valid"],
        matched=res["matched"],
        warnings=res["warnings"],
        errors=res["errors"],
        details=res["details"],
    )


# ============================================================================
# 5. Tax Calculation Endpoint (POST /calculate & POST /tax/calculate)
# ============================================================================

@router.post("/calculate", response_model=TaxCalculateResponse, summary="2025 귀속 세액 정밀 계산 및 감사 추적 생성", dependencies=[Depends(limit_default)])
@router.post("/tax/calculate", response_model=TaxCalculateResponse, summary="2025 세액 정밀 계산 (alias)", dependencies=[Depends(limit_default)])
def calculate_tax(
    request: TaxCalculateRequest,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> TaxCalculateResponse:
    """2025 귀속 소득세법을 완전히 적용하여 과세표준, 산출세액, 세액공제 및 차감징수세액을 계산하고 Audit Trail을 영속화합니다.
    """
    # 세션 소유자 인가 가드
    sess = verify_session_owner_manual(request.session_id, current_user_id, db)
    sess.updated_at = datetime.now(timezone.utc)  # 마지막 사용 시각 (보존 기간 기준)
    db.commit()

    calc_svc = TaxCalculationService(db)
    try:
        tax_result, audit_logs = calc_svc.calculate_and_save(
            session_id=request.session_id,
            override_salary=request.override_salary,
            override_deductions=request.override_deductions,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return TaxCalculateResponse(
        session_id=request.session_id,
        total_salary=tax_result.total_gross_salary,
        earned_income_deduction=tax_result.earned_income_deduction,
        taxable_income=tax_result.taxable_standard,
        calculated_tax=tax_result.calculated_tax,
        tax_credits=tax_result.calculated_tax - tax_result.final_decision_tax,
        final_tax=tax_result.final_decision_tax,
        prepaid_tax=tax_result.total_prepaid_tax,
        refund_amount=tax_result.final_refund_amount,
        is_refund=tax_result.final_refund_amount < 0,
        total_personal_deduction=tax_result.total_personal_deduction,
        total_special_income_deduction=tax_result.total_special_income_deduction,
        audit_steps_count=len(audit_logs),
    )


# ============================================================================
# 6. RAG Search Endpoint (POST /rag/search & POST /tax/rag/explain)
# ============================================================================

@router.post("/rag/search", response_model=RAGSearchResponse, summary="국세청 가이드 RAG 질의응답", dependencies=[Depends(limit_ai)])
@router.post("/tax/rag/search", response_model=RAGSearchResponse, summary="국세청 가이드 RAG 검색 (alias)", dependencies=[Depends(limit_ai)])
def search_rag_guideline(request: RAGSearchRequest) -> RAGSearchResponse:
    """국세청 '2025년 귀속 연말정산 신고안내' 책자 및 세법 가이드를 기반으로 출처 페이지를 명시한 해설을 제공합니다.
    """
    rag_svc = RAGService()
    res = rag_svc.search(query=request.query, section=request.section, top_k=request.top_k)
    return RAGSearchResponse(
        query=res["query"],
        answer=res["answer"],
        source_page=res["source_page"],
        section=res["section"],
        title=res["title"],
        confidence=res["confidence"],
    )


@router.post("/rag/explain", response_model=ExplanationDTO, summary="Tax Engine 결과 기반 국세청 출처 명시 AI 해설", dependencies=[Depends(limit_ai)])
@router.post("/tax/rag/explain", response_model=ExplanationDTO, summary="국세청 출처 명시 AI 해설 (alias)", dependencies=[Depends(limit_ai)])
def explain_tax_result(
    request: TaxExplanationRequest,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> ExplanationDTO:
    """Tax Engine 세액 계산 결과를 국세청 공식 자료와 연결하여 출처 페이지와 법적 근거가 포함된 AI 해설(ExplanationDTO)을 생성합니다."""
    if request.session_id:
        verify_session_owner_manual(request.session_id, current_user_id, db)

    ai_svc = TaxExplanationService(db)
    target_category = request.category or request.section
    target_question = request.user_question or request.query

    if request.session_id:
        return ai_svc.explain_tax_result_by_session(
            session_id=request.session_id,
            category=target_category,
            user_question=target_question,
        )
    # 세션 없이 화면 계산값으로 해설: 허용된 숫자 항목만 사용 (개인정보·임의 텍스트는 버림)
    allowed_keys = {
        "gross_salary", "earned_income_deduction", "taxable_standard", "calculated_tax",
        "tax_credits", "final_decision_tax", "total_prepaid_tax", "final_refund_amount",
    }
    safe_payload = {
        k: int(v) for k, v in (request.payload or {}).items()
        if k in allowed_keys and isinstance(v, (int, float)) and not isinstance(v, bool)
    }
    return ai_svc.explain_tax_payload(
        payload=safe_payload,
        query=target_question or f"{target_category or '연말정산'} 공제 요건을 설명해 주세요.",
        category=target_category,
    )


# ============================================================================
# 7. Final Result Endpoint (GET /result/{id} & GET /tax/result/{id})
# ============================================================================

@router.get("/result/{identifier}", response_model=TaxResultDetailResponse, summary="최종 정산 결과 상세 조회", dependencies=[Depends(limit_default)])
@router.get("/tax/result/{identifier}", response_model=TaxResultDetailResponse, summary="최종 정산 결과 상세 조회 (alias)", dependencies=[Depends(limit_default)])
def get_tax_result(
    identifier: str,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> TaxResultDetailResponse:
    """세션 ID 또는 결과 ID로 최종 계산된 정산 결과 상세와 감사 로그를 조회합니다.
    """
    audit_svc = AuditService(db)
    res = audit_svc.get_tax_result(identifier)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"정산 결과를 찾을 수 없습니다: {identifier}"
        )

    verify_session_owner_manual(str(res.session_id), current_user_id, db)

    logs = audit_svc.get_audit_logs(identifier)
    log_items = [AuditService.to_item_dto(l) for l in logs]

    return TaxResultDetailResponse(
        id=str(res.id),
        session_id=str(res.session_id),
        total_gross_salary=res.total_gross_salary,
        earned_income_deduction=res.earned_income_deduction,
        earned_income_amount=res.earned_income_amount,
        total_personal_deduction=res.total_personal_deduction,
        total_pension_deduction=res.total_pension_deduction,
        total_special_income_deduction=res.total_special_income_deduction,
        total_other_income_deduction=res.total_other_income_deduction,
        taxable_standard=res.taxable_standard,
        calculated_tax=res.calculated_tax,
        tax_credits_total=res.calculated_tax - res.final_decision_tax,
        final_decision_tax=res.final_decision_tax,
        total_prepaid_tax=res.total_prepaid_tax,
        final_refund_amount=res.final_refund_amount,
        is_refund=res.final_refund_amount < 0,
        calculated_at=res.calculated_at.isoformat() if res.calculated_at else "",
        audit_logs=log_items,
    )


# ============================================================================
# 8. Audit Log Endpoint (GET /audit/{id} & GET /tax/audit/{id})
# ============================================================================

@router.get("/audit/{identifier}", response_model=AuditLogResponse, summary="세션/결과별 전체 감사 로그(Audit Trail) 조회", dependencies=[Depends(limit_default)])
@router.get("/tax/audit/{identifier}", response_model=AuditLogResponse, summary="감사 로그 조회 (alias)", dependencies=[Depends(limit_default)])
def get_audit_trail(
    identifier: str,
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> AuditLogResponse:
    """세액 계산의 모든 중간 연산 단계 및 법정 수식을 순서대로 조회합니다.
    """
    audit_svc = AuditService(db)
    res = audit_svc.get_tax_result(identifier)
    target_session_id = str(res.session_id) if res else identifier
    verify_session_owner_manual(target_session_id, current_user_id, db)

    logs = audit_svc.get_audit_logs(identifier)

    log_items = [AuditService.to_item_dto(l) for l in logs]

    return AuditLogResponse(
        session_id=str(res.session_id) if res else identifier,
        tax_result_id=str(res.id) if res else None,
        total_steps=len(log_items),
        logs=log_items,
    )


# ============================================================================
# 9. Additional Assistant & Report Endpoints
# ============================================================================

@router.post("/checklist", response_model=ChecklistResponse, summary="누락 방지 자가진단 질문 생성", dependencies=[Depends(limit_default)])
@router.post("/tax/checklist", response_model=ChecklistResponse, summary="자가진단 질문 생성 (alias)", dependencies=[Depends(limit_default)])
def get_checklist() -> ChecklistResponse:
    """누락 방지 Boolean 자가진단 질문 리스트 생성
    """
    questions = [
        ChecklistQuestion(
            id="q1",
            category="월세액",
            question="2025년도 중 무주택 세대주로서 월세를 지출한 내역이 있습니까?",
            description="총급여 8천만 원 이하 무주택 근로자 대상 (최대 1,000만원 한도 15~17% 세액공제)"
        ),
        ChecklistQuestion(
            id="q2",
            category="의료비",
            question="실손의료보험금으로 보전받은 의료비가 공제 대상에 포함되어 있습니까?",
            description="실손보험금 수령액은 의료비 공제 대상에서 제외해야 과다공제를 방지할 수 있습니다."
        ),
        ChecklistQuestion(
            id="q3",
            category="혼인세액공제",
            question="2024년 1월 1일 이후 당해 연도 중 혼인신고를 하셨습니까?",
            description="생애 1회에 한하여 50만원의 혼인세액공제가 지원됩니다."
        ),
        ChecklistQuestion(
            id="q4",
            category="중소기업청년",
            question="중소기업에 취업한 만 15세~34세 이하 청년에 해당하십니까?",
            description="취업일로부터 5년간 90% 소득세 감면(연 200만원 한도) 혜택이 적용됩니다."
        ),
    ]
    return ChecklistResponse(questions=questions)


@router.get("/report/pdf/{session_id}", summary="연말정산 결과지 PDF 다운로드", dependencies=[Depends(limit_default)])
@router.get("/tax/report/pdf/{session_id}", summary="연말정산 결과지 PDF 다운로드 (alias)", dependencies=[Depends(limit_default)])
def download_pdf_report(
    session_id: str,
    session: TaxSession = Depends(verify_session_owner),
):
    """연말정산 시뮬레이션 결과지 PDF 스트림 다운로드
    """
    pdf_bytes = b"%PDF-1.4 SelfTax 2025 Simulation Report Stream"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=tax_report_{session_id}.pdf"}
    )
