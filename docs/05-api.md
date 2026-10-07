# 5. API reference

The backend is a JSON API. A live, clickable version of this reference is at
`<backend address>/docs` (FastAPI's built-in Swagger page), for example
`http://localhost:8100/docs`.

## Conventions

- **Base address:** `http://localhost:8100` locally; the Render URL when
  deployed.
- **Auth:** endpoints marked **Official** need a header
  `Authorization: Bearer <token>`, where the token comes from
  `POST /api/auth/login`. Tokens are JWTs (HS256) valid for **12 hours**.
  Without a valid token: HTTP 401.
- **Errors:** `{"detail": "..."}` with a normal HTTP status: 401 (login
  needed or expired), 404 (not found), 409 (conflict), 413 (photo too large),
  422 (invalid input, including validation errors), 429 (rate limit).
- **Coordinates:** WGS84 latitude/longitude. Report and ping coordinates must
  be inside the NER box: latitude 20–30.5, longitude 87.5–97.5.
- **Compression:** responses over 1 KB are GZip-compressed when the client
  accepts it.
- **Timing:** every response has a `Server-Timing: app;dur=<ms>` header.

## Health

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/health` | — | `{"status": "ok"}` if the process is up |
| GET | `/ready` | — | `status` (`ready` / `not ready`), `database`, `road_network` (e.g. `ok (277986 segments)`), `bhoosuraksha` (`configured`, `url`, `last_ok`, `last_checked`, `last_error`, `cooling_down`). HTTP 503 if not ready |

## Login

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/login` | — | `{"username", "password"}` | `{"token", "user": {"id", "username", "role"}}`; 401 if wrong |
| GET | `/api/auth/me` | Official | — | `{"id", "username", "role"}` |

## Road network and routing (`/api/logistics`)

| Method | Path | Auth | Input | Returns |
|---|---|---|---|---|
| GET | `/api/logistics/region` | — | — | `report` (region build summary, see [Data](03-data.md)) and `districts` (every district: `district_id, name, state, bbox, road_km, segments, villages, population, population_on_main_network_pct`) |
| GET | `/api/logistics/region-map` | — | `?include=1,2,3` (optional extra edge ids) | GeoJSON of NH/SH/MDR roads for all 8 states, simplified to points ~300 m apart, plus any edges listed in `include` (e.g. blocked village roads). Built once, then served from memory |
| GET | `/api/logistics/network` | — | `?district=ID` | `district` info and `roads` (GeoJSON; each feature has `edge_id, category, road_name, length_m, travel_min, in_main_network`) |
| GET | `/api/logistics/places` | — | `?district=ID&villages_limit=N` | `district`, `villages` (`id, name, population, lat, lon`, largest first), `facilities` (`id, name, category, lat, lon, health`) |
| POST | `/api/logistics/route` | — | `{"origin": {"lat","lon"}, "destination": {"lat","lon"}, "blocked_edge_ids": []}` | See below |
| POST | `/api/logistics/impact` | — | `{"blocked_edge_ids": [..], "hub": {"lat","lon"}}` (`hub` optional) | See below |

**Route response:**

```json
{
  "status": "ok | rerouted | unreachable | no_data_link",
  "normal":  {"minutes": 312.4, "km": 201.7, "edge_ids": [...], "geometry": {GeoJSON MultiLineString}},
  "current": {"minutes": 340.1, "km": 214.0, "edge_ids": [...], "geometry": {...}},
  "delay_min": 27.7,
  "snap_m": {"origin": 120, "destination": 45}
}
```

- `normal` ignores blockages; `current` avoids the roads blocked in the
  database **plus** `blocked_edge_ids` from the request (what-if).
- `unreachable`: `current` is `null`. `no_data_link`: both are `null` (no
  connection even in the source data).
- `snap_m`: how far each point was from the nearest junction.
- 422 if origin and destination snap to the same junction.

**Impact response:**

```json
{
  "mode": "regional network | hub",
  "villages_cut_off": 30,
  "population_cut_off": 5989,
  "facilities_cut_off": [{"id","name","category","lat","lon","district","health"}],
  "by_district": [{"district_id","name","state","villages","population"}]
}
```

Default mode: a place is cut off when the blockages separate it from the main
regional network. With `hub`: a place is cut off when it can no longer reach
the hub (for example a district headquarters). Only villages within 1 km of a
junction are counted.

## Road status

| Method | Path | Auth | Input | Returns |
|---|---|---|---|---|
| GET | `/api/roads/blocked` | — | — | `{"blocked": [{edge_id, reason, note, reported_by, created_at, road_name, category, length_m, district_id, district, state}]}` |
| POST | `/api/roads/blocked` | Official | `{"edge_id", "reason", "note"}`; `reason` is one of Landslide, Flood, Bridge damage, Road collapse, Fallen tree, Accident, Construction, Other | `{"status": "blocked", "edge_id"}`; 404 if the edge doesn't exist |
| DELETE | `/api/roads/blocked/{edge_id}` | Official | — | Reopens the road |
| GET | `/api/connectivity/summary` | — | `?district=ID` (optional) | `region, road_km_total, districts, population_total, roads_blocked, km_blocked, population_cut_off, villages_cut_off, facilities_cut_off, health_facilities_cut_off[], cut_off_by_district[], blocked[], landslide_risk` |

`landslide_risk` is filled only when a district is given and BhooSuraksha is
connected: `{source, probability, risk_level, explanation}`, otherwise `null`.

## Field incidents (`/api/incidents`)

| Method | Path | Auth | Input | Returns |
|---|---|---|---|---|
| POST | `/api/incidents` | Official | Report body (below) | The saved report, with `duplicate` |
| POST | `/api/incidents/public` | — | Report body + optional `contact` | A **receipt** only: `{id, status, road_name, district, snap_m, duplicate}`. Rate limit: 5 per hour per connection (429) |
| GET | `/api/incidents` | Official | `?status=reported\|verified\|rejected&source=official\|public` | `{"incidents": [...], "ai_check": true/false}` (latest 300, newest first) |
| POST | `/api/incidents/{id}/verify` | Official | `{"block_road": false}` | The report, plus `road_blocked`. 422 if `block_road` is true but the report isn't near a mapped road |
| POST | `/api/incidents/{id}/reject` | Official | — | The report |
| GET | `/api/incidents/photos/{name}` | — | — | The JPEG/PNG photo. Names are random 32-hex strings, so photos can't be guessed |

**Report body:**

| Field | Type | Rules |
|---|---|---|
| `client_id` | string | 8–64 characters, made on the device; the same `client_id` again returns the first report (`duplicate: true`) |
| `lat`, `lon` | number | Inside the NER box |
| `incident_type` | string | Landslide, Flood, Bridge damage, Road collapse, Fallen tree, Accident, Construction, Other |
| `severity` | string | Low, Medium, High |
| `description` | string, optional | Up to 1,000 characters |
| `photo_base64` | string, optional | JPEG or PNG, base64 (a `data:` prefix is fine), max 3 MB decoded |
| `captured_at` | ISO time, optional | When the photo was taken |
| `contact` | string, optional | Public reports only |

**Each listed report has:** `id, client_id, lat, lon, edge_id, snap_m,
incident_type, severity, description, photo, photo_url, reported_by,
captured_at, created_at, status, reviewed_by, reviewed_at, source, contact,
credibility, credibility_level, credibility_reasons[{points, reason}],
ai_verdict, road_name, road_category, district, state`.

The report is snapped to the nearest road within 2 km (`edge_id`,
`snap_m`); farther than that, `edge_id` is `null`.

## Shipments and tracking

| Method | Path | Auth | Input | Returns |
|---|---|---|---|---|
| POST | `/api/shipments` | Official | Shipment body (below) | The shipment with its planned route, `track_token`, ETA and alerts |
| GET | `/api/shipments` | Official | `?geometry_for=ID` (include route geometry for one shipment) | `{"shipments": [...], "summary": {in_transit, planned, delivered_today, with_alerts, cut_off}}` (latest 200, in-transit first) |
| POST | `/api/shipments/{id}/start` | Official | — | Status → `in_transit` |
| POST | `/api/shipments/{id}/deliver` | Official | — | Status → `delivered` |
| POST | `/api/shipments/{id}/cancel` | Official | — | Status → `cancelled` |
| POST | `/api/shipments/{id}/simulate` | Official | `{"progress": 0.0–1.0}` | **Demo only:** puts the vehicle that fraction of the way along its route and marks it simulated |
| GET | `/api/track/{token}` | — (token) | — | What the driver sees: `id, commodity, quantity, unit, priority, origin_name, dest_name, d_lat, d_lon, vehicle_reg, status, eta, delay_min, remaining, alerts` |
| POST | `/api/track/{token}/ping` | — (token) | `{"lat", "lon", "speed_kmh"}` | Updated shipment. 409 once delivered or cancelled; 404 for an unknown token |

**Shipment body:**

| Field | Rules |
|---|---|
| `commodity` | Medicines, Food, Drinking water, Agricultural produce, Fuel, Construction materials, Emergency supplies |
| `quantity`, `unit` | number; kg, tonnes, litres, boxes, units |
| `priority` | Critical, High, Normal |
| `origin`, `destination` | `{"name", "lat", "lon"}` |
| `vehicle_reg` | 3–20 characters |
| `driver_name` | optional |

**Each shipment has:** the stored fields (`id, commodity, quantity, unit,
priority, origin_name, o_lat, o_lon, dest_name, d_lat, d_lon, vehicle_reg,
driver_name, status, track_token, planned_minutes, planned_km, created_by,
created_at, started_at, delivered_at, last_lat, last_lon, last_speed,
last_ping_at, simulated`) plus computed `eta`, `delay_min`, `remaining`
(route from the last position), `alerts[{type, text}]` and `tracking_path`
(`/track/<token>`).

Alert types: `cut_off`, `rerouted`, `delayed` (more than 30 min late),
`stale` (no position for 30+ min while in transit).

## Calling BhooSuraksha (outgoing)

Setu makes one kind of outgoing call:

```
POST {BHOOSURAKSHA_API_URL}/api/predict/region
{"latitude": 25.17, "longitude": 93.02, "date": "2026-10-07"}
→ {"probability": 0.67, "risk_level": "HIGH", "explanation": "...", ...}
```

and one `GET {BHOOSURAKSHA_API_URL}/health` at startup to wake it. See
[Architecture](02-architecture.md#the-bhoosuraksha-link).
