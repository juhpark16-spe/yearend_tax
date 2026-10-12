"""깨진 한글 받침(ㄴ→ㄲ, ㄹ→ㄳ) 복원 테스트"""
from backend.parser.text_normalize import fix_broken_hangul, is_broken_hangul


BROKEN = (
    "[ 싞용카드 ]\n읷반교육비 합계금액 9,700,000\n읶적사항 성 명\n"
    "핚국장학재단 직업훈렦비 젂통시장 대중교통 현장체험학습비 갂편"
)


def test_detects_and_fixes_broken_pdf_text():
    assert is_broken_hangul(BROKEN)
    fixed = fix_broken_hangul(BROKEN)
    for word in ["신용카드", "일반교육비", "인적사항", "한국장학재단", "직업훈련비", "전통시장", "간편"]:
        assert word in fixed


def test_normal_text_is_untouched():
    normal = "신용카드 일반교육비 합계금액. 창밖을 보며 볶음밥을 먹고 바닥을 닦았다."
    assert not is_broken_hangul(normal)
    assert fix_broken_hangul(normal) == normal


def test_genuine_words_survive_force_mode():
    assert fix_broken_hangul("밖 닦 몫 넋 싞", force=True) == "밖 닦 몫 넋 신"
