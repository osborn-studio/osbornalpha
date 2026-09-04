import type { WatchlistGroup } from './store';
import type { WatchlistAlert } from '@/lib/supabase/database.types';
import type { WatchlistOverviewGroupRow } from './overview-contract';

// JSON strings are valid YAML scalars and safely cover quotes, newlines, and Unicode.
export function serializeWatchlistYaml(groups: WatchlistGroup[]): string {
  const lines = ['# osbornalpha watchlist', 'version: 2', 'groups:'];
  groups.forEach((group) => {
    lines.push(`  - id: ${JSON.stringify(group.id)}`);
    lines.push(`    name: ${JSON.stringify(group.name)}`);
    lines.push('    tickers:');
    group.tickers.forEach((ticker) => lines.push(`      - ${JSON.stringify(ticker)}`));
  });
  return `${lines.join('\n')}\n`;
}

export function watchlistCsv(groups: WatchlistGroup[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return ['group,ticker', ...groups.flatMap((group) => group.tickers.map((ticker) => `${escape(group.name)},${escape(ticker)}`))].join('\r\n');
}

export interface PortableWatchlistAlert {
  alertType: WatchlistAlert['alert_type'];
  operator: WatchlistAlert['operator'];
  threshold: number | null;
  config: Record<string, unknown>;
  enabled: boolean;
  cooldownMinutes: number;
}

export interface PortableWatchlistItem {
  ticker: string;
  conviction: number;
  notes: string | null;
  thesis: string | null;
  targetPrice: number | null;
  invalidationConditions: string | null;
  confidence: number | null;
  reviewAt: string | null;
  tags: string[];
  status: string;
  decisionVersion: number;
  alerts: PortableWatchlistAlert[];
}

export interface PortableWatchlistBundle {
  formatVersion: 3;
  exportedAt: string;
  groups: Array<{
    name: string;
    description: string | null;
    items: PortableWatchlistItem[];
  }>;
}

export function buildPortableWatchlistBundle(
  groups: WatchlistOverviewGroupRow[],
  alerts: WatchlistAlert[],
  exportedAt = new Date().toISOString(),
): PortableWatchlistBundle {
  const alertsByItem = new Map<string, WatchlistAlert[]>();
  for (const alert of alerts) {
    alertsByItem.set(alert.watchlist_item_id, [...(alertsByItem.get(alert.watchlist_item_id) ?? []), alert]);
  }
  return {
    formatVersion: 3,
    exportedAt,
    groups: groups.map((group) => ({
      name: group.name,
      description: group.description,
      items: group.watchlist_items.map((item) => ({
        ticker: item.ticker,
        conviction: item.conviction,
        notes: item.notes,
        thesis: item.thesis,
        targetPrice: item.target_price,
        invalidationConditions: item.invalidation_conditions,
        confidence: item.confidence,
        reviewAt: item.review_at,
        tags: item.tags,
        status: item.status,
        decisionVersion: item.decision_version,
        alerts: (alertsByItem.get(item.id) ?? []).map((alert) => ({
          alertType: alert.alert_type,
          operator: alert.operator,
          threshold: alert.threshold_numeric,
          config: alert.config,
          enabled: alert.enabled,
          cooldownMinutes: alert.cooldown_minutes,
        })),
      })),
    })),
  };
}

function yamlScalar(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function csvSafeValue(value: unknown): unknown {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function portableWatchlistYaml(bundle: PortableWatchlistBundle): string {
  const lines = [
    '# osbornalpha portable watchlist',
    `format_version: ${bundle.formatVersion}`,
    `exported_at: ${yamlScalar(bundle.exportedAt)}`,
    'groups:',
  ];
  for (const group of bundle.groups) {
    lines.push(`  - name: ${yamlScalar(group.name)}`);
    lines.push(`    description: ${yamlScalar(group.description)}`);
    lines.push('    items:');
    for (const item of group.items) {
      lines.push(`      - ticker: ${yamlScalar(item.ticker)}`);
      lines.push(`        status: ${yamlScalar(item.status)}`);
      lines.push(`        conviction: ${item.conviction}`);
      lines.push(`        confidence: ${yamlScalar(item.confidence)}`);
      lines.push(`        target_price: ${yamlScalar(item.targetPrice)}`);
      lines.push(`        review_at: ${yamlScalar(item.reviewAt)}`);
      lines.push(`        tags: ${yamlScalar(item.tags)}`);
      lines.push(`        thesis: ${yamlScalar(item.thesis)}`);
      lines.push(`        notes: ${yamlScalar(item.notes)}`);
      lines.push(`        invalidation_conditions: ${yamlScalar(item.invalidationConditions)}`);
      lines.push(`        decision_version: ${item.decisionVersion}`);
      lines.push(`        alerts: ${yamlScalar(item.alerts)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function portableWatchlistCsv(bundle: PortableWatchlistBundle): string {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = [
    'group', 'group_description', 'ticker', 'status', 'conviction', 'confidence', 'target_price', 'review_at',
    'tags', 'thesis', 'notes', 'invalidation_conditions', 'decision_version', 'alerts_json',
  ];
  const rows = bundle.groups.flatMap((group) => group.items.map((item) => [
    group.name, group.description, item.ticker, item.status, item.conviction, item.confidence, item.targetPrice,
    item.reviewAt, item.tags.join('|'), item.thesis, item.notes, item.invalidationConditions,
    item.decisionVersion, JSON.stringify(item.alerts),
  ].map(csvSafeValue).map(escape).join(',')));
  return [header.join(','), ...rows].join('\r\n');
}
