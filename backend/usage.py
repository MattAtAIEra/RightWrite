"""
使用量與防濫用。

三件事：
1. 瀏覽器 session：每個瀏覽器拿一個簽章過的 cookie（rw_sid）。會花錢的 API 一定要帶它；
   沒有就當場發一個，但同一個 IP 一天最多只能開 SESSION_CREATE_LIMIT_PER_IP 個，擋掉狂換 cookie 的腳本。
2. 每日額度：改錯字神器每個 session 一天最多 RW_DAILY_LIMIT 次辨識（預設 60），
   一字千金每個 session 一天最多 YZ_DAILY_LIMIT 次（預設 50）。超過回 429 與固定訊息。
3. 每日統計：辨識次數、session 數、額度擋下次數、bot 擋下次數，存成 USAGE_DIR/<日期>.json，
   線上 USAGE_DIR 掛在 Cloud Storage volume，實例重啟不會歸零。管理介面的儀錶板讀這些檔。

日期以台北時間計。bot 判斷只看 User-Agent 裡的常見爬蟲與工具字樣，擋得住順手的腳本，擋不住刻意偽裝的；
真正的上限是「每 session 每日額度 × 每 IP 每日 session 數」。
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import HTTPException, Request, Response

import auth

logger = logging.getLogger(__name__)

TAIPEI = timezone(timedelta(hours=8))
SESSION_COOKIE = "rw_sid"
SESSION_MAX_AGE = 365 * 24 * 3600
QUOTA_MESSAGE = "今日使用已經達到免費額度的上限"
NO_SESSION_MESSAGE = "請從網頁使用這個功能"
BOT_MESSAGE = "偵測到自動化程式，已拒絕"

Kind = Literal["rw", "yz"]

BOT_UA = re.compile(
    r"bot|crawl|spider|slurp|curl/|wget/|python-requests|python-urllib|httpx/|aiohttp|scrapy|"
    r"go-http-client|java/|libwww|okhttp|phantomjs|headlesschrome",
    re.IGNORECASE,
)


def usage_dir() -> Path:
    return Path(os.environ.get("USAGE_DIR", str(Path(__file__).parent / "data" / "usage")))


def rw_daily_limit() -> int:
    return int(os.environ.get("RW_DAILY_LIMIT", "60"))


def yz_daily_limit() -> int:
    return int(os.environ.get("YZ_DAILY_LIMIT", "50"))


def session_create_limit_per_ip() -> int:
    return int(os.environ.get("SESSION_CREATE_LIMIT_PER_IP", "100"))


def today() -> str:
    return datetime.now(TAIPEI).strftime("%Y-%m-%d")


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else ""


# ---------------------------------------------------------------------------
# 每日統計的儲存
# ---------------------------------------------------------------------------


def _empty_day(day: str) -> dict:
    return {
        "day": day,
        "rw_recognitions": 0,
        "yz_recognitions": 0,
        "quota_hits": 0,
        "bot_blocked": 0,
        "session_limit_blocked": 0,
        "sessions": {},      # sid -> {"rw": n, "yz": n, "ip": str, "first": iso}
        "ip_sessions": {},   # ip -> 今天從這個 IP 新開的 session 數
    }


class UsageStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._days: dict[str, dict] = {}
        self._dirty: set[str] = set()

    # ----- 讀寫檔 -----

    def _path(self, day: str) -> Path:
        return usage_dir() / f"{day}.json"

    def _day(self, day: str | None = None) -> dict:
        day = day or today()
        with self._lock:
            if day not in self._days:
                data = _empty_day(day)
                path = self._path(day)
                if path.exists():
                    try:
                        loaded = json.loads(path.read_text(encoding="utf-8"))
                        if isinstance(loaded, dict):
                            data.update({k: v for k, v in loaded.items() if k in data})
                    except (OSError, json.JSONDecodeError) as exc:
                        logger.warning("usage file %s unreadable: %s", path, exc)
                self._days[day] = data
            return self._days[day]

    def flush(self) -> int:
        """把改過的天寫回檔案（tmp + replace）。回傳寫了幾天。"""
        with self._lock:
            dirty = list(self._dirty)
            self._dirty.clear()
            snapshots = {d: json.dumps(self._days[d], ensure_ascii=False) for d in dirty if d in self._days}
        written = 0
        for day, text in snapshots.items():
            path = self._path(day)
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp = path.with_suffix(".json.tmp")
                tmp.write_text(text, encoding="utf-8")
                os.replace(tmp, path)
                written += 1
            except OSError as exc:
                logger.warning("usage flush failed for %s: %s", day, exc)
                with self._lock:
                    self._dirty.add(day)
        return written

    def reset_for_tests(self) -> None:
        with self._lock:
            self._days.clear()
            self._dirty.clear()

    # ----- 計數 -----

    def _touch_session(self, data: dict, sid: str, ip: str) -> dict:
        entry = data["sessions"].get(sid)
        if entry is None:
            entry = {"rw": 0, "yz": 0, "ip": ip, "first": datetime.now(TAIPEI).isoformat(timespec="seconds")}
            data["sessions"][sid] = entry
        return entry

    def used(self, kind: Kind, sid: str) -> int:
        with self._lock:
            entry = self._day()["sessions"].get(sid)
            return int(entry[kind]) if entry else 0

    def limit(self, kind: Kind) -> int:
        return rw_daily_limit() if kind == "rw" else yz_daily_limit()

    def remaining(self, kind: Kind, sid: str) -> int:
        return max(0, self.limit(kind) - self.used(kind, sid))

    def try_consume(self, kind: Kind, sid: str, ip: str) -> bool:
        """還有額度就記一次並回 True；沒有就記一次 quota_hit 並回 False。"""
        with self._lock:
            data = self._day()
            entry = self._touch_session(data, sid, ip)
            if entry[kind] >= self.limit(kind):
                data["quota_hits"] += 1
                self._dirty.add(data["day"])
                return False
            entry[kind] += 1
            data[f"{kind}_recognitions"] += 1
            self._dirty.add(data["day"])
            return True

    def register_session(self, ip: str) -> bool:
        """同一個 IP 今天新開的 session 超過上限就回 False。"""
        with self._lock:
            data = self._day()
            n = int(data["ip_sessions"].get(ip, 0))
            if n >= session_create_limit_per_ip():
                data["session_limit_blocked"] += 1
                self._dirty.add(data["day"])
                return False
            data["ip_sessions"][ip] = n + 1
            self._dirty.add(data["day"])
            return True

    def bump(self, counter: str) -> None:
        with self._lock:
            data = self._day()
            data[counter] = int(data.get(counter, 0)) + 1
            self._dirty.add(data["day"])

    # ----- 給儀錶板 -----

    def stats(self, days: int = 30) -> dict:
        now = datetime.now(TAIPEI)
        series = []
        for i in range(days - 1, -1, -1):
            day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
            data = self._day(day)
            sessions = data["sessions"]
            series.append({
                "day": day,
                "rw_recognitions": data["rw_recognitions"],
                "yz_recognitions": data["yz_recognitions"],
                "rw_sessions": sum(1 for s in sessions.values() if s.get("rw", 0) > 0),
                "yz_sessions": sum(1 for s in sessions.values() if s.get("yz", 0) > 0),
                "quota_hits": data["quota_hits"],
                "bot_blocked": data["bot_blocked"],
                "session_limit_blocked": data["session_limit_blocked"],
            })
        today_data = self._day()
        top = sorted(
            (
                {"sid": sid[:8], "ip": s.get("ip", ""), "rw": s.get("rw", 0), "yz": s.get("yz", 0), "first": s.get("first", "")}
                for sid, s in today_data["sessions"].items()
            ),
            key=lambda s: -(s["rw"] + s["yz"]),
        )[:20]
        return {
            "days": series,
            "today": {**series[-1], "top_sessions": top},
            "limits": {"rw": rw_daily_limit(), "yz": yz_daily_limit(), "sessions_per_ip": session_create_limit_per_ip()},
            "totals": {
                "rw_recognitions": sum(d["rw_recognitions"] for d in series),
                "yz_recognitions": sum(d["yz_recognitions"] for d in series),
                "quota_hits": sum(d["quota_hits"] for d in series),
                "bot_blocked": sum(d["bot_blocked"] for d in series),
            },
        }


STORE = UsageStore()


def start_flusher(interval_seconds: float = 5.0) -> threading.Thread:
    """背景每幾秒把改過的統計寫回檔案；daemon thread，程序結束時再 flush 一次。"""
    def loop() -> None:
        import time
        while True:
            time.sleep(interval_seconds)
            try:
                STORE.flush()
            except Exception as exc:  # pragma: no cover
                logger.warning("usage flusher error: %s", exc)
    t = threading.Thread(target=loop, name="usage-flusher", daemon=True)
    t.start()
    return t


# ---------------------------------------------------------------------------
# 瀏覽器 session cookie
# ---------------------------------------------------------------------------


def _sign_sid(sid: str) -> str:
    sig = hmac.new(auth.signing_key(), sid.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{sid}.{sig}"


def parse_session(request: Request) -> str | None:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw or "." not in raw:
        return None
    sid, sig = raw.rsplit(".", 1)
    expected = hmac.new(auth.signing_key(), sid.encode(), hashlib.sha256).hexdigest()[:16]
    if not hmac.compare_digest(sig, expected):
        return None
    return sid


def set_session_cookie(request: Request, response: Response, sid: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        _sign_sid(sid),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=auth.request_is_https(request),
        samesite="lax",
        path="/",
    )


def is_bot(request: Request) -> bool:
    ua = request.headers.get("user-agent", "")
    return not ua or bool(BOT_UA.search(ua))


def ensure_session(request: Request, response: Response) -> str:
    """
    會花錢的端點用的 dependency：拒絕 bot、確保有 session。
    沒有 session 就發一個（受每 IP 每日新 session 上限約束）。
    """
    if is_bot(request):
        STORE.bump("bot_blocked")
        raise HTTPException(status_code=403, detail=BOT_MESSAGE)
    sid = parse_session(request)
    if sid:
        return sid
    ip = client_ip(request)
    if not STORE.register_session(ip):
        raise HTTPException(status_code=429, detail=QUOTA_MESSAGE)
    sid = secrets.token_hex(16)
    set_session_cookie(request, response, sid)
    return sid


def consume_or_429(kind: Kind, sid: str, request: Request) -> None:
    if not STORE.try_consume(kind, sid, client_ip(request)):
        raise HTTPException(status_code=429, detail=QUOTA_MESSAGE)
