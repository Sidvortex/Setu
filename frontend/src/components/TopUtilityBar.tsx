import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useA11y } from '../context/A11yContext';
import {
  Github,
  BookOpen,
  Accessibility,
  Contrast,
  Type,
  MousePointer2,
  Link2,
  SpellCheck2,
  AlignJustify,
  MoveHorizontal,
  Wind,
  RotateCcw,
} from 'lucide-react';

import { REPO_URL, DOCS_URL } from '../data/links';

export const TopUtilityBar: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const a11y = useA11y();
  const [a11yOpen, setA11yOpen] = useState(false);
  const a11yRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (a11yRef.current && !a11yRef.current.contains(e.target as Node)) setA11yOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggleButtons: { key: Parameters<typeof a11y.toggle>[0]; label: string; icon: React.ReactNode }[] = [
    { key: 'highContrast', label: 'High Contrast', icon: <Contrast className="w-3.5 h-3.5" /> },
    { key: 'bigCursor', label: 'Big Cursor', icon: <MousePointer2 className="w-3.5 h-3.5" /> },
    { key: 'highlightLinks', label: 'Highlight Links', icon: <Link2 className="w-3.5 h-3.5" /> },
    { key: 'dyslexiaFont', label: 'Reading-Friendly Font', icon: <SpellCheck2 className="w-3.5 h-3.5" /> },
    { key: 'extraLineHeight', label: 'Extra Line Height', icon: <AlignJustify className="w-3.5 h-3.5" /> },
    { key: 'extraLetterSpacing', label: 'Extra Letter Spacing', icon: <MoveHorizontal className="w-3.5 h-3.5" /> },
    { key: 'reduceMotion', label: 'Reduce Motion', icon: <Wind className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      {/* Real accessibility feature: invisible until focused via keyboard Tab */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <div className="hidden sm:flex items-center justify-between gap-4 px-6 py-1.5 bg-gov-navy-dark text-xs text-white/75 relative z-[1600]">
        <div className="flex items-center gap-3">
          <button
            id="btn-lang-en"
            onClick={() => setLanguage('en')}
            className={`cursor-pointer ${language === 'en' ? 'text-white font-medium' : 'hover:text-white'}`}
          >
            English
          </button>
          <span className="text-white/30">|</span>
          <button
            id="btn-lang-hi"
            onClick={() => setLanguage('hi')}
            className={`cursor-pointer ${language === 'hi' ? 'text-white font-medium' : 'hover:text-white'}`}
          >
            हिंदी
          </button>
        </div>

        <div className="flex items-center gap-3">
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" /> Docs
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1">
            <Github className="w-3.5 h-3.5" /> Source
          </a>
          <span className="text-white/30">|</span>
          <div className="flex items-center gap-1">
            <button onClick={a11y.decreaseFont} className="hover:text-white cursor-pointer">A-</button>
            <button onClick={a11y.resetFont} className="hover:text-white cursor-pointer">A</button>
            <button onClick={a11y.increaseFont} className="hover:text-white cursor-pointer font-medium">A+</button>
          </div>
          <span className="text-white/30">|</span>

          {/* Accessibility tools: a normal-flow dropdown anchored here,
              not a viewport-fixed floating button - fixed positioning
              risked colliding with the Authority sidebar or a map's own
              overlay controls depending on which page was showing. */}
          <div className="relative" ref={a11yRef}>
            <button
              id="btn-accessibility-toolbar"
              onClick={() => setA11yOpen((v) => !v)}
              className={`flex items-center gap-1 cursor-pointer ${a11yOpen ? 'text-white' : 'hover:text-white'}`}
              title="Accessibility tools"
            >
              <Accessibility className="w-3.5 h-3.5" /> Accessibility
            </button>

            {a11yOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-3 text-left">
                <div className="space-y-1">
                  {toggleButtons.map((btn) => (
                    <button
                      key={btn.key}
                      onClick={() => a11y.toggle(btn.key)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                        a11y[btn.key] ? 'bg-blue-700 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {btn.icon}
                      <span>{btn.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={a11y.resetAll}
                  className="w-full flex items-center justify-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 text-slate-400 hover:text-slate-50 hover:bg-slate-800 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset all
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
