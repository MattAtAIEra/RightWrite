"""
RightWrite - 多年級生字資料
支援 1-6 年級、康軒版/南一版/翰林版
資料從 vocab_all.json 載入（由 scripts/build_vocab_json.py 產生）
"""
import json
from pathlib import Path

_JSON_PATH = Path(__file__).parent / "vocab_all.json"
_RAW: dict = {}

# Legacy grade_id aliases for backward compatibility
_ALIASES = {
    "grade4": "4_kangxuan",
    "grade2": "2_hanlin",
}


def _load():
    global _RAW
    if _RAW:
        return
    with open(_JSON_PATH, encoding="utf-8") as f:
        _RAW = json.load(f)
    # Convert lesson keys from strings to ints
    for grade_data in _RAW.values():
        lessons = grade_data.get("lessons", {})
        grade_data["lessons"] = {int(k): v for k, v in lessons.items()}


def _resolve(grade_id: str) -> str:
    return _ALIASES.get(grade_id, grade_id)


# ---------------------------------------------------------------------------
# Public API (same interface as before)
# ---------------------------------------------------------------------------

def get_grade_registry() -> dict:
    """Return {grade_id: metadata} for all grades."""
    _load()
    return {
        gid: {k: v for k, v in gd.items() if k != "lessons"}
        for gid, gd in _RAW.items()
    }

# Keep module-level GRADE_REGISTRY for backward compat
GRADE_REGISTRY = property(lambda self: get_grade_registry())


def get_grade_info(grade_id: str) -> dict:
    """Get grade metadata."""
    _load()
    gid = _resolve(grade_id)
    gd = _RAW.get(gid)
    if not gd:
        gd = next(iter(_RAW.values()))
    return {k: v for k, v in gd.items() if k != "lessons"}


def get_vocab_data(grade_id: str) -> dict:
    """Get vocabulary data for a specific grade. Returns {lesson_num: lesson_dict}."""
    _load()
    gid = _resolve(grade_id)
    gd = _RAW.get(gid)
    if not gd:
        gd = next(iter(_RAW.values()))
    return gd.get("lessons", {})


def get_lessons_in_range(start: int, end: int, grade_id: str = "4_kangxuan") -> dict:
    """Get vocabulary data for a range of lessons."""
    data = get_vocab_data(grade_id)
    return {k: v for k, v in data.items() if start <= k <= end}


def get_all_characters_in_range(start: int, end: int, grade_id: str = "4_kangxuan") -> list[dict]:
    """Get all characters for a range of lessons, with lesson info."""
    data = get_vocab_data(grade_id)
    chars = []
    for lesson_num, lesson_data in data.items():
        if start <= lesson_num <= end:
            for c in lesson_data["characters"]:
                chars.append({
                    "char": c["char"],
                    "similar_wrong": c["similar_wrong"],
                    "examples": c.get("examples", []),
                    "lesson": lesson_num,
                    "lesson_title": lesson_data["title"],
                })
    return chars


_KNOWN_CHARS: set[str] = set()


def get_known_characters() -> set[str]:
    """所有年級、所有版本課本裡出現過的字(生字＋詞語用字)。

    拿來判斷一個錯字候選對國小生來說是不是「看過的字」。挑錯字時同音的候選
    可能是「婞」「庶」這種課本從來不會教的字,寫進句子小朋友只會覺得莫名其
    妙,也學不到真正容易混淆的那組字。
    """
    global _KNOWN_CHARS
    if _KNOWN_CHARS:
        return _KNOWN_CHARS
    _load()
    chars: set[str] = set()
    for grade_data in _RAW.values():
        for lesson in grade_data.get("lessons", {}).values():
            for c in lesson["characters"]:
                chars.add(c["char"])
            for comp in lesson.get("compounds", []):
                chars.update(comp["word"])
    _KNOWN_CHARS = chars
    return _KNOWN_CHARS


def get_all_compounds_in_range(start: int, end: int, grade_id: str = "4_kangxuan") -> list[dict]:
    """Get all compound words for a range of lessons, with lesson info."""
    data = get_vocab_data(grade_id)
    compounds = []
    for lesson_num, lesson_data in data.items():
        if start <= lesson_num <= end:
            for comp in lesson_data.get("compounds", []):
                compounds.append({
                    "word": comp["word"],
                    "examples": comp.get("examples", []),
                    "lesson": lesson_num,
                    "lesson_title": lesson_data["title"],
                })
    return compounds
