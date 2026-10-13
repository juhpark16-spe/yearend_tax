"""
국세청 간소화 PDF 표(pdfplumber tables)에서 체크리스트 항목 상세 행 추출
- 장기주택저당차입금 이자상환액, 주택임차차입금 원리금상환액, 주택마련저축, 장기집합투자증권저축
- 표 머리글(취급기관·저당권·대출계좌번호·저축구분·펀드명)로 표를 찾아 행 단위로 읽는다.
- 예시 값(샘플 PDF 금액·기관명)을 코드에 두지 않는다. PDF에 없으면 빈 목록.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_BIZ = re.compile(r"\d{3}-\d{2}-\d{5}")
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_NUM = re.compile(r"^-?[\d,]+$")


def _cell(v: Any) -> str:
    return str(v or "").strip()


def _num(v: Any) -> int:
    s = _cell(v).replace(",", "")
    return int(s) if re.fullmatch(r"-?\d+", s) else 0


def _is_num(v: Any) -> bool:
    return bool(_NUM.match(_cell(v)))


def _org_and_biz(v: Any) -> (str, str):
    """'농협은행 주식회\n사\n(104-86-39742)' → ('농협은행 주식회사', '104-86-39742')"""
    s = _cell(v)
    m = _BIZ.search(s)
    biz = m.group(0) if m else ""
    name = re.sub(r"[(（]\s*\d{3}-\d{2}-\d{5}\s*[)）]", "", s)
    return re.sub(r"\s*\n\s*", "", name).strip(), biz


def _join_lines(v: Any) -> str:
    return re.sub(r"\s*\n\s*", "", _cell(v))


def _header_text(table: List[List[Any]], rows: int = 8) -> str:
    return " ".join(_cell(c) for r in (table or [])[:rows] for c in (r or []))


def parse_mortgage_rows(tables: Optional[List[Any]]) -> List[Dict[str, Any]]:
    """장기주택저당차입금 이자상환액 표: 기관 행 + 바로 아래 금액 행(차입금·고정금리·비거치식·당해년 원금상환액)."""
    out: List[Dict[str, Any]] = []
    for table in tables or []:
        if "저당권" not in _header_text(table):
            continue
        rows = [r or [] for r in table]
        for i, r in enumerate(rows):
            if len(r) < 8 or not _BIZ.search(_cell(r[0])):
                continue
            dates = _DATE.findall(_cell(r[2]))
            nxt = rows[i + 1] if i + 1 < len(rows) else []
            nums = [_num(c) for c in nxt[2:6]] if len(nxt) >= 6 else [0, 0, 0, 0]
            org, biz = _org_and_biz(r[0])
            product = _join_lines(r[1])
            period = re.search(r"(\d+)\s*년", _cell(r[3]))
            out.append({
                "bank": org,
                "bizNumber": biz,
                "product": product,
                "startDate": dates[0] if dates else "",
                "endDate": dates[1] if len(dates) > 1 else "",
                "periodYears": int(period.group(1)) if period else 0,
                "acquisitionDate": (_DATE.findall(_cell(r[4])) or [""])[0],
                "mortgageDate": (_DATE.findall(_cell(r[5])) or [""])[0],
                "annualTotal": _num(r[6]),
                "amount": _num(r[7]) or _num(r[6]),
                "loanAmount": nums[0],
                "fixedRateAmount": nums[1],
                "nonGraceAmount": nums[2],
                "principalRepaid": nums[3],
                "kind": "mortgage",
            })
    return out


def parse_rent_loan_rows(tables: Optional[List[Any]]) -> List[Dict[str, Any]]:
    """주택임차차입금 원리금상환액 표: 취급기관 | 사업자번호 | 대출계좌번호 | 대출일 | 상환액 계"""
    out: List[Dict[str, Any]] = []
    for table in tables or []:
        head = _header_text(table, 2)
        if "대출계좌번호" not in head or "상환액" not in head:
            continue
        for r in table[1:]:
            r = r or []
            if len(r) < 5 or not _BIZ.search(_cell(r[1])) or not _is_num(r[4]):
                continue
            out.append({
                "bank": _join_lines(r[0]),
                "bizNumber": _BIZ.search(_cell(r[1])).group(0),
                "account": _cell(r[2]),
                "startDate": (_DATE.findall(_cell(r[3])) or [""])[0],
                "amount": _num(r[4]),
                "kind": "rent_loan",
            })
    return out


def parse_housing_savings_rows(tables: Optional[List[Any]]) -> List[Dict[str, Any]]:
    """주택마련저축 표: 취급기관(사업자번호) | 계좌번호 | 저축구분 | 저축명 | 가입일자 | 납입금액 계"""
    out: List[Dict[str, Any]] = []
    for table in tables or []:
        head = _header_text(table, 2)
        if "저축구분" not in head or "납입금액" not in head:
            continue
        for r in table[1:]:
            r = r or []
            if len(r) < 6 or not _is_num(r[5]) or not _cell(r[1]):
                continue
            org, biz = _org_and_biz(r[0])
            out.append({
                "bank": org,
                "bizNumber": biz,
                "account": _cell(r[1]),
                "type": _join_lines(r[2]),
                "productName": _join_lines(r[3]),
                "joinDate": (_DATE.findall(_cell(r[4])) or [""])[0],
                "amount": _num(r[5]),
            })
    return out


def parse_long_invest_rows(tables: Optional[List[Any]]) -> List[Dict[str, Any]]:
    """장기집합투자증권저축 표: 취급기관 | 계좌번호 | 펀드명 | 가입일자 | 연납입액 | 소득공제 대상금액

    가입 기한(소득세법·조특법 제91조의16, 제91조의20): 일반형 2015.12.31., 청년형 2023.12.31.까지 가입분만 공제
    """
    out: List[Dict[str, Any]] = []
    for table in tables or []:
        head = _header_text(table, 2)
        if "펀드명" not in head or "가입일자" not in head:
            continue
        for r in table[1:]:
            r = r or []
            if len(r) < 6 or not _is_num(r[4]) or not _cell(r[1]):
                continue
            org, biz = _org_and_biz(r[0])
            fund = _join_lines(r[2])
            join = (_DATE.findall(_cell(r[3])) or [""])[0]
            youth = "청년형" in fund
            deadline = "2023-12-31" if youth else "2015-12-31"
            eligible = bool(join) and join <= deadline
            nts_deductible = _num(r[5])
            out.append({
                "company": org,
                "bizNumber": biz,
                "fundName": fund,
                "account": fund,
                "accountNo": _cell(r[1]),
                "type": "청년형 장기집합투자증권저축" if youth else "장기집합투자증권저축",
                "startDate": join,
                "payYear": "2025",
                "raw_amount": _num(r[4]),
                "nts_deductible_amount": nts_deductible,
                "deductible_amount": nts_deductible if eligible else 0,
                "amount": nts_deductible if eligible else 0,
                "review_reason": "" if eligible else f"{deadline[:4]}년 12월 31일 이후 가입분은 공제 대상이 아닙니다",
            })
    return out
