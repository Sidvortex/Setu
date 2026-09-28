/**
 * Public site header in the layout Indian government portals use: tricolour
 * strip, bilingual branding band, navy navigation with dropdowns, and a
 * live "Road Alerts" ticker of currently blocked roads.
 */
import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, LogIn, LogOut, LayoutDashboard, Menu, X, PhoneCall, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { BrandMark } from './gov/BrandMark';
import { roadsApi, BlockedRoad } from '../services/logistics';
import { REPO_URL, DOCS_URL, ISRO_LANDSLIDE_ATLAS_URL, NDMA_URL, BHOOSURAKSHA_REPO_URL } from '../data/links';

interface Item { label: string; to: string; external?: boolean }
interface Group { label: string; to?: string; items?: Item[] }

const RoadAlertsTicker: React.FC = () => {
  const [blocked, setBlocked] = useState<BlockedRoad[] | null>(null);
  useEffect(() => { roadsApi.blocked().then((r) => setBlocked(r.blocked)).catch(() => setBlocked(null)); }, []);
  const items = blocked === null
    ? ['Live road status unavailable — check your connection.']
    : blocked.length
      ? blocked.map((b) => `BLOCKED — ${b.road_name} (${b.category}): ${b.reason}${b.note ? `, ${b.note}` : ''}`)
      : ['All monitored roads are currently open.'];
  return (
    <div className="flex items-stretch bg-white border-b border-slate-800 text-sm">
      <span className="shrink-0 bg-red-600 text-white font-semibold px-4 py-2 flex items-center">Road Alerts</span>
      <div className="ticker-viewport relative flex-1 overflow-hidden flex items-center">
        <div className="ticker-track flex gap-12 whitespace-nowrap pl-6">
          {[...items, ...items].map((t, i) => (
            <Link key={i} to="/road-status" className="text-slate-200 hover:text-blue-600 hover:underline">
              <span className="text-gov-saffron mr-2">●</span>{t}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PublicHeader: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const menu: Group[] = [
    { label: t('nav.home'), to: '/' },
    { label: t('nav.roadStatus'), to: '/road-status' },
    { label: t('nav.routeCheck'), to: '/route' },
    { label: t('nav.about'), items: [
      { label: 'About Setu', to: '/#about' },
      { label: 'Data sources', to: '/#data' },
    ] },
    { label: t('nav.resources'), items: [
      { label: 'ISRO Landslide Atlas of India', to: ISRO_LANDSLIDE_ATLAS_URL, external: true },
      { label: 'NDMA', to: NDMA_URL, external: true },
      { label: 'BhooSuraksha (landslide risk engine)', to: BHOOSURAKSHA_REPO_URL, external: true },
      { label: 'Documentation', to: DOCS_URL, external: true },
      { label: 'Source code', to: REPO_URL, external: true },
    ] },
    { label: t('nav.emergency'), to: '/#helplines' },
  ];

  const link = (it: Item, cls: string) => it.external
    ? <a key={it.label} href={it.to} target="_blank" rel="noopener noreferrer" className={cls}>{it.label} <ExternalLink className="inline w-3 h-3 ml-1 opacity-60" /></a>
    : <Link key={it.label} to={it.to} className={cls} onClick={() => setOpen(false)}>{it.label}</Link>;

  const opsButton = isAuthenticated
    ? <button onClick={() => navigate('/ops')} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gov-saffron text-gov-navy-dark text-sm font-semibold cursor-pointer"><LayoutDashboard className="w-4 h-4" /> {t('auth.dashboard')}</button>
    : <button onClick={() => navigate('/login')} className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-gov-saffron text-gov-navy-dark text-sm font-semibold cursor-pointer"><LogIn className="w-4 h-4" /> {t('nav.authorityLogin')}</button>;

  return (
    <header className="w-full">
      <div className="flex h-1.5"><div className="flex-1 bg-gov-saffron" /><div className="flex-1 bg-white" /><div className="flex-1 bg-gov-green" /></div>
      <div className="bg-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <BrandMark size={56} />
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl font-bold text-gov-navy leading-tight">सेतु <span className="text-slate-500 font-normal">|</span> Setu</div>
              <div className="text-xs sm:text-sm text-slate-300">{t('brand.tagline')}</div>
              <div className="text-xs text-slate-500 hidden sm:block">{t('brand.disclaimer')}</div>
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <a href="tel:112" className="hidden md:flex items-center gap-2 px-3 py-2 rounded border-2 border-red-600 text-red-700 font-semibold text-sm hover:bg-red-50"><PhoneCall className="w-4 h-4" /> Emergency: 112</a>
            <button className="lg:hidden p-2 rounded border border-slate-700 text-gov-navy cursor-pointer" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu" aria-expanded={open}>
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      <nav className="hidden lg:block bg-gov-navy text-white sticky top-0 z-[1500] shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <ul className="flex items-stretch">
            {menu.map((g) => g.items ? (
              <li key={g.label} className="relative group">
                <button className="h-full flex items-center gap-1 px-4 py-3 text-[15px] hover:bg-gov-navy-light group-hover:text-gov-saffron group-focus-within:text-gov-saffron cursor-pointer">{g.label} <ChevronDown className="w-3.5 h-3.5" /></button>
                <div className="absolute left-0 top-full min-w-72 bg-white text-slate-100 border-t-4 border-gov-saffron shadow-xl invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition z-[1600]">
                  {g.items.map((it) => link(it, 'block px-4 py-2.5 text-sm border-b border-slate-800 last:border-0 hover:bg-blue-50 hover:text-gov-navy'))}
                </div>
              </li>
            ) : (
              <li key={g.label}>
                <NavLink to={g.to!} end className={({ isActive }) => `h-full flex items-center px-4 py-3 text-[15px] hover:bg-gov-navy-light ${isActive && !g.to!.includes('#') ? 'text-gov-saffron' : ''}`}>{g.label}</NavLink>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            {opsButton}
            {isAuthenticated && <button onClick={() => { logout(); navigate('/'); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-white/85 hover:text-white hover:bg-gov-navy-light cursor-pointer"><LogOut className="w-4 h-4" /> {t('nav.logout')}</button>}
          </div>
        </div>
      </nav>

      {open && (
        <nav className="lg:hidden bg-gov-navy text-white">
          {menu.map((g) => g.items ? (
            <details key={g.label} className="border-b border-white/10">
              <summary className="px-4 py-3 cursor-pointer">{g.label}</summary>
              <div className="bg-gov-navy-dark">{g.items.map((it) => link(it, 'block px-6 py-2.5 text-sm text-white/85'))}</div>
            </details>
          ) : <Link key={g.label} to={g.to!} onClick={() => setOpen(false)} className="block px-4 py-3 border-b border-white/10">{g.label}</Link>)}
          <Link to={isAuthenticated ? '/ops' : '/login'} onClick={() => setOpen(false)} className="block px-4 py-3 bg-gov-saffron text-gov-navy-dark font-semibold">{isAuthenticated ? t('auth.dashboard') : t('nav.authorityLogin')}</Link>
        </nav>
      )}
      <RoadAlertsTicker />
    </header>
  );
};
