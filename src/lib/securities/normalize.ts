import { pinyin } from 'pinyin-pro';
import type { CoreMarket, NormalizedAlias } from './model';
import { compact, inferCoreMarket, normalizeSecurityTicker } from './ticker';

export { inferCoreMarket, normalizeSecurityTicker };

export function normalizeAlias(value: string): string {
  return compact(value).toLocaleLowerCase('zh-CN');
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
