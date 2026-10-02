/**
 * BedLink Road Routing Service
 * Real turn-by-turn road routing via Open Source Routing Machine (OSRM)
 * with robust in-memory caching and emergency response speed calibration.
 */

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  distanceKm: number;
  etaMinutes: number;
  provider: 'osrm' | 'demo-mode' | 'mapbox';
  polyline: [number, number][]; // [lat, lng] array along actual streets
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
  const R = 6371; // Earth's radius in km
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

// In-memory cache for OSRM routes to eliminate redundant network roundtrips
const routeCache = new Map<string, RouteResult>();

function getCacheKey(origin: RouteCoordinate, destination: RouteCoordinate): string {
  return `${origin.latitude.toFixed(4)},${origin.longitude.toFixed(4)}->${destination.latitude.toFixed(4)},${destination.longitude.toFixed(4)}`;
}

/**
 * OSRM Real Road Routing Provider:
 * Queries real road network to generate exact turn-by-turn street polylines.
 */
export class OSRMRoutingProvider implements RoutingProvider {
  name = 'osrm' as const;

  async calculateRoute(origin: RouteCoordinate, destination: RouteCoordinate): Promise<RouteResult> {
    const cacheKey = getCacheKey(origin, destination);
    const cached = routeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const distanceKm = Number((route.distance / 1000).toFixed(1));

          // Emergency vehicle driving duration calculation:
          // Ambulances equipped with siren have ~25-35% faster clearance than standard traffic
          const standardMinutes = Math.round(route.duration / 60);
          const emergencyMinutes = Math.max(1, Math.round(standardMinutes * 0.75));

          // Convert GeoJSON [lon, lat] coordinates into Leaflet [lat, lng] array
          const polyline: [number, number][] = route.geometry.coordinates.map(
            ([lng, lat]: [number, number]) => [lat, lng]
          );

          const result: RouteResult = {
            distanceKm,
            etaMinutes: emergencyMinutes,
            provider: 'osrm',
            polyline
          };

          routeCache.set(cacheKey, result);
          return result;
        }
      }
    } catch {
      // Network timeout or offline fallback
    }

    // Fallback: Haversine distance with street-grid Manhattan style stepped path
    return fallbackStreetRoute(origin, destination);
  }
}

/**
 * Fallback route if OSRM is unreachable:
 * Produces street-aligned right-angle turns along city grid instead of diagonal cuts across buildings.
 */
function fallbackStreetRoute(origin: RouteCoordinate, destination: RouteCoordinate): RouteResult {
  const directDistance = calculateHaversineDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude
  );

  const roadDistanceKm = Number((directDistance * 1.35).toFixed(1));
  const etaMinutes = Math.max(2, Math.round((roadDistanceKm / 38) * 60 + 1));

  // 90-degree street corners following city roads
  const midLat = origin.latitude + (destination.latitude - origin.latitude) * 0.55;
  const polyline: [number, number][] = [
    [origin.latitude, origin.longitude],
    [midLat, origin.longitude],
    [midLat, destination.longitude],
    [destination.latitude, destination.longitude]
  ];

  return {
    distanceKm: roadDistanceKm,
    etaMinutes,
    provider: 'demo-mode',
    polyline
  };
}

// Active singleton instance
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
  return result.polyline;
}
