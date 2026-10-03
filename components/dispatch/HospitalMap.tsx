'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ScoredHospital } from '@/lib/types';
import { Navigation, Layers, Compass } from 'lucide-react';
import type * as LeafletType from 'leaflet';
import { fetchRoadPolyline } from '@/lib/routing';
import { DIRECTORY_HOSPITALS } from '@/lib/data/directoryHospitals';
import { useLiveAmbulances } from '@/lib/tracking/useLiveAmbulances';
import type { LivePosition } from '@/lib/tracking/liveTracking';

/** Live ambulance pin: arrow turned to the phone's compass, MOVING / STOPPED tag. */
function liveIconHtml(a: LivePosition): string {
  const name = a.name.replace(/[&<>"']/g, '');
  return `
    <div style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 56px; height: 56px; border-radius: 50%; background: rgba(220,38,38,0.18); animation: ping 1.6s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div data-heading style="position: absolute; inset: 0; transition: transform 0.3s ease-out; transform: rotate(${a.heading ?? 0}deg);">
        <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 16px solid #dc2626;"></div>
      </div>
      <div style="width: 34px; height: 34px; border-radius: 50%; background: #ffffff; border: 3px solid #dc2626; box-shadow: 0 3px 10px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; font-size: 18px;">🚑</div>
      <div data-moving style="position: absolute; bottom: -12px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 9px; font-weight: 900; letter-spacing: 0.04em; padding: 1px 5px; border-radius: 4px; border: 1.5px solid #fff; white-space: nowrap; background: ${a.moving ? '#16a34a' : '#64748b'};">${a.moving ? 'MOVING' : 'STOPPED'}</div>
      <div style="position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: #dc2626; color: #fff; font-size: 9px; font-weight: 900; padding: 1px 5px; border-radius: 4px; border: 1.5px solid #fff; white-space: nowrap;">LIVE · ${name}</div>
    </div>`;
}

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
  // Zoomed out to every govt hospital: the route then doesn't pull the map back in
  const [showGovt, setShowGovt] = useState(false);
  const showGovtRef = useRef(false);
  // Ambulances sharing their phone's GPS / compass / motion right now
  const liveAmbulances = useLiveAmbulances();
  const liveLayerRef = useRef<LeafletType.LayerGroup | null>(null);
  const liveMarkersRef = useRef(new Map<string, LeafletType.Marker>());
  const [followId, setFollowId] = useState<string | null>(null);
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

    // Government hospitals from the national hospital directory that aren't on BedLink yet:
    // purple "GOVT" pins (no live beds, so they are never ranked)
    const govtIcon = L.divIcon({
      className: 'leaflet-govt-hospital-marker',
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
          <div style="width: 26px; height: 26px; border-radius: 8px; background: #7c3aed; border: 2px solid #ffffff; box-shadow: 0 3px 8px rgba(0,0,0,0.35); color: #ffffff; font-size: 18px; font-weight: 900; line-height: 22px; text-align: center;">+</div>
          <div style="margin-top: 2px; background: #7c3aed; color: #ffffff; font-size: 8px; font-weight: 800; letter-spacing: 0.05em; padding: 0 4px; border-radius: 4px; border: 1px solid #ffffff;">GOVT</div>
        </div>
      `,
      iconSize: [34, 42],
      iconAnchor: [17, 14]
    });
    for (const d of DIRECTORY_HOSPITALS) {
      if (d.inBedLink) continue;
      L.marker([d.latitude, d.longitude], { icon: govtIcon, zIndexOffset: 50 })
        .addTo(markersLayer)
        .bindTooltip(
          `<div style="font-family: inherit;">
            <strong style="color: #0f172a;">${d.name}</strong>, ${d.area}<br/>
            <span style="color: #64748b; font-size: 12px;">Govt hospital directory · not on BedLink yet${d.phone ? ` · ${d.phone}` : ''}</span>
          </div>`,
          { direction: 'top', offset: [0, -14] }
        );
    }

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

          // Fit map bounds to show patient and target hospital (not while showing all govt hospitals)
          const bounds = currentL.latLngBounds(roadCoords);
          if (!showGovtRef.current) currentMap.fitBounds(bounds, { padding: [55, 55], maxZoom: 16 });
        })
        .catch(() => {
          if (!isCurrent) return;
          setRouteResult({ key: thisRoute, failed: true });
          // Fit map to just show both points without a route line
          if (mapInstanceRef.current && leafletRef.current && !showGovtRef.current) {
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

  // 3. Live ambulances: own layer, markers moved and turned in place (no flicker at 4 updates/s)
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map || !isMapReady) return;
    if (!liveLayerRef.current) liveLayerRef.current = L.layerGroup().addTo(map);
    const layer = liveLayerRef.current;
    const markers = liveMarkersRef.current;
    const seen = new Set<string>();

    for (const a of liveAmbulances) {
      if (a.lat === null || a.lng === null) continue;
      seen.add(a.id);
      const tooltip = `<strong>${a.name.replace(/[&<>"']/g, '')}</strong>${a.fleet ? ` · ${a.fleet.replace(/[&<>"']/g, '')}` : ''}${a.vehicle ? ` ${a.vehicle}` : ''}<br/>${a.moving ? 'Moving' : 'Stopped'}${a.heading !== null ? ` · facing ${a.heading}°` : ''}${a.accuracy !== null ? ` · ±${a.accuracy} m` : ''}`;
      let marker = markers.get(a.id);
      if (!marker) {
        marker = L.marker([a.lat, a.lng], {
          icon: L.divIcon({ className: 'leaflet-live-ambulance', html: liveIconHtml(a), iconSize: [64, 64], iconAnchor: [32, 32] }),
          zIndexOffset: 3000
        }).addTo(layer);
        marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -30] });
        markers.set(a.id, marker);
      } else {
        marker.setLatLng([a.lat, a.lng]);
        marker.setTooltipContent(tooltip);
        const el = marker.getElement();
        const arrow = el?.querySelector<HTMLElement>('[data-heading]');
        if (arrow) arrow.style.transform = `rotate(${a.heading ?? 0}deg)`;
        const tag = el?.querySelector<HTMLElement>('[data-moving]');
        if (tag) {
          tag.textContent = a.moving ? 'MOVING' : 'STOPPED';
          tag.style.background = a.moving ? '#16a34a' : '#64748b';
        }
      }
      if (followId === a.id) map.panTo([a.lat, a.lng], { animate: true });
    }
    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        layer.removeLayer(marker);
        markers.delete(id);
      }
    }
  }, [liveAmbulances, isMapReady, followId]);

  const handleFollow = (a: LivePosition) => {
    const map = mapInstanceRef.current;
    if (followId === a.id) {
      setFollowId(null);
      showGovtRef.current = showGovt;
      return;
    }
    setFollowId(a.id);
    showGovtRef.current = true; // the route must not pull the map away while following
    if (map && a.lat !== null && a.lng !== null) map.setView([a.lat, a.lng], 17);
  };

  // Recenter helper
  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    setFollowId(null);
    showGovtRef.current = false;
    setShowGovt(false);
    if (map) {
      map.setView([patientLocation.latitude, patientLocation.longitude], 13);
    }
  };

  // Zoom out to every government hospital from the directory (and back)
  const govtCount = DIRECTORY_HOSPITALS.filter((d) => !d.inBedLink).length;
  const handleToggleGovt = () => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    const next = !showGovt;
    showGovtRef.current = next;
    setShowGovt(next);
    setFollowId(null);
    if (!map || !L) return;
    if (next) {
      const points: [number, number][] = [
        [patientLocation.latitude, patientLocation.longitude],
        ...DIRECTORY_HOSPITALS.map((d): [number, number] => [d.latitude, d.longitude])
      ];
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    } else {
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


      {/* Live ambulances: tap to follow one */}
      {liveAmbulances.length > 0 && (
        <div className="absolute top-14 left-3 z-[1000] flex flex-col gap-1 max-w-[80%]">
          {liveAmbulances.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => handleFollow(a)}
              aria-pressed={followId === a.id}
              disabled={a.lat === null}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shadow-md text-xs font-bold text-left ${
                followId === a.id ? 'bg-red-600 text-white border-red-700' : 'bg-white text-slate-900 border-red-300'
              }`}
              title={a.lat === null ? 'Waiting for this phone’s GPS' : followId === a.id ? 'Stop following' : 'Follow on the map'}
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden="true" />
              <span className="truncate">LIVE · {a.name}</span>
              <span
                className="inline-block transition-transform duration-300"
                style={{ transform: `rotate(${a.heading ?? 0}deg)` }}
                aria-label={a.heading !== null ? `facing ${a.heading} degrees` : 'no compass'}
              >
                ↑
              </span>
              <span className={`px-1 rounded text-[10px] ${a.moving ? 'bg-emerald-600 text-white' : 'bg-slate-500 text-white'}`}>
                {a.moving ? 'MOVING' : 'STOPPED'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* All government hospitals from the directory */}
      <button
        type="button"
        onClick={handleToggleGovt}
        aria-pressed={showGovt}
        className={`absolute bottom-10 left-3 z-[1000] px-3 py-2 rounded-lg border shadow-md text-xs font-bold flex items-center gap-1.5 transition-colors ${
          showGovt
            ? 'bg-violet-600 hover:bg-violet-700 text-white border-violet-700'
            : 'bg-white hover:bg-violet-50 text-violet-800 border-violet-300'
        }`}
      >
        <span
          className={`w-4 h-4 rounded-[4px] flex items-center justify-center text-[11px] font-black ${showGovt ? 'bg-white text-violet-700' : 'bg-violet-600 text-white'}`}
          aria-hidden="true"
        >
          +
        </span>
        {showGovt ? 'Back to the patient' : `Show ${govtCount} govt hospitals`}
      </button>

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
        <span className="flex items-center gap-1 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-violet-600 inline-block" aria-hidden="true" />
          Govt hospital (directory), not on BedLink yet
        </span>
        <span className="text-slate-400 hidden sm:inline">Tap a hospital to see its route</span>
      </div>
    </div>
  );
}
