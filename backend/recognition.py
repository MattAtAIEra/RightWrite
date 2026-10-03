"""
手寫字辨識 — 改錯字神器與一字千金共用。

辨識順序：Google Cloud Vision → Gemini Vision。
兩者都沒設定憑證時（本機開發）進入「備援模式」：只要畫面上有筆跡就視為答對（信心值 0.5），
讓沒有金鑰的環境也能試玩；有設定憑證但全部失敗時則視為答錯，不會誤判成對。
"""
from __future__ import annotations

import base64
import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RecognitionResult:
    recognized_char: str
    is_correct: bool
    confidence: float
    engine: str  # "vision" | "gemini" | "fallback" | "failed"


def _strip_data_url(image_data_b64: str) -> str:
    if "," in image_data_b64:
        return image_data_b64.split(",", 1)[1]
    return image_data_b64


def recognize_with_vision_api(image_data_b64: str) -> tuple[str, float]:
    """用 Google Cloud Vision API 辨識手寫中文字，回傳 (第一個字, 信心值)。"""
    from google.cloud import vision

    image_bytes = base64.b64decode(_strip_data_url(image_data_b64))

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


def recognize_with_gemini(image_data_b64: str) -> tuple[str, float]:
    """用 Gemini Vision 辨識手寫中文字，回傳 (字, 信心值)。"""
    from google import genai
    from google.genai import types

    client = genai.Client()
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[
            types.Part.from_bytes(
                data=base64.b64decode(_strip_data_url(image_data_b64)),
                mime_type="image/png",
            ),
            (
                "這張圖片是一個手寫的中文字（寫在九宮格上）。"
                "請辨識這個字，只回覆那一個中文字，不要有任何其他文字或標點。"
                "如果完全無法辨識，只回覆 ？"
            ),
        ],
    )

    recognized = (response.text or "").strip()
    # 只接受單一個中文字
    if len(recognized) == 1 and "一" <= recognized <= "鿿":
        return recognized, 0.85
    raise ValueError(f"Could not recognize character: {recognized!r}")


def credentials_configured() -> bool:
    """是否至少設定了一種辨識服務的憑證。"""
    return any(
        os.environ.get(name)
        for name in ("GOOGLE_APPLICATION_CREDENTIALS", "GEMINI_API_KEY", "GOOGLE_API_KEY")
    )


def recognize_character(image_data_b64: str, expected_char: str, has_ink: bool = True) -> RecognitionResult:
    """
    辨識單一手寫字並與期望的字比對。

    has_ink: 前端是否真的有畫筆跡。備援模式下用它決定對錯，避免空白也算對。
    """
    if not has_ink:
        return RecognitionResult(recognized_char="", is_correct=False, confidence=0.0, engine="failed")

    for engine, func in (("vision", recognize_with_vision_api), ("gemini", recognize_with_gemini)):
        try:
            recognized, confidence = func(image_data_b64)
            logger.info("%s recognized: %s (expected: %s)", engine, recognized, expected_char)
            return RecognitionResult(
                recognized_char=recognized,
                is_correct=recognized == expected_char,
                confidence=confidence,
                engine=engine,
            )
        except Exception as exc:
            logger.warning("%s recognition failed: %s", engine, exc)

    if credentials_configured():
        return RecognitionResult(recognized_char="？", is_correct=False, confidence=0.0, engine="failed")

    # 本機開發、沒有任何金鑰：寬鬆放行，讓流程可以試玩
    return RecognitionResult(recognized_char=expected_char, is_correct=True, confidence=0.5, engine="fallback")
