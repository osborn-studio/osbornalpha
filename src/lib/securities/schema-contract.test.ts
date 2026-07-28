import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260715130000_security_master_data.sql',
);

describe('security master migration contract', () => {
  it('defines every table, RPC and storage boundary required by the design', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase();
    const required = [
      'security_aliases',
      'security_universe_memberships',
      'security_sync_runs',
      'security_discovery_candidates',
      'security_sync_staging',
      'security_resolve_rate_limits',
      'search_securities',
      'commit_security_sync',
      'promote_verified_security',
      'consume_security_resolve_quota',
      'security-snapshots',
      'stocks_universe_derive_symbol',
    ];

    for (const token of required) expect(sql).toContain(token);
    expect(sql).toContain('enable row level security');
    expect(sql).toMatch(/grant all on public\.stocks_universe,\s+public\.security_aliases/);
    expect(sql).toContain('grant select on public.watchlist_items to service_role');
    expect(sql).toContain('revoke all on public.security_sync_runs');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path');
    expect(sql).toContain('revoke execute');
  });

  it('keeps the public asset type contract unchanged', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("'stock','etf','convertible_bond','fund','index','unknown'");
    expect(sql).not.toMatch(/asset_type[^\n]*(?:adr|lof|closed_end|reit)/i);
  });
});
