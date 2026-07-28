import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('incurred LLM budget migration', () => {
  const sql = readFileSync(join(
    process.cwd(),
    'supabase/migrations/20260728110000_llm_incurred_budget.sql',
  ), 'utf8').toLowerCase();

  it('adds incurred state and a service-role-only mark RPC', () => {
    expect(sql).toContain("'incurred'");
    expect(sql).toContain('create or replace function public.mark_llm_budget_incurred');
    expect(sql).toContain('security definer');
    expect(sql).toContain('grant execute on function public.mark_llm_budget_incurred(uuid)');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('from public, anon, authenticated');
  });

  it('counts incurred reservations regardless of expiration and never releases them', () => {
    expect(sql).toMatch(/when r\.status = 'incurred' then r\.reserved_micrormb/);
    expect(sql).toMatch(/if v_reservation\.status = 'reserved' then[\s\S]*status = 'released'/);
    expect(sql).toMatch(/if v_reservation\.status = 'reserved' then[\s\S]*llm cost reservation is not incurred/);
    expect(sql).toMatch(/if v_reservation\.status = 'incurred' then[\s\S]*status = 'settled'/);
  });
});
