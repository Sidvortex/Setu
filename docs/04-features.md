# 4. Features

Every screen in Setu, what it does, and how it works underneath.

## Public site (no login)

### Home (`/`)

Live numbers for the region at the top (roads blocked now, rural residents
cut off, health facilities unreachable, km of roads and districts covered),
then the services, emergency helplines, and About and data-source
sections. A **Road Alerts** ticker under the navigation bar lists every
currently blocked road, read from `GET /api/roads/blocked`.

### Road Status (`/road-status`)

*"Is my road open?"* A map of the whole North East (major roads: NH, SH and
MDR) or any one of the 98 districts (every road). Blocked roads are drawn in
red. The side panel lists blockages, or says there are none.

- Data: `GET /api/logistics/region-map` (whole region),
  `GET /api/logistics/network?district=ID` (one district),
  `GET /api/roads/blocked`.
- While a new district loads, the previous map stays on screen instead of
  going blank.

### Check a Route (`/route`)

Pick a start and destination: choose a district, then a place (health
facilities first, then the largest villages, then other facilities). Setu
shows the fastest route that avoids currently blocked roads, its length and
travel time, and:

- if blockages force a detour: the normal route dashed, the new route solid,
  and the extra minutes;
- if no route is left: *"Cut off"*;
- if the two places aren't linked even in the source data: *"No road link in
  the source data"* (see the gaps in [Data](03-data.md)).

The public version has no what-if tools.

### Report a Problem (`/report`)

Anyone can report a road problem:

1. **Location:** the phone's GPS (the browser asks permission; this only works
   on `https://` pages or `localhost`).
2. **Type:** Landslide, Flood, Bridge damage, Road collapse, Fallen tree,
   Accident, Construction or Other; **severity:** Low, Medium or High.
3. **Photo** (optional but scored): shrunk in the browser to at most 1280 px
   JPEG (about 150–300 KB) so it uploads on weak networks.
4. **Description**, and an optional contact.

**Offline:** the report is sent straight away. If there is no connection, it
is saved in the phone's browser storage (`setu_incident_queue`) and sent
automatically when the connection returns (when the browser goes back online,
or the next time the page opens). Each report carries a `client_id` made on the
phone, and the server de-duplicates on it, so a retry never creates a second
report.

**What the reporter sees:** a receipt with a report number, the nearest road
and district. The credibility score is *not* shown to the public, so it can't
be gamed.

**Limits:** 5 public reports per hour per connection (HTTP 429 after that).
Nothing closes a road until an official reviews the report.

### Driver tracking (`/track/<token>`)

A driver opens the private link an official sends (by SMS or WhatsApp). No
account and no app. The page shows the shipment, the destination and any
alerts. After **Start sharing location**, it sends the phone's GPS position:

- at most every 30 seconds, or sooner after 200 m of movement, to save
  battery and data;
- without signal, the latest position is kept and sent on reconnect;
- after the shipment is delivered or cancelled, pings are refused (HTTP 409).

The page has to stay open; phones usually pause web pages in the background.

### Site-wide

- **Government-portal layout**: tricolour strip, bilingual branding band,
  navy navigation with dropdowns (keyboard and mobile friendly), breadcrumb
  and page-title band, multi-column footer. The site states *"A student
  initiative · Not an official Government of India website"* and uses an
  original logo, not the State Emblem.
- **Language:** English / हिंदी, with a chooser on the first visit
  (`setu_language`). Only navigation and headings are translated so far.
- **Accessibility tools** (top bar): text size (A-/A/A+), high contrast, big
  cursor, highlighted links, reading-friendly font, extra spacing, reduced
  motion. Each drives a real CSS class and is remembered.
- **Emergency helplines:** 112, 1078 (NDMA), 1070 (SDRF), 1077 (district
  control room), 108 (ambulance) and the Border Roads Organisation line, from
  `frontend/src/data/helplines.ts`.
- **Team links:** names, roles, GitHub and LinkedIn from
  `frontend/src/data/team.ts`.
- **Waking-up notice:** see [Frontend](07-frontend.md#the-wake-up-call).

## Maps (everywhere)

| | |
|---|---|
| **2D** | Leaflet, drawn on canvas for speed |
| **3D** | MapLibre GL with real terrain relief and hillshading (AWS Terrarium) and 3D buildings where OpenStreetMap has them |
| **Styles** | Standard, Terrain (OpenTopoMap) and Dark, in both 2D and 3D |
| **Remembered** | 2D/3D choice and style (`setu_map_prefs`) |
| **Road colours** | NH, SH, MDR in shades of navy (light colours on Dark); other roads grey; roads not connected to the main network pale |
| **Status colours** | Reported blocked: solid red. What-if blocked: dashed red. Selected: orange |

Both maps stay mounted and are switched with CSS visibility, because tearing
down and rebuilding a 3D map with terrain took 25–30 seconds.

## Officials' console (`/ops`, login required)

Sign in at **Officials Login**. Accounts are created with
`backend/create_admin.py`; there is no public sign-up. Sessions last 12 hours.

### Connectivity (`/ops`, the home screen)

- **Region-wide KPIs:** roads blocked (and km blocked), rural population cut
  off (and villages), health facilities cut off (and all facilities), and the
  size of the network (km, districts, states).
- **Map:** the whole North East or any district. **Click a road** to mark it
  blocked (with a reason and note) or to reopen it. Everything recomputes from
  the shared road status, for every user.
- **Cut off, by district:** villages, population and facilities that lost
  their connection to the main network, health facilities called out.
- **Landslide risk today** for the selected district, from BhooSuraksha:
  level, probability and explanation. If BhooSuraksha isn't connected, the card
  says so and everything else still works.

*How "cut off" is measured:* a village or facility is cut off when a blockage
separates it from the main connected network it was part of. Places that were
already disconnected in the source data are never counted as cut off by a
blockage.

### Route Planner (`/ops/routes`)

Everything on the public Check a Route page, plus **what-if blockages**: click
roads to block them hypothetically (dashed red, not saved), and see the new
route and who those blockages would cut off. Useful before closing a road for
construction, or to find single points of failure.

### Field Incidents (`/ops/incidents`)

**Report** tab: the same form as the public one, sent with the officer's
login (so the report starts with a higher credibility score).

**Review** tab: a queue of official and public reports, with tabs for
*Awaiting review*, *Verified* and *Rejected*, and a source filter (all,
official, public). Each
report shows the photo, the map position, the nearest road and how far the
point is from it, and a **credibility score with its reasons**.

- **Verify:** marks the report verified; tick *Block road* to mark its nearest
  road blocked in the same step (reason = the report's type, note = "Field
  report #id: description"). Only possible when the report is within 2 km of
  a mapped road.
- **Reject:** marks it rejected; nothing changes on the map.

#### The credibility score

Starts at 50, then adds or subtracts points. The reviewer sees every reason.

| Check | Points |
|---|---|
| Reported by a logged-in official | +30 |
| Photo attached / no photo | +15 / −15 |
| Within 300 m of a mapped road | +10 |
| Not within 2 km of any mapped road | −25 |
| Same photo already used in another report | −40, and the score is capped at 35 |
| Other reports within 1 km in the last 48 hours | +15 each, up to +30 |
| Landslide report where BhooSuraksha's risk today is HIGH or above / LOW | +10 / −10 |
| Capture time in the future | −20 |
| Captured more than 3 days before it was sent | −10 |
| Unreadable capture time | −5 |
| Little or no description (under 10 characters) | −5 |
| **Optional AI photo check** | adds or subtracts points with its own reason |

Levels: **70+ likely genuine**, **40–69 needs checking**, **under 40 likely
false**. The score never decides anything on its own.

**AI photo check (optional):** with `AI_PROVIDER` set to `gemini` or
`anthropic` and a key, a vision model looks at the photo and answers in JSON:
does it show a road, does it match the reported type, does it look like a
stock or edited image, how confident it is, and a one-line summary. It runs in
the background after the report is saved. If the AI is unreachable or out of
quota, the reviewer sees "AI check unavailable" and the rule-based score
stands. Default models: `gemini-2.5-flash` and `claude-sonnet-5` (override
with `AI_MODEL`).

### Shipments & Vehicles (`/ops/shipments`)

**Create a shipment:** commodity (Medicines, Food, Drinking water,
Agricultural produce, Fuel, Construction materials, Emergency supplies),
quantity and unit (kg, tonnes, litres, boxes, units), priority (Critical,
High, Normal), origin and destination places, vehicle registration and driver
name. Setu plans the route and stores its planned time and distance.

**Life cycle:** `planned` → `in_transit` (Start) → `delivered` (Deliver), or
`cancelled` at any point.

**Driver link:** *Copy driver tracking link* gives
`https://<your-site>/track/<token>` (a random, unguessable token). Send it to
the driver.

**Live view:** last position on the map, ETA and delay, recomputed with the
current blocked roads.

**Alerts** (shown to the official and on the driver's page):

| Alert | When |
|---|---|
| `cut_off` | No open route left to the destination |
| `rerouted` | The remaining route is longer than it would be without blockages (shows the extra minutes) |
| `delayed` | Expected arrival more than 30 minutes behind plan |
| `stale` | No position received for 30+ minutes while in transit |

**Demo slider:** *Simulate* moves the vehicle a chosen fraction of the way
along its planned route, for demonstrations without a real drive. Shipments
moved this way are labelled demo.

## Health and readiness

- `GET /health`: the process is up (used by Render and by the wake-up call).
- `GET /ready`: the database answers, the road network is loaded (with segment
  count), and the BhooSuraksha link status.
