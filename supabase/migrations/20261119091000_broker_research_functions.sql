-- supabase/migrations/20261119091000_broker_research_functions.sql
-- FR-0 (spec §4.4–§4.8, §6.2, §6.3, §6.5, §7.3, §10.2): every SQL function of the broker research
-- module and the triggers that depend on them. Hashes are computed HERE only (plan 契约补充):
-- broker_report_live_digests recomputes effective_hash / rules_input_hash / summary_input_digest
-- from the live tables; materialize stores them; publish_blockers #11 compares stored vs live.
-- Lock order everywhere: licence (share) → document → report → quarantine item is never taken
-- after a report lock except in broker_quarantine_resolve (item → report), which no other path
-- reverses. Every report-changing RPC starts with broker_lock_draft (select … for update; published
-- → published_immutable; withdrawn → report_withdrawn).
-- Errors: raise exception '<code>[:<detail>]' (lease_lost uses 55P03, not-found codes P0002).
-- Every client-callable function: revoke execute from public, anon, authenticated; grant to
-- service_role. Internal helpers: revoked from service_role too (they run inside security definer
-- callers as the owner). Trigger functions are security definer so they may call the helpers.
-- Replayable: create or replace function, drop trigger if exists + create trigger.

-- ---------------------------------------------------------------- helpers
create or replace function public.broker_sha256(p text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;
revoke execute on function public.broker_sha256(text) from public, anon, authenticated, service_role;

-- Effective value selector (spec §4.6): for each component a present `corrected` key wins (JSON
-- null = explicit clear), a missing key inherits the extracted value. value_num/value_date come
-- back as JSON strings ('120.50', '2026-01-02'). The §4.11 views inline the same rule.
create or replace function public.broker_field_effective(p_corrected jsonb, p_value_text text, p_value_num numeric, p_value_currency text, p_value_unit text, p_value_date date)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'value_text',     case when p_corrected ? 'value_text'     then p_corrected -> 'value_text'     else to_jsonb(p_value_text) end,
    'value_num',      case when p_corrected ? 'value_num'      then p_corrected -> 'value_num'      else to_jsonb(p_value_num::text) end,
    'value_currency', case when p_corrected ? 'value_currency' then p_corrected -> 'value_currency' else to_jsonb(p_value_currency) end,
    'value_unit',     case when p_corrected ? 'value_unit'     then p_corrected -> 'value_unit'     else to_jsonb(p_value_unit) end,
    'value_date',     case when p_corrected ? 'value_date'     then p_corrected -> 'value_date'     else to_jsonb(p_value_date::text) end)
$$;
revoke execute on function public.broker_field_effective(jsonb, text, numeric, text, text, date) from public, anon, authenticated;
grant execute on function public.broker_field_effective(jsonb, text, numeric, text, text, date) to service_role;

create or replace function public.broker_lock_draft(p_report_id uuid) returns public.broker_research_reports
language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports;
begin
  select * into r from public.broker_research_reports where report_id = p_report_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  if r.status = 'published' then raise exception 'published_immutable'; end if;
  if r.status = 'withdrawn' then raise exception 'report_withdrawn'; end if;
  return r;
end $$;
revoke execute on function public.broker_lock_draft(uuid) from public, anon, authenticated, service_role;

-- Picks (spec §6.2/§6.3): every effective row (confirmed/corrected/absent), plus every live
-- candidate (extracted/unverified, not superseded) whose identity (target_key, field, occurrence)
-- has no effective row AND exactly one live candidate. A conflict (>= 2 candidates) yields nothing.
create or replace function public.broker_report_picks(p_report_id uuid)
returns table(target_key text, field text, occurrence integer, field_id uuid, status text, is_eff boolean, v jsonb, detail jsonb)
language sql stable security definer set search_path = public as $$
  with eff as (
    select f.target_key, f.field, f.occurrence, f.field_id, f.status, true as is_eff,
           public.broker_field_effective(f.corrected, f.value_text, f.value_num, f.value_currency, f.value_unit, f.value_date) as v, f.detail
    from public.broker_report_fields f
    where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent')
  ), cand as (
    select f.target_key, f.field, f.occurrence, f.field_id, f.status, false as is_eff,
           public.broker_field_effective(null, f.value_text, f.value_num, f.value_currency, f.value_unit, f.value_date) as v, f.detail,
           count(*) over (partition by coalesce(f.target_key, ''), f.field, f.occurrence) as n
    from public.broker_report_fields f
    where f.report_id = p_report_id and f.status in ('extracted','unverified') and f.superseded_by_run_id is null
      and not exists (select 1 from public.broker_report_fields e
                      where e.report_id = f.report_id and e.status in ('confirmed','corrected','absent')
                        and coalesce(e.target_key, '') = coalesce(f.target_key, '') and e.field = f.field and e.occurrence = f.occurrence)
  )
  select e.target_key, e.field, e.occurrence, e.field_id, e.status, e.is_eff, e.v, e.detail from eff e
  union all
  select c.target_key, c.field, c.occurrence, c.field_id, c.status, c.is_eff, c.v, c.detail from cand c where c.n = 1
$$;
revoke execute on function public.broker_report_picks(uuid) from public, anon, authenticated, service_role;

-- The effective rows as one canonical jsonb array (ordered by identity under C collation).
create or replace function public.broker_report_effective_rows(p_report_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'field_id', f.field_id, 'target_key', f.target_key, 'field', f.field, 'occurrence', f.occurrence, 'status', f.status,
           'extractor', f.extractor, 'parse_run_id', f.parse_run_id, 'run_id', f.run_id, 'page', f.page, 'char_start', f.char_start, 'char_end', f.char_end,
           'value', public.broker_field_effective(f.corrected, f.value_text, f.value_num, f.value_currency, f.value_unit, f.value_date))
         order by coalesce(f.target_key, '') collate "C", f.field collate "C", f.occurrence), '[]'::jsonb)
  from public.broker_report_fields f
  where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent')
$$;
revoke execute on function public.broker_report_effective_rows(uuid) from public, anon, authenticated, service_role;

-- Live digests (spec §4.4, §6.3 step 3): effective_hash; rules_input_hash over every rules input
-- (plan Part A 设计决定); summary_input_digest = sha256(effective_hash|artifact_hash|institution_id|title_public).
create or replace function public.broker_report_live_digests(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.broker_research_reports; d public.broker_report_documents; l public.broker_report_licences;
        v_eff jsonb; v_eff_hash text; v_art text; v_rules jsonb;
begin
  select * into r from public.broker_research_reports where report_id = p_report_id;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  select * into d from public.broker_report_documents where document_id = r.document_id;
  select * into l from public.broker_report_licences where licence_id = d.licence_id;
  v_eff := public.broker_report_effective_rows(p_report_id);
  v_eff_hash := public.broker_sha256(v_eff::text);
  select ru.artifact_hash into v_art from public.broker_report_runs ru where ru.run_id = d.current_parse_run_id;
  v_rules := jsonb_build_object(
    'rules_version', 'broker-rules/1',
    'effective', v_eff,
    'targets', (select coalesce(jsonb_agg(to_jsonb(t) - 'input_hash' order by t.target_key collate "C"), '[]'::jsonb) from public.broker_report_targets t where t.report_id = p_report_id),
    'overrides', (select coalesce(jsonb_agg(jsonb_build_object('override_id', o.override_id, 'target_key', o.target_key, 'security_ticker', o.security_ticker, 'issuer_id', o.issuer_id) order by o.target_key collate "C"), '[]'::jsonb)
                  from public.broker_report_target_overrides o where o.report_id = p_report_id),
    'scales', (select coalesce(jsonb_agg(to_jsonb(s) order by s.scale_id), '[]'::jsonb) from public.research_rating_scales s
               where s.scale_id in (select t.scale_id from public.broker_report_targets t where t.report_id = p_report_id)),
    'institution_id', r.institution_id, 'scope', r.scope, 'published_date', r.published_date, 'uploaded_at', d.uploaded_at,
    'supersedes_report_id', r.supersedes_report_id,
    'titles', jsonb_build_object('title_original', r.title_original, 'title_public', r.title_public, 'title_zh', r.title_zh, 'title_en', r.title_en),
    'disclosure', jsonb_build_object('licence_version', l.version, 'allows_public_target_price', l.allows_public_target_price,
      'analysts', (select coalesce(jsonb_agg(jsonb_build_object('analyst_id', a.analyst_id, 'public_display', ra.public_display, 'display_name', ra.display_name, 'name_variants', to_jsonb(ra.name_variants)) order by a.analyst_id), '[]'::jsonb)
                   from public.broker_report_analysts a join public.research_analysts ra on ra.analyst_id = a.analyst_id where a.report_id = p_report_id)));
  return jsonb_build_object(
    'effective_hash', v_eff_hash,
    'rules_input_hash', public.broker_sha256(v_rules::text),
    'summary_input_digest', public.broker_sha256(v_eff_hash || '|' || coalesce(v_art, '') || '|' || coalesce(r.institution_id::text, '') || '|' || coalesce(r.title_public, '')));
end $$;
revoke execute on function public.broker_report_live_digests(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- materialize (§6.3)
-- 1. lock (draft only); 2. report-level columns from the first pick per field (effective first):
-- title_original/title_lang(detail.lang)/published_date/sector_as_stated; 3. targets rebuilt: one
-- row per target_key that has a live or effective ticker row; basis='effective' iff ticker, rating
-- and target_price are effective and (target_price is absent or target_currency, price_at_report,
-- price_currency and price_as_of_date are effective) — then only effective picks are used,
-- otherwise effective-or-unique-candidate picks; currencies come from value_currency; resolution:
-- override row > ticker row detail.resolution; scale: the unique row valid on published_date
-- (none/many → null); upside/1 = round(tp/pr − 1, 6) iff both present, same currency, pr <> 0;
-- input_hash = sha256 of the chosen rows; 4. report price_as_of_date = primary target's, else the
-- single distinct value; 5. digests stored (materialized_hash := effective_hash); 6. approved
-- summaries whose input_hash <> new digest → draft(summary_stale); approved snippets → draft
-- (disclosure_inputs) when any target's (target_price, upside_pct) changed. Returns the receipt.
create or replace function public.broker_report_materialize(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.broker_research_reports; v_old_disc text; v_new_disc text; v_dig jsonb;
  v_title text; v_lang text; v_pub date; v_sector text; v_pad date; v_n int; v_eff int;
begin
  r := public.broker_lock_draft(p_report_id);
  select public.broker_sha256(coalesce(jsonb_agg(jsonb_build_object('k', t.target_key, 'tp', t.target_price::text, 'up', t.upside_pct::text) order by t.target_key collate "C"), '[]'::jsonb)::text)
    into v_old_disc from public.broker_report_targets t where t.report_id = p_report_id;

  select max(x.v ->> 'value_text') filter (where x.field = 'title'),
         max(x.detail ->> 'lang') filter (where x.field = 'title'),
         (max(x.v ->> 'value_date') filter (where x.field = 'published_date'))::date,
         max(x.v ->> 'value_text') filter (where x.field = 'sector')
    into v_title, v_lang, v_pub, v_sector
  from (select distinct on (p.field) p.* from public.broker_report_picks(p_report_id) p
        where p.target_key is null and p.status <> 'absent' order by p.field, p.is_eff desc, p.occurrence) x;

  delete from public.broker_report_targets where report_id = p_report_id;
  insert into public.broker_report_targets (report_id, target_key, basis, ticker_as_stated, security_ticker, issuer_id, resolution, rating_raw, rating_normalized, scale_id,
                                            target_price, target_currency, target_horizon_months, price_at_report, price_currency, price_as_of_date, upside_pct, upside_formula_version, input_hash)
  with p as (select * from public.broker_report_picks(p_report_id) pk where pk.target_key is not null),
  keys as (
    select distinct f.target_key from public.broker_report_fields f
    where f.report_id = p_report_id and f.field = 'ticker'
      and (f.status in ('confirmed','corrected') or (f.status in ('extracted','unverified') and f.superseded_by_run_id is null))),
  flags as (
    select k.target_key,
      coalesce(bool_or(p.is_eff and p.field = 'ticker'), false) and coalesce(bool_or(p.is_eff and p.field = 'rating'), false)
      and coalesce(bool_or(p.is_eff and p.field = 'target_price'), false)
      and (coalesce(bool_or(p.is_eff and p.field = 'target_price' and p.status = 'absent'), false)
           or (coalesce(bool_or(p.is_eff and p.field = 'target_currency'), false) and coalesce(bool_or(p.is_eff and p.field = 'price_at_report'), false)
               and coalesce(bool_or(p.is_eff and p.field = 'price_currency'), false) and coalesce(bool_or(p.is_eff and p.field = 'price_as_of_date'), false))) as eff_basis
    from keys k left join p on p.target_key = k.target_key group by k.target_key),
  chosen as (
    select distinct on (p.target_key, p.field) p.*
    from p join flags fl on fl.target_key = p.target_key
    where p.is_eff or not fl.eff_basis
    order by p.target_key, p.field, p.is_eff desc, p.occurrence),
  vals as (
    select fl.target_key, fl.eff_basis,
      max(c.v ->> 'value_text') filter (where c.field = 'ticker') as ticker_text,
      max(c.v ->> 'value_text') filter (where c.field = 'rating' and c.status <> 'absent') as rating_raw,
      max(c.v ->> 'value_num') filter (where c.field = 'target_price' and c.status <> 'absent') as tp,
      max(c.v ->> 'value_currency') filter (where c.field = 'target_currency') as tc,
      max(c.v ->> 'value_num') filter (where c.field = 'target_horizon' and c.status <> 'absent') as horizon,
      max(c.v ->> 'value_num') filter (where c.field = 'price_at_report') as pr,
      max(c.v ->> 'value_currency') filter (where c.field = 'price_currency') as pc,
      max(c.v ->> 'value_date') filter (where c.field = 'price_as_of_date') as pd,
      (array_agg(c.detail -> 'resolution') filter (where c.field = 'ticker' and jsonb_typeof(c.detail -> 'resolution') = 'object'))[1] as resolution,
      coalesce(jsonb_agg(jsonb_build_object('field_id', c.field_id, 'field', c.field, 'status', c.status, 'v', c.v) order by c.field collate "C") filter (where c.field_id is not null), '[]'::jsonb) as inputs
    from flags fl left join chosen c on c.target_key = fl.target_key group by fl.target_key, fl.eff_basis)
  select p_report_id, v.target_key, case when v.eff_basis then 'effective' else 'candidate' end,
    coalesce(v.ticker_text, v.target_key),
    case when o.override_id is not null then o.security_ticker else v.resolution -> 'issuer_securities_row' ->> 'ticker' end,
    case when o.override_id is not null then o.issuer_id else (v.resolution -> 'issuer_securities_row' ->> 'issuer_id')::uuid end,
    coalesce(v.resolution, '{}'::jsonb) || case when o.override_id is not null then jsonb_build_object('override_id', o.override_id) else '{}'::jsonb end,
    v.rating_raw, sc.normalized, sc.scale_id,
    v.tp::numeric, v.tc,
    case when v.horizon::numeric > 0 then round(v.horizon::numeric)::int end,
    v.pr::numeric, v.pc, v.pd::date,
    case when v.tp is not null and v.pr is not null and v.tc = v.pc and v.pr::numeric <> 0 then round(v.tp::numeric / v.pr::numeric - 1, 6) end,
    case when v.tp is not null and v.pr is not null and v.tc = v.pc and v.pr::numeric <> 0 then 'upside/1' end,
    public.broker_sha256(v.inputs::text)
  from vals v
  left join public.broker_report_target_overrides o on o.report_id = p_report_id and o.target_key = v.target_key
  left join lateral (
    select (array_agg(s.scale_id))[1] as scale_id, (array_agg(s.normalized))[1] as normalized
    from public.research_rating_scales s
    where v.rating_raw is not null and v_pub is not null and s.institution_id = r.institution_id
      and lower(btrim(s.raw_label)) = lower(btrim(v.rating_raw)) and s.valid_from <= v_pub and v_pub < coalesce(s.valid_to, 'infinity'::date)
    having count(*) = 1) sc on true;

  if r.primary_target_key is not null then
    select t.price_as_of_date into v_pad from public.broker_report_targets t where t.report_id = p_report_id and t.target_key = r.primary_target_key;
  else
    select case when count(distinct t.price_as_of_date) = 1 then min(t.price_as_of_date) end into v_pad from public.broker_report_targets t where t.report_id = p_report_id;
  end if;
  update public.broker_research_reports
  set title_original = v_title, title_lang = coalesce(v_lang, title_lang), published_date = v_pub, sector_as_stated = v_sector, price_as_of_date = v_pad
  where report_id = p_report_id;

  v_dig := public.broker_report_live_digests(p_report_id);
  update public.broker_research_reports
  set effective_hash = v_dig ->> 'effective_hash', materialized_hash = v_dig ->> 'effective_hash',
      rules_input_hash = v_dig ->> 'rules_input_hash', summary_input_digest = v_dig ->> 'summary_input_digest'
  where report_id = p_report_id;
  update public.broker_report_summaries set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'summary_stale'
  where report_id = p_report_id and status = 'approved' and input_hash is distinct from v_dig ->> 'summary_input_digest';

  select public.broker_sha256(coalesce(jsonb_agg(jsonb_build_object('k', t.target_key, 'tp', t.target_price::text, 'up', t.upside_pct::text) order by t.target_key collate "C"), '[]'::jsonb)::text)
    into v_new_disc from public.broker_report_targets t where t.report_id = p_report_id;
  if v_new_disc is distinct from v_old_disc then
    update public.broker_report_snippets set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'disclosure_inputs'
    where report_id = p_report_id and status = 'approved';
  end if;

  select count(*), count(*) filter (where t.basis = 'effective') into v_n, v_eff from public.broker_report_targets t where t.report_id = p_report_id;
  return jsonb_build_object('effectiveHash', v_dig ->> 'effective_hash', 'materializedHash', v_dig ->> 'effective_hash', 'targets', v_n,
                            'basis', case when v_n = v_eff then 'effective' when v_eff = 0 then 'candidate' else 'mixed' end);
end $$;
revoke execute on function public.broker_report_materialize(uuid) from public, anon, authenticated;
grant execute on function public.broker_report_materialize(uuid) to service_role;

-- ---------------------------------------------------------------- review RPCs (§6.3)
-- broker_field_review(field, action, payload, by): lock the parent report first (published →
-- published_immutable), then the field. Actions: confirm (extracted|unverified|corrected →
-- confirmed; span required); correct (any live/effective row → corrected; payload = the corrected
-- keys ⊆ value_text/value_num/value_currency/value_unit/value_date with value_text a string, plus
-- an optional span page/char_start/char_end/value_source_text that replaces the row's span);
-- reject; absent (field ∈ rating/target_price/analyst/target_horizon: this row → rejected and a
-- human 'absent' row for the same identity on payload.page, else the row's page). confirm/correct/
-- absent reject every other live candidate of the same identity (the conflict group). Every action
-- accepts payload.detail (an object, else invalid_payload:detail) merged into the row's detail (e.g.
-- {framed:true}, read by replay). Then materialize; one transaction (any error leaves nothing changed).
create or replace function public.broker_field_review(p_field_id uuid, p_action text, p_payload jsonb, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.broker_report_fields; v_report uuid; v_corr jsonb; v_page int; v_payload jsonb := coalesce(p_payload, '{}'::jsonb); v_detail jsonb;
begin
  if p_action is null or p_action not in ('confirm','correct','reject','absent') then raise exception 'invalid_action:%', coalesce(p_action, ''); end if;
  if p_by is null then raise exception 'invalid_reviewer'; end if;
  if v_payload ? 'detail' and jsonb_typeof(v_payload -> 'detail') is distinct from 'object' then raise exception 'invalid_payload:detail'; end if;
  v_detail := coalesce(v_payload -> 'detail', '{}'::jsonb);
  select report_id into v_report from public.broker_report_fields where field_id = p_field_id;
  if not found then raise exception 'field_not_found' using errcode = 'P0002'; end if;
  perform public.broker_lock_draft(v_report);
  select * into f from public.broker_report_fields where field_id = p_field_id for update;
  if p_action in ('confirm','correct') and exists (
       select 1 from public.broker_report_fields e where e.report_id = f.report_id and e.field_id <> f.field_id and e.status in ('confirmed','corrected','absent')
         and e.target_key is not distinct from f.target_key and e.field = f.field and e.occurrence = f.occurrence) then
    raise exception 'effective_exists';
  end if;
  if p_action = 'confirm' then
    if f.status not in ('extracted','unverified','corrected') then raise exception 'field_not_reviewable:%', f.status; end if;
    -- a framed confirm (reviewer selected the quote on the page) carries the span; the service has checked it verbatim
    if v_payload ?| array['page','char_start','char_end','value_source_text'] then
      if not (v_payload ? 'page' and v_payload ? 'char_start' and v_payload ? 'char_end' and jsonb_typeof(v_payload -> 'value_source_text') = 'string') then raise exception 'invalid_payload:span'; end if;
      update public.broker_report_fields
      set page = (v_payload ->> 'page')::int, char_start = (v_payload ->> 'char_start')::int, char_end = (v_payload ->> 'char_end')::int, value_source_text = v_payload ->> 'value_source_text'
      where field_id = p_field_id;
    elsif f.char_start is null then
      raise exception 'span_required';
    end if;
    update public.broker_report_fields set status = 'confirmed', corrected = null, reviewed_by = p_by, reviewed_at = now() where field_id = p_field_id;
  elsif p_action = 'correct' then
    if f.status not in ('extracted','unverified','confirmed','corrected') then raise exception 'field_not_reviewable:%', f.status; end if;
    v_corr := v_payload - array['page','char_start','char_end','value_source_text','detail'];
    if v_corr - array['value_text','value_num','value_currency','value_unit','value_date'] <> '{}'::jsonb or jsonb_typeof(v_corr -> 'value_text') is distinct from 'string' then
      raise exception 'invalid_payload:corrected';
    end if;
    if v_corr ->> 'value_num' is not null and v_corr ->> 'value_num' !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'invalid_payload:value_num'; end if;
    if v_corr ->> 'value_date' is not null then
      begin perform (v_corr ->> 'value_date')::date; exception when others then raise exception 'invalid_payload:value_date'; end;
      if v_corr ->> 'value_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_payload:value_date'; end if;
    end if;
    if v_payload ?| array['page','char_start','char_end','value_source_text'] then
      if not (v_payload ? 'page' and v_payload ? 'char_start' and v_payload ? 'char_end' and jsonb_typeof(v_payload -> 'value_source_text') = 'string') then raise exception 'invalid_payload:span'; end if;
      update public.broker_report_fields
      set page = (v_payload ->> 'page')::int, char_start = (v_payload ->> 'char_start')::int, char_end = (v_payload ->> 'char_end')::int, value_source_text = v_payload ->> 'value_source_text'
      where field_id = p_field_id;
    elsif f.char_start is null then
      raise exception 'span_required';
    end if;
    update public.broker_report_fields set status = 'corrected', corrected = v_corr, reviewed_by = p_by, reviewed_at = now() where field_id = p_field_id;
  elsif p_action = 'reject' then
    if f.status = 'rejected' then raise exception 'field_not_reviewable:rejected'; end if;
    update public.broker_report_fields set status = 'rejected', corrected = null, reviewed_by = p_by, reviewed_at = now() where field_id = p_field_id;   -- broker_fields_corrected_iff
  else
    if f.field not in ('rating','target_price','analyst','target_horizon') then raise exception 'absent_not_allowed:%', f.field; end if;
    if f.status = 'absent' then raise exception 'field_not_reviewable:absent'; end if;
    v_page := coalesce((v_payload ->> 'page')::int, f.page);
    if v_page is null or v_page < 1 then raise exception 'invalid_payload:page'; end if;
    if exists (select 1 from public.broker_report_fields e where e.report_id = f.report_id and e.field_id <> f.field_id and e.status in ('confirmed','corrected','absent')
                 and e.target_key is not distinct from f.target_key and e.field = f.field and e.occurrence = f.occurrence) then
      raise exception 'effective_exists';
    end if;
    if f.status <> 'rejected' then
      update public.broker_report_fields set status = 'rejected', corrected = null, reviewed_by = p_by, reviewed_at = now() where field_id = p_field_id;   -- broker_fields_corrected_iff
    end if;
    insert into public.broker_report_fields (report_id, parse_run_id, target_key, field, occurrence, value_text, page, extractor, status, reviewed_by, reviewed_at, detail)
    values (f.report_id, f.parse_run_id, f.target_key, f.field, f.occurrence, 'ABSENT', v_page, 'human:' || p_by::text, 'absent', p_by, now(), jsonb_build_object('replaces', f.field_id));
  end if;
  if v_detail <> '{}'::jsonb then update public.broker_report_fields set detail = detail || v_detail where field_id = p_field_id; end if;   -- e.g. {framed:true} (replay)
  if p_action in ('confirm','correct','absent') then
    update public.broker_report_fields set status = 'rejected', reviewed_by = p_by, reviewed_at = now()
    where report_id = f.report_id and field_id <> f.field_id and status in ('extracted','unverified') and superseded_by_run_id is null
      and target_key is not distinct from f.target_key and field = f.field and occurrence = f.occurrence;
  end if;
  return public.broker_report_materialize(f.report_id);
end $$;
revoke execute on function public.broker_field_review(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.broker_field_review(uuid, text, jsonb, uuid) to service_role;

-- broker_field_add(report, row, by): a human row (HumanFieldInput: status confirmed|absent;
-- parse_run_id must be a succeeded parse run of the report's document). Returns {field_id, receipt}.
create or replace function public.broker_field_add(p_report_id uuid, p_row jsonb, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports; v_id uuid; v_status text := p_row ->> 'status'; v_absent boolean; v_occ int := coalesce((p_row ->> 'occurrence')::int, 1);
begin
  if p_by is null then raise exception 'invalid_reviewer'; end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'invalid_payload:row'; end if;
  r := public.broker_lock_draft(p_report_id);
  if v_status is null or v_status not in ('confirmed','absent') then raise exception 'invalid_payload:status'; end if;
  if not exists (select 1 from public.broker_report_runs ru where ru.run_id = (p_row ->> 'parse_run_id')::uuid and ru.document_id = r.document_id and ru.kind = 'parse' and ru.status = 'succeeded') then
    raise exception 'invalid_payload:parse_run_id';
  end if;
  if exists (select 1 from public.broker_report_fields e where e.report_id = p_report_id and e.status in ('confirmed','corrected','absent')
               and e.target_key is not distinct from (p_row ->> 'target_key') and e.field = p_row ->> 'field' and e.occurrence = v_occ) then
    raise exception 'effective_exists';
  end if;
  v_absent := v_status = 'absent';
  insert into public.broker_report_fields (report_id, parse_run_id, target_key, field, occurrence, value_text, value_num, value_currency, value_unit, value_date,
                                           page, char_start, char_end, value_source_text, extractor, status, reviewed_by, reviewed_at)
  values (p_report_id, (p_row ->> 'parse_run_id')::uuid, p_row ->> 'target_key', p_row ->> 'field', v_occ,
          case when v_absent then 'ABSENT' else p_row ->> 'value_text' end,
          case when v_absent then null else (p_row ->> 'value_num')::numeric end,
          case when v_absent then null else p_row ->> 'value_currency' end,
          case when v_absent then null else p_row ->> 'value_unit' end,
          case when v_absent then null else (p_row ->> 'value_date')::date end,
          (p_row ->> 'page')::int,
          case when v_absent then null else (p_row ->> 'char_start')::int end,
          case when v_absent then null else (p_row ->> 'char_end')::int end,
          case when v_absent then null else p_row ->> 'value_source_text' end,
          'human:' || p_by::text, v_status, p_by, now())
  returning field_id into v_id;
  return jsonb_build_object('field_id', v_id, 'receipt', public.broker_report_materialize(p_report_id));
end $$;
revoke execute on function public.broker_field_add(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.broker_field_add(uuid, jsonb, uuid) to service_role;

-- broker_target_override: upsert on (report_id, target_key); a null issuer is resolved from
-- issuer_securities at the document's upload date ([valid_from, valid_to)), exactly one issuer or null.
create or replace function public.broker_target_override(p_report_id uuid, p_target_key text, p_security_ticker text, p_issuer_id uuid, p_by uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports; v_day date; v_issuer uuid := p_issuer_id;
begin
  if p_target_key is null or p_security_ticker is null or p_by is null then raise exception 'invalid_override'; end if;
  r := public.broker_lock_draft(p_report_id);
  if v_issuer is null then
    select d.uploaded_at::date into v_day from public.broker_report_documents d where d.document_id = r.document_id;
    select case when count(distinct s.issuer_id) = 1 then (array_agg(s.issuer_id))[1] end into v_issuer
    from public.issuer_securities s where s.ticker = p_security_ticker and s.valid_from <= v_day and (s.valid_to is null or s.valid_to > v_day);
  end if;
  insert into public.broker_report_target_overrides (report_id, target_key, security_ticker, issuer_id, set_by, note)
  values (p_report_id, p_target_key, p_security_ticker, v_issuer, p_by, p_note)
  on conflict (report_id, target_key) do update
    set security_ticker = excluded.security_ticker, issuer_id = excluded.issuer_id, set_by = excluded.set_by, set_at = now(), note = excluded.note;
  return public.broker_report_materialize(p_report_id);
end $$;
revoke execute on function public.broker_target_override(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.broker_target_override(uuid, text, text, uuid, uuid, text) to service_role;

-- broker_extract_commit (§6.2): document lock + lease (token equal AND lease_until > now(), else
-- lease_lost 55P03, nothing written); the run must be this document's running extract run; the
-- report (created by ensureReport) must be a draft; earlier live candidates → superseded_by_run_id;
-- candidate rows inserted (status extracted|unverified; parse_run_id = the run's; resolution kept
-- in detail.resolution); materialize. One transaction.
create or replace function public.broker_extract_commit(p_document_id uuid, p_lease_token uuid, p_run_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.broker_report_documents; ru public.broker_report_runs; v_report uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x where jsonb_typeof(x) <> 'object' or coalesce(x ->> 'status', '') not in ('extracted','unverified')) then
    raise exception 'invalid_rows:status' using errcode = '22023';
  end if;
  select * into d from public.broker_report_documents where document_id = p_document_id for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0002'; end if;
  if d.lease_token is distinct from p_lease_token or d.lease_until is null or d.lease_until <= now() then raise exception 'lease_lost' using errcode = '55P03'; end if;
  select * into ru from public.broker_report_runs where run_id = p_run_id;
  if not found or ru.document_id <> p_document_id or ru.kind <> 'extract' or ru.status <> 'running' then raise exception 'run_invalid'; end if;
  if ru.parse_run_id is distinct from d.current_parse_run_id then raise exception 'stale_parse_run'; end if;
  select report_id into v_report from public.broker_research_reports where document_id = p_document_id;
  if v_report is null then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  perform public.broker_lock_draft(v_report);
  update public.broker_report_fields set superseded_by_run_id = p_run_id
  where report_id = v_report and status in ('extracted','unverified') and superseded_by_run_id is null and run_id is distinct from p_run_id;
  insert into public.broker_report_fields (report_id, parse_run_id, run_id, target_key, field, occurrence, value_text, value_num, value_currency, value_unit, value_date,
                                           page, char_start, char_end, value_source_text, extractor, extractor_confidence, status, conflict_group, detail)
  select v_report, ru.parse_run_id, p_run_id, x ->> 'target_key', x ->> 'field', coalesce((x ->> 'occurrence')::int, 1), x ->> 'value_text',
         (x ->> 'value_num')::numeric, x ->> 'value_currency', x ->> 'value_unit', (x ->> 'value_date')::date,
         (x ->> 'page')::int, (x ->> 'char_start')::int, (x ->> 'char_end')::int, x ->> 'value_source_text',
         x ->> 'extractor', (x ->> 'extractor_confidence')::double precision, x ->> 'status', x ->> 'conflict_group',
         coalesce(case when jsonb_typeof(x -> 'detail') = 'object' then x -> 'detail' end, '{}'::jsonb)
           || case when jsonb_typeof(x -> 'resolution') = 'object' then jsonb_build_object('resolution', x -> 'resolution') else '{}'::jsonb end
  from jsonb_array_elements(p_rows) x;
  return public.broker_report_materialize(v_report);
end $$;
revoke execute on function public.broker_extract_commit(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_extract_commit(uuid, uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- publish blockers (§4.4, 17 items)
create or replace function public.broker_report_publish_blockers(p_report_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  r public.broker_research_reports; d public.broker_report_documents; l public.broker_report_licences; st public.broker_research_settings;
  rr public.broker_report_rule_receipts; b text[] := '{}'; v_live jsonb; v_n int; v_ni int; v_res jsonb; v_surface text; v_text text;
  v_target_scope boolean; v_required text[];
begin
  select * into r from public.broker_research_reports where report_id = p_report_id;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  select * into d from public.broker_report_documents where document_id = r.document_id;
  select * into l from public.broker_report_licences where licence_id = d.licence_id;
  select * into st from public.broker_research_settings where id = 1;
  v_target_scope := r.scope in ('single_issuer','multi_issuer');
  -- 1–4
  if r.review_status <> 'approved' then b := array_append(b, 'review_not_approved'); end if;
  if not (l.confirmed_at is not null and l.confirmed_version = l.version and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)) then
    b := array_append(b, 'licence_unconfirmed');
  end if;
  if not l.allows_public_metadata then b := array_append(b, 'licence_no_public_metadata'); end if;
  if d.status <> 'parsed' or d.promotion_pending then b := array_append(b, 'document_not_parsed'); end if;
  -- 5
  if r.scope is null then b := array_append(b, 'report_incomplete:scope'); end if;
  if r.title_original is null then b := array_append(b, 'report_incomplete:title_original'); end if;
  if r.published_date is null then b := array_append(b, 'report_incomplete:published_date'); end if;
  if r.institution_id is null then b := array_append(b, 'report_incomplete:institution_id'); end if;
  -- 6 required_field_missing (§5.1): effective row, and for numeric/date fields an effective value
  b := b || coalesce((
    with e as (select * from public.broker_report_picks(p_report_id) pk where pk.is_eff),
    req as (
      select null::text as target_key, x.field, 1 as ord from unnest(array['institution','published_date','title']) as x(field)
      union all select null, 'sector', 1 where r.scope in ('sector','macro_strategy')
      union all select t.target_key, x.field, 2 from public.broker_report_targets t cross join unnest(array['ticker','rating','target_price']) as x(field)
        where t.report_id = p_report_id and v_target_scope
      union all select t.target_key, x.field, 2 from public.broker_report_targets t cross join unnest(array['target_currency','price_at_report','price_currency','price_as_of_date']) as x(field)
        where t.report_id = p_report_id and v_target_scope
          and exists (select 1 from e where e.target_key = t.target_key and e.field = 'target_price' and e.status <> 'absent'))
    select array_agg('required_field_missing:' || q.field || coalesce(':' || q.target_key, '') order by q.ord, q.target_key collate "C", q.field collate "C")
    from req q
    where not exists (select 1 from e where e.target_key is not distinct from q.target_key and e.field = q.field
                        and (e.status = 'absent' or case q.field
                               when 'published_date' then e.v ->> 'value_date' is not null
                               when 'price_as_of_date' then e.v ->> 'value_date' is not null
                               when 'target_price' then e.v ->> 'value_num' is not null
                               when 'price_at_report' then e.v ->> 'value_num' is not null
                               when 'target_currency' then e.v ->> 'value_currency' is not null
                               when 'price_currency' then e.v ->> 'value_currency' is not null
                               else true end))), '{}');
  -- 7 field_pending: a live candidate of a required field whose identity has no effective row
  v_required := array['institution','published_date','title']
             || case when r.scope in ('sector','macro_strategy') then array['sector'] else '{}'::text[] end
             || case when v_target_scope then array['ticker','rating','target_price','target_currency','price_at_report','price_currency','price_as_of_date'] else '{}'::text[] end;
  b := b || coalesce((
    select array_agg(distinct 'field_pending:' || f.field order by 'field_pending:' || f.field)
    from public.broker_report_fields f
    where f.report_id = p_report_id and f.status in ('extracted','unverified') and f.superseded_by_run_id is null and f.field = any(v_required)
      and not exists (select 1 from public.broker_report_fields e where e.report_id = f.report_id and e.status in ('confirmed','corrected','absent')
                        and e.target_key is not distinct from f.target_key and e.field = f.field and e.occurrence = f.occurrence)), '{}');
  -- 8, 9
  if v_target_scope then
    b := b || coalesce((select array_agg('target_unresolved:' || t.target_key order by t.target_key collate "C") from public.broker_report_targets t
                        where t.report_id = p_report_id and (t.issuer_id is null or t.basis <> 'effective')), '{}');
  end if;
  select count(*), count(distinct t.issuer_id) into v_n, v_ni from public.broker_report_targets t where t.report_id = p_report_id;
  if (r.scope = 'single_issuer' and (v_ni <> 1 or v_n < 1)) or (r.scope = 'multi_issuer' and v_ni < 2) or (r.scope in ('sector','macro_strategy') and v_n <> 0) then
    b := array_append(b, 'target_cardinality');
  end if;
  -- 10 blocking quarantine items of this document
  b := b || coalesce((
    select array_agg(distinct 'quarantine_open:' || q.reason_code order by 'quarantine_open:' || q.reason_code)
    from public.dq_quarantine q
    where q.dataset = 'broker_research' and q.status = 'open' and q.natural_key like d.sha256 || ':%'
      and q.reason_code in ('upside_mismatch','currency_mismatch','date_order','nonpositive_price','unknown_rating_label','ambiguous_rating_label','ticker_issuer_conflict','unresolved_ticker')), '{}');
  -- 11 stored digests vs live recomputation
  v_live := public.broker_report_live_digests(p_report_id);
  if r.materialized_hash is null or r.materialized_hash is distinct from v_live ->> 'effective_hash' or r.effective_hash is distinct from v_live ->> 'effective_hash'
     or r.rules_input_hash is distinct from v_live ->> 'rules_input_hash' or r.summary_input_digest is distinct from v_live ->> 'summary_input_digest' then
    b := array_append(b, 'materialize_stale');
  end if;
  -- 12 newest receipt for the stored rules_input_hash; any failed blocking result
  select * into rr from public.broker_report_rule_receipts x
  where x.report_id = p_report_id and x.input_hash = r.rules_input_hash and x.rules_version = 'broker-rules/1'
  order by x.created_at desc, x.receipt_id desc limit 1;
  if rr.receipt_id is null or exists (select 1 from jsonb_array_elements(rr.results) e where e ->> 'passed' = 'false' and e ->> 'blocking' = 'true') then
    b := array_append(b, 'rules_stale');
  end if;
  -- 13 gold eval receipt per behavior digest of the effective LLM rows. Once the report is gated (it has
  -- any effective LLM row), coverage (tp+fn > 0) is required for EVERY field with an effective row (absent included)
  -- row, whoever extracted it (spec §4.4; P-R1-12). A report with only human rows is not gated.
  if exists (select 1 from public.broker_report_fields f where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent') and f.extractor like 'llm:%') then
    if st.approved_gold_corpus_hash is null or exists (
         select 1
         from (select distinct ru.behavior_digest from public.broker_report_fields f join public.broker_report_runs ru on ru.run_id = f.run_id
               where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent') and f.extractor like 'llm:%') g
         left join lateral (select * from public.broker_eval_receipts e where e.behavior_digest = g.behavior_digest order by e.ran_at desc, e.receipt_id desc limit 1) e on true
         where e.receipt_id is null
            or not (e.passed and e.corpus_kind = 'gold' and e.corpus_hash = st.approved_gold_corpus_hash and e.n_docs >= 30)
            or exists (select 1 from (select distinct f.field from public.broker_report_fields f where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent')) ff
                       where coalesce((e.per_field -> ff.field ->> 'tp')::int, 0) + coalesce((e.per_field -> ff.field ->> 'fn')::int, 0) = 0)) then
      b := array_append(b, 'eval_receipt_missing');
    end if;
  end if;
  -- 14
  if exists (select 1 from public.broker_report_summaries su where su.report_id = p_report_id and su.status = 'approved' and su.input_hash is distinct from r.summary_input_digest) then
    b := array_append(b, 'summary_stale');
  end if;
  -- 15 title surfaces (results in the rules receipt), approved snippets / summaries (own checks)
  foreach v_surface in array array['title_original','title_public','title_zh','title_en'] loop
    v_text := case v_surface when 'title_original' then r.title_original when 'title_public' then r.title_public when 'title_zh' then r.title_zh else r.title_en end;
    continue when v_text is null;
    v_res := null;
    if rr.receipt_id is not null then
      select e into v_res from jsonb_array_elements(rr.results) e where e ->> 'rule' = 'disclosure' and e -> 'detail' ->> 'surface' = v_surface limit 1;
    end if;
    if v_res is null or v_res ->> 'passed' <> 'true' then
      if v_surface <> 'title_original' or r.title_public is null then b := array_append(b, 'restricted_value_in_text:' || v_surface); end if;
    end if;
  end loop;
  b := b || coalesce((select array_agg('restricted_value_in_text:snippet:' || sn.snippet_id::text order by sn.snippet_id) from public.broker_report_snippets sn
                      where sn.report_id = p_report_id and sn.status = 'approved'
                        and (coalesce(sn.disclosure_check ->> 'passed', 'false') <> 'true' or sn.disclosure_check ->> 'db_digest' is distinct from public.broker_report_disclosure_digest(p_report_id))), '{}');
  b := b || coalesce((select array_agg('restricted_value_in_text:summary:' || su.lang order by su.lang) from public.broker_report_summaries su
                      where su.report_id = p_report_id and su.status = 'approved'
                        and (coalesce(su.disclosure_check ->> 'passed', 'false') <> 'true' or su.disclosure_check ->> 'db_digest' is distinct from public.broker_report_disclosure_digest(p_report_id))), '{}');
  -- 16
  if not r.evidence_ok then b := array_append(b, 'evidence_drift'); end if;
  if not r.disclosure_ok then b := array_append(b, 'disclosure_stale'); end if;
  -- 17
  b := b || coalesce((
    select array_agg('conflict_unresolved:' || g.field || coalesce(':' || g.target_key, '') order by g.field collate "C", g.target_key collate "C")
    from (select f.target_key, f.field, f.occurrence from public.broker_report_fields f
          where f.report_id = p_report_id and f.status in ('extracted','unverified') and f.superseded_by_run_id is null
          group by f.target_key, f.field, f.occurrence having count(*) >= 2) g
    where not exists (select 1 from public.broker_report_fields e where e.report_id = p_report_id and e.status in ('confirmed','corrected','absent')
                        and e.target_key is not distinct from g.target_key and e.field = g.field and e.occurrence = g.occurrence)), '{}');
  return b;
end $$;
revoke execute on function public.broker_report_publish_blockers(uuid) from public, anon, authenticated;
grant execute on function public.broker_report_publish_blockers(uuid) to service_role;

-- ---------------------------------------------------------------- publish / unpublish (§4.4, §4.8, §10.2)
-- Lock order: licence (share) → document (share) → report (update). Under
-- set_config('broker.publishing', report_id, true): blockers on committed state (non-empty →
-- publish_blocked:<comma list>), snapshot built here and hashed here, publication inserted, report
-- flipped, one claim.register per target with a target price. Returns publication_id.
create or replace function public.broker_report_publish(p_report_id uuid, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.broker_research_reports; d public.broker_report_documents; l public.broker_report_licences; rr public.broker_report_rule_receipts;
  v_blockers text[]; v_pub uuid := gen_random_uuid(); v_now timestamptz := now(); v_snapshot jsonb; v_hash text; v_eval uuid; v_eval_ids jsonb; v_restricted boolean; v_doc uuid; v_lic uuid;
begin
  if p_by is null then raise exception 'invalid_publisher'; end if;
  select document_id into v_doc from public.broker_research_reports where report_id = p_report_id;
  if v_doc is null then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  select licence_id into v_lic from public.broker_report_documents where document_id = v_doc;
  select * into l from public.broker_report_licences where licence_id = v_lic for share;
  select * into d from public.broker_report_documents where document_id = v_doc for share;
  select * into r from public.broker_research_reports where report_id = p_report_id for update;
  if r.status <> 'draft' then raise exception 'report_not_draft'; end if;
  perform set_config('broker.publishing', p_report_id::text, true);
  v_blockers := public.broker_report_publish_blockers(p_report_id);
  if cardinality(v_blockers) > 0 then raise exception 'publish_blocked:%', array_to_string(v_blockers, ','); end if;
  select * into rr from public.broker_report_rule_receipts x where x.report_id = p_report_id and x.input_hash = r.rules_input_hash and x.rules_version = 'broker-rules/1'
  order by x.created_at desc, x.receipt_id desc limit 1;
  select coalesce(bool_or(e ->> 'passed' = 'true'), false) is false into v_restricted
  from jsonb_array_elements(rr.results) e where e ->> 'rule' = 'disclosure' and e -> 'detail' ->> 'surface' = 'title_original';
  select coalesce(jsonb_agg(x.receipt_id order by x.ran_at desc), '[]'::jsonb), (array_agg(x.receipt_id order by x.ran_at desc))[1] into v_eval_ids, v_eval
  from (select distinct on (e.behavior_digest) e.receipt_id, e.ran_at
        from public.broker_eval_receipts e
        where e.behavior_digest in (select ru.behavior_digest from public.broker_report_fields f join public.broker_report_runs ru on ru.run_id = f.run_id
                                    where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent') and f.extractor like 'llm:%')
        order by e.behavior_digest, e.ran_at desc, e.receipt_id desc) x;
  v_snapshot := jsonb_build_object(
    'publication_id', v_pub, 'revision', r.revision, 'published_at', v_now, 'published_by', p_by,
    'report', to_jsonb(r) || jsonb_build_object('status', 'published', 'current_publication_id', v_pub, 'title_restricted', v_restricted),
    'document', jsonb_build_object('document_id', d.document_id, 'sha256', d.sha256, 'uploaded_at', d.uploaded_at, 'licence_id', d.licence_id, 'current_parse_run_id', d.current_parse_run_id, 'page_count', d.page_count),
    'targets', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('target_price', t.target_price::text, 'price_at_report', t.price_at_report::text, 'upside_pct', t.upside_pct::text) order by t.target_key collate "C"), '[]'::jsonb) from public.broker_report_targets t where t.report_id = p_report_id),
    'fields', (select coalesce(jsonb_agg(jsonb_build_object('field_id', f.field_id, 'target_key', f.target_key, 'field', f.field, 'occurrence', f.occurrence, 'status', f.status,
                 'extractor', f.extractor, 'parse_run_id', f.parse_run_id, 'run_id', f.run_id, 'artifact_hash', pr.artifact_hash, 'page', f.page, 'char_start', f.char_start, 'char_end', f.char_end,
                 -- replay inputs frozen with the publication (P-R1-10): replay never reads live field rows
                 'value_source_text', f.value_source_text,
                 'value_source_sha256', case when f.value_source_text is null then null else public.broker_sha256(f.value_source_text) end,
                 'framed', coalesce(f.detail ->> 'framed', 'false') = 'true',
                 'extracted', jsonb_build_object('value_text', f.value_text, 'value_num', f.value_num::text, 'value_currency', f.value_currency, 'value_unit', f.value_unit, 'value_date', f.value_date::text),
                 'value', public.broker_field_effective(f.corrected, f.value_text, f.value_num, f.value_currency, f.value_unit, f.value_date))
               order by coalesce(f.target_key, '') collate "C", f.field collate "C", f.occurrence), '[]'::jsonb)
               from public.broker_report_fields f left join public.broker_report_runs pr on pr.run_id = f.parse_run_id
               where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent')),
    'snippets', (select coalesce(jsonb_agg(jsonb_build_object('snippet_id', sn.snippet_id, 'target_key', sn.target_key, 'purpose', sn.purpose, 'parse_run_id', sn.parse_run_id, 'page', sn.page,
                   'char_start', sn.char_start, 'char_end', sn.char_end, 'text', sn.text, 'field_id', sn.field_id, 'disclosure_check', sn.disclosure_check) order by sn.snippet_id), '[]'::jsonb)
                 from public.broker_report_snippets sn where sn.report_id = p_report_id and sn.status = 'approved'),
    'summaries', (select coalesce(jsonb_agg(jsonb_build_object('summary_id', su.summary_id, 'lang', su.lang, 'run_id', su.run_id, 'input_hash', su.input_hash, 'summary_md', su.summary_md,
                    'max_verbatim_overlap', su.max_verbatim_overlap, 'numeric_grounding', su.numeric_grounding, 'disclosure_check', su.disclosure_check) order by su.lang), '[]'::jsonb)
                  from public.broker_report_summaries su where su.report_id = p_report_id and su.status = 'approved'),
    'rating_scales', (select coalesce(jsonb_agg(to_jsonb(s) order by s.scale_id), '[]'::jsonb) from public.research_rating_scales s
                      where s.scale_id in (select t.scale_id from public.broker_report_targets t where t.report_id = p_report_id)),
    'overrides', (select coalesce(jsonb_agg(to_jsonb(o) order by o.target_key collate "C"), '[]'::jsonb) from public.broker_report_target_overrides o where o.report_id = p_report_id),
    'analysts', (select coalesce(jsonb_agg(jsonb_build_object('analyst_id', a.analyst_id, 'role', a.role, 'field_id', a.field_id) order by a.analyst_id), '[]'::jsonb)
                 from public.broker_report_analysts a where a.report_id = p_report_id),
    'disclosure_inputs', jsonb_build_object(
      'licence', jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'allows_public_metadata', l.allows_public_metadata, 'allows_public_snippets', l.allows_public_snippets,
                                    'allows_public_summary', l.allows_public_summary, 'allows_public_target_price', l.allows_public_target_price, 'snippet_max_chars', l.snippet_max_chars),
      'analysts', (select coalesce(jsonb_agg(jsonb_build_object('analyst_id', ra.analyst_id, 'public_display', ra.public_display, 'display_name', ra.display_name, 'name_variants', to_jsonb(ra.name_variants)) order by ra.analyst_id), '[]'::jsonb)
                   from public.broker_report_analysts a join public.research_analysts ra on ra.analyst_id = a.analyst_id where a.report_id = p_report_id)),
    'rules_receipt', jsonb_build_object('receipt_id', rr.receipt_id, 'rules_version', rr.rules_version, 'input_hash', rr.input_hash, 'results', rr.results),
    'eval_receipt_ids', v_eval_ids,
    'digests', jsonb_build_object('effective_hash', r.effective_hash, 'rules_input_hash', r.rules_input_hash, 'summary_input_digest', r.summary_input_digest));
  v_hash := public.broker_sha256(v_snapshot::text);
  insert into public.broker_report_publications (publication_id, report_id, revision, snapshot, snapshot_hash, licence_version, rules_receipt_id, eval_receipt_id, published_at, published_by)
  values (v_pub, p_report_id, r.revision, v_snapshot, v_hash, l.version, rr.receipt_id, v_eval, v_now, p_by);
  update public.broker_research_reports set status = 'published', current_publication_id = v_pub, title_restricted = v_restricted where report_id = p_report_id;
  insert into public.broker_outbox (event_id, kind, payload)
  select x.eid, 'claim.register', jsonb_build_object(
    'event_id', x.eid, 'claim_key', 'broker_target_price:' || v_pub::text || ':' || x.target_key, 'claim_seq', 1, 'kind', 'claim.register',
    'claim_type', 'broker_target_price', 'methodology_version', 'broker-claim/1',
    'subject', jsonb_build_object('security_ticker', x.security_ticker, 'issuer_id', x.issuer_id, 'market', su.market::text, 'currency', x.target_currency),
    'claimant', jsonb_build_object('kind', 'institution', 'id', r.institution_id),
    'claim', jsonb_build_object('direction', case when x.price_at_report is null then 0 else sign(x.target_price - x.price_at_report)::int end,
                                'target_price', x.target_price::text, 'currency', x.target_currency, 'horizon_months', x.target_horizon_months,
                                'reference_price', x.price_at_report::text, 'reference_currency', x.price_currency, 'reference_date', x.price_as_of_date),
    'stated_at', r.published_date, 'available_at', d.uploaded_at,
    'source', jsonb_build_object('report_id', p_report_id, 'publication_id', v_pub, 'snapshot_hash', v_hash,
                                 'field_ids', (select coalesce(jsonb_agg(f.field_id order by f.field_id), '[]'::jsonb) from public.broker_report_fields f
                                               where f.report_id = p_report_id and f.status in ('confirmed','corrected','absent') and f.target_key = x.target_key)),
    'visibility_ref', jsonb_build_object('view', 'broker_report_targets_public_v', 'report_id', p_report_id, 'target_key', x.target_key))
  from (select t.*, gen_random_uuid() as eid from public.broker_report_targets t where t.report_id = p_report_id and t.target_price is not null) x
  left join public.stocks_universe su on su.ticker = x.security_ticker;
  perform set_config('broker.publishing', '', true);
  return v_pub;
end $$;
revoke execute on function public.broker_report_publish(uuid, uuid) from public, anon, authenticated;
grant execute on function public.broker_report_publish(uuid, uuid) to service_role;

-- claim.retract for every claim.register of a publication (claim_seq 2; unique (claim_key, claim_seq)
-- makes it once-only). Internal.
create or replace function public.broker_outbox_retract(p_publication uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.broker_outbox (event_id, kind, payload)
  select g.eid, 'claim.retract', jsonb_build_object('event_id', g.eid, 'claim_key', g.claim_key, 'claim_seq', 2, 'kind', 'claim.retract', 'reason', p_reason,
                                                    'source', jsonb_build_object('report_id', g.report_id, 'publication_id', p_publication))
  from (select gen_random_uuid() as eid, o.payload ->> 'claim_key' as claim_key, o.payload -> 'source' ->> 'report_id' as report_id
        from public.broker_outbox o where o.kind = 'claim.register' and o.payload -> 'source' ->> 'publication_id' = p_publication::text) g
  on conflict ((payload ->> 'claim_key'), (payload ->> 'claim_seq')) where kind in ('claim.register','claim.retract') do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.broker_outbox_retract(uuid, text) from public, anon, authenticated, service_role;

-- Unpublish: status draft, revision + 1, current_publication_id null, review_status in_review, the
-- snapshot's unpublished_at/reason written once; claim.retract comes from the report trigger below.
create or replace function public.broker_report_unpublish(p_report_id uuid, p_by uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports;
begin
  if p_by is null then raise exception 'invalid_publisher'; end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then raise exception 'reason_required'; end if;
  select * into r from public.broker_research_reports where report_id = p_report_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'published' then raise exception 'report_not_published'; end if;
  update public.broker_report_publications set unpublished_at = now(), unpublish_reason = p_reason where publication_id = r.current_publication_id;
  perform set_config('broker.unpublishing', p_report_id::text, true);
  update public.broker_research_reports set status = 'draft', revision = revision + 1, current_publication_id = null, review_status = 'in_review' where report_id = p_report_id;
  perform set_config('broker.unpublishing', '', true);
end $$;
revoke execute on function public.broker_report_unpublish(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.broker_report_unpublish(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------- quarantine hook (§7.3)
-- One transaction: (1) lock the item (missing → 'not_found'; not open → 'already_resolved', no
-- write); (2) lock the report of the document named by the natural key's sha256 prefix
-- (published → published_immutable); (3) hook writes by reason (accept): rating labels → mapping
-- row (+ optional close of payload.close_scale_id at payload.valid_to); tickers → override upsert;
-- possible_version → supersedes_report_id; other reasons → no write; reject → review_status
-- 'rejected'. Missing params → hook_params_required (rollback). (4) materialize; (5) flip the item.
create or replace function public.broker_quarantine_resolve(p_id uuid, p_status text, p_by uuid, p_payload jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; r public.broker_research_reports; v_doc uuid; v_payload jsonb := coalesce(p_payload, '{}'::jsonb); v_label text; v_wrote boolean := false;
begin
  if p_status is null or p_status not in ('resolved_accept','resolved_reject') then raise exception 'invalid_status'; end if;
  if p_by is null then raise exception 'invalid_resolver'; end if;
  select * into q from public.dq_quarantine where id = p_id for update;
  if not found then return 'not_found'; end if;
  if q.dataset <> 'broker_research' then raise exception 'wrong_dataset'; end if;
  if q.status <> 'open' then return 'already_resolved'; end if;
  select d.document_id into v_doc from public.broker_report_documents d where d.sha256 = split_part(q.natural_key, ':', 1);
  select * into r from public.broker_research_reports where document_id = v_doc for update;
  if r.report_id is not null and r.status = 'published' then raise exception 'published_immutable'; end if;
  if r.report_id is not null and r.status = 'draft' then
    if p_status = 'resolved_reject' then
      update public.broker_research_reports set review_status = 'rejected' where report_id = r.report_id;
    elsif q.reason_code in ('unknown_rating_label','ambiguous_rating_label') then
      if v_payload ? 'close_scale_id' then
        if not (v_payload ? 'valid_to') then raise exception 'hook_params_required'; end if;
        update public.research_rating_scales set valid_to = (v_payload ->> 'valid_to')::date, closed_by = p_by
        where scale_id = (v_payload ->> 'close_scale_id')::uuid and institution_id = r.institution_id and valid_to is null;
        v_wrote := true;
      end if;
      if v_payload ? 'normalized' then
        v_label := coalesce(v_payload ->> 'raw_label', q.payload ->> 'rating_raw');
        if r.institution_id is null or v_label is null or not (v_payload ? 'source_url' and v_payload ? 'valid_from') then raise exception 'hook_params_required'; end if;
        insert into public.research_rating_scales (institution_id, raw_label, normalized, source_url, valid_from, created_by)
        values (r.institution_id, v_label, v_payload ->> 'normalized', v_payload ->> 'source_url', (v_payload ->> 'valid_from')::date, p_by)
        on conflict (institution_id, lower(btrim(raw_label)), valid_from) do nothing;
        v_wrote := true;
      end if;
      if not v_wrote then raise exception 'hook_params_required'; end if;
    elsif q.reason_code in ('unresolved_ticker','ticker_issuer_conflict') then
      if not (v_payload ? 'target_key' and v_payload ? 'security_ticker') then raise exception 'hook_params_required'; end if;
      perform public.broker_target_override(r.report_id, v_payload ->> 'target_key', v_payload ->> 'security_ticker', (v_payload ->> 'issuer_id')::uuid, p_by, 'quarantine:' || p_id::text);
    elsif q.reason_code = 'possible_version' then
      if not (v_payload ? 'supersedes_report_id') then raise exception 'hook_params_required'; end if;
      update public.broker_research_reports set supersedes_report_id = (v_payload ->> 'supersedes_report_id')::uuid where report_id = r.report_id;
    end if;
    perform public.broker_report_materialize(r.report_id);
  end if;
  update public.dq_quarantine
  set status = p_status, resolved_by = p_by, resolved_at = now(),
      detail = detail || jsonb_build_object('hook', jsonb_build_object('function', 'broker_quarantine_resolve', 'payload', v_payload, 'at', to_jsonb(now())))
  where id = p_id;
  return 'resolved';
end $$;
revoke execute on function public.broker_quarantine_resolve(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_quarantine_resolve(uuid, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- leases, runs, outbox, purge (§4.2, §4.3, §6.5, §8.3)
-- Claim: free or expired lease only (lease_until is null or < now()); taking over an expired lease
-- finishes that document's running parse/extract/summary/translate runs as failed:lease_expired.
-- Withdrawal and optional purge intent are ONE statement; row triggers/retractions share its transaction.
create or replace function public.broker_document_withdraw(p_document uuid, p_reason text, p_purge boolean, p_by uuid)
returns void language sql security definer set search_path = public as $$
 update public.broker_report_documents set
  status='withdrawn', withdrawn_at=coalesce(withdrawn_at,now()),
  withdrawn_reason=case when status='withdrawn' then withdrawn_reason else p_reason end,
  purge_requested_at=case when p_purge then coalesce(purge_requested_at,now()) else purge_requested_at end,
  purge_requested_by=case when p_purge and purge_requested_at is null then p_by else purge_requested_by end
 where document_id=p_document;
$$;
revoke execute on function public.broker_document_withdraw(uuid,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.broker_document_withdraw(uuid,text,boolean,uuid) to service_role;

create or replace function public.broker_document_claim_lease(p_document uuid, p_token uuid, p_ttl_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.broker_report_documents;
begin
  if p_token is null or p_ttl_seconds is null or p_ttl_seconds < 1 then raise exception 'invalid_lease_args' using errcode = '22023'; end if;
  select * into d from public.broker_report_documents where document_id = p_document for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0002'; end if;
  if d.lease_until is not null and d.lease_until >= now() then return false; end if;
  if d.lease_token is not null then
    update public.broker_report_runs set status = 'failed', detail = detail || jsonb_build_object('error_code', 'lease_expired')
    where document_id = p_document and status = 'running' and kind <> 'verify';
  end if;
  update public.broker_report_documents set lease_token = p_token, lease_until = now() + make_interval(secs => p_ttl_seconds) where document_id = p_document;
  return true;
end $$;
revoke execute on function public.broker_document_claim_lease(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.broker_document_claim_lease(uuid, uuid, integer) to service_role;

-- Renew a held lease (P-R3-04): token equal AND unexpired → lease_until := now() + ttl, 'ok'; a withdrawn document
-- answers 'document_withdrawn' (lease kept for the holder to release); anything else 'lease_lost'. Long-running
-- holders (gold evaluation) call it right before every bucket write, so a write happens only under a live lease
-- on a not-withdrawn document — and purge, which claims the same lease, cannot interleave.
create or replace function public.broker_document_renew_lease(p_document uuid, p_token uuid, p_ttl_seconds integer)
returns text language plpgsql security definer set search_path = public as $$
declare d public.broker_report_documents;
begin
  if p_token is null or p_ttl_seconds is null or p_ttl_seconds < 1 then raise exception 'invalid_lease_args' using errcode = '22023'; end if;
  select * into d from public.broker_report_documents where document_id = p_document for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0002'; end if;
  if d.lease_token is distinct from p_token or d.lease_until is null or d.lease_until <= now() then return 'lease_lost'; end if;
  if d.status = 'withdrawn' then return 'document_withdrawn'; end if;
  update public.broker_report_documents set lease_until = now() + make_interval(secs => p_ttl_seconds) where document_id = p_document;
  return 'ok';
end $$;
revoke execute on function public.broker_document_renew_lease(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.broker_document_renew_lease(uuid, uuid, integer) to service_role;

-- Fenced write: token equality only (an expired but not yet overwritten lease may still finish).
create or replace function public.broker_document_fenced_update(p_document uuid, p_token uuid, p_patch jsonb, p_release boolean)
returns text language plpgsql security definer set search_path = public as $$
declare d public.broker_report_documents; v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if v_patch - array['status','current_parse_run_id','page_count'] <> '{}'::jsonb then raise exception 'invalid_patch' using errcode = '22023'; end if;
  select * into d from public.broker_report_documents where document_id = p_document for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0002'; end if;
  if p_token is null or d.lease_token is null or d.lease_token is distinct from p_token then return 'lease_lost'; end if;
  update public.broker_report_documents
  set status = coalesce(v_patch ->> 'status', status),
      current_parse_run_id = case when v_patch ? 'current_parse_run_id' then (v_patch ->> 'current_parse_run_id')::uuid else current_parse_run_id end,
      page_count = case when v_patch ? 'page_count' then (v_patch ->> 'page_count')::int else page_count end,
      lease_token = case when coalesce(p_release, false) then null else lease_token end,
      lease_until = case when coalesce(p_release, false) then null else lease_until end
  where document_id = p_document;
  return 'ok';
end $$;
revoke execute on function public.broker_document_fenced_update(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.broker_document_fenced_update(uuid, uuid, jsonb, boolean) to service_role;

-- Run finish (fenced): lock the document, compare tokens (verify runs may pass a null token and are
-- not fenced). Mismatch → a still-running run is finished failed:lease_lost and 'lease_lost' is
-- returned; a finished run → run_finished. Patch: status (succeeded|failed) + extractor_version
-- (set once: only while null — parse runs learn it from F3; a different value → extractor_version_immutable)
-- + artifact/request/response paths + detail (merged).
create or replace function public.broker_run_finish(p_run uuid, p_token uuid, p_patch jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare ru public.broker_report_runs; v_tok uuid; v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if v_patch - array['status','extractor_version','artifact_path','artifact_hash','request_path','response_path','detail'] <> '{}'::jsonb
     or coalesce(v_patch ->> 'status', '') not in ('succeeded','failed') then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  select * into ru from public.broker_report_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  if not (ru.kind = 'verify' and p_token is null) then
    select lease_token into v_tok from public.broker_report_documents where document_id = ru.document_id for update;
    if p_token is null or v_tok is null or v_tok is distinct from p_token then
      update public.broker_report_runs
      set status = 'failed', detail = detail || coalesce(case when jsonb_typeof(v_patch -> 'detail') = 'object' then v_patch -> 'detail' end, '{}'::jsonb)
                                     || jsonb_build_object('error_code', 'lease_lost', 'lease_lost', true)
      where run_id = p_run and status = 'running';
      return 'lease_lost';
    end if;
  end if;
  select * into ru from public.broker_report_runs where run_id = p_run;
  if ru.status <> 'running' then raise exception 'run_finished'; end if;
  if ru.extractor_version is not null and v_patch ? 'extractor_version' and v_patch ->> 'extractor_version' is distinct from ru.extractor_version then
    raise exception 'extractor_version_immutable';
  end if;
  update public.broker_report_runs
  set status = v_patch ->> 'status', extractor_version = coalesce(extractor_version, v_patch ->> 'extractor_version'),
      artifact_path = coalesce(v_patch ->> 'artifact_path', artifact_path), artifact_hash = coalesce(v_patch ->> 'artifact_hash', artifact_hash),
      request_path = coalesce(v_patch ->> 'request_path', request_path), response_path = coalesce(v_patch ->> 'response_path', response_path),
      detail = detail || coalesce(case when jsonb_typeof(v_patch -> 'detail') = 'object' then v_patch -> 'detail' end, '{}'::jsonb)
  where run_id = p_run;
  return 'ok';
end $$;
revoke execute on function public.broker_run_finish(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_run_finish(uuid, uuid, jsonb) to service_role;

-- attempts + 1; delivered → 'delivered'; the 10th failure → 'failed' (spec §8.3).
create or replace function public.broker_outbox_mark(p_event uuid, p_delivered boolean, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.broker_outbox
  set attempts = attempts + 1,
      status = case when p_delivered then 'delivered' when attempts + 1 >= 10 then 'failed' else 'pending' end,
      last_error = case when p_delivered then null else p_error end,
      delivered_at = case when p_delivered then now() else null end
  where event_id = p_event and status = 'pending';
  if not found then raise exception 'event_not_pending'; end if;
end $$;
revoke execute on function public.broker_outbox_mark(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.broker_outbox_mark(uuid, boolean, text) to service_role;

create or replace function public.broker_purge_step_record(p_document uuid, p_step text, p_ok boolean, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.broker_purge_steps (document_id, step, status, attempts, last_error, at)
  values (p_document, p_step, case when p_ok then 'done' else 'failed' end, 1, case when p_ok then null else p_error end, now())
  on conflict (document_id, step) do update
    set status = excluded.status, attempts = public.broker_purge_steps.attempts + 1, last_error = excluded.last_error, at = now();
end $$;
revoke execute on function public.broker_purge_step_record(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.broker_purge_step_record(uuid, text, boolean, text) to service_role;

-- ---------------------------------------------------------------- function-backed triggers
-- Snippet approval (§4.7): text present, length <= the licence's current N, disclosure_check
-- passed with version disclosure/1, an approver; approved_at stamped. Leaving 'approved' clears
-- approved_by/approved_at. Checked on every write while approved.
create or replace function public.broker_snippets_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int;
begin
  if new.status = 'approved' then
    select l.snippet_max_chars into v_max from public.broker_research_reports r
      join public.broker_report_documents d on d.document_id = r.document_id join public.broker_report_licences l on l.licence_id = d.licence_id
    where r.report_id = new.report_id;
    if new.text is null or length(new.text) > v_max then raise exception 'snippet_too_long:%', coalesce(length(new.text), 0); end if;
    if new.disclosure_check is null or new.disclosure_check ->> 'passed' is distinct from 'true' or new.disclosure_check ->> 'version' is distinct from 'disclosure/1' then
      raise exception 'disclosure_failed';
    end if;
    if new.approved_by is null then raise exception 'approver_required'; end if;
    if tg_op = 'INSERT' or old.status <> 'approved' then
      -- bind the approval to the current disclosure inputs (P-R1-04)
      if new.disclosure_check ? 'db_digest' and new.disclosure_check ->> 'db_digest' is distinct from public.broker_report_disclosure_digest(new.report_id) then
        raise exception 'disclosure_inputs_changed';
      end if;
      new.disclosure_check := new.disclosure_check || jsonb_build_object('db_digest', public.broker_report_disclosure_digest(new.report_id));
    end if;
    if tg_op = 'INSERT' or old.status <> 'approved' then new.approved_at := now(); new.draft_reason := null; end if;
  elsif tg_op = 'UPDATE' and old.status = 'approved' then
    new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists broker_snippets_approval on public.broker_report_snippets;
create trigger broker_snippets_approval before insert or update on public.broker_report_snippets
  for each row execute function public.broker_snippets_approval();

-- Summary approval (§4.7): overlap <= N, grounding passed, disclosure passed, input_hash equals the
-- report's stored summary_input_digest, an approver.
create or replace function public.broker_summaries_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_digest text;
begin
  if new.status = 'approved' then
    select l.snippet_max_chars, r.summary_input_digest into v_max, v_digest from public.broker_research_reports r
      join public.broker_report_documents d on d.document_id = r.document_id join public.broker_report_licences l on l.licence_id = d.licence_id
    where r.report_id = new.report_id;
    if new.max_verbatim_overlap > v_max then raise exception 'summary_overlap:%', new.max_verbatim_overlap; end if;
    if new.numeric_grounding ->> 'passed' is distinct from 'true' then raise exception 'summary_ungrounded'; end if;
    if new.disclosure_check ->> 'passed' is distinct from 'true' or new.disclosure_check ->> 'version' is distinct from 'disclosure/1' then raise exception 'disclosure_failed'; end if;
    if new.input_hash is distinct from v_digest then raise exception 'summary_stale'; end if;
    if new.approved_by is null then raise exception 'approver_required'; end if;
    if tg_op = 'INSERT' or old.status <> 'approved' then
      -- bind the approval to the current disclosure inputs (P-R1-04)
      if new.disclosure_check ? 'db_digest' and new.disclosure_check ->> 'db_digest' is distinct from public.broker_report_disclosure_digest(new.report_id) then
        raise exception 'disclosure_inputs_changed';
      end if;
      new.disclosure_check := new.disclosure_check || jsonb_build_object('db_digest', public.broker_report_disclosure_digest(new.report_id));
    end if;
    if tg_op = 'INSERT' or old.status <> 'approved' then new.approved_at := now(); new.draft_reason := null; end if;
  elsif tg_op = 'UPDATE' and old.status = 'approved' then
    new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists broker_summaries_approval on public.broker_report_summaries;
create trigger broker_summaries_approval before insert or update on public.broker_report_summaries
  for each row execute function public.broker_summaries_approval();

-- Document withdrawn (§4.4, §6.5): its report → withdrawn (from draft or published, under
-- 'broker.withdrawing'); a current publication gets unpublished_at/'withdrawn:<reason>'; the report
-- trigger below writes claim.retract.
create or replace function public.broker_documents_withdraw_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports;
begin
  if new.status <> 'withdrawn' or old.status = 'withdrawn' then return null; end if;
  select * into r from public.broker_research_reports where document_id = new.document_id and status <> 'withdrawn' for update;
  if not found then return null; end if;
  if r.current_publication_id is not null then
    update public.broker_report_publications set unpublished_at = now(), unpublish_reason = 'withdrawn:' || new.withdrawn_reason
    where publication_id = r.current_publication_id and unpublished_at is null;
  end if;
  perform set_config('broker.withdrawing', r.report_id::text, true);
  update public.broker_research_reports set status = 'withdrawn' where report_id = r.report_id;
  perform set_config('broker.withdrawing', '', true);
  return null;
end $$;
drop trigger if exists broker_documents_withdraw_cascade on public.broker_report_documents;
create trigger broker_documents_withdraw_cascade after update of status on public.broker_report_documents
  for each row execute function public.broker_documents_withdraw_cascade();

-- claim.retract (§10.2): a published report that stops being published, or whose disclosure_ok /
-- evidence_ok turns false, retracts every claim of its (old) current publication once.
create or replace function public.broker_reports_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'published' and old.current_publication_id is not null then
    if new.status <> 'published' then
      perform public.broker_outbox_retract(old.current_publication_id, case when new.status = 'withdrawn' then 'withdraw' else 'unpublish' end);
    elsif old.disclosure_ok and not new.disclosure_ok then
      perform public.broker_outbox_retract(old.current_publication_id, 'disclosure_ok');
    elsif old.evidence_ok and not new.evidence_ok then
      perform public.broker_outbox_retract(old.current_publication_id, 'evidence_ok');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists broker_reports_after_change on public.broker_research_reports;
create trigger broker_reports_after_change after update on public.broker_research_reports
  for each row execute function public.broker_reports_after_change();
-- ---------------------------------------------------------------- disclosure inputs digest + binding invalidation (P-R1-04)
-- broker_report_disclosure_digest: sha256 of everything a disclosure check reads besides the text — licence
-- version + allows_public_target_price, materialized targets' target_key/target_price/upside_pct, bound
-- analysts' public_display/display_name/name_variants. Approval stamps it into disclosure_check.db_digest (a
-- supplied db_digest must equal it: disclosure_inputs_changed); blocker 15 flags approved texts whose stamp
-- differs from the current value. Any binding change returns the report's approved texts to draft.
create or replace function public.broker_report_disclosure_digest(p_report_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select public.broker_sha256(jsonb_build_object(
    'licence_version', l.version, 'allows_public_target_price', l.allows_public_target_price,
    'targets', coalesce((select jsonb_agg(jsonb_build_object('target_key', t.target_key, 'target_price', t.target_price::text, 'upside_pct', t.upside_pct::text) order by t.target_key collate "C")
                         from public.broker_report_targets t where t.report_id = r.report_id), '[]'::jsonb),
    'analysts', coalesce((select jsonb_agg(jsonb_build_object('analyst_id', a.analyst_id, 'public_display', a.public_display, 'display_name', a.display_name, 'name_variants', to_jsonb(a.name_variants)) order by a.analyst_id)
                          from public.broker_report_analysts b join public.research_analysts a on a.analyst_id = b.analyst_id where b.report_id = r.report_id), '[]'::jsonb))::text)
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  where r.report_id = p_report_id
$$;
revoke execute on function public.broker_report_disclosure_digest(uuid) from public, anon, authenticated;
grant execute on function public.broker_report_disclosure_digest(uuid) to service_role;

create or replace function public.broker_report_analysts_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_report uuid := coalesce(new.report_id, old.report_id);
begin
  update public.broker_report_snippets set status = 'draft', draft_reason = 'analyst_disclosure' where report_id = v_report and status = 'approved';
  update public.broker_report_summaries set status = 'draft', draft_reason = 'analyst_disclosure' where report_id = v_report and status = 'approved';
  return null;
end $$;
drop trigger if exists broker_report_analysts_after_change on public.broker_report_analysts;
create trigger broker_report_analysts_after_change after insert or update or delete on public.broker_report_analysts
  for each row execute function public.broker_report_analysts_after_change();

-- ---------------------------------------------------------------- fenced LLM result commits (§6.4; P-R1-09)
-- The summary row / translated titles are written and their run finished in ONE transaction under the lease:
-- a worker whose lease was taken over (token differs or lease_until passed) gets lease_lost and writes nothing.
create or replace function public.broker_llm_fence(p_document uuid, p_token uuid, p_run uuid, p_kind text)
returns public.broker_report_runs language plpgsql security definer set search_path = public as $$
declare v_tok uuid; v_until timestamptz; ru public.broker_report_runs;
begin
  select lease_token, lease_until into v_tok, v_until from public.broker_report_documents where document_id = p_document for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0002'; end if;
  if v_tok is distinct from p_token or v_until is null or v_until <= now() then raise exception 'lease_lost'; end if;
  select * into ru from public.broker_report_runs where run_id = p_run for update;
  if ru.run_id is null or ru.document_id <> p_document or ru.kind <> p_kind or ru.status <> 'running' then raise exception 'run_invalid'; end if;
  return ru;
end $$;
revoke execute on function public.broker_llm_fence(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;

create or replace function public.broker_summary_commit(p_document uuid, p_token uuid, p_run uuid, p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_report uuid := (p_row ->> 'report_id')::uuid;
begin
  perform public.broker_llm_fence(p_document, p_token, p_run, 'summary');
  if not exists (select 1 from public.broker_research_reports where report_id = v_report and document_id = p_document) then raise exception 'report_mismatch'; end if;
  if coalesce(p_row ->> 'status', 'draft') not in ('draft','rejected') then raise exception 'invalid_payload:status'; end if;
  insert into public.broker_report_summaries (report_id, lang, kind, run_id, input_hash, summary_md, max_verbatim_overlap, numeric_grounding, disclosure_check, status)
  values (v_report, p_row ->> 'lang', 'independent_summary', p_run, p_row ->> 'input_hash', p_row ->> 'summary_md', (p_row ->> 'max_verbatim_overlap')::int,
          p_row -> 'numeric_grounding', p_row -> 'disclosure_check', coalesce(p_row ->> 'status', 'draft'))
  returning summary_id into v_id;
  update public.broker_report_runs set status = 'succeeded', detail = detail || jsonb_build_object('summary_id', v_id) where run_id = p_run;
  return v_id;
end $$;
revoke execute on function public.broker_summary_commit(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_summary_commit(uuid, uuid, uuid, jsonb) to service_role;

create or replace function public.broker_title_commit(p_document uuid, p_token uuid, p_run uuid, p_titles jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform public.broker_llm_fence(p_document, p_token, p_run, 'translate');
  update public.broker_research_reports set title_zh = p_titles ->> 'title_zh', title_en = p_titles ->> 'title_en', title_run_id = p_run
  where document_id = p_document and status = 'draft';
  if not found then raise exception 'report_not_draft'; end if;
  update public.broker_report_runs set status = 'succeeded' where run_id = p_run;
  return 'ok';
end $$;
revoke execute on function public.broker_title_commit(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_title_commit(uuid, uuid, uuid, jsonb) to service_role;

-- Extraction tail under the lease (P-R2-04): the scope chosen by the merge is written (only while the report has
-- none) and re-materialized under the fence; the run is finished succeeded and the lease released in one
-- transaction. A worker whose lease was taken over gets lease_lost from either call and writes nothing.
create or replace function public.broker_extract_set_scope(p_document uuid, p_token uuid, p_run uuid, p_scope text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_report uuid;
begin
  perform public.broker_llm_fence(p_document, p_token, p_run, 'extract');
  if p_scope is null or p_scope not in ('single_issuer','multi_issuer','sector','macro_strategy') then raise exception 'invalid_payload:scope'; end if;
  select report_id into v_report from public.broker_research_reports where document_id = p_document and status = 'draft';
  if v_report is null then raise exception 'report_not_draft'; end if;
  update public.broker_research_reports set scope = p_scope where report_id = v_report and scope is null;
  return public.broker_report_materialize(v_report);
end $$;
revoke execute on function public.broker_extract_set_scope(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.broker_extract_set_scope(uuid, uuid, uuid, text) to service_role;

create or replace function public.broker_extract_finalize(p_document uuid, p_token uuid, p_run uuid, p_detail jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform public.broker_llm_fence(p_document, p_token, p_run, 'extract');
  update public.broker_report_runs set status = 'succeeded', detail = detail || coalesce(case when jsonb_typeof(p_detail) = 'object' then p_detail end, '{}'::jsonb) where run_id = p_run;
  update public.broker_report_documents set lease_token = null, lease_until = null where document_id = p_document;
  return 'ok';
end $$;
revoke execute on function public.broker_extract_finalize(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_extract_finalize(uuid, uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- disclosure re-check (spec §4.11 重跑规则; P-R1-08)
-- The admin "re-run disclosure check" after a licence / analyst disclosure change set disclosure_ok=false. TS
-- computes checkDisclosure for every non-null title surface and every APPROVED snippet / summary against the
-- current inputs and passes them with the digest it read; under the report row lock this function verifies
-- the digest is still current (else disclosure_inputs_changed), applies the publish-time title policy
-- (title_original may fail only when title_public passes; on a published report that also needs
-- title_restricted=true already — otherwise restoring would change title_restricted: unpublish + republish),
-- ignores drafts, stores the checks on the approved rows of a draft report, and sets disclosure_ok=true.
-- Any failure changes nothing and returns {restored:false, failures}.
create or replace function public.broker_report_disclosure_recheck(p_report_id uuid, p_by uuid, p_checks jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.broker_research_reports; v_fail text[] := '{}'; v_surface text; v_text text; v_chk jsonb; v_digest text; x record;
  v_titles jsonb := coalesce(p_checks -> 'titles', '{}'::jsonb);
begin
  if p_by is null then raise exception 'invalid_reviewer'; end if;
  select * into r from public.broker_research_reports where report_id = p_report_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  if r.status = 'withdrawn' then raise exception 'report_withdrawn'; end if;
  v_digest := public.broker_report_disclosure_digest(p_report_id);
  if p_checks ->> 'expected_digest' is distinct from v_digest then raise exception 'disclosure_inputs_changed'; end if;
  foreach v_surface in array array['title_original','title_public','title_zh','title_en'] loop
    v_text := case v_surface when 'title_original' then r.title_original when 'title_public' then r.title_public when 'title_zh' then r.title_zh else r.title_en end;
    continue when v_text is null;
    v_chk := v_titles -> v_surface;
    continue when coalesce(v_chk ->> 'passed' = 'true' and v_chk ->> 'version' = 'disclosure/1', false);
    if v_surface = 'title_original' and r.title_public is not null
       and coalesce(v_titles -> 'title_public' ->> 'passed' = 'true' and v_titles -> 'title_public' ->> 'version' = 'disclosure/1', false) then
      if r.status = 'published' and not r.title_restricted then v_fail := v_fail || 'title_restricted_change_requires_republish'::text; end if;
    else
      v_fail := v_fail || ('restricted_value_in_text:' || v_surface);
    end if;
  end loop;
  for x in select sn.snippet_id from public.broker_report_snippets sn where sn.report_id = p_report_id and sn.status = 'approved' order by sn.snippet_id loop
    v_chk := p_checks -> 'snippets' -> x.snippet_id::text;
    -- a missing check (NULL) fails (P-R2-01)
    if v_chk ->> 'passed' is distinct from 'true' or v_chk ->> 'version' is distinct from 'disclosure/1' then
      v_fail := v_fail || ('restricted_value_in_text:snippet:' || x.snippet_id::text);
    end if;
  end loop;
  for x in select su.summary_id, su.lang from public.broker_report_summaries su where su.report_id = p_report_id and su.status = 'approved' order by su.lang loop
    v_chk := p_checks -> 'summaries' -> x.summary_id::text;
    -- a missing check (NULL) fails (P-R2-01)
    if v_chk ->> 'passed' is distinct from 'true' or v_chk ->> 'version' is distinct from 'disclosure/1' then
      v_fail := v_fail || ('restricted_value_in_text:summary:' || x.lang);
    end if;
  end loop;
  if cardinality(v_fail) > 0 then return jsonb_build_object('restored', false, 'failures', to_jsonb(v_fail)); end if;
  if r.status = 'draft' then
    update public.broker_report_snippets sn set disclosure_check = (p_checks -> 'snippets' -> sn.snippet_id::text) || jsonb_build_object('db_digest', v_digest)
    where sn.report_id = p_report_id and sn.status = 'approved';
    update public.broker_report_summaries su set disclosure_check = (p_checks -> 'summaries' -> su.summary_id::text) || jsonb_build_object('db_digest', v_digest)
    where su.report_id = p_report_id and su.status = 'approved';
  end if;
  update public.broker_research_reports set disclosure_ok = true where report_id = p_report_id;
  return jsonb_build_object('restored', true, 'failures', '[]'::jsonb);
end $$;
revoke execute on function public.broker_report_disclosure_recheck(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_report_disclosure_recheck(uuid, uuid, jsonb) to service_role;


-- ---------------------------------------------------------------- §4.13 function privileges (P-R1-05)
-- No client role may EXECUTE any function of this module, trigger functions included (Supabase grants
-- EXECUTE to anon/authenticated on new functions by default). Service-role grants made above stay.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'broker\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
