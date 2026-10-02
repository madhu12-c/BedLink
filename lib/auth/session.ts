import 'server-only';
import { createServerSupabaseClient } from '../supabase/server';
import { getSupabaseEnv } from '../supabase/env';
import { UserRole } from '../types';
import { AppUser, DEMO_USER, userFromClaims } from './user';
import { HOSPITAL_STAFF_ROLES } from './roles';

/** The signed-in user for this request (verified JWT claims), or null. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return userFromClaims(data.claims);
}

/**
 * For route handlers. The proxy already blocks these routes, but each handler checks
 * again so a matcher change can never silently open them up.
 */
export async function requireApiUser(
  roles: readonly UserRole[]
): Promise<{ user: AppUser; response?: never } | { user?: never; response: Response }> {
  if (!getSupabaseEnv()) return { user: DEMO_USER };
  const user = await getCurrentUser();
  if (!user) {
    return { response: Response.json({ success: false, error: 'Sign in required.' }, { status: 401 }) };
  }
  if (!user.role || !roles.includes(user.role)) {
    return { response: Response.json({ success: false, error: 'Your role is not allowed to do this.' }, { status: 403 }) };
  }
  return { user };
}

/** 403 when a nurse or coordinator acts on a hospital other than their own; null if allowed. */
export function staffHospitalDenied(user: AppUser, hospitalId: string): Response | null {
  if (!user.role || !HOSPITAL_STAFF_ROLES.includes(user.role)) return null;
  if (user.hospitalId && user.hospitalId === hospitalId) return null;
  return Response.json({ success: false, error: 'You can only change your own hospital.' }, { status: 403 });
}
