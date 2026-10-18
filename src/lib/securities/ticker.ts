import type { CoreMarket } from './model';

// Ticker parsing lives apart from normalize.ts so client code can import it
// without pulling in pinyin-pro.

const WIND_US_SUFFIX = /^([A-Z][A-Z0-9./-]*?)\.(O|N|A|K|OQ|NQ)$/;

export function compact(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

function inferAExchange(code: string): 'SH' | 'SZ' | 'BJ' | null {
  if (/^(430|83|87|92)/.test(code)) return 'BJ';
  if (/^(5|6|900|110|111|113|118)/.test(code)) return 'SH';
  if (/^(0|1|2|3)/.test(code)) return 'SZ';
  return null;
}

export function normalizeSecurityTicker(input: string, market: CoreMarket): string | null {
  const raw = compact(input).toUpperCase();
  if (!raw) return null;

  if (market === 'A') {
    const prefixed = raw.match(/^(SH|SZ|BJ)(\d{6})$/);
    if (prefixed) return `${prefixed[2]}.${prefixed[1]}`;

    const yahoo = raw.match(/^(\d{6})\.SS$/);
    if (yahoo) return `${yahoo[1]}.SH`;

    const canonical = raw.match(/^(\d{6})\.(SH|SZ|BJ)$/);
    if (canonical) return `${canonical[1]}.${canonical[2]}`;

    if (!/^\d{6}$/.test(raw)) return null;
    const exchange = inferAExchange(raw);
    return exchange ? `${raw}.${exchange}` : null;
  }

  if (market === 'HK') {
    const match = raw.match(/^(\d{1,5})(?:\.HK)?$/);
    return match ? `${match[1].padStart(5, '0')}.HK` : null;
  }

  const withoutWind = raw.match(WIND_US_SUFFIX)?.[1] ?? raw;
  const canonical = withoutWind.replace(/[/-]/g, '.');
  return /^[A-Z][A-Z0-9.]{0,7}$/.test(canonical) ? canonical : null;
}

export function inferCoreMarket(input: string): CoreMarket | null {
  const raw = compact(input).toUpperCase();
  if (!raw) return null;
  if (/^(?:SH|SZ|BJ)\d{6}$/.test(raw) || /^\d{6}(?:\.(?:SH|SZ|BJ|SS))?$/.test(raw)) {
    return 'A';
  }
  if (/^\d{1,5}(?:\.HK)?$/.test(raw)) return 'HK';
  if (/^[A-Z][A-Z0-9./-]{0,7}(?:\.(?:O|N|A|K|OQ|NQ))?$/.test(raw)) return 'US';
  return null;
}
