"""
一字千金 — 成語資料庫

每一筆成語包含：
- idiom:   正確的四字成語
- wrong:   可置換的錯別字清單，每一項是 (位置, 錯字)。位置從 0 開始。
           錯字取自台灣學生常見的同音字或形近字。
- meaning: 簡短解釋（公布答案時顯示）
- level:   common 一般常用／advanced 進階／hidden 不出題

出題時依老師選的難度，從同一個 level 裡隨機挑成語，再從 wrong 中隨機挑一組，把該位置的字換掉。

內建成語在 idiom_bank.json，由 scripts/build_idiom_bank.py 從教育部《成語典》的主條成語產生
（解釋取自《成語典》的語義說明；meaning_source 為 curated 的是本專案自己寫的解釋）。
老師可以在管理介面新增自訂成語、調整任何成語的難度，存成兩個 JSON 檔
（自訂成語的路徑由環境變數 YZQJ_IDIOMS_PATH 指定，預設 backend/data/custom_idioms.json；
難度調整存在同一個資料夾的 idiom_levels.json）。
"""
from __future__ import annotations

import json
import os
import random
import threading
from pathlib import Path
from typing import Iterable

LEVELS = ("common", "advanced", "hidden")
PLAYABLE_LEVELS = ("common", "advanced")
LEVEL_LABELS = {"common": "一般常用", "advanced": "進階", "hidden": "不出題"}

BANK_PATH = Path(__file__).parent / "idiom_bank.json"


def _load_bank() -> list[dict]:
    raw = json.loads(BANK_PATH.read_text(encoding="utf-8"))
    return [
        {
            "idiom": e["idiom"],
            "wrong": [(int(pos), char) for pos, char in e["wrong"]],
            "meaning": e["meaning"],
            "level": e["level"],
            "meaning_source": e.get("meaning_source", "moe"),
        }
        for e in raw
    ]


IDIOMS: list[dict] = _load_bank()
BUILTIN_NAMES = {i["idiom"] for i in IDIOMS}


DEFAULT_CUSTOM_PATH = Path(__file__).parent / "data" / "custom_idioms.json"
_custom_lock = threading.Lock()


def _custom_path() -> Path:
    return Path(os.environ.get("YZQJ_IDIOMS_PATH", str(DEFAULT_CUSTOM_PATH)))


def validate_item(item: dict, existing: Iterable[str] = (), levels: Iterable[str] = PLAYABLE_LEVELS) -> dict:
    """檢查並整理一筆成語資料；不合規就丟 ValueError（訊息直接給畫面顯示）。"""
    idiom = str(item.get("idiom", "")).strip()
    meaning = str(item.get("meaning", "")).strip()
    level = str(item.get("level") or "common")
    raw_wrong = item.get("wrong") or []
    if len(idiom) != 4:
        raise ValueError("成語要剛好四個字")
    if not all("一" <= c <= "鿿" for c in idiom):
        raise ValueError("成語只能是中文字")
    if idiom in set(existing):
        raise ValueError(f"「{idiom}」已經在題庫裡了")
    if level not in set(levels):
        raise ValueError("難度要是「一般常用」或「進階」")
    if not raw_wrong:
        raise ValueError("至少要給一組錯字")
    wrong: list[tuple[int, str]] = []
    for entry in raw_wrong:
        if isinstance(entry, dict):
            pos, char = entry.get("pos"), entry.get("char")
        else:
            pos, char = entry[0], entry[1]
        try:
            pos = int(pos)
        except (TypeError, ValueError):
            raise ValueError("錯字位置要是 0～3 的數字") from None
        char = str(char or "").strip()
        if not 0 <= pos < 4:
            raise ValueError("錯字位置要在第 1～4 字之間")
        if len(char) != 1 or not ("一" <= char <= "鿿"):
            raise ValueError("錯字要是單一個中文字")
        if char == idiom[pos]:
            raise ValueError(f"第 {pos + 1} 字的錯字「{char}」和正確字相同")
        if char in idiom:
            raise ValueError(f"錯字「{char}」已經出現在成語裡")
        if (pos, char) not in wrong:
            wrong.append((pos, char))
    return {"idiom": idiom, "wrong": wrong, "meaning": meaning, "level": level}


def load_custom() -> list[dict]:
    """讀自訂成語 JSON；檔案不存在或壞掉就當作空的，不讓整個遊戲跟著掛。"""
    path = _custom_path()
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    items: list[dict] = []
    for entry in raw if isinstance(raw, list) else []:
        try:
            item = validate_item(entry, existing=BUILTIN_NAMES | {i["idiom"] for i in items}, levels=LEVELS)
        except (ValueError, TypeError, KeyError):
            continue
        item["source"] = "custom"
        item["meaning_source"] = "custom"
        items.append(item)
    return items


def save_custom(items: list[dict]) -> None:
    payload = [
        {"idiom": i["idiom"], "wrong": [list(w) for w in i["wrong"]], "meaning": i["meaning"], "level": i["level"]}
        for i in items
    ]
    _write_json(_custom_path(), payload)


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _levels_path() -> Path:
    """老師對內建成語的難度調整，跟自訂成語放在同一個資料夾（線上是 /data bucket）。"""
    return _custom_path().with_name("idiom_levels.json")


def load_level_overrides() -> dict[str, str]:
    path = _levels_path()
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {k: v for k, v in raw.items() if k in BUILTIN_NAMES and v in LEVELS}


def all_idioms() -> list[dict]:
    """內建（套用老師的難度調整）＋自訂，每一筆都帶 source 欄位。"""
    overrides = load_level_overrides()
    items = [{**i, "level": overrides.get(i["idiom"], i["level"]), "source": "builtin"} for i in IDIOMS]
    items.extend(load_custom())
    return items


def level_counts(items: list[dict] | None = None) -> dict[str, int]:
    items = all_idioms() if items is None else items
    return {lv: sum(1 for i in items if i["level"] == lv) for lv in LEVELS}


def add_custom(entry: dict) -> dict:
    with _custom_lock:
        custom = load_custom()
        existing = BUILTIN_NAMES | {i["idiom"] for i in custom}
        item = validate_item(entry, existing=existing)
        item["source"] = "custom"
        item["meaning_source"] = "custom"
        custom.append(item)
        save_custom(custom)
    return item


def remove_custom(idiom: str) -> bool:
    with _custom_lock:
        custom = load_custom()
        kept = [i for i in custom if i["idiom"] != idiom]
        if len(kept) == len(custom):
            return False
        save_custom(kept)
    return True


def set_level(idiom: str, level: str) -> dict:
    """
    調整一個成語的難度（含 hidden 不出題）。
    自訂成語直接改自訂檔；內建成語記在 idiom_levels.json，跟 idiom_bank.json 的預設值相同時就拿掉，
    之後重新產生 idiom_bank.json 也不會蓋掉老師的調整。找不到成語丟 KeyError。
    """
    if level not in LEVELS:
        raise ValueError("難度要是「一般常用」、「進階」或「不出題」")
    with _custom_lock:
        custom = load_custom()
        for item in custom:
            if item["idiom"] == idiom:
                item["level"] = level
                save_custom(custom)
                return item
        builtin = next((i for i in IDIOMS if i["idiom"] == idiom), None)
        if builtin is None:
            raise KeyError(idiom)
        overrides = load_level_overrides()
        if level == builtin["level"]:
            overrides.pop(idiom, None)
        else:
            overrides[idiom] = level
        _write_json(_levels_path(), overrides)
        return {**builtin, "level": level, "source": "builtin"}


def all_characters() -> set[str]:
    """回傳所有會以書法字型顯示的字（正確字＋錯字），供字型子集化使用。"""
    chars: set[str] = set()
    for item in all_idioms():
        chars.update(item["idiom"])
        for _, wrong_char in item["wrong"]:
            chars.add(wrong_char)
    return chars


def make_question(item: dict) -> dict:
    """把一筆成語資料變成一道題目：挑一組錯字置換進去。"""
    pos, wrong_char = random.choice(item["wrong"])
    idiom = item["idiom"]
    display = idiom[:pos] + wrong_char + idiom[pos + 1:]
    return {
        "idiom": idiom,
        "display": display,
        "wrong_index": pos,
        "wrong_char": wrong_char,
        "correct_char": idiom[pos],
        "meaning": item["meaning"],
        "level": item["level"],
    }


def pick_questions(
    count: int = 5,
    exclude: Iterable[str] = (),
    must_exclude: Iterable[str] = (),
    level: str = "common",
) -> list[dict]:
    """
    從指定難度隨機挑 count 個不重複的成語並製成題目。

    exclude:      盡量避開（最近幾輪出過的）；題庫不夠時會回頭用。
    must_exclude: 一定避開（這一場已經出過的），讓「再來一輪」絕不重複。
    這個難度的成語不夠一輪時（老師把太多成語設成不出題），用另一個可出題的難度補。
    """
    if level not in PLAYABLE_LEVELS:
        raise ValueError("難度只能選「一般常用」或「進階」")
    everything = all_idioms()
    hard = set(must_exclude)
    soft = set(exclude) | hard
    chosen = _sample([i for i in everything if i["level"] == level], count, soft, hard)
    if len(chosen) < count:
        taken = {i["idiom"] for i in chosen}
        backup = [i for i in everything if i["level"] in PLAYABLE_LEVELS and i["level"] != level]
        chosen += _sample(backup, count - len(chosen), soft | taken, hard | taken)
    random.shuffle(chosen)
    return [make_question(item) for item in chosen]


def _sample(pool: list[dict], count: int, soft: set[str], hard: set[str]) -> list[dict]:
    """先從沒被避開的成語挑；不夠時回頭用 soft（最近出過的），hard 一定不碰。"""
    fresh = [i for i in pool if i["idiom"] not in soft]
    chosen = random.sample(fresh, min(count, len(fresh)))
    if len(chosen) < count:
        taken = {i["idiom"] for i in chosen}
        rest = [i for i in pool if i["idiom"] not in hard and i["idiom"] not in taken]
        chosen += random.sample(rest, min(count - len(chosen), len(rest)))
    return chosen


def distractors_for(question: dict, limit: int = 5) -> list[str]:
    """
    給辨識用的候選錯字：題目本身的錯字、其他成語在同一個正確字上用過的錯字、
    生字表裡這個字的形近字。學生寫得像這些字就不算對。
    """
    correct = question["correct_char"]
    found: list[str] = [question["wrong_char"]]
    for item in all_idioms():
        for pos, wrong_char in item["wrong"]:
            if item["idiom"][pos] == correct and wrong_char not in found:
                found.append(wrong_char)
    try:
        from vocab_data import get_similar_wrong

        for c in get_similar_wrong(correct, limit=limit):
            if c not in found:
                found.append(c)
    except Exception:  # pragma: no cover - 生字表讀不到也不影響出題
        pass
    return [c for c in found if c != correct][:limit]


def _validate() -> None:
    seen: set[str] = set()
    for item in IDIOMS:
        validate_item(item, existing=seen, levels=LEVELS)
        seen.add(item["idiom"])


_validate()
