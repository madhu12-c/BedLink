'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Bed,
  Check,
  X
} from 'lucide-react';
import { BedInventory, Reservation } from '@/lib/types';
import { ReservationTimer } from '../dispatch/ReservationTimer';

interface IncomingReservationAlertProps {
  reservation: Reservation;
  currentInventory?: BedInventory;
  onAccept: (reservationId: string) => Promise<void>;
  onReject: (reservationId: string, reason?: string) => Promise<void>;
  onDismiss?: () => void;
}

export function IncomingReservationAlert({
  reservation,
  currentInventory,
  onAccept,
  onReject,
  onDismiss
}: IncomingReservationAlertProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState('Staffing & Resus bay currently saturated');

  const [dismissCountdown, setDismissCountdown] = useState<number | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isFullyDismissed, setIsFullyDismissed] = useState(false);

  const isAccepted = reservation.status === 'accepted';
  const isRejected = reservation.status === 'rejected';
  const isExpired = reservation.status === 'expired';
  const isAnswered = isAccepted || isRejected || isExpired;

  // When the request is answered (accepted/rejected/expired), start the 5-second auto-close.
  // Set during render when it changes (React's pattern), not inside an effect.
  if (isAnswered && dismissCountdown === null && !isFadingOut && !isFullyDismissed) {
    setDismissCountdown(5);
  }

  // Count down one second at a time
  useEffect(() => {
    if (dismissCountdown === null || dismissCountdown <= 0) return;
    const tick = setTimeout(() => setDismissCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearTimeout(tick);
  }, [dismissCountdown]);

  // At zero: fade out, then remove the card
  useEffect(() => {
    if (dismissCountdown !== 0) return;
    const fade = setTimeout(() => {
      setIsFullyDismissed(true);
      onDismiss?.();
    }, 500);
    return () => clearTimeout(fade);
  }, [dismissCountdown, onDismiss]);

  const handleManualDismiss = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      setIsFullyDismissed(true);
      onDismiss?.();
    }, 400);
  };

  const handleAccept = async () => {
    setIsProcessing(true);
    try {
      await onAccept(reservation.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectConfirm = async () => {
    setIsProcessing(true);
    try {
      await onReject(reservation.id, selectedReason);
      setRejectionModalOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const fadingOut = isFadingOut || dismissCountdown === 0;

  if (isFullyDismissed) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border-2 p-5 sm:p-6 shadow-xl transition-all duration-500 transform ${
        fadingOut
          ? 'opacity-0 scale-95 -translate-y-4 max-h-0 overflow-hidden pointer-events-none p-0 my-0 border-0'
          : 'opacity-100 scale-100 translate-y-0 max-h-[800px]'
      } ${
        isAccepted
          ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
          : isRejected || isExpired
          ? 'bg-slate-100 border-slate-300 text-slate-700 opacity-90'
          : 'bg-red-50/80 border-red-600 text-slate-900 shadow-red-500/10'
      }`}
      role="alertdialog"
      aria-labelledby="incoming-alert-title"
      aria-describedby="incoming-alert-desc"
    >
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-red-200/80">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-10 h-10 rounded-full text-white flex items-center justify-center shadow-md ${
              isAccepted
                ? 'bg-emerald-600'
                : isRejected || isExpired
                ? 'bg-slate-600'
                : 'bg-red-600 animate-pulse'
            }`}
          >
            {isAccepted ? (
              <Check className="w-5 h-5" />
            ) : isRejected || isExpired ? (
              <XCircle className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-700 block">
              {isAccepted
                ? 'BED HOLD SECURED & VERIFIED'
                : isRejected
                ? 'RESERVATION REJECTED & RE-ROUTED'
                : 'INCOMING EMERGENCY RESERVATION'}
            </span>
            <h2 id="incoming-alert-title" className="text-lg sm:text-xl font-extrabold text-slate-900">
              {isAccepted
                ? 'PATIENT TRANSFER CONFIRMED'
                : isRejected
                ? 'FALLBACK ROUTING IN PROGRESS'
                : 'CRITICAL PATIENT EN ROUTE'}
            </h2>
          </div>
        </div>

        {/* 2-Minute Authoritative Countdown or 5s Auto-Close Badge */}
        {reservation.status === 'pending' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 hidden sm:inline">Respond within:</span>
            <ReservationTimer expiresAt={reservation.expires_at} size="lg" />
          </div>
        )}

        {isAnswered && dismissCountdown !== null && (
          <div className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            <span>Auto-clearing in {dismissCountdown}s</span>
          </div>
        )}
      </div>

      {/* Main Details Grid */}
      <div id="incoming-alert-desc" className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
        {/* Resource Requested */}
        <div className="bg-white/90 p-3 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block uppercase font-medium">Requested Resource</span>
          <div className="flex items-center gap-2 mt-1">
            <Bed className="w-4 h-4 text-blue-600" />
            <span className="text-base font-bold text-slate-900 uppercase">
              {reservation.bed_type} Bed Hold
            </span>
          </div>
        </div>

        {/* ETA */}
        <div className="bg-white/90 p-3 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block uppercase font-medium">Estimated Arrival</span>
          <div className="flex items-center gap-2 mt-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-base font-bold text-slate-900">
              {reservation.eta_minutes || 8} min ETA
            </span>
          </div>
        </div>

        {/* Current Availability */}
        <div className="bg-white/90 p-3 rounded-xl border border-slate-200">
          <span className="text-xs text-slate-500 block uppercase font-medium">Verified Unallocated</span>
          <div className="flex items-center gap-2 mt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-base font-bold text-slate-900 font-mono">
              {currentInventory ? `${currentInventory.available_beds} Available` : 'Confirmed'}
            </span>
          </div>
        </div>
      </div>

      {/* Triage Notes */}
      {reservation.notes && (
        <div className="mb-4 p-3 bg-white/80 rounded-xl border border-slate-200 text-xs text-slate-700">
          <strong className="text-slate-900 font-semibold block mb-0.5">Paramedic Dispatch Notes:</strong>
          {reservation.notes}
        </div>
      )}

      {/* Action Decision Area */}
      {reservation.status === 'pending' ? (
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {/* Reject Button */}
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => setRejectionModalOpen(true)}
            className="flex-1 py-3 px-4 rounded-xl border-2 border-red-300 bg-white hover:bg-red-50 text-red-700 font-bold text-sm transition-all duration-150 flex items-center justify-center gap-2 min-h-[48px]"
          >
            <XCircle className="w-5 h-5 text-red-600" />
            <span>REJECT & PASS TO NEXT</span>
          </button>

          {/* Accept & Hold Button */}
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleAccept}
            className="flex-2 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-base transition-all duration-150 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 min-h-[48px]"
          >
            <CheckCircle2 className="w-5 h-5 text-white" />
            <span>ACCEPT & SECURE BED</span>
          </button>
        </div>
      ) : isAccepted ? (
        <div className="p-4 bg-emerald-600 text-white rounded-xl flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <Check className="w-6 h-6 text-emerald-200 shrink-0 animate-bounce" />
            <div>
              <span className="font-extrabold text-base block">BED SECURED & HELD</span>
              <span className="text-xs text-emerald-100 font-mono block">
                Ambulance en route to ER. Moving to Live Telemetry in {dismissCountdown ?? 5}s...
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualDismiss}
            className="text-xs font-bold bg-emerald-700/90 hover:bg-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-500/50 flex items-center gap-1 transition-all shrink-0"
          >
            <span>Dismiss ({dismissCountdown ?? 5}s)</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : isRejected ? (
        <div className="p-4 bg-slate-800 text-white rounded-xl flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <XCircle className="w-6 h-6 text-red-400 shrink-0" />
            <div>
              <span className="font-extrabold text-sm block">RESERVATION REJECTED & RE-ROUTED</span>
              <span className="text-xs text-slate-300 font-mono block">
                Request re-routed to next hospital. Clearing alert in {dismissCountdown ?? 5}s...
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualDismiss}
            className="text-xs font-bold bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shrink-0"
          >
            <span>Dismiss ({dismissCountdown ?? 5}s)</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="p-4 bg-amber-900 text-white rounded-xl flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-amber-300 shrink-0" />
            <div>
              <span className="font-extrabold text-sm block">RESPONSE WINDOW TIMED OUT</span>
              <span className="text-xs text-amber-200 font-mono block">
                Contacting next candidate. Clearing alert in {dismissCountdown ?? 5}s...
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualDismiss}
            className="text-xs font-bold bg-amber-800 hover:bg-amber-700 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shrink-0"
          >
            <span>Dismiss ({dismissCountdown ?? 5}s)</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Animated 5-Second Progress Bar */}
      {isAnswered && dismissCountdown !== null && (
        <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden mt-4">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              isAccepted ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            style={{ width: `${(dismissCountdown / 5) * 100}%` }}
          />
        </div>
      )}

      {/* Reject Modal dialog */}
      {rejectionModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Select Rejection Reason</h3>
              <button
                type="button"
                onClick={() => setRejectionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Rejecting will immediately release the held bed and re-route the ambulance to the next eligible hospital.
            </p>

            <div className="flex flex-col gap-2">
              {[
                'Staffing & Resus bay currently saturated',
                'Equipment undergoing emergency decontamination',
                'Attending specialist unavailable',
                'Hospital emergency divert active'
              ].map((reason) => (
                <label
                  key={reason}
                  className={`p-3 rounded-lg border text-xs cursor-pointer flex items-center gap-2.5 transition-colors ${
                    selectedReason === reason
                      ? 'border-red-600 bg-red-50 text-red-950 font-semibold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="rejectionReason"
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRejectionModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow min-h-[44px]"
              >
                Confirm Rejection & Fallback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
