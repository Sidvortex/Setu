/**
 * Field incident reports (backend/incidents.py) with an offline queue.
 * Reports submitted without a connection are kept in this browser and sent
 * automatically when it comes back; each carries a client_id so a retry is
 * never stored twice on the server.
 */
import { getBackendUrl } from '../utils/backendUrl';
import { waitForServer } from '../utils/serverWake';
import { RoadBlockReason } from './logistics';

export type Severity = 'Low' | 'Medium' | 'High';
export type IncidentStatus = 'reported' | 'verified' | 'rejected';

export interface IncidentDraft {
  client_id: string; lat: number; lon: number; incident_type: RoadBlockReason; severity: Severity;
  description?: string; photo_base64?: string; captured_at: string;
  contact?: string;
  /** sent through the public endpoint (no login) */
  public?: boolean;
}

export interface Incident {
  id: number; client_id: string; lat: number; lon: number; edge_id: number | null; snap_m: number | null;
  incident_type: RoadBlockReason; severity: Severity; description: string | null; photo_url: string | null;
  reported_by: string; captured_at: string | null; created_at: string; status: IncidentStatus;
  reviewed_by: string | null; reviewed_at: string | null;
  road_name: string | null; road_category: string | null; district: string | null; state: string | null;
  source: 'official' | 'public'; contact: string | null;
  credibility: number | null; credibility_level: string | null;
  credibility_reasons: { points: number; reason: string }[];
  ai_verdict: { summary?: string; provider?: string; error?: string } | null;
}

export interface PublicReceipt { id: number; status: IncidentStatus; road_name: string | null; district: string | null; snap_m: number | null; duplicate: boolean }

const QUEUE_KEY = 'setu_incident_queue';

async function call<T>(method: 'GET' | 'POST', path: string, token: string | null, body?: unknown): Promise<T> {
  const base = getBackendUrl();
  if (!base) throw new Error('No backend URL configured.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  await waitForServer(); // free hosting may be asleep: wait for the wake-up ping
  const res = await fetch(`${base}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const e = new Error(err?.detail || `Request failed (${res.status})`) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export const incidentsApi = {
  list: (token: string, status?: IncidentStatus, source?: 'public' | 'official') =>
    call<{ incidents: Incident[]; ai_check: boolean }>('GET', `/api/incidents?${new URLSearchParams({ ...(status ? { status } : {}), ...(source ? { source } : {}) })}`, token),
  submit: (token: string, d: IncidentDraft) => call<Incident & { duplicate: boolean }>('POST', '/api/incidents', token, d),
  submitPublic: (d: IncidentDraft) => call<PublicReceipt>('POST', '/api/incidents/public', null, d),
  verify: (token: string, id: number, blockRoad: boolean) => call<Incident>('POST', `/api/incidents/${id}/verify`, token, { block_road: blockRoad }),
  reject: (token: string, id: number) => call<Incident>('POST', `/api/incidents/${id}/reject`, token),
  photoUrl: (path: string) => `${getBackendUrl()}${path}`,
};

// ---------- offline queue ----------
export function queuedReports(): IncidentDraft[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q: IncidentDraft[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch { throw new Error('Not enough storage in this browser to keep the report offline. Try without the photo.'); }
}
export function enqueue(d: IncidentDraft) { saveQueue([...queuedReports().filter((x) => x.client_id !== d.client_id), d]); }

/** Try to send everything queued. Network failures keep the report queued; rejected reports (4xx) are dropped and returned.
 *  Public reports go without a login; officials' reports wait until someone is logged in. */
export async function flushQueue(token: string | null): Promise<{ sent: number; rejected: { draft: IncidentDraft; reason: string }[] }> {
  let sent = 0; const rejected: { draft: IncidentDraft; reason: string }[] = [];
  for (const d of queuedReports()) {
    if (!d.public && !token) continue;
    try {
      if (d.public) await incidentsApi.submitPublic(d); else await incidentsApi.submit(token!, d);
      sent++; saveQueue(queuedReports().filter((x) => x.client_id !== d.client_id));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 401 && status !== 429) {
        rejected.push({ draft: d, reason: (e as Error).message });
        saveQueue(queuedReports().filter((x) => x.client_id !== d.client_id));
      } else break; // offline or server trouble: stop, try again later
    }
  }
  return { sent, rejected };
}

/** Shrink a photo to max 1280 px JPEG (~150-300 KB) so it uploads on weak networks and fits offline storage. */
export function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}
