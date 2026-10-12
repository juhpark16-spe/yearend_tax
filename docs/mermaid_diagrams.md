# 📊 정산봄(JeongsanBom) AI 셀프 연말정산 시스템 Mermaid 다이어그램 명세서

본 문서는 **정산봄(SelfTax 2025) AI 셀프 연말정산 서비스**의 현재 코드베이스와 기술 구현을 정밀 분석하여 작성된 통합 Mermaid 다이어그램 모음입니다.

---

## 📑 목차
1. [전체 시스템 아키텍처 및 계층 다이어그램 (System Architecture)](#1-전체-시스템-아키텍처-및-계층-다이어그램)
2. [사용자 여정 및 화면 네비게이션 전이도 (User Journey & Screen Navigation)](#2-사용자-여정-및-화면-네비게이션-전이도)
3. [듀얼 세액 엔진 교차검증 & Parity 아키텍처 (Dual Engine & Cross-Check)](#3-듀얼-세액-엔진-교차검증--parity-아키텍처)
4. [2025 결정론적 세액 엔진 7단계 및 공제 배분 폭포수 (Tax Engine Waterfall)](#4-2025-결정론적-세액-엔진-7단계-및-공제-배분-폭포수)
5. [엔드투엔드 데이터 처리 & RAG 질의 시퀀스 (End-to-End Sequence)](#5-엔드투엔드-데이터-처리--rag-질의-시퀀스)
6. [보안, PII 보호 및 세션 라이프사이클 상태도 (Security & Lifecycle)](#6-보안-pii-보호-및-세션-라이프사이클-상태도)
7. [데이터베이스 엔티티 관계도 (Database ERD)](#7-데이터베이스-엔티티-관계도)

---

## 1. 전체 시스템 아키텍처 및 계층 다이어그램

정산봄은 클라이언트 브라우저 실시간 엔진과 백엔드 Python 결정론적 엔진이 상호 보완하며, 강력한 인메모리 PII 마스킹과 국세청 공문서 RAG가 결합된 5계층 아키텍처를 가집니다.

```mermaid
graph TB
    subgraph ClientLayer ["1. 클라이언트 프론트엔드 계층 (React 18 + Vite 5)"]
        direction TB
        UI_Entry["대시보드 & 온보딩 (GoDash, TaxWizard)"]
        UI_Doc["서류 업로더 (HometaxPage, WithholdingPage)"]
        UI_Form["세무 폼 & 검증 (FamilyPage, DataInputPage 7개 섹션)"]
        UI_Res["결과 & 감사 화면 (TaxResultPage, AuditTrailTimeline)"]
        UI_AI["AI 리포트 & 절세팁 (AiReportPage, TaxTipsPage)"]
        
        subgraph ClientCore ["클라이언트 연산 & 보안 유틸리티"]
            ClientCalc["브라우저 실시간 세액엔진 (taxCalculator.js)"]
            ClientCross["교차검증 변환기 (serverInputs.js)"]
            ClientStore["스토리지 암호화 (secureStorage: AES-GCM 256 + IndexedDB 키)"]
        end
        
        UI_Form --> ClientCalc
        ClientCalc --> UI_Res
        UI_Res --> ClientCross
        UI_Doc -.-> ClientStore
        UI_Form -.-> ClientStore
    end

    subgraph GatewayLayer ["2. 보안 게이트웨이 & 접근 제어 (FastAPI Middleware)"]
        RateLimiter["요청 횟수 제한기 (rate_limit.py: IP/사용자별 429 Retry-After)"]
        SecHeaders["보안 HTTP 응답 헤더 (nosniff, DENY, strict-origin)"]
        AuthGuard["인증 & 인가 가드 (Supabase JWKS/HS256 + Guest HMAC 토큰)"]
        IDORGuard["환경 인지형 IDOR 가드 (세션 소유권 강제 검증)"]
        
        SecHeaders --> RateLimiter --> AuthGuard --> IDORGuard
    end

    subgraph IngestionLayer ["3. 문서 수집 & 개인정보 보호 계층 (backend/parser & security)"]
        PII_Stream["인메모리 PII 마스커 (주민번호 뒷자리 900101-1****** 치환)"]
        OCR_ImageMask["스캔본 이미지 마스커 (image_pii_mask.py: RapidOCR 차폐)"]
        PDF_Parser["인메모리 PDF 텍스트 추출 (pdfplumber)"]
        DocClassifier["4종 전자서식 자동 분류기 (classifier.py)"]
        NTS_Extractor["공제 항목 & 섹션 파서 (extractor.py, nts_sections.py)"]
        
        PII_Stream --> PDF_Parser
        OCR_ImageMask --> PDF_Parser
        PDF_Parser --> DocClassifier --> NTS_Extractor
    end

    subgraph CoreEngineLayer ["4. 핵심 비즈니스 & 연산 엔진 계층 (backend/services & rule_engine)"]
        RuleEngine["규칙 검증 엔진 (ValidationService: 나이/소득/중복공제/근무지 합산)"]
        TaxEngine["2025 결정론적 세액 엔진 (TaxCalculationService: Pure Python 100%)"]
        AuditLogger["7단계 법정 감사 추적기 (AuditService: 수식/한도/법령 영속화)"]
        RetentionWorker["서버 자료 보존 관리자 (data_retention.py: 30일 경과/즉시 삭제)"]
        
        RuleEngine --> TaxEngine
        TaxEngine --> AuditLogger
    end

    subgraph RAGLayer ["5. 지능형 RAG & 해설 계층 (backend/ai & rag)"]
        KB_NTS["국세청 공식 신고안내서 지식베이스 (rag_data/markdown)"]
        FAISS_DB["FAISS 벡터 인덱스 스토어"]
        RAGRetriever["조항/페이지 인용 검색기 (rag_service.py)"]
        TaxExplainer["AI 세무 해설기 (explanation_service.py: 숫자 기반 프롬프트)"]
        
        KB_NTS --> FAISS_DB
        FAISS_DB --> RAGRetriever --> TaxExplainer
    end

    subgraph StorageLayer ["6. 데이터 영속 계층 (SQLAlchemy 2.0 + Alembic)"]
        AlembicMgr["Alembic 마이그레이션 관리자 (migrations.py)"]
        MainDB[("SQLite / PostgreSQL (sessions, documents, tax_results, audit_logs)")]
        AlembicMgr --> MainDB
    end

    %% 연결 통신선
    ClientLayer -->|"REST API (HTTPS/JSON)"| GatewayLayer
    GatewayLayer --> IngestionLayer
    GatewayLayer --> CoreEngineLayer
    GatewayLayer --> RAGLayer
    NTS_Extractor --> CoreEngineLayer
    CoreEngineLayer --> MainDB
    TaxEngine -.->|"계산 결과 DTO 전달"| TaxExplainer
    RetentionWorker --> MainDB
```

---

## 2. 사용자 여정 및 화면 네비게이션 전이도

사용자(근로자/게스트)가 서비스에 접속하여 연말정산을 완료하고 AI 리포트 및 감사 추적을 확인하기까지의 7단계 화면 흐름도입니다.

```mermaid
flowchart TD
    Start(["서비스 접속 (http://localhost:5173)"]) --> GoDash["GoDash (메인 대시보드)"]
    
    subgraph AuthBranch ["인증 및 세션 진입"]
        GoDash -->|"로그인 없이 둘러보기"| GuestToken["게스트 토큰 발급 (POST /auth/guest)"]
        GoDash -->|"Supabase 로그인"| UserAuth["사용자 JWT 세션 활성화"]
        GuestToken --> Wizard["TaxWizardPage (온보딩 위저드)"]
        UserAuth --> Wizard
        GoDash -->|"직접 시작"| Hometax["HometaxPage (간소화 서류 업로드)"]
    end

    Wizard --> Hometax
    
    subgraph DocUploadStage ["문서 업로드 단계"]
        Hometax -->|"PDF 드래그&드롭"| ParsePDF["인메모리 PII 마스킹 & 파싱"]
        ParsePDF --> Withholding["WithholdingPage (원천징수영수증 등록)"]
        Withholding -->|"종전 근무지 존재"| PreviousJob["PreviousJobPage (종전/주근무지 합산)"]
        Withholding -->|"단일 근무지"| Family["FamilyPage (부양가족 관리)"]
        PreviousJob --> Family
    end

    subgraph ValidationStage ["검증 및 세부입력 단계"]
        Family -->|"서버 규칙검증 호출"| RuleCheck["FamilyValidationCard (/tax/validate)"]
        RuleCheck -->|"인별 나이/소득/중복 판정"| DataInput["DataInputPage (공제자료 세부입력)"]
        
        subgraph SubSections ["DataInput 7개 세부 섹션"]
            D1["주택자금"]
            D2["주택마련저축"]
            D3["연금계좌"]
            D4["노란우산"]
            D5["장기투자증권"]
            D6["기타소득공제"]
            D7["전년도 이월기부금"]
        end
        DataInput --- SubSections
    end

    subgraph ResultStage ["세액 산출 & 분석 단계"]
        DataInput -->|"taxCalculator.js 실시간 연산"| TaxResult["TaxResultPage (예상 환급/추징세액)"]
        
        TaxResult -->|"왜 이 금액인가요?"| AuditView["AuditTrailTimeline (7단계 계산식 타임라인)"]
        TaxResult -->|"AI 종합 리포트 확인"| AiReport["AiReportPage (AI 절세 리포트 & 시뮬레이션)"]
        TaxResult -->|"절세 팁 / 이력"| TipsHistory["TaxTipsPage / TaxHistoryPage"]
        
        subgraph ReportFeatures ["AiReport 세부 기능"]
            VerifyLine["✓ 계산 검증 완료 한 줄 (백엔드 자동 재계산 일치)"]
            AiExplain["AI 근거 보기 (/rag/explain 국세청 조항 해설)"]
            DevCrossCheck["검증 모드: ServerCrossCheckCard (?verify=1)"]
            DataPurge["서버에 저장된 내 자료 삭제 (/me/data)"]
        end
        AiReport --- ReportFeatures
    end

    AuditView --> TaxResult
    TipsHistory --> GoDash
    AiReport --> GoDash
```

---

## 3. 듀얼 세액 엔진 교차검증 & Parity 아키텍처

프론트엔드(`taxCalculator.js`)와 백엔드(`tax_engine.py`)가 독립적으로 구현되어 상호 교차검증(Dual-Engine Verification)을 수행하는 고신뢰성 아키텍처입니다.

```mermaid
flowchart LR
    subgraph UI_State ["브라우저 UI 상태 (React State)"]
        UserInput["근로자 입력 데이터\n(급여, 부양가족, 12개 공제, 전년도 이월기부금)"]
    end

    subgraph FrontendEngine ["프론트엔드 엔진 (taxCalculator.js)"]
        direction TB
        F_Step1["1. 총급여 집계"]
        F_Step2["2. 근로소득금액 (최대 2천만 공제)"]
        F_Step3["3. 과세표준 (소득공제 한도 적용)"]
        F_Step4["4. 산출세액 (8단계 누진세율)"]
        F_Step5["5. 세액감면/공제 (제60조 순서 배분)"]
        F_Step6["6. 결정세액 확정"]
        F_Step7["7. 차감징수세액 (10원 미만 절사)"]
        
        F_Step1 --> F_Step2 --> F_Step3 --> F_Step4 --> F_Step5 --> F_Step6 --> F_Step7
    end

    subgraph BackendEngine ["백엔드 엔진 (TaxCalculationService)"]
        direction TB
        B_Step1["1. 총급여 집계 (주+종전 합산)"]
        B_Step2["2. 근로소득금액"]
        B_Step3["3. 과세표준 도출"]
        B_Step4["4. 산출세액 연산"]
        B_Step5["5. 감면/공제 (표준세액 비교 및 배분)"]
        B_Step6["6. 결정세액 확정"]
        B_Step7["7. 차감징수세액 (10원 미만 절사)"]
        
        B_Step1 --> B_Step2 --> B_Step3 --> B_Step4 --> B_Step5 --> B_Step6 --> B_Step7
    end

    UserInput -->|"즉시 동기 연산 (0ms 지연)"| FrontendEngine
    FrontendEngine --> FastRender["화면 즉각 렌더링 (환급액 표시)"]

    subgraph CrossCheckSystem ["교차검증 시스템"]
        Converter["serverInputs.js\n(화면 상태 ➔ DTO 변환)"]
        FastAPI_Calc["POST /api/v1/calculate\n(백엔드 Python 실행)"]
        Comparator["compare.mjs / serverInputs.js\n(7단계 및 세액공제 항목별 오차 비교)"]
        
        Converter --> FastAPI_Calc --> BackendEngine
        BackendEngine --> Comparator
        FrontendEngine --> Comparator
    end

    FastRender -.->|"AI 리포트 마운트 시 자동 호출"| Converter

    subgraph UserFeedback ["사용자/개발자 피드백"]
        UserLine["근로자 화면: '✓ 계산 검증 완료 — 두 계산이 같은 결과를 냈습니다'"]
        DevCard["개발자 검증 모드(?verify=1): 7개 단계 오차 0원 확인표 & Audit Log"]
        ParityTest["CI/CD: tests/parity 가상인물 6종 자동 검증"]
    end

    Comparator -->|일치| UserLine
    Comparator -->|검증모드 활성화 시| DevCard
    BackendEngine -.-> ParityTest
    FrontendEngine -.-> ParityTest
```

---

## 4. 2025 결정론적 세액 엔진 7단계 및 공제 배분 폭포수

대한민국 소득세법 제60조(세액감면 및 세액공제의 적용순서)와 2025년 개정 세법(신혼부부, 자녀, 연금 ISA 확대)을 준수하는 연산 파이프라인입니다.

```mermaid
flowchart TD
    Step1["Step 1: 총급여 집계\n- 주(현) + 종(전) 근무지 과세총급여 합산\n- 기납부세액(소득세 + 지방소득세) 합산"]
    
    Step2["Step 2: 근로소득금액 계산\n- 총급여액 - 5단계 근로소득공제 (최대 2,000만원 한도)"]
    
    Step3["Step 3: 과세표준 확정\n- 근로소득금액 - 종합소득공제 합계\n(인적공제 + 연금보험료 + 특별소득공제 + 신용카드 등 - 한도초과액)"]
    
    Step4["Step 4: 산출세액 도출\n- 2025년 8단계 초과누진세율(6% ~ 45%) 속산표 적용"]
    
    Step5["Step 5: 세액감면 및 세액공제 배분 (Waterfall)\n※ 소득세법 제60조 법정 적용순서 준수"]
    
    Step6["Step 6: 결정세액 확정\n- 산출세액 - 실제 적용된 세액감면·공제 합계\n(결정세액은 0원 미만으로 내려갈 수 없음)"]
    
    Step7["Step 7: 환급 / 추가납부세액 결정\n- 차감징수세액 = 결정세액 - 기납부세액\n- 소득세 및 지방소득세 각각 10원 미만 절사 (버림)"]

    Step1 --> Step2 --> Step3 --> Step4 --> Step5 --> Step6 --> Step7

    subgraph Waterfall_Order ["소득세법 제60조 공제 적용순서 (산출세액 한도 내 순차 차감)"]
        direction TB
        W1["1순위: 세액감면 (중소기업 취업 청년 소득세 감면 등)"]
        W2["2순위: 이월공제 불가 세액공제\n- 근로소득세액공제 (최대 74만원)\n- 혼인세액공제 (2025 신설: 생애 1회 50만원)\n- 자녀세액공제 (2025 개정: 1명 25만 / 2명 55만 / 3명이상 +40만)\n- 출산·입양공제 (첫째 30만 / 둘째 50만 / 셋째 70만)\n- 특별세액공제 (보장성보험, 의료비, 교육비 인별한도, 월세)\n- 법정기부금 (정치자금, 고향사랑기부금, 우리사주조합)"]
        W3["3순위: 이월공제 가능 세액공제\n- 지정기부금 (특례 ➔ 일반 종교단체 외 ➔ 종교단체 순)\n- 전년도 이월 기부금 (2015~2024 발생분) 당해연도 기부금보다 최우선 공제"]
        W4["4순위: 연금계좌 세액공제\n- 연금저축/IRP (기본 900만 + ISA 전환 추가 300만 한도)\n- 초과분은 불공제 처리 후 소진"]
        
        W1 --> W2 --> W3 --> W4
    end

    subgraph StandardTax_Compare ["표준세액공제 비교 판정"]
        ST_Check{"특별소득공제+특별세액공제 vs 표준세액공제 13만원"}
        ST_OptionA["경우 A: 특별소득/세액공제 모두 적용하여 전액 계산"]
        ST_OptionB["경우 B: 특별공제 배제 후 표준세액공제(13만원) 적용하여 재계산"]
        ST_Result["두 결과 중 결정세액이 더 적은 유리한 쪽을 최종 채택"]
        
        ST_Check --> ST_OptionA
        ST_Check --> ST_OptionB
        ST_OptionA --> ST_Result
        ST_OptionB --> ST_Result
    end

    Step5 -.-> Waterfall_Order
    Step5 -.-> StandardTax_Compare
```

---

## 5. 엔드투엔드 데이터 처리 & RAG 질의 시퀀스

사용자 브라우저, FastAPI 보안 라우터, 인메모리 살균기, 세액 엔진 및 RAG 서비스 간의 전체 통신 시퀀스입니다.

```mermaid
sequenceDiagram
    autonumber
    actor User as 사용자 (근로자/게스트)
    participant UI as 프론트엔드 (React)
    participant Storage as 브라우저 스토리지 (AES-GCM)
    participant API as FastAPI v1 라우터
    participant Security as 보안 가드 (JWT/Guest/RateLimit)
    participant PII as 인메모리 PII 살균기
    participant TaxEngine as 2025 결정론적 세액 엔진
    participant DB as SQLite / PostgreSQL
    participant RAG as RAG 해설기 (TaxExplainer)

    %% 1. 세션 진입
    User->>UI: 서비스 접속 및 시작
    alt 게스트 사용자
        UI->>API: POST /api/v1/auth/guest
        API->>Security: 서명된 HMAC 게스트 토큰 발급 (24h)
        Security-->>UI: Guest Token 반환
    else 로그인 사용자
        UI->>Security: Supabase OAuth 로그인 (JWT 수신)
    end

    %% 2. 문서 업로드 & 살균
    User->>UI: 국세청 간소화 PDF 업로드
    UI->>Storage: PII 재귀 마스킹 후 로컬 암호화 저장 (_sec_v2_)
    UI->>API: POST /api/v1/upload (Multipart PDF)
    API->>Security: 토큰 검증 & Rate Limit 체크
    Security->>PII: 메모리 바이트 스트림 전달
    PII->>PII: 주민번호 뒷자리 즉시 치환 (900101-1******)
    Note over PII: 원본 번호는 메모리 및 DB 어디에도 평문 보관 금지
    PII-->>API: 9대 공제 파싱 데이터 반환
    API-->>UI: 추출된 공제 항목 JSON 응답

    %% 3. 부양가족 적격성 검증
    User->>UI: 부양가족 정보 확인/입력
    UI->>API: POST /api/v1/validate (인별 나이/소득/관계)
    API->>TaxEngine: 법정 기본공제 요건 및 중복공제 검증
    TaxEngine-->>API: 인별 적격 여부 및 경고 플래그 반환
    API-->>UI: 부양가족 검증 카드 표시

    %% 4. 실시간 세액 계산 & 교차검증
    User->>UI: 공제자료 확인 완료
    UI->>UI: taxCalculator.js 브라우저 즉시 계산 (0ms)
    UI->>User: 예상 환급/추징세액 화면 표시
    
    opt 백엔드 자동 교차검증
        UI->>API: PUT /api/v1/sessions/{id}/inputs (암호화 제외된 수치 데이터)
        UI->>API: POST /api/v1/calculate (백엔드 재계산)
        API->>TaxEngine: 7단계 연산 및 제60조 공제 배분
        TaxEngine->>DB: TaxResult 및 AuditLog (7단계 수식/조항) 저장
        TaxEngine-->>API: 계산 결과 DTO 반환
        API-->>UI: 백엔드 계산값 응답
        UI->>UI: 두 엔진 7단계 일치 검증 ➔ '✓ 계산 검증 완료' 배지 표시
    end

    %% 5. AI 절세 리포트 & RAG 질의
    User->>UI: 'AI 근거 보기' 클릭
    UI->>API: POST /api/v1/rag/explain (계산된 숫자 파라미터 전달)
    API->>RAG: 질문 + 세무 컨텍스트 전달
    RAG->>RAG: FAISS 벡터 검색 (국세청 신고안내서 조항 및 페이지 추출)
    RAG->>RAG: GPT-4o 설명 생성 (할루시네이션 방지 프롬프트)
    RAG-->>API: ExplanationDTO (요약, 법적 근거 조항, 가이드 페이지)
    API-->>UI: 출처가 표기된 신뢰성 있는 AI 리포트 렌더링
```

---

## 6. 보안, PII 보호 및 세션 라이프사이클 상태도

민감 개인정보(주민등록번호 등)가 시스템에 유입되어 마스킹되고 소멸하기까지의 무평문(Zero-Plaintext) 보안 라이프사이클입니다.

```mermaid
stateDiagram-v2
    [*] --> ClientEntry: 서비스 접속

    state ClientEntry {
        [*] --> KeyGen: Web Crypto AES-GCM 256비트 키 생성
        KeyGen --> KeyStore: IndexedDB 비추출(Non-extractable) 안전 보관
        KeyStore --> SessionReady: 클라이언트 메모리 준비 완료
    }

    ClientEntry --> UploadEvent: PDF 문서 업로드

    state UploadEvent {
        [*] --> BrowserSanitize: deepSanitizeSensitiveData 실행
        BrowserSanitize --> LocalEncrypted: AES-GCM 암호화 스토리지 저장 (_sec_v2_)
        LocalEncrypted --> NetworkSending: HTTPS TLS 전송
    }

    UploadEvent --> ServerProcessing: 백엔드 수신

    state ServerProcessing {
        [*] --> HeaderCheck: 보안 헤더 및 Rate Limit(429) 통과
        HeaderCheck --> AuthVerification: Supabase JWT / Guest HMAC 서명 검증
        AuthVerification --> InMemoryMask: In-Memory PII 살균 (주민번호 뒷자리 마스킹)
        InMemoryMask --> ScanMask: 스캔본 이미지 발생 시 RapidOCR 검은 박스 차폐
        ScanMask --> ZeroPlaintextRule: 원본 번호 인메모리 즉시 가비지 컬렉션
    }

    ServerProcessing --> PersistenceState: 데이터베이스 보관

    state PersistenceState {
        [*] --> CleanDBSave: 마스킹 완료된 데이터만 영속화
        CleanDBSave --> AuditRecord: 단계별 연산 수식 및 법률 근거 기록
    }

    PersistenceState --> DataPurgeState: 생명주기 만료 및 파기

    state DataPurgeState {
        direction TB
        GuestClose: 브라우저 탭 종료 ➔ DELETE /api/v1/auth/guest 즉시 파기
        UserManual: 사용자 직접 클릭 ➔ DELETE /api/v1/me/data 즉시 파기
        AutoExpire: 30일 경과 세션 ➔ data_retention.py 자동 정리
    }

    DataPurgeState --> [*]: 모든 개인정보 완전 소멸
```

---

## 7. 데이터베이스 엔티티 관계도

SQLAlchemy 2.0 모델 및 Alembic 마이그레이션으로 관리되는 데이터베이스 핵심 스키마 관계도(ERD)입니다.

```mermaid
erDiagram
    User ||--o{ TaxSession : "has many"
    TaxSession ||--o{ Document : "contains"
    TaxSession ||--o{ FamilyMember : "manages"
    TaxSession ||--o{ DeductionItem : "includes"
    TaxSession ||--o| TaxResult : "produces"
    TaxSession ||--o{ AuditLog : "records"

    User {
        string id PK "사용자 고유 UUID 또는 게스트 해시 키"
        string email "사용자 이메일 (게스트는 guest@selftax.local)"
        string name "사용자 이름"
        datetime created_at "계정 생성 일시"
        datetime updated_at "수정 일시"
    }

    TaxSession {
        string id PK "세션 UUID"
        string user_id FK "소유자 User ID (IDOR 격리 기준)"
        int tax_year "귀속 연도 (예: 2025)"
        string status "세션 상태 (DRAFT, CALCULATED, ARCHIVED)"
        boolean is_youth_small_business "중소기업 취업청년 여부"
        boolean is_newlywed "신혼부부 혼인세액공제 대상 여부"
        datetime last_accessed_at "최종 접근 일시 (30일 보존 기준)"
        datetime created_at "생성 일시"
    }

    Document {
        string id PK "문서 UUID"
        string session_id FK "소속 세션 ID"
        string doc_type "문서 분류 (HOMETAX, WITHHOLDING, REGISTER, OTHER)"
        string original_filename "마스킹 처리된 원본 파일명"
        string file_hash "SHA-256 중복 검증 해시"
        int file_size "파일 크기 (바이트)"
        datetime uploaded_at "업로드 일시"
    }

    FamilyMember {
        string id PK "부양가족 UUID"
        string session_id FK "소속 세션 ID"
        string relationship "관계 코드 (본인, 배우자, 직계존속, 직계비속 등)"
        string masked_rrn "마스킹된 주민등록번호 (900101-1******)"
        int birth_year "출생 연도 (나이 요건 계산용)"
        int annual_income "연간 소득금액 (100만원 이하 여부)"
        boolean is_basic_deduction "기본공제 대상 적격 여부"
        boolean is_disabled "장애인 공제 대상 여부"
    }

    DeductionItem {
        string id PK "공제 항목 UUID"
        string session_id FK "소속 세션 ID"
        string category "공제 카테고리 (INSURANCE, MEDICAL, EDUCATION, CREDIT_CARD, PENSION 등)"
        string sub_category "세부 항목 (국민연금, 주택청약, 일반기부금 등)"
        bigint amount "지출/납입 금액"
        bigint previous_carryover "전년도 이월 금액 (기부금 전용)"
    }

    TaxResult {
        string id PK "세액 결과 UUID"
        string session_id FK "세션 ID (1:1 대응)"
        bigint total_salary "총급여액 (Step 1)"
        bigint earned_income_amount "근로소득금액 (Step 2)"
        bigint tax_base "과세표준 (Step 3)"
        bigint calculated_tax "산출세액 (Step 4)"
        bigint total_tax_credit "세액공제 및 감면 합계 (Step 5)"
        bigint final_tax "결정세액 (Step 6)"
        bigint prepaid_tax "기납부세액"
        bigint balance_tax "차감징수세액 (Step 7: 10원 단위 절사)"
        datetime calculated_at "연산 완료 일시"
    }

    AuditLog {
        string id PK "감사 로그 UUID"
        string session_id FK "세션 ID"
        int step_number "연산 단계 (Step 1 ~ 7)"
        string step_name "단계 명칭 (예: 과세표준 도출, 세액공제 배분)"
        string formula_applied "적용된 법정 공식 및 수식"
        string legal_reference "소득세법 제XX조 및 국세청 규정 조항"
        json input_snapshot "해당 단계 입력값 스냅샷"
        bigint output_value "산출된 단계별 금액"
        datetime created_at "기록 일시"
    }
```

---

## 📌 요약 및 특징

1. **최신 코드베이스 100% 동기화**: `taxCalculator.js`와 백엔드 세액 엔진의 듀얼 검증 체계, 소득세법 제60조 배분 순서, 2025 개정 세법(신혼부부, 자녀, 연금 ISA), Web Crypto AES-GCM 스토리지 암호화, 게스트 토큰 라이프사이클을 모두 망라했습니다.
2. **무할루시네이션(Zero-Hallucination) 원칙 시각화**: 세액 계산에는 LLM을 배제하고 Pure Python 및 JS 공식으로 연산하며, AI는 국세청 공문서 RAG 기반의 근거 조항 해설에만 제한 적용됨을 다이어그램으로 명확히 규정했습니다.
3. **무평문(Zero-Plaintext) 보안 준수**: 클라이언트 브라우저, 네트워크 전송, 서버 인메모리, 데이터베이스 영속화에 이르는 전 구간 개인식별정보(PII) 마스킹 처리 흐름을 도식화했습니다.
