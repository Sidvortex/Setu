/** Shipments & vehicle tracking client (backend/shipments.py). */
import { getBackendUrl } from '../utils/backendUrl';
import { waitForServer } from '../utils/serverWake';

export const COMMODITIES = ['Medicines', 'Food', 'Drinking water', 'Agricultural produce', 'Fuel', 'Construction materials', 'Emergency supplies'] as const;
export const UNITS = ['kg', 'tonnes', 'litres', 'boxes', 'units'] as const;
export const PRIORITIES = ['Critical', 'High', 'Normal'] as const;
export type ShipmentStatus = 'planned' | 'in_transit' | 'delivered' | 'cancelled';
export interface ShipmentAlert { type: 'cut_off' | 'rerouted' | 'delayed' | 'stale'; text: string }

export interface Shipment {
  id: number; commodity: typeof COMMODITIES[number]; quantity: number; unit: string; priority: typeof PRIORITIES[number];
  origin_name: string; o_lat: number; o_lon: number; dest_name: string; d_lat: number; d_lon: number;
  vehicle_reg: string; driver_name: string | null; status: ShipmentStatus; track_token: string; tracking_path: string;
  planned_minutes: number | null; planned_km: number | null; created_at: string; started_at: string | null; delivered_at: string | null;
  last_lat: number | null; last_lon: number | null; last_ping_at: string | null; simulated: number;
  eta: string | null; delay_min: number | null; alerts: ShipmentAlert[];
  remaining: { minutes: number; km: number; geometry?: { coordinates: [number, number][][] } } | null;
}

export interface ShipmentSummary { in_transit: number; planned: number; delivered_today: number; with_alerts: number; cut_off: number }

async function call<T>(method: 'GET' | 'POST', path: string, token: string | null, body?: unknown): Promise<T> {
  const base = getBackendUrl();
  if (!base) throw new Error('No backend URL configured.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  await waitForServer(); // free hosting may be asleep: wait for the wake-up ping
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.detail || `Request failed (${res.status})`); }
  return res.json();
}

export const shipmentsApi = {
  list: (token: string, geometryFor?: number) => call<{ shipments: Shipment[]; summary: ShipmentSummary }>('GET', `/api/shipments${geometryFor ? `?geometry_for=${geometryFor}` : ''}`, token),
  create: (token: string, body: unknown) => call<Shipment>('POST', '/api/shipments', token, body),
  action: (token: string, id: number, action: 'start' | 'deliver' | 'cancel') => call<Shipment>('POST', `/api/shipments/${id}/${action}`, token),
  simulate: (token: string, id: number, progress: number) => call<Shipment>('POST', `/api/shipments/${id}/simulate`, token, { progress }),
  // driver tracking link (no login; the token is the secret)
  track: (token: string) => call<Partial<Shipment>>('GET', `/api/track/${token}`, null),
  ping: (token: string, lat: number, lon: number, speed_kmh?: number) => call<Partial<Shipment>>('POST', `/api/track/${token}/ping`, null, { lat, lon, speed_kmh }),
};
