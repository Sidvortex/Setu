"""
Field incident reports (SIH requirement f): officials and field staff report
road problems with GPS position, a photo and a description; a reviewing
official verifies (optionally marking the road blocked in one step) or rejects.

Endpoints:
  POST /api/incidents                  submit a report          (logged-in field staff)
  POST /api/incidents/public           submit a report          (anyone; rate-limited, always reviewed)
  GET  /api/incidents?status=          list reports              (logged-in)
  POST /api/incidents/{id}/verify      verify; block_road=true also marks the road blocked
  POST /api/incidents/{id}/reject      reject
  GET  /api/incidents/photos/{name}    the photo (random, unguessable file name)

Every report gets a credibility score with reasons (credibility.py: rule
checks + optional AI photo check) to help reviewers spot fake public reports.
Nothing a member of the public sends can block a road without an official.

Reports are idempotent on client_id (generated on the device), so a phone
retrying after a dropped connection never creates duplicates.

Photos are stored in the database (table incident_photos, so they live in
Turso when deployed) and cached on disk under data/uploads/. Free hosting wipes
the disk when the server sleeps; the cache is rebuilt from the database.
"""
import base64
import hashlib
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import auth
import credibility
import db
import logistics
import risk_client
from road_status import Reason

router = APIRouter(prefix="/api/incidents", tags=["incidents"])
UPLOADS = os.path.join(os.path.dirname(__file__), "data", "uploads")
MAX_PHOTO_BYTES = 3 * 1024 * 1024
MAX_SNAP_M = 2000  # further than this from any mapped road -> not linked to a road
PUBLIC_LIMIT_PER_HOUR = 5

db.execute("""
    CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT UNIQUE NOT NULL,
        lat REAL NOT NULL, lon REAL NOT NULL,
        edge_id INTEGER, snap_m REAL,
        incident_type TEXT NOT NULL, severity TEXT NOT NULL, description TEXT,
        photo TEXT,
        reported_by TEXT NOT NULL, captured_at TEXT, created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reported', reviewed_by TEXT, reviewed_at TEXT
    )
""")
# Photos are kept in the database too (base64), not only on disk: free hosting
# (Render) wipes the server's disk whenever it sleeps or redeploys. The disk copy
# under data/uploads is just a cache, rebuilt from the database on demand.
db.execute("""
    CREATE TABLE IF NOT EXISTS incident_photos (
        name TEXT PRIMARY KEY,
        data TEXT NOT NULL
    )
""")
# Columns added after the first version: add them to existing databases too
for _col, _type in [("source", "TEXT DEFAULT 'official'"), ("ip_hash", "TEXT"), ("photo_sha", "TEXT"), ("contact", "TEXT"),
                    ("credibility", "INTEGER"), ("credibility_reasons", "TEXT"), ("ai_verdict", "TEXT")]:
    try:
        db.execute(f"ALTER TABLE incidents ADD COLUMN {_col} {_type}")
    except Exception:
        pass  # already there
_COLS = ["id", "client_id", "lat", "lon", "edge_id", "snap_m", "incident_type", "severity", "description", "photo",
         "reported_by", "captured_at", "created_at", "status", "reviewed_by", "reviewed_at",
         "source", "photo_sha", "contact", "credibility", "credibility_reasons", "ai_verdict"]


class IncidentIn(BaseModel):
    client_id: str = Field(min_length=8, max_length=64)
    lat: float = Field(ge=20, le=30.5)    # North East India
    lon: float = Field(ge=87.5, le=97.5)
    incident_type: Reason
    severity: Literal["Low", "Medium", "High"]
    description: Optional[str] = Field(default=None, max_length=1000)
    photo_base64: Optional[str] = None   # JPEG/PNG, data-URL prefix allowed
    captured_at: Optional[str] = None     # when it was recorded on the device (may be earlier than upload)


class PublicIncidentIn(IncidentIn):
    contact: Optional[str] = Field(default=None, max_length=120)  # optional name / phone, only if the person chooses


class VerifyIn(BaseModel):
    block_road: bool = False


def _nearest_edge(lat: float, lon: float):
    """Nearest mapped road segment to a point, by distance to its drawn shape."""
    node, _ = logistics.nearest_node(lat, lon)
    candidates = logistics.EDGES.index[(logistics.EDGES.u == node) | (logistics.EDGES.v == node)]
    x, y = logistics._to_utm.transform(lon, lat)
    best, best_d = None, float("inf")
    for e in candidates:
        pts = np.array([logistics._to_utm.transform(cx, cy) for cx, cy in logistics.edge_coords(int(e))])
        d = float(np.hypot(pts[:, 0] - x, pts[:, 1] - y).min())
        if d < best_d:
            best, best_d = int(e), d
    return (best, round(best_d)) if best is not None and best_d <= MAX_SNAP_M else (None, None)


def _save_photo(data_b64: str) -> tuple:
    if "," in data_b64[:100]:
        data_b64 = data_b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(data_b64, validate=True)
    except Exception:
        raise HTTPException(status_code=422, detail="Photo is not valid base64")
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Photo too large (max 3 MB)")
    ext = "jpg" if raw[:3] == b"\xff\xd8\xff" else "png" if raw[:8] == b"\x89PNG\r\n\x1a\n" else None
    if not ext:
        raise HTTPException(status_code=422, detail="Photo must be JPEG or PNG")
    name = f"{uuid.uuid4().hex}.{ext}"
    db.execute("INSERT INTO incident_photos (name, data) VALUES (?, ?)", (name, base64.b64encode(raw).decode()))
    _cache_photo(name, raw)
    return name, hashlib.sha256(raw).hexdigest()


def _cache_photo(name: str, raw: bytes) -> str:
    os.makedirs(UPLOADS, exist_ok=True)
    path = os.path.join(UPLOADS, name)
    with open(path, "wb") as f:
        f.write(raw)
    return path


def _photo_path(name: str) -> Optional[str]:
    """Local file for a stored photo, restored from the database if the disk was wiped."""
    path = os.path.join(UPLOADS, name)
    if os.path.exists(path):
        return path
    row = db.fetchone("SELECT data FROM incident_photos WHERE name = ?", (name,))
    return _cache_photo(name, base64.b64decode(row[0])) if row else None


def _row_to_dict(row: tuple) -> dict:
    d = dict(zip(_COLS, row))
    road = logistics.EDGES.iloc[d["edge_id"]] if d["edge_id"] is not None else None
    dist = logistics.edge_district(d["edge_id"]) if d["edge_id"] is not None else None
    d["road_name"] = (road.road_name or "Unnamed road") if road is not None else None
    d["road_category"] = road.category if road is not None else None
    d["district"] = dist["name"] if dist else None
    d["state"] = dist["state"] if dist else None
    d["photo_url"] = f"/api/incidents/photos/{d['photo']}" if d["photo"] else None
    d["credibility_reasons"] = json.loads(d["credibility_reasons"]) if d["credibility_reasons"] else []
    d["ai_verdict"] = json.loads(d["ai_verdict"]) if d["ai_verdict"] else None
    d["credibility_level"] = credibility.level(d["credibility"]) if d["credibility"] is not None else None
    d.pop("photo_sha", None)
    return d


def _get(incident_id: int) -> dict:
    row = db.fetchone(f"SELECT {', '.join(_COLS)} FROM incidents WHERE id = ?", (incident_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"No incident {incident_id}")
    return _row_to_dict(row)


def _ip_hash(request: Request) -> str:
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")
    return hashlib.sha256(f"{auth.AUTH_SECRET}|{ip}".encode()).hexdigest()[:32]  # never store raw IPs


def _enrich(incident_id: int, lat: float, lon: float, photo: Optional[str], incident_type: str, description: Optional[str]):
    """Background checks that call other services (BhooSuraksha, AI). They run after the
    report is saved and acknowledged, so a slow or down service never delays a reporter."""
    added, points, verdict = [], 0, None
    if incident_type == "Landslide" and risk_client.configured():
        risk = risk_client.district_risk(lat, lon)
        rp = credibility.risk_points(incident_type, risk["risk_level"] if risk else None)
        if rp:
            points += rp[0]; added.append({"points": rp[0], "reason": rp[1]})
    if photo and credibility.ai_enabled():
        path = _photo_path(photo)
        verdict = credibility.ai_photo_check(path, incident_type, description) if path else None
        if verdict and verdict.get("points"):
            points += verdict["points"]; added.append({"points": verdict["points"], "reason": verdict["reason"]})
        elif verdict and verdict.get("error"):
            added.append({"points": 0, "reason": verdict["error"]})
    if not added and not verdict:
        return
    row = db.fetchone("SELECT credibility, credibility_reasons FROM incidents WHERE id = ?", (incident_id,))
    reasons = json.loads(row[1] or "[]") + added
    score = credibility.cap((row[0] or 50) + points, reasons)
    db.execute("UPDATE incidents SET credibility = ?, credibility_reasons = ?, ai_verdict = COALESCE(?, ai_verdict) WHERE id = ?",
               (score, json.dumps(reasons), json.dumps(verdict) if verdict else None, incident_id))


def _create(inc: IncidentIn, reported_by: str, source: str, ip_hash: Optional[str], contact: Optional[str], tasks: BackgroundTasks) -> dict:
    existing = db.fetchone("SELECT id FROM incidents WHERE client_id = ?", (inc.client_id,))
    if existing:  # a retry of something we already have
        return {**_get(existing[0]), "duplicate": True}
    edge_id, snap = _nearest_edge(inc.lat, inc.lon)
    photo, sha = _save_photo(inc.photo_base64) if inc.photo_base64 else (None, None)
    reused = db.fetchone("SELECT id FROM incidents WHERE photo_sha = ? ORDER BY id LIMIT 1", (sha,)) if sha else None
    since = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    nearby = db.fetchone(
        "SELECT COUNT(*) FROM incidents WHERE created_at > ? AND ABS(lat - ?) < 0.009 AND ABS(lon - ?) < 0.01 "
        "AND status != 'rejected' AND COALESCE(ip_hash, reported_by) != ?", (since, inc.lat, inc.lon, ip_hash or reported_by))[0]
    # (landslide-risk and AI checks run in the background: see _enrich)
    score, reasons = credibility.rule_score(
        source=source, has_photo=bool(photo), snap_m=snap, photo_reused_in=reused[0] if reused else None,
        nearby_reports=int(nearby), landslide_risk=None, incident_type=inc.incident_type,
        captured_at=inc.captured_at, description=inc.description)
    db.execute(
        "INSERT INTO incidents (client_id, lat, lon, edge_id, snap_m, incident_type, severity, description, photo, reported_by, captured_at, created_at, "
        "source, ip_hash, photo_sha, contact, credibility, credibility_reasons) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (inc.client_id, inc.lat, inc.lon, edge_id, snap, inc.incident_type, inc.severity, inc.description, photo,
         reported_by, inc.captured_at, datetime.now(timezone.utc).isoformat(), source, ip_hash, sha, contact, score, json.dumps(reasons)))
    new_id = db.fetchone("SELECT id FROM incidents WHERE client_id = ?", (inc.client_id,))[0]
    if (inc.incident_type == "Landslide" and risk_client.configured()) or (photo and credibility.ai_enabled()):
        tasks.add_task(_enrich, new_id, inc.lat, inc.lon, photo, inc.incident_type, inc.description)
    return {**_get(new_id), "duplicate": False}


@router.post("")
def submit(inc: IncidentIn, tasks: BackgroundTasks, user: dict = Depends(auth.require_auth)):
    return _create(inc, user["sub"], "official", None, None, tasks)


@router.post("/public")
def submit_public(inc: PublicIncidentIn, request: Request, tasks: BackgroundTasks):
    ip = _ip_hash(request)
    if not db.fetchone("SELECT id FROM incidents WHERE client_id = ?", (inc.client_id,)):  # retries don't count
        since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        if db.fetchone("SELECT COUNT(*) FROM incidents WHERE ip_hash = ? AND created_at > ?", (ip, since))[0] >= PUBLIC_LIMIT_PER_HOUR:
            raise HTTPException(status_code=429, detail=f"Too many reports from this connection. Please try again later (limit {PUBLIC_LIMIT_PER_HOUR} per hour).")
    out = _create(inc, "public", "public", ip, inc.contact, tasks)
    # the public only learns it was received, not reviewers' scoring
    return {k: out[k] for k in ("id", "status", "road_name", "district", "snap_m", "duplicate")}


@router.get("")
def list_incidents(status: Optional[Literal["reported", "verified", "rejected"]] = None,
                   source: Optional[Literal["official", "public"]] = None, user: dict = Depends(auth.require_auth)):
    where, args = [], []
    if status: where.append("status = ?"); args.append(status)
    if source: where.append("COALESCE(source, 'official') = ?"); args.append(source)
    sql = f"SELECT {', '.join(_COLS)} FROM incidents" + (f" WHERE {' AND '.join(where)}" if where else "") + " ORDER BY created_at DESC LIMIT 300"
    return {"incidents": [_row_to_dict(r) for r in db.fetchall(sql, tuple(args))], "ai_check": credibility.ai_enabled()}


@router.post("/{incident_id}/verify")
def verify(incident_id: int, body: VerifyIn, user: dict = Depends(auth.require_auth)):
    inc = _get(incident_id)
    if body.block_road:
        if inc["edge_id"] is None:
            raise HTTPException(status_code=422, detail="This report isn't linked to a mapped road, so no road can be blocked")
        note = f"Field report #{incident_id}" + (f": {inc['description']}" if inc["description"] else "")
        db.execute("DELETE FROM road_blocks WHERE edge_id = ?", (inc["edge_id"],))
        db.execute("INSERT INTO road_blocks (edge_id, reason, note, reported_by, created_at) VALUES (?, ?, ?, ?, ?)",
                   (inc["edge_id"], inc["incident_type"], note[:500], user["sub"], datetime.now(timezone.utc).isoformat()))
    db.execute("UPDATE incidents SET status = 'verified', reviewed_by = ?, reviewed_at = ? WHERE id = ?",
               (user["sub"], datetime.now(timezone.utc).isoformat(), incident_id))
    return {**_get(incident_id), "road_blocked": body.block_road}


@router.post("/{incident_id}/reject")
def reject(incident_id: int, user: dict = Depends(auth.require_auth)):
    _get(incident_id)
    db.execute("UPDATE incidents SET status = 'rejected', reviewed_by = ?, reviewed_at = ? WHERE id = ?",
               (user["sub"], datetime.now(timezone.utc).isoformat(), incident_id))
    return _get(incident_id)


@router.get("/photos/{name}")
def photo(name: str):
    # only files we generated: 32 hex chars + extension; blocks path tricks
    stem, _, ext = name.partition(".")
    if len(stem) != 32 or not all(c in "0123456789abcdef" for c in stem) or ext not in ("jpg", "png"):
        raise HTTPException(status_code=404, detail="Not found")
    path = _photo_path(name)
    if not path:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="image/jpeg" if ext == "jpg" else "image/png")
