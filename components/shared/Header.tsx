'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Ambulance,
  Building2,
  History,
  BarChart3,
  WifiOff,
  Radio
} from 'lucide-react';
import { UserRole } from '@/lib/types';

interface HeaderProps {
  currentRole: UserRole;
  selectedHospitalId?: string;
  onRoleChange: (role: UserRole, hospitalId?: string) => void;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function Header({
  currentRole,
  selectedHospitalId,
  onRoleChange
}: HeaderProps) {
  const pathname = usePathname();

  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );

  const navLinks = [
    { href: '/', label: 'Dispatch Control', icon: Ambulance },
    { href: '/hospital', label: 'Nurse Bed Portal', icon: Building2 },
    { href: '/dashboard', label: 'EMS Metrics', icon: BarChart3 },
    { href: '/history', label: 'Audit Trail', icon: History }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Offline Alert Banner (STEP 24: PWA / Offline requirement) */}
      {!isOnline && (
        <div
          className="bg-amber-600 text-white text-xs py-1.5 px-4 text-center font-semibold flex items-center justify-center gap-2"
          role="alert"
        >
          <WifiOff className="w-4 h-4" />
          <span>You are currently offline. Bed updates and reservations cannot be submitted.</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md group-hover:bg-blue-700 transition-colors">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-extrabold text-lg tracking-tight text-slate-900 flex items-center gap-1.5">
                  BedLink
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                    REALTIME
                  </span>
                </span>
                <span className="text-[10px] text-slate-500 block -mt-1 font-medium">
                  Emergency Bed Coordination
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-blue-700 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Controls: Role Switcher & Realtime status */}
          <div className="flex items-center gap-3">
            {/* Realtime Live Pulse */}
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200"
              title="Supabase & Realtime Broadcast Active"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <Radio className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-mono text-[11px] font-semibold text-slate-700">REALTIME SYNC</span>
            </div>

            {/* Role Switcher Dropdown (Allows instant switching between Dispatcher and Hospital Nurses for demo) */}
            <div className="flex items-center gap-2">
              <label htmlFor="role-select" className="text-xs font-semibold text-slate-500 hidden lg:inline">
                Active Persona:
              </label>
              <select
                id="role-select"
                aria-label="Active Persona Selector"
                value={
                  currentRole === 'dispatcher'
                    ? 'dispatcher'
                    : currentRole === 'admin'
                    ? 'admin'
                    : selectedHospitalId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
                    ? 'nurse-metro'
                    : 'nurse-citycare'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'dispatcher') {
                    onRoleChange('dispatcher');
                  } else if (val === 'admin') {
                    onRoleChange('admin');
                  } else if (val === 'nurse-metro') {
                    onRoleChange('nurse', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
                  } else {
                    onRoleChange('nurse', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
                  }
                }}
                className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer min-h-[44px]"
              >
                <option value="dispatcher">🚑 Paramedic / Dispatcher</option>
                <option value="nurse-citycare">🏥 Nurse (CityCare Hospital)</option>
                <option value="nurse-metro">🏥 Nurse (Metro General Hospital)</option>
                <option value="admin">🛡️ Regional EMS Admin</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (WCAG AA & Touch Targets >= 44x44px) */}
      <div className="md:hidden border-t border-slate-200 bg-white grid grid-cols-4 py-1 px-2">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded text-[10px] font-semibold min-h-[44px] ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="truncate max-w-[70px]">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
