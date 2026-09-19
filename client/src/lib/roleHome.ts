import type { UserRole } from '../types';

const HOMES: Partial<Record<UserRole, string>> = {
  SUPER_ADMIN: '/admin/dashboard',
  ORG_ADMIN: '/organization/dashboard',
  PLAYER: '/player/dashboard',
  TEAM_MANAGER: '/team/dashboard',
};

/** Where a signed-in user of this role lands: after login, impersonation, or opening a page their role can't use. */
export const roleHome = (role: UserRole | null | undefined): string => (role && HOMES[role]) || '/';
