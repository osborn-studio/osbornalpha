alter table public.usage_events
  add column if not exists status text not null default 'completed';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'usage_events_status_check'
      and conrelid = 'public.usage_events'::pg_catalog.regclass
  ) then
    alter table public.usage_events
      add constraint usage_events_status_check
      check (status in ('completed', 'failed')) not valid;
  end if;
end
$$;

alter table public.usage_events
  validate constraint usage_events_status_check;
