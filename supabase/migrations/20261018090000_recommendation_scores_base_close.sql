-- recommendation_scores.base_close / base_date: the fill re-expressed on the CURRENT price basis.
-- recommendations.fill_price is the base close frozen at the first score. Every later refresh
-- re-runs scoreForward on freshly fetched bars, so its base_close is the same exchange-local
-- bar on whatever basis the source now reports (A-share qfq re-adjusted after 送转/dividends,
-- HK/US unadjusted after a split). The paper book prefers it over fill_price so that fill and
-- last_close always share one basis — no adjustment factor needed. Nullable: rows scored before
-- this migration stay null until their next refresh and the book falls back to fill_price.
alter table public.recommendation_scores
  add column base_close numeric check (base_close > 0),
  add column base_date  date;
