# 13. History

How Setu came to be, the decisions along the way, and the problems that were
found and fixed. Useful for anyone joining the project, and for answering
"why is it like this?".

## Timeline (2026)

**Before Setu: BhooSuraksha.** The team first built BhooSuraksha, a landslide
risk and early-warning system for the North East: three machine-learning
models, a public safety site, an authority console, a government-portal
redesign and 3D maps.

**September: a new SIH problem statement.** *"AI-enabled Smart Logistics &
Accessibility Intelligence Platform for NER"*: roads, routes, vehicles,
alerts and field reports, not landslides. The team researched data sources
(PMGSY GeoSadak, NASA landslide catalogue, Open-Meteo, ASDMA flood reports)
and built a data pipeline inside BhooSuraksha's repo (`data-pipeline/`).
The **Dima Hasao pilot** turned 443 disconnected road pieces into a network
where 87.7% of junctions connect and 95.9% of people live within 1 km.

**30 September: idea submission deadline.** The idea deck was drafted under
the working title *PathSetu* and renamed *Sampark NE* by the team. A later
check found that the deck's figure, "19 of 24 health facilities" in Dima
Hasao depend on one road, was too high: GeoSadak's "Medical" category includes
veterinary dispensaries. With those excluded the figure is **13 of 16**; any
copy of the deck still showing 19 of 24 needs correcting.

**Logistics first.** Looking at the app as a judge would, the main screens
still looked like a landslide tool. The team decided to split the logistics
work into its **own project**, with road accessibility front and centre and
landslide risk as a supporting service from BhooSuraksha, to be integrated
over HTTP. The new project was first called *Sampark NE* (repo `SamparkNE`),
then renamed **Setu** ("bridge") with the whole team's agreement, and the repo
renamed to `Setu`.

**Whole North East.** The network grew from one district to all 8 states:
53,299 raw pieces became one network where 93.9% of junctions connect, after
adding a second repair pass (joining pieces within 60 m) that fixed
state-border gaps such as Tripura–Assam.

**Features, in order:** public route checking; 3D maps with Standard,
Terrain and Dark styles; a whole-region map alongside district maps; field
incidents with GPS, photos and an offline queue; public reporting, reviewed
only by officials; a credibility score with an optional AI photo check;
shipments with private driver links, live ETA and alerts.

**Backend upgrade.** Settings validated in one place (pydantic-settings),
production safety checks, startup/shutdown handling, GZip, `Server-Timing`
and slow-request logging, `/ready`, a pooled connection to BhooSuraksha with
caching and a failure cooldown, background checks so reporters never wait,
pinned dependencies, and an automated test suite.

**7 October: deployed.** Google Cloud needed billing, so the team chose
Render's free plan for both backends, Vercel for both websites and Turso for
the databases. Deployment surfaced several problems (below), all fixed the
same night: a wake-up call for sleeping free servers, photos moved into the
database, a new HTTPS client for Turso, whitespace-tolerant tokens, and a
safer `create_admin.py`. The documentation was reorganised into this
`docs/` folder.

## Decisions and why

| Decision | Why |
|---|---|
| Separate repos for Setu and BhooSuraksha, linked over HTTP | Each tells a clear story to judges; Setu keeps working without BhooSuraksha |
| GeoSadak instead of OpenStreetMap for roads | Far better village-road coverage in the North East |
| Repair tolerance 30 m, join distance 60 m | Fixes digitising slips without inventing roads across real gaps |
| Don't bridge real gaps (Sikkim, south Mizoram, Tawang, Dibang Valley) | Reporting "no link in the data" is honest; a fake connector would mislead routing |
| scipy sparse graphs, not networkx | The whole region must fit in 512 MB of memory |
| Count only health facilities for people | Vets in "Medical" inflated the numbers |
| Public reports never change road status by themselves | Fake or mistaken reports must not close roads |
| Credibility score hidden from reporters | So nobody can tune a fake report to pass |
| Free hosting (Render, Vercel, Turso) | No billing for a student prototype |
| A wake-up ping, but no keep-alive | Keep-alive would exhaust the free monthly hours |
| "A student initiative · Not an official Government of India website", original logo | A non-government project must not claim to be government or use the State Emblem |

## Team workflow

Each round of changes was split into six folders, one per team member, so
everyone pushed their own part from their own GitHub account. Once, members
copied files from each other's folders, which caused a rebase conflict
(`fatal: You are not currently on a branch`); it was resolved by taking the
incoming versions (`git checkout --theirs`) and continuing the rebase. The
rule since then: copy only your own folder. Later rounds were delivered to the
project lead as complete folders.

## Problems found and fixed

| Problem | Cause | Fix |
|---|---|---|
| 3D terrain never rendered; Vite warned the MapLibre worker "does not exist" | MapLibre finds its worker from a string the bundler can't see, so the worker 404'd | Import it with `?worker&url`, `setWorkerUrl`, `worker.format: 'es'` |
| 3D layers missing on slow connections | Layers were added on `load`, which waits for every tile | Use `style.load` |
| Switching 3D → 2D took 25–30 s | Destroying a terrain map (and `display: none`) is very slow | Keep both maps mounted; hide with `visibility` |
| 3D canvas 300 px tall or zero height | MapLibre's CSS overrode `absolute inset-0` | `w-full h-full` on the container |
| "Couldn't load the 3D base map" shown when it had loaded | Any single failed tile triggered it | Show only if the style hasn't loaded after 20 s |
| 3D road layer silently missing | MapLibre requires `['zoom']` as the outermost interpolate input | Rewrote the width expression |
| District map went blank while changing district | Pages cleared the roads before loading new ones | Keep the old roads until the new ones arrive |
| Roads couldn't be clicked | Leaflet's CSS came from a CDN | Bundle it from npm |
| Route lines blocked clicks on roads underneath | Route lines were interactive | `interactive: false` |
| Health facility counts too high | Veterinary dispensaries filed as "Medical" | `is_human_health()` |
| Crash on villages with blank population | Empty numbers in the CSV | Treat blanks as 0 |
| Whole-region map took ~2 s per request | Rebuilt the JSON every time | Build once, serve the cached text |
| Tripura only 12% connected | A 51 m digitising gap at the Assam border | 60 m join pass → 90% |
| `class=` instead of `className=` across the UI | Original scaffold | Fixed throughout Setu |
| Public site couldn't reach the backend once deployed | The address was only set on the login page | `VITE_BACKEND_URL` built into the site |
| Offline banner said "0 reports waiting" | The page wasn't told a report had been queued | Call `onSent()` after queueing |
| Ops header overlapped the tabs on phones | Layout | Fixed |
| Saving a report could take 5 s | It waited for BhooSuraksha | Moved to a background task (~0.04 s now) |
| A down BhooSuraksha slowed every request | Failures weren't remembered | Failure cooldown |
| Direct links (`/track/...`, `/ops`) gave 404 on Vercel | No rewrite rule for a single-page app | `vercel.json` rewrites everything to `index.html` |
| Render would have used Python 3.14 | Render's default for new services | `PYTHON_VERSION=3.12.11` in `render.yaml` |
| Photos would vanish every 15 minutes on Render | The free plan wipes the disk on sleep | Photos stored in the database; disk is only a cache |
| Deploy crashed: `WSServerHandshakeError: 400` from Turso | The `libsql-client` library uses WebSocket, which newer Turso databases refuse | New `turso_http.py` client over HTTPS |
| Deploy crashed: `Illegal header value b'Bearer …\n'` | Token pasted with a trailing newline | Strip whitespace from the token and URL |
| Tokens and passwords ended up in shell history and chat | Typed directly into commands | `read -rs` for tokens; `create_admin.py` asks for passwords hidden and can `--reset` |
