import { describe, expect, it } from 'vitest';
import {
  buildPortableWatchlistBundle,
  portableWatchlistCsv,
  portableWatchlistYaml,
  serializeWatchlistYaml,
  watchlistCsv,
} from './export';

describe('watchlist export', () => {
  const groups = [{ id: 'core', name: 'Core "A"\nLong term', tickers: ['AAPL'] }];

  it('quotes unsafe YAML scalar content', () => {
    const output = serializeWatchlistYaml(groups);
    expect(output).toContain('name: "Core \\"A\\"\\nLong term"');
    expect(output).toContain('version: 2');
  });

  it('escapes CSV fields', () => {
    expect(watchlistCsv(groups)).toContain('"Core ""A""\nLong term","AAPL"');
  });

  it('exports decision metadata and attached alert rules as a portable bundle', () => {
    const bundle = buildPortableWatchlistBundle([{
      id: 'group-1', name: 'Core', description: 'Long term', sort_order: 0,
      watchlist_items: [{
        id: 'item-1', ticker: 'AAPL', conviction: 8, confidence: 75, notes: 'Watch margins',
        thesis: 'Services growth', target_price: 240, invalidation_conditions: 'Margin decline',
        review_at: null, tags: ['core'], status: 'watching', decision_version: 3,
      }],
    } as never], [{
      watchlist_item_id: 'item-1', alert_type: 'price', operator: 'crosses_above',
      threshold_numeric: 220, config: {}, enabled: true, cooldown_minutes: 60,
    } as never], '2026-09-04T12:00:00Z');

    expect(bundle.groups[0].items[0]).toMatchObject({
      ticker: 'AAPL', thesis: 'Services growth', decisionVersion: 3,
      alerts: [{ alertType: 'price', threshold: 220 }],
    });
    expect(portableWatchlistYaml(bundle)).toContain('alerts: [{"alertType":"price"');
    expect(portableWatchlistCsv(bundle)).toContain('group_description');
    expect(portableWatchlistCsv(bundle)).toContain('"Services growth"');
  });

  it('guards spreadsheet formulas in portable CSV text cells', () => {
    const bundle = buildPortableWatchlistBundle([{
      id: 'group-1', name: '=CMD()', description: '+description', sort_order: 0,
      watchlist_items: [{
        id: 'item-1', ticker: 'AAPL', conviction: 5, confidence: null, notes: '@note',
        thesis: '-thesis', target_price: null, invalidation_conditions: null,
        review_at: null, tags: ['=tag'], status: 'watching', decision_version: 0,
      }],
    } as never], []);
    const output = portableWatchlistCsv(bundle);
    expect(output).toContain('"\'=CMD()"');
    expect(output).toContain('"\'+description"');
    expect(output).toContain('"\'-thesis"');
    expect(output).toContain('"\'@note"');
  });
});
