import { describe, expect, it } from 'vitest';
import {
  SAMPLE_TICKERS,
  createPrimaryBoard,
  installSampleBoard,
} from './onboarding';

describe('watchlist onboarding', () => {
  it('creates one empty primary board when no board exists', () => {
    const groups = createPrimaryBoard([], '我的股票池', 'primary_test');

    expect(groups).toEqual([{ id: 'primary_test', name: '我的股票池', tickers: [] }]);
  });

  it('returns existing boards without replacing them', () => {
    const current = [{ id: 'mine', name: '我的', tickers: ['AAPL'] }];

    expect(createPrimaryBoard(current, '我的股票池', 'unused')).toBe(current);
  });

  it('appends a cross-market sample without overwriting user boards', () => {
    const current = [{ id: 'mine', name: '我的', tickers: ['MSFT'] }];

    expect(installSampleBoard(current, '跨市场示例')).toEqual([
      ...current,
      { id: 'sample_watchlist', name: '跨市场示例', tickers: SAMPLE_TICKERS },
    ]);
  });

  it('does not install the sample twice', () => {
    const once = installSampleBoard([], '跨市场示例');

    expect(installSampleBoard(once, '跨市场示例')).toBe(once);
  });
});
