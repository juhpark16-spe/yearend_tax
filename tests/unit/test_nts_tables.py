"""국세청 PDF 표 → 주택자금·주택마련저축·장기집합투자증권저축 행 추출 (예시 값 하드코딩 없음)"""
from backend.parser.nts_tables import (
    parse_housing_savings_rows, parse_long_invest_rows, parse_mortgage_rows, parse_rent_loan_rows,
)

MORTGAGE = [
    ["", "", "최초차입일", "상환", "주택", "저당권", "", ""],
    ["취급기관", "대출종류", "예정일", None, None, None, "연간합계액", "소득공제"],
    ["갑은행\n(123-45-67890)", "해당없음\n(주택자금대출)", "2020-08-31\n2040-08-31", "20년", "2022-08-30", "2022-08-31", "1,000,000", "1,000,000"],
    [None, None, "25,000,000", "0", "25,000,000", "0", None, None],
]
RENT = [
    ["취급기관", "사업자번호", "대출계좌번호", "대출일", "상환액 계"],
    ["을은행", "201-81-02819", "111", "2019-07-28", "500,000"],
    ["합 계", "500,000", None, None, None],
]
SAVINGS = [
    ["취급기관", "계좌번호", "저축구분", "저축명", "가입일자", "납입금액 계"],
    ["(사업자번호)", None, None, None, None, None],
    ["병은행\n(617-19-68038)", "222", "청약저축", "청약저축", "1983-05-28", "1,200,000"],
    ["합 계", "1,200,000", None, None, None, None],
]
LONG = [
    ["취급기관", "계좌번호", "펀드명", "가입일자", "연납입액", "소득공제"],
    ["(사업자번호)", None, None, None, None, "대상금액"],
    ["정증권\n(202-81-00978)", "333", "AAA 증권투자신\n탁", "2015-04-30", "6,000,000", "2,400,000"],
    ["무증권\n(116-81-34691)", "444", "(청년형)BBB 투자신탁", "2025-03-26", "500,000", "200,000"],
]


def test_no_tables_no_rows():
    assert parse_mortgage_rows([]) == [] and parse_rent_loan_rows(None) == []


def test_mortgage_row():
    (r,) = parse_mortgage_rows([MORTGAGE])
    assert r["bank"] == "갑은행" and r["bizNumber"] == "123-45-67890"
    assert (r["startDate"], r["endDate"], r["periodYears"]) == ("2020-08-31", "2040-08-31", 20)
    assert r["amount"] == 1_000_000 and r["nonGraceAmount"] == 25_000_000 and r["fixedRateAmount"] == 0


def test_rent_loan_and_savings():
    assert [x["amount"] for x in parse_rent_loan_rows([RENT])] == [500_000]
    (s,) = parse_housing_savings_rows([SAVINGS])
    assert s["bank"] == "병은행" and s["type"] == "청약저축" and s["amount"] == 1_200_000


def test_long_invest_join_deadline():
    a, b = parse_long_invest_rows([LONG])
    assert a["fundName"] == "AAA 증권투자신탁" and a["amount"] == 2_400_000  # 2015년 가입 → 공제
    assert b["type"].startswith("청년형") and b["amount"] == 0 and b["review_reason"]  # 2023년 이후 가입
