import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { A11yProvider } from './context/A11yContext';
import { GlobalChrome } from './components/GlobalChrome';
import { Home } from './pages/Home';
import { RoadStatus } from './pages/RoadStatus';
import { RouteCheck } from './pages/RouteCheck';
import { Login } from './pages/Login';
import { OpsLayout } from './pages/authority/OpsLayout';
import { Connectivity } from './pages/authority/Connectivity';
import { Routes as RoutePlannerPage } from './pages/authority/Routes';
import { Incidents } from './pages/authority/Incidents';
// Leaflet's stylesheet is bundled (not loaded from a CDN) so maps work on slow or offline connections.
import 'leaflet/dist/leaflet.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <A11yProvider>
          <AuthProvider>
            <Routes>
              <Route element={<GlobalChrome />}>
                <Route path="/" element={<Home />} />
                <Route path="/road-status" element={<RoadStatus />} />
                <Route path="/route" element={<RouteCheck />} />
                <Route path="/login" element={<Login />} />
                <Route path="/ops" element={<OpsLayout />}>
                  <Route index element={<Connectivity />} />
                  <Route path="routes" element={<RoutePlannerPage />} />
                  <Route path="incidents" element={<Incidents />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </AuthProvider>
        </A11yProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
