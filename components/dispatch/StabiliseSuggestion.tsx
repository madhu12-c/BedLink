'use client';

import React from 'react';
import { ShieldAlert, Siren } from 'lucide-react';
import { ScoredHospital } from '@/lib/types';

interface StabiliseSuggestionProps {
  /** Every ranked hospital (exact and partial). */
  hospitals: ScoredHospital[];
  onHoldEmergencyBed: (hospitalId: string) => void;
  isLoading?: boolean;
}

/**
 * Shown when no hospital has everything the patient needs: the nearest hospital with a free
 * emergency bed, so the crew can stabilise the patient there instead of driving around.
 */
export function StabiliseSuggestion({ hospitals, onHoldEmergencyBed, isLoading = false }: StabiliseSuggestionProps) {
  const nearest = hospitals
    .filter((h) => h.hospital.ed_status !== 'diversion' && (h.inventory.emergency?.available_beds ?? 0) > 0)
    .sort((a, b) => a.etaMinutes - b.etaMinutes)[0];

  return (
    <div className="p-4 bg-white rounded-xl border-2 border-dashed border-amber-300 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-900 font-bold block text-sm">No hospital has everything needed</strong>
          <span className="text-xs text-slate-600">
            {nearest
              ? 'Go to the nearest emergency bed to stabilise the patient, or pick a partial match below.'
              : 'No free emergency bed nearby either. Check the partial matches below.'}
          </span>
        </div>
      </div>

      {nearest && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wider text-amber-800">Nearest to stabilise</span>
            <span className="block text-sm font-extrabold text-slate-900 truncate">{nearest.hospital.name}</span>
            <span className="block text-xs text-slate-600">
              {nearest.etaMinutes} min drive · {nearest.inventory.emergency?.available_beds} emergency beds free
            </span>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onHoldEmergencyBed(nearest.hospital.id)}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold disabled:opacity-60"
          >
            <Siren className="w-4 h-4" />
            Hold emergency bed
          </button>
        </div>
      )}
    </div>
  );
}
