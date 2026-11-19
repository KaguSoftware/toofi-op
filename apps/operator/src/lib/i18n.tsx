import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dir as dirOf, makeT, type Direction, type Locale, type MessageKey, type TParams } from '@rop/i18n';

const KEY = 'rop.locale';

interface LocaleValue {
  locale: Locale;
  dir: Direction;
  tr: (key: MessageKey, params?: TParams) => string;
  setLocale: (l: Locale) => void;
  toggle: () => void;
}

const Ctx = createContext<LocaleValue | null>(null);

function initial(): Locale {
  try {
    return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const value = useMemo<LocaleValue>(() => {
    const setLocale = (l: Locale) => {
      setLocaleState(l);
      try {
        localStorage.setItem(KEY, l);
      } catch {
        /* storage blocked: the choice lasts for this session only */
      }
    };
    return {
      locale,
      dir: dirOf(locale),
      tr: makeT(locale),
      setLocale,
      toggle: () => setLocale(locale === 'ar' ? 'en' : 'ar'),
    };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = value.locale;
    document.documentElement.dir = value.dir;
  }, [value]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocale needs <LocaleProvider>');
  return v;
}
