"""
管理介面登入、每日額度、bot 攔截、使用量統計。

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

os.environ["ADMIN_PASSWORD"] = "secret-token"
os.environ["ADMIN_EMAIL"] = "matt.jiang@gmail.com"
os.environ["YZQJ_QUESTION_SECONDS"] = "1.0"
os.environ["YZQJ_REVEAL_SECONDS"] = "0.2"
os.environ["YZQJ_GRACE_SECONDS"] = "0.5"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import usage  # noqa: E402
import yzqj  # noqa: E402
import yzqj_store  # noqa: E402
from main import app  # noqa: E402

TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
BROWSER_UA = {"user-agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("YZQJ_DB_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("YZQJ_IDIOMS_PATH", str(tmp_path / "custom_idioms.json"))
    monkeypatch.setenv("USAGE_DIR", str(tmp_path / "usage"))
    usage.STORE.reset_for_tests()
    yzqj_store.reset_for_tests()
    yzqj.GAMES.clear()
    main._login_failures.clear()
    # 辨識不要真的打外部服務
    monkeypatch.setattr(main, "_recognize_with_gemini", lambda image, thinking_level=None: ("鳴", 0.9))
    with TestClient(app) as c:
        c.headers.update(BROWSER_UA)
        yield c
    usage.STORE.reset_for_tests()
    yzqj_store.reset_for_tests()


def recognize(client, expected="鳴"):
    return client.post("/api/recognize", json={"image_data": TINY_PNG, "expected_char": expected})


# ----- 登入 -----------------------------------------------------------------


def test_admin_login_flow(client):
    assert client.get("/api/admin/me").status_code == 401
    assert client.get("/api/yzqj/idioms").status_code == 401
    assert client.get("/api/admin/usage").status_code == 401
    assert client.get("/api/admin/vocab").status_code == 401

    bad = client.post("/api/admin/login", json={"email": "matt.jiang@gmail.com", "password": "nope"})
    assert bad.status_code == 401

    ok = client.post("/api/admin/login", json={"email": "Matt.Jiang@gmail.com", "password": "secret-token"})
    assert ok.status_code == 200 and ok.json()["email"] == "matt.jiang@gmail.com"
    assert "rw_admin" in client.cookies

    assert client.get("/api/admin/me").json()["email"] == "matt.jiang@gmail.com"
    assert client.get("/api/yzqj/idioms").status_code == 200
    vocab = client.get("/api/admin/vocab?grade_id=4_kangxuan").json()
    assert vocab["lessons"] and vocab["lessons"][0]["characters"][0]["char"]

    assert client.post("/api/admin/logout").status_code == 200
    assert client.get("/api/admin/me").status_code == 401


def test_login_lockout_after_repeated_failures(client):
    for _ in range(main.LOGIN_MAX_FAILURES):
        assert client.post("/api/admin/login", json={"email": "matt.jiang@gmail.com", "password": "x"}).status_code == 401
    r = client.post("/api/admin/login", json={"email": "matt.jiang@gmail.com", "password": "secret-token"})
    assert r.status_code == 429


def test_admin_requires_password_configured(client, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "")
    r = client.post("/api/admin/login", json={"email": "matt.jiang@gmail.com", "password": ""})
    assert r.status_code == 401
    assert client.get("/api/yzqj/admin/games?token=").status_code == 401


# ----- 改錯字神器的每日額度 ---------------------------------------------------


def test_rightwrite_daily_quota(client, monkeypatch):
    monkeypatch.setenv("RW_DAILY_LIMIT", "2")
    r1 = recognize(client)
    assert r1.status_code == 200 and r1.json()["recognized_char"] == "鳴"
    assert "rw_sid" in client.cookies  # 第一次呼叫就拿到 session
    assert recognize(client).status_code == 200
    r3 = recognize(client)
    assert r3.status_code == 429
    assert r3.json()["detail"] == usage.QUOTA_MESSAGE

    stats = usage.STORE.stats(1)["today"]
    assert stats["rw_recognitions"] == 2 and stats["quota_hits"] == 1 and stats["rw_sessions"] == 1


def test_bot_user_agent_is_blocked(client):
    r = client.post(
        "/api/recognize",
        json={"image_data": TINY_PNG, "expected_char": "鳴"},
        headers={"user-agent": "python-requests/2.32"},
    )
    assert r.status_code == 403
    assert usage.STORE.stats(1)["today"]["bot_blocked"] == 1


def test_sessions_per_ip_are_capped(client, monkeypatch):
    monkeypatch.setenv("SESSION_CREATE_LIMIT_PER_IP", "1")
    assert recognize(client).status_code == 200
    # 換一個沒有 cookie 的瀏覽器（同一個 IP）
    client.cookies.clear()
    r = recognize(client)
    assert r.status_code == 429 and r.json()["detail"] == usage.QUOTA_MESSAGE
    assert usage.STORE.stats(1)["today"]["session_limit_blocked"] == 1


# ----- 一字千金的每日額度 ----------------------------------------------------


def test_yzqj_join_blocked_when_quota_exhausted(client, monkeypatch):
    monkeypatch.setenv("YZ_DAILY_LIMIT", "0")
    code = client.post("/api/yzqj/games").json()["code"]
    r = client.post(f"/api/yzqj/games/{code}/join", json={"nickname": "小明"})
    assert r.status_code == 429 and r.json()["detail"] == usage.QUOTA_MESSAGE


def test_yzqj_grading_counts_quota_per_session(client, monkeypatch):
    monkeypatch.setenv("YZ_DAILY_LIMIT", "1")
    created = client.post("/api/yzqj/games").json()
    code = created["code"]
    p1 = client.post(f"/api/yzqj/games/{code}/join", json={"nickname": "小明"}).json()
    sid = yzqj.GAMES[code].players[p1["player_id"]].session_id
    assert sid

    with client.websocket_connect(f"/ws/yzqj/{code}?role=host&token={created['host_token']}") as host, \
         client.websocket_connect(f"/ws/yzqj/{code}?role=player&player_id={p1['player_id']}") as s1:
        host.receive_json()
        host.send_json({"type": "start"})

        def until(ws, pred, limit=200):
            for _ in range(limit):
                m = ws.receive_json()
                if pred(m):
                    return m
            raise AssertionError("沒收到")

        # 第 1 題：有額度，備援模式判對
        until(host, lambda m: m["type"] == "snapshot" and m["status"] == "question" and m["question"]["index"] == 0)
        s1.send_json({"type": "submit", "image_data": TINY_PNG, "has_ink": True})
        reveal = until(host, lambda m: m["type"] == "snapshot" and m["status"] == "reveal" and m["question"]["index"] == 0)
        assert reveal["results"][p1["player_id"]]["is_correct"] is True
        # 第 2 題：額度用完，算錯並標示
        until(host, lambda m: m["type"] == "snapshot" and m["status"] == "question" and m["question"]["index"] == 1)
        s1.send_json({"type": "submit", "image_data": TINY_PNG, "has_ink": True})
        reveal2 = until(host, lambda m: m["type"] == "snapshot" and m["status"] == "reveal" and m["question"]["index"] == 1)
        res = reveal2["results"][p1["player_id"]]
        assert res["is_correct"] is False and res["quota_exceeded"] is True and res["engine"] == "quota"
        yzqj.GAMES[code].close()

    assert usage.STORE.used("yz", sid) == 1


# ----- 統計與落檔 -------------------------------------------------------------


def test_usage_stats_endpoint_and_flush(client, tmp_path):
    recognize(client)
    client.post("/api/admin/login", json={"email": "matt.jiang@gmail.com", "password": "secret-token"})
    body = client.get("/api/admin/usage?days=7").json()
    assert len(body["days"]) == 7
    assert body["today"]["rw_recognitions"] == 1
    assert body["today"]["top_sessions"][0]["rw"] == 1
    assert body["limits"]["rw"] == usage.rw_daily_limit()

    written = usage.STORE.flush()
    assert written == 1
    files = list((tmp_path / "usage").glob("*.json"))
    assert len(files) == 1
    saved = json.loads(files[0].read_text(encoding="utf-8"))
    assert saved["rw_recognitions"] == 1 and len(saved["sessions"]) == 1

    # 重新載入後數字還在（模擬實例重啟）
    usage.STORE.reset_for_tests()
    assert usage.STORE.stats(1)["today"]["rw_recognitions"] == 1
