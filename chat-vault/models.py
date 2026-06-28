"""SQLite data layer for Chat Vault.

Thread-local connections, WAL mode, no ORM.
"""
from __future__ import annotations

import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "vault.db"
_local = threading.local()


def _conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return conn


@contextmanager
def db():
    conn = _conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def init_db() -> None:
    with db() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_guest INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message_count INTEGER NOT NULL DEFAULT 0,
                media_count INTEGER NOT NULL DEFAULT 0,
                first_ts REAL,
                last_ts REAL,
                source TEXT NOT NULL DEFAULT 'upload',
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                seq INTEGER NOT NULL,
                ts REAL NOT NULL,
                sender TEXT NOT NULL,
                is_me INTEGER NOT NULL DEFAULT 0,
                kind TEXT NOT NULL DEFAULT 'text',
                body TEXT,
                media_path TEXT,
                edited INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_messages_chat_seq
                ON messages(chat_id, seq);
            CREATE INDEX IF NOT EXISTS idx_messages_chat_ts
                ON messages(chat_id, ts);

            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                path TEXT NOT NULL,
                kind TEXT NOT NULL DEFAULT 'image'
            );
            """
        )


# ---------- users ----------
def create_user(username: str, password_hash: str, is_guest: bool = False) -> int:
    with db() as c:
        cur = c.execute(
            "INSERT INTO users(username, password_hash, is_guest, created_at) VALUES(?,?,?,?)",
            (username, password_hash, 1 if is_guest else 0, time.time()),
        )
        return cur.lastrowid


def get_user_by_username(username: str):
    with db() as c:
        r = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return dict(r) if r else None


def get_user(uid: int):
    with db() as c:
        r = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        return dict(r) if r else None


# ---------- chats ----------
def create_chat(title, owner_id, message_count, media_count, first_ts, last_ts, source="upload") -> int:
    with db() as c:
        cur = c.execute(
            """INSERT INTO chats(title, owner_id, message_count, media_count,
                                 first_ts, last_ts, source, created_at)
               VALUES(?,?,?,?,?,?,?,?)""",
            (title, owner_id, message_count, media_count, first_ts, last_ts, source, time.time()),
        )
        return cur.lastrowid


def list_chats(owner_id: int):
    with db() as c:
        rows = c.execute(
            "SELECT * FROM chats WHERE owner_id=? ORDER BY created_at DESC", (owner_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_chat(chat_id: int):
    with db() as c:
        r = c.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
        return dict(r) if r else None


def update_chat_media_count(chat_id: int, media_count: int) -> None:
    with db() as c:
        c.execute("UPDATE chats SET media_count=? WHERE id=?", (media_count, chat_id))


def delete_chat(chat_id: int) -> None:
    with db() as c:
        c.execute("DELETE FROM chats WHERE id=?", (chat_id,))


# ---------- messages ----------
def insert_messages(chat_id: int, msgs: list[dict]) -> None:
    if not msgs:
        return
    with db() as c:
        c.executemany(
            """INSERT INTO messages(chat_id, seq, ts, sender, is_me, kind, body, media_path, edited)
               VALUES(:chat_id, :seq, :ts, :sender, :is_me, :kind, :body, :media_path, :edited)""",
            [
                {
                    "chat_id": chat_id,
                    "seq": m["seq"],
                    "ts": m["ts"],
                    "sender": m["sender"],
                    "is_me": 1 if m.get("is_me") else 0,
                    "kind": m.get("kind", "text"),
                    "body": m.get("body"),
                    "media_path": m.get("media_path"),
                    "edited": 1 if m.get("edited") else 0,
                }
                for m in msgs
            ],
        )


def get_message_count(chat_id: int):
    with db() as c:
        r = c.execute(
            "SELECT COUNT(*) AS n, MIN(seq) AS mn, MAX(seq) AS mx FROM messages WHERE chat_id=?",
            (chat_id,),
        ).fetchone()
        return {"count": r["n"] or 0, "min_seq": r["mn"], "max_seq": r["mx"]}


def get_messages_page(chat_id: int, limit: int = 50, before_seq: int | None = None):
    with db() as c:
        if before_seq is None:
            rows = c.execute(
                "SELECT * FROM messages WHERE chat_id=? ORDER BY seq DESC LIMIT ?",
                (chat_id, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM messages WHERE chat_id=? AND seq<? ORDER BY seq DESC LIMIT ?",
                (chat_id, before_seq, limit),
            ).fetchall()
        return [dict(r) for r in reversed(rows)]


def get_all_messages(chat_id: int):
    with db() as c:
        rows = c.execute(
            "SELECT * FROM messages WHERE chat_id=? ORDER BY seq ASC", (chat_id,)
        ).fetchall()
        return [dict(r) for r in rows]
