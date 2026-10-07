# 8. Local setup

Run Setu on your own computer for development.

## You need

- **Python 3.12** (the version everything is pinned and tested on)
- **Node.js 20+** and npm
- **git**
- About 1 GB of free memory for the backend

## 1. Backend

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python create_admin.py <username>      # asks for a password (10+ characters)
uvicorn app:app --reload --port 8100
```

On Arch Linux without a virtual environment, add `--break-system-packages` to
`pip install`.

Check it:

```bash
curl http://localhost:8100/health      # {"status":"ok"}
curl http://localhost:8100/ready       # database ok, road network ok (277986 segments)
```

Open http://localhost:8100/docs for the interactive API page.

The startup log shows where accounts are stored and how many exist:

```
[auth] storage: local sqlite (.../backend/data/auth.db) | registered accounts: 1
```

Without any settings, the backend uses local SQLite files in
`backend/data/` (`auth.db`, `setu.db`) and stores photos in
`backend/data/uploads/`. All three are git-ignored.

### Optional settings

Copy `backend/.env.example` to `backend/.env` and fill in what you need. All
settings are described in [Backend](06-backend.md#settings). The `.env` file is
git-ignored; never commit it.

## 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the address it prints (http://localhost:3000). In development the site
talks to `http://localhost:8100` automatically.

## 3. Try it

1. Open **Road Status**: the North East map loads.
2. **Officials Login** → sign in with the account you created → you land on
   **Connectivity**.
3. Choose the district **N.C.Hills** (Dima Hasao), click the State Highway
   near Haflong (*Passi Garampani Haflong Road*), mark it blocked: the KPIs
   show 30 villages, 5,989 people and three health facilities cut off.
4. Reopen the road.
5. **Shipments** → create one → *Copy driver tracking link* → open it in
   another tab → *Start sharing location* (allow location).

## 4. Connect BhooSuraksha (optional)

To see landslide risk, run BhooSuraksha's backend (its repo) on port 8000,
then start Setu with the link:

```bash
BHOOSURAKSHA_API_URL=http://localhost:8000 uvicorn app:app --reload --port 8100
```

The Connectivity page's "Landslide risk today" card then shows BhooSuraksha's
answer for the selected district. Without it, the card says the risk engine
isn't connected; everything else works.

## 5. Tests

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q      # 15 passed in about 4 s
```

Frontend checks:

```bash
cd frontend
npm run lint             # TypeScript
npm run build            # production build
```

## Testing on a phone

GPS (for reports and driver tracking) only works on `https://` pages or
`localhost`. On your local network (`http://192.168.x.x:3000`) the browser
will refuse location. Use the deployed site, or a tunnel that gives you an
https address.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Incorrect username or password" | The account doesn't exist in the database this backend reads. Check the `[auth] storage` line in the log, then run `create_admin.py` against that storage (local, or Turso with the two variables set) |
| `ModuleNotFoundError` | The virtual environment isn't active, or `pip install -r requirements.txt` wasn't run |
| Port 8100 already in use | Stop the other process, or pick another port and set `VITE_BACKEND_URL=http://localhost:<port>` in `frontend/.env.local` |
| Map is blank | The tile servers need internet access. Check the browser console |
| 3D shows no terrain | The MapLibre worker failed to load; make sure `vite.config.ts` still has `worker: { format: 'es' }` |
| `create_admin.py` says the account exists | Use `python create_admin.py <username> --reset` to change its password |
