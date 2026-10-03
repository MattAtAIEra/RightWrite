"""
手寫字辨識 — 改錯字神器與一字千金共用。

一字千金走 recognize_character：Google Cloud Vision → Gemini Vision。
改錯字神器在 main.py 自己排程：Gemini(thinking low) → 不符時升級成預設思考 → Vision。
兩邊的輸出都會先轉成繁體再比對。
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


_opencc_converter = None


def normalize_to_traditional(char: str) -> str:
    """盡力把簡體字轉成台灣標準繁體字。

    辨識引擎偶爾會回簡體（學->学、過->过、為->为），生字表全是繁體，
    不轉的話寫對的字也會被判錯。OpenCC 不可用時原樣回傳。
    """
    global _opencc_converter
    if not char:
        return char
    try:
        if _opencc_converter is None:
            from opencc import OpenCC

            _opencc_converter = OpenCC("s2tw")
        return _opencc_converter.convert(char)
    except Exception as e:  # pragma: no cover - OpenCC 是選配
        logger.warning("OpenCC normalization unavailable: %s", e)
        return char


def first_cjk(text: str) -> str | None:
    """取出字串裡第一個中文字，略過雜訊與標點。"""
    for c in text:
        if "一" <= c <= "鿿":
            return c
    return None


def recognize_with_vision_api(image_data_b64: str) -> tuple[str, float]:
    """用 Google Cloud Vision API 辨識手寫中文字，回傳 (第一個字, 信心值)。"""
    from google.cloud import vision

    image_bytes = base64.b64decode(_strip_data_url(image_data_b64))

    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)
    # 提示繁體中文（台灣），並用偏向手寫文件的 document 偵測器，而不是稀疏文字偵測
    image_context = vision.ImageContext(language_hints=["zh-Hant", "zh-TW"])
    response = client.document_text_detection(image=image, image_context=image_context)

    text = (response.full_text_annotation.text or "").strip()
    if not text and response.text_annotations:
        text = response.text_annotations[0].description.strip()

    # 只留第一個中文字，把九宮格格線或雜訊丟掉
    char = first_cjk(text)
    if char:
        return normalize_to_traditional(char), 0.9
    raise ValueError("No text recognized")


def recognize_with_gemini(
    image_data_b64: str, thinking_level: str | None = None
) -> tuple[str, float]:
    """用 Gemini Vision 辨識手寫中文字，回傳 (字, 信心值)。

    thinking_level="low" 便宜又快很多；None 維持模型預設的深度思考。
    """
    from google import genai
    from google.genai import types

    config = None
    if thinking_level:
        config = types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level=thinking_level)
        )

    client = genai.Client()
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        config=config,
        contents=[
            types.Part.from_bytes(
                data=base64.b64decode(_strip_data_url(image_data_b64)),
                mime_type="image/png",
            ),
            (
                "這是一名台灣國小學童手寫的『單一個』中文字，"
                "寫在九宮格（米字格）上，筆畫可能不夠工整、比例不一、線條歪斜。"
                "請以繁體中文（台灣教育部標準字形）的角度辨識這個字，"
                "並務必輸出對應的『繁體字』，絕對不要輸出簡體字。"
                "只回覆那一個繁體中文字，不要附加任何注音、拼音、說明或標點符號。"
                "如果真的完全無法辨識，才回覆 ？"
            ),
        ],
    )

    recognized = (response.text or "").strip()
    # 容忍多餘的空白或標點：取第一個中文字
    char = first_cjk(recognized)
    if char:
        return normalize_to_traditional(char), 0.85
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
