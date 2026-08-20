"""
Parse all vocabulary Excel files from resource/ and generate backend/vocab_all.json.

Sources
- resource/<年級><上|下>-<出版社>/第N課：課名.xlsx  — per-lesson files from
  pedia.cloud.edu.tw (scripts/download_vocab_excel.py): lesson title, 生字,
  詞語 + 例句.
- doc/115上114下學期生字表_大腦與語言實驗室_20260723.xlsx — 大腦與語言實驗室
  authoritative 生字表 for 115上 / 114下. Used to (a) cross-check every lesson's
  character list (missing lessons/chars are filled from it) and (b) supply
  同音旁字 (shared phonetic component) as high-quality similar_wrong candidates.

similar_wrong priority per character:
  1. scripts/curated_similar_wrong.json (hand curated)
  2. 同音旁字 from the lab sheet (常見程度 >= 3)
  3. pypinyin homophones among all textbook characters (fill up to 4)
"""
import json
import os
import re
import sys

from openpyxl import load_workbook
from pypinyin import pinyin, Style

RESOURCE_DIR = os.path.join(os.path.dirname(__file__), "..", "resource")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "vocab_all.json")
LAB_SHEET_PATH = os.path.join(
    os.path.dirname(__file__), "..", "doc", "115上114下學期生字表_大腦與語言實驗室_20260723.xlsx"
)

# 上/下 directory suffix → (term, semester label, short label, year, semester no.)
# grade_id scheme: 114下 keeps the legacy "{grade}_{publisher}" id so sessions /
# charStats already stored in users' IndexedDB keep matching; every other term
# is prefixed, e.g. "115_1_4_kangxuan".
TERMS = {
    "下": {"term": "114_2", "semester": "114學年度第2學期", "term_label": "114下學期", "year": 114, "sem": 2},
    "上": {"term": "115_1", "semester": "115學年度第1學期", "term_label": "115上學期", "year": 115, "sem": 1},
}
LEGACY_TERM = "114_2"
MIN_PHONETIC_LEVEL = 3  # 常見程度 1-6; ignore rare 同音旁字 kids would never see

PUBLISHER_MAP = {
    "康軒版": "kangxuan",
    "南一版": "nanyi",
    "翰林版": "hanlin",
}
PUBLISHER_LABELS = {"kangxuan": "康軒版", "nanyi": "南一版", "hanlin": "翰林版"}
GRADE_CN = {1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六"}

# Regex to extract lesson number from directory/filename
LESSON_NUM_RE = re.compile(r"第([一二三四五六七八九十百零]+)課")
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def cn_to_int(s: str) -> int:
    """Convert Chinese number string to int (handles 1-20)."""
    if len(s) == 1:
        return CN_NUM.get(s, 0)
    if s.startswith("十"):
        return 10 + CN_NUM.get(s[1:], 0)
    if s.endswith("十"):
        return CN_NUM.get(s[0], 0) * 10
    return 0


def is_cjk(ch: str) -> bool:
    return len(ch) == 1 and "\u4e00" <= ch <= "\u9fff"


def extract_examples(text: str) -> list[str]:
    """Extract example sentences from cell text. Examples follow [���] markers."""
    if not text:
        return []
    examples = []
    for m in re.finditer(r"[【\[（(]例[】\]）)](.+?)(?=[。！？]|$)", text, re.DOTALL):
        sent = m.group(1).strip().rstrip("。！？") + "。"
        if len(sent) > 3:
            examples.append(sent)
    # Also try lines that start after [例]
    parts = re.split(r"[【\[（(]例[】\]）)]", text)
    if len(parts) > 1:
        for part in parts[1:]:
            for sent in re.split(r"[。！？]", part):
                sent = sent.strip()
                if len(sent) > 2:
                    examples.append(sent + "。")
    return list(dict.fromkeys(examples))[:3]  # deduplicate, max 3


def parse_excel(filepath: str) -> dict:
    """Parse a single vocabulary Excel file. Returns lesson data dict."""
    wb = load_workbook(filepath, data_only=True)
    ws = wb.active

    # Extract title: prefer from cell A1, fallback to filename
    title_cell = ws.cell(1, 1).value or ""
    title = title_cell.strip()
    if not title:
        # Get title from filename: "第一課：一束鮮花.xlsx" → "一束鮮花"
        fname = os.path.splitext(os.path.basename(filepath))[0]
        title = fname

    # Extract clean title (after ：or :)
    if "：" in title:
        title = title.split("：", 1)[1].strip()
    elif ":" in title:
        title = title.split(":", 1)[1].strip()

    characters = []
    compounds = []

    # Skip row 1 (title) and row 2 (headers)
    for row in ws.iter_rows(min_row=3, max_col=2, values_only=True):
        word = (row[0] or "").strip()
        definition = (row[1] or "").strip() if row[1] else ""

        if not word:
            continue

        examples = extract_examples(definition)

        if len(word) == 1 and is_cjk(word):
            characters.append({
                "char": word,
                "similar_wrong": [],  # will be filled later
                "examples": examples,
            })
        elif len(word) > 1:
            compounds.append({
                "word": word,
                "examples": examples,
            })

    wb.close()
    return {"title": title, "characters": characters, "compounds": compounds}


def load_existing_similar_wrong() -> dict[str, list[str]]:
    """Load manually curated similar_wrong from saved JSON."""
    curated_path = os.path.join(os.path.dirname(__file__), "curated_similar_wrong.json")
    if os.path.exists(curated_path):
        with open(curated_path, encoding="utf-8") as f:
            curated = json.load(f)
        return curated
    print("Warning: curated_similar_wrong.json not found, generating all from pypinyin")
    return {}


def build_pinyin_map(all_chars: set[str]) -> dict[str, list[str]]:
    """Build pinyin -> characters mapping for homophone lookup."""
    py_map: dict[str, list[str]] = {}
    py_no_tone_map: dict[str, list[str]] = {}

    for ch in sorted(all_chars):
        pys = pinyin(ch, style=Style.TONE3, heteronym=False)
        if pys and pys[0]:
            py_str = pys[0][0]  # e.g., "jie2"
            py_map.setdefault(py_str, []).append(ch)
            # Also map without tone number
            base = re.sub(r"\d$", "", py_str)
            py_no_tone_map.setdefault(base, []).append(ch)

    return py_map, py_no_tone_map


def generate_similar_wrong(char: str, py_map: dict, py_no_tone_map: dict, all_chars: set) -> list[str]:
    """Generate similar_wrong list for a character using pinyin homophones."""
    pys = pinyin(char, style=Style.TONE3, heteronym=False)
    if not pys or not pys[0]:
        return []

    py_str = pys[0][0]
    base = re.sub(r"\d$", "", py_str)

    # Priority 1: exact pinyin match (same tone)
    candidates = [c for c in py_map.get(py_str, []) if c != char]

    # Priority 2: same base pinyin (different tone)
    if len(candidates) < 2:
        for c in py_no_tone_map.get(base, []):
            if c != char and c not in candidates:
                candidates.append(c)

    # Limit to 4
    return candidates[:4]


def _parse_level_list(cell) -> list[tuple[str, int]]:
    """'怕(6),拍(6),伯(5)' → [('怕', 6), ('拍', 6), ('伯', 5)]"""
    if not cell:
        return []
    out = []
    for m in re.finditer(r"(\S)\((\d)\)", str(cell)):
        ch, lvl = m.group(1), int(m.group(2))
        if is_cjk(ch):
            out.append((ch, lvl))
    return out


def load_lab_sheet() -> tuple[dict, dict]:
    """Load the 大腦與語言實驗室 sheet.

    Returns
      lessons: {(publisher_cn, year, grade, sem): {lesson_num|None: [char, ...]}}
      phonetic: {char: [(similar_char, level), ...]}  (同音旁課內字 + 課外字, merged)
    """
    if not os.path.exists(LAB_SHEET_PATH):
        print(f"Warning: lab sheet not found at {LAB_SHEET_PATH}; skipping cross-check")
        return {}, {}
    wb = load_workbook(LAB_SHEET_PATH, read_only=True, data_only=True)
    lessons: dict = {}
    phonetic: dict[str, dict[str, int]] = {}
    for sheet_name in ("康軒", "南一", "翰林"):
        if sheet_name not in wb.sheetnames:
            continue
        rows = wb[sheet_name].iter_rows(values_only=True)
        header = next(rows)
        col = {name: i for i, name in enumerate(header)}
        for r in rows:
            ch = r[col["生字"]]
            if not ch or not is_cjk(str(ch)):
                continue
            key = (sheet_name + "版", int(r[col["年度"]]), int(r[col["年級"]]), int(r[col["學期"]]))
            lesson = r[col["課次"]]
            lesson = int(lesson) if lesson is not None else None
            lessons.setdefault(key, {}).setdefault(lesson, []).append(str(ch))
            bucket = phonetic.setdefault(str(ch), {})
            for c, lvl in _parse_level_list(r[col["同音旁課內字(常見程度)"]]) + _parse_level_list(
                r[col["同音旁課外字(常見程度)"]]
            ):
                if c != ch:
                    bucket[c] = max(lvl, bucket.get(c, 0))
    wb.close()
    phonetic_sorted = {
        ch: sorted(cands.items(), key=lambda kv: -kv[1]) for ch, cands in phonetic.items()
    }
    return lessons, phonetic_sorted


def _base_pinyin(ch: str) -> str:
    pys = pinyin(ch, style=Style.NORMAL, heteronym=False)
    return pys[0][0] if pys and pys[0] else ""


def pick_similar_wrong(
    char: str,
    curated: dict,
    phonetic: dict,
    py_map: dict,
    py_no_tone_map: dict,
    all_chars: set,
) -> list[str]:
    if char in curated:
        return curated[char]
    result = [c for c, lvl in phonetic.get(char, []) if lvl >= MIN_PHONETIC_LEVEL][:3]
    if len(result) < 4:
        for c in generate_similar_wrong(char, py_map, py_no_tone_map, all_chars):
            if c not in result and c != char:
                result.append(c)
            if len(result) >= 4:
                break
    return result


def scan_all_excels() -> dict:
    """Scan resource/ directory and build the complete dataset."""
    curated = load_existing_similar_wrong()
    print(f"Loaded {len(curated)} curated similar_wrong entries")
    lab_lessons, lab_phonetic = load_lab_sheet()
    lab_all_chars = {c for by_lesson in lab_lessons.values() for cs in by_lesson.values() for c in cs}
    print(f"Lab sheet: {len(lab_lessons)} grade/term combos, {len(lab_phonetic)} chars with 同音旁字")

    # First pass: collect all characters and parse all files
    all_grades = {}
    all_chars = set()

    for dir_name in sorted(os.listdir(RESOURCE_DIR)):
        dir_path = os.path.join(RESOURCE_DIR, dir_name)
        if not os.path.isdir(dir_path) or dir_name.startswith("."):
            continue

        # Parse directory name: "四下-康軒版" / "四上-康軒版"
        match = re.match(r"([一二三四五六])([上下])-(.+版)", dir_name)
        if not match:
            print(f"Skipping unrecognized directory: {dir_name}")
            continue

        grade_cn, sem_cn, publisher = match.groups()
        grade_num = CN_NUM.get(grade_cn, 0)
        pub_code = PUBLISHER_MAP.get(publisher)
        term_info = TERMS[sem_cn]
        if not grade_num or not pub_code:
            print(f"Skipping unknown grade/publisher: {dir_name}")
            continue

        if term_info["term"] == LEGACY_TERM:
            grade_id = f"{grade_num}_{pub_code}"
        else:
            grade_id = f"{term_info['term']}_{grade_num}_{pub_code}"
        lessons = {}

        for fname in sorted(os.listdir(dir_path)):
            if not fname.endswith(".xlsx") or fname.startswith("~"):
                continue
            # Skip duplicate files like "第一課：xxx (1).xlsx"
            if re.search(r"\(\d+\)\.xlsx$", fname):
                continue

            lesson_match = LESSON_NUM_RE.search(fname)
            if not lesson_match:
                continue
            lesson_num = cn_to_int(lesson_match.group(1))
            if lesson_num == 0:
                continue

            filepath = os.path.join(dir_path, fname)
            try:
                lesson_data = parse_excel(filepath)
                lessons[lesson_num] = lesson_data
                for ch in lesson_data["characters"]:
                    all_chars.add(ch["char"])
            except Exception as e:
                print(f"Error parsing {filepath}: {e}")

        # Cross-check against the lab sheet (authoritative 生字表)
        lab = lab_lessons.get((publisher, term_info["year"], grade_num, term_info["sem"]))
        if lab:
            for lesson_num, lab_chars in lab.items():
                if lesson_num is None:
                    continue  # 特殊單元 (no lesson number) — not practised as a lesson
                if lesson_num not in lessons:
                    print(f"  [{dir_name}] 第{lesson_num}課 missing from pedia → filled from lab sheet ({len(lab_chars)} chars)")
                    lessons[lesson_num] = {
                        "title": f"第{lesson_num}課",
                        "characters": [{"char": c, "similar_wrong": [], "examples": []} for c in lab_chars],
                        "compounds": [],
                    }
                    all_chars.update(lab_chars)
                    continue
                have = {c["char"] for c in lessons[lesson_num]["characters"]}
                extra = [c for c in lab_chars if c not in have]
                missing = sorted(have - set(lab_chars))
                # Exactly one char differs on each side → treat as a variant /
                # typo correction (e.g. pedia 壼 vs lab 壺) and fix the 詞語 too.
                if len(extra) == 1 and len(missing) == 1:
                    old, new = missing[0], extra[0]
                    for c in lessons[lesson_num]["characters"]:
                        if c["char"] == old:
                            c["char"] = new
                    all_chars.add(new)
                    # Only rewrite 詞語/例句 when it is plausibly the *same* word
                    # spelled with a variant/typo (same reading, e.g. 袪→祛, 賭→睹,
                    # or a char that is not a 生字 anywhere, e.g. 壼→壺). A genuinely
                    # different char (罩 vs 嬤) keeps the old 詞語 untouched.
                    same_reading = _base_pinyin(old) == _base_pinyin(new)
                    if same_reading or old not in lab_all_chars:
                        for comp in lessons[lesson_num]["compounds"]:
                            comp["word"] = comp["word"].replace(old, new)
                            comp["examples"] = [ex.replace(old, new) for ex in comp["examples"]]
                        print(f"  [{dir_name}] 第{lesson_num}課 {old}→{new} (variant; 詞語 rewritten)")
                    else:
                        print(f"  [{dir_name}] 第{lesson_num}課 {old}→{new} (different char; 詞語 kept)")
                    continue
                if extra:
                    print(f"  [{dir_name}] 第{lesson_num}課 +{extra} from lab sheet")
                    lessons[lesson_num]["characters"].extend(
                        {"char": c, "similar_wrong": [], "examples": []} for c in extra
                    )
                    all_chars.update(extra)
                if missing:
                    print(f"  [{dir_name}] 第{lesson_num}課 -{missing} (not in lab sheet, dropped)")
                    lessons[lesson_num]["characters"] = [
                        c for c in lessons[lesson_num]["characters"] if c["char"] not in missing
                    ]
        else:
            print(f"  [{dir_name}] no lab sheet data for cross-check")

        if lessons:
            total = max(lessons)
            mid = total // 2
            all_grades[grade_id] = {
                "label": dir_name,
                "term": term_info["term"],
                "term_label": term_info["term_label"],
                "semester": term_info["semester"],
                "grade": f"{grade_cn}年級",
                "publisher": publisher,
                "total_lessons": total,
                "midterm_range": [1, mid],
                "final_range": [mid + 1, total],
                "lessons": lessons,
            }

    print(f"Collected {len(all_chars)} unique characters from {len(all_grades)} grade/publisher combos")

    # Build pinyin maps
    py_map, py_no_tone_map = build_pinyin_map(all_chars)

    # Second pass: fill similar_wrong
    for grade_id, grade_data in all_grades.items():
        for lesson_num, lesson in grade_data["lessons"].items():
            for ch_data in lesson["characters"]:
                ch_data["similar_wrong"] = pick_similar_wrong(
                    ch_data["char"], curated, lab_phonetic, py_map, py_no_tone_map, all_chars
                )

    return all_grades


def main():
    data = scan_all_excels()

    # Stats
    total_chars = 0
    chars_with_sw = 0
    for gd in data.values():
        for lesson in gd["lessons"].values():
            for ch in lesson["characters"]:
                total_chars += 1
                if ch["similar_wrong"]:
                    chars_with_sw += 1

    print(f"\nTotal characters: {total_chars}")
    print(f"Characters with similar_wrong: {chars_with_sw} ({100*chars_with_sw//total_chars}%)")
    print(f"Output: {OUTPUT_PATH}")

    # Stable key order: legacy 114下 ids first (as before), then newer terms
    ordered = dict(sorted(data.items(), key=lambda kv: (kv[1]["term"] != LEGACY_TERM, kv[1]["term"], kv[0])))
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=2)

    print("Done!")


if __name__ == "__main__":
    main()
