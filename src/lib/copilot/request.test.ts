import { describe, expect, it } from 'vitest';
import { normalizeCopilotTicker } from './request';

describe('normalizeCopilotTicker', () => {
  it('canonicalizes unsuffixed A-share and Hong Kong tickers', () => {
    expect(normalizeCopilotTicker('300502')).toBe('300502.SZ');
    expect(normalizeCopilotTicker('600436')).toBe('600436.SH');
    expect(normalizeCopilotTicker('700')).toBe('00700.HK');
  });

  it('normalizes US symbols and rejects prose', () => {
    expect(normalizeCopilotTicker('brk-b')).toBe('BRK.B');
    expect(normalizeCopilotTicker('not a ticker')).toBeNull();
  });
});
