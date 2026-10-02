'use client';

import React, { useState, useEffect } from 'react';
import { Reservation, PatientHandoverRecord } from '@/lib/types';
import {
  Ambulance,
  Clock,
  Navigation,
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Bed
} from 'lucide-react';
import { PatientHandoverModal } from '@/components/handover/PatientHandoverModal';

export interface IncomingAmbulanceItem {
  reservation: Reservation;
  handover: PatientHandoverRecord;
  etaMinutes: number;
  targetArrivalMs: number;
  ambulanceId: string;
  paramedicId: string;
  patientName: string;
  patientUrgency: 'critical' | 'urgent' | 'normal';
  bedType: string;
  distanceKm: number;
}

interface AmbulanceArrivalCountdownProps {
  incoming: IncomingAmbulanceItem[];
  onAdmitPatient: (reservationId: string, bedType: string, patientName: string) => void;
}

export function AmbulanceArrivalCountdown({
  incoming,
  onAdmitPatient
}: AmbulanceArrivalCountdownProps) {
  const [selectedHandover, setSelectedHandover] = useState<PatientHandoverRecord | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (incoming.length === 0) {
    return (
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
            <Ambulance className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-800">
              No Ambulances Currently En Route
            </h3>
            <p className="text-xs text-slate-500">
              Hospital trauma bay is clear. Emergency CAD standby active.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
          STANDBY
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
              Incoming Ambulance Live Countdowns ({incoming.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-semibold">
            Live GPS Telemetry
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {incoming.map((item) => {
            const remainingMs = Math.max(0, item.targetArrivalMs - now);
            const totalSeconds = Math.floor(remainingMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            const isImminent = remainingMs <= 1000 * 60 * 2; // Under 2 mins

            return (
              <div
                key={item.reservation.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isImminent
                    ? 'bg-red-50/70 border-red-200 shadow-md ring-1 ring-red-400/40'
                    : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Ambulance & Patient Info */}
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        isImminent
                          ? 'bg-red-600 text-white animate-pulse'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      <Ambulance className="w-6 h-6" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {item.ambulanceId}
                        </span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                            item.patientUrgency === 'critical'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.patientUrgency.toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1">
                          <Bed className="w-3 h-3" />
                          <span>{item.bedType.toUpperCase()} Bed Held</span>
                        </span>
                      </div>

                      <h4 className="text-sm font-black text-slate-900 mt-1">
                        {item.patientName}
                      </h4>
                      <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{item.handover.chief_complaint}</span>
                        <span>•</span>
                        <span>{item.distanceKm} km away</span>
                      </p>
                    </div>
                  </div>

                  {/* Right: Live ETA Countdown Clock & Quick Actions */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    {/* Countdown Clock */}
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {remainingMs === 0 ? 'ARRIVED AT BAY' : 'ARRIVAL COUNTDOWN'}
                      </span>
                      <div
                        className={`flex items-center gap-1.5 font-mono text-xl sm:text-2xl font-black ${
                          remainingMs === 0
                            ? 'text-emerald-600 animate-bounce'
                            : isImminent
                            ? 'text-red-600'
                            : 'text-slate-900'
                        }`}
                      >
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span>{remainingMs === 0 ? '00:00' : formattedTime}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                      <button
                        type="button"
                        onClick={() => setSelectedHandover(item.handover)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                        title="View Patient Handover Sheet & Cryptographic SHA-256 Hash"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden md:inline">Vitals (SHA-256)</span>
                        <span className="md:hidden">Vitals</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onAdmitPatient(item.reservation.id, item.bedType, item.patientName)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Admit</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Handover Modal with SHA-256 Verification */}
      {selectedHandover && (
        <PatientHandoverModal
          handover={selectedHandover}
          onClose={() => setSelectedHandover(null)}
        />
      )}
    </>
  );
}
