import { normalizeSecurityTicker } from '../normalize';
import type { SecurityExchange } from '../model';
import { SecuritySourceError } from './tushare-client';

export interface UsDirectoryIdentity {
  ticker: string;
  rawSymbol: string;
  name: string;
  exchange: Extract<SecurityExchange, 'NASDAQ' | 'NYSE' | 'AMEX'>;
}

export type NasdaqDirectoryKind = 'nasdaq' | 'other';

function requireField(index: Map<string, number>, name: string): number {
  const value = index.get(name);
  if (value === undefined) throw new SecuritySourceError('source_schema', 'nasdaq-directory');
  return value;
}

function otherExchange(value: string): UsDirectoryIdentity['exchange'] | null {
  if (value === 'N') return 'NYSE';
  if (value === 'A') return 'AMEX';
  return null;
}

export function parseNasdaqDirectory(contents: string, kind: NasdaqDirectoryKind): UsDirectoryIdentity[] {
  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2 || !lines.some((line) => line.startsWith('File Creation Time:'))) {
    throw new SecuritySourceError('source_schema', 'nasdaq-directory');
  }

  const header = lines[0].split('|');
  const index = new Map(header.map((field, position) => [field.trim(), position]));
  const symbolIndex = requireField(index, kind === 'nasdaq' ? 'Symbol' : 'ACT Symbol');
  const nameIndex = requireField(index, 'Security Name');
  const etfIndex = requireField(index, 'ETF');
  const testIndex = requireField(index, 'Test Issue');
  const exchangeIndex = kind === 'other' ? requireField(index, 'Exchange') : -1;
  const identities: UsDirectoryIdentity[] = [];

  for (const line of lines.slice(1)) {
    if (line.startsWith('File Creation Time:')) break;
    const values = line.split('|');
    if (values.length !== header.length) throw new SecuritySourceError('source_schema', 'nasdaq-directory');
    if (values[testIndex] === 'Y' || values[etfIndex] === 'Y') continue;
    const exchange = kind === 'nasdaq' ? 'NASDAQ' : otherExchange(values[exchangeIndex]);
    if (!exchange) continue;
    const ticker = normalizeSecurityTicker(values[symbolIndex], 'US');
    const name = values[nameIndex]?.trim();
    if (!ticker || !name) continue;
    identities.push({ ticker, rawSymbol: values[symbolIndex], name, exchange });
  }

  return identities.sort((a, b) => a.ticker.localeCompare(b.ticker));
}
