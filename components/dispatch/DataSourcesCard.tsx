'use client';

import React from 'react';
import { Database } from 'lucide-react';
import { DIRECTORY_HOSPITALS } from '@/lib/data/directoryHospitals';

const SOURCES: { title: string; text: string }[] = [
  {
    title: 'Hospitals',
    text: 'Government hospital directory (data.gov.in National Hospital Directory, Esri India Living Atlas): 30,000+ hospitals in India with map points. Mumbai: 31 government hospitals, listed below and shown as grey pins on the map.'
  },
  {
    title: 'Free treatment',
    text: 'PM-JAY (hospitals.pmjay.gov.in) and Maharashtra MJPJAY lists: the "Patient can\'t pay" filter.'
  },
  {
    title: 'Live free beds',
    text: 'No public source has live ICU beds for private hospitals (BMC\'s new dashboard covers civic hospitals only). The ward nurse updates in 10 seconds, on the app or Telegram; every count shows its age.'
  },
  {
    title: 'Ambulances',
    text: '108 in Maharashtra = MEMS (Sumeet SSG BVG): 1,756 ambulances from Nov 2025, 255 advanced life support, 1,274 basic. Private: RED.Health 5,000+ in 550+ cities, Dial 1298 (Ziqitza) about 50 in Mumbai. Any fleet logs in the same way.'
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
      <ul className="flex flex-col gap-2">
        {SOURCES.map((s) => (
          <li key={s.title} className="text-xs text-slate-600 leading-snug">
            <strong className="text-slate-900">{s.title}: </strong>
            {s.text}
          </li>
        ))}
      </ul>
      <details className="group rounded-lg border border-slate-200 bg-slate-50">
        <summary className="list-none cursor-pointer select-none px-3 min-h-[40px] flex items-center justify-between text-xs font-bold text-slate-800">
          {DIRECTORY_HOSPITALS.length} Mumbai government hospitals ({inBedLink} already in BedLink)
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
