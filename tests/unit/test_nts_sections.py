"""국세청 간소화 섹션 파서 단위 테스트 (보장성보험·교육비)
- 인물 이름과 무관하게 서식 데이터만으로 분류되는지 검증한다.
"""
import pytest

from backend.parser.nts_sections import (
    age_in_tax_year,
    build_education_item,
    entrance_fee_limit,
    find_disabled_names,
    parse_education_page,
    parse_insurance_page,
)

INSURANCE_BASIC = """[보장성 보험, 장애인전용보장성보험]
■ 계약자 인적사항
성 명 주 민 등 록 번 호
{worker} 750101-[RRN Omitted]
■ 보장성보험(장애인전용보장성보험)납입내역 (단위:원)
상 호 보험종류
종류 사업자번호 증권번호 주피보험자 납입금액 계
종피보험자1(수익자) 종피보험자2(수익자) 종피보험자3(수익자)
무배당 올라이프 Super보
사단법인 손해보험협회
험
보장성 102-82-04254 60801522950000 750101-******* {worker} 1,143,000
AIA생명보험 스마트가정보장보험1701
장애인보장
104-91-36225 320171065873 000101-******* {child1} 1,962,000
성
050101-******* {child2} 170101-******* {child3}
인별합계금액 3,105,000
"""

INSURANCE_DETAIL = """[보장성 보험, 장애인전용보장성보험]
■ 계약자 인적사항
성 명 주 민 등 록 번 호
{worker} 750101-1234567
구 분 월별 납입금액
AIA생명보험
장애인보장성 654,000 0 1,308,000
(104-91-36225)
스마트가정보장보험1701
0 0 0
(320171065873)
1,962,000
{child1} {child2}
0 0 0
(000101-*******) (050101-*******)
{child3}
0 0 0
(170101-*******)
인별합계금액 1,962,000
"""

EDU_BASIC = """[교육비]
■ 학생 인적사항
성 명 주 민 등 록 번 호
{child1} 000101-[RRN Omitted]
■ 교육비 지출내역 (단위:원)
교육비구분 학교명 사업자번호 구분 지출금액계
전문대학 경민대학교 127-82-05553 일반교육비 6,821,600
사회복지시설 양정고등학교 117-82-00060 일반교육비 2,760,000
발달재활서비스제공기관 동아마이스터고등학교 306-82-01636 일반교육비 680,000
일반교육비 합계금액 10,261,600
"""

NAMES_A = dict(worker="고길동", child1="고영수", child2="고철수", child3="고둘리")
NAMES_B = dict(worker="김민수", child1="김영수", child2="이철수", child3="박둘리")


@pytest.mark.parametrize("names", [NAMES_A, NAMES_B])
def test_insurance_basic_format_is_name_independent(names):
    items = parse_insurance_page(INSURANCE_BASIC.format(**names))
    assert [i["amount"] for i in items] == [1_143_000, 1_962_000]
    disabled = items[1]
    assert disabled["type"] == "장애인전용보장성보험"
    assert disabled["main_insured"] == names["child1"]
    assert disabled["sub_insured"] == [names["child2"], names["child3"]]
    assert items[0]["policy_name"] == "무배당 올라이프 Super보험"


@pytest.mark.parametrize("names", [NAMES_A, NAMES_B])
def test_insurance_detail_format_reads_total_not_monthly(names):
    items = parse_insurance_page(INSURANCE_DETAIL.format(**names))
    assert len(items) == 1
    assert items[0]["amount"] == 1_962_000
    assert items[0]["type"] == "장애인전용보장성보험"
    assert items[0]["main_insured"] == names["child1"]


@pytest.mark.parametrize("names", [NAMES_A, NAMES_B])
def test_special_education_needs_disability(names):
    rows = parse_education_page(EDU_BASIC.format(**names))
    assert [r["edu_type"] for r in rows] == ["전문대학", "사회복지시설", "발달재활서비스제공기관"]
    age = age_in_tax_year("000101-[RRN Omitted]", "000101")
    items = [build_education_item(names["child1"], r["school"], r["edu_type"], r["kind"], r["amount"],
                                  is_self=False, is_disabled=False, age=age) for r in rows]
    assert items[0]["category"] == "대학생" and items[0]["amount"] == 6_821_600
    assert all(i["category"] == "장애인특수교육" and i["needs_review"] and i["amount"] == 0 for i in items[1:])

    items_dis = [build_education_item(names["child1"], r["school"], r["edu_type"], r["kind"], r["amount"],
                                      is_self=False, is_disabled=True, age=age) for r in rows]
    assert sum(i["amount"] for i in items_dis) == 10_261_600


def test_age_mismatch_flags_review_without_edu_type():
    item = build_education_item("김영수", "양정고등학교", "", "일반교육비", 2_760_000,
                                is_self=False, is_disabled=False, age=25)
    assert item["needs_review"] and item["amount"] == 0 and "만 25세" in item["review_reason"]
    ok = build_education_item("김영수", "양정고등학교", "", "일반교육비", 2_760_000,
                              is_self=False, is_disabled=False, age=19)
    assert not ok["needs_review"] and ok["amount"] == 2_760_000


def test_self_education_is_unlimited_and_dependent_grad_school_excluded():
    self_item = build_education_item("본인", "서울과학종합대학원대학교", "대학원", "일반교육비", 7_500_000,
                                     is_self=True, is_disabled=False, age=50)
    assert self_item["category"] == "본인" and self_item["amount"] == 7_500_000
    dep = build_education_item("자녀", "서울대학원", "대학원", "일반교육비", 5_000_000,
                               is_self=False, is_disabled=False, age=25)
    assert dep["needs_review"] and dep["amount"] == 0


def test_entrance_fee_limit_and_disabled_pages():
    assert entrance_fee_limit("고등학교 졸업예정 42,000") == 3_000_000
    assert entrance_fee_limit("고등학교 졸업 42,000") == 9_000_000
    pages = ["[장애인 증명서]\n■ 장애인 인적사항\n성 명 주 민 등 록 번 호\n김민수 750101-[RRN Omitted]\n",
             "[발달재활서비스 이용증명]\n■ 서비스 이용자 인적사항\n성 명 주 민 등 록 번 호\n박둘리 170101-[RRN Omitted]\n"]
    assert find_disabled_names(pages) == {"김민수", "박둘리"}
