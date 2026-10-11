"""국세청 간소화 PDF 국민연금보험료: 직장가입자 고지금액 합계 + 지역가입자 등 납부금액 합계"""
import backend.services  # noqa: F401 — 순환 import 방지용 선로딩
from backend.parser.extractor import DocumentEntityExtractor

PAGE = """2025년 귀속 소득 · 세액공제증명서류 [국민연금보험료]
(조회기간 : 2025년 01~12월)
■ 가입자 인적사항
성 명 주 민 등 록 번 호
홍길동 900101-1******
■ 국민연금보험료 내역 (단위:원)
월별 직장가입자 고지금액 지역가입자 등 납부금액
01월 71,010 0
11월 72,760 0
12월 0 85,000
직장가입자 소급고지금액 50,000
추납보험료 납부금액 250,000
실업크레딧 납부금액 15,750
합계 839,860 350,750
총합계 1,140,610
"""


def _extract(text):
    return DocumentEntityExtractor.extract_hometax(text)


def test_pension_is_workplace_plus_regional_sum():
    r = _extract(PAGE)
    assert r["national_pension"] == 839_860 + 350_750
    person = next(p for p in r["persons"] if p["items"].get("national_pension"))
    assert person["items"]["national_pension_workplace"] == 839_860
    assert person["items"]["national_pension_regional"] == 350_750


def test_pension_falls_back_to_total_when_columns_missing():
    page = PAGE.replace("합계 839,860 350,750\n", "")
    assert _extract(page)["national_pension"] == 1_140_610
