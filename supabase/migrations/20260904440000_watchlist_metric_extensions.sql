-- Forward-compatible analytics columns for environments that applied the
-- original metric snapshot migration before benchmark and volume metrics were added.
alter table public.watchlist_metric_snapshots
  add column if not exists excess_return_pct numeric,
  add column if not exists beta numeric,
  add column if not exists volume_zscore_20 numeric;

create index if not exists watchlist_metric_snapshots_excess_return_idx
  on public.watchlist_metric_snapshots (history_range, excess_return_pct, ticker);

create index if not exists watchlist_metric_snapshots_beta_idx
  on public.watchlist_metric_snapshots (history_range, beta, ticker);

create index if not exists watchlist_metric_snapshots_volume_zscore_idx
  on public.watchlist_metric_snapshots (history_range, volume_zscore_20, ticker);

insert into public.watchlist_release_markers (marker)
values ('watchlist_metric_extensions')
on conflict (marker) do nothing;
