# 정산봄 (SelfTax 2025) 시스템 다이어그램 명세서

본 문서는 **정산봄 AI 셀프 연말정산 서비스**의 아키텍처, 데이터 파이프라인, 사용자 화면 네비게이션, 세액 연산 엔진 및 보안 라이프사이클을 표현한 Mermaid 다이어그램 모음입니다.

---

## 1. 전체 시스템 아키텍처 (System Architecture)

프론트엔드(React/Vite), 백엔드(FastAPI), 코어 엔진 계층(규칙 엔진, 세액 계산기, 감사 추적기, RAG) 및 데이터 저장소 간의 계층형 아키텍처입니다.

```mermaid
graph TB
    subgraph Client ["프론트엔드 (React 18 + Vite 5)"]
        UI_Dash["대시보드 / 온보딩 (GoDash, Wizard)"]
        UI_Upload["서류 업로더 (Hometax, Withholding)"]
        UI_Input["세무 데이터 입력 (Family, DataInput)"]
        UI_Result["결과 & 감사 추적 (TaxResult, Timeline)"]
        UI_AI["AI 리포트 & 절세팁 (AiReport, TaxTips)"]
        ClientStorage["클라이언트 저장소 (secureStorage: PII 재귀 마스킹)"]
    end

    subgraph Gateway ["API 게이트웨이 & 보안 가드"]
        AuthGuard["보안 가드 (JWT Exp 검증 & IDOR 방어)"]
        APIRouter["FastAPI v1 라우터 (/api/v1/*)"]
    end

    subgraph Ingestion ["문서 수집 & PII 살균 계층"]
        PIIMasker["인메모리 PII 마스커 (주민번호 뒷자리 즉시 치환)"]
        PDFParser["PDF 파서 (pdfplumber)"]
        DocClassifier["문서 유형 자동 분류기 (4종 전자서식)"]
        DataExtractor["항목별 데이터 추출기 (9대 공제 항목)"]
    end

    subgraph CoreEngine ["핵심 비즈니스 & 연산 엔진"]
        RuleEngine["규칙 엔진 (RuleEngine: 적격성 / 부양가족 / 중복공제 검증)"]
        TaxEngine["2025 결정론적 세액 엔진 (100% Pure Python, LLM 배제)"]
        AuditLogger["감사 추적기 (AuditLogger: 7단계 법정수식 & 근거 기록)"]
    end

    subgraph Intelligence ["지능형 RAG & 해설 계층"]
        FAISS["FAISS 벡터 스토어 (국세청 공식 신고안내서)"]
        Retriever["RAG 리트리버 (조항 / 페이지 인용)"]
        TaxExplainer["AI 세무 해설기 (GPT-4o / 결정론적 Fallback)"]
    end

    subgraph Persistence ["데이터 영속 계층 (SQLAlchemy 2.0)"]
        DB[(SQLite / PostgreSQL: sessions, tax_results, audit_logs)]
    end

    %% 연결 흐름
    Client -->|HTTPS / REST API| AuthGuard
    AuthGuard --> APIRouter
    APIRouter --> PIIMasker
    PIIMasker --> PDFParser --> DocClassifier --> DataExtractor
    DataExtractor --> RuleEngine
    RuleEngine --> TaxEngine
    TaxEngine --> AuditLogger
    TaxEngine --> DB
    AuditLogger --> DB
    APIRouter --> TaxExplainer
    TaxExplainer --> Retriever --> FAISS
    TaxEngine -.->|계산 결과 주입| TaxExplainer
    DB -.->|조회 응답| APIRouter
    APIRouter --> Client
```

---

## 2. 사용자 여정 및 화면 네비게이션 플로우 (User Journey & Navigation Flow)

사용자가 서비스에 진입하여 서류 업로드, 데이터 검증, 세액 계산, 감사 추적 및 AI 리포트를 확인하는 전체 화면 전이도입니다.

```mermaid
flowchart TD
    Start(["서비스 접속 (http://localhost:5173)"]) --> Dash["GoDash 메인 대시보드"]

    Dash -->|시작 가이드| Wizard["TaxWizardPage (온보딩 위저드)"]
    Dash -->|서류 업로드| Hometax["HometaxPage (간소화 PDF 업로드)"]
    Dash -->|원천징수 등록| Withholding["WithholdingPage (종전/주근무지 영수증)"]
    Dash -->|직접 입력| DataInput["DataInputPage (12개 공제항목 세부입력)"]
    Dash -->|서비스 안내| UserGuide["UserGuidePage / CompanyPage"]

    Wizard --> Hometax
    Hometax -->|PII 마스킹 & 파싱 완료| Family["FamilyPage (부양가족 요건 검증)"]
    Withholding --> PreviousJob["PreviousJobPage (종전근무지 합산 관리)"]
    PreviousJob --> Family

    Family --> DataInput
    DataInput -->|실시간 세액 계산 요청| TaxResult["TaxResultPage (예상 환급/추징세액)"]

    TaxResult -->|왜 이 금액인가요?| AuditTrail["AuditTrailTimeline (7단계 세법 연산 타임라인)"]
    TaxResult -->|상세 AI 분석| AiReport["AiReportPage (AI 절세 리포트 & 맞춤 시뮬레이션)"]
    TaxResult -->|맞춤 팁| TaxTips["TaxTipsPage (절세 전략 가이드)"]
    TaxResult -->|연도별 이력| TaxHistory["TaxHistoryPage (연도별 세액 추이 비교)"]

    AuditTrail --> TaxResult
    AiReport --> Dash
    TaxTips --> Dash
    TaxHistory --> Dash
```

---

## 3. 엔드투엔드 데이터 처리 파이프라인 (Data Pipeline)

홈택스 PDF 업로드부터 인메모리 개인정보 살균, 결정론적 세액 연산, 감사 로그 DB 기록 및 RAG 연계 해설까지의 처리 순서도입니다.

```mermaid
sequenceDiagram
    autonumber
    actor User as 사용자 (브라우저)
    participant API as FastAPI 라우터
    participant PII as PII 마스커
    participant Parser as PDF 파서 / 추출기
    participant Rule as 규칙 검증 엔진
    participant Tax as 2025 세액 엔진
    participant Audit as 감사 추적기
    participant DB as 데이터베이스
    participant RAG as RAG 해설기 (TaxExplainer)

    User->>API: POST /api/v1/upload (간소화 PDF 멀티파트 전송)
    API->>PII: 인메모리 바이트 스트림 전달
    PII->>PII: 주민등록번호 뒷자리 마스킹 ("900101-1******")
    Note over PII: 원본 식별정보 메모리/DB 미보관 (Zero-Plaintext)
    PII->>Parser: 마스킹된 스트림 파싱 요청
    Parser-->>API: 구조화된 9대 공제 데이터 반환

    User->>API: POST /api/v1/validate (부양가족/소득 요건 검증)
    API->>Rule: 나이/소득금액/중복공제 규칙 평가
    Rule-->>API: 적격/부적격 판정 플래그 반환

    User->>API: POST /api/v1/calculate (정산 세액 계산 요청)
    API->>Tax: 2025 결정론적 법정 공식 연산 수행
    Tax->>Tax: 근로소득공제, 과세표준, 8단계 누진세율 적용
    Tax->>Tax: 자녀/혼인/연금/특별세액공제 및 표준세액공제 비교
    Tax->>Audit: 단계별 입력값, 산출액, 법정수식, 법조문 전달
    Audit->>DB: 7단계 AuditLog 엔티티 영속화
    Tax->>DB: 최종 TaxResult 영속화
    Tax-->>API: 계산 결과 DTO 반환

    opt AI 해설 요청
        User->>API: POST /api/v1/rag/explain (해설 요청)
        API->>RAG: TaxResult + 질문 전달
        RAG->>RAG: 국세청 가이드 벡터 검색 및 근거 페이지 추출
        RAG-->>API: ExplanationDTO (요약, 법적근거, 페이지)
    end

    API-->>User: 최종 연말정산 결과 및 감사 내역 응답
```

---

## 4. 2025 결정론적 세액 엔진 7단계 연산 흐름도 (7-Step Tax Engine Flow)

대한민국 소득세법 및 2025년 개정 세법에 맞춘 결정론적(Zero-Hallucination) 세액 연산 파이프라인입니다.

```mermaid
flowchart TD
    Step1["Step 1: 총급여액 확정\n(주근무지 + 종전근무지 급여 합산 - 비과세소득)"]
    Step2["Step 2: 근로소득금액 도출\n(총급여액 - 5단계 근로소득공제, 최대 2,000만원)"]
    Step3["Step 3: 종합소득공제 차감\n(기본/추가 인적공제 + 연금보험료 + 특별소득공제 + 신용카드 등)"]
    Step4["Step 4: 과세표준 확정\n(근로소득금액 - 종합소득공제 + 한도초과액)"]
    Step5["Step 5: 산출세액 계산\n(2025년 8단계 누진세율 6% ~ 45% 속산표 적용)"]
    Step6["Step 6: 세액감면 및 세액공제\n(중기청년감면 + 근로소득세액공제 + 2025 개정 세액공제)"]
    Step7["Step 7: 결정세액 및 환급액 확정\n(산출세액 - 세액공제 합계 = 결정세액\n차감징수세액 = 결정세액 - 기납부세액)"]

    Step1 --> Step2 --> Step3 --> Step4 --> Step5 --> Step6 --> Step7

    subgraph Step6_Details ["2025 세액공제 주요 반영 항목"]
        D1["자녀세액공제 (1명 25만 / 2명 55만 / 3명이상 +40만)"]
        D2["신혼부부 혼인세액공제 (생애 1회 50만 원)"]
        D3["출산·입양공제 (첫째 30만 / 둘째 50만 / 셋째 70만)"]
        D4["연금계좌 (기본 900만 + ISA 추가 300만)"]
        D5["특별세액공제 (보장성보험, 의료비, 교육비, 기부금, 월세)"]
        D6["표준세액공제 (13만 원 비교선택)"]
    end

    Step6 -.-> Step6_Details
```

---

## 5. 보안 및 PII 보호 라이프사이클 (Security & Compliance Lifecycle)

클라이언트부터 서버, DB에 이르는 개인정보 보호 및 접근 제어 파이프라인입니다.

```mermaid
stateDiagram-v2
    [*] --> ClientUpload: PDF 파일 선택
    
    state ClientUpload {
        [*] --> ClientSanitize: deepSanitizeSensitiveData 실행
        ClientSanitize --> SecureStorage: 로컬 스토리지 암호화 저장
    }

    ClientUpload --> NetworkTransport: HTTPS 전송 (Multipart)
    
    state NetworkTransport {
        Headers: 보안 HTTP 헤더 적용\n(nosniff, DENY, strict-origin)
        Auth: Supabase JWT 유효성 & exp 만료 검증
    }

    NetworkTransport --> ServerInMemory: 백엔드 수신

    state ServerInMemory {
        Masking: 주민등록번호 뒷자리 마스킹\n(900101-1******)
        IDORCheck: 세션 소유권 검증 (IDOR 차단)
        Parsing: 메모리 상에서만 텍스트 파싱
    }

    ServerInMemory --> Database: DB 영속화
    
    state Database {
        CleanData: 마스킹된 데이터만 저장\n(원본 주민번호 보관 일절 불가)
        AuditTrail: 연산 과정 감사 로그 기록
    }

    Database --> [*]: 안전한 결과 응답
```
