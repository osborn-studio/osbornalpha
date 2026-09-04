import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WatchlistImportClientError,
  detectPortableWatchlistFormat,
  executePortableWatchlistImport,
  previewPortableWatchlistImport,
} from './import-client';

const command = { content: 'format_version: 3\ngroups: []', format: 'yaml' as const, mode: 'merge' as const };
const preview = {
  mode: 'merge',
  groups: { incoming: 1, create: 1, update: 0, remove: 0 },
  items: { incoming: 1, create: 1, update: 0, remove: 0 },
  alerts: { incoming: 0, create: 0, update: 0, remove: 0 },
};

describe('watchlist import client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('detects complete portable exports without treating lightweight CSV as portable', () => {
    expect(detectPortableWatchlistFormat('format_version: 3\ngroups:\n', 'watchlist.yml')).toBe('yaml');
    expect(detectPortableWatchlistFormat('group,ticker,decision_version,alerts_json\nCore,AAPL,1,[]')).toBe('csv');
    expect(detectPortableWatchlistFormat('group,ticker\nCore,AAPL', 'watchlist.csv')).toBeNull();
  });

  it('previews and executes imports through the typed boundary', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ preview }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        preview,
        result: { version: 4 },
        snapshot: { ownerId: 'user-1', version: 4, groups: [{ id: 'g1', name: 'Core', tickers: ['AAPL'] }] },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(previewPortableWatchlistImport(command)).resolves.toEqual(preview);
    await expect(executePortableWatchlistImport(command, 'mutation-123')).resolves.toMatchObject({
      snapshot: { ownerId: 'user-1', version: 4 },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ dryRun: false, mutationId: 'mutation-123' });
  });

  it('preserves server error codes and rejected tickers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'security_not_selectable', tickers: ['BAD'],
    }), { status: 422 })));
    await expect(previewPortableWatchlistImport(command)).rejects.toEqual(
      new WatchlistImportClientError('security_not_selectable', 422, ['BAD']),
    );
  });
});
