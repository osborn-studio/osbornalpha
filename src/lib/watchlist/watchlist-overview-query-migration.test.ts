import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904270000_watchlist_overview_query.sql', import.meta.url),
  'utf8',
);

describe('Watchlist overview server query migration', () => {
  it('uses authenticated ownership boundaries and a fixed sort allowlist', () => {
    expect(migration).toContain('create or replace function public.get_watchlist_overview_query');
    expect(migration).toContain('wl.user_id = auth.uid()');
    expect(migration).toContain('wi.user_id = auth.uid()');
    expect(migration).toContain("if auth.uid() is null then raise exception 'watchlist_auth_required'; end if;");
    expect(migration).toContain('security definer');
    expect(migration).toContain("if sort_key not in (");
    expect(migration).not.toContain('execute format');
    expect(migration).toContain('to authenticated');
  });

  it('supports complete-dataset filters and persisted metric projections', () => {
    expect(migration).toContain('p_group_id uuid default null');
    expect(migration).toContain('p_decision_status text default null');
    expect(migration).toContain('p_tag text default null');
    expect(migration).toContain('p_quote_status text default null');
    expect(migration).toContain('p_metric text default null');
    expect(migration).toContain('p_metric_min numeric default null');
    expect(migration).toContain('metric.period_return_pct');
    expect(migration).toContain('left join public.market_quote_snapshots quote');
    expect(migration).toContain('quote.stale_until > now()');
    expect(migration).toContain("'price', quote.price");
    expect(migration).toContain("'dayPosition', case");
    expect(migration).toContain('(source.numeric_values ->> sort_key)::numeric as sort_num');
    expect(migration).toContain('(source.numeric_values ->> metric_key)::numeric end as metric_num');
    expect(migration).toContain('coalesce(quote.observed_at, metric.observed_at)');
    expect(migration).toContain("count(distinct coalesce(nullif(artifact.event_cluster_id, ''), artifact.source_key)) filter (");
    expect(migration).toContain('join public.shared_research_artifacts artifact on artifact.id = research_link.artifact_id');
    expect(migration).toContain('research_link.user_id = auth.uid()');
    expect(migration).toContain('base.metric_num >= p_metric_min');
    expect(migration).not.toContain('base.sort_num >= p_metric_min');
    expect(migration).toContain('base.quote_status = p_quote_status');
  });

  it('puts nulls last and binds the stable keyset to a query fingerprint', () => {
    expect(migration).toContain("raise exception 'watchlist_cursor_fingerprint_mismatch'");
    expect(migration).toContain("case when base.sort_num is null and base.sort_text is null then 1 else 0 end as null_rank");
    expect(migration).toContain("'fingerprint', p_fingerprint");
    expect(migration).toContain("'itemId', item_id");
    expect(migration).toContain('limit page_limit + 1');
  });
});
