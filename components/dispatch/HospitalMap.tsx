'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ScoredHospital } from '@/lib/types';
import { Navigation, Layers, Compass } from 'lucide-react';
import type * as LeafletType from 'leaflet';
import { fetchRoadPolyline } from '@/lib/routing';

interface HospitalMapProps {
  patientLocation: { latitude: number; longitude: number };
  hospitals: ScoredHospital[];
  selectedHospitalId?: string | null;
  onSelectHospital?: (hospital: ScoredHospital) => void;
  className?: string;
}

export function HospitalMap({
  patientLocation,
  hospitals,
  selectedHospitalId,
  onSelectHospital,
  className = ''
}: HospitalMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof LeafletType | null>(null);
  const mapInstanceRef = useRef<LeafletType.Map | null>(null);
  const markersLayerGroupRef = useRef<LeafletType.LayerGroup | null>(null);
  const routeLineRef = useRef<LeafletType.Layer | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const selectedHospital = hospitals.find((h) => h.hospital.id === selectedHospitalId) || hospitals[0];
  // Result of the last road-route lookup, tagged with the route it was for
  const [routeResult, setRouteResult] = useState<{ key: string; failed: boolean } | null>(null);
  const routeKey = selectedHospital
    ? `${patientLocation.latitude},${patientLocation.longitude}->${selectedHospital.hospital.id}`
    : null;
  const isRouteLoading = routeKey !== null && routeResult?.key !== routeKey;
  const routeFailed = routeKey !== null && routeResult?.key === routeKey && routeResult.failed;


  const initialLocationRef = useRef(patientLocation);

  // 1. Initialize Leaflet Map once
  useEffect(() => {
    let isMounted = true;

    async function initLeaflet() {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;

      try {
        const L = (await import('leaflet')).default;
        if (!isMounted || !mapContainerRef.current) return;
        leafletRef.current = L;

        // Clean any existing instance
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const map = L.map(mapContainerRef.current, {
          center: [initialLocationRef.current.latitude, initialLocationRef.current.longitude],
          zoom: 13,
          zoomControl: false,
          attributionControl: true
        });

        // OpenStreetMap tiles — free, no API key required
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerGroupRef.current = markersLayer;
        mapInstanceRef.current = map;

        if (isMounted) {
          setIsMapReady(true);
        }
      } catch (err) {
        console.error('Error initializing Leaflet map:', err);
      }
    }

    initLeaflet();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Run once on mount

  // 2. Update Leaflet markers and route lines dynamically
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerGroupRef.current;

    if (!L || !map || !markersLayer || !isMapReady) return;

    // Clear previous markers & route
    markersLayer.clearLayers();
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    // Patient / Ambulance Pulsing Graphic Vehicle Marker
    const patientIcon = L.divIcon({
      className: 'leaflet-patient-marker',
      html: `
        <div style="position: relative; width: 64px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <!-- Emergency Beacon Pulse Glow -->
          <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: radial-gradient(circle, rgba(239,68,68,0.4) 0%, rgba(59,130,246,0.2) 60%, transparent 80%); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          
          <!-- Realistic Top-Down Ambulance Vehicle Graphic -->
          <img 
            src="/icons/ambulance-top.svg" 
            alt="Ambulance" 
            style="width: 60px; height: 30px; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.45)); transform: rotate(-10deg); transition: transform 0.2s;"
          />
          
          <!-- Origin Tag -->
          <div style="position: absolute; bottom: -14px; left: 50%; transform: translateX(-50%); background: #dc2626; color: #ffffff; font-size: 9px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; border: 1.5px solid #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.25); white-space: nowrap;">
            AMBULANCE
          </div>
        </div>
      `,
      iconSize: [64, 36],
      iconAnchor: [32, 18]
    });

    const patientMarker = L.marker([patientLocation.latitude, patientLocation.longitude], {
      icon: patientIcon
    }).addTo(markersLayer);

    patientMarker.bindPopup(`
      <div style="font-family: inherit;">
        <span style="display: block; font-size: 12px; font-weight: 800; color: #dc2626; text-transform: uppercase; letter-spacing: 0.05em;">Ambulance</span>
        <strong style="font-size: 14px; color: #0f172a; display: block; margin-top: 2px;">Patient pickup point</strong>
        <span style="font-size: 12px; color: #64748b; font-family: monospace;">${patientLocation.latitude.toFixed(4)}, ${patientLocation.longitude.toFixed(4)}</span>
      </div>
    `);

    // Hospital Markers with Graphic Image of Hospital Building
    hospitals.forEach((h, index) => {
      const isSelected = h.hospital.id === selectedHospitalId;
      const isExact = h.isExactMatch;

      const badgeBg = isSelected ? '#2563eb' : isExact ? '#0f172a' : '#64748b';
      const glowEffect = isSelected ? 'drop-shadow(0 0 10px rgba(37,99,235,0.7)) drop-shadow(0 6px 12px rgba(0,0,0,0.4))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))';
      const scale = isSelected ? '1.18' : '1.0';
      const zIndexOffset = isSelected ? 1000 : 100;

      const hospitalIcon = L.divIcon({
        className: `leaflet-hospital-marker-${h.hospital.id}`,
        html: `
          <div style="
            position: relative;
            width: 52px;
            height: 52px;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: scale(${scale});
            transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            cursor: pointer;
          ">
            <!-- Floating Rank & ETA Pill above roof -->
            <div style="
              position: absolute;
              top: -10px;
              left: 50%;
              transform: translateX(-50%);
              background-color: ${badgeBg};
              color: #ffffff;
              padding: 2px 7px;
              border-radius: 9999px;
              font-size: 10px;
              font-weight: 800;
              display: flex;
              align-items: center;
              gap: 4px;
              border: 1.5px solid #ffffff;
              box-shadow: 0 3px 8px rgba(0,0,0,0.3);
              white-space: nowrap;
              z-index: 20;
            ">
              <span style="background: rgba(255,255,255,0.25); border-radius: 50%; width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; font-size: 9px;">#${index + 1}</span>
              <span>${h.etaMinutes}m</span>
            </div>

            <!-- Graphic Hospital Building Image -->
            <img 
              src="/icons/hospital-building.svg" 
              alt="${h.hospital.name}"
              style="
                width: 48px;
                height: 48px;
                object-fit: contain;
                filter: ${glowEffect};
                margin-top: 4px;
              "
            />
          </div>
        `,
        iconSize: [52, 52],
        iconAnchor: [26, 38]
      });

      const marker = L.marker([h.hospital.latitude, h.hospital.longitude], {
        icon: hospitalIcon,
        zIndexOffset
      }).addTo(markersLayer);

      marker.on('click', () => {
        if (onSelectHospital) {
          onSelectHospital(h);
        }
      });

      marker.bindTooltip(`
        <div style="font-family: inherit;">
          <strong style="color: #0f172a;">${h.hospital.name}</strong><br/>
          <span style="color: #2563eb; font-weight: bold;">${h.etaMinutes} min ETA</span> · <span>${h.distanceKm} km</span><br/>
          <span style="color: #64748b; font-size: 12px;">${h.hospital.current_load}% full</span>
        </div>
      `, {
        direction: 'top',
        offset: [0, -12]
      });
    });

    // Draw real turn-by-turn road route to selected hospital
    if (selectedHospital) {
      const origin = { latitude: patientLocation.latitude, longitude: patientLocation.longitude };
      const dest = { latitude: selectedHospital.hospital.latitude, longitude: selectedHospital.hospital.longitude };

      let isCurrent = true;
      const thisRoute = `${origin.latitude},${origin.longitude}->${selectedHospital.hospital.id}`;

      fetchRoadPolyline(origin, dest)
        .then((roadCoords) => {
          if (!isCurrent || !mapInstanceRef.current || !leafletRef.current) return;
          const currentMap = mapInstanceRef.current;
          const currentL = leafletRef.current;

          if (routeLineRef.current) {
            currentMap.removeLayer(routeLineRef.current);
            routeLineRef.current = null;
          }

          // Empty polyline = OSRM failed, show nothing (better than building-cutting line)
          if (!roadCoords || roadCoords.length < 2) {
            setRouteResult({ key: thisRoute, failed: true });
            return;
          }

          // Outer high-contrast street outline (dark navy)
          const casing = currentL.polyline(roadCoords, {
            color: '#1e3a8a',
            weight: 6.5,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
          });

          // Inner vibrant emergency route (electric blue)
          const core = currentL.polyline(roadCoords, {
            color: '#3b82f6',
            weight: 4,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
          });

          const group = currentL.layerGroup([casing, core]).addTo(currentMap);
          routeLineRef.current = group;
          setRouteResult({ key: thisRoute, failed: false });

          // Fit map bounds to show patient and target hospital
          const bounds = currentL.latLngBounds(roadCoords);
          currentMap.fitBounds(bounds, { padding: [55, 55], maxZoom: 16 });
        })
        .catch(() => {
          if (!isCurrent) return;
          setRouteResult({ key: thisRoute, failed: true });
          // Fit map to just show both points without a route line
          if (mapInstanceRef.current && leafletRef.current) {
            const currentL = leafletRef.current;
            const bounds = currentL.latLngBounds([
              [origin.latitude, origin.longitude],
              [dest.latitude, dest.longitude]
            ]);
            mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
          }
        });

      return () => {
        isCurrent = false;
        if (routeLineRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(routeLineRef.current);
          routeLineRef.current = null;
        }
      };
    }
  }, [isMapReady, patientLocation, hospitals, selectedHospitalId, onSelectHospital, selectedHospital]);

  // Recenter helper
  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (map) {
      map.setView([patientLocation.latitude, patientLocation.longitude], 13);
    }
  };

  return (
    <div
      className={`relative bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm flex flex-col ${className}`}
      aria-label="Leaflet Emergency Location and Route Map"
    >
      {/* Top Map HUD overlay */}
      <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-md text-xs flex items-center gap-3 pointer-events-auto max-w-[90%]">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 shrink-0">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          {isRouteLoading ? (
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping inline-block" />
              Finding the road route…
            </span>
          ) : routeFailed ? (
            <span className="text-amber-600">Road route unavailable: straight line shown</span>
          ) : (
            <span>Road route</span>
          )}
        </div>
        {selectedHospital && !isRouteLoading && (
          <div className="flex items-center gap-2 text-slate-600 border-l border-slate-200 pl-3">
            <span className="font-medium text-slate-900 truncate max-w-[120px]">
              {selectedHospital.hospital.name}
            </span>
            <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
              {selectedHospital.etaMinutes} min
            </span>
          </div>
        )}
      </div>


      {/* Recenter Button */}
      <button
        type="button"
        onClick={handleRecenter}
        className="absolute bottom-10 right-3 z-[1000] bg-white hover:bg-slate-50 text-slate-700 p-2 rounded-lg border border-slate-200 shadow-md transition-colors"
        title="Recenter Map on Patient"
        aria-label="Recenter map on patient location"
      >
        <Compass className="w-4 h-4 text-slate-700" />
      </button>

      {/* Main Leaflet Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[320px] z-0" />

      {/* Map Footer Bar */}
      <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between z-10">
        <span className="flex items-center gap-1">
          <Navigation className="w-3 h-3 text-blue-600" />
          Drive times use real roads
        </span>
        <span className="text-slate-400">Tap a hospital to see its route</span>
      </div>
    </div>
  );
}
