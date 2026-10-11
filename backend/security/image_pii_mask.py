"""스캔본 PDF 페이지 이미지의 주민등록번호 마스킹 (외부 Vision OCR 전송 전 필수)

글자를 읽을 수 없는(텍스트 레이어 없는) PDF는 페이지를 이미지로 바꿔 OpenAI Vision OCR로 보낸다.
이때 이미지에 주민등록번호가 그대로 있으면 원본 개인정보가 외부로 나가므로, 전송 전에
로컬 OCR로 주민등록번호 위치를 찾아 뒷자리 7자리를 검은 박스로 가린다.

- 로컬 OCR 엔진: rapidocr-onnxruntime(우선, pip 설치만으로 동작) → pytesseract(+Tesseract 설치 시)
- 로컬 OCR 엔진이 없거나 마스킹 확인에 실패하면 예외를 던지고, 호출 측은 외부 전송을 하지 않는다 (fail-closed)
- 이미지는 메모리에서만 다루며 디스크에 저장하지 않는다
"""
from __future__ import annotations

import logging
import re
from typing import List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)

# 생년월일 6자리 + (구분자) + 성별 1~8로 시작하는 뒷자리 7자리 (이미 * 로 가려진 경우는 제외)
RRN_PATTERN = re.compile(r"(?<!\d)(\d{2}[01]\d[0-3]\d)\s*[-–—~.]?\s*([1-8]\d{6})(?!\d)")

Box = Tuple[float, float, float, float]


class ImageMaskingUnavailable(RuntimeError):
    """로컬 OCR 엔진이 없어 이미지 마스킹을 할 수 없음"""


class ImageMaskingFailed(RuntimeError):
    """마스킹 후에도 주민등록번호가 다시 검출됨"""


_ENGINE = None
_ENGINE_KIND: Optional[str] = None


def _load_engine():
    global _ENGINE, _ENGINE_KIND
    if _ENGINE_KIND is not None:
        return _ENGINE_KIND
    try:
        from rapidocr_onnxruntime import RapidOCR  # type: ignore

        _ENGINE = RapidOCR()
        _ENGINE_KIND = "rapidocr"
        return _ENGINE_KIND
    except Exception:
        pass
    try:
        import pytesseract  # type: ignore

        pytesseract.get_tesseract_version()
        _ENGINE = pytesseract
        _ENGINE_KIND = "tesseract"
        return _ENGINE_KIND
    except Exception:
        _ENGINE_KIND = "none"
        return _ENGINE_KIND


def local_ocr_available() -> bool:
    return _load_engine() in ("rapidocr", "tesseract")


def _ocr_lines(img) -> List[Tuple[str, List[Tuple[int, int, Box]]]]:
    """이미지의 줄 단위 텍스트와, 줄 안의 [문자 시작, 문자 끝, 박스] 조각 목록"""
    kind = _load_engine()
    lines: List[Tuple[str, List[Tuple[int, int, Box]]]] = []
    if kind == "rapidocr":
        import numpy as np

        result, _ = _ENGINE(np.array(img.convert("RGB")))
        for item in result or []:
            pts, text = item[0], str(item[1] or "")
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            lines.append((text, [(0, len(text), (min(xs), min(ys), max(xs), max(ys)))]))
    elif kind == "tesseract":
        data = _ENGINE.image_to_data(img, output_type=_ENGINE.Output.DICT)
        groups: dict = {}
        for i, word in enumerate(data["text"]):
            if not str(word).strip():
                continue
            key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
            box = (data["left"][i], data["top"][i], data["left"][i] + data["width"][i], data["top"][i] + data["height"][i])
            groups.setdefault(key, []).append((str(word), box))
        for words in groups.values():
            text, pieces = "", []
            for word, box in words:
                if text:
                    text += " "
                pieces.append((len(text), len(text) + len(word), box))
                text += word
            lines.append((text, pieces))
    else:
        raise ImageMaskingUnavailable("로컬 OCR 엔진(rapidocr-onnxruntime 또는 Tesseract)이 설치되어 있지 않습니다.")
    return lines


def _span_box(pieces: Sequence[Tuple[int, int, Box]], start: int, end: int) -> Optional[Box]:
    """문자 구간 [start, end)를 덮는 박스 (조각 안에서는 글자 폭을 균등하다고 보고 비례 계산)"""
    xs0, ys0, xs1, ys1 = [], [], [], []
    for p_start, p_end, (x0, y0, x1, y1) in pieces:
        s, e = max(start, p_start), min(end, p_end)
        if s >= e:
            continue
        n = max(1, p_end - p_start)
        cw = (x1 - x0) / n
        xs0.append(x0 + (s - p_start) * cw)
        xs1.append(x0 + (e - p_start) * cw)
        ys0.append(y0)
        ys1.append(y1)
    if not xs0:
        return None
    return min(xs0), min(ys0), max(xs1), max(ys1)


def find_rrn_boxes(img) -> List[Box]:
    """주민등록번호 뒷자리 7자리 위치 목록"""
    boxes: List[Box] = []
    for text, pieces in _ocr_lines(img):
        for m in RRN_PATTERN.finditer(text):
            # 뒷자리 앞뒤로 한 글자씩 여유를 두고 가린다 (OCR 글자 폭 오차 대비)
            box = _span_box(pieces, max(m.start(2) - 1, m.end(1)), min(m.end(2) + 1, len(text)))
            if box:
                boxes.append(box)
    return boxes


def _paint(img, boxes: List[Box]):
    from PIL import ImageDraw

    draw = ImageDraw.Draw(img)
    for x0, y0, x1, y1 in boxes:
        pad = max(2, int((y1 - y0) * 0.15))
        draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], fill="black")
    return img


def mask_rrn_in_image(img, verify: bool = True):
    """주민등록번호 뒷자리를 가린 이미지와 가린 개수를 돌려준다.
    - 로컬 OCR이 없으면 ImageMaskingUnavailable
    - 가린 뒤 다시 OCR해 주민등록번호가 또 검출되면 한 번 더 가리고, 그래도 남으면 ImageMaskingFailed
    """
    masked = img.convert("RGB").copy()
    boxes = find_rrn_boxes(masked)
    _paint(masked, boxes)
    total = len(boxes)
    if verify and total:
        for _ in range(2):
            remain = find_rrn_boxes(masked)
            if not remain:
                break
            _paint(masked, remain)
            total += len(remain)
        else:
            if find_rrn_boxes(masked):
                raise ImageMaskingFailed("마스킹 후에도 주민등록번호가 검출되었습니다.")
    return masked, total
