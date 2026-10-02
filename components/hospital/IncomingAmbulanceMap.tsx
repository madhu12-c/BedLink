'use client';

import React, { useEffect, useRef, useState } from 'react';
import type * as LeafletType from 'leaflet';
import { Navigation } from 'lucide-react';
import { bedLinkStore } from '@/lib/data/store';
import { fetchRoadPolyline, pointAlongRoute } from '@/lib/routing';
import { fetchPickupLocation } from '@/lib/supabase/sync';
import { IncomingAmbulanceItem } from './AmbulanceArrivalCountdown';

interface IncomingAmbulanceMapProps {
  hospital: { id: string; name: string; latitude: number; longitude: number };
  incoming: IncomingAmbulanceItem[];
}

/** Road route from the pickup point to this hospital, per incoming request. */
interface TripRoute {
  route: [number, number][];
  /** true when OSRM failed and the line is straight */
  straight: boolean;
}

type Point = { latitude: number; longitude: number };

async function findPickup(requestId: string): Promise<Point | null> {
  const local = bedLinkStore.getActiveEmergencyRequests().find((r) => r.id === requestId);
  if (local) return { latitude: local.patient_latitude, longitude: local.patient_longitude };
  return fetchPickupLocation(requestId);
}

/**
 * Accepted ambulances on their way here, moving along the real road route. The crew's phone
 * doesn't send GPS yet, so the position is simulated: how far along the route it should be,
 * from when the bed was held to the expected arrival (the same times as the countdown).
 */
export function IncomingAmbulanceMap({ hospital, incoming }: IncomingAmbulanceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof LeafletType | null>(null);
  const mapRef = useRef<LeafletType.Map | null>(null);
  const layerRef = useRef<LeafletType.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, LeafletType.Marker>>(new Map());
  const fittedRef = useRef<string>('');
  const [mapReady, setMapReady] = useState(false);
  const [trips, setTrips] = useState<Record<string, TripRoute | null>>({});
  const [now, setNow] = useState(() => Date.now());

  // 1. Map, once
  useEffect(() => {
    let alive = true;
    const markers = markersRef.current;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!alive || !containerRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        center: [hospital.latitude, hospital.longitude],
        zoom: 13,
        zoomControl: false
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
    })().catch((err) => console.error('[map] could not start:', err));
    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, [hospital.latitude, hospital.longitude]);

  // 2. Road route for each new ambulance (pickup point -> this hospital)
  const tripIds = incoming.map((i) => `${i.reservation.id}|${i.reservation.request_id}`).join(',');
  useEffect(() => {
    let alive = true;
    for (const item of incoming) {
      const id = item.reservation.id;
      if (id in trips) continue;
      findPickup(item.reservation.request_id)
        .then(async (pickup) => {
          if (!pickup) return null;
          const destination = { latitude: hospital.latitude, longitude: hospital.longitude };
          const road = await fetchRoadPolyline(pickup, destination).catch(() => []);
          return road.length >= 2
            ? { route: road, straight: false }
            : { route: [[pickup.latitude, pickup.longitude], [hospital.latitude, hospital.longitude]] as [number, number][], straight: true };
        })
        .then((trip) => {
          if (alive) setTrips((prev) => ({ ...prev, [id]: trip }));
        })
        .catch(() => {
          if (alive) setTrips((prev) => ({ ...prev, [id]: null }));
        });
    }
    return () => {
      alive = false;
    };
    // Only when the set of ambulances changes
  }, [tripIds, hospital.latitude, hospital.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Clock: move the ambulances every second
  useEffect(() => {
    if (incoming.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [incoming.length]);

  // 4. Hospital and road routes: redrawn only when the routes change
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer || !mapReady) return;

    layer.clearLayers();
    L.marker([hospital.latitude, hospital.longitude], {
      icon: L.divIcon({
        className: '',
        html: '<img src="/icons/hospital-building.svg" alt="" style="width:40px;height:40px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.35))" />',
        iconSize: [40, 40],
        iconAnchor: [20, 36]
      }),
      zIndexOffset: 500
    })
      .bindTooltip(hospital.name, { direction: 'top', offset: [0, -32] })
      .addTo(layer);

    const bounds: [number, number][] = [[hospital.latitude, hospital.longitude]];
    const shown: string[] = [];
    for (const item of incoming) {
      const trip = trips[item.reservation.id];
      if (!trip) continue;
      shown.push(item.reservation.id);
      L.polyline(trip.route, { color: '#2563eb', weight: 5, opacity: 0.55, dashArray: trip.straight ? '8 8' : undefined }).addTo(layer);
      bounds.push(...trip.route);
    }
    // Zoom to show every route once per set of ambulances
    const fitKey = shown.sort().join(',');
    if (fitKey && fitKey !== fittedRef.current) {
      fittedRef.current = fitKey;
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 15 });
    }
    // Only when the routes or the set of ambulances change, not every second
  }, [mapReady, trips, hospital, tripIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 5. Ambulances at their simulated position, every second
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;

    const markers = markersRef.current;
    const live = new Set<string>();
    for (const item of incoming) {
      const trip = trips[item.reservation.id];
      if (!trip) continue;
      live.add(item.reservation.id);
      const start = new Date(item.reservation.requested_at).getTime();
      const fraction = (now - start) / Math.max(1, item.targetArrivalMs - start);
      const { point } = pointAlongRoute(trip.route, fraction);

      let marker = markers.get(item.reservation.id);
      if (!marker) {
        marker = L.marker(point, {
          icon: L.divIcon({
            className: '',
            html: `<div style="position:relative;width:56px;height:30px"><div style="position:absolute;inset:-6px;border-radius:9999px;background:rgba(239,68,68,.3);animation:ping 1.8s cubic-bezier(0,0,.2,1) infinite"></div><img src="/icons/ambulance-top.svg" alt="" style="position:relative;width:56px;height:30px;object-fit:contain;filter:drop-shadow(0 3px 6px rgba(0,0,0,.4))" /></div>`,
            iconSize: [56, 30],
            iconAnchor: [28, 15]
          }),
          zIndexOffset: 1000
        })
          .bindTooltip(`${item.ambulanceId} · ${item.bedType.toUpperCase()} bed`, { direction: 'top', offset: [0, -14] })
          .addTo(map);
        markers.set(item.reservation.id, marker);
      } else {
        marker.setLatLng(point);
      }
    }
    // Ambulances that arrived or were cancelled
    for (const [id, marker] of markers) {
      if (!live.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
  }, [mapReady, trips, now, incoming]);

  if (incoming.length === 0) return null;

  const located = incoming.filter((i) => trips[i.reservation.id]);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <Navigation className="w-4 h-4 text-blue-600" />
          Ambulances on the way ({incoming.length})
        </h3>
        <span className="text-xs text-slate-500" title="The crew's phone does not send GPS yet: position is worked out from the route and the expected arrival time">
          Simulated position along the real road
        </span>
      </div>
      <div ref={containerRef} className="h-72 w-full bg-slate-100" />
      {located.length < incoming.length && (
        <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">
          Finding the route for {incoming.length - located.length} ambulance{incoming.length - located.length === 1 ? '' : 's'}…
        </p>
      )}
      <ul className="divide-y divide-slate-100">
        {located.map((item) => {
          const trip = trips[item.reservation.id]!;
          const start = new Date(item.reservation.requested_at).getTime();
          const fraction = (now - start) / Math.max(1, item.targetArrivalMs - start);
          const { remainingKm } = pointAlongRoute(trip.route, fraction);
          const minutesLeft = Math.max(0, Math.ceil((item.targetArrivalMs - now) / 60_000));
          return (
            <li key={item.reservation.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-800">
                {item.ambulanceId} · {item.bedType.toUpperCase()} bed
              </span>
              <span className={`font-extrabold ${minutesLeft <= 2 ? 'text-red-700' : 'text-slate-900'}`}>
                {minutesLeft === 0 ? 'Arriving now' : `${minutesLeft} min · ${remainingKm.toFixed(1)} km`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
