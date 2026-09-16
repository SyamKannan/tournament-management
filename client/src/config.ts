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
 * Whether to advertise the platform super admin sign-in (landing page card and
 * the "Super Admin" login tab). Off unless `VITE_SHOW_ADMIN_LOGIN=true`.
 * Super admins can still sign in through the regular login form — the role
 * comes from the account, not the tab.
 */
export const SHOW_ADMIN_LOGIN = import.meta.env.VITE_SHOW_ADMIN_LOGIN === 'true';

/**
 * Feature toggle for a capability that exists in the codebase but isn't ready
 * to show organizers/players yet. Flip to `true` once it's ready to launch.
 *
 * Which sports (football, cricket, ...) are visible is no longer a build-time
 * flag — the super admin controls that at runtime from Admin > Sports, and
 * clients read it via `usePlatformConfig()` / `GET /sports`.
 */
export const FEATURE_AUCTION_ENABLED = false;

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
