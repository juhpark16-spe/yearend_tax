# 정산봄 AI 셀프 연말정산 서비스(SelfTax 2025)

> **2025년 귀속 (2026년 신고) AI가 함께하는 근로자용 스마트 연말정산 자가진단 서비스**

---

## 1. 프로젝트 개요

내 연말정산 미리봄. 정산봄 AI 셀프 연말정산 서비스는 근로자가 AI의 도움을 받아 혼자 손쉽게 연말정산 서류를 검증하고, 환급액을 산출해보도록 하고, 추가 공제 가능한 항목과 절세 전략까지 확인해 환급액을 최대로 받을 수 있도록 도와주는 웹 서비스입니다.

### 🛡️ 핵심 개발 원칙 (Explainable AI)
- **수식 연산의 완전한 결정론화**: 세액 계산(`Tax Engine`)에는 LLM을 일절 사용하지 않으며 순수 파이썬(Pure Python) 공식으로만 연산합니다.
- **철저한 개인식별정보 보호 (PII)**: PDF 업로드 직후 인메모리에서 주민등록번호 뒷자리를 마스킹(`900101-1******`)하며 원본은 메모리와 DB 어디에도 남기지 않습니다.
- **국세청 공문서 RAG**: 국세청 연말정산 신고안내서를 항목별로 정리한 지식베이스(`rag_data/markdown`)를 검색해 출처(페이지)와 함께 절세 팁 및 요건을 설명합니다.
- **투명한 감사 추적 (Audit Log)**: "왜 이 금액인가요?" 질문에 답할 수 있도록 모든 연산 단계의 중간 과정과 근거를 기록합니다.

---

## 2. 주요 핵심 기능 (Key Features)

* **스마트 PDF 간소화자료 자동 분석**: 국세청 간소화자료 및 근로소득원천징수영수증 PDF 원클릭 업로드 & 지능형 파싱 (다양한 전자서식 완벽 지원)
* **2025년 귀속 개정 세법 전격 반영**:
  - **자녀세액공제 대폭 확대**: 1명 25만 원 / 2명 55만 원 / 3명 이상 `55만 원 + (2명 초과 1명당 40만 원)`
  - **문화비 소득공제 대상 확대**: 수영장·헬스장 등 체육시설 이용료(30%) 신설 반영
  - **혼인세액공제 신설**: 2024~2026년 중 혼인신고 시 생애 1회 50만 원 세액공제
  - **출산 및 입양 세액공제**: 첫째 30만 원, 둘째 50만 원, 셋째 이상 70만 원
  - **소기업·소상공인 노란우산공제**: 사업소득 및 법인대표자 근로소득 구간별 공제한도 세분화
* **실시간 세액 시뮬레이션 (13개 인터랙티브 화면)**: 부양가족, 종전근무지, 수기 영수증 입력에 따른 실시간 환급액 변화 즉시 연산
* **"왜 이 금액인가요?" 투명한 감사 추적 (Audit Trail)**: 7단계 세액 도출 과정과 국세청 세법 조항 근거 명시
* **AI 맞춤형 절세 리포트**: 공제 누락 위험 항목 진단 및 다음 연도 절세 전략 제공
* **집중을 돕는 로우파이 배경음악 (BGM Player)**: 복잡한 세무 자료 입력 중 집중력을 유지해 주는 BGM 플레이어 탑재

---

## 3. 시스템 아키텍처 및 데이터 흐름 (Architecture Flow)

```mermaid
flowchart LR
    A[홈택스 PDF / 영수증 업로드] --> B[인메모리 PII 마스킹\n주민번호 뒷자리 즉시 치환]
    B --> C[규칙 엔진 RuleEngine\n부양가족/중복공제 적격 검증]
    C --> D[순수 Python 세액 엔진\n결정론적 법정수식 연산]
    D --> E[감사 추적기 Audit Logger\n단계별 계산 근거 기록]
    E --> F[실시간 환급액 시뮬레이션\n& AI 설명형 리포트 도출]
```

---

### 현재 구현 범위 메모
* 화면(④ 공제자료 입력 ~ ⑥ AI 리포트)의 예상세액·리포트는 브라우저의 `taxCalculator.js`가 백엔드와 같은 법정 수식으로 즉시 계산합니다.
* AI 리포트의 **'AI 근거 보기'**는 화면 계산값(숫자만)을 `/rag/explain`에 보내 국세청 안내서 출처가 담긴 해설을 받아 보여줍니다.
* AI 리포트의 **'서버 교차검증'**은 화면 입력을 `PUT /sessions/{id}/inputs`로 저장하고 `/calculate`로 백엔드 Python 엔진이 다시 계산한 뒤, 7개 단계와 세액공제·감면 항목별 산출액(산출세액 한도 적용 전)과 적용 순서별 실제 적용액을 화면 엔진과 비교하고 `/audit` 감사 로그(단계별 수식·근거 조항)를 보여줍니다. 고길동 샘플 기준 7개 단계가 모두 일치합니다.
* 세액감면·공제는 **소득세법 제60조 적용순서**대로 산출세액 범위 안에서 배분합니다: ① 세액감면(중소기업 취업자) → ② 이월공제 불가 세액공제(근로소득 → 혼인 → 자녀 → 보장성보험 → 의료비 → 교육비 → 정치자금 → 고향사랑 → 우리사주조합 → 표준세액공제 → 월세) → ③ 이월공제 가능 세액공제(특례 → 일반(종교단체 외) → 일반(종교단체) 기부금, 같은 종류는 전년도 이월분 먼저, 소득세법 제61조) → ④ 연금계좌(초과분은 공제받지 않은 것으로 봄, 원천세과-830). 화면 엔진(`taxCalculator.js`)과 백엔드 엔진이 같은 규칙을 씁니다.
* **표준세액공제 판정**: 특별세액공제(특별소득공제 포함)를 받는 경우와 표준세액공제 13만 원을 받는 경우(특별소득공제를 빼고 과세표준·산출세액부터 다시 계산)의 결정세액을 끝까지 계산해 적은 쪽을 택합니다(같으면 특별세액공제).
* **기부금 세액공제**: 한도를 정치자금 → 고향사랑(연 2,000만 원) → 특례 → 우리사주(30%) → 일반(30%, 종교단체 있으면 10%+min(20%, 종교단체 외)) 순으로 앞 종류를 빼고 계산하고, 특례·우리사주·일반 합계 1천만 원 이하 15%·초과 30%를 적용합니다.
* **전년도 이월 기부금**: 공제자료 > 기부금 > '전년도기부금' 탭에서 기부연도(2015~2024)·종류(특례/일반 종교단체 외/일반 종교단체)·이월금액을 입력합니다. 이월분은 같은 종류의 올해 기부금보다 먼저, 기부연도가 빠른 것부터 공제되며, 다음 해로 넘어갈 이월액(한도초과 + 세액부족분)과 소멸액을 미리 보여줍니다. (이월분 공제율은 현행 15%/30% 적용)
* 부양가족 검증(`/validate`)은 구현·테스트되어 있으며 화면 연동은 다음 과제입니다.

---

## 4. 기술 스택 (Tech Stack)

| 구분 | 주요 기술 및 라이브러리 |
| :--- | :--- |
| **Backend** | `FastAPI`, `Python 3.12`, `SQLAlchemy 2.0`, `Pydantic v2`, `SQLite / PostgreSQL`, `Alembic` |
| **Frontend** | `React 18`, `Vite 5`, `Tailwind CSS`, `Lucide React`, `Supabase Auth`, `React.lazy (코드 분할)` |
| **AI & RAG** | `LangChain`, `FAISS Vector Store`, `국세청 연말정산 공식 가이드라인 RAG`, `GPT-4o (설명 생성용)` |
| **Security** | `In-Memory PII Masker`, `Supabase JWT 서명 검증(JWKS/HS256) & IDOR Guard`, `Client-Side Recursive PII Sanitization` |
| **Testing** | `Pytest` 단위·통합 테스트 108개 (RAG 4개는 OpenAI API·네트워크 필요) |

---

## 5. 전체 프로젝트 폴더 구조

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
│   │   └── nts_sections.py     # 간소화 보장성보험·교육비 섹션 구조 파서 (이름 무관 판정)
│   ├── security/               # 인증/인가 및 개인정보 보호
│   │   ├── auth.py             # Supabase JWT 서명·만료 검증 및 IDOR 방어 가드
│   │   ├── guest.py            # 게스트 전용 서명 토큰 발급·검증, 게스트 자료 삭제·만료 정리
│   │   └── pii_mask.py         # 주민등록번호·주소·전화번호 마스킹 (업로드 직후 인메모리)
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
│   │   ├── explainer.py        # RAG 기반 세무 해설 엔진 (TaxExplainer)
│   │   ├── retriever.py        # 벡터 검색 및 원문 인용기
│   │   ├── vector_store.py     # FAISS 벡터 스토어 관리자
│   │   ├── loader.py           # 마크다운 세법 문서 로더
│   │   ├── splitter.py         # 세법 조항 분할기
│   │   └── prompt.py           # 세무 해설 시스템 프롬프트
│   ├── audit/                  # 계산 단계별 근거 및 감사 추적기
│   │   └── logger.py
│   ├── report/                 # 결과지 PDF 리포트 생성기 (스켈레톤 / 추후 지원)
│   │   └── pdf_generator.py
│   └── main.py                 # FastAPI 애플리케이션 엔트리포인트
├── frontend/                   # React + Vite + Tailwind CSS 프론트엔드
│   ├── public/
│   │   ├── assets/             # 일러스트/아이콘 정적 이미지
│   │   └── bgm.mp3             # 집중 배경음악 음원
│   ├── src/
│   │   ├── components/         # 재사용 UI 컴포넌트
│   │   │   ├── godash/               # 인트로 및 메인 대시보드
│   │   │   ├── tax_sections/         # 12개 공제 항목별 세부 폼
│   │   │   ├── BgmPlayer.jsx         # 배경음악 재생 컨트롤러
│   │   │   ├── UploadZone.jsx        # Drag & Drop PDF 업로더
│   │   │   ├── UploadProgressBar.jsx # 파일 업로드 진행 표시줄
│   │   │   ├── TaxStepProgressBar.jsx# 7단계 위저드 단계 바
│   │   │   ├── SubPageHeader.jsx     # 서브페이지 공통 헤더
│   │   │   ├── HomeButton.jsx        # 홈 바로가기 플로팅 버튼
│   │   │   ├── DesignAlertModal.jsx  # 커스텀 알림/확인 모달
│   │   │   ├── AuditTrailTimeline.jsx# 감사 추적 인터랙티브 타임라인
│   │   │   └── UserAuthStatus.jsx    # 로그인/게스트 상태 표시
│   │   ├── pages/              # 주요 화면 (13개 전체 페이지, React.lazy 적용)
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
│   │   │   ├── CompanyPage.jsx       # 정산봄 서비스 소개 및 회사 안내
│   │   │   └── TaxWizardPage.jsx     # 연말정산 시작 가이드
│   │   ├── context/            # 전역 상태 관리
│   │   │   └── AuthContext.jsx       # 로그인/게스트 인증 컨텍스트
│   │   ├── services/           # API 클라이언트
│   │   │   └── api.js                # Axios REST API 클라이언트
│   │   ├── utils/              # 유틸리티 함수 및 스토리지
│   │   │   ├── taxCalculator.js      # 프론트엔드 실시간 세액 계산 엔진
│   │   │   ├── secureStorage.js      # PII 재귀 마스킹 및 암호화 로컬 스토리지
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
│   ├── vite.config.js          # Vite 설정 및 청크 분할(manualChunks) 최적화
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json            # 프론트엔드 패키지 의존성
├── rules/                      # 세법 규칙 정의 및 상수 모듈
│   └── 2025/
│       ├── tax_rates.py        # 2025년 기본세율, 누진공제, 한도액 정의
│       └── __init__.py
├── rag_data/                   # 국세청 공식 가이드라인 원본 PDF 및 Vector DB
├── tests/                      # Pytest 테스트 스위트 (108개)
│   ├── unit/                   # 단위 테스트
│   │   ├── test_tax_engine.py          # 세액 계산 엔진 단위 테스트
│   │   ├── test_rule_engine.py         # 규칙 검증 엔진 단위 테스트
│   │   ├── test_ocr_parser.py          # PDF/OCR 파싱 단위 테스트
│   │   ├── test_audit_trail.py         # 감사 로그 단위 테스트
│   │   ├── test_authorization_guard.py # 보안/권한 가드 단위 테스트
│   │   ├── test_rag_system.py          # RAG 벡터 검색 단위 테스트
│   │   ├── test_upload_validation.py   # 파일 업로드 유효성 테스트
│   │   ├── test_nts_sections.py        # 간소화 섹션 파서 (가족 이름을 바꿔도 같은 결과)
│   │   ├── test_jwt_verification.py    # JWT 위조·만료·데모토큰·IDOR 차단 테스트
│   │   ├── test_guest_session.py       # 게스트 간 세션 분리·위조/만료 토큰·게스트 자료 삭제 테스트
│   │   ├── test_tax_engine_fixes.py    # 자녀 8세·교육비 인별 한도·표준세액공제·차감 0원 테스트
│   │   └── test_session_inputs.py      # 화면 입력 저장 → 계산 → 감사 로그 교차검증 연동 테스트
│   ├── integration/            # 통합 테스트
│   │   └── test_api_v1.py              # v1 API 엔드포인트 통합 테스트
│   └── conftest.py             # 테스트 픽스처
├── alembic/                    # DB 스키마 마이그레이션
├── alembic.ini
├── selftax.db                  # 로컬 SQLite 데이터베이스 (서버 실행 시 자동 생성)
├── .env                        # 환경 변수 (로컬)
├── .env.example                # 환경 변수 템플릿
├── requirements.txt            # 백엔드 파이썬 의존성 패키지 목록
└── README.md                   # 프로젝트 문서
```

---

## 6. 보안 및 개인정보 보호 원칙 (Security & Compliance)

* **Zero-Plaintext RRN 원칙**: 업로드 직후 인메모리에서 주민등록번호 뒷자리를 마스킹(서버 `900101-[RRN Omitted]`, 브라우저 `900101-1******`)하며, DB 및 브라우저 스토리지 어디에도 원본 주민등록번호를 평문으로 보관하지 않습니다.
* **수식 연산 결정론화 (Zero-Hallucination)**: 세액 계산 자체에는 LLM을 일절 사용하지 않아 AI의 수식 왜곡 및 할루시네이션 위험을 원천 차단합니다.
* **JWT 서명 검증 & IDOR(BOLA) 방어**: `SUPABASE_URL`(JWKS) 또는 `SUPABASE_JWT_SECRET`으로 토큰 서명·만료·aud를 검증하고, 세션·문서마다 소유자를 대조합니다. 운영 모드(`ENVIRONMENT=production`)에서는 `X-User-Id`·데모 토큰을 무시하며, 검증 설정이 없으면 모든 토큰을 거부합니다.
* **게스트 세션 분리**: '로그인 없이 둘러보기' 사용자는 `POST /api/v1/auth/guest`로 서버가 서명한 게스트 전용 토큰(HMAC-SHA256, 기본 24시간)을 받아 요청합니다. 게스트마다 서버 계정이 따로 생겨 다른 게스트의 세션·결과·감사로그에 접근할 수 없고(403), 토큰 없는 요청은 세션 API에서 401로 거부됩니다(공용 기본 사용자 세션 제거). 둘러보기를 끝내거나 창을 닫으면 `DELETE /api/v1/auth/guest`로 서버 자료를 지우고, 남은 만료 게스트 자료는 새 게스트 발급 시 정리합니다. 브라우저에서는 활성 작업 공간의 주인(`selftax_active_owner`)을 기록해 게스트↔로그인 사용자, 사용자 A↔B 전환 시 이전 사람의 자료를 비우고 남의 자료를 내 계정 번들에 저장하지 않습니다. 운영 배포 시 `.env`에 `GUEST_TOKEN_SECRET`(또는 `SECRET_KEY`)를 설정하세요(미설정 시 서버 재시작마다 게스트 토큰이 무효).
* **클라이언트 PII 재귀 살균**: `deepSanitizeSensitiveData`를 통해 브라우저 로컬 저장소 저장 직전 모든 객체 트리의 주민번호 및 식별번호를 자동 마스킹합니다.
* **안전한 HTTP 보안 헤더 탑재**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` 적용.

---

## 7. 핵심 REST API 명세 (Core REST APIs)

> 모든 엔드포인트는 접두사 `/api/v1`을 사용하며, 클라이언트 호환성을 위한 `/api/v1/tax/*` 별칭(Alias) 라우팅도 함께 지원합니다.  
> 대화형 API 문서는 서버 구동 후 **Swagger UI**(`http://localhost:8000/docs`)에서 직접 테스트할 수 있습니다.

| 분류 | HTTP Method | 엔드포인트 URI | 기능 설명 |
| :--- | :---: | :--- | :--- |
| **세션 관리** | `POST` | `/api/v1/sessions` | 신규 연말정산 세션 발급 및 중기청년/신혼부부 플래그 설정 |
| | `GET` | `/api/v1/sessions/{session_id}` | 세션 진행 상태 및 사용자 정보 조회 |
| | `PUT` | `/api/v1/sessions/{session_id}/inputs` | 화면 입력(근무지·부양가족·공제) 저장 — 서버 교차검증용 (주민번호 원문 미수신) |
| **문서 처리** | `POST` | `/api/v1/upload` | 다중 PDF 업로드 (최대 20MB), 인메모리 PII 마스킹 및 4종 자동 분류 |
| | `POST` | `/api/v1/ocr` | PDF 텍스트 추출 및 문서 엔티티 분석/분류 (HOMETAX, WITHHOLDING 등) |
| **적격성 검증** | `POST` | `/api/v1/validate` | 부양가족 나이·소득 요건(100만원 이하) 판정 및 중도이직 근무지 합산 검증 |
| **세액 계산** | `POST` | `/api/v1/calculate` | 2025 귀속 세액 정밀 계산 및 7단계 Audit Log(감사 로그) DB 영속화 |
| **결과 & 감사** | `GET` | `/api/v1/result/{identifier}` | 최종 결정세액, 환급/추징세액, 소득·세액공제 종합 상세 조회 |
| | `GET` | `/api/v1/audit/{identifier}` | "왜 이 금액인가요?" 7단계 연산 과정, 법정 수식 및 국세청 근거 조항 조회 |
| **RAG & AI** | `POST` | `/api/v1/rag/search` | 국세청 연말정산 신고안내서 기반 벡터 검색 및 출처 페이지 명시 해설 |
| | `POST` | `/api/v1/rag/explain` | Tax Engine 연산 결과와 국세청 가이드를 결합한 AI 맞춤형 설명(DTO) 생성 |
| **자가진단 & 체크** | `POST` | `/api/v1/checklist` | 월세, 실손보험, 혼인공제 등 공제 누락/과다공제 방지 자가진단 질문 리스트 |

---

## 8. 개발 환경 설정 및 실행 방법

### 8.1 Backend (FastAPI)

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

### 8.2 Frontend (React + Vite)

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

### 8.3 테스트 실행 (Backend Pytest)

```powershell
.\.venv\Scripts\python.exe -m pytest -v tests/
```
(총 108개 단위·통합 테스트. `test_rag_system.py` 등 RAG 4개는 OpenAI API 키와 네트워크가 있어야 통과합니다)
