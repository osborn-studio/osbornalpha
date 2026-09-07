-- A single Perspective claim can own at most one live alert. The origin row is
-- deleted with its alert, so deleting a draft intentionally permits recreation.
create unique index if not exists watchlist_alert_origins_claim_unique_idx
  on public.watchlist_alert_origins (user_id, perspective_id, claim_id)
  where perspective_id is not null;

insert into public.watchlist_release_markers (marker)
values ('watchlist_claim_alert_hardening')
on conflict (marker) do nothing;
