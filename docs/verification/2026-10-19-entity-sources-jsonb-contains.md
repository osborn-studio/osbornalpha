# Entity detail 500: jsonb `contains` encoding in `listSourcesForEntity` (2026-10-19)

`GET /api/research/entities/[id]` returned 500 for every entity, so `/research/companies/[id]` showed「加载失败：500」. Found on 2026-10-18 while recording the product demo (PR #95, `docs/demo/README.md`, issue 2).

## Root cause

`listSourcesForEntity` (`src/lib/research/sources.ts`) filtered with `.contains('entity_ids', [entityId])`. `research_source_documents.entity_ids` is a `jsonb` column (`20260705000000_research_os_tables.sql`). supabase-js encodes a JS array passed to `contains()` as a PostgreSQL array literal, so the request carried `entity_ids=cs.{<uuid>}`; PostgREST turned that into `entity_ids @> '{<uuid>}'`, and PostgreSQL rejected the literal with `invalid input syntax for type json` (SQLSTATE 22P02). The route threw on the error, hence 500 regardless of whether the entity had sources. The query does not depend on the environment, so production behaves the same. `listMemosForEntity` in `memos.ts` already used the JSON form (`company_ids.cs.["…"]`) and was unaffected.

The in-memory mock (`test-support.ts`) accepted arrays, so the existing unit test passed while the real stack failed.

## Change

- `sources.ts`: pass the needle as JSON, `.contains('entity_ids', JSON.stringify([entityId]))`, which supabase-js sends verbatim as `cs.["<uuid>"]`.
- `test-support.ts`: the mock's `contains()` now mirrors PostgREST on jsonb: a JSON string is parsed, an array yields the 22P02 error. Every `contains()` target in the research tables is jsonb.
- `sources.postgrest.test.ts` (new):
  - wire-format test (always runs): a real supabase-js client with a stubbed `fetch`; asserts the `entity_ids` query parameter is `cs.` followed by a JSON array holding the entity id;
  - live block, gated on `ALPHA_POSTGREST_TEST_URL` + `ALPHA_POSTGREST_TEST_SERVICE_ROLE_KEY`: creates a throwaway auth user, ingests a source linked to an entity, and checks that `listSourcesForEntity` returns it and returns `[]` for an entity with no sources; the user is deleted afterwards (cascade).

No other `.contains(` call site targets a database column (`grep -rn "contains(" src`).

## Verification

Red before the fix (local Supabase stack from the demo recording, `supabase status` keys):

```
× sources.test.ts > finds sources by entity id via jsonb contains        → invalid input syntax for type json
× sources.postgrest.test.ts > sends the entity id as a JSON array …      → SyntaxError (needle was `{…}`)
× sources.postgrest.test.ts > returns the sources linked to the entity    → invalid input syntax for type json
× sources.postgrest.test.ts > returns an empty list for an entity …       → invalid input syntax for type json
```

Green after the fix:

- `LC_ALL=C npx vitest run src/lib/research/sources.postgrest.test.ts src/lib/research/sources.test.ts` with the live variables set: 15 passed.
- `LC_ALL=C npx vitest run` (no database): 250 files passed, 18 skipped; 2158 tests passed, 154 skipped.
- `npx tsc --noEmit`: clean.
- Dev server against the local stack, signed in as the local demo admin account:
  - `GET /api/research/entities/1dbd3a13-…` (贵州茅台, 2 linked sources) → 200, `sources` has 2 rows;
  - `GET /api/research/entities/422f69d8-…` (Adobe, no sources) → 200, `sources: []`;
  - `/research/companies/1dbd3a13-…` renders「关联 Sources（2）」with both titles.

Not run here: `npm run test:db` (the PG17 harness has no PostgREST, so it cannot exercise this path; the suite's own tests are unchanged apart from the mock). Production is deployed manually with `vercel deploy --prod`; merging does not ship this.
