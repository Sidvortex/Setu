"""
Setu backend: road accessibility & supply logistics for the North East.

  /api/auth/...           officials' login (auth.py)
  /api/logistics/...      road network, routing, cut-off impact (logistics.py)
  /api/roads/...          shared road status: blocked / reopened (road_status.py)
  /api/connectivity/...   district connectivity summary (road_status.py)
  /api/incidents/...      field incident reports with GPS + photo (incidents.py)
  /api/shipments, /api/track/...  shipments, driver tracking links, live ETA + alerts (shipments.py)

Landslide risk comes from the sister project BhooSuraksha over HTTP
(risk_client.py, BHOOSURAKSHA_API_URL).

Run:  uvicorn app:app --reload --port 8100
"""
import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

import auth
import db
import incidents
import logistics
import risk_client
import road_status
import shipments
from config import settings

log = logging.getLogger("setu")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
SLOW_REQUEST_S = 1.0


@asynccontextmanager
async def lifespan(_: FastAPI):
    cfg = settings()
    cfg.check_production()  # refuses to start in production with an insecure secret
    storage = "Turso" if auth.USING_TURSO else f"local sqlite ({auth.DB_PATH})"
    log.info("[auth] storage: %s | registered accounts: %d", storage, auth.count_users())
    if auth.count_users() == 0:
        log.warning("[auth] No accounts yet - create one: python create_admin.py <username> <password>")
    log.info("[risk] BhooSuraksha link: %s", cfg.bhoosuraksha_api_url or "not configured (risk panel hidden)")
    log.info("[cors] allowed origins: %s", ", ".join(cfg.origins))
    yield
    risk_client.close()


app = FastAPI(title="Setu API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings().origins, allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["Server-Timing"])
app.add_middleware(GZipMiddleware, minimum_size=1000)  # road GeoJSON compresses ~4x
app.include_router(logistics.router)
app.include_router(road_status.router)
app.include_router(incidents.router)
app.include_router(shipments.router)


@app.middleware("http")
async def timing(request: Request, call_next):
    """Server-Timing header on every response; slow requests are logged."""
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    response.headers["Server-Timing"] = f"app;dur={ms:.0f}"
    if ms > SLOW_REQUEST_S * 1000:
        log.warning("slow request: %s %s took %.0f ms", request.method, request.url.path, ms)
    return response


class LoginRequest(BaseModel):
    username: str
    password: str


@app.get("/health")
def health():
    """Liveness: the process is up."""
    return {"status": "ok"}


@app.get("/ready")
def ready():
    """Readiness: database reachable and road network loaded. BhooSuraksha is reported
    but never makes Setu 'not ready' (Setu works without it)."""
    checks = {}
    try:
        db.fetchone("SELECT 1")
        checks["database"] = "ok"
    except Exception as e:  # noqa: BLE001 - report any failure
        checks["database"] = f"error: {type(e).__name__}"
    checks["road_network"] = f"ok ({len(logistics.EDGES)} segments)" if len(logistics.EDGES) else "empty"
    ok = checks["database"] == "ok" and checks["road_network"].startswith("ok")
    body = {"status": "ready" if ok else "not ready", **checks, "bhoosuraksha": risk_client.status()}
    if not ok:
        raise HTTPException(status_code=503, detail=body)
    return body


@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = auth.verify_login(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return {"token": auth.issue_token(user), "user": user}


@app.get("/api/auth/me")
def me(user: dict = Depends(auth.require_auth)):
    full = auth.get_user_by_username(user["sub"])
    if not full:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return full
