/**
 * Shipments & Vehicles — essential-supply deliveries across the North East.
 * Create a shipment (Setu plans the route), send the driver their tracking
 * link, and watch live ETA, delay and alerts (cut off / rerouted / delayed /
 * no signal) that account for currently blocked roads.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Plus, Copy, AlertTriangle, CheckCircle2, PlayCircle, PackageCheck, XCircle, Loader2, FlaskConical } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PlaceChooser, Endpoint } from '../../components/PlaceChooser';
import { RoadMapView } from '../../components/map/RoadMapView';
import { MapMarker, RouteLine } from '../../components/map/mapTypes';
import { logisticsApi, roadsApi, loadRoads, District, Place, RoadFeatures, DEFAULT_DISTRICT_ID, REGION_ID } from '../../services/logistics';
import { shipmentsApi, COMMODITIES, UNITS, PRIORITIES, Shipment, ShipmentSummary } from '../../services/shipments';

const STATUS_TONE: Record<string, string> = { planned: 'bg-slate-700', in_transit: 'bg-blue-700', delivered: 'bg-green-700', cancelled: 'bg-slate-500' };
const PRIORITY_TONE: Record<string, string> = { Critical: 'text-red-700', High: 'text-orange-700', Normal: 'text-slate-300' };
const fmtEta = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const trackUrl = (s: Shipment) => `${window.location.origin}${s.tracking_path}`;

const NewShipment: React.FC<{ token: string; districts: District[]; onCreated: (s: Shipment) => void }> = ({ token, districts, onCreated }) => {
  const [fromD, setFromD] = useState(DEFAULT_DISTRICT_ID);
  const [toD, setToD] = useState(DEFAULT_DISTRICT_ID);
  const [fromP, setFromP] = useState<{ villages: Place[]; facilities: Place[] } | null>(null);
  const [toP, setToP] = useState<{ villages: Place[]; facilities: Place[] } | null>(null);
  const [origin, setOrigin] = useState<Endpoint | null>(null);
  const [dest, setDest] = useState<Endpoint | null>(null);
  const [form, setForm] = useState({ commodity: 'Medicines', quantity: '', unit: 'kg', priority: 'High', vehicle_reg: '', driver_name: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { logisticsApi.places(fromD).then(setFromP).catch(() => {}); }, [fromD]);
  useEffect(() => { logisticsApi.places(toD).then(setToP).catch(() => {}); }, [toD]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = 'w-full border border-slate-700 rounded-lg p-2 text-sm bg-white';

  const submit = async () => {
    if (!origin || !dest) return setErr('Choose where the shipment starts and where it goes.');
    setBusy(true); setErr(null);
    try {
      onCreated(await shipmentsApi.create(token, {
        ...form, quantity: Number(form.quantity), driver_name: form.driver_name || undefined,
        origin: { name: origin.label, lat: origin.lat, lon: origin.lon }, destination: { name: dest.label, lat: dest.lat, lon: dest.lon },
      }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="bg-white border border-slate-800 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-gov-navy">New shipment</h2>
      <div className="grid sm:grid-cols-4 gap-2">
        <select id="ship-commodity" value={form.commodity} onChange={set('commodity')} className={field}>{COMMODITIES.map((c) => <option key={c}>{c}</option>)}</select>
        <input id="ship-qty" value={form.quantity} onChange={set('quantity')} type="number" min="0" placeholder="Quantity" className={field} />
        <select value={form.unit} onChange={set('unit')} className={field}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
        <select value={form.priority} onChange={set('priority')} className={field}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <PlaceChooser title="From" districts={districts} districtId={fromD} onDistrict={setFromD} places={fromP} value={origin} onPick={setOrigin} />
        <PlaceChooser title="To" districts={districts} districtId={toD} onDistrict={setToD} places={toP} value={dest} onPick={setDest} />
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <input id="ship-vehicle" value={form.vehicle_reg} onChange={set('vehicle_reg')} placeholder="Vehicle registration, e.g. AS01 AB 1234" className={field} />
        <input value={form.driver_name} onChange={set('driver_name')} placeholder="Driver name (optional)" className={field} />
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <button id="btn-create-shipment" onClick={submit} disabled={busy || !form.quantity || !form.vehicle_reg}
        className="px-4 py-2 rounded-lg bg-gov-navy hover:bg-gov-navy-light text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 cursor-pointer">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Plan route & create shipment
      </button>
    </div>
  );
};

export const Shipments: React.FC = () => {
  const { token } = useAuth();
  const [items, setItems] = useState<Shipment[]>([]);
  const [summary, setSummary] = useState<ShipmentSummary | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [roads, setRoads] = useState<RoadFeatures | null>(null);
  const [blocked, setBlocked] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    shipmentsApi.list(token, selected ?? undefined).then((r) => { setItems(r.shipments); setSummary(r.summary); }).catch((e) => setErr(e.message));
  }, [token, selected]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // live: refresh every 30 s
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    logisticsApi.region().then((r) => setDistricts(r.districts)).catch(() => {});
    roadsApi.blocked().then((r) => { const ids = r.blocked.map((b) => b.edge_id); setBlocked(ids); return loadRoads(REGION_ID, ids); }).then(setRoads).catch(() => {});
  }, []);

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); load(); } catch (e) { setErr((e as Error).message); } };
  const sel = items.find((s) => s.id === selected) ?? null;
  const active = items.filter((s) => s.status === 'planned' || s.status === 'in_transit');
  const alerting = active.filter((s) => s.alerts.length);

  const markers = useMemo<MapMarker[]>(() => active.map((s) => ({
    lat: s.last_lat ?? s.o_lat, lon: s.last_lon ?? s.o_lon,
    color: s.alerts.some((a) => a.type === 'cut_off') ? '#c62828' : s.alerts.length ? '#e07b13' : s.status === 'in_transit' ? '#1c4f9e' : '#64748b',
    label: `${s.vehicle_reg} · ${s.commodity} → ${s.dest_name}`,
  })).concat(sel ? [{ lat: sel.d_lat, lon: sel.d_lon, color: '#138808', label: `Destination: ${sel.dest_name}` }] : []), [active, sel]);
  const routes = useMemo<RouteLine[]>(() => (sel?.remaining?.geometry ? [{ coordinates: sel.remaining.geometry.coordinates, color: sel.alerts.length ? '#e07b13' : '#138808' }] : []), [sel]);

  const kpis = summary ? [
    { label: 'In transit', value: summary.in_transit, tone: 'text-blue-700' },
    { label: 'Planned', value: summary.planned, tone: 'text-slate-100' },
    { label: 'Need attention', value: summary.with_alerts, tone: summary.with_alerts ? 'text-orange-700' : 'text-slate-100' },
    { label: 'Cut off', value: summary.cut_off, tone: summary.cut_off ? 'text-red-600' : 'text-slate-100' },
    { label: 'Delivered today', value: summary.delivered_today, tone: 'text-green-700' },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gov-navy flex items-center gap-2"><Truck className="w-5 h-5" /> Shipments & Vehicles</h1>
          <p className="text-sm text-slate-400">Essential supplies on the move. ETAs and alerts account for currently blocked roads; drivers share GPS through a private link — no app or login.</p>
        </div>
        <button id="btn-new-shipment" onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-gov-saffron text-gov-navy-dark text-sm font-semibold flex items-center gap-2 cursor-pointer"><Plus className="w-4 h-4" /> New shipment</button>
      </div>
      {err && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-2.5">{err}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {kpis.map((k) => <div key={k.label} className="bg-white border border-slate-800 rounded-xl p-3"><div className="text-xs font-semibold text-slate-400">{k.label}</div><div className={`text-2xl font-bold ${k.tone}`}>{k.value}</div></div>)}
      </div>

      {showNew && token && <NewShipment token={token} districts={districts} onCreated={(s) => { setShowNew(false); setSelected(s.id); load(); }} />}

      {alerting.length > 0 && (
        <div className="bg-white border border-red-800 rounded-xl p-4">
          <h2 className="font-semibold text-red-700 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" /> Alerts ({alerting.length})</h2>
          <ul className="space-y-1 text-sm">
            {alerting.map((s) => s.alerts.map((a, i) => (
              <li key={`${s.id}-${i}`}><button onClick={() => setSelected(s.id)} className="text-left hover:underline cursor-pointer"><span className="font-semibold">{s.vehicle_reg}</span> ({s.priority} · {s.commodity} → {s.dest_name}): <span className={a.type === 'cut_off' ? 'text-red-700' : 'text-orange-700'}>{a.text}</span></button></li>
            )))}
          </ul>
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_420px] gap-4">
        <div className="bg-white border border-slate-800 rounded-xl overflow-hidden">
          {roads ? <RoadMapView mapKey="shipments" roads={roads} blockedIds={blocked} markers={markers} routes={routes} height="h-[560px]" /> : <p className="p-6 text-sm text-slate-400">Loading map…</p>}
        </div>
        <div className="space-y-2 max-h-[640px] overflow-auto">
          {!items.length && <p className="text-sm text-slate-400 bg-white border border-slate-800 rounded-xl p-4">No shipments yet. Create one to plan its route and get the driver's tracking link.</p>}
          {items.map((s) => (
            <div key={s.id} onClick={() => setSelected(s.id)} className={`bg-white border rounded-xl p-3 text-sm cursor-pointer ${selected === s.id ? 'border-blue-600 ring-2 ring-blue-600/20' : 'border-slate-800'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-100">{s.vehicle_reg} <span className={`text-xs ${PRIORITY_TONE[s.priority]}`}>· {s.priority}</span></span>
                <span className={`text-xs text-white px-2 py-0.5 rounded ${STATUS_TONE[s.status]}`}>{s.status.replace('_', ' ')}{s.simulated ? ' · demo' : ''}</span>
              </div>
              <p className="text-slate-300">{s.quantity} {s.unit} {s.commodity}</p>
              <p className="text-xs text-slate-400">{s.origin_name} → {s.dest_name}</p>
              {(s.status === 'planned' || s.status === 'in_transit') && (
                <p className="text-xs mt-1">ETA <span className="font-semibold">{fmtEta(s.eta)}</span>{s.remaining ? ` · ${s.remaining.km} km left` : ''}{s.delay_min !== null && s.status === 'in_transit' ? <span className={s.delay_min > 30 ? ' text-orange-700' : ' text-green-700'}> · {s.delay_min > 0 ? `${s.delay_min} min late` : s.delay_min < 0 ? `${-s.delay_min} min ahead` : 'on time'}</span> : ''}</p>
              )}
              {s.alerts.map((a, i) => <p key={i} className={`text-xs ${a.type === 'cut_off' ? 'text-red-700' : 'text-orange-700'}`}>⚠ {a.text}</p>)}
              {selected === s.id && (
                <div className="mt-2 pt-2 border-t border-slate-800 space-y-2" onClick={(e) => e.stopPropagation()}>
                  {(s.status === 'planned' || s.status === 'in_transit') && (
                    <button onClick={() => { navigator.clipboard?.writeText(trackUrl(s)); setCopied(s.id); }} className="text-xs text-blue-600 flex items-center gap-1 cursor-pointer">
                      <Copy className="w-3 h-3" /> {copied === s.id ? 'Driver link copied — send it by SMS/WhatsApp' : 'Copy driver tracking link'}
                    </button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {s.status === 'planned' && <button onClick={() => act(() => shipmentsApi.action(token!, s.id, 'start'))} className="px-2.5 py-1 rounded-lg bg-blue-700 text-white text-xs flex items-center gap-1 cursor-pointer"><PlayCircle className="w-3.5 h-3.5" /> Start</button>}
                    {s.status === 'in_transit' && <button onClick={() => act(() => shipmentsApi.action(token!, s.id, 'deliver'))} className="px-2.5 py-1 rounded-lg bg-green-700 text-white text-xs flex items-center gap-1 cursor-pointer"><PackageCheck className="w-3.5 h-3.5" /> Mark delivered</button>}
                    {(s.status === 'planned' || s.status === 'in_transit') && <button onClick={() => act(() => shipmentsApi.action(token!, s.id, 'cancel'))} className="px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"><XCircle className="w-3.5 h-3.5" /> Cancel</button>}
                    {s.status === 'delivered' && <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Delivered {fmtEta(s.delivered_at)}</span>}
                  </div>
                  {(s.status === 'planned' || s.status === 'in_transit') && (
                    <label className="block text-xs text-slate-400">
                      <span className="flex items-center gap-1"><FlaskConical className="w-3 h-3" /> Demo: move the vehicle along its route (simulated, marked "demo")</span>
                      <input type="range" min={0} max={100} defaultValue={0} className="w-full"
                        onMouseUp={(e) => act(() => shipmentsApi.simulate(token!, s.id, Number((e.target as HTMLInputElement).value) / 100))}
                        onTouchEnd={(e) => act(() => shipmentsApi.simulate(token!, s.id, Number((e.target as HTMLInputElement).value) / 100))} />
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
