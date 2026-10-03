"""
手寫字辨識 — 改錯字神器與一字千金共用。

一字千金走 recognize_character：Gemini 嚴格判定（候選字比對）→ Google Cloud Vision → 備援。
改錯字神器在 main.py 自己排程：Gemini(thinking low) → 不符時升級成預設思考 → Vision。
兩邊的輸出都會先轉成繁體再比對。
兩者都沒設定憑證時（本機開發）進入「備援模式」：只要畫面上有筆跡就視為答對（信心值 0.5），
讓沒有金鑰的環境也能試玩；有設定憑證但全部失敗時則視為答錯，不會誤判成對。
"""
from __future__ import annotations

import base64
import json
import logging
import os
import random
from dataclasses import dataclass
from typing import Iterable

logger = logging.getLogger(__name__)


@dataclass
class RecognitionResult:
    recognized_char: str
    is_correct: bool
    confidence: float
    engine: str  # "vision" | "gemini" | "fallback" | "failed" | "timeout"
    detail: str = ""  # 給後台看的補充（例如候選比對結果）


@dataclass
class StrictVerdict:
    """一字千金用的嚴格判定：自由辨識 ＋ 在候選字中挑最接近的 ＋ 是否清楚。"""
    recognized: str  # 不給提示時模型認出的字（認不出來是 ？）
    closest: str     # 在「正確字＋錯字候選」裡最接近的一個（都不像是 ？）
    clear: bool      # 筆畫結構清楚、可以確定


def decide_strict(verdict: StrictVerdict, expected: str) -> bool:
    """三個條件都指向正確字才算對：潦草到模型只能靠「像」來猜的，不給過。"""
    return verdict.clear and verdict.recognized == expected and verdict.closest == expected


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


STRICT_THINKING_LEVEL = "low"

# 判定規則寫在這裡，方便調整與對照測試。{candidates} 會換成候選字清單。
STRICT_PROMPT = (
    "這是一名台灣國小學童在九宮格上手寫的『單一個』繁體中文字。請回 JSON：\n"
    "1. char：你認為這是哪個字（繁體、台灣標準字形）。真的認不出來才回「？」。\n"
    "2. closest：候選字有：{candidates}。手寫字最接近其中哪一個？"
    "請比較部件與筆畫（例如「口」和「日」、左右部首是哪個），不要只看整體輪廓；都不像才回「？」。\n"
    "3. clear：筆畫是否完整、可以辨認。小學生的字可以歪斜、大小不一、不工整，這些都算 true；"
    "只有在重要部件缺漏、筆畫黏成一團、或你只能靠猜的時候才回 false。\n"
    "只回 JSON，不要其他文字。"
)


def recognize_strict_with_gemini(
    image_data_b64: str,
    expected: str,
    distractors: Iterable[str] = (),
    timeout_s: float = 8.0,
    thinking_level: str | None = None,
) -> StrictVerdict:
    """
    一次 Gemini 呼叫回三件事（JSON）：
      char    — 不看候選、自由辨識出的字
      closest — 在候選字（正確字＋題目錯字＋形近字）裡最接近的一個
      clear   — 筆畫結構是否清楚到可以確定

    用意：只跟正確字比會被潦草字騙過（像就過），把形近的錯字也放進候選，
    模型得說出「最接近哪一個」，寫得像錯字或糊成一團就不給過。
    用 thinking_level="low" 加上 HTTP timeout，避免一題辨識拖太久。
    """
    from google import genai
    from google.genai import types

    candidates = [expected]
    for d in distractors:
        if d and d != expected and d not in candidates:
            candidates.append(d)
    candidates = candidates[:7]
    random.shuffle(candidates)  # 正確字不要固定在第一個，避免位置偏好
    candidate_text = "、".join(candidates)

    # Gemini API 的 HTTP deadline 最少 10 秒（給更短會回 400）；真正的等待上限由呼叫端的
    # asyncio.wait_for 控制，所以這裡只是防止連線卡死。
    http_timeout_ms = max(10_000, int(timeout_s * 1000))
    client = genai.Client(http_options=types.HttpOptions(timeout=http_timeout_ms))
    level = thinking_level or STRICT_THINKING_LEVEL
    config = types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level=level) if level != "default" else None,
        response_mime_type="application/json",
        response_schema={
            "type": "object",
            "properties": {
                "char": {"type": "string"},
                "closest": {"type": "string"},
                "clear": {"type": "boolean"},
            },
            "required": ["char", "closest", "clear"],
        },
    )
    prompt = STRICT_PROMPT.format(candidates=candidate_text)
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        config=config,
        contents=[
            types.Part.from_bytes(
                data=base64.b64decode(_strip_data_url(image_data_b64)),
                mime_type="image/png",
            ),
            prompt,
        ],
    )
    raw = (response.text or "").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini strict response is not JSON: {raw!r}") from exc

    def _pick(value: object) -> str:
        c = first_cjk(str(value or ""))
        return normalize_to_traditional(c) if c else "？"

    closest = _pick(data.get("closest"))
    if closest not in candidates:
        closest = "？"
    return StrictVerdict(
        recognized=_pick(data.get("char")),
        closest=closest,
        clear=bool(data.get("clear", False)),
    )


def gemini_configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def vision_configured() -> bool:
    """有 service account 檔，或跑在 Cloud Run 上（metadata server 會給 ADC）。"""
    return bool(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or os.environ.get("K_SERVICE"))


def credentials_configured() -> bool:
    """是否至少設定了一種辨識服務的憑證。"""
    return gemini_configured() or vision_configured()


def recognize_character(
    image_data_b64: str,
    expected_char: str,
    has_ink: bool = True,
    distractors: Iterable[str] = (),
    timeout_s: float = 8.0,
) -> RecognitionResult:
    """
    辨識單一手寫字並與期望的字比對（一字千金用）。

    順序：Gemini 嚴格判定（候選字比對）→ Google Cloud Vision 自由辨識 → 備援模式。
    has_ink: 前端是否真的有畫筆跡。備援模式下用它決定對錯，避免空白也算對。
    distractors: 形近／同音的錯字候選，給嚴格判定用。
    timeout_s: 每個引擎的 HTTP timeout；呼叫端另外用 asyncio 做整體逾時。
    """
    if not has_ink:
        return RecognitionResult(recognized_char="", is_correct=False, confidence=0.0, engine="failed")

    # 沒有金鑰就不要去試：Vision 的 ADC 探測在本機要等近 10 秒，會白白吃掉逾時額度
    try:
        if not gemini_configured():
            raise RuntimeError("GEMINI_API_KEY / GOOGLE_API_KEY not set")
        verdict = recognize_strict_with_gemini(image_data_b64, expected_char, distractors, timeout_s)
        ok = decide_strict(verdict, expected_char)
        logger.info(
            "gemini strict: char=%s closest=%s clear=%s (expected: %s) -> %s",
            verdict.recognized, verdict.closest, verdict.clear, expected_char, ok,
        )
        return RecognitionResult(
            recognized_char=verdict.recognized,
            is_correct=ok,
            confidence=0.85 if verdict.clear else 0.3,
            engine="gemini",
            detail=f"最接近：{verdict.closest}；清楚：{'是' if verdict.clear else '否'}",
        )
    except Exception as exc:
        logger.warning("gemini strict recognition failed: %s", exc)

    try:
        if not vision_configured():
            raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS not set")
        recognized, confidence = recognize_with_vision_api(image_data_b64)
        logger.info("vision recognized: %s (expected: %s)", recognized, expected_char)
        return RecognitionResult(
            recognized_char=recognized,
            is_correct=recognized == expected_char,
            confidence=confidence,
            engine="vision",
        )
    except Exception as exc:
        logger.warning("vision recognition failed: %s", exc)

    if credentials_configured():
        return RecognitionResult(recognized_char="？", is_correct=False, confidence=0.0, engine="failed")

    # 本機開發、沒有任何金鑰：寬鬆放行，讓流程可以試玩
    return RecognitionResult(recognized_char=expected_char, is_correct=True, confidence=0.5, engine="fallback")
