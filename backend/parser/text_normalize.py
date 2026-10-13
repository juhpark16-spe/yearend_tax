"""
깨진 한글 글리프 정규화

일부 PDF 생성기(가상 인쇄·편집 도구 등)는 한글 폰트의 ToUnicode 매핑을 잘못 기록해
받침 'ㄴ'이 'ㄲ'으로, 'ㄹ'이 'ㄳ'으로 추출되는 현상이 있습니다.
  예) 인적공제 → 읶적공제, 신용카드 → 싞용카드, 일반교육비 → 읷반교육비

이 경우 파서 키워드가 맞지 않아 신용카드·교육비 등이 0원으로 누락됩니다.
문서 전체에서 이 패턴의 '서명'이 충분히 발견될 때만 받침을 되돌립니다.
(일반 문서의 '밖', '닦' 같은 정상 단어는 건드리지 않습니다.)
"""
from __future__ import annotations

import re

_BASE, _END = 0xAC00, 0xD7A3
_JONG_SSANGGIYEOK = 2   # ㄲ
_JONG_GIYEOK_SIOT = 3   # ㄳ
_JONG_NIEUN = 4         # ㄴ
_JONG_RIEUL = 8         # ㄹ

# 깨진 PDF에서 자주 나타나는 음절 (인/한/일/신/전/간/연/원 ...)
_SIGNATURE = "읶핚읷싞젂갂얶웏윣춗홖짂굮홗렦녂읶"
# 정상 한국어에서 실제로 쓰이는 ㄲ/ㄳ 받침 음절 — 서명 판정에서 제외
_GENUINE = set("밖볶닦깎엮겪묶낚꺾섞솎묶튂몫넋삯")
_SIG_THRESHOLD = 5


def _jong(ch: str) -> int:
    code = ord(ch)
    if _BASE <= code <= _END:
        return (code - _BASE) % 28
    return -1


def is_broken_hangul(text: str) -> bool:
    if not text:
        return False
    broken = sum(1 for ch in text
                 if _jong(ch) in (_JONG_SSANGGIYEOK, _JONG_GIYEOK_SIOT) and ch not in _GENUINE)
    sig = sum(text.count(ch) for ch in set(_SIGNATURE))
    return sig >= _SIG_THRESHOLD and broken >= _SIG_THRESHOLD


def _fix_char(ch: str) -> str:
    j = _jong(ch)
    if j == _JONG_SSANGGIYEOK and ch not in _GENUINE:
        return chr(ord(ch) - _JONG_SSANGGIYEOK + _JONG_NIEUN)
    if j == _JONG_GIYEOK_SIOT and ch not in _GENUINE:
        return chr(ord(ch) - _JONG_GIYEOK_SIOT + _JONG_RIEUL)
    return ch


_HANGUL_RE = re.compile(r"[가-힣]")


def fix_broken_hangul(text: str, force: bool = False) -> str:
    """깨진 받침 패턴이 감지되면 ㄲ→ㄴ, ㄳ→ㄹ로 복원합니다."""
    if not text or not (force or is_broken_hangul(text)):
        return text
    return _HANGUL_RE.sub(lambda m: _fix_char(m.group(0)), text)


def fix_broken_tables(tables, force: bool):
    if not force or not tables:
        return tables
    return [[[fix_broken_hangul(c, force=True) if isinstance(c, str) else c for c in (row or [])]
             for row in (table or [])] for table in tables]
