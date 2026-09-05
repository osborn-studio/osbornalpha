import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260904380000_perspective_analysis_modes.sql',
), 'utf8');

describe('perspective analysis mode migration', () => {
  it('persists constrained request, resolution, and evidence status fields', () => {
    expect(sql).toContain('requested_analysis_mode');
    expect(sql).toContain("'auto', 'evidence_required', 'structured_only'");
    expect(sql).toContain('resolved_analysis_mode');
    expect(sql).toContain("'evidence_backed', 'structured_only'");
    expect(sql).toContain('evidence_status');
    expect(sql).toContain("'complete', 'partial', 'unavailable', 'error'");
    expect(sql).toContain("values ('perspective_analysis_modes')");
  });

  it('backfills legacy evidence conservatively', () => {
    expect(sql).toContain("when evidence_result_count > 0 then 'evidence_backed'");
    expect(sql).toContain("when evidence_result_count > 0 then 'partial'");
  });
});
