'use client';

import React, { useState } from 'react';
import { Minus, Plus, Check, AlertCircle } from 'lucide-react';
import { BedInventory, BedType } from '@/lib/types';
import { FreshnessIndicator } from '../dispatch/FreshnessIndicator';

interface BedTypeCardProps {
  inventory: BedInventory;
  onUpdateCount: (bedType: BedType, delta: number) => Promise<void>;
  disabled?: boolean;
}

const BED_METADATA: Record<BedType, { label: string; subtext: string; icon: string }> = {
  icu: { label: 'ICU Beds', subtext: 'Intensive Critical Care Units', icon: '🏥' },
  ventilator: { label: 'Ventilators', subtext: 'Invasive / Non-Invasive Mechanical', icon: '🫁' },
  oxygen: { label: 'Oxygen Beds', subtext: 'High-Flow Wall & Tank O₂', icon: '💨' },
  emergency: { label: 'Emergency Resus', subtext: 'Trauma & Resuscitation Bays', icon: '⚡' },
  general: { label: 'General Ward', subtext: 'Standard Inpatient Admission', icon: '🛏️' }
};

export function BedTypeCard({
  inventory,
  onUpdateCount,
  disabled = false
}: BedTypeCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const meta = BED_METADATA[inventory.bed_type] || {
    label: inventory.bed_type.toUpperCase(),
    subtext: 'Resource',
    icon: '🛏️'
  };

  const handleDelta = async (delta: number) => {
    if (disabled || isUpdating) return;
    if (delta < 0 && inventory.available_beds <= 0) return;
    if (delta > 0 && inventory.available_beds >= inventory.total_beds) return;

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      await onUpdateCount(inventory.bed_type, delta);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      setErrorMessage(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className={`bg-white rounded-xl border p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 shadow-sm ${
        justSaved
          ? 'border-emerald-400 ring-2 ring-emerald-400/20'
          : errorMessage
          ? 'border-rose-400 ring-2 ring-rose-400/20'
          : 'border-slate-200 hover:border-slate-300'
      }`}
      role="region"
      aria-label={`${meta.label} inventory: ${inventory.available_beds} available of ${inventory.total_beds}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg" aria-hidden="true">
              {meta.icon}
            </span>
            <h3 className="font-bold text-slate-900 text-base leading-snug">
              {meta.label}
            </h3>
          </div>
          <p className="text-xs text-slate-500">{meta.subtext}</p>
        </div>

        {/* Freshness / Saved indicator */}
        <div>
          {justSaved ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full animate-fade-in">
              <Check className="w-3 h-3 text-emerald-600" />
              Saved just now
            </span>
          ) : (
            <FreshnessIndicator updatedAt={inventory.updated_at} />
          )}
        </div>
      </div>

      {/* Main Count & Large Touch Controls (DESIGN.md: 28-40px numbers, 44x44px touch targets) */}
      <div className="flex items-center justify-between gap-4 my-2">
        <div className="flex flex-col">
          <span
            className="text-4xl font-extrabold font-mono tracking-tight text-slate-900"
            aria-live="polite"
          >
            {inventory.available_beds}
          </span>
          <span className="text-xs text-slate-500 font-medium">
            Available of <strong className="text-slate-700">{inventory.total_beds}</strong> total
          </span>
        </div>

        {/* Big Touch Stepper Buttons */}
        <div className="flex items-center gap-2">
          {/* Decrement Button */}
          <button
            type="button"
            disabled={disabled || isUpdating || inventory.available_beds <= 0}
            onClick={() => handleDelta(-1)}
            aria-label={`Decrease ${meta.label} count`}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm border border-slate-200"
          >
            <Minus className="w-6 h-6" />
          </button>

          {/* Increment Button */}
          <button
            type="button"
            disabled={disabled || isUpdating || inventory.available_beds >= inventory.total_beds}
            onClick={() => handleDelta(1)}
            aria-label={`Increase ${meta.label} count`}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow hover:shadow-md"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Error state if server sync failed */}
      {errorMessage && (
        <div className="mt-2 text-xs text-rose-700 flex items-center gap-1 bg-rose-50 p-1.5 rounded border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
