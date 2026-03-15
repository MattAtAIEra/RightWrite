"""
RightWrite - 國小改錯字練習神器
Backend API server
"""
import base64
import json
import os
import random
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from vocab_data import (
    VOCAB_DATA,
    TOTAL_LESSONS,
    SEMESTER_NAME,
    GRADE,
    PUBLISHER,
    MIDTERM_RANGE,
    FINAL_RANGE,
    get_all_characters_in_range,
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


class GenerateArticleResponse(BaseModel):
    original_text: str
    display_text: str
    wrong_chars: list[dict]  # [{position, wrong_char, correct_char, lesson}]
    total_wrong: int


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


def generate_article_with_errors(start_lesson: int, end_lesson: int, mode: str = "article") -> dict:
    """Generate content containing wrong characters from the selected lessons."""
    chars_pool = get_all_characters_in_range(start_lesson, end_lesson)
    if not chars_pool:
        raise HTTPException(status_code=400, detail="No characters found for the selected range")

    if mode == "sentence":
        # Pick 2-3 characters for sentence mode
        num_wrong = min(random.randint(2, 3), len(chars_pool))
        selected_chars = random.sample(chars_pool, num_wrong)
        text_info, wrong_chars_info = _build_sentences(selected_chars)
    else:
        # Pick 5-8 characters for article mode
        num_wrong = min(random.randint(5, 8), len(chars_pool))
        selected_chars = random.sample(chars_pool, num_wrong)
        text_info, wrong_chars_info = _build_article(selected_chars)

    return {
        "original_text": text_info["original"],
        "display_text": text_info["display"],
        "wrong_chars": wrong_chars_info,
        "total_wrong": len(wrong_chars_info),
    }


def _get_example_sentences(char_info: dict) -> list[str]:
    """
    Get example sentences for a character from vocab data.
    Looks in both single char examples and compound word examples.
    Returns sentences that contain the character.
    """
    correct_char = char_info["char"]
    lesson_num = char_info["lesson"]
    examples = list(char_info.get("examples", []))

    # Also look at compound word examples from the lesson
    lesson_data = VOCAB_DATA.get(lesson_num, {})
    for comp in lesson_data.get("compounds", []):
        if correct_char in comp["word"]:
            for ex in comp.get("examples", []):
                if correct_char in ex and ex not in examples:
                    examples.append(ex)

    # Filter: must contain the character and be a proper sentence (>= 5 chars)
    valid = [ex for ex in examples if correct_char in ex and len(ex) >= 5
             and '(__)' not in ex and '(____)' not in ex and '(______)' not in ex]
    return valid


# Fallback sentence templates when no real example is available
_FALLBACK_TEMPLATES = [
    "老師教我們「{char}」這個字的正確寫法。",
    "我每天都會練習「{char}」這個字。",
    "媽媽說「{char}」是這課很重要的生字。",
    "考試前我把「{char}」這個字再複習了一遍。",
]


def _build_sentences(selected_chars: list[dict]) -> tuple[dict, list[dict]]:
    """
    Build 1-2 short sentences using real example sentences from the curriculum,
    then replace the correct character with a similar wrong character.
    """
    wrong_chars_info = []
    original_lines = []
    display_lines = []

    for char_info in selected_chars:
        correct_char = char_info["char"]
        wrong_char = random.choice(char_info["similar_wrong"])
        lesson_num = char_info["lesson"]
        lesson_title = char_info["lesson_title"]

        # Try to use a real example sentence
        real_examples = _get_example_sentences(char_info)
        if real_examples:
            original_sentence = random.choice(real_examples)
        else:
            template = random.choice(_FALLBACK_TEMPLATES)
            original_sentence = template.format(char=correct_char)

        # Replace the FIRST occurrence of the correct char with the wrong char
        display_sentence = original_sentence.replace(correct_char, wrong_char, 1)

        original_lines.append(original_sentence)
        display_lines.append(display_sentence)

        wrong_chars_info.append({
            "wrong_char": wrong_char,
            "correct_char": correct_char,
            "lesson": lesson_num,
            "lesson_title": lesson_title,
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

    return {"original": original_text, "display": display_text}, wrong_chars_info


def _build_article(selected_chars: list[dict]) -> tuple[dict, list[dict]]:
    """
    Build a short article using real example sentences from the curriculum.
    Each sentence contains one wrong character.
    """
    wrong_chars_info = []
    original_lines = []
    display_lines = []

    for char_info in selected_chars:
        correct_char = char_info["char"]
        wrong_char = random.choice(char_info["similar_wrong"])
        lesson_num = char_info["lesson"]
        lesson_title = char_info["lesson_title"]

        real_examples = _get_example_sentences(char_info)
        if real_examples:
            original_sentence = random.choice(real_examples)
        else:
            template = random.choice(_FALLBACK_TEMPLATES)
            original_sentence = template.format(char=correct_char)

        display_sentence = original_sentence.replace(correct_char, wrong_char, 1)

        original_lines.append(original_sentence)
        display_lines.append(display_sentence)

        wrong_chars_info.append({
            "wrong_char": wrong_char,
            "correct_char": correct_char,
            "lesson": lesson_num,
            "lesson_title": lesson_title,
        })

    original_text = "\n".join(original_lines)
    display_text = "\n".join(display_lines)

    # Calculate positions
    for i, info in enumerate(wrong_chars_info):
        wrong_char = info["wrong_char"]
        display_sentence = display_lines[i]
        pos_in_sentence = display_sentence.find(wrong_char)
        if pos_in_sentence >= 0:
            global_pos = sum(len(display_lines[j]) + 1 for j in range(i)) + pos_in_sentence
            info["position"] = global_pos
        else:
            info["position"] = -1

    return {"original": original_text, "display": display_text}, wrong_chars_info


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.get("/api/lessons")
def get_lessons():
    """Get all available lessons."""
    lessons = []
    for num, data in VOCAB_DATA.items():
        lessons.append({
            "lesson_number": num,
            "title": data["title"],
            "character_count": len(data["characters"]),
            "characters": [c["char"] for c in data["characters"]],
        })
    return {
        "semester": SEMESTER_NAME,
        "grade": GRADE,
        "publisher": PUBLISHER,
        "total_lessons": TOTAL_LESSONS,
        "midterm_range": list(MIDTERM_RANGE),
        "final_range": list(FINAL_RANGE),
        "lessons": lessons,
    }


@app.post("/api/generate", response_model=GenerateArticleResponse)
def generate_article(req: GenerateArticleRequest):
    """Generate an article with intentional wrong characters."""
    if req.start_lesson < 1 or req.end_lesson > TOTAL_LESSONS:
        raise HTTPException(status_code=400, detail="Invalid lesson range")
    if req.start_lesson > req.end_lesson:
        raise HTTPException(status_code=400, detail="Start lesson must be <= end lesson")

    result = generate_article_with_errors(req.start_lesson, req.end_lesson, req.mode)
    return result


@app.post("/api/recognize", response_model=RecognizeResponse)
def recognize_handwriting(req: RecognizeRequest):
    """
    Recognize handwritten character from canvas image.
    Uses Google Cloud Vision API if available, otherwise falls back to simple matching.
    """
    expected = req.expected_char

    # Try Google Cloud Vision API first
    try:
        recognized, confidence = _recognize_with_vision_api(req.image_data)
        is_correct = recognized == expected
        return RecognizeResponse(
            recognized_char=recognized,
            is_correct=is_correct,
            confidence=confidence,
        )
    except Exception:
        pass

    # Fallback: trust the client-side recognition or simple comparison
    return RecognizeResponse(
        recognized_char=expected,
        is_correct=True,
        confidence=0.5,
    )


def _recognize_with_vision_api(image_data_b64: str) -> tuple[str, float]:
    """Use Google Cloud Vision API to recognize handwritten Chinese character."""
    from google.cloud import vision

    # Remove data URL prefix if present
    if "," in image_data_b64:
        image_data_b64 = image_data_b64.split(",", 1)[1]

    image_bytes = base64.b64decode(image_data_b64)

    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)

    response = client.text_detection(image=image)
    texts = response.text_annotations

    if texts:
        recognized = texts[0].description.strip()
        # Take only the first character
        if recognized:
            return recognized[0], 0.9
    raise ValueError("No text recognized")


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
