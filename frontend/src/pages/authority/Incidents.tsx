/**
 * Field Incidents — report road problems from the field, review them in the office.
 *  Report: GPS position + photo + type/severity; works offline (queued, sent later).
 *  Review: verify (optionally marking the road blocked in one step) or reject.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Camera, LocateFixed, Send, WifiOff, CheckCircle2, XCircle, Ban, Loader2, RefreshCw, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROAD_BLOCK_REASONS, RoadBlockReason } from '../../services/logistics';
import {
  incidentsApi, enqueue, flushQueue, queuedReports, compressPhoto, Incident, IncidentStatus, Severity,
} from '../../services/incidents';

const SEVERITY_TONE: Record<Severity, string> = { High: 'bg-red-600 text-white', Medium: 'bg-orange-600 text-white', Low: 'bg-yellow-600 text-white' };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const ReportForm: React.FC<{ token: string; onSent: () => void }> = ({ token, onSent }) => {
  const [pos, setPos] = useState<{ lat: number; lon: number; acc: number } | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [type, setType] = useState<RoadBlockReason>('Landslide');
  const [severity, setSeverity] = useState<Severity>('High');
  const [desc, setDesc] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const locate = () => {
    setGpsErr(null);
    if (!navigator.geolocation) return setGpsErr('This device has no GPS / location support.');
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      (e) => setGpsErr(e.message || 'Could not get location. Allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 15000 });
  };
  useEffect(locate, []);

  const submit = async () => {
    if (!pos) return;
    const draft = { client_id: newId(), lat: pos.lat, lon: pos.lon, incident_type: type, severity,
      description: desc || undefined, photo_base64: photo || undefined, captured_at: new Date().toISOString() };
    setBusy(true); setMsg(null);
    try {
      const r = await incidentsApi.submit(token, draft);
      setMsg({ tone: 'ok', text: r.road_name ? `Report #${r.id} sent — linked to ${r.road_name} (${r.district}), ${r.snap_m} m away.` : `Report #${r.id} sent — not within 2 km of a mapped road.` });
      setDesc(''); setPhoto(null); onSent();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (!status || status >= 500) {
        try { enqueue(draft); setMsg({ tone: 'warn', text: 'No connection — report saved on this device and will be sent automatically when you are back online.' }); setDesc(''); setPhoto(null); onSent(); }
        catch (qe) { setMsg({ tone: 'err', text: (qe as Error).message }); }
      } else setMsg({ tone: 'err', text: (e as Error).message });
    } finally { setBusy(false); }
  };

  const field = 'w-full border border-slate-700 rounded-lg p-2.5 text-sm bg-white';
  return (
    <div className="bg-white border border-slate-800 rounded-xl p-4 space-y-3 max-w-xl">
      <div className="rounded-lg bg-slate-950 p-3 text-sm flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 mt-0.5 text-gov-navy shrink-0" />
          {pos ? <span>{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)} <span className="text-xs text-slate-400">(±{pos.acc} m)</span></span>
               : <span className="text-slate-400">{gpsErr ?? 'Getting your location…'}</span>}
        </div>
        <button onClick={locate} className="text-xs text-blue-600 flex items-center gap-1 shrink-0 cursor-pointer"><LocateFixed className="w-3.5 h-3.5" /> Update</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-slate-300">What happened
          <select id="incident-type" value={type} onChange={(e) => setType(e.target.value as RoadBlockReason)} className={`${field} mt-1`}>
            {ROAD_BLOCK_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-300">Severity
          <select id="incident-severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className={`${field} mt-1`}>
            <option value="High">High — road closed</option><option value="Medium">Medium — one lane / slow</option><option value="Low">Low — passable</option>
          </select>
        </label>
      </div>
      <textarea id="incident-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={1000} placeholder="What do you see? e.g. debris across both lanes, 50 m long" className={field} />
      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-700 rounded-lg p-3 text-sm text-slate-300 cursor-pointer hover:bg-slate-950">
        <Camera className="w-4 h-4" /> {photo ? 'Change photo' : 'Take / add a photo'}
        <input id="incident-photo" type="file" accept="image/*" capture="environment" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await compressPhoto(f)); } catch (err) { setMsg({ tone: 'err', text: (err as Error).message }); } } }} />
      </label>
      {photo && <img src={photo} alt="Incident" className="w-full max-h-56 object-cover rounded-lg" />}
      <button id="btn-submit-incident" disabled={!pos || busy} onClick={submit} className="w-full py-2.5 rounded-lg bg-gov-navy hover:bg-gov-navy-light text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send report
      </button>
      {msg && <p className={`text-sm rounded-lg p-2.5 ${msg.tone === 'ok' ? 'bg-green-50 text-green-700' : msg.tone === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
    </div>
  );
};

const ReviewCard: React.FC<{ inc: Incident; token: string; onDone: () => void }> = ({ inc, token, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="bg-white border border-slate-800 rounded-xl overflow-hidden flex flex-col sm:flex-row">
      {inc.photo_url ? <img src={incidentsApi.photoUrl(inc.photo_url)} alt="" className="sm:w-48 h-40 sm:h-auto object-cover" />
                     : <div className="sm:w-48 h-24 sm:h-auto bg-slate-950 flex items-center justify-center text-xs text-slate-500">No photo</div>}
      <div className="p-4 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-100">#{inc.id} · {inc.incident_type}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${SEVERITY_TONE[inc.severity]}`}>{inc.severity}</span>
          {inc.status !== 'reported' && <span className={`text-xs font-semibold px-2 py-0.5 rounded ${inc.status === 'verified' ? 'bg-green-700 text-white' : 'bg-slate-700 text-white'}`}>{inc.status}</span>}
        </div>
        <p className="text-sm text-slate-300">{inc.road_name ? <>{inc.road_name} <span className="text-slate-500">({inc.road_category}) · {inc.district}, {inc.state} · {inc.snap_m} m from road</span></> : <span className="text-amber-700">Not within 2 km of a mapped road</span>}</p>
        {inc.description && <p className="text-sm text-slate-200">“{inc.description}”</p>}
        <p className="text-xs text-slate-500">by {inc.reported_by} · {new Date(inc.captured_at ?? inc.created_at).toLocaleString('en-IN')} · {inc.lat.toFixed(4)}, {inc.lon.toFixed(4)}</p>
        {inc.status === 'reported' ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {inc.edge_id !== null && <button disabled={busy} onClick={() => act(() => incidentsApi.verify(token, inc.id, true))} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><Ban className="w-3.5 h-3.5" /> Verify & block road</button>}
            <button disabled={busy} onClick={() => act(() => incidentsApi.verify(token, inc.id, false))} className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" /> Verify only</button>
            <button disabled={busy} onClick={() => act(() => incidentsApi.reject(token, inc.id))} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><XCircle className="w-3.5 h-3.5" /> Reject</button>
          </div>
        ) : <p className="text-xs text-slate-500">{inc.status} by {inc.reviewed_by}</p>}
        {err && <p className="text-xs text-red-700">{err}</p>}
      </div>
    </div>
  );
};

export const Incidents: React.FC = () => {
  const { token } = useAuth();
  const [tab, setTab] = useState<'report' | 'review'>('report');
  const [filter, setFilter] = useState<IncidentStatus>('reported');
  const [list, setList] = useState<Incident[]>([]);
  const [queued, setQueued] = useState(queuedReports().length);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(() => { if (token) incidentsApi.list(token, filter).then((r) => setList(r.incidents)).catch(() => {}); }, [token, filter]);
  useEffect(load, [load]);

  const sync = useCallback(async () => {
    if (!token || !queuedReports().length) return;
    const r = await flushQueue(token);
    setQueued(queuedReports().length);
    if (r.sent || r.rejected.length) setSyncMsg(`Sent ${r.sent} saved report${r.sent === 1 ? '' : 's'}` + (r.rejected.length ? `; ${r.rejected.length} rejected (${r.rejected[0].reason})` : ''));
    load();
  }, [token, load]);

  useEffect(() => {
    const up = () => { setOnline(true); sync(); }, down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    sync();
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [sync]);

  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium cursor-pointer ${tab === t ? 'bg-gov-navy text-white' : 'bg-white text-slate-300 hover:bg-slate-950'}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gov-navy">Field Incidents</h1>
          <p className="text-sm text-slate-400">Report road problems from the field with GPS and a photo; verified reports can block the road in one step.</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">{tabBtn('report', 'Report')}{tabBtn('review', 'Review')}</div>
      </div>

      {(!online || queued > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-800 p-3 text-sm text-amber-700">
          <span className="flex items-center gap-2"><WifiOff className="w-4 h-4" /> {!online ? 'You are offline. ' : ''}{queued} report{queued === 1 ? '' : 's'} saved on this device, waiting to send.</span>
          {online && queued > 0 && <button onClick={sync} className="text-xs font-semibold flex items-center gap-1 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /> Send now</button>}
        </div>
      )}
      {syncMsg && <p className="text-sm text-green-700 bg-green-50 rounded-lg p-2.5">{syncMsg}</p>}

      {tab === 'report' ? <ReportForm token={token!} onSent={() => { setQueued(queuedReports().length); load(); }} /> : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['reported', 'verified', 'rejected'] as IncidentStatus[]).map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer ${filter === s ? 'bg-gov-navy text-white' : 'bg-white border border-slate-700 text-slate-300'}`}>{s === 'reported' ? 'Awaiting review' : s}</button>
            ))}
          </div>
          {!list.length && <p className="text-sm text-slate-400">No {filter === 'reported' ? 'reports awaiting review' : `${filter} reports`}.</p>}
          {list.map((inc) => <ReviewCard key={inc.id} inc={inc} token={token!} onDone={load} />)}
        </div>
      )}
    </div>
  );
};
