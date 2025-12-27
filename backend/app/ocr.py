"""OCR utilities using EasyOCR for fully local text extraction."""

import os
from dataclasses import dataclass
from typing import List

import easyocr


@dataclass
class OCRResult:
    text: str
    confidence: float
    bbox: List[float]


_READER = None


def get_reader() -> easyocr.Reader:
    global _READER
    if _READER is None:
        langs = os.environ.get("PAI_OCR_LANGS", "en").split(",")
        _READER = easyocr.Reader(langs, gpu=os.environ.get("PAI_USE_GPU", "1") == "1")
    return _READER


def run_ocr(path: str, min_confidence: float = 0.4) -> List[OCRResult]:
    reader = get_reader()
    results = []
    try:
        # detail=1 returns (bbox, text, confidence)
        detections = reader.readtext(path, detail=1, paragraph=False)
    except Exception:
        return results

    for det in detections:
        bbox, text, conf = det
        if conf < min_confidence:
            continue
        flat_bbox = [float(x) for point in bbox for x in point]
        results.append(OCRResult(text=text, confidence=float(conf), bbox=flat_bbox))
    return results


__all__ = ["run_ocr", "OCRResult"]
