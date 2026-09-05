-- Claim-level evidence mappings make each generated assertion independently
-- inspectable while preserving the legacy summary/cites/citations columns.
alter table public.perspectives
  add column if not exists claims jsonb not null default '[]'::jsonb;

alter table public.perspectives
  drop constraint if exists perspectives_claims_shape_check;
alter table public.perspectives
  add constraint perspectives_claims_shape_check check (
    jsonb_typeof(claims) = 'array'
    and jsonb_array_length(claims) <= 6
  );

insert into public.watchlist_release_markers (marker)
values ('perspective_claims')
on conflict (marker) do nothing;
