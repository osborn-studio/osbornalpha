import { parseWatchlistGroups } from './store';
import type { VersionedWatchlistSnapshot } from './sync';
import type {
  PortableWatchlistFormat,
  WatchlistImportMode,
  WatchlistImportPreview,
} from './portable-import';

export interface PortableWatchlistImportCommand {
  content: string;
  format: PortableWatchlistFormat;
  mode: WatchlistImportMode;
}

export interface PortableWatchlistImportResult {
  preview: WatchlistImportPreview;
  result: unknown;
  snapshot: VersionedWatchlistSnapshot;
}

export class WatchlistImportClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly tickers: string[] = [],
  ) {
    super(code);
    this.name = 'WatchlistImportClientError';
  }
}

export function detectPortableWatchlistFormat(content: string, fileName = ''): PortableWatchlistFormat | null {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'yaml' || extension === 'yml') return 'yaml';
  const firstLine = content.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? '';
  if (extension === 'csv' && firstLine.includes('decision_version') && firstLine.includes('alerts_json')) return 'csv';
  if (/^\s*format_(?:version)|^\s*formatVersion\s*:/m.test(content) && /(?:^|\n)\s*groups\s*:/m.test(content)) return 'yaml';
  if (firstLine.includes('decision_version') && firstLine.includes('alerts_json')) return 'csv';
  return null;
}

function parsePreview(value: unknown): WatchlistImportPreview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const preview = value as Record<string, unknown>;
  if (preview.mode !== 'merge' && preview.mode !== 'replace') return null;
  for (const key of ['groups', 'items', 'alerts'] as const) {
    const counts = preview[key];
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null;
    const record = counts as Record<string, unknown>;
    if (['incoming', 'create', 'update', 'remove'].some((field) => !Number.isSafeInteger(record[field]) || Number(record[field]) < 0)) return null;
  }
  return preview as unknown as WatchlistImportPreview;
}

function parseSnapshot(value: unknown): VersionedWatchlistSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.ownerId !== 'string' || !Number.isSafeInteger(snapshot.version) || Number(snapshot.version) < 0) return null;
  const groups = parseWatchlistGroups(JSON.stringify(snapshot.groups));
  return groups ? { ownerId: snapshot.ownerId, version: Number(snapshot.version), groups } : null;
}

async function postImport(command: PortableWatchlistImportCommand, dryRun: boolean, mutationId?: string) {
  const response = await fetch('/api/watchlist/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...command, dryRun, mutationId: dryRun ? null : mutationId }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WatchlistImportClientError(
      typeof body?.error === 'string' ? body.error : 'watchlist_import_failed',
      response.status,
      Array.isArray(body?.tickers) ? body.tickers.filter((ticker: unknown): ticker is string => typeof ticker === 'string') : [],
    );
  }
  return body;
}

export async function previewPortableWatchlistImport(command: PortableWatchlistImportCommand) {
  const body = await postImport(command, true);
  const preview = parsePreview(body?.preview);
  if (!preview) throw new WatchlistImportClientError('invalid_watchlist_import_response', 502);
  return preview;
}

export async function executePortableWatchlistImport(
  command: PortableWatchlistImportCommand,
  mutationId: string,
): Promise<PortableWatchlistImportResult> {
  const body = await postImport(command, false, mutationId);
  const preview = parsePreview(body?.preview);
  const snapshot = parseSnapshot(body?.snapshot);
  if (!preview || !snapshot) throw new WatchlistImportClientError('invalid_watchlist_import_response', 502);
  return { preview, result: body.result, snapshot };
}
