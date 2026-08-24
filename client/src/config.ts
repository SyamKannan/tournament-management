/**
 * Build-time configuration.
 *
 * Vite inlines `import.meta.env` at build time, so these are decided when the
 * bundle is produced — not at runtime.
 */

/**
 * Whether to surface the seeded demo accounts and their passwords in the UI.
 *
 * Off unless `VITE_SHOW_DEMO_ACCOUNTS=true` is set, so a production build never
 * prints working credentials on the sign-in page or the public landing page.
 * Turn it on for demo and review deployments.
 */
export const SHOW_DEMO_ACCOUNTS = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

/**
 * Base URL for the real-time gateway.
 *
 * Defaults to the page's own host on the gateway port, which is what the local
 * `npm run dev` setup serves. In production point `VITE_WS_URL` at the public
 * `wss://` endpoint that terminates TLS in front of the gateway.
 */
export function websocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:4000/ws`;
}
