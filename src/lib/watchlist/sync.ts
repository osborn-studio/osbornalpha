// Pure mapping logic for watchlist server sync (W1 data-loss fix).
// Server shape: watchlists rows with nested watchlist_items.
// Client shape: WatchlistGroup[] (id/name/tickers) — ids are server uuids once
// synced, but may be local slugs (e.g. 'long_hold') before first sync.

import { defaultWatchlistGroups, parseWatchlistGroups, type WatchlistGroup } from './store';

export const MAX_GROUPS = 50;
export const MAX_TICKERS_PER_GROUP = 200;

export interface VersionedWatchlistSnapshot {
  ownerId: string;
  version: number;
  groups: WatchlistGroup[];
}

export interface WatchlistSyncRequest {
  groups: WatchlistGroup[];
  expectedVersion: number;
  mutationId: string;
}

function normalizedGroup(group: WatchlistGroup): WatchlistGroup {
  return {
    ...group,
    name: group.name.trim(),
    tickers: [...new Set(group.tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))],
  };
}

function groupNameKey(group: WatchlistGroup): string | null {
  const name = group.name.trim().toLocaleLowerCase();
  return name || null;
}

function findGroup(groups: WatchlistGroup[], reference: WatchlistGroup): WatchlistGroup | undefined {
  return groups.find((group) => group.id === reference.id)
    ?? (groupNameKey(reference) ? groups.find((group) => groupNameKey(group) === groupNameKey(reference)) : undefined);
}

function sameGroup(left: WatchlistGroup, right: WatchlistGroup): boolean {
  const a = normalizedGroup(left);
  const b = normalizedGroup(right);
  return a.name === b.name && a.tickers.length === b.tickers.length
    && a.tickers.every((ticker) => b.tickers.includes(ticker));
}

function mergeTickerSets(local: string[], server: string[], base?: string[]): string[] {
  const normalize = (values: string[]) => [...new Set(values.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  const localValues = normalize(local);
  const serverValues = normalize(server);
  if (!base) return [...serverValues, ...localValues.filter((ticker) => !serverValues.includes(ticker))];
  const baseSet = new Set(normalize(base));
  const localSet = new Set(localValues);
  const serverSet = new Set(serverValues);
  return [
    ...serverValues.filter((ticker) => !baseSet.has(ticker) || localSet.has(ticker)),
    ...localValues.filter((ticker) => !serverSet.has(ticker) && !baseSet.has(ticker)),
  ];
}

export function parseWatchlistSyncRequest(body: unknown): WatchlistSyncRequest | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;
  if (!Array.isArray(candidate.groups)) return null;
  if (!Number.isSafeInteger(candidate.expectedVersion) || Number(candidate.expectedVersion) < 0) return null;
  if (typeof candidate.mutationId !== 'string') return null;
  const mutationId = candidate.mutationId.trim();
  if (mutationId.length < 8 || mutationId.length > 128) return null;

  const groups = candidate.groups.length === 0
    ? []
    : parseWatchlistGroups(JSON.stringify(candidate.groups));
  if (groups === null) return null;
  return { groups, expectedVersion: Number(candidate.expectedVersion), mutationId };
}

export function isWatchlistVersionConflict(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '40001' || error?.message === 'watchlist_version_conflict';
}

/**
 * Non-destructive conflict merge for two client snapshots. Groups are matched
 * by server id first and then by a case-insensitive name. Tickers are unioned
 * in server order followed by local additions, so concurrent additions are
 * preserved. With a common base, deletions win over an unchanged copy while
 * a group edited on the other side is retained conservatively.
 */
export function mergeWatchlistGroups(
  local: WatchlistGroup[],
  server: WatchlistGroup[],
  base?: WatchlistGroup[] | null,
): WatchlistGroup[] {
  const localGroups = local.map(normalizedGroup);
  const serverGroups = server.map(normalizedGroup);
  const baseGroups = base?.map(normalizedGroup) ?? null;
  const merged: WatchlistGroup[] = [];
  const usedLocal = new Set<string>();

  for (const serverGroup of serverGroups) {
    const localGroup = findGroup(localGroups, serverGroup);
    const baseGroup = baseGroups ? findGroup(baseGroups, serverGroup) : undefined;
    if (localGroup) usedLocal.add(localGroup.id);
    if (!localGroup && baseGroup && sameGroup(serverGroup, baseGroup)) continue;
    if (!localGroup) {
      merged.push(serverGroup);
      continue;
    }
    const localRenamed = !!baseGroup && localGroup.name !== baseGroup.name;
    const serverRenamed = !!baseGroup && serverGroup.name !== baseGroup.name;
    merged.push({
      ...serverGroup,
      name: localRenamed && !serverRenamed ? localGroup.name
        : serverRenamed && !localRenamed ? serverGroup.name
          : localGroup.name || serverGroup.name,
      tickers: mergeTickerSets(localGroup.tickers, serverGroup.tickers, baseGroup?.tickers),
    });
  }

  for (const localGroup of localGroups) {
    if (usedLocal.has(localGroup.id)) continue;
    const baseGroup = baseGroups ? findGroup(baseGroups, localGroup) : undefined;
    const serverGroup = findGroup(serverGroups, localGroup);
    if (serverGroup) continue;
    if (baseGroup && sameGroup(localGroup, baseGroup)) continue;
    merged.push(localGroup);
  }
  return merged;
}

export interface ServerWatchlistItem {
  ticker: string;
  sort_order: number;
}

export interface ServerWatchlistRow {
  id: string;
  name: string;
  sort_order: number;
  watchlist_items: ServerWatchlistItem[];
}

export function serverToGroups(rows: ServerWatchlistRow[]): WatchlistGroup[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.id,
      name: r.name,
      tickers: Array.from(
        new Set(
          [...(r.watchlist_items ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((i) => i.ticker.trim().toUpperCase())
            .filter(Boolean),
        ),
      ),
    }));
}

export interface GroupUpsert {
  serverId: string | undefined;
  name: string;
  sort_order: number;
}

export interface GroupItems {
  serverId: string | undefined;
  tickers: string[];
}

export interface WatchlistMutations {
  deleteIds: string[];
  upserts: GroupUpsert[];
  itemsByGroup: GroupItems[];
}

/**
 * Replace-all diff: match incoming groups to server rows by id first, then by
 * name; unmatched server rows are deleted. Incoming order becomes sort_order.
 */
export function groupsToMutations(
  current: ServerWatchlistRow[],
  incoming: WatchlistGroup[],
): WatchlistMutations {
  const capped = incoming.slice(0, MAX_GROUPS);
  const byId = new Map(current.map((r) => [r.id, r]));
  const byName = new Map(current.map((r) => [r.name, r]));
  const matched = new Set<string>();

  const upserts: GroupUpsert[] = [];
  const itemsByGroup: GroupItems[] = [];

  capped.forEach((g, idx) => {
    const match =
      (byId.has(g.id) ? byId.get(g.id) : undefined) ??
      (byName.has(g.name) && !matched.has(byName.get(g.name)!.id) ? byName.get(g.name) : undefined);
    if (match) matched.add(match.id);

    const tickers = Array.from(
      new Set(g.tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
    ).slice(0, MAX_TICKERS_PER_GROUP);

    upserts.push({ serverId: match?.id, name: g.name, sort_order: idx });
    itemsByGroup.push({ serverId: match?.id, tickers });
  });

  const deleteIds = current.filter((r) => !matched.has(r.id)).map((r) => r.id);
  return { deleteIds, upserts, itemsByGroup };
}

/** True only when groups are exactly the untouched mock defaults (order-insensitive). */
export function isDefaultWatchlist(groups: WatchlistGroup[]): boolean {
  const defaults = defaultWatchlistGroups();
  if (groups.length !== defaults.length || groups.length === 0) return false;
  const key = (g: WatchlistGroup) => `${g.id}|${g.name}|${g.tickers.join(',')}`;
  const a = groups.map(key).sort();
  const b = defaults.map(key).sort();
  return a.every((k, i) => k === b[i]);
}
