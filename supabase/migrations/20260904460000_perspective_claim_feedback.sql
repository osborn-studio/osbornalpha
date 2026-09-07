-- Claim feedback remains separate from whole-Perspective feedback so a user
-- can correct one assertion without invalidating the rest of the analysis.
create table if not exists public.perspective_claim_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  perspective_id uuid not null references public.perspectives(id) on delete cascade,
  claim_id text not null check (claim_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  verdict text not null check (verdict in ('helpful', 'incorrect', 'outdated', 'unsupported')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, perspective_id, claim_id)
);

create index if not exists perspective_claim_feedback_perspective_idx
  on public.perspective_claim_feedback (user_id, perspective_id, claim_id);

alter table public.perspective_claim_feedback enable row level security;

create policy "perspective_claim_feedback own read" on public.perspective_claim_feedback
  for select using (auth.uid() = user_id);
create policy "perspective_claim_feedback own insert" on public.perspective_claim_feedback
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.perspectives p
      where p.id = perspective_id and p.user_id = auth.uid()
        and exists (
          select 1 from jsonb_array_elements(p.claims) claim
          where claim ->> 'id' = claim_id
        )
    )
  );
create policy "perspective_claim_feedback own update" on public.perspective_claim_feedback
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "perspective_claim_feedback own delete" on public.perspective_claim_feedback
  for delete using (auth.uid() = user_id);

revoke all on public.perspective_claim_feedback from anon, authenticated;
grant select, insert, update, delete on public.perspective_claim_feedback to authenticated;
grant all on public.perspective_claim_feedback to service_role;

insert into public.watchlist_release_markers (marker)
values ('perspective_claim_feedback')
on conflict (marker) do nothing;
