"""
Road status: which roads are currently blocked, shared by every user, and the
district connectivity picture that follows from it.

Endpoints:
  GET    /api/roads/blocked            current blockages (public — "is my road open?")
  POST   /api/roads/blocked            mark a road blocked       (officials only)
  DELETE /api/roads/blocked/{edge_id}  reopen a road             (officials only)
  GET    /api/connectivity/summary     blocked roads -> people / villages /
                                       facilities cut off from the district HQ,
                                       plus BhooSuraksha's landslide risk if available

Blockages are entered by officials for now; field incident reports will feed
this table next.
"""
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import db
import logistics
import risk_client

router = APIRouter(tags=["road status"])

db.execute("""
    CREATE TABLE IF NOT EXISTS road_blocks (
        edge_id INTEGER PRIMARY KEY,
        reason TEXT NOT NULL,
        note TEXT,
        reported_by TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
""")

Reason = Literal["Landslide", "Flood", "Bridge damage", "Road collapse", "Fallen tree", "Accident", "Construction", "Other"]


class BlockRequest(BaseModel):
    edge_id: int
    reason: Reason
    note: Optional[str] = None


def _blocked_rows() -> list:
    rows = db.fetchall("SELECT edge_id, reason, note, reported_by, created_at FROM road_blocks ORDER BY created_at DESC")
    out = []
    for edge_id, reason, note, by, at in rows:
        if not 0 <= edge_id < len(logistics.EDGES):
            continue
        r = logistics.EDGES.iloc[edge_id]
        d = logistics.edge_district(edge_id) or {}
        out.append({"edge_id": edge_id, "reason": reason, "note": note, "reported_by": by, "created_at": at,
                    "road_name": r.road_name or "Unnamed road", "category": r.category, "length_m": float(r.length_m),
                    "district_id": d.get("district_id"), "district": d.get("name", ""), "state": d.get("state", "")})
    return out


@router.get("/api/roads/blocked")
def list_blocked():
    return {"blocked": _blocked_rows()}


@router.post("/api/roads/blocked")
def block_road(req: BlockRequest, user: dict = Depends(auth.require_auth)):
    if not 0 <= req.edge_id < len(logistics.EDGES):
        raise HTTPException(status_code=404, detail=f"No road segment {req.edge_id}")
    db.execute("DELETE FROM road_blocks WHERE edge_id = ?", (req.edge_id,))
    db.execute("INSERT INTO road_blocks (edge_id, reason, note, reported_by, created_at) VALUES (?, ?, ?, ?, ?)",
               (req.edge_id, req.reason, req.note, user["sub"], datetime.now(timezone.utc).isoformat()))
    return {"status": "blocked", "edge_id": req.edge_id}


@router.delete("/api/roads/blocked/{edge_id}")
def reopen_road(edge_id: int, user: dict = Depends(auth.require_auth)):
    db.execute("DELETE FROM road_blocks WHERE edge_id = ?", (edge_id,))
    return {"status": "open", "edge_id": edge_id}


@router.get("/api/connectivity/summary")
def connectivity_summary(district: Optional[int] = None):
    """Region-wide picture; pass ?district=ID to also get that district's landslide risk."""
    blocked = _blocked_rows()
    ids = [b["edge_id"] for b in blocked]
    impact = logistics.impact(logistics.ImpactRequest(blocked_edge_ids=ids)) if ids else {
        "villages_cut_off": 0, "population_cut_off": 0, "facilities_cut_off": [], "by_district": []}
    risk = None
    if district in logistics.DISTRICT_BY_ID:
        x0, y0, x1, y1 = logistics.DISTRICT_BY_ID[district]["bbox"]
        risk = risk_client.district_risk((y0 + y1) / 2, (x0 + x1) / 2)
    r = logistics.REPORT
    return {
        "region": "North Eastern Region (8 states)",
        "road_km_total": r["road_km"],
        "districts": r["districts"],
        "population_total": r["population"],
        "roads_blocked": len(blocked),
        "km_blocked": round(sum(b["length_m"] for b in blocked) / 1000, 1),
        "population_cut_off": impact["population_cut_off"],
        "villages_cut_off": impact["villages_cut_off"],
        "facilities_cut_off": len(impact["facilities_cut_off"]),
        "health_facilities_cut_off": [f for f in impact["facilities_cut_off"] if f["health"]],
        "cut_off_by_district": impact["by_district"],
        "blocked": blocked,
        "landslide_risk": risk,
    }
