# Setu — setup

> The project was renamed from Sampark NE to **Setu**. If your GitHub repo is
> still called `SamparkNE`, rename it: repo **Settings → General → Repository
> name → `Setu`**. GitHub redirects the old URL, so existing clones keep working
> (`git remote set-url origin https://github.com/Sidvortex/Setu.git` to tidy up).

## Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # or pip install --break-system-packages on Arch
pip install -r requirements.txt
python create_admin.py <username> <password>      # officials' accounts; no public sign-up
uvicorn app:app --reload --port 8100
```

All settings are listed in `backend/.env.example` (validated by `config.py`).

### Tests

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q          # 12 end-to-end tests, ~3 s — run before every push
```

Port 8100, so it can run next to BhooSuraksha's backend (8000). The startup log
shows the account count and whether the BhooSuraksha link is configured.

### Connecting BhooSuraksha (landslide risk)

Run BhooSuraksha's backend (its repo, port 8000), then start Setu with:

```bash
BHOOSURAKSHA_API_URL=http://localhost:8000 uvicorn app:app --reload --port 8100
```

The dashboard's "Landslide risk today" card then shows BhooSuraksha's
prediction. Without it, the card says "Risk engine not connected" and
everything else works.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the printed URL. In development the site talks to `http://localhost:8100`
automatically (the Officials Login page also lets you override the address).
Sign in → you land on the Connectivity dashboard.

## Deploying

Step-by-step guide for both projects (Render free plan for the backends,
Vercel for the websites, Turso for the databases): **[DEPLOY.md](DEPLOY.md)**.

Things worth knowing:

- `render.yaml` describes the backend service; Render reads it when you create
  a Blueprint from this repo.
- With `SETU_ENV=production` (set in render.yaml) the backend **refuses to
  start** if `AUTH_SECRET` is missing or short — on purpose. Render generates it.
- Health checks: `/health` (process up) and `/ready` (database + road network
  loaded; also shows the BhooSuraksha link's status).
- Every response has a `Server-Timing` header; requests over 1 s are logged as
  "slow request" in Render's logs.
- Python 3.12 is pinned (`PYTHON_VERSION` in render.yaml, `.python-version`);
  dependencies are pinned in `requirements.txt` to the versions the tests passed with.
- **Wake-up call**: free Render services sleep after 15 idle minutes. Every page
  pings `/health` on load (`frontend/src/utils/serverWake.ts`), shows a "waking
  up the server" notice if that takes over 3 s, and API calls wait for it instead
  of failing. The backend pings BhooSuraksha's `/health` when it starts, so both
  wake together. There is deliberately no keep-alive timer (it would burn the
  free plan's 750 monthly hours).
- `frontend/vercel.json` sends every path to `index.html`, so links like
  `/track/<token>` and `/ops` work when opened directly.

## Updating the road network

`backend/data/networks/ner/` (~17 MB) is produced by BhooSuraksha's
`data-pipeline/build_region_network.py` (~2 minutes for all 8 states). After
re-running it, copy the contents of `data-pipeline/data/processed/ner/` into
`backend/data/networks/ner/`. Edge ids change on every rebuild, so clear
existing road blockages first (they reference edge ids).

Memory: the backend uses ~360 MB with the full region loaded (measured on
Python 3.12), within the Render free plan's 512 MB.

## Field Incidents on a phone

Open the site on the phone, log in, go to **Field Incidents → Report**. The
browser asks for location permission (needed for GPS) — on most phones this
only works over **https** (Vercel gives you that) or on `localhost`. Photos are
shrunk in the browser before upload (max 1280 px). Without a connection,
reports queue on the device and send automatically when it's back online.

## AI photo check for reports (optional)

Every report gets rule-based credibility checks with no setup. To add the AI
photo check, set on the backend:

```bash
AI_PROVIDER=gemini   GEMINI_API_KEY=<key from https://aistudio.google.com>   # free tier, no billing needed
# or
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=<key>
AI_MODEL=<optional: override the default model name>
```

It runs in the background after each report with a photo and adjusts the
score, with its reasons shown to the reviewer. If the AI is unreachable or out
of quota, reports still work; the reviewer sees "AI check unavailable".

## Driver tracking links

"Copy driver tracking link" on a shipment gives a private URL
(`https://<your-site>/track/<token>`). Send it to the driver by SMS or
WhatsApp; they open it and tap **Start sharing location**. Browsers only share
GPS on **https** pages, so this works on the Vercel deployment (or localhost),
not over a plain-http local network address.

## How the BhooSuraksha link behaves

- Answers are cached per place per day (`RISK_CACHE_MINUTES`).
- If BhooSuraksha fails or times out (`BHOOSURAKSHA_TIMEOUT_S`), Setu stops
  calling it for `RISK_FAILURE_COOLDOWN_S` — so a down service costs one timeout,
  not one per request.
- Reports never wait for it: the landslide-risk check on reports runs in the
  background after the reporter already has their "received".
- `/ready` shows whether the link is configured, its last result, and whether
  it's cooling down.
