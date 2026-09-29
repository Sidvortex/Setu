"""
Logistics engine for the whole North Eastern Region.

Network: backend/data/networks/ner/, built by BhooSuraksha's
data-pipeline/build_region_network.py from PMGSY GeoSadak (8 states,
~180,000 km, ~208,000 junctions). Routing uses scipy's sparse-graph tools
(far lighter in memory than networkx at this size).

Endpoints (under /api/logistics):
  GET  /region                 region report + every district (for selectors / overview)
  GET  /network?district=ID    that district's roads as GeoJSON (the browser never loads the whole region)
  GET  /region-map             major roads (NH/SH/MDR) of all 8 states, simplified, plus any
                               edges passed in ?include= (e.g. blocked village roads)
  GET  /places?district=ID     its villages (by population) and facilities
  POST /route                  fastest route, anywhere in NER; compares normal vs with blocked roads
  POST /impact                 who loses access when roads are blocked (see below)

"Cut off" is measured against the regional road network by default: a
village/facility is cut off when a blockage separates it from the main
connected network it was part of. Optionally, pass a hub point to measure
"can no longer reach this place" instead (e.g. a district HQ).

Places already disconnected in the source data (Sikkim, southern Mizoram,
Tawang, ...) are never counted as cut off by a blockage.
Travel times use assumed hill-road speeds, not measured ones.
"""
import json
import os
from functools import lru_cache
from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
from pyproj import Transformer
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

NET = os.path.join(os.path.dirname(__file__), "data", "networks", "ner")
_to_utm = Transformer.from_crs(4326, 32646, always_xy=True)
router = APIRouter(prefix="/api/logistics", tags=["logistics"])

# ---------- load once ----------
EDGES = pd.read_csv(os.path.join(NET, "edges.csv.gz"), dtype={"road_name": str, "owner": str}, keep_default_na=False)
_nodes = np.load(os.path.join(NET, "nodes.npz"))
NODE_XY, NODE_LL = _nodes["xy"], _nodes["lonlat"]
_geom = np.load(os.path.join(NET, "geom.npz"))
GEOM_COORDS, GEOM_OFFSETS = _geom["coords"], _geom["offsets"]
def _places_csv(name: str, numeric: tuple) -> pd.DataFrame:
    """Names may be blank (keep as ""), but numeric columns must be numbers: some
    GeoSadak villages have no population recorded, which counts as 0."""
    df = pd.read_csv(os.path.join(NET, name), keep_default_na=False)
    for col in numeric:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


VILLAGES = _places_csv("villages.csv.gz", ("id", "population", "district_id", "node", "dist_m", "lat", "lon"))
FACILITIES = _places_csv("facilities.csv.gz", ("id", "district_id", "node", "dist_m", "lat", "lon"))
VILLAGES["population"] = VILLAGES.population.astype(int)
with open(os.path.join(NET, "districts.json")) as f:
    DISTRICTS = json.load(f)
with open(os.path.join(NET, "report.json")) as f:
    REPORT = json.load(f)
DISTRICT_BY_ID = {d["district_id"]: d for d in DISTRICTS}
N_NODES = len(NODE_XY)
_KD = cKDTree(NODE_XY)
_U, _V, _W = EDGES.u.to_numpy(), EDGES.v.to_numpy(), EDGES.travel_min.to_numpy()
# (min node, max node) -> edge id of the fastest parallel edge, to turn node paths back into roads
_order = np.argsort(_W)[::-1]
_EDGE_OF = {(min(a, b), max(a, b)): int(e) for a, b, e in zip(_U[_order], _V[_order], EDGES.edge_id.to_numpy()[_order])}


def _graph(blocked: Optional[set] = None):
    keep = np.ones(len(EDGES), bool)
    if blocked:
        keep[list(blocked)] = False
    return coo_matrix((_W[keep], (_U[keep], _V[keep])), shape=(N_NODES, N_NODES)).tocsr()


def _components(blocked: Optional[set] = None):
    return connected_components(_graph(blocked), directed=False)[1]


_BASE_LABELS = _components()
MAIN_LABEL = int(np.bincount(_BASE_LABELS).argmax())


def edge_district(edge_id: int) -> Optional[dict]:
    return DISTRICT_BY_ID.get(int(EDGES.district_id.iat[edge_id]))


def edge_coords(edge_id: int) -> list:
    a, b = GEOM_OFFSETS[edge_id], GEOM_OFFSETS[edge_id + 1]
    return [[round(float(x), 5), round(float(y), 5)] for x, y in GEOM_COORDS[a:b]]


def nearest_node(lat: float, lon: float):
    x, y = _to_utm.transform(lon, lat)
    d, n = _KD.query([x, y])
    return int(n), float(d)


def is_human_health(name: str, category: str) -> bool:
    """GeoSadak files veterinary dispensaries under "Medical" too; count facilities for people only."""
    return category == "Medical" and not any(k in name.lower() for k in ("veterinary", "vety"))


# ---------- models ----------
class Point(BaseModel):
    lat: float
    lon: float


class RouteRequest(BaseModel):
    origin: Point
    destination: Point
    blocked_edge_ids: List[int] = []


class ImpactRequest(BaseModel):
    blocked_edge_ids: List[int]
    hub: Optional[Point] = None


# ---------- endpoints ----------
@router.get("/region")
def region():
    return {"report": REPORT, "districts": DISTRICTS}


@lru_cache(maxsize=128)
def _district_geojson(district_id: int) -> dict:
    rows = EDGES[EDGES.district_id == district_id]
    return {"type": "FeatureCollection", "features": [_feature(r, edge_coords(int(r.edge_id))) for r in rows.itertuples()]}


REGION_CATEGORIES = ("NH", "SH", "MDR")


def _decimated(edge_id: int, step: float = 0.003) -> list:
    """Coarser shape for the whole-region view: keep points ~300 m apart (plus both ends)."""
    c = GEOM_COORDS[GEOM_OFFSETS[edge_id]:GEOM_OFFSETS[edge_id + 1]]
    out = [c[0]]
    for p in c[1:-1]:
        if abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) >= step:
            out.append(p)
    out.append(c[-1])
    return [[round(float(x), 4), round(float(y), 4)] for x, y in out]


def _feature(r, coords) -> dict:
    return {"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"edge_id": int(r.edge_id), "category": r.category, "road_name": r.road_name,
                           "length_m": float(r.length_m), "travel_min": float(r.travel_min),
                           "in_main_network": bool(_BASE_LABELS[r.u] == MAIN_LABEL)}}


@lru_cache(maxsize=1)
def _region_features() -> tuple:
    rows = EDGES[EDGES.category.isin(REGION_CATEGORIES)]
    return tuple(_feature(r, _decimated(int(r.edge_id))) for r in rows.itertuples())


@lru_cache(maxsize=1)
def _region_features_json() -> str:
    return ",".join(json.dumps(f, separators=(",", ":")) for f in _region_features())


@router.get("/region-map")
def region_map(include: str = ""):
    # Pre-serialised: re-encoding ~50,000 features per request took ~2 s
    extra = {int(x) for x in include.split(",") if x.strip().isdigit() and int(x) < len(EDGES)}
    extra -= set(EDGES.index[EDGES.category.isin(REGION_CATEGORIES)].intersection(list(extra)))
    extra_json = "".join("," + json.dumps(_feature(r, edge_coords(int(r.edge_id))), separators=(",", ":"))
                         for r in EDGES.iloc[sorted(extra)].itertuples()) if extra else ""
    district = json.dumps({"district_id": 0, "name": "All North East (major roads)", "state": "All North East"})
    body = f'{{"district":{district},"roads":{{"type":"FeatureCollection","features":[{_region_features_json()}{extra_json}]}}}}'
    return Response(content=body, media_type="application/json")


@router.get("/network")
def network(district: int = Query(..., description="district_id from /region")):
    d = DISTRICT_BY_ID.get(district)
    if not d:
        raise HTTPException(status_code=404, detail=f"Unknown district {district}")
    return {"district": d, "roads": _district_geojson(district)}


@router.get("/places")
def places(district: int = Query(...), villages_limit: int = 80):
    if district not in DISTRICT_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown district {district}")
    v = VILLAGES[VILLAGES.district_id == district].sort_values("population", ascending=False).head(villages_limit)
    f = FACILITIES[FACILITIES.district_id == district]
    return {
        "district": DISTRICT_BY_ID[district],
        "villages": [{"id": int(r.id), "name": r.name, "population": int(r.population), "lat": r.lat, "lon": r.lon} for r in v.itertuples()],
        "facilities": [{"id": int(r.id), "name": r.name, "category": r.category, "lat": r.lat, "lon": r.lon,
                        "health": is_human_health(r.name, r.category)} for r in f.itertuples()],
    }


def _shortest(graph, o: int, d: int):
    dist, pred = dijkstra(graph, directed=False, indices=o, return_predecessors=True)
    if not np.isfinite(dist[d]):
        return None
    path = [d]
    while path[-1] != o:
        path.append(int(pred[path[-1]]))
    path.reverse()
    edges = [_EDGE_OF[(min(a, b), max(a, b))] for a, b in zip(path, path[1:])]
    return {
        "minutes": round(float(dist[d]), 1),
        "km": round(float(EDGES.length_m.to_numpy()[edges].sum()) / 1000, 1),
        "edge_ids": edges,
        "geometry": {"type": "MultiLineString", "coordinates": [edge_coords(e) for e in edges]},
    }


@router.post("/route")
def route(req: RouteRequest):
    o, o_snap = nearest_node(req.origin.lat, req.origin.lon)
    d, d_snap = nearest_node(req.destination.lat, req.destination.lon)
    if o == d:
        raise HTTPException(status_code=422, detail="Origin and destination snap to the same point on the road network")
    snap = {"origin": round(o_snap), "destination": round(d_snap)}
    normal = _shortest(_graph(), o, d)
    if normal is None:
        # not a blockage: the source road data has no link between these places
        return {"status": "no_data_link", "normal": None, "current": None, "delay_min": None, "snap_m": snap}
    blocked = set(req.blocked_edge_ids)
    if not blocked:
        return {"status": "ok", "normal": normal, "current": normal, "delay_min": 0, "snap_m": snap}
    cur = _shortest(_graph(blocked), o, d)
    if cur is None:
        return {"status": "unreachable", "normal": normal, "current": None, "delay_min": None, "snap_m": snap}
    delay = round(cur["minutes"] - normal["minutes"], 1)
    return {"status": "rerouted" if delay > 0.05 else "ok", "normal": normal, "current": cur, "delay_min": max(delay, 0), "snap_m": snap}


@router.post("/impact")
def impact(req: ImpactRequest):
    blocked = set(req.blocked_edge_ids)
    after = _components(blocked) if blocked else _BASE_LABELS
    if req.hub:
        hub, _ = nearest_node(req.hub.lat, req.hub.lon)
        before_ok, after_ok = _BASE_LABELS == _BASE_LABELS[hub], after == after[hub]
    else:
        before_ok = _BASE_LABELS == MAIN_LABEL
        after_ok = after == int(np.bincount(after).argmax())
    lost = before_ok & ~after_ok

    near = VILLAGES.dist_m.to_numpy() <= 1000
    v_cut = VILLAGES[near & lost[VILLAGES.node.to_numpy()]]
    f_cut = FACILITIES[lost[FACILITIES.node.to_numpy()]]
    by_district = {}
    for r in v_cut.itertuples():
        e = by_district.setdefault(int(r.district_id), {"villages": 0, "population": 0})
        e["villages"] += 1; e["population"] += int(r.population)
    return {
        "mode": "hub" if req.hub else "regional network",
        "villages_cut_off": int(len(v_cut)),
        "population_cut_off": int(v_cut.population.sum()),
        "facilities_cut_off": [{"id": int(r.id), "name": r.name, "category": r.category, "lat": r.lat, "lon": r.lon,
                                "district": DISTRICT_BY_ID.get(int(r.district_id), {}).get("name", ""),
                                "health": is_human_health(r.name, r.category)} for r in f_cut.itertuples()],
        "by_district": [{"district_id": k, "name": DISTRICT_BY_ID.get(k, {}).get("name", ""),
                         "state": DISTRICT_BY_ID.get(k, {}).get("state", ""), **val}
                        for k, val in sorted(by_district.items(), key=lambda kv: -kv[1]["population"])],
    }
