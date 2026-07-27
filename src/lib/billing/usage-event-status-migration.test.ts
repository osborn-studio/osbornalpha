import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('usage event status migration', () => {
  const sql = readFileSync(join(
    process.cwd(),
    'supabase/migrations/20260728100000_usage_event_status.sql',
  ), 'utf8').toLowerCase();

  it('adds an idempotent completed/failed status without reclassifying historical rows', () => {
    expect(sql).toContain('add column if not exists status text not null default');
    expect(sql).toContain("'completed'");
    expect(sql).toContain("'failed'");
    expect(sql).toContain('check');
  });
});
