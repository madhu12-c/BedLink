'use client';

import React, { useEffect, useRef, useState } from 'react';
import type * as LeafletType from 'leaflet';
import { Hospital, BedType } from '@/lib/types';
import { Activity, ShieldAlert, Sparkles, Layers, Eye } from 'lucide-react';

interface HospitalWithBeds {
  hospital: Hospital;
  inventory: Record<BedType, { available_beds: number; total_beds: number } | undefined>;
  capabilities: string[];
}

interface CityIcuHeatmapProps {
  candidates: HospitalWithBeds[];
  selectedMetric?: 'icu' | 'ventilator' | 'all';
}

export function CityIcuHeatmap({
  candidates,
  selectedMetric = 'icu'
}: CityIcuHeatmapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof LeafletType | null>(null);
  const mapInstanceRef = useRef<LeafletType.Map | null>(null);
  const heatLayerGroupRef = useRef<LeafletType.LayerGroup | null>(null);
  const [metric, setMetric] = useState<'icu' | 'ventilator' | 'all'>(selectedMetric);
  const [selectedHospital, setSelectedHospital] = useState<HospitalWithBeds | null>(null);

  // Initialize Map
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;

      try {
        const L = (await import('leaflet')).default;
        if (!isMounted || !mapContainerRef.current) return;
        leafletRef.current = L;

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Center on Mumbai Kandivali / Western suburban belt
        const map = L.map(mapContainerRef.current, {
          center: [19.2105, 72.8625],
          zoom: 14,
          zoomControl: false,
          attributionControl: true
        });

        // Crisp dark-slate CARTO basemap perfect for emergency heatmaps
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          subdomains: 'abcd',
          attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        heatLayerGroupRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;

        renderHeatLayers();
      } catch (err) {
        console.error('Heatmap initialization error:', err);
      }
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Heat Layers when candidates or metric changes
  useEffect(() => {
    renderHeatLayers();
  }, [candidates, metric]);

  const renderHeatLayers = () => {
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    const layerGroup = heatLayerGroupRef.current;
    if (!L || !map || !layerGroup) return;

    layerGroup.clearLayers();

    candidates.forEach((cand) => {
      const { hospital, inventory } = cand;
      const icuFree = inventory['icu']?.available_beds ?? 0;
      const ventFree = inventory['ventilator']?.available_beds ?? 0;
      const totalAvailable = Object.values(inventory).reduce(
        (sum, item) => sum + (item?.available_beds || 0),
        0
      );

      let value = icuFree;
      let label = `${icuFree} ICU Free`;
      if (metric === 'ventilator') {
        value = ventFree;
        label = `${ventFree} Vents Free`;
      } else if (metric === 'all') {
        value = totalAvailable;
        label = `${totalAvailable} Beds Free`;
      }

      // Heat Intensity & Color Spectrum
      // Critical Red (0) -> Amber (1-2) -> Lime/Green (3-5) -> Bright Cyan (>5)
      let fillColor = '#10b981'; // emerald
      let strokeColor = '#059669';
      let radiusMeters = 550;
      let haloRadiusMeters = 850;
      let intensityText = 'Optimal Capacity';

      if (value === 0) {
        fillColor = '#ef4444'; // critical red
        strokeColor = '#b91c1c';
        radiusMeters = 650;
        haloRadiusMeters = 1000;
        intensityText = 'CRITICAL DEFICIT / DIVERT';
      } else if (value <= 2) {
        fillColor = '#f59e0b'; // amber
        strokeColor = '#d97706';
        radiusMeters = 500;
        haloRadiusMeters = 750;
        intensityText = 'Tight Reserve';
      } else if (value > 5) {
        fillColor = '#06b6d4'; // bright cyan
        strokeColor = '#0891b2';
        radiusMeters = 600;
        haloRadiusMeters = 900;
        intensityText = 'Abundant Capacity';
      }

      // Outer heat glow halo (semi-transparent gradient)
      const halo = L.circle([hospital.latitude, hospital.longitude], {
        radius: haloRadiusMeters,
        color: fillColor,
        fillColor: fillColor,
        fillOpacity: value === 0 ? 0.28 : 0.16,
        weight: 0,
        interactive: false
      });
      halo.addTo(layerGroup);

      // Core density circle
      const core = L.circle([hospital.latitude, hospital.longitude], {
        radius: radiusMeters,
        color: strokeColor,
        fillColor: fillColor,
        fillOpacity: value === 0 ? 0.55 : 0.45,
        weight: 2
      });
      core.addTo(layerGroup);

      // Custom Hospital Center Pin with Live Free Badge
      const customIcon = L.divIcon({
        className: 'bedlink-heat-pin',
        html: `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            background: #0f172a;
            color: #ffffff;
            border: 2px solid ${strokeColor};
            border-radius: 9999px;
            padding: 4px 10px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.35);
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
            cursor: pointer;
            transform: translate(-50%, -50%);
          ">
            <span style="
              width: 8px;
              height: 8px;
              border-radius: 9999px;
              background-color: ${fillColor};
              box-shadow: 0 0 8px ${fillColor};
              display: inline-block;
            "></span>
            <span>${label}</span>
          </div>
        `,
        iconSize: [0, 0]
      });

      const marker = L.marker([hospital.latitude, hospital.longitude], {
        icon: customIcon
      });

      marker.on('click', () => {
        setSelectedHospital(cand);
      });

      marker.addTo(layerGroup);
    });
  };

  // Aggregated city stats
  const totalIcuFree = candidates.reduce(
    (sum, c) => sum + (c.inventory['icu']?.available_beds || 0),
    0
  );
  const totalVentFree = candidates.reduce(
    (sum, c) => sum + (c.inventory['ventilator']?.available_beds || 0),
    0
  );
  const criticalHospitals = candidates.filter(
    (c) => (c.inventory['icu']?.available_beds || 0) === 0
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Heatmap Control Toolbar */}
      <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tight text-white flex items-center gap-2">
              <span>City ICU & Critical Capacity Heatmap</span>
              <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-400/30">
                108 Live CAD
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">
              Realtime geospatial ICU bed density, ventilator reserves, and ER diversion alerts
            </p>
          </div>
        </div>

        {/* Metric Selector Tabs */}
        <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMetric('icu')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              metric === 'icu'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Free ICU Rooms ({totalIcuFree})
          </button>
          <button
            type="button"
            onClick={() => setMetric('ventilator')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              metric === 'ventilator'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Ventilators ({totalVentFree})
          </button>
          <button
            type="button"
            onClick={() => setMetric('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              metric === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Beds
          </button>
        </div>
      </div>

      {/* Map Body */}
      <div className="relative w-full h-[440px] sm:h-[480px] bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Heat Legend Overlay */}
        <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md text-white p-3 rounded-xl border border-slate-700 shadow-xl text-xs max-w-[260px]">
          <div className="font-bold text-[11px] uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
            <span>Bed Density Heat Spectrum</span>
            <Layers className="w-3 h-3 text-slate-400" />
          </div>
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
                <span className="text-slate-200">&gt; 5 Free (Optimal)</span>
              </span>
              <span className="text-cyan-400 font-mono font-bold">Safe</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                <span className="text-slate-200">3 - 5 Free</span>
              </span>
              <span className="text-emerald-400 font-mono font-bold">Stable</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]"></span>
                <span className="text-slate-200">1 - 2 Free (Tight)</span>
              </span>
              <span className="text-amber-400 font-mono font-bold">Warning</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                <span className="text-red-300 font-semibold">0 Free (Crisis / Divert)</span>
              </span>
              <span className="text-red-400 font-mono font-bold">Alert</span>
            </div>
          </div>
        </div>

        {/* Divert Alert Banner if any hospital has 0 ICU */}
        {criticalHospitals.length > 0 && metric === 'icu' && (
          <div className="absolute top-4 left-4 z-10 bg-red-950/90 border border-red-500 text-red-100 px-3.5 py-2 rounded-xl backdrop-blur-md shadow-xl flex items-center gap-2.5 text-xs max-w-md">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 animate-bounce" />
            <div>
              <span className="font-bold uppercase tracking-wider text-[10px] text-red-400 block">
                Regional Divert Advisory
              </span>
              <span>
                <strong>{criticalHospitals.length} hospital(s)</strong> at zero ICU capacity. Automatic EMS divert active.
              </span>
            </div>
          </div>
        )}

        {/* Selected Hospital Card Modal */}
        {selectedHospital && (
          <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-2xl max-w-xs w-full text-slate-900">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  Facility Telemetry
                </span>
                <h3 className="font-black text-sm text-slate-900 mt-1">
                  {selectedHospital.hospital.name}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {selectedHospital.hospital.address}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHospital(null)}
                className="text-slate-400 hover:text-slate-700 text-xs px-1.5 py-0.5"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 my-3">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">
                  Free ICU Rooms
                </span>
                <span className={`text-lg font-black font-mono ${
                  (selectedHospital.inventory['icu']?.available_beds ?? 0) === 0
                    ? 'text-red-600'
                    : 'text-emerald-600'
                }`}>
                  {selectedHospital.inventory['icu']?.available_beds ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  of {selectedHospital.inventory['icu']?.total_beds ?? 0} Total
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">
                  Free Ventilators
                </span>
                <span className="text-lg font-black font-mono text-blue-600">
                  {selectedHospital.inventory['ventilator']?.available_beds ?? 0}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  of {selectedHospital.inventory['ventilator']?.total_beds ?? 0} Total
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2">
              <div className="flex justify-between">
                <span>Emergency Load:</span>
                <strong className="font-mono">{selectedHospital.hospital.current_load}%</strong>
              </div>
              <div className="flex justify-between">
                <span>Phone / CAD:</span>
                <strong className="font-mono text-blue-600">{selectedHospital.hospital.phone || '+91 22 2854 4455'}</strong>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedHospital.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="text-[9px] font-bold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
