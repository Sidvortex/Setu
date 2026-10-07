# 1. Overview

## The problem

India's North Eastern Region (NER) has eight states (Arunachal Pradesh,
Assam, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim and Tripura) and some of
the country's hardest terrain to supply. Every monsoon, landslides, floods and
damaged bridges cut roads, often the *only* road to a group of villages. When
that happens, the first questions for a district administration are:

- Which villages and how many people just lost road access?
- Is a hospital or health centre among them?
- Is there another way in, and how much longer does it take?
- Where are the supply trucks already on the road, and are they now stuck?

Today these answers come from phone calls, paper maps and local knowledge.
Setu puts them on one screen.

## The SIH problem statement

Setu was built for **Smart India Hackathon 2026**, problem statement
*"AI-enabled Smart Logistics & Accessibility Intelligence Platform for NER"*.
The statement asks for eight things. Here is where each stands:

| # | Requirement | What Setu does | Status |
|---|---|---|---|
| a | Monitor road and bridge accessibility | Shared road status (blocked/open) for the whole region; officials block and reopen roads; verified field reports can block a road in one step; a connectivity dashboard shows the effect | Done, with status entered by people (no automatic sensors or feeds yet) |
| b | Predict disruptions | Shows today's landslide risk for a district, from the sister project BhooSuraksha | Partial: landslide only, and the model is seasonal/historical, not live weather. Flood forecasts are scripted but not yet used |
| c | Alternate routes and delays | Fastest route anywhere in NER; recalculates around blocked roads and shows the extra minutes, or says the destination is cut off | Done (travel times use assumed speeds) |
| d | GPS vehicle tracking | Each shipment gets a private driver link that shares the phone's GPS; live position and ETA for officials | Done (works in the phone's browser, which must stay open) |
| e | Automated alerts | Shipments raise alerts on their own: cut off, rerouted, delayed, no signal | Partial: alerts show in the dashboard and on the driver's page; no SMS or push yet |
| f | Geo-tagged field reports | Reports with GPS and photo from officials and the public, saved offline when there is no signal, with a credibility score | Done |
| g | Dashboards | Regional connectivity KPIs, district breakdown, incidents and shipments | Done |
| h | Multilingual and offline | English and Hindi switch; reports queue offline | Partial: Hindi covers navigation and headings only; maps need a connection |

## What Setu does

**For the public (no login):**

- **Road Status**: a live map of blocked roads for the whole North East or any
  district.
- **Check a Route**: the fastest route between two places, avoiding reported
  blockages.
- **Report a Problem**: a photo and GPS location of a blocked road, saved on
  the phone if there is no signal and sent later. Nothing is closed without an
  official's review.
- **Driver tracking page**: a driver opens a private link and shares their
  location for one shipment.

**For officials (login):**

- **Connectivity**: region-wide numbers and a map; click any road to mark it
  blocked or reopen it; see the villages, people and health facilities cut off,
  by district; see today's landslide risk for a district.
- **Route Planner**: fastest routes with "what-if" blockages and who each
  blockage would cut off.
- **Field Incidents**: report with GPS and photo; review queue for official
  and public reports, each with a credibility score and its reasons; verify
  (optionally blocking the road at the same time) or reject.
- **Shipments**: create a shipment (commodity, quantity, priority, origin,
  destination, vehicle, driver); Setu plans the route; track it live; get
  alerts when its road is blocked or it runs late.

## A real example

Blocking one 438 m stretch of the Passi Garampani Haflong Road (a State
Highway in Dima Hasao, Assam) cuts off **30 villages (5,989 rural residents)**
and 59 facilities from the rest of the North East, including three health
facilities: Haflong Civil Hospital, Holy Spirit Hospital and the Urban Health
Centre. Setu shows this the moment the road
is marked blocked. This scenario is also an automated test
(`test_blocking_haflong_road_cuts_off_haflong`).

## The network in numbers

| | |
|---|---|
| Roads | 1,80,218 km across all 8 states |
| Districts | 98 |
| Villages | 65,189 (4.09 crore rural residents) |
| Facilities | 51,162, of which 3,519 are health facilities for people |
| Connected | 93.9% of 2,08,034 junctions form one network after repair |
| Coverage | 89.5% of the rural population lives within 1 km of that network |

How these were produced is in [Data](03-data.md).

## Who it is for

| User | What they do in Setu |
|---|---|
| District officials / DDMA staff | Mark roads blocked, see who is cut off, review field reports |
| Supply and logistics planners | Plan routes for medicines, food and fuel; track shipments |
| Drivers | Open a link, share location; see their route and alerts |
| Field staff and the public | Report blocked roads with a photo; check if a road is open |

## Two projects, one system

Setu is the logistics half of a two-project system:

| | Setu (this repo) | BhooSuraksha |
|---|---|---|
| Purpose | Road accessibility and supply logistics | Landslide risk monitoring and early warning |
| Repo | [Sidvortex/Setu](https://github.com/Sidvortex/Setu) | [Sidvortex/BhooSuraksha](https://github.com/Sidvortex/BhooSuraksha) |
| Link | Asks BhooSuraksha for today's landslide risk | Answers `POST /api/predict/region` |

Setu keeps working when BhooSuraksha is down; the risk card simply says the
risk engine isn't connected. The road network itself was built by
BhooSuraksha's `data-pipeline/`, described in [Data](03-data.md).

## The name

*Setu* (सेतु) means **bridge** in Hindi and Sanskrit: the link between a cut-off
village and the help it needs. The project was briefly called *Sampark NE* and
*PathSetu* before the team settled on Setu (see [History](13-history.md)).

## What is real and what is not

Real: the road network and its numbers, routing and cut-off analysis, logins,
road status, field reports with photos and offline queue, credibility rules,
shipments and driver tracking, the BhooSuraksha link, the deployment.

Not real yet, or simulated:

- No live data feeds: road status comes from officials and verified reports.
- The "demo" slider on a shipment moves the vehicle along its route
  artificially; such shipments are labelled demo.
- The AI photo check has only been tested against simulated AI servers.
- Travel times use assumed speeds per road type.

The full list is in [Known issues](11-known-issues.md).
