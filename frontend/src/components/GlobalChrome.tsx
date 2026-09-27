import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopUtilityBar } from './TopUtilityBar';
import { LanguageChooserModal } from './LanguageChooserModal';
import { GovFooter } from './gov/GovFooter';

export const GlobalChrome: React.FC = () => (
  <>
    <TopUtilityBar />
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col"><Outlet /></div>
      <GovFooter />
    </div>
    <LanguageChooserModal />
  </>
);
