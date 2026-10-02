'use client';

import React from 'react';
import { BedNeedEvaluation } from '@/lib/utils/bedAutoAssign';
import { PatientHandoverRecord } from '@/lib/types';
import {
  CheckCircle2,
  Bed,
  ShieldCheck,
  Activity,
  HeartPulse,
  Sparkles,
  X,
  FileText,
  UserCheck
} from 'lucide-react';

interface BedAutoAssignedModalProps {
  assignment: BedNeedEvaluation & {
    logId: string;
    admittedAt: string;
    handover: PatientHandoverRecord;
    patientName: string;
  };
  onClose: () => void;
  onViewHandover?: () => void;
}

export function BedAutoAssignedModal({
  assignment,
  onClose,
  onViewHandover
}: BedAutoAssignedModalProps) {
  const {
    patientName = 'Emergency Patient',
    bedIdentifier = 'BED-01',
    assignedBedType = 'emergency',
    needReason = 'Clinical Care',
    vitalsSummary = 'Vitals Recorded',
    triageLevel = 'yellow',
    handover
  } = assignment || {};

  const triageBg =
    triageLevel === 'red'
      ? 'bg-red-500'
      : triageLevel === 'yellow'
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-6">
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-900 text-white p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-emerald-300 shadow-inner shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-black tracking-widest bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                  AUTO BED ALLOCATED
                </span>
                <span className="text-xs text-emerald-200 font-mono">
                  {handover?.ambulance_vehicle_id || 'EMS UNIT'}
                </span>
              </div>
              <h2 className="text-xl font-black text-white mt-0.5 tracking-tight">
                Patient Successfully Admitted!
              </h2>
            </div>
          </div>
        </div>

        {/* Assigned Bed Callout Card */}
        <div className="p-6 space-y-5">
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                Bed given to this patient
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-mono text-2xl font-black text-slate-900">
                  {bedIdentifier}
                </span>
                <span className="text-xs font-black uppercase text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300">
                  {assignedBedType.toUpperCase()} WARD
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Bed className="w-6 h-6" />
            </div>
          </div>

          {/* Patient Clinical Profile */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Patient Information
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${triageBg}`} />
                <span className="text-xs font-black uppercase text-slate-700">
                  TRIAGE {triageLevel.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-black text-slate-900">
                  {patientName}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  ID: {handover?.patient_id || 'P-001'}
                </span>
              </div>

              <div className="text-xs text-slate-700 font-semibold flex items-center gap-2 pt-1 border-t border-slate-200">
                <Activity className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{vitalsSummary}</span>
              </div>
            </div>
          </div>

          {/* Clinical Need Rationale */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Why this bed
              </span>
            </div>

            <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 text-xs font-medium text-slate-800 space-y-1">
              <p className="font-bold text-blue-950 flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5 text-blue-600" />
                <span>Need Matched: {needReason}</span>
              </p>
              {handover?.chief_complaint && (
                <p className="text-slate-600 text-xs pl-5">
                  Chief Complaint: {handover.chief_complaint}
                </p>
              )}
            </div>
          </div>

          {/* SHA-256 Legal Seal Badge */}
          {handover?.sha256_hash && (
            <div className="bg-slate-900 text-white rounded-xl p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="truncate">
                  <span className="text-xs text-slate-400 uppercase font-bold block">
                    Tamper-proof handover sheet
                  </span>
                  <span className="font-mono text-xs text-emerald-300 truncate block">
                    {handover.sha256_hash}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {onViewHandover && handover && (
              <button
                type="button"
                onClick={onViewHandover}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all"
              >
                <FileText className="w-4 h-4 text-slate-600" />
                <span>Open handover sheet</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
            >
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
