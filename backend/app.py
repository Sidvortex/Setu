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
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

import auth
import incidents
import logistics
import risk_client
import road_status
import shipments

app = FastAPI(title="Setu API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)  # road GeoJSON compresses ~4x
app.include_router(logistics.router)
app.include_router(road_status.router)
app.include_router(incidents.router)
app.include_router(shipments.router)


class LoginRequest(BaseModel):
    username: str
    password: str


@app.on_event("startup")
def _startup_report():
    storage = "Turso" if auth.USING_TURSO else f"local sqlite ({auth.DB_PATH})"
    print(f"[auth] storage: {storage} | registered accounts: {auth.count_users()}")
    if auth.count_users() == 0:
        print("[auth] No accounts yet - create one: python create_admin.py <username> <password>")
    print(f"[risk] BhooSuraksha link: {risk_client.BHOOSURAKSHA_API_URL or 'not configured (risk panel hidden)'}")


@app.get("/health")
def health():
    return {"status": "ok"}


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
