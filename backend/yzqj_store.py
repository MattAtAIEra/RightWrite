"""
一字千金 — 賽局紀錄儲存（SQLite）

後台需要看每一位參加者的暱稱、IP、成績與排名，這裡用 Python 內建的 sqlite3 存檔，
不必額外安裝資料庫。資料庫路徑可用環境變數 YZQJ_DB_PATH 指定。

注意：Cloud Run 的檔案系統在實例重啟後會清空，正式環境若要長期保存，
請把 YZQJ_DB_PATH 指到掛載的持久儲存空間。
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).parent / "data" / "yzqj.sqlite3"

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _db_path() -> Path:
    return Path(os.environ.get("YZQJ_DB_PATH", str(DEFAULT_DB_PATH)))


def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        path = _db_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(path), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _init_schema(_conn)
    return _conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS games (
            code          TEXT PRIMARY KEY,
            created_at    REAL NOT NULL,
            started_at    REAL,
            finished_at   REAL,
            status        TEXT NOT NULL,
            round         INTEGER NOT NULL DEFAULT 1,
            host_ip       TEXT,
            questions     TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS players (
            id              TEXT NOT NULL,
            game_code       TEXT NOT NULL,
            round           INTEGER NOT NULL DEFAULT 1,
            nickname        TEXT NOT NULL,
            ip              TEXT,
            user_agent      TEXT,
            joined_at       REAL NOT NULL,
            correct_count   INTEGER NOT NULL DEFAULT 0,
            total_questions INTEGER NOT NULL DEFAULT 0,
            accuracy        REAL NOT NULL DEFAULT 0,
            rank            INTEGER,
            total_ms        INTEGER NOT NULL DEFAULT 0,
            answers         TEXT NOT NULL DEFAULT '[]',
            PRIMARY KEY (id, round)
        );
        CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_code);
        """
    )
    conn.commit()


def reset_for_tests() -> None:
    """測試用：關閉連線，讓下一次呼叫重新開啟（搭配更換 YZQJ_DB_PATH）。"""
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None


def save_game(snapshot: dict) -> None:
    """
    以整個賽局的快照覆寫資料庫。snapshot 由 yzqj.Game.to_record() 產生：
    {code, created_at, started_at, finished_at, status, round, host_ip, questions, players: [...]}
    """
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO games (code, created_at, started_at, finished_at, status, round, host_ip, questions)
            VALUES (:code, :created_at, :started_at, :finished_at, :status, :round, :host_ip, :questions)
            ON CONFLICT(code) DO UPDATE SET
                started_at = excluded.started_at,
                finished_at = excluded.finished_at,
                status = excluded.status,
                round = excluded.round,
                host_ip = excluded.host_ip,
                questions = excluded.questions
            """,
            {
                "code": snapshot["code"],
                "created_at": snapshot["created_at"],
                "started_at": snapshot.get("started_at"),
                "finished_at": snapshot.get("finished_at"),
                "status": snapshot["status"],
                "round": snapshot.get("round", 1),
                "host_ip": snapshot.get("host_ip"),
                "questions": json.dumps(snapshot.get("questions", []), ensure_ascii=False),
            },
        )
        for p in snapshot.get("players", []):
            conn.execute(
                """
                INSERT INTO players (id, game_code, round, nickname, ip, user_agent, joined_at,
                                     correct_count, total_questions, accuracy, rank, total_ms, answers)
                VALUES (:id, :game_code, :round, :nickname, :ip, :user_agent, :joined_at,
                        :correct_count, :total_questions, :accuracy, :rank, :total_ms, :answers)
                ON CONFLICT(id, round) DO UPDATE SET
                    nickname = excluded.nickname,
                    ip = excluded.ip,
                    user_agent = excluded.user_agent,
                    correct_count = excluded.correct_count,
                    total_questions = excluded.total_questions,
                    accuracy = excluded.accuracy,
                    rank = excluded.rank,
                    total_ms = excluded.total_ms,
                    answers = excluded.answers
                """,
                {
                    "id": p["id"],
                    "game_code": snapshot["code"],
                    "round": snapshot.get("round", 1),
                    "nickname": p["nickname"],
                    "ip": p.get("ip"),
                    "user_agent": p.get("user_agent"),
                    "joined_at": p["joined_at"],
                    "correct_count": p.get("correct_count", 0),
                    "total_questions": p.get("total_questions", 0),
                    "accuracy": p.get("accuracy", 0),
                    "rank": p.get("rank"),
                    "total_ms": p.get("total_ms", 0),
                    "answers": json.dumps(p.get("answers", []), ensure_ascii=False),
                },
            )
        conn.commit()


def _row_to_player(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["answers"] = json.loads(d.pop("answers") or "[]")
    return d


def _row_to_game(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["questions"] = json.loads(d.pop("questions") or "[]")
    return d


def list_games(limit: int = 100) -> list[dict]:
    """列出最近的賽局（含參加者），給後台使用。"""
    with _lock:
        conn = _connect()
        games = [_row_to_game(r) for r in conn.execute(
            "SELECT * FROM games ORDER BY created_at DESC LIMIT ?", (limit,)
        )]
        if not games:
            return []
        codes = [g["code"] for g in games]
        placeholders = ",".join("?" * len(codes))
        rows = conn.execute(
            f"SELECT * FROM players WHERE game_code IN ({placeholders}) "
            "ORDER BY round ASC, rank IS NULL, rank ASC, joined_at ASC",
            codes,
        ).fetchall()
    by_code: dict[str, list[dict]] = {c: [] for c in codes}
    for r in rows:
        by_code[r["game_code"]].append(_row_to_player(r))
    for g in games:
        g["players"] = by_code[g["code"]]
    return games


def get_game(code: str) -> dict | None:
    with _lock:
        conn = _connect()
        row = conn.execute("SELECT * FROM games WHERE code = ?", (code,)).fetchone()
        if not row:
            return None
        game = _row_to_game(row)
        players = conn.execute(
            "SELECT * FROM players WHERE game_code = ? ORDER BY round ASC, rank IS NULL, rank ASC, joined_at ASC",
            (code,),
        ).fetchall()
    game["players"] = [_row_to_player(p) for p in players]
    return game


def stats() -> dict:
    with _lock:
        conn = _connect()
        games = conn.execute("SELECT COUNT(*) FROM games").fetchone()[0]
        finished = conn.execute("SELECT COUNT(*) FROM games WHERE status = 'finished'").fetchone()[0]
        players = conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
    return {"games": games, "finished_games": finished, "players": players}
