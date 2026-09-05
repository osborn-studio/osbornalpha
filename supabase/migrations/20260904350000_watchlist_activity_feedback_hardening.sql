-- Complete the Watchlist activity read model and make perspective evaluation
-- failures terminal and observable.

create table if not exists public.watchlist_activity_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker),
  check (ticker = upper(ticker) and char_length(ticker) between 1 and 20)
);

alter table public.watchlist_activity_state enable row level security;

create policy "watchlist_activity_state own read" on public.watchlist_activity_state
  for select using (auth.uid() = user_id);
create policy "watchlist_activity_state own insert" on public.watchlist_activity_state
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.watchlist_items wi
      where wi.user_id = auth.uid() and wi.ticker = watchlist_activity_state.ticker
    )
  );
create policy "watchlist_activity_state own update" on public.watchlist_activity_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "watchlist_activity_state own delete" on public.watchlist_activity_state
  for delete using (auth.uid() = user_id);

revoke all on public.watchlist_activity_state from anon, authenticated;
grant select, insert, update, delete on public.watchlist_activity_state to authenticated;
grant all on public.watchlist_activity_state to service_role;

create policy "perspective_feedback own delete" on public.perspective_feedback
  for delete using (auth.uid() = user_id);
grant delete on public.perspective_feedback to authenticated;

alter table public.perspective_evaluation_queue
  add column if not exists status text not null default 'pending',
  add column if not exists dead_lettered_at timestamptz;

alter table public.perspective_evaluation_queue
  drop constraint if exists perspective_evaluation_queue_status_check;
alter table public.perspective_evaluation_queue
  add constraint perspective_evaluation_queue_status_check
  check (status in ('pending', 'dead_letter'));

create or replace function public.claim_perspective_evaluations(p_limit integer default 20)
returns table (
  perspective_id uuid,
  user_id uuid,
  ticker text,
  stance public.stance_t,
  reference_price numeric,
  horizon_days integer,
  attempt_count integer
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select q.perspective_id
    from public.perspective_evaluation_queue q
    where q.status = 'pending'
      and q.attempt_count < 5
      and q.due_at <= now()
      and q.next_attempt_at <= now()
      and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
    order by q.next_attempt_at, q.perspective_id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ), claimed as (
    update public.perspective_evaluation_queue q
    set claimed_at = now(), attempt_count = q.attempt_count + 1, updated_at = now()
    from candidates c
    where q.perspective_id = c.perspective_id
    returning q.perspective_id, q.horizon_days, q.attempt_count
  )
  select p.id, p.user_id, p.ticker, p.stance, p.reference_price, c.horizon_days, c.attempt_count
  from claimed c
  join public.perspectives p on p.id = c.perspective_id
  where p.reference_price is not null;
$$;

revoke all on function public.claim_perspective_evaluations(integer) from public;
grant execute on function public.claim_perspective_evaluations(integer) to service_role;

create or replace function public.refund_watchlist_research_quota()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_date date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if v_user_id is null then raise exception 'watchlist_auth_required'; end if;
  update public.watchlist_feature_usage
  set used = greatest(used - 1, 0), updated_at = now()
  where user_id = v_user_id and feature = 'research_refresh' and usage_date = v_date;
end;
$$;

revoke all on function public.refund_watchlist_research_quota() from public;
grant execute on function public.refund_watchlist_research_quota() to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_activity_feedback_hardening')
on conflict (marker) do nothing;
