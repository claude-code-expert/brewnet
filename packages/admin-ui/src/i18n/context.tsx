import { createContext, useState, useEffect, type ReactNode } from 'react';

export type Locale = 'ko' | 'en';

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const STORAGE_KEY = 'brewnet-locale';

function detectLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'ko' || saved === 'en') return saved;
  return navigator.language.startsWith('ko') ? 'ko' : 'en';
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: 'ko',
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}
