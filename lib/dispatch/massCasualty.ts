import { BedType, ScoredHospital } from '../types';
import { HospitalCandidate, rankHospitals, RoadRoute } from './ranking';

/**
 * Mass casualty: many patients from one place (bus crash, building collapse, fire).
 * Sending them all to the nearest hospital floods one emergency room, so patients are spread
 * out: most serious first (they get the scarcest beds), each to the best hospital that still
 * has that bed and is under the per-hospital limit.
 */

/** Most serious first. */
export const CASUALTY_BED_ORDER: BedType[] = ['ventilator', 'icu', 'burns', 'cardiac', 'oxygen', 'emergency', 'general'];

export interface CasualtyPlanRow {
  patientNo: number;
  bedType: BedType;
  /** null: no free bed of this type anywhere */
  hospital: ScoredHospital | null;
  /** true: every hospital with this bed was already at the limit, so one went over */
  overLimit: boolean;
}

export interface CasualtyPlan {
  rows: CasualtyPlanRow[];
  hospitalsUsed: number;
  unplaced: number;
  overLimit: number;
}

export function planMassCasualty(
  candidates: HospitalCandidate[],
  location: { latitude: number; longitude: number },
  patients: Partial<Record<BedType, number>>,
  maxPerHospital: number,
  roads?: Record<string, RoadRoute>
): CasualtyPlan {
  // Working copy of the free beds, used up as patients are placed
  const pool: HospitalCandidate[] = candidates.map((c) => ({
    ...c,
    inventory: Object.fromEntries(
      Object.entries(c.inventory).map(([type, inv]) => [type, { ...inv }])
    ) as HospitalCandidate['inventory']
  }));
  const placedAt = new Map<string, number>();
  const rows: CasualtyPlanRow[] = [];

  for (const bedType of CASUALTY_BED_ORDER) {
    for (let i = 0; i < (patients[bedType] ?? 0); i++) {
      const { exactMatches } = rankHospitals(
        pool,
        { patientLocation: location, requiredBedType: bedType, urgency: 'critical' },
        roads
      );
      const underLimit = exactMatches.find((h) => (placedAt.get(h.hospital.id) ?? 0) < maxPerHospital);
      const choice = underLimit ?? exactMatches[0] ?? null;
      if (choice) {
        const inv = pool.find((c) => c.hospital.id === choice.hospital.id)?.inventory[bedType];
        if (inv) inv.available_beds -= 1;
        placedAt.set(choice.hospital.id, (placedAt.get(choice.hospital.id) ?? 0) + 1);
      }
      rows.push({ patientNo: rows.length + 1, bedType, hospital: choice, overLimit: Boolean(choice && !underLimit) });
    }
  }

  return {
    rows,
    hospitalsUsed: placedAt.size,
    unplaced: rows.filter((r) => !r.hospital).length,
    overLimit: rows.filter((r) => r.overLimit).length
  };
}
