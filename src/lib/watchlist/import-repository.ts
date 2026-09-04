import type { WatchlistServerClient } from './server-repository';
import type { PortableWatchlistBundle } from './export';
import {
  portableWatchlistBundleForRpc,
  type WatchlistImportMode,
} from './portable-import';

export interface WatchlistImportResult {
  version: number;
  groupsCreated: number;
  groupsUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  alertsCreated: number;
  alertsUpdated: number;
}

interface ImportRpcRow {
  version: number;
  groups_created: number;
  groups_updated: number;
  items_created: number;
  items_updated: number;
  alerts_created: number;
  alerts_updated: number;
}

interface WatchlistImportClient {
  rpc(
    name: 'import_watchlist_bundle',
    args: {
      p_bundle: ReturnType<typeof portableWatchlistBundleForRpc>;
      p_mode: WatchlistImportMode;
      p_mutation_id: string;
    },
  ): Promise<{
    data: ImportRpcRow[] | null;
    error: { code?: string; message: string } | null;
  }>;
}

export async function importPortableWatchlist(
  client: WatchlistServerClient,
  bundle: PortableWatchlistBundle,
  mode: WatchlistImportMode,
  mutationId: string,
) {
  const { data, error } = await (client as unknown as WatchlistImportClient).rpc(
    'import_watchlist_bundle',
    {
      p_bundle: portableWatchlistBundleForRpc(bundle),
      p_mode: mode,
      p_mutation_id: mutationId,
    },
  );
  const row = data?.[0];
  return {
    data: row ? {
      version: row.version,
      groupsCreated: row.groups_created,
      groupsUpdated: row.groups_updated,
      itemsCreated: row.items_created,
      itemsUpdated: row.items_updated,
      alertsCreated: row.alerts_created,
      alertsUpdated: row.alerts_updated,
    } satisfies WatchlistImportResult : null,
    error,
  };
}
