"""Tiny SQLite layer (stdlib only) for the stateful features.

Swap for SQLAlchemy/Postgres in production - every call goes through the
functions in this module, so the storage engine is the only thing that changes.
"""
from __future__ import annotations

import json
import sqlite3
import string
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from random import SystemRandom
from typing import Any, Dict, Iterable, List, Optional

from app.core.config import settings

DB_PATH = settings.sqlite_path
_rand = SystemRandom()
ALPHABET = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"

SCHEMA = """
CREATE TABLE IF NOT EXISTS savings_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'demo',
    created_at TEXT NOT NULL,
    store_id TEXT NOT NULL,
    items_total REAL NOT NULL,
    worst_total REAL NOT NULL,
    promo_saved REAL NOT NULL DEFAULT 0,
    basket_json TEXT
);
CREATE TABLE IF NOT EXISTS watchlist (
    user_id TEXT NOT NULL DEFAULT 'demo',
    gtin TEXT NOT NULL,
    reference_price REAL NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, gtin)
);
CREATE TABLE IF NOT EXISTS pantry (
    user_id TEXT NOT NULL DEFAULT 'demo',
    gtin TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    bought_at TEXT NOT NULL,
    expires_at TEXT,
    PRIMARY KEY (user_id, gtin)
);
CREATE TABLE IF NOT EXISTS shared_carts (
    code TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS community_meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'משתמש CartFit',
    title TEXT NOT NULL,
    servings INTEGER NOT NULL,
    budget REAL NOT NULL,
    payload TEXT NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0
);
"""


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)


def now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def short_code(length: int = 6) -> str:
    return "".join(_rand.choice(ALPHABET) for _ in range(length))


# --------------------------- savings ------------------------------------- #
def log_savings(user_id: str, store_id: str, items_total: float, worst_total: float,
                promo_saved: float, basket: Optional[dict] = None) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO savings_log (user_id, created_at, store_id, items_total, worst_total, promo_saved, basket_json)"
            " VALUES (?,?,?,?,?,?,?)",
            (user_id, now(), store_id, items_total, worst_total, promo_saved,
             json.dumps(basket, ensure_ascii=False) if basket else None))


def savings_rows(user_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM savings_log WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                            (user_id, limit)).fetchall()
    return [dict(r) for r in rows]


# --------------------------- watchlist ----------------------------------- #
def watch_add(user_id: str, gtin: str, reference_price: float) -> None:
    with connect() as conn:
        conn.execute("INSERT OR REPLACE INTO watchlist (user_id, gtin, reference_price, created_at) VALUES (?,?,?,?)",
                     (user_id, gtin, reference_price, now()))


def watch_remove(user_id: str, gtin: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM watchlist WHERE user_id=? AND gtin=?", (user_id, gtin))


def watch_list(user_id: str) -> List[Dict[str, Any]]:
    with connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM watchlist WHERE user_id=?", (user_id,)).fetchall()]


# --------------------------- pantry -------------------------------------- #
def pantry_upsert(user_id: str, gtin: str, qty: int, expires_at: Optional[str]) -> None:
    with connect() as conn:
        conn.execute("INSERT OR REPLACE INTO pantry (user_id, gtin, qty, bought_at, expires_at) VALUES (?,?,?,?,?)",
                     (user_id, gtin, qty, now(), expires_at))


def pantry_remove(user_id: str, gtin: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM pantry WHERE user_id=? AND gtin=?", (user_id, gtin))


def pantry_list(user_id: str) -> List[Dict[str, Any]]:
    with connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM pantry WHERE user_id=?", (user_id,)).fetchall()]


# --------------------------- shared carts -------------------------------- #
def share_put(payload: dict, code: Optional[str] = None) -> str:
    code = code or short_code()
    with connect() as conn:
        existing = conn.execute("SELECT revision FROM shared_carts WHERE code=?", (code,)).fetchone()
        if existing:
            conn.execute("UPDATE shared_carts SET payload=?, updated_at=?, revision=revision+1 WHERE code=?",
                         (json.dumps(payload, ensure_ascii=False), now(), code))
        else:
            conn.execute("INSERT INTO shared_carts (code, created_at, payload, updated_at) VALUES (?,?,?,?)",
                         (code, now(), json.dumps(payload, ensure_ascii=False), now()))
    return code


def share_get(code: str) -> Optional[Dict[str, Any]]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM shared_carts WHERE code=?", (code.upper(),)).fetchone()
    if not row:
        return None
    data = dict(row)
    data["payload"] = json.loads(data["payload"])
    return data


# --------------------------- community ----------------------------------- #
def community_add(title: str, servings: int, budget: float, payload: dict, author: str = "משתמש CartFit") -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO community_meals (created_at, author, title, servings, budget, payload) VALUES (?,?,?,?,?,?)",
            (now(), author, title, servings, budget, json.dumps(payload, ensure_ascii=False)))
        return int(cur.lastrowid)


def community_list(limit: int = 20) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM community_meals ORDER BY likes DESC, created_at DESC LIMIT ?",
                            (limit,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["payload"] = json.loads(d["payload"])
        out.append(d)
    return out


def community_like(meal_id: int) -> None:
    with connect() as conn:
        conn.execute("UPDATE community_meals SET likes = likes + 1 WHERE id=?", (meal_id,))
