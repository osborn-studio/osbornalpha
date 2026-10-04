# I1a: explicit research runtime boundary

Status: candidate implementation; **production runtime remains closed in code**. Based on Alpha PR #69 (`4e6ef46`). This does not finish I1 or authorize production changes.

## Configuration and current behavior

`ALPHA_RESEARCH_RUNTIME_MODE` defaults to `local` for compatibility with existing synthetic acceptance tools. Unknown modes fail. Local mode requires a credentialed PostgreSQL URL on loopback and rejects a Vercel environment. `localhost` resolves to explicit 127.0.0.1 in the local pool; IPv6 loopback remains supported. Query/fragment components and non-PostgreSQL protocols are rejected. Explicit fields prevent connection-string query parameters from overriding the host/TLS configuration. Local trust/no-password URLs are no longer accepted; the existing harness already generates random passwords.

Production candidate parsing requires all of:

- `ALPHA_S4_ENABLED=1`, mode `production`, trusted `VERCEL=1`, `VERCEL_ENV=production`.
- `ALPHA_S4_RELEASE_SHA` equals the platform-injected 40-character `VERCEL_GIT_COMMIT_SHA`.
- `ALPHA_S4_DATABASE_URL` exactly matches separately registered `ALPHA_S4_DB_HOST`, `ALPHA_S4_DB_PORT`, `ALPHA_S4_DB_NAME`, `ALPHA_S4_DB_ROLE`. Administrative names are rejected; catalog checks are still necessary because a name alone proves nothing.
- HTTPS canonical `ALPHA_S4_ORIGIN`; one to ten distinct UUIDs in `ALPHA_S4_OWNER_IDS`.
- No `ALPHA_S4_LOCAL_AUTH` or `ALPHA_S4_LOCAL_SESSION_SECRET`, even with a nominally disabled value.

No request header can choose the runtime, environment or database. Environment variables are trusted deployment configuration, not cryptographic attestation. Production candidate pool settings use certificate verification, the target TLS server name, two connections, a five-second connection timeout and existing statement/transaction timeouts. Two connections per instance are **not** a global connection budget. The candidate uses Node’s configured trust store; it does not inject a custom CA. Deployment must review that trust store and provider certificate requirements. Synthetic test-only trust injection is confined to the TLS harness.

`s4Pool()` uses the validated local configuration and rejects production mode even if all settings parse. A cached pool rejects changed connection settings until explicitly closed. This is a hard I1a gate, not a configurable flag to bypass unfinished receipt/revocation work. S4 and S6 continue sharing the transaction boundary. Machine evaluator RPC remains loopback-only; existing local test cookies still represent agents.

`npm run preflight:research` reads process environment without loading dotenv, connects nowhere, prints only configuration status and unresolved gates, and exits nonzero until production readiness is implemented. It does not print credentials, target URLs or owners. Owner allowlist enforcement in production, real-platform TLS/role checks, Vercel session verification, independent anchor/checkpoint storage, revocation feed and total connection budgeting remain open.

## Role and request boundary

Before setting transaction-local owner identity, the runtime checks the actual session/current roles, reachable privileged roles (including non-inherited membership and every pg_ predefined role), schema/database CREATE rights, ownership of public business tables, and RLS/FORCE RLS on S4/S6/source-version tables. Required core relations must exist. The check is repeated per business transaction, not cached. It is not a complete audit of every SECURITY DEFINER function or extension; privileges must still be reviewed at deployment. Existing owner advisory locks, admin profile checks and transaction-local claims remain unchanged.

The session entrypoint now requires request URL origin and Host to match the operator-selected canonical origin. Writes require same-origin Origin; cross-site fetches fail. Forwarded headers cannot override this. This does not claim production proxy/session verification, because production is still closed.

## Local verification and unresolved deployment details

- Synthetic config/request tests and the existing real database suites remain mandatory.
- `test:runtime-privileges` creates a dedicated local cluster: baseline plus nine privilege/RLS negatives, restoring each case before the next.
- `test:runtime-tls` creates another local cluster and a temporary synthetic certificate. Untrusted certificate and wrong hostname fail; an explicitly test-trusted certificate succeeds over TLS. Transport is overridden to loopback, so this proves node-postgres TLS behavior, not real DNS, network or Vercel deployment behavior.
- No production database, resources, role grants, flags or secrets are changed. Operational storage location, runner identity, fault domain, independent checkpoint and capacity budget remain unknown; no fictional host or account is selected here.

References: [node-postgres SSL configuration](https://node-postgres.com/features/ssl), [PostgreSQL 17 privilege inquiry functions](https://www.postgresql.org/docs/17/functions-info.html). The SSL documentation warns that URL SSL parameters can replace explicit TLS options; this implementation passes individual connection fields instead.
