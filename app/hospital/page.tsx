'use client';

import React, { useEffect, useEffectEvent, useState, useMemo } from 'react';
import { Header } from '@/components/shared/Header';
import { VoiceSettingsBar } from '@/components/voice/VoiceSettingsBar';
import { useVoiceAvailability, useVoicePlayer, useVoiceSettings } from '@/lib/voice/hooks';
import { hospitalAllottedPhrase, hospitalIncomingPhrase } from '@/lib/voice/phrases';
import { BedUpdateGrid } from '@/components/hospital/BedUpdateGrid';
import { ConfirmCountsCard } from '@/components/hospital/ConfirmCountsCard';
import { IncomingReservationAlert } from '@/components/hospital/IncomingReservationAlert';
import { QuickMessages } from '@/components/shared/QuickMessages';
import { AmbulanceArrivalCountdown } from '@/components/hospital/AmbulanceArrivalCountdown';
import { AddBedModal } from '@/components/hospital/AddBedModal';
import { BedHistoryLogTable } from '@/components/hospital/BedHistoryLogTable';
import { bedLinkStore } from '@/lib/data/store';
import { BedType, EdStatus, Reservation, PatientHandoverRecord } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { persistBedHistoryLog, persistPatientHandover, persistReservationStatus, persistBedInventoryUpsert } from '@/lib/supabase/sync';
import { executeAutoBedAssignment, BedNeedEvaluation } from '@/lib/utils/bedAutoAssign';
import { BedAutoAssignedModal } from '@/components/hospital/BedAutoAssignedModal';
import { PatientHandoverModal } from '@/components/handover/PatientHandoverModal';
import { playEmergencyAlertSound, triggerEmergencyNotification } from '@/lib/utils/audioAlert';
import {
  Sparkles,
  Bell,
  Plus,
  HeartPulse,
  Building2,
  Lock,
  AlertTriangle,
  Ambulance
} from 'lucide-react';

type HospitalView = 'nurse' | 'coordinator';

export default function HospitalNursePage() {
  const { user, role, lockedHospitalId, demoMode } = useAuth();
  // Nurses and coordinators only ever see their own hospital; admins can pick any.
  const isHospitalStaff = role === 'nurse' || role === 'coordinator';
  const [adminHospitalId, setAdminHospitalId] = useState<string>(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' // Aditi Hospital (Thakur Complex, 90 Feet Rd)
  );
  const [adminView, setAdminView] = useState<HospitalView>('coordinator');
  const selectedHospitalId = isHospitalStaff ? lockedHospitalId ?? '' : adminHospitalId;
  // Nurse: bed counts only. Coordinator: accept/reject, arrivals, capacity. Admin: either.
  const view: HospitalView = role === 'nurse' ? 'nurse' : role === 'coordinator' ? 'coordinator' : adminView;

  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastUpdateTrigger, setLastUpdateTrigger] = useState(0);
  const [showAddBedModal, setShowAddBedModal] = useState(false);

  // Controls whether the AmbulanceArrivalCountdown is visible.
  // It stays hidden while the IncomingReservationAlert is on screen so the
  // upper card only slides in after the lower emergency alert has dismissed.
  const [alertDismissed, setAlertDismissed] = useState(true);

  const [autoAssignResult, setAutoAssignResult] = useState<(BedNeedEvaluation & {
    logId: string;
    admittedAt: string;
    handover: PatientHandoverRecord;
    patientName: string;
  }) | null>(null);
  const [selectedHandoverForModal, setSelectedHandoverForModal] = useState<PatientHandoverRecord | null>(null);

  // Voice assistant (Sarvam): read new ambulance requests aloud for busy ER staff
  const voiceAvailability = useVoiceAvailability();
  const voicePlayer = useVoicePlayer();
  const [voiceSettings, updateVoiceSettings] = useVoiceSettings('bedlink.voice.hospital', {
    announce: true,
    language: 'hi-IN'
  });

  // New request for this hospital → read it aloud; accepted → confirm the bed is allotted.
  const announceIncomingRequest = useEffectEvent((event: { type: string; payload: unknown }) => {
    if (event.type !== 'reservation_created' && event.type !== 'reservation_accepted') return;
    if (voiceAvailability !== 'ready' || !voiceSettings.announce) return;
    const reservation = (event.payload as { reservation?: Reservation } | null)?.reservation;
    if (!reservation || reservation.hospital_id !== selectedHospitalId) return;
    // Only the coordinator decides on requests; everyone on the ward hears when a bed is allotted.
    if (event.type === 'reservation_created' && view !== 'coordinator') return;
    const language = voiceSettings.language === 'auto' ? 'en-IN' : voiceSettings.language;
    if (event.type === 'reservation_accepted') {
      voicePlayer.speak(hospitalAllottedPhrase({ bedType: reservation.bed_type }, language));
    } else if (reservation.status === 'pending') {
      voicePlayer.speak(
        hospitalIncomingPhrase({ bedType: reservation.bed_type, urgency: reservation.patient_urgency ?? null }, language)
      );
    }
  });

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Subscribe to realtime store events
  useEffect(() => {
    const unsubscribe = bedLinkStore.subscribe((event) => {
      setLastUpdateTrigger((prev) => prev + 1);
      announceIncomingRequest(event);

      if (event.type === 'reservation_created') {
        const payload = event.payload as { reservation: Reservation };
        // Staff only hear about their own hospital; admins jump to whichever hospital got the request.
        if (isHospitalStaff && payload.reservation.hospital_id !== selectedHospitalId) return;
        if (!isHospitalStaff) setAdminHospitalId(payload.reservation.hospital_id);
        const hospName =
          bedLinkStore.getHospital(payload.reservation.hospital_id)?.name ||
          payload.reservation.hospital_name ||
          'Hospital';
        const bed = payload.reservation.bed_type.toUpperCase();

        // New emergency → hide the countdown card until this alert is dismissed
        setAlertDismissed(false);
        setActiveReservation(payload.reservation);
        playEmergencyAlertSound();
        if (view === 'coordinator') {
          triggerEmergencyNotification('🚨 INCOMING EMERGENCY BED HOLD!', {
            body: `Hospital: ${hospName}
Bed Type: ${bed}
2-minute decision timer started.`
          });
          setToastMessage(`🚨 INCOMING EMERGENCY HOLD at ${hospName}! 2-minute decision timer started.`);
        } else {
          // Ward nurse: heads-up only; the coordinator accepts or rejects.
          triggerEmergencyNotification('🚑 Incoming ambulance request', {
            body: `${bed} bed requested at ${hospName}. The coordinator is deciding.`
          });
          setToastMessage(`🚑 Incoming ambulance request: ${bed} bed. The coordinator is deciding; get the bed ready.`);
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
      } else if (
        event.type === 'reservation_cancelled' ||
        event.type === 'reservation_updated' ||
        event.type === 'reservation_conflict' ||
        event.type === 'reservation_bed_lost' ||
        event.type === 'reservation_released'
      ) {
        // Ambulance withdrew the hold (or the demo was reset): drop the request card
        const payload = event.payload as { reservation: Reservation };
        if (payload.reservation?.hospital_id === selectedHospitalId) {
          setActiveReservation(payload.reservation);
          if (payload.reservation.status === 'cancelled') {
            setToastMessage('The ambulance cancelled its request. The bed is free again.');
          }
        }
      } else if (event.type === 'fallback_triggered') {
        const payload = event.payload as { newReservation: Reservation };
        const fallbackHospitalId = payload.newReservation?.hospital_id;
        if (!fallbackHospitalId) return;
        if (isHospitalStaff && fallbackHospitalId !== selectedHospitalId) return;
        if (!isHospitalStaff) setAdminHospitalId(fallbackHospitalId);
        playEmergencyAlertSound();
        setActiveReservation(payload.newReservation);
        setToastMessage(
          view === 'coordinator'
            ? `🚨 INCOMING FALLBACK EMERGENCY: Patient re-routed to your facility!`
            : `🚑 Patient re-routed to your hospital. The coordinator is deciding; get the bed ready.`
        );
      }
    });

    return () => unsubscribe();
  }, [selectedHospitalId, view, isHospitalStaff]);

  // Read current hospital data
  const hospitals = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getHospitals();
  }, [lastUpdateTrigger]);

  const currentHospital = isHospitalStaff
    ? hospitals.find((h) => h.id === selectedHospitalId)
    : hospitals.find((h) => h.id === selectedHospitalId) || hospitals[0];

  // Audit entries name the real signed-in person; demo mode keeps the old generic labels.
  const actorId = demoMode || !user ? 'nurse-active' : user.id;
  const actorName = (fallback: string) =>
    demoMode || !user || !role ? `${fallback} (${currentHospital?.name})` : `${user.name} (${ROLE_LABELS[role]}, ${currentHospital?.name})`;

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
    if (
      activeReservation &&
      activeReservation.hospital_id === selectedHospitalId &&
      ['pending', 'accepted', 'rejected', 'expired'].includes(activeReservation.status)
    ) {
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
      actorName('Bed Coordinator')
    );
    // Persist to Supabase so the new bed survives page refreshes and Vercel cold-starts
    const updatedInv = bedLinkStore.getBedInventories(selectedHospitalId).find((b) => b.bed_type === type);
    if (updatedInv) {
      persistBedInventoryUpsert({
        id: updatedInv.id,
        hospital_id: updatedInv.hospital_id,
        bed_type: updatedInv.bed_type,
        total_beds: updatedInv.total_beds,
        available_beds: updatedInv.available_beds,
        updated_by: null,
      });
    }
    setToastMessage(`✓ Added ${totalCount} ${type.toUpperCase()} bed(s) in ${wardName}!`);
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleAdmitPatient = (reservationId: string, bedType: string, patientName: string) => {
    const admittedBy = actorName('Bed Coordinator');

    // 1. Perform intelligent Auto Bed Assignment based on Patient Clinical Need
    const assignment = executeAutoBedAssignment(
      selectedHospitalId,
      reservationId,
      bedType as BedType,
      patientName,
      admittedBy
    );

    // 2. Mark reservation status as 'completed'
    const updatedRes = bedLinkStore.updateReservationStatus(reservationId, 'completed', actorId, admittedBy);

    // 3. Log to Bed History with legal SHA-256 seal (local)
    bedLinkStore.addBedHistoryLog({
      id: assignment.logId,
      hospital_id: selectedHospitalId,
      bed_type: assignment.assignedBedType,
      bed_identifier: assignment.bedIdentifier,
      patient_id: assignment.handover.patient_id,
      patient_name: patientName,
      patient_age: assignment.handover.patient_age,
      patient_gender: assignment.handover.patient_gender,
      diagnosis: `${assignment.handover.chief_complaint} [Auto Need: ${assignment.needReason}]`,
      admitted_at: assignment.admittedAt,
      discharged_at: undefined,
      status: 'occupied',
      handover_sha256: assignment.handover.sha256_hash,
      actor_name: admittedBy,
      vitals: assignment.handover.vitals,
      allergies: assignment.handover.allergies,
      medications_administered: assignment.handover.medications_administered,
      procedures_performed: assignment.handover.procedures_performed,
      paramedic_badge_id: assignment.handover.paramedic_badge_id,
      ambulance_vehicle_id: assignment.handover.ambulance_vehicle_id,
      triage_level: assignment.handover.triage_level
    });

    // 4. Persist to Supabase → cross-device visibility
    persistBedHistoryLog({
      id: assignment.logId,
      hospital_id: selectedHospitalId,
      bed_type: assignment.assignedBedType,
      bed_identifier: assignment.bedIdentifier,
      patient_id: assignment.handover.patient_id,
      patient_name: patientName,
      diagnosis: `${assignment.handover.chief_complaint} [Auto Need: ${assignment.needReason}]`,
      admitted_at: assignment.admittedAt,
      status: 'occupied',
      handover_sha256: assignment.handover.sha256_hash,
      actor_name: admittedBy,
    });

    // 5. Persist SHA-256 sealed handover to Supabase
    persistPatientHandover({
      reservation_id: reservationId,
      patient_id: assignment.handover.patient_id,
      patient_name: assignment.handover.patient_name,
      patient_age: assignment.handover.patient_age,
      patient_gender: assignment.handover.patient_gender,
      chief_complaint: assignment.handover.chief_complaint,
      triage_level: assignment.handover.triage_level,
      vitals: assignment.handover.vitals as unknown as Record<string, unknown>,
      allergies: assignment.handover.allergies,
      medications_administered: assignment.handover.medications_administered,
      paramedic_badge_id: assignment.handover.paramedic_badge_id,
      ambulance_vehicle_id: assignment.handover.ambulance_vehicle_id,
      destination_hospital_id: selectedHospitalId,
      sha256_hash: assignment.handover.sha256_hash,
    });

    // 6. Persist reservation completion status to Supabase
    if (updatedRes) {
      persistReservationStatus(updatedRes);
    }

    // 7. Trigger UI modal confirmation & toast notification
    setAutoAssignResult({
      ...assignment,
      patientName
    });

    setToastMessage(
      `✓ Auto-assigned ${patientName} to Bed ${assignment.bedIdentifier} (${assignment.assignedBedType.toUpperCase()}) based on clinical need!`
    );
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleUpdateCount = async (bedType: BedType, delta: number) => {
    if (!currentHospital) return;
    bedLinkStore.updateBedCount(
      currentHospital.id,
      bedType,
      delta,
      actorId,
      actorName(view === 'nurse' ? 'Nurse on duty' : 'Bed Coordinator')
    );
    setLastUpdateTrigger((prev) => prev + 1);
  };

  // Oldest bed count at this hospital: what "Confirm" brings back to "just now"
  const oldestCountAt = bedInventories.reduce<string | null>(
    (oldest, b) => (!oldest || Date.parse(b.updated_at) < Date.parse(oldest) ? b.updated_at : oldest),
    null
  );

  // Ambulance arrived but the bed was gone: reliability drops and dispatch re-routes the patient
  const handleBedLost = (reservationId: string) => {
    try {
      bedLinkStore.markBedLost(reservationId, actorId, actorName('Bed Coordinator'));
      setToastMessage('Marked "bed lost on arrival". Dispatch is re-routing the patient to the next hospital.');
    } catch (err: unknown) {
      setToastMessage(err instanceof Error ? err.message : 'Could not mark the bed as lost.');
    }
    setLastUpdateTrigger((prev) => prev + 1);
  };

  // Open / Busy / Diversion (coordinator): on diversion, dispatch stops sending ambulances here
  const handleEdStatus = (status: EdStatus) => {
    if (!currentHospital) return;
    try {
      bedLinkStore.setEdStatus(currentHospital.id, status);
      setToastMessage(
        status === 'diversion'
          ? 'On diversion: dispatch will not send ambulances here until you set Open.'
          : status === 'busy'
            ? 'Marked busy: dispatch will prefer other hospitals.'
            : 'Open: taking ambulances.'
      );
    } catch (err: unknown) {
      setToastMessage(err instanceof Error ? err.message : 'Could not change the status.');
    }
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleConfirmCounts = () => {
    if (!currentHospital) return;
    try {
      bedLinkStore.confirmCountsUnchanged(
        currentHospital.id,
        actorId,
        actorName(view === 'nurse' ? 'Nurse on duty' : 'Bed Coordinator')
      );
      setToastMessage('✓ Counts confirmed. Dispatch now sees them as up to date.');
    } catch (err: unknown) {
      setToastMessage(err instanceof Error ? err.message : 'Could not confirm the counts.');
    }
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleUpdateTotalBeds = async (bedType: BedType, delta: number) => {
    if (!currentHospital) return;
    bedLinkStore.updateTotalBeds(
      currentHospital.id,
      bedType,
      delta,
      actorId,
      actorName('Bed Coordinator')
    );
    setLastUpdateTrigger((prev) => prev + 1);
  };

  // Store errors (request not synced to this device yet, already answered, past the 2 minutes)
  // become a message for the coordinator instead of crashing the screen.
  const respondErrorMessage = (err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not respond to this request.';
    return msg === 'Reservation not found'
      ? 'This request has not reached this screen yet. Wait a second and try again, or refresh the page.'
      : msg;
  };

  const handleAcceptReservation = async (reservationId: string) => {
    try {
      bedLinkStore.respondReservationAtomic(reservationId, 'accept', actorId, actorName('Bed Coordinator'));
      setToastMessage('Reservation accepted! Ambulance is en route.');
    } catch (err: unknown) {
      setToastMessage(respondErrorMessage(err));
    }
    setLastUpdateTrigger((prev) => prev + 1);
  };

  const handleRejectReservation = async (reservationId: string, reason?: string) => {
    try {
      bedLinkStore.respondReservationAtomic(
        reservationId,
        'reject',
        actorId,
        actorName('Bed Coordinator'),
        reason
      );
      setToastMessage('Reservation rejected. Bed released & re-routed to next facility.');
    } catch (err: unknown) {
      setToastMessage(respondErrorMessage(err));
    }
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
      <Header />

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

      <main className="flex-1 max-w-5xl xl:max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Admin only: preview either hospital screen. Staff get the screen for their role. */}
        {!isHospitalStaff && (
          <div className="bg-slate-200/80 p-1.5 rounded-2xl border border-slate-300 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm" role="group" aria-label="Screen to preview">
              <button
                type="button"
                onClick={() => setAdminView('nurse')}
                aria-pressed={view === 'nurse'}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all min-h-[44px] ${
                  view === 'nurse'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <HeartPulse className="w-4 h-4" />
                <span>Ward Nurse screen</span>
              </button>
              <button
                type="button"
                onClick={() => setAdminView('coordinator')}
                aria-pressed={view === 'coordinator'}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all min-h-[44px] ${
                  view === 'coordinator'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Hospital Coordinator screen</span>
              </button>
            </div>

            <div className="text-right px-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Admin preview
              </span>
              <span className="text-xs font-black text-slate-800">
                {view === 'nurse' ? 'What ward nurses see' : 'What hospital coordinators see'}
              </span>
            </div>
          </div>
        )}

        {/* Voice alerts: new ambulance requests are read aloud in the chosen language */}
        <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700">Voice alerts for new requests and allotted beds</span>
          <VoiceSettingsBar
            availability={voiceAvailability}
            settings={voiceSettings}
            onChange={updateVoiceSettings}
            playerStatus={voicePlayer.status}
            playerError={voicePlayer.error}
            onUnlock={voicePlayer.unlock}
            label="Voice alerts"
          />
        </div>

        {/* Staff account with no (or an unknown) hospital: show nothing rather than another hospital's data */}
        {isHospitalStaff && !currentHospital && (
          <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-900 flex items-start gap-3" role="alert">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>
              Your account is not linked to a hospital yet, so there is nothing to show. Ask the BedLink admin to set
              your hospital, then sign in again.
            </span>
          </div>
        )}

        {currentHospital && (
        <>
        {/* Hospital Header (admins can switch hospital; staff are fixed to their own) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  view === 'nurse'
                    ? 'text-blue-700 bg-blue-50'
                    : 'text-indigo-700 bg-indigo-50 border border-indigo-200'
                }`}
              >
                {view === 'nurse' ? 'Floor Nurse Desk' : 'Bed Capacity Operations'}
              </span>
              <span className="text-xs text-slate-400">
                {view === 'nurse' ? '10-Sec Rapid Triage' : 'Ward Infrastructure Control'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {currentHospital.name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">{currentHospital.address}</p>

            {/* Emergency department status: coordinator switches it, everyone sees it */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">ED status</span>
              {view === 'coordinator' ? (
                <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden" role="group" aria-label="Emergency department status">
                  {(['open', 'busy', 'diversion'] as const).map((status) => {
                    const active = (currentHospital.ed_status ?? 'open') === status;
                    const color =
                      status === 'open'
                        ? 'bg-emerald-600 text-white'
                        : status === 'busy'
                          ? 'bg-amber-500 text-white'
                          : 'bg-red-600 text-white';
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={active}
                        onClick={() => handleEdStatus(status)}
                        className={`px-4 min-h-[48px] text-sm font-extrabold capitalize ${
                          active ? color : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span
                  className={`text-xs font-extrabold capitalize px-2.5 py-1 rounded-full ${
                    (currentHospital.ed_status ?? 'open') === 'open'
                      ? 'bg-emerald-100 text-emerald-800'
                      : currentHospital.ed_status === 'busy'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                  }`}
                >
                  {currentHospital.ed_status ?? 'open'}
                </span>
              )}
              <span className="text-[11px] text-slate-500">
                Reliability <strong className="text-slate-700">{currentHospital.reliability ?? 100}/100</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2.5 sm:justify-end">
            {!isHospitalStaff && (
              <div className="flex flex-col gap-1">
                <label htmlFor="hospital-select" className="text-xs font-semibold text-slate-500">
                  Operating Hospital:
                </label>
                <select
                  id="hospital-select"
                  value={currentHospital.id}
                  onChange={(e) => setAdminHospitalId(e.target.value)}
                  className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[44px]"
                >
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} (Load: {h.current_load}%)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Only the hospital coordinator (or admin) adds beds */}
            {view === 'coordinator' && (
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
            VIEW 1: WARD NURSE (bed counts; sees requests but no accept/reject)
           ========================================================================= */}
        {view === 'nurse' && (
          <div className="space-y-6">
            {/* Messages from the crew also show on the ward screen */}
            {displayReservation && (displayReservation.status === 'pending' || displayReservation.status === 'accepted') && (
              <QuickMessages
                key={`nurse-${displayReservation.id}`}
                reservationId={displayReservation.id}
                from="hospital"
                author={currentHospital.name}
              />
            )}

            {/* Incoming request heads-up (read-only: the coordinator accepts or rejects) */}
            {displayReservation &&
              (displayReservation.status === 'pending' || displayReservation.status === 'accepted') && (
                <div
                  role="status"
                  className={`p-4 rounded-2xl border-2 flex items-start gap-3 ${
                    displayReservation.status === 'pending'
                      ? 'bg-red-50 border-red-300 text-red-900'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  }`}
                >
                  <Ambulance className="w-6 h-6 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-sm font-black">
                      {displayReservation.status === 'pending'
                        ? 'Incoming ambulance request'
                        : 'Bed allotted: patient on the way'}
                    </strong>
                    <span className="text-xs font-semibold">
                      {displayReservation.bed_type.toUpperCase()} bed
                      {displayReservation.patient_urgency ? ` · ${displayReservation.patient_urgency}` : ''}
                      {displayReservation.eta_minutes ? ` · ETA ${displayReservation.eta_minutes} min` : ''}
                    </span>
                    <span className="text-xs">
                      {displayReservation.status === 'pending'
                        ? 'The hospital coordinator is deciding (2-minute timer). Get the bed ready in case it is accepted.'
                        : 'Accepted by the coordinator. Prepare the bed to receive the patient.'}
                    </span>
                  </div>
                </div>
              )}

            {/* Nothing changed? One tap keeps this hospital fresh for dispatch */}
            <ConfirmCountsCard oldestUpdatedAt={oldestCountAt} onConfirm={handleConfirmCounts} />

            {/* Bedside Rapid Bed Count Update Grid */}
            <BedUpdateGrid
              hospital={currentHospital}
              bedInventory={bedInventories}
              capabilities={capabilities}
              onUpdateCount={handleUpdateCount}
            />

            {/* Patient Bed Occupancy History & Handover Audit Trail with total patient details */}
            <BedHistoryLogTable
              logs={bedHistoryLogs}
              hospitalName={currentHospital?.name || 'Hospital'}
              onSelectHandover={(handover) => setSelectedHandoverForModal(handover)}
            />

            {/* Nurse Guidance Banner */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-xs text-blue-900">
              <Lock className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                <strong>Ward Nurse screen:</strong> rapid bed updates and real-time patient audit trail with en-route procedures and administered medications. Ambulance requests, arrivals and authorized allocations are coordinated with the desk.
              </span>
            </div>
          </div>
        )}


        {/* =========================================================================
            VIEW 2: HOSPITAL COORDINATOR (accept/reject, arrivals, capacity & audit)
           ========================================================================= */}
        {view === 'coordinator' && (
          <div className="space-y-6">
            {/* Realtime Incoming Emergency Alert: accept or reject within 2 minutes.
                Rendered first (top of stack) so the coordinator sees it immediately.
                Once it auto-dismisses, AmbulanceArrivalCountdown slides in below. */}
            {displayReservation && (
              <IncomingReservationAlert
                reservation={displayReservation}
                currentInventory={bedInventories.find((b) => b.bed_type === displayReservation.bed_type)}
                onAccept={handleAcceptReservation}
                onReject={handleRejectReservation}
                onDismiss={() => setAlertDismissed(true)}
              />
            )}

            {/* Quick messages with the ambulance crew for this request */}
            {displayReservation && (displayReservation.status === 'pending' || displayReservation.status === 'accepted') && (
              <QuickMessages
                key={displayReservation.id}
                reservationId={displayReservation.id}
                from="hospital"
                author={currentHospital.name}
              />
            )}

            {/* Live Incoming Ambulance ETA Countdown.
                Only shown after the emergency alert has been dismissed so the
                two cards don't compete for attention. Slides in smoothly. */}
            {alertDismissed && (
              <div className="animate-slide-in-up">
                <AmbulanceArrivalCountdown
                  incoming={incomingAmbulances}
                  onAdmitPatient={handleAdmitPatient}
                  onBedLost={handleBedLost}
                  onAcceptReservation={handleAcceptReservation}
                />
              </div>
            )}

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
                onUpdateTotalBeds={handleUpdateTotalBeds}
              />
            )}

            {/* Patient Bed Occupancy History & Handover Audit Trail ("who was there earlier") */}
            <BedHistoryLogTable
              logs={bedHistoryLogs}
              hospitalName={currentHospital?.name || 'Hospital'}
              onSelectHandover={(handover) => setSelectedHandoverForModal(handover)}
            />
          </div>
        )}

        {/* Demo Helper Action (admin running the demo, coordinator screen: it creates a request) */}
        {view === 'coordinator' && (role === 'admin' || demoMode) && (
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
        )}
        </>
        )}
      </main>

      {/* Add Bed Modal (Authorized Operator Only) */}
      {showAddBedModal && currentHospital && (
        <AddBedModal
          hospitalName={currentHospital.name}
          onClose={() => setShowAddBedModal(false)}
          onAddBeds={handleAddBeds}
        />
      )}

      {/* Bed Auto-Assignment Confirmation Modal */}
      {autoAssignResult && (
        <BedAutoAssignedModal
          assignment={autoAssignResult}
          onClose={() => setAutoAssignResult(null)}
          onViewHandover={() => {
            const h = autoAssignResult.handover;
            setAutoAssignResult(null);
            setSelectedHandoverForModal(h);
          }}
        />
      )}

      {/* Detailed Patient Handover Sheet Modal */}
      {selectedHandoverForModal && (
        <PatientHandoverModal
          handover={selectedHandoverForModal}
          onClose={() => setSelectedHandoverForModal(null)}
        />
      )}
    </div>
  );
}
