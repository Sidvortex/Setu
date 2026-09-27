# Sampark NE — setup

## Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # or pip install --break-system-packages on Arch
pip install -r requirements.txt
python create_admin.py <username> <password>      # officials' accounts; no public sign-up
uvicorn app:app --reload --port 8100
```

Port 8100, so it can run next to BhooSuraksha's backend (8000). The startup log
shows the account count and whether the BhooSuraksha link is configured.

### Connecting BhooSuraksha (landslide risk)

Run BhooSuraksha's backend (its repo, port 8000), then start Sampark NE with:

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

Open the printed URL → **Officials Login** → set Backend URL to
`http://localhost:8100` → sign in. You land on the Connectivity dashboard.

## Deploying

Same as BhooSuraksha (see its SETUP.md §7): backend to Cloud Run, frontend to
Vercel. Two things specific to this project:

- **Use Turso** (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`). Both logins and the
  shared road status (`db.py`) live in the database; on Cloud Run a local
  SQLite file is wiped on every restart.
- Set `BHOOSURAKSHA_API_URL` to BhooSuraksha's deployed backend URL.
- Set `AUTH_SECRET` to a long random string.

## Updating the road network

`backend/data/networks/ner/` (~17 MB) is produced by BhooSuraksha's
`data-pipeline/build_region_network.py` (~2 minutes for all 8 states). After
re-running it, copy the contents of `data-pipeline/data/processed/ner/` into
`backend/data/networks/ner/`. Edge ids change on every rebuild, so clear
existing road blockages first (they reference edge ids).

Memory: the backend needs ~270 MB for the full region, within Cloud Run's
default 512 MB.
