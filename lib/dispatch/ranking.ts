import {
  BedInventory,
  BedType,
  Hospital,
  RankingWeights,
  ScoredHospital,
  Urgency
} from '../types';
import { calculateHaversineDistanceKm } from '../routing';

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  bedMatch: 0.45,
  travel: 0.25,
  freshness: 0.20,
  load: 0.10,
};

export interface RankingOptions {
  weights?: RankingWeights;
  patientLocation: { latitude: number; longitude: number };
  requiredBedType: BedType;
  requiresVentilator?: boolean;
  requiredSpecialty?: string | null;
  urgency?: Urgency;
}

/**
 * Calculates freshness score normalized between 0 and 1.
 * 0 - 5 min  -> 1.0 (Fresh)
 * 5 - 15 min -> 0.75 (Recent)
 * 15 - 30 min -> 0.40 (Aging)
 * 30+ min    -> 0.10 (Stale)
 */
export function calculateFreshnessScore(updatedAtIso: string): { score: number; minutesAgo: number } {
  const updatedTime = new Date(updatedAtIso).getTime();
  const now = Date.now();
  const minutesAgo = Math.max(0, Math.floor((now - updatedTime) / (1000 * 60)));

  let score: number;
  if (minutesAgo <= 5) {
    score = 1.0;
  } else if (minutesAgo <= 15) {
    score = 0.75;
  } else if (minutesAgo <= 30) {
    score = 0.40;
  } else {
    // Diminishing returns after 30 minutes
    score = Math.max(0.05, 0.40 - ((minutesAgo - 30) / 100));
  }

  return { score: Number(score.toFixed(3)), minutesAgo };
}

/**
 * Calculates travel score normalized between 0 and 1.
 * Faster ETA receives higher score.
 * <= 3 min = 1.0
 * >= 40 min = 0.05
 */
export function calculateTravelScore(etaMinutes: number): number {
  if (etaMinutes <= 3) return 1.0;
  if (etaMinutes >= 40) return 0.05;
  const score = 1.0 - ((etaMinutes - 3) / 37) * 0.95;
  return Number(Math.max(0.05, Math.min(1.0, score)).toFixed(3));
}

/**
 * Calculates load score normalized between 0 and 1.
 * Lower hospital occupancy load is safer for emergency incoming cases.
 */
export function calculateLoadScore(currentLoadPercent: number): number {
  const clampedLoad = Math.max(0, Math.min(100, currentLoadPercent));
  const score = (100 - clampedLoad) / 100;
  return Number(score.toFixed(3));
}

export interface HospitalCandidate {
  hospital: Hospital;
  inventory: Record<BedType, BedInventory>;
  capabilities: string[];
}

export interface RankingResult {
  exactMatches: ScoredHospital[];
  partialMatches: ScoredHospital[];
}

/**
 * Core BedLink Ranking and Matching Engine.
 * Evaluates candidates, validates resource availability, calculates individual
 * normalized metric scores, applies configured weights, and separates exact
 * matches from partial matches.
 */
export function rankHospitals(
  candidates: HospitalCandidate[],
  options: RankingOptions
): RankingResult {
  const weights = options.weights || DEFAULT_RANKING_WEIGHTS;
  const exactMatches: ScoredHospital[] = [];
  const partialMatches: ScoredHospital[] = [];

  for (const candidate of candidates) {
    const { hospital, inventory, capabilities } = candidate;
    const missing: string[] = [];

    // 1. Bed availability check
    const requestedBedInventory = inventory[options.requiredBedType];
    const availableRequestedBeds = requestedBedInventory?.available_beds ?? 0;
    const hasRequestedBed = availableRequestedBeds > 0;
    if (!hasRequestedBed) {
      missing.push(`${options.requiredBedType.toUpperCase()} Bed (0 available)`);
    }

    // 2. Ventilator check if required
    let hasVentilator = true;
    if (options.requiresVentilator) {
      const ventInventory = inventory['ventilator'];
      const availableVentilators = ventInventory?.available_beds ?? 0;
      hasVentilator = availableVentilators > 0;
      if (!hasVentilator) {
        missing.push('Ventilator (0 available)');
      }
    }

    // 3. Specialty capability check
    let hasSpecialty = true;
    if (options.requiredSpecialty && options.requiredSpecialty !== 'none') {
      const normalizedReq = options.requiredSpecialty.toLowerCase();
      hasSpecialty = capabilities.some(c => c.toLowerCase() === normalizedReq);
      if (!hasSpecialty) {
        missing.push(`${options.requiredSpecialty} Capability`);
      }
    }

    const isExactMatch = hasRequestedBed && hasVentilator && hasSpecialty;

    // Bed match score computation
    let bedMatchScore: number;
    if (isExactMatch) {
      // Base 0.85 + bonus for bed surplus cushion
      const cushion = Math.min(0.15, (availableRequestedBeds / 10) * 0.15);
      bedMatchScore = Number((0.85 + cushion).toFixed(3));
    } else {
      // Partial match: score based on satisfied conditions
      let criteriaCount = 1;
      let satisfiedCount = hasRequestedBed ? 1 : 0;

      if (options.requiresVentilator) {
        criteriaCount += 1;
        if (hasVentilator) satisfiedCount += 1;
      }
      if (options.requiredSpecialty && options.requiredSpecialty !== 'none') {
        criteriaCount += 1;
        if (hasSpecialty) satisfiedCount += 1;
      }

      bedMatchScore = Number(((satisfiedCount / criteriaCount) * 0.5).toFixed(3));
    }

    // Distance & Travel ETA calculation
    const directDistance = calculateHaversineDistanceKm(
      options.patientLocation.latitude,
      options.patientLocation.longitude,
      hospital.latitude,
      hospital.longitude
    );
    const roadDistanceKm = Number((directDistance * 1.32).toFixed(1));
    const etaMinutes = Math.max(2, Math.round((roadDistanceKm / 40) * 60 + 1.5));
    const travelScore = calculateTravelScore(etaMinutes);

    // Freshness score based on inventory last updated timestamp
    const mostRecentUpdate = requestedBedInventory?.updated_at || hospital.load_updated_at || hospital.created_at || new Date().toISOString();
    const { score: freshnessScore } = calculateFreshnessScore(mostRecentUpdate);

    // Load score
    const loadScore = calculateLoadScore(hospital.current_load);

    // Total weighted score formula:
    // score = bedMatch * 0.45 + travel * 0.25 + freshness * 0.20 + load * 0.10
    const rawTotal =
      bedMatchScore * weights.bedMatch +
      travelScore * weights.travel +
      freshnessScore * weights.freshness +
      loadScore * weights.load;
    const totalScore = Number(rawTotal.toFixed(3));

    const scoredHospital: ScoredHospital = {
      hospital,
      inventory,
      capabilities,
      distanceKm: roadDistanceKm,
      etaMinutes,
      bedMatchScore,
      travelScore,
      freshnessScore,
      loadScore,
      totalScore,
      isExactMatch,
      missingResources: missing,
      lastUpdated: mostRecentUpdate
    };

    if (isExactMatch) {
      exactMatches.push(scoredHospital);
    } else {
      partialMatches.push(scoredHospital);
    }
  }

  // Sort descending by totalScore
  exactMatches.sort((a, b) => b.totalScore - a.totalScore);
  partialMatches.sort((a, b) => b.totalScore - a.totalScore);

  return { exactMatches, partialMatches };
}
