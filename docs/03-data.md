# 3. Data

Every dataset Setu uses: where it comes from, its licence, how it was turned
into a routable network, what's wrong with it, and how to refresh it.

## Sources at a glance

| Source | Used for | Status |
|---|---|---|
| **PMGSY GeoSadak** (Ministry of Rural Development) | Roads, villages and population, facilities, district names | In use (snapshot March 2022) |
| **BhooSuraksha regional landslide model** (trained on the NASA Global Landslide Catalog) | "Landslide risk today" for a district; credibility of landslide reports | In use, over HTTP |
| **OpenStreetMap** raster tiles | 2D "Standard" base map, and 2D "Dark" (the same tiles colour-inverted in CSS) | In use (display only) |
| **OpenTopoMap** raster tiles | 2D and 3D "Terrain" base map | In use (display only) |
| **OpenFreeMap** vector tiles (`liberty`, `dark` styles) | 3D base map and 3D buildings | In use (display only) |
| **AWS Terrain Tiles** (Terrarium) | 3D terrain relief and hillshading | In use (display only) |
| Open-Meteo weather + GloFAS flood forecasts | Planned: rain and river-flood forecasts | Script written in BhooSuraksha, not yet run or used |
| ASDMA flood reports (Assam) | Planned: real records of which roads failed | Manual download only; yearly totals extracted for 2022–2025 |

The scripts that fetch and process the source data live in the
BhooSuraksha repo, in `data-pipeline/`. Setu only carries the finished road
network in `backend/data/networks/ner/`.

## PMGSY GeoSadak

**What it is:** the government's national rural-road GIS, made under the
Pradhan Mantri Gram Sadak Yojana. It covers far more village roads in the
North East than OpenStreetMap does, and it includes National Highways, State
Highways and district roads too.

- Official portal: https://geosadak-pmgsy.nic.in/OpenData
- Mirror used by the fetch script: https://github.com/datameet/pmgsy-geosadak
- Snapshot in use: the DataMeet mirror, **last updated March 2022**

**Licence:** Government Open Data License – India. Free to copy, reuse and
redistribute, including commercially. **Attribution is required**, using
exactly this text:

> Ministry of Rural Development, 2022. PMGSY Rural Connectivity Datasets,
> https://geosadak-pmgsy.nic.in/opendata/. Published under India's Government
> Open Data License: https://data.gov.in/government-open-data-license-india

**Layers used (8 states):**

| Layer | Geometry | Key fields | Notes |
|---|---|---|---|
| `Road_DRRP` | lines | `RoadCatego`, `RoadName`, `RoadOwner`, `DISTRICT_I`, `BLOCK_ID` | District Rural Roads Plan, includes NH/SH/MDR |
| `Habitation` | points | `HAB_NAME`, `TOT_POPULA` | Population is a field estimate based on Census 2011 |
| `Facilities` | points | `FAC_DESC`, `FAC_CATEGO` | Categories: Medical, Education, Agro, Transport/Admin |
| `MasterData.xls` | table | state / district / block ids → names | Used to name districts |

**Road categories and the speeds Setu assumes for them:**

| Code | Meaning | Assumed speed |
|---|---|---|
| `NH` | National Highway | 35 km/h |
| `SH` | State Highway | 30 km/h |
| `MDR` | Major District Road | 25 km/h |
| `RR(ODR)` | Other District Road | 20 km/h |
| `RR(VR)` | Village Road | 15 km/h |
| `RR(TRACK)` | Track | 8 km/h |
| `BR`, `OT` | Other categories in the data | 15 km/h |
| `connector` | Short link added by the repair step (below) | 5 km/h |

These are hill-road speeds and are applied everywhere, so plains highways look
slower than they are. They are assumptions, not measurements.

## From raw lines to a routable network

The raw roads don't connect: they were traced on satellite imagery and their
ends rarely meet. Raw, the 8 states are **59,313 road segments in 53,299
separate pieces**, so almost no route is possible. The script
`data-pipeline/build_region_network.py` (BhooSuraksha repo) repairs them:

1. **Load** `Road_DRRP` for all 8 states and project to UTM zone 46N
   (EPSG:32646) so distances are in metres.
2. **Snap dead ends** to the nearest road within **30 m** (`--tolerance`):
   19,094 short connectors.
3. **Make junctions at crossings:** lines are split where they cross.
4. **Join separate pieces** where two junctions are within **60 m**
   (`--join-distance`): 447 joins, the longest 59.7 m. This fixed
   state-border digitising gaps; for example a 51 m gap between Tripura and
   Assam took Tripura from 12% to 90% connected.
5. **Weight** every segment by travel time from the speed table above.
6. **Attach** every village and facility to its nearest junction, keeping the
   distance (`dist_m`).
7. **Summarise** per district and for the region.

Build time: about 100 seconds for all 8 states.

**Why 30 m?** It was chosen on the Dima Hasao pilot (443 raw pieces):

| Tolerance | Connectors | Largest network | Population within 1 km |
|---|---|---|---|
| 5 m | 60 (111 m total) | 44.5% | 60.6% |
| 15 m | 76 (241 m) | 81.5% | 87.9% |
| **30 m** | **83 (388 m)** | **87.7%** | **95.9%** |
| 60 m | 92 (810 m) | 87.9% | 95.9% |
| 100 m | 104 (1,724 m) | 88.4% | 95.9% |

Beyond 30 m the gains stop while the guessed links get longer, so 30 m only
fixes digitising slips, not real gaps.

## Results

| | Raw | After repair |
|---|---|---|
| Road segments | 59,313 | 2,77,986 routable segments |
| Separate pieces | 53,299 | 1,304 |
| Junctions in the largest network | — | **93.9%** of 2,08,034 |
| Rural population within 1 km of it | — | **89.5%** of 4.09 crore |
| Road length | 1,80,218 km | |
| Districts | 98 | |
| Villages | 65,189 | |
| Facilities | 51,162 (Medical 4,299 · Education 13,144 · Agro 16,643 · Transport/Admin 17,076) | |

**Share of each state's rural population on the main network:** Assam 93.7%,
Manipur 91.7%, Tripura 90.4%, Meghalaya 84.5%, Arunachal Pradesh 74.6%,
Nagaland 74.4%, Mizoram 36.3%, Sikkim 0% (see gaps below).

### Gaps deliberately not bridged

These are real multi-kilometre gaps in the source data, not digitising slips,
so the build doesn't invent roads across them:

- **Sikkim** (128 km): its road link to the rest of NER runs through West
  Bengal, which isn't in the NER data.
- **Southern Mizoram** (~7 km): Lunglei, Lawngtlai and Saiha.
- **Tawang** and **Dibang Valley** in Arunachal Pradesh.

The roads exist in reality. Setu reports routes into these areas as
`no_data_link` ("no road link in the source data"), never as a blockage, and
never counts their villages as "cut off" by a blockage. Filling these gaps from
OpenStreetMap is on the [Roadmap](12-roadmap.md).

## Health facilities

GeoSadak's "Medical" category also contains veterinary dispensaries. Setu
counts a facility as a **health facility for people** only if its category is
Medical and its name contains neither "veterinary" nor "vety"
(`is_human_health()` in `logistics.py`). That leaves **3,519 of the 4,299**
Medical facilities.

This rule changed a published number: an earlier count for Dima Hasao said
"19 of 24 health facilities" depend on one road; with vets excluded it is
**13 of 16** (see [History](13-history.md)).

## Population

Population comes from GeoSadak's *habitations*, which are **rural**. Town
residents (for example Haflong town itself) are not included, so "people cut
off" is a rural count. A village counts toward "people within reach" only if it
is within 1 km of a junction (`dist_m <= 1000`).

## The files in `backend/data/networks/ner/`

About 17 MB in total, loaded into memory at startup.

| File | Contents |
|---|---|
| `edges.csv.gz` | One row per road segment: `edge_id, u, v, state, district_id, category, road_name, owner, length_m, travel_min` (`u`, `v` are junction ids) |
| `nodes.npz` | Junction coordinates: `xy` (UTM metres) and `lonlat`, indexed by junction id |
| `geom.npz` | Road shapes for drawing: `coords` (lon/lat) and `offsets` per edge |
| `villages.csv.gz` | `id, name, population, district_id, lon, lat, node, dist_m` |
| `facilities.csv.gz` | `id, name, category, district_id, lon, lat, node, dist_m` |
| `districts.json` | Per district: `district_id, name, state, bbox, road_km, segments, villages, population, population_on_main_network_pct` |
| `report.json` | Region-wide build summary (the numbers in this document) |

District names come from the 2022 master sheet, so they are the old ones
(Dima Hasao appears as N.C. Hills in the raw data) and districts created after
2022 don't exist.

## Rebuilding the network

1. In the BhooSuraksha repo: `cd data-pipeline`,
   `pip install -r requirements.txt`, then `python fetch_geosadak.py` (about
   163 MB) or unzip the team's raw-data archive into `data/raw/`.
2. `python build_region_network.py --tolerance 30 --join-distance 60`
3. Copy everything in `data-pipeline/data/processed/ner/` into Setu's
   `backend/data/networks/ner/`.
4. **Before deploying, clear all road blockages.** Edge ids change on every
   rebuild, and `road_blocks` stores edge ids.
5. Update the numbers in this document and in the [Overview](01-overview.md).

For newer data than March 2022, download the same layers by hand from the
official portal into `data/raw/geosadak/<Layer>/<State>.zip` before step 2.

## Landslide risk (from BhooSuraksha)

Setu doesn't train any model. It sends the centre of a district (or a report's
location) and today's date to BhooSuraksha's `POST /api/predict/region` and
shows the answer (`probability`, `risk_level`, `explanation`). That model is
trained on 1,886 recorded landslides from the NASA Global Landslide Catalog
(2007–2016) across India, Nepal, Bhutan, Myanmar, Bangladesh and Tibet. It
learns *where and in which season* landslides were reported, not today's
rainfall. Details are in BhooSuraksha's `docs/03-models.md`.

## Data that doesn't exist publicly

There is no public source for live road status, live vehicle GPS or delivery
records in the North East. Setu creates these itself: road status from
officials and verified reports, vehicle positions from the driver link, and
shipments entered by officials.

## Map display services

Used only to draw maps, never for analysis. All are free and need no key:

| Service | Used for | Attribution |
|---|---|---|
| OpenStreetMap tiles | 2D Standard and 2D Dark (inverted with CSS) | © OpenStreetMap contributors |
| OpenTopoMap | Terrain style (2D and 3D) | © OpenTopoMap (CC-BY-SA), SRTM, © OpenStreetMap contributors |
| OpenFreeMap (`liberty`, `dark`) | 3D base map and buildings | © OpenMapTiles, © OpenStreetMap contributors |
| AWS Terrain Tiles (Terrarium) | 3D terrain and hillshade | Mapzen / AWS open data |

These services are run by others and may rate-limit or change; see
[Known issues](11-known-issues.md).
