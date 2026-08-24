-- ============================================================================
-- Stock Monitor — Initial Schema
-- ============================================================================
-- Schema for per-user watchlists, briefs, signals, perspectives.
-- All tables use RLS so users can only see their own data.
-- Public reference tables (stocks_universe, financial_history) are readable by all.
-- ============================================================================

-- ── enums ──────────────────────────────────────────────────────────────────
create type market_t as enum ('A', 'HK', 'US');
create type stance_t as enum ('bullish', 'neutral', 'bearish');
create type persona_t as enum (
  'buffett','munger','druckenmiller','marks','lynch',
  'burry','zhang_kun','li_lu','duan_yongping'
);

-- ── stocks_universe (public reference, ~12K rows when fully seeded) ─────────
create table public.stocks_universe (
  ticker        text primary key,
  name          text not null,
  pinyin        text,
  market        market_t not null,
  industry      text,
  is_active     boolean default true,
  last_price    numeric,
  updated_at    timestamptz default now()
);
create index stocks_universe_name_idx on public.stocks_universe using gin (to_tsvector('simple', name));
create index stocks_universe_market_idx on public.stocks_universe (market);

alter table public.stocks_universe enable row level security;
create policy "stocks_universe public read"
  on public.stocks_universe for select
  using (true);

-- ── financial_history (public reference) ───────────────────────────────────
create table public.financial_history (
  ticker        text references public.stocks_universe(ticker) on delete cascade,
  fiscal_year   int not null,
  period        text default 'annual',
  revenue       numeric,
  net_income    numeric,
  roe           numeric,
  gross_margin  numeric,
  free_cash_flow numeric,
  updated_at    timestamptz default now(),
  primary key (ticker, fiscal_year, period)
);
alter table public.financial_history enable row level security;
create policy "financial_history public read"
  on public.financial_history for select using (true);

-- ── watchlists (per-user) ──────────────────────────────────────────────────
create table public.watchlists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  description   text,
  weight        numeric default 1.0,
  sort_order    int default 0,
  is_default    boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index watchlists_user_idx on public.watchlists (user_id);

alter table public.watchlists enable row level security;
create policy "watchlists user read"  on public.watchlists for select using (auth.uid() = user_id);
create policy "watchlists user write" on public.watchlists for insert with check (auth.uid() = user_id);
create policy "watchlists user update" on public.watchlists for update using (auth.uid() = user_id);
create policy "watchlists user delete" on public.watchlists for delete using (auth.uid() = user_id);

-- ── watchlist_items ────────────────────────────────────────────────────────
create table public.watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  watchlist_id  uuid references public.watchlists(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  ticker        text not null,
  conviction    int default 5 check (conviction between 0 and 10),
  notes         text,
  sort_order    int default 0,
  added_at      timestamptz default now(),
  unique (watchlist_id, ticker)
);
create index watchlist_items_user_idx on public.watchlist_items (user_id);
create index watchlist_items_wl_idx   on public.watchlist_items (watchlist_id);

alter table public.watchlist_items enable row level security;
create policy "watchlist_items user read"   on public.watchlist_items for select using (auth.uid() = user_id);
create policy "watchlist_items user write"  on public.watchlist_items for insert with check (auth.uid() = user_id);
create policy "watchlist_items user update" on public.watchlist_items for update using (auth.uid() = user_id);
create policy "watchlist_items user delete" on public.watchlist_items for delete using (auth.uid() = user_id);

-- ── briefs (per-user daily briefing artifacts) ─────────────────────────────
create table public.briefs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  brief_date    date not null,
  language      text default 'zh',
  ai_confidence numeric check (ai_confidence between 0 and 10),
  confidence_label text,
  content_md    text,
  content_json  jsonb,
  total_cost_usd numeric,
  duration_s    int,
  status        text default 'success',
  generated_at  timestamptz default now(),
  unique (user_id, brief_date, language)
);
create index briefs_user_date_idx on public.briefs (user_id, brief_date desc);

alter table public.briefs enable row level security;
create policy "briefs user read"  on public.briefs for select using (auth.uid() = user_id);
create policy "briefs user write" on public.briefs for insert with check (auth.uid() = user_id);
create policy "briefs user delete" on public.briefs for delete using (auth.uid() = user_id);

-- ── stock_signals (per-brief, per-ticker) ──────────────────────────────────
create table public.stock_signals (
  id            uuid primary key default gen_random_uuid(),
  brief_id      uuid references public.briefs(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  ticker        text not null,
  score         numeric check (score between 0 and 10),
  triggers      jsonb default '[]'::jsonb,
  rank          int,
  created_at    timestamptz default now()
);
create index stock_signals_brief_idx on public.stock_signals (brief_id);

alter table public.stock_signals enable row level security;
create policy "stock_signals user read"  on public.stock_signals for select using (auth.uid() = user_id);
create policy "stock_signals user write" on public.stock_signals for insert with check (auth.uid() = user_id);

-- ── perspectives (per-brief, per-ticker, per-persona) ──────────────────────
create table public.perspectives (
  id            uuid primary key default gen_random_uuid(),
  brief_id      uuid references public.briefs(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  ticker        text not null,
  persona       persona_t not null,
  stance        stance_t not null,
  confidence    numeric check (confidence between 0 and 10),
  summary       text,
  cites         jsonb default '[]'::jsonb,
  created_at    timestamptz default now()
);
create index perspectives_brief_ticker_idx on public.perspectives (brief_id, ticker);

alter table public.perspectives enable row level security;
create policy "perspectives user read"  on public.perspectives for select using (auth.uid() = user_id);
create policy "perspectives user write" on public.perspectives for insert with check (auth.uid() = user_id);

-- ── news_items (per-user cache; in v2 may go shared) ───────────────────────
create table public.news_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  ticker        text not null,
  title         text not null,
  source        text,
  url           text,
  sentiment     numeric,
  published_at  timestamptz not null,
  fetched_at    timestamptz default now()
);
create index news_items_user_ticker_idx on public.news_items (user_id, ticker, published_at desc);

alter table public.news_items enable row level security;
create policy "news_items user read"  on public.news_items for select using (auth.uid() = user_id);
create policy "news_items user write" on public.news_items for insert with check (auth.uid() = user_id);

-- ── broker_reports ─────────────────────────────────────────────────────────
create table public.broker_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  ticker        text not null,
  broker        text,
  rating        text,
  target_price  text,
  target_change_pct numeric,
  pdf_url       text,
  ai_summary    text,
  published_at  date,
  fetched_at    timestamptz default now()
);
create index broker_reports_user_ticker_idx on public.broker_reports (user_id, ticker, published_at desc);

alter table public.broker_reports enable row level security;
create policy "broker_reports user read"  on public.broker_reports for select using (auth.uid() = user_id);
create policy "broker_reports user write" on public.broker_reports for insert with check (auth.uid() = user_id);

-- ── user_preferences ──────────────────────────────────────────────────────
create table public.user_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  language      text default 'zh',
  color_scheme  text default 'cn',  -- 'cn' (red-up) or 'us' (green-up)
  telegram_chat_id text,
  email_notifications boolean default true,
  daily_brief_time text default '08:30',
  timezone      text default 'Asia/Shanghai',
  updated_at    timestamptz default now()
);

alter table public.user_preferences enable row level security;
create policy "user_preferences self read"   on public.user_preferences for select using (auth.uid() = user_id);
create policy "user_preferences self write"  on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "user_preferences self update" on public.user_preferences for update using (auth.uid() = user_id);

-- ── trigger: auto-create default watchlist on signup ──────────────────────
create or replace function public.handle_new_user()
returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  insert into public.watchlists (user_id, name, description, is_default)
  values (new.id, '我的股票池', '默认股票池', true);
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
