"""
一字千金 — 多人即時成語改錯競賽

流程：
1. 老師 POST /api/yzqj/games 建立賽局，拿到三碼代碼與 host_token，前端據此產生 QR Code。
2. 學生掃碼進入 /g/{code}，POST .../join 輸入暱稱加入（最多 10 人），伺服器記錄 IP。
3. 雙方用 WebSocket /ws/yzqj/{code} 連線。老師按「開始」後，伺服器依序出 5 題，
   每題倒數 20 秒；學生在九宮格書寫時，筆跡會即時轉送到老師的監看畫面。
4. 時間到（或全部送出）後統一辨識、公布答案，接著下一題；五題結束算出正確率與排名，
   並寫入 SQLite 供後台查詢。

所有賽局狀態都放在記憶體裡（單一程序），因此部署時 Cloud Run 要限制為單一實例。
"""
from __future__ import annotations

import asyncio
import os
import re
import secrets
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

import yzqj_store as store
from idioms_data import IDIOMS, pick_questions
from recognition import recognize_character

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

MAX_PLAYERS = 10
QUESTIONS_PER_ROUND = 5
GRACE_SECONDS = 2.5          # 時間到之後，等學生端把畫面送上來的緩衝時間
GAME_TTL_SECONDS = 3 * 3600  # 閒置多久後從記憶體清掉
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # 去掉容易看錯的 I L O 0 1


def question_seconds() -> float:
    return float(os.environ.get("YZQJ_QUESTION_SECONDS", "20"))


def reveal_seconds() -> float:
    return float(os.environ.get("YZQJ_REVEAL_SECONDS", "5"))


def grace_seconds() -> float:
    return float(os.environ.get("YZQJ_GRACE_SECONDS", str(GRACE_SECONDS)))


def client_ip(headers: Any, client: Any) -> str:
    """Cloud Run / 反向代理後面要看 X-Forwarded-For 的第一個位址。"""
    forwarded = headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return client.host if client else ""


# ---------------------------------------------------------------------------
# 資料結構
# ---------------------------------------------------------------------------


@dataclass
class Player:
    id: str
    nickname: str
    ip: str
    user_agent: str
    joined_at: float
    socket: WebSocket | None = None
    answers: list[dict] = field(default_factory=list)

    @property
    def connected(self) -> bool:
        return self.socket is not None

    @property
    def correct_count(self) -> int:
        return sum(1 for a in self.answers if a["is_correct"])

    @property
    def total_ms(self) -> int:
        return sum(a["answer_ms"] for a in self.answers)


@dataclass
class Submission:
    image_data: str
    has_ink: bool
    submitted_at: float


class Game:
    def __init__(self, code: str, host_token: str, host_ip: str):
        self.code = code
        self.host_token = host_token
        self.host_ip = host_ip
        self.created_at = time.time()
        self.started_at: float | None = None
        self.finished_at: float | None = None
        self.status = "lobby"  # lobby | question | reveal | finished
        self.round = 0
        self.players: dict[str, Player] = {}
        self.host_sockets: set[WebSocket] = set()
        self.questions: list[dict] = []
        self.current = -1
        self.question_started_at: float | None = None
        self.deadline: float | None = None
        self.submissions: dict[str, Submission] = {}
        self.results: dict[str, dict] = {}
        self.last_activity = time.time()
        self._wake = asyncio.Event()
        self._skip = False
        self._task: asyncio.Task | None = None

    # ----- 玩家管理 -------------------------------------------------------

    def touch(self) -> None:
        self.last_activity = time.time()

    @property
    def can_join(self) -> bool:
        return self.status in ("lobby", "finished") and len(self.players) < MAX_PLAYERS

    def unique_nickname(self, raw: str) -> str:
        name = re.sub(r"[\x00-\x1f\x7f]", "", raw).strip()[:10]
        if not name:
            name = f"玩家{len(self.players) + 1}"
        taken = {p.nickname for p in self.players.values()}
        candidate = name
        n = 2
        while candidate in taken:
            candidate = f"{name}{n}"
            n += 1
        return candidate

    def add_player(self, nickname: str, ip: str, user_agent: str) -> Player:
        if not self.can_join:
            raise HTTPException(status_code=409, detail="賽局已開始或人數已滿")
        player = Player(
            id=uuid.uuid4().hex,
            nickname=self.unique_nickname(nickname),
            ip=ip,
            user_agent=user_agent[:300],
            joined_at=time.time(),
        )
        self.players[player.id] = player
        self.touch()
        store.save_game(self.to_record())
        return player

    # ----- 賽局流程 -------------------------------------------------------

    def start(self) -> None:
        if self.status not in ("lobby", "finished"):
            raise ValueError("賽局正在進行中")
        if not self.players:
            raise ValueError("還沒有人加入")
        self.round += 1
        for p in self.players.values():
            p.answers = []
        self.questions = pick_questions(QUESTIONS_PER_ROUND)
        self.started_at = time.time()
        self.finished_at = None
        self.current = -1
        self.results = {}
        self.submissions = {}
        self.touch()
        self._task = asyncio.create_task(self._run_round())

    def skip(self) -> None:
        """老師手動跳到下一題：結束目前這題的等待。"""
        if self.status == "question":
            self._skip = True
            self._wake.set()

    def _connected_players(self) -> list[Player]:
        return [p for p in self.players.values() if p.connected]

    def _everyone_submitted(self) -> bool:
        connected = self._connected_players()
        return bool(connected) and all(p.id in self.submissions for p in connected)

    async def _wait_until(self, deadline: float) -> None:
        while not self._everyone_submitted() and not self._skip:
            remaining = deadline - time.time()
            if remaining <= 0:
                return
            try:
                await asyncio.wait_for(self._wake.wait(), remaining)
            except asyncio.TimeoutError:
                return
            self._wake.clear()

    async def _run_round(self) -> None:
        try:
            for i in range(len(self.questions)):
                await self._run_question(i)
            await self._finish()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # pragma: no cover - 防止背景任務默默死掉
            print(f"[yzqj] game {self.code} crashed: {exc!r}")
            self.status = "finished"
            self.finished_at = time.time()
            await self.broadcast()

    async def _run_question(self, index: int) -> None:
        self.current = index
        self.status = "question"
        self.submissions = {}
        self.results = {}
        self._skip = False
        self._wake.clear()
        self.question_started_at = time.time()
        self.deadline = self.question_started_at + question_seconds()
        await self.send_hosts({"type": "question_start", "index": index})
        await self.broadcast()

        await self._wait_until(self.deadline)

        if not self._everyone_submitted():
            # 時間到：通知學生端把目前畫面送上來
            self._skip = False
            self._wake.clear()
            await self.send_players({"type": "time_up", "index": index})
            await self._wait_until(time.time() + grace_seconds())

        await self._grade_current()
        self.status = "reveal"
        self.touch()
        store.save_game(self.to_record())
        await self.broadcast()
        await asyncio.sleep(reveal_seconds())

    async def _grade_current(self) -> None:
        q = self.questions[self.current]
        started = self.question_started_at or time.time()
        limit_ms = int(question_seconds() * 1000)

        async def grade(player: Player) -> tuple[str, dict]:
            sub = self.submissions.get(player.id)
            if sub is None:
                return player.id, {
                    "is_correct": False,
                    "recognized": "",
                    "answer_ms": limit_ms,
                    "engine": "none",
                    "submitted": False,
                }
            rec = await asyncio.to_thread(
                recognize_character, sub.image_data, q["correct_char"], sub.has_ink
            )
            answer_ms = max(0, min(limit_ms, int((sub.submitted_at - started) * 1000)))
            return player.id, {
                "is_correct": rec.is_correct,
                "recognized": rec.recognized_char,
                "answer_ms": answer_ms,
                "engine": rec.engine,
                "submitted": True,
            }

        graded = await asyncio.gather(*(grade(p) for p in self.players.values()))
        self.results = dict(graded)
        for pid, res in self.results.items():
            self.players[pid].answers.append({
                "index": self.current,
                "idiom": q["idiom"],
                "display": q["display"],
                "wrong_char": q["wrong_char"],
                "correct_char": q["correct_char"],
                **res,
            })

    async def _finish(self) -> None:
        self.status = "finished"
        self.finished_at = time.time()
        self.touch()
        store.save_game(self.to_record())
        await self.broadcast()

    def submit(self, player_id: str, image_data: str, has_ink: bool) -> bool:
        if self.status != "question" or player_id not in self.players:
            return False
        if player_id in self.submissions:
            return False
        self.submissions[player_id] = Submission(
            image_data=image_data, has_ink=has_ink, submitted_at=time.time()
        )
        self.touch()
        self._wake.set()
        return True

    # ----- 排名 -----------------------------------------------------------

    def leaderboard(self) -> list[dict]:
        total = len(self.questions)
        ordered = sorted(
            self.players.values(),
            key=lambda p: (-p.correct_count, p.total_ms, p.joined_at),
        )
        board: list[dict] = []
        rank = 0
        prev_key = None
        for i, p in enumerate(ordered):
            key = (p.correct_count, p.total_ms)
            if key != prev_key:
                rank = i + 1
                prev_key = key
            board.append({
                "player_id": p.id,
                "nickname": p.nickname,
                "correct_count": p.correct_count,
                "total_questions": total,
                "accuracy": round(p.correct_count / total * 100) if total else 0,
                "total_ms": p.total_ms,
                "rank": rank,
            })
        return board

    # ----- 序列化 ---------------------------------------------------------

    def _question_view(self, role: str) -> dict | None:
        if self.current < 0 or not self.questions:
            return None
        q = self.questions[self.current]
        now = time.time()
        remaining = 0
        if self.status == "question" and self.deadline:
            remaining = max(0, int((self.deadline - now) * 1000))
        view = {
            "index": self.current,
            "total": len(self.questions),
            "display": q["display"],
            "remaining_ms": remaining,
            "seconds": question_seconds(),
        }
        if role == "host" or self.status in ("reveal", "finished"):
            view.update({
                "idiom": q["idiom"],
                "wrong_index": q["wrong_index"],
                "wrong_char": q["wrong_char"],
                "correct_char": q["correct_char"],
                "meaning": q["meaning"],
            })
        return view

    def snapshot(self, role: str, player_id: str | None = None) -> dict:
        players = []
        for p in self.players.values():
            players.append({
                "id": p.id,
                "nickname": p.nickname,
                "connected": p.connected,
                "submitted": p.id in self.submissions,
                "correct_count": p.correct_count,
                "answered": len(p.answers),
            })
        data: dict[str, Any] = {
            "type": "snapshot",
            "code": self.code,
            "status": self.status,
            "round": self.round,
            "max_players": MAX_PLAYERS,
            "question_seconds": question_seconds(),
            "reveal_seconds": reveal_seconds(),
            "total_questions": QUESTIONS_PER_ROUND,
            "players": players,
            "question": self._question_view(role),
            "results": self.results if self.status in ("reveal", "finished") else {},
            "leaderboard": self.leaderboard() if self.status == "finished" else [],
            "server_time": int(time.time() * 1000),
        }
        if role == "player" and player_id and player_id in self.players:
            me = self.players[player_id]
            data["you"] = {
                "id": me.id,
                "nickname": me.nickname,
                "answers": me.answers,
                "correct_count": me.correct_count,
            }
        return data

    def to_record(self) -> dict:
        board = {b["player_id"]: b for b in self.leaderboard()} if self.questions else {}
        players = []
        for p in self.players.values():
            lb = board.get(p.id, {})
            total = len(self.questions)
            players.append({
                "id": p.id,
                "nickname": p.nickname,
                "ip": p.ip,
                "user_agent": p.user_agent,
                "joined_at": p.joined_at,
                "correct_count": p.correct_count,
                "total_questions": total,
                "accuracy": round(p.correct_count / total * 100) if total else 0,
                "rank": lb.get("rank") if self.status == "finished" else None,
                "total_ms": p.total_ms,
                "answers": p.answers,
            })
        return {
            "code": self.code,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "status": self.status,
            "round": max(self.round, 1),
            "host_ip": self.host_ip,
            "questions": self.questions,
            "players": players,
        }

    # ----- WebSocket 傳送 -------------------------------------------------

    async def _safe_send(self, ws: WebSocket, data: dict) -> bool:
        try:
            await ws.send_json(data)
            return True
        except Exception:
            return False

    async def send_hosts(self, data: dict) -> None:
        dead = []
        for ws in list(self.host_sockets):
            if not await self._safe_send(ws, data):
                dead.append(ws)
        for ws in dead:
            self.host_sockets.discard(ws)

    async def send_players(self, data: dict) -> None:
        for p in self.players.values():
            if p.socket is not None and not await self._safe_send(p.socket, data):
                p.socket = None

    async def broadcast(self) -> None:
        if self.host_sockets:
            await self.send_hosts(self.snapshot("host"))
        for p in list(self.players.values()):
            if p.socket is not None:
                if not await self._safe_send(p.socket, self.snapshot("player", p.id)):
                    p.socket = None

    def close(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()


# ---------------------------------------------------------------------------
# 賽局登錄表
# ---------------------------------------------------------------------------

GAMES: dict[str, Game] = {}


def _sweep_games() -> None:
    now = time.time()
    for code in [c for c, g in GAMES.items() if now - g.last_activity > GAME_TTL_SECONDS]:
        GAMES[code].close()
        del GAMES[code]


def _new_code() -> str:
    for _ in range(200):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(3))
        if code not in GAMES:
            return code
    raise HTTPException(status_code=503, detail="目前賽局太多，請稍後再試")


def get_game_or_404(code: str) -> Game:
    game = GAMES.get(code.upper())
    if not game:
        raise HTTPException(status_code=404, detail="找不到這個賽局")
    return game


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/yzqj", tags=["yzqj"])


class JoinRequest(BaseModel):
    nickname: str


@router.post("/games")
async def create_game(request: Request):
    _sweep_games()
    code = _new_code()
    game = Game(code=code, host_token=secrets.token_urlsafe(16), host_ip=client_ip(request.headers, request.client))
    GAMES[code] = game
    store.save_game(game.to_record())
    return {
        "code": code,
        "host_token": game.host_token,
        "join_path": f"/g/{code}",
        "host_path": f"/yzqj/host/{code}",
        "max_players": MAX_PLAYERS,
        "questions_per_round": QUESTIONS_PER_ROUND,
        "question_seconds": question_seconds(),
    }


@router.get("/games/{code}")
def game_info(code: str):
    game = get_game_or_404(code)
    return {
        "code": game.code,
        "status": game.status,
        "round": game.round,
        "player_count": len(game.players),
        "max_players": MAX_PLAYERS,
        "can_join": game.can_join,
    }


@router.post("/games/{code}/join")
async def join_game(code: str, req: JoinRequest, request: Request):
    game = get_game_or_404(code)
    player = game.add_player(
        nickname=req.nickname,
        ip=client_ip(request.headers, request.client),
        user_agent=request.headers.get("user-agent", ""),
    )
    # 讓已經連線的人（老師、其他學生）立刻看到新成員
    asyncio.create_task(game.broadcast())
    return {"player_id": player.id, "nickname": player.nickname, "code": game.code}


@router.get("/meta")
def meta():
    return {
        "idiom_count": len(IDIOMS),
        "questions_per_round": QUESTIONS_PER_ROUND,
        "question_seconds": question_seconds(),
        "max_players": MAX_PLAYERS,
    }


# ----- 後台 ---------------------------------------------------------------


def _check_admin(x_admin_token: str | None, token: str | None) -> None:
    required = os.environ.get("YZQJ_ADMIN_TOKEN", "")
    if not required:
        return
    supplied = x_admin_token or token or ""
    if not secrets.compare_digest(supplied, required):
        raise HTTPException(status_code=401, detail="後台密碼錯誤")


@router.get("/admin/status")
def admin_status():
    return {"auth_required": bool(os.environ.get("YZQJ_ADMIN_TOKEN", ""))}


@router.get("/admin/games")
def admin_games(
    limit: int = Query(100, ge=1, le=500),
    x_admin_token: str | None = Header(default=None),
    token: str | None = Query(default=None),
):
    _check_admin(x_admin_token, token)
    games = store.list_games(limit)
    for g in games:
        g["live"] = g["code"] in GAMES
    return {"games": games, "stats": store.stats(), "live_games": len(GAMES)}


@router.get("/admin/games/{code}")
def admin_game(
    code: str,
    x_admin_token: str | None = Header(default=None),
    token: str | None = Query(default=None),
):
    _check_admin(x_admin_token, token)
    game = store.get_game(code.upper())
    if not game:
        raise HTTPException(status_code=404, detail="找不到這個賽局")
    game["live"] = game["code"] in GAMES
    return game


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

ws_router = APIRouter()


@ws_router.websocket("/ws/yzqj/{code}")
async def game_socket(
    websocket: WebSocket,
    code: str,
    role: str = Query("player"),
    token: str | None = Query(default=None),
    player_id: str | None = Query(default=None),
):
    game = GAMES.get(code.upper())
    if game is None:
        await websocket.close(code=4404, reason="找不到這個賽局")
        return

    if role == "host":
        if token != game.host_token:
            await websocket.close(code=4401, reason="老師密鑰錯誤")
            return
        await websocket.accept()
        game.host_sockets.add(websocket)
        game.touch()
        try:
            await websocket.send_json(game.snapshot("host"))
            while True:
                msg = await websocket.receive_json()
                await _handle_host_message(game, websocket, msg)
        except WebSocketDisconnect:
            pass
        finally:
            game.host_sockets.discard(websocket)
        return

    # 學生
    player = game.players.get(player_id or "")
    if player is None:
        await websocket.close(code=4403, reason="請先加入賽局")
        return
    await websocket.accept()
    if player.socket is not None:
        # 同一位學生開了第二個分頁：關掉舊的
        old = player.socket
        player.socket = None
        try:
            await old.close(code=4000, reason="已在別的分頁連線")
        except Exception:
            pass
    player.socket = websocket
    game.touch()
    try:
        await game.broadcast()
        while True:
            msg = await websocket.receive_json()
            await _handle_player_message(game, player, msg)
    except WebSocketDisconnect:
        pass
    finally:
        if player.socket is websocket:
            player.socket = None
            if game.status == "question":
                game._wake.set()  # 剩下的人可能已經全部送出
            await game.broadcast()


async def _handle_host_message(game: Game, ws: WebSocket, msg: dict) -> None:
    kind = msg.get("type")
    try:
        if kind == "start":
            game.start()
        elif kind == "skip":
            game.skip()
        elif kind == "ping":
            await ws.send_json({"type": "pong"})
        else:
            await ws.send_json({"type": "error", "message": f"不認識的指令：{kind}"})
    except ValueError as exc:
        await ws.send_json({"type": "error", "message": str(exc)})


async def _handle_player_message(game: Game, player: Player, msg: dict) -> None:
    kind = msg.get("type")
    if kind == "stroke":
        # 筆跡實況：直接轉送給老師端，不存檔
        if game.status == "question" and player.id not in game.submissions:
            await game.send_hosts({
                "type": "stroke",
                "player_id": player.id,
                "sid": msg.get("sid"),
                "pts": msg.get("pts", []),
                "end": bool(msg.get("end", False)),
            })
    elif kind == "clear":
        if game.status == "question" and player.id not in game.submissions:
            await game.send_hosts({"type": "clear", "player_id": player.id})
    elif kind == "submit":
        accepted = game.submit(player.id, str(msg.get("image_data", "")), bool(msg.get("has_ink", False)))
        if accepted:
            await game.broadcast()
    elif kind == "ping":
        if player.socket is not None:
            await player.socket.send_json({"type": "pong"})
