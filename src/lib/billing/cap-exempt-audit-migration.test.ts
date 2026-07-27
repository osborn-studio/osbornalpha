import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cap-exempt platform audit migration', () => {
  const sql = readFileSync(join(
    process.cwd(),
    'supabase/migrations/20260728140000_cap_exempt_platform_audit.sql',
  ), 'utf8').toLowerCase();

  it('adds durable cap-exempt identity and audit indexes', () => {
    expect(sql).toContain('cap_exempt boolean not null default false');
    expect(sql).toContain('cap_exempt_idempotency_key uuid');
    expect(sql).toContain('cap_exempt_snapshot jsonb');
    expect(sql).toContain('llm_cost_reservations_cap_exempt_idempotency_idx');
    expect(sql).toContain('llm_cost_reservations_cap_exempt_created_idx');
  });

  it('creates an incurred audit before network with exact retry conflicts', () => {
    expect(sql).toContain('create or replace function public.create_cap_exempt_llm_audit(');
    expect(sql).toContain("status,\n    expires_at,\n    cap_exempt");
    expect(sql).toContain("'incurred'");
    expect(sql).toContain('cap-exempt audit retry conflict');
  });

  it('excludes cap-exempt rows from the daily limit without deleting their audit', () => {
    expect(sql).toMatch(
      /create or replace function public\.reserve_llm_daily_budget\([\s\S]+and not r\.cap_exempt/,
    );
  });

  it('indexes stale usage reconciliation with its exact predicate and order', () => {
    expect(sql).toContain('usage_events_pending_reconcile_idx');
    expect(sql).toContain("on public.usage_events (created_at, id)\n  where status = 'pending'");
  });
});
