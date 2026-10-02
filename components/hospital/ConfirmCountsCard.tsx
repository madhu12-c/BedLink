'use client';

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { FreshnessIndicator } from '@/components/dispatch/FreshnessIndicator';

interface ConfirmCountsCardProps {
  /** Oldest update time across this hospital's bed types, or null if there are none. */
  oldestUpdatedAt: string | null;
  onConfirm: () => void;
}

/**
 * "All counts still correct": when nothing changed on the ward, one tap tells dispatch the
 * numbers are current, so the hospital is not ranked lower for old data.
 */
export function ConfirmCountsCard({ oldestUpdatedAt, onConfirm }: ConfirmCountsCardProps) {
  const [justConfirmed, setJustConfirmed] = useState(false);

  const handleConfirm = () => {
    onConfirm();
    setJustConfirmed(true);
    window.setTimeout(() => setJustConfirmed(false), 2500);
  };

  return (
    <section
      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      aria-label="Confirm bed counts"
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold text-slate-800">Nothing changed on the ward?</span>
        <span className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
          Oldest count:
          {oldestUpdatedAt ? <FreshnessIndicator updatedAt={oldestUpdatedAt} /> : <span>none yet</span>}
        </span>
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!oldestUpdatedAt || justConfirmed}
        className={`w-full sm:w-auto px-5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 min-h-[56px] shadow-md transition-colors disabled:cursor-default ${
          justConfirmed
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60'
        }`}
      >
        <CheckCircle2 className="w-5 h-5" />
        {justConfirmed ? 'Confirmed just now' : 'All counts still correct'}
      </button>
    </section>
  );
}
