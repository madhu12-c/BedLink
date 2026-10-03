'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2 } from 'lucide-react';
import { FreshnessIndicator } from '@/components/dispatch/FreshnessIndicator';
import { playEmergencyAlertSound, triggerEmergencyNotification } from '@/lib/utils/audioAlert';

interface ConfirmCountsCardProps {
  /** Oldest update time across this hospital's bed types, or null if there are none. */
  oldestUpdatedAt: string | null;
  onConfirm: () => void;
}

/** Counts older than this get a reminder: stale data is what made bed apps untrustworthy. */
const REMIND_AFTER_MS = 30 * 60 * 1000;

/**
 * "All counts still correct": when nothing changed on the ward, one tap tells dispatch the
 * numbers are current, so the hospital is not ranked lower for old data. After 30 minutes
 * without any update the card turns amber and alerts once.
 */
export function ConfirmCountsCard({ oldestUpdatedAt, onConfirm }: ConfirmCountsCardProps) {
  const [justConfirmed, setJustConfirmed] = useState(false);
  // null until mounted, so the server and the browser render the same first page
  const [now, setNow] = useState<number | null>(null);
  const remindedFor = useRef<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  const overdue = now !== null && oldestUpdatedAt !== null && now - Date.parse(oldestUpdatedAt) > REMIND_AFTER_MS;

  // Alert once per stale period (a new confirm or update resets it)
  useEffect(() => {
    if (!overdue || !oldestUpdatedAt || remindedFor.current === oldestUpdatedAt) return;
    remindedFor.current = oldestUpdatedAt;
    playEmergencyAlertSound();
    triggerEmergencyNotification('Please confirm your bed counts', {
      body: 'No update for over 30 minutes. Tap "All counts still correct" if nothing changed.'
    });
  }, [overdue, oldestUpdatedAt]);

  const handleConfirm = () => {
    onConfirm();
    setJustConfirmed(true);
    window.setTimeout(() => setJustConfirmed(false), 2500);
  };

  return (
    <section
      className={`p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${overdue ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'
        }`}
      aria-label="Confirm bed counts"
    >
      <div className="flex flex-col gap-1">
        {overdue ? (
          <span className="text-sm font-extrabold text-amber-900 flex items-center gap-1.5" role="alert">
            <BellRing className="w-4 h-4" />
            Please confirm your counts: no update for over 30 min
          </span>
        ) : (
          <span className="text-sm font-bold text-slate-800">Nothing changed on the ward?</span>
        )}
        <span className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
          Oldest count:
          {oldestUpdatedAt ? <FreshnessIndicator updatedAt={oldestUpdatedAt} /> : <span>none yet</span>}
        </span>
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!oldestUpdatedAt || justConfirmed}
        className={`w-full sm:w-auto px-5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 min-h-[56px] shadow-md transition-colors disabled:cursor-default ${justConfirmed
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
