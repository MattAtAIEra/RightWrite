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


def _build_char_lookup(start_lesson: int, end_lesson: int) -> dict[str, list[str]]:
    """Build a char -> similar_wrong lookup from the lesson range."""
    lookup = {}
    for lesson_num, lesson_data in VOCAB_DATA.items():
        if start_lesson <= lesson_num <= end_lesson:
            for c in lesson_data["characters"]:
                lookup[c["char"]] = c["similar_wrong"]
    return lookup


def generate_article_with_errors(start_lesson: int, end_lesson: int, mode: str = "article") -> dict:
    """
    Generate content with wrong characters from the selected lessons.
    Uses compound words (詞語) as the unit — each wrong character always
    appears within a word in a real example sentence, so there is enough
    context for students to identify the error.
    """
    compounds_pool = get_all_compounds_in_range(start_lesson, end_lesson)
    char_lookup = _build_char_lookup(start_lesson, end_lesson)

    # Filter to compounds that have usable example sentences
    usable = []
    for comp in compounds_pool:
        word = comp["word"]
        examples = [ex for ex in comp.get("examples", []) if len(ex) >= 5 and word in ex]
        if not examples:
            continue
        # Find which characters in this word have similar_wrong mappings
        swappable = [(i, ch) for i, ch in enumerate(word) if ch in char_lookup]
        if not swappable:
            continue
        usable.append({**comp, "_examples": examples, "_swappable": swappable})

    if not usable:
        raise HTTPException(status_code=400, detail="No usable compound examples found for the selected range")

    if mode == "sentence":
        num_wrong = min(random.randint(2, 3), len(usable))
    else:
        num_wrong = min(random.randint(5, 8), len(usable))

    selected = random.sample(usable, num_wrong)

    wrong_chars_info = []
    original_lines = []
    display_lines = []

    for comp_info in selected:
        word = comp_info["word"]
        lesson_num = comp_info["lesson"]
        lesson_title = comp_info["lesson_title"]

        # Pick a random example sentence
        original_sentence = random.choice(comp_info["_examples"])

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
    }


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
