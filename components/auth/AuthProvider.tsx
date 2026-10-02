'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { AppUser, DEMO_USER } from '@/lib/auth/user';
import { HOSPITAL_STAFF_ROLES } from '@/lib/auth/roles';
import { UserRole } from '@/lib/types';

interface AuthContextValue {
  /** The signed-in user; in demo mode a stand-in admin. */
  user: AppUser | null;
  role: UserRole | null;
  /** Hospital this user is limited to (nurses and coordinators), else null. */
  lockedHospitalId: string | null;
  /** True when Supabase is not configured and there is no login. */
  demoMode: boolean;
  signingOut: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  demoMode,
  children
}: {
  user: AppUser | null;
  demoMode: boolean;
  children: React.ReactNode;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const effectiveUser = demoMode ? DEMO_USER : user;

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await getBrowserSupabaseClient()?.auth.signOut();
    } finally {
      // Full reload: clears in-memory demo data and re-runs the login checks.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a client-side push would keep the old user's data in memory
      window.location.assign('/login');
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = effectiveUser?.role ?? null;
    const isStaff = role !== null && HOSPITAL_STAFF_ROLES.includes(role);
    return {
      user: effectiveUser,
      role,
      lockedHospitalId: isStaff ? effectiveUser?.hospitalId ?? null : null,
      demoMode,
      signingOut,
      signOut
    };
  }, [effectiveUser, demoMode, signingOut, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
