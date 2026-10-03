'use client';

import React from 'react';
import { Ambulance, Building2, Database, HeartHandshake, Stethoscope } from 'lucide-react';
import { DIRECTORY_HOSPITALS } from '@/lib/data/directoryHospitals';
import { AMBULANCE_FLEETS, TOTAL_FLEET_AMBULANCES } from '@/lib/data/ambulanceFleets';

/** Four tiles: a big number, two words, and where it comes from on hover / in the details. */
const TILES = [
  {
    icon: Building2,
    value: '30,000+',
    label: 'hospitals',
    source: 'Govt hospital directory',
    detail: 'data.gov.in National Hospital Directory and Esri India Living Atlas, with map points.',
    tone: 'text-violet-700 bg-violet-50 border-violet-200'
  },
  {
    icon: HeartHandshake,
    value: 'Free',
    label: 'care filter',
    source: 'PM-JAY · MJPJAY',
    detail: 'Govt and charity hospitals from the PM-JAY and Maharashtra MJPJAY lists: the "Patient can\'t pay" filter.',
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200'
  },
  {
    icon: Stethoscope,
    value: '10 s',
    label: 'live bed update',
    source: 'Ward nurses',
    detail: 'No public source has live ICU beds for private hospitals (BMC covers civic only). Nurses update on the app or Telegram; every count shows its age.',
    tone: 'text-blue-700 bg-blue-50 border-blue-200'
  },
  {
    icon: Ambulance,
    value: `${(Math.floor(TOTAL_FLEET_AMBULANCES / 100) * 100).toLocaleString('en-IN')}+`,
    label: 'ambulances',
    source: AMBULANCE_FLEETS.map((f) => f.name).join(' · '),
    detail: 'Target fleets; each crew is one login or one Telegram link, nothing to install.',
    tone: 'text-red-700 bg-red-50 border-red-200'
  }
];

export function DataSourcesCard() {
  const inBedLink = DIRECTORY_HOSPITALS.filter((h) => h.inBedLink).length;
  return (
    <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col gap-2.5">
      <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
        <Database className="w-4 h-4 text-blue-600" />
        Where our data comes from
      </span>

      <div className="grid grid-cols-2 gap-2">
        {TILES.map(({ icon: Icon, value, label, source, detail, tone }) => (
          <div key={label} className={`rounded-lg border p-2.5 flex flex-col gap-0.5 ${tone}`} title={detail}>
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span className="text-xl font-black leading-none mt-1">{value}</span>
            <span className="text-xs font-bold text-slate-800">{label}</span>
            <span className="text-[11px] font-medium text-slate-500 leading-tight">{source}</span>
          </div>
        ))}
      </div>

      {/* The fleets, one row each */}
      <div className="flex flex-col gap-1">
        {AMBULANCE_FLEETS.map((f) => (
          <div key={f.id} className="flex items-center gap-2 text-xs" title={f.detail}>
            <span
              className={`px-1.5 py-0.5 rounded font-extrabold border ${
                f.kind === 'government' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-indigo-50 text-indigo-800 border-indigo-200'
              }`}
            >
              {f.name}
            </span>
            <span className="font-mono font-bold text-slate-900">
              {f.ambulances.toLocaleString('en-IN')}
              {f.id === 'redhealth' ? '+' : ''}
            </span>
            <span className="text-slate-500 truncate">{f.kind === 'government' ? 'govt' : 'private'} · {f.coverage}</span>
          </div>
        ))}
      </div>

      <details className="group rounded-lg border border-slate-200 bg-slate-50">
        <summary className="list-none cursor-pointer select-none px-3 min-h-[40px] flex items-center justify-between text-xs font-bold text-slate-800">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[3px] bg-violet-600 inline-block" aria-hidden="true" />
            {DIRECTORY_HOSPITALS.length} Mumbai govt hospitals · {inBedLink} live on BedLink
          </span>
          <span className="text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <ul className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
          {DIRECTORY_HOSPITALS.map((h) => (
            <li key={`${h.name}-${h.area}`} className="text-xs text-slate-700 flex items-start gap-1">
              <span className={h.inBedLink ? 'text-emerald-600 font-bold' : 'text-slate-300'} aria-hidden="true">
                {h.inBedLink ? '✓' : '•'}
              </span>
              <span>
                {h.name}, <span className="text-slate-500">{h.area}</span>
                {h.inBedLink && <span className="sr-only"> (in BedLink)</span>}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
