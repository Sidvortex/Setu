import React from 'react';
import { Link } from 'react-router-dom';
import { HELPLINES } from '../../data/helplines';
import { REPO_URL, DOCS_URL, ISRO_LANDSLIDE_ATLAS_URL, NDMA_URL, BHOOSURAKSHA_REPO_URL } from '../../data/links';
import { BrandMark } from './BrandMark';

const col = 'text-sm text-white/75 hover:text-white hover:underline block py-1';

export const GovFooter: React.FC = () => (
  <footer className="mt-auto bg-gov-navy-dark text-white">
    <div className="h-1 bg-gov-saffron" />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <BrandMark size={44} />
          <div>
            <div className="font-bold text-lg">सम्पर्क NE | Sampark NE</div>
            <div className="text-xs text-white/70">Road Accessibility & Supply Logistics</div>
          </div>
        </div>
        <p className="text-sm text-white/70 leading-relaxed">
          A student-built platform keeping essential supplies moving across India's North East.
          Road status and estimates are decision support, not official orders — always follow local authorities.
        </p>
      </div>
      <div>
        <h3 className="font-semibold mb-2 text-gov-saffron">Services</h3>
        <Link to="/road-status" className={col}>Live road status</Link>
        <Link to="/#helplines" className={col}>Emergency helplines</Link>
        <Link to="/login" className={col}>Officials login</Link>
      </div>
      <div>
        <h3 className="font-semibold mb-2 text-gov-saffron">Resources</h3>
        <a href={ISRO_LANDSLIDE_ATLAS_URL} target="_blank" rel="noopener noreferrer" className={col}>ISRO Landslide Atlas</a>
        <a href={NDMA_URL} target="_blank" rel="noopener noreferrer" className={col}>NDMA</a>
        <a href={BHOOSURAKSHA_REPO_URL} target="_blank" rel="noopener noreferrer" className={col}>BhooSuraksha risk engine</a>
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={col}>Documentation</a>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={col}>Source code</a>
      </div>
      <div>
        <h3 className="font-semibold mb-2 text-gov-saffron">Emergency Helplines</h3>
        {HELPLINES.slice(0, 5).map((h) => (
          <a key={h.number} href={`tel:${h.number}`} className="flex justify-between gap-3 text-sm py-1 text-white/75 hover:text-white">
            <span>{h.service}</span><span className="font-mono font-semibold text-white whitespace-nowrap">{h.number}</span>
          </a>
        ))}
      </div>
    </div>
    <div className="border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/60">
        <span>© {new Date().getFullYear()} Sampark NE project team. Not an official Government of India website.</span>
        <span>Roads: PMGSY GeoSadak (MoRD, GODL) · Map data © OpenStreetMap contributors</span>
      </div>
    </div>
  </footer>
);
