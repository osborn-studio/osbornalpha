-- G3: extend markets to six (A/HK/US/JP/KR/TW).
-- PG12+: ADD VALUE 允许在事务内，但新值不能在同一事务中使用（下方 check 约束是 text 列，不触碰 enum 新值）
alter type market_t add value if not exists 'JP';
alter type market_t add value if not exists 'KR';
alter type market_t add value if not exists 'TW';

alter table public.decisions drop constraint if exists decisions_market_check;
alter table public.decisions add constraint decisions_market_check
  check (market in ('A','HK','US','JP','KR','TW'));
