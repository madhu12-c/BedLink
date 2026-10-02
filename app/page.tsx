'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/shared/Header';
import { PatientNeedForm, DispatchFormParams } from '@/components/dispatch/PatientNeedForm';
import { HospitalMap } from '@/components/dispatch/HospitalMap';
import { HospitalResultCard } from '@/components/dispatch/HospitalResultCard';
import { bedLinkStore } from '@/lib/data/store';
import { rankHospitals } from '@/lib/dispatch/ranking';
import { ScoredHospital, UserRole, Reservation } from '@/lib/types';
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

export default function DispatcherPage() {
  const [role, setRole] = useState<UserRole>('dispatcher');
  const [selectedHospitalForNurse, setSelectedHospitalForNurse] = useState<string>(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>('hospitals');

  // Form State
  const [formData, setFormData] = useState<DispatchFormParams>({
    latitude: 19.2148,
    longitude: 72.8635,
    address: 'Thakur College (TCET), 90 Feet Rd, Thakur Complex, Kandivali East, Mumbai 400101',
    urgency: 'critical',
    bedType: 'icu',
    requiresVentilator: true,
    specialty: 'cardiac',
    notes: '58yo male acute STEMI, shock index 1.2, ambulance en route from Thakur College, 90 Feet Rd'
  });

  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const currentRequestId = 'req-demo-1';
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdateTrigger, setLastUpdateTrigger] = useState(0);

  // Subscribe to realtime store events
  useEffect(() => {
    const unsubscribe = bedLinkStore.subscribe((event) => {
      setLastUpdateTrigger((prev) => prev + 1);

      if (event.type === 'reservation_created') {
        const payload = event.payload as { reservation: Reservation };
        setActiveReservation(payload.reservation);
        setActionNotice(`Hold initiated for ${payload.reservation.hospital_name || 'Hospital'}. 2-minute confirmation timer started.`);
        // Auto-switch to hospitals tab to see the hold
        setMobileTab('hospitals');
      } else if (event.type === 'reservation_accepted') {
        const payload = event.payload as { reservation: Reservation };
        setActiveReservation(payload.reservation);
        setActionNotice(`✓ BED CONFIRMED! Hospital accepted patient intake.`);
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

  const { exactMatches, partialMatches } = useMemo(() => {
    return rankHospitals(candidates, {
      patientLocation: { latitude: formData.latitude, longitude: formData.longitude },
      requiredBedType: formData.bedType,
      requiresVentilator: formData.requiresVentilator,
      requiredSpecialty: formData.specialty,
      urgency: formData.urgency
    });
  }, [candidates, formData]);

  const allRanked = useMemo(() => [...exactMatches, ...partialMatches], [exactMatches, partialMatches]);

  const effectiveSelectedHospitalId =
    selectedHospitalId || (allRanked.length > 0 ? allRanked[0].hospital.id : null);

  // Handlers
  const handleHoldBed = async (hospitalId: string) => {
    setIsLoading(true);
    setActionNotice(null);
    try {
      const res = bedLinkStore.holdBedAtomic(
        currentRequestId,
        hospitalId,
        formData.bedType,
        'disp-dispatcher',
        'EMS Dispatcher #41'
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
            latitude: 19.2148,
            longitude: 72.8635,
            address: 'Thakur College, 90 Feet Rd, Thakur Complex, Kandivali East, Mumbai 400101'
          }));
        }
      );
    }
  };

  const handleQuickLoadCriticalScenario = () => {
    setFormData({
      latitude: 19.2148,
      longitude: 72.8635,
      address: 'Thakur College (TCET), 90 Feet Rd, Kandivali East, Mumbai 400101',
      urgency: 'critical',
      bedType: 'icu',
      requiresVentilator: true,
      specialty: 'cardiac',
      notes: 'CODE RED: STEMI patient at Thakur College campus gate. Immediate ICU + Vent + Cath Lab required.'
    });
    setActionNotice('Loaded demo: Critical STEMI patient at Thakur College — ICU + Ventilator + Cardiac.');
  };

  const handleResetDemo = () => {
    bedLinkStore.resetToDefaults();
    setActiveReservation(null);
    setActionNotice('Reset all hospitals, beds, and reservations to clean demo state.');
    setLastUpdateTrigger((prev) => prev + 1);
  };

  // Mobile tab config
  const mobileTabs: { id: MobileTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'intake', label: 'Intake', icon: ClipboardList },
    { id: 'hospitals', label: 'Hospitals', icon: Building2, badge: exactMatches.length },
    { id: 'map', label: 'Map', icon: Map }
  ];

  return (
    <div className="min-h-[100dvh] lg:h-screen flex flex-col bg-slate-50 lg:overflow-hidden">
      <Header
        currentRole={role}
        selectedHospitalId={selectedHospitalForNurse}
        hideBottomNav
        onRoleChange={(newRole, hospId) => {
          setRole(newRole);
          if (hospId) setSelectedHospitalForNurse(hospId);
        }}
      />

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
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 mobile-scroll-panel">
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
          <div className="flex-1 overflow-y-auto mobile-scroll-panel">
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
