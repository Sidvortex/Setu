"""
Shipments & vehicle tracking (SIH requirements d, e, g).

Officials create a shipment (commodity, quantity, priority, origin ->
destination, vehicle, driver); Setu plans the route with the current road
status. The driver gets a private tracking link (no account, no app): the
page shares the phone's GPS, and each position update recomputes the
remaining route WITH current blockages, giving a live ETA, the delay against
plan, and automatic alerts:
  cut_off   no route left to the destination (blockages)
  rerouted  the remaining route is longer than it would be without blockages
  delayed   expected arrival more than 30 min behind plan
  stale     no position received for 30+ min while in transit

Endpoints:
  POST /api/shipments                     create                        (officials)
  GET  /api/shipments                     list with live status/alerts  (officials)
  POST /api/shipments/{id}/start|deliver|cancel                         (officials)
  POST /api/shipments/{id}/simulate       DEMO: place the vehicle a fraction along its route (officials)
  GET  /api/track/{token}                 the driver's view of their shipment (tracking link)
  POST /api/track/{token}/ping            the driver's phone reports its position
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import auth
import db
import logistics
import road_status

router = APIRouter(tags=["shipments"])

COMMODITIES = ("Medicines", "Food", "Drinking water", "Agricultural produce", "Fuel", "Construction materials", "Emergency supplies")
DELAY_ALERT_MIN = 30
STALE_MIN = 30

db.execute("""
    CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commodity TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, priority TEXT NOT NULL,
        origin_name TEXT NOT NULL, o_lat REAL NOT NULL, o_lon REAL NOT NULL,
        dest_name TEXT NOT NULL, d_lat REAL NOT NULL, d_lon REAL NOT NULL,
        vehicle_reg TEXT NOT NULL, driver_name TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        track_token TEXT UNIQUE NOT NULL,
        planned_minutes REAL, planned_km REAL,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL,
        started_at TEXT, delivered_at TEXT,
        last_lat REAL, last_lon REAL, last_speed REAL, last_ping_at TEXT, simulated INTEGER DEFAULT 0
    )
""")
_COLS = ["id", "commodity", "quantity", "unit", "priority", "origin_name", "o_lat", "o_lon", "dest_name", "d_lat", "d_lon",
         "vehicle_reg", "driver_name", "status", "track_token", "planned_minutes", "planned_km", "created_by", "created_at",
         "started_at", "delivered_at", "last_lat", "last_lon", "last_speed", "last_ping_at", "simulated"]


class Place(BaseModel):
    name: str = Field(max_length=200)
    lat: float
    lon: float


class ShipmentIn(BaseModel):
    commodity: Literal[COMMODITIES]  # type: ignore[valid-type]
    quantity: float = Field(gt=0)
    unit: Literal["kg", "tonnes", "litres", "boxes", "units"]
    priority: Literal["Critical", "High", "Normal"]
    origin: Place
    destination: Place
    vehicle_reg: str = Field(min_length=3, max_length=20)
    driver_name: Optional[str] = Field(default=None, max_length=80)


class PingIn(BaseModel):
    lat: float = Field(ge=20, le=30.5)
    lon: float = Field(ge=87.5, le=97.5)
    speed_kmh: Optional[float] = Field(default=None, ge=0, le=200)


class SimulateIn(BaseModel):
    progress: float = Field(ge=0, le=1)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _row(sql: str, args: tuple) -> Optional[dict]:
    r = db.fetchone(f"SELECT {', '.join(_COLS)} FROM shipments {sql}", args)
    return dict(zip(_COLS, r)) if r else None


def _blocked() -> list:
    return [b["edge_id"] for b in road_status._blocked_rows()]


def _route(o_lat, o_lon, d_lat, d_lon, blocked):
    return logistics.route(logistics.RouteRequest(origin=logistics.Point(lat=o_lat, lon=o_lon),
                                                  destination=logistics.Point(lat=d_lat, lon=d_lon), blocked_edge_ids=blocked))


def _live(s: dict, blocked: list, with_geometry: bool = False) -> dict:
    """Add ETA, delay and alerts to a shipment."""
    alerts, eta, delay, remaining = [], None, None, None
    if s["status"] in ("planned", "in_transit"):
        here = (s["last_lat"], s["last_lon"]) if s["last_lat"] is not None else (s["o_lat"], s["o_lon"])
        try:
            r = _route(here[0], here[1], s["d_lat"], s["d_lon"], blocked)
        except HTTPException:  # already at the destination's road point
            r = {"status": "ok", "current": {"minutes": 0, "km": 0, "geometry": None}, "normal": None}
        if r["status"] in ("unreachable", "no_data_link"):
            alerts.append({"type": "cut_off", "text": "No open route to the destination" + (" (blocked roads)" if r["status"] == "unreachable" else " in the road data")})
        else:
            cur = r["current"]
            remaining = {"minutes": cur["minutes"], "km": cur["km"], **({"geometry": cur["geometry"]} if with_geometry else {})}
            if r["status"] == "rerouted":
                alerts.append({"type": "rerouted", "text": f"Rerouted around blocked roads (+{r['delay_min']:.0f} min)"})
            start = datetime.fromisoformat(s["started_at"]) if s["started_at"] else _now()
            eta_dt = _now() + timedelta(minutes=cur["minutes"])
            eta = eta_dt.isoformat()
            if s["planned_minutes"] is not None:
                delay = round((eta_dt - (start + timedelta(minutes=s["planned_minutes"]))).total_seconds() / 60)
                if s["status"] == "in_transit" and delay > DELAY_ALERT_MIN:
                    alerts.append({"type": "delayed", "text": f"Running {delay} min behind plan"})
        if s["status"] == "in_transit" and s["last_ping_at"]:
            quiet = (_now() - datetime.fromisoformat(s["last_ping_at"])).total_seconds() / 60
            if quiet > STALE_MIN:
                alerts.append({"type": "stale", "text": f"No position for {quiet:.0f} min"})
    return {**s, "eta": eta, "delay_min": delay, "remaining": remaining, "alerts": alerts,
            "tracking_path": f"/track/{s['track_token']}"}


@router.post("/api/shipments")
def create(req: ShipmentIn, user: dict = Depends(auth.require_auth)):
    plan = _route(req.origin.lat, req.origin.lon, req.destination.lat, req.destination.lon, _blocked())
    if plan["status"] == "no_data_link":
        raise HTTPException(status_code=422, detail="There is no road link between these places in the road data")
    best = plan["current"] or plan["normal"]  # if currently cut off, plan on the normal route and alert
    token = secrets.token_urlsafe(16)
    db.execute(
        "INSERT INTO shipments (commodity, quantity, unit, priority, origin_name, o_lat, o_lon, dest_name, d_lat, d_lon, "
        "vehicle_reg, driver_name, track_token, planned_minutes, planned_km, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (req.commodity, req.quantity, req.unit, req.priority, req.origin.name, req.origin.lat, req.origin.lon,
         req.destination.name, req.destination.lat, req.destination.lon, req.vehicle_reg.upper(), req.driver_name,
         token, best["minutes"], best["km"], user["sub"], _now().isoformat()))
    return _live(_row("WHERE track_token = ?", (token,)), _blocked())


@router.get("/api/shipments")
def list_shipments(user: dict = Depends(auth.require_auth), geometry_for: Optional[int] = None):
    blocked = _blocked()
    rows = db.fetchall(f"SELECT {', '.join(_COLS)} FROM shipments ORDER BY CASE status WHEN 'in_transit' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, created_at DESC LIMIT 200")
    items = [_live(dict(zip(_COLS, r)), blocked, with_geometry=(r[0] == geometry_for)) for r in rows]
    active = [i for i in items if i["status"] in ("planned", "in_transit")]
    today = _now().date().isoformat()
    return {
        "shipments": items,
        "summary": {
            "in_transit": sum(i["status"] == "in_transit" for i in items),
            "planned": sum(i["status"] == "planned" for i in items),
            "delivered_today": sum(i["status"] == "delivered" and (i["delivered_at"] or "").startswith(today) for i in items),
            "with_alerts": sum(bool(i["alerts"]) for i in active),
            "cut_off": sum(any(a["type"] == "cut_off" for a in i["alerts"]) for i in active),
        },
    }


def _set_status(sid: int, status: str, extra_sql: str = "", args: tuple = ()):
    if not _row("WHERE id = ?", (sid,)):
        raise HTTPException(status_code=404, detail=f"No shipment {sid}")
    db.execute(f"UPDATE shipments SET status = ?{extra_sql} WHERE id = ?", (status, *args, sid))
    return _live(_row("WHERE id = ?", (sid,)), _blocked())


@router.post("/api/shipments/{sid}/start")
def start(sid: int, user: dict = Depends(auth.require_auth)):
    return _set_status(sid, "in_transit", ", started_at = COALESCE(started_at, ?)", (_now().isoformat(),))


@router.post("/api/shipments/{sid}/deliver")
def deliver(sid: int, user: dict = Depends(auth.require_auth)):
    return _set_status(sid, "delivered", ", delivered_at = ?", (_now().isoformat(),))


@router.post("/api/shipments/{sid}/cancel")
def cancel(sid: int, user: dict = Depends(auth.require_auth)):
    return _set_status(sid, "cancelled")


@router.post("/api/shipments/{sid}/simulate")
def simulate(sid: int, body: SimulateIn, user: dict = Depends(auth.require_auth)):
    """DEMO ONLY: put the vehicle `progress` of the way along its planned route (marked simulated)."""
    s = _row("WHERE id = ?", (sid,))
    if not s:
        raise HTTPException(status_code=404, detail=f"No shipment {sid}")
    plan = _route(s["o_lat"], s["o_lon"], s["d_lat"], s["d_lon"], [])
    pts = [p for line in plan["normal"]["geometry"]["coordinates"] for p in line]
    lon, lat = pts[min(len(pts) - 1, int(body.progress * (len(pts) - 1)))]
    started = s["started_at"] or (_now() - timedelta(minutes=s["planned_minutes"] * body.progress)).isoformat()
    db.execute("UPDATE shipments SET last_lat = ?, last_lon = ?, last_ping_at = ?, status = 'in_transit', started_at = ?, simulated = 1 WHERE id = ?",
               (lat, lon, _now().isoformat(), started, sid))
    return _live(_row("WHERE id = ?", (sid,)), _blocked())


# ---------- driver tracking link (no account; the token is the secret) ----------
def _by_token(token: str) -> dict:
    s = _row("WHERE track_token = ?", (token,))
    if not s:
        raise HTTPException(status_code=404, detail="Unknown tracking link")
    return s


@router.get("/api/track/{token}")
def track_view(token: str):
    s = _live(_by_token(token), _blocked())
    return {k: s[k] for k in ("id", "commodity", "quantity", "unit", "priority", "origin_name", "dest_name", "d_lat", "d_lon",
                              "vehicle_reg", "status", "eta", "delay_min", "remaining", "alerts")}


@router.post("/api/track/{token}/ping")
def ping(token: str, body: PingIn):
    s = _by_token(token)
    if s["status"] in ("delivered", "cancelled"):
        raise HTTPException(status_code=409, detail=f"This shipment is {s['status']}; tracking has stopped")
    started = s["started_at"] or _now().isoformat()
    db.execute("UPDATE shipments SET last_lat = ?, last_lon = ?, last_speed = ?, last_ping_at = ?, status = 'in_transit', started_at = ?, simulated = 0 WHERE id = ?",
               (body.lat, body.lon, body.speed_kmh, _now().isoformat(), started, s["id"]))
    return track_view(token)
