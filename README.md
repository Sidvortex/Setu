# Setu (सेतु)

**Road accessibility & supply logistics for India's North Eastern Region.**
SIH problem statement: AI-enabled Smart Logistics & Accessibility Intelligence
Platform for NER. Setup: **[SETUP.md](SETUP.md)**.

Setu answers one question for district officials and supply planners:
*if these roads are blocked, who can we still reach, and how?*

## What works now — all 8 North Eastern states

- **Regional Connectivity dashboard** (officials): KPIs for the whole region;
  pick any of the 98 districts to see its roads; click a road to mark it
  blocked (with a reason) or reopen it. Shows rural population, villages and
  health facilities cut off from the regional road network, broken down by
  district, plus today's landslide risk for the district (from BhooSuraksha).
- **Route Planner** (officials): fastest route between any two places in the
  region, across districts and states, starting from the roads currently
  reported blocked; add what-if blockages to see the detour or "Cut off".
- **Public site**: live road status for every district, a "Road Alerts" ticker,
  emergency helplines. Government-portal layout, English/हिंदी, accessibility tools.

**The network:** 1,80,218 km of roads, 98 districts, 65,189 villages
(4.09 crore rural residents), from PMGSY GeoSadak. The raw data is 53,299
disconnected fragments; repaired, **93.9% of junctions form one connected
network** and 89.5% of people live within 1 km of it.

**Real example:** blocking a 400 m stretch of Passi Garampani Haflong Road
isolates Haflong Civil Hospital, Holy Spirit Hospital and the Urban Health
Centre — and 30 villages (5,989 rural residents) — from the rest of the
North East.

**Not linked in the source data** (routes can't leave these; shown as "no road
link in the source data", never as a blockage): Sikkim (its link runs through
West Bengal), Lunglei, Lawngtlai and Saiha in Mizoram, Tawang and Dibang
Valley in Arunachal. The roads exist in reality; the government dataset has
multi-km gaps there. Filling them from OpenStreetMap is a planned follow-up.

## How it's built

```
frontend/   React + TypeScript + Vite + Tailwind + Leaflet
backend/    FastAPI
  logistics.py     road network, routing, cut-off impact
  road_status.py   shared road status (blocked / reopened) + connectivity summary
  risk_client.py   landslide risk from BhooSuraksha (sister project) over HTTP
  auth.py, db.py   officials' login; storage (local SQLite or Turso)
  data/networks/ner/          routable NER road network (from BhooSuraksha's data-pipeline)
```

The road network is built by `data-pipeline/build_region_network.py` in the
BhooSuraksha repo (documented in its `DATA_SOURCES.md`). Routing uses scipy's
sparse-graph tools: the backend loads the whole region in ~2 s and ~264 MB,
and a route or impact query takes well under a second.

## Two projects, one system

| | Setu (this repo) | BhooSuraksha |
|---|---|---|
| Purpose | Logistics & road accessibility | Landslide early warning |
| Repo | github.com/Sidvortex/SamparkNE | github.com/Sidvortex/BhooSuraksha |
| Link | calls BhooSuraksha's `/api/predict/region` for today's risk | serves risk predictions |

Setu keeps working if BhooSuraksha is down; the risk panel simply hides.

## Honest limits

- Road blockages are entered by officials; field incident reports and GPS
  vehicle tracking are the next builds (shown as "Coming next" in the dashboard).
- Travel times use assumed hill-road speeds (NH 35, SH 30 … village road 15,
  track 8 km/h), applied everywhere — slow for plains highways. Measured
  speeds from vehicle tracking will replace them.
- Population counts are GeoSadak's *rural* habitations; town residents
  (e.g. Haflong town itself) aren't included.
- "Health facilities" excludes the veterinary dispensaries GeoSadak also files
  under "Medical".
- Road data snapshot: March 2022.

## Team

| Name | Role | GitHub |
|---|---|---|
| Ravada Siddharth | Project Lead | [Sidvortex](https://github.com/Sidvortex) |
| Mala Kumari | Backend, database, auth | [mala9311](https://github.com/mala9311) |
| Vinayak Kapoor | Documentation, testing | [vinayak605](https://github.com/vinayak605) |
| Ayush Mishra | Deployment, documentation, testing | [ayush77-pro](https://github.com/ayush77-pro) |
| Arpit Kumar | Prediction & analytics | [arpitkumar1275hacker](https://github.com/arpitkumar1275hacker) |
| Vidit Sharma | Citizen platform | [viditsharma041206-cell](https://github.com/viditsharma041206-cell) |

Data: PMGSY GeoSadak, Ministry of Rural Development, 2022 (Government Open
Data License – India). Map data © OpenStreetMap contributors.
