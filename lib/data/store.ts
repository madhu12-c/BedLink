import {
  AuditLogItem,
  BedHistoryLog,
  BedInventory,
  BedType,
  EmergencyRequest,
  Hospital,
  HospitalCapability,
  PatientHandoverRecord,
  Reservation,
  ReservationEvent,
  ReservationStatus,
  ScoredHospital
} from '../types';
import {
  INITIAL_BED_INVENTORY,
  INITIAL_CAPABILITIES,
  INITIAL_HOSPITALS
} from '../demo/seed-data';
import { INITIAL_BED_HISTORY_LOGS } from '../demo/bed-history-data';
import { generateDefaultHandover } from '../crypto/handoverSha';
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
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<(event: { type: string; payload: unknown }) => void> = new Set();
  private expirationInterval: NodeJS.Timeout | null = null;
  private syncHandler: SyncHandler | null = null;

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
            this.notifyListeners(msg.data.type, msg.data.payload);
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
  }) {
    if (!data) return;
    if (data.hospitals && data.hospitals.length > 0) this.hospitals = data.hospitals;
    if (data.capabilities && data.capabilities.length > 0) this.capabilities = data.capabilities;
    if (data.bedInventories && data.bedInventories.length > 0) this.bedInventories = data.bedInventories;
    if (data.reservations) this.reservations = data.reservations;
    if (data.reservationEvents) this.reservationEvents = data.reservationEvents;
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
    const idx = this.reservations.findIndex((r) => r.id === item.id);
    if (idx >= 0) {
      this.reservations[idx] = { ...this.reservations[idx], ...item };
    } else {
      this.reservations.unshift(item);
    }
    const hosp = this.getHospital(item.hospital_id);
    const enriched = { ...item, hospital_name: hosp?.name || 'Hospital' };
    this.broadcast(
      item.status === 'accepted'
        ? 'reservation_accepted'
        : item.status === 'rejected'
        ? 'reservation_rejected'
        : item.status === 'expired'
        ? 'reservation_expired'
        : 'reservation_created',
      { reservation: enriched }
    );
  }

  public applyExternalHospitalUpdate(update: { id: string; current_load: number; load_updated_at: string }) {
    const hosp = this.hospitals.find((h) => h.id === update.id);
    if (hosp) {
      hosp.current_load = update.current_load;
      hosp.load_updated_at = update.load_updated_at;
      this.broadcast('hospital_updated', hosp);
    }
  }

  public resetToDefaults() {
    this.hospitals = JSON.parse(JSON.stringify(INITIAL_HOSPITALS));
    this.capabilities = JSON.parse(JSON.stringify(INITIAL_CAPABILITIES));
    this.bedInventories = JSON.parse(JSON.stringify(INITIAL_BED_INVENTORY));
    this.reservations = [];
    this.reservationEvents = [];
    this.emergencyRequests = [];
    this.bedHistoryLogs = JSON.parse(JSON.stringify(INITIAL_BED_HISTORY_LOGS));
    this.patientHandovers = new Map();
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
    inv.available_beds = newCount;
    inv.updated_at = new Date().toISOString();
    inv.updated_by = actorId;

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
    this.syncHandler?.onBedUpdate?.(hospitalId, bedType, newCount, actorId);
    return { ...inv };
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
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`,
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
    actorName = 'Dispatcher Control'
  ): Reservation {
    // 1. Concurrency Check / Lock
    const inv = this.bedInventories.find(
      (b) => b.hospital_id === hospitalId && b.bed_type === bedType
    );

    if (!inv) {
      throw new Error(`Bed inventory record not found for hospital ${hospitalId}`);
    }

    if (inv.available_beds <= 0) {
      throw new Error('This bed is no longer available. Another emergency unit may have reserved it.');
    }

    // 2. Atomically hold / decrement resource
    inv.available_beds -= 1;
    inv.updated_at = new Date().toISOString();
    inv.updated_by = actorId;

    // 3. Create 2-minute reservation
    const reservationId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `res-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const reservation: Reservation = {
      id: reservationId,
      request_id: requestId,
      hospital_id: hospitalId,
      bed_type: bedType,
      status: 'pending',
      requested_at: new Date().toISOString(),
      expires_at: expiresAt,
      hospital_name: this.getHospital(hospitalId)?.name
    };

    this.reservations.unshift(reservation);

    // 4. Create Audit Event
    const event: ReservationEvent = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}`,
      reservation_id: reservationId,
      event_type: 'reservation_created',
      actor_id: actorId,
      actor_name: actorName,
      metadata: {
        hospital_id: hospitalId,
        bed_type: bedType,
        expires_at: expiresAt,
        requestId
      },
      created_at: new Date().toISOString()
    };
    this.reservationEvents.unshift(event);

    // 5. Update request status
    const req = this.emergencyRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = 'holding';
    }

    this.broadcast('reservation_created', { reservation, event });
    this.broadcast('bed_updated', { hospitalId, bedType, available_beds: inv.available_beds, inv });
    this.syncHandler?.onReservationHold?.(reservation, actorId);

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
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}`,
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
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}`,
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

      // Step 20 — Automatic Fallback to Next Best Eligible Hospital
      const nextHospital = this.triggerAutomaticFallback(reservation.request_id, reservation.hospital_id);

      return { success: true, status: 'rejected', nextHospital };
    }
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
      }
    }
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
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}`,
      reservation_id: reservation.id,
      event_type: 'reservation_expired',
      actor_id: 'system',
      actor_name: 'Automated Timeout Monitor',
      metadata: { reason, hospital_id: reservation.hospital_id },
      created_at: new Date().toISOString()
    };
    this.reservationEvents.unshift(event);

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

    // Trigger automatic fallback to next eligible hospital
    this.triggerAutomaticFallback(reservation.request_id, reservation.hospital_id);
  }

  /**
   * Automatic Fallback: Contacts next best hospital in ranking (Step 20)
   */
  public triggerAutomaticFallback(
    requestId: string,
    excludeHospitalId: string
  ): ScoredHospital | null {
    const request = this.emergencyRequests.find((r) => r.id === requestId);
    if (!request) return null;

    // Get all previously contacted hospital IDs for this request
    const contactedHospitalIds = new Set(
      this.reservations
        .filter((r) => r.request_id === requestId)
        .map((r) => r.hospital_id)
    );
    contactedHospitalIds.add(excludeHospitalId);

    // Filter candidate hospitals
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
      urgency: request.urgency
    });

    const nextTarget = ranking.exactMatches[0] || ranking.partialMatches[0] || null;

    if (nextTarget) {
      // Automatically initiate hold for next candidate
      try {
        const nextRes = this.holdBedAtomic(
          requestId,
          nextTarget.hospital.id,
          request.required_bed_type,
          'system-fallback',
          'Automated Fallback Router'
        );

        const fallbackEvent: ReservationEvent = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}`,
          reservation_id: nextRes.id,
          event_type: 'fallback_triggered',
          actor_id: 'system',
          actor_name: 'Automatic Fallback Subsystem',
          metadata: {
            previous_hospital_id: excludeHospitalId,
            new_hospital_id: nextTarget.hospital.id,
            hospital_name: nextTarget.hospital.name,
            reason: 'Previous hospital rejected or timed out'
          },
          created_at: new Date().toISOString()
        };
        this.reservationEvents.unshift(fallbackEvent);
        this.broadcast('fallback_triggered', {
          requestId,
          previousHospitalId: excludeHospitalId,
          newReservation: nextRes,
          hospital: nextTarget
        });
      } catch (err) {
        console.error('Fallback hold attempt error:', err);
      }
    }

    return nextTarget;
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
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}`,
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
    // Active reservations en route (either accepted or holding pending)
    const active = this.reservations.filter(
      (r) => r.hospital_id === hospitalId && (r.status === 'accepted' || r.status === 'pending')
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
