-- The ticker-level refresh queue supersedes the original per-user queue. Keep
-- the old table for rollback/audit visibility, but stop stale leases from
-- being mistaken for active work and seed any missing ticker rows.
insert into public.watchlist_research_ticker_refresh_state (ticker, status, failure_count, last_attempt_at, last_success_at, next_refresh_at, last_error)
select
  legacy.ticker,
  case when bool_or(legacy.status = 'succeeded') then 'succeeded' else 'pending' end,
  coalesce(max(legacy.failure_count), 0),
  max(legacy.last_attempt_at),
  max(legacy.last_success_at),
  coalesce(min(legacy.next_refresh_at), now()),
  null
from public.watchlist_research_refresh_state legacy
group by legacy.ticker
on conflict (ticker) do nothing;

update public.watchlist_research_refresh_state
set status = 'failed',
    lease_expires_at = null,
    last_error = coalesce(last_error, 'superseded_by_ticker_refresh'),
    updated_at = now()
where status = 'running'
  and (lease_expires_at is null or lease_expires_at < now());
