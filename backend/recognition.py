"""
手寫字辨識 — 改錯字神器與一字千金共用。

優先使用 Google Cloud Vision API；沒有憑證或呼叫失敗時退回「備援模式」：
只要畫面上有筆跡就視為答對（信心值 0.5），讓沒有設定 Vision 的環境也能試玩。
"""
from __future__ import annotations

import base64
from dataclasses import dataclass


@dataclass
class RecognitionResult:
    recognized_char: str
    is_correct: bool
    confidence: float
    engine: str  # "vision" | "fallback"


def recognize_with_vision_api(image_data_b64: str) -> tuple[str, float]:
    """用 Google Cloud Vision API 辨識手寫中文字，回傳 (第一個字, 信心值)。"""
    from google.cloud import vision

    if "," in image_data_b64:
        image_data_b64 = image_data_b64.split(",", 1)[1]

    image_bytes = base64.b64decode(image_data_b64)

    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)
    context = vision.ImageContext(language_hints=["zh-Hant", "zh"])

    response = client.text_detection(image=image, image_context=context)
    texts = response.text_annotations

    if texts:
        recognized = texts[0].description.strip()
        if recognized:
            return recognized[0], 0.9
    raise ValueError("No text recognized")


def recognize_character(image_data_b64: str, expected_char: str, has_ink: bool = True) -> RecognitionResult:
    """
    辨識單一手寫字並與期望的字比對。

    has_ink: 前端是否真的有畫筆跡。備援模式下用它決定對錯，避免空白也算對。
    """
    try:
        recognized, confidence = recognize_with_vision_api(image_data_b64)
        return RecognitionResult(
            recognized_char=recognized,
            is_correct=recognized == expected_char,
            confidence=confidence,
            engine="vision",
        )
    except Exception:
        pass

    if not has_ink:
        return RecognitionResult(recognized_char="", is_correct=False, confidence=0.0, engine="fallback")
    return RecognitionResult(recognized_char=expected_char, is_correct=True, confidence=0.5, engine="fallback")
