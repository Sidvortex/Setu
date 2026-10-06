/**
 * Road-incident report form: GPS + photo + type/severity + description.
 * Works offline: reports are queued on the device and sent when back online.
 * Used on the public "Report a Problem" page and on the officials' Field Incidents page.
 */
import React, { useEffect, useState } from 'react';
import { Camera, LocateFixed, Send, Loader2, MapPin } from 'lucide-react';
import { ROAD_BLOCK_REASONS, RoadBlockReason } from '../services/logistics';
import { incidentsApi, enqueue, compressPhoto, IncidentDraft, Severity } from '../services/incidents';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** mode 'official': sent with the officer's login. mode 'public': no login; optional contact; always reviewed. */
export const IncidentReportForm: React.FC<{ mode: 'official' | 'public'; token?: string | null; onSent?: () => void }> = ({ mode, token = null, onSent = () => {} }) => {
  const isPublic = mode === 'public';
  const [contact, setContact] = useState('');
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
    const draft: IncidentDraft = { client_id: newId(), lat: pos.lat, lon: pos.lon, incident_type: type, severity,
      description: desc || undefined, photo_base64: photo || undefined, captured_at: new Date().toISOString(),
      ...(isPublic ? { public: true, contact: contact || undefined } : {}) };
    setBusy(true); setMsg(null);
    try {
      const r = isPublic ? await incidentsApi.submitPublic(draft) : await incidentsApi.submit(token!, draft);
      const where = r.road_name ? `linked to ${r.road_name} (${r.district}), ${r.snap_m} m away` : 'not within 2 km of a mapped road';
      setMsg({ tone: 'ok', text: isPublic ? `Thank you — report #${r.id} received (${where}). Officials will review it.` : `Report #${r.id} sent — ${where}.` });
      setDesc(''); setPhoto(null); onSent();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 429) setMsg({ tone: 'err', text: (e as Error).message });
      else if (!status || status >= 500) {
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
      {isPublic && (
        <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} placeholder="Your name / phone (optional — only if you're happy to be contacted)" className={field} />
      )}
      <button id="btn-submit-incident" disabled={!pos || busy} onClick={submit} className="w-full py-2.5 rounded-lg bg-gov-navy hover:bg-gov-navy-light text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send report
      </button>
      {isPublic && <p className="text-xs text-slate-500">Reports are checked by officials before any road is marked closed. Please report only what you see yourself; false reports slow down real help.</p>}
      {msg && <p className={`text-sm rounded-lg p-2.5 ${msg.tone === 'ok' ? 'bg-green-50 text-green-700' : msg.tone === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
    </div>
  );
};
