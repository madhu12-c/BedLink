import {
  AuditLogItem,
  BedHoldLock,
  BedHistoryLog,
  BedInventory,
  BedType,
  CarrierActiveHolds,
  EmergencyRequest,
  Hospital,
  HospitalCapability,
  PatientHandoverRecord,
  Reservation,
  ReservationEvent,
  ReservationStatus,
  ScoredHospital,
  EdStatus,
  Urgency,
  QuickMessage
} from '../types';
import {
  INITIAL_BED_INVENTORY,
  INITIAL_CAPABILITIES,
  INITIAL_HOSPITALS,
  SEED_REFERENCE_MS
} from '../demo/seed-data';
import { INITIAL_BED_HISTORY_LOGS } from '../demo/bed-history-data';
import { generateDefaultHandover } from '../crypto/handoverSha';
import { generateUUID, ensureUUID } from '../crypto/uuid';
import { rankHospitals } from '../dispatch/ranking';

export type SyncHandler = {
  onBedUpdate?: (hospitalId: string, bedType: BedType, newAvailable: number, actorId?: string) => void;
  onReservationHold?: (reservation: Reservation, actorId?: string) => void;
  onReservationResponse?: (
    reservationId: string,
    hospitalId: string,
    bedType: BedType,
    action: 'accept' | 'reject',
    actorId?: string,
    rejectionReason?: string
  ) => void;
  onReservationExpired?: (reservationId: string, hospitalId: string, bedType: BedType) => void;
  /** Status / deadline change with no other side effects (shadow hold promoted or released). */
  onReservationStatus?: (reservation: Reservation) => void;
  /** Staff confirmed every count is still right: refresh the times only, never the counts. */
  onCountsConfirmed?: (hospitalId: string, confirmedAt: string, actorId?: string, actorName?: string) => void;
  /** +1 / -1 on a bed count, applied on the server so concurrent changes add up. */
  onBedDelta?: (hospitalId: string, bedType: BedType, delta: number, actorName?: string) => void;
  /** Dispatcher withdrew a pending hold. */
  onHoldCancelled?: (reservation: Reservation) => void;
  /** Accepted but no arrival by ETA + 15 min: the bed was given back. */
  onReservationReleased?: (reservation: Reservation) => void;
  /** Open / Busy / Diversion changed. */
  onEdStatus?: (hospitalId: string, status: EdStatus) => void;
  /** Quick message between crew and ER. */
  onMessage?: (message: QuickMessage) => void;
};

// In-memory persistent state (retains changes during session & syncs across tabs via BroadcastChannel)
class BedLinkDataStore {
  private hospitals: Hospital[] = [];
  private capabilities: HospitalCapability[] = [];
  private bedInventories: BedInventory[] = [];
  private reservations: Reservation[] = [];
  private reservationEvents: ReservationEvent[] = [];
  private emergencyRequests: EmergencyRequest[] = [];
  private bedHistoryLogs: BedHistoryLog[] = [];
  private patientHandovers: Map<string, PatientHandoverRecord> = new Map();
  private messages: QuickMessage[] = [];
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<(event: { type: string; payload: unknown }) => void> = new Set();
  private expirationInterval: NodeJS.Timeout | null = null;
  private syncHandler: SyncHandler | null = null;

  // ─── EDGE CASE STATE ────────────────────────────────────────────────────────
  /**
   * EC-2: In-flight bed-hold concurrency locks.
   * Key: `${hospitalId}::${bedType}` → lock entry.
   * Cleared after holdBedAtomic completes or after 500 ms safety TTL.
   */
  private bedHoldLocks: Map<string, BedHoldLock> = new Map();

  /**
   * EC-3: Per-carrier active hold registry.
   * Key: `${carrierId}::${requestId}` → CarrierActiveHolds.
   */
  private carrierHolds: Map<string, CarrierActiveHolds> = new Map();

  constructor() {
    this.resetToDefaults();

    // Setup cross-tab realtime synchronization if in browser
    if (typeof window !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('bedlink_realtime_bus');
        this.broadcastChannel.onmessage = (msg) => {
          if (msg.data?.type === 'SYNC_STATE') {
            this.hydrateFromSerialized(msg.data.payload);
            this.notifyListeners('SYNC_STATE', null);
          } else if (msg.data?.type) {
            // Keep this tab's copy in step with the other tab (otherwise e.g. Accept here
            // cannot find a request the dispatcher tab created), then tell the screen.
            const react = this.applyPeerTabState(msg.data.type, msg.data.payload);
            this.notifyListeners(msg.data.type, msg.data.payload);
            react?.();
          }
        };
      } catch {
        // Fallback for environments where BroadcastChannel is unavailable
      }

      // Authoritative expiration checker every 2 seconds
      this.expirationInterval = setInterval(() => {
        this.checkAndExpirePendingReservations();
      }, 2000);
    }
  }

  public registerSyncHandler(handler: SyncHandler) {
    this.syncHandler = handler;
  }

  public hydrateFromSerialized(data: {
    hospitals?: Hospital[];
    capabilities?: HospitalCapability[];
    bedInventories?: BedInventory[];
    reservations?: Reservation[];
    reservationEvents?: ReservationEvent[];
    bedHistoryLogs?: BedHistoryLog[];
  }) {
    if (!data) return;
    if ((data.hospitals?.length ?? 0) > 0 || (data.bedInventories?.length ?? 0) > 0) this.usingSeedData = false;
    if (data.hospitals && data.hospitals.length > 0) this.hospitals = data.hospitals;
    if (data.capabilities && data.capabilities.length > 0) this.capabilities = data.capabilities;
    if (data.bedInventories && data.bedInventories.length > 0) this.bedInventories = data.bedInventories;
    if (data.reservations) this.reservations = data.reservations;
    if (data.reservationEvents) this.reservationEvents = data.reservationEvents;
    if (data.bedHistoryLogs && data.bedHistoryLogs.length > 0) this.bedHistoryLogs = data.bedHistoryLogs;
    this.notifyListeners('SYNC_STATE', null);
  }

  public applyExternalBedUpdate(item: BedInventory) {
    const idx = this.bedInventories.findIndex(
      (b) => b.hospital_id === item.hospital_id && b.bed_type === item.bed_type
    );
    if (idx >= 0) {
      this.bedInventories[idx] = { ...this.bedInventories[idx], ...item };
    } else {
      this.bedInventories.push(item);
    }
    const hosp = this.hospitals.find((h) => h.id === item.hospital_id);
    if (hosp) {
      const hospBeds = this.bedInventories.filter((b) => b.hospital_id === item.hospital_id);
      const total = hospBeds.reduce((acc, curr) => acc + curr.total_beds, 0);
      const avail = hospBeds.reduce((acc, curr) => acc + curr.available_beds, 0);
      if (total > 0) {
        hosp.current_load = Math.round(((total - avail) / total) * 100);
        hosp.load_updated_at = new Date().toISOString();
      }
    }
    this.broadcast('bed_updated', {
      hospitalId: item.hospital_id,
      bedType: item.bed_type,
      available_beds: item.available_beds,
      inv: item
    });
  }

  public applyExternalReservation(item: Reservation) {
    const { changed, react } = this.mergeReservation(item);
    // Our own write echoing back from Supabase: nothing new, so don't announce it twice.
    if (!changed) return;
    const hosp = this.getHospital(item.hospital_id);
    const enriched = { ...item, hospital_name: hosp?.name || 'Hospital' };
    this.broadcast(BedLinkDataStore.eventForStatus(item.status), { reservation: enriched });
    react?.();
  }

  private static eventForStatus(status: ReservationStatus): string {
    switch (status) {
      case 'pending':
        return 'reservation_created';
      case 'accepted':
        return 'reservation_accepted';
      case 'rejected':
        return 'reservation_rejected';
      case 'expired':
        return 'reservation_expired';
      case 'shadow':
        // A pre-hold: not a request the hospital has to answer yet
        return 'shadow_hold_created';
      case 'cancelled':
        return 'reservation_cancelled';
      case 'bed_lost':
        return 'reservation_bed_lost';
      case 'released':
        return 'reservation_released';
      default:
        return 'reservation_updated';
    }
  }

  /**
   * Stores a reservation that changed somewhere else (another tab or device). Returns whether
   * its status changed, and what this store must do about it: only the store that owns the
   * request (the dispatcher's screen that created it) re-routes after a reject or timeout, and
   * frees its shadow pre-holds once another hospital accepts.
   */
  private mergeReservation(item: Reservation): { changed: boolean; react?: () => void } {
    const idx = this.reservations.findIndex((r) => r.id === item.id);
    const knownStatus = idx >= 0 ? this.reservations[idx].status : null;
    if (idx >= 0) {
      this.reservations[idx] = { ...this.reservations[idx], ...item };
    } else {
      this.reservations.unshift(item);
    }
    if (knownStatus === item.status) return { changed: false };

    const current = idx >= 0 ? this.reservations[idx] : item;
    if (!this.ownsRequest(current.request_id)) return { changed: true };
    if (knownStatus === 'pending' && (item.status === 'rejected' || item.status === 'expired')) {
      return { changed: true, react: () => void this.runFallback(current) };
    }
    if (item.status === 'bed_lost' && (knownStatus === 'accepted' || knownStatus === 'pending')) {
      return { changed: true, react: () => void this.runFallback(current) };
    }
    if (item.status === 'accepted') {
      return {
        changed: true,
        react: () => this.releaseShadowHoldsForRequest(current.request_id, current.hospital_id)
      };
    }
    return { changed: true };
  }

  /** Applies a change another tab in this browser made, without sending it back out. */
  private applyPeerTabState(type: string, payload: unknown): (() => void) | undefined {
    const data = (payload ?? {}) as {
      reservation?: Reservation;
      newReservation?: Reservation;
      shadow?: Reservation;
      inv?: BedInventory;
    };
    if (type === 'reservation_message') {
      const message = (payload as { message?: QuickMessage } | null)?.message;
      if (message && !this.messages.some((m) => m.id === message.id)) this.messages.push(message);
      return undefined;
    }
    if (type === 'bed_updated' && data.inv) {
      const inv = data.inv;
      const idx = this.bedInventories.findIndex(
        (b) => b.hospital_id === inv.hospital_id && b.bed_type === inv.bed_type
      );
      if (idx >= 0) this.bedInventories[idx] = { ...this.bedInventories[idx], ...inv };
      else this.bedInventories.push({ ...inv });
      return undefined;
    }
    const reservation = data.reservation ?? data.newReservation ?? data.shadow;
    if (reservation?.id && reservation.request_id) {
      return this.mergeReservation({ ...reservation }).react;
    }
    return undefined;
  }

  /**
   * Registers (or refreshes) the emergency request this screen is dispatching. Only the
   * dispatcher's own store holds it, which makes that store the one that re-routes when a
   * hold is rejected or times out, even when the hospital answered on another device.
   */
  public upsertEmergencyRequest(request: Omit<EmergencyRequest, 'created_at' | 'status'>): EmergencyRequest {
    const existing = this.emergencyRequests.find((r) => r.id === request.id);
    if (existing) {
      Object.assign(existing, request);
      return existing;
    }
    const created: EmergencyRequest = { ...request, status: 'active', created_at: new Date().toISOString() };
    this.emergencyRequests.unshift(created);
    return created;
  }

  private ownsRequest(requestId: string): boolean {
    return this.emergencyRequests.some((r) => r.id === requestId);
  }

  /**
   * After a reject or timeout: promote a shadow pre-hold if there is one, else hold the
   * next-best hospital. Runs once, and only in the store that owns the request.
   */
  private runFallback(failed: Reservation): ScoredHospital | null {
    if (!this.ownsRequest(failed.request_id)) return null;
    // Already re-routed, or another hospital is holding / has accepted this patient
    const stillOpen = this.reservations.some(
      (r) => r.request_id === failed.request_id && (r.status === 'pending' || r.status === 'accepted')
    );
    if (stillOpen) return null;
    if (this.activateShadowHold(failed.request_id, failed.hospital_id)) return null;
    return this.triggerAutomaticFallbackWithShadows(failed.request_id, failed.hospital_id);
  }

  public applyExternalHospitalUpdate(update: {
    id: string;
    current_load: number;
    load_updated_at: string;
    ed_status?: EdStatus;
    reliability?: number;
  }) {
    const hosp = this.hospitals.find((h) => h.id === update.id);
    if (hosp) {
      hosp.current_load = update.current_load;
      hosp.load_updated_at = update.load_updated_at;
      if (update.ed_status) hosp.ed_status = update.ed_status;
      if (typeof update.reliability === 'number') hosp.reliability = update.reliability;
      this.broadcast('hospital_updated', hosp);
    }
  }

  /** Reliability (0-100): reject -2, timeout -5, bed lost on arrival -15, arrival +1. */
  private adjustReliability(hospitalId: string, delta: number) {
    const hosp = this.hospitals.find((h) => h.id === hospitalId);
    if (!hosp) return;
    hosp.reliability = Math.max(0, Math.min(100, (hosp.reliability ?? 100) + delta));
    this.broadcast('hospital_updated', hosp);
  }

  /** Coordinator sets Open / Busy / Diversion. On diversion, dispatch never picks this hospital. */
  public setEdStatus(hospitalId: string, status: EdStatus): Hospital {
    const hosp = this.hospitals.find((h) => h.id === hospitalId);
    if (!hosp) throw new Error('Hospital not found');
    hosp.ed_status = status;
    this.broadcast('hospital_updated', hosp);
    this.syncHandler?.onEdStatus?.(hospitalId, status);
    return hosp;
  }

  /** Messages for one request, oldest first. */
  public getMessages(reservationId: string): QuickMessage[] {
    return this.messages.filter((m) => m.reservation_id === reservationId);
  }

  /**
   * Quick message between the ambulance crew and the ER ("patient unconscious", "use gate 2").
   * Short, no patient names.
   */
  public sendMessage(reservationId: string, from: QuickMessage['from'], text: string, author: string): QuickMessage {
    const clean = text.trim().slice(0, 140);
    if (!clean) throw new Error('Type a message first.');
    const message: QuickMessage = {
      id: generateUUID(),
      reservation_id: reservationId,
      from,
      text: clean,
      author,
      created_at: new Date().toISOString()
    };
    this.messages.push(message);
    this.broadcast('reservation_message', { message });
    this.syncHandler?.onMessage?.(message);
    return message;
  }

  /** A message that arrived from another device. */
  public applyExternalMessage(message: QuickMessage) {
    if (this.messages.some((m) => m.id === message.id)) return;
    this.messages.push(message);
    this.messages.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    this.broadcast('reservation_message', { message });
  }

  /** True while hospitals and beds are the built-in demo set (not loaded from Supabase). */
  private usingSeedData = true;
  private demoClockStarted = false;

  /**
   * Demo data uses fixed times so the server and the browser render the same page. Once the
   * page runs in the browser, shift them so ages count from now (e.g. one hospital stays about
   * 45 minutes stale) instead of drifting to "1 day ago" as the day goes on.
   */
  public startDemoClock() {
    if (this.demoClockStarted) return;
    this.demoClockStarted = true;
    if (this.usingSeedData) {
      this.rebaseSeedTimes();
      this.notifyListeners('SYNC_STATE', null);
    }
  }

  private rebaseSeedTimes() {
    const offset = Date.now() - SEED_REFERENCE_MS;
    const shift = (iso: string) => new Date(Date.parse(iso) + offset).toISOString();
    for (const h of this.hospitals) {
      h.load_updated_at = shift(h.load_updated_at);
      if (h.created_at) h.created_at = shift(h.created_at);
    }
    for (const b of this.bedInventories) b.updated_at = shift(b.updated_at);
  }

  public resetToDefaults() {
    this.usingSeedData = true;
    this.hospitals = JSON.parse(JSON.stringify(INITIAL_HOSPITALS));
    this.capabilities = JSON.parse(JSON.stringify(INITIAL_CAPABILITIES));
    this.bedInventories = JSON.parse(JSON.stringify(INITIAL_BED_INVENTORY));
    this.reservations = [];
    this.reservationEvents = [];
    this.emergencyRequests = [];
    this.bedHistoryLogs = JSON.parse(JSON.stringify(INITIAL_BED_HISTORY_LOGS));
    this.patientHandovers = new Map();
    if (this.demoClockStarted) this.rebaseSeedTimes();
  }

  private broadcast(type: string, payload: unknown) {
    this.notifyListeners(type, payload);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type, payload });
      } catch {
        // Ignore broadcast failure
      }
    }
  }

  private notifyListeners(type: string, payload: unknown) {
    this.listeners.forEach((listener) => {
      try {
        listener({ type, payload });
      } catch (err) {
        console.error('Listener error in BedLinkDataStore:', err);
      }
    });
  }

  public subscribe(listener: (event: { type: string; payload: unknown }) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // --- QUERY METHODS ---

  public getHospitals(): Hospital[] {
    return [...this.hospitals];
  }

  public getHospital(id: string): Hospital | undefined {
    return this.hospitals.find((h) => h.id === id);
  }

  public getHospitalCapabilities(hospitalId: string): string[] {
    return this.capabilities
      .filter((c) => c.hospital_id === hospitalId)
      .map((c) => c.capability);
  }

  public getBedInventories(hospitalId: string): BedInventory[] {
    return this.bedInventories.filter((b) => b.hospital_id === hospitalId);
  }

  public getHospitalCandidates() {
    return this.hospitals.map((hospital) => {
      const invList = this.getBedInventories(hospital.id);
      const inventoryRecord = {} as Record<BedType, BedInventory>;
      for (const item of invList) {
        inventoryRecord[item.bed_type] = item;
      }
      return {
        hospital,
        inventory: inventoryRecord,
        capabilities: this.getHospitalCapabilities(hospital.id)
      };
    });
  }

  public getReservations(hospitalId?: string): Reservation[] {
    let list = [...this.reservations];
    if (hospitalId) {
      list = list.filter((r) => r.hospital_id === hospitalId);
    }
    return list.map((res) => {
      const hosp = this.getHospital(res.hospital_id);
      return {
        ...res,
        hospital_name: hosp?.name || 'Unknown Hospital'
      };
    });
  }

  public getActiveEmergencyRequests(): EmergencyRequest[] {
    return [...this.emergencyRequests];
  }

  public getReservationEvents(reservationId?: string): ReservationEvent[] {
    if (reservationId) {
      return this.reservationEvents.filter((e) => e.reservation_id === reservationId);
    }
    return [...this.reservationEvents].reverse();
  }

  public getAuditLogs(): AuditLogItem[] {
    return this.reservationEvents.map((evt) => {
      const res = this.reservations.find((r) => r.id === evt.reservation_id);
      const hosp = res ? this.getHospital(res.hospital_id) : undefined;
      return {
        id: evt.id,
        event_type: evt.event_type,
        timestamp: evt.created_at,
        actor: evt.actor_name || 'System Auto-Coordinator',
        description: `Event [${evt.event_type}] for ${hosp?.name || 'Hospital'} (${res?.bed_type.toUpperCase() || 'BED'})`,
        metadata: evt.metadata
      };
    });
  }

  // --- MUTATION METHODS ---

  /**
   * Hospital Nurse Fast Bed Inventory Update.
   * Target: 10-second workflow, single tap + / - with optimistic sync.
   */
  public updateBedCount(
    hospitalId: string,
    bedType: BedType,
    delta: number,
    actorId = 'nurse-1',
    actorName = 'Staff Nurse'
  ): BedInventory {
    const inv = this.bedInventories.find(
      (b) => b.hospital_id === hospitalId && b.bed_type === bedType
    );

    if (!inv) {
      throw new Error(`Inventory record not found for hospital ${hospitalId} and bed ${bedType}`);
    }

    const newCount = Math.max(0, Math.min(inv.total_beds, inv.available_beds + delta));
    const appliedDelta = newCount - inv.available_beds;
    inv.available_beds = newCount;
    inv.updated_at = new Date().toISOString();
    inv.updated_by = actorId;
    inv.updated_by_name = actorName;

    // Recalculate hospital load approximately
    const hosp = this.hospitals.find((h) => h.id === hospitalId);
    if (hosp) {
      const hospBeds = this.bedInventories.filter((b) => b.hospital_id === hospitalId);
      const total = hospBeds.reduce((acc, curr) => acc + curr.total_beds, 0);
      const avail = hospBeds.reduce((acc, curr) => acc + curr.available_beds, 0);
      if (total > 0) {
        hosp.current_load = Math.round(((total - avail) / total) * 100);
        hosp.load_updated_at = new Date().toISOString();
      }
    }

    this.broadcast('bed_updated', { hospitalId, bedType, available_beds: newCount, inv, actorName });
    if (this.syncHandler?.onBedDelta) {
      if (appliedDelta !== 0) this.syncHandler.onBedDelta(hospitalId, bedType, appliedDelta, actorName);
    } else {
      this.syncHandler?.onBedUpdate?.(hospitalId, bedType, newCount, actorId);
    }
    return { ...inv };
  }

  /**
   * "All counts still correct": staff checked the ward and nothing changed. Marks every bed
   * type of this hospital as updated now without touching the numbers, so the hospital no
   * longer looks stale to dispatch (data age and ranking both use these times).
   */
  public confirmCountsUnchanged(hospitalId: string, actorId = 'nurse-1', actorName = 'Staff Nurse'): string {
    const beds = this.bedInventories.filter((b) => b.hospital_id === hospitalId);
    if (beds.length === 0) {
      throw new Error('No bed counts found for this hospital.');
    }
    const confirmedAt = new Date().toISOString();
    for (const inv of beds) {
      inv.updated_at = confirmedAt;
      inv.updated_by = actorId;
      inv.updated_by_name = actorName;
      this.broadcast('bed_updated', {
        hospitalId,
        bedType: inv.bed_type,
        available_beds: inv.available_beds,
        inv,
        actorName
      });
    }
    const hosp = this.hospitals.find((h) => h.id === hospitalId);
    if (hosp) hosp.load_updated_at = confirmedAt;
    this.syncHandler?.onCountsConfirmed?.(hospitalId, confirmedAt, actorId, actorName);
    return confirmedAt;
  }

  /**
   * Hospital Coordinator / Nurse update total capacity of beds.
   */
  public updateTotalBeds(
    hospitalId: string,
    bedType: BedType,
    delta: number,
    actorId = 'nurse-1',
    actorName = 'Staff Nurse'
  ): BedInventory {
    const inv = this.bedInventories.find(
      (b) => b.hospital_id === hospitalId && b.bed_type === bedType
    );

    if (!inv) {
      throw new Error(`Inventory record not found for hospital ${hospitalId} and bed ${bedType}`);
    }

    const newTotal = Math.max(1, inv.total_beds + delta);
    inv.total_beds = newTotal;
    if (delta > 0) {
      inv.available_beds = Math.min(newTotal, inv.available_beds + delta);
    } else {
      inv.available_beds = Math.min(newTotal, inv.available_beds);
    }
    inv.updated_at = new Date().toISOString();
    inv.updated_by = actorId;

    // Recalculate hospital load
    const hosp = this.hospitals.find((h) => h.id === hospitalId);
    if (hosp) {
      const hospBeds = this.bedInventories.filter((b) => b.hospital_id === hospitalId);
      const total = hospBeds.reduce((acc, curr) => acc + curr.total_beds, 0);
      const avail = hospBeds.reduce((acc, curr) => acc + curr.available_beds, 0);
      if (total > 0) {
        hosp.current_load = Math.round(((total - avail) / total) * 100);
        hosp.load_updated_at = new Date().toISOString();
      }
    }

    this.broadcast('bed_updated', { hospitalId, bedType, available_beds: inv.available_beds, total_beds: newTotal, inv, actorName });
    this.syncHandler?.onBedUpdate?.(hospitalId, bedType, inv.available_beds, actorId);
    return { ...inv };
  }

  /**
   * Dispatcher creates emergency request
   */
  public createEmergencyRequest(requestData: Omit<EmergencyRequest, 'id' | 'created_at' | 'status'>): EmergencyRequest {
    const newReq: EmergencyRequest = {
      ...requestData,
      id: generateUUID(),
      status: 'active',
      created_at: new Date().toISOString()
    };
    this.emergencyRequests.unshift(newReq);
    this.broadcast('request_created', newReq);
    return newReq;
  }

  /**
   * ATOMIC BED HOLD (Step 14 & 15)
   * Locks inventory, verifies availability, decrements bed, creates 2-minute reservation.
   * Throws if no available bed (resource conflict).
   */
  public holdBedAtomic(
    requestId: string,
    hospitalId: string,
    bedType: BedType,
    actorId = 'disp-1',
    actorName = 'Dispatcher Control',
    options?: {
      isShadow?: boolean;        // EC-1: pre-emptive shadow slot
      carrierId?: string;        // EC-3: ambulance/carrier unit ID
      distanceKm?: number;       // EC-3: distance used for auto-release ranking
      urgency?: Urgency;         // sent to the hospital with the request
      etaMinutes?: number;       // real drive time, so the hospital knows when to expect them
    }
  ): Reservation {
    const safeRequestId = ensureUUID(requestId);
    const lockKey = `${hospitalId}::${bedType}`;

    // ── EC-2: Race-condition guard ──────────────────────────────────────────
    // JS is single-threaded so synchronous code can't truly race, but two
    // async callers (paramedic app + dispatcher) firing within the same tick
    // via BroadcastChannel can.  We set a hard lock that survives the tick.
    const existingLock = this.bedHoldLocks.get(lockKey);
    if (existingLock && existingLock.lockedByRequestId !== safeRequestId) {
      // Another request is currently holding the lock for this bed slot.
      // Log a blocked event and throw so the caller can re-route.
      const blockedEvent: ReservationEvent = {
        id: generateUUID(),
        reservation_id: 'race-block',
        event_type: 'race_condition_blocked',
        actor_id: actorId,
        actor_name: actorName,
        metadata: {
          blocked_request_id: safeRequestId,
          lock_held_by: existingLock.lockedByRequestId,
          hospital_id: hospitalId,
          bed_type: bedType
        },
        created_at: new Date().toISOString()
      };
      this.reservationEvents.unshift(blockedEvent);
      this.broadcast('race_condition_blocked', {
        requestId: safeRequestId,
        hospitalId,
        bedType,
        blockedByRequestId: existingLock.lockedByRequestId
      });
      throw new Error(
        `[EC-2 Race Blocked] Bed ${bedType} at ${hospitalId} is being locked by another carrier. Patient will be re-routed.`
      );
    }

    // Acquire lock
    this.bedHoldLocks.set(lockKey, {
      hospitalId,
      bedType,
      lockedAt: Date.now(),
      lockedByRequestId: safeRequestId
    });

    // ── EC-3: Auto-release farthest hold if same carrier ───────────────────
    if (options?.carrierId && options?.distanceKm !== undefined) {
      this.enforceCarrierSingleHold(
        options.carrierId,
        safeRequestId,
        hospitalId,
        options.distanceKm
      );
    }

    try {
      // 1. Inventory check
      const inv = this.bedInventories.find(
        (b) => b.hospital_id === hospitalId && b.bed_type === bedType
      );

      if (!inv) {
        throw new Error(`Bed inventory record not found for hospital ${hospitalId}`);
      }

      if (inv.available_beds <= 0) {
        throw new Error(
          '[EC-2] This bed is no longer available. Another emergency unit has already reserved it.'
        );
      }

      // 2. Atomically decrement
      inv.available_beds -= 1;
      inv.updated_at = new Date().toISOString();
      inv.updated_by = actorId;

      // 3. Create reservation (shadow or primary)
      const reservationId = generateUUID();
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

      const reservation: Reservation = {
        id: reservationId,
        request_id: safeRequestId,
        hospital_id: hospitalId,
        bed_type: bedType,
        status: options?.isShadow ? 'shadow' : 'pending',
        requested_at: new Date().toISOString(),
        expires_at: expiresAt,
        hospital_name: this.getHospital(hospitalId)?.name,
        patient_urgency: options?.urgency,
        eta_minutes: options?.etaMinutes
      };
      this.reservations.unshift(reservation);

      // 4. Audit event
      const eventType = options?.isShadow ? 'shadow_hold_created' : 'reservation_created';
      const event: ReservationEvent = {
        id: generateUUID(),
        reservation_id: reservationId,
        event_type: eventType,
        actor_id: actorId,
        actor_name: actorName,
        metadata: {
          hospital_id: hospitalId,
          bed_type: bedType,
          expires_at: expiresAt,
          requestId: safeRequestId,
          is_shadow: options?.isShadow ?? false
        },
        created_at: new Date().toISOString()
      };
      this.reservationEvents.unshift(event);

      // 5. Update request status
      const req = this.emergencyRequests.find((r) => r.id === requestId);
      if (req) {
        req.status = 'holding';
      }

      // 6. Register in carrier hold map (EC-3)
      if (options?.carrierId && options?.distanceKm !== undefined) {
        const carrierKey = `${options.carrierId}::${requestId}`;
        const existing = this.carrierHolds.get(carrierKey);
        if (existing) {
          existing.holds.push({
            reservationId,
            hospitalId,
            distanceKm: options.distanceKm,
            heldAt: Date.now()
          });
        } else {
          this.carrierHolds.set(carrierKey, {
            carrierId: options.carrierId,
            requestId,
            holds: [{ reservationId, hospitalId, distanceKm: options.distanceKm, heldAt: Date.now() }]
          });
        }
      }

      this.broadcast(options?.isShadow ? 'shadow_hold_created' : 'reservation_created', {
        reservation,
        event
      });
      this.broadcast('bed_updated', { hospitalId, bedType, available_beds: inv.available_beds, inv });
      this.syncHandler?.onReservationHold?.(reservation, actorId);

      return reservation;
    } finally {
      // Release lock immediately after decrement completes
      this.bedHoldLocks.delete(lockKey);
    }
  }

  /**
   * Dispatcher withdraws a pending hold (e.g. tapped the wrong hospital). The bed is freed right
   * away and the hospital's request card goes away.
   */
  public cancelHold(reservationId: string, actorId = 'disp-1', actorName = 'Dispatcher'): Reservation {
    const reservation = this.reservations.find((r) => r.id === reservationId);
    if (!reservation) {
      throw new Error('Reservation not found');
    }
    if (reservation.status !== 'pending') {
      throw new Error(`Only a hold that is still waiting can be cancelled (now: ${reservation.status}).`);
    }
    const now = new Date().toISOString();
    reservation.status = 'cancelled';
    reservation.responded_at = now;

    const inv = this.bedInventories.find(
      (b) => b.hospital_id === reservation.hospital_id && b.bed_type === reservation.bed_type
    );
    if (inv) {
      inv.available_beds = Math.min(inv.total_beds, inv.available_beds + 1);
      inv.updated_at = now;
    }

    const event: ReservationEvent = {
      id: generateUUID(),
      reservation_id: reservation.id,
      event_type: 'reservation_cancelled',
      actor_id: actorId,
      actor_name: actorName,
      metadata: { hospital_id: reservation.hospital_id, reason: 'Cancelled by dispatcher' },
      created_at: now
    };
    this.reservationEvents.unshift(event);

    this.broadcast('reservation_cancelled', { reservation, event });
    if (inv) {
      this.broadcast('bed_updated', {
        hospitalId: reservation.hospital_id,
        bedType: reservation.bed_type,
        available_beds: inv.available_beds,
        inv
      });
    }
    if (this.syncHandler?.onHoldCancelled) {
      this.syncHandler.onHoldCancelled(reservation);
    } else {
      this.syncHandler?.onReservationStatus?.(reservation);
      if (inv) this.syncHandler?.onBedUpdate?.(reservation.hospital_id, reservation.bed_type, inv.available_beds, actorId);
    }
    return reservation;
  }

  /**
   * The server refused a hold this screen already showed (another ambulance got the last bed
   * first, or the hospital went on diversion). Undo it here and, for our own patient, move on
   * to the next hospital straight away.
   */
  public rollbackHold(reservationId: string, reason: string) {
    const reservation = this.reservations.find((r) => r.id === reservationId);
    if (!reservation || reservation.status !== 'pending') return;
    reservation.status = 'cancelled';
    reservation.responded_at = new Date().toISOString();
    reservation.rejection_reason = reason;
    const inv = this.bedInventories.find(
      (b) => b.hospital_id === reservation.hospital_id && b.bed_type === reservation.bed_type
    );
    if (inv) inv.available_beds = Math.min(inv.total_beds, inv.available_beds + 1);
    this.broadcast('reservation_conflict', { reservation, reason });
    this.runFallback(reservation);
  }

  /**
   * Hospital: the ambulance arrived but the held bed was gone. Costs reliability (-15) and the
   * dispatcher's screen re-routes the patient to the next hospital.
   */
  public markBedLost(reservationId: string, actorId = 'coordinator', actorName = 'Hospital Coordinator'): Reservation {
    const reservation = this.reservations.find((r) => r.id === reservationId);
    if (!reservation) throw new Error('Reservation not found');
    if (reservation.status !== 'accepted' && reservation.status !== 'pending') {
      throw new Error(`This request is already ${reservation.status}.`);
    }
    const now = new Date().toISOString();
    reservation.status = 'bed_lost';
    reservation.responded_at = now;
    const event: ReservationEvent = {
      id: generateUUID(),
      reservation_id: reservation.id,
      event_type: 'reservation_bed_lost',
      actor_id: actorId,
      actor_name: actorName,
      metadata: { hospital_id: reservation.hospital_id },
      created_at: now
    };
    this.reservationEvents.unshift(event);
    this.adjustReliability(reservation.hospital_id, -15);
    this.broadcast('reservation_bed_lost', { reservation, event });
    this.syncHandler?.onReservationStatus?.(reservation);
    this.runFallback(reservation);
    return reservation;
  }

  /**
   * Hospital Responds to Reservation (Accept / Reject) - Step 16, 17, 18
   */
  public respondReservationAtomic(
    reservationId: string,
    action: 'accept' | 'reject',
    actorId = 'nurse-1',
    actorName = 'Staff Nurse',
    rejectionReason?: string
  ): { success: boolean; status: ReservationStatus; nextHospital?: ScoredHospital | null } {
    const reservation = this.reservations.find((r) => r.id === reservationId);
    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (reservation.status !== 'pending') {
      throw new Error(`Reservation is no longer pending (current: ${reservation.status})`);
    }

    // Backend authoritative expiration check
    if (Date.now() > new Date(reservation.expires_at).getTime()) {
      this.expireReservationInternal(reservation, 'Response attempted after 2-minute deadline');
      throw new Error('Reservation deadline expired (2 minutes exceeded)');
    }

    if (action === 'accept') {
      reservation.status = 'accepted';
      reservation.responded_at = new Date().toISOString();
      reservation.accepted_by = actorId;

      const req = this.emergencyRequests.find((r) => r.id === reservation.request_id);
      if (req) {
        req.status = 'matched';
      }

      const event: ReservationEvent = {
        id: generateUUID(),
        reservation_id: reservationId,
        event_type: 'reservation_accepted',
        actor_id: actorId,
        actor_name: actorName,
        metadata: {
          accepted_at: reservation.responded_at,
          hospital_id: reservation.hospital_id
        },
        created_at: new Date().toISOString()
      };
      this.reservationEvents.unshift(event);

      // EC-1: Release all shadow holds for the same request at OTHER hospitals
      this.releaseShadowHoldsForRequest(reservation.request_id, reservation.hospital_id);

      this.broadcast('reservation_accepted', { reservation, event });
      this.syncHandler?.onReservationResponse?.(reservationId, reservation.hospital_id, reservation.bed_type, 'accept', actorId);
      return { success: true, status: 'accepted' };
    } else {
      // Reject: restore held bed back into available inventory!
      reservation.status = 'rejected';
      reservation.responded_at = new Date().toISOString();
      reservation.rejection_reason = rejectionReason || 'Capacity temporarily constrained';

      const inv = this.bedInventories.find(
        (b) => b.hospital_id === reservation.hospital_id && b.bed_type === reservation.bed_type
      );
      if (inv) {
        inv.available_beds = Math.min(inv.total_beds, inv.available_beds + 1);
        inv.updated_at = new Date().toISOString();
      }

      const event: ReservationEvent = {
        id: generateUUID(),
        reservation_id: reservationId,
        event_type: 'reservation_rejected',
        actor_id: actorId,
        actor_name: actorName,
        metadata: {
          reason: reservation.rejection_reason,
          hospital_id: reservation.hospital_id
        },
        created_at: new Date().toISOString()
      };
      this.reservationEvents.unshift(event);

      this.adjustReliability(reservation.hospital_id, -2);
      this.broadcast('reservation_rejected', { reservation, event });
      if (inv) {
        this.broadcast('bed_updated', {
          hospitalId: reservation.hospital_id,
          bedType: reservation.bed_type,
          available_beds: inv.available_beds,
          inv
        });
      }

      this.syncHandler?.onReservationResponse?.(
        reservationId,
        reservation.hospital_id,
        reservation.bed_type,
        'reject',
        actorId,
        reservation.rejection_reason
      );

      // Step 20 — Automatic Fallback to Next Best Eligible Hospital (if this screen owns the request;
      // otherwise the dispatcher's screen does it when it hears about the rejection)
      const nextHospital = this.runFallback(reservation);

      return { success: true, status: 'rejected', nextHospital };
    }
  }

  public updateReservationStatus(
    reservationId: string,
    status: ReservationStatus,
    actorId = 'nurse-1',
    actorName = 'Staff Nurse'
  ): Reservation | undefined {
    const res = this.reservations.find((r) => r.id === reservationId);
    if (res) {
      res.status = status;
      res.responded_at = new Date().toISOString();
      if (status === 'accepted' || status === 'completed') {
        res.accepted_by = actorId;
      }
      if (status === 'completed' || status === 'arrived') {
        res.arrived_at = res.responded_at;
        this.adjustReliability(res.hospital_id, 1);
      }
      const event: ReservationEvent = {
        id: generateUUID(),
        reservation_id: reservationId,
        event_type: status === 'completed' ? 'reservation_accepted' : 'reservation_created',
        actor_id: actorId,
        actor_name: actorName,
        metadata: { status, hospital_id: res.hospital_id },
        created_at: new Date().toISOString()
      };
      this.reservationEvents.unshift(event);
      this.broadcast('reservation_updated', { reservation: res, event });
    }
    return res;
  }


  /**
   * Authoritative backend timeout check (Step 19)
   */
  public checkAndExpirePendingReservations() {
    const now = Date.now();
    for (const reservation of this.reservations) {
      if (reservation.status === 'pending') {
        const expiresTime = new Date(reservation.expires_at).getTime();
        if (now >= expiresTime) {
          this.expireReservationInternal(reservation, '2-minute hospital response timeout reached');
        }
      } else if (reservation.status === 'accepted' && !reservation.arrived_at) {
        // No arrival by ETA + 15 minutes: give the bed back
        const due = Date.parse(reservation.requested_at) + ((reservation.eta_minutes ?? 30) + 15) * 60_000;
        if (now >= due) this.releaseReservation(reservation);
      }
    }
  }

  private releaseReservation(reservation: Reservation) {
    reservation.status = 'released';
    reservation.responded_at = new Date().toISOString();
    const inv = this.bedInventories.find(
      (b) => b.hospital_id === reservation.hospital_id && b.bed_type === reservation.bed_type
    );
    if (inv) inv.available_beds = Math.min(inv.total_beds, inv.available_beds + 1);
    const event: ReservationEvent = {
      id: generateUUID(),
      reservation_id: reservation.id,
      event_type: 'reservation_released',
      actor_id: 'system',
      actor_name: 'Automated Timeout Monitor',
      metadata: { reason: 'No arrival by ETA + 15 min', hospital_id: reservation.hospital_id },
      created_at: reservation.responded_at
    };
    this.reservationEvents.unshift(event);
    this.broadcast('reservation_released', { reservation, event });
    if (inv) {
      this.broadcast('bed_updated', {
        hospitalId: reservation.hospital_id,
        bedType: reservation.bed_type,
        available_beds: inv.available_beds,
        inv
      });
    }
    this.syncHandler?.onReservationReleased?.(reservation);
  }

  private expireReservationInternal(reservation: Reservation, reason: string) {
    reservation.status = 'expired';
    reservation.responded_at = new Date().toISOString();

    // Reclaim bed
    const inv = this.bedInventories.find(
      (b) => b.hospital_id === reservation.hospital_id && b.bed_type === reservation.bed_type
    );
    if (inv) {
      inv.available_beds = Math.min(inv.total_beds, inv.available_beds + 1);
      inv.updated_at = new Date().toISOString();
    }

    const event: ReservationEvent = {
      id: generateUUID(),
      reservation_id: reservation.id,
      event_type: 'reservation_expired',
      actor_id: 'system',
      actor_name: 'Automated Timeout Monitor',
      metadata: { reason, hospital_id: reservation.hospital_id },
      created_at: new Date().toISOString()
    };
    this.reservationEvents.unshift(event);

    this.adjustReliability(reservation.hospital_id, -5);
    this.broadcast('reservation_expired', { reservation, event });
    if (inv) {
      this.broadcast('bed_updated', {
        hospitalId: reservation.hospital_id,
        bedType: reservation.bed_type,
        available_beds: inv.available_beds,
        inv
      });
    }

    this.syncHandler?.onReservationExpired?.(reservation.id, reservation.hospital_id, reservation.bed_type);

    // EC-1: shadow hold first, else full fallback + new shadow slots (owner screen only)
    this.runFallback(reservation);
  }

  /** Demo only: run the 2-minute timeout for this hold now instead of waiting. */
  public expireNowForDemo(reservationId: string) {
    const reservation = this.reservations.find((r) => r.id === reservationId && r.status === 'pending');
    if (!reservation) return;
    reservation.expires_at = new Date(Date.now() - 1000).toISOString();
    this.expireReservationInternal(reservation, 'Demo: skipped ahead to the 2-minute timeout');
  }

  /**
   * Original single-target fallback (kept for external callers)
   */
  public triggerAutomaticFallback(
    requestId: string,
    excludeHospitalId: string
  ): ScoredHospital | null {
    return this.triggerAutomaticFallbackWithShadows(requestId, excludeHospitalId);
  }

  /**
   * EC-1: Fallback that simultaneously pre-holds the TOP 2 next eligible hospitals.
   * Hospital #1 becomes 'pending' (the active fallback).
   * Hospital #2 becomes 'shadow' (a pre-emptive hold — no nurse action needed).
   *
   * This eliminates the 2-min dead wait if hospital #1 also ignores.
   * When #1 is accepted → all shadow slots for the same request are auto-released.
   * When #1 expires → shadow #2 is instantly promoted to 'pending'.
   */
  public triggerAutomaticFallbackWithShadows(
    requestId: string,
    excludeHospitalId: string
  ): ScoredHospital | null {
    const request = this.emergencyRequests.find((r) => r.id === requestId);
    if (!request) return null;

    // Collect all hospitals already contacted for this request (any status)
    const contactedHospitalIds = new Set(
      this.reservations
        .filter((r) => r.request_id === requestId)
        .map((r) => r.hospital_id)
    );
    contactedHospitalIds.add(excludeHospitalId);

    const candidates = this.getHospitalCandidates().filter(
      (c) => !contactedHospitalIds.has(c.hospital.id)
    );

    const ranking = rankHospitals(candidates, {
      patientLocation: {
        latitude: request.patient_latitude,
        longitude: request.patient_longitude
      },
      requiredBedType: request.required_bed_type,
      requiresVentilator: request.requires_ventilator,
      requiredSpecialty: request.required_specialty,
      urgency: request.urgency,
      needsFreeCare: request.needs_free_care
    });

    const ranked = [...ranking.exactMatches, ...ranking.partialMatches];
    const [primary] = ranked;

    // Hold primary as normal 'pending'
    if (primary) {
      try {
        const nextRes = this.holdBedAtomic(
          requestId,
          primary.hospital.id,
          request.required_bed_type,
          'system-fallback',
          'Automated Fallback Router',
          { urgency: request.urgency, etaMinutes: primary.etaMinutes }
        );
        const fallbackEvent: ReservationEvent = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}`,
          reservation_id: nextRes.id,
          event_type: 'fallback_triggered',
          actor_id: 'system',
          actor_name: 'Automatic Fallback Subsystem',
          metadata: {
            previous_hospital_id: excludeHospitalId,
            new_hospital_id: primary.hospital.id,
            hospital_name: primary.hospital.name,
            reason: 'Previous hospital rejected or timed out'
          },
          created_at: new Date().toISOString()
        };
        this.reservationEvents.unshift(fallbackEvent);
        this.broadcast('fallback_triggered', {
          requestId,
          previousHospitalId: excludeHospitalId,
          newReservation: nextRes,
          hospital: primary
        });
      } catch (err) {
        console.error('[EC-1] Primary fallback hold attempt failed:', err);
      }
    }

    // Shadow pre-holds at the next hospital are off: they took a real bed from a hospital that
    // never agreed to it. If this hospital also fails, the next one is held at that point.

    return primary;
  }

  /**
   * EC-1: Activate a pending shadow hold when the primary hospital times out.
   * Promotes the shadow reservation to 'pending' status — nurse sees it immediately.
   * Returns true if a shadow was found and promoted.
   */
  private activateShadowHold(requestId: string, failedHospitalId: string): boolean {
    const shadowRes = this.reservations.find(
      (r) =>
        r.request_id === requestId &&
        r.status === 'shadow' &&
        r.hospital_id !== failedHospitalId
    );
    if (!shadowRes) return false;

    shadowRes.status = 'pending';
    // The hospital gets a full 2 minutes from now, not what was left of the pre-hold
    shadowRes.expires_at = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const event: ReservationEvent = {
      id: generateUUID(),
      reservation_id: shadowRes.id,
      event_type: 'shadow_hold_activated',
      actor_id: 'system',
      actor_name: 'Shadow Activation Engine',
      metadata: {
        activated_from_failed_hospital: failedHospitalId,
        activated_hospital_id: shadowRes.hospital_id,
        request_id: requestId
      },
      created_at: new Date().toISOString()
    };
    this.reservationEvents.unshift(event);
    this.broadcast('reservation_created', { reservation: shadowRes, event });
    this.syncHandler?.onReservationStatus?.(shadowRes);
    console.info(
      `[EC-1] Shadow hold ACTIVATED at ${shadowRes.hospital_name} — no wait needed.`
    );
    return true;
  }

  /**
   * EC-1: When a primary hold is accepted, release all shadow holds
   * for the same request at other hospitals (free the pre-held beds).
   */
  private releaseShadowHoldsForRequest(requestId: string, acceptedHospitalId: string): void {
    const shadows = this.reservations.filter(
      (r) =>
        r.request_id === requestId &&
        r.status === 'shadow' &&
        r.hospital_id !== acceptedHospitalId
    );

    for (const shadow of shadows) {
      shadow.status = 'auto_released';
      shadow.responded_at = new Date().toISOString();

      // Restore the pre-held bed back to available
      const inv = this.bedInventories.find(
        (b) => b.hospital_id === shadow.hospital_id && b.bed_type === shadow.bed_type
      );
      if (inv) {
        inv.available_beds = Math.min(inv.total_beds, inv.available_beds + 1);
        inv.updated_at = new Date().toISOString();
      }

      const event: ReservationEvent = {
        id: generateUUID(),
        reservation_id: shadow.id,
        event_type: 'shadow_hold_released',
        actor_id: 'system',
        actor_name: 'Shadow Release Engine',
        metadata: {
          released_hospital_id: shadow.hospital_id,
          because_accepted_hospital_id: acceptedHospitalId,
          request_id: requestId
        },
        created_at: new Date().toISOString()
      };
      this.reservationEvents.unshift(event);

      if (inv) {
        this.broadcast('bed_updated', {
          hospitalId: shadow.hospital_id,
          bedType: shadow.bed_type,
          available_beds: inv.available_beds,
          inv
        });
      }
      this.broadcast('shadow_hold_released', { shadow, event });
      this.syncHandler?.onReservationStatus?.(shadow);
      if (inv) this.syncHandler?.onBedUpdate?.(shadow.hospital_id, shadow.bed_type, inv.available_beds, 'system');
      console.info(
        `[EC-1] Shadow hold at ${shadow.hospital_name} released (primary accepted at ${acceptedHospitalId}).`
      );
    }
  }

  /**
   * EC-3: If the same carrier (carrierId) has an existing active hold for the
   * SAME request at a DIFFERENT hospital, auto-release the FARTHER one.
   *
   * Why: paramedic taps two hospitals in quick succession (fat-finger / delay).
   * The system should keep only the NEAREST hold and release the other.
   */
  private enforceCarrierSingleHold(
    carrierId: string,
    requestId: string,
    newHospitalId: string,
    newDistanceKm: number
  ): void {
    const carrierKey = `${carrierId}::${requestId}`;
    const existing = this.carrierHolds.get(carrierKey);
    if (!existing || existing.holds.length === 0) return;

    // Find the farthest among all existing + new
    const allHolds = [
      ...existing.holds,
      { reservationId: '__incoming__', hospitalId: newHospitalId, distanceKm: newDistanceKm, heldAt: Date.now() }
    ];
    const farthest = allHolds.reduce((a, b) => (a.distanceKm >= b.distanceKm ? a : b));

    // If the farthest is NOT the incoming new hold, release the existing farthest
    if (farthest.reservationId !== '__incoming__') {
      const resToRelease = this.reservations.find(
        (r) => r.id === farthest.reservationId && (r.status === 'pending' || r.status === 'shadow')
      );
      if (resToRelease) {
        resToRelease.status = 'auto_released';
        resToRelease.responded_at = new Date().toISOString();
        resToRelease.rejection_reason = `[EC-3] Auto-released: carrier selected closer hospital (${newHospitalId})`;

        const inv = this.bedInventories.find(
          (b) => b.hospital_id === farthest.hospitalId && b.bed_type === resToRelease.bed_type
        );
        if (inv) {
          inv.available_beds = Math.min(inv.total_beds, inv.available_beds + 1);
          inv.updated_at = new Date().toISOString();
        }

        const event: ReservationEvent = {
          id: `evt-${Date.now()}-ec3`,
          reservation_id: farthest.reservationId,
          event_type: 'auto_released_distant',
          actor_id: 'system',
          actor_name: 'Carrier Conflict Resolver',
          metadata: {
            carrier_id: carrierId,
            released_hospital_id: farthest.hospitalId,
            kept_hospital_id: newHospitalId,
            released_distance_km: farthest.distanceKm,
            kept_distance_km: newDistanceKm,
            request_id: requestId
          },
          created_at: new Date().toISOString()
        };
        this.reservationEvents.unshift(event);

        if (inv) {
          this.broadcast('bed_updated', {
            hospitalId: farthest.hospitalId,
            bedType: resToRelease.bed_type,
            available_beds: inv.available_beds,
            inv
          });
        }
        this.broadcast('auto_released_distant', {
          releasedReservation: resToRelease,
          keptHospitalId: newHospitalId,
          carrierId,
          event
        });

        console.info(
          `[EC-3] Carrier ${carrierId} had 2 holds — auto-released farthest (${farthest.distanceKm}km) at ${farthest.hospitalId}.`
        );

        // Remove the released hold from the carrier registry
        existing.holds = existing.holds.filter((h) => h.reservationId !== farthest.reservationId);
      }
    } else {
      // The new incoming hold is the farthest — veto it before decrement
      throw new Error(
        `[EC-3] Carrier ${carrierId} already has a closer hold (${existing.holds[0]?.distanceKm}km). ` +
        `New hold at ${newHospitalId} (${newDistanceKm}km) auto-blocked.`
      );
    }
  }

  /**
   * Query: get all active shadow reservations for a request (for UI display).
   */
  public getShadowHolds(requestId: string): Reservation[] {
    return this.reservations.filter(
      (r) => r.request_id === requestId && r.status === 'shadow'
    );
  }

  /**
   * Query: get carrier hold registry (for dispatcher UI).
   */
  public getCarrierHolds(carrierId: string): CarrierActiveHolds[] {
    return Array.from(this.carrierHolds.values()).filter(
      (c) => c.carrierId === carrierId
    );
  }

  // --- BED HISTORY & CLINICAL HANDOVER METHODS ---

  public getBedHistoryLogs(hospitalId?: string): BedHistoryLog[] {
    let list = [...this.bedHistoryLogs];
    if (hospitalId) {
      list = list.filter((l) => l.hospital_id === hospitalId);
    }
    return list.sort((a, b) => new Date(b.admitted_at).getTime() - new Date(a.admitted_at).getTime());
  }

  public addBedHistoryLog(log: BedHistoryLog) {
    this.bedHistoryLogs.unshift(log);
    this.broadcast('bed_history_logged', { log });
  }

  public applyExternalBedHistoryLog(log: BedHistoryLog) {
    const existingIndex = this.bedHistoryLogs.findIndex((l) => l.id === log.id);
    if (existingIndex >= 0) {
      this.bedHistoryLogs[existingIndex] = log;
    } else {
      this.bedHistoryLogs.unshift(log);
    }
    this.broadcast('bed_history_logged', { log });
  }

  public getPatientHandover(reservationId: string, hospitalId?: string): PatientHandoverRecord {
    const existing = this.patientHandovers.get(reservationId);
    if (existing) return existing;

    const res = this.reservations.find((r) => r.id === reservationId);
    const targetHospId = hospitalId || res?.hospital_id || this.hospitals[0]?.id || '';
    const generated = generateDefaultHandover(reservationId, targetHospId, {
      chief_complaint: res?.notes || 'Severe chest discomfort and respiratory difficulty',
      triage_level: res?.patient_urgency === 'critical' ? 'red' : 'yellow'
    });
    this.patientHandovers.set(reservationId, generated);
    return generated;
  }

  public getPatientHandoverByHash(hash: string): PatientHandoverRecord | undefined {
    for (const record of this.patientHandovers.values()) {
      if (record.sha256_hash === hash) return record;
    }
    return undefined;
  }

  public getPatientHandoverForLog(log: BedHistoryLog): PatientHandoverRecord {
    if (log.handover_sha256) {
      const byHash = this.getPatientHandoverByHash(log.handover_sha256);
      if (byHash) return byHash;
    }

    return {
      id: `ho-${log.id}`,
      reservation_id: `res-${log.id}`,
      patient_id: log.patient_id || 'PT-108-EMG',
      patient_name: log.patient_name || 'Emergency Admission',
      patient_age: log.patient_age || 52,
      patient_gender: log.patient_gender || 'Not specified',
      chief_complaint: log.diagnosis || 'Emergency Ward Admission',
      triage_level: log.triage_level || 'yellow',
      vitals: log.vitals || {
        gcs: 15,
        bp: '120/80',
        spo2: 98,
        heart_rate: 76,
        resp_rate: 18,
        temperature: 98.6,
        blood_glucose: 110
      },
      allergies: log.allergies || ['No Known Drug Allergies (NKDA)'],
      medications_administered: log.medications_administered || [],
      procedures_performed: log.procedures_performed || [],
      paramedic_badge_id: log.paramedic_badge_id || 'PARAMEDIC-BMC-108',
      ambulance_vehicle_id: log.ambulance_vehicle_id || 'MH-02-EMS-108',
      destination_hospital_id: log.hospital_id,
      timestamp: log.admitted_at,
      sha256_hash: log.handover_sha256 || 'RECORD_SEALED'
    };
  }

  public setPatientHandover(record: PatientHandoverRecord) {
    this.patientHandovers.set(record.reservation_id, record);
    this.broadcast('handover_updated', { handover: record });
  }

  public addNewBedTypeOrUnits(
    hospitalId: string,
    bedType: BedType,
    totalToAdd: number,
    availableToAdd: number,
    actorName = 'Hospital Nurse / Admin'
  ) {
    let inventory = this.bedInventories.find(
      (b) => b.hospital_id === hospitalId && b.bed_type === bedType
    );

    if (inventory) {
      inventory.total_beds += totalToAdd;
      inventory.available_beds += availableToAdd;
      inventory.updated_at = new Date().toISOString();
      inventory.updated_by = actorName;
    } else {
      inventory = {
        id: `inv-${hospitalId.slice(0, 4)}-${bedType}`,
        hospital_id: hospitalId,
        bed_type: bedType,
        total_beds: totalToAdd,
        available_beds: availableToAdd,
        updated_at: new Date().toISOString(),
        updated_by: actorName
      };
      this.bedInventories.push(inventory);
    }

    // Also update hospital emergency capacity
    const hosp = this.getHospital(hospitalId);
    if (hosp) {
      hosp.emergency_capacity += totalToAdd;
    }

    // Log to reservation_events / audit
    const event: ReservationEvent = {
      id: generateUUID(),
      reservation_id: `bed-add-${hospitalId}`,
      event_type: 'bed_updated',
      actor_name: actorName,
      metadata: {
        hospital_id: hospitalId,
        bed_type: bedType,
        total_added: totalToAdd,
        available_added: availableToAdd,
        new_total: inventory.total_beds,
        new_available: inventory.available_beds
      },
      created_at: new Date().toISOString()
    };
    this.reservationEvents.unshift(event);

    this.broadcast('bed_inventory_updated', {
      hospitalId,
      bedType,
      inventory
    });
  }

  public getIncomingAmbulances(hospitalId: string) {
    // Active reservations en route (only accepted reservations after hospital accepts hold)
    const active = this.reservations.filter(
      (r) => r.hospital_id === hospitalId && r.status === 'accepted'
    );

    return active.map((res, index) => {
      // Estimated arrival: requested_at + eta_minutes (or dynamic 4-8 mins for demo)
      const requestedTime = new Date(res.requested_at).getTime();
      const etaMinutes = res.eta_minutes || (res.status === 'accepted' ? 6 : 8);
      const targetArrivalMs = requestedTime + etaMinutes * 60 * 1000;
      const handover = this.getPatientHandover(res.id, hospitalId);

      return {
        reservation: res,
        handover,
        etaMinutes,
        targetArrivalMs,
        ambulanceId: handover.ambulance_vehicle_id || `MH-02-EMS-${108 + index * 4}`,
        paramedicId: handover.paramedic_badge_id || 'Paramedic 108 CAD',
        patientName: handover.patient_name || 'Emergency Patient',
        patientUrgency: res.patient_urgency || 'critical',
        bedType: res.bed_type,
        distanceKm: Number(((etaMinutes * 0.45) + 0.3).toFixed(1))
      };
    });
  }
}

// Singleton authoritative store
export const bedLinkStore = new BedLinkDataStore();
