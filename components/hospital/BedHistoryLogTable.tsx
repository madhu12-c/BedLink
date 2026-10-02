'use client';

import React, { useState } from 'react';
import { BedHistoryLog, BedType } from '@/lib/types';
import {
  History,
  Search,
  Filter,
  ShieldCheck,
  Bed,
  User,
  Clock,
  Sparkles,
  Copy,
  Check
} from 'lucide-react';

interface BedHistoryLogTableProps {
  logs: BedHistoryLog[];
  hospitalName: string;
}

export function BedHistoryLogTable({
  logs,
  hospitalName
}: BedHistoryLogTableProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const filteredLogs = logs.filter((log) => {
    if (filterType !== 'all' && log.bed_type !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = log.patient_name?.toLowerCase().includes(q);
      const matchId = log.patient_id?.toLowerCase().includes(q);
      const matchBed = log.bed_identifier.toLowerCase().includes(q);
      const matchDiag = log.diagnosis?.toLowerCase().includes(q);
      return matchName || matchId || matchBed || matchDiag;
    }
    return true;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Table Header & Search Filter */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
              <History className="w-4 h-4" />
            </div>
            <h3 className="font-black text-sm text-slate-900">
              Patient Bed Occupancy & Handover Audit Trail
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Historical patient occupancy, admission records, and SHA-256 legal chain of custody for {hospitalName}
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bed Type Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="all">All Bed Types ({logs.length})</option>
              <option value="icu">ICU Beds</option>
              <option value="ventilator">Ventilator Beds</option>
              <option value="emergency">Emergency Resus</option>
              <option value="oxygen">Oxygen Beds</option>
              <option value="general">General Ward</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient or bed..."
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <th className="py-3 px-4">Bed Unit</th>
              <th className="py-3 px-4">Prior / Current Patient</th>
              <th className="py-3 px-4">Clinical Diagnosis</th>
              <th className="py-3 px-4">Admission Timeline</th>
              <th className="py-3 px-4">Handover SHA-256</th>
              <th className="py-3 px-4">Attending Clinician</th>
              <th className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No matching bed occupancy history found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isOccupied = log.status === 'occupied';
                const isCleaning = log.status === 'cleaning';

                return (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Bed Unit */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 font-black flex items-center justify-center text-[10px]">
                          <Bed className="w-3.5 h-3.5" />
                        </span>
                        <div>
                          <strong className="text-slate-900 block font-bold">
                            {log.bed_identifier}
                          </strong>
                          <span className="text-[10px] uppercase font-mono text-slate-400">
                            {log.bed_type}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Patient */}
                    <td className="py-3 px-4">
                      {log.patient_name ? (
                        <div>
                          <span className="font-bold text-slate-900 block">
                            {log.patient_name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {log.patient_id}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No patient recorded</span>
                      )}
                    </td>

                    {/* Diagnosis */}
                    <td className="py-3 px-4 max-w-xs">
                      <span className="text-slate-700 line-clamp-2">
                        {log.diagnosis || 'Emergency Admission'}
                      </span>
                    </td>

                    {/* Timeline */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-col text-[11px]">
                        <span className="text-slate-700 font-mono">
                          In: {new Date(log.admitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {log.discharged_at
                            ? `Out: ${new Date(log.discharged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Currently In Bed'}
                        </span>
                      </div>
                    </td>

                    {/* SHA-256 Hash */}
                    <td className="py-3 px-4">
                      {log.handover_sha256 ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-0.5 rounded cursor-pointer select-all"
                            title={log.handover_sha256}
                            onClick={() => handleCopyHash(log.handover_sha256!)}
                          >
                            {log.handover_sha256.slice(0, 8)}...{log.handover_sha256.slice(-6)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyHash(log.handover_sha256!)}
                            className="text-slate-400 hover:text-slate-700"
                            title="Copy SHA-256"
                          >
                            {copiedHash === log.handover_sha256 ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">No signature</span>
                      )}
                    </td>

                    {/* Attending Clinician */}
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      <span className="font-semibold text-xs text-slate-800">
                        {log.actor_name}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isOccupied
                            ? 'bg-blue-100 text-blue-800'
                            : isCleaning
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
