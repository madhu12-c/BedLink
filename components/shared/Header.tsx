'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Ambulance,
  Building2,
  History,
  WifiOff,
  Clock,
  PhoneCall,
  LogOut,
  ShieldCheck,
  Sun
} from 'lucide-react';
import { initSupabaseSync, subscribeSupabaseStatus } from '@/lib/supabase/sync';
import { useAuth } from '@/components/auth/AuthProvider';
import { canAccess, ROLE_LABELS } from '@/lib/auth/roles';
import { bedLinkStore } from '@/lib/data/store';
import { applySunlight, useSunlight } from '@/lib/utils/sunlight';
import { serverDate, startServerClock } from '@/lib/utils/serverClock';

interface HeaderProps {
  hideBottomNav?: boolean;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function Header({ hideBottomNav = false }: HeaderProps) {
  const pathname = usePathname();
  const { user, role, lockedHospitalId, demoMode, signOut, signingOut } = useAuth();
  const userHospitalName = lockedHospitalId ? bedLinkStore.getHospital(lockedHospitalId)?.name ?? null : null;
  const [sunlight, setSunlight] = useSunlight();
  // Re-apply the remembered choice after a page load
  useEffect(() => applySunlight(sunlight), [sunlight]);

  // Supabase Realtime State
  const [supabaseState, setSupabaseState] = useState({
    configured: false,
    connected: false,
    lastSyncTime: null as string | null
  });

  // Client-only Live Emergency Clock (Hydration safe)
  const [currentTime, setCurrentTime] = useState<string | null>(null);

  useEffect(() => {
    // Demo ages count from now (after hydration, so server and browser render the same page)
    bedLinkStore.startDemoClock();
    // Times and countdowns follow the server's clock, even on a phone set to the wrong time
    startServerClock();
    initSupabaseSync();
    const unsub = subscribeSupabaseStatus((status) => {
      setSupabaseState(status);
    });

    const updateClock = () => {
      const d = serverDate();
      setCurrentTime(
        d.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      );
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    return () => {
      unsub();
      clearInterval(clockInterval);
    };
  }, []);

  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );

  // Only the screens this role may open (the proxy enforces the same rules on the server).
  const navLinks = [
    { href: '/', label: 'Dispatch', icon: Ambulance, badge: 'LIVE' },
    { href: '/hospital', label: 'Hospital', icon: Building2 },
    { href: '/history', label: 'Audit Trail', icon: History }
  ].filter((link) => role !== null && canAccess(role, link.href));

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 text-slate-900">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div
          className="bg-amber-500 text-white text-xs py-1.5 px-4 text-center font-semibold flex items-center justify-center gap-2"
          role="alert"
        >
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline — live bed sync temporarily paused.</span>
        </div>
      )}

      {/* Main Navbar */}
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">

          {/* Left: Brand & Nav */}
          <div className="flex items-center gap-5 lg:gap-8">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
              {/* Icon: hospital bed silhouette */}
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-700 transition-colors">
                <svg viewBox="0 0 24 24" fill="white" className="w-[18px] h-[18px]" aria-hidden="true">
                  {/* Headboard — tall left post */}
                  <rect x="2.5" y="4.5" width="3" height="13" rx="1.5"/>
                  {/* Mattress body */}
                  <rect x="5.5" y="8" width="15.5" height="8" rx="2.5"/>
                  {/* Pillow — carved out via opacity */}
                  <rect x="7" y="9.5" width="5" height="3.5" rx="1.25" fillOpacity="0.35"/>
                  {/* Bed base rail */}
                  <rect x="2.5" y="17.5" width="18.5" height="2" rx="1"/>
                </svg>
              </div>
              {/* Wordmark */}
              <div className="flex flex-col leading-none">
                <span className="font-semibold text-[15px] tracking-tight text-slate-900">
                  BedLink
                </span>
                <span className="hidden sm:block text-[11px] text-slate-400 font-normal mt-0.5">
                  Emergency Bed Coordination
                </span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-0.5 pl-4 border-l border-slate-200">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-slate-900 font-medium'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-slate-700' : 'text-slate-400'}`} />
                    <span>{link.label}</span>
                    {link.badge && isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Status & User */}
          <div className="flex items-center gap-2">

            {/* Clock */}
            <div className="hidden xl:flex items-center gap-1.5 text-slate-500 text-xs font-mono" title="Current time">
              <Clock className="w-3.5 h-3.5" />
              <span suppressHydrationWarning>{currentTime ?? '--:--:--'}</span>
              <span className="text-slate-400">IST</span>
            </div>

            {/* Supabase status dot */}
            <div
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border ${
                supabaseState.connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : supabaseState.configured
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
              title={
                supabaseState.connected
                  ? 'Live sync active'
                  : supabaseState.configured
                    ? 'Connecting…'
                    : 'Demo mode'
              }
            >
              <span className="relative flex w-2 h-2 shrink-0">
                {supabaseState.connected && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                )}
                <span
                  className={`relative inline-flex w-2 h-2 rounded-full ${
                    supabaseState.connected
                      ? 'bg-emerald-500'
                      : supabaseState.configured
                        ? 'bg-amber-400'
                        : 'bg-slate-300'
                  }`}
                />
              </span>
              <span className="font-medium hidden sm:inline">
                {supabaseState.connected ? 'Live' : supabaseState.configured ? 'Connecting' : 'Demo'}
              </span>
            </div>

            {/* Sunlight mode */}
            <button
              type="button"
              onClick={() => setSunlight(!sunlight)}
              aria-pressed={sunlight}
              title={sunlight ? 'Sunlight mode on' : 'Sunlight mode'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
                sunlight
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Sunlight</span>
            </button>

            {/* User / Demo badge */}
            {demoMode ? (
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="hidden sm:inline">Demo</span>
              </div>
            ) : user ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-2 bg-white border border-slate-200 rounded-md pl-2.5 pr-3 py-1"
                  title={`${user.email ?? ''}${userHospitalName ? ` · ${userHospitalName}` : ''}`}
                >
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    {(user.name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-xs font-medium text-slate-800 truncate max-w-[90px] sm:max-w-[140px]">
                      {user.name}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[90px] sm:max-w-[180px]">
                      {role ? ROLE_LABELS[role] : 'No role'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="flex items-center gap-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500 hover:text-slate-700 rounded-md px-2.5 py-1 text-xs font-medium min-h-[32px] transition-colors disabled:opacity-50"
                  aria-label="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
                </button>
              </div>
            ) : null}

            {/* 108 Hotline pill */}
            <div className="hidden 2xl:flex items-center gap-1.5 border border-red-200 bg-red-50 px-2.5 py-1 rounded-md text-red-600 text-xs font-medium">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>108</span>
            </div>

          </div>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      {!hideBottomNav && navLinks.length > 1 && (
        <div
          className="md:hidden border-t border-slate-100 bg-white grid"
          style={{ gridTemplateColumns: `repeat(${navLinks.length}, minmax(0, 1fr))` }}
        >
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center py-2 px-1 text-xs font-medium min-h-[52px] transition-colors ${
                  isActive
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] mb-0.5 ${isActive ? 'text-blue-600' : ''}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
