import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260904240000_watchlist_research_event_clusters.sql',
  import.meta.url,
);

describe('watchlist research event cluster migration', () => {
  it('persists corroboration and counts recent news by event', async () => {
    const migration = await readFile(migrationUrl, 'utf8');
    for (const table of ['external_evidence', 'news_items', 'broker_reports']) {
      expect(migration).toContain(`alter table public.${table}`);
    }
    expect(migration).toContain('event_cluster_id text');
    expect(migration).toContain('corroboration_count integer not null default 1');
    expect(migration).toContain("corroborating_sources jsonb not null default '[]'::jsonb");
    expect(migration).toContain('set event_cluster_id = source_key');
    expect(migration).toContain("count(distinct coalesce(nullif(n.event_cluster_id, ''), n.source_key))");
    expect(migration).toContain("values ('watchlist_research_event_clusters')");
  });
});
