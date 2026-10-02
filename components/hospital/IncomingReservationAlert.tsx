'use client';

import React, { useState } from 'react';
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
}

export function IncomingReservationAlert({
  reservation,
  currentInventory,
  onAccept,
  onReject
}: IncomingReservationAlertProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState('Staffing & Resus bay currently saturated');

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

  const isAccepted = reservation.status === 'accepted';
  const isRejected = reservation.status === 'rejected';
  const isExpired = reservation.status === 'expired';

  return (
    <div
      className={`rounded-2xl border-2 p-5 sm:p-6 shadow-xl transition-all duration-300 ${
        isAccepted
          ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
          : isRejected || isExpired
          ? 'bg-slate-100 border-slate-300 text-slate-700 opacity-80'
          : 'bg-red-50/80 border-red-600 text-slate-900 shadow-red-500/10'
      }`}
      role="alertdialog"
      aria-labelledby="incoming-alert-title"
      aria-describedby="incoming-alert-desc"
    >
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-red-200/80">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center animate-pulse shadow-md">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-700 block">
              INCOMING EMERGENCY RESERVATION
            </span>
            <h2 id="incoming-alert-title" className="text-lg sm:text-xl font-extrabold text-slate-900">
              CRITICAL PATIENT EN ROUTE
            </h2>
          </div>
        </div>

        {/* 2-Minute Authoritative Countdown */}
        {reservation.status === 'pending' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 hidden sm:inline">Respond within:</span>
            <ReservationTimer expiresAt={reservation.expires_at} size="lg" />
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
          <div className="flex items-center gap-2">
            <Check className="w-6 h-6" />
            <div>
              <span className="font-extrabold text-base block">BED SECURED & HELD</span>
              <span className="text-xs text-emerald-100 font-mono">
                Reservation ID: {reservation.id.slice(0, 8)}... · Ambulance dispatched to your ER
              </span>
            </div>
          </div>
          <span className="text-xs font-semibold bg-emerald-700/80 px-2.5 py-1 rounded">
            Hold Active
          </span>
        </div>
      ) : isRejected ? (
        <div className="p-3 bg-slate-200 text-slate-700 rounded-xl text-center text-xs font-medium">
          Reservation rejected. Request immediately re-routed to next eligible hospital.
        </div>
      ) : (
        <div className="p-3 bg-amber-100 text-amber-900 rounded-xl text-center text-xs font-medium">
          2-Minute response window timed out. System automatically contacted next hospital candidate.
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
