'use client';

import React, { useState } from 'react';
import { ChevronDown, HeartPulse, Send, ShieldCheck } from 'lucide-react';
import { PatientHandoverRecord, Reservation } from '@/lib/types';
import { bedLinkStore } from '@/lib/data/store';
import { caseLabel, createSignedHandoverRecord, hasRealName } from '@/lib/crypto/handoverSha';
import { serverNow, serverIso } from '@/lib/utils/serverClock';

interface VitalsFormProps {
  reservation: Reservation;
  crewName: string;
  className?: string;
}

const TRIAGE: Record<string, PatientHandoverRecord['triage_level']> = {
  critical: 'red',
  urgent: 'yellow',
  normal: 'green'
};

/** "Aspirin 325mg, O2 6L" -> ['Aspirin 325mg', 'O2 6L'] */
function toList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function numberIn(text: string, min: number, max: number): number | null {
  const n = Number(text);
  return text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
}

interface Field {
  key: 'gcs' | 'bp' | 'spo2' | 'hr' | 'rr' | 'temp' | 'glucose';
  label: string;
  placeholder: string;
  numeric: boolean;
  optional?: boolean;
}

const VITAL_FIELDS: Field[] = [
  { key: 'bp', label: 'BP', placeholder: '120/80', numeric: false },
  { key: 'hr', label: 'Heart rate', placeholder: '90', numeric: true },
  { key: 'spo2', label: 'SpO2 %', placeholder: '96', numeric: true },
  { key: 'rr', label: 'Resp. rate', placeholder: '18', numeric: true },
  { key: 'gcs', label: 'GCS (3-15)', placeholder: '15', numeric: true },
  { key: 'temp', label: 'Temp °F', placeholder: 'optional', numeric: true, optional: true },
  { key: 'glucose', label: 'Sugar mg/dL', placeholder: 'optional', numeric: true, optional: true }
];

/**
 * The crew sends the patient's vitals to the hospital before arrival. The sheet is sealed with
 * a SHA-256 code made from its content, so the hospital can check nothing was changed on the
 * way. The patient's name is optional: without one the patient is a case number.
 */
export function VitalsForm({ reservation, crewName, className = '' }: VitalsFormProps) {
  const sent = bedLinkStore.findPatientHandover(reservation.id);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: hasRealName(sent?.patient_name) ? sent!.patient_name! : '',
    complaint: sent?.chief_complaint ?? '',
    bp: sent?.vitals.bp ?? '',
    hr: sent ? String(sent.vitals.heart_rate) : '',
    spo2: sent ? String(sent.vitals.spo2) : '',
    rr: sent ? String(sent.vitals.resp_rate) : '',
    gcs: sent ? String(sent.vitals.gcs) : '15',
    temp: sent?.vitals.temperature != null ? String(sent.vitals.temperature) : '',
    glucose: sent?.vitals.blood_glucose != null ? String(sent.vitals.blood_glucose) : '',
    allergies: sent?.allergies?.join(', ') ?? '',
    meds: sent?.medications_administered?.join(', ') ?? '',
    procedures: sent?.procedures_performed?.join(', ') ?? '',
    vehicle: sent?.ambulance_vehicle_id ?? ''
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const send = async () => {
    const gcs = numberIn(form.gcs, 3, 15);
    const hr = numberIn(form.hr, 20, 250);
    const spo2 = numberIn(form.spo2, 50, 100);
    const rr = numberIn(form.rr, 4, 60);
    const temp = form.temp.trim() ? numberIn(form.temp, 90, 110) : undefined;
    const glucose = form.glucose.trim() ? numberIn(form.glucose, 20, 600) : undefined;
    const problems = [
      form.complaint.trim().length < 3 && 'what happened',
      !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(form.bp.trim()) && 'BP like 120/80',
      hr === null && 'heart rate 20-250',
      spo2 === null && 'SpO2 50-100',
      rr === null && 'resp. rate 4-60',
      gcs === null && 'GCS 3-15',
      temp === null && 'temp 90-110 °F',
      glucose === null && 'sugar 20-600'
    ].filter(Boolean);
    if (problems.length) {
      setError(`Check: ${problems.join(', ')}`);
      return;
    }

    setSending(true);
    setError(null);
    try {
      const record = await createSignedHandoverRecord({
        id: `ho-${reservation.id.slice(0, 8)}-${serverNow()}`,
        reservation_id: reservation.id,
        patient_id: `CASE-${reservation.id.slice(0, 8).toUpperCase()}`,
        patient_name: form.name.trim().replace(/\s+/g, ' ').slice(0, 80) || caseLabel(reservation.id),
        chief_complaint: form.complaint.trim().slice(0, 120),
        triage_level: TRIAGE[reservation.patient_urgency ?? 'critical'] ?? 'red',
        vitals: {
          gcs: gcs!,
          bp: form.bp.replace(/\s/g, ''),
          spo2: spo2!,
          heart_rate: hr!,
          resp_rate: rr!,
          ...(temp != null ? { temperature: temp } : {}),
          ...(glucose != null ? { blood_glucose: glucose } : {})
        },
        allergies: toList(form.allergies),
        medications_administered: toList(form.meds),
        procedures_performed: toList(form.procedures),
        paramedic_badge_id: crewName || 'Ambulance crew',
        ambulance_vehicle_id: form.vehicle.trim().toUpperCase() || 'AMBULANCE',
        destination_hospital_id: reservation.hospital_id,
        timestamp: serverIso()
      });
      bedLinkStore.sendPatientHandover(record);
      setOpen(false);
    } catch {
      setError('Could not seal the sheet. Try again.');
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    'w-full px-3 min-h-[44px] text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600';

  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 min-h-[48px] text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <HeartPulse className="w-4 h-4 text-red-600" />
          {sent ? 'Vitals sent to hospital' : 'Send vitals to hospital'}
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {sent && (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              Sealed{' '}
              {new Date(sent.timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">Patient name (if known)</span>
              <input
                value={form.name}
                onChange={set('name')}
                placeholder="Ramesh Patil"
                maxLength={80}
                autoComplete="off"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">What happened</span>
              <input value={form.complaint} onChange={set('complaint')} placeholder="Chest pain, sweating, 30 min" maxLength={120} className={inputClass} />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {VITAL_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">{f.label}</span>
                <input
                  value={form[f.key]}
                  onChange={set(f.key)}
                  placeholder={f.placeholder}
                  inputMode={f.numeric ? 'decimal' : 'text'}
                  className={inputClass}
                />
              </label>
            ))}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">Ambulance no.</span>
              <input value={form.vehicle} onChange={set('vehicle')} placeholder="MH-02-EMS-108" className={inputClass} />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">Allergies</span>
              <input value={form.allergies} onChange={set('allergies')} placeholder="Penicillin, none" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">Medicines given</span>
              <input value={form.meds} onChange={set('meds')} placeholder="Aspirin 325mg, O2 6L" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">Done in ambulance</span>
              <input value={form.procedures} onChange={set('procedures')} placeholder="ECG, IV line" className={inputClass} />
            </label>
          </div>

          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}

          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sealing…' : sent ? 'Send updated vitals' : 'Seal and send to hospital'}
          </button>
          <p className="text-xs text-slate-500">
            Sealed with a SHA-256 code made from the name and vitals, so the hospital can check nothing changed on the way.
          </p>
        </div>
      )}
    </section>
  );
}
