"""
Link to BhooSuraksha, the sister project that provides landslide risk.

Setu asks BhooSuraksha's API (POST /api/predict/region) for the current risk
at a place and shows it as "predicted disruption risk". Configure with
BHOOSURAKSHA_API_URL (e.g. its Cloud Run URL) and optionally
BHOOSURAKSHA_TIMEOUT_S (default 4 s).

Designed so BhooSuraksha can never slow Setu down:
  * one pooled HTTPS connection (httpx), reused across calls
  * successes cached per place per day (RISK_CACHE_MINUTES, default 30)
  * FAILURES remembered too: after a timeout/error no further calls are made
    for RISK_FAILURE_COOLDOWN_S (default 120 s), so a down or sleeping
    BhooSuraksha costs one timeout, not one per request
  * callers treat None as "unknown" and carry on
"""
import threading
import time
from datetime import date
from typing import Optional

import httpx

from config import settings

_lock = threading.Lock()
_cache: dict = {}            # (lat, lon, day) -> (fetched_at, result)
_down_until = 0.0            # monotonic time until which we don't call BhooSuraksha
_last = {"ok": None, "at": None, "error": None}
_client: Optional[httpx.Client] = None


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=settings().bhoosuraksha_timeout_s,
                               limits=httpx.Limits(max_keepalive_connections=4, max_connections=8))
    return _client


def configured() -> bool:
    return bool(settings().bhoosuraksha_api_url)


def status() -> dict:
    """For /ready and the startup log."""
    return {"configured": configured(), "url": settings().bhoosuraksha_api_url or None,
            "last_ok": _last["ok"], "last_checked": _last["at"], "last_error": _last["error"],
            "cooling_down": time.monotonic() < _down_until}


def district_risk(lat: float, lon: float) -> Optional[dict]:
    global _down_until
    cfg = settings()
    if not cfg.bhoosuraksha_api_url:
        return None
    key = (round(lat, 2), round(lon, 2), date.today().isoformat())
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < cfg.risk_cache_minutes * 60:
            return hit[1]
        if time.monotonic() < _down_until:
            return None  # recently failed: don't wait on it again yet
    try:
        r = _http().post(f"{cfg.bhoosuraksha_api_url}/api/predict/region",
                         json={"latitude": lat, "longitude": lon, "date": date.today().isoformat()})
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        with _lock:
            _down_until = time.monotonic() + cfg.risk_failure_cooldown_s
            _last.update(ok=False, at=time.time(), error=f"{type(e).__name__}: {str(e)[:120]}")
        return None
    result = {"source": "BhooSuraksha regional landslide model", "probability": data.get("probability"),
              "risk_level": data.get("risk_level"), "explanation": data.get("explanation")}
    with _lock:
        _cache[key] = (time.monotonic(), result)
        _down_until = 0.0
        _last.update(ok=True, at=time.time(), error=None)
    return result


def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
