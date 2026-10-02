'use client';

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  MapPin,
  Clock,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Bed,
  Check,
  Navigation,
  Phone
} from 'lucide-react';
import { BedType, Reservation, ScoredHospital } from '@/lib/types';
import { FreshnessIndicator } from './FreshnessIndicator';
import { LoadIndicator } from './LoadIndicator';
import { ReservationTimer } from './ReservationTimer';
import { callUrl, navigateUrl } from './ActiveHoldBar';
import { DEFAULT_RANKING_WEIGHTS } from '@/lib/dispatch/ranking';

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
}

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
  isLoading = false
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
  const reliability = hospital.reliability ?? 100;

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
      {/* Top Bar: Rank & Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              rank === 1 && isExactMatch
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {rank}
          </span>
          <img 
            src="/icons/hospital-building.svg" 
            alt="Hospital" 
            className="w-7 h-7 object-contain shrink-0 drop-shadow-sm" 
          />
          <h3 className="font-semibold text-slate-900 text-base leading-snug">
            {hospital.name}
          </h3>
        </div>

        {rank === 1 && isExactMatch && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3 text-amber-600" />
            Top Match
          </span>
        )}
      </div>

      {/* Hospital status: diversion / busy / reliability */}
      {(onDiversion || hospital.ed_status === 'busy' || reliability < 90) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {onDiversion && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
              On diversion: not taking ambulances
            </span>
          )}
          {hospital.ed_status === 'busy' && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Hospital says: busy
            </span>
          )}
          {reliability < 90 && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
              title="Drops when this hospital rejects, ignores, or loses a held bed"
            >
              Reliability {reliability}/100
            </span>
          )}
        </div>
      )}

      {/* Distance, ETA, Address */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mb-3">
        <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
          <Clock className="w-3.5 h-3.5" />
          {etaMinutes} min ETA
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          {distanceKm} km
        </span>
        <span className="text-slate-400 truncate max-w-[200px]" title={hospital.address}>
          {hospital.address}
        </span>
      </div>

      {/* Requirements Matrix */}
      <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-lg text-xs mb-3 border border-slate-100">
        {/* Required Bed Availability */}
        <div className="flex items-center justify-between">
          <span className="text-slate-600 capitalize flex items-center gap-1">
            <Bed className="w-3.5 h-3.5 text-slate-500" />
            {requiredBedType}:
          </span>
          <span className="font-mono font-semibold flex items-center gap-1">
            {availableBeds > 0 ? (
              <>
                <span className="text-emerald-700">{availableBeds} avail</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </>
            ) : (
              <>
                <span className="text-rose-700">0 avail</span>
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
              </>
            )}
          </span>
        </div>

        {/* Ventilator (if required or present) */}
        {requiresVentilator && (
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Ventilator:</span>
            <span className="font-mono font-semibold flex items-center gap-1">
              {hasVentilator ? (
                <>
                  <span className="text-emerald-700">{ventInv?.available_beds} avail</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </>
              ) : (
                <>
                  <span className="text-rose-700">None</span>
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                </>
              )}
            </span>
          </div>
        )}

        {/* Specialty (if requested) */}
        {requiredSpecialty && requiredSpecialty !== 'none' && (
          <div className="flex items-center justify-between col-span-2">
            <span className="text-slate-600 capitalize">{requiredSpecialty} Specialty:</span>
            <span className="font-medium flex items-center gap-1">
              {hasSpecialty ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  Supported <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-700">
                  Not Supported <XCircle className="w-3.5 h-3.5 text-rose-600" />
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Partial Match Notice */}
      {!isExactMatch && missingResources.length > 0 && (
        <div className="mb-3 px-2.5 py-1.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-start gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
          <div>
            <strong className="font-semibold">Missing Resource: </strong>
            {missingResources.join(', ')}
          </div>
        </div>
      )}

      {/* Why this hospital: score breakdown */}
      <details className="mb-3 text-xs group" onClick={(e) => e.stopPropagation()}>
        <summary className="cursor-pointer select-none font-semibold text-slate-600 hover:text-slate-900 list-none flex items-center justify-between">
          <span>Why this hospital?</span>
          <span className="font-mono text-slate-800">Score {Math.round(scoredHospital.totalScore * 100)}/100</span>
        </summary>
        <ul className="mt-2 flex flex-col gap-1.5">
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
      </details>

      {/* Call / Navigate */}
      <div className="flex gap-2 mb-3">
        {hospital.phone && (
          <a
            href={callUrl(hospital.phone)}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg min-h-[40px]"
            aria-label={`Call ${hospital.name}`}
          >
            <Phone className="w-3.5 h-3.5" />
            Call
          </a>
        )}
        <a
          href={navigateUrl(hospital.latitude, hospital.longitude)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg min-h-[40px]"
          aria-label={`Directions to ${hospital.name}`}
        >
          <Navigation className="w-3.5 h-3.5" />
          Navigate
        </a>
      </div>

      {/* Freshness & Load Indicators */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 mb-3 text-xs">
        <FreshnessIndicator updatedAt={scoredHospital.lastUpdated} />
        <LoadIndicator loadPercent={hospital.current_load} />
      </div>

      {/* Action Area: Pending / Accepted / Hold Bed */}
      <div>
        {isAcceptedHere ? (
          <div className="w-full py-3 sm:py-2.5 px-3 bg-emerald-600 text-white rounded-xl sm:rounded-lg font-extrabold sm:font-semibold text-base sm:text-sm flex items-center justify-center gap-2 shadow-md">
            <Check className="w-5 h-5 sm:w-4 sm:h-4" />
            BED CONFIRMED &amp; HELD
          </div>
        ) : isPendingHere ? (
          <div className="p-3.5 sm:p-3 bg-blue-100/90 border border-blue-300 rounded-xl sm:rounded-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
                Holding · Awaiting Hospital
              </span>
              <ReservationTimer expiresAt={activeReservation.expires_at} size="sm" />
            </div>
            <div className="text-xs text-blue-800">
              Hospital notified. Awaiting nurse acceptance.
            </div>
          </div>
        ) : isRejectedHere ? (
          <div className="p-3 sm:p-2.5 bg-rose-100 border border-rose-300 rounded-xl sm:rounded-lg text-xs text-rose-900 font-medium text-center">
            Hospital declined. Auto-routed to next facility.
          </div>
        ) : (
          <button
            type="button"
            disabled={availableBeds <= 0 || isLoading || onDiversion}
            onClick={(e) => {
              e.stopPropagation();
              onHoldBed(hospital.id);
            }}
            className={`w-full py-3.5 sm:py-2.5 px-4 rounded-xl sm:rounded-lg font-extrabold sm:font-semibold text-base sm:text-sm transition-all duration-150 flex items-center justify-center gap-2 min-h-[54px] sm:min-h-[44px] ${
              availableBeds > 0 && !onDiversion
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl active:scale-[0.98]'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
            aria-label={`Hold bed at ${hospital.name}`}
          >
            <span>{onDiversion ? 'ON DIVERSION' : availableBeds > 0 ? '🔒 HOLD BED (2 MIN)' : 'NO BEDS AVAILABLE'}</span>
            {availableBeds > 0 && !onDiversion && <ArrowRight className="w-5 h-5 sm:w-4 sm:h-4" />}
          </button>
        )}
      </div>
    </article>
  );
}
