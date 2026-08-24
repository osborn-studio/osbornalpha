import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('durable usage run lifecycle migration', () => {
  const sql = readFileSync(join(
    process.cwd(),
    'supabase/migrations/20260728130000_usage_run_lifecycle.sql',
  ), 'utf8').toLowerCase();

  it('adds pending lifecycle state and immutable begin identity', () => {
    expect(sql).toContain("status in ('pending', 'completed', 'failed')");
    expect(sql).toContain('create or replace function public.begin_usage_run(');
    expect(sql).toContain('usage run begin conflict');
  });

  it('finalizes only pending rows and validates exact terminal retries', () => {
    expect(sql).toContain('create or replace function public.finalize_usage_run(');
    expect(sql).toContain("status = p_status");
    expect(sql).toContain('usage run finalize conflict');
  });

  it('provides deterministic stale pending reconciliation', () => {
    expect(sql).toContain('create or replace function public.fail_stale_usage_runs(');
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('perform public.fail_stale_usage_runs(900, 100)');
  });
});
