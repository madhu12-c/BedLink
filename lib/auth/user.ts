import { UserRole } from '../types';
import { parseRole } from './roles';

/** The signed-in BedLink user, as the app sees them. */
export interface AppUser {
  id: string;
  email: string | null;
  name: string;
  /** null when the account exists but has not been given a BedLink role. */
  role: UserRole | null;
  /** Set for nurses and coordinators: the only hospital they can see and change. */
  hospitalId: string | null;
}

/** Demo mode (Supabase not configured): no login, everyone acts as admin, as before. */
export const DEMO_USER: AppUser = { id: 'demo', email: null, name: 'Demo mode', role: 'admin', hospitalId: null };

interface ClaimsLike {
  sub?: unknown;
  email?: unknown;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * Builds the user from verified Supabase JWT claims. Role and hospital come from
 * app_metadata, which only the service role (the setup script) can write, so a user
 * cannot change their own role from the browser.
 */
export function userFromClaims(claims: ClaimsLike | null | undefined): AppUser | null {
  if (!claims || typeof claims.sub !== 'string') return null;
  const app = claims.app_metadata ?? {};
  const meta = claims.user_metadata ?? {};
  const email = typeof claims.email === 'string' ? claims.email : null;
  const hospitalId = typeof app.hospital_id === 'string' && app.hospital_id ? app.hospital_id : null;
  const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : email ?? 'BedLink user';
  return { id: claims.sub, email, name, role: parseRole(app.role), hospitalId };
}
