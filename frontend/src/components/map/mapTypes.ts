/**
 * Shared types + map styles for Setu's road maps (2D Leaflet, 3D MapLibre).
 * Every source here is free and needs no API key.
 */
import { Place, RoadFeatures } from '../../services/logistics';

export type MapStyle = 'standard' | 'terrain' | 'dark';
export const MAP_STYLES: { id: MapStyle; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'dark', label: 'Dark' },
];

export interface RouteLine { coordinates: [number, number][][]; color: string; dashed?: boolean }
export interface MapMarker { lat: number; lon: number; color: string; label: string }

/** Props both the 2D and 3D road maps accept. */
export interface RoadMapProps {
  roads: RoadFeatures;
  mapStyle: MapStyle;
  blockedIds?: number[];      // reported blocked: solid red
  whatIfIds?: number[];       // what-if blocks: dashed red
  selectedId?: number | null; // highlighted in orange
  cutOff?: Place[];           // facilities to flag as cut off
  routes?: RouteLine[];
  markers?: MapMarker[];
  onRoadClick?: (edgeId: number) => void;
  height?: string;
}

export const ROAD_COLORS: Record<string, { color: string; width: number }> = {
  NH: { color: '#0b3068', width: 4 }, SH: { color: '#1c4f9e', width: 3.5 }, MDR: { color: '#2a5fb0', width: 3 },
};
export const OTHER_ROAD = { color: '#64748b', width: 2 };
export const DISCONNECTED_ROAD = { color: '#a8b3c2', width: 2 };
/** On the dark style navy roads vanish, so roads switch to light colours. */
export const DARK_ROAD_COLORS: Record<string, { color: string; width: number }> = {
  NH: { color: '#ffb366', width: 4 }, SH: { color: '#8fb8ff', width: 3.5 }, MDR: { color: '#8fb8ff', width: 3 },
};
export const DARK_OTHER_ROAD = { color: '#c7d0dc', width: 1.8 };

/** 2D raster tiles */
export const TILES_2D: Record<MapStyle, { url: string; attribution: string; maxZoom: number }> = {
  standard: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
  terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)', maxZoom: 17 },
  // Same OSM tiles, colour-inverted with CSS (.map-dark in index.css) for a Google-Maps-style dark look
  dark: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
};

/** 3D base styles (MapLibre) */
export const STYLE_3D: Record<MapStyle, string | object> = {
  standard: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  terrain: {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { topo: { type: 'raster', tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 17, attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)' } },
    layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
  },
};
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const CAT_ATTRIBUTION = 'Roads: PMGSY GeoSadak (MoRD)';
