"""
一字千金：成語難度（一般常用／進階／不出題）。

執行：cd backend && python -m pytest tests -q
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

os.environ["YZQJ_QUESTION_SECONDS"] = "1.0"
os.environ["YZQJ_REVEAL_SECONDS"] = "0.2"
os.environ["YZQJ_GRACE_SECONDS"] = "0.5"
os.environ["ADMIN_PASSWORD"] = "secret-token"

from fastapi.testclient import TestClient  # noqa: E402

import idioms_data  # noqa: E402
import yzqj  # noqa: E402
import yzqj_store  # noqa: E402
from main import app  # noqa: E402

HEADERS = {"x-admin-token": "secret-token"}
BROWSER_UA = {"user-agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("YZQJ_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("YZQJ_IDIOMS_PATH", str(tmp_path / "custom_idioms.json"))
    monkeypatch.setenv("USAGE_DIR", str(tmp_path / "usage"))
    yzqj_store.reset_for_tests()
    yzqj.GAMES.clear()
    with TestClient(app) as c:
        yield c
    yzqj_store.reset_for_tests()


def level_of(name: str) -> str:
    return next(i["level"] for i in idioms_data.all_idioms() if i["idiom"] == name)


def small_bank(monkeypatch, levels: list[str]) -> None:
    """換成一個小題庫，每個成語的難度照 levels 排。"""
    bank = [
        {**item, "level": lv}
        for item, lv in zip(idioms_data.IDIOMS, levels)
    ]
    monkeypatch.setattr(idioms_data, "IDIOMS", bank)
    monkeypatch.setattr(idioms_data, "BUILTIN_NAMES", {i["idiom"] for i in bank})


def test_bank_entries_are_valid_and_unique():
    names = [i["idiom"] for i in idioms_data.IDIOMS]
    assert len(names) == len(set(names))
    assert all(i["level"] in idioms_data.LEVELS for i in idioms_data.IDIOMS)
    assert all(i["meaning_source"] in ("moe", "curated") for i in idioms_data.IDIOMS)


def test_pick_questions_only_from_chosen_level(client, monkeypatch):
    small_bank(monkeypatch, ["common"] * 8 + ["advanced"] * 8 + ["hidden"] * 4)
    for _ in range(20):
        assert {q["level"] for q in idioms_data.pick_questions(5, level="common")} == {"common"}
        assert {q["level"] for q in idioms_data.pick_questions(5, level="advanced")} == {"advanced"}
    with pytest.raises(ValueError):
        idioms_data.pick_questions(5, level="hidden")


def test_hidden_never_picked_even_when_pool_is_short(client, monkeypatch):
    # 一般常用只剩 3 個：不夠一輪時用進階補，但「不出題」的永遠不會出現
    small_bank(monkeypatch, ["common"] * 3 + ["advanced"] * 4 + ["hidden"] * 10)
    for _ in range(20):
        questions = idioms_data.pick_questions(5, level="common")
        levels = [q["level"] for q in questions]
        assert len(questions) == 5
        assert levels.count("common") == 3 and "hidden" not in levels


def test_set_level_override_persists_and_resets(client):
    item = idioms_data.IDIOMS[0]
    name, default = item["idiom"], item["level"]
    other = "advanced" if default == "common" else "common"
    levels_file = Path(os.environ["YZQJ_IDIOMS_PATH"]).with_name("idiom_levels.json")

    idioms_data.set_level(name, other)
    assert level_of(name) == other
    assert json.loads(levels_file.read_text(encoding="utf-8")) == {name: other}

    # 改回 idiom_bank.json 的預設值時拿掉那筆調整
    idioms_data.set_level(name, default)
    assert level_of(name) == default
    assert json.loads(levels_file.read_text(encoding="utf-8")) == {}

    with pytest.raises(KeyError):
        idioms_data.set_level("不是成語", "common")
    with pytest.raises(ValueError):
        idioms_data.set_level(name, "easy")


def test_level_api_for_builtin_and_custom(client):
    name = idioms_data.IDIOMS[0]["idiom"]
    url = f"/api/yzqj/idioms/{name}/level"
    assert client.put(url, json={"level": "hidden"}).status_code == 401
    r = client.put(url, json={"level": "hidden"}, headers=HEADERS)
    assert r.status_code == 200 and r.json()["level"] == "hidden"
    listing = client.get("/api/yzqj/idioms", headers=HEADERS).json()
    assert next(i for i in listing["idioms"] if i["idiom"] == name)["level"] == "hidden"
    assert listing["level_counts"]["hidden"] >= 1
    assert client.put(url, json={"level": "easy"}, headers=HEADERS).status_code == 422
    assert client.put("/api/yzqj/idioms/不是成語/level", json={"level": "common"}, headers=HEADERS).status_code == 404

    body = {"idiom": "認真讀書", "wrong": [{"pos": 3, "char": "輸"}], "meaning": "", "level": "advanced"}
    created = client.post("/api/yzqj/idioms", json=body, headers=HEADERS).json()
    assert created["level"] == "advanced" and created["source"] == "custom"
    r = client.put("/api/yzqj/idioms/認真讀書/level", json={"level": "common"}, headers=HEADERS)
    assert r.json()["level"] == "common" and level_of("認真讀書") == "common"


def test_meta_reports_playable_counts(client):
    meta = client.get("/api/yzqj/meta").json()
    counts = idioms_data.level_counts()
    assert meta["level_counts"] == {"common": counts["common"], "advanced": counts["advanced"]}
    assert meta["idiom_count"] == counts["common"] + counts["advanced"]


def test_host_starts_round_with_chosen_level(client):
    # 至少要有一輪份量的進階成語，題庫還沒分級時先調幾個
    for item in idioms_data.IDIOMS[:5]:
        idioms_data.set_level(item["idiom"], "advanced")
    created = client.post("/api/yzqj/games", headers=BROWSER_UA).json()
    code = created["code"]
    client.post(f"/api/yzqj/games/{code}/join", json={"nickname": "小明"}, headers=BROWSER_UA)
    with client.websocket_connect(f"/ws/yzqj/{code}?role=host&token={created['host_token']}") as host:
        first = host.receive_json()
        assert first["type"] == "snapshot" and first["level"] == "common"
        host.send_json({"type": "start", "level": "easy"})
        assert any(m.get("type") == "error" for m in (host.receive_json() for _ in range(3)))
        host.send_json({"type": "start", "level": "advanced"})
        for _ in range(50):
            msg = host.receive_json()
            if msg.get("type") == "snapshot" and msg["status"] == "question":
                break
        assert msg["level"] == "advanced"
        game = yzqj.GAMES[code]
        assert {level_of(q["idiom"]) for q in game.questions} == {"advanced"}
