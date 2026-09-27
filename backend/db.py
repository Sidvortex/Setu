"""
Shared storage for Setu's operational data (road status, and later
incidents / shipments). Same pattern as auth.py: Turso when
TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set, otherwise a local SQLite file
(data/sampark.db). Local SQLite is fine for development but does not persist
on Cloud Run — use Turso for any deployment.
"""
import os
import sqlite3
from typing import Any, List, Optional, Sequence

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "sampark.db")
TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")
USING_TURSO = bool(TURSO_URL)


def execute(sql: str, params: Sequence[Any] = ()) -> None:
    if USING_TURSO:
        import libsql_client
        with libsql_client.create_client_sync(TURSO_URL, auth_token=TURSO_TOKEN) as c:
            c.execute(sql, list(params))
        return
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(sql, params)
        conn.commit()
    finally:
        conn.close()


def fetchall(sql: str, params: Sequence[Any] = ()) -> List[tuple]:
    if USING_TURSO:
        import libsql_client
        with libsql_client.create_client_sync(TURSO_URL, auth_token=TURSO_TOKEN) as c:
            return [tuple(r) for r in c.execute(sql, list(params)).rows]
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def fetchone(sql: str, params: Sequence[Any] = ()) -> Optional[tuple]:
    rows = fetchall(sql, params)
    return rows[0] if rows else None
