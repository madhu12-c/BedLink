'use client';

import React, { useEffect, useEffectEvent, useState, useMemo } from 'react';
import { Header } from '@/components/shared/Header';
import { useAuth } from '@/components/auth/AuthProvider';
import { PatientNeedForm, DispatchFormParams } from '@/components/dispatch/PatientNeedForm';
import { HospitalMap } from '@/components/dispatch/HospitalMap';
import { HospitalResultCard } from '@/components/dispatch/HospitalResultCard';
import { bedLinkStore } from '@/lib/data/store';
import { rankHospitals, rankHospitalsWithRealRoutes } from '@/lib/dispatch/ranking';
import { ScoredHospital, Reservation } from '@/lib/types';
import { generateUUID } from '@/lib/crypto/uuid';
import { playEmergencyAlertSound, triggerEmergencyNotification } from '@/lib/utils/audioAlert';
import { BedConfirmedAlert } from '@/components/dispatch/BedConfirmedAlert';
import { VoiceBestMatch, VoiceIntakePanel } from '@/components/voice/VoiceIntakePanel';
import { VoiceSettingsBar } from '@/components/voice/VoiceSettingsBar';
import { useVoiceAvailability, useVoicePlayer, useVoiceSettings } from '@/lib/voice/hooks';
import { IntakeFormValues } from '@/lib/voice/intake';
import { VoiceLanguageCode } from '@/lib/voice/languages';
import { DispatchVoiceEvent, dispatchEventPhrase } from '@/lib/voice/phrases';
import {
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  ClipboardList,
  Building2,
  Map,
  X
} from 'lucide-react';

type MobileTab = 'intake' | 'hospitals' | 'map';

// Store events that are read out to the ambulance crew.
const DISPATCH_VOICE_EVENTS: Partial<Record<string, DispatchVoiceEvent['kind']>> = {
  reservation_created: 'hold_sent',
  reservation_accepted: 'accepted',
  reservation_rejected: 'rejected',
  reservation_expired: 'expired'
};

// One emergency request per tab, kept across visits to this page (like the in-memory store),
// so a hold made before going to another page is still shown on return. It must be a UUID:
// Supabase rejects anything else, and then other devices never hear about the hold.
let tabRequestId: string | null = null;
function getTabRequestId(): string {
  tabRequestId ??= generateUUID();
  return tabRequestId;
}

// Kept across visits to this page within the tab (the demo store lives in memory too), so a
// confirmation that arrived while the crew was on another page is still announced, once.
const crewVoiceMemory: { language: VoiceLanguageCode | null; announced: Set<string> } = {
  language: null,
  announced: new Set()
};

function latestReservationFor(requestId: string): Reservation | null {
  return bedLinkStore.getReservations().find((r) => r.request_id === requestId) ?? null;
}

export default function DispatcherPage() {
  const [mobileTab, setMobileTab] = useState<MobileTab>('hospitals');

  // Form State
  const [formData, setFormData] = useState<DispatchFormParams>({
    latitude: 19.2050,
    longitude: 72.8630,
    address: 'Near Aditi Hospital, 90 Feet Road, Thakur Complex, Kandivali East, Mumbai 400101',
    urgency: 'critical',
    bedType: 'icu',
    requiresVentilator: true,
    specialty: 'cardiac',
    notes: '58yo male acute STEMI, shock index 1.2, ambulance en route near Aditi Hospital, 90 Feet Rd, Kandivali East'
  });

  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const { user } = useAuth();
  const [currentRequestId, setCurrentRequestId] = useState(getTabRequestId);
  // Restored when coming back from another page, so an accepted hold is still shown.
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(() =>
    latestReservationFor(getTabRequestId())
  );
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdateTrigger, setLastUpdateTrigger] = useState(0);
  const [showConfirmedAlert, setShowConfirmedAlert] = useState(false);
  // Real road-ranked results (updated async from OSRM)
  const [realRanked, setRealRanked] = useState<{ exactMatches: import('@/lib/types').ScoredHospital[]; partialMatches: import('@/lib/types').ScoredHospital[] } | null>(null);

  // Voice assistant (Sarvam): spoken intake + spoken status updates for the crew
  const voiceAvailability = useVoiceAvailability();
  const voicePlayer = useVoicePlayer();
  const [voiceSettings, updateVoiceSettings] = useVoiceSettings('bedlink.voice.dispatch', {
    announce: true,
    language: 'auto'
  });
  const [crewLanguage, setCrewLanguage] = useState<VoiceLanguageCode | null>(() => crewVoiceMemory.language);
  const rememberCrewLanguage = (language: VoiceLanguageCode) => {
    crewVoiceMemory.language = language;
    setCrewLanguage(language);
  };
  const canSpeak = voiceAvailability === 'ready' && voiceSettings.announce;
  const speakLanguageFor = (spoken: VoiceLanguageCode | null): VoiceLanguageCode =>
    voiceSettings.language === 'auto' ? spoken ?? 'en-IN' : voiceSettings.language;

  /** Speaks a request status once per reservation and status. */
  const announceReservation = (kind: DispatchVoiceEvent['kind'], reservation: Reservation) => {
    if (!canSpeak || kind === 'not_held') return;
    const key = `${reservation.id}:${kind}`;
    if (crewVoiceMemory.announced.has(key)) return;
    crewVoiceMemory.announced.add(key);
    const hospitalName =
      reservation.hospital_name || bedLinkStore.getHospital(reservation.hospital_id)?.name || 'the hospital';
    // Read the remembered language directly: a voice hold sets it in the same tick as this event.
    voicePlayer.speak(dispatchEventPhrase({ kind, hospitalName }, speakLanguageFor(crewVoiceMemory.language)));
  };

  const announceStoreEvent = useEffectEvent((event: { type: string; payload: unknown }) => {
    const kind = DISPATCH_VOICE_EVENTS[event.type];
    const reservation = (event.payload as { reservation?: Reservation } | null)?.reservation;
    if (kind && reservation?.request_id === currentRequestId) announceReservation(kind, reservation);
  });

  // The hospital may accept while the crew is on another page (e.g. the Nurse Portal in a
  // one-tab demo). Announce that confirmation when they come back, if it is recent.
  const announceMissedConfirmation = useEffectEvent(() => {
    const reservation = latestReservationFor(currentRequestId);
    if (reservation?.status !== 'accepted' || !reservation.responded_at) return;
    if (Date.now() - Date.parse(reservation.responded_at) > 2 * 60_000) return;
    announceReservation('accepted', reservation);
  });
  useEffect(() => {
    if (voiceAvailability === 'ready') announceMissedConfirmation();
  }, [voiceAvailability]);

  // Request notification permission early so push fires immediately on accept
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Subscribe to realtime store events
  useEffect(() => {
    const unsubscribe = bedLinkStore.subscribe((event) => {
      setLastUpdateTrigger((prev) => prev + 1);
      announceStoreEvent(event);

      if (event.type === 'reservation_created') {
        const payload = event.payload as { reservation: Reservation };
        playEmergencyAlertSound();
        triggerEmergencyNotification('🛏️ EMERGENCY BED HOLD ACTIVE', {
          body: `Facility: ${payload.reservation.hospital_name || 'Hospital'}\nBed: ${payload.reservation.bed_type.toUpperCase()}\n2-minute confirmation timer started.`
        });
        setActiveReservation(payload.reservation);
        setActionNotice(`Hold initiated for ${payload.reservation.hospital_name || 'Hospital'}. 2-minute confirmation timer started.`);
        // Auto-switch to hospitals tab to see the hold
        setMobileTab('hospitals');
      } else if (event.type === 'reservation_accepted') {
        const payload = event.payload as { reservation: Reservation };
        setActiveReservation(payload.reservation);
        setActionNotice(`✓ BED CONFIRMED! Hospital accepted patient intake.`);
        setShowConfirmedAlert(true); // Trigger fullscreen alert + push notification
        setMobileTab('hospitals');
      } else if (event.type === 'reservation_rejected') {
        setActionNotice(`Hospital rejected hold. Automatic fallback routing triggered.`);
      } else if (event.type === 'reservation_expired') {
        setActionNotice(`Hold expired (2 min timeout). Automatic fallback routing triggered.`);
      } else if (event.type === 'fallback_triggered') {
        const payload = event.payload as { hospital: ScoredHospital; newReservation: Reservation };
        setActiveReservation(payload.newReservation);
        setActionNotice(`Re-routed to: ${payload.hospital.hospital.name}.`);
      }
    });
    return () => unsubscribe();
  }, []);

  // Compute Candidates & Ranking
  const candidates = useMemo(() => {
    void lastUpdateTrigger;
    return bedLinkStore.getHospitalCandidates();
  }, [lastUpdateTrigger]);

  // Sync initial estimate ranking (instant)
  const syncRanked = useMemo(() => {
    return rankHospitals(candidates, {
      patientLocation: { latitude: formData.latitude, longitude: formData.longitude },
      requiredBedType: formData.bedType,
      requiresVentilator: formData.requiresVentilator,
      requiredSpecialty: formData.specialty,
      urgency: formData.urgency
    });
  }, [candidates, formData]);

  // Async re-ranking with real OSRM road distances — updates list to match actual road route
  useEffect(() => {
    let cancelled = false;
    setRealRanked(null); // reset while fetching
    const opts = {
      patientLocation: { latitude: formData.latitude, longitude: formData.longitude },
      requiredBedType: formData.bedType,
      requiresVentilator: formData.requiresVentilator,
      requiredSpecialty: formData.specialty,
      urgency: formData.urgency
    };
    rankHospitalsWithRealRoutes(candidates, opts).then((result) => {
      if (!cancelled) setRealRanked(result);
    }).catch(() => { /* keep sync estimate */ });
    return () => { cancelled = true; };
  }, [candidates, formData]);

  // Use real road ranking if available, else show sync estimate immediately
  const { exactMatches, partialMatches } = realRanked ?? syncRanked;

  const allRanked = useMemo(() => [...exactMatches, ...partialMatches], [exactMatches, partialMatches]);

  const effectiveSelectedHospitalId =
    selectedHospitalId || (allRanked.length > 0 ? allRanked[0].hospital.id : null);

  // Handlers
  const dispatcherId = user?.id ?? 'disp-dispatcher';
  const dispatcherName = user?.name ?? 'EMS Dispatcher #41';

  // The patient this hold is for. Once the current patient has a confirmed bed, the next
  // hold is a new patient with its own request id.
  const requestIdForNewHold = (): string => {
    const placed = bedLinkStore
      .getReservations()
      .some((r) => r.request_id === currentRequestId && r.status === 'accepted');
    if (!placed) return currentRequestId;
    const fresh = generateUUID();
    tabRequestId = fresh;
    setCurrentRequestId(fresh);
    return fresh;
  };

  // Registers the patient's needs before holding. This screen then owns the request, so it is
  // the one that re-routes to the next-best hospital if the hold is rejected or times out.
  // No patient details are kept (notes stay out).
  const registerRequest = (requestId: string, form: DispatchFormParams) => {
    bedLinkStore.upsertEmergencyRequest({
      id: requestId,
      dispatcher_id: dispatcherId,
      patient_latitude: form.latitude,
      patient_longitude: form.longitude,
      urgency: form.urgency,
      required_bed_type: form.bedType,
      required_specialty: form.specialty || null,
      requires_ventilator: form.requiresVentilator,
      notes: null
    });
  };

  const handleHoldBed = async (hospitalId: string) => {
    setIsLoading(true);
    setActionNotice(null);
    try {
      const requestId = requestIdForNewHold();
      registerRequest(requestId, formData);
      const res = bedLinkStore.holdBedAtomic(
        requestId,
        hospitalId,
        formData.bedType,
        dispatcherId,
        dispatcherName
      );
      setActiveReservation(res);
      setSelectedHospitalId(hospitalId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to hold bed';
      setActionNotice(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFormData((prev) => ({
            ...prev,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            address: `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
          }));
        },
        () => {
          setFormData((prev) => ({
            ...prev,
            latitude: 19.2050,
            longitude: 72.8630,
            address: 'Near Aditi Hospital, 90 Feet Road, Kandivali East, Mumbai 400101'
          }));
        }
      );
    }
  };

  const handleQuickLoadCriticalScenario = () => {
    setFormData({
      latitude: 19.2050,
      longitude: 72.8630,
      address: 'Near Aditi Hospital, 90 Feet Road, Thakur Complex, Kandivali East, Mumbai 400101',
      urgency: 'critical',
      bedType: 'icu',
      requiresVentilator: true,
      specialty: 'cardiac',
      notes: 'CODE RED: STEMI patient near Aditi Hospital, 90 Feet Rd, Kandivali East. Immediate ICU + Vent + Cath Lab required.'
    });
    setActionNotice('Loaded demo: Critical STEMI patient near Aditi Hospital, Kandivali East — ICU + Ventilator + Cardiac.');
  };

  const handleResetDemo = () => {
    bedLinkStore.resetToDefaults();
    setActiveReservation(null);
    setShowConfirmedAlert(false);
    setActionNotice('Reset all hospitals, beds, and reservations to clean demo state.');
    setLastUpdateTrigger((prev) => prev + 1);
  };

  // Voice: best exact match for what the crew said, using the same ranking as the hospital list.
  const findVoiceBestMatch = (values: IntakeFormValues): VoiceBestMatch | null => {
    const next: DispatchFormParams = { ...formData, ...values };
    const top = rankHospitals(candidates, {
      patientLocation: { latitude: next.latitude, longitude: next.longitude },
      requiredBedType: next.bedType,
      requiresVentilator: next.requiresVentilator,
      requiredSpecialty: next.specialty,
      urgency: next.urgency
    }).exactMatches[0];
    if (!top) return null;
    return {
      hospitalId: top.hospital.id,
      hospitalName: top.hospital.name,
      etaMinutes: top.etaMinutes,
      freeBeds: top.inventory[next.bedType]?.available_beds ?? 0
    };
  };

  const applyVoiceDetails = (values: IntakeFormValues, spokenLanguage: VoiceLanguageCode): DispatchFormParams => {
    const next: DispatchFormParams = { ...formData, ...values };
    rememberCrewLanguage(spokenLanguage);
    setFormData(next);
    setMobileTab('hospitals');
    return next;
  };

  // Voice: the crew chose "Fill form only".
  const handleVoiceApply = (values: IntakeFormValues, spokenLanguage: VoiceLanguageCode) => {
    applyVoiceDetails(values, spokenLanguage);
    setSelectedHospitalId(null);
    setActionNotice('Voice details applied to the form.');
  };

  // Voice: the crew said "haan" / "hoy" / "yes" (or tapped) to hold the bed that was read back.
  const handleVoiceHold = (values: IntakeFormValues, spokenLanguage: VoiceLanguageCode, hospitalId: string) => {
    const next = applyVoiceDetails(values, spokenLanguage);
    setSelectedHospitalId(hospitalId);
    try {
      const requestId = requestIdForNewHold();
      registerRequest(requestId, next);
      const res = bedLinkStore.holdBedAtomic(
        requestId,
        hospitalId,
        next.bedType,
        dispatcherId,
        `${dispatcherName} (voice)`
      );
      setActiveReservation(res);
      setActionNotice(`Bed hold sent to ${res.hospital_name ?? 'the hospital'} by voice. 2-minute timer started.`);
    } catch (err: unknown) {
      setActionNotice(err instanceof Error ? err.message : 'Failed to hold bed');
      if (canSpeak) {
        const hospitalName = bedLinkStore.getHospital(hospitalId)?.name ?? 'the hospital';
        voicePlayer.speak(dispatchEventPhrase({ kind: 'unavailable', hospitalName }, speakLanguageFor(spokenLanguage)));
      }
    }
  };

  const voiceIntakePanel = (
    <VoiceIntakePanel
      availability={voiceAvailability}
      currentForm={formData}
      findBestMatch={findVoiceBestMatch}
      onApply={handleVoiceApply}
      onHold={handleVoiceHold}
      canSpeak={canSpeak}
      speakAndWait={voicePlayer.speakAndWait}
      speakLanguageFor={speakLanguageFor}
      onUnlockAudio={voicePlayer.unlock}
      settingsSlot={
        <VoiceSettingsBar
          availability={voiceAvailability}
          settings={voiceSettings}
          onChange={updateVoiceSettings}
          playerStatus={voicePlayer.status}
          playerError={voicePlayer.error}
          onUnlock={voicePlayer.unlock}
          label="Voice updates"
          allowAuto
          autoLanguage={crewLanguage}
        />
      }
    />
  );

  // Mobile tab config
  const mobileTabs: { id: MobileTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'intake', label: 'Intake', icon: ClipboardList },
    { id: 'hospitals', label: 'Hospitals', icon: Building2, badge: exactMatches.length },
    { id: 'map', label: 'Map', icon: Map }
  ];

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-slate-50 lg:overflow-hidden">

      {/* ── BED CONFIRMED FULLSCREEN ALERT (ambulance crew notification) ── */}
      {showConfirmedAlert && activeReservation && (
        <BedConfirmedAlert
          reservation={activeReservation}
          onDismiss={() => setShowConfirmedAlert(false)}
        />
      )}
      <Header hideBottomNav />

      {/* Active Reservation Status Bar — sticky, always visible */}
      {activeReservation && activeReservation.status === 'pending' && (
        <div
          className="bg-blue-600 text-white px-4 py-3 text-sm font-bold flex items-center justify-between shadow-lg animate-fade-in z-30"
          role="status"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
            <span className="truncate">
              ⏱ HOLDING: {activeReservation.hospital_name} · 2-min timer
            </span>
          </div>
        </div>
      )}

      {activeReservation && activeReservation.status === 'accepted' && (
        <div
          className="bg-emerald-600 text-white px-4 py-3 text-sm font-extrabold flex items-center gap-2 shadow-lg animate-fade-in z-30"
          role="status"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>✅ BED CONFIRMED — {activeReservation.hospital_name}</span>
        </div>
      )}

      {/* Action Notice Banner */}
      {actionNotice && (
        <div
          className="bg-slate-900 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between animate-fade-in"
          role="status"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 shrink-0 text-blue-300" />
            <span className="truncate">{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-white ml-2 shrink-0 p-1"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── DESKTOP: 3-column independent scrolling console ── */}
      <main className="hidden lg:flex flex-1 min-h-0 max-w-[1650px] w-full mx-auto p-4 lg:p-5 gap-4 lg:gap-5 items-stretch overflow-hidden">
        {/* Column 1: Intake Form (Independent scroll) */}
        <div className="w-[340px] xl:w-[360px] shrink-0 h-full overflow-y-auto pr-1 flex flex-col gap-4">
          {voiceIntakePanel}
          <PatientNeedForm
            formData={formData}
            onChange={setFormData}
            onUseCurrentLocation={handleUseCurrentLocation}
            onQuickLoadCriticalScenario={handleQuickLoadCriticalScenario}
          />
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs flex flex-col gap-2">
            <span className="font-bold text-slate-700 uppercase tracking-wider block">Demo Controls</span>
            <p className="text-slate-500 text-[11px]">Test rejection, 2-min timeout, and auto-fallback.</p>
            <button
              type="button"
              onClick={handleResetDemo}
              className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-300 flex items-center justify-center gap-1.5 min-h-[36px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo Data</span>
            </button>
          </div>
        </div>

        {/* Column 2: Map (Fixed viewport pane) */}
        <div className="flex-1 h-full min-w-0 rounded-xl overflow-hidden shadow-sm">
          <HospitalMap
            patientLocation={{ latitude: formData.latitude, longitude: formData.longitude }}
            hospitals={allRanked}
            selectedHospitalId={effectiveSelectedHospitalId}
            onSelectHospital={(h) => setSelectedHospitalId(h.hospital.id)}
            className="h-full w-full"
          />
        </div>

        {/* Column 3: Results (Independent scroll) */}
        <div className="w-[380px] xl:w-[410px] shrink-0 h-full overflow-y-auto pr-1 flex flex-col gap-4 pb-8">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                Candidate Hospitals
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold">
                  {allRanked.length} Found
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Ranked: Bed(45%) · ETA(25%) · Fresh(20%) · Load(10%)</p>
            </div>
            {activeReservation && (
              <div className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                <Clock className="w-3.5 h-3.5" />
                <span className="uppercase">{activeReservation.status}</span>
              </div>
            )}
          </div>

          {/* Exact Matches */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 px-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Exact Matches ({exactMatches.length})
              </span>
            </div>
            {exactMatches.length === 0 ? (
              <div className="p-6 bg-white rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                <strong className="text-slate-800 font-semibold block text-sm">No Exact Match Found</strong>
                <span>No facility has all requested resources.</span>
              </div>
            ) : (
              exactMatches.map((scored, idx) => (
                <HospitalResultCard
                  key={scored.hospital.id}
                  scoredHospital={scored}
                  rank={idx + 1}
                  requiredBedType={formData.bedType}
                  requiresVentilator={formData.requiresVentilator}
                  requiredSpecialty={formData.specialty}
                  isSelected={effectiveSelectedHospitalId === scored.hospital.id}
                  activeReservation={activeReservation?.hospital_id === scored.hospital.id ? activeReservation : null}
                  onHoldBed={handleHoldBed}
                  onSelectHospital={(h) => setSelectedHospitalId(h.hospital.id)}
                  isLoading={isLoading}
                />
              ))
            )}
          </div>

          {/* Partial Matches */}
          {partialMatches.length > 0 && (
            <div className="flex flex-col gap-3 mt-2 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-1.5 px-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                  Partial Matches ({partialMatches.length})
                </span>
              </div>
              {partialMatches.map((scored, idx) => (
                <HospitalResultCard
                  key={scored.hospital.id}
                  scoredHospital={scored}
                  rank={exactMatches.length + idx + 1}
                  requiredBedType={formData.bedType}
                  requiresVentilator={formData.requiresVentilator}
                  requiredSpecialty={formData.specialty}
                  isSelected={effectiveSelectedHospitalId === scored.hospital.id}
                  activeReservation={activeReservation?.hospital_id === scored.hospital.id ? activeReservation : null}
                  onHoldBed={handleHoldBed}
                  onSelectHospital={(h) => setSelectedHospitalId(h.hospital.id)}
                  isLoading={isLoading}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── MOBILE: Tab Panel Layout ── */}
      <div className="lg:hidden flex flex-col flex-1" style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>

        {/* INTAKE TAB */}
        {mobileTab === 'intake' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {voiceIntakePanel}
            <PatientNeedForm
              formData={formData}
              onChange={setFormData}
              onUseCurrentLocation={handleUseCurrentLocation}
              onQuickLoadCriticalScenario={handleQuickLoadCriticalScenario}
            />
            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleQuickLoadCriticalScenario}
                className="py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 min-h-[52px] shadow-md text-sm"
              >
                <Sparkles className="w-4 h-4" />
                Demo Scenario
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl flex items-center justify-center gap-2 min-h-[52px] border border-slate-300 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Demo
              </button>
            </div>
            {/* CTA to go to results */}
            <button
              type="button"
              onClick={() => setMobileTab('hospitals')}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-base rounded-2xl shadow-lg flex items-center justify-center gap-2 min-h-[56px]"
            >
              <Building2 className="w-5 h-5" />
              Find Hospitals ({allRanked.length} found)
            </button>
          </div>
        )}

        {/* HOSPITALS TAB */}
        {mobileTab === 'hospitals' && (
          <div className="flex-1 overflow-y-auto">
            {/* Sticky header with match count */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
              <div>
                <h2 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  Candidate Hospitals
                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold">
                    {allRanked.length}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  {formData.bedType.toUpperCase()} · {formData.urgency} · {formData.requiresVentilator ? '+vent' : 'no vent'}
                </p>
              </div>
              {activeReservation && (
                <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border ${
                  activeReservation.status === 'accepted'
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                    : 'text-blue-800 bg-blue-50 border-blue-200'
                }`}>
                  <Clock className="w-3.5 h-3.5" />
                  <span className="uppercase">{activeReservation.status}</span>
                </div>
              )}
            </div>

            <div className="p-4 flex flex-col gap-3">
              {/* Exact Matches */}
              {exactMatches.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                      Exact Matches ({exactMatches.length})
                    </span>
                  </div>
                  {exactMatches.map((scored, idx) => (
                    <HospitalResultCard
                      key={scored.hospital.id}
                      scoredHospital={scored}
                      rank={idx + 1}
                      requiredBedType={formData.bedType}
                      requiresVentilator={formData.requiresVentilator}
                      requiredSpecialty={formData.specialty}
                      isSelected={effectiveSelectedHospitalId === scored.hospital.id}
                      activeReservation={activeReservation?.hospital_id === scored.hospital.id ? activeReservation : null}
                      onHoldBed={handleHoldBed}
                      onSelectHospital={(h) => {
                        setSelectedHospitalId(h.hospital.id);
                        setMobileTab('map');
                      }}
                      isLoading={isLoading}
                    />
                  ))}
                </>
              )}

              {/* No exact matches */}
              {exactMatches.length === 0 && (
                <div className="p-6 bg-white rounded-2xl border border-dashed border-slate-300 text-center">
                  <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-60" />
                  <strong className="text-slate-800 font-semibold block">No Exact Match</strong>
                  <span className="text-xs text-slate-500">Check partial matches below.</span>
                </div>
              )}

              {/* Partial Matches */}
              {partialMatches.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                      Partial ({partialMatches.length})
                    </span>
                  </div>
                  {partialMatches.map((scored, idx) => (
                    <HospitalResultCard
                      key={scored.hospital.id}
                      scoredHospital={scored}
                      rank={exactMatches.length + idx + 1}
                      requiredBedType={formData.bedType}
                      requiresVentilator={formData.requiresVentilator}
                      requiredSpecialty={formData.specialty}
                      isSelected={effectiveSelectedHospitalId === scored.hospital.id}
                      activeReservation={activeReservation?.hospital_id === scored.hospital.id ? activeReservation : null}
                      onHoldBed={handleHoldBed}
                      onSelectHospital={(h) => {
                        setSelectedHospitalId(h.hospital.id);
                        setMobileTab('map');
                      }}
                      isLoading={isLoading}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* MAP TAB */}
        {mobileTab === 'map' && (
          <div className="flex-1 relative">
            <HospitalMap
              patientLocation={{ latitude: formData.latitude, longitude: formData.longitude }}
              hospitals={allRanked}
              selectedHospitalId={effectiveSelectedHospitalId}
              onSelectHospital={(h) => {
                setSelectedHospitalId(h.hospital.id);
              }}
              className="mobile-map-full w-full"
            />
          </div>
        )}

        {/* ── Mobile Bottom Tab Bar ── */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-2xl grid grid-cols-3 safe-area-bottom"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
          aria-label="Navigation tabs"
        >
          {mobileTabs.map(({ id, label, icon: Icon, badge }) => {
            const isActive = mobileTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMobileTab(id)}
                className={`flex flex-col items-center justify-center py-2.5 px-2 min-h-[64px] relative transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
                }`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={label}
              >
                <div className="relative">
                  <Icon className={`w-6 h-6 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute -top-1 -right-2 w-4 h-4 bg-emerald-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-bold mt-0.5 ${isActive ? 'text-blue-600' : 'text-slate-500'}`}>
                  {label}
                </span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
