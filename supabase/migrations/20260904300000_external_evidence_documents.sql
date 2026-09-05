-- Auditable official-document projections. Extraction is performed by a
-- separately configured provider; only content from the strict official-domain
-- allowlist reaches these fields.
alter table public.external_evidence
  add column if not exists document_content_hash text,
  add column if not exists document_fetched_at timestamptz,
  add column if not exists document_paragraphs jsonb not null default '[]'::jsonb;

alter table public.external_evidence
  drop constraint if exists external_evidence_document_hash_check;
alter table public.external_evidence
  add constraint external_evidence_document_hash_check
  check (document_content_hash is null or document_content_hash ~ '^[0-9a-f]{64}$');

alter table public.external_evidence
  drop constraint if exists external_evidence_document_paragraphs_check;
alter table public.external_evidence
  add constraint external_evidence_document_paragraphs_check
  check (jsonb_typeof(document_paragraphs) = 'array');

insert into public.watchlist_release_markers (marker)
values ('external_evidence_documents')
on conflict (marker) do nothing;
