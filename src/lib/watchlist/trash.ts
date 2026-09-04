export type WatchlistTrashEntityType = 'group' | 'item';

export interface WatchlistTrashEntry {
  id: string;
  entity_type: WatchlistTrashEntityType;
  source_id: string;
  label: string;
  deleted_at: string;
  expires_at: string;
}

export interface RestoreWatchlistTrashCommand {
  expectedVersion: number;
  mutationId: string;
}

export function parseRestoreWatchlistTrashCommand(value: unknown): RestoreWatchlistTrashCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0) return null;
  if (typeof input.mutationId !== 'string') return null;
  const mutationId = input.mutationId.trim();
  if (mutationId.length < 8 || mutationId.length > 128) return null;
  return { expectedVersion: Number(input.expectedVersion), mutationId };
}
