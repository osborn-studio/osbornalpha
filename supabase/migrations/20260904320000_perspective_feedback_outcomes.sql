-- Close the AI-perspective loop with user correction and delayed outcome
-- evaluation. Queue and outcome writes remain service-role operations.
alter table public.perspectives
  add column if not exists reference_price numeric;

alter table public.perspectives
  drop constraint if exists perspectives_reference_price_check;
alter table public.perspectives
  add constraint perspectives_reference_price_check check (reference_price is null or reference_price > 0);

create table if not exists public.perspective_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  perspective_id uuid not null references public.perspectives(id) on delete cascade,
  verdict text not null check (verdict in ('helpful', 'incorrect', 'outdated')),
  reason text,
  corrected_stance public.stance_t,
  created_at timestamptz not null default now(),
  unique (user_id, perspective_id)
);

create table if not exists public.perspective_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  perspective_id uuid not null references public.perspectives(id) on delete cascade,
  horizon_days integer not null check (horizon_days between 1 and 365),
  reference_price numeric not null check (reference_price > 0),
  outcome_price numeric not null check (outcome_price > 0),
  return_pct numeric not null,
  direction_correct boolean not null,
  evaluated_at timestamptz not null default now(),
  unique (perspective_id, horizon_days)
);

create table if not exists public.perspective_evaluation_queue (
  perspective_id uuid primary key references public.perspectives(id) on delete cascade,
  due_at timestamptz not null,
  horizon_days integer not null default 30 check (horizon_days between 1 and 365),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null,
  claimed_at timestamptz,
  last_error text,
  status text not null default 'pending' check (status in ('pending', 'dead_letter')),
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists perspective_evaluation_queue_due_idx
  on public.perspective_evaluation_queue (next_attempt_at, due_at);

alter table public.perspective_feedback enable row level security;
alter table public.perspective_outcomes enable row level security;
alter table public.perspective_evaluation_queue enable row level security;

create policy "perspective_feedback own read" on public.perspective_feedback
  for select using (auth.uid() = user_id);
create policy "perspective_feedback own insert" on public.perspective_feedback
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.perspectives p where p.id = perspective_id and p.user_id = auth.uid())
  );
create policy "perspective_feedback own update" on public.perspective_feedback
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.perspectives p where p.id = perspective_id and p.user_id = auth.uid())
  );
create policy "perspective_outcomes own read" on public.perspective_outcomes
  for select using (auth.uid() = user_id);

revoke all on public.perspective_feedback from anon, authenticated;
grant select, insert, update on public.perspective_feedback to authenticated;
revoke all on public.perspective_outcomes from anon, authenticated;
grant select on public.perspective_outcomes to authenticated;
revoke all on public.perspective_evaluation_queue from anon, authenticated;
grant all on public.perspective_feedback, public.perspective_outcomes, public.perspective_evaluation_queue to service_role;

create or replace function public.enqueue_perspective_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference_price is not null then
    insert into public.perspective_evaluation_queue (perspective_id, due_at, next_attempt_at)
    values (new.id, new.created_at + interval '30 days', new.created_at + interval '30 days')
    on conflict (perspective_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists perspectives_enqueue_evaluation on public.perspectives;
create trigger perspectives_enqueue_evaluation
  after insert on public.perspectives
  for each row execute function public.enqueue_perspective_evaluation();

revoke all on function public.enqueue_perspective_evaluation() from public;

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
    where q.due_at <= now()
      and q.status = 'pending'
      and q.attempt_count < 5
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

insert into public.watchlist_release_markers (marker)
values ('perspective_feedback_outcomes')
on conflict (marker) do nothing;
