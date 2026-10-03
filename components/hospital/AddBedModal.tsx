'use client';

import React, { useState } from 'react';
import { BedType } from '@/lib/types';
import { Bed, Plus, X, Check, Building2 } from 'lucide-react';

interface AddBedModalProps {
  hospitalName: string;
  onClose: () => void;
  onAddBeds: (bedType: BedType, totalCount: number, availableCount: number, wardName: string) => void;
}

export function AddBedModal({
  hospitalName,
  onClose,
  onAddBeds
}: AddBedModalProps) {
  const [bedType, setBedType] = useState<BedType>('icu');
  const [totalCount, setTotalCount] = useState<number>(2);
  const [availableCount, setAvailableCount] = useState<number>(2);
  const [wardName, setWardName] = useState<string>('Wing-B Critical Care Unit');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalCount <= 0) return;
    onAddBeds(bedType, totalCount, Math.min(availableCount, totalCount), wardName);
    onClose();
  };

  const bedTypeOptions: { type: BedType; label: string; desc: string }[] = [
    { type: 'icu', label: 'Intensive Care Unit (ICU)', desc: '1:1 nursing, full invasive monitoring' },
    { type: 'ventilator', label: 'Invasive Ventilator', desc: 'Mechanical ventilation life support' },
    { type: 'oxygen', label: 'High-Flow Oxygen Bed', desc: 'Central O2 manifold pipe delivery' },
    { type: 'cardiac', label: 'Cardiac Care Bed (CCU)', desc: 'Coronary care, cath-lab ready' },
    { type: 'burns', label: 'Burns Unit Bed', desc: 'Dedicated burns care' },
    { type: 'emergency', label: 'Emergency Resuscitation Bay', desc: 'Level 1 trauma triage bay' },
    { type: 'general', label: 'General / Step-Down Ward', desc: 'Post-acute step down monitoring' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold tracking-widest text-indigo-400 bg-indigo-950/80 border border-indigo-800 px-2 py-0.5 rounded">
                Hospital Operations Operator
              </span>
              <h2 className="text-lg font-black text-white mt-1">Authorize & Add Hospital Beds</h2>
              <p className="text-xs text-slate-400">{hospitalName} • Capacity Expansion Registry</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Bed Type Selection */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Select Bed Classification
            </label>
            <div className="space-y-2">
              {bedTypeOptions.map((opt) => (
                <label
                  key={opt.type}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${bedType === opt.type
                      ? 'bg-blue-50/80 border-blue-500 ring-1 ring-blue-500'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="bedType"
                      value={opt.type}
                      checked={bedType === opt.type}
                      onChange={() => setBedType(opt.type)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-xs font-black text-slate-900 block">
                        {opt.label}
                      </span>
                      <span className="text-xs text-slate-500 block">
                        {opt.desc}
                      </span>
                    </div>
                  </div>
                  <Bed className="w-4 h-4 text-slate-400" />
                </label>
              ))}
            </div>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Total Beds to Add:
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={totalCount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTotalCount(val);
                  if (availableCount > val) setAvailableCount(val);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Currently Available:
              </label>
              <input
                type="number"
                min="0"
                max={totalCount}
                value={availableCount}
                onChange={(e) => setAvailableCount(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Ward / Location Name */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Ward / Department Section:
            </label>
            <input
              type="text"
              value={wardName}
              onChange={(e) => setWardName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 2nd Floor ICU Annex"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Confirm & Activate Beds</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
