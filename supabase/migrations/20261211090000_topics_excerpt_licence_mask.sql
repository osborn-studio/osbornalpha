-- Replaces the public licence status and version views. CREATE OR REPLACE makes this replayable.
-- Base tables have RLS enabled and no client grants. The views are the only client read path
-- and run as their owner (security_invoker = false). The security barrier prevents client
-- predicates from being pushed below the filter. Masking is inline so no function is introduced.
create or replace view public.topic_licence_status_public_v with (security_invoker = false, security_barrier = true) as
select l.licence_id, l.status,
       coalesce(l.status = 'approved' and l.permits -> 'display_excerpt' = 'true'::jsonb, false) as excerpt_allowed
from public.topic_source_licences l
join public.topic_settings s on s.id = 1
where s.public_enabled;

create or replace view public.topic_versions_public_v with (security_invoker = false, security_barrier = true) as
select v.version_id, v.topic_id, t.topic_slug, v.version_no, v.cutoff, v.published_at, v.supersedes_version_id,
       v.unpublished_at, v.unpublish_reason, v.snapshot_hash,
       case when v.unpublished_at is not null then null
            when jsonb_typeof(v.snapshot -> 'entries') = 'array' then jsonb_set(v.snapshot, '{entries}', (
              select coalesce(jsonb_agg(case
                when e ->> 'entry_type' = 'owner_note' then e
                when e ->> 'entry_type' = 'licensed_excerpt' and exists (
                  select 1 from public.topic_licence_status_public_v p
                  where p.licence_id::text = e ->> 'licence_id' and p.excerpt_allowed
                ) then e
                else jsonb_build_object('key', e -> 'key', 'entry_type', 'licensed_excerpt',
                  'masked', true, 'reason', 'licence_revoked', 'attributions', (
                    select coalesce(jsonb_agg(jsonb_build_object('attribution', f -> 'attribution', 'url', f -> 'url')
                                              order by fragment_no), '[]'::jsonb)
                    from jsonb_array_elements(case when jsonb_typeof(e -> 'fragments') = 'array'
                                              then e -> 'fragments' else '[]'::jsonb end)
                         with ordinality as fragments(f, fragment_no)
                  ))
                end order by entry_no), '[]'::jsonb)
              from jsonb_array_elements(v.snapshot -> 'entries') with ordinality as entries(e, entry_no)
            ))
            when v.snapshot ? 'entries' then jsonb_set(v.snapshot, '{entries}', '[]'::jsonb)
            else v.snapshot end as snapshot
from public.topic_versions v
join public.topics t on t.topic_id = v.topic_id
join public.topic_settings s on s.id = 1
where s.public_enabled;

do $$ declare t text; begin
  foreach t in array array['topic_licence_status_public_v','topic_versions_public_v'] loop
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to authenticated, service_role', t);
  end loop;
end $$;
