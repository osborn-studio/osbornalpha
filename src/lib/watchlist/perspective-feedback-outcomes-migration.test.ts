import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904320000_perspective_feedback_outcomes.sql', import.meta.url),
  'utf8',
);

describe('perspective feedback and outcomes migration', () => {
  it('keeps feedback user-scoped and evaluation writes service-only', () => {
    expect(migration).toContain('create table if not exists public.perspective_feedback');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('create table if not exists public.perspective_outcomes');
    expect(migration).toContain('create table if not exists public.perspective_evaluation_queue');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain('grant execute on function public.claim_perspective_evaluations(integer) to service_role');
    expect(migration).toContain("values ('perspective_feedback_outcomes')");
  });
});
