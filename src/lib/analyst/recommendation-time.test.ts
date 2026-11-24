import { describe, expect, it } from 'vitest';
import { formatDateTimeLocale } from '@/lib/i18n/locale';
import { exchangeDate } from '@/lib/scoring/forward';
import { BEIJING_TIME_ZONE, fromBeijingDateTimeInput, toBeijingDateTimeInput } from './recommendation-time';

describe('Beijing recommendation time', () => {
  it('reads a midnight entry on the Beijing calendar and restores the same form value', () => {
    const instant = fromBeijingDateTimeInput('2026-11-24T00:00');
    expect(instant).toBe('2026-11-23T16:00:00.000Z');
    expect(toBeijingDateTimeInput(instant)).toBe('2026-11-24T00:00');
  });

  it('shows the Beijing recommendation date even when the US market is a day behind', () => {
    const instant = '2026-11-24T03:19:13.474Z';
    expect(toBeijingDateTimeInput(instant)).toBe('2026-11-24T11:19');
    expect(formatDateTimeLocale(instant, 'zh', BEIJING_TIME_ZONE)).toContain('11/24 11:19');
    expect(exchangeDate(instant, 'US')).toBe('2026-11-23');
  });

  it('rejects an impossible or already zoned wall time', () => {
    expect(() => fromBeijingDateTimeInput('2026-02-30T09:00')).toThrow(RangeError);
    expect(() => fromBeijingDateTimeInput('2026-11-24T11:19Z')).toThrow(RangeError);
  });
});
