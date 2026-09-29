import React from 'react';
import { DistrictPicker } from './DistrictPicker';
import { District, LatLon, Place } from '../services/logistics';

export interface Endpoint extends LatLon { label: string }

/** District → place picker (health facilities, largest villages, other facilities). */
export const PlaceChooser: React.FC<{
  title: string; districts: District[]; districtId: number; onDistrict: (id: number) => void;
  places: { villages: Place[]; facilities: Place[] } | null; value: Endpoint | null; onPick: (e: Endpoint) => void;
}> = ({ title, districts, districtId, onDistrict, places, value, onPick }) => (
  <div className="space-y-2">
    <p className="text-sm font-semibold text-gov-navy">{title}</p>
    <DistrictPicker districts={districts} value={districtId} onChange={onDistrict} />
    <select className="w-full bg-white border border-slate-700 rounded-lg p-2 text-sm text-slate-100" value=""
      onChange={(e) => {
        const [kind, id] = e.target.value.split(':');
        const p = (kind === 'f' ? places?.facilities : places?.villages)?.find((x) => String(x.id) === id);
        if (p) onPick({ lat: p.lat, lon: p.lon, label: p.name + (p.population ? ` (pop. ${p.population})` : '') });
      }}>
      <option value="" disabled>{value ? value.label : 'Choose a place…'}</option>
      <optgroup label="Health facilities">{places?.facilities.filter((f) => f.health).map((f) => <option key={`f${f.id}`} value={`f:${f.id}`}>{f.name}</option>)}</optgroup>
      <optgroup label="Largest villages">{places?.villages.map((v) => <option key={`v${v.id}`} value={`v:${v.id}`}>{v.name} — {v.population}</option>)}</optgroup>
      <optgroup label="Markets, schools, transport">{places?.facilities.filter((f) => !f.health).slice(0, 80).map((f) => <option key={`o${f.id}`} value={`f:${f.id}`}>{f.name}</option>)}</optgroup>
    </select>
  </div>
);
