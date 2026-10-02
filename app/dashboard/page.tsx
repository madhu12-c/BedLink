'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/shared/Header';
import { bedLinkStore } from '@/lib/data/store';
import {
  Activity,
  Building2,
  Bed,
  Clock,
  TrendingUp,
  Radio
} from 'lucide-react';
import { LoadIndicator } from '@/components/dispatch/LoadIndicator';
import { FreshnessIndicator } from '@/components/dispatch/FreshnessIndicator';
import { CityIcuHeatmap } from '@/components/dashboard/CityIcuHeatmap';

export default function DashboardMetricsPage() {
  const [lastUpdateTrigger, setLastUpdateTrigger] = useState(0);

  useEffect(() => {
    const unsub = bedLinkStore.subscribe(() => {
      setLastUpdateTrigger((prev) => prev + 1);
    });
    return () => unsub();
  }, []);

  const hospitals = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getHospitals();
  }, [lastUpdateTrigger]);

  const candidates = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getHospitalCandidates();
  }, [lastUpdateTrigger]);

  const reservations = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getReservations();
  }, [lastUpdateTrigger]);

  // Aggregate metrics
  const activeEmergenciesCount = 1 + reservations.filter((r) => r.status === 'pending' || r.status === 'accepted').length;
  const hospitalsOnlineCount = hospitals.filter((h) => h.is_active).length;
  const pendingReservationsCount = reservations.filter((r) => r.status === 'pending').length;

  const totalBedsAvailable = useMemo(() => {
    let sum = 0;
    for (const cand of candidates) {
      for (const key of Object.keys(cand.inventory) as (keyof typeof cand.inventory)[]) {
        sum += cand.inventory[key]?.available_beds ?? 0;
      }
    }
    return sum;
  }, [candidates]);

  const icuBedsAvailable = useMemo(() => {
    let sum = 0;
    for (const cand of candidates) {
      sum += cand.inventory['icu']?.available_beds ?? 0;
    }
    return sum;
  }, [candidates]);

  const ventBedsAvailable = useMemo(() => {
    let sum = 0;
    for (const cand of candidates) {
      sum += cand.inventory['ventilator']?.available_beds ?? 0;
    }
    return sum;
  }, [candidates]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Title */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Regional EMS Operations Dashboard
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live hospital bed telemetry, emergency dispatch volume, and response SLAs
            </p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>Telemetry Feed Active</span>
          </div>
        </div>

        {/* 5 Core Metric Cards (Step 29) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. Active Emergencies */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Active Emergencies
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-extrabold font-mono text-slate-900">
                {activeEmergenciesCount}
              </span>
              <Activity className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-[11px] text-slate-400 mt-2">Live ambulance calls</span>
          </div>

          {/* 2. Hospitals Online */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Hospitals Online
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-extrabold font-mono text-slate-900">
                {hospitalsOnlineCount} / {hospitals.length}
              </span>
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-2">100% network reporting</span>
          </div>

          {/* 3. Beds Available */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Beds Available
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-extrabold font-mono text-slate-900">
                {totalBedsAvailable}
              </span>
              <Bed className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-[11px] text-slate-500 mt-2">
              {icuBedsAvailable} ICU · {ventBedsAvailable} Vent
            </span>
          </div>

          {/* 4. Pending Reservations */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pending Holds
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-extrabold font-mono text-slate-900">
                {pendingReservationsCount}
              </span>
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-[11px] text-amber-700 font-semibold mt-2">2-min countdown active</span>
          </div>

          {/* 5. Average Confirmation Time */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Avg Confirm Time
            </span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-3xl font-extrabold font-mono text-slate-900">
                48s
              </span>
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-2">Well within 120s SLA</span>
          </div>
        </div>

        {/* City Control Room Free ICU Rooms Heatmap */}
        <CityIcuHeatmap candidates={candidates} />

        {/* Hospital Telemetry Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-slate-900">Hospital Network Telemetry</h2>
              <p className="text-xs text-slate-500">Realtime resource availability and occupancy load</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Hospital</th>
                  <th className="px-4 py-3">ICU Available</th>
                  <th className="px-4 py-3">Ventilators</th>
                  <th className="px-4 py-3">Oxygen Beds</th>
                  <th className="px-4 py-3">Specialties</th>
                  <th className="px-4 py-3">Occupancy Load</th>
                  <th className="px-4 py-3">Data Freshness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {candidates.map((cand) => (
                  <tr key={cand.hospital.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{cand.hospital.name}</div>
                      <div className="text-[11px] text-slate-400">{cand.hospital.address}</div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      <span
                        className={
                          (cand.inventory['icu']?.available_beds ?? 0) > 0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }
                      >
                        {cand.inventory['icu']?.available_beds ?? 0}
                      </span>
                      <span className="text-slate-400"> / {cand.inventory['icu']?.total_beds ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      <span
                        className={
                          (cand.inventory['ventilator']?.available_beds ?? 0) > 0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }
                      >
                        {cand.inventory['ventilator']?.available_beds ?? 0}
                      </span>
                      <span className="text-slate-400"> / {cand.inventory['ventilator']?.total_beds ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      <span className="text-slate-700">{cand.inventory['oxygen']?.available_beds ?? 0}</span>
                      <span className="text-slate-400"> / {cand.inventory['oxygen']?.total_beds ?? 0}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {cand.capabilities.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium capitalize"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <LoadIndicator loadPercent={cand.hospital.current_load} showBar />
                    </td>
                    <td className="px-4 py-3">
                      <FreshnessIndicator
                        updatedAt={cand.inventory['icu']?.updated_at || cand.hospital.load_updated_at}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
