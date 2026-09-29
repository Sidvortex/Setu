/**
 * Single source of truth for the backend URL. Persisted to localStorage
 * so it survives a page refresh (previously it only lived in a runtime
 * window global and was lost on reload). Read this with getBackendUrl()
 * at the point of use, not into a frozen top-level constant — the value
 * can change at runtime (e.g. from Settings, or the Login page).
 */
const STORAGE_KEY = 'setu_backend_url';

/**
 * Where the API lives, in priority order:
 *  1. an address someone saved on the Officials Login page (override, e.g. for testing)
 *  2. VITE_BACKEND_URL, baked in at build time (set it in Vercel's environment variables)
 *  3. in local development only: http://localhost:8100
 * Public visitors and drivers never open the login page, so (2) is what makes
 * the public site, "Report a Problem" and driver tracking links work.
 */
export function getBackendUrl(): string {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return saved;
  const built = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (built) return built;
  return import.meta.env.DEV ? 'http://localhost:8100' : '';
}

export function setBackendUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = url.trim().replace(/\/+$/, ''); // drop trailing slash
  if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
  else localStorage.removeItem(STORAGE_KEY); // empty = go back to the built-in address
}
