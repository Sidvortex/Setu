import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { getWakeState, startWake, subscribeWake } from '../utils/serverWake';
import { useLanguage } from '../context/LanguageContext';

/**
 * Small notice at the bottom of every page while the free-plan backend boots.
 * Shows nothing when the server answers within 3 s. See utils/serverWake.ts.
 */
const CONNECTED_NOTICE_MS = 4_000;

// Fixed colours (not theme classes): the gov theme remaps several Tailwind scales.
const TONES = {
  waking: { background: '#fff8e1', borderColor: '#f0b429', color: '#5c3d00' },
  ready: { background: '#e8f5e9', borderColor: '#43a047', color: '#1b4d1e' },
  unreachable: { background: '#fdecea', borderColor: '#e53935', color: '#7a1712' },
} as const;

let snapshot = getWakeState();
const subscribe = (cb: () => void) => subscribeWake(() => { snapshot = getWakeState(); cb(); });
const read = () => snapshot;

export const ServerWake: React.FC = () => {
  const { t } = useLanguage();
  const { state, hadToWait } = useSyncExternalStore(subscribe, read, read);
  const [showConnected, setShowConnected] = useState(false);

  useEffect(() => { void startWake(); }, []);

  // After a slow wake, say "Connected." briefly, then get out of the way.
  useEffect(() => {
    if (state === 'ready' && hadToWait) {
      setShowConnected(true);
      const id = window.setTimeout(() => setShowConnected(false), CONNECTED_NOTICE_MS);
      return () => window.clearTimeout(id);
    }
  }, [state, hadToWait]);

  const tone = state === 'waking' ? 'waking' : state === 'unreachable' ? 'unreachable' : state === 'ready' && showConnected ? 'ready' : null;
  if (!tone) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={TONES[tone]}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[3000] w-[calc(100%-2rem)] max-w-xl rounded-md border-2 shadow-lg px-4 py-3 text-sm font-medium flex items-center gap-3"
    >
      {tone === 'waking' && (
        <span aria-hidden="true" className="inline-block h-4 w-4 shrink-0 rounded-full border-2 animate-spin"
              style={{ borderColor: '#b7791f', borderTopColor: 'transparent' }} />
      )}
      <span className="flex-1">
        {tone === 'waking' && t('wake.waking')}
        {tone === 'ready' && t('wake.ready')}
        {tone === 'unreachable' && t('wake.down')}
      </span>
      {tone === 'unreachable' && (
        <button
          type="button"
          onClick={() => { void startWake(); }}
          className="shrink-0 rounded border-2 px-3 py-1 font-semibold focus:outline-none focus:ring-2"
          style={{ background: '#ffffff', borderColor: '#e53935', color: '#7a1712' }}
        >
          {t('wake.retry')}
        </button>
      )}
    </div>
  );
};
