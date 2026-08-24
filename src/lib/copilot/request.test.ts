import { describe, expect, it, vi } from 'vitest';
import { normalizeCopilotTicker, resolveCopilotTicker } from './request';

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

  it('keeps canonical ticker requests on the local fast path', async () => {
    const search = vi.fn();

    await expect(resolveCopilotTicker('600519', search)).resolves.toBe('600519.SH');
    expect(search).not.toHaveBeenCalled();
  });

  it('resolves an exact company-name match through the security master', async () => {
    const search = async () => [
      {
        t: '688472.SH',
        n: '阿特斯',
        match_kind: 'exact_alias',
        selectable: true,
        verification_status: 'verified',
      },
    ];

    await expect(resolveCopilotTicker('阿特斯', search)).resolves.toBe('688472.SH');
  });

  it('does not guess from ambiguous or non-selectable name results', async () => {
    const ambiguous = async () => [
      { t: 'AAA', n: '同名', match_kind: 'exact_name', selectable: true, verification_status: 'verified' },
      { t: 'BBB', n: '同名', match_kind: 'exact_alias', selectable: true, verification_status: 'verified' },
    ];
    const inactive = async () => [
      { t: 'OLD', n: '旧公司', match_kind: 'exact_name', selectable: false, verification_status: 'inactive' },
    ];

    await expect(resolveCopilotTicker('同名', ambiguous)).resolves.toBeNull();
    await expect(resolveCopilotTicker('旧公司', inactive)).resolves.toBeNull();
  });
});
