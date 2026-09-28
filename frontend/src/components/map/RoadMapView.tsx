/**
 * Road map with a 2D / 3D switch and three styles (Standard, Terrain, Dark).
 * The user's choice is remembered in this browser.
 */
import React, { useEffect, useState } from 'react';
import { Map as MapIcon, Box } from 'lucide-react';
import { RoadMap2D } from './RoadMap2D';
import { RoadMap3D } from './RoadMap3D';
import { MAP_STYLES, MapStyle, RoadMapProps } from './mapTypes';

const PREF_KEY = 'setu_map_prefs';
function loadPrefs(): { is3D: boolean; style: MapStyle } {
  try { return { is3D: false, style: 'standard', ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { return { is3D: false, style: 'standard' }; }
}

export const RoadMapView: React.FC<Omit<RoadMapProps, 'mapStyle'> & { mapKey?: string | number }> = ({ mapKey, ...props }) => {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [used3D, setUsed3D] = useState(prefs.is3D);
  useEffect(() => { if (prefs.is3D) setUsed3D(true); }, [prefs.is3D]);
  const update = (p: Partial<typeof prefs>) => setPrefs((cur) => { const next = { ...cur, ...p }; localStorage.setItem(PREF_KEY, JSON.stringify(next)); return next; });
  const btn = (active: boolean) => `px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 cursor-pointer ${active ? 'bg-gov-navy text-white' : 'bg-white text-slate-300 hover:bg-slate-950'}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-white">
        <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden" role="group" aria-label="Map dimension">
          <button id="btn-map-2d" className={btn(!prefs.is3D)} onClick={() => update({ is3D: false })}><MapIcon className="w-3.5 h-3.5" /> 2D</button>
          <button id="btn-map-3d" className={btn(prefs.is3D)} onClick={() => update({ is3D: true })}><Box className="w-3.5 h-3.5" /> 3D terrain</button>
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden" role="group" aria-label="Map style">
          {MAP_STYLES.map((s) => (
            <button key={s.id} id={`btn-map-style-${s.id}`} className={btn(prefs.style === s.id)} onClick={() => update({ style: s.id })}>{s.label}</button>
          ))}
        </div>
      </div>
      {/* Both stay mounted once used; switching just shows/hides (instant, no teardown) */}
      <div className={`relative ${props.height ?? 'h-[600px]'}`}>
        <RoadMap2D key={`2d-${mapKey}`} {...props} mapStyle={prefs.style} visible={!prefs.is3D} />
        {used3D && <RoadMap3D {...props} mapStyle={prefs.style} visible={prefs.is3D} />}
      </div>
      {prefs.is3D && <p className="text-xs text-slate-400 px-3 py-1.5 border-t border-slate-800">Right-drag (or two-finger drag) to tilt and rotate · zoom into a town for 3D buildings</p>}
    </div>
  );
};
