/** Officials' console: navy header + sidebar, gated behind real login. */
import React from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Network, Route, FileWarning, Truck, LogOut, Home } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandMark } from '../../components/gov/BrandMark';

const NAV = [
  { to: '/ops', label: 'Connectivity', icon: Network, end: true },
  { to: '/ops/routes', label: 'Route Planner', icon: Route },
  { to: '/ops/incidents', label: 'Field Incidents', icon: FileWarning },
  { to: '/ops/shipments', label: 'Shipments & Vehicles', icon: Truck },
];

export const OpsLayout: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex-1 flex flex-col bg-gov-page">
      <header className="sticky top-0 z-[1500]">
        <div className="flex h-1"><div className="flex-1 bg-gov-saffron" /><div className="flex-1 bg-white" /><div className="flex-1 bg-gov-green" /></div>
        <div className="min-h-16 py-2 px-4 sm:px-6 flex items-center justify-between gap-3 bg-gov-navy text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-white flex items-center justify-center"><BrandMark size={32} /></div>
            <div><div className="font-semibold">Setu</div><div className="text-xs text-white/70 hidden sm:block">Operations Dashboard · North Eastern Region</div></div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden sm:inline text-white/70">{user?.username}</span>
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"><Home className="w-4 h-4" /> <span className="hidden sm:inline">Public site</span></button>
            <button onClick={() => { logout(); navigate('/'); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"><LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Logout</span></button>
          </div>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-full md:w-56 md:shrink-0 bg-white border-r border-slate-800 p-3 hidden md:block">
          <nav className="space-y-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-gov-navy text-white' : 'text-slate-300 hover:bg-slate-950'}`}>
                <Icon className="w-4 h-4" /> {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main id="main-content" className="flex-1 min-w-0 p-4 sm:p-5">
          <nav className="md:hidden flex gap-2 mb-3">
            {NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm ${isActive ? 'bg-gov-navy text-white' : 'bg-white border border-slate-800 text-slate-300'}`}>{label}</NavLink>
            ))}
          </nav>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
