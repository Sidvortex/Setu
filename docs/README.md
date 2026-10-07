# Setu documentation

Everything about Setu, from what it is to how each part works, where the data
comes from, how to run and deploy it, and what is still missing.

Read in order the first time. Later, jump to the part you need.

| # | Document | What's in it |
|---|---|---|
| 1 | [Overview](01-overview.md) | The problem, what Setu does, who uses it, how it maps to the SIH problem statement |
| 2 | [Architecture](02-architecture.md) | The parts of the system, how a request flows, how Setu talks to BhooSuraksha |
| 3 | [Data](03-data.md) | Every dataset, its licence, how the road network was built and repaired, the numbers |
| 4 | [Features](04-features.md) | Every screen and feature, for the public and for officials, and how each works |
| 5 | [API reference](05-api.md) | Every backend endpoint: inputs, outputs, who can call it |
| 6 | [Backend](06-backend.md) | Python modules, settings, database tables, tests |
| 7 | [Frontend](07-frontend.md) | Pages, components, maps, offline support, the wake-up call |
| 8 | [Local setup](08-local-setup.md) | Running Setu on your own computer |
| 9 | [Deployment](09-deployment.md) | Render + Vercel + Turso, step by step, and day-to-day operation |
| 10 | [Security](10-security.md) | Logins, secrets, CORS, rate limits, privacy |
| 11 | [Known issues](11-known-issues.md) | Every known limitation and gap, honestly listed |
| 12 | [Roadmap](12-roadmap.md) | What to build next and why |
| 13 | [History](13-history.md) | How the project got here, decisions made, and problems fixed along the way |

## The short version

Setu answers one question for district officials and supply planners in
India's North Eastern Region: **if these roads are blocked, who can we still
reach, and how?**

- **Code:** `backend/` (FastAPI, Python 3.12) and `frontend/` (React 19,
  TypeScript, Vite).
- **Data:** the government's PMGSY GeoSadak rural-road dataset for all 8 NER
  states (1,80,218 km of roads), repaired into one routable network.
- **Sister project:** [BhooSuraksha](https://github.com/Sidvortex/BhooSuraksha)
  supplies landslide risk over HTTP.
- **Hosting:** backend on Render, website on Vercel, database on Turso, all
  on free plans.

## Keeping these docs current

When you change something, update the document that describes it in the same
commit. If a number changes (for example after rebuilding the road network),
update [Data](03-data.md) and anywhere else it is quoted.
