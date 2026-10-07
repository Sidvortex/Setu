# 12. Roadmap

What to build next, roughly in order of value for the SIH evaluation and for
real use. Each item links back to the gap it closes.

## Before the next demo or judging round

| Task | Why |
|---|---|
| **Full Hindi translation** of every page (not just navigation), keeping the English feature names | Requirement (h) multilingual; agreed as the next major task |
| **Test the AI photo check with a real Gemini key** (free tier) and confirm the model name | Only tested against simulated servers so far |
| **Verify all helpline numbers** in `frontend/src/data/helplines.ts` | Public safety information must be right |
| **Rotate any token or password that was ever shown** in chats or logs | See [Security](10-security.md#secrets) |
| **Lock `ALLOWED_ORIGINS`** to the real site addresses | Mention it as a hardening step |
| **Warm-up routine:** open both sites 2 minutes before presenting | Free servers sleep |

## Next: closing the SIH requirements

| Task | Closes |
|---|---|
| **Alerts to phones:** Firebase Cloud Messaging push first (free, no telecom registration), SMS second (MSG91 with DLT template registration, which takes days) | (e) automated alerts reach people away from the screen |
| **Flood forecasts:** use BhooSuraksha's Open-Meteo/GloFAS script for river discharge near bridges and low roads; flag roads at risk | (b) predict disruptions, beyond landslides |
| **Live rainfall in landslide risk:** feed recent rainfall into BhooSuraksha's risk so "risk today" reacts to weather | (b) |
| **Fill road-data gaps from OpenStreetMap:** Sikkim via West Bengal, southern Mizoram, Tawang, Dibang Valley; ferries (`route=ferry`) on the Brahmaputra | (c) routes everywhere in NER |
| **Bridges as first-class objects:** list, status and capacity, not only a block reason | (a) bridge accessibility |
| **Offline maps:** cache the tiles and road data for a chosen district on the phone (installable web app) | (h) offline |

## Then: making it dependable

| Task | Why |
|---|---|
| **Measured travel speeds** from driver tracking, per road category and season | Replace assumed speeds |
| **Blockage expiry / re-confirmation** after N hours | Stale blockages mislead routing |
| **District-level roles** (an official edits only their district) and an audit log | Real administrative use |
| **Login protection:** rate-limit failed logins; optional two-factor | Security |
| **Correct client IP behind Render's proxy** for the public rate limit | The current one can be bypassed with a fake header |
| **Photos in object storage** (e.g. Supabase Storage) instead of the database | Database size and cost |
| **Data-retention policy and privacy notice** | Reports, photos and positions are personal data |
| **Native or background-capable driver tracking** | Browsers pause pages in the background |
| **Official data request to ASDMA** for road-level daily flood reports | A real history of which roads fail |
| **Newer GeoSadak data** from the official portal | Roads built since March 2022 |

## Later

- Publish alerts in the Common Alerting Protocol format used by NDMA's SACHET
  system.
- Feeds from PWD / BRO road status where available.
- Analytics: chronic bottlenecks (roads whose loss cuts off the most people),
  seasonal patterns, average reopening times.
- Supply planning: which depots can reach which health facilities within N
  hours, under current blockages.
