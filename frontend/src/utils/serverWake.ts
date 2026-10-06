import { getBackendUrl } from './backendUrl';

/**
 * Wake-up call for the backend (shared by the <ServerWake> banner and the API helpers).
 *
 * The website and the API are hosted separately, and the API runs on a free plan
 * that sleeps after ~15 minutes without traffic; the first request after that waits
 * while the server boots (often 30-60 s). startWake() pings /health once per page
 * load so the boot starts immediately, and waitForServer() lets API calls queue
 * behind that ping instead of failing with "Failed to fetch" while it boots.
 *
 * Deliberately NO repeating keep-alive timer: that would keep the server awake
 * around the clock and use up the free plan's monthly hours.
 */
export type WakeState = 'idle' | 'checking' | 'waking' | 'ready' | 'unreachable';

const SHOW_NOTICE_AFTER_MS = 3_000; // quick answers never show a notice
const GIVE_UP_AFTER_MS = 90_000;
const ATTEMPT_TIMEOUT_MS = 20_000;
const RETRY_GAP_MS = 2_500;

let state: WakeState = 'idle';
let hadToWait = false;
let run: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: WakeState) {
  state = next;
  listeners.forEach(l => l());
}

export function getWakeState(): { state: WakeState; hadToWait: boolean } {
  return { state, hadToWait };
}

export function subscribeWake(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function pingOnce(base: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false; // network error, timeout, or the host's "starting up" page (no CORS headers)
  } finally {
    clearTimeout(timer);
  }
}

/** Ping the backend until it answers (or 90 s pass). Safe to call many times: one ping run at a time. */
export function startWake(): Promise<void> {
  if (run) return run;
  const base = getBackendUrl();
  if (!base) { set('ready'); return Promise.resolve(); } // no backend configured: nothing to wake
  set('checking');
  const started = Date.now();
  const slow = setTimeout(() => {
    if (state === 'checking') { hadToWait = true; set('waking'); }
  }, SHOW_NOTICE_AFTER_MS);
  run = (async () => {
    while (Date.now() - started < GIVE_UP_AFTER_MS) {
      if (await pingOnce(base)) { clearTimeout(slow); set('ready'); return; }
      await new Promise(r => setTimeout(r, RETRY_GAP_MS));
    }
    clearTimeout(slow);
    set('unreachable');
  })().finally(() => { run = null; });
  return run;
}

/**
 * API helpers await this before their first request. Resolves as soon as the
 * server has answered once (instant afterwards), or when the wake-up gives up,
 * so callers then show their own normal error.
 */
export async function waitForServer(): Promise<void> {
  if (state === 'ready' || state === 'unreachable') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // offline: fail fast so reports get queued
  await startWake();
}
