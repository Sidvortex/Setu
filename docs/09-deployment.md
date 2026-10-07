# 9. Deployment

Setu and BhooSuraksha are deployed together on free plans. This guide covers
both, because Setu's backend needs BhooSuraksha's address.

| Part | Host | Plan |
|---|---|---|
| BhooSuraksha backend | Render | Free |
| Setu backend | Render | Free |
| BhooSuraksha website | Vercel | Hobby (free) |
| Setu website | Vercel | Hobby (free) |
| Databases (accounts, road status, reports, photos, shipments) | Turso | Free, one database per project |

No credit card is needed. The only tools on your own computer are git and
Python (for creating officer accounts).

**Never paste tokens, passwords or secrets into chats, issues, commits or
screenshots.** They go only into the Render/Vercel environment-variable
screens or your own terminal.

## What "free" means

- A free Render backend **sleeps after 15 minutes without traffic**. The next
  visitor waits about a minute while it starts; the website shows *"Waking up
  the server…"* and loads the data by itself once it's up. Setu's backend
  also wakes BhooSuraksha's when it starts.
- Render gives **750 free instance hours per month per workspace**. Two
  services that sleep when idle stay well under that. Don't add an uptime
  pinger: two always-on services need ~1,440 hours.
- A free Render server's **disk is wiped** whenever it sleeps or redeploys.
  That's why everything that must be kept lives in Turso, including photos.
- Free Render has **no shell**, so officer accounts are created from your
  computer (step 5).
- Free Render instances have 512 MB of memory and 0.1 CPU. Setu uses about
  360 MB; startup is slow on 0.1 CPU but works.

## Files that drive the deployment

| File | Purpose |
|---|---|
| `render.yaml` | Render Blueprint: one free Python web service, root `backend`, build `pip install -r requirements.txt`, start `uvicorn app:app --host 0.0.0.0 --port $PORT`, health check `/health`, region Singapore, `PYTHON_VERSION=3.12.11`, `SETU_ENV=production`, a generated `AUTH_SECRET`, and four values you enter |
| `.python-version` | `3.12` for local tools (Render uses `PYTHON_VERSION` from `render.yaml`; its own default would be Python 3.14) |
| `backend/requirements.txt` | Pinned versions |
| `frontend/vercel.json` | Vite build into `dist/`, every path rewritten to `index.html` |

## Step 1 — Accounts

Sign up with GitHub at **Render** (render.com), **Vercel** (vercel.com) and
**Turso** (turso.tech). Let Render and Vercel access the `Sidvortex/Setu` and
`Sidvortex/BhooSuraksha` repositories.

## Step 2 — Two Turso databases

In the Turso dashboard:

1. Create a database named `setu`, in the location closest to India (Mumbai
   `aws-ap-south-1` was used).
2. Create another named `bhoosuraksha`.
3. For each, note the **URL** (`libsql://setu-<you>.aws-ap-south-1.turso.io`)
   and create a **token** (read and write). Keep them in a password manager.

The `libsql://` address works as is; Setu's `turso_http.py` talks to it over
HTTPS.

## Step 3 — BhooSuraksha backend

1. Render → **New → Blueprint** → `Sidvortex/BhooSuraksha` → service
   `bhoosuraksha-api`.
2. Fill in `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (the **bhoosuraksha**
   database) and `ALLOWED_ORIGINS` = `*` for now. `AUTH_SECRET` is generated.
3. Apply, wait for the build, then open
   `https://<bhoosuraksha-api>.onrender.com/health` → `{"status":"ok"}`.

## Step 4 — Setu backend

1. Render → **New → Blueprint** → `Sidvortex/Setu` → service `setu-api`.
2. Fill in:
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: the **setu** database
   - `BHOOSURAKSHA_API_URL`: the address from step 3, no trailing slash
   - `ALLOWED_ORIGINS`: `*` for now
3. Apply, then open `https://<setu-api>.onrender.com/ready`. Expect
   `"database":"ok"`, `"road_network":"ok (277986 segments)"` and, after up to a
   minute while BhooSuraksha wakes, `"bhoosuraksha": {"configured": true,
   "last_ok": true, ...}`.

## Step 5 — Officer accounts

From your computer, in `Setu/backend` (after `pip install -r requirements.txt`):

```bash
export TURSO_DATABASE_URL="libsql://setu-<you>.aws-ap-south-1.turso.io"
read -rs TURSO_AUTH_TOKEN && export TURSO_AUTH_TOKEN   # press Enter, paste the token on the empty line, Enter
echo ${#TURSO_AUTH_TOKEN}                               # prints the length only, should be a few hundred
python create_admin.py <username>                       # asks for the password twice, hidden
```

`read -rs` keeps the token off the screen and out of your shell history.
Paste the token **on the empty line after pressing Enter**, not on the same
line as the command.

Windows (PowerShell 7.1 or later):

```powershell
$env:TURSO_DATABASE_URL="libsql://setu-<you>.aws-ap-south-1.turso.io"
$env:TURSO_AUTH_TOKEN = Read-Host -MaskInput "Token"
python create_admin.py <username>
```

Repeat in `BhooSuraksha/backend` with the **bhoosuraksha** database, in a new
terminal (so the Setu values aren't reused). Each project has its own
accounts; the same username can exist in both with different passwords.

Change a password later with `python create_admin.py <username> --reset`.

## Step 6 — Websites on Vercel

For each repo: Vercel → **Add New → Project** → import, then:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework | Vite (detected) |
| Environment variable `VITE_BACKEND_URL` | That project's Render address, e.g. `https://setu-api.onrender.com`, no trailing slash |

Deploy. `VITE_BACKEND_URL` is built into the site, so after changing it,
redeploy (Deployments → ⋯ → Redeploy).

## Step 7 — Check

- [ ] Setu site: *"Waking up the server…"* (if it was asleep), then the road
      map loads.
- [ ] Officials Login works; you land on Connectivity.
- [ ] Block a road → it appears in the public Road Alerts ticker; reopen it.
- [ ] A direct link like `/ops/incidents` or a driver link opens (no 404).
- [ ] Report a problem from a phone with a photo; it appears in the review
      queue with its photo.
- [ ] BhooSuraksha site: its login works and its authority Risk Map lists the
      real zones ("Monitoring Point 1"…), not the sample data's place names.

## Step 8 — Lock down CORS

Set `ALLOWED_ORIGINS` on each Render service (Environment tab) to its own
website, exactly as in the browser's address bar, with `https://` and no
trailing slash:

- `setu-api` → `https://<setu-site>.vercel.app`
- `bhoosuraksha-api` → `https://<bhoosuraksha-site>.vercel.app`

Add more addresses separated by commas (for example a custom domain, or
`http://localhost:3000` so teammates can run the site locally against the live
backend). Vercel preview addresses (`…-git-…vercel.app`) are blocked once
this is set. Setu's backend calls BhooSuraksha server-to-server, so it isn't
affected. See [Security](10-security.md#cors) for what this does and doesn't
protect.

## Day-to-day operation

| Task | How |
|---|---|
| Ship a change | Push to `main`. Render and Vercel redeploy automatically |
| See errors | Render → service → **Logs**; Vercel → project → **Deployments** → a deployment → logs |
| Before a demo | Open both websites 2 minutes early so both backends are awake |
| Add an officer | Step 5 again |
| Rotate a Turso token | Turso: invalidate the database's tokens, create a new one → paste into Render (Environment) → save. Render restarts the service |
| Rotate `AUTH_SECRET` | Render → Environment → generate a new value → save. Everyone is logged out; IP-hash rate limits reset |
| New road network | See [Data](03-data.md#rebuilding-the-network); clear road blockages first |
| Custom domain | Add it in Vercel, then add it to `ALLOWED_ORIGINS` |

## Troubleshooting

These are real problems hit during the first deployment, and others to expect.

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails with `WSServerHandshakeError: 400, message='Invalid response status', url='wss://…turso.io'` | The old `libsql-client` library connects over WebSocket, which newer Turso databases refuse | Fixed in code: `turso_http.py` uses HTTPS. If you see this, an old version is deployed |
| Deploy fails with `LocalProtocolError: Illegal header value b'Bearer …\n'` | The token was pasted with a trailing newline | Fixed in code (whitespace is stripped). Still, re-paste the token without a blank line |
| Deploy fails: "AUTH_SECRET must be set…" / "SETU_ENV=production needs AUTH_SECRET…" | Secret missing or short | Use the Blueprint (it generates one) or add `AUTH_SECRET` with 64 random characters |
| `UNIQUE constraint failed: users.username` from `create_admin.py` | The account already exists | Nothing to fix; use `--reset` to change its password |
| "Incorrect username or password" on the live site | The account was created in a different database (e.g. local SQLite) | Redo step 5 with the deployed database's URL and token |
| Site loads, all data fails, browser console mentions CORS | `ALLOWED_ORIGINS` doesn't exactly match the site address | Fix spelling, `https://`, trailing slash |
| Public site can't reach the backend | `VITE_BACKEND_URL` not set at build time | Set it in Vercel and redeploy |
| Direct links show 404 | `frontend/vercel.json` missing | Restore it |
| `/ready` shows `bhoosuraksha.last_error` | BhooSuraksha asleep, or wrong URL | Open its `/health`; Setu retries after 2 minutes |
| "Can't reach the server right now" after 90 s | The backend failed to start | Render logs |
| Render says free hours are used up | Something keeps the services awake | Remove pingers; hours reset monthly |
