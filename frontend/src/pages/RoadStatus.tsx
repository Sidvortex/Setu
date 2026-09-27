/** Public "is my road open?" page, for every NER district. */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PublicHeader } from '../components/PublicHeader';
import { PageBanner } from '../components/gov/PageBanner';
import { RoadStatusMap } from '../components/RoadStatusMap';
import { DistrictPicker } from '../components/DistrictPicker';
import { logisticsApi, roadsApi, ConnectivitySummary, District, RoadFeatures, DEFAULT_DISTRICT_ID } from '../services/logistics';

export const RoadStatus: React.FC = () => {
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtId, setDistrictId] = useState(DEFAULT_DISTRICT_ID);
  const [roads, setRoads] = useState<RoadFeatures | null>(null);
  const [s, setS] = useState<ConnectivitySummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    logisticsApi.region().then((r) => setDistricts(r.districts)).catch((e) => setErr(e.message));
    roadsApi.summary().then(setS).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { setRoads(null); logisticsApi.network(districtId).then((r) => setRoads(r.roads)).catch((e) => setErr(e.message)); }, [districtId]);
  const district = districts.find((d) => d.district_id === districtId);
  const here = s?.blocked.filter((b) => b.district_id === districtId) ?? [];

  return (
    <div className="flex-1 bg-gov-page flex flex-col">
      <PublicHeader />
      <PageBanner title="Live Road Status" crumbs={[{ label: 'Road Status' }]} />
      <main id="main-content" className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="bg-white border border-slate-800 rounded-xl p-3">
          {districts.length > 0 && <DistrictPicker districts={districts} value={districtId} onChange={setDistrictId} />}
        </div>
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <div className="bg-white border border-slate-800 rounded-xl overflow-hidden">
            {err && <p className="p-6 text-sm text-red-700">Couldn't load road status: {err}</p>}
            {roads && s ? <RoadStatusMap key={districtId} roads={roads} blockedIds={s.blocked.map((b) => b.edge_id)}
                                         cutOff={s.health_facilities_cut_off.filter((f) => f.district === district?.name)} />
              : !err && <p className="p-6 text-sm text-slate-400">Loading map…</p>}
          </div>
          <aside className="space-y-3">
            {s && (here.length === 0 ? (
              <div className="bg-white border border-slate-800 rounded-xl p-4 flex gap-3"><CheckCircle2 className="w-6 h-6 text-green-700 shrink-0" /><div><p className="font-semibold text-green-700">No reported blockages in {district?.name}</p><p className="text-xs text-slate-400">{district?.road_km.toLocaleString('en-IN')} km of roads monitored</p></div></div>
            ) : (
              <div className="bg-white border border-red-800 rounded-xl p-4">
                <p className="font-semibold text-red-700 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> {here.length} road{here.length > 1 ? 's' : ''} blocked in {district?.name}</p>
              </div>
            ))}
            {here.map((b) => (
              <div key={b.edge_id} className="bg-white border border-slate-800 rounded-xl p-4">
                <p className="font-semibold text-slate-100">{b.road_name}</p>
                <p className="text-xs text-slate-400">{b.category} · {(b.length_m / 1000).toFixed(1)} km</p>
                <p className="text-sm text-red-700 mt-1">{b.reason}{b.note ? ` — ${b.note}` : ''}</p>
                <p className="text-xs text-slate-500 mt-1">Reported {new Date(b.created_at).toLocaleString('en-IN')}</p>
              </div>
            ))}
            {s && s.roads_blocked > 0 && (
              <div className="bg-white border border-slate-800 rounded-xl p-4 text-sm">
                <p className="font-semibold text-slate-100">Across the North East</p>
                <p className="text-slate-300 mt-1">{s.roads_blocked} roads blocked · {s.population_cut_off.toLocaleString('en-IN')} rural residents in {s.villages_cut_off} villages cut off from the regional road network.</p>
              </div>
            )}
            <p className="text-xs text-slate-500 px-1">Status is entered by officials; field reports and live feeds come next.</p>
          </aside>
        </div>
      </main>
    </div>
  );
};
