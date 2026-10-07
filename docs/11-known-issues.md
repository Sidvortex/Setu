# 11. Known issues

Everything we know is missing, approximate or fragile, grouped by area. Each
item says what the effect is and, where there is one, the planned fix (see
[Roadmap](12-roadmap.md)).

## Data

| Issue | Effect | Planned fix |
|---|---|---|
| **Gaps in the source road data:** Sikkim (its link runs through West Bengal), southern Mizoram (Lunglei, Lawngtlai, Saiha), Tawang, Dibang Valley | Routes into these areas show "no road link in the source data"; Sikkim's rural population shows 0% on the main network | Fill the gaps from OpenStreetMap |
| **Snapshot from March 2022** | Roads built since then are missing; old district names (N.C. Hills for Dima Hasao); newer districts don't exist | Download newer layers from the official GeoSadak portal and rebuild |
| **Assumed speeds** (NH 35 … track 8 km/h), the same everywhere | Travel times are rough; plains highways look too slow | Use speeds measured from driver tracking |
| **No road surface type** in GeoSadak | Can't tell paved from unpaved, though unpaved roads fail first in the monsoon | Add from OpenStreetMap or field data |
| **Crossings treated as junctions** | A flyover or bridge over another road becomes a false turn | Use OpenStreetMap layer/bridge tags |
| **Population is rural only** (GeoSadak habitations, Census-2011-based estimates) | Town residents (e.g. Haflong town) aren't counted in "people cut off" | Add town populations from the Census |
| **"Health facility" decided by name** (Medical category minus names with "veterinary"/"vety") | A few misfiled facilities may be counted wrongly | Cross-check with the National Health Facility Registry |
| **Edge ids change on every network rebuild** | Saved road blockages point to the wrong roads after a rebuild | Clear blockages before deploying a rebuilt network (documented in [Data](03-data.md)) |
| **Villages more than 1 km from a junction** are not counted in "people cut off" | Undercounts very remote hamlets | Use a larger radius or road-distance attachment |

## Prediction and AI

| Issue | Effect |
|---|---|
| **Landslide risk is seasonal/historical, not live weather.** BhooSuraksha's regional model learned where and in which month landslides were reported (NASA catalogue, 2007–2016) | "Risk today" won't jump after heavy rain; treat it as background risk |
| **No flood prediction yet** | The SIH "predict disruptions" requirement is only partly met |
| **AI photo check tested only against simulated servers** (real request/response formats, not the live APIs) | It may fail on first real use, for example if a default model name has changed; check once with a real key and set `AI_MODEL` if needed |
| **The credibility score is a rule of thumb** | It ranks the review queue; it is not a fact-check |

## Features

| Issue | Effect |
|---|---|
| **No SMS or push alerts** | Alerts appear only in the dashboard and on the driver's page; nobody is notified when away from the screen |
| **Hindi covers navigation and headings only** | Most page text is English. The full translation is planned |
| **Driver tracking needs the page open** | Phones pause web pages in the background or with the screen locked, so positions stop; the `stale` alert catches this after 30 minutes |
| **Driver tracking needs https** | Works on the deployed site; not on a plain-http local network address |
| **Maps need a connection** | Only report submission works offline; the maps and route checks don't |
| **Demo slider on shipments** | Moves a vehicle artificially; such shipments are labelled demo and must not be used as real data |
| **No live road-status feeds** | Status depends on officials and verified reports; ASDMA daily reports (Assam) are manual-only |
| **Blocked roads have no expiry** | A blockage stays until someone reopens it |
| **One role for all officials** | No district-level permissions; any official can block any road in the region |
| **No screens for user management or password change** | Accounts and passwords are managed with `create_admin.py` |
| **Emergency helpline numbers** are typed into `frontend/src/data/helplines.ts` | Verify every number with the state authorities before a public launch |

## Hosting

| Issue | Effect |
|---|---|
| **Free Render backend sleeps after 15 minutes** | First visitor waits about a minute (the site shows a notice). Open the site a few minutes before a demo |
| **750 free hours per month per Render workspace** | Enough for sleeping services; a keep-alive pinger would exhaust it |
| **0.1 CPU, 512 MB memory** | Slow startup; Setu uses ~360 MB, so there's limited room to grow the data in memory |
| **Disk wiped on sleep or redeploy** | Handled: everything persistent is in Turso; photos are cached on disk and restored from the database |
| **Photos stored in the database as base64** | Fine for a prototype; heavy use would grow the database quickly (object storage is cheaper) |
| **Single instance, in-memory caches** | Risk answers and the region map are cached per process; a restart rebuilds them |
| **Third-party map tiles** (OpenStreetMap, OpenTopoMap, OpenFreeMap, AWS Terrain) | Free services with fair-use limits; heavy traffic could be rate-limited, and an outage blanks that map style. 3D buildings are sparse outside towns |
| **Whole-region map is 13.3 MB of JSON (1.2 MB compressed)** | Slow on very weak connections; districts load faster |
| **Large JavaScript chunks** (MapLibre) | The build warns about chunks over 500 KB; first load is heavier |

## Security

See [Security](10-security.md) for detail. In short:

- No limit on failed login attempts; no two-factor login.
- Login tokens in `localStorage`; no server-side logout before the 12-hour
  expiry.
- The public-report rate limit trusts the first `X-Forwarded-For` entry, which
  a client can fake.
- Photo links are viewable by anyone who has them.
- No data-retention policy or privacy notice yet.

## Code

| Issue | Note |
|---|---|
| The `road_status.py` header comment says field reports "will feed this table next" | They already do (verify with *Block road*); the comment is out of date |
| The Tailwind theme inverts the `slate` scale | New components should use `gov-*` colours or explicit values, or the result may be unexpected |
| The test suite runs on local SQLite by default | Turso-specific behaviour is covered only when run with `SETU_TEST_TURSO=1` against a test database |
