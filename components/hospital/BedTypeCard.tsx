'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Minus, Plus, Check, AlertCircle } from 'lucide-react';
import { BedInventory, BedType } from '@/lib/types';
import { FreshnessIndicator } from '../dispatch/FreshnessIndicator';

interface BedTypeCardProps {
  inventory: BedInventory;
  onUpdateCount: (bedType: BedType, delta: number) => Promise<void>;
  onUpdateTotalBeds?: (bedType: BedType, delta: number) => Promise<void>;
  disabled?: boolean;
}

const BED_METADATA: Record<BedType, { label: string; subtext: string; icon: string; image: string }> = {
  icu: { label: 'ICU Beds', subtext: 'Intensive Critical Care Units', icon: '🏥', image: '/icu_bed.jpg' },
  ventilator: { label: 'Ventilators', subtext: 'Invasive / Non-Invasive Mechanical', icon: '🫁', image: '/ventilator_bed.jpg' },
  oxygen: { label: 'Oxygen Beds', subtext: 'High-Flow Wall & Tank O₂', icon: '💨', image: '/oxygen_bed.jpg' },
  emergency: { label: 'Emergency Resus', subtext: 'Trauma & Resuscitation Bays', icon: '⚡', image: '/emergency_resus_bed.jpg' },
  general: { label: 'General Ward', subtext: 'Standard Inpatient Admission', icon: '🛏️', image: '/general_ward_bed.jpg' }
};

export function BedTypeCard({
  inventory,
  onUpdateCount,
  onUpdateTotalBeds,
  disabled = false
}: BedTypeCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set of occupied bed numbers (1..total_beds).
  // Beds NOT in this set are available.
  const [occupiedBeds, setOccupiedBeds] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    const occupiedCount = Math.max(0, inventory.total_beds - inventory.available_beds);
    // Occupy beds from total down to 1
    for (let i = 0; i < occupiedCount; i++) {
      const bedNum = inventory.total_beds - i;
      if (bedNum >= 1) initial.add(bedNum);
    }
    return initial;
  });

  // Reconcile occupiedBeds state when external inventory changes
  useEffect(() => {
    setOccupiedBeds((prev) => {
      const targetOccupiedCount = Math.max(0, inventory.total_beds - inventory.available_beds);
      const validPrev = Array.from(prev).filter((n) => n >= 1 && n <= inventory.total_beds);

      if (validPrev.length === targetOccupiedCount) {
        return new Set(validPrev);
      }

      const nextSet = new Set(validPrev);
      if (nextSet.size < targetOccupiedCount) {
        // Need more occupied beds (start from highest)
        for (let b = inventory.total_beds; b >= 1; b--) {
          if (!nextSet.has(b)) {
            nextSet.add(b);
            if (nextSet.size === targetOccupiedCount) break;
          }
        }
      } else if (nextSet.size > targetOccupiedCount) {
        // Need to free some occupied beds (start from lowest occupied bed)
        for (const b of Array.from(nextSet).sort((a, b) => a - b)) {
          nextSet.delete(b);
          if (nextSet.size === targetOccupiedCount) break;
        }
      }
      return nextSet;
    });
  }, [inventory.available_beds, inventory.total_beds, inventory.id]);

  const meta = BED_METADATA[inventory.bed_type] || {
    label: inventory.bed_type.toUpperCase(),
    subtext: 'Resource',
    icon: '🛏️',
    image: '/general_ward_bed.jpg'
  };

  // Current available count derived from occupied state
  const currentAvailable = Math.max(0, inventory.total_beds - occupiedBeds.size);

  /**
   * Toggle a specific bed between Occupied and Available
   */
  const handleToggleBed = async (bedNum: number) => {
    if (disabled || isUpdating) return;

    const isCurrentlyOccupied = occupiedBeds.has(bedNum);
    // If occupied, clicking makes it available (delta: +1)
    // If available, clicking makes it occupied (delta: -1)
    const delta = isCurrentlyOccupied ? 1 : -1;

    // Optimistic local state update
    setOccupiedBeds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyOccupied) {
        next.delete(bedNum);
      } else {
        next.add(bedNum);
      }
      return next;
    });

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      await onUpdateCount(inventory.bed_type, delta);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err: unknown) {
      // Revert optimistic update on error
      setOccupiedBeds((prev) => {
        const revert = new Set(prev);
        if (isCurrentlyOccupied) {
          revert.add(bedNum);
        } else {
          revert.delete(bedNum);
        }
        return revert;
      });
      const msg = err instanceof Error ? err.message : 'Update failed';
      setErrorMessage(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  /**
   * Total seats adjustment handler (+ / - total beds)
   * The big +/- buttons directly add or remove seats from this ward
   */
  const handleTotalDelta = async (delta: number) => {
    if (disabled || isUpdating || !onUpdateTotalBeds) return;
    if (delta < 0 && inventory.total_beds <= 1) return;

    if (delta < 0) {
      // Optimistically remove the last bed from occupiedBeds if it was marked occupied
      setOccupiedBeds((prev) => {
        const next = new Set(prev);
        next.delete(inventory.total_beds);
        return next;
      });
    }

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      await onUpdateTotalBeds(inventory.bed_type, delta);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update seats';
      setErrorMessage(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className={`bg-white rounded-xl border p-4 sm:p-5 flex flex-col justify-between h-full transition-all duration-200 shadow-xs hover:shadow-md ${justSaved
          ? 'border-emerald-400 ring-2 ring-emerald-400/20'
          : errorMessage
            ? 'border-rose-400 ring-2 ring-rose-400/20'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      role="region"
      aria-label={`${meta.label} inventory: ${currentAvailable} available of ${inventory.total_beds}`}
    >
      {/* 1. Header (Fixed alignment across cards) */}
      <div className="flex items-start justify-between gap-2 mb-3 min-h-[48px] shrink-0">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg" aria-hidden="true">
              {meta.icon}
            </span>
            <h3 className="font-bold text-slate-900 text-base leading-snug">
              {meta.label}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 sm:line-clamp-none">{meta.subtext}</p>
        </div>

        {/* Freshness / Saved indicator */}
        <div className="shrink-0">
          {justSaved ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full animate-fade-in">
              <Check className="w-3 h-3 text-emerald-600" />
              Saved
            </span>
          ) : (
            <FreshnessIndicator updatedAt={inventory.updated_at} />
          )}
        </div>
      </div>

      {/* 2. Middle Body: Illustration + Scrollable Numbered Bed Grid + Legend */}
      <div className="flex-1 my-2 flex flex-col justify-between">
        <div className="flex items-start gap-3">
          {/* Illustration with fixed, responsive aspect ratio */}
          <div className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-xl overflow-hidden bg-slate-50 border border-slate-200/80 p-1 flex items-center justify-center">
            <Image
              src={meta.image}
              alt={`${meta.label} illustration`}
              fill
              className="object-contain p-1"
              sizes="(max-width: 640px) 96px, (max-width: 768px) 112px, 128px"
              priority={false}
            />
          </div>

          {/* Numbered bed status area with scrollable grid */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Bed Status
              </span>
              <span className="text-[10px] sm:text-[11px] font-mono text-slate-700 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                {currentAvailable}/{inventory.total_beds} avail
              </span>
            </div>

            {/* Scrollable Bed Numbers Container (Clickable Buttons to Toggle Occupancy) */}
            <div
              tabIndex={0}
              role="region"
              aria-label={`${meta.label} numbered beds: ${currentAvailable} of ${inventory.total_beds} available`}
              className="bed-scroll-container h-24 sm:h-28 overflow-y-auto pr-1 rounded-lg border border-slate-200/80 bg-slate-50/70 p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {inventory.total_beds === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                  No beds configured
                </div>
              ) : (
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(26px, 1fr))' }}
                >
                  {Array.from({ length: inventory.total_beds }, (_, i) => {
                    const bedNum = i + 1;
                    const isOccupied = occupiedBeds.has(bedNum);
                    const isAvailable = !isOccupied;

                    return (
                      <button
                        key={bedNum}
                        type="button"
                        onClick={() => handleToggleBed(bedNum)}
                        disabled={disabled || isUpdating}
                        title={`Bed ${bedNum}: ${isAvailable ? 'Available (Click to Mark Occupied)' : 'Occupied (Click to Mark Available)'}`}
                        aria-label={`Bed ${bedNum}: ${isAvailable ? 'Available' : 'Occupied'}. Click to toggle.`}
                        className={`flex items-center justify-center rounded-md text-[11px] font-mono font-bold h-6 min-w-[26px] select-none transition-all duration-150 cursor-pointer transform active:scale-90 hover:scale-105 shadow-2xs ${isAvailable
                            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 hover:ring-1 hover:ring-emerald-400'
                            : 'bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 hover:ring-1 hover:ring-rose-400'
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {bedNum}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Instruction & overflow indicator */}
            <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between font-medium">

              {inventory.total_beds > 12 && (
                <span className="shrink-0 ml-1">↕ Scroll ({inventory.total_beds})</span>
              )}
            </div>
          </div>
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-100">
          <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-600 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 border border-emerald-400 inline-block shrink-0" />
            Available
          </span>
          <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-600 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-200 border border-rose-400 inline-block shrink-0" />
            Occupied
          </span>
        </div>
      </div>

      {/* 3. Footer: Main Count & Large Touch Stepper Controls (Now Directly Add/Remove Seats) */}
      <div className="flex-none mt-auto pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-slate-900"
                aria-live="polite"
              >
                {currentAvailable}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-400 font-mono">
                / {inventory.total_beds}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Available Seats of <strong className="text-slate-700">{inventory.total_beds}</strong> total
            </span>
          </div>

          {/* Stepper Buttons (Directly Add / Remove Seats to this ward) */}
          <div className="flex items-center gap-2">
            {/* Decrement Seat Button */}
            <button
              type="button"
              disabled={disabled || isUpdating || inventory.total_beds <= 1 || !onUpdateTotalBeds}
              onClick={() => handleTotalDelta(-1)}
              aria-label={`Remove a seat from ${meta.label}`}
              title="Remove 1 seat from this ward (-1 total)"
              className="w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-xs border border-slate-200 cursor-pointer"
            >
              <Minus className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* Increment Seat Button */}
            <button
              type="button"
              disabled={disabled || isUpdating || !onUpdateTotalBeds}
              onClick={() => handleTotalDelta(1)}
              aria-label={`Add a seat to ${meta.label}`}
              title="Add 1 seat to this ward (+1 total)"
              className="w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-xs hover:shadow-sm cursor-pointer"
            >
              <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Error state if server sync failed */}
        {errorMessage && (
          <div className="mt-2 text-xs text-rose-700 flex items-center gap-1.5 bg-rose-50 p-2 rounded-lg border border-rose-200 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
