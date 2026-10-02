'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ChevronDown, Loader2, LogIn, Users } from 'lucide-react';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { landingPathFor, parseRole, ROLE_LABELS, USER_ROLES } from '@/lib/auth/roles';
import demoUsers from '@/lib/auth/demo-users.json';

interface LoginFormProps {
  /** Page the user asked for before being sent to login. */
  next: string | null;
  initialError: string | null;
  demoMode: boolean;
}

export function LoginForm({ next, initialError, demoMode }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password.');
      return;
    }
    const supabase = getBrowserSupabaseClient();
    if (!supabase) {
      setError('Sign-in is not available: Supabase is not configured.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password
      });
      if (signInError || !data.user) {
        setError(
          signInError?.message === 'Invalid login credentials'
            ? 'Wrong email or password.'
            : signInError?.message ?? 'Sign-in failed. Try again.'
        );
        return;
      }

      const role = parseRole(data.user.app_metadata?.role);
      if (!role) {
        await supabase.auth.signOut();
        setError('This account has no BedLink role yet. Ask the admin to set it up.');
        return;
      }
      // Full page load so the server sees the new session and shows the right screens.
      window.location.assign(landingPathFor(role, next));
    } catch {
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md flex flex-col gap-4">
      <div className="flex items-center gap-3 justify-center">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <span className="font-black text-xl tracking-tight text-slate-900">
            Bed<span className="text-blue-600">Link</span>
          </span>
          <span className="block text-[11px] text-slate-500 font-medium">Mumbai Emergency Bed Coordination</span>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col gap-4" aria-label="Sign in">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">Sign in</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Dispatchers, ward nurses, hospital coordinators and admins each see only their own screens.
          </p>
        </div>

        {demoMode ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex flex-col gap-2">
            <span>
              Login is off because Supabase is not configured, so BedLink is running in demo mode with every screen
              open.
            </span>
            <Link href="/" className="font-bold underline">
              Open BedLink
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="login-email" className="text-xs font-bold text-slate-700">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 min-h-[44px]"
                placeholder="you@hospital.in"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="login-password" className="text-xs font-bold text-slate-700">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 min-h-[44px]"
                required
              />
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2" role="alert">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white shadow-md disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </section>

      {!demoMode && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm" aria-label="Demo accounts">
          <button
            type="button"
            onClick={() => setShowDemoAccounts((v) => !v)}
            aria-expanded={showDemoAccounts}
            className="w-full px-5 py-3 flex items-center justify-between text-xs font-bold text-slate-700 min-h-[44px]"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Demo accounts
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showDemoAccounts ? 'rotate-180' : ''}`} />
          </button>
          {showDemoAccounts && (
            <div className="px-5 pb-4 flex flex-col gap-3">
              <p className="text-[11px] text-slate-500">
                Tap an account to fill in its email. The password is the one your team set when creating the demo
                accounts.
              </p>
              {USER_ROLES.map((role) => (
                <div key={role} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{ROLE_LABELS[role]}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {demoUsers
                      .filter((u) => u.role === role)
                      .map((u) => (
                        <button
                          key={u.email}
                          type="button"
                          onClick={() => {
                            setEmail(u.email);
                            setError(null);
                          }}
                          className="text-[11px] font-semibold px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-800 min-h-[32px]"
                          title={u.name}
                        >
                          {u.email}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
