import type { SecuritySearchRow } from '@/lib/supabase/database.types';

interface SecuritySearchClient {
  rpc: (
    fn: 'search_securities',
    args: { p_query: string; p_limit: number },
  ) => PromiseLike<{ data: SecuritySearchRow[] | null; error: unknown }>;
}

export class SecurityMasterUnavailableError extends Error {
  readonly code = 'security_master_unavailable';

  constructor() {
    super('Security master is unavailable.');
    this.name = 'SecurityMasterUnavailableError';
  }
}

export async function searchSecurities(
  client: SecuritySearchClient,
  query: string,
  limit: number,
): Promise<SecuritySearchRow[]> {
  const { data, error } = await client.rpc('search_securities', {
    p_query: query,
    p_limit: limit,
  });
  if (error || !data) throw new SecurityMasterUnavailableError();
  return data.map((row) => ({
    t: row.t,
    n: row.n,
    py: row.py ?? '',
    m: row.m,
    asset_type: row.asset_type,
    exchange: row.exchange,
    list_status: row.list_status,
    match_kind: row.match_kind,
    verification_status: row.verification_status,
    selectable: row.selectable,
  }));
}
