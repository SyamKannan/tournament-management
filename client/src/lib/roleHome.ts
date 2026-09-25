import type { UserRole } from '../types';

const HOMES: Partial<Record<UserRole, string>> = {
  SUPER_ADMIN: '/admin/dashboard',
  ORG_ADMIN: '/organization/dashboard',
  PLAYER: '/player/dashboard',
  TEAM_MANAGER: '/team/dashboard',
};

/** Where a signed-in user of this role lands: after login, impersonation, or opening a page their role can't use. */
export const roleHome = (role: UserRole | null | undefined): string => (role && HOMES[role]) || '/';

/**
 * Where to go after signing in: the page that asked for it, unless it belongs to
 * the other side of the platform — the super admin never lands in a club
 * workspace, and nobody else is sent to the admin console.
 */
export const landingAfterLogin = (role: UserRole | null | undefined, redirect: string | null): string => {
  if (!redirect) return roleHome(role);
  const isAdminPage = redirect.startsWith('/admin');
  const isWorkspace = redirect.startsWith('/organization') || redirect.startsWith('/team');
  if (role === 'SUPER_ADMIN' ? !isAdminPage && isWorkspace : isAdminPage) return roleHome(role);
  return redirect;
};
