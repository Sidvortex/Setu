/** Public "Report a road problem" page: anyone can report; officials review every report. */
import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { PublicHeader } from '../components/PublicHeader';
import { PageBanner } from '../components/gov/PageBanner';
import { IncidentReportForm } from '../components/IncidentReportForm';
import { flushQueue, queuedReports } from '../services/incidents';

export const ReportProblem: React.FC = () => {
  const pending = () => queuedReports().filter((d) => d.public).length;
  const [queued, setQueued] = useState(pending);
  useEffect(() => {
    const sync = () => flushQueue(null).then(() => setQueued(pending())).catch(() => {});
    sync(); window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, []);

  return (
    <div className="flex-1 bg-gov-page flex flex-col">
      <PublicHeader />
      <PageBanner title="Report a Road Problem" crumbs={[{ label: 'Report a Problem' }]} />
      <main id="main-content" className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-3">
          {queued > 0 && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-800 p-3 text-sm text-amber-700">
              <WifiOff className="w-4 h-4" /> {queued} report{queued === 1 ? '' : 's'} saved on this phone, sending when you're back online.
            </p>
          )}
          <IncidentReportForm mode="public" onSent={() => setQueued(pending())} />
        </div>
        <aside className="bg-white border border-slate-800 rounded-xl p-5 text-sm text-slate-300 space-y-3">
          <h2 className="font-semibold text-gov-navy">How it works</h2>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Stand safely near the problem and allow location access.</li>
            <li>Take a photo, choose what happened, and add a line about it.</li>
            <li>Officials check every report — with automated checks for location, repeated photos and fakes — before a road is marked closed.</li>
          </ol>
          <p className="text-red-700 font-semibold">In an emergency, call 112 first.</p>
          <p className="text-xs text-slate-500">No signal? The report is saved on your phone and sent automatically later. Your location and photo are used only to review this report.</p>
        </aside>
      </main>
    </div>
  );
};