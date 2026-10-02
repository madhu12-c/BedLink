'use client';

import React from 'react';
import { Activity } from 'lucide-react';

interface LoadIndicatorProps {
  loadPercent: number;
  className?: string;
  showBar?: boolean;
}

export function LoadIndicator({
  loadPercent,
  className = '',
  showBar = false
}: LoadIndicatorProps) {
  const clampedLoad = Math.max(0, Math.min(100, Math.round(loadPercent)));

  let label: string;
  let statusBadgeClass: string;
  let barColor: string;

  if (clampedLoad < 70) {
    label = 'Normal';
    statusBadgeClass = 'bg-slate-100 text-slate-800 border-slate-200';
    barColor = 'bg-emerald-500';
  } else if (clampedLoad < 88) {
    label = 'High';
    statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-300';
    barColor = 'bg-amber-500';
  } else {
    label = 'Critical';
    statusBadgeClass = 'bg-red-50 text-red-800 border-red-300 font-semibold';
    barColor = 'bg-red-600';
  }

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border ${statusBadgeClass}`}
        role="status"
        aria-label={`Hospital load: ${clampedLoad} percent, Status: ${label}`}
      >
        <Activity className="w-3 h-3 opacity-75" aria-hidden="true" />
        <span className="font-mono font-medium">{clampedLoad}%</span>
        <span className="opacity-60">—</span>
        <span>{label}</span>
      </div>

      {showBar && (
        <div
          className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={clampedLoad}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${clampedLoad}%` }}
          />
        </div>
      )}
    </div>
  );
}
