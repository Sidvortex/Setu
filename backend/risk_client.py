"""
Link to BhooSuraksha, the sister project that provides landslide risk.

Setu doesn't run landslide models itself: it asks BhooSuraksha's API
(POST /api/predict/region) for the current risk at the district, and shows it
as "predicted disruption risk". Set BHOOSURAKSHA_API_URL to BhooSuraksha's
backend (e.g. http://localhost:8000 locally, or its Cloud Run URL).

If the variable isn't set or BhooSuraksha is unreachable, this returns None
and the dashboard simply omits the risk panel — Setu never breaks
because the risk engine is down.
"""
import json
import os
import time
import urllib.request
from datetime import date
from typing import Optional

BHOOSURAKSHA_API_URL = os.environ.get("BHOOSURAKSHA_API_URL", "").rstrip("/")
CACHE_SECONDS = 30 * 60
_cache: dict = {}


def district_risk(lat: float, lon: float) -> Optional[dict]:
    if not BHOOSURAKSHA_API_URL:
        return None
    key = (round(lat, 2), round(lon, 2), date.today().isoformat())
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    body = json.dumps({"latitude": lat, "longitude": lon, "date": date.today().isoformat()}).encode()
    req = urllib.request.Request(f"{BHOOSURAKSHA_API_URL}/api/predict/region", body, {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
    except Exception:
        return None
    result = {
        "source": "BhooSuraksha regional landslide model",
        "probability": data.get("probability"),
        "risk_level": data.get("risk_level"),
        "explanation": data.get("explanation"),
    }
    _cache[key] = (time.time(), result)
    return result
