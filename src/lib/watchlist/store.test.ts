import { describe, expect, it } from 'vitest';
import { defaultWatchlistGroups, parseWatchlistGroups, uniqueWatchlistTickers } from './store';

describe('watchlist store', () => {
  it('returns a fresh copy of the default watchlist', () => {
    const first = defaultWatchlistGroups();
    const second = defaultWatchlistGroups();

    first[0].tickers.push('TEST');

    expect(second[0].tickers).not.toContain('TEST');
  });

  it('normalizes persisted tickers and removes duplicates inside a group', () => {
    const parsed = parseWatchlistGroups(JSON.stringify([
      { id: 'core', name: 'Core', tickers: [' nvda ', 'NVDA', ' 700.HK '] },
    ]));

    expect(parsed).toEqual([
      { id: 'core', name: 'Core', tickers: ['NVDA', '700.HK'] },
    ]);
  });

  it('rejects malformed persisted data', () => {
    expect(parseWatchlistGroups('{"id":"bad"}')).toBeNull();
    expect(parseWatchlistGroups(JSON.stringify([{ id: '', name: 'Bad', tickers: [] }]))).toBeNull();
  });

  it('deduplicates tickers across groups in first-seen order', () => {
    expect(uniqueWatchlistTickers([
      { id: 'a', name: 'A', tickers: ['NVDA', 'TSLA'] },
      { id: 'b', name: 'B', tickers: ['TSLA', '700.HK'] },
    ])).toEqual(['NVDA', 'TSLA', '700.HK']);
  });

  it('salvages good entries when some are malformed (no all-or-nothing reset)', () => {
    const parsed = parseWatchlistGroups(JSON.stringify([
      { id: 'good', name: 'Good', tickers: ['NVDA'] },
      { id: '', name: 'no-id', tickers: [] },
      'not-an-object',
      { id: 'also-good', name: 'Also', tickers: [] },
    ]));
    expect(parsed?.map((g) => g.id)).toEqual(['good', 'also-good']);
  });

  it('returns null only when every entry is malformed', () => {
    expect(parseWatchlistGroups(JSON.stringify([{ bad: true }, 42]))).toBeNull();
  });

  it('preserves an explicitly empty watchlist', () => {
    expect(parseWatchlistGroups('[]')).toEqual([]);
  });
});
