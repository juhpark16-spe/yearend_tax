"""국세청 연말정산 간소화 PDF 섹션별 구조 파서 (보장성보험·교육비)

- 특정 인물 이름에 의존하지 않고, 간소화 서식에 실제로 적힌 항목(교육비구분, 학교명,
  보험종류, 주피보험자/종피보험자, 납입금액 계)만으로 판단한다.
- 기본(지출처별) 서식과 상세(월별) 서식을 모두 지원한다.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

TAX_YEAR = 2025
_NUM = r'\d{1,3}(?:,\d{3})+|\d+'
_BIZ = r'\d{3}-\d{2}-\d{5}'
_RRN_MASKED = r'\d{6}-(?:[\d\*]{7}|\[RRN Omitted\])'

# --------------------------------------------------------------------------
# 공통: 나이 계산
# --------------------------------------------------------------------------

def birth_year(rrn: str = "", birth: str = "") -> Optional[int]:
    digits = re.sub(r'[^0-9\*]', '', str(rrn or ""))
    b = re.sub(r'[^0-9]', '', str(birth or "")) or digits[:6]
    if len(b) < 6 or not b[:2].isdigit():
        return None
    yy = int(b[:2])
    g = digits[6] if len(digits) >= 7 else ""
    if g in ("1", "2", "5", "6"):
        century = 1900
    elif g in ("3", "4", "7", "8"):
        century = 2000
    elif g in ("9", "0"):
        century = 1800
    else:
        century = 2000 if yy <= TAX_YEAR % 100 else 1900
    return century + yy


def age_in_tax_year(rrn: str = "", birth: str = "") -> Optional[int]:
    by = birth_year(rrn, birth)
    return None if by is None else TAX_YEAR - by


# --------------------------------------------------------------------------
# 장애인 증명 페이지
# --------------------------------------------------------------------------

def find_disabled_names(pages: List[str]) -> Set[str]:
    """[장애인 증명서] / [발달재활서비스 이용증명] 페이지의 인적사항 이름을 수집."""
    names: Set[str] = set()
    for p in pages:
        if "장애인 증명서" in p or "장애인증명서" in p or "발달재활서비스 이용증명" in p:
            m = re.search(r'인적사항[\s\S]{0,60}?\n\s*([가-힣]{2,6})\s+\d{6}', p)
            if m:
                names.add(m.group(1))
    return names


# --------------------------------------------------------------------------
# 보장성보험
# --------------------------------------------------------------------------

def _ins_type(kind: str) -> str:
    return "장애인전용보장성보험" if "장애인" in kind else "일반보장성보험"


def parse_insurance_detail_format(text: str) -> List[Dict[str, Any]]:
    """상세(월별) 서식: 구분행(보장성/장애인보장성 + 월별 3개) 단위로 계약 블록을 추출."""
    lines = [l.strip() for l in text.split("\n")]
    kind_re = re.compile(r'^(장애인보장성|보장성)\s+(?:(?:' + _NUM + r')\s+){2}(?:' + _NUM + r')\s*$')
    starts = [i for i, l in enumerate(lines) if kind_re.match(l)]
    out: List[Dict[str, Any]] = []
    for n, i in enumerate(starts):
        end = (starts[n + 1] - 1) if n + 1 < len(starts) else len(lines)
        for k in range(i + 1, end):
            if lines[k].startswith("인별합계") or re.match(r'^1\.\s*공제', lines[k]):
                end = k
                break
        kind = kind_re.match(lines[i]).group(1)
        company = lines[i - 1] if i > 0 else ""
        biz = goods = policy_no = ""
        total = 0
        names: List[str] = []
        stage = 0
        for l in lines[i + 1:end]:
            if stage == 0:
                m = re.search(r'\((' + _BIZ + r')\)', l)
                if m:
                    biz, stage = m.group(1), 1
                continue
            if stage == 1:
                if not re.fullmatch(r'[\d,\s]+', l):
                    goods, stage = l, 2
                continue
            if stage == 2:
                m = re.fullmatch(r'\(([A-Za-z0-9\-]{4,})\)', l)
                if m:
                    policy_no, stage = m.group(1), 3
                continue
            if stage == 3:
                if re.fullmatch(_NUM, l):
                    total, stage = int(l.replace(",", "")), 4
                continue
            if re.fullmatch(r'(?:[가-힣]{2,6}\s*)+', l):
                names.extend(l.split())
        if total > 0:
            out.append({
                "biz_number": biz, "company": company, "policy_name": goods,
                "policy_number": policy_no, "type": _ins_type(kind), "raw_type": kind,
                "main_insured": names[0] if names else "", "sub_insured": names[1:],
                "amount": total,
            })
    return out


def parse_insurance_basic_format(text: str) -> List[Dict[str, Any]]:
    """기본(지출처별) 서식: '사업자번호 증권번호 주피보험자주민번호 성명 납입금액' 행 단위 추출."""
    lines = [l.strip() for l in text.split("\n")]
    row_re = re.compile(r'^(?:(장애인보장성|장애인보장|보장성)\s+)?(' + _BIZ + r')\s+(\S+)\s+' + _RRN_MASKED +
                        r'\s+([가-힣]{2,6})\s+(' + _NUM + r')\s*$')
    try:
        hdr = next(i for i, l in enumerate(lines) if l.startswith("종피보험자1"))
    except StopIteration:
        hdr = 0
    out: List[Dict[str, Any]] = []
    prev_end = hdr + 1
    rows = [(i, row_re.match(l)) for i, l in enumerate(lines)]
    rows = [(i, m) for i, m in rows if m]
    for n, (i, m) in enumerate(rows):
        kind = m.group(1) or ""
        above = [l for l in lines[prev_end:i] if l]
        if not kind and above and above[-1].startswith("장애인보장"):
            kind = "장애인보장성"
            above = above[:-1]
        if not kind:
            kind = "보장성"
        nxt = rows[n + 1][0] if n + 1 < len(rows) else len(lines)
        subs: List[str] = []
        below_end = i + 1
        for k in range(i + 1, nxt):
            l = lines[k]
            if l.startswith("인별합계") or re.match(r'^1\.\s*공제', l):
                break
            pairs = re.findall(_RRN_MASKED + r'\s+([가-힣]{2,6})', l)
            if pairs:
                subs.extend(pairs)
                below_end = k + 1
            elif l == "성":
                below_end = k + 1
            else:
                break
        text_above = [a for a in above if a != "성"]
        company = ""
        goods_parts: List[str] = []
        for a in text_above:
            if re.search(r'(보험|공사|협회|생명|화재|손해|공제|은행)', a) and not company and len(a.split()) >= 1:
                parts = a.split()
                if len(parts) >= 2 and re.search(r'(생명|생명보험|화재|공사|협회|보험주식회사|손해보험)$', parts[0]):
                    company, goods_parts = parts[0], parts[1:]
                elif re.search(r'(생명보험|공사|협회|화재|손해보험)$', a):
                    company = a
                else:
                    goods_parts.append(a)
            else:
                goods_parts.append(a)
        out.append({
            "biz_number": m.group(2), "company": company,
            "policy_name": "".join(goods_parts).strip(), "policy_number": m.group(3),
            "type": _ins_type(kind), "raw_type": kind,
            "main_insured": m.group(4), "sub_insured": subs,
            "amount": int(m.group(5).replace(",", "")),
        })
        prev_end = below_end
    return out


def parse_insurance_page(text: str) -> List[Dict[str, Any]]:
    items = parse_insurance_detail_format(text)
    return items if items else parse_insurance_basic_format(text)


# --------------------------------------------------------------------------
# 교육비
# --------------------------------------------------------------------------

SPECIAL_EDU_TYPES = ("사회복지시설", "발달재활서비스제공기관", "장애인특수교육", "특수교육")
PRESCHOOL_TYPES = ("유치원", "어린이집", "학원", "체육시설", "보육시설")
UNIV_TYPES = ("대학교", "전문대학", "대학", "원격대학", "학점은행제", "사내대학", "기능대학", "평생교육")
SCHOOL_TYPES = ("초등학교", "중학교", "고등학교", "특수학교", "외국교육기관", "대안학교")

# 학령 기준 최대 나이(과세연도 만 나이 기준)와 허용 오차(유예·재수 등)
_LEVEL_MAX_AGE = {"취학전아동": 7, "초·중·고등학생": 18}
_AGE_TOLERANCE = 2


def classify_school_name(name: str) -> str:
    n = name.replace(" ", "")
    if "대학원" in n:
        return "대학원"
    if "대학" in n:
        return "대학"
    for k in ("고등학교", "중학교", "초등학교"):
        if k in n:
            return k
    if any(k in n for k in ("유치원", "어린이집")):
        return "유치원"
    return ""


def _category_for(edu_type: str, is_self: bool, is_disabled: bool) -> Dict[str, Any]:
    t = edu_type.replace(" ", "")
    if any(k in t for k in SPECIAL_EDU_TYPES):
        return {"category": "장애인특수교육", "limit": 999_999_999,
                "eligible": is_disabled,
                "reason": "" if is_disabled else "장애인 특수교육비는 장애인으로 확인된 경우에만 공제됩니다 (장애인 등록 시 포함)"}
    if is_self:
        return {"category": "본인", "limit": 999_999_999, "eligible": True, "reason": ""}
    if "대학원" in t:
        return {"category": "대학원", "limit": 0, "eligible": False,
                "reason": "대학원 교육비는 근로자 본인만 공제됩니다"}
    if any(k in t for k in UNIV_TYPES):
        return {"category": "대학생", "limit": 9_000_000, "eligible": True, "reason": ""}
    if any(k in t for k in PRESCHOOL_TYPES):
        return {"category": "취학전아동", "limit": 3_000_000, "eligible": True, "reason": ""}
    if any(k in t for k in SCHOOL_TYPES):
        return {"category": "초·중·고등학생", "limit": 3_000_000, "eligible": True, "reason": ""}
    return {"category": "", "limit": 3_000_000, "eligible": True, "reason": ""}


def _age_category(age: Optional[int]) -> Dict[str, Any]:
    if age is None:
        return {"category": "초·중·고등학생", "limit": 3_000_000}
    if age <= 7:
        return {"category": "취학전아동", "limit": 3_000_000}
    if age <= 18:
        return {"category": "초·중·고등학생", "limit": 3_000_000}
    return {"category": "대학생", "limit": 9_000_000}


def build_education_item(name: str, school: str, edu_type: str, kind: str, amount: int,
                         is_self: bool, is_disabled: bool, age: Optional[int]) -> Dict[str, Any]:
    """교육비 1건을 공제 분류·한도·검토 필요 여부와 함께 생성."""
    if not edu_type:
        edu_type = classify_school_name(school)
    cat = _category_for(edu_type, is_self, is_disabled)
    if not cat["category"]:
        cat.update(_age_category(age))
    if kind == "현장체험학습비":
        cat.update({"category": "초.중.고등학생(현장학습비)", "limit": 300_000})

    needs_review = not cat["eligible"]
    reason = cat["reason"]
    # 학령과 나이가 크게 어긋나면 기본 제외 + 사용자 확인 (유예·재수 등을 고려해 2년 허용)
    base_cat = "초·중·고등학생" if cat["category"].startswith("초.중.고") else cat["category"]
    max_age = _LEVEL_MAX_AGE.get(base_cat)
    if not needs_review and not is_self and age is not None and max_age is not None \
            and age > max_age + _AGE_TOLERANCE:
        needs_review = True
        reason = f"{school or edu_type} 교육비이나 {TAX_YEAR}년 만 {age}세로 학령과 맞지 않습니다. 재학 사실을 확인해 주세요"

    return {
        "name": name, "school": school or edu_type or "교육기관", "edu_type": edu_type,
        "category": cat["category"], "raw_amount": amount,
        "amount": 0 if needs_review else amount, "limit": cat["limit"],
        "included": not needs_review, "needs_review": needs_review, "review_reason": reason,
    }


def parse_education_basic_format(text: str) -> List[Dict[str, Any]]:
    """기본(지출처별) 서식: '교육비구분 학교명 사업자번호 구분 지출금액계' 행."""
    lines = [l.strip() for l in text.split("\n")]
    row_re = re.compile(r'^(?:(\S+)\s+)?(?:(.+?)\s+)?(' + _BIZ + r')\s+(일반교육비|현장체험학습비)\s+(' + _NUM + r')\s*$')
    rows: List[Dict[str, Any]] = []
    for i, l in enumerate(lines):
        m = row_re.match(l)
        if not m:
            continue
        edu_type, school, biz, kind, amt = m.groups()
        edu_type = edu_type or ""
        school = school or ""
        if not school:
            prev = lines[i - 1] if i > 0 else ""
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            nxt_frag = nxt if re.fullmatch(r'[가-힣]{1,3}', nxt) else ""
            school = (prev if not re.search(_BIZ, prev) and "교육비구분" not in prev else "") + nxt_frag
        rows.append({"edu_type": edu_type, "school": school, "biz_number": biz,
                     "kind": kind, "amount": int(amt.replace(",", ""))})
    return rows


def parse_education_detail_format(text: str) -> List[Dict[str, Any]]:
    """상세(월별) 서식: 구분행(일반교육비/현장체험학습비 + 월별 4개) ~ 사업자번호 블록."""
    pat = re.compile(r'(일반교육비|현장체험학습비)\s+((?:(?:' + _NUM + r')\s+){3}(?:' + _NUM + r'))\s*\n(.*?)(' + _BIZ + r')', re.S)
    rows: List[Dict[str, Any]] = []
    for m in pat.finditer(text):
        kind, first4, mid, biz = m.groups()
        nums = [int(x.replace(",", "")) for x in re.findall(_NUM, first4 + " " + mid)]
        school = "".join(re.findall(r'[가-힣A-Za-z()（）·]+', re.sub(_NUM, " ", mid)))
        total = nums[8] if len(nums) >= 9 else (nums[-1] if nums else 0)
        if total > 0:
            rows.append({"edu_type": "", "school": school, "biz_number": biz,
                         "kind": kind, "amount": total})
    # 현장체험학습비가 있는 학교는 초·중·고등학교로 본다 (상세 서식에는 교육비구분 열이 없음)
    field_trip_biz = {r["biz_number"] for r in rows if r["kind"] == "현장체험학습비"}
    for r in rows:
        if r["biz_number"] in field_trip_biz and not classify_school_name(r["school"]):
            r["edu_type"] = "초·중·고등학교"
    return rows


def parse_education_page(text: str) -> List[Dict[str, Any]]:
    rows = parse_education_basic_format(text)
    return rows if rows else parse_education_detail_format(text)


def entrance_fee_limit(text: str) -> int:
    """수능응시료·대학입학전형료 한도: 졸업예정/조기졸업 300만, 졸업·검정고시 900만."""
    return 3_000_000 if "졸업예정" in text or "조기졸업" in text else 9_000_000
