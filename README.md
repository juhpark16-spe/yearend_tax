# AI 셀프 연말정산 (SelfTax 2025)

> **2025년 귀속 (2026년 신고) 근로자용 AI 연말정산 자동화 및 설명형 세액 시뮬레이션 서비스**

---

## 1. 프로젝트 개요

근로자가 홈택스에서 다운로드한 PDF만 업로드하면 AI가 문서를 안전하게 분석하고, 소득공제·세액공제를 계산한 뒤 환급 예상액과 계산 근거를 쉽게 설명해 주는 웹 서비스입니다.

### 🛡️ 핵심 개발 원칙 (Explainable AI)
- **수식 연산의 완전한 결정론화**: 세액 계산(`Tax Engine`)에는 LLM을 일절 사용하지 않으며 순수 파이썬(Pure Python) 공식으로만 연산합니다.
- **철저한 개인식별정보 보호 (PII)**: PDF 업로드 직후 인메모리에서 주민등록번호 뒷자리를 마스킹(`900101-1******`)하며 원본은 메모리와 DB 어디에도 남기지 않습니다.
- **국세청 공문서 RAG**: 국세청 공식 연말정산 신고안내서 기반으로 정확한 출처(페이지)와 함께 절세 팁 및 요건을 설명합니다.
- **투명한 감사 추적 (Audit Log)**: "왜 이 금액인가요?" 질문에 답할 수 있도록 모든 연산 단계의 중간 과정과 근거를 기록합니다.

---

## 2. 전체 프로젝트 폴더 구조

```text
yearend_tax/
├── docs/                       # 기획 및 세법 명세 문서 (기준 문서)
│   ├── PRD_v3.0.md             # 제품 요구사항 정의서 (v3.0)
│   ├── API_v1.0.md             # REST API 엔드포인트 명세서
│   ├── ERD_v2.0.md             # 데이터베이스 모델 정의서 (v2.0)
│   ├── SRS_v3.0.md             # 시스템 요구사항 정의서 (v3.0)
│   ├── TAX_RULES._v1.1.md      # 2025 귀속 세법 계산 공식 및 한도표
│   └── walkthrough.md          # 시스템 설계 및 구현 가이드
├── backend/                    # FastAPI 백엔드 애플리케이션
│   ├── api/                    # API 라우터 계층
│   │   └── v1/
│   │       ├── endpoints.py    # 세션, 업로드, 분류, 계산, 체크리스트, RAG
│   │       └── __init__.py
│   ├── core/                   # 핵심 설정 및 DB 세션 관리
│   │   ├── config.py           # Pydantic Settings 환경 설정
│   │   └── database.py         # SQLAlchemy 엔진 및 세션
│   ├── models/                 # SQLAlchemy ORM 모델
│   │   ├── user.py             # 사용자 모델
│   │   ├── session.py          # 정산 세션 모델
│   │   ├── document.py         # 업로드 문서 관리
│   │   ├── deduction.py        # 공제 항목 모델
│   │   ├── family_member.py    # 부양가족 모델
│   │   ├── tax_result.py       # 계산 결과 모델
│   │   ├── audit_log.py        # 감사 로그 모델
│   │   └── tax_models.py       # 통합 모델 임포트
│   ├── schemas/                # Pydantic DTO 스키마
│   │   ├── tax_schema.py       # API 입출력 요청/응답 검증 모델
│   │   ├── ocr_output.py       # OCR 및 PDF 파싱 출력 스키마
│   │   ├── checklist.py        # 누락/과다공제 체크리스트 스키마
│   │   ├── validation_result.py# 유효성 검증 결과 스키마
│   │   └── explanation.py      # 설명형 세액 도출 스키마
│   ├── parser/                 # 문서 파싱 및 PII 마스킹
│   │   ├── pdf_parser.py       # pdfplumber 기반 PDF 파서
│   │   ├── extractor.py        # 간소화/원천징수 항목별 세부 추출기
│   │   ├── classifier.py       # 업로드 문서 유형 분류기
│   │   └── pii_masker.py       # 주민등록번호/주소 마스킹 엔진
│   ├── security/               # 인증/인가 및 개인정보 보호
│   │   ├── auth.py             # Supabase JWT 인증 및 세션 검증
│   │   └── pii_mask.py         # 민감정보 정규식 마스킹
│   ├── services/               # 비즈니스 로직 서비스 계층
│   │   ├── tax_calculation_service.py # 세액 계산 통합 서비스
│   │   ├── document_service.py        # 문서 업로드/파싱 처리 서비스
│   │   ├── validation_service.py      # 공제 적격성 검증 서비스
│   │   ├── rag_service.py             # 국세청 규정 RAG 질의 서비스
│   │   ├── audit_service.py           # 계산 근거 및 변경이력 기록
│   │   └── tax_session_service.py     # 유저 세션 생명주기 관리
│   ├── ai/                     # AI 설명 생성 모듈
│   │   └── explanation_service.py     # 환급/납부 근거 AI 요약 및 설명
│   ├── rule_engine/            # 부양가족/중도이직/중복공제 규칙 검증기
│   │   ├── engine.py           # 규칙 엔진 메인
│   │   ├── validator.py        # 기본 유효성 검증기
│   │   ├── checklist_generator.py # 맞춤형 체크리스트 생성기
│   │   ├── duplicate_checker.py   # 중복/과다 공제 방지 검증기
│   │   ├── resident_validator.py  # 거주자/외국인 세법 적격 검증
│   │   ├── withholding_validator.py # 기납부세액/이직 적격 검증
│   │   └── family_matcher.py      # 인적공제 관계 매칭기
│   ├── tax_engine/             # 2025 순수 Python 세액 계산 엔진 (결정론적)
│   │   └── calculator.py       # 산출세액 및 공제한도 공식 연산
│   ├── rag/                    # 국세청 가이드 RAG 검색 모듈
│   │   └── retriever.py        # 벡터 검색 및 원문 인용기
│   ├── audit/                  # 계산 단계별 근거 및 감사 추적기
│   │   └── logger.py
│   ├── report/                 # 결과지 PDF 리포트 생성기
│   │   └── pdf_generator.py
│   └── main.py                 # FastAPI 애플리케이션 엔트리포인트
├── frontend/                   # React + Vite + Tailwind CSS 프론트엔드
│   ├── public/
│   │   ├── assets/             # 일러스트/아이콘 정적 이미지
│   │   └── bgm.mp3             # 집중 배경음악 음원
│   ├── src/
│   │   ├── assets/
│   │   ├── components/         # 재사용 UI 컴포넌트
│   │   │   ├── BgmPlayer.jsx         # 배경음악 재생 컨트롤러
│   │   │   ├── UploadZone.jsx        # Drag & Drop PDF 업로더
│   │   │   ├── UploadProgressBar.jsx # 파일 업로드 진행 표시줄
│   │   │   ├── TaxStepProgressBar.jsx# 7단계 위저드 단계 바
│   │   │   ├── SubPageHeader.jsx     # 서브페이지 공통 헤더
│   │   │   ├── HomeButton.jsx        # 홈 바로가기 플로팅 버튼
│   │   │   ├── DesignAlertModal.jsx  # 커스텀 알림/확인 모달
│   │   │   ├── AuditTrailTimeline.jsx# 감사 추적 인터랙티브 타임라인
│   │   │   └── UserAuthStatus.jsx    # 로그인/게스트 상태 표시
│   │   ├── pages/              # 주요 화면 (13개 페이지)
│   │   │   ├── HometaxPage.jsx       # 국세청 간소화자료 업로드
│   │   │   ├── WithholdingPage.jsx   # 원천징수영수증 업로드
│   │   │   ├── PreviousJobPage.jsx   # 종전 근무지 입력/관리
│   │   │   ├── FamilyPage.jsx        # 부양가족/인적공제 관리
│   │   │   ├── DataInputPage.jsx     # 공제자료 상세 입력 및 확인
│   │   │   ├── TaxResultPage.jsx     # 실시간 예상세액 계산/비교
│   │   │   ├── AiReportPage.jsx      # AI 세액 분석 리포트 & 시뮬레이션
│   │   │   ├── TaxHistoryPage.jsx    # 연도별 세액 현황 & 항목별 사용액
│   │   │   ├── TaxTipsPage.jsx       # 맞춤형 절세 팁 가이드
│   │   │   ├── RequiredDocsPage.jsx  # 필요 서류 안내
│   │   │   ├── UserGuidePage.jsx     # 서비스 이용 가이드
│   │   │   ├── CompanyPage.jsx       # 회사용 제출자료 생성
│   │   │   └── TaxWizardPage.jsx     # 연말정산 시작 가이드
│   │   ├── context/            # 전역 상태 관리
│   │   │   └── AuthContext.jsx       # 로그인/게스트 인증 컨텍스트
│   │   ├── services/           # API 클라이언트
│   │   │   └── api.js                # Axios REST API 클라이언트
│   │   ├── utils/              # 유틸리티 함수 및 스토리지
│   │   │   ├── taxCalculator.js      # 프론트엔드 실시간 세액 계산 엔진
│   │   │   ├── secureStorage.js      # 암호화 로컬 스토리지
│   │   │   ├── userTaxStorage.js     # 사용자별 세무 데이터 관리자
│   │   │   ├── guestStorage.js       # 게스트 모드 로컬 세션 스토리지
│   │   │   ├── pensionLimit.js       # 연금계좌 한도 계산 유틸
│   │   │   └── fileValidation.js     # 업로드 파일 검증기
│   │   ├── lib/
│   │   │   └── supabaseClient.js     # Supabase 클라이언트
│   │   ├── App.jsx             # 메인 라우팅 & 네비게이션
│   │   ├── index.css           # 글로벌 스타일 (Tailwind CSS)
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js          # Vite 설정 및 API 프록시
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json            # 프론트엔드 패키지 의존성
├── rules/                      # 세법 규칙 정의 및 상수 모듈
│   └── 2025/
│       ├── tax_rates.py        # 2025년 기본세율, 누진공제, 한도액 정의
│       └── __init__.py
├── rag_data/                   # 국세청 공식 가이드라인 원본 PDF 및 Vector DB
├── tests/                      # Pytest 테스트 스위트
│   ├── unit/                   # 단위 테스트
│   │   ├── test_tax_engine.py          # 세액 계산 엔진 단위 테스트
│   │   ├── test_rule_engine.py         # 규칙 검증 엔진 단위 테스트
│   │   ├── test_ocr_parser.py          # PDF/OCR 파싱 단위 테스트
│   │   ├── test_audit_trail.py         # 감사 로그 단위 테스트
│   │   ├── test_authorization_guard.py # 보안/권한 가드 단위 테스트
│   │   ├── test_rag_system.py          # RAG 벡터 검색 단위 테스트
│   │   └── test_upload_validation.py   # 파일 업로드 유효성 테스트
│   ├── integration/            # 통합 테스트
│   │   └── test_api_v1.py              # v1 API 엔드포인트 통합 테스트
│   └── conftest.py             # 테스트 픽스처
├── alembic/                    # DB 스키마 마이그레이션
├── alembic.ini
├── .env                        # 환경 변수 (로컬)
├── .env.example                # 환경 변수 템플릿
├── requirements.txt            # 백엔드 파이썬 의존성 패키지 목록
└── README.md                   # 프로젝트 문서
```

---

## 3. 개발 환경 설정 및 실행 방법

### 3.1 Backend (FastAPI)

1. **가상환경 활성화 (Windows PowerShell 기준)**
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

2. **의존성 패키지 설치**
   ```powershell
   pip install -r requirements.txt
   ```

3. **FastAPI 서버 실행**
   ```powershell
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. **API 문서 확인**
   - Swagger UI: `http://localhost:8000/docs`
   - ReDoc: `http://localhost:8000/redoc`

---

### 3.2 Frontend (React + Vite)

1. **Node.js 설치 여부 확인**
   - Node.js (v18.0 이상) 및 npm이 설치되어 있어야 합니다.

2. **프론트엔드 폴더 이동 및 패키지 설치**
   ```powershell
   cd frontend
   npm install
   ```

3. **개발 서버 실행**
   ```powershell
   npm run dev
   ```

4. **브라우저 접속**
   - 로컬 개발 서버: `http://localhost:5173`

---

### 3.3 테스트 실행 (Backend)

```powershell
pytest -v tests/
```
