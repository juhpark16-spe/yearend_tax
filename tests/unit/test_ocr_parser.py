"""OCR Parser, PII Masking, Classifier, Extractor 단위 테스트
- PRD_v3.0.md, ERD_v2.0.md, API_v1.0.md 준수
"""
import io
import pytest

from backend.parser.classifier import DocumentClassifier
from backend.parser.extractor import DocumentEntityExtractor
from backend.parser.pdf_parser import PDFParser
from backend.schemas.ocr_output import OCRParsedDocument
from backend.security.pii_mask import PIIMasker


# ============================================================================
# 1. PII 마스킹 테스트 (주민등록번호 정규식 및 주소 마스킹)
# ============================================================================

def test_pii_rrn_masking_omitted_mode():
    r"""SRS_v3.0.md 정규식: (?<![0-9])(\d{6})[- ]?([1-8]\d{6})(?![0-9])"""
    # 1. 하이픈 포함 주민번호
    text1 = "근로자 홍길동 900101-1234567 소득공제 신청"
    masked1 = PIIMasker.mask_rrn(text1, mode="omitted")
    assert "900101-[RRN Omitted]" in masked1
    assert "1234567" not in masked1

    # 2. 공백 포함 주민번호
    text2 = "배우자 김영희 920510 2345678 인적공제 대상"
    masked2 = PIIMasker.mask_rrn(text2, mode="omitted")
    assert "920510-[RRN Omitted]" in masked2
    assert "2345678" not in masked2

    # 3. 구분자 없는 13자리 주민번호
    text3 = "자녀 홍하나 1508203456789 출생자"
    masked3 = PIIMasker.mask_rrn(text3, mode="omitted")
    assert "150820-[RRN Omitted]" in masked3


def test_pii_rrn_masking_asterisk_mode():
    """성별 지시자 보존 마스킹 (YYMMDD-G******)"""
    text = "본인 881225-1234567 및 배우자 900101-2345678"
    masked = PIIMasker.mask_rrn(text, mode="asterisk")
    assert "881225-1******" in masked
    assert "900101-2******" in masked


def test_pii_lookaround_boundary():
    """부정형 전후방 탐색(?<![0-9]), (?![0-9]) 검증: 14자리 이상 긴 숫자는 오탐하지 않음"""
    # 은행 계좌번호나 카드번호 등 15자리 연속 숫자
    long_number = "주문번호 123456789012345 확인"
    masked = PIIMasker.mask_rrn(long_number)
    assert masked == long_number  # 주민번호가 아니므로 마스킹되지 않아야 함


def test_pii_address_masking():
    """주소 시/구 단위까지만 보존하고 상세주소 마스킹"""
    addr1 = "서울특별시 강남구 테헤란로 152 강남파이낸스센터 10층"
    masked1 = PIIMasker.mask_address(addr1)
    assert "서울특별시 강남구" in masked1
    assert "[상세주소 마스킹]" in masked1
    assert "10층" not in masked1

    addr2 = "경기도 성남시 분당구 판교역로 235 에이치스퀘어 N동"
    masked2 = PIIMasker.mask_address(addr2)
    assert "경기도 성남시 분당구" in masked2
    assert "[상세주소 마스킹]" in masked2


# ============================================================================
# 2. 문서 4종 자동 분류기(DocumentClassifier) 테스트
# ============================================================================

def test_classify_withholding():
    """근로소득 원천징수영수증 자동 분류"""
    sample_text = (
        "소득세법 시행규칙 [별지 제24호서식]\n"
        "2025년 귀속 근로소득 원천징수영수증 (소득자 보관용)\n"
        "원천징수의무자 (주)알파솔루션 사업자등록번호 123-45-67890\n"
        "총급여 55,000,000원 결정세액 1,250,000원"
    )
    doc_type, confidence, meta = DocumentClassifier.classify(sample_text, "2025_원천징수.pdf")
    assert doc_type == "WITHHOLDING"
    assert confidence >= 0.85
    assert meta["category"] == "소득/원천징수"


def test_classify_hometax():
    """국세청 홈택스 간소화 공제증명서 자동 분류"""
    sample_text = (
        "2025년도 귀속 소득·세액공제증명서 (연말정산간소화)\n"
        "국세청장 직인 발행\n"
        "신용카드 등 사용금액 합계 18,500,000원 보장성보험료 1,200,000원\n"
        "일반의료비 지출액 3,400,000원"
    )
    doc_type, confidence, meta = DocumentClassifier.classify(sample_text, "hometax_2025.pdf")
    assert doc_type == "HOMETAX"
    assert confidence >= 0.85
    assert "공제" in meta["category"]


def test_classify_resident():
    """주민등록표 등본 자동 분류"""
    sample_text = (
        "주민등록표등본 (세대별)\n"
        "세대주와의 관계: 본인 홍길동 900101-1234567\n"
        "세대구성원: 처 이영희, 자 홍하나\n"
        "거주지 주소: 서울특별시 마포구 공덕동 100"
    )
    doc_type, confidence, meta = DocumentClassifier.classify(sample_text, "등본.pdf")
    assert doc_type == "RESIDENT"
    assert confidence >= 0.85


def test_classify_family():
    """가족관계증명서 자동 분류"""
    sample_text = (
        "가족관계증명서 (상세)\n"
        "등록기준지: 경기도 수원시 팔달구\n"
        "본인 성명: 홍길동\n"
        "부: 홍판서, 모: 옥교모\n"
        "배우자: 이영희"
    )
    doc_type, confidence, meta = DocumentClassifier.classify(sample_text, "가족관계.pdf")
    assert doc_type == "FAMILY"
    assert confidence >= 0.85


# ============================================================================
# 3. 서식별 엔티티 추출기(DocumentEntityExtractor) 테스트
# ============================================================================

def test_extract_withholding_entities():
    """원천징수영수증 상호, 사업자번호, 총급여, 결정세액 추출"""
    text = (
        "근로소득원천징수영수증\n"
        "원천징수의무자: 주식회사 미래소프트 (110-85-12345)\n"
        "근무기간: 2025-01-01 ~ 2025-07-31\n"
        "총급여액: 38,000,000원 비과세소득: 1,400,000원\n"
        "결정세액: 850,000원 지방소득세: 85,000원"
    )
    entities = DocumentEntityExtractor.extract_withholding(text)
    assert "미래소프트" in entities["company_name"]
    assert entities["business_number"] == "110-85-12345"
    assert entities["gross_salary"] == 38000000
    assert entities["non_taxable_salary"] == 1400000
    assert entities["prepaid_income_tax"] == 850000
    assert entities["prepaid_local_tax"] == 85000


def test_extract_withholding_prepaid_tax_rows_74_75():
    """근로소득원천징수영수증 74번/75번 행의 79. 소득세, 80. 지방소득세 추출 검증"""
    # 1. 텍스트 형태 (74번 행 주(현)근무지 기납부세액)
    text_74 = (
        "근로소득원천징수영수증\n"
        "원천징수의무자: (주)한국테크 (220-81-99999)\n"
        "근무처별 소득명세 16. 계 55,000,000원\n"
        "세액계산\n"
        "72. 결정세액 2,500,000 250,000\n"
        "기납부세액 74. 주(현)근무지 1,850,000 185,000 0 2,035,000\n"
        "75. 종(전)근무지 0 0 0 0\n"
        "76. 차감징수세액 650,000 65,000\n"
    )
    entities = DocumentEntityExtractor.extract_withholding(text_74)
    assert entities["gross_salary"] == 55000000
    assert entities["prepaid_income_tax"] == 1850000
    assert entities["prepaid_local_tax"] == 185000

    # 2. 표(table) 형태 (74번 행 주(현), 79. 소득세, 80. 지방소득세)
    tables = [
        [
            ["구분", "79. 소득세", "80. 지방소득세", "81. 농어촌특별세", "82. 계"],
            ["72. 결정세액", "3,000,000", "300,000", "0", "3,300,000"],
            ["74. 주(현)근무지", "2,100,000", "210,000", "0", "2,310,000"],
            ["75. 종(전)근무지", "500,000", "50,000", "0", "550,000"],
            ["76. 차감징수세액", "400,000", "40,000", "0", "440,000"],
        ]
    ]
    entities_table = DocumentEntityExtractor.extract_withholding("근로소득원천징수영수증 (주)에이아이랩 (123-45-67890)", tables=tables)
    assert entities_table["prepaid_income_tax"] == 2100000
    assert entities_table["prepaid_local_tax"] == 210000

    # 3. 74번이 없고 75번(종(전)근무지)만 있는 서류인 경우
    tables_75_only = [
        [
            ["구분", "79. 소득세", "80. 지방소득세", "81. 농어촌특별세", "82. 계"],
            ["74. 주(현)근무지", "0", "0", "0", "0"],
            ["75. 종(전)근무지", "770,000", "77,000", "0", "847,000"],
        ]
    ]
    entities_75 = DocumentEntityExtractor.extract_withholding("근로소득원천징수영수증 (주)전직장 (111-22-33333)", tables=tables_75_only)
    assert entities_75["prepaid_income_tax"] == 770000
    assert entities_75["prepaid_local_tax"] == 77000

    # 4. 16. 계 항목과 74. 주(현)근무지가 모두 존재하는 실제 PDF 서식 (16원 오매칭 방지 및 2,878,680원 정상 추출)
    tables_real = [
        [
            ["구분", "주(현)", "종(전)", "합계"],
            ["11. 급여", "50,000,000", "0", "50,000,000"],
            ["16. 계", "50,000,000", "0", "50,000,000"],
        ],
        [
            ["구분", "79. 소득세", "80. 지방소득세", "81. 농어촌특별세", "82. 계"],
            ["72. 결정세액", "3,200,000", "320,000", "0", "3,520,000"],
            ["74. 주(현)근무지", "2,878,680", "287,860", "0", "3,166,540"],
            ["75. 종(전)근무지", "0", "0", "0", "0"],
            ["76. 차감징수세액", "321,320", "32,140", "0", "353,460"],
        ]
    ]
    entities_real = DocumentEntityExtractor.extract_withholding(
        "근로소득원천징수영수증 16. 계 50,000,000 74. 주(현)근무지 2,878,680원",
        tables=tables_real
    )
    assert entities_real["gross_salary"] == 50000000
    assert entities_real["prepaid_income_tax"] == 2878680
    assert entities_real["prepaid_local_tax"] == 287860


def test_extract_hometax_entities():
    """홈택스 간소화 공제 항목 추출 (신용카드, 의료비, 체육시설, 청약 등)"""
    text = (
        "소득·세액공제증명서\n"
        "신용카드: 12,500,000원 직불카드: 6,000,000원\n"
        "체육시설: 800,000원\n"
        "주택청약종합저축: 3,000,000원\n"
        "일반의료비: 2,500,000원\n"
        "월세액: 7,200,000원"
    )
    entities = DocumentEntityExtractor.extract_hometax(text)
    assert entities["credit_card_general"] == 12500000
    assert entities["debit_card_cash"] == 6000000
    assert entities["culture_sports"] == 800000
    assert entities["housing_subscription"] == 3000000
    assert entities["medical_general"] == 2500000
    assert entities["monthly_rent_paid"] == 7200000


def test_extract_resident_entities():
    """등본 주소지 마스킹 및 세대원 목록 추출"""
    text = (
        "주민등록표등본\n"
        "세대주 홍길동\n"
        "주소: 서울특별시 서초구 서초대로 301 101동 502호\n"
        "세대주 홍길동 850101-1234567\n"
        "처 이영희 870505-2345678\n"
        "자 홍하나 180301-4567890"
    )
    entities = DocumentEntityExtractor.extract_resident(text)
    assert entities["householder_name"] == "홍길동"
    assert "서울특별시 서초구" in entities["masked_address"]
    assert len(entities["members"]) == 3
    rel_codes = [m["relation"] for m in entities["members"]]
    assert "SELF" in rel_codes
    assert "SPOUSE" in rel_codes
    assert "CHILD" in rel_codes


# ============================================================================
# 4. PDFParser 오케스트레이터 및 스캔본 Fallback 테스트
# ============================================================================

def test_pdf_parser_scanned_image_fallback():
    """텍스트가 공백 제외 20자 미만인 스캔본/이미지 PDF의 Vision Fallback 전환 검증"""
    parser = PDFParser()
    # 텍스트 레이어가 거의 없는 더미 PDF 바이너리
    empty_pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n115\n%%EOF"

    result = parser.parse_pdf(empty_pdf, "scanned_receipt.pdf")
    assert isinstance(result, OCRParsedDocument)
    assert result.is_ocr_fallback is True
    assert result.parser_engine == "gpt4o_vision"
    assert "스캔본" in result.raw_text_masked or "Vision" in result.raw_text_masked


def test_pdf_parser_context_manager_safety():
    """pdfplumber 컨텍스트 매니저 사용 및 메모리 누수 방지 안전성 검증"""
    parser = PDFParser()
    # 최소 유효 PDF 스트림
    dummy_pdf = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
    text, tables = parser.extract_text_with_pdfplumber(dummy_pdf)
    assert isinstance(text, str)
    assert isinstance(tables, list)


def test_credit_card_breakdown_extraction():
    """신용카드(일반), 직불카드(일반+제로페이일반), 현금영수증(일반) 및 전통시장/대중교통/문화체육 분리 추출 검증"""
    sample_text = """
    2025년도 귀속 소득·세액공제증명서 (연말정산간소화)
    성명 홍길동 주민등록번호 850101-1234567

    [신용카드]
    신용카드 등 사용금액 집계
    신용카드 10,000,000 500,000 300,000 200,000 11,000,000
    직불카드 등 4,000,000 200,000 100,000 50,000 4,350,000
    직불카드 등(제로페이 사용분) 1,000,000 100,000 0 0 1,100,000

    --- PAGE BREAK ---

    [현금영수증]
    현금영수증 사용금액 집계
    현금영수증 2,000,000 100,000 50,000 50,000 2,200,000

    --- PAGE BREAK ---

    [현금영수증]
    월별 공제대상금액 1월 500,000원 2월 500,000원
    """

    results = DocumentEntityExtractor.extract_hometax(sample_text, "test.pdf")

    # 1. 신용카드: 일반란 금액만 적용 (10,000,000)
    assert results["credit_card_general"] == 10_000_000

    # 2. 직불·체크카드: 직불카드 등(4,000,000) + 직불카드 등 제로페이(1,000,000) = 5,000,000
    assert results["debit_card_cash"] == 5_000_000

    # 3. 현금영수증: 일반란 금액만 적용 (2,000,000, 월별 공제대상금액 무시)
    assert results["cash_receipt"] == 2_000_000

    # 4. 전통시장 합산: 500,000 + 200,000 + 100,000 + 100,000 = 900,000
    assert results["market_amount"] == 900_000

    # 5. 대중교통 합산: 300,000 + 100,000 + 0 + 50,000 = 450,000
    assert results["transport_amount"] == 450_000

    # 6. 문화체육 합산: 200,000 + 50,000 + 0 + 50,000 = 300,000
    assert results["culture_amount"] == 300_000

    # 7. 합산 동기화 필드
    assert results["market_transport"] == 1_350_000
    assert results["culture_sports"] == 300_000

    # 8. 인별 card_details 검증
    p = results["persons"][0]
    card_types = {cd["type"]: cd["amount"] for cd in p.get("card_details", [])}
    assert card_types.get("신용카드") == 10_000_000
    assert card_types.get("직불·체크카드") == 5_000_000
    assert card_types.get("현금영수증") == 2_000_000
    assert card_types.get("전통시장") == 900_000
    assert card_types.get("대중교통") == 450_000
    assert card_types.get("문화체육") == 300_000

