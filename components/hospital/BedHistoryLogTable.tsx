'use client';

import React, { useState } from 'react';
import { BedHistoryLog, BedType, PatientHandoverRecord } from '@/lib/types';
import { bedLinkStore } from '@/lib/data/store';
import { PatientHandoverModal } from '@/components/handover/PatientHandoverModal';
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
  Check,
  ChevronDown,
  ChevronUp,
  Syringe,
  Pill,
  Activity,
  HeartPulse,
  AlertTriangle,
  FileText,
  Ambulance,
  ExternalLink
} from 'lucide-react';

interface BedHistoryLogTableProps {
  logs: BedHistoryLog[];
  hospitalName: string;
  onSelectHandover?: (handover: PatientHandoverRecord) => void;
}

export function BedHistoryLogTable({
  logs,
  hospitalName,
  onSelectHandover
}: BedHistoryLogTableProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'procedures' | 'medications'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [internalSelectedHandover, setInternalSelectedHandover] = useState<PatientHandoverRecord | null>(null);

  const handleCopyHash = (hash: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const toggleExpand = (logId: string) => {
    setExpandedLogId((prev) => (prev === logId ? null : logId));
  };

  const handleOpenDossier = (log: BedHistoryLog, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const handover = bedLinkStore.getPatientHandoverForLog(log);
    if (onSelectHandover) {
      onSelectHandover(handover);
    } else {
      setInternalSelectedHandover(handover);
    }
  };

  const filteredLogs = logs.filter((log) => {
    // Bed type filter
    if (filterType !== 'all' && log.bed_type !== filterType) {
      return false;
    }

    // Category filter: with procedures or medications
    if (filterCategory === 'procedures') {
      const hasProcs = log.procedures_performed && log.procedures_performed.length > 0;
      if (!hasProcs) return false;
    }
    if (filterCategory === 'medications') {
      const hasMeds = log.medications_administered && log.medications_administered.length > 0;
      if (!hasMeds) return false;
    }

    // Text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = log.patient_name?.toLowerCase().includes(q);
      const matchId = log.patient_id?.toLowerCase().includes(q);
      const matchBed = log.bed_identifier.toLowerCase().includes(q);
      const matchDiag = log.diagnosis?.toLowerCase().includes(q);
      const matchProcs = log.procedures_performed?.some((p) => p.toLowerCase().includes(q));
      const matchMeds = log.medications_administered?.some((m) => m.toLowerCase().includes(q));
      return Boolean(matchName || matchId || matchBed || matchDiag || matchProcs || matchMeds);
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
              Past admissions
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Past admissions and tamper-proof handover sheets for {hospitalName}
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Category Filter Pills */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`px-2.5 py-1 rounded-md transition-all ${filterCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory('procedures')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${filterCategory === 'procedures'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-purple-700 hover:bg-purple-50'
                }`}
            >
              <Syringe className="w-3 h-3" />
              <span>Procedures</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory('medications')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${filterCategory === 'medications'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-blue-700 hover:bg-blue-50'
                }`}
            >
              <Pill className="w-3 h-3" />
              <span>Medicines</span>
            </button>
          </div>

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
              placeholder="Search patient, diagnosis, medicine, procedure..."
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-slate-500 font-bold uppercase text-xs tracking-wider border-b border-slate-200">
              <th className="py-3 px-4">Bed Unit</th>
              <th className="py-3 px-4">Prior / Current Patient</th>
              <th className="py-3 px-4">Clinical Diagnosis</th>
              <th className="py-3 px-4">Procedures Done En-Route</th>
              <th className="py-3 px-4">Medicines Given En-Route</th>
              <th className="py-3 px-4">Admission Timeline</th>
              <th className="py-3 px-4">Handover sheet</th>
              <th className="py-3 px-4">Attending Clinician</th>
              <th className="py-3 px-4 text-center">Dossier</th>
              <th className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400">
                  No matching bed occupancy history found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isOccupied = log.status === 'occupied';
                const isCleaning = log.status === 'cleaning';
                const isExpanded = expandedLogId === log.id;
                const hasProcs = log.procedures_performed && log.procedures_performed.length > 0;
                const hasMeds = log.medications_administered && log.medications_administered.length > 0;

                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => toggleExpand(log.id)}
                      className={`hover:bg-slate-50/90 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/30' : ''
                        }`}
                    >
                      {/* Bed Unit */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 font-black flex items-center justify-center text-xs">
                            <Bed className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <strong className="text-slate-900 block font-bold whitespace-nowrap">
                              {log.bed_identifier}
                            </strong>
                            <span className="text-xs uppercase font-mono text-slate-400">
                              {log.bed_type}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Patient */}
                      <td className="py-3 px-4 min-w-[150px]">
                        {log.patient_name ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">
                                {log.patient_name}
                              </span>
                              {log.triage_level && (
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${log.triage_level === 'red'
                                      ? 'bg-red-500'
                                      : log.triage_level === 'yellow'
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                  title={`Triage: ${log.triage_level.toUpperCase()}`}
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs font-mono text-slate-500">
                              <span>{log.patient_id}</span>
                              {log.patient_age && (
                                <>
                                  <span>•</span>
                                  <span>{log.patient_age}y {log.patient_gender ? log.patient_gender[0] : ''}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No patient recorded</span>
                        )}
                      </td>

                      {/* Diagnosis */}
                      <td className="py-3 px-4 max-w-xs">
                        <span className="text-slate-700 line-clamp-2 text-xs leading-tight">
                          {log.diagnosis || 'Emergency Admission'}
                        </span>
                      </td>

                      {/* Procedures Done En-Route */}
                      <td className="py-3 px-4 max-w-[200px]">
                        {hasProcs ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-purple-700 font-bold text-xs">
                              <Syringe className="w-3 h-3 shrink-0" />
                              <span>{log.procedures_performed!.length} Done En-Route</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {log.procedures_performed!.slice(0, 2).map((proc, i) => (
                                <span
                                  key={i}
                                  className="text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200/80 px-1.5 py-0.5 rounded truncate max-w-[170px]"
                                  title={proc}
                                >
                                  {proc}
                                </span>
                              ))}
                              {log.procedures_performed!.length > 2 && (
                                <span className="text-xs font-bold bg-purple-100 text-purple-900 px-1 py-0.5 rounded">
                                  +{log.procedures_performed!.length - 2} more
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">None recorded</span>
                        )}
                      </td>

                      {/* Medicines Given En-Route */}
                      <td className="py-3 px-4 max-w-[200px]">
                        {hasMeds ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-blue-700 font-bold text-xs">
                              <Pill className="w-3 h-3 shrink-0" />
                              <span>{log.medications_administered!.length} Given On Way</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {log.medications_administered!.slice(0, 2).map((med, i) => (
                                <span
                                  key={i}
                                  className="text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200/80 px-1.5 py-0.5 rounded truncate max-w-[170px]"
                                  title={med}
                                >
                                  {med}
                                </span>
                              ))}
                              {log.medications_administered!.length > 2 && (
                                <span className="text-xs font-bold bg-blue-100 text-blue-900 px-1 py-0.5 rounded">
                                  +{log.medications_administered!.length - 2} more
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">None administered</span>
                        )}
                      </td>

                      {/* Timeline */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col text-xs">
                          <span className="text-slate-700 font-mono" suppressHydrationWarning>
                            In: {new Date(log.admitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-slate-400 font-mono text-xs" suppressHydrationWarning>
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
                              className="font-mono text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2 py-0.5 rounded cursor-pointer select-all"
                              title={log.handover_sha256}
                              onClick={(e) => handleCopyHash(log.handover_sha256!, e)}
                            >
                              {log.handover_sha256.slice(0, 8)}...{log.handover_sha256.slice(-6)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyHash(log.handover_sha256!, e)}
                              className="text-slate-400 hover:text-slate-700 p-0.5"
                              title="Copy tamper-proof code"
                            >
                              {copiedHash === log.handover_sha256 ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">No signature</span>
                        )}
                      </td>

                      {/* Attending Clinician */}
                      <td className="py-3 px-4 text-slate-600 max-w-[180px]">
                        <span className="font-semibold text-xs text-slate-800 line-clamp-1" title={log.actor_name}>
                          {log.actor_name}
                        </span>
                      </td>

                      {/* Dossier Action */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleOpenDossier(log, e)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-md border border-blue-200 transition-colors flex items-center gap-1 shadow-2xs"
                            title="Open full clinical handover dossier"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Dossier</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(log.id);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title={isExpanded ? 'Collapse' : 'Expand full details'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${isOccupied
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

                    {/* EXPANDABLE ROW DRAWER: TOTAL PATIENT DETAIL */}
                    {isExpanded && (
                      <tr className="bg-slate-50/80 border-b border-slate-200">
                        <td colSpan={10} className="p-4 sm:p-5">
                          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col gap-4">
                            {/* Drawer Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                                  <HeartPulse className="w-4 h-4" />
                                </span>
                                <div>
                                  <h4 className="font-black text-sm text-slate-900">
                                    Vitals and treatment before arrival
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                    Patient: <strong>{log.patient_name || 'Emergency Patient'}</strong> ({log.patient_id}) • Bed: <strong>{log.bed_identifier}</strong> ({log.bed_type.toUpperCase()})
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenDossier(log, e)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-all"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>View & Print Full Sealed Dossier</span>
                                </button>
                              </div>
                            </div>

                            {/* 4-Box Clinical Detail Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                              {/* 1. Procedures Performed */}
                              <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200 flex flex-col">
                                <div className="flex items-center justify-between text-purple-900 font-bold text-xs uppercase tracking-wider mb-2">
                                  <span className="flex items-center gap-1.5">
                                    <Syringe className="w-3.5 h-3.5 text-purple-600" />
                                    Procedures Done En-Route
                                  </span>
                                  <span className="text-xs bg-purple-200/80 px-1.5 py-0.5 rounded-full">
                                    {log.procedures_performed?.length || 0}
                                  </span>
                                </div>
                                {hasProcs ? (
                                  <ul className="space-y-1.5 text-xs text-purple-950 font-medium mt-1">
                                    {log.procedures_performed!.map((proc, i) => (
                                      <li key={i} className="flex items-start gap-1.5">
                                        <Check className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                                        <span>{proc}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-purple-700/60 italic mt-1">
                                    No surgical or invasive procedures performed en-route.
                                  </p>
                                )}
                              </div>

                              {/* 2. Medications Administered */}
                              <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200 flex flex-col">
                                <div className="flex items-center justify-between text-blue-900 font-bold text-xs uppercase tracking-wider mb-2">
                                  <span className="flex items-center gap-1.5">
                                    <Pill className="w-3.5 h-3.5 text-blue-600" />
                                    Medicines Given On The Way
                                  </span>
                                  <span className="text-xs bg-blue-200/80 px-1.5 py-0.5 rounded-full">
                                    {log.medications_administered?.length || 0}
                                  </span>
                                </div>
                                {hasMeds ? (
                                  <ul className="space-y-1.5 text-xs text-blue-950 font-medium mt-1">
                                    {log.medications_administered!.map((med, i) => (
                                      <li key={i} className="flex items-start gap-1.5">
                                        <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                                        <span>{med}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-blue-700/60 italic mt-1">
                                    No pharmacology administered in transit.
                                  </p>
                                )}
                              </div>

                              {/* 3. Vitals Telemetry */}
                              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col">
                                <span className="flex items-center gap-1.5 text-slate-700 font-bold text-xs uppercase tracking-wider mb-2">
                                  <Activity className="w-3.5 h-3.5 text-rose-600" />
                                  Vitals On Arrival
                                </span>
                                {log.vitals ? (
                                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold mt-1">
                                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                                      <span className="text-xs text-slate-400 block font-bold">GCS</span>
                                      <span className="text-slate-900 font-mono font-bold text-sm">
                                        {log.vitals.gcs} / 15
                                      </span>
                                    </div>
                                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                                      <span className="text-xs text-slate-400 block font-bold">BLOOD PRESSURE</span>
                                      <span className="text-slate-900 font-mono font-bold text-sm">
                                        {log.vitals.bp}
                                      </span>
                                    </div>
                                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                                      <span className="text-xs text-slate-400 block font-bold">SpO2 PULSE OX</span>
                                      <span
                                        className={`font-mono font-bold text-sm ${log.vitals.spo2 < 92 ? 'text-red-600' : 'text-emerald-700'
                                          }`}
                                      >
                                        {log.vitals.spo2}%
                                      </span>
                                    </div>
                                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                                      <span className="text-xs text-slate-400 block font-bold">HEART RATE</span>
                                      <span className="text-slate-900 font-mono font-bold text-sm">
                                        {log.vitals.heart_rate} bpm
                                      </span>
                                    </div>
                                    {log.vitals.blood_glucose && (
                                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                                        <span className="text-xs text-slate-400 block font-bold">GLUCOSE</span>
                                        <span className="text-slate-900 font-mono font-bold text-sm">
                                          {log.vitals.blood_glucose} mg/dL
                                        </span>
                                      </div>
                                    )}
                                    {log.vitals.temperature && (
                                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                                        <span className="text-xs text-slate-400 block font-bold">TEMP</span>
                                        <span className="text-slate-900 font-mono font-bold text-sm">
                                          {log.vitals.temperature}°F
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400 italic mt-1">
                                    Vitals logged in paper charts.
                                  </p>
                                )}
                              </div>

                              {/* 4. Custody & Allergies */}
                              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
                                <div>
                                  <span className="flex items-center gap-1.5 text-slate-700 font-bold text-xs uppercase tracking-wider mb-2">
                                    <Ambulance className="w-3.5 h-3.5 text-indigo-600" />
                                    Paramedic & Custody
                                  </span>
                                  <div className="space-y-1.5 text-xs text-slate-700 font-medium">
                                    <div>
                                      <span className="text-slate-400 text-xs block font-bold uppercase">Paramedic Officer:</span>
                                      <strong className="font-mono text-slate-900">{log.paramedic_badge_id || 'EMS Officer'}</strong>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 text-xs block font-bold uppercase">Ambulance Unit:</span>
                                      <strong className="font-mono text-slate-900">{log.ambulance_vehicle_id || '108 Ambulance'}</strong>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 text-xs block font-bold uppercase">Known Allergies:</span>
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                        {log.allergies && log.allergies.length > 0 ? (
                                          log.allergies.map((a, i) => (
                                            <span key={i} className="text-xs font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                              {a}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-xs text-slate-500">NKDA</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {log.handover_sha256 && (
                                  <div className="mt-3 pt-2 border-t border-slate-200/80">
                                    <div className="flex items-center gap-1 text-xs text-emerald-700 font-bold">
                                      <ShieldCheck className="w-3.5 h-3.5" />
                                      <span>Tamper-proof</span>
                                    </div>
                                    <span className="text-xs font-mono text-slate-400 block truncate mt-0.5">
                                      {log.handover_sha256}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Internal Modal Fallback if not controlled by parent */}
      {internalSelectedHandover && (
        <PatientHandoverModal
          handover={internalSelectedHandover}
          onClose={() => setInternalSelectedHandover(null)}
        />
      )}
    </div>
  );
}
