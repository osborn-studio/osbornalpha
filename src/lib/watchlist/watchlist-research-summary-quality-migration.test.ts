import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904220000_watchlist_research_summary_quality.sql', import.meta.url),
  'utf8',
);

describe('watchlist research summary quality migration', () => {
  it('uses quality-weighted sentiment and exposes coverage fields', async () => {
    expect(migration).toContain('drop function if exists public.watchlist_research_summaries(text[])');
    expect(migration).toContain('sentiment_sample_size bigint');
    expect(migration).toContain('sentiment_coverage_ratio numeric');
    expect(migration).toContain('quality_score');
  });
});
