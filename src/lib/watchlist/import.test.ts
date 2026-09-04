import { describe, expect, it } from 'vitest';
import { parseTickerInput, watchlistImportStats } from './import';

describe('watchlist import', () => {
  it('normalizes supported vendor dialects and skips a header', () => {
    expect(parseTickerInput('ticker\nAAPL.O\nsh600519\n600519.SS')).toEqual(['AAPL', '600519.SH', '600519.SH']);
  });

  it('reads the ticker column from exported CSV without treating group names as tickers', () => {
    expect(parseTickerInput('group,ticker\nCore,AAPL\nIncome,600519.SH')).toEqual(['AAPL', '600519.SH']);
    expect(parseTickerInput('name;symbol\nApple;AAPL\nNvidia;NVDA')).toEqual(['AAPL', 'NVDA']);
  });

  it('keeps comma-separated ticker lists while ignoring annotations', () => {
    expect(parseTickerInput('AAPL, NVDA\nnot-a-ticker\nsh600519')).toEqual(['AAPL', 'NVDA', '600519.SH']);
  });

  it('separates existing and within-file duplicates', () => {
    expect(watchlistImportStats(['AAPL', 'NVDA', 'NVDA'], new Set(['AAPL']))).toEqual({
      fresh: ['NVDA'], duplicateOfExisting: 1, duplicateWithinInput: 1, total: 3,
    });
  });
});
