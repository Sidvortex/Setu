/**
 * Driver tracking page, opened from the private link the control room sends
 * (no account, no app). Shares the phone's GPS while the driver keeps it open:
 * at most every 30 s (sooner after 200 m of movement) to save battery and
 * data; without signal, the latest position is kept and sent on reconnect.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Truck, Navigation, PauseCircle, AlertTriangle, WifiOff, PhoneCall } from 'lucide-react';
import { BrandMark } from '../components/gov/BrandMark';
import { shipmentsApi, Shipment } from '../services/shipments';

const MIN_INTERVAL_MS = 30000;
const MIN_MOVE_M = 200;
const dist = (a: GeolocationCoordinates, b: GeolocationCoordinates) =>
  6371000 * Math.hypot((b.latitude - a.latitude) * Math.PI / 180, (b.longitude - a.longitude) * Math.PI / 180 * Math.cos(a.latitude * Math.PI / 180));

export const Track: React.FC = () => {
  const { token = '' } = useParams();
  const [s, setS] = useState<Partial<Shipment> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [pending, setPending] = useState(false);
  const watch = useRef<number | null>(null);
  const last = useRef<{ coords: GeolocationCoordinates; at: number } | null>(null);
  const latest = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => { shipmentsApi.track(token).then(setS).catch((e) => setErr(e.message)); }, [token]);

  const send = async (c: GeolocationCoordinates) => {
    try {
      const r = await shipmentsApi.ping(token, c.latitude, c.longitude, c.speed != null ? c.speed * 3.6 : undefined);
      setS(r); setLastSent(new Date()); setPending(false); setErr(null);
      last.current = { coords: c, at: Date.now() };
    } catch (e) {
      const msg = (e as Error).message;
      if (/delivered|cancelled/.test(msg)) { stop(); setErr(msg); } else setPending(true); // keep latest, retry on reconnect
    }
  };

  const start = () => {
    if (!navigator.geolocation) return setErr('This phone has no location support.');
    setSharing(true);
    watch.current = navigator.geolocation.watchPosition((p) => {
      latest.current = p.coords;
      const l = last.current;
      if (!l || Date.now() - l.at > MIN_INTERVAL_MS || dist(l.coords, p.coords) > MIN_MOVE_M) send(p.coords);
    }, (e) => setErr(e.message || 'Location unavailable. Allow location access for this page.'), { enableHighAccuracy: true, maximumAge: 10000 });
  };
  const stop = () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; setSharing(false); };

  useEffect(() => {
    const retry = () => { if (latest.current) send(latest.current); };
    window.addEventListener('online', retry);
    return () => { window.removeEventListener('online', retry); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cutOff = s?.alerts?.some((a) => a.type === 'cut_off');
  return (
    <div className="flex-1 bg-gov-page flex flex-col">
      <header className="bg-gov-navy text-white px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded bg-white flex items-center justify-center"><BrandMark size={28} /></div>
        <div><div className="font-semibold">Setu · Driver tracking</div><div className="text-xs text-white/70">Keep this page open while driving</div></div>
      </header>
      <main id="main-content" className="max-w-md w-full mx-auto p-4 space-y-3">
        {err && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{err}</p>}
        {s && (
          <>
            <div className="bg-white border border-slate-800 rounded-xl p-4 space-y-1">
              <p className="text-xs text-slate-400 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> {s.vehicle_reg} · {s.priority} priority</p>
              <p className="font-semibold text-slate-100 text-lg">{s.quantity} {s.unit} {s.commodity}</p>
              <p className="text-sm text-slate-300">{s.origin_name} → <span className="font-semibold">{s.dest_name}</span></p>
              {s.remaining && <p className="text-sm text-slate-300">{s.remaining.km} km to go · ETA {s.eta ? new Date(s.eta).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>}
              <p className="text-xs text-slate-500">Status: {s.status?.replace('_', ' ')}</p>
            </div>
            {cutOff && (
              <div className="bg-red-50 border border-red-800 rounded-xl p-4 text-sm text-red-700">
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Road ahead is blocked</p>
                <p className="mt-1">There is currently no open route to the destination. Stop somewhere safe and call your control room.</p>
                <a href="tel:1077" className="mt-2 inline-flex items-center gap-1 font-semibold"><PhoneCall className="w-4 h-4" /> District control room: 1077</a>
              </div>
            )}
            {s.alerts?.filter((a) => a.type === 'rerouted').map((a, i) => <p key={i} className="text-sm text-orange-700 bg-orange-50 rounded-lg p-3">{a.text}. Follow the control room's route.</p>)}
            {s.status !== 'delivered' && s.status !== 'cancelled' && (!sharing ? (
              <button id="btn-share-location" onClick={start} className="w-full py-4 rounded-xl bg-gov-saffron text-gov-navy-dark font-bold text-lg flex items-center justify-center gap-2 cursor-pointer"><Navigation className="w-5 h-5" /> Start sharing location</button>
            ) : (
              <button onClick={stop} className="w-full py-3 rounded-xl border-2 border-slate-700 text-slate-300 font-semibold flex items-center justify-center gap-2 cursor-pointer"><PauseCircle className="w-5 h-5" /> Pause sharing</button>
            ))}
            {sharing && <p className="text-sm text-green-700 text-center">Sharing location{lastSent ? ` · last sent ${lastSent.toLocaleTimeString('en-IN')}` : '…'}</p>}
            {pending && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 flex items-center gap-2"><WifiOff className="w-4 h-4" /> No signal — your latest position will be sent when you're back online.</p>}
          </>
        )}
      </main>
    </div>
  );
};
