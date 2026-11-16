import {describe, expect, it} from 'vitest';
import {fixtures, rawInputs} from './fixtures';

/** Present fields must agree across fixtures. Required proof fields are asserted by API/UI tests. */
describe('registered fixture observation identity', () => {
  it('keeps series, value, version, availability, and period consistent across responses', () => {
    const identities = new Map<string, Record<string, unknown>>();
    let compared = 0;
    function visit(value: unknown, location: string) {
      if (!value || typeof value !== 'object') return;
      const row = value as Record<string, unknown>;
      if (typeof row.observation_id === 'string' && typeof row.series_id === 'string' && typeof row.value_text === 'string') {
        const previous = identities.get(row.observation_id) ?? {};
        for (const key of ['series_id', 'value_text', 'version', 'available_at', 'period_end']) {
          if (row[key] === undefined || row[key] === null) continue;
          const actual = key === 'available_at' ? new Date(String(row[key])).toISOString() : row[key];
          if (previous[key] !== undefined) {
            expect(actual, `${location}: ${row.observation_id}.${key}`).toEqual(previous[key]);
            compared++;
          } else previous[key] = actual;
        }
        identities.set(row.observation_id, previous);
      }
      for (const [key, child] of Object.entries(row)) visit(child, `${location}.${key}`);
    }
    visit({rawInputs, fixtures}, 'fixture');
    expect(identities.size).toBeGreaterThan(5);
    expect(compared).toBeGreaterThan(20);
  });
});
