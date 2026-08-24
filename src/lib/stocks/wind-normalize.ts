/**
 * Normalize various ticker dialects to the canonical form used by this app:
 *   A-share Shanghai:  600519.SH
 *   A-share Shenzhen:  000333.SZ
 *   A-share Beijing:   832000.BJ
 *   HK:                00700.HK   (5-digit, zero-padded)
 *   US:                AAPL       (no exchange suffix; route fans out 105→106→107)
 *
 * Wind (万得) is the dominant Chinese terminal. Its codes show up in research
 * notes, broker reports, and exported workbooks. The notable differences from
 * our canonical form are:
 *
 *   Wind US tickers carry an exchange suffix:
 *     AAPL.O   → NASDAQ
 *     JPM.N    → NYSE
 *     SPY.A    → AMEX (rare)
 *     XOM.OQ   → NASDAQ (alt)
 *
 *   Wind sometimes drops HK leading zeros: 700.HK instead of 00700.HK.
 *
 * Common dialects we also accept:
 *   - Yahoo Shanghai: 600519.SS → 600519.SH
 *   - Sina: sh600519 / sz000333 / bj832000
 *   - Snowball: SH600519 / SZ000333
 *   - Tonghuashun bare A-share: 600519 → infer SH/SZ/BJ from prefix
 *
 * Anything we don't recognise is returned uppercased + trimmed, so the
 * downstream code falls back to its existing behaviour without surprise.
 */

const WIND_US_SUFFIX = /^([A-Z][A-Z0-9.]*?)\.(O|N|A|K|OQ|NQ)$/;

export function normalizeWindTicker(input: string): string {
  if (!input) return '';
  let t = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return '';

  // Canonical A-share — pass-through
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(t)) return t;

  // Sina lowercase prefix
  const sina = t.match(/^(SH|SZ|BJ)(\d{6})$/);
  if (sina) return `${sina[2]}.${sina[1]}`;

  // Yahoo Shanghai .SS
  const yahoo = t.match(/^(\d{6})\.SS$/);
  if (yahoo) return `${yahoo[1]}.SH`;

  // Bare 6-digit A-share — infer exchange from code prefix
  const aBare = t.match(/^(\d{6})$/);
  if (aBare) {
    const code = aBare[1];
    if (/^(000|001|002|003|30)/.test(code)) return `${code}.SZ`;          // 主板/中小板/创业板
    if (/^(60|68|90)/.test(code)) return `${code}.SH`;                    // 主板/科创板/B股
    if (/^(83|87|92|43|82|81)/.test(code)) return `${code}.BJ`;           // 北交所
    return t;
  }

  // Already canonical HK (5-digit)
  if (/^\d{5}\.HK$/.test(t)) return t;

  // HK with under-padded code (Wind sometimes drops leading zeros)
  const hk = t.match(/^(\d{1,5})\.HK$/);
  if (hk) return `${hk[1].padStart(5, '0')}.HK`;

  // Bare HK 4-digit (e.g. "0700" or "700") — only safe if ≤4 digits;
  // a 6-digit bare code is A-share, handled above. We don't auto-infer HK
  // from a 4-digit bare number alone because it could equally be a US
  // ticker — require the .HK suffix.

  // Wind US exchange suffix → strip (must start with a letter to avoid
  // accidentally stripping A-share .SH/.SZ/.BJ which start with a digit)
  const us = t.match(WIND_US_SUFFIX);
  if (us) return us[1];

  // Already canonical US (letters + dots)
  if (/^[A-Z][A-Z.]{0,9}$/.test(t)) return t;

  // Unknown — preserve as-is so callers can decide
  return t;
}
