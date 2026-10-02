'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/shared/Header';
import { bedLinkStore } from '@/lib/data/store';
import { UserRole, Reservation } from '@/lib/types';
import {
  History,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Activity,
  BedDouble,
  UserCheck
} from 'lucide-react';

export default function HistoryAuditPage() {
  const [role, setRole] = useState<UserRole>('admin');
  const [activeTab, setActiveTab] = useState<'audit' | 'reservations' | 'admissions'>('audit');
  const [lastUpdateTrigger, setLastUpdateTrigger] = useState(0);

  useEffect(() => {
    const unsub = bedLinkStore.subscribe(() => {
      setLastUpdateTrigger((prev) => prev + 1);
    });
    return () => unsub();
  }, []);

  const reservations = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getReservations();
  }, [lastUpdateTrigger]);

  const auditEvents = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getReservationEvents();
  }, [lastUpdateTrigger]);

  const bedHistoryLogs = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getBedHistoryLogs();
  }, [lastUpdateTrigger]);

  const getStatusBadge = (status: Reservation['status']) => {
    switch (status) {
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Accepted & Held
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Rejected (Auto-routed)
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Timed Out (2m)
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            Pending Response
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header currentRole={role} onRoleChange={(r) => setRole(r)} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Emergency Coordination Audit & History
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Cryptographically timestamped audit trail of reservations, hospital responses, and automatic fallbacks
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center bg-slate-200 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                activeTab === 'audit'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Realtime Audit Log ({auditEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reservations')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                activeTab === 'reservations'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reservations ({reservations.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('admissions')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                activeTab === 'admissions'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Patient Admissions ({bedHistoryLogs.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Detailed Audit Log */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200">
              <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Authoritative Event Journal</span>
              </h2>
              <p className="text-xs text-slate-500">
                Immutable chronological log of all atomic bed hold, response, and fallback operations
              </p>
            </div>

            {auditEvents.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <span>No audit events recorded yet. Trigger a hold on the dispatch screen to initiate.</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 font-mono text-xs">
                {auditEvents.map((evt) => (
                  <div key={evt.id} className="p-4 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          evt.event_type === 'reservation_accepted'
                            ? 'bg-emerald-100 text-emerald-800'
                            : evt.event_type === 'reservation_rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : evt.event_type === 'fallback_triggered'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 uppercase">
                            {evt.event_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[11px] text-slate-400 font-normal">
                            by {evt.actor_name || 'System Engine'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1 font-sans">
                          {JSON.stringify(evt.metadata)}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 sm:text-right shrink-0">
                      {new Date(evt.created_at).toLocaleTimeString()}
                      <span className="block text-[10px] text-slate-400">
                        {new Date(evt.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Reservations Summary */}
        {activeTab === 'reservations' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200">
              <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Emergency Reservation Records</span>
              </h2>
            </div>

            {reservations.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <span>No reservation records yet.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Reservation ID</th>
                      <th className="px-4 py-3">Hospital</th>
                      <th className="px-4 py-3">Bed Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Requested At</th>
                      <th className="px-4 py-3">Responded At</th>
                      <th className="px-4 py-3">Notes / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {reservations.map((res) => (
                      <tr key={res.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500">{res.id.slice(0, 10)}...</td>
                        <td className="px-4 py-3 font-sans font-semibold text-slate-900">
                          {res.hospital_name || res.hospital_id}
                        </td>
                        <td className="px-4 py-3 uppercase text-blue-700 font-bold">
                          {res.bed_type}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(res.status)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(res.requested_at).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {res.responded_at ? new Date(res.responded_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-4 py-3 font-sans text-slate-500">
                          {res.rejection_reason || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Patient Admissions & Diagnosis (Supabase Synchronized) */}
        {activeTab === 'admissions' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-purple-600" />
                  <span>Bed History & Patient Diagnosis Audit</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cross-device clinical admission records with diagnosis and cryptographic SHA-256 handover seals
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Supabase Feed
              </span>
            </div>

            {bedHistoryLogs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                <BedDouble className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <span>No patient admissions recorded yet. Admit a patient from the Hospital Nurse portal.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Patient Name / ID</th>
                      <th className="px-4 py-3">Diagnosis / Complaint</th>
                      <th className="px-4 py-3">Assigned Bed</th>
                      <th className="px-4 py-3">Bed Type</th>
                      <th className="px-4 py-3">Hospital</th>
                      <th className="px-4 py-3">Admitted At</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Attending Staff</th>
                      <th className="px-4 py-3">Handover SHA-256</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-sans">
                    {bedHistoryLogs.map((log) => {
                      const hosp = bedLinkStore.getHospital(log.hospital_id);
                      return (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            <div>{log.patient_name || 'Emergency Patient'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{log.patient_id || 'ID Pending'}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium max-w-xs truncate" title={log.diagnosis || ''}>
                            {log.diagnosis || 'Clinical evaluation pending'}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-indigo-700">
                            {log.bed_identifier}
                          </td>
                          <td className="px-4 py-3">
                            <span className="uppercase text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {log.bed_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {hosp?.name || log.hospital_id}
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                            {new Date(log.admitted_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              log.status === 'occupied'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-[11px]">
                            {log.actor_name}
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-emerald-700">
                            {log.handover_sha256 ? (
                              <span title={`SHA-256 Verified: ${log.handover_sha256}`} className="inline-flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                {log.handover_sha256.slice(0, 10)}...
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
