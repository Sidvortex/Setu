/**
 * Connectivity dashboard — the officials' home screen, covering all 98 NER districts.
 * KPIs are region-wide; the map shows one district at a time. Click a road to
 * report or clear a blockage; everything recomputes from the shared road status.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Users, Hospital, MapPinned, Mountain, RotateCcw, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RoadStatusMap } from '../../components/RoadStatusMap';
import { DistrictPicker } from '../../components/DistrictPicker';
import {
  logisticsApi, roadsApi, ConnectivitySummary, District, RegionReport, RoadFeatures,
  ROAD_BLOCK_REASONS, RoadBlockReason, DEFAULT_DISTRICT_ID,
} from '../../services/logistics';

const RISK_TONE: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white', VERY_HIGH: 'bg-orange-600 text-white', HIGH: 'bg-amber-600 text-white',
  MODERATE: 'bg-yellow-600 text-white', LOW: 'bg-emerald-600 text-white',
};

export const Connectivity: React.FC = () => {
  const { token } = useAuth();
  const [districts, setDistricts] = useState<District[]>([]);
  const [report, setReport] = useState<RegionReport | null>(null);
  const [districtId, setDistrictId] = useState(DEFAULT_DISTRICT_ID);
  const [roads, setRoads] = useState<RoadFeatures | null>(null);
  const [s, setS] = useState<ConnectivitySummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [reason, setReason] = useState<RoadBlockReason>('Landslide');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { logisticsApi.region().then((r) => { setDistricts(r.districts); setReport(r.report); }).catch((e) => setErr(e.message)); }, []);
  const refresh = useCallback(() => roadsApi.summary(districtId).then(setS).catch((e) => setErr(e.message)), [districtId]);
  useEffect(() => {
    setRoads(null); setSelected(null);
    logisticsApi.network(districtId).then((r) => setRoads(r.roads)).catch((e) => setErr(e.message));
    refresh();
  }, [districtId, refresh]);

  const district = districts.find((d) => d.district_id === districtId);
  const blockedIds = s?.blocked.map((b) => b.edge_id) ?? [];
  const selectedRoad = selected !== null ? roads?.features.find((f) => f.properties.edge_id === selected)?.properties : undefined;
  const selectedIsBlocked = selected !== null && blockedIds.includes(selected);
  const healthHere = (s?.health_facilities_cut_off ?? []).filter((f) => f.district === district?.name);

  const act = async (fn: () => Promise<unknown>) => {
    setSaving(true); setErr(null);
    try { await fn(); await refresh(); setSelected(null); setNote(''); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Request failed'); }
    finally { setSaving(false); }
  };

  const kpis = s ? [
    { icon: Ban, label: 'Roads blocked', value: `${s.roads_blocked}`, sub: `${s.km_blocked} km across NER`, alert: s.roads_blocked > 0 },
    { icon: Users, label: 'Rural population cut off', value: s.population_cut_off.toLocaleString('en-IN'), sub: `${s.villages_cut_off} villages`, alert: s.population_cut_off > 0 },
    { icon: Hospital, label: 'Health facilities cut off', value: `${s.health_facilities_cut_off.length}`, sub: `${s.facilities_cut_off} facilities in total`, alert: s.health_facilities_cut_off.length > 0 },
    { icon: MapPinned, label: 'Road network', value: `${Math.round(s.road_km_total).toLocaleString('en-IN')} km`, sub: `${s.districts} districts · 8 states`, alert: false },
  ] : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gov-navy">Regional Connectivity — North Eastern Region</h1>
        <p className="text-sm text-slate-400">
          Which villages and health facilities a blockage separates from the regional road network.
          {report && ` ${report.largest_network_pct}% of the region's road junctions form one connected network.`}
        </p>
      </div>
      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-800 rounded-lg p-3">{err}</div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {kpis.map(({ icon: Icon, label, value, sub, alert }) => (
          <div key={label} className={`bg-white rounded-xl p-4 border ${alert ? 'border-red-800' : 'border-slate-800'}`}>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Icon className={`w-4 h-4 ${alert ? 'text-red-600' : 'text-gov-navy'}`} /> {label}</div>
            <div className={`text-2xl font-bold mt-1 ${alert ? 'text-red-600' : 'text-slate-100'}`}>{value}</div>
            <div className="text-xs text-slate-400">{sub}</div>
          </div>
        ))}
        <div className="bg-white rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Mountain className="w-4 h-4 text-gov-navy" /> Landslide risk · {district?.name ?? '…'}</div>
          {s?.landslide_risk ? (
            <>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-100">{Math.round(s.landslide_risk.probability * 100)}%</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${RISK_TONE[s.landslide_risk.risk_level] ?? ''}`}>{s.landslide_risk.risk_level.replace('_', ' ')}</span>
              </div>
              <div className="text-xs text-slate-400">today, via BhooSuraksha</div>
            </>
          ) : <div className="text-sm text-slate-400 mt-2">Risk engine not connected</div>}
        </div>
      </div>

      <div className="bg-white border border-slate-800 rounded-xl p-3 flex flex-wrap items-end justify-between gap-3">
        {districts.length > 0 && <DistrictPicker districts={districts} value={districtId} onChange={setDistrictId} />}
        {district && (
          <p className="text-xs text-slate-400">
            {district.road_km.toLocaleString('en-IN')} km of roads · {district.villages.toLocaleString('en-IN')} villages · {district.population.toLocaleString('en-IN')} rural population
          </p>
        )}
      </div>

      <div className="grid xl:grid-cols-[1fr_360px] gap-4">
        <div className="bg-white border border-slate-800 rounded-xl overflow-hidden">
          {roads && s ? <RoadStatusMap key={districtId} roads={roads} blockedIds={blockedIds} cutOff={healthHere} selectedId={selected} onRoadClick={setSelected} height="h-[600px]" />
            : <p className="p-6 text-sm text-slate-400">Loading {district?.name ?? 'district'}…</p>}
        </div>

        <div className="space-y-3">
          {selectedRoad && (
            <div className="bg-white border-2 border-orange-500 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-100">{selectedRoad.road_name || 'Unnamed road'}</p>
                  <p className="text-xs text-slate-400">{selectedRoad.category} · {(selectedRoad.length_m / 1000).toFixed(1)} km · segment #{selected}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
              </div>
              {selectedIsBlocked ? (
                <button id="btn-reopen-road" disabled={saving} onClick={() => act(() => roadsApi.reopen(token!, selected!))} className="mt-3 w-full py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Mark road open
                </button>
              ) : (
                <div className="mt-3 space-y-2">
                  <select id="block-reason" value={reason} onChange={(e) => setReason(e.target.value as RoadBlockReason)} className="w-full border border-slate-700 rounded-lg p-2 text-sm bg-white">
                    {ROAD_BLOCK_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. debris near km 12" className="w-full border border-slate-700 rounded-lg p-2 text-sm" />
                  <button id="btn-block-road" disabled={saving} onClick={() => act(() => roadsApi.block(token!, selected!, reason, note))} className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />} Mark road blocked
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-slate-800 rounded-xl p-4">
            <h2 className="font-semibold text-slate-100 mb-2">Blocked roads across NER ({s?.roads_blocked ?? 0})</h2>
            {s && !s.blocked.length && <p className="text-sm text-slate-400">None — all roads open.</p>}
            <ul className="space-y-2 max-h-72 overflow-auto">
              {s?.blocked.map((b) => (
                <li key={b.edge_id} className="border border-slate-800 rounded-lg p-2.5 text-sm">
                  <button onClick={() => { if (b.district_id) setDistrictId(b.district_id); setTimeout(() => setSelected(b.edge_id), 400); }} className="font-semibold text-slate-100 hover:text-blue-600 text-left cursor-pointer">{b.road_name}</button>
                  <p className="text-xs text-slate-400">{b.district}, {b.state}</p>
                  <p className="text-xs text-red-700">{b.reason}{b.note ? ` — ${b.note}` : ''}</p>
                  <p className="text-xs text-slate-500">by {b.reported_by} · {new Date(b.created_at).toLocaleString('en-IN')}</p>
                </li>
              ))}
            </ul>
          </div>

          {s && s.cut_off_by_district.length > 0 && (
            <div className="bg-white border border-red-800 rounded-xl p-4">
              <h2 className="font-semibold text-red-700 mb-2">Cut off, by district</h2>
              <table className="w-full text-sm">
                <tbody>
                  {s.cut_off_by_district.slice(0, 8).map((d) => (
                    <tr key={d.district_id} className="border-t border-slate-800">
                      <td className="py-1.5"><button className="text-left hover:text-blue-600 cursor-pointer" onClick={() => setDistrictId(d.district_id)}>{d.name}</button><span className="text-xs text-slate-500"> · {d.state}</span></td>
                      <td className="py-1.5 text-right font-mono">{d.population.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.health_facilities_cut_off.length > 0 && (
                <>
                  <h3 className="font-semibold text-red-700 mt-3 mb-1 text-sm">Health facilities cut off ({s.health_facilities_cut_off.length})</h3>
                  <ul className="text-sm text-slate-200 max-h-40 overflow-auto">
                    {s.health_facilities_cut_off.map((f) => <li key={f.id}>• {f.name} <span className="text-xs text-slate-500">({f.district})</span></li>)}
                  </ul>
                </>
              )}
              <p className="text-xs text-slate-500 mt-2">Rural habitations only (GeoSadak); town residents aren't counted.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
