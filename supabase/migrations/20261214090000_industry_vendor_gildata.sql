-- Private Gildata evidence, fetch history and generation-scoped SW2021 snapshots.
create table if not exists public.vendor_evidence_objects (
 sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
 vendor text not null check (vendor='gildata'),
 object_path text not null unique, content_type text not null,
 byte_length integer not null check (byte_length>0), created_at timestamptz not null default now()
);
create table if not exists public.vendor_retrievals (
 retrieval_id uuid primary key, vendor text not null check (vendor='gildata'),
 product text not null, interface text not null, query_template_id text not null,
 query_template_version integer not null check (query_template_version>0),
 request_canonical jsonb not null check (jsonb_typeof(request_canonical)='object'
   and request_canonical::text !~* '(authorization|bearer|api[_-]?key|secret|token)'),
 sha256 text not null references public.vendor_evidence_objects,
 canonical_sha256 text check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
 api_names_returned text[] not null default '{}', http_status integer not null,
 fetched_at timestamptz not null, vendor_as_of timestamptz,
 batch_id uuid references public.ingest_batches on delete restrict, attempt integer not null check (attempt>=1),
 outcome text not null check (outcome in ('ok','parse_failed','request_mismatch')),
 outcome_reason text check (outcome_reason ~ '^[a-z_]{1,64}$'), created_at timestamptz not null default now()
);
create index if not exists vendor_retrievals_fetched on public.vendor_retrievals(vendor,fetched_at desc);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('vendor-raw','vendor-raw',false,10485760,array['application/json'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into public.industry_dataset_licenses(dataset_key,status,decided_by,note)
values ('vendor:gildata:industry-financials','internal','migration:20261214090000','owner exception 2026-11-20 for Gildata; vendor terms bar display to third parties; admin-only until the owner confirms terms')
on conflict (dataset_key) do nothing;

create table if not exists public.industry_vendor_runs (
 run_id uuid primary key, vendor text not null check (vendor='gildata'), product text not null,
 kind text not null check (kind in ('memberships','financials')), dataset_key text not null references public.industry_dataset_licenses,
 check ((kind='memberships' and dataset_key='scheme:sw2021:2021') or (kind='financials' and dataset_key='vendor:gildata:industry-financials')),
 scheme text not null check (scheme='sw2021'), version text not null check (version='2021'), level integer not null check (level=1),
 generation integer not null check (generation>0), unique(vendor,kind,scheme,version,level,generation),
 status text not null check (status in ('building','active','superseded','failed')),
 parser_version text not null, mapping_version text not null, query_template_id text not null, query_template_version integer not null,
 code_version text not null, expected_grid jsonb not null check (jsonb_typeof(expected_grid)='object'),
 content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'), coverage_summary jsonb not null default '{}',
 fetched_from timestamptz not null, fetched_to timestamptz not null, batch_id uuid references public.ingest_batches,
 failure_code text check (failure_code ~ '^[a-z_]{1,64}$'), created_at timestamptz not null default now(), activated_at timestamptz,
 check ((status in ('active','superseded'))=(activated_at is not null))
);
create unique index if not exists industry_vendor_active on public.industry_vendor_runs(vendor,kind,scheme,version,level) where status='active';
create table if not exists public.industry_vendor_classifications (
 run_id uuid references public.industry_vendor_runs on delete cascade, code text not null, vendor_code text not null check (vendor_code ~ '^\d{6}$'),
 name_zh text not null, scheme_label text not null, level integer not null check(level=1),
 retrieval_id uuid not null references public.vendor_retrievals, primary key(run_id,code)
);
create table if not exists public.industry_vendor_memberships (
 run_id uuid references public.industry_vendor_runs on delete cascade, code text not null, security_code text not null check (security_code ~ '^\d{6}$'),
 security_name text not null, retrieval_id uuid not null references public.vendor_retrievals,
 locator jsonb not null check(jsonb_typeof(locator)='object'), primary key(run_id,code,security_code)
);
create index if not exists industry_vendor_member_security on public.industry_vendor_memberships(security_code);
create table if not exists public.industry_vendor_observations (
 run_id uuid references public.industry_vendor_runs on delete cascade, code text not null,
 metric text not null check(metric in ('member_count','revenue_cum','revenue_ttm','net_income_parent_cum','net_income_parent_ttm','net_income_parent_yoy','net_assets','roe_avg','roe_ttm','gross_margin','gross_margin_ttm','ocf_to_revenue')),
 period_start date not null, period_end date not null, duration text not null check(duration in ('YTD','TTM','INSTANT')),
 status text not null check(status in ('ok','missing')), missing_reason text check(missing_reason='vendor_not_provided'),
 value_text text, value numeric, unit text not null check(unit in ('cny_10k','pct','count')), vendor_as_of timestamptz,
 retrieval_id uuid references public.vendor_retrievals, locator jsonb, primary key(run_id,code,metric,duration,period_end),
 check ((status='ok')=(value_text is not null and value is not null and missing_reason is null)),
 check (status<>'missing' or (missing_reason is not null and value_text is null and value is null)),
 check (status<>'ok' or (retrieval_id is not null and locator is not null)),
 check (value_text is null or (value_text ~ '^-?\d+(\.\d+)?$' and value=value_text::numeric))
);
create index if not exists industry_vendor_obs_series on public.industry_vendor_observations(code,metric,period_end);

do $$
declare t text;
begin
 foreach t in array array['vendor_evidence_objects','vendor_retrievals','industry_vendor_runs','industry_vendor_memberships','industry_vendor_classifications','industry_vendor_observations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
  execute format('grant select on public.%I to service_role',t);
  execute format('drop policy if exists vendor_service_read on public.%I',t);
  execute format('create policy vendor_service_read on public.%I for select to service_role using (true)',t);
 end loop;
end $$;

create or replace function public.record_vendor_retrieval(p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.vendor_retrievals; seen text;
begin
 r:=jsonb_populate_record(null::public.vendor_retrievals,p);
 insert into public.vendor_evidence_objects(sha256,vendor,object_path,content_type,byte_length)
 values(r.sha256,r.vendor,p->>'object_path',p->>'content_type',(p->>'byte_length')::integer) on conflict do nothing;
 if not exists(select 1 from public.vendor_evidence_objects e where e.sha256=r.sha256 and e.vendor=r.vendor and e.object_path=p->>'object_path') then
  raise exception 'evidence_conflict' using errcode='23514';
 end if;
 r.created_at:=now(); r.api_names_returned:=coalesce(r.api_names_returned,'{}');
 insert into public.vendor_retrievals select r.* on conflict(retrieval_id) do nothing;
 select sha256 into seen from public.vendor_retrievals where retrieval_id=r.retrieval_id;
 if seen<>r.sha256 then raise exception 'retrieval_conflict' using errcode='23514'; end if;
 return r.retrieval_id;
end $$;
revoke execute on function public.record_vendor_retrieval(jsonb) from public, anon, authenticated;
grant execute on function public.record_vendor_retrieval(jsonb) to service_role;

create or replace function public.create_industry_vendor_run(p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_vendor_runs;
begin
 r:=jsonb_populate_record(null::public.industry_vendor_runs,p);
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','industry-vendor',r.vendor,r.kind,r.scheme,r.version,r.level),0));
 select coalesce(max(generation),0)+1 into r.generation from public.industry_vendor_runs
 where (vendor,kind,scheme,version,level)=(r.vendor,r.kind,r.scheme,r.version,r.level);
 r.run_id:=coalesce(r.run_id,gen_random_uuid()); r.status:='building'; r.created_at:=now(); r.activated_at:=null; r.failure_code:=null;
 r.coverage_summary:=coalesce(r.coverage_summary,'{}');
 insert into public.industry_vendor_runs select r.*;
 return jsonb_build_object('run_id',r.run_id,'generation',r.generation);
end $$;
revoke execute on function public.create_industry_vendor_run(jsonb) from public, anon, authenticated;
grant execute on function public.create_industry_vendor_run(jsonb) to service_role;

create or replace function public.stage_industry_vendor_rows(p_run uuid,p_table text,p_rows jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_vendor_runs; n integer;
begin
 if p_table is null or p_table not in ('memberships','observations','classifications') then raise exception 'invalid_table' using errcode='23514'; end if;
 select * into r from public.industry_vendor_runs where run_id=p_run for update;
 if r.status is distinct from 'building' then raise exception 'run_not_building' using errcode='23514'; end if;
 if (p_table='memberships')<>(r.kind='memberships') then raise exception 'wrong_run_kind' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x
  where (x->>'retrieval_id' is not null or p_table<>'observations' or x->>'status'='ok')
   and not exists(select 1 from public.vendor_retrievals v where v.retrieval_id=(x->>'retrieval_id')::uuid and v.vendor=r.vendor and v.outcome='ok'))
 then raise exception 'retrieval_not_ok' using errcode='23514'; end if;
 if p_table='memberships' then
  insert into public.industry_vendor_memberships select p_run,code,security_code,security_name,retrieval_id,locator
   from jsonb_to_recordset(p_rows) x(code text,security_code text,security_name text,retrieval_id uuid,locator jsonb);
 elsif p_table='classifications' then
  insert into public.industry_vendor_classifications select p_run,code,vendor_code,name_zh,scheme_label,level,retrieval_id
   from jsonb_to_recordset(p_rows) x(code text,vendor_code text,name_zh text,scheme_label text,level integer,retrieval_id uuid);
 else
  insert into public.industry_vendor_observations select p_run,code,metric,period_start,period_end,duration,status,missing_reason,
   value_text,value_text::numeric,unit,vendor_as_of,retrieval_id,locator from jsonb_to_recordset(p_rows)
   x(code text,metric text,period_start date,period_end date,duration text,status text,missing_reason text,value_text text,unit text,vendor_as_of timestamptz,retrieval_id uuid,locator jsonb);
 end if;
 get diagnostics n=row_count; return n;
end $$;
revoke execute on function public.stage_industry_vendor_rows(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.stage_industry_vendor_rows(uuid,text,jsonb) to service_role;

create or replace function public.activate_industry_vendor_run(p_run uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_vendor_runs; prev public.industry_vendor_runs; codes text[]; actual text[];
 members integer:=0; classes integer:=0; observations integer:=0; grid_ok boolean;
begin
 select * into r from public.industry_vendor_runs where run_id=p_run;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','industry-vendor',r.vendor,r.kind,r.scheme,r.version,r.level),0));
 select * into r from public.industry_vendor_runs where run_id=p_run for update;
 if r.status is distinct from 'building' then raise exception 'run_not_building' using errcode='23514'; end if;
 select * into prev from public.industry_vendor_runs where status='active' and (vendor,kind,scheme,version,level)=(r.vendor,r.kind,r.scheme,r.version,r.level);
 if prev.generation>=r.generation then raise exception 'obsolete_run' using errcode='23514'; end if;
 if jsonb_typeof(r.expected_grid->'codes') is distinct from 'array' then raise exception 'incomplete_grid' using errcode='23514'; end if;
 select array_agg(code order by code) into codes from jsonb_array_elements_text(r.expected_grid->'codes') c(code);
 if r.kind='memberships' then
  select count(*),array_agg(distinct code order by code) into members,actual from public.industry_vendor_memberships where run_id=p_run;
 else
  select count(*),array_agg(code order by code) into classes,actual from public.industry_vendor_classifications where run_id=p_run;
  if jsonb_typeof(r.expected_grid->'period_ends') is distinct from 'array' or jsonb_typeof(r.expected_grid->'metrics') is distinct from 'array'
   then raise exception 'incomplete_grid' using errcode='23514'; end if;
  select count(*) into observations from public.industry_vendor_observations where run_id=p_run;
  -- Primary key uniqueness plus equal cardinality and a match for every required cell.
  with grid as (
   select code,period,metric,duration from unnest(codes) c(code)
    cross join jsonb_array_elements_text(r.expected_grid->'period_ends') d(period)
    cross join jsonb_to_recordset(r.expected_grid->'metrics') m(metric text,duration text)
  ) select count(*)=observations and count(o.run_id)=observations and count(distinct (g.code,g.period,g.metric,g.duration))=observations into grid_ok
    from grid g left join public.industry_vendor_observations o on o.run_id=p_run and o.code=g.code and o.period_end::text=g.period and o.metric=g.metric and o.duration=g.duration;
  if not grid_ok or jsonb_array_length(r.expected_grid->'metrics')=0 then raise exception 'incomplete_grid' using errcode='23514'; end if;
 end if;
 if codes is null or codes is distinct from actual then raise exception 'incomplete_grid' using errcode='23514'; end if;
 update public.industry_vendor_runs set status='superseded' where run_id=prev.run_id;
 update public.industry_vendor_runs set status='active',activated_at=now() where run_id=p_run;
 return jsonb_build_object('memberships',members,'classifications',classes,'observations',observations);
end $$;
revoke execute on function public.activate_industry_vendor_run(uuid) from public, anon, authenticated;
grant execute on function public.activate_industry_vendor_run(uuid) to service_role;

create or replace function public.fail_industry_vendor_run(p_run uuid,p_code text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
 if p_code is null or p_code !~ '^[a-z_]{1,64}$' then raise exception 'invalid_failure_code' using errcode='23514'; end if;
 update public.industry_vendor_runs set status='failed',failure_code=p_code where run_id=p_run and status='building';
 if not found then raise exception 'run_not_building' using errcode='23514'; end if;
end $$;
revoke execute on function public.fail_industry_vendor_run(uuid,text) from public, anon, authenticated;
grant execute on function public.fail_industry_vendor_run(uuid,text) to service_role;

create or replace function public.industry_vendor_rows_frozen() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare s text;
begin
 select status into s from public.industry_vendor_runs where run_id=old.run_id for share;
 if tg_op='DELETE' and (s is null or s in ('building','failed','superseded')) then return old; end if;
 if tg_op='UPDATE' and s='building' and old.run_id=new.run_id then return new; end if;
 raise exception 'append_only' using errcode='23514';
end $$;
revoke execute on function public.industry_vendor_rows_frozen() from public,anon,authenticated,service_role;
do $$
declare t text;
begin
 foreach t in array array['industry_vendor_memberships','industry_vendor_classifications','industry_vendor_observations'] loop
  execute format('drop trigger if exists vendor_rows_frozen on public.%I',t);
  execute format('create trigger vendor_rows_frozen before update or delete on public.%I for each row execute function public.industry_vendor_rows_frozen()',t);
 end loop;
end $$;
