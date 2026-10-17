-- Candidate-only retained revocation evidence. Not an automatic migration.
-- Owner/superuser DDL (disable/drop trigger) and replication-role privileges can bypass these guards.
-- Operational writers must not receive SET ON PARAMETER session_replication_role or owner membership.
-- Operational account erasure/retention requires a separately reviewed procedure.
create function research_revocation_candidate.retain_evidence() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 raise exception 'revocation_evidence_immutable';
end $$;
revoke all on function research_revocation_candidate.retain_evidence() from public;
create trigger retain_inbox_rows before update or delete on research_revocation_candidate.inbox
 for each row execute function research_revocation_candidate.retain_evidence();
create trigger retain_inbox_truncate before truncate on research_revocation_candidate.inbox
 for each statement execute function research_revocation_candidate.retain_evidence();
create trigger retain_mapping_rows before delete on research_revocation_candidate.binding_map
 for each row execute function research_revocation_candidate.retain_evidence();
create trigger retain_mapping_truncate before truncate on research_revocation_candidate.binding_map
 for each statement execute function research_revocation_candidate.retain_evidence();
