/** State → district selector for the 98 NER districts. */
import React, { useMemo } from 'react';
import { District } from '../services/logistics';

interface Props {
  districts: District[];
  value: number;
  onChange: (districtId: number) => void;
  label?: string;
}

export const DistrictPicker: React.FC<Props> = ({ districts, value, onChange, label = 'District' }) => {
  const byState = useMemo(() => {
    const m = new Map<string, District[]>();
    districts.forEach((d) => m.set(d.state, [...(m.get(d.state) ?? []), d]));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [districts]);
  const current = districts.find((d) => d.district_id === value);
  const sel = 'border border-slate-700 rounded-lg p-2 text-sm bg-white text-slate-100';

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold text-slate-300">
        State
        <select className={`${sel} block mt-1`} value={current?.state ?? ''}
          onChange={(e) => { const first = byState.find(([s]) => s === e.target.value)?.[1][0]; if (first) onChange(first.district_id); }}>
          {byState.map(([s]) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-300">
        {label}
        <select id="district-picker" className={`${sel} block mt-1`} value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {byState.find(([s]) => s === current?.state)?.[1].map((d) => <option key={d.district_id} value={d.district_id}>{d.name}</option>)}
        </select>
      </label>
      {current && current.population_on_main_network_pct < 20 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-800 rounded-lg px-2 py-1.5 max-w-sm">
          In the source road data this district isn't linked to the rest of the North East, so routes can't leave it.
        </p>
      )}
    </div>
  );
};
