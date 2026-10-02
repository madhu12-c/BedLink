'use client';

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  MapPin,
  ShieldAlert,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Check,
  Lock,
  Navigation,
  Phone,
  ChevronDown
} from 'lucide-react';
import { BedType, Reservation, ScoredHospital } from '@/lib/types';
import { FreshnessIndicator } from './FreshnessIndicator';
import { LoadIndicator } from './LoadIndicator';
import { ReservationTimer } from './ReservationTimer';
import { callUrl, navigateUrl } from './ActiveHoldBar';
import { DEFAULT_RANKING_WEIGHTS, likelyFreeFor } from '@/lib/dispatch/ranking';
import { bedLinkStore } from '@/lib/data/store';

interface HospitalResultCardProps {
  scoredHospital: ScoredHospital;
  rank: number;
  requiredBedType: BedType;
  requiresVentilator?: boolean;
  requiredSpecialty?: string | null;
  isSelected?: boolean;
  activeReservation?: Reservation | null;
  onHoldBed: (hospitalId: string) => void;
  onSelectHospital?: (hospital: ScoredHospital) => void;
  isLoading?: boolean;
  /** Places this card moved when road times replaced the quick estimate (+ = moved up). */
  rankChange?: number;
}

/**
 * One hospital in the dispatch list. The card shows only what the crew needs to decide
 * (drive time, free beds, chance it is still free, data age) and a big Hold button;
 * everything else sits behind "More details".
 */
export function HospitalResultCard({
  scoredHospital,
  rank,
  requiredBedType,
  requiresVentilator = false,
  requiredSpecialty,
  isSelected = false,
  activeReservation = null,
  onHoldBed,
  onSelectHospital,
  isLoading = false,
  rankChange = 0
}: HospitalResultCardProps) {
  const { hospital, inventory, capabilities, isExactMatch, missingResources, distanceKm, etaMinutes } =
    scoredHospital;

  const bedInv = inventory[requiredBedType];
  const availableBeds = bedInv?.available_beds ?? 0;
  const isPendingHere = activeReservation?.hospital_id === hospital.id && activeReservation.status === 'pending';
  const isAcceptedHere = activeReservation?.hospital_id === hospital.id && activeReservation.status === 'accepted';
  const isRejectedHere = activeReservation?.hospital_id === hospital.id && activeReservation.status === 'rejected';

  const hasSpecialty = requiredSpecialty && requiredSpecialty !== 'none'
    ? capabilities.some((c) => c.toLowerCase() === requiredSpecialty.toLowerCase())
    : true;

  const ventInv = inventory['ventilator'];
  const hasVentilator = (ventInv?.available_beds ?? 0) > 0;

  // "Why this hospital": each factor's share of the score, in points out of 100
  const w = DEFAULT_RANKING_WEIGHTS;
  const points = (score: number, weight: number) => Math.round(score * weight * 100);
  const why = [
    { label: isExactMatch ? 'Has everything needed' : 'Missing something', pts: points(scoredHospital.bedMatchScore, w.bedMatch), max: Math.round(w.bedMatch * 100) },
    { label: `${etaMinutes} min drive`, pts: points(scoredHospital.travelScore, w.travel), max: Math.round(w.travel * 100) },
    { label: 'How fresh the bed data is', pts: points(scoredHospital.freshnessScore, w.freshness), max: Math.round(w.freshness * 100) },
    { label: `Hospital ${hospital.current_load}% full${hospital.ed_status === 'busy' ? ' (says busy)' : ''}`, pts: points(scoredHospital.loadScore, w.load), max: Math.round(w.load * 100) },
    { label: `Reliability ${hospital.reliability ?? 100}/100`, pts: points(scoredHospital.reliabilityScore ?? 1, w.reliability), max: Math.round(w.reliability * 100) }
  ];
  const onDiversion = hospital.ed_status === 'diversion';
  // Chance a bed is still free on arrival: data age + drive time + how busy the hospital is
  const recentHolds = bedLinkStore.recentHoldCount(hospital.id, requiredBedType);
  const likelyFree = availableBeds > 0 ? likelyFreeFor(scoredHospital, requiredBedType, recentHolds) : 0;
  const reliability = hospital.reliability ?? 100;
  const likelyFreeColour =
    likelyFree >= 70 ? 'text-emerald-700' : likelyFree >= 40 ? 'text-amber-700' : 'text-red-700';

  return (
    <article
      onClick={() => onSelectHospital?.(scoredHospital)}
      className={`relative p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
        isAcceptedHere
          ? 'bg-emerald-50/70 border-emerald-500 shadow-md ring-2 ring-emerald-500/30'
          : isPendingHere
          ? 'bg-blue-50/70 border-blue-500 shadow-md ring-2 ring-blue-500/30'
          : isSelected
          ? 'bg-white border-blue-600 shadow-md ring-1 ring-blue-600'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
      }`}
      aria-label={`Rank ${rank}: ${hospital.name}, ${etaMinutes} minutes ETA`}
    >
      {/* Name + rank */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
              rank === 1 && isExactMatch
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {rank}
          </span>
          <h3 className="font-bold text-slate-900 text-base leading-snug">
            {hospital.name}
          </h3>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {rank === 1 && isExactMatch && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Best match
            </span>
          )}
          {/* Shown for a few seconds after the road times arrive */}
          {rankChange !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full animate-fade-in ${
                rankChange > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}
              title="Moved after checking real road times"
            >
              {rankChange > 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
              {rankChange > 0 ? `Up ${rankChange}` : `Down ${-rankChange}`}
            </span>
          )}
        </div>
      </div>

      {/* Free care for patients who can't pay */}
      {hospital.free_care && (
        <div className="mb-2">
          <span
            className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${
              hospital.free_care === 'govt'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-teal-50 text-teal-800 border-teal-200'
            }`}
            title={
              hospital.free_care === 'govt'
                ? 'Government / municipal hospital: treatment is free'
                : 'Charitable trust hospital: by Maharashtra law 10% of beds are free for poor patients (income up to Rs 1.8 lakh)'
            }
          >
            {hospital.free_care === 'govt' ? 'Govt hospital: free' : 'Charity hospital: free beds for poor'}
          </span>
        </div>
      )}

      {/* Hospital says it can't take patients */}
      {(onDiversion || hospital.ed_status === 'busy') && (
        <div className="mb-3">
          {onDiversion ? (
            <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
              On diversion: not taking ambulances
            </span>
          ) : (
            <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Hospital says: busy
            </span>
          )}
        </div>
      )}

      {/* The three numbers that decide it */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-2 text-center">
          <span className="block text-xl font-extrabold text-slate-900 leading-none">{etaMinutes}<span className="text-sm font-bold"> min</span></span>
          <span className="block text-xs text-slate-500 mt-1">Drive</span>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-2 text-center">
          <span
            className={`block text-xl font-extrabold leading-none ${availableBeds > 0 ? 'text-emerald-700' : 'text-red-700'}`}
          >
            {availableBeds}
          </span>
          <span className="block text-xs text-slate-500 mt-1">
            {requiredBedType === 'icu' ? 'ICU' : requiredBedType.charAt(0).toUpperCase() + requiredBedType.slice(1)} free
          </span>
        </div>
        <div
          className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-2 text-center"
          title="Estimate from: free beds, how old the count is, the drive time, how full the hospital is, and how many other ambulances took this bed type here in the last hour"
        >
          <span className={`block text-xl font-extrabold leading-none ${availableBeds > 0 ? likelyFreeColour : 'text-slate-400'}`} suppressHydrationWarning>
            {availableBeds > 0 ? `${likelyFree}%` : '–'}
          </span>
          <span className="block text-xs text-slate-500 mt-1">Free on arrival</span>
        </div>
      </div>

      {/* Data age: always visible, the whole point of the app */}
      <div className="mb-3 text-sm">
        <FreshnessIndicator updatedAt={scoredHospital.lastUpdated} />
      </div>

      {/* Something the patient needs is missing here */}
      {!isExactMatch && missingResources.length > 0 && (
        <div className="mb-3 px-2.5 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-1.5">
          <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Missing: </strong>
            {missingResources.join(', ')}
          </span>
        </div>
      )}

      {/* Action: Hold / waiting / confirmed */}
      <div className="mb-2">
        {isAcceptedHere ? (
          <div className="w-full py-3 px-3 bg-emerald-600 text-white rounded-xl font-extrabold text-base flex items-center justify-center gap-2 shadow-md min-h-[56px]">
            <Check className="w-5 h-5" />
            Bed confirmed and held
          </div>
        ) : isPendingHere ? (
          <div className="p-3 bg-blue-100/90 border border-blue-300 rounded-xl flex items-center justify-between gap-2 min-h-[56px]">
            <span className="text-sm font-semibold text-blue-900">
              Waiting for the hospital to accept
            </span>
            <ReservationTimer expiresAt={activeReservation.expires_at} size="sm" />
          </div>
        ) : isRejectedHere ? (
          <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-sm text-red-900 font-medium text-center">
            Hospital said no. Moved on to the next hospital.
          </div>
        ) : (
          <button
            type="button"
            disabled={availableBeds <= 0 || isLoading || onDiversion}
            onClick={(e) => {
              e.stopPropagation();
              onHoldBed(hospital.id);
            }}
            className={`w-full py-3.5 px-4 rounded-xl font-extrabold text-base transition-all duration-150 flex items-center justify-center gap-2 min-h-[56px] ${
              availableBeds > 0 && !onDiversion
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl active:scale-[0.98]'
                : 'bg-slate-100 text-slate-500 cursor-not-allowed border border-slate-200'
            }`}
            aria-label={`Hold bed at ${hospital.name}`}
          >
            {availableBeds > 0 && !onDiversion && <Lock className="w-5 h-5" />}
            <span>{onDiversion ? 'On diversion' : availableBeds > 0 ? 'Hold bed (2 min)' : 'No beds free'}</span>
            {availableBeds > 0 && !onDiversion && <ArrowRight className="w-5 h-5" />}
          </button>
        )}
      </div>

      {/* Everything else, one tap away */}
      <details className="group text-sm" onClick={(e) => e.stopPropagation()}>
        <summary className="cursor-pointer select-none list-none flex items-center justify-center gap-1 py-2 font-semibold text-slate-600 hover:text-slate-900 min-h-[44px]">
          More details
          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
        </summary>

        <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
          {/* Where */}
          <div className="flex items-start gap-1.5 text-slate-600">
            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <span>
              {distanceKm} km · {hospital.address}
            </span>
          </div>

          {/* Ventilator / specialty */}
          {(requiresVentilator || (requiredSpecialty && requiredSpecialty !== 'none')) && (
            <div className="flex flex-col gap-1.5 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              {requiresVentilator && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Ventilator</span>
                  <span className={`font-semibold flex items-center gap-1 ${hasVentilator ? 'text-emerald-700' : 'text-red-700'}`}>
                    {hasVentilator ? `${ventInv?.available_beds} free` : 'None'}
                    {hasVentilator ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </span>
                </div>
              )}
              {requiredSpecialty && requiredSpecialty !== 'none' && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 capitalize">{requiredSpecialty}</span>
                  <span className={`font-semibold flex items-center gap-1 ${hasSpecialty ? 'text-emerald-700' : 'text-red-700'}`}>
                    {hasSpecialty ? 'Available' : 'Not available'}
                    {hasSpecialty ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Busy right now: lowers the chance a bed is still free on arrival */}
          {recentHolds > 0 && (
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Busy: {recentHolds} ambulance{recentHolds === 1 ? '' : 's'} took {requiredBedType.toUpperCase()} beds here in the
              last hour, so beds may go faster.
            </p>
          )}

          {/* How full + how reliable */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LoadIndicator loadPercent={hospital.current_load} />
            <span
              className={`font-semibold ${reliability < 90 ? 'text-amber-700' : 'text-slate-600'}`}
              title="Drops when this hospital rejects, ignores, or loses a held bed"
            >
              Reliability {reliability}/100
            </span>
          </div>

          {/* Why this hospital: score breakdown */}
          <div>
            <div className="flex items-center justify-between font-semibold text-slate-700 mb-1.5">
              <span>Why this hospital?</span>
              <span className="text-slate-900">Score {Math.round(scoredHospital.totalScore * 100)}/100</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {why.map((row) => (
                <li key={row.label} className="flex items-center gap-2">
                  <span className="flex-1 text-slate-600">{row.label}</span>
                  <span className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
                    <span className="block h-full bg-blue-500" style={{ width: `${row.max ? (row.pts / row.max) * 100 : 0}%` }} />
                  </span>
                  <span className="w-14 text-right font-mono text-slate-800">
                    {row.pts}/{row.max}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Call / Navigate */}
          <div className="flex gap-2">
            {hospital.phone && (
              <a
                href={callUrl(hospital.phone)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg min-h-[48px]"
                aria-label={`Call ${hospital.name}`}
              >
                <Phone className="w-4 h-4" />
                Call
              </a>
            )}
            <a
              href={navigateUrl(hospital.latitude, hospital.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg min-h-[48px]"
              aria-label={`Directions to ${hospital.name}`}
            >
              <Navigation className="w-4 h-4" />
              Navigate
            </a>
          </div>
        </div>
      </details>
    </article>
  );
}
