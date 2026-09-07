import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904570000_watchlist_decision_context.sql',
  import.meta.url,
), 'utf8');

describe('Watchlist decision context migration', () => {
  it('captures compact metric, research, perspective, alert and review provenance', () => {
    expect(migration).toContain('add column if not exists context_snapshot jsonb');
    expect(migration).toContain('create or replace function public.capture_watchlist_decision_context()');
    expect(migration).toContain("'calculator_version', metric.calculator_version");
    expect(migration).toContain("'evidence_request_id', perspective.evidence_request_id");
    expect(migration).toContain("'review_reasons', coalesce(v_review_reasons");
  });

  it('uses a trigger so every existing decision write path receives provenance', () => {
    expect(migration).toContain('before insert on public.watchlist_item_decision_history');
    expect(migration).toContain("values ('watchlist_decision_context')");
  });
});
