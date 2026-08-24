create table public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  feature    text not null check (feature in ('copilot','perspectives','brief_preview')),
  ticker     text,
  tokens_in  int default 0,
  tokens_out int default 0,
  byo        boolean not null default false,
  created_at timestamptz not null default now()
);
create index usage_events_quota on public.usage_events (user_id, feature, created_at desc);

-- RLS: select own（未来用量面板）；insert with check (auth.uid() = user_id)（服务端路由上下文写入）
alter table public.usage_events enable row level security;
create policy "usage_events own select" on public.usage_events for select using (auth.uid() = user_id);
create policy "usage_events own insert" on public.usage_events for insert with check (auth.uid() = user_id);
