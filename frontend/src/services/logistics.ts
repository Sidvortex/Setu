/**
 * Client for the Setu backend: region-wide road network, routing,
 * cut-off impact (backend/logistics.py) and shared road status (road_status.py).
 */
import { getBackendUrl } from '../utils/backendUrl';

export interface LatLon { lat: number; lon: number }

export interface District {
  district_id: number; name: string; state: string; bbox: [number, number, number, number];
  road_km: number; segments: number; villages: number; population: number; population_on_main_network_pct: number;
}

export interface RegionReport {
  road_km: number; districts: number; villages: number; population: number;
  largest_network_pct: number; population_within_1km_of_main_network_pct: number; raw_pieces: number; pieces_after: number;
}

export interface Place extends LatLon { id: number; name: string; category?: string; population?: number; health?: boolean; district?: string }

export type RoadFeatures = GeoJSON.FeatureCollection<GeoJSON.LineString, {
  edge_id: number; category: string; road_name: string; length_m: number; travel_min: number; in_main_network: boolean;
}>;

export interface PathSummary {
  minutes: number; km: number; edge_ids: number[];
  geometry: { type: 'MultiLineString'; coordinates: [number, number][][] };
}

export interface RouteResult {
  status: 'ok' | 'rerouted' | 'unreachable' | 'no_data_link';
  normal: PathSummary | null; current: PathSummary | null; delay_min: number | null;
  snap_m: { origin: number; destination: number };
}

export interface ImpactResult {
  mode: string; villages_cut_off: number; population_cut_off: number; facilities_cut_off: Place[];
  by_district: { district_id: number; name: string; state: string; villages: number; population: number }[];
}

export const ROAD_BLOCK_REASONS = ['Landslide', 'Flood', 'Bridge damage', 'Road collapse', 'Fallen tree', 'Accident', 'Construction', 'Other'] as const;
export type RoadBlockReason = typeof ROAD_BLOCK_REASONS[number];

export interface BlockedRoad {
  edge_id: number; reason: RoadBlockReason; note: string | null; reported_by: string; created_at: string;
  road_name: string; category: string; length_m: number; district_id: number | null; district: string; state: string;
}

export interface ConnectivitySummary {
  region: string; road_km_total: number; districts: number; population_total: number;
  roads_blocked: number; km_blocked: number;
  population_cut_off: number; villages_cut_off: number; facilities_cut_off: number;
  health_facilities_cut_off: Place[];
  cut_off_by_district: ImpactResult['by_district'];
  blocked: BlockedRoad[];
  landslide_risk: { source: string; probability: number; risk_level: string; explanation: string } | null;
}

async function send<T>(method: 'GET' | 'POST' | 'DELETE', path: string, token?: string | null, body?: unknown): Promise<T> {
  const base = getBackendUrl();
  if (!base) throw new Error('No backend URL configured. Set it on the Officials Login page.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const logisticsApi = {
  region: () => send<{ report: RegionReport; districts: District[] }>('GET', '/api/logistics/region'),
  network: (district: number) => send<{ district: District; roads: RoadFeatures }>('GET', `/api/logistics/network?district=${district}`),
  regionMap: (include: number[] = []) => send<{ roads: RoadFeatures }>('GET', `/api/logistics/region-map${include.length ? `?include=${include.join(',')}` : ''}`),
  places: (district: number) => send<{ district: District; villages: Place[]; facilities: Place[] }>('GET', `/api/logistics/places?district=${district}`),
  route: (origin: LatLon, destination: LatLon, blocked: number[]) =>
    send<RouteResult>('POST', '/api/logistics/route', null, { origin, destination, blocked_edge_ids: blocked }),
  impact: (blocked: number[], hub?: LatLon) => send<ImpactResult>('POST', '/api/logistics/impact', null, { blocked_edge_ids: blocked, hub }),
};

export const roadsApi = {
  summary: (district?: number) => send<ConnectivitySummary>('GET', `/api/connectivity/summary${district ? `?district=${district}` : ''}`),
  blocked: () => send<{ blocked: BlockedRoad[] }>('GET', '/api/roads/blocked'),
  block: (token: string, edge_id: number, reason: RoadBlockReason, note?: string) =>
    send('POST', '/api/roads/blocked', token, { edge_id, reason, note: note || undefined }),
  reopen: (token: string, edge_id: number) => send('DELETE', `/api/roads/blocked/${edge_id}`, token),
};

/** Dima Hasao (listed as N.C.Hills in GeoSadak): the pilot district. */
export const DEFAULT_DISTRICT_ID = 378;
/** Pseudo-district for the whole-region view: major roads (NH/SH/MDR) of all 8 states. */
export const REGION_ID = 0;

/** Roads for a district, or for the whole region (plus the given extra edges, e.g. blocked village roads). */
export const loadRoads = (districtId: number, include: number[] = []) =>
  (districtId === REGION_ID ? logisticsApi.regionMap(include) : logisticsApi.network(districtId)).then((r) => r.roads);
