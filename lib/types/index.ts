export type BedType = 'icu' | 'ventilator' | 'oxygen' | 'emergency' | 'general';

export type Urgency = 'critical' | 'urgent' | 'normal';

export type Specialty = 'cardiac' | 'burns' | 'trauma' | 'neuro' | 'pediatric';

export type ReservationStatus = 
  | 'pending' 
  | 'accepted' 
  | 'rejected' 
  | 'expired' 
  | 'cancelled' 
  | 'completed';

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
    | 'bed_updated';
  actor_id?: string | null;
  actor_name?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RankingWeights {
  bedMatch: number; // default 0.45
  travel: number;   // default 0.25
  freshness: number;// default 0.20
  load: number;     // default 0.10
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
