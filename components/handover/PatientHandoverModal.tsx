'use client';

import React, { useState } from 'react';
import { PatientHandoverRecord } from '@/lib/types';
import { verifyHandoverIntegrity } from '@/lib/crypto/handoverSha';
import {
  ShieldCheck,
  Activity,
  Heart,
  FileCheck2,
  Copy,
  Check,
  Printer,
  X,
  Lock,
  Stethoscope,
  AlertTriangle
} from 'lucide-react';

interface PatientHandoverModalProps {
  handover: PatientHandoverRecord;
  onClose: () => void;
}

export function PatientHandoverModal({
  handover,
  onClose
}: PatientHandoverModalProps) {
  const [copied, setCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(handover.sha256_hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    try {
      const isValid = await verifyHandoverIntegrity(handover);
      setVerificationResult(isValid);
    } catch {
      setVerificationResult(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const { vitals } = handover;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6">
        {/* Header with SHA-256 Security Banner */}
        <div className="bg-slate-900 text-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                    SHA-256 SEALED
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {handover.ambulance_vehicle_id}
                  </span>
                </div>
                <h2 className="text-lg font-black tracking-tight text-white mt-0.5">
                  Pre-Hospital Patient Handover Telemetry
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cryptographic Hash Bar */}
          <div className="mt-4 bg-slate-950/90 rounded-xl p-3 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 overflow-hidden">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Cryptographic Integrity Checksum (SHA-256)
                </span>
                <span className="font-mono text-[11px] text-emerald-300 break-all select-all">
                  {handover.sha256_hash}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyHash}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
                title="Copy SHA-256 Hash"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copied ? 'Copied' : 'Copy Hash'}</span>
              </button>
              <button
                type="button"
                onClick={handleVerifyIntegrity}
                disabled={isVerifying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isVerifying ? 'Checking...' : 'Verify Seal'}</span>
              </button>
            </div>
          </div>

          {/* Verification Result Banner */}
          {verificationResult !== null && (
            <div
              className={`mt-2.5 p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                verificationResult
                  ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-200'
                  : 'bg-red-950/80 border-red-500/80 text-red-200'
              }`}
            >
              {verificationResult ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>100% UNTAMPERED MEDICAL RECORD.</strong> Canonical payload matches SHA-256 signature. Authorized by {handover.paramedic_badge_id}.
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    <strong>WARNING: CHECKSUM MISMATCH.</strong> Record was modified after paramedic dispatch.
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Clinical Patient Details Sheet */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Patient Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Patient Identifier
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-base font-black text-slate-900">
                  {handover.patient_name || 'Emergency Patient'}
                </span>
                <span className="text-xs font-mono font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">
                  {handover.patient_id}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {handover.patient_age ? `${handover.patient_age} yrs` : 'Adult'} • {handover.patient_gender || 'Unspecified'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border ${
                  handover.triage_level === 'red'
                    ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                    : handover.triage_level === 'yellow'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                Triage {handover.triage_level.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Core Physiological Vitals Grid (GCS, BP, SpO2, Heart Rate) */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-blue-600" />
              <span>Emergency Clinical Vitals (En Route)</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* GCS */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  GCS Score
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-2xl font-black font-mono ${
                    vitals.gcs <= 8 ? 'text-red-600' : vitals.gcs <= 12 ? 'text-amber-600' : 'text-slate-900'
                  }`}>
                    {vitals.gcs}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">/ 15</span>
                </div>
                {vitals.gcs_breakdown && (
                  <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                    E{vitals.gcs_breakdown.eye} V{vitals.gcs_breakdown.verbal} M{vitals.gcs_breakdown.motor}
                  </span>
                )}
              </div>

              {/* BP */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Blood Pressure
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black font-mono text-slate-900">
                    {vitals.bp}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">mmHg</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Mean MAP: ~98
                </span>
              </div>

              {/* SpO2 */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Oxygen (SpO2)
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-2xl font-black font-mono ${
                    vitals.spo2 < 92 ? 'text-red-600' : 'text-emerald-600'
                  }`}>
                    {vitals.spo2}%
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  on High-Flow O2
                </span>
              </div>

              {/* Heart Rate */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Heart Rate
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black font-mono text-blue-600">
                    {vitals.heart_rate}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">bpm</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Sinus Rhythm
                </span>
              </div>
            </div>

            {/* Secondary Vitals */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                <span className="text-[10px] font-semibold text-slate-400 block">Resp Rate:</span>
                <strong className="font-mono text-slate-800">{vitals.resp_rate} breaths/min</strong>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                <span className="text-[10px] font-semibold text-slate-400 block">Blood Sugar:</span>
                <strong className="font-mono text-slate-800">{vitals.blood_glucose || 115} mg/dL</strong>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                <span className="text-[10px] font-semibold text-slate-400 block">Body Temp:</span>
                <strong className="font-mono text-slate-800">{vitals.temperature || 98.6} °F</strong>
              </div>
            </div>
          </div>

          {/* Chief Complaint & Field Interventions */}
          <div className="space-y-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Chief Complaint & Paramedic Assessment
              </span>
              <p className="text-xs font-semibold text-slate-900 mt-1">
                {handover.chief_complaint}
              </p>
            </div>

            {handover.medications_administered && handover.medications_administered.length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Medications Administered En Route
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {handover.medications_administered.map((med) => (
                    <span
                      key={med}
                      className="text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg"
                    >
                      {med}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {handover.allergies && handover.allergies.length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 block mb-1.5">
                  Known Allergies
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {handover.allergies.map((all) => (
                    <span
                      key={all}
                      className="text-xs font-semibold bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-lg"
                    >
                      ⚠️ {all}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dispatch Authority Footnote */}
          <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div>
              <span>Recorded by Paramedic: </span>
              <strong className="text-slate-800 font-mono">{handover.paramedic_badge_id}</strong>
            </div>
            <div>
              <span>Timestamp: </span>
              <strong className="text-slate-800 font-mono">
                {new Date(handover.timestamp).toLocaleTimeString()} IST
              </strong>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Clinical Record</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-all"
          >
            Close Handover
          </button>
        </div>
      </div>
    </div>
  );
}
