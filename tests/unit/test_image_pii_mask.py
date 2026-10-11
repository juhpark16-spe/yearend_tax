"""스캔본 PDF 이미지 주민등록번호 마스킹 (외부 Vision OCR 전송 전)"""
import io

import pytest
from PIL import Image, ImageDraw, ImageFont

from backend.security import image_pii_mask as ipm


def _font(size=34):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _doc_image():
    img = Image.new("RGB", (1100, 260), "white")
    d = ImageDraw.Draw(img)
    d.text((40, 40), "Name: HONG GILDONG", fill="black", font=_font())
    d.text((40, 120), "RRN: 900101-1234567   Amount: 1,250,000", fill="black", font=_font())
    return img


def test_rrn_pattern_matches_only_unmasked_back_digits():
    assert ipm.RRN_PATTERN.search("900101-1234567")
    assert ipm.RRN_PATTERN.search("900101 1234567")
    assert not ipm.RRN_PATTERN.search("900101-*******")
    assert not ipm.RRN_PATTERN.search("1,250,000")


@pytest.mark.skipif(not ipm.local_ocr_available(), reason="로컬 OCR 엔진 미설치")
def test_mask_hides_back_digits_and_keeps_birthdate():
    img = _doc_image()
    assert ipm.find_rrn_boxes(img), "원본 이미지에서 주민번호를 찾아야 함"
    masked, count = ipm.mask_rrn_in_image(img)
    assert count >= 1
    texts = " ".join(t for t, _ in ipm._ocr_lines(masked))
    assert "1234567" not in texts
    assert not ipm.RRN_PATTERN.search(texts)
    assert "900101" in texts.replace(" ", "")      # 앞자리(생년월일)는 남김
    assert "1,250,000" in texts or "1250000" in texts.replace(",", "")  # 금액은 가리지 않음


def test_vision_fallback_does_not_send_when_masking_unavailable(monkeypatch):
    """로컬 OCR이 없으면 외부 Vision OCR을 호출하지 않는다 (fail-closed)"""
    from reportlab.pdfgen import canvas
    import backend.parser.pdf_parser as pp

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.rect(100, 100, 200, 100, fill=1)   # 글자 없는(스캔본 같은) 페이지
    c.save()

    def _unavailable(_img, verify=True):
        raise ipm.ImageMaskingUnavailable("no ocr")

    calls = []

    class _FakeOpenAI:
        def __init__(self, *a, **k):
            calls.append("created")

    monkeypatch.setattr(pp, "mask_rrn_in_image", _unavailable)
    import openai
    monkeypatch.setattr(openai, "OpenAI", _FakeOpenAI)
    text = pp.PDFParser(openai_api_key="sk-test")._call_vision_fallback(buf.getvalue(), "scan.pdf")
    assert "보내지 않았습니다" in text
    assert calls == []  # 외부 OCR 클라이언트 자체를 만들지 않음
