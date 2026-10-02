'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Ambulance,
  Building2,
  History,
  WifiOff,
  Radio,
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
    initSupabaseSync();
    const unsub = subscribeSupabaseStatus((status) => {
      setSupabaseState(status);
    });

    const updateClock = () => {
      const d = new Date();
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
    { href: '/', label: 'Dispatch CAD', icon: Ambulance, badge: 'LIVE' },
    { href: '/hospital', label: role === 'nurse' ? 'Nurse Portal' : 'Hospital Desk', icon: Building2 },
    { href: '/history', label: 'Audit Trail', icon: History }
  ].filter((link) => role !== null && canAccess(role, link.href));

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200 text-slate-900 shadow-sm transition-all">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div
          className="bg-amber-500 text-white text-xs py-1.5 px-4 text-center font-bold flex items-center justify-center gap-2"
          role="alert"
        >
          <WifiOff className="w-4 h-4" />
          <span>OFFLINE MODE: Live bed reservations and sync temporarily queued.</span>
        </div>
      )}

      {/* Main Navbar Bar */}
      <div className="max-w-[1700px] mx-auto px-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Left: Brand & Main Navigation */}
          <div className="flex items-center gap-4 lg:gap-7">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-all">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pulse" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-base sm:text-lg tracking-tight text-slate-900">
                    Bed<span className="text-blue-600">Link</span>
                  </span>
                  <span className="hidden sm:inline-flex text-[9px] font-black tracking-widest uppercase bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                    108 CAD
                  </span>
                </div>
                <span className="hidden sm:block text-[10px] text-slate-500 font-medium tracking-wide">
                  Mumbai Emergency Bed Coordination
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 pl-2 border-l border-slate-200">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span>{link.label}</span>
                    {link.badge && isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping ml-0.5" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Live Telemetry, Signed-in User & Emergency Clock */}
          <div className="flex items-center gap-2 sm:gap-2.5 sm:gap-3.5">
            
            {/* Live Operational Clock (Desktop only) */}
            <div className="hidden xl:flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-slate-700 text-xs font-mono font-bold" title="Operational Telemetry Time">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span suppressHydrationWarning>{currentTime ?? '--:--:--'}</span>
              <span className="text-[10px] text-slate-400 font-sans font-semibold">IST</span>
            </div>

            {/* Supabase Status — compact dot on mobile, full badge on sm+ */}
            <div
              className={`flex items-center gap-1.5 text-xs px-2 py-1.5 sm:px-2.5 rounded-lg border transition-all ${
                supabaseState.connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : supabaseState.configured
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
              title={
                supabaseState.connected
                  ? `Supabase Realtime Active`
                  : supabaseState.configured
                  ? 'Connecting...'
                  : 'Demo Mode'
              }
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  supabaseState.connected
                    ? 'bg-emerald-500 animate-ping'
                    : supabaseState.configured
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-slate-400'
                }`}
              />
              <Radio
                className={`w-3.5 h-3.5 hidden sm:inline ${
                  supabaseState.connected
                    ? 'text-emerald-600'
                    : supabaseState.configured
                    ? 'text-amber-500'
                    : 'text-slate-400'
                }`}
              />
              <span className="font-mono text-[10px] font-bold tracking-tight hidden sm:inline">
                {supabaseState.connected
                  ? 'LIVE'
                  : supabaseState.configured
                  ? 'SYNC'
                  : 'DEMO'}
              </span>
            </div>

            {/* Sunlight mode: high contrast for outdoor use */}
            <button
              type="button"
              onClick={() => setSunlight(!sunlight)}
              aria-pressed={sunlight}
              title={sunlight ? 'Sunlight mode on (high contrast)' : 'Sunlight mode: high contrast for outdoor use'}
              className={`flex items-center gap-1.5 rounded-lg px-2 min-h-[36px] text-xs font-bold border transition-colors ${
                sunlight ? 'bg-amber-400 text-slate-950 border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span className="hidden lg:inline">Sunlight</span>
            </button>

            {/* Signed-in user + sign out */}
            {demoMode ? (
              <div
                className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-amber-800"
                title="Supabase is not configured, so there is no login and every screen is open."
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Demo mode · no login</span>
                <span className="sm:hidden">Demo</span>
              </div>
            ) : user ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg pl-2 pr-2.5 py-1 shadow-sm"
                  title={`${user.email ?? ''}${userHospitalName ? ` · ${userHospitalName}` : ''}`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-xs font-bold text-slate-800 truncate max-w-[90px] sm:max-w-[160px]">
                      {user.name}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 truncate max-w-[90px] sm:max-w-[200px]">
                      {role ? ROLE_LABELS[role] : 'No role'}
                      {userHospitalName && <span className="hidden lg:inline"> · {userHospitalName}</span>}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="flex items-center gap-1.5 border border-slate-200 hover:border-red-300 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-lg px-2 py-1.5 text-xs font-bold min-h-[36px] transition-colors disabled:opacity-60"
                  aria-label="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
                </button>
              </div>
            ) : null}

            {/* 108 Hotline — desktop only */}
            <div className="hidden 2xl:flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg text-red-600 text-xs font-bold">
              <PhoneCall className="w-3.5 h-3.5 text-red-500 animate-bounce" />
              <span>108 HOTLINE</span>
            </div>

          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (WCAG AA compliant, 48px touch targets) */}
      {!hideBottomNav && navLinks.length > 1 && (
        <div
          className="md:hidden border-t border-slate-200 bg-white/98 backdrop-blur-lg grid py-1 px-2"
          style={{ gridTemplateColumns: `repeat(${navLinks.length}, minmax(0, 1fr))` }}
        >
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[10px] font-semibold min-h-[48px] transition-colors ${
                  isActive
                    ? 'text-blue-600 font-bold bg-blue-50'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="truncate max-w-[70px]">{link.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
