/**
 * BedLink Road Routing Service
 * Real turn-by-turn road routing via Open Source Routing Machine (OSRM)
 * with in-memory caching and emergency response speed calibration.
 */

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  distanceKm: number;
  etaMinutes: number;
  provider: 'osrm' | 'estimate' | 'mapbox';
  polyline: [number, number][]; // [lat, lng] array — EMPTY if road fetch failed
}

export interface RoutingProvider {
  name: string;
  calculateRoute(origin: RouteCoordinate, destination: RouteCoordinate): Promise<RouteResult>;
}

/**
 * Calculates great circle distance between two points using the Haversine formula
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * The point a given fraction (0-1) of the way along a road route, by distance, plus how much
 * of the route is left. Used to show a simulated ambulance moving along the real road.
 */
export function pointAlongRoute(
  route: [number, number][],
  fraction: number
): { point: [number, number]; remainingKm: number; totalKm: number } {
  if (route.length === 0) return { point: [0, 0], remainingKm: 0, totalKm: 0 };
  const legs = route.slice(1).map((p, i) => calculateHaversineDistanceKm(route[i][0], route[i][1], p[0], p[1]));
  const totalKm = legs.reduce((sum, km) => sum + km, 0);
  const f = Math.max(0, Math.min(1, fraction));
  let left = f * totalKm;
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i] || i === legs.length - 1) {
      const t = legs[i] > 0 ? Math.min(1, left / legs[i]) : 1;
      const [lat1, lng1] = route[i];
      const [lat2, lng2] = route[i + 1];
      return {
        point: [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t],
        remainingKm: totalKm * (1 - f),
        totalKm
      };
    }
    left -= legs[i];
  }
  return { point: route[route.length - 1], remainingKm: 0, totalKm };
}

// In-memory cache — keyed by 3-decimal coord precision (~111m grid)
const routeCache = new Map<string, RouteResult>();

function getCacheKey(origin: RouteCoordinate, destination: RouteCoordinate): string {
  return `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}->${destination.latitude.toFixed(3)},${destination.longitude.toFixed(3)}`;
}

/**
 * Try one OSRM endpoint URL, return parsed RouteResult or null if failed.
 */
async function tryOSRM(url: string): Promise<RouteResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.length) return null;

    const route = data.routes[0];
    const distanceKm = Number((route.distance / 1000).toFixed(1));
    const standardMinutes = Math.round(route.duration / 60);
    // Ambulance with siren clears traffic ~25% faster than regular car
    const emergencyMinutes = Math.max(1, Math.round(standardMinutes * 0.75));

    // GeoJSON coords are [lon, lat] — Leaflet needs [lat, lng]
    const polyline: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );

    if (polyline.length < 2) return null;

    return { distanceKm, etaMinutes: emergencyMinutes, provider: 'osrm', polyline };
  } catch {
    return null;
  }
}

/**
 * OSRM Real Road Routing Provider.
 * Tries multiple OSRM public mirrors before giving up.
 * If ALL fail: returns distance estimate with EMPTY polyline
 * (no line = better than a line cutting through buildings).
 */
export class OSRMRoutingProvider implements RoutingProvider {
  name = 'osrm' as const;

  async calculateRoute(origin: RouteCoordinate, destination: RouteCoordinate): Promise<RouteResult> {
    const cacheKey = getCacheKey(origin, destination);
    const cached = routeCache.get(cacheKey);
    if (cached) return cached;

    const olng = origin.longitude;
    const olat = origin.latitude;
    const dlng = destination.longitude;
    const dlat = destination.latitude;

    // Try multiple OSRM endpoints in sequence — no radiuses param so OSRM
    // auto-snaps to nearest road (removes the NoSegment error from radiuses=50)
    const urls = [
      // Primary: project-osrm.org with full geometry
      `https://router.project-osrm.org/route/v1/driving/${olng},${olat};${dlng},${dlat}?overview=full&geometries=geojson&alternatives=false`,
      // Mirror: OSRM demo server (different backend)
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${olng},${olat};${dlng},${dlat}?overview=full&geometries=geojson&alternatives=false`,
    ];

    for (const url of urls) {
      const result = await tryOSRM(url);
      if (result) {
        routeCache.set(cacheKey, result);
        return result;
      }
    }

    // All OSRM attempts failed — return distance estimate with NO polyline
    // An empty polyline means HospitalMap will draw nothing, which is better
    // than a straight line cutting through buildings.
    const directDistance = calculateHaversineDistanceKm(olat, olng, dlat, dlng);
    const roadDistanceKm = Number((directDistance * 1.32).toFixed(1));
    const etaMinutes = Math.max(2, Math.round((roadDistanceKm / 40) * 60 + 1.5));

    const fallback: RouteResult = {
      distanceKm: roadDistanceKm,
      etaMinutes,
      provider: 'estimate',
      polyline: [], // intentionally empty — no building-cutting line
    };

    routeCache.set(cacheKey, fallback);
    return fallback;
  }
}

// Singleton
const activeProvider: RoutingProvider = new OSRMRoutingProvider();

export async function calculateEmergencyETA(
  origin: RouteCoordinate,
  destination: RouteCoordinate
): Promise<RouteResult> {
  return activeProvider.calculateRoute(origin, destination);
}

export async function fetchRoadPolyline(
  origin: RouteCoordinate,
  destination: RouteCoordinate
): Promise<[number, number][]> {
  const result = await activeProvider.calculateRoute(origin, destination);
  return result.polyline; // empty array if OSRM unavailable
}
