'use client';

import React from 'react';
import { BedInventory, BedType, Hospital } from '@/lib/types';
import { BedTypeCard } from './BedTypeCard';
import { ShieldCheck, HeartPulse, Flame, Activity } from 'lucide-react';

interface BedUpdateGridProps {
  hospital: Hospital;
  bedInventory: BedInventory[];
  capabilities: string[];
  onUpdateCount: (bedType: BedType, delta: number) => Promise<void>;
  onUpdateTotalBeds?: (bedType: BedType, delta: number) => Promise<void>;
  disabled?: boolean;
}

export function BedUpdateGrid({
  hospital,
  bedInventory,
  capabilities,
  onUpdateCount,
  onUpdateTotalBeds,
  disabled = false
}: BedUpdateGridProps) {
  // Ordered per spec: ICU, Ventilator, Oxygen, Cardiac, Burns, then Emergency, General
  const order: BedType[] = ['icu', 'ventilator', 'oxygen', 'cardiac', 'burns', 'emergency', 'general'];
  const sortedInventory = [...bedInventory].sort(
    (a, b) => order.indexOf(a.bed_type) - order.indexOf(b.bed_type)
  );

  const hasCardiac = capabilities.some((c) => c.toLowerCase() === 'cardiac');
  const hasBurns = capabilities.some((c) => c.toLowerCase() === 'burns');

  return (
    <div className="flex flex-col gap-6">
      {/* Capability & Specialty Badges Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Verified Hospital Specialties
          </span>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                hasCardiac
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5" />
              Cardiac Specialty {hasCardiac ? 'Active' : 'N/A'}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                hasBurns
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              Burns Unit {hasBurns ? 'Active' : 'N/A'}
            </span>

            {capabilities
              .filter((c) => !['cardiac', 'burns'].includes(c.toLowerCase()))
              .map((cap) => (
                <span
                  key={cap}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 capitalize"
                >
                  <ShieldCheck className="w-3 h-3" />
                  {cap}
                </span>
              ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
          <Activity className="w-4 h-4 text-blue-600" />
          <span>Occupancy Load: </span>
          <strong className="font-mono text-slate-900">{hospital.current_load}%</strong>
        </div>
      </div>

      {/* Grid of Bed Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 items-stretch">
        {sortedInventory.map((item) => (
          <BedTypeCard
            key={item.id}
            inventory={item}
            onUpdateCount={onUpdateCount}
            onUpdateTotalBeds={onUpdateTotalBeds}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
