"""
一字千金 — 整場賽局的冒煙測試

用 FastAPI 的 TestClient 模擬老師與兩位學生：建立賽局 → 加入 → 開始 → 書寫筆跡轉播 →
送出 → 五題跑完 → 排名 → 後台查詢。為了跑得快，把每題時間縮短。

執行：cd backend && python -m pytest tests -q
"""
from __future__ import annotations

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

import yzqj  # noqa: E402
import yzqj_store  # noqa: E402
from main import app  # noqa: E402

# 一張 1x1 的透明 PNG（備援辨識模式不會真的看圖）
TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("YZQJ_DB_PATH", str(tmp_path / "test.sqlite3"))
    yzqj_store.reset_for_tests()
    yzqj.GAMES.clear()
    with TestClient(app) as c:
        yield c
    yzqj_store.reset_for_tests()


def recv_until(ws, predicate, limit=60):
    """一直收訊息直到 predicate 成立，回傳該訊息。"""
    for _ in range(limit):
        msg = ws.receive_json()
        if predicate(msg):
            return msg
    raise AssertionError("沒有收到預期的訊息")


def test_full_game_flow(client):
    # 老師建立賽局
    r = client.post("/api/yzqj/games")
    assert r.status_code == 200
    created = r.json()
    code = created["code"]
    assert len(code) == 3 and created["join_path"] == f"/g/{code}"

    info = client.get(f"/api/yzqj/games/{code.lower()}").json()
    assert info["status"] == "lobby" and info["can_join"] is True

    # 兩位學生加入，IP 要被記錄下來（模擬反向代理的 X-Forwarded-For）
    r1 = client.post(
        f"/api/yzqj/games/{code}/join",
        json={"nickname": "小明"},
        headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "pytest-ua"},
    )
    assert r1.status_code == 200
    p1 = r1.json()
    r2 = client.post(f"/api/yzqj/games/{code}/join", json={"nickname": "小明"})
    p2 = r2.json()
    assert p1["nickname"] == "小明" and p2["nickname"] == "小明2"

    game = yzqj.GAMES[code]
    assert game.players[p1["player_id"]].ip == "203.0.113.7"

    # 錯的老師密鑰要被拒絕
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/yzqj/{code}?role=host&token=wrong") as ws:
            ws.receive_json()

    with client.websocket_connect(f"/ws/yzqj/{code}?role=host&token={created['host_token']}") as host, \
         client.websocket_connect(f"/ws/yzqj/{code}?role=player&player_id={p1['player_id']}") as s1, \
         client.websocket_connect(f"/ws/yzqj/{code}?role=player&player_id={p2['player_id']}") as s2:

        snap = host.receive_json()
        assert snap["type"] == "snapshot" and snap["status"] == "lobby"
        recv_until(s1, lambda m: m["type"] == "snapshot" and m.get("you", {}).get("nickname") == "小明")
        recv_until(s2, lambda m: m["type"] == "snapshot")

        # 開始
        host.send_json({"type": "start"})
        q_snap = recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "question")
        assert q_snap["question"]["index"] == 0
        assert q_snap["question"]["correct_char"]  # 老師看得到答案
        assert q_snap["question"]["remaining_ms"] > 0

        s1_q = recv_until(s1, lambda m: m["type"] == "snapshot" and m["status"] == "question")
        assert "correct_char" not in s1_q["question"]  # 學生看不到答案
        assert len(s1_q["question"]["display"]) == 4
        recv_until(s2, lambda m: m["type"] == "snapshot" and m["status"] == "question")

        # 小明書寫，老師端要收到筆跡實況
        s1.send_json({"type": "stroke", "sid": 1, "pts": [[0.1, 0.1], [0.5, 0.5]], "end": False})
        stroke = recv_until(host, lambda m: m["type"] == "stroke")
        assert stroke["player_id"] == p1["player_id"] and stroke["pts"] == [[0.1, 0.1], [0.5, 0.5]]

        # 小明送出，小明2 不送（等時間到）
        s1.send_json({"type": "submit", "image_data": TINY_PNG, "has_ink": True})
        recv_until(host, lambda m: m["type"] == "snapshot"
                   and any(p["submitted"] for p in m["players"] if p["id"] == p1["player_id"]))

        # 小明2 收到 time_up 後補送空白
        recv_until(s2, lambda m: m["type"] == "time_up")
        s2.send_json({"type": "submit", "image_data": TINY_PNG, "has_ink": False})

        reveal = recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "reveal")
        res = reveal["results"]
        assert res[p1["player_id"]]["is_correct"] is True
        assert res[p2["player_id"]]["is_correct"] is False

        # 剩下四題：小明每題都送，小明2 都不送
        for i in range(1, 5):
            q = recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "question"
                           and m["question"]["index"] == i)
            assert q["question"]["index"] == i
            s1.send_json({"type": "submit", "image_data": TINY_PNG, "has_ink": True})
            recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "reveal"
                       and m["question"]["index"] == i, limit=200)

        final = recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "finished", limit=200)
        board = final["leaderboard"]
        assert [b["nickname"] for b in board] == ["小明", "小明2"]
        assert board[0]["correct_count"] == 5 and board[0]["accuracy"] == 100 and board[0]["rank"] == 1
        assert board[1]["correct_count"] == 0 and board[1]["rank"] == 2

        s1_final = recv_until(s1, lambda m: m["type"] == "snapshot" and m["status"] == "finished", limit=200)
        assert len(s1_final["you"]["answers"]) == 5

    # 後台：沒帶密碼不行，帶了就看得到成績與 IP
    assert client.get("/api/yzqj/admin/games").status_code == 401
    admin = client.get("/api/yzqj/admin/games", headers={"x-admin-token": "secret-token"})
    assert admin.status_code == 200
    games = admin.json()["games"]
    assert games[0]["code"] == code and games[0]["status"] == "finished"
    players = {p["nickname"]: p for p in games[0]["players"]}
    assert players["小明"]["ip"] == "203.0.113.7"
    assert players["小明"]["user_agent"] == "pytest-ua"
    assert players["小明"]["rank"] == 1 and players["小明"]["accuracy"] == 100
    assert len(players["小明"]["answers"]) == 5

    detail = client.get(f"/api/yzqj/admin/games/{code}?token=secret-token").json()
    assert len(detail["questions"]) == 5


def test_join_limits(client):
    code = client.post("/api/yzqj/games").json()["code"]
    for i in range(yzqj.MAX_PLAYERS):
        assert client.post(f"/api/yzqj/games/{code}/join", json={"nickname": f"p{i}"}).status_code == 200
    full = client.post(f"/api/yzqj/games/{code}/join", json={"nickname": "late"})
    assert full.status_code == 409
    assert client.get(f"/api/yzqj/games/{code}").json()["can_join"] is False
    assert client.post("/api/yzqj/games/ZZZ/join", json={"nickname": "x"}).status_code == 404


def test_cannot_join_after_start(client):
    created = client.post("/api/yzqj/games").json()
    code = created["code"]
    client.post(f"/api/yzqj/games/{code}/join", json={"nickname": "a"})
    with client.websocket_connect(f"/ws/yzqj/{code}?role=host&token={created['host_token']}") as host:
        host.receive_json()
        host.send_json({"type": "start"})
        recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "question")
        late = client.post(f"/api/yzqj/games/{code}/join", json={"nickname": "late"})
        assert late.status_code == 409
        # 老師可以手動跳題
        host.send_json({"type": "skip"})
        t0 = time.time()
        recv_until(host, lambda m: m["type"] == "snapshot" and m["status"] == "reveal")
        assert time.time() - t0 < 2.0
