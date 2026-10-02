'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Minus, Plus, Siren, X } from 'lucide-react';
import { BedType, Reservation } from '@/lib/types';
import { bedLinkStore } from '@/lib/data/store';
import { HospitalCandidate, RoadRoute } from '@/lib/dispatch/ranking';
import { CASUALTY_BED_ORDER, CasualtyPlan, CasualtyPlanRow, planMassCasualty } from '@/lib/dispatch/massCasualty';
import { BED_LABELS } from '@/lib/telegram/parse';

export interface CasualtyHoldResult {
  patientNo: number;
  requestId: string | null;
  error?: string;
}

interface MassCasualtyPanelProps {
  candidates: HospitalCandidate[];
  location: { latitude: number; longitude: number; address: string };
  roads?: Record<string, RoadRoute>;
  /** Holds one bed per placed patient; returns the request id used for each */
  onHoldAll: (rows: CasualtyPlanRow[]) => CasualtyHoldResult[];
  onClose: () => void;
}

const LIMITS = [2, 3, 4, 5];

/** Latest hold for a patient (the fallback may have moved them to another hospital). */
function latestHold(requestId: string): Reservation | null {
  const holds = bedLinkStore.getReservations().filter((r) => r.request_id === requestId);
  return holds.sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0] ?? null;
}

function statusChip(hold: Reservation | null) {
  if (!hold) return { text: 'Sending…', className: 'bg-slate-100 text-slate-700' };
  switch (hold.status) {
    case 'pending':
      return { text: 'Waiting for hospital', className: 'bg-blue-100 text-blue-800' };
    case 'accepted':
    case 'arrived':
    case 'completed':
      return { text: 'Bed confirmed', className: 'bg-emerald-100 text-emerald-800' };
    case 'rejected':
    case 'expired':
      return { text: 'Moving to next hospital', className: 'bg-amber-100 text-amber-800' };
    default:
      return { text: hold.status, className: 'bg-slate-100 text-slate-700' };
  }
}

/**
 * Many patients from one place: count them by bed type, see how they will be spread across
 * hospitals (no emergency room gets more than the limit), then hold every bed in one tap.
 * Each hold follows the normal rules: 2 minutes to accept, automatic move to the next hospital.
 */
export function MassCasualtyPanel({ candidates, location, roads, onHoldAll, onClose }: MassCasualtyPanelProps) {
  const [patients, setPatients] = useState<Partial<Record<BedType, number>>>({ icu: 2, oxygen: 3, emergency: 4 });
  const [limit, setLimit] = useState(3);
  // Once the holds are sent, the plan is frozen (the free beds it used are now taken)
  const [sent, setSent] = useState<{ plan: CasualtyPlan; results: CasualtyHoldResult[] } | null>(null);

  const livePlan = useMemo(
    () => planMassCasualty(candidates, location, patients, limit, roads),
    [candidates, location, patients, limit, roads]
  );
  const plan = sent?.plan ?? livePlan;
  const total = plan.rows.length;
  const toHold = plan.rows.filter((r) => r.hospital).length;

  const change = (type: BedType, delta: number) =>
    setPatients((prev) => ({ ...prev, [type]: Math.max(0, Math.min(20, (prev[type] ?? 0) + delta)) }));

  const holdAll = () => setSent({ plan: livePlan, results: onHoldAll(livePlan.rows) });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Mass casualty">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-red-700 text-white px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Siren className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold leading-tight">Mass casualty</h2>
              <p className="text-xs opacity-90 truncate">Many patients from one place · {location.address}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/15">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          {!sent && (
            <>
              {/* How many patients need which bed */}
              <section>
                <h3 className="text-sm font-bold text-slate-800 mb-2">How many patients need each bed?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CASUALTY_BED_ORDER.map((type) => (
                    <div key={type} className="flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50">
                      <span className="text-sm font-semibold text-slate-800">{BED_LABELS[type]}</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => change(type, -1)} disabled={!patients[type]} aria-label={`One less ${BED_LABELS[type]} patient`} className="w-11 h-11 rounded-xl bg-white border border-slate-300 flex items-center justify-center disabled:opacity-30">
                          <Minus className="w-5 h-5" />
                        </button>
                        <span className="w-8 text-center text-lg font-extrabold text-slate-900">{patients[type] ?? 0}</span>
                        <button type="button" onClick={() => change(type, 1)} aria-label={`One more ${BED_LABELS[type]} patient`} className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center">
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Spread limit */}
              <section>
                <h3 className="text-sm font-bold text-slate-800 mb-2">At most this many patients per hospital</h3>
                <div className="inline-flex rounded-xl border border-slate-300 overflow-hidden" role="group" aria-label="Patients per hospital">
                  {LIMITS.map((n) => (
                    <button key={n} type="button" aria-pressed={limit === n} onClick={() => setLimit(n)} className={`w-14 min-h-[44px] text-base font-extrabold ${limit === n ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">So no single emergency room is flooded.</p>
              </section>
            </>
          )}

          {/* The plan (or, after holding, live status per patient) */}
          <section>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              {sent ? 'Live status' : 'Plan'}: {total} patient{total === 1 ? '' : 's'} → {plan.hospitalsUsed} hospital{plan.hospitalsUsed === 1 ? '' : 's'}
            </h3>
            {plan.unplaced > 0 && (
              <p className="mb-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {plan.unplaced} patient{plan.unplaced === 1 ? ' has' : 's have'} no bed anywhere: take them to the nearest emergency room to stabilise.
              </p>
            )}
            {plan.overLimit > 0 && (
              <p className="mb-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                {plan.overLimit} patient{plan.overLimit === 1 ? ' goes' : 's go'} over the limit: no other hospital has that bed free.
              </p>
            )}
            {total === 0 ? (
              <p className="text-sm text-slate-500">Add patients above.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {plan.rows.map((row) => {
                  const result = sent?.results.find((r) => r.patientNo === row.patientNo) ?? null;
                  const hold = result?.requestId ? latestHold(result.requestId) : null;
                  const hospitalName = hold
                    ? hold.hospital_name || bedLinkStore.getHospital(hold.hospital_id)?.name
                    : row.hospital?.hospital.name;
                  const chip = result ? (result.error ? { text: result.error, className: 'bg-red-100 text-red-800' } : row.hospital ? statusChip(hold) : null) : null;
                  return (
                    <li key={row.patientNo} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 text-sm">
                      <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0">{row.patientNo}</span>
                      <span className="w-24 shrink-0 font-semibold text-slate-800">{BED_LABELS[row.bedType]}</span>
                      <span className="flex-1 min-w-0">
                        {row.hospital ? (
                          <>
                            <span className="block font-semibold text-slate-900 truncate">{hospitalName}</span>
                            <span className="block text-xs text-slate-500">
                              {row.hospital.etaMinutes} min drive{row.overLimit ? ' · over the limit' : ''}
                            </span>
                          </>
                        ) : (
                          <span className="text-red-700 font-semibold">No bed free: stabilise at nearest ER</span>
                        )}
                      </span>
                      {chip && <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${chip.className}`}>{chip.text}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Action */}
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          {sent ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <p className="text-sm text-slate-700">
                Holds sent. Each hospital has 2 minutes; anyone rejected or timed out moves to the next hospital on their own.
              </p>
              <button type="button" onClick={onClose} className="min-h-[48px] px-5 rounded-xl bg-slate-900 text-white font-bold">
                Done
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={holdAll}
              disabled={toHold === 0}
              className="w-full min-h-[56px] rounded-xl bg-red-700 hover:bg-red-800 text-white text-base font-extrabold disabled:opacity-40"
            >
              Hold all {toHold} bed{toHold === 1 ? '' : 's'} now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
