"""產生一字千金的內建成語庫 backend/idiom_bank.json。

來源：
- doc/dict_idioms_2020_20260929.xlsx：教育部《成語典》。取 V 欄「主條成語」而且剛好四個字的成語，
  解釋用 L 欄「用法說明-語義說明」的第一個義項（meaning_source = moe）。
- backend/idiom_bank.json（已經存在的那份）：保留已經判斷好的難度與錯字，以及本專案自己寫的解釋
  （meaning_source = curated）。不在《成語典》主條裡、但本專案原本就有的成語也照樣保留。
- 命令列給的標註檔（可以多個）：[{idiom, level?, wrong?, unsuitable?}]，蓋過既有的難度與錯字。
  後面的檔案只蓋過它有寫的欄位（例如修正檔只給 wrong）。
  unsuitable（內容不適合國小課堂）的成語存成 level = hidden，不出題。

老師在管理介面調整的難度存在 /data/idiom_levels.json，不在這個檔案裡，重新產生不會蓋掉。

用法：
    pip install openpyxl
    python scripts/build_idiom_bank.py [標註檔.json ...]

重新產生後要重跑 scripts/build_calligraphy_font.py（書法字型只含題庫用到的字）。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from idioms_data import BANK_PATH, LEVELS, validate_item  # noqa: E402

SOURCE = ROOT / "doc" / "dict_idioms_2020_20260929.xlsx"
# 欄位位置（0 起算）：B 成語、L 語義說明、O 形音辨誤、U 參考詞語、V 主條／非主條
COL_IDIOM, COL_MEANING, COL_NOTE, COL_VARIANTS, COL_KIND = 1, 11, 14, 20, 21


def clean(text: object) -> str:
    return str(text or "").replace("_x000D_", "").strip()


def read_moe() -> tuple[list[tuple[str, str]], set[str], dict[str, set[str]]]:
    """
    回傳：
    - 四字主條成語與語義說明
    - 教育部收錄的所有寫法（主條、非主條、參考詞語），用來擋掉「錯字其實是可接受的寫法」
    - 每個主條在形音辨誤裡明寫「不可寫作／不宜寫作」的字：例如「按步就班」雖然收錄成參考詞語，
      但教育部說「不宜寫作『步』」，所以仍然可以當錯字
    """
    sheet = openpyxl.load_workbook(SOURCE, read_only=True).worksheets[0]
    main: list[tuple[str, str]] = []
    spellings: set[str] = set()
    discouraged: dict[str, set[str]] = {}
    for row in sheet.iter_rows(min_row=2, values_only=True):
        name = clean(row[COL_IDIOM])
        spellings.add(name)
        spellings.update(v for v in re.split(r"[、，,\s]+", clean(row[COL_VARIANTS])) if v)
        if clean(row[COL_KIND]) == "主條成語" and len(name) == 4:
            main.append((name, clean(row[COL_MEANING]).split("＆")[0].strip()))
            discouraged[name] = set(re.findall(r"不[可宜](?:寫作|寫成|作)「(.)」", clean(row[COL_NOTE])))
    return main, spellings, discouraged


def main() -> None:
    moe, spellings, discouraged = read_moe()
    existing = {e["idiom"]: e for e in json.loads(BANK_PATH.read_text(encoding="utf-8"))} if BANK_PATH.exists() else {}
    notes: dict[str, dict] = {}
    for path in sys.argv[1:]:
        for entry in json.loads(Path(path).read_text(encoding="utf-8")):
            notes[entry["idiom"]] = {**notes.get(entry["idiom"], {}), **entry}

    bank: list[dict] = []
    missing: list[str] = []
    moe_names = {name for name, _ in moe}
    for name, moe_meaning in moe:
        old = existing.get(name, {})
        note = notes.get(name, {})
        level = "hidden" if note.get("unsuitable") else note.get("level", old.get("level"))
        wrong = note.get("wrong", old.get("wrong"))
        if not level or not wrong:
            missing.append(name)
            continue
        curated = old.get("meaning_source") == "curated"
        bank.append({
            "idiom": name,
            "level": level,
            "wrong": wrong,
            "meaning": old["meaning"] if curated else moe_meaning,
            "meaning_source": "curated" if curated else "moe",
        })
    # 本專案原本就有、但不是《成語典》主條的成語（例如莫名其妙、狼吞虎嚥）
    for name, old in existing.items():
        if name in moe_names or old.get("meaning_source") != "curated":
            continue
        note = notes.get(name, {})
        level = "hidden" if note.get("unsuitable") else note.get("level", old["level"])
        bank.append({**old, "level": level, "wrong": note.get("wrong", old["wrong"])})

    if missing:
        raise SystemExit(f"{len(missing)} 個成語還沒有難度與錯字的標註：{'、'.join(missing[:30])}…")

    problems = []
    seen: set[str] = set()
    for entry in bank:
        try:
            validate_item(entry, existing=seen, levels=LEVELS)
        except ValueError as exc:
            problems.append(f"{entry['idiom']}：{exc}")
        seen.add(entry["idiom"])
        for pos, char in entry["wrong"]:
            variant = entry["idiom"][:pos] + char + entry["idiom"][pos + 1:]
            if variant in spellings and char not in discouraged.get(entry["idiom"], set()):
                problems.append(f"{entry['idiom']}：錯字換成「{variant}」是教育部收錄的寫法")
    if problems:
        raise SystemExit("\n".join(problems))

    # 一筆一行，之後調整時 git diff 好讀
    lines = ",\n".join(json.dumps(e, ensure_ascii=False) for e in bank)
    BANK_PATH.write_text(f"[\n{lines}\n]\n", encoding="utf-8")
    counts = {lv: sum(1 for e in bank if e["level"] == lv) for lv in LEVELS}
    print(f"{BANK_PATH.relative_to(ROOT)}：{len(bank)} 個成語 {counts}，"
          f"解釋取自《成語典》{sum(1 for e in bank if e['meaning_source'] == 'moe')} 個")


if __name__ == "__main__":
    main()
