/**
 * 2D road map (Leaflet). One district's roads coloured by status, plus
 * optional route lines and markers. Remount (key=district) when the district
 * changes; style changes are applied in place.
 */
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  RoadMapProps, TILES_2D, ROAD_COLORS, OTHER_ROAD, DISCONNECTED_ROAD, DARK_ROAD_COLORS, DARK_OTHER_ROAD, CAT_ATTRIBUTION,
} from './mapTypes';

type RoadLayer = L.Path & { feature?: GeoJSON.Feature<GeoJSON.LineString, { edge_id: number; category: string; in_main_network: boolean }> };

export const RoadMap2D: React.FC<RoadMapProps & { visible?: boolean }> = ({
  visible = true, roads, mapStyle, blockedIds = [], whatIfIds = [], selectedId = null, cutOff = [], routes = [], markers = [], onRoadClick, height = 'h-[600px]',
}) => {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const roadLayer = useRef<L.GeoJSON | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const clickRef = useRef(onRoadClick);
  clickRef.current = onRoadClick;

  useEffect(() => {
    if (!div.current) return;
    // Canvas, not SVG: the whole-region view draws ~50,000 roads
    const m = L.map(div.current, { preferCanvas: true });
    const layer = L.geoJSON(roads, {
      onEachFeature: (f, l) => {
        l.bindTooltip(`${f.properties.road_name || 'Unnamed road'} · ${f.properties.category} · ${(f.properties.length_m / 1000).toFixed(1)} km`, { sticky: true });
        l.on('click', () => clickRef.current?.(f.properties.edge_id));
      },
    }).addTo(m);
    m.fitBounds(layer.getBounds(), { padding: [10, 10] });
    roadLayer.current = layer;
    overlay.current = L.layerGroup().addTo(m);
    map.current = m;
    if (import.meta.env.DEV) (window as unknown as { __roadMap?: L.Map }).__roadMap = m; // debugging aid in dev only
    return () => { m.remove(); map.current = null; };
  }, [roads]);

  // Base tiles + dark look
  useEffect(() => {
    const m = map.current; if (!m) return;
    tiles.current?.remove();
    const t = TILES_2D[mapStyle];
    tiles.current = L.tileLayer(t.url, { attribution: `${t.attribution} · ${CAT_ATTRIBUTION}`, maxZoom: t.maxZoom }).addTo(m);
    tiles.current.bringToBack();
    m.getContainer().classList.toggle('map-dark', mapStyle === 'dark');
  }, [mapStyle, roads]);

  // Road colours by status (thinner lines on the whole-region view, where thousands of roads meet)
  useEffect(() => {
    const dark = mapStyle === 'dark';
    const thin = roads.features.length > 5000 ? 0.45 : 1;
    roadLayer.current?.eachLayer((layer) => {
      const l = layer as RoadLayer; const p = l.feature?.properties; if (!p) return;
      if (blockedIds.includes(p.edge_id)) { l.setStyle({ color: '#e53935', weight: 7, opacity: 1, dashArray: undefined }); l.bringToFront(); return; }
      if (whatIfIds.includes(p.edge_id)) { l.setStyle({ color: '#e53935', weight: 6, opacity: 1, dashArray: '6 6' }); l.bringToFront(); return; }
      if (p.edge_id === selectedId) { l.setStyle({ color: '#f28c28', weight: 7, opacity: 1, dashArray: undefined }); l.bringToFront(); return; }
      const s = (dark ? DARK_ROAD_COLORS : ROAD_COLORS)[p.category] ?? (p.in_main_network ? (dark ? DARK_OTHER_ROAD : OTHER_ROAD) : DISCONNECTED_ROAD);
      l.setStyle({ color: s.color, weight: s.width * thin, opacity: 0.9, dashArray: undefined });
    });
  }, [blockedIds, whatIfIds, selectedId, mapStyle, roads]);

  // Routes, markers, cut-off facilities (non-interactive routes so clicks reach the roads)
  useEffect(() => {
    const g = overlay.current, m = map.current; if (!g || !m) return;
    g.clearLayers();
    const drawn = routes.map((r) => L.polyline(r.coordinates.map((line) => line.map(([x, y]) => [y, x] as [number, number])),
      { color: r.color, weight: 6, opacity: 0.95, dashArray: r.dashed ? '4 8' : undefined, interactive: false }).addTo(g));
    markers.forEach((mk) => L.circleMarker([mk.lat, mk.lon], { radius: 9, color: '#fff', weight: 2, fillColor: mk.color, fillOpacity: 1 }).bindTooltip(mk.label).addTo(g));
    cutOff.forEach((f) => L.circleMarker([f.lat, f.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#e53935', fillOpacity: 1 }).bindTooltip(`${f.name} — cut off`).addTo(g));
    if (drawn.length) m.fitBounds(L.featureGroup(drawn).getBounds(), { padding: [30, 30] });
  }, [routes, markers, cutOff, roads]);

  useEffect(() => { if (visible) setTimeout(() => map.current?.invalidateSize(), 50); }, [visible]);

  return <div ref={div} style={{ display: visible ? 'block' : 'none' }} className={`w-full ${height} ${onRoadClick ? 'cursor-pointer' : ''}`} />;
};
