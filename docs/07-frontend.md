# 7. Frontend

React 19 + TypeScript, built with Vite 6, styled with Tailwind CSS 4, in
`frontend/`. Run with `npm install` then `npm run dev`.

## Pages and routes

Defined in `src/main.tsx`; every page sits inside `GlobalChrome` (top bar,
footer, language chooser, wake-up notice).

| Path | Page file | Who |
|---|---|---|
| `/` | `pages/Home.tsx` | Public |
| `/road-status` | `pages/RoadStatus.tsx` | Public |
| `/route` | `pages/RouteCheck.tsx` | Public |
| `/report` | `pages/ReportProblem.tsx` | Public |
| `/track/:token` | `pages/Track.tsx` | Driver (token) |
| `/login` | `pages/Login.tsx` | Officials |
| `/ops` | `pages/authority/OpsLayout.tsx` → `Connectivity.tsx` | Officials |
| `/ops/routes` | `pages/authority/Routes.tsx` | Officials |
| `/ops/incidents` | `pages/authority/Incidents.tsx` | Officials |
| `/ops/shipments` | `pages/authority/Shipments.tsx` | Officials |
| anything else | redirects to `/` | |

`/ops/*` without a login redirects to `/login`; the backend enforces the same
rule on every official endpoint.

## Folder layout

```
src/
├── main.tsx                 routes, providers, Leaflet CSS import
├── index.css                Tailwind + the government-portal theme (@theme)
├── components/
│   ├── GlobalChrome.tsx     layout wrapper for every page
│   ├── PublicHeader.tsx     branding, navigation, Road Alerts ticker
│   ├── TopUtilityBar.tsx    language, docs/source links, text size, accessibility
│   ├── LanguageChooserModal.tsx   first-visit English / हिंदी chooser
│   ├── ServerWake.tsx       "Waking up the server…" notice
│   ├── DistrictPicker.tsx   district selector (optionally "All North East")
│   ├── PlaceChooser.tsx     district → place picker
│   ├── RoutePlanner.tsx     route tool, 'ops' (what-if) or 'public' mode
│   ├── IncidentReportForm.tsx   report form, 'official' or 'public' mode
│   ├── TeamMemberLinks.tsx  team links
│   ├── gov/                 BrandMark, PageBanner, GovFooter
│   └── map/                 RoadMapView, RoadMap2D, RoadMap3D, mapTypes
├── context/
│   ├── AuthContext.tsx      login state (token + user)
│   ├── A11yContext.tsx      accessibility settings
│   └── LanguageContext.tsx  translations (DICTIONARY) and t()
├── services/
│   ├── logistics.ts         roads, places, routes, impact, road status, summary
│   ├── incidents.ts         reports, offline queue, photo compression
│   └── shipments.ts         shipments and driver tracking
├── utils/
│   ├── backendUrl.ts        where the API is
│   └── serverWake.ts        wake-up ping, waitForServer()
└── data/
    ├── team.ts              team members
    ├── links.ts             repo, docs, ISRO, NDMA links
    └── helplines.ts         emergency numbers
```

## Where the backend is

`utils/backendUrl.ts` decides, in this order:

1. an address saved in the browser (`setu_backend_url`), set from the
   Officials Login page, useful for testing against another server;
2. `VITE_BACKEND_URL`, built into the site at build time (set it in Vercel);
3. in development only, `http://localhost:8100`.

Public visitors and drivers never see the login page, so (2) is what makes the
deployed site work for them. `VITE_BACKEND_URL` is baked in at build time:
change it, then redeploy.

## The wake-up call

The backend sleeps on Render's free plan, so `utils/serverWake.ts`:

- `startWake()` pings `/health` once per page load; retries every 2.5 s, up to
  90 s (20 s timeout per attempt);
- after 3 s without an answer, `<ServerWake />` shows *"Waking up the
  server — free hosting sleeps when idle, so this can take up to a minute."*;
- on success it shows *"Connected."* for 4 s, but only if it had to wait;
- on giving up it shows *"Can't reach the server right now…"* with *Try
  again*;
- `waitForServer()` is awaited by every API helper (`services/*.ts` and the
  login), so requests queue behind the ping instead of failing with "Failed
  to fetch"; offline, it returns at once so reports are queued without delay.

There is deliberately no repeating keep-alive (it would use up the free
plan's monthly hours).

## Maps

`components/map/RoadMapView.tsx` holds a 2D/3D toggle and three style
buttons; both maps sit in one relative wrapper.

**2D: `RoadMap2D.tsx` (Leaflet)**
- `preferCanvas: true`: thousands of road lines draw on one canvas.
- Clickable roads (officials); route lines are `interactive: false` so they
  never block clicks on the roads underneath.
- Dark style = OpenStreetMap tiles inverted with the `.map-dark` CSS class.
- Leaflet's CSS is bundled from npm (imported in `main.tsx`), not loaded from
  a CDN; without it, layers stack wrongly and roads can't be clicked.

**3D: `RoadMap3D.tsx` (MapLibre GL 6)**
- Created once and updated in place when the district changes.
- Terrain from AWS Terrarium tiles, hillshading, 3D buildings from
  OpenFreeMap where OpenStreetMap has buildings.
- Layers are added on `style.load` (not `load`, which waits for every tile;
  one stalled tile used to mean no 3D layers at all).
- The worker script is bundled explicitly:
  `import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'`
  plus `setWorkerUrl`, with `worker: { format: 'es' }` in `vite.config.ts`.
  Without this the worker 404s and terrain silently never renders.
- Line widths use `interpolate` with `['zoom']` as the outermost input
  (MapLibre rejects the layer otherwise).
- The "couldn't load the 3D base map" overlay appears only if the style
  hasn't loaded after 20 s, not on any single failed tile.

**Switching** between 2D and 3D hides the other map with CSS `visibility`
instead of unmounting it; rebuilding a 3D map with terrain took 25–30 s.
The container uses `w-full h-full` (MapLibre's own CSS overrode
`absolute inset-0` and squashed the canvas).

## Offline reports

`services/incidents.ts`:

- `compressPhoto()` draws the photo onto a canvas at most 1280 px on the long
  side and exports JPEG.
- A report gets a `client_id` on the device and is sent straight away. If
  sending fails for lack of a connection, `enqueue()` stores it in
  `localStorage` (`setu_incident_queue`) and the form says it will be sent
  automatically.
- `flushQueue(token | null)` sends queued reports. The report pages run it
  when they open and on the browser's `online` event. Sent reports leave the
  queue; failures stay for the next try.
- The page shows how many reports are waiting.

## Translation

`context/LanguageContext.tsx` has a `DICTIONARY` of keys with `en` and `hi`
strings; components call `t('nav.report')`. The choice is saved as
`setu_language`. To translate more of the site: add keys to `DICTIONARY` and
replace the hard-coded strings with `t('...')`. Today only navigation,
headings and the wake-up notice are translated.

## Theme

`src/index.css` defines the government-portal look in Tailwind's `@theme`
block:

- identity colours: `gov-navy`, `gov-navy-dark`, `gov-navy-light`,
  `gov-saffron`, `gov-green`, `gov-page`;
- the `slate` scale is inverted (and `blue` adjusted) so components written
  for a dark UI render as a light portal. Because of this, prefer the
  `gov-*` colours or explicit hex values for anything new that must look a
  certain way.

## Browser storage keys

| Key | Holds |
|---|---|
| `setu_auth_token`, `setu_auth_user` | Login session |
| `setu_backend_url` | Optional backend address override |
| `setu_incident_queue` | Reports waiting to be sent |
| `setu_language` | `en` or `hi` |
| `setu_map_prefs` | 2D/3D and map style |

## Build and deploy

```bash
npm run lint      # TypeScript check (tsc --noEmit)
npm run build     # production build into dist/
npm run preview   # serve the build locally
```

`frontend/vercel.json` tells Vercel to run `npm install` and `npm run build`,
serve `dist/`, and send every path to `index.html`, so links like
`/track/<token>` and `/ops/incidents` work when opened directly. The build
warns that some JavaScript chunks are over 500 KB (MapLibre is large); this is
expected.

`frontend/.env.example` lists the one build variable, `VITE_BACKEND_URL`.
