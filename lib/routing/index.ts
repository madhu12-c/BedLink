/**
 * BedLink Routing Service Abstraction
 * Supports swappable routing providers (OSRM, Mapbox, Google, or Demo Mode)
 */

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  distanceKm: number;
  etaMinutes: number;
  provider: 'demo-mode' | 'osrm' | 'mapbox';
  polyline?: [number, number][]; // [lat, lng] array
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

/**
 * Demo Mode routing provider:
 * Uses calibrated emergency response heuristics:
 * - 1.35x road curvature factor for city street grids
 * - 42 km/h average emergency vehicle speed with lights & sirens
 * - 1.5 min intersection & dispatch handling baseline
 */
export class DemoRoutingProvider implements RoutingProvider {
  name = 'demo-mode' as const;

  async calculateRoute(origin: RouteCoordinate, destination: RouteCoordinate): Promise<RouteResult> {
    const directDistance = calculateHaversineDistanceKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );

    // Urban street grid factor
    const roadDistanceKm = Number((directDistance * 1.32).toFixed(1));
    
    // Ambulance average speed ~40 km/h in city + dispatch/traffic buffer
    const speedKmH = 40;
    const travelTimeHours = roadDistanceKm / speedKmH;
    const etaMinutes = Math.max(2, Math.round(travelTimeHours * 60 + 1.5));

    // Generate intermediate path points for map rendering
    const points: [number, number][] = [
      [origin.latitude, origin.longitude],
      // slight road detour point
      [
        origin.latitude + (destination.latitude - origin.latitude) * 0.45 + 0.003,
        origin.longitude + (destination.longitude - origin.longitude) * 0.35 - 0.002
      ],
      [
        origin.latitude + (destination.latitude - origin.latitude) * 0.75 - 0.002,
        origin.longitude + (destination.longitude - origin.longitude) * 0.8 + 0.001
      ],
      [destination.latitude, destination.longitude]
    ];

    return {
      distanceKm: roadDistanceKm,
      etaMinutes,
      provider: 'demo-mode',
      polyline: points
    };
  }
}

// Active singleton instance
const activeProvider: RoutingProvider = new DemoRoutingProvider();

export async function calculateEmergencyETA(
  origin: RouteCoordinate,
  destination: RouteCoordinate
): Promise<RouteResult> {
  return activeProvider.calculateRoute(origin, destination);
}
