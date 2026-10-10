# [API] AI 셀프 연말정산 웹 서비스 (SelfTax 2025) REST API 명세서

## 1. 기본 정보 및 공통 규격
* **기본 URL**: `http://localhost:8000/api/v1`
* **API 문서 (Swagger UI)**: `http://localhost:8000/docs`
* **OpenAPI Schema (JSON)**: `http://localhost:8000/openapi.json`
* **데이터 포맷**: JSON (`application/json`, UTF-8 인코딩)
* **파일 업로드**: Multipart Form Data (`multipart/form-data`)
* **보안 및 PII 준수**:
  - 클라이언트-서버 간 모든 통신 데이터 및 응답 본문 내 주민등록번호는 뒷자리가 마스킹된 토큰(`[RRN Omitted]`) 형태만 허용된다.
  - 서버 내부 로깅 및 API 응답 페이로드에 개인 식별 번호 원본 노출을 금지한다.

---

## 2. API 엔드포인트 요약

| 태그 | HTTP 메서드 | 엔드포인트 | 설명 |
| :--- | :--- | :--- | :--- |
| **Tax Session** | `POST` | `/tax/sessions` | 신규 연말정산 세션 생성 |
| **Tax Session** | `GET` | `/tax/sessions/{session_id}` | 세션 상태 및 진행 단계 조회 |
| **Document** | `POST` | `/tax/upload` | Drag & Drop 다중 PDF 업로드 및 비동기 파싱·마스킹 |
| **Document** | `POST` | `/tax/classify` | 파싱된 텍스트 기반 문서 4종 자동 분류 및 신뢰도 반환 |
| **Validation** | `POST` | `/tax/validate` | 부양가족 적격성 및 중도이직 근무지 합산 검증 |
| **Tax Engine** | `POST` | `/tax/calculate` | 2025 귀속 순수 Python 기반 정밀 세액 계산 |
| **AI Assistant** | `POST` | `/tax/checklist` | 누락 방지 Boolean 자가진단 질문 리스트 생성 |
| **AI Assistant** | `POST` | `/tax/rag/explain` | 국세청 안내서 RAG 기반 출처 페이지 명시 해설 |
| **Report** | `GET` | `/tax/result/{session_id}` | 최종 정산 결과 및 단계별 Audit Log 조회 |
| **Report** | `GET` | `/tax/report/pdf/{session_id}` | 연말정산 시뮬레이션 결과지 PDF 스트림 다운로드 |

---

## 3. 세부 엔드포인트 규격

### 3.1 [Tax Session] 세션 생성
* **엔드포인트**: `POST /tax/sessions`
* **설명**: 단일 사용자의 2025 귀속 연말정산 작업을 위한 세션을 발급한다.

#### 요청 (Request)
* **Headers**: `Content-Type: application/json`
* **Body**:
```json
{
  "user_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "tax_year": 2025,
  "is_sme_youth": true,
  "is_newly_married": false
}