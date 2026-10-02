import { UserRole } from '../types';

/**
 * Who may open what. Shared by the proxy (server-side redirects), the API routes,
 * the header navigation and the login page, so the rules live in one place.
 */

export const USER_ROLES: readonly UserRole[] = ['dispatcher', 'nurse', 'coordinator', 'admin'];

export const ROLE_LABELS: Record<UserRole, string> = {
  dispatcher: 'Dispatcher',
  nurse: 'Ward Nurse',
  coordinator: 'Hospital Coordinator',
  admin: 'Admin'
};

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<UserRole, string> = {
  dispatcher: '/',
  nurse: '/hospital',
  coordinator: '/hospital',
  admin: '/'
};

/** Roles whose data is limited to the one hospital in their profile. */
export const HOSPITAL_STAFF_ROLES: readonly UserRole[] = ['nurse', 'coordinator'];

interface AccessRule {
  path: string;
  /** true: only this exact path; false: the path and everything under it. */
  exact: boolean;
  roles: readonly UserRole[];
}

// Most specific rules first. A path with no rule is open to every signed-in role.
const ACCESS_RULES: readonly AccessRule[] = [
  { path: '/api/reservations/hold', exact: false, roles: ['dispatcher', 'admin'] },
  { path: '/api/reservations/respond', exact: false, roles: ['coordinator', 'admin'] },
  { path: '/api/beds', exact: false, roles: ['nurse', 'coordinator', 'admin'] },
  { path: '/api/voice/intake', exact: false, roles: ['dispatcher', 'admin'] },
  { path: '/api/voice/confirm', exact: false, roles: ['dispatcher', 'admin'] },
  { path: '/api/telegram/notify', exact: false, roles: ['dispatcher', 'admin'] },
  { path: '/api/telegram/link', exact: false, roles: ['nurse', 'coordinator', 'admin'] },
  { path: '/hospital', exact: false, roles: ['nurse', 'coordinator', 'admin'] },
  { path: '/history', exact: false, roles: ['admin'] },
  { path: '/', exact: true, roles: ['dispatcher', 'admin'] }
];

function matches(rule: AccessRule, pathname: string): boolean {
  if (rule.exact) return pathname === rule.path;
  return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
}

export function canAccess(role: UserRole, pathname: string): boolean {
  const rule = ACCESS_RULES.find((r) => matches(r, pathname));
  return rule ? rule.roles.includes(role) : true;
}

export function parseRole(value: unknown): UserRole | null {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)
    ? (value as UserRole)
    : null;
}

/**
 * Where to go after signing in: the requested page if it is a local path this role
 * may open, otherwise the role's home. Blocks open redirects like "//evil.com".
 */
export function landingPathFor(role: UserRole, requested: string | null | undefined): string {
  if (requested && requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/login')) {
    const pathname = requested.split(/[?#]/)[0];
    if (canAccess(role, pathname)) return requested;
  }
  return ROLE_HOME[role];
}
