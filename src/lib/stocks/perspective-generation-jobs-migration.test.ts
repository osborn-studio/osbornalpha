import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904420000_perspective_generation_jobs.sql', import.meta.url),
  'utf8',
);

describe('perspective generation jobs migration', () => {
  it('provides an owned queue, atomic quota reservations, fenced leases, and a release marker', () => {
    expect(migration).toContain('create table if not exists public.perspective_generation_jobs');
    expect(migration).toContain("status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')");
    expect(migration).toContain('where status in (\'queued\', \'running\')');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("hashtextextended(v_user_id::text, 71203)");
    expect(migration).toContain("format('perspective_quota_exhausted:%s:%s:%s', v_used, v_limit, v_plan)");
    expect(migration).toContain('consume_external_evidence_user_quota');
    expect(migration).toContain('lease_token = gen_random_uuid()');
    expect(migration).toContain('p_job_id uuid default null');
    expect(migration).toContain('cancel_perspective_generation_job');
    expect(migration).not.toContain('api_key');
    expect(migration).toContain("values ('perspective_generation_jobs')");
  });
});
