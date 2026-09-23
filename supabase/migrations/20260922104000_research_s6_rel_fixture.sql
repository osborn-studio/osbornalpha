-- Fixture-only accounting: credits have no currency or paid-provider meaning.
create table public.research_s6_rel_limits (
 user_id uuid primary key references auth.users(id),
 credit_limit bigint not null check(credit_limit between 0 and 1000000000),
 hard_stop boolean not null default true
);
create table public.research_s6_rel_runs (
 user_id uuid not null, request_key text not null check(request_key ~ '^[A-Za-z0-9:_-]{8,128}$'), observation_id uuid not null,
 candidate_id uuid not null, request_hash text not null, request jsonb not null,
 state text not null check(state in ('reserved','incurred','unknown','settled','released')),
 reserved bigint not null check(reserved between 1 and 1000000000),
 actual bigint check(actual between 0 and 1000000000),
 receipt_hash text check(receipt_hash ~ '^[0-9a-f]{64}$'),
 failure_code text check(failure_code in ('timeout','adapter_error','invalid_receipt')),
 reserved_at timestamptz not null default clock_timestamp(),
 state_changed_at timestamptz not null default clock_timestamp(),
 choice text check(choice in ('relevant','not_relevant','abstain')),
 primary key(user_id,request_key),
 foreign key(user_id,observation_id) references public.research_s4_observation_state(user_id,observation_id),
 check((state='settled')=(actual is not null)),
 check((state='settled')=(receipt_hash is not null)),
 check(state<>'unknown' or failure_code is not null),
 check(failure_code is null or state in ('unknown','settled')),
 check(choice is null or state='settled')
);
do $$ declare t text; begin
 foreach t in array array['research_s6_rel_limits','research_s6_rel_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('create policy s6_rel_owner on public.%I to alpha_s4_runtime using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
  execute format('grant select on public.%I to alpha_s4_runtime',t);
 end loop;
end $$;
grant insert on public.research_s6_rel_runs to alpha_s4_runtime;
grant update(state,actual,choice,receipt_hash,failure_code) on public.research_s6_rel_runs to alpha_s4_runtime;
grant update(hard_stop) on public.research_s6_rel_limits to alpha_s4_runtime;
create function public.research_s6_rel_limit_lock() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and new.user_id<>old.user_id then raise exception 'immutable_owner'; end if;
 -- A row trigger already holds a row lock: never wait here for an owner lock.
 if not pg_try_advisory_xact_lock(hashtextextended(coalesce(new.user_id,old.user_id)::text,0)) then raise exception 'owner_busy_retry'; end if;
 if tg_op='UPDATE' and old.hard_stop and not new.hard_stop
  and current_user<>pg_get_userbyid((select relowner from pg_class where oid=tg_relid))
  and not (select rolsuper from pg_roles where rolname=current_user)
 then raise exception 'hard_stop_latched'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger research_s6_rel_limit_lock before insert or update or delete on public.research_s6_rel_limits
 for each row execute function public.research_s6_rel_limit_lock();
create function public.research_s6_rel_reserve() returns trigger language plpgsql as $$
declare cap bigint; stopped boolean; used bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if new.state<>'reserved' or new.actual is not null or new.choice is not null or new.receipt_hash is not null or new.failure_code is not null then raise exception 'invalid_rel_initial_state'; end if;
 select credit_limit,hard_stop into cap,stopped from public.research_s6_rel_limits where user_id=new.user_id;
 select coalesce(sum(case when state='settled' then actual when state='released' then 0 else reserved end),0)
 into used from public.research_s6_rel_runs where user_id=new.user_id;
 if cap is null or stopped or used+new.reserved>cap then raise exception 'budget_blocked'; end if;
 new.reserved_at=clock_timestamp();new.state_changed_at=new.reserved_at;
 return new;
end $$;
create trigger research_s6_rel_reserve before insert on public.research_s6_rel_runs
 for each row execute function public.research_s6_rel_reserve();
create function public.research_s6_rel_transition() returns trigger language plpgsql as $$
begin
 if (new.user_id,new.request_key,new.observation_id,new.candidate_id,new.request_hash,new.request,new.reserved,new.reserved_at)
  is distinct from (old.user_id,old.request_key,old.observation_id,old.candidate_id,old.request_hash,old.request,old.reserved,old.reserved_at)
 then raise exception 'immutable_rel_request'; end if;
 if not ((old.state='reserved' and new.state in ('incurred','released'))
  or (old.state='incurred' and new.state in ('unknown','settled'))
  or (old.state='unknown' and new.state='settled')) then raise exception 'invalid_rel_transition'; end if;
 new.state_changed_at=clock_timestamp();
 return new;
end $$;
create trigger research_s6_rel_transition before update on public.research_s6_rel_runs
 for each row execute function public.research_s6_rel_transition();
create trigger research_s6_rel_no_delete before delete on public.research_s6_rel_runs
 for each row execute function public.research_s4_immutable();
create trigger research_s6_rel_no_truncate before truncate on public.research_s6_rel_runs
 for each statement execute function public.research_s4_immutable();
