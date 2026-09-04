import { describe, expect, it } from 'vitest';
import { portableWatchlistCsv, portableWatchlistYaml, type PortableWatchlistBundle } from './export';
import {
  buildWatchlistImportPreview,
  normalizePortableWatchlistBundle,
  parsePortableWatchlistSource,
  portableWatchlistBundleForRpc,
} from './portable-import';

const bundle: PortableWatchlistBundle = {
  formatVersion: 3,
  exportedAt: '2026-09-04T12:00:00.000Z',
  groups: [{
    name: '=Core',
    description: '+Long term',
    items: [{
      ticker: 'AAPL',
      conviction: 8,
      confidence: 75,
      targetPrice: 240,
      reviewAt: '2026-10-01T00:00:00.000Z',
      tags: ['=compounder', 'us'],
      thesis: '-Services growth',
      notes: '@Review margins',
      invalidationConditions: 'Margin decline',
      status: 'watching',
      decisionVersion: 3,
      alerts: [{
        alertType: 'price', operator: 'crosses_above', threshold: 220,
        config: {}, enabled: true, cooldownMinutes: 60,
      }],
    }],
  }],
};

describe('portable watchlist import', () => {
  it('round-trips the complete YAML export', () => {
    const parsed = parsePortableWatchlistSource(portableWatchlistYaml(bundle), 'yaml');
    expect(parsed).toEqual({ ok: true, bundle });
  });

  it('round-trips the complete CSV export and removes formula guards', () => {
    const parsed = parsePortableWatchlistSource(portableWatchlistCsv(bundle), 'csv');
    expect(parsed).toEqual({ ok: true, bundle: { ...bundle, exportedAt: new Date(0).toISOString() } });
  });

  it('rejects duplicate tickers and invalid alert rules', () => {
    expect(normalizePortableWatchlistBundle({
      formatVersion: 3,
      groups: [
        bundle.groups[0],
        { name: 'Other', items: [{ ...bundle.groups[0].items[0] }] },
      ],
    })).toEqual({ ok: false, error: 'duplicate_portable_watchlist_ticker' });
    expect(normalizePortableWatchlistBundle({
      formatVersion: 3,
      groups: [{ name: 'Core', items: [{
        ...bundle.groups[0].items[0],
        alerts: [{ alertType: 'price', operator: null, threshold: null }],
      }] }],
    })).toEqual({ ok: false, error: 'invalid_portable_watchlist_item' });
  });

  it('builds merge and replace previews without mutating inputs', () => {
    const currentGroups = [{
      id: 'group-1', name: '=Core', description: null, sort_order: 0,
      watchlist_items: [{ id: 'item-1', ticker: 'AAPL' }],
    }] as never;
    const currentAlerts = [{
      id: 'alert-1', watchlist_item_id: 'item-1', alert_type: 'price',
      operator: 'crosses_above', threshold_numeric: 220, config: {},
    }] as never;
    expect(buildWatchlistImportPreview(bundle, currentGroups, currentAlerts, 'merge')).toMatchObject({
      groups: { create: 0, update: 1, remove: 0 },
      items: { create: 0, update: 1, remove: 0 },
      alerts: { create: 0, update: 1, remove: 0 },
    });
    expect(buildWatchlistImportPreview(bundle, currentGroups, currentAlerts, 'replace')).toMatchObject({
      groups: { create: 1, update: 0, remove: 1 },
      items: { create: 1, update: 0, remove: 1 },
      alerts: { create: 1, update: 0, remove: 1 },
    });
  });

  it('maps the normalized bundle to the SQL contract', () => {
    expect(portableWatchlistBundleForRpc(bundle).groups[0].items[0]).toMatchObject({
      ticker: 'AAPL',
      target_price: 240,
      decision_version: 3,
      alerts: [{ alert_type: 'price', threshold_numeric: 220 }],
    });
  });
});
