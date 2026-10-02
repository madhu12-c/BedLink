import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { canAccess, ROLE_HOME } from '@/lib/auth/roles';
import { AppUser, userFromClaims } from '@/lib/auth/user';

/**
 * Login and role checks for every page and API route (Next.js 16 "proxy", formerly middleware).
 * - Not signed in: pages go to /login, APIs get 401.
 * - Signed in but the role may not open this path: pages go to the role's home, APIs get 403.
 * - Also refreshes the Supabase session cookie on each request.
 * Without Supabase configured (demo mode) everything stays open, as before.
 */

const PUBLIC_PATHS = ['/login'];

async function readSession(request: NextRequest, env: { url: string; anonKey: string }) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      }
    }
  });
  // getClaims() verifies the JWT, unlike getSession(), so the role in it can be trusted.
  const { data } = await supabase.auth.getClaims();
  const user: AppUser | null = userFromClaims(data?.claims);
  return { response, user };
}

/** Redirect while keeping any refreshed session cookies. */
function redirectTo(request: NextRequest, sessionResponse: NextResponse, pathWithQuery: string) {
  const redirect = NextResponse.redirect(new URL(pathWithQuery, request.url));
  sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

function apiError(status: 401 | 403, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function proxy(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const { response, user } = await readSession(request, env);

  if (PUBLIC_PATHS.includes(pathname)) {
    // Already signed in with a role: skip the login page.
    return user?.role ? redirectTo(request, response, ROLE_HOME[user.role]) : response;
  }

  if (!user) {
    if (isApi) return apiError(401, 'Sign in required.');
    return redirectTo(request, response, `/login?next=${encodeURIComponent(pathname + search)}`);
  }

  if (!user.role) {
    if (isApi) return apiError(403, 'Your account has no BedLink role.');
    return redirectTo(request, response, '/login?error=no_role');
  }

  if (!canAccess(user.role, pathname)) {
    if (isApi) return apiError(403, 'Your role is not allowed to do this.');
    return redirectTo(request, response, ROLE_HOME[user.role]);
  }

  return response;
}

export const config = {
  // Everything except Next.js internals and static files (icons, images, manifest).
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'
  ]
};
