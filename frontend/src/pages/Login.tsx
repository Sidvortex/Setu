import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, LogIn, Server } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PublicHeader } from '../components/PublicHeader';
import { PageBanner } from '../components/gov/PageBanner';
import { getBackendUrl, setBackendUrl } from '../utils/backendUrl';

export const Login: React.FC = () => {
  const { login, isLoggingIn, loginError } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [backend, setBackend] = useState(() => getBackendUrl());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackendUrl(backend);
    if (await login(username, password)) navigate('/ops');
  };

  const input = 'w-full bg-white border border-slate-700 text-slate-100 text-sm rounded-lg p-2.5 outline-none focus:border-blue-600';
  return (
    <div className="flex-1 bg-gov-page flex flex-col">
      <PublicHeader />
      <PageBanner title="Officials Login" crumbs={[{ label: 'Officials Login' }]} />
      <main id="main-content" className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white border border-slate-800 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-gov-navy text-white px-5 py-3 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gov-saffron" />
            <div><div className="font-semibold">Operations Dashboard</div><div className="text-xs text-white/70">District administration, PWD and logistics staff only</div></div>
          </div>
          <form onSubmit={submit} className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> Backend URL</label>
              <input id="login-backend-url" value={backend} onChange={(e) => setBackend(e.target.value)} placeholder="http://localhost:8100" className={input} />
            </div>
            <div><label className="text-xs font-semibold text-slate-300 block mb-1">Username</label><input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus className={input} /></div>
            <div><label className="text-xs font-semibold text-slate-300 block mb-1">Password</label><input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className={input} /></div>
            {loginError && <div className="text-xs text-red-700 bg-red-50 border border-red-800 rounded-lg p-2.5">{loginError}</div>}
            <button id="btn-login-submit" type="submit" disabled={isLoggingIn} className="w-full flex items-center justify-center gap-2 py-2.5 bg-gov-navy hover:bg-gov-navy-light disabled:opacity-50 text-white text-sm font-medium rounded-lg cursor-pointer">
              <LogIn className="w-4 h-4" /> {isLoggingIn ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-xs text-slate-500 text-center">Accounts are created by an administrator (backend/create_admin.py). No public sign-up.</p>
          </form>
        </div>
      </main>
    </div>
  );
};
