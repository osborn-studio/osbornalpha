import type { WatchlistServerClient } from './server-repository';
import type { RestoreWatchlistTrashCommand, WatchlistTrashEntry } from './trash';

interface RepositoryError { code?: string; message: string }

export async function listWatchlistTrash(client: WatchlistServerClient, userId: string) {
  const repository = client as unknown as {
    from(table: 'watchlist_trash'): {
      select(columns: string): {
        eq(column: 'user_id', value: string): {
          is(column: 'restored_at', value: null): {
            gt(column: 'expires_at', value: string): {
              order(column: 'deleted_at', options: { ascending: false }): {
                limit(value: number): Promise<{ data: WatchlistTrashEntry[] | null; error: RepositoryError | null }>;
              };
            };
          };
        };
      };
    };
  };
  return repository.from('watchlist_trash')
    .select('id,entity_type,source_id,label,deleted_at,expires_at')
    .eq('user_id', userId)
    .is('restored_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('deleted_at', { ascending: false })
    .limit(100);
}

export async function restoreWatchlistTrash(
  client: WatchlistServerClient,
  trashId: string,
  command: RestoreWatchlistTrashCommand,
) {
  const repository = client as unknown as {
    rpc(name: 'restore_watchlist_trash', args: {
      p_trash_id: string;
      p_expected_version: number;
      p_mutation_id: string;
    }): Promise<{
      data: Array<{ version: number; applied: boolean; restored_items: number }> | null;
      error: RepositoryError | null;
    }>;
  };
  const { data, error } = await repository.rpc('restore_watchlist_trash', {
    p_trash_id: trashId,
    p_expected_version: command.expectedVersion,
    p_mutation_id: command.mutationId,
  });
  return { data: data?.[0] ?? null, error };
}

export async function permanentlyDeleteWatchlistTrash(
  client: WatchlistServerClient,
  userId: string,
  trashId: string,
) {
  const repository = client as unknown as {
    from(table: 'watchlist_trash'): {
      delete(): {
        eq(column: 'id', value: string): {
          eq(column: 'user_id', value: string): Promise<{ error: RepositoryError | null }>;
        };
      };
    };
  };
  return repository.from('watchlist_trash').delete().eq('id', trashId).eq('user_id', userId);
}
