"""
RightWrite - 國小改錯字練習神器
Backend API server
"""
import base64
import json
import logging
import os
import random
import re
from pathlib import Path

logger = logging.getLogger(__name__)

from pypinyin import pinyin, Style
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from vocab_data import (
    GRADE_REGISTRY,
    get_grade_info,
    get_vocab_data,
    get_all_characters_in_range,
    get_all_compounds_in_range,
)


app = FastAPI(title="RightWrite API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class GenerateArticleRequest(BaseModel):
    start_lesson: int
    end_lesson: int
    mode: str = "article"  # "sentence" or "article"
    grade_id: str = "grade4"


class GenerateArticleResponse(BaseModel):
    original_text: str
    display_text: str
    wrong_chars: list[dict]  # [{position, wrong_char, correct_char, lesson}]
    total_wrong: int
    zhuyin: list[str]  # per-character zhuyin, same length as display_text


class RecognizeRequest(BaseModel):
    image_data: str  # base64-encoded PNG from canvas
    expected_char: str


class RecognizeResponse(BaseModel):
    recognized_char: str
    is_correct: bool
    confidence: float


class CheckAnswerRequest(BaseModel):
    expected_char: str
    user_char: str


# ---------------------------------------------------------------------------
# Article generation with intentional wrong characters
# ---------------------------------------------------------------------------


def _generate_zhuyin(text: str) -> list[str]:
    """Generate per-character zhuyin for the display text.

    Process line-by-line so that newlines don't cause pypinyin to merge
    tokens across line boundaries (e.g. ``。\\n`` → single reading).
    """
    result: list[str] = []
    for i, line in enumerate(text.split("\n")):
        if i > 0:
            result.append("")  # placeholder for the \n character
        readings = pinyin(line, style=Style.BOPOMOFO, heteronym=False)
        for char, reading_list in zip(line, readings):
            if '\u4e00' <= char <= '\u9fff':
                result.append(reading_list[0])
            else:
                result.append("")
    return result


def _build_char_lookup(start_lesson: int, end_lesson: int, grade_id: str = "grade4") -> dict[str, list[str]]:
    """Build a char -> similar_wrong lookup from the lesson range."""
    data = get_vocab_data(grade_id)
    lookup = {}
    for lesson_num, lesson_data in data.items():
        if start_lesson <= lesson_num <= end_lesson:
            for c in lesson_data["characters"]:
                if c["similar_wrong"]:
                    lookup[c["char"]] = c["similar_wrong"]
    return lookup


def _generate_sentences_with_gemini(words: list[str]) -> list[str]:
    """Use Gemini to generate natural sentences, each containing one of the given words."""
    from google import genai
    from google.genai import types

    words_list = "、".join(words)
    prompt = (
        f"請為以下每個詞語各造一個適合國小四年級學生閱讀的句子。\n"
        f"詞語：{words_list}\n\n"
        f"規則：\n"
        f"- 每個詞語造一個句子，句子長度 15～30 字\n"
        f"- 句子必須完整包含該詞語（不可拆開或變形）\n"
        f"- 用字遣詞要符合國小四年級程度\n"
        f"- 每行一個句子，句子結尾要有句號\n"
        f"- 只輸出句子，不要編號、不要詞語標示、不要任何多餘文字\n"
        f"- 共 {len(words)} 個句子，順序與詞語順序一致"
    )

    client = genai.Client()
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_budget=256),
            temperature=0.9,
        ),
    )

    lines = [line.strip() for line in response.text.strip().split("\n") if line.strip()]
    if len(lines) < len(words):
        raise ValueError(f"Gemini returned {len(lines)} sentences for {len(words)} words")
    return lines[:len(words)]


def generate_article_with_errors(start_lesson: int, end_lesson: int, mode: str = "article", grade_id: str = "grade4") -> dict:
    """
    Generate content with wrong characters from the selected lessons.
    Uses compound words (詞語) as the unit — each wrong character always
    appears within a word in a Gemini-generated sentence, so there is enough
    context for students to identify the error.
    """
    compounds_pool = get_all_compounds_in_range(start_lesson, end_lesson, grade_id)
    char_lookup = _build_char_lookup(start_lesson, end_lesson, grade_id)

    # Filter to compounds that have swappable characters
    usable = []
    for comp in compounds_pool:
        word = comp["word"]
        swappable = [(i, ch) for i, ch in enumerate(word) if ch in char_lookup]
        if not swappable:
            continue
        usable.append({**comp, "_swappable": swappable})

    if not usable:
        raise HTTPException(status_code=400, detail="No usable compounds found for the selected range")

    if mode == "sentence":
        num_wrong = min(random.randint(5, 7), len(usable))
    else:
        num_wrong = min(random.randint(5, 8), len(usable))

    selected = random.sample(usable, num_wrong)
    words = [comp["word"] for comp in selected]

    # Generate sentences with Gemini
    try:
        sentences = _generate_sentences_with_gemini(words)
    except Exception as e:
        logger.error("Gemini sentence generation failed: %s", e)
        # Fallback: use pre-existing example sentences
        sentences = []
        for comp in selected:
            examples = [ex for ex in comp.get("examples", []) if comp["word"] in ex]
            sentences.append(random.choice(examples) if examples else f"他學會了{comp['word']}這個詞語。")

    wrong_chars_info = []
    original_lines = []
    display_lines = []

    for i, comp_info in enumerate(selected):
        word = comp_info["word"]
        lesson_num = comp_info["lesson"]
        lesson_title = comp_info["lesson_title"]
        original_sentence = sentences[i]

        # Verify the word appears in the sentence; fallback if not
        if word not in original_sentence:
            examples = [ex for ex in comp_info.get("examples", []) if word in ex]
            original_sentence = random.choice(examples) if examples else f"他學會了{word}這個詞語。"

        # Pick a random swappable character from the word
        _idx, correct_char = random.choice(comp_info["_swappable"])
        wrong_char = random.choice(char_lookup[correct_char])

        # Build the wrong version of the word, then replace in sentence
        wrong_word = word[:_idx] + wrong_char + word[_idx + 1:]
        display_sentence = original_sentence.replace(word, wrong_word, 1)

        original_lines.append(original_sentence)
        display_lines.append(display_sentence)

        wrong_chars_info.append({
            "wrong_char": wrong_char,
            "correct_char": correct_char,
            "lesson": lesson_num,
            "lesson_title": lesson_title,
            "word": word,
        })

    original_text = "\n".join(original_lines)
    display_text = "\n".join(display_lines)

    # Calculate positions of wrong characters in display_text
    for i, info in enumerate(wrong_chars_info):
        wrong_char = info["wrong_char"]
        display_sentence = display_lines[i]
        pos_in_sentence = display_sentence.find(wrong_char)
        if pos_in_sentence >= 0:
            global_pos = sum(len(display_lines[j]) + 1 for j in range(i)) + pos_in_sentence
            info["position"] = global_pos
        else:
            info["position"] = -1

    return {
        "original_text": original_text,
        "display_text": display_text,
        "wrong_chars": wrong_chars_info,
        "total_wrong": len(wrong_chars_info),
        "zhuyin": _generate_zhuyin(display_text),
    }


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.get("/api/grades")
def get_grades():
    """Get all available grades."""
    grades = []
    for grade_id, info in GRADE_REGISTRY.items():
        grades.append({
            "id": grade_id,
            "label": info["label"],
            "grade": info["grade"],
            "publisher": info["publisher"],
        })
    return {"grades": grades}


@app.get("/api/lessons")
def get_lessons(grade_id: str = Query("grade4")):
    """Get all available lessons for a grade."""
    info = get_grade_info(grade_id)
    data = get_vocab_data(grade_id)

    lessons = []
    for num, ldata in data.items():
        lessons.append({
            "lesson_number": num,
            "title": ldata["title"],
            "character_count": len(ldata["characters"]),
            "characters": [c["char"] for c in ldata["characters"]],
        })
    return {
        "semester": info["semester"],
        "grade": info["grade"],
        "publisher": info["publisher"],
        "total_lessons": info["total_lessons"],
        "midterm_range": list(info["midterm_range"]),
        "final_range": list(info["final_range"]),
        "lessons": lessons,
    }


@app.post("/api/generate", response_model=GenerateArticleResponse)
def generate_article(req: GenerateArticleRequest):
    """Generate an article with intentional wrong characters."""
    info = get_grade_info(req.grade_id)
    if req.start_lesson < 1 or req.end_lesson > info["total_lessons"]:
        raise HTTPException(status_code=400, detail="Invalid lesson range")
    if req.start_lesson > req.end_lesson:
        raise HTTPException(status_code=400, detail="Start lesson must be <= end lesson")

    result = generate_article_with_errors(req.start_lesson, req.end_lesson, req.mode, req.grade_id)
    return result


@app.post("/api/recognize", response_model=RecognizeResponse)
def recognize_handwriting(req: RecognizeRequest):
    """
    Recognize handwritten character from canvas image.
    Tries Google Cloud Vision first, then Claude Vision as fallback.
    """
    expected = req.expected_char

    # Try Google Cloud Vision API first
    try:
        recognized, confidence = _recognize_with_vision_api(req.image_data)
        logger.info("Vision API recognized: %s (expected: %s)", recognized, expected)
        is_correct = recognized == expected
        return RecognizeResponse(
            recognized_char=recognized,
            is_correct=is_correct,
            confidence=confidence,
        )
    except Exception as e:
        logger.warning("Vision API failed: %s", e)

    # Fallback: use Gemini Vision for handwriting recognition
    try:
        recognized, confidence = _recognize_with_gemini(req.image_data)
        logger.info("Gemini recognized: %s (expected: %s)", recognized, expected)
        is_correct = recognized == expected
        return RecognizeResponse(
            recognized_char=recognized,
            is_correct=is_correct,
            confidence=confidence,
        )
    except Exception as e:
        logger.error("Gemini recognition failed: %s", e, exc_info=True)

    # Last resort: cannot recognize
    logger.error("All recognition methods failed for expected=%s", expected)
    return RecognizeResponse(
        recognized_char="？",
        is_correct=False,
        confidence=0.0,
    )


def _recognize_with_vision_api(image_data_b64: str) -> tuple[str, float]:
    """Use Google Cloud Vision API to recognize handwritten Chinese character."""
    from google.cloud import vision

    if "," in image_data_b64:
        image_data_b64 = image_data_b64.split(",", 1)[1]

    image_bytes = base64.b64decode(image_data_b64)

    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)

    response = client.text_detection(image=image)
    texts = response.text_annotations

    if texts:
        recognized = texts[0].description.strip()
        if recognized:
            return recognized[0], 0.9
    raise ValueError("No text recognized")


def _recognize_with_gemini(image_data_b64: str) -> tuple[str, float]:
    """Use Gemini Vision to recognize a handwritten Chinese character."""
    from google import genai
    from google.genai import types

    if "," in image_data_b64:
        image_data_b64 = image_data_b64.split(",", 1)[1]

    client = genai.Client()
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=[
            types.Part.from_bytes(
                data=base64.b64decode(image_data_b64),
                mime_type="image/png",
            ),
            (
                "這張圖片是一個手寫的中文字（寫在九宮格上）。"
                "請辨識這個字，只回覆那一個中文字，不要有任何其他文字或標點。"
                "如果完全無法辨識，只回覆 ？"
            ),
        ],
    )

    recognized = response.text.strip()
    # Accept only a single CJK character
    if len(recognized) == 1 and '\u4e00' <= recognized <= '\u9fff':
        return recognized, 0.85
    raise ValueError(f"Could not recognize character: {recognized!r}")


@app.post("/api/check")
def check_answer(req: CheckAnswerRequest):
    """Simple character comparison check."""
    is_correct = req.expected_char == req.user_char
    return {"is_correct": is_correct, "expected": req.expected_char, "user_input": req.user_char}


# ---------------------------------------------------------------------------
# Serve frontend static files
# ---------------------------------------------------------------------------

STATIC_DIR = Path(__file__).parent / "static"

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        """Serve the React frontend."""
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
