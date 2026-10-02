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
  Clock
} from 'lucide-react';

export default function DispatcherPage() {
  const [role, setRole] = useState<UserRole>('dispatcher');
  const [selectedHospitalForNurse, setSelectedHospitalForNurse] = useState<string>(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  );

  // Form State
  const [formData, setFormData] = useState<DispatchFormParams>({
    latitude: 37.7749,
    longitude: -122.4194,
    address: '750 Market St, Financial District',
    urgency: 'critical',
    bedType: 'icu',
    requiresVentilator: true,
    specialty: 'cardiac',
    notes: '58yo male acute STEMI, shock index 1.2, en route ambulance #EMS-41'
  });

  // Selected hospital for map inspection
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  // Active reservation state
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const currentRequestId = 'req-demo-1';
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdateTrigger, setLastUpdateTrigger] = useState(0);

  // Subscribe to realtime store events
  useEffect(() => {
    const unsubscribe = bedLinkStore.subscribe((event) => {
      // Force re-calculation on bed changes or reservation updates
      setLastUpdateTrigger((prev) => prev + 1);

      if (event.type === 'reservation_created') {
        const payload = event.payload as { reservation: Reservation };
        setActiveReservation(payload.reservation);
        setActionNotice(`Hold initiated for ${payload.reservation.hospital_name || 'Hospital'}. 2-minute confirmation timer started.`);
      } else if (event.type === 'reservation_accepted') {
        const payload = event.payload as { reservation: Reservation };
        setActiveReservation(payload.reservation);
        setActionNotice(`✓ BED CONFIRMED! Hospital accepted patient intake.`);
      } else if (event.type === 'reservation_rejected') {
        setActionNotice(`Previous hospital rejected hold request. Automatic fallback routing triggered.`);
      } else if (event.type === 'reservation_expired') {
        setActionNotice(`Hold expired (2 min timeout). Automatic fallback routing triggered.`);
      } else if (event.type === 'fallback_triggered') {
        const payload = event.payload as { hospital: ScoredHospital; newReservation: Reservation };
        setActiveReservation(payload.newReservation);
        setActionNotice(`Re-routed to next best candidate: ${payload.hospital.hospital.name}.`);
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

  const allRanked = useMemo(() => {
    return [...exactMatches, ...partialMatches];
  }, [exactMatches, partialMatches]);

  const effectiveSelectedHospitalId = selectedHospitalId || (allRanked.length > 0 ? allRanked[0].hospital.id : null);

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
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
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
          // Default SF Coordinates if location denied
          setFormData((prev) => ({
            ...prev,
            latitude: 37.7749,
            longitude: -122.4194,
            address: 'Market St & 4th, San Francisco'
          }));
        }
      );
    }
  };

  const handleQuickLoadCriticalScenario = () => {
    setFormData({
      latitude: 37.7800,
      longitude: -122.4150,
      address: 'Central Plaza, Downtown Core',
      urgency: 'critical',
      bedType: 'icu',
      requiresVentilator: true,
      specialty: 'cardiac',
      notes: 'CODE RED: STEMI with cardiogenic shock. Immediate ICU + Vent + Cath Lab capability required.'
    });
    setActionNotice('Loaded Step 28 Demo Scenario: Critical STEMI patient requiring ICU + Ventilator + Cardiac.');
  };

  const handleResetDemo = () => {
    bedLinkStore.resetToDefaults();
    setActiveReservation(null);
    setActionNotice('Reset all hospitals, beds, and reservations to clean demo initial state.');
    setLastUpdateTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header
        currentRole={role}
        selectedHospitalId={selectedHospitalForNurse}
        onRoleChange={(newRole, hospId) => {
          setRole(newRole);
          if (hospId) setSelectedHospitalForNurse(hospId);
        }}
      />

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          className="bg-blue-600 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in"
          role="status"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <Sparkles className="w-4 h-4 shrink-0 text-blue-200" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-blue-200 hover:text-white text-xs font-mono px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main 3-Column Desktop Layout (Left: Intake Form, Center: Map, Right: Ranked Candidates) */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-5 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Column 1: Patient Requirements Form */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
            <PatientNeedForm
              formData={formData}
              onChange={setFormData}
              onUseCurrentLocation={handleUseCurrentLocation}
              onQuickLoadCriticalScenario={handleQuickLoadCriticalScenario}
            />

            {/* Quick Demo Controls Card */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs flex flex-col gap-2">
              <span className="font-bold text-slate-700 uppercase tracking-wider block">
                Hackathon Demo Controls
              </span>
              <p className="text-slate-500 text-[11px]">
                Test hospital rejection, 2-minute timeout, and automatic fallback.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleResetDemo}
                  className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-300 flex items-center justify-center gap-1.5 min-h-[36px]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Demo Data</span>
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Live Emergency Map */}
          <div className="lg:col-span-4 xl:col-span-5 h-[400px] lg:h-[calc(100vh-140px)] sticky lg:top-20">
            <HospitalMap
              patientLocation={{ latitude: formData.latitude, longitude: formData.longitude }}
              hospitals={allRanked}
              selectedHospitalId={effectiveSelectedHospitalId}
              onSelectHospital={(h) => setSelectedHospitalId(h.hospital.id)}
              className="h-full w-full"
            />
          </div>

          {/* Column 3: Ranked Hospital Candidate Results */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Header & Match Statistics */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>Candidate Hospitals</span>
                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold">
                    {allRanked.length} Found
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ranked by Bed Match (45%), ETA (25%), Freshness (20%), Load (10%)
                </p>
              </div>

              {activeReservation && (
                <div className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="uppercase">{activeReservation.status}</span>
                </div>
              )}
            </div>

            {/* EXACT MATCHES SECTION */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Exact Resource Matches ({exactMatches.length})</span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium">All criteria verified</span>
              </div>

              {exactMatches.length === 0 ? (
                <div className="p-6 bg-white rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                  <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                  <strong className="text-slate-800 font-semibold block text-sm">
                    No Exact Match Found
                  </strong>
                  <span>No single facility currently has all requested resources unallocated.</span>
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
                    activeReservation={
                      activeReservation?.hospital_id === scored.hospital.id ? activeReservation : null
                    }
                    onHoldBed={handleHoldBed}
                    onSelectHospital={(h) => setSelectedHospitalId(h.hospital.id)}
                    isLoading={isLoading}
                  />
                ))
              )}
            </div>

            {/* PARTIAL MATCHES SECTION */}
            {partialMatches.length > 0 && (
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Partial Matches ({partialMatches.length})</span>
                  </span>
                  <span className="text-[11px] text-amber-700 font-medium">Missing 1 or more resources</span>
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
                    activeReservation={
                      activeReservation?.hospital_id === scored.hospital.id ? activeReservation : null
                    }
                    onHoldBed={handleHoldBed}
                    onSelectHospital={(h) => setSelectedHospitalId(h.hospital.id)}
                    isLoading={isLoading}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
