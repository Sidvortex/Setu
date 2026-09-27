/**
 * Route Planner — anywhere in the North Eastern Region.
 * Pick a start and destination (district → place), starting from the roads
 * currently reported blocked. Click roads on the map to add what-if
 * blockages (not saved) and see the detour, the delay, or that the
 * destination is cut off. Travel times use assumed hill-road speeds.
 */
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Route, Ban, RotateCcw, AlertTriangle, CheckCircle2, Clock, Loader2, Unlink } from 'lucide-react';
import { DistrictPicker } from './DistrictPicker';
import {
  logisticsApi, roadsApi, District, ImpactResult, LatLon, Place, RoadFeatures, RouteResult, DEFAULT_DISTRICT_ID,
} from '../services/logistics';

interface Endpoint extends LatLon { label: string }
const ROAD_STYLE: Record<string, { color: string; weight: number }> = {
  NH: { color: '#0b3068', weight: 4 }, SH: { color: '#1c4f9e', weight: 3.5 }, MDR: { color: '#2a5fb0', weight: 3 },
};
const baseStyle = (c: string, main: boolean) => ROAD_STYLE[c] ?? { color: main ? '#64748b' : '#a8b3c2', weight: 2 };

const PlaceChooser: React.FC<{
  title: string; districts: District[]; districtId: number; onDistrict: (id: number) => void;
  places: { villages: Place[]; facilities: Place[] } | null; value: Endpoint | null; onPick: (e: Endpoint) => void;
}> = ({ title, districts, districtId, onDistrict, places, value, onPick }) => (
  <div className="space-y-2">
    <p className="text-sm font-semibold text-gov-navy">{title}</p>
    <DistrictPicker districts={districts} value={districtId} onChange={onDistrict} />
    <select className="w-full bg-white border border-slate-700 rounded-lg p-2 text-sm text-slate-100" value=""
      onChange={(e) => {
        const [kind, id] = e.target.value.split(':');
        const p = (kind === 'f' ? places?.facilities : places?.villages)?.find((x) => String(x.id) === id);
        if (p) onPick({ lat: p.lat, lon: p.lon, label: p.name + (p.population ? ` (pop. ${p.population})` : '') });
      }}>
      <option value="" disabled>{value ? value.label : 'Choose a place…'}</option>
      <optgroup label="Health facilities">{places?.facilities.filter((f) => f.health).map((f) => <option key={`f${f.id}`} value={`f:${f.id}`}>{f.name}</option>)}</optgroup>
      <optgroup label="Largest villages">{places?.villages.map((v) => <option key={`v${v.id}`} value={`v:${v.id}`}>{v.name} — {v.population}</option>)}</optgroup>
      <optgroup label="Markets, schools, transport">{places?.facilities.filter((f) => !f.health).slice(0, 80).map((f) => <option key={`o${f.id}`} value={`f:${f.id}`}>{f.name}</option>)}</optgroup>
    </select>
  </div>
);

export const RoutePlanner: React.FC = () => {
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const roadsLayer = useRef<L.GeoJSON | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);

  const [districts, setDistricts] = useState<District[]>([]);
  const [fromD, setFromD] = useState(DEFAULT_DISTRICT_ID);
  const [toD, setToD] = useState(DEFAULT_DISTRICT_ID);
  const [fromPlaces, setFromPlaces] = useState<{ villages: Place[]; facilities: Place[] } | null>(null);
  const [toPlaces, setToPlaces] = useState<{ villages: Place[]; facilities: Place[] } | null>(null);
  const [roads, setRoads] = useState<RoadFeatures | null>(null);
  const [origin, setOrigin] = useState<Endpoint | null>(null);
  const [destination, setDestination] = useState<Endpoint | null>(null);
  const [reported, setReported] = useState<number[]>([]);
  const [whatIf, setWhatIf] = useState<number[]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = [...reported, ...whatIf];

  useEffect(() => {
    logisticsApi.region().then((r) => setDistricts(r.districts)).catch((e) => setError(e.message));
    roadsApi.blocked().then((r) => setReported(r.blocked.map((b) => b.edge_id))).catch(() => {});
  }, []);
  useEffect(() => { logisticsApi.places(fromD).then(setFromPlaces).catch(() => {}); logisticsApi.network(fromD).then((r) => setRoads(r.roads)).catch(() => {}); }, [fromD]);
  useEffect(() => { logisticsApi.places(toD).then(setToPlaces).catch(() => {}); }, [toD]);

  // Map for the starting district's roads (rebuilt when it changes)
  useEffect(() => {
    if (!roads || !mapDiv.current) return;
    const map = L.map(mapDiv.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors · Roads: PMGSY GeoSadak (MoRD)', maxZoom: 18 }).addTo(map);
    const layer = L.geoJSON(roads, {
      style: (f) => ({ ...baseStyle(f?.properties.category, f?.properties.in_main_network), opacity: 0.9 }),
      onEachFeature: (f, l) => {
        l.bindTooltip(`${f.properties.road_name || 'Unnamed road'} · ${f.properties.category}`, { sticky: true });
        l.on('click', () => setWhatIf((w) => (w.includes(f.properties.edge_id) ? w.filter((x) => x !== f.properties.edge_id) : [...w, f.properties.edge_id])));
      },
    }).addTo(map);
    map.fitBounds(layer.getBounds(), { padding: [10, 10] });
    roadsLayer.current = layer; overlay.current = L.layerGroup().addTo(map); mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __routeMap?: L.Map }).__routeMap = map; // debugging aid in dev only
    return () => { map.remove(); mapRef.current = null; };
  }, [roads]);

  useEffect(() => {
    roadsLayer.current?.eachLayer((layer) => {
      const l = layer as L.Path & { feature?: GeoJSON.Feature<GeoJSON.LineString, { edge_id: number; category: string; in_main_network: boolean }> };
      const p = l.feature?.properties; if (!p) return;
      if (reported.includes(p.edge_id)) l.setStyle({ color: '#c62828', weight: 7, dashArray: undefined });
      else if (whatIf.includes(p.edge_id)) l.setStyle({ color: '#c62828', weight: 6, dashArray: '6 6' });
      else l.setStyle({ ...baseStyle(p.category, p.in_main_network), dashArray: undefined });
    });
  }, [reported, whatIf, roads]);

  useEffect(() => {
    if (!origin || !destination) return;
    let stale = false; setBusy(true); setError(null);
    logisticsApi.route(origin, destination, blocked)
      .then((r) => { if (!stale) setRoute(r); })
      .catch((e) => { if (!stale) { setError(e.message); setRoute(null); } })
      .finally(() => { if (!stale) setBusy(false); });
    return () => { stale = true; };
  }, [origin, destination, reported, whatIf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!whatIf.length) { setImpact(null); return; }
    let stale = false;
    logisticsApi.impact(blocked).then((r) => { if (!stale) setImpact(r); }).catch(() => {});
    return () => { stale = true; };
  }, [whatIf, reported]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = overlay.current, map = mapRef.current; if (!g || !map) return;
    g.clearLayers();
    const ll = (c: [number, number][][]) => c.map((line) => line.map(([x, y]) => [y, x] as [number, number]));
    const drawn: L.Polyline[] = [];
    // non-interactive so clicks reach the roads underneath (those are what users block)
    if (route?.normal && route.status !== 'ok') drawn.push(L.polyline(ll(route.normal.geometry.coordinates), { color: '#64748b', weight: 5, dashArray: '4 8', interactive: false }).addTo(g));
    if (route?.current) drawn.push(L.polyline(ll(route.current.geometry.coordinates), { color: route.status === 'rerouted' ? '#e07b13' : '#138808', weight: 6, interactive: false }).addTo(g));
    [[origin, '#0b3068', 'From'], [destination, '#c62828', 'To']].forEach(([p, c, t]) => {
      const e = p as Endpoint | null; if (e) L.circleMarker([e.lat, e.lon], { radius: 9, color: '#fff', weight: 2, fillColor: c as string, fillOpacity: 1 }).bindTooltip(`${t}: ${e.label}`).addTo(g);
    });
    if (drawn.length) map.fitBounds(L.featureGroup(drawn).getBounds(), { padding: [30, 30] });
  }, [route, origin, destination]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-800 rounded-xl p-4">
        <h2 className="text-lg font-semibold text-gov-navy flex items-center gap-2"><Route className="w-5 h-5" /> Route Planner — North Eastern Region</h2>
        <p className="text-xs text-slate-400">Starts from the {reported.length} road{reported.length === 1 ? '' : 's'} currently reported blocked. Click roads on the map to add what-if blockages (not saved). Travel times use assumed hill-road speeds.</p>
      </div>
      <div className="grid lg:grid-cols-[360px_1fr] gap-4">
        <div className="space-y-3">
          <div className="bg-white border border-slate-800 rounded-xl p-4 space-y-4">
            <PlaceChooser title="From" districts={districts} districtId={fromD} onDistrict={setFromD} places={fromPlaces} value={origin} onPick={setOrigin} />
            <PlaceChooser title="To" districts={districts} districtId={toD} onDistrict={setToD} places={toPlaces} value={destination} onPick={setDestination} />
          </div>
          <div className="bg-white border border-slate-800 rounded-xl p-4">
            {!origin || !destination ? <p className="text-sm text-slate-400">Choose a start and a destination.</p> : null}
            {busy && <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Calculating…</p>}
            {error && <p className="text-sm text-red-700">{error}</p>}
            {route && !busy && (
              <>
                {route.status === 'ok' && <p className="font-semibold text-green-700 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Route open</p>}
                {route.status === 'rerouted' && <p className="font-semibold text-orange-700 flex items-center gap-2"><Clock className="w-5 h-5" /> Rerouted: +{route.delay_min} min</p>}
                {route.status === 'unreachable' && <p className="font-semibold text-red-700 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Cut off — no route</p>}
                {route.status === 'no_data_link' && <p className="font-semibold text-amber-700 flex items-center gap-2"><Unlink className="w-5 h-5" /> No road link in the source data</p>}
                {route.normal && (
                  <dl className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    <div className="bg-slate-950 rounded-lg p-2"><dt className="text-xs text-slate-400">Normal</dt><dd className="font-semibold text-slate-100">{route.normal.km} km · {(route.normal.minutes / 60).toFixed(1)} h</dd></div>
                    <div className="bg-slate-950 rounded-lg p-2"><dt className="text-xs text-slate-400">Now</dt><dd className="font-semibold text-slate-100">{route.current ? `${route.current.km} km · ${(route.current.minutes / 60).toFixed(1)} h` : '—'}</dd></div>
                  </dl>
                )}
                {route.status === 'no_data_link' && <p className="text-xs text-slate-400 mt-2">The government road data has no connection between these places (e.g. Sikkim's link runs through West Bengal). This isn't a blockage.</p>}
              </>
            )}
          </div>
          <div className="bg-white border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2"><Ban className="w-4 h-4 text-red-600" /> What-if blocks ({whatIf.length})</h3>
              {whatIf.length > 0 && <button onClick={() => setWhatIf([])} className="text-xs text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"><RotateCcw className="w-3 h-3" /> Clear</button>}
            </div>
            {!whatIf.length && <p className="text-xs text-slate-400">Click a road on the map to test a blockage.</p>}
            {impact && (
              <div className="mt-2 rounded-lg bg-red-50 border border-red-800 p-3 text-sm">
                <p className="font-semibold text-red-700">Cut off from the regional network:</p>
                <p className="text-slate-200 mt-1">{impact.population_cut_off.toLocaleString('en-IN')} people · {impact.villages_cut_off} villages · {impact.facilities_cut_off.filter((f) => f.health).length} health facilities</p>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white border border-slate-800 rounded-xl overflow-hidden">
          {roads ? <div ref={mapDiv} key={fromD} className="w-full h-[640px]" /> : <p className="p-6 text-sm text-slate-400">Loading map…</p>}
          <div className="flex flex-wrap gap-4 px-4 py-2 text-xs text-slate-300 border-t border-slate-800">
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-1 bg-[#138808]" /> Route</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-1 bg-[#e07b13]" /> Detour</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-1 bg-[#c62828]" /> Reported blocked</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-1 border-t-2 border-dashed border-[#c62828]" /> What-if block</span>
          </div>
        </div>
      </div>
    </div>
  );
};
