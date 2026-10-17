import type {PoolClient} from 'pg';
import {fail} from '../ingest/pa-v1/json.js';
/** Rechecked before each business transaction. No cached success across role changes. */
export async function assertRuntimePrivileges(db:PoolClient) {
 const result=await db.query(`select
  current_user <> session_user
  or exists(select 1 from pg_catalog.pg_roles r where pg_catalog.pg_has_role(session_user,r.oid,'MEMBER')
   and (r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication
    or r.rolname ~ '^pg_'))
  or exists(select 1 from pg_catalog.pg_roles r where pg_catalog.pg_has_role(session_user,r.oid,'MEMBER')
   and (pg_catalog.has_schema_privilege(r.oid,'public','CREATE')
    or pg_catalog.has_database_privilege(r.oid,pg_catalog.current_database(),'CREATE')))
  or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') and pg_catalog.pg_has_role(session_user,c.relowner,'MEMBER'))
  or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')
   and (c.relname ~ '^research_s[46]_' or c.relname in ('research_source_versions','research_source_occurrences'))
   and (not c.relrowsecurity or not c.relforcerowsecurity))
  or (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') and c.relname in
   ('research_s4_bindings','research_s4_records','research_s6_sessions','research_s6_evaluations'))<>4 as unsafe`);
 if(result.rows.length!==1||result.rows[0].unsafe!==false)fail('scope_denied');
}
