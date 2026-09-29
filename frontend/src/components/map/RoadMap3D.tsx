/**
 * 3D road map (MapLibre GL): real terrain (AWS Terrarium elevation) with
 * hillshading, 3D buildings where the base style has them, and Setu's roads,
 * routes and markers drawn as map layers so they drape over the terrain.
 * Base styles: OpenFreeMap Liberty (standard), OpenTopoMap (terrain),
 * OpenFreeMap Dark (dark). All free, no API key.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre locates its web worker at runtime from a string bundlers can't see;
// `?worker&url` makes Vite bundle it (with its shared chunk) and give us the URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { RoadMapProps, STYLE_3D, TERRAIN_TILES, ROAD_COLORS, OTHER_ROAD, DISCONNECTED_ROAD, DARK_ROAD_COLORS, DARK_OTHER_ROAD } from './mapTypes';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };

function bboxOf(fc: FC): [number, number, number, number] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  fc.features.forEach((f) => (f.geometry as GeoJSON.LineString).coordinates.forEach(([x, y]) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }));
  return [x0, y0, x1, y1];
}

function setData(map: maplibregl.Map, id: string, data: FC) {
  (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);
}

export const RoadMap3D: React.FC<RoadMapProps & { visible?: boolean }> = ({
  visible = true, roads, mapStyle, blockedIds = [], whatIfIds = [], selectedId = null, cutOff = [], routes = [], markers = [], onRoadClick, height = 'h-[600px]',
}) => {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(0); // bumps every time a style finishes loading
  const [failed, setFailed] = useState(false);
  const clickRef = useRef(onRoadClick);
  clickRef.current = onRoadClick;
  const dark = mapStyle === 'dark';

  // Roads with a status + colour baked in, so layers can filter/style on them
  const roadData = useMemo<FC>(() => ({
    type: 'FeatureCollection',
    features: roads.features.map((f) => {
      const p = f.properties;
      const status = blockedIds.includes(p.edge_id) ? 'blocked' : whatIfIds.includes(p.edge_id) ? 'whatif' : p.edge_id === selectedId ? 'selected' : 'normal';
      const s = (dark ? DARK_ROAD_COLORS : ROAD_COLORS)[p.category] ?? (p.in_main_network ? (dark ? DARK_OTHER_ROAD : OTHER_ROAD) : DISCONNECTED_ROAD);
      return { ...f, properties: { ...p, status, color: s.color, width: s.width } };
    }),
  }), [roads, blockedIds, whatIfIds, selectedId, dark]);

  const routeData = useMemo<FC>(() => ({
    type: 'FeatureCollection',
    features: routes.map((r) => ({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: r.coordinates }, properties: { color: r.color, dashed: !!r.dashed } })),
  }), [routes]);

  const pointData = useMemo<FC>(() => ({
    type: 'FeatureCollection',
    features: [
      ...markers.map((m) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [m.lon, m.lat] }, properties: { color: m.color, label: m.label, r: 9 } })),
      ...cutOff.map((f) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] }, properties: { color: '#e53935', label: `${f.name} — cut off`, r: 7 } })),
    ],
  }), [markers, cutOff]);

  // Create the map ONCE. Tearing a MapLibre map down (map.remove) proved very slow
  // with terrain on, so district changes update data in place (below) and the
  // 2D/3D switch hides this map instead of unmounting it.
  useEffect(() => {
    if (!div.current) return;
    const m = new maplibregl.Map({
      container: div.current, style: STYLE_3D[mapStyle] as maplibregl.StyleSpecification | string,
      bounds: bboxOf(roads) as maplibregl.LngLatBoundsLike, fitBoundsOptions: { padding: 30 },
      pitch: 55, maxPitch: 85, canvasContextAttributes: { antialias: true }, attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    // Failure = the base style never loads. (Not "any error": isStyleLoaded() is also false
    // while tiles download, so one failed tile or font used to cover a working map.)
    let styleEverLoaded = false;
    const giveUp = setTimeout(() => { if (!styleEverLoaded) setFailed(true); }, 20000);
    m.once('style.load', () => { styleEverLoaded = true; clearTimeout(giveUp); setFailed(false); });
    // 'style.load', not 'load': 'load' waits for every tile, so one stalled tile
    // on a slow connection would keep the terrain and roads from ever appearing.
    m.on('style.load', () => {
      const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
      m.addSource('dem', { type: 'raster-dem', tiles: [TERRAIN_TILES], tileSize: 256, encoding: 'terrarium', maxzoom: 14 });
      m.addSource('dem-hs', { type: 'raster-dem', tiles: [TERRAIN_TILES], tileSize: 256, encoding: 'terrarium', maxzoom: 14 });
      m.setTerrain({ source: 'dem', exaggeration: 1.4 });
      m.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': m.getStyle().name?.toLowerCase().includes('dark') ? 0.25 : 0.4 } }, firstLabel);
      m.addSource('setu-roads', { type: 'geojson', data: EMPTY });
      m.addSource('setu-routes', { type: 'geojson', data: EMPTY });
      m.addSource('setu-points', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'roads-normal', type: 'line', source: 'setu-roads', filter: ['==', ['get', 'status'], 'normal'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], // zoom must be the outermost input of the expression (MapLibre rejects the layer otherwise)
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['*', ['get', 'width'], 0.35], 10, ['get', 'width']], 'line-opacity': 0.9 } });
      m.addLayer({ id: 'roads-selected', type: 'line', source: 'setu-roads', filter: ['==', ['get', 'status'], 'selected'], paint: { 'line-color': '#f28c28', 'line-width': 7 } });
      m.addLayer({ id: 'roads-whatif', type: 'line', source: 'setu-roads', filter: ['==', ['get', 'status'], 'whatif'], paint: { 'line-color': '#e53935', 'line-width': 6, 'line-dasharray': [2, 2] } });
      m.addLayer({ id: 'roads-blocked', type: 'line', source: 'setu-roads', filter: ['==', ['get', 'status'], 'blocked'], paint: { 'line-color': '#e53935', 'line-width': 7 } });
      m.addLayer({ id: 'routes-solid', type: 'line', source: 'setu-routes', filter: ['!', ['get', 'dashed']], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 6 } });
      m.addLayer({ id: 'routes-dashed', type: 'line', source: 'setu-routes', filter: ['get', 'dashed'], paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-dasharray': [1, 2] } });
      m.addLayer({ id: 'points', type: 'circle', source: 'setu-points', paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['get', 'r'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      // Wide invisible line on top: makes thin roads easy to click
      m.addLayer({ id: 'roads-hit', type: 'line', source: 'setu-roads', paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 } });
      setReady((n) => n + 1);
    });
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    m.on('mousemove', 'roads-hit', (e) => {
      const p = e.features?.[0]?.properties; if (!p) return;
      m.getCanvas().style.cursor = clickRef.current ? 'pointer' : '';
      popup.setLngLat(e.lngLat).setText(`${p.road_name || 'Unnamed road'} · ${p.category}`).addTo(m);
    });
    m.on('mouseleave', 'roads-hit', () => { m.getCanvas().style.cursor = ''; popup.remove(); });
    m.on('click', 'roads-hit', (e) => { const id = e.features?.[0]?.properties?.edge_id; if (id !== undefined) clickRef.current?.(Number(id)); });
    map.current = m;
    if (import.meta.env.DEV) (window as unknown as { __roadMap3d?: maplibregl.Map }).__roadMap3d = m; // debugging aid in dev only
    return () => { clearTimeout(giveUp); m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // New district: fit to its roads (data itself flows through roadData below)
  const firstRoads = useRef(true);
  useEffect(() => {
    if (firstRoads.current) { firstRoads.current = false; return; }
    map.current?.fitBounds(bboxOf(roads) as maplibregl.LngLatBoundsLike, { padding: 30, duration: 800 });
  }, [roads]);


  // Style switch: new base map; 'style.load' re-adds Setu's layers
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return; }
    // diff: false forces a full reload so 'style.load' fires and our layers are re-added
    map.current?.setStyle(STYLE_3D[mapStyle] as maplibregl.StyleSpecification | string, { diff: false });
  }, [mapStyle]);

  useEffect(() => { if (ready && map.current) setData(map.current, 'setu-roads', roadData); }, [roadData, ready]);
  useEffect(() => { if (ready && map.current) setData(map.current, 'setu-points', pointData); }, [pointData, ready]);
  useEffect(() => {
    const m = map.current; if (!ready || !m) return;
    setData(m, 'setu-routes', routeData);
    if (routeData.features.length) {
      const all = routeData.features.flatMap((f) => (f.geometry as GeoJSON.MultiLineString).coordinates.flat());
      const xs = all.map((c) => c[0]), ys = all.map((c) => c[1]);
      m.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], { padding: 40, duration: 600 });
    }
  }, [routeData, ready]);

  return (
    // Hidden with visibility, never display:none: shrinking the canvas to 0x0
    // made MapLibre reallocate its terrain buffers, which was very slow.
    <div className={`absolute inset-0 ${height}`} style={{ visibility: visible ? 'visible' : 'hidden', pointerEvents: visible ? 'auto' : 'none' }}>
      {/* MapLibre forces position:relative on its container (its CSS beats Tailwind's layered
          utilities), so the container must size itself with w-full h-full, not absolute+inset. */}
      <div ref={div} className="w-full h-full" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-gov-page/90 text-sm text-slate-300 p-4 text-center">
          Couldn't load the 3D base map. Check your connection, or switch to 2D.
        </div>
      )}
    </div>
  );
};
