import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'hi';

const STORAGE_KEY = 'setu_language';

/**
 * Translation dictionary. Scope note: this covers navigation, headers,
 * and the highest-visibility labels/copy — not every string in the app.
 * Translating the full app (every form label, every helper sentence
 * across ~30 components) is a much larger effort than wiring the
 * mechanism; this is a real, working translation of the parts a visitor
 * sees first, with the mechanism (useLanguage/t()) ready to extend.
 * Untranslated strings render in English regardless of language setting.
 */
const DICTIONARY: Record<string, { en: string; hi: string }> = {
  'nav.home': { en: 'Home', hi: 'मुखपृष्ठ' },
  'nav.roadStatus': { en: 'Road Status', hi: 'सड़क स्थिति' },
  'nav.routeCheck': { en: 'Check a Route', hi: 'मार्ग जाँचें' },
  'nav.report': { en: 'Report a Problem', hi: 'समस्या बताएँ' },
  'nav.about': { en: 'About', hi: 'परिचय' },
  'nav.resources': { en: 'Resources', hi: 'संसाधन' },
  'nav.emergency': { en: 'Emergency Contacts', hi: 'आपातकालीन संपर्क' },
  'nav.login': { en: 'Login', hi: 'लॉगिन' },
  'nav.logout': { en: 'Logout', hi: 'लॉगआउट' },
  'nav.authorityLogin': { en: 'Officials Login', hi: 'अधिकारी लॉगिन' },
  'nav.sitemap': { en: 'Sitemap', hi: 'साइटमैप' },
  'nav.contactUs': { en: 'Contact us', hi: 'संपर्क करें' },
  'nav.feedback': { en: 'Feedback', hi: 'प्रतिक्रिया' },

  'brand.name': { en: 'Setu', hi: 'सेतु' },
  'brand.tagline': { en: 'Road Accessibility & Supply Logistics for the North East', hi: 'पूर्वोत्तर के लिए सड़क पहुँच एवं आपूर्ति लॉजिस्टिक्स' },
  'brand.disclaimer': { en: 'A student initiative · Not an official Government of India website', hi: 'एक छात्र पहल · यह भारत सरकार की आधिकारिक वेबसाइट नहीं है' },

  'auth.dashboard': { en: 'Operations Dashboard', hi: 'संचालन डैशबोर्ड' },
  'auth.username': { en: 'Username', hi: 'उपयोगकर्ता नाम' },
  'auth.password': { en: 'Password', hi: 'पासवर्ड' },
  'auth.signIn': { en: 'Sign in', hi: 'साइन इन करें' },

  'lang.choose': { en: 'Choose your language', hi: 'अपनी भाषा चुनें' },
  'lang.chooseSub': { en: 'You can change this any time from the top bar.', hi: 'आप इसे शीर्ष बार से कभी भी बदल सकते हैं।' },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof DICTIONARY) => string;
  hasChosenLanguage: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(
    () => (localStorage.getItem(STORAGE_KEY) as Language) || 'en'
  );
  const [hasChosenLanguage, setHasChosenLanguage] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) !== null
  );

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setHasChosenLanguage(true);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  const t = (key: keyof typeof DICTIONARY): string => {
    const entry = DICTIONARY[key];
    if (!entry) return String(key);
    return entry[language];
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, hasChosenLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
