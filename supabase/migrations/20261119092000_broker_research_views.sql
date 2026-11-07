-- supabase/migrations/20261119092000_broker_research_views.sql
-- FR-0 (spec §4.11, §4.13): the only public read path. Ten views owned by the migration role,
-- security_invoker=false + security_barrier=true, so anon/authenticated read through them with
-- the owner's rights while every base table stays service_role-only. No view calls a function
-- (a called function would need EXECUTE for the caller): the licence predicate and the effective
-- value selector (broker_field_effective) are inlined. Every view: revoke all, then grant select
-- to anon, authenticated, service_role. broker_rating_history_v reads the two public views it is
-- defined over (spec: "来自 targets_public_v"). Replayable: create or replace view.

-- ---------------------------------------------------------------- reports
create or replace view public.broker_reports_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select v.report_id, v.revision, v.current_publication_id as publication_id, v.scope, v.institution_id,
       coalesce(v.title_public, v.title_original) as title, (v.title_public is not null) as title_is_rewritten,
       v.title_zh, v.title_en, (v.title_run_id is not null) as title_is_translation,
       v.published_date, v.price_as_of_date, v.report_type, v.sector_as_stated, v.primary_target_key,
       v.uploaded_at as available_at, v.code_version, v.published_at, v.supersedes_report_id, v.page_count, v.snippet_max_chars,
       v.allows_public_target_price as target_price_public, v.allows_public_summary as summary_public, v.allows_public_snippets as snippets_public,
       -- per-report filter columns (P-R3-05): list filters run in the database with keyset pagination, never via id sets
       -- one {issuer_id, rating} object per target: a combined issuer + rating filter is one containment on ONE element (P-R4-02)
       coalesce((select jsonb_agg(distinct jsonb_build_object('issuer_id', t.issuer_id, 'rating', t.rating_normalized, 'security_ticker', t.security_ticker,
                                  -- the spread currency (P-R5-04): the target currency only while the licence makes it public, else the price currency
                                  'currency', case when v.allows_public_target_price and t.target_price is not null then t.target_currency when t.price_at_report is not null then t.price_currency else null end))
                 from public.broker_report_targets t where t.report_id = v.report_id), '[]'::jsonb) as target_facets,
       (v.allows_public_summary and exists (select 1 from public.broker_report_summaries su where su.report_id = v.report_id and su.status = 'approved')) as has_summary,
       rr.rules_version, tr.model_id as title_model_id
from visible_reports v
join public.broker_report_publications pp on pp.publication_id = v.current_publication_id
join public.broker_report_rule_receipts rr on rr.receipt_id = pp.rules_receipt_id
left join public.broker_report_runs tr on tr.run_id = v.title_run_id;

-- ---------------------------------------------------------------- targets
create or replace view public.broker_report_targets_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select t.report_id, v.current_publication_id as publication_id, t.target_key, t.ticker_as_stated, t.security_ticker, t.issuer_id,
       t.rating_raw, t.rating_normalized, t.scale_id,
       case when v.allows_public_target_price then t.target_price end as target_price,
       case when v.allows_public_target_price then t.target_currency end as target_currency,
       case when v.allows_public_target_price then t.target_horizon_months end as target_horizon_months,
       case when v.allows_public_target_price then t.upside_pct end as upside_pct,
       v.allows_public_target_price as target_price_public,
       t.price_at_report, t.price_currency, t.price_as_of_date,
       case when v.allows_public_target_price then t.upside_formula_version end as upside_formula_version
from visible_reports v
join public.broker_report_targets t on t.report_id = v.report_id;

-- ---------------------------------------------------------------- citations (effective rows, no spans)
create or replace view public.broker_report_citations_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select f.report_id, f.field_id, f.target_key, f.field, f.occurrence, f.page,
       case when f.corrected ? 'value_text' then f.corrected ->> 'value_text' else f.value_text end as value_text,
       case when f.corrected ? 'value_num' then (f.corrected ->> 'value_num')::numeric else f.value_num end as value_num,
       case when f.corrected ? 'value_currency' then f.corrected ->> 'value_currency' else f.value_currency end as value_currency,
       case when f.corrected ? 'value_unit' then f.corrected ->> 'value_unit' else f.value_unit end as value_unit,
       case when f.corrected ? 'value_date' then (f.corrected ->> 'value_date')::date else f.value_date end as value_date,
       f.status, split_part(f.extractor, ':', 1) as extractor_kind
from visible_reports v
join public.broker_report_fields f on f.report_id = v.report_id
where f.status in ('confirmed','corrected','absent')
  and not (f.field in ('target_price','target_currency','target_horizon','upside_stated') and not v.allows_public_target_price)
  and (f.field <> 'analyst' or exists (select 1 from public.broker_report_analysts a join public.research_analysts ra on ra.analyst_id = a.analyst_id
                                       where a.field_id = f.field_id and ra.public_display))
  and not (f.field = 'title' and v.title_restricted);

-- ---------------------------------------------------------------- snippets
create or replace view public.broker_report_snippets_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select sn.snippet_id, sn.report_id, sn.target_key, sn.purpose, sn.page, sn.text, sn.field_id
from visible_reports v
join public.broker_report_snippets sn on sn.report_id = v.report_id
where sn.status = 'approved' and v.allows_public_snippets and length(sn.text) <= v.snippet_max_chars;

-- ---------------------------------------------------------------- summaries
create or replace view public.broker_report_summaries_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select su.summary_id, su.report_id, su.lang, su.kind, ru.model_id, ru.registry_hash, ru.prompt_version, su.input_hash, su.summary_md, su.generated_at,
       coalesce((select jsonb_agg(a - 'field_id' order by (a ->> 'sentence_idx')::int, a ->> 'target_key', a ->> 'field')
                 from jsonb_array_elements(case when jsonb_typeof(su.numeric_grounding -> 'assertions') = 'array' then su.numeric_grounding -> 'assertions' else '[]'::jsonb end) a),
                '[]'::jsonb) as grounding_assertions
from visible_reports v
join public.broker_report_summaries su on su.report_id = v.report_id
join public.broker_report_runs ru on ru.run_id = su.run_id
where su.status = 'approved' and v.allows_public_summary;

-- ---------------------------------------------------------------- analysts
create or replace view public.broker_analysts_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select a.report_id, a.analyst_id, ra.display_name, ra.institution_id, a.role
from visible_reports v
join public.broker_report_analysts a on a.report_id = v.report_id
join public.research_analysts ra on ra.analyst_id = a.analyst_id
where ra.public_display;

-- ---------------------------------------------------------------- rating / target history (facts, no judgement)
-- Same visibility gates as the report/target public views (both use the visible_reports CTE above).
-- Lower window bound is applied by the reader: latest >= from iff any matching report >= from.
-- No pre-selection report limit; deterministic newest report per security/currency/institution.
create or replace view public.broker_spread_latest_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
), matching as (
 select r.report_id,r.published_date,r.institution_id,t.security_ticker,t.issuer_id,
        case when t.target_price is not null then t.target_currency when t.price_at_report is not null then t.price_currency else null end as currency
 from visible_reports r join public.broker_report_targets_public_v t using (report_id)
 where r.institution_id is not null
)
select distinct on (security_ticker,currency,institution_id) * from matching
where currency is not null
order by security_ticker,currency,institution_id,published_date desc,report_id desc;

create or replace view public.broker_rating_history_v with (security_invoker = false, security_barrier = true) as
select h.report_id, h.prev_report_id, h.target_key, h.institution_id, h.security_ticker, h.issuer_id,
       h.published_date, h.prev_published_date, h.rating_normalized, h.prev_rating_normalized, h.scale_id, h.prev_scale_id,
       h.target_price, h.prev_target_price, h.target_currency, h.upside_formula_version, h.prev_upside_formula_version,
       h.code_version, h.prev_code_version, h.available_at, h.prev_available_at
from (
  select t.report_id, t.target_key, r.institution_id, t.security_ticker, t.issuer_id, r.published_date, t.rating_normalized, t.scale_id,
         t.target_price, t.target_currency, t.upside_formula_version, r.code_version, r.available_at,
         lag(t.report_id) over w as prev_report_id,
         lag(r.published_date) over w as prev_published_date,
         lag(t.rating_normalized) over w as prev_rating_normalized,
         lag(t.scale_id) over w as prev_scale_id,
         lag(t.target_price) over w as prev_target_price,
         lag(t.upside_formula_version) over w as prev_upside_formula_version,
         lag(r.code_version) over w as prev_code_version,
         lag(r.available_at) over w as prev_available_at
  from public.broker_report_targets_public_v t
  join public.broker_reports_public_v r on r.report_id = t.report_id
  where t.report_id not in (select x.supersedes_report_id from public.broker_reports_public_v x where x.supersedes_report_id is not null)
  window w as (partition by r.institution_id, t.security_ticker, t.target_currency order by r.published_date, t.report_id)
) h;

-- ---------------------------------------------------------------- institutions, rating scales
create or replace view public.research_institutions_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select i.institution_id, i.name_en, i.name_zh, i.aliases, i.kind, i.rating_disclosure_url,
       agg.report_count, agg.last_published_date, agg.last_available_at
from public.research_institutions i
join public.broker_research_settings s on s.id = 1
join (select v.institution_id, count(*)::int as report_count, max(v.published_date) as last_published_date, max(v.uploaded_at) as last_available_at
      from visible_reports v group by v.institution_id) agg on agg.institution_id = i.institution_id
where s.public_enabled;

create or replace view public.research_rating_scales_public_v with (security_invoker = false, security_barrier = true) as
with visible_reports as (
  select r.*, d.uploaded_at, d.page_count, l.snippet_max_chars, l.allows_public_target_price, l.allows_public_snippets, l.allows_public_summary, p.published_at
  from public.broker_research_reports r
  join public.broker_report_documents d on d.document_id = r.document_id
  join public.broker_report_licences l on l.licence_id = d.licence_id
  join public.broker_research_settings s on s.id = 1
  join public.broker_report_publications p on p.publication_id = r.current_publication_id and p.licence_version = l.version
  where s.public_enabled and r.status = 'published' and r.evidence_ok and r.disclosure_ok and d.status <> 'withdrawn'
    and l.confirmed_at is not null and l.confirmed_version = l.version
    and current_date >= l.valid_from and (l.valid_to is null or current_date <= l.valid_to)
    and l.allows_public_metadata
)
select sc.scale_id, sc.institution_id, sc.raw_label, sc.normalized, sc.source_url, sc.valid_from, sc.valid_to
from public.research_rating_scales sc
join public.broker_research_settings s on s.id = 1
where s.public_enabled and exists (select 1 from visible_reports v where v.institution_id = sc.institution_id);

-- ---------------------------------------------------------------- view privileges (§4.13)
do $$ declare v text; begin
  foreach v in array array['broker_reports_public_v','broker_report_targets_public_v','broker_report_citations_v','broker_report_snippets_public_v',
    'broker_report_summaries_public_v','broker_analysts_public_v','broker_rating_history_v','broker_spread_latest_v','research_institutions_public_v','research_rating_scales_public_v'] loop
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v);
    execute format('grant select on public.%I to anon, authenticated, service_role', v);
  end loop;
end $$;
