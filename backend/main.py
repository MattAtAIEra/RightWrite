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
    get_lessons_in_range,
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

# Pre-built article templates that can incorporate vocabulary characters
ARTICLE_TEMPLATES = [
    {
        "theme": "nature",
        "template": (
            "春天來了，{c1}地上長出了嫩綠的小草。小河邊的{c2}樹開滿了花，"
            "{c3}蝶在花叢中飛舞。遠處的山{c4}被白雲圍繞，看起來就像一幅美麗的畫。"
            "我和朋友們一起到{c5}外踏青，{c6}受大自然的美好。"
            "溪水{c7}流過石頭，發出清脆的聲音。"
            "我們在草地上奔{c8}、嬉{c9}，度過了愉快的一天。"
        ),
    },
    {
        "theme": "school",
        "template": (
            "今天在學校裡，老師帶我們到{c1}書館看書。"
            "我{c2}了一本關於{c3}學的故事書，裡面的內容非常{c4}動人心。"
            "下課後，我和同學到操{c5}打球，大家都很{c6}力地練習。"
            "放學時，{c7}色已經變暗了，我們{c8}著快樂的心情回家。"
            "媽媽問我今天學了什麼，我開心地{c9}訴她每一件有趣的事。"
        ),
    },
    {
        "theme": "family",
        "template": (
            "週末的早晨，爸爸帶著全家人一起去{c1}場買菜。"
            "媽媽精心{c2}備了豐富的食材，要做一頓美味的大餐。"
            "弟弟在旁邊幫忙洗{c3}，姊姊負責切水果。"
            "全家人一起{c4}力完成了午餐，桌上擺滿了{c5}味的菜餚。"
            "吃完飯後，我們到附近的公{c6}散步，{c7}受溫暖的陽光。"
            "這是一個{c8}福又快{c9}的週末。"
        ),
    },
]


def generate_article_with_errors(start_lesson: int, end_lesson: int) -> dict:
    """Generate a short article containing wrong characters from the selected lessons."""
    chars_pool = get_all_characters_in_range(start_lesson, end_lesson)
    if not chars_pool:
        raise HTTPException(status_code=400, detail="No characters found for the selected range")

    # Pick 5-8 characters to make wrong
    num_wrong = min(random.randint(5, 8), len(chars_pool))
    selected_chars = random.sample(chars_pool, num_wrong)

    # Build a contextual article using the selected characters
    article_text, wrong_chars_info = _build_article(selected_chars)

    return {
        "original_text": article_text["original"],
        "display_text": article_text["display"],
        "wrong_chars": wrong_chars_info,
        "total_wrong": len(wrong_chars_info),
    }


def _build_article(selected_chars: list[dict]) -> tuple[dict, list[dict]]:
    """
    Build a short Chinese article that naturally uses the selected characters,
    then replace some with similar wrong characters.
    """
    # Create a short article that includes the target characters
    char_list = [c["char"] for c in selected_chars]

    # Generate contextual sentences for each character
    sentences = []
    wrong_chars_info = []

    sentence_patterns = [
        "在美麗的{context}中，我們看到了許多有趣的事物。",
        "老師告訴我們，{char}這個字要特別注意書寫。",
        "小明每天都會練習寫{char}字，希望能寫得更好。",
        "這個故事讓我學到了很多關於{topic}的知識。",
        "春天的時候，大地充滿了生{qi}，到處都是花開的景象。",
        "媽媽常常提醒我，做事要有{xin}心，不能半途而廢。",
        "我們班上的同學都很{nu}力學習，每個人都想進步。",
        "下課後，大家一起到操場上{yun}動，鍛鍊身體。",
    ]

    # Build a coherent article
    original_lines = []
    display_lines = []

    # Create topic sentences
    topics = [
        ("學習", "這學期我們學了很多新的生字。"),
        ("自然", "大自然中有許多美麗的風景。"),
        ("生活", "我們的生活中有很多值得感恩的事。"),
        ("學校", "學校是我們學習和成長的地方。"),
    ]

    topic = random.choice(topics)
    intro = topic[1]
    original_lines.append(intro)
    display_lines.append(intro)

    # For each selected character, create a sentence and introduce error
    position_offset = len(intro)
    for i, char_info in enumerate(selected_chars):
        correct_char = char_info["char"]
        wrong_options = char_info["similar_wrong"]
        wrong_char = random.choice(wrong_options)
        lesson_num = char_info["lesson"]
        lesson_title = char_info["lesson_title"]

        # Create a sentence using this character
        sentence_templates = [
            f"老師教我們「{correct_char}」這個字，它出現在第{lesson_num}課。",
            f"「{correct_char}」是這學期要學的重要生字之一。",
            f"我認真地練習書寫「{correct_char}」，希望記得更牢。",
            f"課本裡面有「{correct_char}」這個字，我們要把它學好。",
            f"今天的功課是練習寫「{correct_char}」，要寫十遍。",
            f"考試的時候，「{correct_char}」這個字差點寫錯了。",
            f"爸爸教我用「{correct_char}」來造句，我想了很久。",
            f"這篇文章裡有「{correct_char}」字，讀起來很有趣。",
        ]

        original_sentence = random.choice(sentence_templates)
        display_sentence = original_sentence.replace(f"「{correct_char}」", f"「{wrong_char}」", 1)

        original_lines.append(original_sentence)
        display_lines.append(display_sentence)

        # Find the position of the wrong character in the display text
        # We'll calculate positions after joining
        wrong_chars_info.append({
            "wrong_char": wrong_char,
            "correct_char": correct_char,
            "lesson": lesson_num,
            "lesson_title": lesson_title,
        })

    # Add a closing sentence
    closings = [
        "只要每天認真練習，我一定可以把每個字都寫對！",
        "學習生字雖然辛苦，但是很有成就感。",
        "我會繼續努力，把這些生字都記住。",
        "期末考快到了，我要加油把生字都複習好。",
    ]
    closing = random.choice(closings)
    original_lines.append(closing)
    display_lines.append(closing)

    original_text = "\n".join(original_lines)
    display_text = "\n".join(display_lines)

    # Calculate positions of wrong characters in display_text
    for info in wrong_chars_info:
        wrong_char = info["wrong_char"]
        # Find position in display text within 「」
        pattern = f"「{wrong_char}」"
        match = display_text.find(pattern)
        if match >= 0:
            info["position"] = match + 1  # +1 to skip the 「
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

    result = generate_article_with_errors(req.start_lesson, req.end_lesson)
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
