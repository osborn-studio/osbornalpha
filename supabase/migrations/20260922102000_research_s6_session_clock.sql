-- Provisioning must not extend the one-hour ceiling with a future created_at.
create or replace function public.research_s6_session_lock() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and (new.user_id<>old.user_id or new.token_hash<>old.token_hash or new.created_at<>old.created_at) then raise exception 'immutable_session_identity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.user_id,old.user_id)::text,0));
 if tg_op='DELETE' then return old; end if;
 if tg_op='INSERT' then new.created_at=clock_timestamp(); end if;
 return new;
end $$;
