export type BedType = 'icu' | 'ventilator' | 'oxygen' | 'cardiac' | 'burns' | 'emergency' | 'general';

/** Emergency department status a hospital sets: on diversion, ambulances are not sent there. */
export type EdStatus = 'open' | 'busy' | 'diversion';

/**
 * Free care for patients who can't pay:
 * - govt: government / municipal hospital, free for everyone
 * - charity: charitable trust hospital; Maharashtra law makes it keep 10% of beds free for
 *   poor patients (income up to Rs 1.8 lakh) and 10% at concession
 */
export type FreeCare = 'govt' | 'charity';

export type Urgency = 'critical' | 'urgent' | 'normal';

export type Specialty = 'cardiac' | 'burns' | 'trauma' | 'neuro' | 'pediatric';

export type ReservationStatus = 
  | 'pending' 
  | 'accepted' 
  | 'rejected' 
  | 'expired' 
  | 'cancelled' 
  | 'completed'
  | 'shadow'       // Edge Case 1: shadow fallback slot (pre-held, waiting to activate)
  | 'auto_released' // Edge Case 3: auto-released because a closer hospital was confirmed
  | 'arrived'       // ambulance arrived and handed over
  | 'released'      // accepted, but no arrival by ETA + 15 min: bed given back
  | 'bed_lost';     // arrived, but the held bed was gone: patient must go elsewhere

export type UserRole = 'dispatcher' | 'nurse' | 'coordinator' | 'admin';

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  organization_id?: string | null;
  hospital_id?: string | null;
  created_at: string;
}

export interface Hospital {
  id: string;
  organization_id?: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  emergency_capacity: number;
  current_load: number; // 0 - 100 percentage
  load_updated_at: string;
  is_active: boolean;
  phone?: string;
  created_at?: string;
  /** Open / Busy / Diversion, set by the hospital coordinator */
  ed_status?: EdStatus;
  /** 0-100: drops on reject (-2), timeout (-5), bed lost on arrival (-15); +1 per arrival */
  reliability?: number;
  /** Free care for patients who can't pay; null / missing = not known */
  free_care?: FreeCare | null;
}

export interface HospitalCapability {
  id: string;
  hospital_id: string;
  capability: Specialty | string;
}

export interface BedInventory {
  id: string;
  hospital_id: string;
  bed_type: BedType;
  total_beds: number;
  available_beds: number;
  updated_at: string;
  updated_by?: string | null;
  /** Name of the person who last changed or confirmed this count */
  updated_by_name?: string | null;
  /** Which bed numbers (1..total_beds) are taken, shared by every screen (see lib/data/bedNumbers) */
  occupied_beds?: number[];
}

export interface EmergencyRequest {
  id: string;
  dispatcher_id: string;
  patient_latitude: number;
  patient_longitude: number;
  urgency: Urgency;
  required_bed_type: BedType;
  required_specialty?: string | null;
  requires_ventilator?: boolean;
  /** Patient can't pay: prefer government (free) and charity hospitals */
  needs_free_care?: boolean;
  notes?: string | null;
  status: 'active' | 'holding' | 'matched' | 'cancelled' | 'completed';
  created_at: string;
}

export interface HospitalMatch {
  id: string;
  request_id: string;
  hospital_id: string;
  bed_match_score: number;
  travel_score: number;
  freshness_score: number;
  load_score: number;
  total_score: number;
  eta_minutes: number;
  distance_km: number;
  created_at?: string;
}

export interface Reservation {
  id: string;
  request_id: string;
  hospital_id: string;
  bed_type: BedType;
  status: ReservationStatus;
  requested_at: string;
  expires_at: string;
  responded_at?: string | null;
  accepted_by?: string | null;
  rejection_reason?: string | null;
  // Hydrated references for UI
  hospital_name?: string;
  patient_urgency?: Urgency;
  eta_minutes?: number;
  arrived_at?: string | null;
  notes?: string | null;
}

export interface ReservationEvent {
  id: string;
  reservation_id: string;
  event_type: 
    | 'reservation_created'
    | 'reservation_accepted'
    | 'reservation_rejected'
    | 'reservation_expired'
    | 'fallback_triggered'
    | 'bed_updated'
    | 'shadow_hold_created'    // Edge Case 1: pre-emptive hold at fallback hospital
    | 'shadow_hold_activated'  // Edge Case 1: shadow promoted to primary
    | 'shadow_hold_released'   // Edge Case 1: shadow released (primary was accepted)
    | 'race_condition_blocked'  // Edge Case 2: second carrier lost the race
    | 'auto_released_distant'  // Edge Case 3: farthest hold auto-released
    | 'reservation_cancelled'  // dispatcher withdrew a pending hold
    | 'reservation_arrived'    // ambulance arrived and handed over
    | 'reservation_released'   // no arrival by ETA + 15 min
    | 'reservation_bed_lost'   // bed was gone on arrival
    | 'message';               // quick message between ambulance crew and ER
  actor_id?: string | null;
  actor_name?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Short message between the ambulance crew and the hospital about one request. */
export interface QuickMessage {
  id: string;
  reservation_id: string;
  from: 'crew' | 'hospital';
  text: string;
  author: string;
  created_at: string;
}

export interface RankingWeights {
  bedMatch: number; // default 0.45
  travel: number;   // default 0.25
  freshness: number;// default 0.20
  load: number;     // default 0.10
  reliability: number; // default 0.10
}

export interface ScoredHospital {
  hospital: Hospital;
  inventory: Record<BedType, BedInventory>;
  capabilities: string[];
  distanceKm: number;
  etaMinutes: number;
  bedMatchScore: number;
  travelScore: number;
  freshnessScore: number;
  loadScore: number;
  totalScore: number;
  isExactMatch: boolean;
  missingResources: string[];
  lastUpdated: string;
  /** 0-1 from the hospital's reliability score */
  reliabilityScore?: number;
}

export interface PatientLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

export type FreshnessCategory = 'fresh' | 'recent' | 'aging' | 'stale';

export interface AuditLogItem {
  id: string;
  event_type: string;
  timestamp: string;
  actor: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface PatientVitals {
  gcs: number; // Glasgow Coma Scale (3 - 15)
  gcs_breakdown?: { eye: number; verbal: number; motor: number };
  bp: string; // e.g. "128/84"
  spo2: number; // percentage e.g. 97
  heart_rate: number; // bpm e.g. 84
  resp_rate: number; // /min e.g. 18
  temperature?: number; // deg F e.g. 98.6
  blood_glucose?: number; // mg/dL e.g. 115
}

export interface PatientHandoverRecord {
  id: string;
  reservation_id: string;
  patient_id: string;
  patient_name?: string;
  patient_age?: number;
  patient_gender?: string;
  chief_complaint: string;
  triage_level: 'red' | 'yellow' | 'green';
  vitals: PatientVitals;
  allergies?: string[];
  medications_administered?: string[];
  procedures_performed?: string[];
  paramedic_badge_id: string;
  ambulance_vehicle_id: string;
  destination_hospital_id: string;
  timestamp: string;
  sha256_hash: string;
  /**
   * Set when this is not a sheet the crew sent (so its seal can't be checked): sample data,
   * or a summary rebuilt from the bed history. Not part of the sealed content.
   */
  unsealed_reason?: string;
}

export interface BedHistoryLog {
  id: string;
  hospital_id: string;
  bed_type: BedType;
  bed_identifier: string; // e.g. "ICU-Bed-02", "Vent-Room-104"
  patient_id?: string;
  patient_name?: string;
  patient_age?: number;
  patient_gender?: string;
  diagnosis?: string;
  admitted_at: string;
  discharged_at?: string;
  status: 'occupied' | 'discharged' | 'reserved' | 'cleaning' | 'available';
  handover_sha256?: string;
  actor_name: string;
  // Clinical handover telemetry details
  vitals?: PatientVitals;
  allergies?: string[];
  medications_administered?: string[];
  procedures_performed?: string[];
  paramedic_badge_id?: string;
  ambulance_vehicle_id?: string;
  triage_level?: 'red' | 'yellow' | 'green';
}

/**
 * Edge Case 2 — In-flight concurrency lock guard.
 * Tracks which bed slot is currently being decremented so a
 * simultaneous second holdBedAtomic call blocks instead of
 * double-decrementing the same last bed.
 */
export interface BedHoldLock {
  hospitalId: string;
  bedType: BedType;
  lockedAt: number; // Date.now() ms timestamp
  lockedByRequestId: string;
}

/**
 * Edge Case 3 — Tracks all active holds per carrier/ambulance unit.
 * Key: carrier ambulance unit ID. Value: list of active reservation IDs + hospital distances.
 */
export interface CarrierActiveHolds {
  carrierId: string;   // ambulance / dispatcher unit ID
  requestId: string;   // the underlying emergency request
  holds: Array<{
    reservationId: string;
    hospitalId: string;
    distanceKm: number;
    heldAt: number; // ms timestamp
  }>;
}
