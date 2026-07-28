-- Deal-memo variant (primary-market-compatible IC memo) — Research OS memo engine.
-- Adds a memo_type discriminator + deal-specific columns to research_memos.
-- Existing §4.4 thesis memos keep memo_type='thesis' and are unchanged (new
-- columns have defaults). Spec: docs/research-os/2026-07-06-ic-memo-deal-variant-spec.md
alter table public.research_memos
  add column memo_type      text  not null default 'thesis' check (memo_type in ('thesis','deal')),
  add column deal_context   text,
  add column sections       jsonb not null default '[]',   -- 8 narrative sections
  add column recommendation jsonb not null default '{}',   -- { verdict, conditions[], rationale }
  add column valuation      jsonb not null default '{}';   -- primary-market valuation system (8 fields)
