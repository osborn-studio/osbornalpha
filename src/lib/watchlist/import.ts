import { parse as parseCsv } from 'csv-parse/sync';
import { normalizeWindTicker } from '@/lib/stocks/wind-normalize';

const TICKER_SHAPE = /^(\d{6}\.(SH|SZ|BJ)|\d{5}\.HK|\d{4}\.T|\d{6}\.(KS|KQ)|\d{4,6}\.(TW|TWO)|[A-Z][A-Z.]{0,9})$/;
const TICKER_HEADERS = new Set(['ticker', 'symbol', 'code', '代码', '股票代码', '证券代码']);

function normalizedTicker(value: string): string | null {
  const ticker = normalizeWindTicker(value.trim().toUpperCase());
  return TICKER_SHAPE.test(ticker) ? ticker : null;
}

function parseRows(raw: string): string[][] {
  try {
    return parseCsv(raw, {
      bom: true,
      delimiter: [',', ';'],
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
  } catch {
    return raw.split(/\r?\n/).map((line) => [line]);
  }
}

export function parseTickerInput(raw: string): string[] {
  if (!raw.trim()) return [];
  const rows = parseRows(raw);
  const firstRow = rows[0] ?? [];
  const tickerColumn = firstRow.findIndex((cell) => TICKER_HEADERS.has(cell.trim().toLocaleLowerCase()));
  const cells = tickerColumn >= 0
    ? rows.slice(1).map((row) => row[tickerColumn] ?? '')
    : rows.flat();
  const output: string[] = [];
  cells.forEach((cell) => {
    cell.split(/\s+/).forEach((token) => {
      const ticker = normalizedTicker(token);
      if (ticker) output.push(ticker);
    });
  });
  return output;
}

export function watchlistImportStats(parsed: string[], existing: ReadonlySet<string>) {
  const seen = new Set<string>();
  const fresh: string[] = [];
  let duplicateOfExisting = 0;
  let duplicateWithinInput = 0;
  parsed.forEach((ticker) => {
    if (existing.has(ticker)) duplicateOfExisting += 1;
    else if (seen.has(ticker)) duplicateWithinInput += 1;
    else { seen.add(ticker); fresh.push(ticker); }
  });
  return { fresh, duplicateOfExisting, duplicateWithinInput, total: parsed.length };
}
