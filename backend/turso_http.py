"""
Minimal Turso client over HTTPS (Turso's documented /v2/pipeline endpoint).

Replaces the old `libsql-client` package, which connects over WebSocket
(libsql:// -> wss://). Turso's newer databases (e.g. *.aws-ap-south-1.turso.io)
reject that with "WSServerHandshakeError: 400 Invalid response status".

Same shape as libsql_client's sync API, so callers only change the import:

    with turso_http.create_client_sync(url, auth_token=token) as c:
        rows = c.execute("SELECT ... WHERE x = ?", [1]).rows   # list of tuples

One pooled HTTPS connection is shared by the whole process.
"""
import base64
import threading
from typing import Any, List, Optional, Sequence

import httpx

TIMEOUT_S = 15.0
_lock = threading.Lock()
_http: Optional[httpx.Client] = None


class TursoError(Exception):
    pass


def _client() -> httpx.Client:
    global _http
    with _lock:
        if _http is None:
            _http = httpx.Client(timeout=TIMEOUT_S, limits=httpx.Limits(max_keepalive_connections=4, max_connections=8))
        return _http


def _base_url(url: str) -> str:
    url = (url or "").strip().rstrip("/")
    for prefix in ("libsql://", "wss://", "ws://"):
        if url.startswith(prefix):
            return "https://" + url[len(prefix):]
    return url


def _encode(v: Any) -> dict:
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, (bytes, bytearray, memoryview)):
        return {"type": "blob", "base64": base64.b64encode(bytes(v)).decode()}
    return {"type": "text", "value": str(v)}


def _decode(v: dict) -> Any:
    t = v.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(v["value"])
    if t == "float":
        return float(v["value"])
    if t == "blob":
        return base64.b64decode(v.get("base64", ""))
    return v.get("value")


class ResultSet:
    def __init__(self, columns: List[str], rows: List[tuple], rows_affected: int, last_insert_rowid: Optional[int]):
        self.columns = columns
        self.rows = rows
        self.rows_affected = rows_affected
        self.last_insert_rowid = last_insert_rowid


class Client:
    def __init__(self, url: str, auth_token: Optional[str] = None):
        if not url:
            raise TursoError("TURSO_DATABASE_URL is empty")
        self._endpoint = _base_url(url) + "/v2/pipeline"
        # Tokens pasted into a dashboard often carry a trailing newline or spaces,
        # which are illegal in an HTTP header ("Illegal header value ... \n").
        token = "".join((auth_token or "").split())
        self._headers = {"Authorization": f"Bearer {token}"} if token else {}

    def execute(self, sql: str, args: Optional[Sequence[Any]] = None) -> ResultSet:
        body = {"requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": [_encode(a) for a in (args or [])]}},
            {"type": "close"},
        ]}
        try:
            r = _client().post(self._endpoint, json=body, headers=self._headers)
        except httpx.HTTPError as e:
            raise TursoError(f"Can't reach Turso: {type(e).__name__}: {e}") from e
        if r.status_code != 200:
            raise TursoError(f"Turso returned HTTP {r.status_code}: {r.text[:200]}"
                             + (" (check TURSO_AUTH_TOKEN)" if r.status_code in (401, 403) else ""))
        first = r.json()["results"][0]
        if first.get("type") != "ok":
            err = first.get("error") or {}
            raise TursoError(f"{err.get('code', 'SQL_ERROR')}: {err.get('message', first)}")
        res = first["response"]["result"]
        rowid = res.get("last_insert_rowid")
        return ResultSet(
            columns=[c.get("name") for c in res.get("cols", [])],
            rows=[tuple(_decode(v) for v in row) for row in res.get("rows", [])],
            rows_affected=res.get("affected_row_count", 0),
            last_insert_rowid=int(rowid) if rowid is not None else None,
        )

    def close(self) -> None:
        pass  # the HTTPS connection is pooled and shared

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def create_client_sync(url: str, auth_token: Optional[str] = None) -> Client:
    return Client(url, auth_token)
