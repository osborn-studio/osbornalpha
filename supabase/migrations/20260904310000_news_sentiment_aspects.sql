-- Explainable multilingual sentiment projections for Watchlist research.
alter table public.news_items
  add column if not exists sentiment_confidence numeric not null default 0,
  add column if not exists sentiment_language text not null default 'unknown',
  add column if not exists sentiment_aspects jsonb not null default '{}'::jsonb;

alter table public.news_items
  drop constraint if exists news_items_sentiment_confidence_check;
alter table public.news_items
  add constraint news_items_sentiment_confidence_check check (sentiment_confidence between 0 and 1);

alter table public.news_items
  drop constraint if exists news_items_sentiment_language_check;
alter table public.news_items
  add constraint news_items_sentiment_language_check check (sentiment_language in ('en', 'zh', 'mixed', 'unknown'));

alter table public.news_items
  drop constraint if exists news_items_sentiment_aspects_check;
alter table public.news_items
  add constraint news_items_sentiment_aspects_check check (jsonb_typeof(sentiment_aspects) = 'object');

insert into public.watchlist_release_markers (marker)
values ('news_sentiment_aspects')
on conflict (marker) do nothing;
