import { getBrowserSupabaseClient, isSupabaseConfigured } from './client';
import { bedLinkStore } from '../data/store';
import { BedHistoryLog, BedInventory, BedType, EdStatus, Hospital, HospitalCapability, QuickMessage, Reservation, ReservationEvent } from '../types';
import { isUUID, ensureUUID, generateUUID } from '../crypto/uuid';

let initPromise: Promise<boolean> | null = null;
let syncInitialized = false;
let isConnected = false;
let lastSyncTime: string | null = null;
let serverClockTimer: ReturnType<typeof setInterval> | null = null;
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
export function initSupabaseSync(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (!isSupabaseConfigured()) {
    isConnected = false;
    notifyConnectionChange();
    return Promise.resolve(false);
  }
  if (initPromise) return initPromise;
  initPromise = runSupabaseSyncInit();
  return initPromise;
}

async function runSupabaseSyncInit(): Promise<boolean> {
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
    },
    onReservationStatus: (reservation) => {
      persistReservationStatus(reservation);
    },
    onCountsConfirmed: (hospitalId, confirmedAt, actorId, actorName) => {
      persistCountsConfirmed(hospitalId, confirmedAt, actorId, actorName);
    },
    onBedDelta: (hospitalId, bedType, delta, actorName) => {
      persistBedDelta(hospitalId, bedType, delta, actorName);
    },
    onHoldCancelled: (reservation) => {
      persistHoldCancelled(reservation);
    },
    onReservationReleased: (reservation) => {
      persistReservationReleased(reservation);
    },
    onEdStatus: (hospitalId, status) => {
      persistEdStatus(hospitalId, status);
    },
    onMessage: (message) => {
      persistMessage(message);
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
        created_at: h.created_at,
        ed_status: h.ed_status || 'open',
        reliability: typeof h.reliability === 'number' ? h.reliability : 100
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
        updated_by: b.updated_by,
        updated_by_name: b.updated_by_name ?? null
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
        rejection_reason: r.rejection_reason || undefined,
        patient_urgency: r.patient_urgency || undefined,
        eta_minutes: typeof r.eta_minutes === 'number' ? r.eta_minutes : undefined,
        arrived_at: r.arrived_at || undefined
      }));

      for (const row of eventsRes.data || []) {
        const message = messageFromEventRow(row as Record<string, unknown>);
        if (message) bedLinkStore.applyExternalMessage(message);
      }

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

    // 2. Setup Supabase Realtime Channels (safely remove old channel if exists to avoid duplicate callbacks)
    const existingChannels = supabase.getChannels();
    const oldChannel = existingChannels.find((c) => c.topic === 'realtime:bedlink_live_bus');
    if (oldChannel) {
      await supabase.removeChannel(oldChannel);
    }

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
              updated_by: row.updated_by ? String(row.updated_by) : undefined,
              updated_by_name: row.updated_by_name ? String(row.updated_by_name) : null
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
              rejection_reason: row.rejection_reason ? String(row.rejection_reason) : undefined,
              patient_urgency: row.patient_urgency ? (String(row.patient_urgency) as Reservation['patient_urgency']) : undefined,
              eta_minutes: typeof row.eta_minutes === 'number' ? row.eta_minutes : undefined,
              arrived_at: row.arrived_at ? String(row.arrived_at) : undefined
            });
            lastSyncTime = new Date().toLocaleTimeString();
            notifyConnectionChange();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservation_events' },
        (payload) => {
          const message = messageFromEventRow(payload.new as Record<string, unknown>);
          if (message) bedLinkStore.applyExternalMessage(message);
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
              load_updated_at: String(row.load_updated_at || new Date().toISOString()),
              ed_status: row.ed_status ? (String(row.ed_status) as EdStatus) : undefined,
              reliability: typeof row.reliability === 'number' ? row.reliability : undefined
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
              status: (row.status as BedHistoryLog['status']) || 'occupied',
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

    // Backup for the database's own 10-second timer (pg_cron): while any BedLink screen is open,
    // ask the server to expire overdue holds. Harmless if the timer already ran.
    if (!serverClockTimer) {
      serverClockTimer = setInterval(() => {
        void supabase.rpc('tick_holds').then(
          () => undefined,
          () => undefined
        );
      }, 15000);
    }

    return true;
  } catch (err) {
    console.warn('Supabase sync initialization warning:', err);
    initPromise = null;
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
    // updated_by must be a valid UUID referencing profiles(id) — null for non-UUID actor IDs
    const isValidUUID = actorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId);
    await supabase
      .from('bed_inventory')
      .update({
        available_beds: newAvailable,
        updated_at: new Date().toISOString(),
        updated_by: isValidUUID ? actorId : null
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
    const safeReservationId = ensureUUID(reservation.id);
    const safeRequestId = ensureUUID(reservation.request_id);
    const safeHospitalId = ensureUUID(reservation.hospital_id);

    // 1. Ensure emergency_request row exists (request_id FK must resolve)
    const request = bedLinkStore.getActiveEmergencyRequests().find((r) => r.id === reservation.request_id);
    const { error: reqErr } = await supabase.from('emergency_requests').upsert({
      id: safeRequestId,
      patient_latitude: request?.patient_latitude ?? 19.2158,
      patient_longitude: request?.patient_longitude ?? 72.8623,
      urgency: request?.urgency ?? 'critical',
      required_bed_type: request?.required_bed_type ?? reservation.bed_type,
      required_specialty: request?.required_specialty ?? null,
      status: 'holding'
    }, { onConflict: 'id' });

    if (reqErr) {
      console.warn('[BedLink] emergency_requests upsert warning:', reqErr.message);
    }

    // 2. The race-safe hold on the server: takes the bed only while one is free
    const { data: held, error: holdErr } = await supabase.rpc('hold_bed', {
      p_reservation_id: safeReservationId,
      p_request_id: safeRequestId,
      p_hospital_id: safeHospitalId,
      p_bed_type: reservation.bed_type,
      p_urgency: reservation.patient_urgency ?? null,
      p_eta_minutes: reservation.eta_minutes ?? null
    });
    if (!holdErr) {
      const result = (held ?? {}) as { success?: boolean; error?: string };
      if (result.success === false) {
        bedLinkStore.rollbackHold(
          reservation.id,
          result.error === 'diversion'
            ? 'Hospital is on diversion'
            : 'Another ambulance got the last bed first'
        );
      }
      return;
    }
    if (!isMissingFunction(holdErr)) {
      console.error('[BedLink] hold_bed error:', holdErr.message);
      return;
    }

    // Database not upgraded yet (spec_features SQL not run): old direct writes
    const allowedStatuses = ['pending', 'accepted', 'rejected', 'expired', 'cancelled', 'completed', 'shadow', 'auto_released'];
    const safeStatus = allowedStatuses.includes(reservation.status) ? reservation.status : 'pending';

    const { error: resErr } = await supabase.from('reservations').upsert({
      id: safeReservationId,
      request_id: safeRequestId,
      hospital_id: safeHospitalId,
      bed_type: reservation.bed_type,
      status: safeStatus,
      requested_at: reservation.requested_at,
      expires_at: reservation.expires_at
    }, { onConflict: 'id' });

    if (resErr) {
      console.error('[BedLink] Reservation upsert error:', resErr.message, resErr.details);
      return;
    }

    // 3. Update bed inventory count (triggers Realtime on other devices)
    const currentBeds = bedLinkStore.getBedInventories(reservation.hospital_id).find((b) => b.bed_type === reservation.bed_type);
    if (currentBeds) {
      const { error: bedErr } = await supabase
        .from('bed_inventory')
        .update({
          available_beds: currentBeds.available_beds,
          updated_at: new Date().toISOString(),
          updated_by: isUUID(actorId) ? actorId : null
        })
        .eq('hospital_id', safeHospitalId)
        .eq('bed_type', reservation.bed_type);
      if (bedErr) {
        console.warn('[BedLink] bed_inventory update warning:', bedErr.message);
      }
    }

    // 4. Log audit event
    await supabase.from('reservation_events').insert({
      id: generateUUID(),
      reservation_id: safeReservationId,
      event_type: 'reservation_created',
      actor_id: isUUID(actorId) ? actorId : null,
      metadata: {
        hospital_id: safeHospitalId,
        bed_type: reservation.bed_type,
        expires_at: reservation.expires_at
      }
    });
  } catch (err) {
    console.warn('[BedLink] Failed to persist reservation hold to Supabase:', err);
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
    const safeResId = ensureUUID(reservationId);
    const safeHospId = ensureUUID(hospitalId);
    const status = action === 'accept' ? 'accepted' : 'rejected';

    await supabase
      .from('reservations')
      .update({
        status,
        responded_at: new Date().toISOString(),
        accepted_by: action === 'accept' && isUUID(actorId) ? actorId : null,
        rejection_reason: action === 'reject' ? (rejectionReason || null) : null
      })
      .eq('id', safeResId);

    // Rejected: the held bed goes back (+1 on the server; accepting changes no counts)
    if (action === 'reject') {
      const { error: adjErr } = await supabase.rpc('adjust_bed_count', {
        p_hospital_id: safeHospId,
        p_bed_type: bedType,
        p_delta: 1,
        p_actor_name: null
      });
      if (adjErr && isMissingFunction(adjErr)) {
        const currentBeds = bedLinkStore.getBedInventories(hospitalId).find((b) => b.bed_type === bedType);
        if (currentBeds) {
          await supabase
            .from('bed_inventory')
            .update({
              available_beds: currentBeds.available_beds,
              updated_at: new Date().toISOString(),
              updated_by: isUUID(actorId) ? actorId : null
            })
            .eq('hospital_id', safeHospId)
            .eq('bed_type', bedType);
        }
      }
    }

    // Log audit event
    await supabase.from('reservation_events').insert({
      id: generateUUID(),
      reservation_id: safeResId,
      event_type: action === 'accept' ? 'reservation_accepted' : 'reservation_rejected',
      actor_id: isUUID(actorId) ? actorId : null,
      metadata: {
        action,
        rejection_reason: rejectionReason || null
      }
    });
  } catch (err) {
    console.warn('[BedLink] Failed to persist reservation response to Supabase:', err);
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
    // The server clock expires holds and gives beds back; only fall back if it is not installed
    const { error: tickErr } = await supabase.rpc('tick_holds');
    if (!tickErr || !isMissingFunction(tickErr)) return;

    const safeResId = ensureUUID(reservationId);
    const safeHospId = ensureUUID(hospitalId);

    await supabase
      .from('reservations')
      .update({
        status: 'expired',
        responded_at: new Date().toISOString()
      })
      .eq('id', safeResId);

    // Restore inventory — fires Realtime bed_inventory update on all devices
    const currentBeds = bedLinkStore.getBedInventories(hospitalId).find((b) => b.bed_type === bedType);
    if (currentBeds) {
      await supabase
        .from('bed_inventory')
        .update({
          available_beds: currentBeds.available_beds,
          updated_at: new Date().toISOString(),
          updated_by: null
        })
        .eq('hospital_id', safeHospId)
        .eq('bed_type', bedType);
    }
  } catch (err) {
    console.warn('[BedLink] Failed to persist expired reservation to Supabase:', err);
  }
}

/** A quick message stored as a reservation_events row (event_type 'message'), or null. */
function messageFromEventRow(row: Record<string, unknown> | null | undefined): QuickMessage | null {
  if (!row || row.event_type !== 'message') return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.text !== 'string') return null;
  return {
    id: String(row.id),
    reservation_id: String(row.reservation_id),
    from: meta.from === 'hospital' ? 'hospital' : 'crew',
    text: meta.text,
    author: typeof meta.author === 'string' ? meta.author : '',
    created_at: String(row.created_at ?? new Date().toISOString())
  };
}

/** Saves a quick message so the other side's screen gets it through realtime. */
export async function persistMessage(message: QuickMessage) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.from('reservation_events').insert({
      id: message.id,
      reservation_id: ensureUUID(message.reservation_id),
      event_type: 'message',
      actor_id: null,
      metadata: { from: message.from, text: message.text, author: message.author },
      created_at: message.created_at
    });
    if (error) console.warn('[BedLink] message not saved:', error.message);
  } catch (err) {
    console.warn('[BedLink] Failed to save message:', err);
  }
}

/** The database function is not installed yet (spec_features SQL not run). */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? ''));
}

/** A column is not there yet (spec_features SQL not run). */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (error.code === 'PGRST204' || error.code === '42703' || /could not find the .* column|column .* does not exist/i.test(error.message ?? ''))
  );
}

/**
 * +1 / -1 on a bed count, done by the database so two people changing the same count at once
 * both count (no overwriting). Falls back to writing the whole number if not installed.
 */
export async function persistBedDelta(hospitalId: string, bedType: BedType, delta: number, actorName?: string) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc('adjust_bed_count', {
      p_hospital_id: ensureUUID(hospitalId),
      p_bed_type: bedType,
      p_delta: delta,
      p_actor_name: actorName ?? null
    });
    if (!error) return;
    if (!isMissingFunction(error)) {
      console.warn('[BedLink] adjust_bed_count warning:', error.message);
      return;
    }
    const current = bedLinkStore.getBedInventories(hospitalId).find((b) => b.bed_type === bedType);
    if (current) await persistBedUpdate(hospitalId, bedType, current.available_beds);
  } catch (err) {
    console.warn('[BedLink] Failed to save bed change:', err);
  }
}

/** Dispatcher cancelled a pending hold: the server marks it and frees the bed in one step. */
export async function persistHoldCancelled(reservation: Reservation) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc('cancel_hold', { p_reservation_id: ensureUUID(reservation.id) });
    if (!error) return;
    if (!isMissingFunction(error)) {
      console.warn('[BedLink] cancel_hold warning:', error.message);
      return;
    }
    await persistReservationStatus(reservation);
    const current = bedLinkStore
      .getBedInventories(reservation.hospital_id)
      .find((b) => b.bed_type === reservation.bed_type);
    if (current) await persistBedUpdate(reservation.hospital_id, reservation.bed_type, current.available_beds);
  } catch (err) {
    console.warn('[BedLink] Failed to save cancelled hold:', err);
  }
}

/** No arrival by ETA + 15 min: the server clock releases it; fall back to direct writes. */
export async function persistReservationReleased(reservation: Reservation) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc('tick_holds');
    if (!error || !isMissingFunction(error)) return;
    await persistReservationStatus(reservation);
    const current = bedLinkStore
      .getBedInventories(reservation.hospital_id)
      .find((b) => b.bed_type === reservation.bed_type);
    if (current) await persistBedUpdate(reservation.hospital_id, reservation.bed_type, current.available_beds);
  } catch (err) {
    console.warn('[BedLink] Failed to save released hold:', err);
  }
}

/** Open / Busy / Diversion, saved through the coordinator-checked database function. */
export async function persistEdStatus(hospitalId: string, status: EdStatus) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc('set_ed_status', { p_hospital_id: ensureUUID(hospitalId), p_status: status });
    if (error) console.warn('[BedLink] set_ed_status warning (run the spec_features SQL?):', error.message);
  } catch (err) {
    console.warn('[BedLink] Failed to save hospital status:', err);
  }
}

/**
 * Admin "Reset demo": puts the shared database back to the demo bed counts with fresh times
 * and cancels every open hold, so all phones reset together (they follow through realtime).
 * Call after bedLinkStore.resetToDefaults(), which provides the values to write.
 */
export async function resetDemoInDatabase(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return null;

  const now = new Date().toISOString();
  const { error: resErr } = await supabase
    .from('reservations')
    .update({ status: 'cancelled', responded_at: now })
    .in('status', ['pending', 'accepted', 'shadow']);
  if (resErr) return `Could not clear open holds: ${resErr.message}`;

  for (const hospital of bedLinkStore.getHospitals()) {
    await supabase
      .from('hospitals')
      .update({ current_load: hospital.current_load, load_updated_at: hospital.load_updated_at })
      .eq('id', ensureUUID(hospital.id));
    for (const inv of bedLinkStore.getBedInventories(hospital.id)) {
      const { error } = await supabase
        .from('bed_inventory')
        .update({ total_beds: inv.total_beds, available_beds: inv.available_beds, updated_at: inv.updated_at })
        .eq('hospital_id', ensureUUID(hospital.id))
        .eq('bed_type', inv.bed_type);
      if (error) return `Could not reset ${hospital.name}: ${error.message}`;
    }
  }
  return null;
}

/**
 * "All counts still correct": refreshes the update time of every bed type at this hospital.
 * Only the times are written, so a count someone changed meanwhile is never overwritten.
 */
export async function persistCountsConfirmed(
  hospitalId: string,
  confirmedAt: string,
  actorId?: string,
  actorName?: string
) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    const base = { updated_at: confirmedAt, updated_by: isUUID(actorId) ? actorId : null };
    let { error } = await supabase
      .from('bed_inventory')
      .update({ ...base, updated_by_name: actorName ?? null })
      .eq('hospital_id', ensureUUID(hospitalId));
    if (error && isMissingColumn(error)) {
      ({ error } = await supabase.from('bed_inventory').update(base).eq('hospital_id', ensureUUID(hospitalId)));
    }
    if (error) console.warn('[BedLink] counts confirm warning:', error.message);
  } catch (err) {
    console.warn('[BedLink] Failed to save counts confirmation to Supabase:', err);
  }
}

/**
 * Saves a status / deadline change on its own: a shadow pre-hold promoted to pending
 * (the hospital then sees the request) or released after another hospital accepted.
 */
export async function persistReservationStatus(reservation: Reservation) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('reservations')
      .update({
        status: reservation.status,
        expires_at: reservation.expires_at,
        responded_at: reservation.responded_at ?? null
      })
      .eq('id', ensureUUID(reservation.id));
    if (error) console.warn('[BedLink] reservation status update warning:', error.message);
    if (!error && reservation.arrived_at) {
      // Optional column (spec_features SQL); ignore if it is not there yet
      await supabase.from('reservations').update({ arrived_at: reservation.arrived_at }).eq('id', ensureUUID(reservation.id));
    }
  } catch (err) {
    console.warn('[BedLink] Failed to persist reservation status to Supabase:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BED INVENTORY UPSERT — Persist new/updated bed inventory rows
// ═══════════════════════════════════════════════════════════════════════

/**
 * Upserts a complete bed_inventory row to Supabase.
 * Use this when adding a new bed type (INSERT) or updating total/available counts.
 * Falls back gracefully if Supabase is not configured.
 */
export async function persistBedInventoryUpsert(inv: {
  id: string;
  hospital_id: string;
  bed_type: string;
  total_beds: number;
  available_beds: number;
  updated_by?: string | null;
}) {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return;
  try {
    const { error } = await supabase.from('bed_inventory').upsert({
      id: inv.id,
      hospital_id: inv.hospital_id,
      bed_type: inv.bed_type,
      total_beds: inv.total_beds,
      available_beds: inv.available_beds,
      updated_at: new Date().toISOString(),
      updated_by: inv.updated_by ?? null,
    }, { onConflict: 'hospital_id,bed_type' });
    if (error) {
      console.warn('[BedLink] bed_inventory upsert warning:', error.message);
    }
  } catch (err) {
    console.warn('[BedLink] Failed to upsert bed inventory to Supabase:', err);
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
