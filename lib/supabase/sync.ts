import { getBrowserSupabaseClient, isSupabaseConfigured } from './client';
import { bedLinkStore } from '../data/store';
import { BedHistoryLog, BedInventory, BedType, Hospital, HospitalCapability, Reservation, ReservationEvent } from '../types';

let syncInitialized = false;
let isConnected = false;
let lastSyncTime: string | null = null;
const connectionListeners = new Set<(status: { configured: boolean; connected: boolean; lastSyncTime: string | null }) => void>();

function notifyConnectionChange() {
  const status = {
    configured: isSupabaseConfigured(),
    connected: isConnected,
    lastSyncTime
  };
  connectionListeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      // Ignore listener error
    }
  });
}

export function subscribeSupabaseStatus(fn: (status: { configured: boolean; connected: boolean; lastSyncTime: string | null }) => void) {
  connectionListeners.add(fn);
  fn({
    configured: isSupabaseConfigured(),
    connected: isConnected,
    lastSyncTime
  });
  return () => {
    connectionListeners.delete(fn);
  };
}

export function getSupabaseStatus() {
  return {
    configured: isSupabaseConfigured(),
    connected: isConnected,
    lastSyncTime
  };
}

/**
 * Initializes two-way Supabase Synchronization:
 * 1. Initial snapshot fetch from PostgreSQL
 * 2. Supabase Realtime WebSocket subscription on tables
 */
export async function initSupabaseSync(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isSupabaseConfigured()) {
    isConnected = false;
    notifyConnectionChange();
    return false;
  }
  if (syncInitialized) return isConnected;

  const supabase = getBrowserSupabaseClient();
  if (!supabase) return false;

  syncInitialized = true;

  // Register outbound persistence handler with bedLinkStore
  bedLinkStore.registerSyncHandler({
    onBedUpdate: (hospitalId, bedType, newAvailable, actorId) => {
      persistBedUpdate(hospitalId, bedType, newAvailable, actorId);
    },
    onReservationHold: (reservation, actorId) => {
      persistReservationHold(reservation, actorId);
    },
    onReservationResponse: (reservationId, hospitalId, bedType, action, actorId, rejectionReason) => {
      persistReservationResponse(reservationId, hospitalId, bedType, action, actorId, rejectionReason);
    },
    onReservationExpired: (reservationId, hospitalId, bedType) => {
      persistReservationExpired(reservationId, hospitalId, bedType);
    }
  });

  try {
    // 1. Initial Data Fetch
    const [hospitalsRes, capsRes, bedsRes, reservationsRes, eventsRes, historyRes] = await Promise.all([
      supabase.from('hospitals').select('*'),
      supabase.from('hospital_capabilities').select('*'),
      supabase.from('bed_inventory').select('*'),
      supabase.from('reservations').select('*').order('requested_at', { ascending: false }).limit(50),
      supabase.from('reservation_events').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('bed_history_logs').select('*').order('admitted_at', { ascending: false }).limit(50)
    ]);

    if (!hospitalsRes.error && hospitalsRes.data && hospitalsRes.data.length > 0) {
      const liveHospitals: Hospital[] = hospitalsRes.data.map((h) => ({
        id: h.id,
        organization_id: h.organization_id,
        name: h.name,
        address: h.address,
        latitude: Number(h.latitude),
        longitude: Number(h.longitude),
        emergency_capacity: Number(h.emergency_capacity),
        current_load: Number(h.current_load),
        load_updated_at: h.load_updated_at || new Date().toISOString(),
        is_active: h.is_active ?? true,
        phone: h.phone || undefined,
        created_at: h.created_at
      }));

      const liveCaps: HospitalCapability[] = (capsRes.data || []).map((c) => ({
        id: c.id,
        hospital_id: c.hospital_id,
        capability: c.capability
      }));

      const liveBeds: BedInventory[] = (bedsRes.data || []).map((b) => ({
        id: b.id,
        hospital_id: b.hospital_id,
        bed_type: b.bed_type as BedType,
        total_beds: Number(b.total_beds),
        available_beds: Number(b.available_beds),
        updated_at: b.updated_at,
        updated_by: b.updated_by
      }));

      const liveReservations: Reservation[] = (reservationsRes.data || []).map((r) => ({
        id: r.id,
        request_id: r.request_id,
        hospital_id: r.hospital_id,
        bed_type: r.bed_type as BedType,
        status: r.status,
        requested_at: r.requested_at,
        expires_at: r.expires_at,
        responded_at: r.responded_at || undefined,
        accepted_by: r.accepted_by || undefined,
        rejection_reason: r.rejection_reason || undefined
      }));

      const liveEvents: ReservationEvent[] = (eventsRes.data || []).map((e) => ({
        id: e.id,
        reservation_id: e.reservation_id,
        event_type: e.event_type,
        actor_id: e.actor_id || undefined,
        actor_name: e.actor_name || undefined,
        metadata: e.metadata || {},
        created_at: e.created_at
      }));

      const liveHistory: BedHistoryLog[] = (historyRes?.data || []).map((h) => ({
        id: h.id,
        hospital_id: h.hospital_id,
        bed_type: h.bed_type as BedType,
        bed_identifier: h.bed_identifier,
        patient_id: h.patient_id || undefined,
        patient_name: h.patient_name || undefined,
        diagnosis: h.diagnosis || undefined,
        admitted_at: h.admitted_at,
        discharged_at: h.discharged_at || undefined,
        status: h.status,
        handover_sha256: h.handover_sha256 || undefined,
        actor_name: h.actor_name,
      }));

      bedLinkStore.hydrateFromSerialized({
        hospitals: liveHospitals,
        capabilities: liveCaps,
        bedInventories: liveBeds,
        reservations: liveReservations,
        reservationEvents: liveEvents,
        bedHistoryLogs: liveHistory.length > 0 ? liveHistory : undefined,
      });

      isConnected = true;
      lastSyncTime = new Date().toLocaleTimeString();
      notifyConnectionChange();
    } else {
      // Tables might be empty or schema not yet seeded; mark connected
      isConnected = true;
      lastSyncTime = new Date().toLocaleTimeString();
      notifyConnectionChange();
    }

    // 2. Setup Supabase Realtime Channels
    const channel = supabase
      .channel('bedlink_live_bus')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bed_inventory' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const row = payload.new as Record<string, unknown>;
            bedLinkStore.applyExternalBedUpdate({
              id: String(row.id || ''),
              hospital_id: String(row.hospital_id || ''),
              bed_type: row.bed_type as BedType,
              total_beds: Number(row.total_beds || 0),
              available_beds: Number(row.available_beds || 0),
              updated_at: String(row.updated_at || new Date().toISOString()),
              updated_by: row.updated_by ? String(row.updated_by) : undefined
            });
            lastSyncTime = new Date().toLocaleTimeString();
            notifyConnectionChange();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const row = payload.new as Record<string, unknown>;
            bedLinkStore.applyExternalReservation({
              id: String(row.id || ''),
              request_id: String(row.request_id || ''),
              hospital_id: String(row.hospital_id || ''),
              bed_type: row.bed_type as BedType,
              status: String(row.status || 'pending') as Reservation['status'],
              requested_at: String(row.requested_at || new Date().toISOString()),
              expires_at: String(row.expires_at || new Date().toISOString()),
              responded_at: row.responded_at ? String(row.responded_at) : undefined,
              accepted_by: row.accepted_by ? String(row.accepted_by) : undefined,
              rejection_reason: row.rejection_reason ? String(row.rejection_reason) : undefined
            });
            lastSyncTime = new Date().toLocaleTimeString();
            notifyConnectionChange();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hospitals' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const row = payload.new as Record<string, unknown>;
            bedLinkStore.applyExternalHospitalUpdate({
              id: String(row.id),
              current_load: Number(row.current_load),
              load_updated_at: String(row.load_updated_at || new Date().toISOString())
            });
            lastSyncTime = new Date().toLocaleTimeString();
            notifyConnectionChange();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bed_history_logs' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const row = payload.new as Record<string, unknown>;
            bedLinkStore.applyExternalBedHistoryLog({
              id: String(row.id),
              hospital_id: String(row.hospital_id),
              bed_type: row.bed_type as BedType,
              bed_identifier: String(row.bed_identifier),
              patient_id: row.patient_id ? String(row.patient_id) : undefined,
              patient_name: row.patient_name ? String(row.patient_name) : undefined,
              diagnosis: row.diagnosis ? String(row.diagnosis) : undefined,
              admitted_at: String(row.admitted_at || new Date().toISOString()),
              discharged_at: row.discharged_at ? String(row.discharged_at) : undefined,
              status: (row.status as any) || 'occupied',
              handover_sha256: row.handover_sha256 ? String(row.handover_sha256) : undefined,
              actor_name: String(row.actor_name || 'Staff Nurse'),
            });
            lastSyncTime = new Date().toLocaleTimeString();
            notifyConnectionChange();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isConnected = true;
          notifyConnectionChange();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isConnected = false;
          notifyConnectionChange();
        }
      });

    return true;
  } catch (err) {
    console.warn('Supabase sync initialization warning:', err);
    isConnected = false;
    notifyConnectionChange();
    return false;
  }
}

/**
 * Asynchronously persists bed count updates to Supabase
 */
export async function persistBedUpdate(hospitalId: string, bedType: BedType, newAvailable: number, actorId?: string) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    await supabase
      .from('bed_inventory')
      .update({
        available_beds: newAvailable,
        updated_at: new Date().toISOString(),
        updated_by: actorId || null
      })
      .eq('hospital_id', hospitalId)
      .eq('bed_type', bedType);
  } catch (err) {
    console.warn('Failed to persist bed update to Supabase:', err);
  }
}

/**
 * Asynchronously persists reservation hold to Supabase
 */
export async function persistReservationHold(reservation: Reservation, actorId?: string) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    // 1. Insert reservation
    await supabase.from('reservations').insert({
      id: reservation.id,
      request_id: reservation.request_id,
      hospital_id: reservation.hospital_id,
      bed_type: reservation.bed_type,
      status: reservation.status,
      requested_at: reservation.requested_at,
      expires_at: reservation.expires_at
    });

    // 2. Decrement bed inventory
    const currentBeds = bedLinkStore.getBedInventories(reservation.hospital_id).find((b) => b.bed_type === reservation.bed_type);
    if (currentBeds) {
      await supabase
        .from('bed_inventory')
        .update({
          available_beds: currentBeds.available_beds,
          updated_at: new Date().toISOString(),
          updated_by: actorId || null
        })
        .eq('hospital_id', reservation.hospital_id)
        .eq('bed_type', reservation.bed_type);
    }

    // 3. Log event
    await supabase.from('reservation_events').insert({
      reservation_id: reservation.id,
      event_type: 'reservation_created',
      actor_id: actorId || null,
      metadata: {
        hospital_id: reservation.hospital_id,
        bed_type: reservation.bed_type,
        expires_at: reservation.expires_at
      }
    });
  } catch (err) {
    console.warn('Failed to persist reservation hold to Supabase:', err);
  }
}

/**
 * Asynchronously persists reservation acceptance or rejection to Supabase
 */
export async function persistReservationResponse(
  reservationId: string,
  hospitalId: string,
  bedType: BedType,
  action: 'accept' | 'reject',
  actorId?: string,
  rejectionReason?: string
) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    const status = action === 'accept' ? 'accepted' : 'rejected';
    await supabase
      .from('reservations')
      .update({
        status,
        responded_at: new Date().toISOString(),
        accepted_by: action === 'accept' ? (actorId || null) : null,
        rejection_reason: action === 'reject' ? (rejectionReason || null) : null
      })
      .eq('id', reservationId);

    // If rejected, restore bed count in Supabase
    if (action === 'reject') {
      const currentBeds = bedLinkStore.getBedInventories(hospitalId).find((b) => b.bed_type === bedType);
      if (currentBeds) {
        await supabase
          .from('bed_inventory')
          .update({
            available_beds: currentBeds.available_beds,
            updated_at: new Date().toISOString(),
            updated_by: actorId || null
          })
          .eq('hospital_id', hospitalId)
          .eq('bed_type', bedType);
      }
    }

    // Log event
    await supabase.from('reservation_events').insert({
      reservation_id: reservationId,
      event_type: action === 'accept' ? 'reservation_accepted' : 'reservation_rejected',
      actor_id: actorId || null,
      metadata: {
        action,
        rejection_reason: rejectionReason || null
      }
    });
  } catch (err) {
    console.warn('Failed to persist reservation response to Supabase:', err);
  }
}

/**
 * Asynchronously persists reservation expiration to Supabase
 */
export async function persistReservationExpired(reservationId: string, hospitalId: string, bedType: BedType) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    await supabase
      .from('reservations')
      .update({
        status: 'expired',
        responded_at: new Date().toISOString()
      })
      .eq('id', reservationId);

    const currentBeds = bedLinkStore.getBedInventories(hospitalId).find((b) => b.bed_type === bedType);
    if (currentBeds) {
      await supabase
        .from('bed_inventory')
        .update({
          available_beds: currentBeds.available_beds,
          updated_at: new Date().toISOString()
        })
        .eq('hospital_id', hospitalId)
        .eq('bed_type', bedType);
    }
  } catch (err) {
    console.warn('Failed to persist expired reservation to Supabase:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BED HISTORY LOG — Persist to Supabase (cross-device audit trail)
// ═══════════════════════════════════════════════════════════════════════
export async function persistBedHistoryLog(log: {
  id: string;
  hospital_id: string;
  bed_type: string;
  bed_identifier: string;
  patient_id?: string;
  patient_name?: string;
  diagnosis?: string;
  admitted_at: string;
  discharged_at?: string;
  status: string;
  handover_sha256?: string;
  actor_name: string;
}) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('bed_history_logs').upsert({
      id: log.id,
      hospital_id: log.hospital_id,
      bed_type: log.bed_type,
      bed_identifier: log.bed_identifier,
      patient_id: log.patient_id || null,
      patient_name: log.patient_name || null,
      diagnosis: log.diagnosis || null,
      admitted_at: log.admitted_at,
      discharged_at: log.discharged_at || null,
      status: log.status,
      handover_sha256: log.handover_sha256 || null,
      actor_name: log.actor_name,
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[BedLink] Failed to persist bed history log:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PATIENT HANDOVER — Persist SHA-256 sealed record to Supabase
// ═══════════════════════════════════════════════════════════════════════
export async function persistPatientHandover(handover: {
  reservation_id: string;
  patient_id: string;
  patient_name?: string;
  patient_age?: number;
  patient_gender?: string;
  chief_complaint: string;
  triage_level: string;
  vitals: Record<string, unknown>;
  allergies?: string[];
  medications_administered?: string[];
  paramedic_badge_id: string;
  ambulance_vehicle_id: string;
  destination_hospital_id: string;
  sha256_hash: string;
}) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('patient_handovers').upsert({
      reservation_id: handover.reservation_id,
      patient_id: handover.patient_id,
      patient_name: handover.patient_name || null,
      patient_age: handover.patient_age || null,
      patient_gender: handover.patient_gender || null,
      chief_complaint: handover.chief_complaint,
      triage_level: handover.triage_level,
      vitals: handover.vitals,
      allergies: handover.allergies ? JSON.stringify(handover.allergies) : null,
      medications_administered: handover.medications_administered ? JSON.stringify(handover.medications_administered) : null,
      paramedic_badge_id: handover.paramedic_badge_id,
      ambulance_vehicle_id: handover.ambulance_vehicle_id,
      destination_hospital_id: handover.destination_hospital_id,
      sha256_hash: handover.sha256_hash,
    }, { onConflict: 'reservation_id' });
  } catch (err) {
    console.warn('[BedLink] Failed to persist patient handover:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FETCH BED HISTORY — Load from Supabase (cross-device)
// ═══════════════════════════════════════════════════════════════════════
export async function fetchBedHistoryLogs(hospitalId?: string) {
  if (!isSupabaseConfigured()) return [];
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return [];
  try {
    let query = supabase
      .from('bed_history_logs')
      .select('*')
      .order('admitted_at', { ascending: false })
      .limit(100);
    if (hospitalId) {
      query = query.eq('hospital_id', hospitalId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[BedLink] Failed to fetch bed history logs:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SIGN OUT
// ═══════════════════════════════════════════════════════════════════════
export async function signOut() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('bedlink_operator_session');
  }
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // Ignore sign out error
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET CURRENT USER PROFILE
// ═══════════════════════════════════════════════════════════════════════
export async function getCurrentUserProfile(): Promise<{
  id: string;
  email: string;
  name: string;
  role: string;
} | null> {
  const supabase = getBrowserSupabaseClient();
  if (supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        return {
          id: user.id,
          email: user.email || '',
          name: profile?.name || user.email?.split('@')[0] || 'Operator',
          role: profile?.role || 'nurse',
        };
      }
    } catch {
      // Supabase user fetch failed, fallback to local session
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('bedlink_operator_session');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore parse error
    }
  }

  return null;
}
