# Setu (सेतु)

Road accessibility and supply logistics for India's North East.

*If these roads are blocked, who can we still reach, and how?*

- Live road status across all 8 North Eastern states: 1,80,218 km of roads in 98 districts
- Routes that avoid blocked roads, with the extra travel time
- Villages, people and health facilities cut off by a blockage
- Field reports with GPS and photo that work offline, each with a credibility score
- Shipment tracking through a private driver link, with automatic alerts
- Landslide risk from the sister project [BhooSuraksha](https://github.com/Sidvortex/BhooSuraksha)

Built for Smart India Hackathon 2026: *AI-enabled Smart Logistics & Accessibility Intelligence Platform for NER*.

## Run locally

```bash
# backend (Python 3.12)
cd backend
pip install -r requirements.txt
python create_admin.py <username>
uvicorn app:app --reload --port 8100

# frontend (Node 20+), in another terminal
cd frontend
npm install
npm run dev
```

## Documentation

Everything else, including architecture, data, API, deployment and known issues, is in [`docs/`](docs/).

## Team

Ravada Siddharth (lead) · Mala Kumari · Vinayak Kapoor · Ayush Mishra · Arpit Kumar · Vidit Sharma

---

Road data: Ministry of Rural Development, 2022. PMGSY Rural Connectivity Datasets, https://geosadak-pmgsy.nic.in/opendata/. Published under India's Government Open Data License: https://data.gov.in/government-open-data-license-india. Map data © OpenStreetMap contributors. Code under the [MIT License](LICENSE).
