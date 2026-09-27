import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface A11ySettings {
  fontScale: number;       // 1 = 100%, steps of 0.1
  highContrast: boolean;
  bigCursor: boolean;
  highlightLinks: boolean;
  dyslexiaFont: boolean;
  extraLineHeight: boolean;
  extraLetterSpacing: boolean;
  reduceMotion: boolean;
}

const DEFAULT_SETTINGS: A11ySettings = {
  fontScale: 1,
  highContrast: false,
  bigCursor: false,
  highlightLinks: false,
  dyslexiaFont: false,
  extraLineHeight: false,
  extraLetterSpacing: false,
  reduceMotion: false,
};

const STORAGE_KEY = 'samparkne_a11y_settings';

interface A11yContextValue extends A11ySettings {
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  toggle: (key: keyof Omit<A11ySettings, 'fontScale'>) => void;
  resetAll: () => void;
}

const A11yContext = createContext<A11yContextValue | undefined>(undefined);

function loadSettings(): A11ySettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    // ignore corrupt storage
  }
  return DEFAULT_SETTINGS;
}

export const A11yProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<A11ySettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    const root = document.documentElement;
    root.style.setProperty('--a11y-font-scale', String(settings.fontScale));
    root.classList.toggle('a11y-high-contrast', settings.highContrast);
    root.classList.toggle('a11y-big-cursor', settings.bigCursor);
    root.classList.toggle('a11y-highlight-links', settings.highlightLinks);
    root.classList.toggle('a11y-dyslexia-font', settings.dyslexiaFont);
    root.classList.toggle('a11y-extra-line-height', settings.extraLineHeight);
    root.classList.toggle('a11y-extra-letter-spacing', settings.extraLetterSpacing);
    root.classList.toggle('a11y-reduce-motion', settings.reduceMotion);
  }, [settings]);

  const increaseFont = () => setSettings((s) => ({ ...s, fontScale: Math.min(1.5, +(s.fontScale + 0.1).toFixed(1)) }));
  const decreaseFont = () => setSettings((s) => ({ ...s, fontScale: Math.max(0.8, +(s.fontScale - 0.1).toFixed(1)) }));
  const resetFont = () => setSettings((s) => ({ ...s, fontScale: 1 }));
  const toggle = (key: keyof Omit<A11ySettings, 'fontScale'>) =>
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  const resetAll = () => setSettings(DEFAULT_SETTINGS);

  return (
    <A11yContext.Provider value={{ ...settings, increaseFont, decreaseFont, resetFont, toggle, resetAll }}>
      {children}
    </A11yContext.Provider>
  );
};

export function useA11y(): A11yContextValue {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error('useA11y must be used within an A11yProvider');
  return ctx;
}
