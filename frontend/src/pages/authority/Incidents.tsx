/**
 * Field Incidents — report road problems from the field, review them in the office.
 *  Report: GPS position + photo + type/severity; works offline (queued, sent later).
 *  Review: verify (optionally marking the road blocked in one step) or reject.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { WifiOff, CheckCircle2, XCircle, Ban, RefreshCw, ShieldCheck, Users, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { IncidentReportForm } from '../../components/IncidentReportForm';
import { incidentsApi, flushQueue, queuedReports, Incident, IncidentStatus, Severity } from '../../services/incidents';

const SEVERITY_TONE: Record<Severity, string> = { High: 'bg-red-600 text-white', Medium: 'bg-orange-600 text-white', Low: 'bg-yellow-600 text-white' };

const CRED_TONE = (score: number | null) => score === null ? 'bg-slate-700 text-white' : score >= 70 ? 'bg-green-700 text-white' : score >= 40 ? 'bg-amber-600 text-white' : 'bg-red-600 text-white';

const ReviewCard: React.FC<{ inc: Incident; token: string; onDone: () => void }> = ({ inc, token, onDone }) => {
  const [why, setWhy] = useState(false);
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
          <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${inc.source === 'public' ? 'bg-blue-50 text-blue-700' : 'bg-slate-950 text-slate-300'}`}>
            {inc.source === 'public' ? <><Users className="w-3 h-3" /> Public</> : <><ShieldCheck className="w-3 h-3" /> Official</>}
          </span>
          {inc.credibility !== null && (
            <button onClick={() => setWhy((w) => !w)} className={`text-xs font-semibold px-2 py-0.5 rounded cursor-pointer ${CRED_TONE(inc.credibility)}`} title="Why this score?">
              Credibility {inc.credibility} · {inc.credibility_level}
            </button>
          )}
          {inc.status !== 'reported' && <span className={`text-xs font-semibold px-2 py-0.5 rounded ${inc.status === 'verified' ? 'bg-green-700 text-white' : 'bg-slate-700 text-white'}`}>{inc.status}</span>}
        </div>
        <p className="text-sm text-slate-300">{inc.road_name ? <>{inc.road_name} <span className="text-slate-500">({inc.road_category}) · {inc.district}, {inc.state} · {inc.snap_m} m from road</span></> : <span className="text-amber-700">Not within 2 km of a mapped road</span>}</p>
        {inc.description && <p className="text-sm text-slate-200">“{inc.description}”</p>}
        {inc.ai_verdict?.summary && <p className="text-xs text-indigo-700 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI sees: {inc.ai_verdict.summary}</p>}
        {why && (
          <ul className="text-xs bg-slate-950 rounded-lg p-2 space-y-0.5">
            {inc.credibility_reasons.map((r, i) => (
              <li key={i} className={r.points > 0 ? 'text-green-700' : r.points < 0 ? 'text-red-700' : 'text-slate-400'}>{r.points > 0 ? '+' : ''}{r.points} {r.reason}</li>
            ))}
          </ul>
        )}
        {inc.contact && <p className="text-xs text-slate-400">Contact: {inc.contact}</p>}
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
  const [source, setSource] = useState<'all' | 'public' | 'official'>('all');
  const [aiOn, setAiOn] = useState(false);
  const [list, setList] = useState<Incident[]>([]);
  const [queued, setQueued] = useState(queuedReports().length);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    if (token) incidentsApi.list(token, filter, source === 'all' ? undefined : source).then((r) => { setList(r.incidents); setAiOn(r.ai_check); }).catch(() => {});
  }, [token, filter, source]);
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

      {tab === 'report' ? <IncidentReportForm mode="official" token={token} onSent={() => { setQueued(queuedReports().length); load(); }} /> : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['reported', 'verified', 'rejected'] as IncidentStatus[]).map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer ${filter === s ? 'bg-gov-navy text-white' : 'bg-white border border-slate-700 text-slate-300'}`}>{s === 'reported' ? 'Awaiting review' : s}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">From:</span>
            {(['all', 'public', 'official'] as const).map((s) => (
              <button key={s} onClick={() => setSource(s)} className={`px-2.5 py-1 rounded-lg capitalize cursor-pointer ${source === s ? 'bg-slate-700 text-white' : 'bg-white border border-slate-700 text-slate-300'}`}>{s}</button>
            ))}
            <span className="ml-auto text-slate-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI photo check: {aiOn ? 'on' : 'off (rule checks only)'}</span>
          </div>
          {!list.length && <p className="text-sm text-slate-400">No {filter === 'reported' ? 'reports awaiting review' : `${filter} reports`}.</p>}
          {list.map((inc) => <ReviewCard key={inc.id} inc={inc} token={token!} onDone={load} />)}
        </div>
      )}
    </div>
  );
};
