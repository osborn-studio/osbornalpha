// Locale resolution chain (pure functions, no framework deps — TDD'd).
// Resolution priority for in-app locale: header (x-app-locale, set by
// middleware for /en rewrites) > NEXT_LOCALE cookie > Accept-Language >
// DEFAULT_LOCALE. See docs/superpowers/specs/2026-07-03-g1-i18n-design.md §0.

export type AppLocale = 'zh' | 'en';

export const LOCALES: AppLocale[] = ['zh', 'en'];

export const DEFAULT_LOCALE: AppLocale = 'zh';

const INTL_TAG: Record<AppLocale, string> = {
  zh: 'zh-CN',
  en: 'en-US',
};

/**
 * Normalize a raw locale/language tag (e.g. 'en-US', 'zh-Hans', 'ZH-cn')
 * into one of our supported AppLocale values, or null if unsupported.
 * zh-TW is merged into 'zh' for now (no separate Traditional Chinese dict yet).
 */
export function normalizeLocale(raw: string | null | undefined): AppLocale | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  const base = lower.split('-')[0];
  if (base === 'en') return 'en';
  if (base === 'zh') return 'zh';
  return null;
}

/**
 * Parse an Accept-Language header value (e.g. 'en-US,en;q=0.9,zh;q=0.8') and
 * return the first entry (in listed order, ignoring q-weights — good enough
 * for a 2-locale app) that normalizes to a supported locale.
 */
function firstSupportedFromAcceptLanguage(acceptLanguage: string | null | undefined): AppLocale | null {
  if (!acceptLanguage) return null;
  const tags = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean);
  for (const tag of tags) {
    const normalized = normalizeLocale(tag);
    if (normalized) return normalized;
  }
  return null;
}

export function resolveLocale(opts: {
  header?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): AppLocale {
  const fromHeader = normalizeLocale(opts.header);
  if (fromHeader) return fromHeader;

  const fromCookie = normalizeLocale(opts.cookie);
  if (fromCookie) return fromCookie;

  const fromAcceptLanguage = firstSupportedFromAcceptLanguage(opts.acceptLanguage);
  if (fromAcceptLanguage) return fromAcceptLanguage;

  return DEFAULT_LOCALE;
}

// Optional `tz` (IANA id, e.g. 'America/New_York') overrides the display
// timezone; undefined keeps prior behavior (browser/system timezone).
export function formatDateLocale(iso: string, locale: AppLocale, tz?: string): string {
  return new Date(iso).toLocaleDateString(INTL_TAG[locale], tz ? { timeZone: tz } : undefined);
}

export function formatDateTimeLocale(iso: string, locale: AppLocale, tz?: string): string {
  return new Date(iso).toLocaleString(INTL_TAG[locale], tz ? { timeZone: tz } : undefined);
}
