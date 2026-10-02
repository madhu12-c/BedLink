'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/shared/Header';
import { BedUpdateGrid } from '@/components/hospital/BedUpdateGrid';
import { IncomingReservationAlert } from '@/components/hospital/IncomingReservationAlert';
import { AmbulanceArrivalCountdown } from '@/components/hospital/AmbulanceArrivalCountdown';
import { AddBedModal } from '@/components/hospital/AddBedModal';
import { BedHistoryLogTable } from '@/components/hospital/BedHistoryLogTable';
import { bedLinkStore } from '@/lib/data/store';
import { BedType, Reservation, UserRole } from '@/lib/types';
import {
  Sparkles,
  Bell,
  Plus,
  Bed,
  ShieldCheck,
  HeartPulse,
  Building2,
  Lock,
  Layers,
  ArrowRight
} from 'lucide-react';

export default function HospitalNursePage() {
  const [role, setRole] = useState<UserRole>('nurse');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' // Aditi Hospital (Thakur Complex, 90 Feet Rd)
  );

  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastUpdateTrigger, setLastUpdateTrigger] = useState(0);
  const [showAddBedModal, setShowAddBedModal] = useState(false);

  // Subscribe to realtime store events
  useEffect(() => {
    const unsubscribe = bedLinkStore.subscribe((event) => {
      setLastUpdateTrigger((prev) => prev + 1);

      if (event.type === 'reservation_created') {
        const payload = event.payload as { reservation: Reservation };
        if (payload.reservation.hospital_id === selectedHospitalId) {
          setActiveReservation(payload.reservation);
          setToastMessage(`🚨 INCOMING EMERGENCY HOLD REQUEST! 2-minute decision timer started.`);
        }
      } else if (event.type === 'reservation_accepted') {
        const payload = event.payload as { reservation: Reservation };
        if (payload.reservation.hospital_id === selectedHospitalId) {
          setActiveReservation(payload.reservation);
          setToastMessage(`✓ Bed secured. Ambulance notified.`);
        }
      } else if (event.type === 'reservation_rejected') {
        const payload = event.payload as { reservation: Reservation };
        if (payload.reservation.hospital_id === selectedHospitalId) {
          setActiveReservation(payload.reservation);
        }
      } else if (event.type === 'reservation_expired') {
        const payload = event.payload as { reservation: Reservation };
        if (payload.reservation.hospital_id === selectedHospitalId) {
          setActiveReservation(payload.reservation);
          setToastMessage(`Reservation expired. Resource unheld.`);
        }
      } else if (event.type === 'fallback_triggered') {
        const payload = event.payload as { newReservation: Reservation };
        if (payload.newReservation?.hospital_id === selectedHospitalId) {
          setActiveReservation(payload.newReservation);
          setToastMessage(`🚨 INCOMING FALLBACK EMERGENCY: Patient re-routed to your facility!`);
        }
      }
    });

    return () => unsubscribe();
  }, [selectedHospitalId]);

  // Read current hospital data
  const hospitals = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getHospitals();
  }, [lastUpdateTrigger]);

  const currentHospital = hospitals.find((h) => h.id === selectedHospitalId) || hospitals[0];

  const bedInventories = useMemo(() => {
    void lastUpdateTrigger;
    return currentHospital ? bedLinkStore.getBedInventories(currentHospital.id) : [];
  }, [currentHospital, lastUpdateTrigger]);

  const capabilities = useMemo(() => {
    void lastUpdateTrigger;
    return currentHospital ? bedLinkStore.getHospitalCapabilities(currentHospital.id) : [];
  }, [currentHospital, lastUpdateTrigger]);

  // Derive active pending reservation from store
  const displayReservation = useMemo(() => {
    void lastUpdateTrigger;
    if (activeReservation && activeReservation.hospital_id === selectedHospitalId) {
      return activeReservation;
    }
    const list = bedLinkStore.getReservations(selectedHospitalId);
    return list.find((r) => r.status === 'pending') || null;
  }, [activeReservation, selectedHospitalId, lastUpdateTrigger]);

  const incomingAmbulances = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getIncomingAmbulances(selectedHospitalId);
  }, [selectedHospitalId, lastUpdateTrigger]);

  const bedHistoryLogs = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getBedHistoryLogs(selectedHospitalId);
  }, [selectedHospitalId, lastUpdateTrigger]);

  // Handlers
  const handleAddBeds = (type: BedType, totalCount: number, availableCount: number, wardName: string) => {
    bedLinkStore.addNewBedTypeOrUnits(
      selectedHospitalId,
      type,
      totalCount,
      availableCount,
      `Nurse Coordinator (${currentHospital?.name})`
    );
    setToastMessage(`✓ Added ${totalCount} ${type.toUpperCase()} bed(s) in ${wardName}!`);
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleAdmitPatient = (reservationId: string, bedType: string, patientName: string) => {
    // 1. Mark reservation accepted/completed
    bedLinkStore.respondReservationAtomic(
      reservationId,
      'accept',
      'nurse-active',
      `Staff Nurse (${currentHospital?.name})`
    );

    // 2. Fetch signed handover vitals record
    const handover = bedLinkStore.getPatientHandover(reservationId, selectedHospitalId);

    // 3. Log to Bed History with legal SHA-256 seal
    bedLinkStore.addBedHistoryLog({
      id: `bhl-${Date.now()}`,
      hospital_id: selectedHospitalId,
      bed_type: bedType as BedType,
      bed_identifier: `${bedType.toUpperCase()}-Bay-${Math.floor(Math.random() * 8) + 1}`,
      patient_id: handover.patient_id,
      patient_name: patientName,
      diagnosis: handover.chief_complaint,
      admitted_at: new Date().toISOString(),
      discharged_at: undefined,
      status: 'occupied',
      handover_sha256: handover.sha256_hash,
      actor_name: `Staff Nurse (${currentHospital?.name})`
    });

    setToastMessage(`✓ Patient ${patientName} admitted to ${bedType.toUpperCase()}! SHA-256 clinical seal archived.`);
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleUpdateCount = async (bedType: BedType, delta: number) => {
    if (!currentHospital) return;
    bedLinkStore.updateBedCount(
      currentHospital.id,
      bedType,
      delta,
      'nurse-active',
      `Nurse on duty (${currentHospital.name})`
    );
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleAcceptReservation = async (reservationId: string) => {
    bedLinkStore.respondReservationAtomic(
      reservationId,
      'accept',
      'nurse-active',
      `Staff Nurse (${currentHospital?.name})`
    );
    setToastMessage('Reservation accepted! Ambulance is en route.');
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleRejectReservation = async (reservationId: string, reason?: string) => {
    bedLinkStore.respondReservationAtomic(
      reservationId,
      'reject',
      'nurse-active',
      `Staff Nurse (${currentHospital?.name})`,
      reason
    );
    setToastMessage('Reservation rejected. Bed released & re-routed to next facility.');
    setLastUpdateTrigger((prev) => prev + 1);
  };

  // Helper to trigger simulated incoming emergency for testing nurse screen
  const handleSimulateIncomingEmergency = () => {
    if (!currentHospital) return;
    try {
      const res = bedLinkStore.holdBedAtomic(
        `sim-${Date.now()}`,
        currentHospital.id,
        'icu',
        'sim-paramedic',
        'Medic #12'
      );
      setActiveReservation(res);
      setToastMessage('Simulated incoming critical emergency triggered!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cannot simulate';
      setToastMessage(msg);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header
        currentRole={role}
        selectedHospitalId={selectedHospitalId}
        onRoleChange={(newRole, hospId) => {
          setRole(newRole);
          if (hospId) setSelectedHospitalId(hospId);
        }}
      />

      {/* Toast Alert */}
      {toastMessage && (
        <div
          className="bg-slate-900 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-md"
          role="status"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <Bell className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white text-xs px-2"
          >
            ✕
          </button>
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Operator Role Switcher Bar */}
        <div className="bg-slate-200/80 p-1.5 rounded-2xl border border-slate-300 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={() => setRole('nurse')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                role === 'nurse'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <HeartPulse className="w-4 h-4" />
              <span>Ward Floor Nurse (Triage & Bedside)</span>
            </button>
            <button
              type="button"
              onClick={() => setRole('coordinator')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                role === 'coordinator' || role === 'admin'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Bed Operations Coordinator (Capacity Operator)</span>
            </button>
          </div>

          <div className="text-right px-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Active Operator Mode:
            </span>
            <span className="text-xs font-black text-slate-800">
              {role === 'nurse' ? '👩‍⚕️ Clinical Ward Nurse' : '🏢 Bed Operations Operator'}
            </span>
          </div>
        </div>

        {/* Hospital Selector & Header */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  role === 'nurse'
                    ? 'text-blue-700 bg-blue-50'
                    : 'text-indigo-700 bg-indigo-50 border border-indigo-200'
                }`}
              >
                {role === 'nurse' ? 'Floor Nurse Desk' : 'Bed Capacity Operations'}
              </span>
              <span className="text-xs text-slate-400">
                {role === 'nurse' ? '10-Sec Rapid Triage' : 'Ward Infrastructure Control'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {currentHospital?.name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">{currentHospital?.address}</p>
          </div>

          {/* Hospital Switcher & Role Actions */}
          <div className="flex flex-wrap items-end gap-2.5 sm:justify-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="hospital-select" className="text-xs font-semibold text-slate-500">
                Operating Hospital:
              </label>
              <select
                id="hospital-select"
                aria-label="Operating Hospital Selector"
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[44px]"
              >
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} (Load: {h.current_load}%)
                  </option>
                ))}
              </select>
            </div>

            {/* ONLY Show 'Add Beds' button for Bed Operations Coordinator Operator! */}
            {(role === 'coordinator' || role === 'admin') && (
              <button
                type="button"
                onClick={() => setShowAddBedModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-md flex items-center gap-1.5 min-h-[44px] transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>+ Authorize & Add Beds</span>
              </button>
            )}
          </div>
        </div>

        {/* =========================================================================
            VIEW 1: FLOOR NURSE PORTAL (Bedside & Emergency Hold Decisions)
           ========================================================================= */}
        {role === 'nurse' && (
          <div className="space-y-6">
            {/* Live Incoming Ambulance ETA Countdown */}
            <AmbulanceArrivalCountdown
              incoming={incomingAmbulances}
              onAdmitPatient={handleAdmitPatient}
            />

            {/* Realtime Incoming Emergency Alert Modal / Card */}
            {displayReservation && (
              <IncomingReservationAlert
                reservation={displayReservation}
                currentInventory={bedInventories.find((b) => b.bed_type === displayReservation.bed_type)}
                onAccept={handleAcceptReservation}
                onReject={handleRejectReservation}
              />
            )}

            {/* Bedside Rapid Bed Count Update Grid */}
            {currentHospital && (
              <BedUpdateGrid
                hospital={currentHospital}
                bedInventory={bedInventories}
                capabilities={capabilities}
                onUpdateCount={handleUpdateCount}
              />
            )}

            {/* Nurse Guidance Banner */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong>Floor Nurse Mode Active:</strong> Bed additions and ward expansions are managed by the Hospital Bed Operations Coordinator.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRole('coordinator')}
                className="text-blue-700 hover:text-blue-900 font-bold underline inline-flex items-center gap-1 shrink-0"
              >
                <span>Switch to Coordinator Mode</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 2: BED OPERATIONS COORDINATOR (Capacity Operator & Audit Logs)
           ========================================================================= */}
        {(role === 'coordinator' || role === 'admin') && (
          <div className="space-y-6">
            {/* Coordinator KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Total Hospital Capacity
                </span>
                <span className="text-2xl font-black font-mono text-slate-900 mt-1 block">
                  {currentHospital?.emergency_capacity || 0} Beds
                </span>
                <span className="text-[11px] text-indigo-600 font-semibold mt-1 block">
                  Admin Authorized
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Currently Free Beds
                </span>
                <span className="text-2xl font-black font-mono text-emerald-600 mt-1 block">
                  {bedInventories.reduce((sum, b) => sum + b.available_beds, 0)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Across all units
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Critical Care Reserve
                </span>
                <span className="text-2xl font-black font-mono text-blue-600 mt-1 block">
                  {(bedInventories.find((b) => b.bed_type === 'icu')?.available_beds || 0) +
                    (bedInventories.find((b) => b.bed_type === 'ventilator')?.available_beds || 0)}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  ICU + Ventilator Free
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Facility Load Factor
                </span>
                <span className="text-2xl font-black font-mono text-amber-600 mt-1 block">
                  {currentHospital?.current_load}%
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Active Emergency Load
                </span>
              </div>
            </div>

            {/* Capacity Update Grid */}
            {currentHospital && (
              <BedUpdateGrid
                hospital={currentHospital}
                bedInventory={bedInventories}
                capabilities={capabilities}
                onUpdateCount={handleUpdateCount}
              />
            )}

            {/* Patient Bed Occupancy History & Handover Audit Trail ("who was there earlier") */}
            <BedHistoryLogTable
              logs={bedHistoryLogs}
              hospitalName={currentHospital?.name || 'Hospital'}
            />
          </div>
        )}

        {/* Demo Helper Action */}
        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            <strong className="text-slate-800 font-semibold block">Need to test incoming emergency alert & countdown?</strong>
            <span>Click below to simulate a live ambulance reservation request with signed SHA-256 handover vitals.</span>
          </div>
          <button
            type="button"
            onClick={handleSimulateIncomingEmergency}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 min-h-[44px]"
          >
            <Sparkles className="w-4 h-4" />
            <span>Simulate Incoming Emergency</span>
          </button>
        </div>
      </main>

      {/* Add Bed Modal (Authorized Operator Only) */}
      {showAddBedModal && currentHospital && (
        <AddBedModal
          hospitalName={currentHospital.name}
          onClose={() => setShowAddBedModal(false)}
          onAddBeds={handleAddBeds}
        />
      )}
    </div>
  );
}
