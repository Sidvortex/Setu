# 6. Backend

Python 3.12, FastAPI, in `backend/`. Run with
`uvicorn app:app --reload --port 8100`.

## Modules

| File | Responsibility |
|---|---|
| `app.py` | Creates the FastAPI app. Startup (`lifespan`): checks production settings, logs storage and account count, logs the BhooSuraksha link and CORS origins, wakes BhooSuraksha in the background. Middleware: CORS, GZip, timing. Endpoints: `/health`, `/ready`, `/api/auth/login`, `/api/auth/me`. Includes the routers below |
| `config.py` | All settings in one validated `Settings` class (pydantic-settings), read from environment variables or a local `.env`. `check_production()` refuses to start in production with a weak secret |
| `auth.py` | `users` table, bcrypt password hashes, JWT sessions (`issue_token`, `require_auth`), `create_user`, `set_password`, `verify_login`, `count_users`. Chooses Turso or local SQLite |
| `create_admin.py` | Command-line tool: create an officer account or reset a password (see below) |
| `db.py` | `execute`, `fetchall`, `fetchone` for Setu's operational tables; Turso or local SQLite (`data/setu.db`) |
| `turso_http.py` | Minimal Turso client over HTTPS (`/v2/pipeline`), same shape as the old `libsql_client` sync API; one pooled connection; cleans stray whitespace from the URL and token |
| `logistics.py` | Loads the road network at import; sparse graph; `nearest_node`, `edge_coords`, `is_human_health`; endpoints under `/api/logistics` |
| `road_status.py` | `road_blocks` table; block / reopen; connectivity summary (with landslide risk) |
| `incidents.py` | `incidents` and `incident_photos` tables; official and public reports; snapping to the nearest road; duplicate and photo-reuse detection; rate limit; review; background enrichment |
| `credibility.py` | Rule-based credibility score; optional AI photo check (Gemini or Anthropic over httpx) |
| `shipments.py` | `shipments` table; create/start/deliver/cancel/simulate; driver tracking token; ETA, delay, remaining route, alerts |
| `risk_client.py` | The only caller of BhooSuraksha: pooled client, per-day cache, failure cooldown, startup wake ping, status for `/ready` |

## Settings

All read by `config.py` (except the two Turso variables, read by `auth.py`
and `db.py`). A template is in `backend/.env.example`; copy it to
`backend/.env` for local use. **Never commit `.env`.**

| Variable | Default | Meaning |
|---|---|---|
| `SETU_ENV` | `development` | `production` refuses to start unless `AUTH_SECRET` is 32+ characters and not the default; warns if `ALLOWED_ORIGINS` is `*` |
| `AUTH_SECRET` | an insecure dev value | Signs login tokens and keys the IP hashes. Render generates it |
| `ALLOWED_ORIGINS` | `*` | Websites allowed to call the API (CORS), comma-separated |
| `TURSO_DATABASE_URL` | empty | `libsql://...turso.io`; empty = local SQLite |
| `TURSO_AUTH_TOKEN` | empty | Turso database token |
| `BHOOSURAKSHA_API_URL` | empty | BhooSuraksha backend address, no trailing slash; empty = risk card hidden |
| `BHOOSURAKSHA_TIMEOUT_S` | `4` | Timeout per risk call (max 30) |
| `RISK_CACHE_MINUTES` | `30` | How long a risk answer is reused |
| `RISK_FAILURE_COOLDOWN_S` | `120` | After a failed call, skip BhooSuraksha this long |
| `AI_PROVIDER` | empty | `gemini` or `anthropic` to turn on the AI photo check |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | empty | Key for the chosen provider |
| `AI_MODEL` | empty | Override the default model (`gemini-2.5-flash` / `claude-sonnet-5`) |
| `AI_TIMEOUT_S` | `30` | Timeout for the AI call (max 120) |
| `PYTHON_VERSION` | — | Render only: `3.12.11` (set in `render.yaml`) |

## Database tables

All tables are created automatically at startup (`CREATE TABLE IF NOT
EXISTS`); columns added later are added with `ALTER TABLE` when missing, so an
older database upgrades itself.

**`users`** — `id, username (unique), password_hash (bcrypt), role
('authority'), created_at`

**`road_blocks`** — `edge_id (primary key), reason, note, reported_by,
created_at`

**`incidents`** — `id, client_id (unique), lat, lon, edge_id, snap_m,
incident_type, severity, description, photo, reported_by, captured_at,
created_at, status ('reported'|'verified'|'rejected'), reviewed_by,
reviewed_at, source ('official'|'public'), ip_hash, photo_sha, contact,
credibility, credibility_reasons (JSON), ai_verdict (JSON)`

**`incident_photos`** — `name (primary key), data (base64)`

**`shipments`** — `id, commodity, quantity, unit, priority, origin_name,
o_lat, o_lon, dest_name, d_lat, d_lon, vehicle_reg, driver_name, status
('planned'|'in_transit'|'delivered'|'cancelled'), track_token (unique),
planned_minutes, planned_km, created_by, created_at, started_at,
delivered_at, last_lat, last_lon, last_speed, last_ping_at, simulated`

Locally there are two SQLite files: `data/auth.db` (users) and
`data/setu.db` (everything else). With Turso, all tables live in one database.

## Officer accounts: `create_admin.py`

```bash
python create_admin.py <username>             # asks for the password twice (hidden)
python create_admin.py <username> --reset     # change an existing account's password
python create_admin.py <username> <password>  # non-interactive (ends up in shell history)
```

Passwords must be at least 10 characters. Running it for a username that
already exists tells you to use `--reset`. To create accounts in the
**deployed** database, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the
same terminal first (see [Deployment](09-deployment.md#step-5--officer-accounts)).

## How routing works

1. At import, `logistics.py` loads `edges.csv.gz` and builds a sparse matrix
   (scipy) of travel minutes between junctions; roads are treated as two-way
   (`directed=False`).
2. It labels connected components once; the largest is the "main network"
   (`MAIN_LABEL`). Places outside it are "not linked in the source data".
3. A route snaps both points to junctions (cKDTree over UTM coordinates), then
   runs Dijkstra with predecessors from the origin, and walks back from the
   destination to get the edges.
4. With blockages, the blocked edges are removed from a copy of the matrix and
   Dijkstra runs again; the difference in minutes is the delay.
5. Impact recomputes connected components without the blocked edges and
   compares each village's and facility's component before and after.

## Background work

FastAPI `BackgroundTasks` run after the response is sent:

- `incidents._enrich`: BhooSuraksha risk for landslide reports and the AI
  photo check, then updates the score.
- `risk_client.wake()`: a daemon thread at startup pinging BhooSuraksha's
  `/health` (90 s timeout).

## Logging

Standard Python logging, `INFO` level, format
`time LEVEL logger: message`. Startup prints:

```
[auth] storage: Turso | registered accounts: 2
[risk] BhooSuraksha link: https://bhoosuraksha-api.onrender.com
[cors] allowed origins: https://<your-site>.vercel.app
```

Requests slower than 1 s are logged as warnings with their path and time.

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q            # 15 tests, about 4 s
```

They use a throwaway database and upload folder (`tests/conftest.py`), and a
logged-in test official. To run the same tests against a Turso-compatible
endpoint: set `SETU_TEST_TURSO=1` plus `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN` (use a test database, never production).

| Test | Checks |
|---|---|
| `test_health_and_ready` | `/health` and `/ready` answer, network loaded |
| `test_production_refuses_insecure_secret` | Production mode won't start with the default secret |
| `test_officials_only` | Official endpoints reject requests without a token |
| `test_routes_across_states` | A route across state borders works |
| `test_region_map` | The whole-region map loads |
| `test_blocking_haflong_road_cuts_off_haflong` | Blocking edge 99229 cuts off 30 villages, 5,989 people, Haflong Civil Hospital; reopening restores it |
| `test_public_report_receipt_hides_scoring` | Public receipts don't reveal the credibility score |
| `test_copied_photo_is_flagged` | A reused photo caps the score at 35 ("likely false") |
| `test_public_rate_limit` | The 6th public report in an hour gets 429 |
| `test_saving_a_report_never_waits_on_bhoosuraksha` | Reporters never wait for the risk check |
| `test_shipment_alerts_when_its_road_is_blocked` | Blocking a shipment's road raises an alert |
| `test_down_bhoosuraksha_costs_one_timeout_not_many` | Failure cooldown works |
| `test_startup_wakes_bhoosuraksha_in_background` | The startup wake ping doesn't block and clears the cooldown |
| `test_photo_survives_a_wiped_disk` | Photos are restored from the database after the disk is wiped |
| `test_turso_token_with_stray_newline_is_cleaned` | A pasted token with a newline still works |

Run them before every push.

## Dependencies

Pinned in `requirements.txt` to the versions the tests passed with:

| Package | Version | Used for |
|---|---|---|
| fastapi | 0.141.1 | Web framework |
| uvicorn | 0.53.0 | Server |
| starlette | 1.6.0 | FastAPI's base |
| pydantic / pydantic-settings | 2.13.5 / 2.15.0 | Validation, settings |
| httpx | 0.28.1 | Calls to BhooSuraksha, Turso, AI |
| bcrypt | 5.0.0 | Password hashing |
| PyJWT | 2.7.0 | Login tokens |
| numpy / pandas / scipy | 2.4.4 / 3.0.2 / 1.17.1 | Network loading and routing |
| pyproj | 3.8.0 | Coordinate projection |

`requirements-dev.txt` adds pytest and Pillow (to make test photos).

## Adding a new feature module

1. Create `backend/<name>.py` with an `APIRouter` and its own
   `CREATE TABLE IF NOT EXISTS` through `db.execute`.
2. Protect official endpoints with `user: dict = Depends(auth.require_auth)`.
3. Include the router in `app.py`.
4. Add tests in `tests/test_setu.py`.
5. Document the endpoints in [API reference](05-api.md).
