'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Navigation, Phone, X, Bed, ShieldCheck } from 'lucide-react';
import { Reservation } from '@/lib/types';
import { bedLinkStore } from '@/lib/data/store';
import { PatientHandoverModal } from '@/components/handover/PatientHandoverModal';

interface BedConfirmedAlertProps {
  reservation: Reservation;
  onDismiss: () => void;
}

/**
 * Full-screen confirmation alert shown to ambulance crew when hospital
 * accepts the bed hold. Triggers browser push notification + vibration.
 */
export function BedConfirmedAlert({ reservation, onDismiss }: BedConfirmedAlertProps) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [showHandover, setShowHandover] = useState(false);

  useEffect(() => {
    // 1. Browser vibration (mobile ambulance phone)
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 600]);
    }

    // 2. Web Notifications API push
    const sendPush = async () => {
      if (!('Notification' in window)) return;
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
      }
      if (perm === 'granted') {
        new Notification('🛏️ BED CONFIRMED — PROCEED NOW', {
          body: `Hospital: ${reservation.hospital_name}\nBed type: ${reservation.bed_type?.toUpperCase() ?? 'ICU'}\nProceed immediately to the hospital.`,
          icon: '/icon-512.jpg',
          badge: '/icon-512.jpg',
          tag: 'bed-confirmed',
          requireInteraction: true,
        });
      }
    };
    sendPush();

    // 3. Emergency alert tone using Web Audio API (no file needed)
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const playBeep = (startTime: number, freq: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Three rising confirmation beeps
      const now = ctx.currentTime;
      playBeep(now, 523, 0.18);       // C5
      playBeep(now + 0.22, 659, 0.18); // E5
      playBeep(now + 0.44, 784, 0.35); // G5 (hold)
    } catch {
      // Audio context not available in this environment
    }

    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [reservation.hospital_name, reservation.bed_type]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Bed Confirmed Notification"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-emerald-600 animate-scale-up"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Pulsing background ring */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-72 h-72 rounded-full bg-white/10 animate-ping" style={{ animationDuration: '1.5s' }} />
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-4 right-4 p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
        aria-label="Dismiss alert"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Main content */}
      <div className="relative flex flex-col items-center gap-5 px-6 text-center max-w-sm w-full">

        {/* Big checkmark icon */}
        <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-2xl">
          <CheckCircle2 className="w-14 h-14 text-emerald-600" strokeWidth={2.5} />
        </div>

        {/* Title */}
        <div>
          <p className="text-white/80 text-sm font-bold uppercase tracking-widest mb-1">
            🚨 Hospital Confirmed
          </p>
          <h1 className="text-white font-black text-3xl leading-tight">
            BED READY
          </h1>
          <p className="text-white/90 font-black text-3xl leading-tight">
            PROCEED NOW
          </p>
        </div>

        {/* Hospital info card */}
        <div className="w-full bg-white/20 backdrop-blur rounded-2xl px-5 py-4 flex flex-col gap-3 border border-white/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/25 flex items-center justify-center shrink-0">
              <Bed className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wider">Hospital</p>
              <p className="text-white font-extrabold text-base leading-tight">
                {reservation.hospital_name || 'Confirmed Hospital'}
              </p>
            </div>
          </div>

          {reservation.bed_type && (
            <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2">
              <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">Bed type:</span>
              <span className="text-white font-extrabold text-sm uppercase">
                {reservation.bed_type}
              </span>
              <span className="ml-auto text-[10px] font-black text-emerald-200 bg-emerald-900/40 px-2 py-0.5 rounded-full uppercase">
                HELD FOR YOU
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="w-full grid grid-cols-2 gap-3">
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(reservation.hospital_name || 'hospital')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-white text-emerald-700 font-extrabold text-sm py-3.5 rounded-2xl shadow-lg active:scale-95 transition-transform"
          >
            <Navigation className="w-4 h-4" />
            Navigate
          </a>
          <button
            type="button"
            onClick={() => setShowHandover(true)}
            className="flex items-center justify-center gap-2 bg-white/20 border border-white/40 text-white font-extrabold text-sm py-3.5 rounded-2xl active:scale-95 transition-transform"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            Vitals (SHA-256)
          </button>
        </div>

        <a
          href="tel:108"
          className="w-full flex items-center justify-center gap-2 bg-emerald-900/40 border border-emerald-400/40 text-white font-bold text-xs py-2.5 rounded-xl active:scale-95 transition-transform"
        >
          <Phone className="w-3.5 h-3.5" />
          Emergency 108 CAD Control Line
        </a>

        {/* Swipe to dismiss hint */}
        <button
          type="button"
          onClick={onDismiss}
          className="text-white/60 text-xs font-semibold underline-offset-2 underline mt-1"
        >
          Tap to dismiss
        </button>
      </div>

      {/* Patient Handover Sheet & SHA-256 Seal Modal */}
      {showHandover && (
        <PatientHandoverModal
          handover={bedLinkStore.getPatientHandover(reservation.id, reservation.hospital_id)}
          onClose={() => setShowHandover(false)}
        />
      )}
    </div>
  );
}
