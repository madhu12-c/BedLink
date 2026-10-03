'use client';

import React from 'react';
import {
  AlertCircle,
  MapPin,
  Crosshair,
  Flame,
  HeartPulse,
  Brain,
  Baby,
  Stethoscope,
  Sparkles
} from 'lucide-react';
import { BedType, Specialty, Urgency } from '@/lib/types';

export interface DispatchFormParams {
  latitude: number;
  longitude: number;
  address: string;
  urgency: Urgency;
  bedType: BedType;
  requiresVentilator: boolean;
  specialty: string;
  notes: string;
  /** Patient can't pay: prefer government (free) and charity hospitals */
  needsFreeCare?: boolean;
}

interface PatientNeedFormProps {
  formData: DispatchFormParams;
  onChange: (data: DispatchFormParams) => void;
  onUseCurrentLocation: () => void;
  /** Demo only (admin): fills in the critical cardiac scenario. Hidden when not given. */
  onQuickLoadCriticalScenario?: () => void;
  className?: string;
}

const BED_TYPES: { type: BedType; label: string; desc: string }[] = [
  { type: 'icu', label: 'ICU', desc: 'Intensive Care Unit' },
  { type: 'ventilator', label: 'Ventilator', desc: 'Mechanical Ventilation' },
  { type: 'oxygen', label: 'Oxygen', desc: 'High-flow O₂ Support' },
  { type: 'cardiac', label: 'Cardiac', desc: 'CCU / Coronary Care' },
  { type: 'burns', label: 'Burns', desc: 'Burns Unit Bed' },
  { type: 'emergency', label: 'Emergency', desc: 'Immediate Resus' },
  { type: 'general', label: 'General', desc: 'Standard Inpatient' }
];

const SPECIALTIES: { id: Specialty | 'none'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'none', label: 'None (General)', icon: Stethoscope },
  { id: 'cardiac', label: 'Cardiac Care', icon: HeartPulse },
  { id: 'burns', label: 'Burns Unit', icon: Flame },
  { id: 'trauma', label: 'Trauma Surgery', icon: AlertCircle },
  { id: 'neuro', label: 'Neurology', icon: Brain },
  { id: 'pediatric', label: 'Pediatrics', icon: Baby }
];

export function PatientNeedForm({
  formData,
  onChange,
  onUseCurrentLocation,
  onQuickLoadCriticalScenario,
  className = ''
}: PatientNeedFormProps) {
  const updateField = <K extends keyof DispatchFormParams>(field: K, value: DispatchFormParams[K]) => {
    onChange({ ...formData, [field]: value });
  };

  const isCritical = formData.urgency === 'critical';

  return (
    <section
      className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col gap-4 ${className}`}
      aria-label="Patient Emergency Requirements"
    >
      {/* Quick Demo Scenario Trigger */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900">Patient details</h2>
          <p className="text-xs text-slate-500">What the patient needs. No names.</p>
        </div>
        {onQuickLoadCriticalScenario && (
        <button
          type="button"
          onClick={onQuickLoadCriticalScenario}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
          title="Pre-fills Step 28 Demo Scenario (Critical Cardiac Patient needing ICU + Ventilator)"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Demo Scenario</span>
        </button>
        )}
      </div>

      {/* Critical Patient Banner (Step 28 / DESIGN.md) */}
      {isCritical && (
        <div
          className="bg-red-50 border-l-4 border-red-600 p-3 rounded text-red-950 flex items-start gap-2.5"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold uppercase tracking-wider block text-red-900 text-xs">
              Critical patient
            </span>
            <span>
              Looking for{' '}
              <strong className="font-semibold text-red-900">{formData.bedType.toUpperCase()}</strong>
              {formData.requiresVentilator ? ' with a ventilator' : ''}
              {formData.specialty !== 'none' ? ` and ${formData.specialty} care` : ''}.
            </span>
          </div>
        </div>
      )}

      {/* Patient Location */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <img src="/icons/ambulance-top.svg" alt="Ambulance" className="w-5 h-2.5 object-contain" />
            <span>Pickup location</span>
          </span>
          <button
            type="button"
            onClick={onUseCurrentLocation}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 normal-case tracking-normal"
          >
            <Crosshair className="w-3 h-3" />
            <span>Use my location</span>
          </button>
        </label>
        <div className="relative">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={formData.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="e.g. Near Kandivali station, Mumbai"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          <span>Lat: {formData.latitude.toFixed(4)}</span>
          <span>Lng: {formData.longitude.toFixed(4)}</span>
        </div>
      </div>

      {/* Urgency Selection */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-bold text-slate-700 uppercase tracking-wider">How urgent</legend>
        <div className="grid grid-cols-3 gap-2">
          {(['critical', 'urgent', 'normal'] as Urgency[]).map((level) => {
            const isSelected = formData.urgency === level;
            const colorMap = {
              critical: isSelected
                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:border-red-300',
              urgent: isSelected
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300',
              normal: isSelected
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
            };

            return (
              <button
                key={level}
                type="button"
                onClick={() => updateField('urgency', level)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold capitalize border transition-all duration-150 min-h-[44px] flex items-center justify-center ${colorMap[level]}`}
                aria-pressed={isSelected}
              >
                {level}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Required Bed Type */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-bold text-slate-700 uppercase tracking-wider">Bed needed</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BED_TYPES.map((b) => {
            const isSelected = formData.bedType === b.type;
            return (
              <button
                key={b.type}
                type="button"
                onClick={() => updateField('bedType', b.type)}
                className={`p-2.5 rounded-lg border text-left transition-all duration-150 min-h-[44px] ${
                  isSelected
                    ? 'bg-blue-50 border-blue-600 text-blue-950 font-semibold ring-1 ring-blue-600'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
                aria-pressed={isSelected}
              >
                <div className="text-xs font-bold">{b.label}</div>
                <div className="text-xs text-slate-500 truncate">{b.desc}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Add-on: Ventilator Support Checkbox */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-slate-900 block">Needs a ventilator</span>
          <span className="text-xs text-slate-500">Only hospitals with a free ventilator count as a full match</span>
        </div>
        <input
          type="checkbox"
          id="requiresVentilator"
          checked={formData.requiresVentilator}
          onChange={(e) => updateField('requiresVentilator', e.target.checked)}
          className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
        />
      </div>

      {/* Patient can't pay: govt hospitals are free, charity hospitals keep 10% of beds free */}
      <label
        htmlFor="needsFreeCare"
        className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between gap-3 cursor-pointer"
      >
        <span title="Govt hospitals (free) and charity hospitals (10% of beds free for poor patients) come first">
          <span className="text-sm font-bold text-slate-900 block">Patient can&apos;t pay</span>
          <span className="flex flex-wrap gap-1 mt-0.5 text-xs font-semibold">
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">🏛️ Govt: free</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">🤝 Charity: 10% free</span>
          </span>
        </span>
        <input
          type="checkbox"
          id="needsFreeCare"
          checked={Boolean(formData.needsFreeCare)}
          onChange={(e) => updateField('needsFreeCare', e.target.checked)}
          className="w-5 h-5 shrink-0 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
        />
      </label>

      {/* Specialty Requirement */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Specialty needed</label>
        <select
          value={formData.specialty}
          onChange={(e) => updateField('specialty', e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 min-h-[44px]"
        >
          {SPECIALTIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Optional Dispatch Notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Notes for the hospital (no names)</label>
        <textarea
          rows={2}
          value={formData.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="e.g. Chest pain, sweating, BP falling"
          className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-none"
        />
      </div>
    </section>
  );
}
