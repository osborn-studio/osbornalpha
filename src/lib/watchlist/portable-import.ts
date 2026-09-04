import { parse as parseCsv } from 'csv-parse/sync';
import { parse as parseYaml } from 'yaml';
import type { WatchlistAlert } from '@/lib/supabase/database.types';
import { parseCreateWatchlistAlert } from './alerts';
import { parseWatchlistDecisionPatch } from './decision';
import type { PortableWatchlistAlert, PortableWatchlistBundle, PortableWatchlistItem } from './export';
import type { WatchlistOverviewGroupRow } from './overview-contract';
import { canonicalizeSecurityTicker } from './security-validation';
import { MAX_GROUPS, MAX_TICKERS_PER_GROUP } from './sync';

export type PortableWatchlistFormat = 'yaml' | 'csv';
export type WatchlistImportMode = 'merge' | 'replace';

export type PortableWatchlistParseResult =
  | { ok: true; bundle: PortableWatchlistBundle }
  | { ok: false; error: string };

export interface WatchlistImportPreview {
  mode: WatchlistImportMode;
  groups: { incoming: number; create: number; update: number; remove: number };
  items: { incoming: number; create: number; update: number; remove: number };
  alerts: { incoming: number; create: number; update: number; remove: number };
}

interface CsvPortableRow {
  group?: string;
  group_description?: string;
  ticker?: string;
  status?: string;
  conviction?: string;
  confidence?: string;
  target_price?: string;
  review_at?: string;
  tags?: string;
  thesis?: string;
  notes?: string;
  invalidation_conditions?: string;
  decision_version?: string;
  alerts_json?: string;
}

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_ALERTS_PER_ITEM = 100;

function csvText(value: string | undefined): string {
  if (!value) return '';
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function nullableCsvText(value: string | undefined): string | null {
  const normalized = csvText(value);
  return normalized === '' ? null : normalized;
}

function csvNumber(value: string | undefined, fallback: number | null): number | null {
  const normalized = csvText(value).trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function csvAlerts(value: string | undefined): unknown {
  const normalized = csvText(value).trim();
  if (!normalized) return [];
  try { return JSON.parse(normalized); } catch { return null; }
}

function csvToPortableShape(source: string): unknown {
  const rows = parseCsv(source, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as CsvPortableRow[];
  if (rows.length === 0) return null;
  const groups = new Map<string, { name: string; description: string | null; items: unknown[] }>();
  for (const row of rows) {
    const name = csvText(row.group).trim();
    if (!name || !row.ticker) return null;
    const description = nullableCsvText(row.group_description);
    const current = groups.get(name) ?? { name, description, items: [] };
    if (current.description !== description && description !== null) return null;
    current.description ??= description;
    current.items.push({
      ticker: csvText(row.ticker),
      status: csvText(row.status),
      conviction: csvNumber(row.conviction, 5),
      confidence: csvNumber(row.confidence, null),
      targetPrice: csvNumber(row.target_price, null),
      reviewAt: nullableCsvText(row.review_at),
      tags: csvText(row.tags).split('|').filter(Boolean),
      thesis: nullableCsvText(row.thesis),
      notes: nullableCsvText(row.notes),
      invalidationConditions: nullableCsvText(row.invalidation_conditions),
      decisionVersion: csvNumber(row.decision_version, 0),
      alerts: csvAlerts(row.alerts_json),
    });
    groups.set(name, current);
  }
  return { formatVersion: 3, groups: [...groups.values()] };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function field(input: Record<string, unknown>, camel: string, snake: string = camel): unknown {
  return input[camel] ?? input[snake];
}

function normalizeAlert(value: unknown): PortableWatchlistAlert | null {
  const input = objectValue(value);
  if (!input) return null;
  const parsed = parseCreateWatchlistAlert({
    itemId: 'portable-import',
    alertType: field(input, 'alertType', 'alert_type'),
    operator: field(input, 'operator'),
    threshold: field(input, 'threshold', 'threshold_numeric'),
    config: field(input, 'config') ?? {},
    enabled: field(input, 'enabled'),
    cooldownMinutes: field(input, 'cooldownMinutes', 'cooldown_minutes'),
  });
  return parsed ? {
    alertType: parsed.alert_type,
    operator: parsed.operator,
    threshold: parsed.threshold_numeric,
    config: parsed.config,
    enabled: parsed.enabled,
    cooldownMinutes: parsed.cooldown_minutes,
  } : null;
}

function normalizeItem(value: unknown): PortableWatchlistItem | null {
  const input = objectValue(value);
  if (!input) return null;
  const tickerValue = field(input, 'ticker');
  const ticker = typeof tickerValue === 'string' ? canonicalizeSecurityTicker(tickerValue) : null;
  if (!ticker) return null;
  const decision = parseWatchlistDecisionPatch({
    conviction: field(input, 'conviction'),
    notes: field(input, 'notes') ?? null,
    thesis: field(input, 'thesis') ?? null,
    targetPrice: field(input, 'targetPrice', 'target_price') ?? null,
    invalidationConditions: field(input, 'invalidationConditions', 'invalidation_conditions') ?? null,
    confidence: field(input, 'confidence') ?? null,
    reviewAt: field(input, 'reviewAt', 'review_at') ?? null,
    tags: field(input, 'tags') ?? [],
    status: field(input, 'status'),
  });
  const decisionVersion = field(input, 'decisionVersion', 'decision_version');
  const alerts = field(input, 'alerts') ?? [];
  if (!decision
    || !Number.isInteger(decisionVersion)
    || Number(decisionVersion) < 0
    || Number(decisionVersion) > 2_147_483_646
    || !Array.isArray(alerts)
    || alerts.length > MAX_ALERTS_PER_ITEM) return null;
  const normalizedAlerts = alerts.map(normalizeAlert);
  if (normalizedAlerts.some((alert) => alert === null)) return null;
  return {
    ticker,
    conviction: decision.conviction ?? 5,
    notes: decision.notes ?? null,
    thesis: decision.thesis ?? null,
    targetPrice: decision.target_price ?? null,
    invalidationConditions: decision.invalidation_conditions ?? null,
    confidence: decision.confidence ?? null,
    reviewAt: decision.review_at ?? null,
    tags: decision.tags ?? [],
    status: decision.status ?? 'watching',
    decisionVersion: Number(decisionVersion),
    alerts: normalizedAlerts as PortableWatchlistAlert[],
  };
}

export function normalizePortableWatchlistBundle(value: unknown): PortableWatchlistParseResult {
  const input = objectValue(value);
  const version = input ? field(input, 'formatVersion', 'format_version') : null;
  const groups = input ? field(input, 'groups') : null;
  if (Number(version) !== 3 || !Array.isArray(groups) || groups.length < 1 || groups.length > MAX_GROUPS) {
    return { ok: false, error: 'invalid_portable_watchlist' };
  }
  const names = new Set<string>();
  const tickers = new Set<string>();
  const normalizedGroups: PortableWatchlistBundle['groups'] = [];
  for (const groupValue of groups) {
    const group = objectValue(groupValue);
    const nameValue = group ? field(group, 'name') : null;
    const name = typeof nameValue === 'string' ? nameValue.trim() : '';
    const descriptionValue = group ? field(group, 'description') : null;
    const description = descriptionValue == null ? null : typeof descriptionValue === 'string' ? descriptionValue.trim() || null : undefined;
    const items = group ? field(group, 'items') : null;
    if (!name || name.length > 80 || description === undefined || (description?.length ?? 0) > 500
      || names.has(name) || !Array.isArray(items) || items.length > MAX_TICKERS_PER_GROUP) {
      return { ok: false, error: 'invalid_portable_watchlist_group' };
    }
    names.add(name);
    const normalizedItems = items.map(normalizeItem);
    if (normalizedItems.some((item) => item === null)) {
      return { ok: false, error: 'invalid_portable_watchlist_item' };
    }
    for (const item of normalizedItems as PortableWatchlistItem[]) {
      if (tickers.has(item.ticker)) return { ok: false, error: 'duplicate_portable_watchlist_ticker' };
      tickers.add(item.ticker);
    }
    normalizedGroups.push({ name, description, items: normalizedItems as PortableWatchlistItem[] });
  }
  return {
    ok: true,
    bundle: {
      formatVersion: 3,
      exportedAt: typeof field(input!, 'exportedAt', 'exported_at') === 'string'
        ? String(field(input!, 'exportedAt', 'exported_at'))
        : new Date(0).toISOString(),
      groups: normalizedGroups,
    },
  };
}

export function parsePortableWatchlistSource(
  source: string,
  format: PortableWatchlistFormat,
): PortableWatchlistParseResult {
  if (!source.trim() || Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    return { ok: false, error: 'invalid_portable_watchlist_size' };
  }
  try {
    const parsed = format === 'yaml'
      ? parseYaml(source, { maxAliasCount: 0, schema: 'core' })
      : csvToPortableShape(source);
    return normalizePortableWatchlistBundle(parsed);
  } catch {
    return { ok: false, error: `invalid_portable_watchlist_${format}` };
  }
}

function alertSignature(alert: PortableWatchlistAlert | WatchlistAlert): string {
  const type = 'alertType' in alert ? alert.alertType : alert.alert_type;
  const operator = 'threshold' in alert ? alert.operator : alert.operator;
  const threshold = 'threshold' in alert ? alert.threshold : alert.threshold_numeric;
  return JSON.stringify([type, operator, threshold, alert.config]);
}

export function buildWatchlistImportPreview(
  bundle: PortableWatchlistBundle,
  currentGroups: WatchlistOverviewGroupRow[],
  currentAlerts: WatchlistAlert[],
  mode: WatchlistImportMode,
): WatchlistImportPreview {
  const incomingItems = bundle.groups.flatMap((group) => group.items);
  const currentItems = currentGroups.flatMap((group) => group.watchlist_items);
  if (mode === 'replace') {
    return {
      mode,
      groups: { incoming: bundle.groups.length, create: bundle.groups.length, update: 0, remove: currentGroups.length },
      items: { incoming: incomingItems.length, create: incomingItems.length, update: 0, remove: currentItems.length },
      alerts: {
        incoming: incomingItems.reduce((sum, item) => sum + item.alerts.length, 0),
        create: incomingItems.reduce((sum, item) => sum + item.alerts.length, 0),
        update: 0,
        remove: currentAlerts.length,
      },
    };
  }
  const groupNames = new Set(currentGroups.map((group) => group.name));
  const currentByTicker = new Map(currentItems.map((item) => [item.ticker, item]));
  const alertsByItem = new Map<string, Set<string>>();
  for (const alert of currentAlerts) {
    const signatures = alertsByItem.get(alert.watchlist_item_id) ?? new Set<string>();
    signatures.add(alertSignature(alert));
    alertsByItem.set(alert.watchlist_item_id, signatures);
  }
  let alertsCreate = 0;
  let alertsUpdate = 0;
  for (const item of incomingItems) {
    const existing = currentByTicker.get(item.ticker);
    const signatures = existing ? alertsByItem.get(existing.id) ?? new Set<string>() : new Set<string>();
    for (const alert of item.alerts) {
      if (signatures.has(alertSignature(alert))) alertsUpdate += 1;
      else alertsCreate += 1;
    }
  }
  return {
    mode,
    groups: {
      incoming: bundle.groups.length,
      create: bundle.groups.filter((group) => !groupNames.has(group.name)).length,
      update: bundle.groups.filter((group) => groupNames.has(group.name)).length,
      remove: 0,
    },
    items: {
      incoming: incomingItems.length,
      create: incomingItems.filter((item) => !currentByTicker.has(item.ticker)).length,
      update: incomingItems.filter((item) => currentByTicker.has(item.ticker)).length,
      remove: 0,
    },
    alerts: {
      incoming: incomingItems.reduce((sum, item) => sum + item.alerts.length, 0),
      create: alertsCreate,
      update: alertsUpdate,
      remove: 0,
    },
  };
}

export function portableWatchlistBundleForRpc(bundle: PortableWatchlistBundle) {
  return {
    format_version: bundle.formatVersion,
    groups: bundle.groups.map((group) => ({
      name: group.name,
      description: group.description,
      items: group.items.map((item) => ({
        ticker: item.ticker,
        conviction: item.conviction,
        notes: item.notes,
        thesis: item.thesis,
        target_price: item.targetPrice,
        invalidation_conditions: item.invalidationConditions,
        confidence: item.confidence,
        review_at: item.reviewAt,
        tags: item.tags,
        status: item.status,
        decision_version: item.decisionVersion,
        alerts: item.alerts.map((alert) => ({
          alert_type: alert.alertType,
          operator: alert.operator,
          threshold_numeric: alert.threshold,
          config: alert.config,
          enabled: alert.enabled,
          cooldown_minutes: alert.cooldownMinutes,
        })),
      })),
    })),
  };
}
