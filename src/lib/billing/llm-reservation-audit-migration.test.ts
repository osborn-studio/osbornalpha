import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('durable LLM reservation usage audit migration', () => {
  const sql = readFileSync(join(
    process.cwd(),
    'supabase/migrations/20260728120000_llm_reservation_usage_audit.sql',
  ), 'utf8').toLowerCase();

  it('stores normalized token/cache/pricing fields on reservation rows', () => {
    for (const field of [
      'input_tokens',
      'cache_hit_input_tokens',
      'cache_miss_input_tokens',
      'output_tokens',
      'pricing_version',
      'usd_cny_micros',
      'usage_estimated',
    ]) {
      expect(sql).toContain(`add column if not exists ${field}`);
    }
  });

  it('settles cost and normalized usage in one atomic row update', () => {
    expect(sql).toContain('create or replace function public.settle_llm_budget(');
    expect(sql).toContain('p_cache_hit_input_tokens bigint');
    expect(sql).toContain('p_pricing_version text');
    expect(sql).toMatch(/update public\.llm_cost_reservations[\s\S]+settled_micrormb = p_actual_micrormb[\s\S]+input_tokens = p_input_tokens[\s\S]+status = 'settled'/);
  });

  it('persists the conservative audit in the same transition that marks spend incurred', () => {
    expect(sql).toContain('create or replace function public.mark_llm_budget_incurred(');
    expect(sql).toMatch(
      /update public\.llm_cost_reservations[\s\S]+status = 'incurred'[\s\S]+input_tokens = p_input_tokens[\s\S]+pricing_version = pg_catalog\.btrim\(p_pricing_version\)/,
    );
    expect(sql).toContain('incurred reservation audit snapshot mismatch');
  });

  it('supports durable conservative finalization and trusted idempotent aggregate audit', () => {
    expect(sql).toContain('create or replace function public.finalize_llm_budget_incurred(');
    expect(sql).toContain('create unique index if not exists usage_events_idempotency_key_idx');
    expect(sql).toContain('create or replace function public.record_usage_event(');
    expect(sql).toContain('on conflict (idempotency_key) do nothing');
  });
});
