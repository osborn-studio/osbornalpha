-- Local S6 acceptance. Same database and owner lock as S4; no browser DML.
create table public.research_s6_sessions (
 user_id uuid not null references auth.users(id), token_hash text not null,
 subject text not null, audience text not null check(audience='alpha-evaluator'),
 scopes text[] not null, expires_at timestamptz not null, revoked boolean not null default false,
 primary key(user_id,token_hash), check(token_hash ~ '^[0-9a-f]{64}$'),
 check(scopes <@ array['observation:read','evaluation:append']::text[])
);
create function public.research_s6_session_lock() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and (new.user_id<>old.user_id or new.token_hash<>old.token_hash) then raise exception 'immutable_session_identity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.user_id,old.user_id)::text,0));
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger research_s6_session_lock before insert or update or delete on public.research_s6_sessions
 for each row execute function public.research_s6_session_lock();
create table public.research_s6_markets (
 user_id uuid not null, id text not null, observation_id uuid not null,
 snapshot jsonb not null, snapshot_hash text not null,
 raw_response text not null, evidence jsonb not null, evidence_hash text not null,
 fetched_at timestamptz not null default clock_timestamp(),
 primary key(user_id,id),
 foreign key(user_id,observation_id) references public.research_s4_observation_state(user_id,observation_id)
);
create table public.research_s6_evaluations (
 user_id uuid not null, id uuid not null, observation_id uuid not null,
 idempotency_key text not null, body_hash text not null, input jsonb not null,
 result jsonb not null, result_hash text not null, receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,id), unique(user_id,idempotency_key),
 foreign key(user_id,observation_id) references public.research_s4_observation_state(user_id,observation_id)
);
create index research_s6_evaluation_history on public.research_s6_evaluations(user_id,observation_id,created_at);
do $$ declare t text; begin
 foreach t in array array['research_s6_sessions','research_s6_markets','research_s6_evaluations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('create policy s6_owner on public.%I to alpha_s4_runtime using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
  execute format('grant select on public.%I to alpha_s4_runtime',t);
  if t <> 'research_s6_sessions' then
   execute format('grant insert on public.%I to alpha_s4_runtime',t);
   execute format('create trigger %I before update or delete on public.%I for each row execute function public.research_s4_immutable()',t||'_immutable',t);
  end if;
 end loop;
end $$;
