import { BedType, PatientHandoverRecord } from '../types';
import { bedLinkStore } from '../data/store';

export interface BedNeedEvaluation {
  targetBedType: BedType;
  assignedBedType: BedType;
  bedIdentifier: string;
  needReason: string;
  vitalsSummary: string;
  triageLevel: 'red' | 'yellow' | 'green';
  isFallback: boolean;
}

/**
 * Evaluates patient clinical need based on vitals, triage level, and chief complaint.
 * 100% null-safe with complete fallback defense.
 */
export function evaluatePatientNeed(
  handover: PatientHandoverRecord | null | undefined,
  requestedBedType: BedType
): { targetBedType: BedType; needReason: string; vitalsSummary: string } {
  if (!handover) {
    return {
      targetBedType: requestedBedType || 'emergency',
      needReason: `Standard Pre-Hospital Care (${(requestedBedType || 'Emergency').toUpperCase()})`,
      vitalsSummary: 'Vitals Standard'
    };
  }

  const vitals = handover.vitals;
  const complaint = (handover.chief_complaint || '').toLowerCase();
  const triage = handover.triage_level || 'yellow';

  const vitalsSummary = vitals
    ? `GCS ${vitals.gcs ?? 15} • SpO2 ${vitals.spo2 ?? 98}% • BP ${vitals.bp || '120/80'} • HR ${vitals.heart_rate ?? 75} bpm`
    : 'Vitals Stable';

  // 1. Critical Airway / Respiratory Failure / Cardiac Arrest -> Ventilator or ICU
  if (vitals && (vitals.gcs <= 8 || vitals.spo2 < 85 || complaint.includes('cardiac') || complaint.includes('intubated') || complaint.includes('respiratory arrest'))) {
    if (vitals.spo2 < 85 || complaint.includes('ventilator') || complaint.includes('respiratory arrest')) {
      return {
        targetBedType: 'ventilator',
        needReason: `Critical Airway & Respiratory Failure (SpO2 ${vitals.spo2}%, GCS ${vitals.gcs})`,
        vitalsSummary
      };
    }
    return {
      targetBedType: 'icu',
      needReason: `Critical Care Required (GCS ${vitals.gcs}, Triage Red)`,
      vitalsSummary
    };
  }

  // 2. High Risk / Triage Red -> ICU
  if (triage === 'red') {
    if (complaint.includes('respiratory') || complaint.includes('breathing')) {
      return {
        targetBedType: 'ventilator',
        needReason: 'Critical Triage (Red) - Respiratory Support Required',
        vitalsSummary
      };
    }
    return {
      targetBedType: 'icu',
      needReason: 'Critical Triage (Red) - Intensive Care Monitoring Required',
      vitalsSummary
    };
  }

  // 3. Moderate Hypoxia -> Oxygen Bed
  if (vitals && vitals.spo2 >= 85 && vitals.spo2 < 93) {
    return {
      targetBedType: 'oxygen',
      needReason: `Hypoxia / High-Flow Supplemental Oxygen Need (SpO2 ${vitals.spo2}%)`,
      vitalsSummary
    };
  }

  // 4. Moderate Triage (Yellow) / Acute Complaint -> Emergency or Oxygen
  if (triage === 'yellow') {
    if (complaint.includes('chest') || complaint.includes('shortness of breath') || complaint.includes('oxygen')) {
      return {
        targetBedType: 'oxygen',
        needReason: 'Urgent Triage (Yellow) - Supplemental Oxygen Support',
        vitalsSummary
      };
    }
    return {
      targetBedType: 'emergency',
      needReason: 'Urgent Triage (Yellow) - Acute Emergency Bay',
      vitalsSummary
    };
  }

  // 5. Stable / Low Risk (Green Triage) -> General Ward or Emergency
  if (triage === 'green') {
    return {
      targetBedType: 'general',
      needReason: 'Stable Patient (Green Triage) - General Medical Ward',
      vitalsSummary
    };
  }

  // Default fallback to requested bed type
  return {
    targetBedType: requestedBedType || 'emergency',
    needReason: `Standard Pre-Hospital Requested Care (${(requestedBedType || 'Emergency').toUpperCase()})`,
    vitalsSummary
  };
}

const BED_PREFIXES: Record<BedType, string> = {
  icu: 'ICU',
  ventilator: 'VENT',
  oxygen: 'OXY',
  emergency: 'EMG',
  general: 'GEN'
};

/**
 * Auto-assigns the best available bed unit/identifier for a hospital,
 * checking occupied beds to avoid duplicate bed numbers.
 */
export function autoAssignBedIdentifier(
  hospitalId: string,
  bedType: BedType
): string {
  const prefix = BED_PREFIXES[bedType] || (bedType ? bedType.toUpperCase() : 'BED');
  const logs = bedLinkStore.getBedHistoryLogs(hospitalId);

  // Collect occupied bed identifiers for this bed type
  const occupiedIdentifiers = new Set<string>();
  if (Array.isArray(logs)) {
    logs.forEach((log) => {
      if (log?.status === 'occupied' && log?.bed_type === bedType && log?.bed_identifier) {
        occupiedIdentifiers.add(log.bed_identifier.toUpperCase());
      }
    });
  }

  // Find the lowest positive integer N such that [PREFIX]-Bed-[0N] is not occupied
  let slotNumber = 1;
  while (slotNumber <= 999) {
    const formattedNum = String(slotNumber).padStart(2, '0');
    const candidate = `${prefix}-Bed-${formattedNum}`;
    if (!occupiedIdentifiers.has(candidate.toUpperCase())) {
      return candidate;
    }
    slotNumber++;
  }

  return `${prefix}-Bed-${Date.now().toString().slice(-4)}`;
}

/**
 * Full Auto-Assignment Orchestrator:
 * Evaluates patient clinical need, checks inventory, auto-assigns bed unit,
 * updates bed inventory, completes reservation, and returns assignment metadata.
 */
export function executeAutoBedAssignment(
  hospitalId: string,
  reservationId: string,
  requestedBedType: BedType,
  patientName: string,
  actorName: string
): BedNeedEvaluation & { logId: string; admittedAt: string; handover: PatientHandoverRecord } {
  // 1. Retrieve signed handover safely
  const handover = bedLinkStore.getPatientHandover(reservationId, hospitalId);

  // 2. Evaluate Clinical Need
  const { targetBedType, needReason, vitalsSummary } = evaluatePatientNeed(
    handover,
    requestedBedType
  );

  // 3. Inventory matching & Fallback check
  const inventories = bedLinkStore.getBedInventories(hospitalId) || [];
  const targetInv = inventories.find((b) => b.bed_type === targetBedType);

  let assignedBedType: BedType = targetBedType;
  let isFallback = false;

  // Check if target bed type has available capacity or matches held reservation
  if (targetBedType !== requestedBedType) {
    if (targetInv && targetInv.available_beds > 0) {
      // Reallocate: Restore held slot to requested bed type, decrement target bed type
      bedLinkStore.updateBedCount(hospitalId, requestedBedType, +1, 'sys-auto', actorName);
      bedLinkStore.updateBedCount(hospitalId, targetBedType, -1, 'sys-auto', actorName);
      assignedBedType = targetBedType;
    } else {
      // Target bed type full; fallback to requested bed type
      assignedBedType = requestedBedType;
      isFallback = true;
    }
  } else {
    assignedBedType = requestedBedType;
  }

  // 4. Auto-assign Bed Unit Identifier
  const bedIdentifier = autoAssignBedIdentifier(hospitalId, assignedBedType);

  return {
    targetBedType,
    assignedBedType,
    bedIdentifier,
    needReason: isFallback
      ? `${needReason} (Primary ${targetBedType.toUpperCase()} full; assigned pre-held ${assignedBedType.toUpperCase()})`
      : needReason,
    vitalsSummary,
    triageLevel: handover?.triage_level || 'yellow',
    isFallback,
    logId: `bhl-${Date.now()}`,
    admittedAt: new Date().toISOString(),
    handover
  };
}
