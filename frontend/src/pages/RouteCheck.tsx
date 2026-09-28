/** Public route checker: fastest route avoiding currently blocked roads (no what-if tools). */
import React from 'react';
import { PublicHeader } from '../components/PublicHeader';
import { PageBanner } from '../components/gov/PageBanner';
import { RoutePlanner } from '../components/RoutePlanner';

export const RouteCheck: React.FC = () => (
  <div className="flex-1 bg-gov-page flex flex-col">
    <PublicHeader />
    <PageBanner title="Check a Route" crumbs={[{ label: 'Check a Route' }]} />
    <main id="main-content" className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
      <RoutePlanner mode="public" />
    </main>
  </div>
);
