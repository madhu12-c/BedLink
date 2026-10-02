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

    // Patient / Ambulance Pulsing Marker
    const patientIcon = L.divIcon({
      className: 'leaflet-patient-marker',
      html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: -4px; border-radius: 50%; background-color: rgba(220, 38, 38, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="background-color: #dc2626; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.45); border: 2.5px solid white; z-index: 10;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10h4"/><path d="M12 8v4"/><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    const patientMarker = L.marker([patientLocation.latitude, patientLocation.longitude], {
      icon: patientIcon
    }).addTo(markersLayer);

    patientMarker.bindPopup(`
      <div style="font-family: inherit;">
        <span style="display: block; font-size: 10px; font-weight: 800; color: #dc2626; text-transform: uppercase; letter-spacing: 0.05em;">Emergency Triage</span>
        <strong style="font-size: 13px; color: #0f172a; display: block; margin-top: 2px;">Patient / Ambulance Origin</strong>
        <span style="font-size: 11px; color: #64748b; font-family: monospace;">${patientLocation.latitude.toFixed(4)}, ${patientLocation.longitude.toFixed(4)}</span>
      </div>
    `);

    // Hospital Markers
    hospitals.forEach((h, index) => {
      const isSelected = h.hospital.id === selectedHospitalId;
      const isExact = h.isExactMatch;

      const bgColor = isSelected ? '#2563eb' : isExact ? '#0f172a' : '#64748b';
      const scale = isSelected ? '1.15' : '1.0';
      const zIndexOffset = isSelected ? 1000 : 100;

      const hospitalIcon = L.divIcon({
        className: `leaflet-hospital-marker-${h.hospital.id}`,
        html: `
          <div style="
            background-color: ${bgColor};
            color: #ffffff;
            padding: 4px 9px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 5px;
            border: 2px solid #ffffff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
            transform: scale(${scale});
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            white-space: nowrap;
          ">
            <span style="background: rgba(255,255,255,0.25); border-radius: 50%; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px;">#${index + 1}</span>
            <span>${h.etaMinutes}m</span>
          </div>
        `,
        iconSize: [66, 28],
        iconAnchor: [33, 14]
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
          <span style="color: #64748b; font-size: 10px;">Load: ${h.hospital.current_load}%</span>
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

      fetchRoadPolyline(origin, dest)
        .then((roadCoords) => {
          if (!isCurrent || !mapInstanceRef.current || !leafletRef.current) return;
          const currentMap = mapInstanceRef.current;
          const currentL = leafletRef.current;

          if (routeLineRef.current) {
            currentMap.removeLayer(routeLineRef.current);
            routeLineRef.current = null;
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

          // Fit map bounds to show patient and target hospital
          const bounds = currentL.latLngBounds(roadCoords);
          currentMap.fitBounds(bounds, { padding: [55, 55], maxZoom: 16 });
        })
        .catch(() => {
          if (!isCurrent || !mapInstanceRef.current || !leafletRef.current) return;
          const currentMap = mapInstanceRef.current;
          const currentL = leafletRef.current;

          const polyline = currentL.polyline([
            [origin.latitude, origin.longitude],
            [dest.latitude, dest.longitude]
          ], {
            color: '#2563eb',
            weight: 4.5,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(currentMap);

          routeLineRef.current = polyline;
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
      <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200/80 shadow-md text-xs flex items-center gap-3 pointer-events-auto">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          <span>🛣️ Road Route (Turn-by-Turn)</span>
        </div>
        {selectedHospital && (
          <div className="flex items-center gap-2 text-slate-600 border-l border-slate-200 pl-3">
            <span className="font-medium text-slate-900 truncate max-w-[140px]">
              {selectedHospital.hospital.name}
            </span>
            <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded">
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
      <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between z-10">
        <span className="flex items-center gap-1">
          <Navigation className="w-3 h-3 text-blue-600" />
          Leaflet + OpenStreetMap
        </span>
        <span className="font-mono text-slate-400">LIVE MAP</span>
      </div>
    </div>
  );
}
