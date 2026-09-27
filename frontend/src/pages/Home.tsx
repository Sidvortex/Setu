/**
 * Public home: road-first. Live status numbers up top, then services,
 * helplines, and about / data-source sections (targets of the About menu).
 */
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Route, PhoneCall, LogIn, ArrowRight, Ban, Users, Hospital, Truck } from 'lucide-react';
import { PublicHeader } from '../components/PublicHeader';
import { roadsApi, ConnectivitySummary } from '../services/logistics';
import { HELPLINES } from '../data/helplines';
import { BHOOSURAKSHA_REPO_URL } from '../data/links';
import { TEAM } from '../data/team';
import { TeamMemberLinks } from '../components/TeamMemberLinks';

export const Home: React.FC = () => {
  const [s, setS] = useState<ConnectivitySummary | null>(null);
  const [err, setErr] = useState(false);
  const location = useLocation();
  useEffect(() => { roadsApi.summary().then(setS).catch(() => setErr(true)); }, []);
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash]);

  const stats = s ? [
    { icon: Ban, value: s.roads_blocked, label: 'roads blocked now', tone: s.roads_blocked ? 'text-red-600' : 'text-green-700' },
    { icon: Users, value: s.population_cut_off.toLocaleString('en-IN'), label: 'rural residents cut off', tone: s.population_cut_off ? 'text-red-600' : 'text-green-700' },
    { icon: Hospital, value: s.health_facilities_cut_off.length, label: 'health facilities unreachable', tone: s.health_facilities_cut_off.length ? 'text-red-600' : 'text-green-700' },
    { icon: Route, value: `${Math.round(s.road_km_total).toLocaleString('en-IN')} km`, label: `of roads · ${s.districts} districts`, tone: 'text-gov-navy' },
  ] : [];

  return (
    <div className="flex-1 bg-gov-page flex flex-col">
      <PublicHeader />
      <main id="main-content">
        <section className="bg-gov-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid lg:grid-cols-[1.2fr_1fr] gap-8 items-center">
            <div>
              <p className="text-gov-saffron font-semibold text-sm mb-2">सड़क खुली है या बंद? · Is your road open?</p>
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">Keeping medicines, food and supplies moving across the North East.</h2>
              <p className="mt-3 text-white/80 max-w-xl">
                Live road status, the villages and health centres a blockage cuts off, and alternate routes for
                essential-supply vehicles — built on the government's own rural-road map.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/road-status" className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-gov-saffron text-gov-navy-dark font-semibold"><Route className="w-4 h-4" /> Check road status</Link>
                <a href="#helplines" className="inline-flex items-center gap-2 px-5 py-2.5 rounded border-2 border-white/70 font-semibold hover:bg-white/10"><PhoneCall className="w-4 h-4" /> Emergency helplines</a>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 text-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gov-navy">Live — North Eastern Region</h3>
                <span className="flex items-center gap-1 text-xs text-green-700"><span className="w-2 h-2 rounded-full bg-green-600" /> live</span>
              </div>
              {err && <p className="text-sm text-slate-400">Live status unavailable right now.</p>}
              {!s && !err && <p className="text-sm text-slate-400">Loading…</p>}
              <div className="grid grid-cols-2 gap-3">
                {stats.map(({ icon: Icon, value, label, tone }) => (
                  <div key={label} className="bg-slate-950 rounded-lg p-3">
                    <Icon className={`w-5 h-5 mb-1 ${tone}`} />
                    <div className={`text-2xl font-bold ${tone}`}>{value}</div>
                    <div className="text-xs text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-6 relative grid sm:grid-cols-3 gap-3">
          {[
            { to: '/road-status', icon: Route, title: 'Live Road Status', desc: 'Which roads are blocked and who is cut off' },
            { to: '/#helplines', icon: PhoneCall, title: 'Emergency Helplines', desc: '112, NDMA, SDRF, district control rooms' },
            { to: '/login', icon: LogIn, title: 'For Officials', desc: 'Report blockages, plan routes, see impact' },
          ].map(({ to, icon: Icon, title, desc }) => (
            <Link key={title} to={to} className="group bg-white border border-slate-800 rounded-lg p-4 shadow-sm hover:shadow-md hover:border-blue-600 transition flex gap-3 items-start">
              <div className="w-11 h-11 shrink-0 rounded-full bg-blue-50 text-gov-navy flex items-center justify-center group-hover:bg-gov-navy group-hover:text-white transition"><Icon className="w-5 h-5" /></div>
              <div><div className="font-semibold text-slate-100">{title}</div><div className="text-sm text-slate-400">{desc}</div></div>
            </Link>
          ))}
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid gap-6 lg:grid-cols-2">
          <div id="about" className="bg-white border border-slate-800 rounded-lg p-6 scroll-mt-16">
            <h2 className="text-lg font-semibold text-gov-navy border-l-4 border-gov-saffron pl-3 mb-3">About Sampark NE</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Sampark NE (सम्पर्क, "connection") is an AI-enabled logistics and road-accessibility platform for India's
              North Eastern Region. Officials mark blocked roads; the platform shows which villages and health facilities
              lose access, and finds alternate routes for supply vehicles. Predicted landslide risk comes from our sister
              project, <a href={BHOOSURAKSHA_REPO_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">BhooSuraksha</a>.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[['Now', 'Live road status, cut-off impact, route planning'], ['Next', 'Field incident reports, vehicle & shipment tracking']].map(([k, v]) => (
                <div key={k} className="bg-slate-950 rounded-lg p-3"><div className="font-semibold text-gov-navy">{k}</div><div className="text-xs text-slate-400">{v}</div></div>
              ))}
            </div>
            <h3 className="text-sm font-semibold text-gov-navy mt-5 mb-2">Project team</h3>
            <ul className="grid sm:grid-cols-2 gap-2">
              {TEAM.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-2 bg-slate-950 rounded-lg px-3 py-2">
                  <span className="text-sm text-slate-200">{m.name}{m.role === 'Project Lead' ? <span className="text-xs text-slate-400"> · Lead</span> : null}</span>
                  <TeamMemberLinks member={m} />
                </li>
              ))}
            </ul>
          </div>
          <div id="helplines" className="bg-white border border-slate-800 rounded-lg scroll-mt-16">
            <div className="px-5 py-3 border-b border-slate-800 bg-red-50 rounded-t-lg"><h2 className="font-semibold text-red-700 flex items-center gap-2"><PhoneCall className="w-5 h-5" /> Emergency Helplines</h2></div>
            <ul className="divide-y divide-slate-800">
              {HELPLINES.map((h) => (
                <li key={h.number}><a href={`tel:${h.number}`} className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-950"><span className="text-sm text-slate-200">{h.service}</span><span className="font-mono font-bold text-gov-navy whitespace-nowrap">{h.number}</span></a></li>
              ))}
            </ul>
          </div>
          <div id="data" className="lg:col-span-2 bg-white border border-slate-800 rounded-lg p-6 scroll-mt-16">
            <h2 className="text-lg font-semibold text-gov-navy border-l-4 border-gov-saffron pl-3 mb-3 flex items-center gap-2">Data sources <Truck className="w-5 h-5 text-slate-400" /></h2>
            <p className="text-sm text-slate-300">
              Road network, villages and facilities: PMGSY GeoSadak, Ministry of Rural Development (Government Open Data
              License – India). The raw data came as 53,299 disconnected road fragments; Sampark NE repairs it
              into one routable network for all 8 states (53,299 fragments → 94% connected). Map tiles © OpenStreetMap contributors. Travel times use assumed
              hill-road speeds until vehicle tracking provides measured ones.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};
