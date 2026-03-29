import { useContext, useCallback } from 'react';
import { LocaleContext, type Locale } from './context.js';
import en from './en.js';

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

/**
 * i18n hook for Brewnet admin-ui.
 *
 * Usage:
 *   const { t, locale, setLocale } = useI18n();
 *   t('key', '한국어 폴백')            → KO: 한국어 폴백, EN: English from en.ts
 *   t('key', '포트 {port}', { port })  → interpolation supported
 */
export function useI18n() {
  const { locale, setLocale } = useContext(LocaleContext);

  const t = useCallback(
    (key: string, fallback: string, vars?: Record<string, string | number>): string => {
      const template = locale === 'en' ? (en[key] ?? fallback) : fallback;
      return interpolate(template, vars);
    },
    [locale],
  );

  return { t, locale: locale as Locale, setLocale };
}
