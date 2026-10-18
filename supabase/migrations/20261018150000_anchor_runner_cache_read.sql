-- I1.4c: let the runner read its owner's cached checkpoint (sequence, hash, generation, store)
-- through a scoped function, so start-of-run reconciliation can compare the cache with the
-- independent registry without any table privilege. Same principal and generation fence as
-- the other runner functions (20261018120000_anchor_runner.sql).
create function public.research_s4_anchor_checkpoint_cache(p_owner uuid, p_generation bigint)
returns table (last_sequence bigint, last_hash text, generation bigint, store_id uuid, database_identity uuid, confirmed_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.research_s4_anchor_principal(p_owner, p_generation);
  return query select c.last_sequence, c.last_hash, c.generation, c.store_id, c.database_identity, c.confirmed_at
    from public.research_s4_anchor_checkpoints c where c.user_id = p_owner;
end $$;
revoke all on function public.research_s4_anchor_checkpoint_cache(uuid, bigint) from public;
alter function public.research_s4_anchor_checkpoint_cache(uuid, bigint) owner to alpha_anchor_fn_owner;
grant execute on function public.research_s4_anchor_checkpoint_cache(uuid, bigint) to alpha_anchor_runner;
