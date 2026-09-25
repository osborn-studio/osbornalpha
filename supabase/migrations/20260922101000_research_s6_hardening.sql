-- Explicit grants even on Supabase instances with broad default privileges.
alter table public.research_s6_sessions add column created_at timestamptz not null default clock_timestamp();
-- Existing provisioning may predate this cap; shorten rather than extend a grant.
update public.research_s6_sessions set expires_at=least(expires_at,created_at+interval '1 hour');
alter table public.research_s6_sessions add constraint s6_session_max_lifetime check(expires_at<=created_at+interval '1 hour');
do $$ declare t text; begin
 foreach t in array array['research_s6_sessions','research_s6_markets','research_s6_evaluations'] loop
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.research_s4_immutable()',t||'_no_truncate',t);
 end loop;
end $$;
