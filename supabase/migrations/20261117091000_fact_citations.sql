-- supabase/migrations/20261117091000_fact_citations.sql
-- F3 migration two (spec §4.8, §4.9, §4.12; plan F3 Task 13). Joins the document pipeline to the
-- landed spec-2 facts layer WITHOUT replacing any spec-2 function or trigger:
--   1. additive extension of the spec-2 check constraints (drop if exists + add, under the landed
--      names PostgreSQL derived from the inline column checks: <table>_<column>_check): market +=
--      'HK' on fact_sync_runs, filings, financial_facts, fact_sync_scope — NOT financial_metrics (HK
--      is not materialised, R5-3); filings.source += 'hkex'; filings.origin += 'hkex';
--   2. filing_documents (R5-6): HK filing ↔ the Chinese document it was cut from; written only by
--      bind_filing_documents; removed only by the cascade of begin_sync_run pruning an empty gen-0 filing;
--   3. fact_citations: evidence per fact and role; written only by insert_fact_citations; removed
--      only by the cascade of spec-2 deleting the staged rows of an abandoned run (ok rows are never
--      deleted, so published evidence never disappears);
--   4. document_citations: migration one's public policy replaced by the fact-linked one (§4.12);
--   5. F3 functions: bind_filing_documents, insert_fact_citations, assert_run_evidence_complete
--      (internal), publish_hk_run (the only HK publish path), finish/abandon_candidate_publications,
--      ensure_hk_fact_scope, renew_hk_fact_lease (holder-only, R3-P2-1), resolve_hk_facts_quarantine,
--      hk_promotion_due, hk_zero_output_documents.
-- Run-level spec-2 helpers check the RUN's batch lease (fact_run_lock), and so does every run-level
-- F3 function. Lock order everywhere: fact_sync_scope → filings → filing_documents →
-- disclosure_documents (publish_hk_run takes all four, in that order, before the evidence check).
-- Errors carry the code as the message (detail says why): invalid_input, invalid_citation,
-- invalid_expected_rev (22023); binding_conflict, evidence_incomplete, run_pending, not_hk_item
-- (P0001); not_found (P0002); spec-2 codes (lease_lost, stale_plan, run_published, item_not_open, …)
-- propagate unchanged. Triggers refuse with 23514, prefix `append_only:`. Replayable; the hosted
-- `postgres` role is not a superuser (owner = migration role, search_path = public, every relation
-- qualified, no `alter function … owner`). Only storage.buckets exists locally: not referenced here.

-- ---------------------------------------------------------------- 1. spec-2 check constraints (additive, R5-2)
alter table public.fact_sync_runs drop constraint if exists fact_sync_runs_market_check;
alter table public.fact_sync_runs add constraint fact_sync_runs_market_check check (market in ('US','CN','HK'));
alter table public.filings drop constraint if exists filings_market_check;
alter table public.filings add constraint filings_market_check check (market in ('US','CN','HK'));
alter table public.filings drop constraint if exists filings_source_check;
-- F3 review (codex Task 13 F3): market-dependent, still ONE check per column under the landed name — US/CN
-- rows keep exactly the original domain, HK rows must come from hkex.
alter table public.filings add constraint filings_source_check check ((market = 'HK' and source = 'hkex') or (market <> 'HK' and source in ('edgar','tushare')));
alter table public.filings drop constraint if exists filings_origin_check;
alter table public.filings add constraint filings_origin_check check ((market = 'HK' and origin = 'hkex') or (market <> 'HK' and origin in ('sec','sse','szse','bse')));
alter table public.financial_facts drop constraint if exists financial_facts_market_check;
alter table public.financial_facts add constraint financial_facts_market_check check (market in ('US','CN','HK'));
alter table public.fact_sync_scope drop constraint if exists fact_sync_scope_market_check;
alter table public.fact_sync_scope add constraint fact_sync_scope_market_check check (market in ('US','CN','HK'));
-- financial_metrics.market stays ('US','CN').

-- ---------------------------------------------------------------- 2. filing_documents (R5-6)
create table if not exists public.filing_documents (
  filing_id    uuid primary key references public.filings(filing_id) on delete cascade,
  document_id  uuid not null references public.disclosure_documents(document_id) on delete restrict,
  created_at   timestamptz not null default now()
);
create index if not exists filing_documents_document_idx on public.filing_documents(document_id);

-- ---------------------------------------------------------------- 3. fact_citations
create table if not exists public.fact_citations (
  fact_id      uuid not null references public.financial_facts(fact_id) on delete cascade,
  citation_id  uuid not null references public.document_citations(citation_id) on delete restrict,
  role         text not null check (role in ('value','label','period','unit','unit_currency')),
  primary key (fact_id, role, citation_id)
);
create index if not exists fact_citations_citation_idx on public.fact_citations(citation_id);

-- ---------------------------------------------------------------- guards
-- Inside a BEFORE trigger pg_trigger_depth() is already 1 for a direct statement; a delete issued by
-- a foreign-key cascade runs inside the RI trigger, so this trigger then sees depth 2. Hence `< 2`.
create or replace function public.fact_citations_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'append_only: fact_citations rows are never updated' using errcode = '23514';
  end if;
  if pg_trigger_depth() < 2 then
    raise exception 'append_only: fact_citations rows are deleted only with their fact (cascade)' using errcode = '23514';
  end if;
  return old;
end $$;
revoke execute on function public.fact_citations_guard() from public, anon, authenticated, service_role;
drop trigger if exists fact_citations_guard on public.fact_citations;
create trigger fact_citations_guard before update or delete on public.fact_citations
  for each row execute function public.fact_citations_guard();

create or replace function public.filing_documents_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'append_only: filing_documents rows are never updated' using errcode = '23514';
  end if;
  if pg_trigger_depth() < 2 then
    raise exception 'append_only: filing_documents rows are deleted only with their filing (cascade)' using errcode = '23514';
  end if;
  return old;
end $$;
revoke execute on function public.filing_documents_guard() from public, anon, authenticated, service_role;
drop trigger if exists filing_documents_guard on public.filing_documents;
create trigger filing_documents_guard before update or delete on public.filing_documents
  for each row execute function public.filing_documents_guard();

-- ---------------------------------------------------------------- privileges and policies (§4.12)
do $$ declare t text; begin
  foreach t in array array['fact_citations','filing_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
end $$;
drop policy if exists "fact_citations public read" on public.fact_citations;
create policy "fact_citations public read" on public.fact_citations for select to anon, authenticated
  using (exists (select 1 from public.financial_facts f where f.fact_id = fact_citations.fact_id and f.status = 'ok'));
drop policy if exists "filing_documents public read" on public.filing_documents;
create policy "filing_documents public read" on public.filing_documents for select to anon, authenticated
  using (exists (select 1 from public.filings g where g.filing_id = filing_documents.filing_id and g.mapping_gen > 0));
-- Migration one created this policy without the fact clause; this is the complete §4.12 rule:
-- public document AND (published by a module/human OR cited by an ok fact).
drop policy if exists "document_citations public read" on public.document_citations;
create policy "document_citations public read" on public.document_citations for select to anon, authenticated
  using (exists (select 1 from public.disclosure_documents d where d.document_id = document_citations.document_id and d.permission = 'public')
         and (visibility = 'public'
              or exists (select 1 from public.fact_citations fc join public.financial_facts f on f.fact_id = fc.fact_id
                         where fc.citation_id = document_citations.citation_id and f.status = 'ok')));

-- ---------------------------------------------------------------- 5. functions
-- p_rows = [{filing_id, document_id}]. Under the run's lease (fact_run_lock), existing bindings of the
-- requested filings are locked in filing_id order; per row: the filing must be an HK 'hkex' filing of
-- the run's issuer; an existing binding to the same document is skipped, to another one is
-- binding_conflict; the document must be a public Chinese HKEXnews document of the same issuer and
-- the filing's source_ref must be 'hkex:<document source_ref>:v<source_version>'. Returns inserted rows.
create or replace function public.bind_filing_documents(p_run uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; x record; g public.filings; d public.disclosure_documents; v_have uuid; n int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input' using errcode = '22023', detail = 'rows'; end if;
  r := public.fact_run_lock(p_run);
  if r.market <> 'HK' then raise exception 'invalid_input' using errcode = '22023', detail = 'run_market'; end if;
  perform 1 from public.filing_documents fd
  where fd.filing_id in (select (e ->> 'filing_id')::uuid from jsonb_array_elements(p_rows) e)
  order by fd.filing_id for update of fd;
  for x in select (e ->> 'filing_id')::uuid as filing_id, (e ->> 'document_id')::uuid as document_id
           from jsonb_array_elements(p_rows) e order by 1, 2 loop
    if x.filing_id is null or x.document_id is null then raise exception 'invalid_input' using errcode = '22023', detail = 'row'; end if;
    select * into g from public.filings where filing_id = x.filing_id;
    if not found or g.issuer_id <> r.issuer_id or g.market <> 'HK' or g.source <> 'hkex' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'filing';
    end if;
    select fd.document_id into v_have from public.filing_documents fd where fd.filing_id = x.filing_id;
    if found then
      if v_have <> x.document_id then raise exception 'binding_conflict' using errcode = 'P0001', detail = x.filing_id::text; end if;
      continue;
    end if;
    select * into d from public.disclosure_documents where document_id = x.document_id;
    if not found or d.source <> 'hkexnews' or d.language is distinct from 'zh' or d.permission <> 'public' or d.issuer_id is distinct from r.issuer_id then
      raise exception 'invalid_input' using errcode = '22023', detail = 'document';
    end if;
    if g.source_ref <> 'hkex:' || d.source_ref || ':v' || d.source_version then
      raise exception 'invalid_input' using errcode = '22023', detail = 'source_ref';
    end if;
    insert into public.filing_documents (filing_id, document_id) values (x.filing_id, x.document_id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.bind_filing_documents(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bind_filing_documents(uuid, jsonb) to service_role;

-- p_rows = [{fact_id, citation_id, role}]. Under the run's lease; every row is validated before any
-- insert (first failure → invalid_citation, detail = reason): role; the fact exists, belongs to p_run
-- and is staged; the citation exists; the fact's filing is bound; the citation's document is that
-- bound document, public, and the citation sits on its CURRENT extraction. Duplicates are skipped.
-- Returns inserted rows.
create or replace function public.insert_fact_citations(p_run uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; v_bad text; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input' using errcode = '22023', detail = 'rows'; end if;
  r := public.fact_run_lock(p_run);
  if r.market <> 'HK' then raise exception 'invalid_input' using errcode = '22023', detail = 'run_market'; end if;
  select x.reason into v_bad from (
    select case
      when e ->> 'role' is null or e ->> 'role' not in ('value','label','period','unit','unit_currency') then 'role'
      when f.fact_id is null then 'fact'
      when f.run_id <> p_run or f.status <> 'staged' then 'fact_state'
      when c.citation_id is null then 'citation'
      when fd.filing_id is null then 'unbound_filing'
      when c.document_id <> fd.document_id then 'document'
      when d.permission <> 'public' then 'permission'
      when c.extraction_id is distinct from d.current_extraction_id then 'extraction'
      else null end as reason
    from jsonb_array_elements(p_rows) e
    left join public.financial_facts f on f.fact_id = (e ->> 'fact_id')::uuid
    left join public.document_citations c on c.citation_id = (e ->> 'citation_id')::uuid
    left join public.filing_documents fd on fd.filing_id = f.filing_id
    left join public.disclosure_documents d on d.document_id = fd.document_id
  ) x where x.reason is not null limit 1;
  if v_bad is not null then raise exception 'invalid_citation' using errcode = '22023', detail = v_bad; end if;
  -- F4: at most 64 distinct period citations per fact (existing rows plus this call), so every reader pages a bounded set
  select 'period_limit' into v_bad from (
    select u.fact_id from (
      select (e ->> 'fact_id')::uuid as fact_id, (e ->> 'citation_id')::uuid as citation_id from jsonb_array_elements(p_rows) e where e ->> 'role' = 'period'
      union
      select fc.fact_id, fc.citation_id from public.fact_citations fc
      where fc.role = 'period' and fc.fact_id in (select (e ->> 'fact_id')::uuid from jsonb_array_elements(p_rows) e)
    ) u group by u.fact_id having count(*) > 64 limit 1) z;
  if v_bad is not null then raise exception 'invalid_citation' using errcode = '22023', detail = v_bad; end if;
  insert into public.fact_citations (fact_id, citation_id, role)
  select distinct (e ->> 'fact_id')::uuid, (e ->> 'citation_id')::uuid, e ->> 'role' from jsonb_array_elements(p_rows) e
  on conflict (fact_id, role, citation_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.insert_fact_citations(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_fact_citations(uuid, jsonb) to service_role;

-- Internal (R4-3): over run_id = p_run AND status IN ('staged','quarantined') — quarantine does not
-- exempt — every fact needs exactly one value, label and unit citation, exactly the unit_currency
-- citation its candidate declares (one for a 仙 / cents EPS, none otherwise; the unit citation must
-- also be the declared one — codex plan round 3 R3-P1-1) and at least one period
-- citation, exactly one staged candidate_publications row of this run pointing at it, a bound filing,
-- and every citation on the bound document, public, on its current extraction, intact (page
-- text_hash and code-point substr equal the stored values). First failure → evidence_incomplete
-- (detail = '<reason>:<fact_id>'). Called only by publish_hk_run after its locks.
create or replace function public.assert_run_evidence_complete(p_run uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_fact uuid; v_reason text;
begin
  select x.fact_id, x.reason into v_fact, v_reason from (
    select f.fact_id,
      case
        when (select count(*) from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'value') <> 1 then 'value'
        when (select count(*) from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'label') <> 1 then 'label'
        when (select count(*) from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'unit') <> 1 then 'unit'
        when not exists (select 1 from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'period') then 'period'
        when (select count(*) from public.candidate_publications cp where cp.run_id = p_run and cp.fact_id = f.fact_id and cp.state = 'staged') <> 1 then 'publication'
        -- R3-P1-1: the unit evidence is exactly what the checked candidate declared — its unit citation,
        -- plus its unit_currency citation iff it declares one (a 仙 / cents EPS), none otherwise
        when exists (
          select 1 from public.candidate_publications cp join public.extraction_candidates ec on ec.candidate_id = cp.candidate_id
          where cp.run_id = p_run and cp.fact_id = f.fact_id and cp.state = 'staged'
            and ((select fc.citation_id::text from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'unit') is distinct from ec.citations ->> 'unit'
                 or coalesce((select array_agg(fc.citation_id::text order by fc.citation_id) from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'unit_currency'), '{}'::text[])
                    is distinct from (case when ec.citations ? 'unit_currency' then array[ec.citations ->> 'unit_currency'] else '{}'::text[] end))) then 'unit_evidence'
        -- F2 (codex Task 13): value, label and the COMPLETE period set are exactly what the checked candidate
        -- declared (a swapped-year citation is intact but wrong), and the fact itself is the candidate's payload
        when coalesce((select array_agg(fc.citation_id::text order by fc.citation_id::text) from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'value'), '{}'::text[])
             is distinct from array[lk.citations ->> 'value'] then 'value_evidence'
        when coalesce((select array_agg(fc.citation_id::text order by fc.citation_id::text) from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'label'), '{}'::text[])
             is distinct from array[lk.citations ->> 'label'] then 'label_evidence'
        when coalesce((select array_agg(fc.citation_id::text order by fc.citation_id::text) from public.fact_citations fc where fc.fact_id = f.fact_id and fc.role = 'period'), '{}'::text[])
             is distinct from (case when jsonb_typeof(lk.citations -> 'period') = 'array'
                                    then (select coalesce(array_agg(distinct pe ->> 'citation_id' order by pe ->> 'citation_id'), '{}'::text[]) from jsonb_array_elements(lk.citations -> 'period') pe)
                                    else '{}'::text[] end) then 'period_evidence'
        when f.concept is distinct from lk.payload ->> 'concept' or f.statement is distinct from lk.payload ->> 'statement'
             or f.period_start::text is distinct from lk.payload ->> 'period_start' or f.period_end::text is distinct from lk.payload ->> 'period_end'
             or f.duration is distinct from lk.payload ->> 'duration' or f.unit is distinct from lk.payload ->> 'unit'
             or f.consolidation is distinct from lk.payload ->> 'consolidation'
             or f.value is distinct from (case when lk.payload ->> 'value' ~ '^-?[0-9]+(\.[0-9]+)?$' then (lk.payload ->> 'value')::numeric end) then 'payload'
        when not exists (select 1 from public.filing_documents fd where fd.filing_id = f.filing_id) then 'unbound_filing'
        when exists (
          select 1 from public.fact_citations fc
          join public.document_citations c on c.citation_id = fc.citation_id
          join public.filing_documents fd on fd.filing_id = f.filing_id
          join public.disclosure_documents d on d.document_id = fd.document_id
          left join public.document_pages p on p.extraction_id = c.extraction_id and p.page_no = c.page_no
          where fc.fact_id = f.fact_id
            and (c.document_id <> d.document_id or d.permission <> 'public'
                 or c.extraction_id is distinct from d.current_extraction_id
                 or p.text_hash is distinct from c.text_hash
                 or substr(p.text, c.char_start + 1, c.char_end - c.char_start) is distinct from c.snippet)) then 'citation'
        else null end as reason
    from public.financial_facts f
    left join lateral (select ec.citations, ec.payload from public.candidate_publications cp join public.extraction_candidates ec on ec.candidate_id = cp.candidate_id
                       where cp.run_id = p_run and cp.fact_id = f.fact_id and cp.state = 'staged' order by cp.candidate_id limit 1) lk on true
    where f.run_id = p_run and f.status in ('staged','quarantined')
  ) x where x.reason is not null order by x.fact_id limit 1;
  if v_reason is not null then
    raise exception 'evidence_incomplete' using errcode = 'P0001', detail = v_reason || ':' || v_fact;
  end if;
end $$;
revoke execute on function public.assert_run_evidence_complete(uuid) from public, anon, authenticated, service_role;

-- The only HK publish path (§4.8, R4-2, R5-6, R5-7). p_expected_rev is mandatory. Locks, in order:
-- the issuer's HK scope row with the caller's lease (fact_scope_lock), the run (must be this issuer's
-- staged HK run of p_batch), every filing of the run, of its facts or of the manifest (filing_id
-- order), their filing_documents rows (filing_id order), the bound disclosure_documents (document_id
-- order). p_zero_output = the planned zero-output selection [{document_id, extraction_id}] (codex plan
-- round 1 P1-4): under the document locks, and with the expected extraction rows share-locked
-- (extraction_id order; documents → extractions everywhere), each entry must still be a public
-- Chinese HKEXnews document of this issuer bound to one of the run's filings whose current
-- extraction is the expected one, primary, candidates done — else stale_plan (the caller replans).
-- Then the evidence check, then the unchanged spec-2 publish_sync_run under the same locks
-- (stale_plan propagates; any failure rolls the whole call back). Returns the rows that became ok.
create or replace function public.publish_hk_run(p_issuer uuid, p_batch uuid, p_run uuid, p_manifest uuid[], p_expected_rev bigint, p_zero_output jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; v_manifest uuid[] := coalesce(p_manifest, '{}'::uuid[]); v_filings uuid[]; v_docs uuid[]; v_stale uuid;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_expected_rev is null then raise exception 'invalid_expected_rev' using errcode = '22023'; end if;
  if p_zero_output is null or jsonb_typeof(p_zero_output) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_zero_output) z
                where jsonb_typeof(z) <> 'object' or coalesce(z ->> 'document_id', '') !~* c_uuid or coalesce(z ->> 'extraction_id', '') !~* c_uuid) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'zero_output';
  end if;
  perform public.fact_scope_lock(p_issuer, 'HK', p_batch);
  select * into r from public.fact_sync_runs where run_id = p_run for update;
  if not found or r.issuer_id <> p_issuer or r.market <> 'HK' or r.batch_id <> p_batch or r.status <> 'staged' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'run';
  end if;
  select coalesce(array_agg(x.filing_id order by x.filing_id), '{}'::uuid[]) into v_filings from (
    select g.filing_id from public.filings g
    where g.issuer_id = p_issuer and g.market = 'HK'
      and (g.run_id = p_run or g.filing_id = any(v_manifest)
           or g.filing_id in (select f.filing_id from public.financial_facts f where f.run_id = p_run))
    order by g.filing_id for update of g) x;
  select coalesce(array_agg(x.document_id order by x.document_id), '{}'::uuid[]) into v_docs from (
    select fd.document_id from public.filing_documents fd where fd.filing_id = any(v_filings)
    order by fd.filing_id for update of fd) x;
  perform 1 from public.disclosure_documents d where d.document_id = any(v_docs) order by d.document_id for update of d;
  perform 1 from public.document_extractions e
  where e.extraction_id in (select (z ->> 'extraction_id')::uuid from jsonb_array_elements(p_zero_output) z)
  order by e.extraction_id for share of e;
  select x.document_id into v_stale from (
    select (z ->> 'document_id')::uuid as document_id, (z ->> 'extraction_id')::uuid as extraction_id from jsonb_array_elements(p_zero_output) z
  ) x
  where not exists (
    select 1 from public.disclosure_documents d
    join public.document_extractions e on e.extraction_id = d.current_extraction_id
    where d.document_id = x.document_id and d.document_id = any(v_docs)
      and d.issuer_id = p_issuer and d.source = 'hkexnews' and d.language = 'zh' and d.permission = 'public'
      and d.current_extraction_id = x.extraction_id and e.candidates_role = 'primary' and e.candidates_status = 'done')
  order by x.document_id limit 1;
  if v_stale is not null then
    raise exception 'stale_plan' using errcode = 'P0001', detail = 'zero_output:' || v_stale;
  end if;
  perform public.assert_run_evidence_complete(p_run);
  return public.publish_sync_run(p_run, v_manifest, p_expected_rev);
end $$;
revoke execute on function public.publish_hk_run(uuid, uuid, uuid, uuid[], bigint, jsonb) from public, anon, authenticated;
grant execute on function public.publish_hk_run(uuid, uuid, uuid, uuid[], bigint, jsonb) to service_role;

-- Requires a published run (staged → run_pending, abandoned → invalid_input, absent → not_found).
-- Locks the candidates behind this run's staged links (candidate_id order), then decides each link:
-- fact ok → published (candidate confirmed → promoted); fact quarantined → stays staged; fact gone →
-- abandoned. Idempotent: normal completion and crash recovery are the same call.
create or replace function public.finish_candidate_publications(p_run uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; v_pub int; v_ab int; v_still int;
begin
  select * into r from public.fact_sync_runs where run_id = p_run;
  if not found then raise exception 'not_found' using errcode = 'P0002', detail = 'run'; end if;
  if r.status = 'staged' then raise exception 'run_pending' using errcode = 'P0001'; end if;
  if r.status <> 'published' then raise exception 'invalid_input' using errcode = '22023', detail = 'run_abandoned'; end if;
  perform 1 from public.extraction_candidates c
  where c.candidate_id in (select cp.candidate_id from public.candidate_publications cp where cp.run_id = p_run and cp.state = 'staged')
  order by c.candidate_id for update of c;
  update public.candidate_publications cp set state = 'published', updated_at = now()
  from public.financial_facts f
  where cp.run_id = p_run and cp.state = 'staged' and f.fact_id = cp.fact_id and f.status = 'ok';
  get diagnostics v_pub = row_count;
  update public.extraction_candidates c set status = 'promoted'
  where c.status = 'confirmed'
    and exists (select 1 from public.candidate_publications cp where cp.candidate_id = c.candidate_id and cp.run_id = p_run and cp.state = 'published');
  update public.candidate_publications cp set state = 'abandoned', updated_at = now()
  where cp.run_id = p_run and cp.state = 'staged' and not exists (select 1 from public.financial_facts f where f.fact_id = cp.fact_id);
  get diagnostics v_ab = row_count;
  select count(*) into v_still from public.candidate_publications where run_id = p_run and state = 'staged';
  return jsonb_build_object('published', v_pub, 'still_staged', v_still, 'abandoned', v_ab);
end $$;
revoke execute on function public.finish_candidate_publications(uuid) from public, anon, authenticated;
grant execute on function public.finish_candidate_publications(uuid) to service_role;

-- Requires an abandoned run (staged → run_pending, published → invalid_input, absent → not_found):
-- every staged link of the run → abandoned (candidate statuses unchanged). Returns the count.
create or replace function public.abandon_candidate_publications(p_run uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int;
begin
  select * into r from public.fact_sync_runs where run_id = p_run;
  if not found then raise exception 'not_found' using errcode = 'P0002', detail = 'run'; end if;
  if r.status = 'staged' then raise exception 'run_pending' using errcode = 'P0001'; end if;
  if r.status <> 'abandoned' then raise exception 'invalid_input' using errcode = '22023', detail = 'run_published'; end if;
  perform 1 from public.extraction_candidates c
  where c.candidate_id in (select cp.candidate_id from public.candidate_publications cp where cp.run_id = p_run and cp.state = 'staged')
  order by c.candidate_id for update of c;
  update public.candidate_publications set state = 'abandoned', updated_at = now() where run_id = p_run and state = 'staged';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.abandon_candidate_publications(uuid) from public, anon, authenticated;
grant execute on function public.abandon_candidate_publications(uuid) to service_role;

-- R5-2, R5-11: spec-2 reconcile_fact_sync_scope refuses HK, so the HK lease row is created here —
-- unleased, priority 0 (never picked by spec-2 scopeDue), reasons ['documents'] — and an existing row
-- is never changed (schedule inputs, lease and state_rev stay as they are).
create or replace function public.ensure_hk_fact_scope(p_issuer uuid, p_fetch_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_issuer is null or p_fetch_key is null or p_fetch_key !~ '^[0-9]{5}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'fetch_key';
  end if;
  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
  values (p_issuer, 'HK', '["documents"]'::jsonb, 0, p_fetch_key)
  on conflict (issuer_id, market) do nothing;
end $$;
revoke execute on function public.ensure_hk_fact_scope(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_hk_fact_scope(uuid, text) to service_role;

-- Holder-only renewal of the HK fact lease (codex plan round 3 R3-P2-1; the landed spec-2 SQL has no
-- renewal: claim_fact_sync_lease also ACQUIRES an unowned or expired scope, so a delayed heartbeat
-- could re-take a lease the promotion had already released). Extends lease_until only while
-- p_batch holds an unexpired lease (a released scope has lease_batch_id null); otherwise false and
-- nothing changes. Never touches state_rev, schedule or outcome columns.
create or replace function public.renew_hk_fact_lease(p_issuer uuid, p_batch uuid, p_ttl_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 1 then raise exception 'invalid_input' using errcode = '22023', detail = 'ttl'; end if;
  update public.fact_sync_scope
  set lease_until = now() + make_interval(secs => p_ttl_seconds), updated_at = now()
  where issuer_id = p_issuer and market = 'HK' and lease_batch_id = p_batch and lease_until > now();
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke execute on function public.renew_hk_fact_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.renew_hk_fact_lease(uuid, uuid, int) to service_role;

-- R5-12: only financial_facts items whose member facts are all HK (or, with no member left, whose
-- payload.run_id is an HK run) — else not_hk_item, nothing changes. Calls the unchanged spec-2
-- resolve_facts_quarantine (its locks and checks as they are) and, in the same transaction, closes
-- the hook: detail.hook = {stage:'done', state:'done', at, message:'hk_no_metrics'} (HK is not
-- materialised, R5-3). Returns the spec-2 result.
create or replace function public.resolve_hk_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_ids uuid[]; v_markets text[]; v_run_market text; v_out jsonb;
begin
  select * into q from public.dq_quarantine where id = p_item;
  if not found then raise exception 'not_found' using errcode = 'P0002', detail = 'item'; end if;
  if q.table_name <> 'financial_facts' then raise exception 'not_hk_item' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  select coalesce(array_agg(distinct f.market), '{}'::text[]) into v_markets from public.financial_facts f where f.fact_id = any(v_ids);
  if cardinality(v_markets) = 0 then
    select r.market into v_run_market from public.fact_sync_runs r
    where r.run_id = case when coalesce(q.payload ->> 'run_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (q.payload ->> 'run_id')::uuid end;
    if v_run_market is distinct from 'HK' then raise exception 'not_hk_item' using errcode = 'P0001'; end if;
  elsif v_markets <> array['HK']::text[] then
    raise exception 'not_hk_item' using errcode = 'P0001';
  end if;
  v_out := public.resolve_facts_quarantine(p_item, p_chosen, p_resolved_by);
  update public.dq_quarantine
  set detail = detail || jsonb_build_object('hook', jsonb_build_object('stage', 'done', 'state', 'done', 'at', to_jsonb(now()), 'message', 'hk_no_metrics'))
  where id = p_item;
  return v_out;
end $$;
revoke execute on function public.resolve_hk_facts_quarantine(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.resolve_hk_facts_quarantine(uuid, uuid[], uuid) to service_role;

-- §4.11 promotionDue, at most p_limit (≤ 1000) issuers, due by any of (all conditions only count annual /
-- interim reports of issuers that are not merged and have an HKEX stock code, exactly the filters of
-- runHkFactsSync; ordered by the HK scope's last attempt, never-attempted first, then issuer_id, so an
-- issuer whose promotion keeps failing rotates behind healthy ones — Task 16 review F2):
-- (ab) an active candidate — financial_fact, rule, extractor_ref = p_extractor_ref, checks_passed,
--      confirmed|promoted, on the current extraction of a public Chinese HKEXnews document — without a
--      staged|published link under p_pub_gen;
-- (c)  a staged link under p_pub_gen that recovery can act on (crash recovery; a quarantined fact
--      that became ok or disappeared). A link whose run is published and whose fact is still
--      quarantined waits on the owner's decision — step 0a would leave it staged — and is NOT due,
--      so unchanged quarantine waits never occupy the batch (codex plan round 1 P2-6);
-- (d)  (R5-13) a public Chinese HKEXnews document whose current extraction is primary and done and
--      whose bound filing sits on 1 <= mapping_gen < p_pub_gen (zero-output generation activation).
create or replace function public.hk_promotion_due(p_pub_gen int, p_extractor_ref text, p_limit int)
returns uuid[] language sql stable security definer set search_path = public as $$
  with docs as (
    select d.document_id, d.issuer_id, d.current_extraction_id from public.disclosure_documents d
    join public.issuers i on i.issuer_id = d.issuer_id and i.status <> 'merged' and i.hkex_stock_code_primary is not null
    where d.source = 'hkexnews' and d.language = 'zh' and d.permission = 'public' and d.issuer_id is not null and d.current_extraction_id is not null
      and d.doc_class in ('annual_report','interim_report')
  ), ab as (
    select docs.issuer_id from docs
    join public.extraction_candidates c on c.extraction_id = docs.current_extraction_id and c.document_id = docs.document_id
    where c.kind = 'financial_fact' and c.extractor_kind = 'rule' and c.extractor_ref = p_extractor_ref and c.checks_passed
      and c.status in ('confirmed','promoted')
      and not exists (select 1 from public.candidate_publications cp where cp.candidate_id = c.candidate_id and cp.pub_gen = p_pub_gen and cp.state in ('staged','published'))
  ), staged as (
    select d.issuer_id from public.candidate_publications cp
    join public.extraction_candidates c on c.candidate_id = cp.candidate_id
    join public.disclosure_documents d on d.document_id = c.document_id
    join public.issuers i on i.issuer_id = d.issuer_id and i.status <> 'merged' and i.hkex_stock_code_primary is not null
    left join public.fact_sync_runs r on r.run_id = cp.run_id
    left join public.financial_facts f on f.fact_id = cp.fact_id
    where cp.pub_gen = p_pub_gen and cp.state = 'staged' and d.issuer_id is not null
      and d.source = 'hkexnews' and d.language = 'zh' and d.permission = 'public' and d.doc_class in ('annual_report','interim_report')
      and not (coalesce(r.status, '') = 'published' and coalesce(f.status, '') = 'quarantined')
  ), zero as (
    select docs.issuer_id from docs
    join public.document_extractions e on e.extraction_id = docs.current_extraction_id
    join public.filing_documents fd on fd.document_id = docs.document_id
    join public.filings g on g.filing_id = fd.filing_id
    where e.candidates_role = 'primary' and e.candidates_status = 'done' and g.mapping_gen >= 1 and g.mapping_gen < p_pub_gen
  )
  select coalesce(array_agg(x.issuer_id order by x.last_attempt_at asc nulls first, x.issuer_id), '{}'::uuid[]) from (
    select u.issuer_id, s.last_attempt_at from (
      select issuer_id from ab union select issuer_id from staged union select issuer_id from zero
    ) u left join public.fact_sync_scope s on s.issuer_id = u.issuer_id and s.market = 'HK'
    order by s.last_attempt_at asc nulls first, u.issuer_id limit least(greatest(coalesce(p_limit, 0), 0), 1000)
  ) x
$$;
revoke execute on function public.hk_promotion_due(int, text, int) from public, anon, authenticated;
grant execute on function public.hk_promotion_due(int, text, int) to service_role;

-- Condition (d) of hk_promotion_due for one issuer: the document ids, ascending.
create or replace function public.hk_zero_output_documents(p_issuer uuid, p_pub_gen int)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct d.document_id order by d.document_id), '{}'::uuid[])
  from public.disclosure_documents d
  join public.document_extractions e on e.extraction_id = d.current_extraction_id
  join public.filing_documents fd on fd.document_id = d.document_id
  join public.filings g on g.filing_id = fd.filing_id
  where d.issuer_id = p_issuer and d.source = 'hkexnews' and d.language = 'zh' and d.permission = 'public'
    and d.doc_class in ('annual_report','interim_report')
    and e.candidates_role = 'primary' and e.candidates_status = 'done' and g.mapping_gen >= 1 and g.mapping_gen < p_pub_gen
$$;
revoke execute on function public.hk_zero_output_documents(uuid, int) from public, anon, authenticated;
grant execute on function public.hk_zero_output_documents(uuid, int) to service_role;
