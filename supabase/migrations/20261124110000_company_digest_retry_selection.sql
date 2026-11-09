-- Failed published streams retry after backoff within the existing oldest-sweep budget.
-- CREATE OR REPLACE preserves the existing owner and EXECUTE ACL; signature and security stay fixed.
create or replace function public.company_sweep_due(p_older_than timestamptz, p_now timestamptz, p_limit int, p_market text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('issuerId', x.issuer_id, 'market', x.market, 'stateRev', x.state_rev, 'digestedRev', x.digested_rev)
                            order by x.swept_at asc nulls first, x.issuer_id, x.market), '[]'::jsonb)
  from (
    select s.issuer_id, s.market, s.state_rev, coalesce(d.digested_rev, 0) as digested_rev, d.swept_at
    from public.fact_sync_scope s
    left join public.company_digest_state d on d.issuer_id = s.issuer_id and d.market = s.market
    where s.state_rev > 0
      and (d.swept_at is null or d.swept_at < p_older_than or d.last_status = 'failed')
      and coalesce(d.next_attempt_at, 'epoch'::timestamptz) <= p_now
      and (p_market is null or s.market = p_market)
    order by d.swept_at asc nulls first, s.issuer_id, s.market
    limit greatest(coalesce(p_limit, 0), 0)
  ) x
$$;
