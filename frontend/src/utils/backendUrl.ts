/**
 * Single source of truth for the backend URL. Persisted to localStorage
 * so it survives a page refresh (previously it only lived in a runtime
 * window global and was lost on reload). Read this with getBackendUrl()
 * at the point of use, not into a frozen top-level constant — the value
 * can change at runtime (e.g. from Settings, or the Login page).
 */
const STORAGE_KEY = 'samparkne_backend_url';

export function getBackendUrl(): string {
  if (typeof window === 'undefined') return '';
  const w = window as unknown as { ENV_BACKEND_URL?: string };
  if (w.ENV_BACKEND_URL) return w.ENV_BACKEND_URL;
  const stored = localStorage.getItem(STORAGE_KEY) || '';
  w.ENV_BACKEND_URL = stored;
  return stored;
}

export function setBackendUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = url.trim().replace(/\/+$/, ''); // drop trailing slash
  (window as unknown as { ENV_BACKEND_URL?: string }).ENV_BACKEND_URL = trimmed;
  localStorage.setItem(STORAGE_KEY, trimmed);
}
