'use client';

import React, { useState } from 'react';
import { Check, Minus, Plus, Timer } from 'lucide-react';
import { BedInventory, BedType } from '@/lib/types';
import { FreshnessIndicator } from '../dispatch/FreshnessIndicator';

interface QuickBedUpdateProps {
  bedInventory: BedInventory[];
  onUpdateCount: (bedType: BedType, delta: number) => Promise<void>;
  disabled?: boolean;
}

const ORDER: BedType[] = ['icu', 'ventilator', 'oxygen', 'cardiac', 'burns', 'emergency', 'general'];
const LABELS: Record<BedType, string> = {
  icu: 'ICU',
  ventilator: 'Ventilator',
  oxygen: 'Oxygen',
  cardiac: 'Cardiac (CCU)',
  burns: 'Burns',
  emergency: 'Emergency',
  general: 'General ward'
};

/** Milliseconds clock for timing a save (only ever called from a tap, never while rendering). */
const clock = () => performance.now();

/**
 * The nurse's 10-second screen: every bed type on one phone screen, one tap each.
 * Shows how long each save took, so "10 seconds" is something you can see.
 */
export function QuickBedUpdate({ bedInventory, onUpdateCount, disabled = false }: QuickBedUpdateProps) {
  const [busy, setBusy] = useState<BedType | null>(null);
  const [saved, setSaved] = useState<{ type: BedType; ms: number } | null>(null);
  const rows = [...bedInventory].sort((a, b) => ORDER.indexOf(a.bed_type) - ORDER.indexOf(b.bed_type));

  const tap = async (type: BedType, delta: number) => {
    if (busy) return;
    setBusy(type);
    const started = clock();
    try {
      await onUpdateCount(type, delta);
      const ms = Math.round(clock() - started);
      setSaved({ type, ms });
      window.setTimeout(() => setSaved((s) => (s?.type === type ? null : s)), 2500);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" aria-label="Quick bed update">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Free beds right now</h2>
          <p className="text-xs text-slate-500">One tap per bed type. Ambulances see it straight away.</p>
        </div>
        <Timer className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
      </div>

      <ul className="divide-y divide-slate-100">
        {rows.map((inv) => {
          const isSaved = saved?.type === inv.bed_type;
          return (
            <li key={inv.id} className={`px-4 py-2.5 flex items-center gap-3 transition-colors ${isSaved ? 'bg-emerald-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-900 truncate">{LABELS[inv.bed_type] ?? inv.bed_type}</span>
                {isSaved ? (
                  <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Saved in {(saved.ms / 1000).toFixed(1)} s
                  </span>
                ) : (
                  <FreshnessIndicator updatedAt={inv.updated_at} compact />
                )}
              </div>

              <div className="text-right shrink-0 w-16">
                <span className={`block text-2xl font-extrabold leading-none ${inv.available_beds > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {inv.available_beds}
                </span>
                <span className="text-xs text-slate-500">of {inv.total_beds} free</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={disabled || busy !== null || inv.available_beds <= 0}
                  onClick={() => void tap(inv.bed_type, -1)}
                  aria-label={`One less free ${LABELS[inv.bed_type]} bed`}
                  className="w-14 h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 border border-slate-300 flex items-center justify-center disabled:opacity-30"
                >
                  <Minus className="w-7 h-7" />
                </button>
                <button
                  type="button"
                  disabled={disabled || busy !== null || inv.available_beds >= inv.total_beds}
                  onClick={() => void tap(inv.bed_type, 1)}
                  aria-label={`One more free ${LABELS[inv.bed_type]} bed`}
                  className="w-14 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white flex items-center justify-center disabled:opacity-30"
                >
                  <Plus className="w-7 h-7" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
