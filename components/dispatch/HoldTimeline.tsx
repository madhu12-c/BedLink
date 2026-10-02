'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Reservation, ReservationStatus } from '@/lib/types';
import { bedLinkStore } from '@/lib/data/store';

interface HoldTimelineProps {
  /** Every hold made for this patient, any order. */
  reservations: Reservation[];
}

const STATUS_TEXT: Partial<Record<ReservationStatus, { label: string; tone: string }>> = {
  pending: { label: 'waiting…', tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  accepted: { label: 'accepted ✓', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  completed: { label: 'arrived ✓', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  arrived: { label: 'arrived ✓', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rejected: { label: 'rejected', tone: 'bg-red-50 text-red-800 border-red-200' },
  expired: { label: 'no reply (2 min)', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  cancelled: { label: 'cancelled', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
  bed_lost: { label: 'bed lost on arrival', tone: 'bg-red-50 text-red-800 border-red-200' },
  released: { label: 'released (no arrival)', tone: 'bg-slate-100 text-slate-600 border-slate-200' }
};

/**
 * "Aditi: rejected → DNA: no reply → Apex: accepted ✓": every hospital tried for this patient,
 * in order, so the crew (and judges) can see the automatic fallback happen.
 */
export function HoldTimeline({ reservations }: HoldTimelineProps) {
  const steps = [...reservations]
    .filter((r) => STATUS_TEXT[r.status])
    .sort((a, b) => Date.parse(a.requested_at) - Date.parse(b.requested_at));
  if (steps.length === 0) return null;

  return (
    <nav aria-label="Hospitals tried for this patient" className="bg-white border-b border-slate-200 px-4 py-2 overflow-x-auto">
      <ol className="flex items-center gap-1.5 text-xs whitespace-nowrap max-w-[1700px] mx-auto">
        <li className="font-bold text-slate-500 uppercase tracking-wider text-xs mr-1">Tried</li>
        {steps.map((r, i) => {
          const status = STATUS_TEXT[r.status]!;
          const name = r.hospital_name || bedLinkStore.getHospital(r.hospital_id)?.name || 'Hospital';
          return (
            <li key={r.id} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />}
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-semibold ${status.tone}`}>
                <span className="max-w-[160px] truncate">{name}</span>
                <span className="opacity-80">· {r.rejection_reason && r.status === 'cancelled' ? 'bed taken' : status.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
