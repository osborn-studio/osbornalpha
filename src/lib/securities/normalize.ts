import { pinyin } from 'pinyin-pro';
import type { CoreMarket, NormalizedAlias } from './model';

const WIND_US_SUFFIX = /^([A-Z][A-Z0-9./-]*?)\.(O|N|A|K|OQ|NQ)$/;

function compact(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

export function normalizeAlias(value: string): string {
  return compact(value).toLocaleLowerCase('zh-CN');
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

export function isCompleteCodeQuery(input: string): boolean {
  const market = inferCoreMarket(input);
  return market !== null && normalizeSecurityTicker(input, market) !== null;
}

interface AliasSeed {
  ticker: string;
  symbol: string;
  name: string;
  market: CoreMarket;
  source: string;
  vendorAliases?: string[];
  formerSymbols?: string[];
}

export function buildAliases(seed: AliasSeed): NormalizedAlias[] {
  const aliases: NormalizedAlias[] = [];
  const seen = new Set<string>();

  const add = (value: string, aliasType: NormalizedAlias['alias_type']) => {
    const alias = normalizeAlias(value);
    if (!alias) return;
    const key = `${aliasType}:${alias}`;
    if (seen.has(key)) return;
    seen.add(key);
    aliases.push({ alias, ticker: seed.ticker, alias_type: aliasType, source: seed.source });
  };

  add(seed.symbol, 'symbol');
  add(seed.ticker, 'vendor');
  if (seed.market === 'A') {
    const exchange = seed.ticker.split('.')[1]?.toLowerCase();
    if (exchange) add(`${exchange}${seed.symbol}`, 'vendor');
  } else if (seed.market === 'HK') {
    add(String(Number(seed.symbol)), 'symbol');
  } else {
    add(seed.symbol.replaceAll('.', '-'), 'vendor');
    add(seed.symbol.replaceAll('.', '/'), 'vendor');
  }

  for (const value of seed.vendorAliases ?? []) add(value, 'vendor');
  for (const value of seed.formerSymbols ?? []) add(value, 'former_symbol');
  add(seed.name, 'name');

  if (/\p{Script=Han}/u.test(seed.name)) {
    add(pinyin(seed.name, { toneType: 'none', separator: '', nonZh: 'removed' }), 'pinyin');
    add(pinyin(seed.name, { pattern: 'first', toneType: 'none', separator: '', nonZh: 'removed' }), 'pinyin');
  }

  return aliases;
}
