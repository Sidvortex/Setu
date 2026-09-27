"""
Authority login system.

Storage: Turso (production-ready, works on ephemeral deployments like
Cloud Run) when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set; falls
back to a local sqlite file (backend/data/auth.db) otherwise, which is
fine for local development but will NOT reliably persist accounts on
most cloud deployments - most platforms give each instance/restart a
fresh, empty filesystem. If you've deployed this and logins fail with
"incorrect username or password" even though you're sure they're right,
this is almost always why: the account only exists in your local file,
not wherever the backend is actually running. See SETUP.md.

Passwords are hashed with bcrypt (never stored in plain text). Sessions
are stateless JWTs signed with AUTH_SECRET (set this env var in
production - a random default is used otherwise, which invalidates all
sessions on every restart and is NOT safe to deploy as-is).

There is deliberately no public self-registration endpoint. Authority
accounts are created with create_admin.py, run by whoever administers the
deployment - the same way a real government system's internal accounts
aren't something the public can sign up for.
"""
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Header, HTTPException

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "auth.db")
AUTH_SECRET = os.environ.get("AUTH_SECRET", "dev-only-insecure-secret-change-me")
TOKEN_TTL_HOURS = 12

TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")
USING_TURSO = bool(TURSO_URL)

_CREATE_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'authority',
        created_at TEXT NOT NULL
    )
"""


class _SqliteBackend:
    """Local file-based storage. Fine for development; not for most
    cloud deployments (ephemeral filesystems don't persist this)."""

    def _connect(self) -> sqlite3.Connection:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.execute(_CREATE_TABLE_SQL)
        return conn

    def execute(self, sql: str, params: tuple = ()) -> None:
        conn = self._connect()
        try:
            conn.execute(sql, params)
            conn.commit()
        finally:
            conn.close()

    def fetchone(self, sql: str, params: tuple = ()) -> Optional[tuple]:
        conn = self._connect()
        try:
            return conn.execute(sql, params).fetchone()
        finally:
            conn.close()

    def count_users(self) -> int:
        row = self.fetchone("SELECT COUNT(*) FROM users")
        return row[0] if row else 0


class _TursoBackend:
    """Turso (libsql) storage - the one that actually survives real
    deployments, including serverless/ephemeral ones like Cloud Run."""

    def __init__(self):
        import libsql_client
        self._libsql_client = libsql_client
        self._ensure_table()

    def _client(self):
        return self._libsql_client.create_client_sync(TURSO_URL, auth_token=TURSO_TOKEN)

    def _ensure_table(self) -> None:
        with self._client() as client:
            client.execute(_CREATE_TABLE_SQL)

    def execute(self, sql: str, params: tuple = ()) -> None:
        with self._client() as client:
            client.execute(sql, list(params))

    def fetchone(self, sql: str, params: tuple = ()) -> Optional[tuple]:
        with self._client() as client:
            rs = client.execute(sql, list(params))
            return tuple(rs.rows[0]) if rs.rows else None

    def count_users(self) -> int:
        row = self.fetchone("SELECT COUNT(*) FROM users")
        return row[0] if row else 0


_backend = _TursoBackend() if USING_TURSO else _SqliteBackend()


def create_user(username: str, password: str, role: str = "authority") -> None:
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    _backend.execute(
        "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
        (username, password_hash, role, datetime.now(timezone.utc).isoformat()),
    )


def verify_login(username: str, password: str) -> Optional[dict]:
    row = _backend.fetchone(
        "SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,)
    )
    if not row:
        return None
    user_id, uname, password_hash, role = row
    if not bcrypt.checkpw(password.encode(), password_hash.encode()):
        return None
    return {"id": user_id, "username": uname, "role": role}


def get_user_by_username(username: str) -> Optional[dict]:
    row = _backend.fetchone("SELECT id, username, role FROM users WHERE username = ?", (username,))
    if not row:
        return None
    return {"id": row[0], "username": row[1], "role": row[2]}


def count_users() -> int:
    return _backend.count_users()


def issue_token(user: dict) -> str:
    payload = {
        "sub": user["username"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, AUTH_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, AUTH_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token")


def require_auth(authorization: Optional[str] = Header(None)) -> dict:
    """FastAPI dependency: use as `user = Depends(require_auth)` on any
    route that should only work for a logged-in authority user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    return decode_token(token)
