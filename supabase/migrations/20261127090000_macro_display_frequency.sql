-- Display-only FRED weekly observations; regime definitions remain unchanged.
do $$
declare
 names text[];
begin
 select array_agg(c.conname) into names
 from pg_constraint c
 where c.conrelid='public.macro_series'::regclass and c.contype='c'
 and pg_get_constraintdef(c.oid) ~ '\mnative_frequency\M';
 if coalesce(array_length(names,1),0)<>1 then
  raise exception 'expected exactly one macro_series native_frequency check';
 end if;
 execute format('alter table public.macro_series drop constraint %I',names[1]);
 alter table public.macro_series add constraint macro_series_native_frequency_check
  check (native_frequency in ('daily','weekly','monthly','quarterly','event'));
end $$;
