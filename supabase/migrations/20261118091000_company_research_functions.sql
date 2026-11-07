-- supabase/migrations/20261118091000_company_research_functions.sql
-- Company research functions (spec 2026-11-04 company research §4.6, §4.7, §0 #64 #70, §0.1 items 2–3;
-- plan 2026-11-06 Task 2). Writers (service_role): begin_company_digest_attempt,
-- replace_company_digest, mark_company_digest_failed, replace_company_fact_evidence. Readers:
-- company_digest_due / company_sweep_due / company_digest_backlog (service_role; fact_sync_scope is
-- service-read only, so the left join is one definer statement), company_fact_evidence (all client
-- roles; whitelisted columns of verified evidence for ok facts of published runs on the current
-- generation), company_read_snapshot (security INVOKER: read_facts envelope + the stream's filings in
-- ONE statement, so both come from one snapshot), company_list_coverage (invoker; sort by name needs
-- the issuers join before paging). Internal helpers are executable by no client role.
-- Lock discipline: every writer that depends on the fact state starts with the issuer's
-- fact_sync_scope row `for update` — the same row every facts publish/promotion/resolution locks —
-- then the company_digest_state row. Errors carry the code as the message (see plan Part A notes).
-- "Today" is the UTC date: (now() at time zone 'UTC')::date. Canonical JSON (company_canonical_json)
-- is byte-identical to src/lib/company/canonical.ts. Replayable: create or replace only.

-- ---------------------------------------------------------------- canonical JSON (§4.6 ⑤)
-- Keys in code-point order (collate "C" = UTF-8 byte order), no whitespace, strings via to_json(text)
-- (escapes exactly like JSON.stringify), numbers only as safe integers.
create or replace function public.company_canonical_json(p jsonb)
returns text language plpgsql immutable strict set search_path = '' as $$
declare t text := jsonb_typeof(p); v_out text; v_num numeric;
begin
  if t = 'object' then
    select '{' || coalesce(string_agg(to_json(e.key)::text || ':' || public.company_canonical_json(e.value), ',' order by e.key collate "C"), '') || '}'
      into v_out from jsonb_each(p) e;
    return v_out;
  elsif t = 'array' then
    select '[' || coalesce(string_agg(public.company_canonical_json(e.value), ',' order by e.ord), '') || ']'
      into v_out from jsonb_array_elements(p) with ordinality as e(value, ord);
    return v_out;
  elsif t = 'string' then
    return to_json(p #>> '{}')::text;
  elsif t = 'number' then
    v_num := p::numeric;
    if v_num <> trunc(v_num) or abs(v_num) > 9007199254740991 then
      raise exception 'invalid_event' using errcode = '22023', detail = 'canonical JSON numbers must be safe integers';
    end if;
    return trunc(v_num)::text;
  elsif t = 'boolean' then
    return p::text;
  end if;
  return 'null';
end $$;

-- ---------------------------------------------------------------- event validation helpers (§4.6 ④)
-- Every failure: invalid_event (22023) with detail '<path>: <reason>'.
create or replace function public.company_ev_keys(p jsonb, p_required text[], p_optional text[], p_what text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': object expected';
  end if;
  if exists (select 1 from jsonb_object_keys(p) k where not (k = any(p_required) or k = any(coalesce(p_optional, '{}'::text[])))) then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': unexpected key';
  end if;
  if exists (select 1 from unnest(p_required) r where not (p ? r)) then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': missing key';
  end if;
end $$;

create or replace function public.company_ev_text(p jsonb, p_nullable boolean, p_what text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then
    if p_nullable then return null; end if;
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': required';
  end if;
  if jsonb_typeof(p) <> 'string' or length(p #>> '{}') not between 1 and 256 then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': string of 1..256 characters expected';
  end if;
  return p #>> '{}';
end $$;

create or replace function public.company_ev_date(p jsonb, p_nullable boolean, p_what text)
returns date language plpgsql stable set search_path = '' as $$
declare s text; d date;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    if p_nullable then return null; end if;
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': required';
  end if;
  s := case when jsonb_typeof(p) = 'string' then p #>> '{}' end;
  if s is null or s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': date YYYY-MM-DD expected';
  end if;
  begin
    d := to_date(s, 'YYYY-MM-DD');
  exception when others then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': date YYYY-MM-DD expected';
  end;
  if to_char(d, 'YYYY-MM-DD') <> s then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': date YYYY-MM-DD expected';
  end if;
  return d;
end $$;

create or replace function public.company_ev_int(p jsonb, p_nullable boolean, p_min bigint, p_what text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    if p_nullable then return null; end if;
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': required';
  end if;
  if jsonb_typeof(p) = 'number' then v := p::numeric; end if;
  if v is null or v <> trunc(v) or v < p_min or v > 2147483647 then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': integer >= ' || p_min || ' expected';
  end if;
  return v::bigint;
end $$;

create or replace function public.company_ev_uuid(p jsonb, p_nullable boolean, p_what text)
returns uuid language plpgsql immutable set search_path = '' as $$
declare s text;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    if p_nullable then return null; end if;
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': required';
  end if;
  s := case when jsonb_typeof(p) = 'string' then p #>> '{}' end;
  if s is null or s !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': uuid (lowercase canonical form) expected';
  end if;
  return s::uuid;
end $$;

-- A fact visible in the stream today: ok, its filing on the fact's generation, available by today.
create or replace function public.company_ev_fact(p_issuer uuid, p_market text, p_ref jsonb, p_today date, p_what text)
returns public.financial_facts language plpgsql stable set search_path = '' as $$
declare v_id uuid := public.company_ev_uuid(p_ref, false, p_what); f public.financial_facts;
begin
  select x.* into f
  from public.financial_facts x join public.filings g on g.filing_id = x.filing_id and g.mapping_gen = x.mapping_gen
  where x.fact_id = v_id and x.issuer_id = p_issuer and x.market = p_market and x.status = 'ok' and x.available_date <= p_today;
  if not found then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': fact not visible in this stream (ok, current generation, available by today)';
  end if;
  return f;
end $$;

-- A filing of the stream with an active generation, available by today.
create or replace function public.company_ev_filing(p_issuer uuid, p_market text, p_ref jsonb, p_today date, p_what text)
returns public.filings language plpgsql stable set search_path = '' as $$
declare v_id uuid := public.company_ev_uuid(p_ref, false, p_what); g public.filings;
begin
  select x.* into g from public.filings x
  where x.filing_id = v_id and x.issuer_id = p_issuer and x.market = p_market and x.mapping_gen > 0 and x.available_date <= p_today;
  if not found then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': filing not in this stream (active generation, available by today)';
  end if;
  return g;
end $$;

-- One side of a revision edge: {factId, value, filingId, availableDate}, value = value_text.
create or replace function public.company_ev_side(p_issuer uuid, p_market text, p jsonb, p_today date, p_what text)
returns public.financial_facts language plpgsql stable set search_path = '' as $$
declare f public.financial_facts;
begin
  perform public.company_ev_keys(p, array['factId','value','filingId','availableDate'], null, p_what);
  f := public.company_ev_fact(p_issuer, p_market, p -> 'factId', p_today, p_what || '.factId');
  if public.company_ev_text(p -> 'value', false, p_what || '.value') <> f.value_text
     or public.company_ev_uuid(p -> 'filingId', false, p_what || '.filingId') <> f.filing_id
     or public.company_ev_date(p -> 'availableDate', false, p_what || '.availableDate') <> f.available_date then
    raise exception 'invalid_event' using errcode = '22023', detail = p_what || ': value differs from value_text, or filingId/availableDate differ from the fact';
  end if;
  return f;
end $$;

-- The fixed per-kind schema (plan §事件 payload 固定 schema + Part A Task 2 table).
create or replace function public.company_ev_check(p_issuer uuid, p_market text, e jsonb, p_today date)
returns void language plpgsql stable set search_path = '' as $$
declare
  c_headline constant text[] := array['revenue','revenue_operating','net_income_parent','operating_cash_flow'];
  v_kind text; v_nk text; v_occ date; v_pend date; v_concept text; v_filing uuid;
  p jsonb; m jsonb; g public.filings; f public.financial_facts; t public.financial_facts;
  v_ps date; v_pe date; v_dur text; v_n bigint; h record;
begin
  perform public.company_ev_keys(e, array['kind','natural_key','occurred_on','period_end','concept','filing_id','payload','meta'], null, 'event');
  v_kind := public.company_ev_text(e -> 'kind', false, 'kind');
  v_nk := public.company_ev_text(e -> 'natural_key', false, 'natural_key');
  v_occ := public.company_ev_date(e -> 'occurred_on', false, 'occurred_on');
  v_pend := public.company_ev_date(e -> 'period_end', true, 'period_end');
  v_concept := public.company_ev_text(e -> 'concept', true, 'concept');
  v_filing := public.company_ev_uuid(e -> 'filing_id', true, 'filing_id');
  p := e -> 'payload'; m := e -> 'meta';
  if v_occ > p_today then
    raise exception 'invalid_event' using errcode = '22023', detail = 'occurred_on: after today';
  end if;

  if v_kind = 'filing_published' then
    perform public.company_ev_keys(p, array['formType','fiscalYear','fiscalPeriod','periodEnd','availableDate','sourceRef','factCount'], null, 'payload');
    perform public.company_ev_keys(m, '{}'::text[], null, 'meta');
    g := public.company_ev_filing(p_issuer, p_market, e -> 'filing_id', p_today, 'filing_id');
    if v_nk <> g.filing_id::text or v_occ <> g.available_date or v_pend is distinct from g.period_end or v_concept is not null then
      raise exception 'invalid_event' using errcode = '22023', detail = 'filing_published: natural_key/occurred_on/period_end/concept must be filing_id/available_date/period_end/null';
    end if;
    if public.company_ev_text(p -> 'formType', false, 'payload.formType') <> g.form_type
       or public.company_ev_int(p -> 'fiscalYear', true, 0, 'payload.fiscalYear') is distinct from g.fiscal_year::bigint
       or public.company_ev_text(p -> 'fiscalPeriod', true, 'payload.fiscalPeriod') is distinct from g.fiscal_period
       or public.company_ev_date(p -> 'periodEnd', true, 'payload.periodEnd') is distinct from g.period_end
       or public.company_ev_date(p -> 'availableDate', false, 'payload.availableDate') <> g.available_date
       or public.company_ev_text(p -> 'sourceRef', false, 'payload.sourceRef') <> g.source_ref then
      raise exception 'invalid_event' using errcode = '22023', detail = 'filing_published: payload differs from the filing';
    end if;
    select count(*) into v_n from public.financial_facts x where x.filing_id = g.filing_id and x.status = 'ok' and x.mapping_gen = g.mapping_gen;
    if public.company_ev_int(p -> 'factCount', false, 0, 'payload.factCount') <> v_n then
      raise exception 'invalid_event' using errcode = '22023', detail = 'payload.factCount: differs from the visible facts of the filing';
    end if;

  elsif v_kind = 'period_first_seen' then
    perform public.company_ev_keys(p, array['periodStart','periodEnd','duration','filingId','conceptCount','headline','ambiguousUnits'], null, 'payload');
    perform public.company_ev_keys(m, array['headlineAsOf'], null, 'meta');
    v_ps := public.company_ev_date(p -> 'periodStart', false, 'payload.periodStart');
    v_pe := public.company_ev_date(p -> 'periodEnd', false, 'payload.periodEnd');
    v_dur := public.company_ev_text(p -> 'duration', false, 'payload.duration');
    if v_dur not in ('3M','6M','9M','12M','INSTANT') or (v_dur = 'INSTANT') <> (v_ps = v_pe) or v_ps > v_pe then
      raise exception 'invalid_event' using errcode = '22023', detail = 'payload.duration: 3M/6M/9M/12M/INSTANT with periodStart = periodEnd exactly for INSTANT';
    end if;
    if v_nk <> to_char(v_ps, 'YYYY-MM-DD') || ':' || to_char(v_pe, 'YYYY-MM-DD') || ':' || v_dur or v_pend is distinct from v_pe or v_concept is not null then
      raise exception 'invalid_event' using errcode = '22023', detail = 'period_first_seen: natural_key/period_end/concept must be periodStart:periodEnd:duration/periodEnd/null';
    end if;
    g := public.company_ev_filing(p_issuer, p_market, p -> 'filingId', p_today, 'payload.filingId');
    if v_filing is distinct from g.filing_id or v_occ <> g.available_date then
      raise exception 'invalid_event' using errcode = '22023', detail = 'period_first_seen: filing_id/occurred_on must be payload.filingId and its available_date';
    end if;
    perform public.company_ev_int(p -> 'conceptCount', false, 1, 'payload.conceptCount');
    if public.company_ev_date(m -> 'headlineAsOf', false, 'meta.headlineAsOf') > p_today then
      raise exception 'invalid_event' using errcode = '22023', detail = 'meta.headlineAsOf: after today';
    end if;
    perform public.company_ev_keys(p -> 'headline', '{}'::text[], c_headline, 'payload.headline');
    for h in select x.key, x.value from jsonb_each(p -> 'headline') x loop
      perform public.company_ev_keys(h.value, array['factId','value','unit'], null, 'payload.headline.' || h.key);
      f := public.company_ev_fact(p_issuer, p_market, h.value -> 'factId', p_today, 'payload.headline.' || h.key || '.factId');
      if f.concept <> h.key
         or f.value_text <> public.company_ev_text(h.value -> 'value', false, 'payload.headline.' || h.key || '.value')
         or f.unit <> public.company_ev_text(h.value -> 'unit', false, 'payload.headline.' || h.key || '.unit')
         or coalesce(f.period_start, f.period_end) <> v_ps or f.period_end <> v_pe or f.duration <> v_dur or f.consolidation <> 'consolidated' then
        raise exception 'invalid_event' using errcode = '22023', detail = 'payload.headline.' || h.key || ': value differs from value_text, or the fact is not this concept and period';
      end if;
    end loop;
    if jsonb_typeof(p -> 'ambiguousUnits') <> 'array' then
      raise exception 'invalid_event' using errcode = '22023', detail = 'payload.ambiguousUnits: distinct headline concepts absent from headline expected';
    end if;
    if exists (select 1 from jsonb_array_elements(p -> 'ambiguousUnits') x
                  where jsonb_typeof(x) <> 'string' or not ((x #>> '{}') = any(c_headline)) or (p -> 'headline') ? (x #>> '{}'))
       or (select count(*) from jsonb_array_elements(p -> 'ambiguousUnits')) <> (select count(distinct x) from jsonb_array_elements(p -> 'ambiguousUnits') x) then
      raise exception 'invalid_event' using errcode = '22023', detail = 'payload.ambiguousUnits: distinct headline concepts absent from headline expected';
    end if;

  elsif v_kind = 'fact_revised' then
    perform public.company_ev_keys(p, array['concept','statement','periodStart','periodEnd','duration','consolidation','unit','from','to'], array['relChange'], 'payload');
    perform public.company_ev_keys(m, '{}'::text[], null, 'meta');
    f := public.company_ev_side(p_issuer, p_market, p -> 'from', p_today, 'payload.from');
    t := public.company_ev_side(p_issuer, p_market, p -> 'to', p_today, 'payload.to');
    v_ps := public.company_ev_date(p -> 'periodStart', false, 'payload.periodStart');
    v_pe := public.company_ev_date(p -> 'periodEnd', false, 'payload.periodEnd');
    v_dur := public.company_ev_text(p -> 'duration', false, 'payload.duration');
    if f.fact_id = t.fact_id or f.available_date > t.available_date or f.value = t.value then
      raise exception 'invalid_event' using errcode = '22023', detail = 'payload.from/to: not a revision (distinct facts, from no later than to, different values)';
    end if;
    if public.company_ev_text(p -> 'concept', false, 'payload.concept') <> t.concept or f.concept <> t.concept
       or public.company_ev_text(p -> 'statement', false, 'payload.statement') <> t.statement or f.statement <> t.statement
       or v_ps <> coalesce(t.period_start, t.period_end) or v_ps <> coalesce(f.period_start, f.period_end)
       or v_pe <> t.period_end or v_pe <> f.period_end or v_dur <> t.duration or v_dur <> f.duration
       or public.company_ev_text(p -> 'consolidation', false, 'payload.consolidation') <> 'consolidated' or t.consolidation <> 'consolidated' or f.consolidation <> 'consolidated'
       or public.company_ev_text(p -> 'unit', false, 'payload.unit') <> t.unit or f.unit <> t.unit then
      raise exception 'invalid_event' using errcode = '22023', detail = 'payload: from/to and the payload are not one natural key';
    end if;
    if v_nk <> t.concept || ':' || to_char(v_ps, 'YYYY-MM-DD') || ':' || to_char(v_pe, 'YYYY-MM-DD') || ':consolidated:' || t.unit || ':' || to_char(t.available_date, 'YYYY-MM-DD')
       or v_occ <> t.available_date or v_pend is distinct from v_pe or v_concept is distinct from t.concept or v_filing is distinct from t.filing_id then
      raise exception 'invalid_event' using errcode = '22023', detail = 'fact_revised: natural_key/occurred_on/period_end/concept/filing_id must follow the to side';
    end if;
    if (p ? 'relChange') <> (f.value <> 0) then
      raise exception 'invalid_event' using errcode = '22023', detail = 'payload.relChange: present exactly when from is non-zero, as a plain decimal';
    end if;
    if p ? 'relChange' then   -- nested, not AND: plpgsql does not guarantee short-circuit order
      if public.company_ev_text(p -> 'relChange', false, 'payload.relChange') !~ '^-?[0-9]+(\.[0-9]+)?$' then
        raise exception 'invalid_event' using errcode = '22023', detail = 'payload.relChange: present exactly when from is non-zero, as a plain decimal';
      end if;
    end if;

  else
    raise exception 'invalid_event' using errcode = '22023', detail = 'kind: unknown event kind';
  end if;
end $$;

-- CoverageInput: exactly nine keys (§4.2).
create or replace function public.company_cov_check(p jsonb)
returns void language plpgsql stable set search_path = '' as $$
declare v_ts timestamptz;
begin
  perform public.company_ev_keys(p, array['filings_count','facts_count','concepts_covered','earliest_period_end','latest_period_end','latest_available_date','citation_summary','scope_last_success_at','scope_last_status'], null, 'coverage');
  perform public.company_ev_int(p -> 'filings_count', false, 0, 'coverage.filings_count');
  perform public.company_ev_int(p -> 'facts_count', false, 0, 'coverage.facts_count');
  perform public.company_ev_int(p -> 'concepts_covered', false, 0, 'coverage.concepts_covered');
  perform public.company_ev_date(p -> 'earliest_period_end', true, 'coverage.earliest_period_end');
  perform public.company_ev_date(p -> 'latest_period_end', true, 'coverage.latest_period_end');
  perform public.company_ev_date(p -> 'latest_available_date', true, 'coverage.latest_available_date');
  perform public.company_ev_keys(p -> 'citation_summary', array['linked','pending','edgar'], null, 'coverage.citation_summary');
  perform public.company_ev_int(p -> 'citation_summary' -> 'linked', false, 0, 'coverage.citation_summary.linked');
  perform public.company_ev_int(p -> 'citation_summary' -> 'pending', false, 0, 'coverage.citation_summary.pending');
  perform public.company_ev_int(p -> 'citation_summary' -> 'edgar', false, 0, 'coverage.citation_summary.edgar');
  if public.company_ev_text(p -> 'scope_last_status', true, 'coverage.scope_last_status') not in ('success','failed') then
    raise exception 'invalid_event' using errcode = '22023', detail = 'coverage.scope_last_status: success, failed or null expected';
  end if;
  if jsonb_typeof(p -> 'scope_last_success_at') = 'string' then
    begin
      v_ts := (p ->> 'scope_last_success_at')::timestamptz;
    exception when others then
      raise exception 'invalid_event' using errcode = '22023', detail = 'coverage.scope_last_success_at: timestamp or null expected';
    end;
  elsif jsonb_typeof(p -> 'scope_last_success_at') <> 'null' then
    raise exception 'invalid_event' using errcode = '22023', detail = 'coverage.scope_last_success_at: timestamp or null expected';
  end if;
end $$;

-- ---------------------------------------------------------------- 4.6 digest writers
create or replace function public.begin_company_digest_attempt(p_issuer uuid, p_market text, p_now timestamptz)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if p_now is null then raise exception 'invalid_now' using errcode = '22023'; end if;
  if not exists (select 1 from public.fact_sync_scope s where s.issuer_id = p_issuer and s.market = p_market) then
    raise exception 'unknown_stream' using errcode = 'P0002';
  end if;
  insert into public.company_digest_state as s (issuer_id, market, attempt_seq, last_attempt_id, last_attempt_at)
  values (p_issuer, p_market, 1, 1, p_now)
  on conflict (issuer_id, market) do update
    set attempt_seq = s.attempt_seq + 1, last_attempt_id = s.attempt_seq + 1, last_attempt_at = p_now, updated_at = now()
  returning s.attempt_seq into v;
  return v;
end $$;

create or replace function public.replace_company_digest(
  p_issuer uuid, p_market text, p_batch uuid, p_attempt_id bigint, p_rebuild_id uuid, p_based_on_rev bigint,
  p_sweep boolean, p_events jsonb, p_coverage jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_rev bigint; s public.company_digest_state; e jsonb;
  n_up int; n_changed int; n_revived int; n_retired int; v_success boolean;
begin
  -- ① the scope row, exclusively (serialises with facts publish/promote/resolve and other digest writers)
  select x.state_rev into v_rev from public.fact_sync_scope x where x.issuer_id = p_issuer and x.market = p_market for update;
  if not found then raise exception 'unknown_stream' using errcode = 'P0002'; end if;
  -- ② fact version, then attempt ownership
  if p_based_on_rev is null or v_rev <> p_based_on_rev then raise exception 'stale_computation' using errcode = '55P03'; end if;
  select x.* into s from public.company_digest_state x where x.issuer_id = p_issuer and x.market = p_market for update;
  if not found or p_attempt_id is null or p_attempt_id < 1 or p_attempt_id > s.attempt_seq then
    raise exception 'invalid_attempt' using errcode = '22023';
  end if;
  if p_attempt_id < coalesce(s.last_success_attempt_id, 0) then raise exception 'stale_attempt' using errcode = 'P0001'; end if;
  -- ③ batch and rebuild id
  if not exists (select 1 from public.ingest_batches b where b.batch_id = p_batch and b.producer = 'company-digest' and b.status = 'running') then
    raise exception 'invalid_batch' using errcode = '22023';
  end if;
  if p_rebuild_id is null
     or exists (select 1 from public.issuer_events x where x.issuer_id = p_issuer and x.market = p_market and x.rebuild_id = p_rebuild_id)
     or exists (select 1 from public.issuer_coverage x where x.issuer_id = p_issuer and x.market = p_market and x.rebuild_id = p_rebuild_id) then
    raise exception 'invalid_event' using errcode = '22023', detail = 'rebuild_id: already used by this stream (one id per replace call)';
  end if;
  -- ④ validation
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'invalid_event' using errcode = '22023', detail = 'events: array expected';
  end if;
  for e in select x from jsonb_array_elements(p_events) x loop
    perform public.company_ev_check(p_issuer, p_market, e, v_today);
  end loop;
  if exists (select 1 from jsonb_array_elements(p_events) x group by x ->> 'kind', x ->> 'natural_key' having count(*) > 1) then
    raise exception 'invalid_event' using errcode = '22023', detail = 'events: duplicate (kind, natural_key)';
  end if;
  perform public.company_cov_check(p_coverage);
  -- ⑤ ⑥ server-side identities, upsert (first_seen_at never updated; payload_changed_at only on a hash change)
  with input as (
    select encode(sha256(convert_to(public.company_canonical_json(jsonb_build_object('issuer_id', p_issuer::text, 'market', p_market, 'kind', x ->> 'kind', 'natural_key', x ->> 'natural_key')), 'UTF8')), 'hex') as event_id,
           x ->> 'kind' as kind, x ->> 'natural_key' as natural_key, (x ->> 'occurred_on')::date as occurred_on, (x ->> 'period_end')::date as period_end,
           x ->> 'concept' as concept, (x ->> 'filing_id')::uuid as filing_id, x -> 'payload' as payload, x -> 'meta' as meta,
           encode(sha256(convert_to(public.company_canonical_json(x -> 'payload'), 'UTF8')), 'hex') as payload_hash
    from jsonb_array_elements(p_events) x
  ), old as (
    select o.event_id, o.payload_hash, o.retired_at from public.issuer_events o join input i on i.event_id = o.event_id
  ), up as (
    insert into public.issuer_events as t (event_id, issuer_id, market, kind, natural_key, occurred_on, period_end, concept, filing_id, payload, meta, payload_hash, based_on_rev, rebuild_id, rebuild_batch_id)
    select i.event_id, p_issuer, p_market, i.kind, i.natural_key, i.occurred_on, i.period_end, i.concept, i.filing_id, i.payload, i.meta, i.payload_hash, p_based_on_rev, p_rebuild_id, p_batch
    from input i
    on conflict (issuer_id, market, kind, natural_key) do update set
      occurred_on = excluded.occurred_on, period_end = excluded.period_end, concept = excluded.concept, filing_id = excluded.filing_id,
      payload = excluded.payload, meta = excluded.meta, payload_hash = excluded.payload_hash, based_on_rev = excluded.based_on_rev,
      rebuilt_at = now(), rebuild_id = excluded.rebuild_id, rebuild_batch_id = excluded.rebuild_batch_id,
      payload_changed_at = case when excluded.payload_hash <> t.payload_hash then now() else t.payload_changed_at end,
      retired_at = null
    returning t.event_id, t.payload_hash
  )
  select count(*)::int,
         (count(*) filter (where o.event_id is null or o.payload_hash <> u.payload_hash))::int,
         (count(*) filter (where o.retired_at is not null))::int
    into n_up, n_changed, n_revived
  from up u left join old o on o.event_id = u.event_id;
  -- ⑦ tombstones
  update public.issuer_events x set retired_at = now()
  where x.issuer_id = p_issuer and x.market = p_market and x.rebuild_id <> p_rebuild_id and x.retired_at is null;
  get diagnostics n_retired = row_count;
  -- test-only fault injection between the event and coverage writes (§12.2 (c))
  if current_setting('company.fail_after_events', true) = 'on' then
    raise exception 'company_test_fault' using errcode = 'P0001';
  end if;
  -- ⑧ coverage
  insert into public.issuer_coverage as c (issuer_id, market, filings_count, facts_count, concepts_covered, earliest_period_end, latest_period_end,
    latest_available_date, citation_summary, scope_last_success_at, scope_last_status, based_on_rev, rebuilt_at, rebuild_id, rebuild_batch_id)
  values (p_issuer, p_market, (p_coverage ->> 'filings_count')::int, (p_coverage ->> 'facts_count')::int, (p_coverage ->> 'concepts_covered')::int,
    (p_coverage ->> 'earliest_period_end')::date, (p_coverage ->> 'latest_period_end')::date, (p_coverage ->> 'latest_available_date')::date,
    jsonb_build_object('linked', (p_coverage -> 'citation_summary' ->> 'linked')::int, 'pending', (p_coverage -> 'citation_summary' ->> 'pending')::int, 'edgar', (p_coverage -> 'citation_summary' ->> 'edgar')::int),
    (p_coverage ->> 'scope_last_success_at')::timestamptz, p_coverage ->> 'scope_last_status', p_based_on_rev, now(), p_rebuild_id, p_batch)
  on conflict (issuer_id, market) do update set
    filings_count = excluded.filings_count, facts_count = excluded.facts_count, concepts_covered = excluded.concepts_covered,
    earliest_period_end = excluded.earliest_period_end, latest_period_end = excluded.latest_period_end, latest_available_date = excluded.latest_available_date,
    citation_summary = excluded.citation_summary, scope_last_success_at = excluded.scope_last_success_at, scope_last_status = excluded.scope_last_status,
    based_on_rev = excluded.based_on_rev, rebuilt_at = excluded.rebuilt_at, rebuild_id = excluded.rebuild_id, rebuild_batch_id = excluded.rebuild_batch_id;
  -- ⑨ state: the materialisation is always recorded; the failure state clears only if no newer attempt failed
  v_success := p_attempt_id > coalesce(s.last_failed_attempt_id, 0);
  update public.company_digest_state x set
    digested_rev = p_based_on_rev,
    last_success_attempt_id = greatest(coalesce(x.last_success_attempt_id, 0), p_attempt_id),
    last_status = case when v_success then 'success' else x.last_status end,
    consecutive_failures = case when v_success then 0 else x.consecutive_failures end,
    next_attempt_at = case when v_success then now() else x.next_attempt_at end,
    swept_at = case when v_success and coalesce(p_sweep, false) then now() else x.swept_at end,
    updated_at = now()
  where x.issuer_id = p_issuer and x.market = p_market;
  return jsonb_build_object('upserted', n_up, 'changed', n_changed, 'retired', n_retired, 'revived', n_revived);
end $$;

-- §4.6 + §0 #70: accepted only when newer than every recorded success AND failure.
create or replace function public.mark_company_digest_failed(p_issuer uuid, p_market text, p_attempt_id bigint, p_now timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.company_digest_state;
begin
  if p_now is null then raise exception 'invalid_now' using errcode = '22023'; end if;
  perform 1 from public.fact_sync_scope x where x.issuer_id = p_issuer and x.market = p_market for update;
  if not found then raise exception 'unknown_stream' using errcode = 'P0002'; end if;
  select x.* into s from public.company_digest_state x where x.issuer_id = p_issuer and x.market = p_market for update;
  if not found or p_attempt_id is null or p_attempt_id < 1 or p_attempt_id > s.attempt_seq then
    raise exception 'invalid_attempt' using errcode = '22023';
  end if;
  if p_attempt_id <= greatest(coalesce(s.last_success_attempt_id, 0), coalesce(s.last_failed_attempt_id, 0)) then
    return false;
  end if;
  update public.company_digest_state x set
    last_failed_attempt_id = p_attempt_id,
    consecutive_failures = s.consecutive_failures + 1,
    next_attempt_at = p_now + least(interval '24 hours', interval '1 hour' * power(2, least(s.consecutive_failures, 5))),
    last_status = 'failed',
    updated_at = now()
  where x.issuer_id = p_issuer and x.market = p_market;
  return true;
end $$;

-- ---------------------------------------------------------------- 4.7 selection (service_role)
create or replace function public.company_digest_due(p_now timestamptz, p_limit int, p_market text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('issuerId', x.issuer_id, 'market', x.market, 'stateRev', x.state_rev, 'digestedRev', x.digested_rev)
                            order by x.behind desc, x.issuer_id, x.market), '[]'::jsonb)
  from (
    select s.issuer_id, s.market, s.state_rev, coalesce(d.digested_rev, 0) as digested_rev, s.state_rev - coalesce(d.digested_rev, 0) as behind
    from public.fact_sync_scope s
    left join public.company_digest_state d on d.issuer_id = s.issuer_id and d.market = s.market
    where s.state_rev > coalesce(d.digested_rev, 0) and coalesce(d.next_attempt_at, 'epoch'::timestamptz) <= p_now
      and (p_market is null or s.market = p_market)   -- market filter inside the limit (plan audit Q6)
    order by 5 desc, s.issuer_id, s.market
    limit greatest(coalesce(p_limit, 0), 0)
  ) x
$$;

create or replace function public.company_sweep_due(p_older_than timestamptz, p_now timestamptz, p_limit int, p_market text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('issuerId', x.issuer_id, 'market', x.market, 'stateRev', x.state_rev, 'digestedRev', x.digested_rev)
                            order by x.swept_at asc nulls first, x.issuer_id, x.market), '[]'::jsonb)
  from (
    select s.issuer_id, s.market, s.state_rev, coalesce(d.digested_rev, 0) as digested_rev, d.swept_at
    from public.fact_sync_scope s
    left join public.company_digest_state d on d.issuer_id = s.issuer_id and d.market = s.market
    where s.state_rev > 0
      and (d.swept_at is null or d.swept_at < p_older_than)
      and coalesce(d.next_attempt_at, 'epoch'::timestamptz) <= p_now
      and (p_market is null or s.market = p_market)
    order by d.swept_at asc nulls first, s.issuer_id, s.market
    limit greatest(coalesce(p_limit, 0), 0)
  ) x
$$;

create or replace function public.company_digest_backlog()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.company_digest_state where last_status = 'failed'
$$;

-- ---------------------------------------------------------------- §0.1 item 2 evidence index
-- One EvidenceIndexRow (exactly its 15 keys). The fact must belong to the stream (any status); raw_hash
-- must equal the fact's raw_hash AND sha256(snapshot_sha256 || '\n' || hash_locator); source must be
-- the filing's; snapshot_path must be '<source>/<issuer_id>/<snapshot_sha256>.json'; params carry no
-- token. Failure: invalid_evidence (22023) with detail '<field>: <reason>'.
create or replace function public.company_evidence_check(p_issuer uuid, p_market text, r jsonb)
returns void language plpgsql stable set search_path = '' as $$
declare
  c_keys constant text[] := array['fact_id','raw_hash','snapshot_sha256','snapshot_path','hash_locator','json_pointer','field','source','api','url','params','captured_at','http_status','page','index_version'];
  f public.financial_facts; v_source text; v_ts timestamptz; v_bad text;
begin
  if r is null or jsonb_typeof(r) <> 'object'
     or exists (select 1 from jsonb_object_keys(r) k where not (k = any(c_keys)))
     or exists (select 1 from unnest(c_keys) k where not (r ? k)) then
    v_bad := 'row: exactly the EvidenceIndexRow keys expected';
  elsif jsonb_typeof(r -> 'fact_id') <> 'string' or (r ->> 'fact_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_bad := 'fact_id: uuid expected';
  end if;
  if v_bad is null then
    select x.* into f from public.financial_facts x where x.fact_id = (r ->> 'fact_id')::uuid and x.issuer_id = p_issuer and x.market = p_market;
    if not found then v_bad := 'fact_id: not a fact of this stream'; end if;
  end if;
  if v_bad is null then
    select g.source into v_source from public.filings g where g.filing_id = f.filing_id;
    if jsonb_typeof(r -> 'snapshot_sha256') <> 'string' or (r ->> 'snapshot_sha256') !~ '^[0-9a-f]{64}$' then
      v_bad := 'snapshot_sha256: 64 lowercase hex expected';
    elsif jsonb_typeof(r -> 'hash_locator') <> 'string' or length(r ->> 'hash_locator') not between 1 and 1024 then
      v_bad := 'hash_locator: string of 1..1024 characters expected';
    elsif jsonb_typeof(r -> 'raw_hash') <> 'string' or (r ->> 'raw_hash') <> f.raw_hash then
      v_bad := 'raw_hash: differs from the fact';
    elsif f.raw_hash <> encode(sha256(convert_to((r ->> 'snapshot_sha256') || chr(10) || (r ->> 'hash_locator'), 'UTF8')), 'hex') then
      v_bad := 'raw_hash: not sha256(snapshot_sha256 \n hash_locator)';
    elsif jsonb_typeof(r -> 'source') <> 'string' or (r ->> 'source') is distinct from v_source then
      v_bad := 'source: differs from the filing';
    elsif (r ->> 'snapshot_path') is distinct from v_source || '/' || p_issuer::text || '/' || (r ->> 'snapshot_sha256') || '.json' then
      v_bad := 'snapshot_path: <source>/<issuer_id>/<snapshot_sha256>.json expected';
    elsif jsonb_typeof(r -> 'json_pointer') <> 'string' or (r ->> 'json_pointer') !~ '^/' or length(r ->> 'json_pointer') > 1024 then
      v_bad := 'json_pointer: JSON pointer expected';
    elsif jsonb_typeof(r -> 'field') not in ('null','string') or length(r ->> 'field') not between 1 and 64 then
      v_bad := 'field: null or string of 1..64 characters expected';
    elsif jsonb_typeof(r -> 'api') not in ('null','string') or length(r ->> 'api') not between 1 and 64 then
      v_bad := 'api: null or string of 1..64 characters expected';
    elsif jsonb_typeof(r -> 'url') not in ('null','string') or length(r ->> 'url') not between 1 and 2048 then
      v_bad := 'url: null or string of 1..2048 characters expected';
    elsif jsonb_typeof(r -> 'params') not in ('null','object') then
      v_bad := 'params: null or object expected';
    elsif jsonb_typeof(r -> 'params') = 'object' and exists (select 1 from jsonb_object_keys(r -> 'params') k where k ilike '%token%') then
      v_bad := 'params: must not carry a token';
    elsif jsonb_typeof(r -> 'captured_at') not in ('null','string') then
      v_bad := 'captured_at: timestamp or null expected';
    elsif jsonb_typeof(r -> 'http_status') not in ('null','number')
          or (jsonb_typeof(r -> 'http_status') = 'number' and ((r ->> 'http_status')::numeric not between 100 and 599 or (r ->> 'http_status')::numeric <> trunc((r ->> 'http_status')::numeric))) then
      v_bad := 'http_status: integer 100..599 or null expected';
    elsif jsonb_typeof(r -> 'page') not in ('null','number')
          or (jsonb_typeof(r -> 'page') = 'number' and ((r ->> 'page')::numeric < 0 or (r ->> 'page')::numeric > 2147483647 or (r ->> 'page')::numeric <> trunc((r ->> 'page')::numeric))) then
      v_bad := 'page: non-negative integer or null expected';
    elsif jsonb_typeof(r -> 'index_version') <> 'string' or length(r ->> 'index_version') not between 1 and 64 then
      v_bad := 'index_version: string of 1..64 characters expected';
    end if;
  end if;
  if v_bad is null and jsonb_typeof(r -> 'captured_at') = 'string' then
    begin
      v_ts := (r ->> 'captured_at')::timestamptz;
    exception when others then
      v_bad := 'captured_at: timestamp or null expected';
    end;
  end if;
  if v_bad is not null then raise exception 'invalid_evidence' using errcode = '22023', detail = v_bad; end if;
end $$;

-- Whole-stream replacement: rows not in p_rows are deleted; every given row is (re)written with verified_at = now().
create or replace function public.replace_company_fact_evidence(p_issuer uuid, p_market text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; n_up int; n_del int;
begin
  perform 1 from public.fact_sync_scope x where x.issuer_id = p_issuer and x.market = p_market for update;
  if not found then raise exception 'unknown_stream' using errcode = 'P0002'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_evidence' using errcode = '22023', detail = 'rows: array expected';
  end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    perform public.company_evidence_check(p_issuer, p_market, r);
  end loop;
  if exists (select 1 from jsonb_array_elements(p_rows) x group by x ->> 'fact_id' having count(*) > 1) then
    raise exception 'invalid_evidence' using errcode = '22023', detail = 'rows: duplicate fact_id';
  end if;
  with up as (
    insert into public.company_fact_evidence as t (fact_id, issuer_id, market, raw_hash, snapshot_sha256, snapshot_path, hash_locator, json_pointer, field,
      source, api, url, params, captured_at, http_status, page, index_version, verified_at)
    select (x ->> 'fact_id')::uuid, p_issuer, p_market, x ->> 'raw_hash', x ->> 'snapshot_sha256', x ->> 'snapshot_path', x ->> 'hash_locator', x ->> 'json_pointer',
           x ->> 'field', x ->> 'source', x ->> 'api', x ->> 'url', case when jsonb_typeof(x -> 'params') = 'object' then x -> 'params' end,
           (x ->> 'captured_at')::timestamptz, (x ->> 'http_status')::int, (x ->> 'page')::int, x ->> 'index_version', now()
    from jsonb_array_elements(p_rows) x
    on conflict (fact_id) do update set
      issuer_id = excluded.issuer_id, market = excluded.market, raw_hash = excluded.raw_hash, snapshot_sha256 = excluded.snapshot_sha256,
      snapshot_path = excluded.snapshot_path, hash_locator = excluded.hash_locator, json_pointer = excluded.json_pointer, field = excluded.field,
      source = excluded.source, api = excluded.api, url = excluded.url, params = excluded.params, captured_at = excluded.captured_at,
      http_status = excluded.http_status, page = excluded.page, index_version = excluded.index_version, verified_at = excluded.verified_at
    returning 1
  )
  select count(*)::int into n_up from up;
  delete from public.company_fact_evidence x
  where x.issuer_id = p_issuer and x.market = p_market
    and not exists (select 1 from jsonb_array_elements(p_rows) y where (y ->> 'fact_id')::uuid = x.fact_id);
  get diagnostics n_del = row_count;
  return jsonb_build_object('upserted', n_up, 'deleted', n_del);
end $$;

-- Public read of verified evidence: ≤ 100 ids; only ok facts of published runs whose filing is on the
-- fact's generation; whitelisted columns + run → batch code_version/tool_versions + mapping_version.
create or replace function public.company_fact_evidence(p_fact_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if coalesce(cardinality(p_fact_ids), 0) > 100 then
    raise exception 'invalid_read' using errcode = '22023', detail = 'at most 100 fact ids per call';
  end if;
  select coalesce(jsonb_object_agg(e.fact_id::text, jsonb_build_object(
      'fact_id', e.fact_id, 'raw_hash', e.raw_hash, 'snapshot_sha256', e.snapshot_sha256, 'snapshot_path', e.snapshot_path,
      'hash_locator', e.hash_locator, 'json_pointer', e.json_pointer, 'field', e.field, 'source', e.source, 'api', e.api, 'url', e.url,
      'params', e.params, 'captured_at', e.captured_at, 'http_status', e.http_status, 'page', e.page, 'index_version', e.index_version,
      'run_id', f.run_id, 'code_version', b.code_version, 'tool_versions', b.tool_versions, 'mapping_version', f.mapping_version)), '{}'::jsonb)
    into v
  from public.company_fact_evidence e
  join public.financial_facts f on f.fact_id = e.fact_id and f.status = 'ok'
  join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
  join public.fact_sync_runs r on r.run_id = f.run_id and r.status = 'published'
  join public.ingest_batches b on b.batch_id = r.batch_id
  where e.fact_id = any(coalesce(p_fact_ids, '{}'::uuid[]));
  return v;
end $$;

-- ---------------------------------------------------------------- §0.1 item 3 same-snapshot read
-- security INVOKER: the caller's RLS applies (anon sees ok facts only); filings and factCount filter
-- explicitly anyway (service_role's RLS also shows staged rows). One SELECT → one snapshot.
create or replace function public.company_read_snapshot(
  p_issuer uuid, p_market text, p_concepts text[], p_as_of date, p_from date, p_to date, p_history boolean, p_limit int)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'facts', public.read_facts(p_issuer, p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, false),
    'filings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'filingId', g.filing_id, 'formType', g.form_type, 'fiscalYear', g.fiscal_year, 'fiscalPeriod', g.fiscal_period,
          'periodEnd', g.period_end, 'availableDate', g.available_date, 'sourceRef', g.source_ref, 'source', g.source,
          'url', g.url, 'documentUrl', g.document_url,
          'citation', case when g.market = 'US' then 'edgar' when coalesce(g.document_ref, '') <> '' then 'linked' else 'pending' end,
          'linkAttempts', g.link_attempts,
          'factCount', (select count(*) from public.financial_facts f
                        where f.filing_id = g.filing_id and f.status = 'ok' and f.mapping_gen = g.mapping_gen and f.available_date <= p_as_of),
          'mappingGen', g.mapping_gen)
        order by g.available_date desc, g.filing_id)
      from public.filings g
      where g.issuer_id = p_issuer and g.market = p_market and g.mapping_gen > 0 and g.available_date <= p_as_of), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- coverage directory read
create or replace function public.company_list_coverage(p_market text, p_issuer_ids uuid[], p_sort text, p_offset int, p_limit int)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_rows jsonb; v_total int;
begin
  if p_sort is null or p_sort not in ('latest_available_date','latest_period_end','name') then
    raise exception 'invalid_read' using errcode = '22023', detail = 'sort: latest_available_date, latest_period_end or name';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid_read' using errcode = '22023', detail = 'page: offset >= 0, limit 1..200';
  end if;
  if p_market is not null and p_market not in ('US','CN') then
    raise exception 'invalid_read' using errcode = '22023', detail = 'market: US, CN or null';
  end if;
  select count(*)::int into v_total from public.issuer_coverage c
  where (p_market is null or c.market = p_market) and (p_issuer_ids is null or c.issuer_id = any(p_issuer_ids));
  select coalesce(jsonb_agg(to_jsonb(x.cov) order by x.rn), '[]'::jsonb) into v_rows
  from (
    select c as cov, row_number() over (order by
        case when p_sort = 'latest_available_date' then c.latest_available_date end desc nulls last,
        case when p_sort = 'latest_period_end' then c.latest_period_end end desc nulls last,
        case when p_sort = 'name' then coalesce(i.canonical_name_en, i.canonical_name_zh) end collate "C" asc,
        c.issuer_id, c.market) as rn
    from public.issuer_coverage c
    join public.issuers i on i.issuer_id = c.issuer_id
    where (p_market is null or c.market = p_market) and (p_issuer_ids is null or c.issuer_id = any(p_issuer_ids))
  ) x
  where x.rn > p_offset and x.rn <= p_offset + p_limit;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- ---------------------------------------------------------------- execute privileges
do $$ declare f text; begin
  foreach f in array array[
    'public.company_canonical_json(jsonb)', 'public.company_ev_keys(jsonb,text[],text[],text)', 'public.company_ev_text(jsonb,boolean,text)',
    'public.company_ev_date(jsonb,boolean,text)', 'public.company_ev_int(jsonb,boolean,bigint,text)', 'public.company_ev_uuid(jsonb,boolean,text)',
    'public.company_ev_fact(uuid,text,jsonb,date,text)', 'public.company_ev_filing(uuid,text,jsonb,date,text)', 'public.company_ev_side(uuid,text,jsonb,date,text)',
    'public.company_ev_check(uuid,text,jsonb,date)', 'public.company_cov_check(jsonb)', 'public.company_evidence_check(uuid,text,jsonb)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.begin_company_digest_attempt(uuid,text,timestamptz)', 'public.replace_company_digest(uuid,text,uuid,bigint,uuid,bigint,boolean,jsonb,jsonb)',
    'public.mark_company_digest_failed(uuid,text,bigint,timestamptz)', 'public.replace_company_fact_evidence(uuid,text,jsonb)',
    'public.company_digest_due(timestamptz,int,text)', 'public.company_sweep_due(timestamptz,timestamptz,int,text)', 'public.company_digest_backlog()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.company_fact_evidence(uuid[])', 'public.company_read_snapshot(uuid,text,text[],date,date,date,boolean,int)',
    'public.company_list_coverage(text,uuid[],text,int,int)'] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;
