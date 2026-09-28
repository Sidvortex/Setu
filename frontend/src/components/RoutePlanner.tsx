/**
 * Route Planner — anywhere in the North Eastern Region.
 * Pick a start and destination (district → place); routes avoid the roads
 * currently reported blocked. In 'ops' mode officials can also click roads to
 * add what-if blockages (not saved) and see who would be cut off; the public
 * mode shows routes only. Travel times use assumed hill-road speeds.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Route, Ban, RotateCcw, AlertTriangle, CheckCircle2, Clock, Loader2, Unlink } from 'lucide-react';
import { DistrictPicker } from './DistrictPicker';
import { RoadMapView } from './map/RoadMapView';
import { MapMarker, RouteLine } from './map/mapTypes';
import {
  logisticsApi, roadsApi, District, ImpactResult, LatLon, Place, RoadFeatures, RouteResult, DEFAULT_DISTRICT_ID,
} from '../services/logistics';

interface Endpoint extends LatLon { label: string }

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

export const RoutePlanner: React.FC<{ mode?: 'ops' | 'public' }> = ({ mode = 'ops' }) => {
  const isOps = mode === 'ops';

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

  const routeLines = useMemo<RouteLine[]>(() => {
    const lines: RouteLine[] = [];
    if (route?.normal && route.status !== 'ok') lines.push({ coordinates: route.normal.geometry.coordinates, color: '#64748b', dashed: true });
    if (route?.current) lines.push({ coordinates: route.current.geometry.coordinates, color: route.status === 'rerouted' ? '#e07b13' : '#138808' });
    return lines;
  }, [route]);
  const markers = useMemo<MapMarker[]>(() => [
    ...(origin ? [{ lat: origin.lat, lon: origin.lon, color: '#0b3068', label: `From: ${origin.label}` }] : []),
    ...(destination ? [{ lat: destination.lat, lon: destination.lon, color: '#c62828', label: `To: ${destination.label}` }] : []),
  ], [origin, destination]);
  const toggleWhatIf = (id: number) => setWhatIf((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-800 rounded-xl p-4">
        <h2 className="text-lg font-semibold text-gov-navy flex items-center gap-2"><Route className="w-5 h-5" /> Route Planner — North Eastern Region</h2>
        <p className="text-xs text-slate-400">
          Routes avoid the {reported.length} road{reported.length === 1 ? '' : 's'} currently reported blocked.
          {isOps && ' Click roads on the map to add what-if blockages (not saved).'} Travel times are estimates at typical hill-road speeds.
        </p>
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
          {isOps && (
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
          )}
        </div>
        <div className="bg-white border border-slate-800 rounded-xl overflow-hidden">
          {roads ? <RoadMapView mapKey={fromD} roads={roads} blockedIds={reported} whatIfIds={whatIf} routes={routeLines} markers={markers}
                                onRoadClick={isOps ? toggleWhatIf : undefined} height="h-[640px]" />
                 : <p className="p-6 text-sm text-slate-400">Loading map…</p>}
          <div className="flex flex-wrap gap-4 px-4 py-2 text-xs text-slate-300 border-t border-slate-800">
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-1 bg-[#138808]" /> Route</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-1 bg-[#e07b13]" /> Detour</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-1 bg-[#c62828]" /> Reported blocked</span>
            {isOps && <span className="flex items-center gap-1"><span className="inline-block w-5 h-1 border-t-2 border-dashed border-[#c62828]" /> What-if block</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
