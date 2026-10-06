"""End-to-end API tests for Setu. Run from backend/:  python -m pytest -q"""
import base64
import io
import time
import uuid

import pytest

import incidents
import risk_client
from config import DEV_SECRET, Settings, settings

HAFLONG_SEGMENT = 99229            # 400 m of Passi Garampani Haflong Road
NEAR_HAFLONG = {"lat": 25.1603, "lon": 93.022}
GUWAHATI, AGARTALA, GANGTOK = (26.144, 91.736), (23.831, 91.286), (27.338, 88.606)


def _photo(color=(120, 90, 60)):
    from PIL import Image
    b = io.BytesIO(); Image.new("RGB", (320, 240), color).save(b, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def _route(client, a, b, blocked=()):
    return client.post("/api/logistics/route", json={"origin": {"lat": a[0], "lon": a[1]},
                       "destination": {"lat": b[0], "lon": b[1]}, "blocked_edge_ids": list(blocked)}).json()


# ---------- platform ----------
def test_health_and_ready(client):
    assert client.get("/health").json() == {"status": "ok"}
    r = client.get("/ready").json()
    assert r["status"] == "ready" and r["database"] == "ok" and r["road_network"].startswith("ok")
    assert "Server-Timing" in client.get("/health").headers


def test_production_refuses_insecure_secret():
    with pytest.raises(RuntimeError):
        Settings(setu_env="production", auth_secret=DEV_SECRET).check_production()
    Settings(setu_env="production", auth_secret="x" * 40, allowed_origins="https://setu.example").check_production()


def test_officials_only(client):
    assert client.post("/api/roads/blocked", json={"edge_id": 1, "reason": "Landslide"}).status_code == 401
    assert client.get("/api/incidents").status_code == 401
    assert client.get("/api/shipments").status_code == 401


# ---------- routing & impact ----------
def test_routes_across_states(client):
    r = _route(client, GUWAHATI, AGARTALA)
    assert r["status"] == "ok" and 550 < r["normal"]["km"] < 750
    assert _route(client, GANGTOK, GUWAHATI)["status"] == "no_data_link"   # Sikkim's link is via West Bengal


def test_region_map(client):
    d = client.get(f"/api/logistics/region-map?include={HAFLONG_SEGMENT}").json()
    assert len(d["roads"]["features"]) > 45000


def test_blocking_haflong_road_cuts_off_haflong(client, H):
    assert client.post("/api/roads/blocked", json={"edge_id": HAFLONG_SEGMENT, "reason": "Landslide"}, headers=H).status_code == 200
    s = client.get("/api/connectivity/summary").json()
    assert s["roads_blocked"] == 1 and s["population_cut_off"] == 5989 and s["villages_cut_off"] == 30
    assert {f["name"] for f in s["health_facilities_cut_off"]} >= {"Haflong Civil Hospital"}
    client.delete(f"/api/roads/blocked/{HAFLONG_SEGMENT}", headers=H)
    assert client.get("/api/connectivity/summary").json()["population_cut_off"] == 0


# ---------- field incidents ----------
def _report(client, ip, **kw):
    body = {"client_id": str(uuid.uuid4()), **NEAR_HAFLONG, "incident_type": "Landslide", "severity": "High",
            "description": "Rocks across both lanes", **kw}
    return client.post("/api/incidents/public", json=body, headers={"X-Forwarded-For": ip})


def test_public_report_receipt_hides_scoring(client):
    r = _report(client, "10.1.0.1", photo_base64=_photo())
    assert r.status_code == 200
    assert set(r.json()) == {"id", "status", "road_name", "district", "snap_m", "duplicate"}
    assert r.json()["road_name"] == "Passi Garampani Haflong Road"


def test_copied_photo_is_flagged(client, H):
    p = _photo((10, 200, 30))
    _report(client, "10.2.0.1", photo_base64=p)
    copy = _report(client, "10.2.0.2", photo_base64=p).json()
    inc = next(i for i in client.get("/api/incidents", headers=H).json()["incidents"] if i["id"] == copy["id"])
    assert inc["credibility"] <= 35 and inc["credibility_level"] == "likely false"


def test_public_rate_limit(client):
    codes = [_report(client, "10.3.0.1").status_code for _ in range(6)]
    assert codes[:5] == [200] * 5 and codes[5] == 429


def test_saving_a_report_never_waits_on_bhoosuraksha(client, monkeypatch):
    """The landslide-risk lookup must happen in the background job, not while saving."""
    calls = []
    monkeypatch.setattr(risk_client, "configured", lambda: True)
    monkeypatch.setattr(risk_client, "district_risk", lambda lat, lon: calls.append(time.monotonic()) or {"risk_level": "HIGH"})
    saved_at = {}
    real_create = incidents._create
    def spy(*a, **k):
        out = real_create(*a, **k); saved_at["t"] = time.monotonic(); return out
    monkeypatch.setattr(incidents, "_create", spy)
    assert _report(client, "10.4.0.1").status_code == 200
    assert calls and calls[0] >= saved_at["t"], "risk lookup ran before the report was saved and answered"


# ---------- shipments ----------
def test_shipment_alerts_when_its_road_is_blocked(client, H):
    s = client.post("/api/shipments", headers=H, json={
        "commodity": "Medicines", "quantity": 500, "unit": "kg", "priority": "Critical", "vehicle_reg": "AS01AB1234",
        "origin": {"name": "Guwahati", "lat": GUWAHATI[0], "lon": GUWAHATI[1]},
        "destination": {"name": "Haflong Civil Hospital", **NEAR_HAFLONG}}).json()
    assert s["status"] == "planned" and s["alerts"] == []
    assert client.post(f"/api/shipments/{s['id']}/simulate", headers=H, json={"progress": 0.6}).json()["status"] == "in_transit"
    client.post("/api/roads/blocked", json={"edge_id": HAFLONG_SEGMENT, "reason": "Landslide"}, headers=H)
    live = next(x for x in client.get("/api/shipments", headers=H).json()["shipments"] if x["id"] == s["id"])
    assert any(a["type"] == "cut_off" for a in live["alerts"])
    client.delete(f"/api/roads/blocked/{HAFLONG_SEGMENT}", headers=H)
    token = s["track_token"]
    assert client.post(f"/api/track/{token}/ping", json={"lat": 25.4, "lon": 92.95}).json()["status"] == "in_transit"
    client.post(f"/api/shipments/{s['id']}/deliver", headers=H)
    assert client.post(f"/api/track/{token}/ping", json={"lat": 25.2, "lon": 93.0}).status_code == 409


# ---------- BhooSuraksha link ----------
def test_down_bhoosuraksha_costs_one_timeout_not_many(monkeypatch):
    monkeypatch.setenv("BHOOSURAKSHA_API_URL", "http://10.255.255.1")   # unroutable: every call would hang
    monkeypatch.setenv("BHOOSURAKSHA_TIMEOUT_S", "1")
    settings.cache_clear(); risk_client.close(); risk_client._down_until = 0.0
    try:
        t = time.monotonic(); assert risk_client.district_risk(25.2, 93.0) is None; first = time.monotonic() - t
        t = time.monotonic()
        for _ in range(20):
            assert risk_client.district_risk(26.0 + _ / 100, 92.0) is None
        rest = time.monotonic() - t
        assert first < 3 and rest < 0.1, (first, rest)      # 20 more calls answered instantly while cooling down
        assert risk_client.status()["cooling_down"] and risk_client.status()["last_ok"] is False
    finally:
        monkeypatch.delenv("BHOOSURAKSHA_API_URL"); settings.cache_clear(); risk_client.close(); risk_client._down_until = 0.0


def test_startup_wakes_bhoosuraksha_in_background(monkeypatch):
    """Setu pings BhooSuraksha's /health on startup without waiting for it (free hosting sleeps)."""
    import http.server
    import threading as th
    hits = []
    release = th.Event()

    class SlowHealth(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            release.wait(5)                      # pretend to be booting
            self.send_response(200); self.end_headers(); self.wfile.write(b'{"status":"ok"}')

        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SlowHealth)
    th.Thread(target=srv.serve_forever, daemon=True).start()
    monkeypatch.setenv("BHOOSURAKSHA_API_URL", f"http://127.0.0.1:{srv.server_address[1]}")
    settings.cache_clear()
    try:
        risk_client._down_until = time.monotonic() + 999     # pretend an earlier call failed
        t0 = time.monotonic()
        t = risk_client.wake()
        assert time.monotonic() - t0 < 0.5                   # returned immediately
        for _ in range(50):
            if hits:
                break
            time.sleep(0.05)
        assert hits == ["/health"]
        release.set(); t.join(5)
        assert risk_client._down_until == 0.0                # up again: lookups allowed
        assert risk_client.status()["last_ok"] is True
    finally:
        srv.shutdown()
        monkeypatch.delenv("BHOOSURAKSHA_API_URL"); settings.cache_clear(); risk_client._down_until = 0.0


def test_photo_survives_a_wiped_disk(client, H):
    """Free hosting erases the server's disk when it sleeps; photos must come back from the database."""
    import shutil
    resp = _report(client, "10.4.0.1", photo_base64=_photo((200, 40, 90)))
    assert resp.status_code == 200, resp.text
    r = resp.json()
    inc = next(i for i in client.get("/api/incidents", headers=H).json()["incidents"] if i["id"] == r["id"])
    first = client.get(inc["photo_url"])
    assert first.status_code == 200
    shutil.rmtree(incidents.UPLOADS)                       # what a Render spin-down does
    again = client.get(inc["photo_url"])
    assert again.status_code == 200 and again.content == first.content
