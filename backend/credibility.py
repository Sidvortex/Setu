"""
Credibility scoring for field incident reports, so reviewers can spot
likely-fake public reports quickly. It never decides on its own: public
reports always go to an official for review.

Score 0-100, starting at 50, from rule-based checks that need no API key:
  photo present / missing, distance to the nearest mapped road, the same photo
  reused in another report, corroboration by other reports nearby, consistency
  with BhooSuraksha's landslide risk (landslide reports), implausible
  timestamps, official vs public reporter.

Optional AI photo check (set AI_PROVIDER + key): a vision model looks at the
photo and says whether it shows the reported kind of road problem and whether
it looks like a stock / edited image. Adjusts the score and adds its reasons.
  AI_PROVIDER=gemini     GEMINI_API_KEY=...   (Google AI Studio free tier works without billing)
  AI_PROVIDER=anthropic  ANTHROPIC_API_KEY=...
  AI_MODEL=<optional override>   defaults: gemini-2.5-flash / claude-sonnet-5
Levels: >= 70 likely genuine, 40-69 needs checking, < 40 likely false.
"""
import base64
import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Optional

AI_PROVIDER = os.environ.get("AI_PROVIDER", "").lower()
AI_MODEL = os.environ.get("AI_MODEL") or {"gemini": "gemini-2.5-flash", "anthropic": "claude-sonnet-5"}.get(AI_PROVIDER, "")
GEMINI_URL = os.environ.get("GEMINI_API_URL", "https://generativelanguage.googleapis.com/v1beta")
ANTHROPIC_URL = os.environ.get("ANTHROPIC_API_URL", "https://api.anthropic.com/v1/messages")


REUSED_PHOTO_CAP = 35  # a photo copied from another report is near-proof of a fake, whatever else scores well


def cap(score: int, reasons: list) -> int:
    if any(r["reason"].startswith("Same photo already used") for r in reasons):
        return min(score, REUSED_PHOTO_CAP)
    return max(0, min(100, score))


def level(score: int) -> str:
    return "likely genuine" if score >= 70 else "needs checking" if score >= 40 else "likely false"


def rule_score(*, source: str, has_photo: bool, snap_m: Optional[float], photo_reused_in: Optional[int],
               nearby_reports: int, landslide_risk: Optional[str], incident_type: str,
               captured_at: Optional[str], description: Optional[str]) -> tuple[int, list]:
    score, why = 50, []
    def add(points: int, reason: str):
        nonlocal score
        score += points
        why.append({"points": points, "reason": reason})
    if source == "official":
        add(30, "Reported by a logged-in official")
    add(15, "Photo attached") if has_photo else add(-15, "No photo")
    if snap_m is None:
        add(-25, "Not within 2 km of any mapped road")
    elif snap_m <= 300:
        add(10, f"On a mapped road ({int(snap_m)} m away)")
    if photo_reused_in:
        add(-40, f"Same photo already used in report #{photo_reused_in}")
    if nearby_reports:
        add(min(30, 15 * nearby_reports), f"{nearby_reports} other report(s) within 1 km in the last 48 h")
    if incident_type == "Landslide" and landslide_risk:
        if landslide_risk in ("HIGH", "VERY_HIGH", "CRITICAL"):
            add(10, f"Landslide risk here is {landslide_risk.replace('_', ' ')} today (BhooSuraksha)")
        elif landslide_risk == "LOW":
            add(-10, "Landslide risk here is LOW today (BhooSuraksha)")
    if captured_at:
        try:
            t = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            if t > now + timedelta(minutes=10):
                add(-20, "Capture time is in the future")
            elif now - t > timedelta(days=3):
                add(-10, "Captured more than 3 days before it was sent")
        except ValueError:
            add(-5, "Unreadable capture time")
    if not description or len(description.strip()) < 10:
        add(-5, "Little or no description")
    return cap(score, why), why


_PROMPT = """You are checking a road-incident report submitted to a disaster-logistics platform in North East India.
Reported problem type: {type}. Reporter's description: "{desc}".
Look at the photo and answer ONLY with a JSON object, no other text:
{{"shows_road": true/false, "matches_reported_type": true/false,
  "looks_stock_or_edited": true/false, "confidence": 0.0-1.0,
  "summary": "one short sentence on what the photo shows"}}"""


def _call_gemini(image_b64: str, mime: str, prompt: str) -> str:
    key = os.environ["GEMINI_API_KEY"]
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": mime, "data": image_b64}}, {"text": prompt}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    req = urllib.request.Request(f"{GEMINI_URL}/models/{AI_MODEL}:generateContent?key={key}",
                                 json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_anthropic(image_b64: str, mime: str, prompt: str) -> str:
    body = {"model": AI_MODEL, "max_tokens": 300,
            "messages": [{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": mime, "data": image_b64}},
                {"type": "text", "text": prompt}]}]}
    req = urllib.request.Request(ANTHROPIC_URL, json.dumps(body).encode(), {
        "Content-Type": "application/json", "x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    return "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")


def ai_enabled() -> bool:
    return (AI_PROVIDER == "gemini" and bool(os.environ.get("GEMINI_API_KEY"))) or \
           (AI_PROVIDER == "anthropic" and bool(os.environ.get("ANTHROPIC_API_KEY")))


def ai_photo_check(photo_path: str, incident_type: str, description: Optional[str]) -> Optional[dict]:
    """Returns {verdict..., points, reason} or None if AI is off / fails (never blocks a report)."""
    if not ai_enabled():
        return None
    with open(photo_path, "rb") as f:
        raw = f.read()
    mime = "image/png" if raw[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    prompt = _PROMPT.format(type=incident_type, desc=(description or "none").replace('"', "'")[:500])
    try:
        call = _call_gemini if AI_PROVIDER == "gemini" else _call_anthropic
        text = call(base64.b64encode(raw).decode(), mime, prompt).strip()
        verdict = json.loads(text[text.find("{"): text.rfind("}") + 1])
    except Exception as e:  # network, quota, bad JSON: report still goes to review, just without AI
        return {"error": f"AI check unavailable ({type(e).__name__})", "points": 0}
    points, reasons = 0, []
    if verdict.get("looks_stock_or_edited"):
        points -= 30; reasons.append("AI: photo looks like a stock or edited image")
    if not verdict.get("shows_road"):
        points -= 20; reasons.append("AI: no road visible in the photo")
    if verdict.get("matches_reported_type") and verdict.get("shows_road"):
        points += 20; reasons.append(f"AI: photo is consistent with a {incident_type.lower()}")
    elif not verdict.get("matches_reported_type"):
        points -= 15; reasons.append(f"AI: photo doesn't look like a {incident_type.lower()}")
    return {**verdict, "points": points, "reason": "; ".join(reasons) or "AI: no strong signal",
            "provider": AI_PROVIDER, "model": AI_MODEL}
