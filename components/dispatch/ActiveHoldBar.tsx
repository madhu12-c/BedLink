'use client';

import React, { useState } from 'react';
import { CheckCircle2, Navigation, Phone, XCircle, X } from 'lucide-react';
import { Reservation } from '@/lib/types';
import { bedLinkStore } from '@/lib/data/store';
import { ReservationTimer } from './ReservationTimer';

interface ActiveHoldBarProps {
  reservation: Reservation;
  onCancel: (reservationId: string) => void;
  onDismiss?: () => void;
}

/** Google Maps driving route to a point (opens the Maps app on phones). */
export function navigateUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
}

/** Phone number as a tel: link (spaces removed). */
export function callUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * Sticky bar for this crew's own hold: big countdown while waiting, then the confirmed
 * hospital. Navigate and Call are always one tap away; Cancel needs a second tap to confirm.
 */
export function ActiveHoldBar({ reservation, onCancel, onDismiss }: ActiveHoldBarProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const hospital = bedLinkStore.getHospital(reservation.hospital_id);
  const hospitalName = reservation.hospital_name || hospital?.name || 'Hospital';
  const isPending = reservation.status === 'pending';

  if (reservation.status !== 'pending' && reservation.status !== 'accepted') return null;

  const handleCancel = () => {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      window.setTimeout(() => setConfirmingCancel(false), 4000);
      return;
    }
    setConfirmingCancel(false);
    onCancel(reservation.id);
  };

  return (
    <div
      className={`${isPending ? 'bg-blue-600' : 'bg-emerald-600'} text-white px-4 py-3 shadow-lg animate-fade-in z-30`}
      role="status"
    >
      <div className="max-w-[1700px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {isPending ? (
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
            ) : (
              <CheckCircle2 className="w-6 h-6 shrink-0" />
            )}
            <div className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-wider opacity-80">
                {isPending ? 'Waiting for hospital to accept' : 'Bed confirmed'}
              </span>
              <span className="block text-base font-extrabold truncate">{hospitalName}</span>
            </div>
            {isPending && (
              <ReservationTimer
                expiresAt={reservation.expires_at}
                size="lg"
                className="ml-auto sm:ml-3 shrink-0 bg-white/15 rounded-lg px-2"
              />
            )}
          </div>

          {/* Close button on mobile */}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 active:scale-95 transition-colors shrink-0"
              aria-label="Close this bar"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hospital && (
            <a
              href={navigateUrl(hospital.latitude, hospital.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-white text-slate-900 font-extrabold text-sm rounded-xl px-4 min-h-[48px]"
            >
              <Navigation className="w-4 h-4" />
              Navigate
            </a>
          )}
          {hospital?.phone && (
            <a
              href={callUrl(hospital.phone)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-white/15 border border-white/40 font-bold text-sm rounded-xl px-4 min-h-[48px]"
            >
              <Phone className="w-4 h-4" />
              Call
            </a>
          )}
          {isPending && (
            <button
              type="button"
              onClick={handleCancel}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 font-bold text-sm rounded-xl px-4 min-h-[48px] border ${
                confirmingCancel ? 'bg-red-600 border-red-300' : 'bg-white/15 border-white/40'
              }`}
            >
              <XCircle className="w-4 h-4" />
              {confirmingCancel ? 'Tap again to cancel' : 'Cancel hold'}
            </button>
          )}

          {/* Close button on desktop */}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition-colors shrink-0 ml-1"
              aria-label="Close this bar"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
