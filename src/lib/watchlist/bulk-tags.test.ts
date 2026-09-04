import { describe, expect, it } from 'vitest';
import { parseBulkTagCommand } from './bulk-tags';

describe('parseBulkTagCommand', () => {
  it('normalizes the API command and deduplicates item ids', () => {
    expect(parseBulkTagCommand({
      items: [{ id: 'item-1', expectedVersion: 2 }, { id: 'item-1', expectedVersion: 2 }],
      tag: '  AI  ', mode: 'add',
    })).toEqual({ items: [{ id: 'item-1', expected_version: 2 }], tag: 'AI', mode: 'add' });
  });

  it('rejects invalid tags and versions', () => {
    expect(parseBulkTagCommand({ items: [], tag: 'AI', mode: 'add' })).toBeNull();
    expect(parseBulkTagCommand({ items: [{ id: 'x', expectedVersion: -1 }], tag: 'AI', mode: 'add' })).toBeNull();
  });
});
