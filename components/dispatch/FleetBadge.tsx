'use client';

import React from 'react';
import { Ambulance } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { fleetForEmail, VEHICLE_LABELS } from '@/lib/data/ambulanceFleets';

/** Which ambulance fleet the signed-in crew belongs to (108 MEMS, RED.Health, Dial 1298). */
export function FleetBadge() {
  const { user } = useAuth();
  const crew = fleetForEmail(user?.email);
  if (!crew) return null;
  const { fleet, vehicle } = crew;
  return (
    <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 flex flex-col gap-1" title={fleet.connects}>
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Your fleet</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-extrabold border ${
            fleet.kind === 'government'
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
          }`}
        >
          <Ambulance className="w-3.5 h-3.5" />
          {fleet.name}
        </span>
        {vehicle && (
          <span
            className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200"
            title={VEHICLE_LABELS[vehicle]}
          >
            {vehicle}
          </span>
        )}
        <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">
          🚑 {fleet.ambulances.toLocaleString('en-IN')}
          {fleet.id === 'redhealth' ? '+' : ''}
        </span>
        <span className="text-xs text-slate-500">{fleet.kind === 'government' ? 'Govt' : 'Private'}</span>
      </span>
    </div>
  );
}
