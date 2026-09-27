/**
 * One district's road network, coloured by live status. Remount it (key=district)
 * when the district changes. Used read-only on the public
 * Road Status page and interactively (click a road) on the officials'
 * Connectivity dashboard.
 */
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Place, RoadFeatures } from '../services/logistics';

const ROAD_STYLE: Record<string, { color: string; weight: number }> = {
  NH: { color: '#0b3068', weight: 4 }, SH: { color: '#1c4f9e', weight: 3.5 }, MDR: { color: '#2a5fb0', weight: 3 },
};
const baseStyle = (category: string, inMain: boolean) => ROAD_STYLE[category] ?? { color: inMain ? '#64748b' : '#a8b3c2', weight: 2 };

interface RoadStatusMapProps {
  roads: RoadFeatures;
  blockedIds: number[];
  /** health facilities to flag as cut off (red) */
  cutOff?: Place[];
  selectedId?: number | null;
  onRoadClick?: (edgeId: number) => void;
  height?: string;
}

export const RoadStatusMap: React.FC<RoadStatusMapProps> = ({ roads: roadData, blockedIds, cutOff = [], selectedId = null, onRoadClick, height = 'h-[560px]' }) => {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const roads = useRef<L.GeoJSON | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const clickRef = useRef(onRoadClick);
  clickRef.current = onRoadClick;

  useEffect(() => {
    if (!div.current || map.current) return;
    const m = L.map(div.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors · Roads: PMGSY GeoSadak (MoRD)', maxZoom: 18,
    }).addTo(m);
    const layer = L.geoJSON(roadData, {
      style: (f) => ({ ...baseStyle(f?.properties.category, f?.properties.in_main_network), opacity: 0.9 }),
      onEachFeature: (f, l) => {
        l.bindTooltip(`${f.properties.road_name || 'Unnamed road'} · ${f.properties.category} · ${(f.properties.length_m / 1000).toFixed(1)} km`, { sticky: true });
        l.on('click', () => clickRef.current?.(f.properties.edge_id));
      },
    }).addTo(m);
    m.fitBounds(layer.getBounds(), { padding: [10, 10] });
    roads.current = layer;
    markers.current = L.layerGroup().addTo(m);
    map.current = m;
    if (import.meta.env.DEV) (window as unknown as { __roadMap?: L.Map }).__roadMap = m; // debugging aid in dev only
    return () => { m.remove(); map.current = null; };
  }, [roadData]);

  useEffect(() => {
    roads.current?.eachLayer((layer) => {
      const l = layer as L.Path & { feature?: GeoJSON.Feature<GeoJSON.LineString, { edge_id: number; category: string; in_main_network: boolean }> };
      const p = l.feature?.properties;
      if (!p) return;
      if (blockedIds.includes(p.edge_id)) {
        l.setStyle({ color: '#c62828', weight: 7, dashArray: undefined, opacity: 1 });
        l.bringToFront();
      } else if (p.edge_id === selectedId) {
        l.setStyle({ color: '#e07b13', weight: 7, dashArray: undefined, opacity: 1 });
        l.bringToFront();
      } else {
        l.setStyle({ ...baseStyle(p.category, p.in_main_network), dashArray: undefined, opacity: 0.9 });
      }
    });
  }, [blockedIds, selectedId]);

  useEffect(() => {
    const g = markers.current;
    if (!g) return;
    g.clearLayers();
    cutOff.forEach((f) =>
      L.circleMarker([f.lat, f.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#c62828', fillOpacity: 1, interactive: true })
        .bindTooltip(`${f.name} — cut off`).addTo(g));
  }, [cutOff]);

  return <div ref={div} className={`w-full ${height} ${onRoadClick ? 'cursor-pointer' : ''}`} />;
};
