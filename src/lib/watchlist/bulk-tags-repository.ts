import type { WatchlistItem } from '@/lib/supabase/database.types';
import type { BulkTagCommand } from './bulk-tags';
import type { WatchlistServerClient } from './server-repository';

export async function applyBulkTagCommand(
  client: WatchlistServerClient,
  command: BulkTagCommand,
): Promise<{ data: WatchlistItem[] | null; error: { code?: string; message: string } | null }> {
  // Keep the hand-maintained Supabase compatibility cast at the repository
  // boundary so routes and domain services remain fully typed.
  const repository = client as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: WatchlistItem[] | null;
      error: { code?: string; message: string } | null;
    }>;
  };
  return repository.rpc('bulk_update_watchlist_item_tags', {
    p_items: command.items,
    p_tag: command.tag,
    p_mode: command.mode,
  });
}
