import {
  BedInventory,
  BedType,
  Hospital,
  RankingWeights,
  ScoredHospital,
  Urgency
} from '../types';
import { calculateHaversineDistanceKm, calculateEmergencyETA } from '../routing';

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  bedMatch: 0.40,
  travel: 0.25,
  freshness: 0.15,
  load: 0.10,
  reliability: 0.10,
};

/** 0-1 from the hospital's reliability (100 = never rejected, timed out or lost a bed). */
export function calculateReliabilityScore(reliability: number | undefined): number {
  return Number((Math.max(0, Math.min(100, reliability ?? 100)) / 100).toFixed(3));
}

export interface RankingOptions {
  weights?: RankingWeights;
  patientLocation: { latitude: number; longitude: number };
  requiredBedType: BedType;
  requiresVentilator?: boolean;
  requiredSpecialty?: string | null;
  urgency?: Urgency;
}

/**
 * Freshness score: 0–1. More recent data = higher score.
 */
export function calculateFreshnessScore(updatedAtIso: string): { score: number; minutesAgo: number } {
  const updatedTime = new Date(updatedAtIso).getTime();
  const now = Date.now();
  const minutesAgo = Math.max(0, Math.floor((now - updatedTime) / (1000 * 60)));

  let score: number;
  if (minutesAgo <= 5) score = 1.0;
  else if (minutesAgo <= 15) score = 0.75;
  else if (minutesAgo <= 30) score = 0.40;
  else score = Math.max(0.05, 0.40 - ((minutesAgo - 30) / 100));

  return { score: Number(score.toFixed(3)), minutesAgo };
}

/**
 * Travel score: faster ETA = higher score. <=3 min = 1.0, >=40 min = 0.05
 */
export function calculateTravelScore(etaMinutes: number): number {
  if (etaMinutes <= 3) return 1.0;
  if (etaMinutes >= 40) return 0.05;
  const score = 1.0 - ((etaMinutes - 3) / 37) * 0.95;
  return Number(Math.max(0.05, Math.min(1.0, score)).toFixed(3));
}

/**
 * Load score: lower hospital occupancy = higher score.
 */
export function calculateLoadScore(currentLoadPercent: number): number {
  const clampedLoad = Math.max(0, Math.min(100, currentLoadPercent));
  return Number(((100 - clampedLoad) / 100).toFixed(3));
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
 * Internal: score one candidate given pre-fetched road distance + ETA.
 */
function scoreCandidate(
  candidate: HospitalCandidate,
  options: RankingOptions,
  roadDistanceKm: number,
  etaMinutes: number
): ScoredHospital {
  const weights = options.weights || DEFAULT_RANKING_WEIGHTS;
  const { hospital, inventory, capabilities } = candidate;
  const missing: string[] = [];

  // Bed availability
  const requestedBedInventory = inventory[options.requiredBedType];
  const availableRequestedBeds = requestedBedInventory?.available_beds ?? 0;
  const hasRequestedBed = availableRequestedBeds > 0;
  if (!hasRequestedBed) missing.push(`${options.requiredBedType.toUpperCase()} Bed (0 available)`);

  // Ventilator
  let hasVentilator = true;
  if (options.requiresVentilator) {
    const availableVentilators = inventory['ventilator']?.available_beds ?? 0;
    hasVentilator = availableVentilators > 0;
    if (!hasVentilator) missing.push('Ventilator (0 available)');
  }

  // Specialty
  let hasSpecialty = true;
  if (options.requiredSpecialty && options.requiredSpecialty !== 'none') {
    const req = options.requiredSpecialty.toLowerCase();
    hasSpecialty = capabilities.some(c => c.toLowerCase() === req);
    if (!hasSpecialty) missing.push(`${options.requiredSpecialty} Capability`);
  }

  // On diversion the ED is closed to ambulances: never an exact match
  const onDiversion = hospital.ed_status === 'diversion';
  if (onDiversion) missing.push('On diversion (not taking ambulances)');

  const isExactMatch = hasRequestedBed && hasVentilator && hasSpecialty && !onDiversion;

  let bedMatchScore: number;
  if (isExactMatch) {
    const cushion = Math.min(0.15, (availableRequestedBeds / 10) * 0.15);
    bedMatchScore = Number((0.85 + cushion).toFixed(3));
  } else {
    let criteriaCount = 1;
    let satisfiedCount = hasRequestedBed ? 1 : 0;
    if (options.requiresVentilator) { criteriaCount++; if (hasVentilator) satisfiedCount++; }
    if (options.requiredSpecialty && options.requiredSpecialty !== 'none') {
      criteriaCount++; if (hasSpecialty) satisfiedCount++;
    }
    bedMatchScore = Number(((satisfiedCount / criteriaCount) * 0.5).toFixed(3));
  }

  const travelScore = calculateTravelScore(etaMinutes);
  const mostRecentUpdate =
    requestedBedInventory?.updated_at || hospital.load_updated_at || hospital.created_at || new Date().toISOString();
  const { score: freshnessScore } = calculateFreshnessScore(mostRecentUpdate);
  // A hospital that says it is busy counts as more loaded
  const loadScore = Number(
    (calculateLoadScore(hospital.current_load) * (hospital.ed_status === 'busy' ? 0.5 : 1)).toFixed(3)
  );
  const reliabilityScore = calculateReliabilityScore(hospital.reliability);

  const totalScore = Number((
    bedMatchScore * weights.bedMatch +
    travelScore * weights.travel +
    freshnessScore * weights.freshness +
    loadScore * weights.load +
    reliabilityScore * weights.reliability
  ).toFixed(3));

  return {
    hospital, inventory, capabilities,
    distanceKm: roadDistanceKm,
    etaMinutes,
    bedMatchScore, travelScore, freshnessScore, loadScore, reliabilityScore,
    totalScore, isExactMatch,
    missingResources: missing,
    lastUpdated: mostRecentUpdate
  };
}

/**
 * SYNCHRONOUS ranking using estimated road distance (haversine × 1.32).
 * Used for instant initial render — replaced by real routes once OSRM responds.
 */
export function rankHospitals(
  candidates: HospitalCandidate[],
  options: RankingOptions
): RankingResult {
  const exactMatches: ScoredHospital[] = [];
  const partialMatches: ScoredHospital[] = [];

  for (const candidate of candidates) {
    const direct = calculateHaversineDistanceKm(
      options.patientLocation.latitude, options.patientLocation.longitude,
      candidate.hospital.latitude, candidate.hospital.longitude
    );
    const road = Number((direct * 1.32).toFixed(1));
    const eta = Math.max(2, Math.round((road / 40) * 60 + 1.5));
    const scored = scoreCandidate(candidate, options, road, eta);
    if (scored.isExactMatch) exactMatches.push(scored);
    else partialMatches.push(scored);
  }

  exactMatches.sort((a, b) => b.totalScore - a.totalScore);
  partialMatches.sort((a, b) => b.totalScore - a.totalScore);
  return { exactMatches, partialMatches };
}

/**
 * ASYNC ranking using REAL OSRM road distances fetched in parallel.
 * Hospital list order will exactly match the road route shown on the map.
 * Falls back to haversine estimate per-hospital if OSRM is unavailable.
 */
export async function rankHospitalsWithRealRoutes(
  candidates: HospitalCandidate[],
  options: RankingOptions
): Promise<RankingResult> {
  const origin = {
    latitude: options.patientLocation.latitude,
    longitude: options.patientLocation.longitude
  };

  // Fire all OSRM requests in parallel — no waiting one by one
  const routeResults = await Promise.all(
    candidates.map(async (c) => {
      try {
        const r = await calculateEmergencyETA(origin, {
          latitude: c.hospital.latitude,
          longitude: c.hospital.longitude
        });
        return { distanceKm: r.distanceKm, etaMinutes: r.etaMinutes };
      } catch {
        // Per-hospital fallback
        const direct = calculateHaversineDistanceKm(
          origin.latitude, origin.longitude,
          c.hospital.latitude, c.hospital.longitude
        );
        const road = Number((direct * 1.32).toFixed(1));
        return { distanceKm: road, etaMinutes: Math.max(2, Math.round((road / 40) * 60 + 1.5)) };
      }
    })
  );

  const exactMatches: ScoredHospital[] = [];
  const partialMatches: ScoredHospital[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const { distanceKm, etaMinutes } = routeResults[i];
    const scored = scoreCandidate(candidates[i], options, distanceKm, etaMinutes);
    if (scored.isExactMatch) exactMatches.push(scored);
    else partialMatches.push(scored);
  }

  exactMatches.sort((a, b) => b.totalScore - a.totalScore);
  partialMatches.sort((a, b) => b.totalScore - a.totalScore);
  return { exactMatches, partialMatches };
}
