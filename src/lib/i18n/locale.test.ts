import { describe, it, expect } from 'vitest';
import {
  type AppLocale,
  LOCALES,
  DEFAULT_LOCALE,
  normalizeLocale,
  resolveLocale,
  formatDateLocale,
  formatDateTimeLocale,
} from './locale';

describe('LOCALES / DEFAULT_LOCALE', () => {
  it('exposes zh and en as the supported locales', () => {
    expect(LOCALES).toEqual(['zh', 'en']);
  });

  it('defaults to zh', () => {
    expect(DEFAULT_LOCALE).toBe('zh');
  });
});

describe('normalizeLocale', () => {
  it('normalizes bare "en" to en', () => {
    expect(normalizeLocale('en')).toBe('en');
  });

  it('normalizes "en-US" to en', () => {
    expect(normalizeLocale('en-US')).toBe('en');
  });

  it('normalizes "en-GB" to en', () => {
    expect(normalizeLocale('en-GB')).toBe('en');
  });

  it('normalizes bare "zh" to zh', () => {
    expect(normalizeLocale('zh')).toBe('zh');
  });

  it('normalizes "zh-CN" to zh', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh');
  });

  it('normalizes "zh-Hans" to zh', () => {
    expect(normalizeLocale('zh-Hans')).toBe('zh');
  });

  it('normalizes "zh-TW" to zh (merged for now)', () => {
    expect(normalizeLocale('zh-TW')).toBe('zh');
  });

  it('is case-insensitive', () => {
    expect(normalizeLocale('EN-us')).toBe('en');
    expect(normalizeLocale('ZH-cn')).toBe('zh');
  });

  it('returns null for unsupported locales', () => {
    expect(normalizeLocale('ja')).toBeNull();
    expect(normalizeLocale('ko-KR')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
    expect(normalizeLocale('')).toBeNull();
  });
});

describe('resolveLocale', () => {
  it('prefers header over cookie and acceptLanguage', () => {
    expect(
      resolveLocale({ header: 'en', cookie: 'zh', acceptLanguage: 'zh-CN' })
    ).toBe('en');
  });

  it('falls back to cookie when header is absent', () => {
    expect(
      resolveLocale({ header: null, cookie: 'en', acceptLanguage: 'zh-CN' })
    ).toBe('en');
  });

  it('falls back to acceptLanguage when header and cookie are absent', () => {
    expect(
      resolveLocale({ header: null, cookie: null, acceptLanguage: 'en-US,en;q=0.9,zh;q=0.8' })
    ).toBe('en');
  });

  it('parses acceptLanguage picking the first normalizable entry', () => {
    expect(resolveLocale({ acceptLanguage: 'ja,ko' })).toBe(DEFAULT_LOCALE);
  });

  it('skips unnormalizable acceptLanguage entries and uses the next one', () => {
    expect(resolveLocale({ acceptLanguage: 'ja;q=0.9,en;q=0.8' })).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE when nothing resolves', () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ header: null, cookie: null, acceptLanguage: null })).toBe(DEFAULT_LOCALE);
  });

  it('ignores an unnormalizable header and falls through to cookie', () => {
    expect(resolveLocale({ header: 'fr', cookie: 'en' })).toBe('en');
  });

  it('ignores an unnormalizable cookie and falls through to acceptLanguage', () => {
    expect(resolveLocale({ header: null, cookie: 'fr', acceptLanguage: 'en-US' })).toBe('en');
  });
});

describe('formatDateLocale', () => {
  const iso = '2026-07-03T00:00:00.000Z';

  it('formats using zh-CN for zh locale', () => {
    const zh = formatDateLocale(iso, 'zh');
    const expected = new Date(iso).toLocaleDateString('zh-CN');
    expect(zh).toBe(expected);
  });

  it('formats using en-US for en locale', () => {
    const en = formatDateLocale(iso, 'en');
    const expected = new Date(iso).toLocaleDateString('en-US');
    expect(en).toBe(expected);
  });

  it('produces different output for zh vs en', () => {
    expect(formatDateLocale(iso, 'zh')).not.toBe(formatDateLocale(iso, 'en'));
  });
});

describe('formatDateTimeLocale', () => {
  const iso = '2026-07-03T08:30:00.000Z';

  it('formats using zh-CN for zh locale', () => {
    const zh = formatDateTimeLocale(iso, 'zh');
    const expected = new Date(iso).toLocaleString('zh-CN');
    expect(zh).toBe(expected);
  });

  it('formats using en-US for en locale', () => {
    const en = formatDateTimeLocale(iso, 'en');
    const expected = new Date(iso).toLocaleString('en-US');
    expect(en).toBe(expected);
  });

  it('produces different output for zh vs en', () => {
    expect(formatDateTimeLocale(iso, 'zh')).not.toBe(formatDateTimeLocale(iso, 'en'));
  });
});

describe('formatDateTimeLocale timezone override', () => {
  const iso = '2026-07-04T01:30:00Z';
  it('renders differently in Shanghai vs New_York', () => {
    const sh = formatDateTimeLocale(iso, 'en', 'Asia/Shanghai');   // Jul 4 09:30
    const ny = formatDateTimeLocale(iso, 'en', 'America/New_York'); // Jul 3 21:30
    expect(sh).not.toBe(ny);
    expect(sh).toContain('9:30');
    expect(ny).toContain('9:30');
  });
  it('tz omitted keeps prior behavior (no throw, non-empty)', () => {
    expect(formatDateTimeLocale(iso, 'zh').length).toBeGreaterThan(0);
  });
});

// Type-level smoke check: AppLocale must accept exactly 'zh' | 'en'.
const _zh: AppLocale = 'zh';
const _en: AppLocale = 'en';
void _zh;
void _en;
