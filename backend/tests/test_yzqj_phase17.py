"""
一字千金 Phase 17：出題不重複、辨識逾時、嚴格判定、成語題庫 API。

執行：cd backend && python -m pytest tests -q
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

os.environ["YZQJ_QUESTION_SECONDS"] = "1.0"
os.environ["YZQJ_REVEAL_SECONDS"] = "0.2"
os.environ["YZQJ_GRACE_SECONDS"] = "0.5"
os.environ["YZQJ_ADMIN_TOKEN"] = "secret-token"

from fastapi.testclient import TestClient  # noqa: E402

import idioms_data  # noqa: E402
import yzqj  # noqa: E402
import yzqj_store  # noqa: E402
from main import app  # noqa: E402
from recognition import RecognitionResult, StrictVerdict, decide_strict  # noqa: E402

TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
HEADERS = {"x-admin-token": "secret-token"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("YZQJ_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("YZQJ_IDIOMS_PATH", str(tmp_path / "custom_idioms.json"))
    yzqj_store.reset_for_tests()
    yzqj.GAMES.clear()
    with TestClient(app) as c:
        yield c
    yzqj_store.reset_for_tests()


def recv_until(ws, predicate, limit=200):
    for _ in range(limit):
        msg = ws.receive_json()
        if predicate(msg):
            return msg
    raise AssertionError("沒有收到預期的訊息")


# ----- 出題不重複 -----------------------------------------------------------


def test_pick_questions_avoids_recent_and_never_repeats_hard_exclusion():
    recent = {i["idiom"] for i in idioms_data.IDIOMS[:100]}
    chosen = {q["idiom"] for q in idioms_data.pick_questions(5, exclude=recent)}
    assert chosen.isdisjoint(recent)

    # 軟排除塞滿整個題庫時，仍要出得了題（回頭用舊的）
    everything = {i["idiom"] for i in idioms_data.IDIOMS}
    assert len(idioms_data.pick_questions(5, exclude=everything)) == 5

    # 硬排除（這一場出過的）就算題庫不夠也絕不重複
    hard = {i["idiom"] for i in idioms_data.IDIOMS[:140]}
    chosen = [q["idiom"] for q in idioms_data.pick_questions(5, exclude=everything, must_exclude=hard)]
    assert set(chosen).isdisjoint(hard) and len(chosen) == 2


def test_rounds_do_not_repeat_within_game_and_recent_games(client):
    seen: list[set[str]] = []
    for _ in range(3):
        code = client.post("/api/yzqj/games").json()["code"]
        game = yzqj.GAMES[code]
        game.round += 1
        seen.append({q["idiom"] for q in game.pick_round_questions()})
    # 三場各五題，彼此都不重複（最近 6 輪 = 30 個成語都會被避開）
    assert len(seen[0] | seen[1] | seen[2]) == 15
    assert set(yzqj_store.recent_idioms(5)) == seen[2]
    assert set(yzqj_store.recent_idioms(15)) == seen[0] | seen[1] | seen[2]


def test_same_game_second_round_never_repeats(client):
    code = client.post("/api/yzqj/games").json()["code"]
    game = yzqj.GAMES[code]
    game.round = 1
    first = {q["idiom"] for q in game.pick_round_questions()}
    game.round = 2
    second = {q["idiom"] for q in game.pick_round_questions()}
    assert first.isdisjoint(second)
    assert game.used_idioms == first | second


# ----- 辨識逾時 -------------------------------------------------------------


def test_recognition_timeout_marks_wrong(client, monkeypatch):
    monkeypatch.setenv("YZQJ_RECOGNIZE_TIMEOUT", "0.3")

    def slow(*args, **kwargs):
        time.sleep(2.0)
        return RecognitionResult("鳴", True, 0.9, "gemini")

    monkeypatch.setattr(yzqj, "recognize_character", slow)

    created = client.post("/api/yzqj/games").json()
    code = created["code"]
    p1 = client.post(f"/api/yzqj/games/{code}/join", json={"nickname": "甲"}).json()
    with client.websocket_connect(f"/ws/yzqj/{code}?role=host&token={created['host_token']}") as host, \
         client.websocket_connect(f"/ws/yzqj/{code}?role=player&player_id={p1['player_id']}") as s1:
        host.receive_json()
        host.send_json({"type": "start"})
        recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "question")
        s1.send_json({"type": "submit", "image_data": TINY_PNG, "has_ink": True})
        t0 = time.time()
        reveal = recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "reveal")
        res = reveal["results"][p1["player_id"]]
        assert res["is_correct"] is False and res["timed_out"] is True and res["engine"] == "timeout"
        assert time.time() - t0 < 1.9  # 沒有等那個 2 秒的辨識跑完
        yzqj.GAMES[code].close()


# ----- 嚴格判定 -------------------------------------------------------------


def test_decide_strict_requires_all_three_signals():
    assert decide_strict(StrictVerdict("鳴", "鳴", True), "鳴") is True
    assert decide_strict(StrictVerdict("鳴", "嗚", True), "鳴") is False   # 最接近的是錯字
    assert decide_strict(StrictVerdict("嗚", "鳴", True), "鳴") is False   # 自由辨識認成錯字
    assert decide_strict(StrictVerdict("鳴", "鳴", False), "鳴") is False  # 潦草、不清楚
    assert decide_strict(StrictVerdict("？", "？", False), "鳴") is False


def test_distractors_include_question_wrong_char_and_similar_chars():
    q = {"correct_char": "鳴", "wrong_char": "嗚"}
    d = idioms_data.distractors_for(q)
    assert d[0] == "嗚" and "鳴" not in d and len(d) <= 5


# ----- 成語題庫 API ---------------------------------------------------------


def test_idiom_api_list_add_validate_delete(client):
    before = client.get("/api/yzqj/idioms").json()
    assert before["builtin_count"] == len(idioms_data.IDIOMS) and before["custom_count"] == 0
    assert before["auth_required"] is True

    builtin = {i["idiom"] for i in idioms_data.IDIOMS}
    candidates = [("鵬程萬里", 3, "裡"), ("聞雞起舞", 3, "武"), ("水滴石穿", 3, "川"), ("守望相助", 3, "住")]
    fresh = [c for c in candidates if c[0] not in builtin]
    assert len(fresh) >= 2, "候選成語都在內建清單裡，請換幾個"
    (new_idiom, pos, wrong_char), (other, other_pos, other_wrong) = fresh[0], fresh[1]

    body = {"idiom": new_idiom, "wrong": [{"pos": pos, "char": wrong_char}], "meaning": "測試用的解釋。"}
    assert client.post("/api/yzqj/idioms", json=body).status_code == 401  # 沒帶密碼
    r = client.post("/api/yzqj/idioms", json=body, headers=HEADERS)
    assert r.status_code == 201, r.json()
    assert r.json()["source"] == "custom"

    after = client.get("/api/yzqj/idioms").json()
    assert after["custom_count"] == 1 and after["idioms"][-1]["idiom"] == new_idiom
    assert client.get("/api/yzqj/meta").json()["idiom_count"] == len(idioms_data.IDIOMS) + 1

    # 存進 JSON 檔，而且會被出題抽到
    saved = json.loads(Path(os.environ["YZQJ_IDIOMS_PATH"]).read_text(encoding="utf-8"))
    assert saved == [{"idiom": new_idiom, "wrong": [[pos, wrong_char]], "meaning": body["meaning"]}]
    assert new_idiom in {i["idiom"] for i in idioms_data.all_idioms()}

    # 驗證訊息
    some_builtin = idioms_data.IDIOMS[0]
    bad = [
        ({"idiom": other[:3], "wrong": [{"pos": 0, "char": "話"}]}, "四個字"),
        ({"idiom": new_idiom, "wrong": [{"pos": pos, "char": wrong_char}]}, "已經在題庫"),
        ({"idiom": some_builtin["idiom"], "wrong": [{"pos": 1, "char": "嗚"}]}, "已經在題庫"),
        ({"idiom": other, "wrong": []}, "至少要給一組錯字"),
        ({"idiom": other, "wrong": [{"pos": 4, "char": other_wrong}]}, "位置"),
        ({"idiom": other, "wrong": [{"pos": other_pos, "char": other[other_pos]}]}, "相同"),
        ({"idiom": other, "wrong": [{"pos": other_pos, "char": other[0]}]}, "已經出現在成語裡"),
    ]
    for payload, fragment in bad:
        r = client.post("/api/yzqj/idioms", json=payload, headers=HEADERS)
        assert r.status_code == 422, payload
        assert fragment in r.json()["detail"], (payload, r.json())

    # 內建不能刪、自訂可以刪
    assert client.delete(f"/api/yzqj/idioms/{some_builtin['idiom']}", headers=HEADERS).status_code == 400
    assert client.delete(f"/api/yzqj/idioms/{new_idiom}", headers=HEADERS).status_code == 204
    assert client.delete(f"/api/yzqj/idioms/{new_idiom}", headers=HEADERS).status_code == 404
    assert client.get("/api/yzqj/idioms").json()["custom_count"] == 0


def test_admin_recognize_endpoint_fallback(client):
    r = client.post(
        "/api/yzqj/admin/recognize",
        json={"image_data": TINY_PNG, "expected_char": "鳴"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["engine"] == "fallback" and body["is_correct"] is True
    assert "嗚" in body["distractors"]
