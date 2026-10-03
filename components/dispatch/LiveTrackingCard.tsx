'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigation2, Radio, Square } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { fleetForEmail } from '@/lib/data/ambulanceFleets';
import { SharingState, startSharing } from '@/lib/tracking/liveTracking';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compassPoint = (deg: number) => DIRS[Math.round(deg / 45) % 8];

const STATUS: Record<SharingState['gps'], { mark: string; tone: string }> = {
  ok: { mark: '✓', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  waiting: { mark: '…', tone: 'bg-slate-50 text-slate-600 border-slate-200' },
  denied: { mark: '✕', tone: 'bg-red-50 text-red-800 border-red-200' },
  unavailable: { mark: '–', tone: 'bg-slate-50 text-slate-400 border-slate-200' }
};

/**
 * The crew shares this phone's live position: GPS (where), compass (which way it faces) and
 * accelerometer (moving / stopped). Every BedLink map shows it as a live ambulance.
 */
export function LiveTrackingCard({ reservationId }: { reservationId: string | null }) {
  const { user } = useAuth();
  const [state, setState] = useState<SharingState | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const reservationRef = useRef(reservationId);
  // Sensors only work on https (or localhost)
  const secure = useSyncExternalStore(
    () => () => {},
    () => window.isSecureContext,
    () => true
  );

  useEffect(() => {
    reservationRef.current = reservationId;
  }, [reservationId]);
  useEffect(() => () => stopRef.current?.(), []);

  const toggle = () => {
    if (state?.on) {
      stopRef.current?.();
      stopRef.current = null;
      return;
    }
    const crew = fleetForEmail(user?.email);
    stopRef.current = startSharing(
      {
        id: user?.id ?? 'demo-crew',
        name: user?.name ?? 'Ambulance',
        fleet: crew?.fleet.name ?? null,
        vehicle: crew?.vehicle ?? null
      },
      () => reservationRef.current,
      setState
    );
  };

  const last = state?.last;
  const heading = last?.heading ?? null;

  return (
    <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Radio className={`w-4 h-4 ${state?.on ? 'text-red-600 animate-pulse' : 'text-slate-400'}`} />
          Live location
        </span>
        {state?.on && (
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-extrabold text-white ${last?.moving ? 'bg-emerald-600' : 'bg-slate-500'}`}
          >
            {last?.moving ? '● MOVING' : '■ STOPPED'}
          </span>
        )}
      </div>

      {!secure && (
        <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Phone sensors need the https link (Vercel), not an http address.
        </p>
      )}

      {state?.on && (
        <div className="flex items-center gap-3">
          {/* Compass: the arrow points where the phone faces */}
          <div className="relative w-20 h-20 shrink-0 rounded-full border-2 border-slate-300 bg-slate-50" aria-label={heading !== null ? `Facing ${heading} degrees` : 'No compass yet'}>
            <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[10px] font-black text-red-600">N</span>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">E</span>
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-400">S</span>
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">W</span>
            <Navigation2
              className="absolute inset-0 m-auto w-9 h-9 text-red-700 fill-red-600 transition-transform duration-300"
              style={{ transform: `rotate(${heading ?? 0}deg)` }}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-lg font-black font-mono text-slate-900 leading-none">
              {heading !== null ? `${heading}° ${compassPoint(heading)}` : '—'}
            </span>
            <span className="text-xs text-slate-500 font-mono truncate">
              {last?.lat != null && last.lng != null
                ? `${last.lat.toFixed(5)}, ${last.lng.toFixed(5)} · ±${last.accuracy ?? '?'} m`
                : 'Finding GPS…'}
            </span>
            <span className="flex flex-wrap gap-1 text-[11px] font-bold">
              {(['gps', 'compass', 'motion'] as const).map((k) => (
                <span key={k} className={`px-1.5 py-0.5 rounded border ${STATUS[state[k]].tone}`}>
                  {k === 'gps' ? 'GPS' : k === 'compass' ? 'Compass' : 'Motion'} {STATUS[state[k]].mark}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}
      {state?.error && <p className="text-xs font-semibold text-red-700">{state.error}</p>}

      <button
        type="button"
        onClick={toggle}
        className={`min-h-[44px] rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 ${
          state?.on ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
        }`}
      >
        {state?.on ? <Square className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
        {state?.on ? 'Stop sharing' : 'Share live location'}
      </button>
    </div>
  );
}
