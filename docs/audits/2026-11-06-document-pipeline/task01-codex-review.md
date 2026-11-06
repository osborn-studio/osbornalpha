OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b143-e0c3-7a40-bc80-03afe31ad5cb
--------
user
commit c78fd42
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline c78fd42; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4
 succeeded in 1346ms:
---
name: code-review-and-quality
description: Conducts multi-axis code review. Use before merging any change. Use when reviewing code written by yourself, another agent, or a human. Use when you need to assess code quality across multiple dimensions before it enters the main branch.
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Every change gets reviewed before merge — no exceptions. Review covers five axes: correctness, readability, architecture, security, and performance.

**The approval standard:** Approve a change when it definitely improves overall code health, even if it isn't perfect. Perfect code doesn't exist — the goal is continuous improvement. Don't block a change because it isn't exactly how you would have written it. If it improves the codebase and follows the project's conventions, approve it.

## When to Use

- Before merging any PR or change
- After completing a feature implementation
- When another agent or model produced code you need to evaluate
- When refactoring existing code
- After any bug fix (review both the fix and the regression test)

## The Five-Axis Review

Every review evaluates code across these dimensions:

### 1. Correctness

Does the code do what it claims to do?

- Does it match the spec or task requirements?
- Are edge cases handled (null, empty, boundary values)?
- Are error paths handled (not just the happy path)?
- Does it pass all tests? Are the tests actually testing the right things?
- Are there off-by-one errors, race conditions, or state inconsistencies?

### 2. Readability & Simplicity

Can another engineer (or agent) understand this code without the author explaining it?

- Are names descriptive and consistent with project conventions? (No `temp`, `data`, `result` without context)
- Is the control flow straightforward (avoid nested ternaries, deep callbacks)?
- Is the code organized logically (related code grouped, clear module boundaries)?
- Are there any "clever" tricks that should be simplified?
- **Could this be done in fewer lines?** (1000 lines where 100 suffice is a failure)
- **Are abstractions earning their complexity?** (Don't generalize until the third use case)
- Would comments help clarify non-obvious intent? (But don't comment obvious code.)
- Are there dead code artifacts: no-op variables (`_unused`), backwards-compat shims, or `// removed` comments?

### 3. Architecture

Does the change fit the system's design?

- Does it follow existing patterns or introduce a new one? If new, is it justified?
- Does it maintain clean module boundaries?
- Is there code duplication that should be shared?
- Are dependencies flowing in the right direction (no circular dependencies)?
- Is the abstraction level appropriate (not over-engineered, not too coupled)?

### 4. Security

For detailed security guidance, see `security-and-hardening`. Does the change introduce vulnerabilities?

- Is user input validated and sanitized?
- Are secrets kept out of code, logs, and version control?
- Is authentication/authorization checked where needed?
- Are SQL queries parameterized (no string concatenation)?
- Are outputs encoded to prevent XSS?
- Are dependencies from trusted sources with no known vulnerabilities?
- Is data from external sources (APIs, logs, user content, config files) treated as untrusted?
- Are external data flows validated at system boundaries before use in logic or rendering?

### 5. Performance

For detailed profiling and optimization, see `performance-optimization`. Does the change introduce performance problems?

- Any N+1 query patterns?
- Any unbounded loops or unconstrained data fetching?
- Any synchronous operations that should be async?
- Any unnecessary re-renders in UI components?
- Any missing pagination on list endpoints?
- Any large objects created in hot paths?

## Change Sizing

Small, focused changes are easier to review, faster to merge, and safer to deploy. Target these sizes:

```
~100 lines changed   → Good. Reviewable in one sitting.
~300 lines changed   → Acceptable if it's a single logical change.
~1000 lines changed  → Too large. Split it.
```

**What counts as "one change":** A single self-contained modification that addresses one thing, includes related tests, and keeps the system functional after submission. One part of a feature — not the whole feature.

**Splitting strategies when a change is too large:**

| Strategy | How | When |
|----------|-----|------|
| **Stack** | Submit a small change, start the next one based on it | Sequential dependencies |
| **By file group** | Separate changes for groups needing different reviewers | Cross-cutting concerns |
| **Horizontal** | Create shared code/stubs first, then consumers | Layered architecture |
| **Vertical** | Break into smaller full-stack slices of the feature | Feature work |

**When large changes are acceptable:** Complete file deletions and automated refactoring where the reviewer only needs to verify intent, not every line.

**Separate refactoring from feature work.** A change that refactors existing code and adds new behavior is two changes — submit them separately. Small cleanups (variable renaming) can be included at reviewer discretion.

## Change Descriptions

Every change needs a description that stands alone in version control history.

**First line:** Short, imperative, standalone. "Delete the FizzBuzz RPC" not "Deleting the FizzBuzz RPC." Must be informative enough that someone searching history can understand the change without reading the diff.

**Body:** What is changing and why. Include context, decisions, and reasoning not visible in the code itself. Link to bug numbers, benchmark results, or design docs where relevant. Acknowledge approach shortcomings when they exist.

**Anti-patterns:** "Fix bug," "Fix build," "Add patch," "Moving code from A to B," "Phase 1," "Add convenience functions."

## Review Process

### Step 1: Understand the Context

Before looking at code, understand the intent:

```
- What is this change trying to accomplish?
- What spec or task does it implement?
- What is the expected behavior change?
```

### Step 2: Review the Tests First

Tests reveal intent and coverage:

```
- Do tests exist for the change?
- Do they test behavior (not implementation details)?
- Are edge cases covered?
- Do tests have descriptive names?
- Would the tests catch a regression if the code changed?
```

### Step 3: Review the Implementation

Walk through the code with the five axes in mind:

```
For each file changed:
1. Correctness: Does this code do what the test says it should?
2. Readability: Can I understand this without help?
3. Architecture: Does this fit the system?
4. Security: Any vulnerabilities?
5. Performance: Any bottlenecks?
```

### Step 4: Categorize Findings

Label every comment with its severity so the author knows what's required vs optional:

| Prefix | Meaning | Author Action |
|--------|---------|---------------|
| *(no prefix)* | Required change | Must address before merge |
| **Critical:** | Blocks merge | Security vulnerability, data loss, broken functionality |
| **Nit:** | Minor, optional | Author may ignore — formatting, style preferences |
| **Optional:** / **Consider:** | Suggestion | Worth considering but not required |
| **FYI** | Informational only | No action needed — context for future reference |

This prevents authors from treating all feedback as mandatory and wasting time on optional suggestions.

### Step 5: Verify the Verification

Check the author's verification story:

```
- What tests were run?
- Did the build pass?
- Was the change tested manually?
- Are there screenshots for UI changes?
- Is there a before/after comparison?
```

## Multi-Model Review Pattern

Use different models for different review perspectives:

```
Model A writes the code
    │
    ▼
Model B reviews for correctness and architecture
    │
    ▼
Model A addresses the feedback
    │
    ▼
Human makes the final call
```

This catches issues that a single model might miss — different models have different blind spots.

**Example prompt for a review agent:**
```
Review this code change for correctness, security, and adherence to
our project conventions. The spec says [X]. The change should [Y].
Flag any issues as Critical, Important, or Suggestion.
```

## Dead Code Hygiene

After any refactoring or implementation change, check for orphaned code:

1. Identify code that is now unreachable or unused
2. List it explicitly
3. **Ask before deleting:** "Should I remove these now-unused elements: [list]?"

Don't leave dead code lying around — it confuses future readers and agents. But don't silently delete things you're not sure about. When in doubt, ask.

```
DEAD CODE IDENTIFIED:
- formatLegacyDate() in src/utils/date.ts — replaced by formatDate()
- OldTaskCard component in src/components/ — replaced by TaskCard
- LEGACY_API_URL constant in src/config.ts — no remaining references
→ Safe to remove these?
```

## Review Speed

Slow reviews block entire teams. The cost of context-switching to review is less than the waiting cost imposed on others.

- **Respond within one business day** — this is the maximum, not the target
- **Ideal cadence:** Respond shortly after a review request arrives, unless deep in focused coding. A typical change should complete multiple review rounds in a single day
- **Prioritize fast individual responses** over quick final approval. Quick feedback reduces frustration even if multiple rounds are needed
- **Large changes:** Ask the author to split them rather than reviewing one massive changeset

## Handling Disagreements

When resolving review disputes, apply this hierarchy:

1. **Technical facts and data** override opinions and preferences
2. **Style guides** are the absolute authority on style matters
3. **Software design** must be evaluated on engineering principles, not personal preference
4. **Codebase consistency** is acceptable if it doesn't degrade overall health

**Don't accept "I'll clean it up later."** Experience shows deferred cleanup rarely happens. Require cleanup before submission unless it's a genuine emergency. If surrounding issues can't be addressed in this change, require filing a bug with self-assignment.

## Honesty in Review

When reviewing code — whether written by you, another agent, or a human:

- **Don't rubber-stamp.** "LGTM" without evidence of review helps no one.
- **Don't soften real issues.** "This might be a minor concern" when it's a bug that will hit production is dishonest.
- **Quantify problems when possible.** "This N+1 query will add ~50ms per item in the list" is better than "this could be slow."
- **Push back on approaches with clear problems.** Sycophancy is a failure mode in reviews. If the implementation has issues, say so directly and propose alternatives.
- **Accept override gracefully.** If the author has full context and disagrees, defer to their judgment. Comment on code, not people — reframe personal critiques to focus on the code itself.

## Dependency Discipline

Part of code review is dependency review:

**Before adding any dependency:**
1. Does the existing stack solve this? (Often it does.)
2. How large is the dependency? (Check bundle impact.)
3. Is it actively maintained? (Check last commit, open issues.)
4. Does it have known vulnerabilities? (`npm audit`)
5. What's the license? (Must be compatible with the project.)

**Rule:** Prefer standard library and existing utilities over new dependencies. Every dependency is a liability.

## The Review Checklist

```markdown
## Review: [PR/Change title]

### Context
- [ ] I understand what this change does and why

### Correctness
- [ ] Change matches spec/task requirements
- [ ] Edge cases handled
- [ ] Error paths handled
- [ ] Tests cover the change adequately

### Readability
- [ ] Names are clear and consistent
- [ ] Logic is straightforward
- [ ] No unnecessary complexity

### Architecture
- [ ] Follows existing patterns
- [ ] No unnecessary coupling or dependencies
- [ ] Appropriate abstraction level

### Security
- [ ] No secrets in code
- [ ] Input validated at boundaries
- [ ] No injection vulnerabilities
- [ ] Auth checks in place
- [ ] External data sources treated as untrusted

### Performance
- [ ] No N+1 patterns
- [ ] No unbounded operations
- [ ] Pagination on list endpoints

### Verification
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Manual verification done (if applicable)

### Verdict
- [ ] **Approve** — Ready to merge
- [ ] **Request changes** — Issues must be addressed
```
## See Also

- For detailed security review guidance, see `references/security-checklist.md`
- For performance review checks, see `references/performance-checklist.md`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It works, that's good enough" | Working code that's unreadable, insecure, or architecturally wrong creates debt that compounds. |
| "I wrote it, so I know it's correct" | Authors are blind to their own assumptions. Every change benefits from another set of eyes. |
| "We'll clean it up later" | Later never comes. The review is the quality gate — use it. Require cleanup before merge, not after. |
| "AI-generated code is probably fine" | AI code needs more scrutiny, not less. It's confident and plausible, even when wrong. |
| "The tests pass, so it's good" | Tests are necessary but not sufficient. They don't catch architecture problems, security issues, or readability concerns. |

## Red Flags

- PRs merged without any review
- Review that only checks if tests pass (ignoring other axes)
- "LGTM" without evidence of actual review
- Security-sensitive changes without security-focused review
- Large PRs that are "too big to review properly" (split them)
- No regression tests with bug fix PRs
- Review comments without severity labels — makes it unclear what's required vs optional
- Accepting "I'll fix it later" — it never happens

## Verification

After review is complete:

- [ ] All Critical issues are resolved
- [ ] All Important issues are resolved or explicitly deferred with justification
- [ ] Tests pass
- [ ] Build succeeds
- [ ] The verification story is documented (what changed, how it was verified)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-dtLwx5xg' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QcFUZjR6' (errno=Operation not permitted)
 M docs/superpowers/plans/2026-11-06-document-pipeline.md
?? docs/audits/2026-11-06-document-pipeline/05-codex-plan-round3-prompt.md
?? docs/audits/2026-11-06-document-pipeline/05-codex-plan-round3.md
?? docs/audits/2026-11-06-document-pipeline/task01-challenge-prompt.md
?? docs/audits/2026-11-06-document-pipeline/task01-codex-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-6ofn6RkF' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-zOiiw2io' (errno=Operation not permitted)
c78fd42 feat(documents): migration one — document library tables, view, bucket, lease/version/candidate functions, triggers, privileges; UTF8 test harness
 .../implementation-log.md                          |    2 +
 scripts/ci/research-checks.ts                      |    4 +-
 scripts/s4/local-db.ts                             |    3 +-
 src/lib/documents/documents.integration.test.ts    |  563 +++++++++
 src/lib/documents/fresh-db.ts                      |   52 +
 src/lib/supabase/database.types.ts                 |  178 +++
 .../20261108090000_disclosure_documents.sql        | 1282 ++++++++++++++++++++
 7 files changed, 2082 insertions(+), 2 deletions(-)

exec
/bin/zsh -lc 'ls -a | head -30; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; git show c78fd42 -- scripts/ci/research-checks.ts scripts/s4/local-db.ts; cat src/lib/documents/fresh-db.ts; cat src/lib/documents/documents.integration.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4
 succeeded in 0ms:
.
..
.claude
.cursor
.edgeone
.env.example
.git
.gitattributes
.github
.gitignore
.osstack
.vercelignore
DESIGN.md
LICENSE
README.md
STITCH_PROMPTS.md
TODOS.md
config
data
docs
e2e
eslint.config.mjs
hermes
legacy-demo
messages
next.config.mjs
node_modules
ops
osstack-contracts.cjs
osstack.contracts.json
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XoRFM4Xr' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oO0kSdbx' (errno=Operation not permitted)
commit c78fd42046d9495a93adeacf7648863edb2bc5ac
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:29:02 2026 -0800

    feat(documents): migration one — document library tables, view, bucket, lease/version/candidate functions, triggers, privileges; UTF8 test harness
    
    research-checks criticalSuites and local-db initdb edits are separate F3-marked blocks.
    
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

diff --git a/scripts/ci/research-checks.ts b/scripts/ci/research-checks.ts
index f04623c..df92197 100644
--- a/scripts/ci/research-checks.ts
+++ b/scripts/ci/research-checks.ts
@@ -12,7 +12,9 @@ export const criticalSuites = [
   'entity-keys/entity-keys.integration.test.ts', 'ledger/calls-import.integration.test.ts',
   'cluster/alignments.integration.test.ts', 'fanout/run.integration.test.ts',
   'cards/cards.integration.test.ts', 'thesis-extension.integration.test.ts', 'weekly/weekly.integration.test.ts',
-].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts');
+].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts')
+  // F3 document pipeline (Tasks 1, 13, 18 append to this concat)
+  .concat('src/lib/documents/documents.integration.test.ts');
 
 export function migrationInventory(root = process.cwd()) {
   const directory = join(root, 'supabase/migrations');
diff --git a/scripts/s4/local-db.ts b/scripts/s4/local-db.ts
index ec90a3f..9afa3f9 100644
--- a/scripts/s4/local-db.ts
+++ b/scripts/s4/local-db.ts
@@ -57,7 +57,8 @@ export async function startLocalDatabase(options: { rehearsalDefaultTableGrants?
   let admin: Pool | undefined;
   let started = false;
   try {
-  execFileSync(join(bin,'initdb'),['-D',join(directory,'data'),'-U','s4_admin','--auth-host=scram-sha-256','--auth-local=trust','--pwfile='+passwordFile],{ stdio:'pipe', timeout: 30_000 });
+  // F3 (document pipeline spec §4.4): UTF8 like hosted Supabase, so length()/substr() count code points; LC_ALL=C alone gives SQL_ASCII.
+  execFileSync(join(bin,'initdb'),['-D',join(directory,'data'),'-U','s4_admin','--auth-host=scram-sha-256','--auth-local=trust','--pwfile='+passwordFile,'--encoding=UTF8','--locale=C'],{ stdio:'pipe', timeout: 30_000 });
   writeFileSync(join(directory,'data','postgresql.auto.conf'),`listen_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories='${directory}'\n`);
   execFileSync(join(bin,'pg_ctl'),['-D',join(directory,'data'),'-l',join(directory,'postgres.log'),'-w','start'],{ stdio:'pipe', timeout: 30_000 });
   const adminUrl = `postgres://s4_admin:${password}@127.0.0.1:${port}/postgres`;
// src/lib/documents/fresh-db.ts
// Test-only (plan F3 Task 1; codex plan round 1 P2-2): migration-replay assertions run in a dedicated
// temporary database of the test cluster, never in the shared test database the other suites use —
// replaying an earlier migration there (migration one's document_citations policy, or the spec-2
// migration's market checks without 'HK') would undo later migrations under concurrent suites until
// the suffix is re-applied. freshMigratedDatabase(adminUrl) creates f3_replay_<random> (the harness
// admin is a superuser), installs the auth/storage stand-ins of scripts/s4/local-db.ts (keep the two
// in sync; the cluster roles postgres/anon/authenticated/service_role already exist and the
// migrations create their own roles only if missing), applies every supabase/migrations file in
// order and returns a pool on it; drop() closes the pool and drops the database. replayFiles applies
// files again, each in one transaction. Not a test file: it never reads S4_TEST_STATE itself.
import {randomBytes} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Pool} from 'pg';

const MIGRATIONS_DIR='supabase/migrations';
const SHIM=`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;

export interface FreshDatabase{pool:Pool;name:string;drop():Promise<void>}
async function onAdmin(adminUrl:string,sql:string):Promise<void>{
 const a=new Pool({connectionString:adminUrl,max:1});a.on('error',()=>{});
 try{await a.query(sql);}finally{await a.end();}
}
export async function freshMigratedDatabase(adminUrl:string):Promise<FreshDatabase>{
 const name=`f3_replay_${randomBytes(6).toString('hex')}`;
 await onAdmin(adminUrl,`create database ${name}`);
 const url=new URL(adminUrl);url.pathname=`/${name}`;
 const pool=new Pool({connectionString:url.toString(),max:2});pool.on('error',()=>{});
 let dropped=false;
 const drop=async()=>{if(dropped)return;dropped=true;await pool.end().catch(()=>{});await onAdmin(adminUrl,`drop database if exists ${name} with (force)`);};
 try{
  await pool.query(SHIM);
  for(const file of readdirSync(MIGRATIONS_DIR).filter(n=>n.endsWith('.sql')).sort()){
   try{await pool.query(readFileSync(join(MIGRATIONS_DIR,file),'utf8'));}
   catch(e){throw new Error(`fresh database: migration ${file}: ${(e as Error).message}`);}
  }
 }catch(e){await drop().catch(()=>{});throw e;}
 return {pool,name,drop};
}
/** Applies each file again, in order, each in one transaction (a replay). */
export async function replayFiles(pool:Pool,files:string[]):Promise<void>{
 for(const file of files){
  const c=await pool.connect();
  try{await c.query(`begin;\n${readFileSync(file,'utf8')}\n;commit;`);}
  catch(e){await c.query('rollback').catch(()=>{});throw e;}
  finally{c.release();}
 }
}
// src/lib/documents/documents.integration.test.ts
// F3-0 (document pipeline spec §4, §11.2): migration one on real PostgreSQL — nine tables, the
// public view, the disclosure-docs bucket, constraints, every trigger, every SQL function (sync
// scope and lease, version allocation, uploads, extract and candidates leases with attempts,
// citations, candidates, decisions, publications, read_documents and the service reads), real role
// privileges and RLS, code-point semantics, and (Task 3) the pgDocumentsDb contract with keyset
// paging over more than 1,000 rows. Rows are never cleaned up (append-only by design; test:db
// creates a fresh database per run); every test uses its own issuer.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {freshMigratedDatabase,replayFiles} from './fresh-db';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261108090000_disclosure_documents.sql';
const TABLES=['disclosure_documents','document_assets','document_extractions','document_pages','document_citations','extraction_candidates','candidate_publications','extraction_approvals','document_sync_scope'];
const PUBLIC_TABLES=['disclosure_documents','document_assets','document_extractions','document_pages','document_citations'];
const SERVICE_TABLES=['extraction_candidates','candidate_publications','extraction_approvals','document_sync_scope'];
const WRITE_FUNCTIONS=[
 'public.reconcile_document_sync_scope(text,jsonb)','public.claim_document_sync_lease(uuid,text,uuid,int)','public.insert_document_version(uuid,text,uuid,jsonb,jsonb)',
 'public.insert_upload_document(uuid,jsonb)','public.advance_document_cursor(uuid,text,uuid,text,jsonb,boolean,boolean)','public.release_document_sync_lease(uuid,text,uuid,text,timestamptz)',
 'public.reclassify_document(uuid,jsonb,uuid)','public.claim_document_extract_lease(uuid,uuid,int)','public.finish_document_extract(uuid,uuid,jsonb,jsonb)',
 'public.fail_document_extract(uuid,uuid,text)','public.request_document_extract(uuid,uuid,text,text)','public.claim_candidates_lease(uuid,uuid,int)',
 'public.finish_candidates(uuid,uuid,text)','public.request_candidates_regen(jsonb,uuid)','public.write_candidate_checks(uuid,uuid,jsonb)','public.insert_citation(jsonb)',
 'public.publish_citations(uuid[])','public.insert_candidates(uuid,uuid,jsonb)','public.decide_candidate(uuid,jsonb)','public.stage_candidate_publication(uuid,int,uuid,uuid)',
 'public.documents_stored_due(int)','public.extractions_candidates_due(int)','public.known_source_refs(uuid,text,text[])','public.list_candidates(uuid,text,uuid,jsonb,int)',
 'public.list_candidate_publications(uuid[],uuid,uuid,int,text,jsonb,int)','public.renew_document_extract_lease(uuid,uuid,int)','public.renew_candidates_lease(uuid,uuid,int)',
];
const INTERNAL_FUNCTIONS=['public.doc_scope_lock(uuid,text,uuid)','public.doc_extract_lock(uuid,uuid)','public.doc_candidates_lock(uuid,uuid)','public.candidate_citation_ids(jsonb)'];
/** Trigger-only functions (P2-3): no client role may execute them. */
const TRIGGER_FUNCTIONS=['public.disclosure_documents_limited_update()','public.document_rows_immutable()','public.document_extractions_limited_update()','public.document_citations_limited_update()',
 'public.extraction_candidates_lifecycle()','public.candidate_publications_lifecycle()','public.extraction_approvals_limited_update()'];
const READ_DOCUMENTS='public.read_documents(uuid,date,text,text,date,date,jsonb,int,boolean)';

/** Runs body as `role` on one connection inside a transaction that is always rolled back. */
async function asRole(pool:Pool,role:'anon'|'authenticated'|'service_role',body:(c:PoolClient)=>Promise<void>):Promise<void>{
 const c=await pool.connect();
 try{await c.query('begin');await c.query(`set local role ${role}`);await body(c);}
 finally{await c.query('rollback').catch(()=>{});c.release();}
}
/** One statement under a savepoint so an expected failure does not abort the surrounding transaction. */
async function tryAs(c:PoolClient,text:string,values:unknown[]=[]):Promise<{ok:true;rows:Record<string,unknown>[]}|{ok:false;code:string;message:string}>{
 await c.query('savepoint s');
 try{const r=await c.query(text,values);await c.query('release savepoint s');return {ok:true,rows:r.rows};}
 catch(e){await c.query('rollback to savepoint s');return {ok:false,code:String((e as {code?:string}).code),message:(e as Error).message};}
}

type PgErr={message:string;code?:string};
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const cps=(s:string)=>Array.from(s);
/** Text with a supplementary-plane Han character (U+2000B) and an emoji before the cited words. */
const TEXT='綜合損益表 a\u{2000B}b\u{1F600}c 收益 1,234\n毛利 (56)';

describe.skipIf(!enabled)('F3-0 disclosure documents migration on real PostgreSQL',()=>{
 let admin:Pool;let adminUrl='';
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Docs Test')`,[id]);return id;};
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'documents-sync','documents.hkexnews')`,[id]);return id;};
 const user=async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@example.test`]);return id;};
 const docJson=(o:Record<string,unknown>={})=>{
  const content=sha(randomUUID());const ref=`${Date.now()}${Math.floor(Math.random()*1e6)}_c`;
  return {source_ref:ref,market:'HK',form_type:'Annual Report',doc_class:'annual_report',classifier_gen:1,title:'年報',language:'zh',source_url:`https://www1.hkexnews.hk/x/${ref}.pdf`,
   content_sha256:content,bytes:1024,mime:'application/pdf',storage_path:`blobs/${content}.pdf`,acquisition:{fetched_at:'2026-03-20T10:00:00.000Z',http_status:200},
   published_at:'2026-03-20T09:00:00.000Z',published_at_precision:'instant',available_at:'2026-03-20T09:00:00.000Z',available_date:'2026-03-20',fiscal_year:2025,fiscal_period:'FY',
   period_end:'2025-12-31',filing_source_ref:null,permission:'public',owner_user_id:null,license_ref:null,code_version:'test-code',...o};
 };
 const pageJson=(n:number,text:string,o:Record<string,unknown>={})=>({page_no:n,text,text_hash:sha(text),char_count:cps(text).length,width:595,height:842,line_count:1,has_tables:false,...o});
 const extJson=(pages:number,o:Record<string,unknown>={})=>({extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'test-code',has_text_layer:true,page_count:pages,
  pages_json_path:`extractions/${sha('c')}/${sha('p')}.pages.json`,pages_json_sha256:sha(randomUUID()),...o});
 const scope=(iss:string,source='hkexnews',priority=10)=>one(`select public.reconcile_document_sync_scope($1,$2::jsonb) v`,[source,JSON.stringify([{issuer_id:iss,reasons:['test'],priority,fetch_key:'00268'}])]);
 const claim=(iss:string,b:string,source='hkexnews',ttl=600)=>one(`select public.claim_document_sync_lease($1,$2,$3,$4) v`,[iss,source,b,ttl]);
 const insertDoc=(iss:string,b:string,doc:Record<string,unknown>,assets:unknown[]=[],source='hkexnews')=>one(`select public.insert_document_version($1,$2,$3,$4::jsonb,$5::jsonb) v`,[iss,source,b,JSON.stringify(doc),JSON.stringify(assets)]);
 const ready=async(source='hkexnews')=>{const iss=await issuer();const b=await batch();expect(await scope(iss,source)).toBe(1);expect(await claim(iss,b,source)).toBe(true);return {iss,b};};
 const storedDoc=async(o:Record<string,unknown>={},source='hkexnews')=>{const {iss,b}=await ready(source);const r=await insertDoc(iss,b,docJson(o),[],source);return {iss,b,doc:r.document_id as string};};
 const claimExtract=(doc:string,b:string,ttl=600)=>one(`select public.claim_document_extract_lease($1,$2,$3) v`,[doc,b,ttl]);
 const finish=(doc:string,b:string,ext:Record<string,unknown>,pages:unknown[])=>one(`select public.finish_document_extract($1,$2,$3::jsonb,$4::jsonb) v`,[doc,b,JSON.stringify(ext),JSON.stringify(pages)]);
 const extracted=async(o:Record<string,unknown>={},texts=[TEXT,'第二頁'],source='hkexnews')=>{
  const s=await storedDoc(o,source);expect(await claimExtract(s.doc,s.b)).toBe(true);
  const ext=await finish(s.doc,s.b,extJson(texts.length),texts.map((t,i)=>pageJson(i+1,t)));
  return {...s,ext:ext as string};
 };
 const cite=(doc:string,ext:string,needle:string,by='extractor',text=TEXT)=>{
  const cp=cps(text);const n=cps(needle).length;const start=cp.findIndex((_,i)=>cp.slice(i,i+n).join('')===needle);
  return one(`select public.insert_citation($1::jsonb) v`,[JSON.stringify({document_id:doc,extraction_id:ext,page_no:1,char_start:start,char_end:start+n,bbox:null,snippet:needle,text_hash:sha(text),created_by:by,created_ref:'test'})]) as Promise<string>;
 };
 const claimCand=(ext:string,b:string,ttl=600)=>one(`select public.claim_candidates_lease($1,$2,$3) v`,[ext,b,ttl]);
 const candRow=(cits:{value:string;label:string;unit:string;period:string},o:Record<string,unknown>={})=>({kind:'financial_fact',extractor_kind:'rule',extractor_ref:'hk-facts/1/hk-facts/1.0',
  natural_key:'revenue::2025-12-31:12M:HKD',citations:{value:cits.value,label:cits.label,unit:cits.unit,period:[{role:'statement_title',citation_id:cits.period},{role:'column_header',citation_id:cits.period}]},
  payload:{concept:'revenue',value:'1234000'},fingerprint:sha('fp-revenue'),input_snapshot:{content_sha256:sha('x')},...o});
 const insertCands=(ext:string,b:string,rows:unknown[])=>one(`select public.insert_candidates($1,$2,$3::jsonb) v`,[ext,b,JSON.stringify(rows)]);
 const writeChecks=(ext:string,b:string,rows:unknown[])=>one(`select public.write_candidate_checks($1,$2,$3::jsonb) v`,[ext,b,JSON.stringify(rows)]);
 const decide=(cand:string,d:Record<string,unknown>)=>one(`select public.decide_candidate($1,$2::jsonb) v`,[cand,JSON.stringify(d)]);
 const stagePub=(cand:string,gen:number,run=randomUUID(),fact=randomUUID())=>one(`select public.stage_candidate_publication($1,$2,$3,$4) v`,[cand,gen,run,fact]);
 const approval=(o:Record<string,unknown>={})=>{
  const r={extractor_ref:'hk-facts/1/hk-facts/1.0',extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'test-code',concepts:['revenue'],gold_sha256:sha('gold'),precision:'0.96',recall:'0.97',report_path:'docs/audits/r.json',...o};
  return async(by:string)=>one(`insert into public.extraction_approvals(extractor_ref,extractor_version,table_algo_version,code_version,concepts,gold_sha256,precision,recall,report_path,approved_by)
   values($1,$2,$3,$4,$5::text[],$6,$7::numeric,$8::numeric,$9,$10) returning approval_id v`,[r.extractor_ref,r.extractor_version,r.table_algo_version,r.code_version,r.concepts,r.gold_sha256,r.precision,r.recall,r.report_path,by]) as Promise<string>;
 };
 /** A primary HK extraction under a candidates lease with one candidate whose citations are real. */
 const candidateReady=async()=>{
  const x=await extracted();expect(await claimCand(x.ext,x.b)).toBe(true);
  const cits={value:await cite(x.doc,x.ext,'1,234'),label:await cite(x.doc,x.ext,'收益'),unit:await cite(x.doc,x.ext,'綜合損益表'),period:await cite(x.doc,x.ext,'綜合損益表')};
  return {...x,cits};
 };
 const candidateIds=async(ext:string)=>(await q(`select candidate_id,natural_key,extractor_ref from public.extraction_candidates where extraction_id=$1 order by created_at,candidate_id`,[ext]));

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  adminUrl=state.adminUrl;admin=new Pool({connectionString:adminUrl});
  expect(await one(`select getdatabaseencoding() v`)).toBe('UTF8');   // code-point offsets need a UTF8 database (harness --encoding=UTF8)
 });
 afterAll(async()=>{await admin?.end();});

 it('creates nine RLS tables, the public view, the disclosure-docs bucket, select-only grants, function grants, and replays',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect(r.relrowsecurity).toBe(true);
  expect(await one(`select reloptions v from pg_class where relname='disclosure_documents_public'`)).toEqual(['security_invoker=true']);
  expect(await q(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='disclosure-docs'`)).toEqual([{id:'disclosure-docs',public:false,file_size_limit:'52428800',
   allowed_mime_types:['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json']}]);
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ['anon','authenticated','service_role'])for(const t of TABLES)for(const p of ['UPDATE','DELETE','TRUNCATE'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const role of ['anon','authenticated','service_role'])for(const t of TABLES)expect({role,t,ok:await priv(role,t,'INSERT')}).toEqual({role,t,ok:role==='service_role'&&t==='extraction_approvals'});
  for(const t of PUBLIC_TABLES)for(const role of ['anon','authenticated','service_role'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:true});
  for(const t of SERVICE_TABLES){for(const role of ['anon','authenticated'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:false});expect(await priv('service_role',t,'SELECT')).toBe(true);}
  for(const role of ['anon','authenticated','service_role'])expect(await priv(role,'disclosure_documents_public','SELECT')).toBe(true);
  for(const role of ['anon','authenticated','service_role'])expect(await priv(role,'disclosure_documents_public','INSERT')).toBe(false);
  expect(await one(`select has_column_privilege('service_role','public.extraction_approvals','revoked_at','UPDATE') v`)).toBe(true);
  expect(await one(`select has_column_privilege('service_role','public.extraction_approvals','precision','UPDATE') v`)).toBe(false);
  const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  for(const sig of WRITE_FUNCTIONS){
   for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
   expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
  }
  for(const sig of [...INTERNAL_FUNCTIONS,...TRIGGER_FUNCTIONS])for(const role of ['anon','authenticated','service_role'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
  for(const role of ['anon','authenticated','service_role'])expect(await fn(role,READ_DOCUMENTS)).toBe(true);
  // P2-3: every function the migration defines is in exactly one list — enumerated from pg_proc by the names in the file
  const names=[...new Set([...readFileSync(MIGRATION,'utf8').matchAll(/create or replace function public\.(\w+)\(/g)].map(m=>m[1]))];
  const defined=(await q(`select 'public.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1) order by 1`,[names]))
   .map(r=>String(r.sig).replace(/, /g,',').replace(/\binteger\b/g,'int').replace(/timestamp with time zone/g,'timestamptz'));
  expect(defined.sort()).toEqual([...WRITE_FUNCTIONS,...INTERNAL_FUNCTIONS,...TRIGGER_FUNCTIONS,READ_DOCUMENTS].sort());
  for(const sig of defined)for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:sig===READ_DOCUMENTS});
  // P2-2: the replay runs in a dedicated temporary database (every migration applied, then migration one again), never in the shared one
  const fresh=await freshMigratedDatabase(adminUrl);
  try{
   await expect(replayFiles(fresh.pool,[MIGRATION,MIGRATION])).resolves.toBeUndefined();
   expect((await fresh.pool.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows[0].n).toBeGreaterThan(0);
  }finally{await fresh.drop();}
  expect(await one(`select count(*)::int v from pg_database where datname=$1`,[fresh.name])).toBe(0);   // dropped
 },120000);

 it('enforces the document checks, both unique keys, de_role_status, ec_decision_shape and ea_threshold',async()=>{
  const iss=await issuer();const b=await batch();const owner=await user();
  const raw=(o:Record<string,unknown>)=>{
   const r:Record<string,unknown>={document_id:randomUUID(),issuer_id:iss,source:'hkexnews',market:'HK',source_ref:`raw-${randomUUID()}`,source_version:1,doc_class:'other',classifier_gen:1,title:'t',
    source_url:'https://x',content_sha256:sha(randomUUID()),bytes:1,mime:'application/pdf',storage_path:'blobs/x.pdf',acquisition:'{}',published_at:'2026-01-01T00:00:00Z',
    published_at_precision:'instant',available_at:'2026-01-01T00:00:00Z',available_date:'2026-01-01',permission:'public',batch_id:b,code_version:'c',...o};
   const k=Object.keys(r);return q(`insert into public.disclosure_documents(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c]));
  };
  await raw({});
  await expect(raw({permission:'private'})).rejects.toThrow(/dd_owner_iff_private/);
  await expect(raw({owner_user_id:owner})).rejects.toThrow(/dd_owner_iff_private/);
  await expect(raw({issuer_id:null})).rejects.toThrow(/dd_issuer_required/);
  await raw({issuer_id:null,permission:'licensed',owner_user_id:owner,source:'upload',source_url:null});   // uploads may have no issuer
  await expect(raw({source:'upload',source_url:'https://x',permission:'private',owner_user_id:owner})).rejects.toThrow(/dd_upload_shape/);
  await expect(raw({source_url:null})).rejects.toThrow(/dd_upload_shape/);
  await expect(raw({status:'extracted'})).rejects.toThrow(/dd_extracted_fields/);
  await expect(raw({observed_replacement:true})).rejects.toThrow(/dd_replacement_version/);
  await expect(raw({content_sha256:'ABC'})).rejects.toThrow(/content_sha256_check/);
  await expect(raw({mime:'image/png'})).rejects.toThrow(/mime_check/);
  const ref=`dup-${randomUUID()}`;const h=sha(ref);
  await raw({source_ref:ref,content_sha256:h});
  await expect(raw({source_ref:ref,content_sha256:sha('other')})).rejects.toThrow(/disclosure_documents_version_uniq/);
  await expect(raw({source_ref:ref,source_version:2,content_sha256:h})).rejects.toThrow(/disclosure_documents_content_uniq/);
  await expect(raw({current_extraction_id:randomUUID()})).rejects.toThrow(/dd_current_extraction_fkey/);
  const x=await extracted();
  const rawExt=(o:Record<string,unknown>)=>q(`insert into public.document_extractions(extraction_id,document_id,extractor_version,table_algo_version,code_version,has_text_layer,page_count,pages_json_path,pages_json_sha256,candidates_role,candidates_status,batch_id)
   values($1,$2,$3,'tables/1.0','c',true,0,'p',$4,$5,$6,$7)`,[randomUUID(),x.doc,o.v??`v-${randomUUID().slice(0,8)}`,sha('j'),o.role,o.status,b]);
  await expect(rawExt({role:'primary',status:'n/a'})).rejects.toThrow(/de_role_status/);
  await expect(rawExt({role:'none',status:'pending'})).rejects.toThrow(/de_role_status/);
  await expect(rawExt({role:'none',status:'n/a',v:'docs-extract/1.0'})).rejects.toThrow(/document_extractions_version_uniq/);
  const cit=await cite(x.doc,x.ext,'收益');
  const rawCand=(o:Record<string,unknown>)=>{
   const r:Record<string,unknown>={candidate_id:randomUUID(),document_id:x.doc,extraction_id:x.ext,kind:'financial_fact',extractor_kind:'rule',extractor_ref:'r',natural_key:`k-${randomUUID()}`,
    citations:JSON.stringify({value:cit}),payload:'{}',fingerprint:sha('f'),input_snapshot:'{}',batch_id:b,...o};
   const k=Object.keys(r);return q(`insert into public.extraction_candidates(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c]));
  };
  await rawCand({});
  await expect(rawCand({status:'confirmed'})).rejects.toThrow(/ec_decision_shape/);
  await expect(rawCand({status:'confirmed',decided_at:'2026-01-01Z',decision_kind:'human'})).rejects.toThrow(/ec_decision_shape/);
  await rawCand({status:'confirmed',decided_at:'2026-01-01Z',decision_kind:'human',decided_by:owner});
  await expect(rawCand({decision_kind:'human',decided_by:owner})).rejects.toThrow(/ec_decision_shape/);
  const A=await approval()(owner);
  await expect(rawCand({status:'rejected',decided_at:'2026-01-01Z',decision_kind:'auto',approval_id:A})).rejects.toThrow(/ec_decision_shape/);
  await expect(rawCand({status:'confirmed',decided_at:'2026-01-01Z',decision_kind:'auto',approval_id:A,decided_by:owner})).rejects.toThrow(/ec_decision_shape/);
  await rawCand({status:'confirmed',decided_at:'2026-01-01Z',decision_kind:'auto',approval_id:A});
  await expect(rawCand({extraction_id:(await extracted()).ext})).rejects.toThrow(/extraction_candidates_extraction_fkey/);   // document and extraction must agree
  const nk=`same-${randomUUID()}`;await rawCand({natural_key:nk});
  await expect(rawCand({natural_key:nk})).rejects.toThrow(/extraction_candidates_key_uniq/);
  await expect(approval({precision:'0.94'})(owner)).rejects.toThrow(/ea_threshold/);
  await expect(approval({recall:'0.949'})(owner)).rejects.toThrow(/ea_threshold/);
 });

 it('triggers: documents change processing/classification only, along the allowed status moves; assets, pages, extractions, citations, candidates, publications and approvals guard their lifecycles; nothing is deleted',async()=>{
  const x=await extracted();const owner=await user();
  const append=/append_only:/;
  await expect(q(`update public.disclosure_documents set title='x' where document_id=$1`,[x.doc])).rejects.toThrow(append);
  await expect(q(`update public.disclosure_documents set available_at=now() where document_id=$1`,[x.doc])).rejects.toThrow(append);
  await expect(q(`update public.disclosure_documents set status='extract_failed' where document_id=$1`,[x.doc])).rejects.toThrow(append);   // extracted → extract_failed
  await q(`update public.disclosure_documents set status='stored',classifier_gen=2,doc_class='interim_report' where document_id=$1`,[x.doc]);                 // extracted → stored
  await q(`update public.disclosure_documents set status='extract_failed' where document_id=$1`,[x.doc]);                                                       // stored → extract_failed
  await expect(q(`update public.disclosure_documents set status='no_text_layer' where document_id=$1`,[x.doc])).rejects.toThrow(append);
  await expect(q(`delete from public.disclosure_documents where document_id=$1`,[x.doc])).rejects.toThrow(append);
  const {iss,b}=await ready('edgar');
  const d2=(await insertDoc(iss,b,docJson({market:'US',language:'en'}),[{role:'filing_index',filename:'index.json',source_url:'https://sec/x',content_sha256:sha('i'),bytes:5,mime:'application/json',storage_path:'blobs/i.json',acquisition:{}}],'edgar')).document_id;
  await expect(q(`update public.document_assets set bytes=6 where document_id=$1`,[d2])).rejects.toThrow(append);
  await expect(q(`delete from public.document_assets where document_id=$1`,[d2])).rejects.toThrow(append);
  await expect(q(`update public.document_pages set text='x' where extraction_id=$1`,[x.ext])).rejects.toThrow(append);
  await expect(q(`delete from public.document_pages where extraction_id=$1`,[x.ext])).rejects.toThrow(append);
  await expect(q(`update public.document_extractions set page_count=9 where extraction_id=$1`,[x.ext])).rejects.toThrow(append);
  await q(`update public.document_extractions set candidates_status='done',candidates_attempts=1 where extraction_id=$1`,[x.ext]);
  await expect(q(`delete from public.document_extractions where extraction_id=$1`,[x.ext])).rejects.toThrow(append);
  const ec=await cite(x.doc,x.ext,'收益');const hc=await cite(x.doc,x.ext,'毛利','human');
  await expect(q(`update public.document_citations set snippet='x' where citation_id=$1`,[ec])).rejects.toThrow(append);
  await expect(q(`update public.document_citations set visibility='public' where citation_id=$1`,[ec])).rejects.toThrow(append);   // extractor citations are never published directly
  await q(`update public.document_citations set visibility='public' where citation_id=$1`,[hc]);
  await expect(q(`update public.document_citations set visibility='internal' where citation_id=$1`,[hc])).rejects.toThrow(append);
  await expect(q(`delete from public.document_citations where citation_id=$1`,[hc])).rejects.toThrow(append);
  const y=await candidateReady();
  await insertCands(y.ext,y.b,[candRow(y.cits)]);
  const [c]=await candidateIds(y.ext);
  await expect(q(`update public.extraction_candidates set payload='{"concept":"x"}' where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`update public.extraction_candidates set status='promoted',decision_kind='human',decided_by=$2,decided_at=now() where candidate_id=$1`,[c.candidate_id,owner])).rejects.toThrow(append);
  await q(`update public.extraction_candidates set status='rejected',decision_kind='human',decided_by=$2,decided_at=now() where candidate_id=$1`,[c.candidate_id,owner]);
  await expect(q(`update public.extraction_candidates set checks='[{"check":"x"}]' where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`update public.extraction_candidates set status='candidate',decision_kind=null,decided_by=null,decided_at=null where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`delete from public.extraction_candidates where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  const run=randomUUID(),fact=randomUUID();
  await q(`insert into public.candidate_publications(candidate_id,pub_gen,run_id,fact_id,state) values($1,1,$2,$3,'staged')`,[c.candidate_id,run,fact]);
  await expect(q(`update public.candidate_publications set run_id=$2 where candidate_id=$1`,[c.candidate_id,randomUUID()])).rejects.toThrow(append);
  await q(`update public.candidate_publications set state='abandoned' where candidate_id=$1`,[c.candidate_id]);
  await q(`update public.candidate_publications set state='staged',run_id=$2,fact_id=$3 where candidate_id=$1`,[c.candidate_id,randomUUID(),randomUUID()]);
  await q(`update public.candidate_publications set state='published' where candidate_id=$1`,[c.candidate_id]);
  await expect(q(`update public.candidate_publications set state='staged' where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`update public.candidate_publications set pub_gen=2 where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  await expect(q(`delete from public.candidate_publications where candidate_id=$1`,[c.candidate_id])).rejects.toThrow(append);
  const A=await approval()(owner);
  await expect(q(`update public.extraction_approvals set concepts='{x}' where approval_id=$1`,[A])).rejects.toThrow(append);
  await q(`update public.extraction_approvals set revoked_at=now() where approval_id=$1`,[A]);
  await expect(q(`update public.extraction_approvals set revoked_at=now()+interval '1 day' where approval_id=$1`,[A])).rejects.toThrow(append);
  await expect(q(`delete from public.extraction_approvals where approval_id=$1`,[A])).rejects.toThrow(append);
 });

 it('sync scope: reconcile upserts scheduling inputs only; one of eight racing batches wins the lease; cursor, release and insert need the holder',async()=>{
  const iss=await issuer();const b=await batch();
  expect(await claim(iss,b)).toBe(false);                                   // no scope row yet
  expect(await scope(iss)).toBe(1);expect(await scope(iss)).toBe(0);
  expect(await claim(iss,b)).toBe(true);
  await q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill','{"segment":"2024","last_ref":"r2","settled":[],"attempts":{},"seq":2}'::jsonb,false)`,[iss,b]);
  const regress=await fails(q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill','{"segment":"2024","last_ref":"r1","settled":[],"attempts":{},"seq":1}'::jsonb,false)`,[iss,b]));
  expect(regress).toMatchObject({message:'cursor_regression',code:'P0001'});   // P2-4: never backwards …
  await q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill','{"segment":"2024","last_ref":"r1","settled":[],"attempts":{},"seq":1}'::jsonb,false,true)`,[iss,b]);   // … unless reset
  await q(`select public.advance_document_cursor($1,'hkexnews',$2,'backfill','{"segment":"2024","last_ref":"r2","settled":[],"attempts":{},"seq":2}'::jsonb,false)`,[iss,b]);
  expect(await scope(iss,'hkexnews',5)).toBe(1);                             // priority change counted …
  expect((await q(`select priority,backfill_cursor,lease_batch_id from public.document_sync_scope where issuer_id=$1`,[iss]))[0]).toEqual({priority:5,backfill_cursor:{segment:'2024',last_ref:'r2',settled:[],attempts:{},seq:2},lease_batch_id:b});   // … cursor and lease untouched
  await q(`update public.document_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1`,[iss]);
  const racers=await Promise.all(Array.from({length:8},()=>batch()));
  const won=await Promise.all(racers.map(r=>claim(iss,r)));
  expect(won.filter(Boolean)).toHaveLength(1);const holder=racers[won.indexOf(true)];
  expect(await fails(q(`select public.advance_document_cursor($1,'hkexnews',$2,'poll',null,false)`,[iss,b]))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect(await fails(insertDoc(iss,b,docJson()))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect(await fails(q(`select public.release_document_sync_lease($1,'hkexnews',$2,'failed',now())`,[iss,b]))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect((await fails(q(`select public.release_document_sync_lease($1,'hkexnews',$2,'maybe',now())`,[iss,holder]))).message).toMatch(/^invalid_input/);
  expect((await fails(q(`select public.advance_document_cursor($1,'hkexnews',$2,'sideways',null,false)`,[iss,holder]))).message).toMatch(/^invalid_input/);
  expect((await fails(claim(iss,holder,'hkexnews',0))).message).toMatch(/^invalid_input/);
  expect((await fails(q(`select public.reconcile_document_sync_scope('upload','[]'::jsonb)`))).code).toBe('22023');
  await q(`select public.release_document_sync_lease($1,'hkexnews',$2,'success',now()+interval '1 day')`,[iss,holder]);
  expect((await q(`select lease_until,lease_batch_id,last_status,last_success_at is not null ok,next_due_at>now() due from public.document_sync_scope where issuer_id=$1`,[iss]))[0]).toEqual({lease_until:null,lease_batch_id:null,last_status:'success',ok:true,due:true});
 });

 it('insert_document_version: version allocation under the lease, duplicates write nothing, assets land with the document, foreign refs are refused',async()=>{
  const {iss,b}=await ready('edgar');
  const d=docJson({market:'US',language:'en',source_ref:`0000000000-26-${randomUUID().slice(0,6)}/a.htm`,mime:'text/html',permission:'private',owner_user_id:randomUUID(),issuer_id:randomUUID()});
  const asset={role:'filing_index',filename:'index.json',source_url:'https://sec/i',content_sha256:sha('idx'),bytes:5,mime:'application/json',storage_path:'blobs/idx.json',acquisition:{http_status:200}};
  const r1=await insertDoc(iss,b,d,[asset],'edgar');expect(r1.outcome).toBe('inserted');
  expect((await q(`select issuer_id,source,permission,owner_user_id,source_version,status,batch_id,extract_attempts from public.disclosure_documents where document_id=$1`,[r1.document_id]))[0])
   .toEqual({issuer_id:iss,source:'edgar',permission:'public',owner_user_id:null,source_version:1,status:'stored',batch_id:b,extract_attempts:0});   // arguments win over p_doc
  expect(await insertDoc(iss,b,d,[asset],'edgar')).toEqual({outcome:'duplicate',document_id:r1.document_id});
  expect(Number(await one(`select count(*) v from public.document_assets where document_id=$1`,[r1.document_id]))).toBe(1);
  const r2=await insertDoc(iss,b,{...d,content_sha256:sha('v2'),available_at:'2026-05-01T00:00:00Z',available_date:'2026-05-01'},[],'edgar');
  expect(r2.outcome).toBe('versioned');
  expect((await q(`select source_version,supersedes_document_id,observed_replacement from public.disclosure_documents where document_id=$1`,[r2.document_id]))[0]).toEqual({source_version:2,supersedes_document_id:r1.document_id,observed_replacement:true});
  const before=Number(await one(`select count(*) v from public.disclosure_documents where issuer_id=$1`,[iss]));
  expect((await fails(insertDoc(iss,b,{...d,content_sha256:sha('v3')},[asset,asset],'edgar'))).message).toMatch(/^invalid_input/);       // duplicate role/filename
  expect((await fails(insertDoc(iss,b,{...d,content_sha256:sha('v4'),mime:'image/png'},[],'edgar'))).code).toBe('23514');                  // check violation rolls back
  expect((await fails(insertDoc(iss,b,{...d,content_sha256:sha('v5')},[{...asset,content_sha256:'bad'}],'edgar'))).code).toBe('23514');    // a bad asset rolls the document back too
  expect(Number(await one(`select count(*) v from public.disclosure_documents where issuer_id=$1`,[iss]))).toBe(before);
  const other=await ready('edgar');
  expect((await fails(insertDoc(other.iss,other.b,{...d,content_sha256:sha('v6')},[],'edgar'))).message).toMatch(/^invalid_input: source_ref belongs to another issuer/);
  expect((await fails(insertDoc(iss,b,d,[],'upload'))).message).toMatch(/^invalid_input/);
  expect(await one(`select public.known_source_refs($1,'edgar',$2::text[]) v`,[iss,[d.source_ref,'nope']])).toEqual([d.source_ref]);
 });

 it('insert_upload_document: owner-scoped source_ref and dedupe, licensed/private only, issuer optional',async()=>{
  const owner=await user();const b=await batch();
  const up=(o:string,extra:Record<string,unknown>={})=>one(`select public.insert_upload_document($1,$2::jsonb) v`,[o,JSON.stringify(docJson({source_url:null,market:'other',language:null,permission:'licensed',owner_user_id:o,license_ref:'lic',batch_id:b,content_sha256:sha('report'),...extra}))]);
  const a=await up(owner);expect(a.outcome).toBe('inserted');
  expect(await up(owner)).toEqual({outcome:'duplicate',document_id:a.document_id});
  const other=await user();expect((await up(other)).document_id).not.toBe(a.document_id);
  expect((await q(`select source,source_ref,issuer_id,owner_user_id,permission from public.disclosure_documents where document_id=$1`,[a.document_id]))[0]).toEqual({source:'upload',source_ref:`${owner}/${sha('report')}`,issuer_id:null,owner_user_id:owner,permission:'licensed'});
  expect((await fails(up(await user(),{permission:'public',owner_user_id:null}))).message).toMatch(/^invalid_input: permission/);
  expect((await fails(q(`select public.insert_upload_document(null,'{}'::jsonb)`))).message).toMatch(/^invalid_input/);
 });

 it('extract lease and finish: attempts counted at claim, the claim after a third crash closes extract_failed, finish validates pages and decides the candidates role, request refuses an existing revision',async()=>{
  const {doc,b}=await storedDoc();const b2=await batch();const actor=await user();
  const due=async()=>((await one(`select public.documents_stored_due(1000) v`)) as {document_id:string}[]).some(r=>r.document_id===doc);
  expect(await due()).toBe(true);
  const racers=await Promise.all(Array.from({length:6},()=>batch()));
  const won=await Promise.all(racers.map(r=>claimExtract(doc,r)));
  expect(won.filter(Boolean)).toHaveLength(1);expect(await due()).toBe(false);
  const expire=()=>q(`update public.disclosure_documents set extract_lease_until=now()-interval '1 second' where document_id=$1`,[doc]);
  await expire();expect(await claimExtract(doc,b)).toBe(true);
  await expire();expect(await claimExtract(doc,b2)).toBe(true);
  expect(await one(`select extract_attempts v from public.disclosure_documents where document_id=$1`,[doc])).toBe(3);
  await expire();expect(await due()).toBe(true);
  expect(await claimExtract(doc,b)).toBe(false);
  expect((await q(`select status,extract_lease_batch_id from public.disclosure_documents where document_id=$1`,[doc]))[0]).toEqual({status:'extract_failed',extract_lease_batch_id:null});
  expect(await fails(q(`select public.fail_document_extract($1,$2,'extract_error')`,[doc,b]))).toMatchObject({message:'lease_lost',code:'55P03'});
  await q(`select public.request_document_extract($1,$2,'docs-extract/1.0','tables/1.0')`,[doc,actor]);
  expect((await q(`select status,extract_attempts from public.disclosure_documents where document_id=$1`,[doc]))[0]).toEqual({status:'stored',extract_attempts:0});
  expect(await claimExtract(doc,b)).toBe(true);
  expect((await fails(finish(doc,b,extJson(2),[pageJson(1,'a'),pageJson(2,'b',{char_count:9})]))).message).toMatch(/^invalid_input: pages/);
  expect((await fails(finish(doc,b,extJson(2),[pageJson(1,'a')]))).message).toMatch(/^invalid_input: pages/);
  expect((await fails(finish(doc,b,extJson(1),[pageJson(1,'a',{text_hash:sha('b')})]))).message).toMatch(/^invalid_input: pages/);
  expect(await fails(finish(doc,b2,extJson(1),[pageJson(1,'a')]))).toMatchObject({message:'lease_lost',code:'55P03'});
  const ext=await finish(doc,b,extJson(2),[pageJson(1,TEXT),pageJson(2,'')]);
  expect((await q(`select candidates_role,candidates_status,page_count,batch_id from public.document_extractions where extraction_id=$1`,[ext]))[0]).toEqual({candidates_role:'primary',candidates_status:'pending',page_count:2,batch_id:b});
  expect((await q(`select status,current_extraction_id,extract_lease_until from public.disclosure_documents where document_id=$1`,[doc]))[0]).toEqual({status:'extracted',current_extraction_id:ext,extract_lease_until:null});
  expect((await q(`select page_no,char_count,length(text) n from public.document_pages where extraction_id=$1 order by page_no`,[ext]))).toEqual([{page_no:1,char_count:cps(TEXT).length,n:cps(TEXT).length},{page_no:2,char_count:0,n:0}]);
  expect(await fails(q(`select public.request_document_extract($1,$2,'docs-extract/1.0','tables/1.0')`,[doc,actor]))).toMatchObject({message:'revision_exists',code:'P0001'});
  await q(`select public.request_document_extract($1,$2,'docs-extract/2.0','tables/1.0')`,[doc,actor]);   // a newer extractor re-queues; the old version and its pages stay
  expect(await claimExtract(doc,b)).toBe(true);
  const ext2=await finish(doc,b,extJson(1,{extractor_version:'docs-extract/2.0'}),[pageJson(1,'v2')]);
  expect(Number(await one(`select count(*) v from public.document_pages where extraction_id=any($1::uuid[])`,[[ext,ext2]]))).toBe(3);
  expect(await one(`select current_extraction_id v from public.disclosure_documents where document_id=$1`,[doc])).toBe(ext2);
  expect(await fails(q(`select public.request_document_extract($1,$2,'docs-extract/1.0','tables/1.0')`,[randomUUID(),actor]))).toMatchObject({message:'not_found',code:'P0002'});
  const en=await extracted({language:'en',source_ref:`${Date.now()}_e`});
  expect(await one(`select candidates_role v from public.document_extractions where extraction_id=$1`,[en.ext])).toBe('comparison');
  const us=await extracted({market:'US',language:'en',source_ref:`0000000000-26-${randomUUID().slice(0,6)}/b.htm`,mime:'text/html'},[TEXT],'edgar');
  expect((await q(`select candidates_role,candidates_status from public.document_extractions where extraction_id=$1`,[us.ext]))[0]).toEqual({candidates_role:'none',candidates_status:'n/a'});
  const s=await storedDoc();await claimExtract(s.doc,s.b);
  const scan=await finish(s.doc,s.b,extJson(1,{has_text_layer:false}),[pageJson(1,'')]);
  expect((await q(`select d.status,e.candidates_role from public.disclosure_documents d join public.document_extractions e on e.extraction_id=d.current_extraction_id where d.document_id=$1`,[s.doc]))[0]).toEqual({status:'no_text_layer',candidates_role:'none'});
  expect(scan).toBeTruthy();
 });

 it('code points: PostgreSQL length/substr equal JS Array.from slicing over supplementary-plane characters; insert_citation refuses UTF-16 offsets',async()=>{
  const x=await extracted();
  const cp=cps(TEXT);const start=cp.indexOf('收');
  expect(TEXT.indexOf('收')).toBe(start+2);                                                                   // U+2000B and U+1F600 are two UTF-16 units each
  const row=(await q(`select length(text) n,substr(text,$2::int+1,2) s,substr(text,$3::int+1,1) h,substr(text,$4::int+1,1) e from public.document_pages where extraction_id=$1 and page_no=1`,[x.ext,start,cp.indexOf('\u{2000B}'),cp.indexOf('\u{1F600}')]))[0];
  expect(row).toEqual({n:cp.length,s:'收益',h:'\u{2000B}',e:'\u{1F600}'});
  const id=await cite(x.doc,x.ext,'收益');
  expect((await q(`select char_start,char_end,snippet,visibility,text_hash from public.document_citations where citation_id=$1`,[id]))[0]).toEqual({char_start:start,char_end:start+2,snippet:'收益',visibility:'internal',text_hash:sha(TEXT)});
  const base={document_id:x.doc,extraction_id:x.ext,page_no:1,bbox:{x0:1,y0:2,x1:3,y1:4},text_hash:sha(TEXT),created_by:'extractor',created_ref:'t'};
  const ins=(o:Record<string,unknown>)=>one(`select public.insert_citation($1::jsonb) v`,[JSON.stringify({...base,...o})]);
  const u=TEXT.indexOf('收');
  expect(await fails(ins({char_start:u,char_end:u+2,snippet:TEXT.slice(u,u+2)}))).toMatchObject({message:'invalid_citation: snippet',code:'22023'});
  expect(await fails(ins({char_start:0,char_end:cp.length+1,snippet:TEXT}))).toMatchObject({message:'invalid_citation: range'});
  expect(await fails(ins({char_start:4,char_end:4,snippet:''}))).toMatchObject({message:'invalid_citation: range'});
  expect(await fails(ins({char_start:0,char_end:2,snippet:cp.slice(0,2).join(''),text_hash:sha('x')}))).toMatchObject({message:'invalid_citation: text_hash'});
  expect(await fails(ins({page_no:3,char_start:0,char_end:1,snippet:'x'}))).toMatchObject({message:'invalid_citation: page'});
  expect(await fails(ins({document_id:(await storedDoc()).doc,char_start:0,char_end:1,snippet:cp[0]}))).toMatchObject({message:'invalid_citation: page'});
  const e=await ins({char_start:cp.indexOf('\u{1F600}'),char_end:cp.indexOf('\u{1F600}')+1,snippet:'\u{1F600}'});
  expect(await one(`select bbox v from public.document_citations where citation_id=$1`,[e])).toEqual({x0:1,y0:2,x1:3,y1:4});
 });

 it('publish_citations: only human/module citations of public documents, all or nothing',async()=>{
  const x=await extracted();
  const ec=await cite(x.doc,x.ext,'收益');const hc=await cite(x.doc,x.ext,'毛利','human');const mc=await cite(x.doc,x.ext,'1,234','module');
  expect(await fails(q(`select public.publish_citations($1::uuid[])`,[[hc,ec]]))).toMatchObject({message:'not_publishable',code:'P0001'});
  expect(await one(`select visibility v from public.document_citations where citation_id=$1`,[hc])).toBe('internal');
  expect(await one(`select public.publish_citations($1::uuid[]) v`,[[hc,mc,hc]])).toBe(2);
  expect(await one(`select public.publish_citations($1::uuid[]) v`,[[hc]])).toBe(0);
  expect(await fails(q(`select public.publish_citations($1::uuid[])`,[[randomUUID()]]))).toMatchObject({message:'not_publishable'});
  const owner=await user();const b=await batch();
  const up=await one(`select public.insert_upload_document($1,$2::jsonb) v`,[owner,JSON.stringify(docJson({source_url:null,market:'other',permission:'private',owner_user_id:owner,batch_id:b}))]);
  expect(await claimExtract(up.document_id,b)).toBe(true);
  const upExt=await finish(up.document_id,b,extJson(1),[pageJson(1,TEXT)]);
  expect(await one(`select candidates_role v from public.document_extractions where extraction_id=$1`,[upExt])).toBe('none');
  const pc=await cite(up.document_id,upExt,'收益','human');
  expect(await fails(q(`select public.publish_citations($1::uuid[])`,[[pc]]))).toMatchObject({message:'not_publishable'});
 });

 it('candidates: claim counts attempts and exhausts; insert checks the lease and every citation; checks are the only writer of checks and apply human inheritance; regen resets current versions',async()=>{
  const y=await candidateReady();const b2=await batch();const actor=await user();
  expect(await claimCand(y.ext,b2)).toBe(false);
  expect(await fails(insertCands(y.ext,b2,[candRow(y.cits)]))).toMatchObject({message:'lease_lost',code:'55P03'});
  const foreign=await extracted();const fcit=await cite(foreign.doc,foreign.ext,'收益');
  expect(await fails(insertCands(y.ext,y.b,[candRow({...y.cits,label:fcit})]))).toMatchObject({message:'invalid_citation: reference',code:'22023'});
  expect(await fails(insertCands(y.ext,y.b,[candRow({...y.cits,label:'nope'})]))).toMatchObject({message:'invalid_citation: reference'});
  expect(await fails(insertCands(y.ext,y.b,[candRow(y.cits,{citations:{value:y.cits.value}})]))).toMatchObject({message:'invalid_citation: shape'});
  expect(await insertCands(y.ext,y.b,[candRow(y.cits,{kind:'field',natural_key:'field-1',citations:{value:y.cits.value}})])).toEqual({inserted:1});   // non-fact kinds need value only
  expect(await insertCands(y.ext,y.b,[candRow(y.cits),candRow(y.cits,{natural_key:'cost_of_revenue::2025-12-31:12M:HKD',fingerprint:sha('fp-cost')})])).toEqual({inserted:2});
  expect(await insertCands(y.ext,y.b,[candRow(y.cits)])).toEqual({inserted:0});
  const ids=await candidateIds(y.ext);const rev=ids.find(r=>r.natural_key.startsWith('revenue'))!.candidate_id;const cost=ids.find(r=>r.natural_key.startsWith('cost'))!.candidate_id;
  expect((await q(`select status,checks,checks_passed,decision_kind,batch_id from public.extraction_candidates where candidate_id=$1`,[rev]))[0]).toEqual({status:'candidate',checks:[],checks_passed:false,decision_kind:null,batch_id:y.b});
  const ok=[{check:'citation_verified',blocking:true,passed:true}];
  expect(await writeChecks(y.ext,y.b,[{candidate_id:rev,checks:ok,checks_passed:true},{candidate_id:cost,checks:ok,checks_passed:false}])).toEqual({written:2,inherited:0});
  expect(await fails(writeChecks(y.ext,y.b,[{candidate_id:rev,checks:'x',checks_passed:true}]))).toMatchObject({message:'invalid_input: checks'});
  expect(await fails(writeChecks(y.ext,y.b,[{candidate_id:randomUUID(),checks:[],checks_passed:false}]))).toMatchObject({message:'not_found',code:'P0002'});
  expect(await decide(rev,{kind:'human',decided_by:actor,status:'confirmed'})).toEqual({status:'confirmed'});
  expect(await fails(writeChecks(y.ext,y.b,[{candidate_id:rev,checks:ok,checks_passed:true}]))).toMatchObject({message:'decided',code:'P0001'});
  await q(`select public.finish_candidates($1,$2,'done')`,[y.ext,y.b]);
  expect(await fails(q(`select public.finish_candidates($1,$2,'done')`,[y.ext,y.b]))).toMatchObject({message:'lease_lost'});
  expect(await one(`select public.request_candidates_regen($1::jsonb,$2) v`,[JSON.stringify({document_id:y.doc}),actor])).toBe(1);
  expect((await fails(q(`select public.request_candidates_regen('{"bogus":1}'::jsonb,$1)`,[actor]))).message).toMatch(/^invalid_input: filter/);
  expect(await claimCand(y.ext,b2)).toBe(true);
  expect(await insertCands(y.ext,b2,[candRow(y.cits,{extractor_ref:'hk-facts/2/hk-facts/1.0'})])).toEqual({inserted:1});
  const regen=(await candidateIds(y.ext)).find(r=>r.extractor_ref==='hk-facts/2/hk-facts/1.0')!.candidate_id;
  expect(await writeChecks(y.ext,b2,[{candidate_id:regen,checks:ok,checks_passed:true}])).toEqual({written:1,inherited:1});
  expect((await q(`select status,decision_kind,decided_by,inherited_from,decided_at is not null d from public.extraction_candidates where candidate_id=$1`,[regen]))[0]).toEqual({status:'confirmed',decision_kind:'human',decided_by:actor,inherited_from:rev,d:true});
  // attempts: the claim after the third crash closes the version as exhausted
  const expire=()=>q(`update public.document_extractions set candidates_lease_until=now()-interval '1 second' where extraction_id=$1`,[y.ext]);
  await expire();expect(await claimCand(y.ext,y.b)).toBe(true);
  await expire();expect(await claimCand(y.ext,b2)).toBe(true);
  expect(await one(`select candidates_attempts v from public.document_extractions where extraction_id=$1`,[y.ext])).toBe(3);
  await expire();
  expect(((await one(`select public.extractions_candidates_due(1000) v`)) as {extraction_id:string}[]).some(r=>r.extraction_id===y.ext)).toBe(true);
  expect(await claimCand(y.ext,y.b)).toBe(false);
  expect((await q(`select candidates_status,candidates_lease_batch_id from public.document_extractions where extraction_id=$1`,[y.ext]))[0]).toEqual({candidates_status:'exhausted',candidates_lease_batch_id:null});
  expect(((await one(`select public.extractions_candidates_due(1000) v`)) as {extraction_id:string}[]).some(r=>r.extraction_id===y.ext)).toBe(false);
 });

 it('decide_candidate and stage_candidate_publication: human and auto rules, the publication state machine, and a committed reversion on a revoked approval',async()=>{
  const y=await candidateReady();const actor=await user();
  const keys=['a','b','c','d'];
  await insertCands(y.ext,y.b,keys.map(k=>candRow(y.cits,{natural_key:`${k}::2025-12-31:12M:HKD`,fingerprint:sha(`fp-${k}`),payload:{concept:k==='d'?'gross_profit':'revenue'}})));
  const ids=Object.fromEntries((await candidateIds(y.ext)).map(r=>[r.natural_key.slice(0,1),r.candidate_id as string]));
  const ok=[{check:'citation_verified',blocking:true,passed:true}];
  await writeChecks(y.ext,y.b,['a','b','d'].map(k=>({candidate_id:ids[k],checks:ok,checks_passed:true})));
  expect(await fails(decide(ids.c,{kind:'human',decided_by:actor,status:'confirmed'}))).toMatchObject({message:'not_eligible',code:'P0001'});
  expect(await decide(ids.c,{kind:'human',decided_by:actor,status:'rejected'})).toEqual({status:'rejected'});
  expect(await fails(decide(ids.c,{kind:'human',decided_by:actor,status:'confirmed'}))).toMatchObject({message:'decided'});
  expect((await fails(decide(ids.c,{kind:'human',status:'confirmed'}))).message).toMatch(/^invalid_input/);
  const A=await approval()(actor);const B=await approval({gold_sha256:sha('gold-b')})(actor);const wrong=await approval({table_algo_version:'tables/0.9'})(actor);
  expect(await fails(decide(ids.a,{kind:'auto',approval_id:wrong}))).toMatchObject({message:'not_eligible'});
  expect(await fails(decide(ids.d,{kind:'auto',approval_id:A}))).toMatchObject({message:'not_eligible'});          // concept outside the approval
  expect(await fails(decide(ids.a,{kind:'auto',approval_id:randomUUID()}))).toMatchObject({message:'not_eligible'});
  expect(await decide(ids.a,{kind:'auto',approval_id:A})).toEqual({status:'confirmed'});
  expect(await decide(ids.a,{kind:'auto',approval_id:A})).toEqual({status:'confirmed'});
  expect(await decide(ids.b,{kind:'auto',approval_id:B})).toEqual({status:'confirmed'});
  expect(await fails(stagePub(ids.c,1))).toMatchObject({message:'not_eligible'});
  const run=randomUUID();
  expect(await stagePub(ids.a,1,run)).toEqual({outcome:'staged'});
  expect(await fails(stagePub(ids.a,1))).toMatchObject({message:'already_staged',code:'P0001'});
  expect(await fails(decide(ids.a,{kind:'human',decided_by:actor,status:'candidate'}))).toMatchObject({message:'not_eligible'});
  await q(`update public.candidate_publications set state='abandoned' where candidate_id=$1`,[ids.a]);   // migration two's abandon_candidate_publications does this
  const run2=randomUUID(),fact2=randomUUID();
  expect(await stagePub(ids.a,1,run2,fact2)).toEqual({outcome:'staged'});
  expect((await q(`select run_id,fact_id,state,updated_at>created_at moved from public.candidate_publications where candidate_id=$1`,[ids.a]))[0]).toEqual({run_id:run2,fact_id:fact2,state:'staged',moved:true});
  await q(`update public.extraction_approvals set revoked_at=now() where approval_id=$1`,[B]);
  expect(await stagePub(ids.b,1)).toEqual({outcome:'approval_revoked'});                                  // answered, not raised …
  expect((await q(`select status,decision_kind,approval_id,decided_at from public.extraction_candidates where candidate_id=$1`,[ids.b]))[0]).toEqual({status:'candidate',decision_kind:null,approval_id:null,decided_at:null});   // … so the reversion is committed
  expect(Number(await one(`select count(*) v from public.candidate_publications where candidate_id=$1`,[ids.b]))).toBe(0);
  expect(await fails(decide(ids.b,{kind:'auto',approval_id:B}))).toMatchObject({message:'approval_revoked',code:'P0001'});
  const listed=await one(`select public.list_candidate_publications(null,null,$1,1,'staged',null,10) v`,[y.iss]);
  expect(listed.rows.map((r:{candidate_id:string})=>r.candidate_id)).toEqual([ids.a]);expect(listed.next_cursor).toBeNull();
  const page1=await one(`select public.list_candidates($1,null,null,null,2) v`,[y.ext]);
  expect(page1.rows).toHaveLength(2);expect(page1.next_cursor).toMatchObject({candidate_id:page1.rows[1].candidate_id});
  const page2=await one(`select public.list_candidates($1,null,null,$2::jsonb,2) v`,[y.ext,JSON.stringify(page1.next_cursor)]);
  expect(page2.rows).toHaveLength(2);expect(page2.next_cursor).toBeNull();
  expect(new Set([...page1.rows,...page2.rows].map((r:{candidate_id:string})=>r.candidate_id))).toEqual(new Set(Object.values(ids)));
  expect((await fails(q(`select public.list_candidates(null,null,null,null,10)`))).message).toMatch(/^invalid_input: where/);
 });

 it('read_documents: as-of version selection, every version on request, window filters, keyset cursor envelope, limit bounds',async()=>{
  const {iss,b}=await ready();const ref=`${Date.now()}_c`;
  const v1=(await insertDoc(iss,b,docJson({source_ref:ref,available_at:'2026-01-10T01:00:00.123456Z',available_date:'2026-01-10'}))).document_id;
  const v2=(await insertDoc(iss,b,docJson({source_ref:ref,available_at:'2026-03-10T01:00:00Z',available_date:'2026-03-10'}))).document_id;
  const r2=(await insertDoc(iss,b,docJson({doc_class:'interim_report',available_at:'2026-02-01T01:00:00Z',available_date:'2026-02-01'}))).document_id;
  const read=(asOf:string,o:{source?:string|null;cls?:string|null;from?:string|null;to?:string|null;cursor?:unknown;limit?:number;all?:boolean}={},c:Pool|PoolClient=admin)=>
   c.query(`select public.read_documents($1,$2::date,$3,$4,$5::date,$6::date,$7::jsonb,$8,$9) v`,[iss,asOf,o.source??null,o.cls??null,o.from??null,o.to??null,o.cursor===undefined?null:JSON.stringify(o.cursor),o.limit??10,o.all??false]).then(r=>r.rows[0].v);
  const ids=(env:{rows:{document_id:string}[]})=>env.rows.map(r=>r.document_id);
  expect(ids(await read('2026-02-15'))).toEqual([r2,v1]);
  expect(ids(await read('2026-04-01'))).toEqual([v2,r2]);
  expect(ids(await read('2026-04-01',{all:true}))).toEqual([v2,r2,v1]);
  expect(ids(await read('2026-04-01',{cls:'interim_report'}))).toEqual([r2]);
  expect(ids(await read('2026-04-01',{from:'2026-03-01',to:'2026-03-31'}))).toEqual([v2]);
  expect(ids(await read('2026-04-01',{source:'cninfo'}))).toEqual([]);
  const p1=await read('2026-04-01',{all:true,limit:2});
  expect(p1).toMatchObject({row_count:2,next_cursor:{document_id:r2}});
  expect(p1.next_cursor.available_at).toBe(p1.rows[1].available_at);
  const p2=await read('2026-04-01',{all:true,limit:2,cursor:p1.next_cursor});
  expect(p2).toMatchObject({row_count:1,next_cursor:null});expect(ids(p2)).toEqual([v1]);
  expect(new Date(p2.rows[0].available_at).toISOString()).toBe('2026-01-10T01:00:00.123Z');
  expect(p2.rows[0].available_at).toMatch(/:00\.123456[+-]/);                                              // microseconds survive the envelope (server time zone offset)
  expect(p2.rows[0]).not.toHaveProperty('rn');
  expect((await fails(read('2026-04-01',{limit:1001}))).message).toMatch(/^invalid_input: limit/);
  expect((await fails(read('2026-04-01',{limit:0}))).message).toMatch(/^invalid_input: limit/);
  expect((await fails(read('2026-04-01',{cursor:{available_at:'2026-01-01'}}))).message).toMatch(/^invalid_input: cursor/);
 });

 it('roles: anon and authenticated see public rows only — tables, the view and read_documents — never candidates, scope, approvals or unpublished citations, and cannot call write functions; service_role reads everything but writes approvals only',async()=>{
  const pub=await extracted();
  const internal=await cite(pub.doc,pub.ext,'收益');const published=await cite(pub.doc,pub.ext,'毛利','human');
  await q(`select public.publish_citations($1::uuid[])`,[[published]]);
  const owner=await user();const b=await batch();
  const lic=(await one(`select public.insert_upload_document($1,$2::jsonb) v`,[owner,JSON.stringify(docJson({source_url:null,market:'HK',permission:'licensed',owner_user_id:owner,issuer_id:pub.iss,license_ref:'lic',batch_id:b}))])).document_id;
  expect(await claimExtract(lic,b)).toBe(true);
  const licExt=await finish(lic,b,extJson(1),[pageJson(1,TEXT)]);
  const licCit=await cite(lic,licExt,'收益','human');
  const A=await approval()(owner);
  expect(await claimCand(pub.ext,pub.b)).toBe(true);
  await insertCands(pub.ext,pub.b,[candRow({value:internal,label:internal,unit:internal,period:internal})]);
  for(const role of ['anon','authenticated'] as const){
   await asRole(admin,role,async c=>{
    const ids=async(sql:string,v:unknown[])=>(await c.query(sql,v)).rows.map(r=>Object.values(r)[0]);
    expect(await ids(`select document_id from public.disclosure_documents where document_id=any($1::uuid[]) order by 1`,[[pub.doc,lic]])).toEqual([pub.doc]);
    expect(await ids(`select document_id from public.disclosure_documents_public where document_id=any($1::uuid[])`,[[pub.doc,lic]])).toEqual([pub.doc]);
    expect((await c.query(`select * from public.disclosure_documents_public where document_id=$1`,[pub.doc])).rows[0]).not.toHaveProperty('owner_user_id');
    expect(await ids(`select extraction_id from public.document_extractions where extraction_id=any($1::uuid[])`,[[pub.ext,licExt]])).toEqual([pub.ext]);
    expect(await ids(`select page_no from public.document_pages where extraction_id=$1`,[licExt])).toEqual([]);
    expect((await ids(`select page_no from public.document_pages where extraction_id=$1 order by 1`,[pub.ext]))).toEqual([1,2]);
    expect(await ids(`select citation_id from public.document_citations where citation_id=any($1::uuid[])`,[[internal,published,licCit]])).toEqual([published]);
    const env=(await c.query(`select public.read_documents($1,'2030-01-01',null,null,null,null,null,100,true) v`,[pub.iss])).rows[0].v;
    expect(env.rows.map((r:{document_id:string})=>r.document_id)).toEqual([pub.doc]);
    for(const t of SERVICE_TABLES)expect({t,r:await tryAs(c,`select 1 from public.${t} limit 1`)}).toMatchObject({t,r:{ok:false,code:'42501'}});
    expect(await tryAs(c,`select public.insert_citation('{}'::jsonb)`)).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`select public.claim_document_sync_lease($1,'hkexnews',$2,60)`,[pub.iss,b])).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`select public.decide_candidate($1,'{}'::jsonb)`,[randomUUID()])).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`select public.documents_stored_due(10)`)).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`insert into public.document_citations(citation_id,document_id,extraction_id,page_no,char_start,char_end,snippet,text_hash,created_by,created_ref) values($1,$2,$3,1,0,1,'x',$4,'human','x')`,[randomUUID(),pub.doc,pub.ext,sha(TEXT)])).toMatchObject({ok:false,code:'42501'});
    expect(await tryAs(c,`update public.disclosure_documents set title='x' where document_id=$1`,[pub.doc])).toMatchObject({ok:false,code:'42501'});
   });
  }
  await asRole(admin,'service_role',async c=>{
   expect((await c.query(`select count(*)::int n from public.disclosure_documents where document_id=any($1::uuid[])`,[[pub.doc,lic]])).rows[0].n).toBe(2);
   expect((await c.query(`select count(*)::int n from public.document_citations where citation_id=any($1::uuid[])`,[[internal,published,licCit]])).rows[0].n).toBe(3);
   expect((await c.query(`select count(*)::int n from public.extraction_candidates where extraction_id=$1`,[pub.ext])).rows[0].n).toBe(1);
   expect((await c.query(`select count(*)::int n from public.document_sync_scope where issuer_id=$1`,[pub.iss])).rows[0].n).toBe(1);
   for(const [sql,v] of [
    [`insert into public.disclosure_documents select * from public.disclosure_documents where document_id=$1`,[pub.doc]],
    [`update public.disclosure_documents set status='stored' where document_id=$1`,[pub.doc]],
    [`delete from public.disclosure_documents where document_id=$1`,[pub.doc]],
    [`update public.document_citations set visibility='public' where citation_id=$1`,[internal]],
    [`delete from public.document_pages where extraction_id=$1`,[pub.ext]],
    [`update public.extraction_candidates set status='rejected' where extraction_id=$1`,[pub.ext]],
    [`insert into public.candidate_publications(candidate_id,pub_gen,run_id,fact_id,state) select candidate_id,1,gen_random_uuid(),gen_random_uuid(),'staged' from public.extraction_candidates where extraction_id=$1`,[pub.ext]],
    [`update public.document_sync_scope set priority=99 where issuer_id=$1`,[pub.iss]],
    [`update public.extraction_approvals set concepts='{x}' where approval_id=$1`,[A]],
    [`delete from public.extraction_approvals where approval_id=$1`,[A]],
   ] as [string,unknown[]][])expect({sql,r:await tryAs(c,sql,v)}).toMatchObject({sql,r:{ok:false,code:'42501'}});
   expect(await tryAs(c,`update public.extraction_approvals set revoked_at=now() where approval_id=$1`,[A])).toMatchObject({ok:true});
   expect(await tryAs(c,`insert into public.extraction_approvals(extractor_ref,extractor_version,table_algo_version,code_version,concepts,gold_sha256,precision,recall,report_path,approved_by) values('r','v','t','c','{revenue}',$1,0.99,0.99,'p',$2)`,[sha('g2'),owner])).toMatchObject({ok:true});
   expect(await tryAs(c,`select public.documents_stored_due(5)`)).toMatchObject({ok:true});
  });
 });
});

exec
/bin/zsh -lc 'cat supabase/migrations/20261108090000_disclosure_documents.sql' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4
 succeeded in 0ms:
-- supabase/migrations/20261108090000_disclosure_documents.sql
-- F3-0 (document pipeline spec §4.1–§4.8, §4.10, §4.12): the global disclosure document library.
-- disclosure_documents (one row per (source, source_ref, source_version)), its assets, immutable
-- extraction versions with their pages, code-point citations, extraction candidates with their
-- publication links, extraction approvals and the per-issuer document sync scope (schedule, lease,
-- cursors). Write path: NO role inserts/updates/deletes these tables directly — service_role
-- included — except extraction_approvals (service_role insert + update(revoked_at)); every other
-- change goes through the security definer functions below, each of which states its lock and its
-- authority (lease / row lock / admin route). Functions that read financial_facts belong to
-- migration two (20261108091000_fact_citations.sql), which also replaces the document_citations
-- read policy with the fact-linked one.
-- Errors carry the code as the first word of the message: lease_lost (55P03); not_eligible,
-- revision_exists, approval_revoked, not_publishable, decided, already_staged (P0001);
-- not_found (P0002); invalid_citation, invalid_input (22023). Triggers refuse with 23514,
-- prefix `append_only:`.
-- Offsets are Unicode code points: length()/substr() on a UTF8 database (the local harness is
-- initialised with --encoding=UTF8, like hosted Supabase).
-- The hosted `postgres` role is not a superuser: functions keep the migration role as owner,
-- `set search_path = public`, and qualify every relation. Replayable: guarded creates, create or
-- replace, drop-then-create policies/triggers/constraints, insert … on conflict for the bucket.
-- Only storage.buckets is referenced (local harness).

-- ---------------------------------------------------------------- 4.1 disclosure_documents
create table if not exists public.disclosure_documents (
  document_id            uuid primary key,
  issuer_id              uuid references public.issuers(issuer_id) on delete restrict,
  source                 text not null check (source in ('edgar','cninfo','hkexnews','upload')),
  market                 text not null check (market in ('US','CN','HK','other')),
  source_ref             text not null check (length(source_ref) between 1 and 512),
  source_version         int not null check (source_version >= 1),
  supersedes_document_id uuid references public.disclosure_documents(document_id) on delete restrict,
  observed_replacement   boolean not null default false,
  form_type              text,
  doc_class              text not null check (doc_class in ('annual_report','interim_report','quarterly_report','results_announcement','current_report','registration','proxy','ownership','other')),
  classifier_gen         int not null check (classifier_gen >= 0),
  title                  text not null,
  language               text check (language in ('zh','en')),
  source_url             text,
  content_sha256         text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  bytes                  bigint not null check (bytes > 0),
  mime                   text not null check (mime in ('application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json')),
  storage_path           text not null,
  acquisition            jsonb not null check (jsonb_typeof(acquisition) = 'object'),
  published_at           timestamptz not null,
  published_at_precision text not null check (published_at_precision in ('instant','date')),
  available_at           timestamptz not null,
  available_date         date not null,
  fiscal_year            int,
  fiscal_period          text check (fiscal_period in ('FY','H1','Q1','Q3')),
  period_end             date,
  filing_source_ref      text,
  permission             text not null check (permission in ('public','licensed','private')),
  owner_user_id          uuid references auth.users(id) on delete restrict,
  license_ref            text,
  status                 text not null default 'stored' check (status in ('stored','extracted','no_text_layer','extract_failed')),
  current_extraction_id  uuid,
  extract_lease_until    timestamptz,
  extract_lease_batch_id uuid references public.ingest_batches(batch_id) on delete set null,
  extract_attempts       int not null default 0 check (extract_attempts >= 0),
  batch_id               uuid not null references public.ingest_batches(batch_id) on delete restrict,
  code_version           text not null,
  created_at             timestamptz not null default now(),
  constraint dd_owner_iff_private check ((permission = 'public') = (owner_user_id is null)),
  constraint dd_issuer_required check (permission <> 'public' or issuer_id is not null),
  constraint dd_upload_shape check ((source = 'upload') = (source_url is null)),
  constraint dd_extracted_fields check (status not in ('extracted','no_text_layer') or current_extraction_id is not null),
  constraint dd_replacement_version check (observed_replacement = false or source_version > 1),
  constraint disclosure_documents_version_uniq unique (source, source_ref, source_version),
  constraint disclosure_documents_content_uniq unique (source, source_ref, content_sha256)
);
create index if not exists disclosure_documents_asof_idx on public.disclosure_documents(issuer_id, available_date, source, source_ref, source_version desc);
create index if not exists disclosure_documents_class_idx on public.disclosure_documents(issuer_id, doc_class, period_end desc);
create index if not exists disclosure_documents_stored_idx on public.disclosure_documents(status, created_at) where status = 'stored';
create index if not exists disclosure_documents_sha_idx on public.disclosure_documents(content_sha256);
create index if not exists disclosure_documents_owner_idx on public.disclosure_documents(owner_user_id) where owner_user_id is not null;

-- ---------------------------------------------------------------- 4.2 document_assets
create table if not exists public.document_assets (
  asset_id        uuid primary key,
  document_id     uuid not null references public.disclosure_documents(document_id) on delete restrict,
  role            text not null check (role in ('filing_index','xbrl_instance','exhibit')),
  filename        text not null check (length(filename) between 1 and 512),
  source_url      text not null,
  content_sha256  text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  bytes           bigint not null check (bytes > 0),
  mime            text not null,
  storage_path    text not null,
  acquisition     jsonb not null check (jsonb_typeof(acquisition) = 'object'),
  created_at      timestamptz not null default now(),
  constraint document_assets_role_file_uniq unique (document_id, role, filename)
);

-- ---------------------------------------------------------------- 4.3 document_extractions
create table if not exists public.document_extractions (
  extraction_id       uuid primary key,
  document_id         uuid not null references public.disclosure_documents(document_id) on delete restrict,
  extractor_version   text not null check (length(extractor_version) between 1 and 64),
  table_algo_version  text not null check (length(table_algo_version) between 1 and 64),
  code_version        text not null,
  has_text_layer      boolean not null,
  page_count          int not null check (page_count >= 0),
  pages_json_path     text not null,
  pages_json_sha256   text not null check (pages_json_sha256 ~ '^[0-9a-f]{64}$'),
  candidates_role     text not null check (candidates_role in ('none','primary','comparison')),
  candidates_status   text not null default 'n/a' check (candidates_status in ('n/a','pending','done','failed','exhausted')),
  candidates_attempts int not null default 0 check (candidates_attempts >= 0),
  candidates_lease_until    timestamptz,
  candidates_lease_batch_id uuid references public.ingest_batches(batch_id) on delete set null,
  batch_id            uuid not null references public.ingest_batches(batch_id) on delete restrict,
  created_at          timestamptz not null default now(),
  constraint document_extractions_version_uniq unique (document_id, extractor_version, table_algo_version),
  constraint document_extractions_doc_uniq unique (document_id, extraction_id),
  constraint de_role_status check ((candidates_role = 'none') = (candidates_status = 'n/a'))
);
alter table public.disclosure_documents drop constraint if exists dd_current_extraction_fkey;
alter table public.disclosure_documents add constraint dd_current_extraction_fkey
  foreign key (document_id, current_extraction_id) references public.document_extractions(document_id, extraction_id);

-- ---------------------------------------------------------------- 4.4 document_pages
create table if not exists public.document_pages (
  extraction_id uuid not null references public.document_extractions(extraction_id) on delete restrict,
  page_no       int not null check (page_no >= 1),
  text          text not null,
  text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  char_count    int not null check (char_count >= 0),
  width         numeric,
  height        numeric,
  line_count    int not null check (line_count >= 0),
  has_tables    boolean not null default false,
  primary key (extraction_id, page_no)
);

-- ---------------------------------------------------------------- 4.5 document_citations
create table if not exists public.document_citations (
  citation_id   uuid primary key,
  document_id   uuid not null references public.disclosure_documents(document_id) on delete restrict,
  extraction_id uuid not null,
  page_no       int not null,
  char_start    int not null check (char_start >= 0),
  char_end      int not null,
  bbox          jsonb check (bbox is null or jsonb_typeof(bbox) = 'object'),
  snippet       text not null,
  text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  visibility    text not null default 'internal' check (visibility in ('internal','public')),
  created_by    text not null check (created_by in ('extractor','human','llm','module')),
  created_ref   text not null check (length(created_ref) between 1 and 256),
  created_at    timestamptz not null default now(),
  constraint document_citations_range check (char_end > char_start),
  constraint document_citations_page_fkey foreign key (extraction_id, page_no) references public.document_pages(extraction_id, page_no) on delete restrict,
  constraint document_citations_extraction_fkey foreign key (document_id, extraction_id) references public.document_extractions(document_id, extraction_id) on delete restrict
);
create index if not exists document_citations_page_idx on public.document_citations(document_id, page_no);
create index if not exists document_citations_extraction_idx on public.document_citations(extraction_id);

-- ---------------------------------------------------------------- 4.7 extraction_approvals (before candidates: approval_id references it)
create table if not exists public.extraction_approvals (
  approval_id        uuid primary key default gen_random_uuid(),
  extractor_ref      text not null check (length(extractor_ref) between 1 and 128),
  extractor_version  text not null,
  table_algo_version text not null,
  code_version       text not null,
  concepts           text[] not null,
  gold_sha256        text not null check (gold_sha256 ~ '^[0-9a-f]{64}$'),
  precision          numeric not null check (precision between 0 and 1),
  recall             numeric not null check (recall between 0 and 1),
  report_path        text not null,
  approved_by        uuid not null references auth.users(id),
  approved_at        timestamptz not null default now(),
  revoked_at         timestamptz,
  constraint ea_threshold check (precision >= 0.95 and recall >= 0.95)
);
create index if not exists extraction_approvals_ref_idx on public.extraction_approvals(extractor_ref, approved_at desc);

-- ---------------------------------------------------------------- 4.6 extraction_candidates, candidate_publications
create table if not exists public.extraction_candidates (
  candidate_id     uuid primary key,
  document_id      uuid not null,
  extraction_id    uuid not null,
  kind             text not null check (kind in ('financial_fact','table_cell','field')),
  extractor_kind   text not null check (extractor_kind in ('rule','llm')),
  extractor_ref    text not null check (length(extractor_ref) between 1 and 128),
  natural_key      text not null check (length(natural_key) between 1 and 512),
  citations        jsonb not null check (jsonb_typeof(citations) = 'object'),
  payload          jsonb not null check (jsonb_typeof(payload) = 'object'),
  fingerprint      text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  checks           jsonb not null default '[]' check (jsonb_typeof(checks) = 'array'),
  checks_passed    boolean not null default false,
  status           text not null default 'candidate' check (status in ('candidate','confirmed','rejected','promoted')),
  decision_kind    text check (decision_kind in ('human','auto')),
  decided_by       uuid references auth.users(id),
  approval_id      uuid references public.extraction_approvals(approval_id),
  decided_at       timestamptz,
  inherited_from   uuid references public.extraction_candidates(candidate_id),
  input_snapshot   jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  batch_id         uuid not null references public.ingest_batches(batch_id) on delete restrict,
  created_at       timestamptz not null default now(),
  constraint extraction_candidates_extraction_fkey foreign key (document_id, extraction_id) references public.document_extractions(document_id, extraction_id) on delete restrict,
  constraint ec_decision_shape check (
    (status = 'candidate' and decision_kind is null and decided_by is null and approval_id is null and decided_at is null)
    or (status in ('confirmed','rejected','promoted') and decided_at is not null and
        ((decision_kind = 'human' and decided_by is not null and approval_id is null)
         or (decision_kind = 'auto' and decided_by is null and approval_id is not null and inherited_from is null and status <> 'rejected')))),
  constraint extraction_candidates_key_uniq unique (extraction_id, kind, extractor_ref, natural_key)
);
create index if not exists extraction_candidates_doc_status_idx on public.extraction_candidates(document_id, status);
create index if not exists extraction_candidates_open_idx on public.extraction_candidates(status, created_at) where status in ('candidate','confirmed');
create index if not exists extraction_candidates_fingerprint_idx on public.extraction_candidates(document_id, fingerprint);

create table if not exists public.candidate_publications (
  candidate_id   uuid not null references public.extraction_candidates(candidate_id) on delete restrict,
  pub_gen        int not null check (pub_gen >= 1),
  run_id         uuid not null,
  fact_id        uuid not null,
  state          text not null check (state in ('staged','published','abandoned')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (candidate_id, pub_gen)
);
create index if not exists candidate_publications_run_idx on public.candidate_publications(run_id);

-- ---------------------------------------------------------------- 4.7 document_sync_scope
create table if not exists public.document_sync_scope (
  issuer_id        uuid not null references public.issuers(issuer_id) on delete cascade,
  source           text not null check (source in ('edgar','cninfo','hkexnews')),
  reasons          jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array'),
  priority         int not null default 0 check (priority >= 0),
  fetch_key        text not null check (length(fetch_key) between 1 and 64),
  backfill_cursor  jsonb not null default '{}' check (jsonb_typeof(backfill_cursor) = 'object'),
  backfill_done    boolean not null default false,
  poll_cursor      jsonb not null default '{}' check (jsonb_typeof(poll_cursor) = 'object'),
  next_due_at      timestamptz not null default now(),
  lease_until      timestamptz,
  lease_batch_id   uuid references public.ingest_batches(batch_id) on delete set null,
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  last_status      text check (last_status in ('success','failed')),
  updated_at       timestamptz not null default now(),
  primary key (issuer_id, source)
);
create index if not exists document_sync_scope_due_idx on public.document_sync_scope(source, next_due_at, priority desc, issuer_id) where priority > 0;

-- ---------------------------------------------------------------- public view (§4.1)
create or replace view public.disclosure_documents_public with (security_invoker = true) as
select document_id, issuer_id, source, market, source_ref, source_version, supersedes_document_id, observed_replacement,
       form_type, doc_class, classifier_gen, title, language, source_url, content_sha256, bytes, mime, storage_path,
       published_at, published_at_precision, available_at, available_date, fiscal_year, fiscal_period, period_end,
       filing_source_ref, permission, status, current_extraction_id, batch_id, code_version, created_at
from public.disclosure_documents
where permission = 'public';

-- ---------------------------------------------------------------- 4.10 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disclosure-docs', 'disclosure-docs', false, 52428800,
        array['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- triggers (backstops for the function write path)
-- disclosure_documents: only the processing/classification columns change; status moves
-- stored → extracted|no_text_layer|extract_failed and back to stored (request_document_extract);
-- never deleted. The table has no generated column, so the to_jsonb comparison is exact.
create or replace function public.disclosure_documents_limited_update() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['status','current_extraction_id','extract_lease_until','extract_lease_batch_id','extract_attempts','doc_class','classifier_gen','fiscal_year','fiscal_period','period_end','filing_source_ref'];
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: disclosure_documents rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: disclosure_documents allows processing and classification changes only' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in
     (('stored','extracted'), ('stored','no_text_layer'), ('stored','extract_failed'),
      ('extracted','stored'), ('no_text_layer','stored'), ('extract_failed','stored'))) then
    raise exception 'append_only: disclosure_documents status % -> % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.disclosure_documents_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists disclosure_documents_limited_update on public.disclosure_documents;
create trigger disclosure_documents_limited_update before update or delete on public.disclosure_documents
  for each row execute function public.disclosure_documents_limited_update();

-- document_assets and document_pages: immutable.
create or replace function public.document_rows_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'append_only: % rows are immutable', tg_table_name using errcode = '23514';
end $$;
revoke execute on function public.document_rows_immutable() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists document_assets_immutable on public.document_assets;
create trigger document_assets_immutable before update or delete on public.document_assets
  for each row execute function public.document_rows_immutable();
drop trigger if exists document_pages_immutable on public.document_pages;
create trigger document_pages_immutable before update or delete on public.document_pages
  for each row execute function public.document_rows_immutable();

-- document_extractions: only the candidates scheduling columns change; never deleted.
create or replace function public.document_extractions_limited_update() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['candidates_status','candidates_attempts','candidates_lease_until','candidates_lease_batch_id'];
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: document_extractions rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: document_extractions allows candidates scheduling changes only' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.document_extractions_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists document_extractions_limited_update on public.document_extractions;
create trigger document_extractions_limited_update before update or delete on public.document_extractions
  for each row execute function public.document_extractions_limited_update();

-- document_citations: visibility internal → public only, only for human/module citations; never deleted.
create or replace function public.document_citations_limited_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: document_citations rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'visibility') <> (to_jsonb(old) - 'visibility') then
    raise exception 'append_only: document_citations allows visibility changes only' using errcode = '23514';
  end if;
  if new.visibility is distinct from old.visibility
     and not (old.visibility = 'internal' and new.visibility = 'public' and old.created_by in ('human','module')) then
    raise exception 'append_only: document_citations visibility % -> % is not allowed for %', old.visibility, new.visibility, old.created_by using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.document_citations_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists document_citations_limited_update on public.document_citations;
create trigger document_citations_limited_update before update or delete on public.document_citations
  for each row execute function public.document_citations_limited_update();

-- extraction_candidates: the identity, citations, payload and snapshot never change; checks only
-- while the row is a candidate; status moves candidate→confirmed|rejected, confirmed→candidate|promoted;
-- never deleted.
create or replace function public.extraction_candidates_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['checks','checks_passed','status','decision_kind','decided_by','approval_id','decided_at','inherited_from'];
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: extraction_candidates rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: extraction_candidates allows checks and decision changes only' using errcode = '23514';
  end if;
  if old.status <> 'candidate' and (new.checks, new.checks_passed) is distinct from (old.checks, old.checks_passed) then
    raise exception 'append_only: extraction_candidates checks are frozen once decided' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in
     (('candidate','confirmed'), ('candidate','rejected'), ('confirmed','candidate'), ('confirmed','promoted'))) then
    raise exception 'append_only: extraction_candidates status % -> % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.extraction_candidates_lifecycle() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists extraction_candidates_lifecycle on public.extraction_candidates;
create trigger extraction_candidates_lifecycle before update or delete on public.extraction_candidates
  for each row execute function public.extraction_candidates_lifecycle();

-- candidate_publications: staged→published|abandoned, abandoned→staged (new run_id/fact_id);
-- run_id/fact_id change only on abandoned→staged; never deleted.
create or replace function public.candidate_publications_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: candidate_publications rows are never deleted' using errcode = '23514';
  end if;
  if (new.candidate_id, new.pub_gen, new.created_at) is distinct from (old.candidate_id, old.pub_gen, old.created_at) then
    raise exception 'append_only: candidate_publications identity is immutable' using errcode = '23514';
  end if;
  if new.state is distinct from old.state and not ((old.state, new.state) in (('staged','published'), ('staged','abandoned'), ('abandoned','staged'))) then
    raise exception 'append_only: candidate_publications state % -> % is not allowed', old.state, new.state using errcode = '23514';
  end if;
  if (new.run_id, new.fact_id) is distinct from (old.run_id, old.fact_id) and not (old.state = 'abandoned' and new.state = 'staged') then
    raise exception 'append_only: candidate_publications run/fact change only when re-staging an abandoned row' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.candidate_publications_lifecycle() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists candidate_publications_lifecycle on public.candidate_publications;
create trigger candidate_publications_lifecycle before update or delete on public.candidate_publications
  for each row execute function public.candidate_publications_lifecycle();

-- extraction_approvals: only revoked_at, once (null → timestamp); never deleted.
create or replace function public.extraction_approvals_limited_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: extraction_approvals rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'revoked_at') <> (to_jsonb(old) - 'revoked_at') then
    raise exception 'append_only: extraction_approvals allows revocation only' using errcode = '23514';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'append_only: extraction_approvals revocation is final' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.extraction_approvals_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists extraction_approvals_limited_update on public.extraction_approvals;
create trigger extraction_approvals_limited_update before update or delete on public.extraction_approvals
  for each row execute function public.extraction_approvals_limited_update();

-- ---------------------------------------------------------------- internal helpers (no client role may execute)
-- Locks the scope row and verifies the sync lease (lease_batch_id = p_batch, unexpired).
create or replace function public.doc_scope_lock(p_issuer uuid, p_source text, p_batch uuid)
returns public.document_sync_scope language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found or s.lease_batch_id is distinct from p_batch or s.lease_until is null or s.lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return s;
end $$;
revoke execute on function public.doc_scope_lock(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Locks the document row and verifies the extract lease.
create or replace function public.doc_extract_lock(p_document uuid, p_batch uuid)
returns public.disclosure_documents language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.extract_lease_batch_id is distinct from p_batch or d.extract_lease_until is null or d.extract_lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return d;
end $$;
revoke execute on function public.doc_extract_lock(uuid, uuid) from public, anon, authenticated, service_role;

-- Locks the extraction row and verifies the candidates lease.
create or replace function public.doc_candidates_lock(p_extraction uuid, p_batch uuid)
returns public.document_extractions language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.candidates_lease_batch_id is distinct from p_batch or e.candidates_lease_until is null or e.candidates_lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return e;
end $$;
revoke execute on function public.doc_candidates_lock(uuid, uuid) from public, anon, authenticated, service_role;

-- Citation ids referenced by a candidate's citations object: every top-level string value and the
-- citation_id of every object inside a top-level array (financial_fact: value/label/unit + period[]).
create or replace function public.candidate_citation_ids(p_citations jsonb)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(x), '{}'::text[]) from (
    select e.value #>> '{}' as x from jsonb_each(p_citations) e where jsonb_typeof(e.value) = 'string'
    union all
    select a ->> 'citation_id' from jsonb_each(p_citations) e cross join lateral jsonb_array_elements(e.value) a
    where jsonb_typeof(e.value) = 'array' and jsonb_typeof(a) = 'object'
  ) t
$$;
revoke execute on function public.candidate_citation_ids(jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.8 sync scope functions
-- Schedule inputs only (reasons/priority/fetch_key); never touches cursors, schedule or lease.
-- Returns the number of rows inserted or actually changed.
create or replace function public.reconcile_document_sync_scope(p_source text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_source is null or p_source not in ('edgar','cninfo','hkexnews') then raise exception 'invalid_input: source' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  insert into public.document_sync_scope (issuer_id, source, reasons, priority, fetch_key)
  select distinct on ((x ->> 'issuer_id')) (x ->> 'issuer_id')::uuid, p_source, coalesce(x -> 'reasons', '[]'::jsonb), coalesce((x ->> 'priority')::int, 0), x ->> 'fetch_key'
  from jsonb_array_elements(p_rows) x
  on conflict (issuer_id, source) do update
    set reasons = excluded.reasons, priority = excluded.priority, fetch_key = excluded.fetch_key, updated_at = now()
    where (document_sync_scope.reasons, document_sync_scope.priority, document_sync_scope.fetch_key)
          is distinct from (excluded.reasons, excluded.priority, excluded.fetch_key);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.reconcile_document_sync_scope(text, jsonb) from public, anon, authenticated;
grant execute on function public.reconcile_document_sync_scope(text, jsonb) to service_role;

-- Unleased, expired, or held by the same batch → (re)lease and true; otherwise false. No row → false.
create or replace function public.claim_document_sync_lease(p_issuer uuid, p_source text, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found then return false; end if;
  if s.lease_batch_id is null or s.lease_until is null or s.lease_until <= now() or s.lease_batch_id = p_batch then
    update public.document_sync_scope
    set lease_batch_id = p_batch, lease_until = now() + make_interval(secs => p_ttl), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.claim_document_sync_lease(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_document_sync_lease(uuid, text, uuid, int) to service_role;

-- Scope lock + sync lease. One transaction: versions of (source, source_ref) are read under a
-- per-ref advisory lock; same content_sha256 → duplicate (nothing written); else version max + 1
-- with supersedes/observed_replacement, the document and all its assets. The listed sources are
-- public: issuer/source/batch come from the arguments, permission is forced to public. A
-- source_ref already held by another issuer is refused (invalid_input).
create or replace function public.insert_document_version(p_issuer uuid, p_source text, p_batch uuid, p_doc jsonb, p_assets jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; v_prev public.disclosure_documents; v_dup uuid; v_assets jsonb := coalesce(p_assets, '[]'::jsonb);
begin
  if p_source is null or p_source not in ('edgar','cninfo','hkexnews') then raise exception 'invalid_input: source' using errcode = '22023'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'invalid_input: doc' using errcode = '22023'; end if;
  if jsonb_typeof(v_assets) <> 'array'
     or exists (select 1 from jsonb_array_elements(v_assets) a group by a ->> 'role', a ->> 'filename' having count(*) > 1) then
    raise exception 'invalid_input: assets' using errcode = '22023';
  end if;
  perform public.doc_scope_lock(p_issuer, p_source, p_batch);
  d := jsonb_populate_record(null::public.disclosure_documents, p_doc);
  if d.source_ref is null or d.content_sha256 is null then raise exception 'invalid_input: source_ref/content_sha256' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('docver:' || p_source || ':' || d.source_ref));
  if exists (select 1 from public.disclosure_documents x where x.source = p_source and x.source_ref = d.source_ref and x.issuer_id is distinct from p_issuer) then
    raise exception 'invalid_input: source_ref belongs to another issuer' using errcode = '22023';
  end if;
  select x.document_id into v_dup from public.disclosure_documents x
  where x.source = p_source and x.source_ref = d.source_ref and x.content_sha256 = d.content_sha256;
  if v_dup is not null then return jsonb_build_object('outcome', 'duplicate', 'document_id', v_dup); end if;
  select * into v_prev from public.disclosure_documents x
  where x.source = p_source and x.source_ref = d.source_ref order by x.source_version desc limit 1;
  d.document_id := gen_random_uuid();
  d.issuer_id := p_issuer; d.source := p_source; d.batch_id := p_batch;
  d.permission := 'public'; d.owner_user_id := null; d.license_ref := null;
  d.source_version := coalesce(v_prev.source_version, 0) + 1;
  d.supersedes_document_id := v_prev.document_id;
  d.observed_replacement := v_prev.document_id is not null;
  d.status := 'stored'; d.current_extraction_id := null; d.extract_lease_until := null; d.extract_lease_batch_id := null;
  d.extract_attempts := 0; d.created_at := now();
  insert into public.disclosure_documents select (d).*;
  insert into public.document_assets (asset_id, document_id, role, filename, source_url, content_sha256, bytes, mime, storage_path, acquisition, created_at)
  select gen_random_uuid(), d.document_id, a.role, a.filename, a.source_url, a.content_sha256, a.bytes, a.mime, a.storage_path, a.acquisition, now()
  from jsonb_populate_recordset(null::public.document_assets, v_assets) a;
  return jsonb_build_object('outcome', case when v_prev.document_id is null then 'inserted' else 'versioned' end, 'document_id', d.document_id);
end $$;
revoke execute on function public.insert_document_version(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.insert_document_version(uuid, text, uuid, jsonb, jsonb) to service_role;

-- Holder's advisory lock per owner. source='upload', source_ref = '<owner>/<sha256>', version 1;
-- same owner + same bytes → duplicate. permission must be licensed|private; issuer_id may be null.
create or replace function public.insert_upload_document(p_owner uuid, p_doc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; v_dup uuid;
begin
  if p_owner is null then raise exception 'invalid_input: owner' using errcode = '22023'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'invalid_input: doc' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('upload:' || p_owner::text));
  d := jsonb_populate_record(null::public.disclosure_documents, p_doc);
  if d.permission is null or d.permission not in ('licensed','private') then raise exception 'invalid_input: permission' using errcode = '22023'; end if;
  if d.content_sha256 is null then raise exception 'invalid_input: content_sha256' using errcode = '22023'; end if;
  d.source := 'upload'; d.source_ref := p_owner::text || '/' || d.content_sha256;
  select x.document_id into v_dup from public.disclosure_documents x where x.source = 'upload' and x.source_ref = d.source_ref;
  if v_dup is not null then return jsonb_build_object('outcome', 'duplicate', 'document_id', v_dup); end if;
  d.document_id := gen_random_uuid(); d.owner_user_id := p_owner; d.source_url := null;
  d.source_version := 1; d.supersedes_document_id := null; d.observed_replacement := false;
  d.status := 'stored'; d.current_extraction_id := null; d.extract_lease_until := null; d.extract_lease_batch_id := null;
  d.extract_attempts := 0; d.created_at := now();
  insert into public.disclosure_documents select (d).*;
  return jsonb_build_object('outcome', 'inserted', 'document_id', d.document_id);
end $$;
revoke execute on function public.insert_upload_document(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_upload_document(uuid, jsonb) to service_role;

-- Scope lock + sync lease. backfill → backfill_cursor/backfill_done; poll → poll_cursor (null clears).
-- Never backwards unless p_reset (an operator replay; codex plan round 1 P2-4): a finished backfill
-- (backfill_done) accepts only a repeated completion (null cursor, done) — no new backfill cursor and
-- no done → false; once the stored cursor carries seq, a new cursor must carry a strictly greater
-- seq (the sync core bumps it at every checkpoint). Refused → cursor_regression (P0001), no change.
create or replace function public.advance_document_cursor(p_issuer uuid, p_source text, p_batch uuid, p_mode text, p_cursor jsonb, p_done boolean, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope; v_old jsonb;
begin
  if p_mode is null or p_mode not in ('backfill','poll') then raise exception 'invalid_input: mode' using errcode = '22023'; end if;
  if p_cursor is not null and jsonb_typeof(p_cursor) <> 'object' then raise exception 'invalid_input: cursor' using errcode = '22023'; end if;
  if p_cursor is not null and p_cursor ? 'seq' and jsonb_typeof(p_cursor -> 'seq') <> 'number' then raise exception 'invalid_input: cursor seq' using errcode = '22023'; end if;
  s := public.doc_scope_lock(p_issuer, p_source, p_batch);
  if not coalesce(p_reset, false) then
    if p_mode = 'backfill' and s.backfill_done and not (p_cursor is null and coalesce(p_done, false)) then
      raise exception 'cursor_regression' using errcode = 'P0001', detail = 'backfill_done';
    end if;
    v_old := case when p_mode = 'backfill' then s.backfill_cursor else s.poll_cursor end;
    if p_cursor is not null and v_old ? 'seq' and jsonb_typeof(v_old -> 'seq') = 'number'
       and (not (p_cursor ? 'seq') or (p_cursor ->> 'seq')::numeric <= (v_old ->> 'seq')::numeric) then
      raise exception 'cursor_regression' using errcode = 'P0001', detail = 'seq';
    end if;
  end if;
  if p_mode = 'backfill' then
    update public.document_sync_scope set backfill_cursor = coalesce(p_cursor, '{}'::jsonb), backfill_done = coalesce(p_done, false), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
  else
    update public.document_sync_scope set poll_cursor = coalesce(p_cursor, '{}'::jsonb), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
  end if;
end $$;
revoke execute on function public.advance_document_cursor(uuid, text, uuid, text, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.advance_document_cursor(uuid, text, uuid, text, jsonb, boolean, boolean) to service_role;

-- Holder check (an expired but unclaimed lease may still be released); records the outcome.
create or replace function public.release_document_sync_lease(p_issuer uuid, p_source text, p_batch uuid, p_outcome text, p_next_due timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  if p_outcome is null or p_outcome not in ('success','failed') then raise exception 'invalid_input: outcome' using errcode = '22023'; end if;
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found or s.lease_batch_id is distinct from p_batch then raise exception 'lease_lost' using errcode = '55P03'; end if;
  update public.document_sync_scope
  set lease_until = null, lease_batch_id = null, last_attempt_at = now(),
      last_success_at = case when p_outcome = 'success' then now() else last_success_at end,
      last_status = p_outcome, next_due_at = coalesce(p_next_due, now()), updated_at = now()
  where issuer_id = p_issuer and source = p_source;
end $$;
revoke execute on function public.release_document_sync_lease(uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.release_document_sync_lease(uuid, text, uuid, text, timestamptz) to service_role;

-- Document row lock; admin authority (the route already ran requireAdminUser and writes the audit).
-- Only the classification columns named in p_patch change.
create or replace function public.reclassify_document(p_document uuid, p_patch jsonb, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; p public.disclosure_documents;
begin
  if p_actor is null then raise exception 'invalid_input: actor' using errcode = '22023'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('doc_class','classifier_gen','fiscal_year','fiscal_period','period_end','filing_source_ref')) then
    raise exception 'invalid_input: patch' using errcode = '22023';
  end if;
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  p := jsonb_populate_record(d, p_patch);
  update public.disclosure_documents
  set doc_class = p.doc_class, classifier_gen = p.classifier_gen, fiscal_year = p.fiscal_year,
      fiscal_period = p.fiscal_period, period_end = p.period_end, filing_source_ref = p.filing_source_ref
  where document_id = p_document;
end $$;
revoke execute on function public.reclassify_document(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.reclassify_document(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------- 4.8 extraction functions
-- Document row lock. Requires status 'stored' and an unleased/expired/same-batch lease. The third
-- crash is closed here: attempts >= 3 → extract_failed, lease cleared, false. Otherwise lease and
-- extract_attempts + 1 (the only counting point), true.
create or replace function public.claim_document_extract_lease(p_document uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found or d.status <> 'stored' then return false; end if;
  if not (d.extract_lease_batch_id is null or d.extract_lease_until is null or d.extract_lease_until <= now() or d.extract_lease_batch_id = p_batch) then
    return false;
  end if;
  if d.extract_attempts >= 3 then
    update public.disclosure_documents set status = 'extract_failed', extract_lease_until = null, extract_lease_batch_id = null where document_id = p_document;
    return false;
  end if;
  update public.disclosure_documents
  set extract_lease_batch_id = p_batch, extract_lease_until = now() + make_interval(secs => p_ttl), extract_attempts = extract_attempts + 1
  where document_id = p_document;
  return true;
end $$;
revoke execute on function public.claim_document_extract_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_document_extract_lease(uuid, uuid, int) to service_role;

-- Document row lock. The holder (extract_lease_batch_id = p_batch — an expired lease nobody else
-- claimed is still the holder's) extends its lease without counting an attempt (codex plan round 1
-- P2-7: long extractions renew before each mutating phase); status must still be 'stored'. Another
-- batch took over, or the document moved on → false, nothing changes.
create or replace function public.renew_document_extract_lease(p_document uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found or d.status <> 'stored' or d.extract_lease_batch_id is distinct from p_batch then return false; end if;
  update public.disclosure_documents set extract_lease_until = now() + make_interval(secs => p_ttl) where document_id = p_document;
  return true;
end $$;
revoke execute on function public.renew_document_extract_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.renew_document_extract_lease(uuid, uuid, int) to service_role;

-- Document row lock + extract lease. Inserts the immutable extraction (candidates role/status
-- decided here, spec §7.3: hkexnews + HK + annual/interim + text layer → zh primary, else
-- comparison; everything else none/n/a) and every page (validated: pages 1..page_count exactly,
-- char_count = length(text) in code points, text_hash = sha256(utf8(text))); status extracted |
-- no_text_layer; current_extraction_id → the new version; lease cleared. Never deletes anything.
create or replace function public.finish_document_extract(p_document uuid, p_batch uuid, p_extraction jsonb, p_pages jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; e public.document_extractions; v_role text;
        v_n int; v_distinct int; v_min int; v_max int; v_ok boolean;
begin
  if p_extraction is null or jsonb_typeof(p_extraction) <> 'object' then raise exception 'invalid_input: extraction' using errcode = '22023'; end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then raise exception 'invalid_input: pages' using errcode = '22023'; end if;
  d := public.doc_extract_lock(p_document, p_batch);
  e := jsonb_populate_record(null::public.document_extractions, p_extraction);
  if e.extractor_version is null or e.table_algo_version is null or e.has_text_layer is null or e.page_count is null then
    raise exception 'invalid_input: extraction fields' using errcode = '22023';
  end if;
  if exists (select 1 from public.document_extractions x where x.document_id = p_document and x.extractor_version = e.extractor_version and x.table_algo_version = e.table_algo_version) then
    raise exception 'revision_exists' using errcode = 'P0001';
  end if;
  select count(*)::int, count(distinct p.page_no)::int, min(p.page_no), max(p.page_no),
         coalesce(bool_and(coalesce(p.char_count = length(p.text) and p.text_hash = encode(sha256(convert_to(p.text, 'UTF8')), 'hex'), false)), true)
  into v_n, v_distinct, v_min, v_max, v_ok
  from jsonb_populate_recordset(null::public.document_pages, p_pages) p;
  if v_n <> e.page_count or v_distinct <> v_n or (v_n > 0 and (v_min <> 1 or v_max <> v_n)) or not v_ok then
    raise exception 'invalid_input: pages do not match page_count, char_count or text_hash' using errcode = '22023';
  end if;
  v_role := case when d.source = 'hkexnews' and d.market = 'HK' and d.doc_class in ('annual_report','interim_report') and e.has_text_layer
                 then case when d.language = 'zh' then 'primary' else 'comparison' end
                 else 'none' end;
  e.extraction_id := gen_random_uuid(); e.document_id := p_document;
  e.candidates_role := v_role; e.candidates_status := case when v_role = 'none' then 'n/a' else 'pending' end;
  e.candidates_attempts := 0; e.candidates_lease_until := null; e.candidates_lease_batch_id := null;
  e.batch_id := p_batch; e.created_at := now();
  insert into public.document_extractions select (e).*;
  insert into public.document_pages (extraction_id, page_no, text, text_hash, char_count, width, height, line_count, has_tables)
  select e.extraction_id, p.page_no, p.text, p.text_hash, p.char_count, p.width, p.height, coalesce(p.line_count, 0), coalesce(p.has_tables, false)
  from jsonb_populate_recordset(null::public.document_pages, p_pages) p;
  update public.disclosure_documents
  set status = case when e.has_text_layer then 'extracted' else 'no_text_layer' end,
      current_extraction_id = e.extraction_id, extract_lease_until = null, extract_lease_batch_id = null
  where document_id = p_document;
  return e.extraction_id;
end $$;
revoke execute on function public.finish_document_extract(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_document_extract(uuid, uuid, jsonb, jsonb) to service_role;

-- Document row lock + extract lease. attempts >= 3 → extract_failed; lease cleared (no counting:
-- the attempt was counted at claim). p_code is recorded by the caller in the batch errors.
create or replace function public.fail_document_extract(p_document uuid, p_batch uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_code is null or length(p_code) = 0 then raise exception 'invalid_input: code' using errcode = '22023'; end if;
  d := public.doc_extract_lock(p_document, p_batch);
  update public.disclosure_documents
  set status = case when d.extract_attempts >= 3 then 'extract_failed' else status end,
      extract_lease_until = null, extract_lease_batch_id = null
  where document_id = p_document;
end $$;
revoke execute on function public.fail_document_extract(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_document_extract(uuid, uuid, text) to service_role;

-- Document row lock; admin authority. The caller passes the CURRENT extractor and table-algorithm
-- versions (TS constants): a version already extracted → revision_exists (versions are immutable);
-- otherwise extracted|no_text_layer|extract_failed → stored with attempts reset. Already stored →
-- no-op.
create or replace function public.request_document_extract(p_document uuid, p_actor uuid, p_extractor_version text, p_table_algo_version text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_actor is null or p_extractor_version is null or p_table_algo_version is null then raise exception 'invalid_input: actor/versions' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.document_extractions x where x.document_id = p_document and x.extractor_version = p_extractor_version and x.table_algo_version = p_table_algo_version) then
    raise exception 'revision_exists' using errcode = 'P0001';
  end if;
  if d.status <> 'stored' then
    update public.disclosure_documents set status = 'stored', extract_attempts = 0, extract_lease_until = null, extract_lease_batch_id = null
    where document_id = p_document;
  end if;
end $$;
revoke execute on function public.request_document_extract(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_document_extract(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------- 4.8 candidates scheduling
-- Extraction row lock. Requires candidates_status pending|failed and an unleased/expired/same-batch
-- lease; attempts >= 3 → exhausted, lease cleared, false (the third crash closes here); otherwise
-- lease and candidates_attempts + 1 (the only counting point), true.
create or replace function public.claim_candidates_lease(p_extraction uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found or e.candidates_status not in ('pending','failed') then return false; end if;
  if not (e.candidates_lease_batch_id is null or e.candidates_lease_until is null or e.candidates_lease_until <= now() or e.candidates_lease_batch_id = p_batch) then
    return false;
  end if;
  if e.candidates_attempts >= 3 then
    update public.document_extractions set candidates_status = 'exhausted', candidates_lease_until = null, candidates_lease_batch_id = null where extraction_id = p_extraction;
    return false;
  end if;
  update public.document_extractions
  set candidates_lease_batch_id = p_batch, candidates_lease_until = now() + make_interval(secs => p_ttl), candidates_attempts = candidates_attempts + 1
  where extraction_id = p_extraction;
  return true;
end $$;
revoke execute on function public.claim_candidates_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_candidates_lease(uuid, uuid, int) to service_role;

-- Extraction row lock. The holder extends its candidates lease without counting an attempt (P2-7);
-- candidates_status must still be pending|failed. Taken over or moved on → false.
create or replace function public.renew_candidates_lease(p_extraction uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found or e.candidates_status not in ('pending','failed') or e.candidates_lease_batch_id is distinct from p_batch then return false; end if;
  update public.document_extractions set candidates_lease_until = now() + make_interval(secs => p_ttl) where extraction_id = p_extraction;
  return true;
end $$;
revoke execute on function public.renew_candidates_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.renew_candidates_lease(uuid, uuid, int) to service_role;

-- Extraction row lock + candidates lease. pending|failed → done|failed; lease cleared.
create or replace function public.finish_candidates(p_extraction uuid, p_batch uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status is null or p_status not in ('done','failed') then raise exception 'invalid_input: status' using errcode = '22023'; end if;
  perform public.doc_candidates_lock(p_extraction, p_batch);
  update public.document_extractions set candidates_status = p_status, candidates_lease_until = null, candidates_lease_batch_id = null
  where extraction_id = p_extraction;
end $$;
revoke execute on function public.finish_candidates(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finish_candidates(uuid, uuid, text) to service_role;

-- Extraction row locks (the update takes them, extraction_id order); admin/script authority. Every
-- CURRENT extraction (= its document's current_extraction_id) with candidates_role <> 'none' and
-- status done|failed|exhausted, narrowed by p_filter {source?, issuer_id?, document_id?}, goes back
-- to pending with attempts 0. Returns the number reset.
create or replace function public.request_candidates_regen(p_filter jsonb, p_actor uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_filter jsonb := coalesce(p_filter, '{}'::jsonb);
begin
  if p_actor is null then raise exception 'invalid_input: actor' using errcode = '22023'; end if;
  if jsonb_typeof(v_filter) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_filter) k where k not in ('source','issuer_id','document_id')) then
    raise exception 'invalid_input: filter' using errcode = '22023';
  end if;
  perform 1 from public.document_extractions e
  join public.disclosure_documents d on d.document_id = e.document_id and d.current_extraction_id = e.extraction_id
  where e.candidates_role <> 'none' and e.candidates_status in ('done','failed','exhausted')
    and (v_filter ->> 'source' is null or d.source = v_filter ->> 'source')
    and (v_filter ->> 'issuer_id' is null or d.issuer_id = (v_filter ->> 'issuer_id')::uuid)
    and (v_filter ->> 'document_id' is null or d.document_id = (v_filter ->> 'document_id')::uuid)
  order by e.extraction_id
  for update of e;
  update public.document_extractions e
  set candidates_status = 'pending', candidates_attempts = 0, candidates_lease_until = null, candidates_lease_batch_id = null
  from public.disclosure_documents d
  where d.document_id = e.document_id and d.current_extraction_id = e.extraction_id
    and e.candidates_role <> 'none' and e.candidates_status in ('done','failed','exhausted')
    and (v_filter ->> 'source' is null or d.source = v_filter ->> 'source')
    and (v_filter ->> 'issuer_id' is null or d.issuer_id = (v_filter ->> 'issuer_id')::uuid)
    and (v_filter ->> 'document_id' is null or d.document_id = (v_filter ->> 'document_id')::uuid);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.request_candidates_regen(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.request_candidates_regen(jsonb, uuid) to service_role;

-- ---------------------------------------------------------------- 4.8 citations
-- No lock (pages are immutable). The page must belong to the extraction and the extraction to the
-- document; 0 <= char_start < char_end <= char_count; snippet = substr(text, char_start + 1,
-- char_end - char_start) (code points); text_hash = the page's text_hash. Else invalid_citation.
create or replace function public.insert_citation(p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.document_citations; pg public.document_pages;
begin
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'invalid_citation: row' using errcode = '22023'; end if;
  c := jsonb_populate_record(null::public.document_citations, p_row);
  select p.* into pg from public.document_pages p
  join public.document_extractions e on e.extraction_id = p.extraction_id
  where p.extraction_id = c.extraction_id and p.page_no = c.page_no and e.document_id = c.document_id;
  if not found then raise exception 'invalid_citation: page' using errcode = '22023'; end if;
  if c.char_start is null or c.char_end is null or c.char_start < 0 or c.char_end <= c.char_start or c.char_end > pg.char_count then
    raise exception 'invalid_citation: range' using errcode = '22023';
  end if;
  if c.snippet is distinct from substr(pg.text, c.char_start + 1, c.char_end - c.char_start) then
    raise exception 'invalid_citation: snippet' using errcode = '22023';
  end if;
  if c.text_hash is distinct from pg.text_hash then raise exception 'invalid_citation: text_hash' using errcode = '22023'; end if;
  if c.created_by is null or c.created_ref is null then raise exception 'invalid_citation: creator' using errcode = '22023'; end if;
  c.citation_id := gen_random_uuid(); c.visibility := 'internal'; c.created_at := now();
  insert into public.document_citations select (c).*;
  return c.citation_id;
end $$;
revoke execute on function public.insert_citation(jsonb) from public, anon, authenticated;
grant execute on function public.insert_citation(jsonb) to service_role;

-- No lock. Every id must exist, be created_by human|module and belong to a public document, else
-- not_publishable (nothing changes). internal → public; returns the number that changed.
create or replace function public.publish_citations(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_ids uuid[] := coalesce(p_ids, '{}'::uuid[]); n int;
begin
  if exists (
    select 1 from unnest(v_ids) i(id)
    where not exists (
      select 1 from public.document_citations c join public.disclosure_documents d on d.document_id = c.document_id
      where c.citation_id = i.id and c.created_by in ('human','module') and d.permission = 'public')) then
    raise exception 'not_publishable' using errcode = 'P0001';
  end if;
  update public.document_citations set visibility = 'public' where citation_id = any(v_ids) and visibility = 'internal';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.publish_citations(uuid[]) from public, anon, authenticated;
grant execute on function public.publish_citations(uuid[]) to service_role;

-- ---------------------------------------------------------------- 4.8 candidates
-- Extraction row lock + candidates lease. Every citation id of every row must be a uuid of a
-- citation of THIS extraction (and so of its document), else invalid_citation; financial_fact rows
-- need value/label/unit and a non-empty period array, every kind needs value. Rows are inserted as
-- 'candidate' with empty decision fields (no inheritance here: write_candidate_checks applies it);
-- an existing (extraction, kind, extractor_ref, natural_key) is skipped. Returns {inserted}.
create or replace function public.insert_candidates(p_extraction uuid, p_batch uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.document_extractions; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  e := public.doc_candidates_lock(p_extraction, p_batch);
  if exists (
    select 1 from jsonb_array_elements(p_rows) x
    where jsonb_typeof(x -> 'citations') is distinct from 'object'
       or jsonb_typeof(x -> 'citations' -> 'value') is distinct from 'string'
       or (x ->> 'kind' = 'financial_fact' and (
            jsonb_typeof(x -> 'citations' -> 'label') is distinct from 'string'
            or jsonb_typeof(x -> 'citations' -> 'unit') is distinct from 'string'
            or jsonb_typeof(x -> 'citations' -> 'period') is distinct from 'array'
            or jsonb_array_length(x -> 'citations' -> 'period') = 0))) then
    raise exception 'invalid_citation: shape' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) x
    cross join lateral unnest(public.candidate_citation_ids(x -> 'citations')) as cid(id)
    where cid.id is null
       or cid.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from public.document_citations c where c.citation_id = cid.id::uuid and c.extraction_id = p_extraction and c.document_id = e.document_id)) then
    raise exception 'invalid_citation: reference' using errcode = '22023';
  end if;
  insert into public.extraction_candidates (candidate_id, document_id, extraction_id, kind, extractor_kind, extractor_ref, natural_key,
                                            citations, payload, fingerprint, checks, checks_passed, status, input_snapshot, batch_id, created_at)
  select gen_random_uuid(), e.document_id, p_extraction, x ->> 'kind', x ->> 'extractor_kind', x ->> 'extractor_ref', x ->> 'natural_key',
         x -> 'citations', x -> 'payload', x ->> 'fingerprint', '[]'::jsonb, false, 'candidate', x -> 'input_snapshot', p_batch, now()
  from jsonb_array_elements(p_rows) x
  on conflict on constraint extraction_candidates_key_uniq do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n);
end $$;
revoke execute on function public.insert_candidates(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_candidates(uuid, uuid, jsonb) to service_role;

-- Extraction row lock + candidates lease + each named candidate row FOR UPDATE (candidate_id order).
-- The only writer of checks: every row must be a 'candidate' of this extraction (else decided /
-- not_found). checks/checks_passed are persisted first; then, for rows that passed, a HUMAN decision
-- (confirmed|promoted) of the same document with the same fingerprint is inherited atomically:
-- confirmed, decision_kind human, decided_by of the source, decided_at now(), inherited_from.
-- Auto decisions are never inherited. Returns {written, inherited}.
create or replace function public.write_candidate_checks(p_extraction uuid, p_batch uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.document_extractions; x record; c public.extraction_candidates; src public.extraction_candidates;
        v_written int := 0; v_inherited int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  e := public.doc_candidates_lock(p_extraction, p_batch);
  for x in
    select (r ->> 'candidate_id')::uuid as candidate_id, r -> 'checks' as checks, (r ->> 'checks_passed')::boolean as checks_passed
    from jsonb_array_elements(p_rows) r order by (r ->> 'candidate_id')::uuid
  loop
    if jsonb_typeof(x.checks) is distinct from 'array' or x.checks_passed is null then raise exception 'invalid_input: checks' using errcode = '22023'; end if;
    select * into c from public.extraction_candidates where candidate_id = x.candidate_id and extraction_id = p_extraction for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if c.status <> 'candidate' then raise exception 'decided' using errcode = 'P0001'; end if;
    update public.extraction_candidates set checks = x.checks, checks_passed = x.checks_passed where candidate_id = c.candidate_id;
    v_written := v_written + 1;
    if x.checks_passed then
      select s.* into src from public.extraction_candidates s
      where s.document_id = c.document_id and s.fingerprint = c.fingerprint and s.candidate_id <> c.candidate_id
        and s.decision_kind = 'human' and s.status in ('confirmed','promoted')
      order by s.decided_at desc, s.candidate_id limit 1;
      if found then
        update public.extraction_candidates
        set status = 'confirmed', decision_kind = 'human', decided_by = src.decided_by, approval_id = null,
            decided_at = now(), inherited_from = src.candidate_id
        where candidate_id = c.candidate_id;
        v_inherited := v_inherited + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('written', v_written, 'inherited', v_inherited);
end $$;
revoke execute on function public.write_candidate_checks(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.write_candidate_checks(uuid, uuid, jsonb) to service_role;

-- Candidate row lock. Human: candidate→confirmed (requires checks_passed, else not_eligible),
-- candidate→rejected, confirmed→candidate (requires no candidate_publications row, else
-- not_eligible); the same status again is a no-op; any other transition → decided.
-- Auto: requires a rule candidate with checks_passed, an unrevoked approval (revoked →
-- approval_revoked) whose extractor_ref equals the candidate's, whose three versions equal the
-- candidate's document_extractions row, and whose concepts contain payload.concept → confirmed; a
-- row already confirmed by the same approval is a no-op; anything else → not_eligible.
-- Returns {status}.
create or replace function public.decide_candidate(p_candidate uuid, p_decision jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.extraction_candidates; e public.document_extractions; a public.extraction_approvals;
        v_kind text := p_decision ->> 'kind'; v_target text := p_decision ->> 'status'; v_by uuid; v_approval uuid;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' or v_kind is null or v_kind not in ('human','auto') then
    raise exception 'invalid_input: decision' using errcode = '22023';
  end if;
  select * into c from public.extraction_candidates where candidate_id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_kind = 'human' then
    v_by := (p_decision ->> 'decided_by')::uuid;
    if v_by is null or v_target is null or v_target not in ('confirmed','rejected','candidate') then raise exception 'invalid_input: human decision' using errcode = '22023'; end if;
    if c.status = v_target then return jsonb_build_object('status', c.status); end if;
    if c.status = 'candidate' and v_target = 'confirmed' then
      if not c.checks_passed then raise exception 'not_eligible' using errcode = 'P0001'; end if;
      update public.extraction_candidates set status = 'confirmed', decision_kind = 'human', decided_by = v_by, approval_id = null, decided_at = now(), inherited_from = null
      where candidate_id = p_candidate;
    elsif c.status = 'candidate' and v_target = 'rejected' then
      update public.extraction_candidates set status = 'rejected', decision_kind = 'human', decided_by = v_by, approval_id = null, decided_at = now(), inherited_from = null
      where candidate_id = p_candidate;
    elsif c.status = 'confirmed' and v_target = 'candidate' then
      if exists (select 1 from public.candidate_publications p where p.candidate_id = p_candidate) then raise exception 'not_eligible' using errcode = 'P0001'; end if;
      update public.extraction_candidates set status = 'candidate', decision_kind = null, decided_by = null, approval_id = null, decided_at = null, inherited_from = null
      where candidate_id = p_candidate;
    else
      raise exception 'decided' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', v_target);
  end if;
  v_approval := (p_decision ->> 'approval_id')::uuid;
  if v_approval is null then raise exception 'invalid_input: approval_id' using errcode = '22023'; end if;
  if c.status = 'confirmed' and c.decision_kind = 'auto' and c.approval_id = v_approval then return jsonb_build_object('status', c.status); end if;
  if c.status <> 'candidate' or c.extractor_kind <> 'rule' or not c.checks_passed then raise exception 'not_eligible' using errcode = 'P0001'; end if;
  select * into a from public.extraction_approvals where approval_id = v_approval;
  if not found then raise exception 'not_eligible' using errcode = 'P0001'; end if;
  if a.revoked_at is not null then raise exception 'approval_revoked' using errcode = 'P0001'; end if;
  select * into e from public.document_extractions where extraction_id = c.extraction_id;
  if a.extractor_ref <> c.extractor_ref or a.extractor_version <> e.extractor_version or a.table_algo_version <> e.table_algo_version
     or a.code_version <> e.code_version or not ((c.payload ->> 'concept') = any(a.concepts)) then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;
  update public.extraction_candidates set status = 'confirmed', decision_kind = 'auto', decided_by = null, approval_id = v_approval, decided_at = now(), inherited_from = null
  where candidate_id = p_candidate;
  return jsonb_build_object('status', 'confirmed');
end $$;
revoke execute on function public.decide_candidate(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.decide_candidate(uuid, jsonb) to service_role;

-- Candidate row lock. Requires confirmed|promoted (else not_eligible). An auto-decided candidate
-- whose approval was revoked since: a confirmed one returns to 'candidate' and the call answers
-- {outcome:'approval_revoked'} WITHOUT raising (a raise would roll the reversion back; the TS
-- adapters turn the outcome into DocumentsDbError('approval_revoked')); a promoted one only answers
-- the outcome. Otherwise, under p_pub_gen: no row → insert staged; abandoned → staged with the new
-- run_id/fact_id; staged|published → already_staged. Returns {outcome:'staged'|'approval_revoked'}.
create or replace function public.stage_candidate_publication(p_candidate uuid, p_pub_gen int, p_run uuid, p_fact_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.extraction_candidates; p public.candidate_publications;
begin
  if p_pub_gen is null or p_pub_gen < 1 or p_run is null or p_fact_id is null then raise exception 'invalid_input: publication' using errcode = '22023'; end if;
  select * into c from public.extraction_candidates where candidate_id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status not in ('confirmed','promoted') then raise exception 'not_eligible' using errcode = 'P0001'; end if;
  if c.decision_kind = 'auto' and exists (select 1 from public.extraction_approvals a where a.approval_id = c.approval_id and a.revoked_at is not null) then
    if c.status = 'confirmed' then
      update public.extraction_candidates set status = 'candidate', decision_kind = null, decided_by = null, approval_id = null, decided_at = null, inherited_from = null
      where candidate_id = p_candidate;
    end if;
    return jsonb_build_object('outcome', 'approval_revoked');
  end if;
  select * into p from public.candidate_publications where candidate_id = p_candidate and pub_gen = p_pub_gen for update;
  if not found then
    insert into public.candidate_publications (candidate_id, pub_gen, run_id, fact_id, state, created_at, updated_at)
    values (p_candidate, p_pub_gen, p_run, p_fact_id, 'staged', now(), now());
  elsif p.state = 'abandoned' then
    update public.candidate_publications set state = 'staged', run_id = p_run, fact_id = p_fact_id, updated_at = now()
    where candidate_id = p_candidate and pub_gen = p_pub_gen;
  else
    raise exception 'already_staged' using errcode = 'P0001';
  end if;
  return jsonb_build_object('outcome', 'staged');
end $$;
revoke execute on function public.stage_candidate_publication(uuid, int, uuid, uuid) from public, anon, authenticated;
grant execute on function public.stage_candidate_publication(uuid, int, uuid, uuid) to service_role;

-- ---------------------------------------------------------------- 4.8 read_documents (security invoker: RLS applies)
-- One statement, one jsonb envelope {rows, next_cursor, row_count}. Among the issuer's rows with
-- available_date <= p_as_of, the highest source_version per (source, source_ref) (every version
-- when p_all_versions), then source/doc_class/available_date window filters, ordered by
-- (available_at desc, document_id desc) after the keyset cursor {available_at, document_id};
-- 1 <= p_limit <= 1000. next_cursor names the last returned row when more rows follow.
create or replace function public.read_documents(
  p_issuer uuid, p_as_of date, p_source text, p_doc_class text, p_from date, p_to date,
  p_cursor jsonb, p_limit int, p_all_versions boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_at timestamptz; v_id uuid; v_rows jsonb; v_n int;
begin
  if p_issuer is null or p_as_of is null then raise exception 'invalid_input: issuer/as_of' using errcode = '22023'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid_input: limit' using errcode = '22023'; end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object' or p_cursor ->> 'available_at' is null or p_cursor ->> 'document_id' is null then
      raise exception 'invalid_input: cursor' using errcode = '22023';
    end if;
    v_at := (p_cursor ->> 'available_at')::timestamptz; v_id := (p_cursor ->> 'document_id')::uuid;
  end if;
  with visible as (
    select d.*, row_number() over (partition by d.source, d.source_ref order by d.source_version desc) as rn
    from public.disclosure_documents d
    where d.issuer_id = p_issuer and d.available_date <= p_as_of
  ), picked as (
    select v.* from visible v
    where (coalesce(p_all_versions, false) or v.rn = 1)
      and (p_source is null or v.source = p_source)
      and (p_doc_class is null or v.doc_class = p_doc_class)
      and (p_from is null or v.available_date >= p_from)
      and (p_to is null or v.available_date <= p_to)
      and (v_at is null or (v.available_at, v.document_id) < (v_at, v_id))
    order by v.available_at desc, v.document_id desc
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(to_jsonb(p) - 'rn' order by p.available_at desc, p.document_id desc), '[]'::jsonb), count(*)::int
  into v_rows, v_n from picked p;
  if v_n > p_limit then
    v_rows := v_rows - p_limit;   -- drop the look-ahead row (index p_limit, zero-based)
    return jsonb_build_object('rows', v_rows, 'row_count', p_limit,
      'next_cursor', jsonb_build_object('available_at', v_rows -> (p_limit - 1) -> 'available_at', 'document_id', v_rows -> (p_limit - 1) -> 'document_id'));
  end if;
  return jsonb_build_object('rows', v_rows, 'row_count', v_n, 'next_cursor', null);
end $$;
revoke execute on function public.read_documents(uuid, date, text, text, date, date, jsonb, int, boolean) from public;
grant execute on function public.read_documents(uuid, date, text, text, date, date, jsonb, int, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- service reads that need a join, a server clock or a POST body
-- security invoker (service_role reads every row); not executable by anon/authenticated.
-- status 'stored' with an empty or expired extract lease, oldest first; attempts are NOT filtered
-- (claim_document_extract_lease closes the third crash).
create or replace function public.documents_stored_due(p_limit int)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at, d.document_id), '[]'::jsonb)
  from (select * from public.disclosure_documents x
        where x.status = 'stored' and (x.extract_lease_until is null or x.extract_lease_until <= now())
        order by x.created_at, x.document_id limit greatest(coalesce(p_limit, 0), 0)) d
$$;
revoke execute on function public.documents_stored_due(int) from public, anon, authenticated;
grant execute on function public.documents_stored_due(int) to service_role;

-- candidates_status pending|failed, lease empty or expired, and the extraction is its document's
-- current one; attempts are NOT filtered (claim_candidates_lease closes the third crash).
create or replace function public.extractions_candidates_due(p_limit int)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.extraction_id), '[]'::jsonb)
  from (select x.* from public.document_extractions x
        join public.disclosure_documents d on d.document_id = x.document_id and d.current_extraction_id = x.extraction_id
        where x.candidates_status in ('pending','failed') and (x.candidates_lease_until is null or x.candidates_lease_until <= now())
        order by x.created_at, x.extraction_id limit greatest(coalesce(p_limit, 0), 0)) e
$$;
revoke execute on function public.extractions_candidates_due(int) from public, anon, authenticated;
grant execute on function public.extractions_candidates_due(int) to service_role;

-- The subset of p_refs (≤ 500 per call; a POST body, not a URL filter) already stored for this
-- issuer and source, any version.
create or replace function public.known_source_refs(p_issuer uuid, p_source text, p_refs text[])
returns text[] language sql stable security invoker set search_path = public as $$
  select coalesce(array_agg(distinct d.source_ref), '{}'::text[])
  from public.disclosure_documents d
  where d.issuer_id = p_issuer and d.source = p_source and d.source_ref = any(coalesce(p_refs, '{}'::text[]))
$$;
revoke execute on function public.known_source_refs(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.known_source_refs(uuid, text, text[]) to service_role;

-- Candidates by extraction, by status, or by issuer (+ optional status), keyset-paged on
-- (created_at, candidate_id) after p_cursor {created_at, candidate_id}. Envelope {rows, next_cursor}.
create or replace function public.list_candidates(p_extraction uuid, p_status text, p_issuer uuid, p_cursor jsonb, p_limit int)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_at timestamptz; v_id uuid; v_rows jsonb; v_n int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid_input: limit' using errcode = '22023'; end if;
  if p_extraction is null and p_status is null and p_issuer is null then raise exception 'invalid_input: where' using errcode = '22023'; end if;
  if p_cursor is not null then v_at := (p_cursor ->> 'created_at')::timestamptz; v_id := (p_cursor ->> 'candidate_id')::uuid; end if;
  with picked as (
    select c.* from public.extraction_candidates c
    where (p_extraction is null or c.extraction_id = p_extraction)
      and (p_status is null or c.status = p_status)
      and (p_issuer is null or exists (select 1 from public.disclosure_documents d where d.document_id = c.document_id and d.issuer_id = p_issuer))
      and (v_at is null or (c.created_at, c.candidate_id) > (v_at, v_id))
    order by c.created_at, c.candidate_id
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.candidate_id), '[]'::jsonb), count(*)::int into v_rows, v_n from picked p;
  if v_n > p_limit then
    v_rows := v_rows - p_limit;
    return jsonb_build_object('rows', v_rows, 'next_cursor', jsonb_build_object('created_at', v_rows -> (p_limit - 1) -> 'created_at', 'candidate_id', v_rows -> (p_limit - 1) -> 'candidate_id'));
  end if;
  return jsonb_build_object('rows', v_rows, 'next_cursor', null);
end $$;
revoke execute on function public.list_candidates(uuid, text, uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.list_candidates(uuid, text, uuid, jsonb, int) to service_role;

-- Publications by candidate ids (≤ 100), by run, or by issuer + pub_gen (+ optional state),
-- keyset-paged on (candidate_id, pub_gen) after p_cursor {candidate_id, pub_gen}.
create or replace function public.list_candidate_publications(p_candidate_ids uuid[], p_run uuid, p_issuer uuid, p_pub_gen int, p_state text, p_cursor jsonb, p_limit int)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_cid uuid; v_gen int; v_rows jsonb; v_n int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid_input: limit' using errcode = '22023'; end if;
  if p_candidate_ids is null and p_run is null and (p_issuer is null or p_pub_gen is null) then raise exception 'invalid_input: where' using errcode = '22023'; end if;
  if cardinality(p_candidate_ids) > 100 then raise exception 'invalid_input: candidate_ids' using errcode = '22023'; end if;
  if p_cursor is not null then v_cid := (p_cursor ->> 'candidate_id')::uuid; v_gen := (p_cursor ->> 'pub_gen')::int; end if;
  with picked as (
    select p.* from public.candidate_publications p
    where (p_candidate_ids is null or p.candidate_id = any(p_candidate_ids))
      and (p_run is null or p.run_id = p_run)
      and (p_issuer is null or exists (
            select 1 from public.extraction_candidates c join public.disclosure_documents d on d.document_id = c.document_id
            where c.candidate_id = p.candidate_id and d.issuer_id = p_issuer))
      and (p_pub_gen is null or p.pub_gen = p_pub_gen)
      and (p_state is null or p.state = p_state)
      and (v_cid is null or (p.candidate_id, p.pub_gen) > (v_cid, v_gen))
    order by p.candidate_id, p.pub_gen
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.candidate_id, p.pub_gen), '[]'::jsonb), count(*)::int into v_rows, v_n from picked p;
  if v_n > p_limit then
    v_rows := v_rows - p_limit;
    return jsonb_build_object('rows', v_rows, 'next_cursor', jsonb_build_object('candidate_id', v_rows -> (p_limit - 1) -> 'candidate_id', 'pub_gen', v_rows -> (p_limit - 1) -> 'pub_gen'));
  end if;
  return jsonb_build_object('rows', v_rows, 'next_cursor', null);
end $$;
revoke execute on function public.list_candidate_publications(uuid[], uuid, uuid, int, text, jsonb, int) from public, anon, authenticated;
grant execute on function public.list_candidate_publications(uuid[], uuid, uuid, int, text, jsonb, int) to service_role;

-- ---------------------------------------------------------------- 4.12 privileges and policies
do $$ declare t text; begin
  foreach t in array array['disclosure_documents','document_assets','document_extractions','document_pages','document_citations',
                           'extraction_candidates','candidate_publications','extraction_approvals','document_sync_scope'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
  foreach t in array array['disclosure_documents','document_assets','document_extractions','document_pages','document_citations'] loop
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['extraction_candidates','candidate_publications','extraction_approvals','document_sync_scope'] loop
    execute format('grant select on public.%I to service_role', t);
  end loop;
end $$;
revoke all on public.disclosure_documents_public from public, anon, authenticated, service_role;
grant select on public.disclosure_documents_public to anon, authenticated, service_role;

drop policy if exists "disclosure_documents public read" on public.disclosure_documents;
create policy "disclosure_documents public read" on public.disclosure_documents for select to anon, authenticated
  using (permission = 'public');
drop policy if exists "document_assets public read" on public.document_assets;
create policy "document_assets public read" on public.document_assets for select to anon, authenticated
  using (exists (select 1 from public.disclosure_documents d where d.document_id = document_assets.document_id and d.permission = 'public'));
drop policy if exists "document_extractions public read" on public.document_extractions;
create policy "document_extractions public read" on public.document_extractions for select to anon, authenticated
  using (exists (select 1 from public.disclosure_documents d where d.document_id = document_extractions.document_id and d.permission = 'public'));
drop policy if exists "document_pages public read" on public.document_pages;
create policy "document_pages public read" on public.document_pages for select to anon, authenticated
  using (exists (select 1 from public.document_extractions e join public.disclosure_documents d on d.document_id = e.document_id
                 where e.extraction_id = document_pages.extraction_id and d.permission = 'public'));
-- Migration one: a citation is public when its document is public and it was published
-- (visibility). Migration two replaces this policy (same name) adding the fact_citations clause.
drop policy if exists "document_citations public read" on public.document_citations;
create policy "document_citations public read" on public.document_citations for select to anon, authenticated
  using (visibility = 'public' and exists (select 1 from public.disclosure_documents d where d.document_id = document_citations.document_id and d.permission = 'public'));

-- extraction_approvals: the one direct write (§4.12) — insert, and update of revoked_at only; the
-- trigger keeps every other column and an existing revocation immutable.
grant insert on public.extraction_approvals to service_role;
grant update (revoked_at) on public.extraction_approvals to service_role;
drop policy if exists "extraction_approvals service insert" on public.extraction_approvals;
create policy "extraction_approvals service insert" on public.extraction_approvals for insert to service_role with check (true);
drop policy if exists "extraction_approvals service revoke" on public.extraction_approvals;
create policy "extraction_approvals service revoke" on public.extraction_approvals for update to service_role using (true) with check (true);

exec
/bin/zsh -lc "sed -n '320,660p' supabase/migrations/20261108090000_disclosure_documents.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4
 succeeded in 0ms:
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: document_citations rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'visibility') <> (to_jsonb(old) - 'visibility') then
    raise exception 'append_only: document_citations allows visibility changes only' using errcode = '23514';
  end if;
  if new.visibility is distinct from old.visibility
     and not (old.visibility = 'internal' and new.visibility = 'public' and old.created_by in ('human','module')) then
    raise exception 'append_only: document_citations visibility % -> % is not allowed for %', old.visibility, new.visibility, old.created_by using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.document_citations_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists document_citations_limited_update on public.document_citations;
create trigger document_citations_limited_update before update or delete on public.document_citations
  for each row execute function public.document_citations_limited_update();

-- extraction_candidates: the identity, citations, payload and snapshot never change; checks only
-- while the row is a candidate; status moves candidate→confirmed|rejected, confirmed→candidate|promoted;
-- never deleted.
create or replace function public.extraction_candidates_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['checks','checks_passed','status','decision_kind','decided_by','approval_id','decided_at','inherited_from'];
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: extraction_candidates rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: extraction_candidates allows checks and decision changes only' using errcode = '23514';
  end if;
  if old.status <> 'candidate' and (new.checks, new.checks_passed) is distinct from (old.checks, old.checks_passed) then
    raise exception 'append_only: extraction_candidates checks are frozen once decided' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in
     (('candidate','confirmed'), ('candidate','rejected'), ('confirmed','candidate'), ('confirmed','promoted'))) then
    raise exception 'append_only: extraction_candidates status % -> % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.extraction_candidates_lifecycle() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists extraction_candidates_lifecycle on public.extraction_candidates;
create trigger extraction_candidates_lifecycle before update or delete on public.extraction_candidates
  for each row execute function public.extraction_candidates_lifecycle();

-- candidate_publications: staged→published|abandoned, abandoned→staged (new run_id/fact_id);
-- run_id/fact_id change only on abandoned→staged; never deleted.
create or replace function public.candidate_publications_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: candidate_publications rows are never deleted' using errcode = '23514';
  end if;
  if (new.candidate_id, new.pub_gen, new.created_at) is distinct from (old.candidate_id, old.pub_gen, old.created_at) then
    raise exception 'append_only: candidate_publications identity is immutable' using errcode = '23514';
  end if;
  if new.state is distinct from old.state and not ((old.state, new.state) in (('staged','published'), ('staged','abandoned'), ('abandoned','staged'))) then
    raise exception 'append_only: candidate_publications state % -> % is not allowed', old.state, new.state using errcode = '23514';
  end if;
  if (new.run_id, new.fact_id) is distinct from (old.run_id, old.fact_id) and not (old.state = 'abandoned' and new.state = 'staged') then
    raise exception 'append_only: candidate_publications run/fact change only when re-staging an abandoned row' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.candidate_publications_lifecycle() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists candidate_publications_lifecycle on public.candidate_publications;
create trigger candidate_publications_lifecycle before update or delete on public.candidate_publications
  for each row execute function public.candidate_publications_lifecycle();

-- extraction_approvals: only revoked_at, once (null → timestamp); never deleted.
create or replace function public.extraction_approvals_limited_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: extraction_approvals rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'revoked_at') <> (to_jsonb(old) - 'revoked_at') then
    raise exception 'append_only: extraction_approvals allows revocation only' using errcode = '23514';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'append_only: extraction_approvals revocation is final' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.extraction_approvals_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists extraction_approvals_limited_update on public.extraction_approvals;
create trigger extraction_approvals_limited_update before update or delete on public.extraction_approvals
  for each row execute function public.extraction_approvals_limited_update();

-- ---------------------------------------------------------------- internal helpers (no client role may execute)
-- Locks the scope row and verifies the sync lease (lease_batch_id = p_batch, unexpired).
create or replace function public.doc_scope_lock(p_issuer uuid, p_source text, p_batch uuid)
returns public.document_sync_scope language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found or s.lease_batch_id is distinct from p_batch or s.lease_until is null or s.lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return s;
end $$;
revoke execute on function public.doc_scope_lock(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Locks the document row and verifies the extract lease.
create or replace function public.doc_extract_lock(p_document uuid, p_batch uuid)
returns public.disclosure_documents language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.extract_lease_batch_id is distinct from p_batch or d.extract_lease_until is null or d.extract_lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return d;
end $$;
revoke execute on function public.doc_extract_lock(uuid, uuid) from public, anon, authenticated, service_role;

-- Locks the extraction row and verifies the candidates lease.
create or replace function public.doc_candidates_lock(p_extraction uuid, p_batch uuid)
returns public.document_extractions language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.candidates_lease_batch_id is distinct from p_batch or e.candidates_lease_until is null or e.candidates_lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return e;
end $$;
revoke execute on function public.doc_candidates_lock(uuid, uuid) from public, anon, authenticated, service_role;

-- Citation ids referenced by a candidate's citations object: every top-level string value and the
-- citation_id of every object inside a top-level array (financial_fact: value/label/unit + period[]).
create or replace function public.candidate_citation_ids(p_citations jsonb)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(x), '{}'::text[]) from (
    select e.value #>> '{}' as x from jsonb_each(p_citations) e where jsonb_typeof(e.value) = 'string'
    union all
    select a ->> 'citation_id' from jsonb_each(p_citations) e cross join lateral jsonb_array_elements(e.value) a
    where jsonb_typeof(e.value) = 'array' and jsonb_typeof(a) = 'object'
  ) t
$$;
revoke execute on function public.candidate_citation_ids(jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.8 sync scope functions
-- Schedule inputs only (reasons/priority/fetch_key); never touches cursors, schedule or lease.
-- Returns the number of rows inserted or actually changed.
create or replace function public.reconcile_document_sync_scope(p_source text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_source is null or p_source not in ('edgar','cninfo','hkexnews') then raise exception 'invalid_input: source' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  insert into public.document_sync_scope (issuer_id, source, reasons, priority, fetch_key)
  select distinct on ((x ->> 'issuer_id')) (x ->> 'issuer_id')::uuid, p_source, coalesce(x -> 'reasons', '[]'::jsonb), coalesce((x ->> 'priority')::int, 0), x ->> 'fetch_key'
  from jsonb_array_elements(p_rows) x
  on conflict (issuer_id, source) do update
    set reasons = excluded.reasons, priority = excluded.priority, fetch_key = excluded.fetch_key, updated_at = now()
    where (document_sync_scope.reasons, document_sync_scope.priority, document_sync_scope.fetch_key)
          is distinct from (excluded.reasons, excluded.priority, excluded.fetch_key);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.reconcile_document_sync_scope(text, jsonb) from public, anon, authenticated;
grant execute on function public.reconcile_document_sync_scope(text, jsonb) to service_role;

-- Unleased, expired, or held by the same batch → (re)lease and true; otherwise false. No row → false.
create or replace function public.claim_document_sync_lease(p_issuer uuid, p_source text, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found then return false; end if;
  if s.lease_batch_id is null or s.lease_until is null or s.lease_until <= now() or s.lease_batch_id = p_batch then
    update public.document_sync_scope
    set lease_batch_id = p_batch, lease_until = now() + make_interval(secs => p_ttl), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.claim_document_sync_lease(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_document_sync_lease(uuid, text, uuid, int) to service_role;

-- Scope lock + sync lease. One transaction: versions of (source, source_ref) are read under a
-- per-ref advisory lock; same content_sha256 → duplicate (nothing written); else version max + 1
-- with supersedes/observed_replacement, the document and all its assets. The listed sources are
-- public: issuer/source/batch come from the arguments, permission is forced to public. A
-- source_ref already held by another issuer is refused (invalid_input).
create or replace function public.insert_document_version(p_issuer uuid, p_source text, p_batch uuid, p_doc jsonb, p_assets jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; v_prev public.disclosure_documents; v_dup uuid; v_assets jsonb := coalesce(p_assets, '[]'::jsonb);
begin
  if p_source is null or p_source not in ('edgar','cninfo','hkexnews') then raise exception 'invalid_input: source' using errcode = '22023'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'invalid_input: doc' using errcode = '22023'; end if;
  if jsonb_typeof(v_assets) <> 'array'
     or exists (select 1 from jsonb_array_elements(v_assets) a group by a ->> 'role', a ->> 'filename' having count(*) > 1) then
    raise exception 'invalid_input: assets' using errcode = '22023';
  end if;
  perform public.doc_scope_lock(p_issuer, p_source, p_batch);
  d := jsonb_populate_record(null::public.disclosure_documents, p_doc);
  if d.source_ref is null or d.content_sha256 is null then raise exception 'invalid_input: source_ref/content_sha256' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('docver:' || p_source || ':' || d.source_ref));
  if exists (select 1 from public.disclosure_documents x where x.source = p_source and x.source_ref = d.source_ref and x.issuer_id is distinct from p_issuer) then
    raise exception 'invalid_input: source_ref belongs to another issuer' using errcode = '22023';
  end if;
  select x.document_id into v_dup from public.disclosure_documents x
  where x.source = p_source and x.source_ref = d.source_ref and x.content_sha256 = d.content_sha256;
  if v_dup is not null then return jsonb_build_object('outcome', 'duplicate', 'document_id', v_dup); end if;
  select * into v_prev from public.disclosure_documents x
  where x.source = p_source and x.source_ref = d.source_ref order by x.source_version desc limit 1;
  d.document_id := gen_random_uuid();
  d.issuer_id := p_issuer; d.source := p_source; d.batch_id := p_batch;
  d.permission := 'public'; d.owner_user_id := null; d.license_ref := null;
  d.source_version := coalesce(v_prev.source_version, 0) + 1;
  d.supersedes_document_id := v_prev.document_id;
  d.observed_replacement := v_prev.document_id is not null;
  d.status := 'stored'; d.current_extraction_id := null; d.extract_lease_until := null; d.extract_lease_batch_id := null;
  d.extract_attempts := 0; d.created_at := now();
  insert into public.disclosure_documents select (d).*;
  insert into public.document_assets (asset_id, document_id, role, filename, source_url, content_sha256, bytes, mime, storage_path, acquisition, created_at)
  select gen_random_uuid(), d.document_id, a.role, a.filename, a.source_url, a.content_sha256, a.bytes, a.mime, a.storage_path, a.acquisition, now()
  from jsonb_populate_recordset(null::public.document_assets, v_assets) a;
  return jsonb_build_object('outcome', case when v_prev.document_id is null then 'inserted' else 'versioned' end, 'document_id', d.document_id);
end $$;
revoke execute on function public.insert_document_version(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.insert_document_version(uuid, text, uuid, jsonb, jsonb) to service_role;

-- Holder's advisory lock per owner. source='upload', source_ref = '<owner>/<sha256>', version 1;
-- same owner + same bytes → duplicate. permission must be licensed|private; issuer_id may be null.
create or replace function public.insert_upload_document(p_owner uuid, p_doc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; v_dup uuid;
begin
  if p_owner is null then raise exception 'invalid_input: owner' using errcode = '22023'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'invalid_input: doc' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('upload:' || p_owner::text));
  d := jsonb_populate_record(null::public.disclosure_documents, p_doc);
  if d.permission is null or d.permission not in ('licensed','private') then raise exception 'invalid_input: permission' using errcode = '22023'; end if;
  if d.content_sha256 is null then raise exception 'invalid_input: content_sha256' using errcode = '22023'; end if;
  d.source := 'upload'; d.source_ref := p_owner::text || '/' || d.content_sha256;
  select x.document_id into v_dup from public.disclosure_documents x where x.source = 'upload' and x.source_ref = d.source_ref;
  if v_dup is not null then return jsonb_build_object('outcome', 'duplicate', 'document_id', v_dup); end if;
  d.document_id := gen_random_uuid(); d.owner_user_id := p_owner; d.source_url := null;
  d.source_version := 1; d.supersedes_document_id := null; d.observed_replacement := false;
  d.status := 'stored'; d.current_extraction_id := null; d.extract_lease_until := null; d.extract_lease_batch_id := null;
  d.extract_attempts := 0; d.created_at := now();
  insert into public.disclosure_documents select (d).*;
  return jsonb_build_object('outcome', 'inserted', 'document_id', d.document_id);
end $$;
revoke execute on function public.insert_upload_document(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_upload_document(uuid, jsonb) to service_role;

-- Scope lock + sync lease. backfill → backfill_cursor/backfill_done; poll → poll_cursor (null clears).
-- Never backwards unless p_reset (an operator replay; codex plan round 1 P2-4): a finished backfill
-- (backfill_done) accepts only a repeated completion (null cursor, done) — no new backfill cursor and
-- no done → false; once the stored cursor carries seq, a new cursor must carry a strictly greater
-- seq (the sync core bumps it at every checkpoint). Refused → cursor_regression (P0001), no change.
create or replace function public.advance_document_cursor(p_issuer uuid, p_source text, p_batch uuid, p_mode text, p_cursor jsonb, p_done boolean, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope; v_old jsonb;
begin
  if p_mode is null or p_mode not in ('backfill','poll') then raise exception 'invalid_input: mode' using errcode = '22023'; end if;
  if p_cursor is not null and jsonb_typeof(p_cursor) <> 'object' then raise exception 'invalid_input: cursor' using errcode = '22023'; end if;
  if p_cursor is not null and p_cursor ? 'seq' and jsonb_typeof(p_cursor -> 'seq') <> 'number' then raise exception 'invalid_input: cursor seq' using errcode = '22023'; end if;
  s := public.doc_scope_lock(p_issuer, p_source, p_batch);
  if not coalesce(p_reset, false) then
    if p_mode = 'backfill' and s.backfill_done and not (p_cursor is null and coalesce(p_done, false)) then
      raise exception 'cursor_regression' using errcode = 'P0001', detail = 'backfill_done';
    end if;
    v_old := case when p_mode = 'backfill' then s.backfill_cursor else s.poll_cursor end;
    if p_cursor is not null and v_old ? 'seq' and jsonb_typeof(v_old -> 'seq') = 'number'
       and (not (p_cursor ? 'seq') or (p_cursor ->> 'seq')::numeric <= (v_old ->> 'seq')::numeric) then
      raise exception 'cursor_regression' using errcode = 'P0001', detail = 'seq';
    end if;
  end if;
  if p_mode = 'backfill' then
    update public.document_sync_scope set backfill_cursor = coalesce(p_cursor, '{}'::jsonb), backfill_done = coalesce(p_done, false), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
  else
    update public.document_sync_scope set poll_cursor = coalesce(p_cursor, '{}'::jsonb), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
  end if;
end $$;
revoke execute on function public.advance_document_cursor(uuid, text, uuid, text, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.advance_document_cursor(uuid, text, uuid, text, jsonb, boolean, boolean) to service_role;

-- Holder check (an expired but unclaimed lease may still be released); records the outcome.
create or replace function public.release_document_sync_lease(p_issuer uuid, p_source text, p_batch uuid, p_outcome text, p_next_due timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  if p_outcome is null or p_outcome not in ('success','failed') then raise exception 'invalid_input: outcome' using errcode = '22023'; end if;
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found or s.lease_batch_id is distinct from p_batch then raise exception 'lease_lost' using errcode = '55P03'; end if;
  update public.document_sync_scope
  set lease_until = null, lease_batch_id = null, last_attempt_at = now(),
      last_success_at = case when p_outcome = 'success' then now() else last_success_at end,
      last_status = p_outcome, next_due_at = coalesce(p_next_due, now()), updated_at = now()
  where issuer_id = p_issuer and source = p_source;
end $$;
revoke execute on function public.release_document_sync_lease(uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.release_document_sync_lease(uuid, text, uuid, text, timestamptz) to service_role;

-- Document row lock; admin authority (the route already ran requireAdminUser and writes the audit).
-- Only the classification columns named in p_patch change.
create or replace function public.reclassify_document(p_document uuid, p_patch jsonb, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; p public.disclosure_documents;
begin
  if p_actor is null then raise exception 'invalid_input: actor' using errcode = '22023'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('doc_class','classifier_gen','fiscal_year','fiscal_period','period_end','filing_source_ref')) then
    raise exception 'invalid_input: patch' using errcode = '22023';
  end if;
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  p := jsonb_populate_record(d, p_patch);
  update public.disclosure_documents
  set doc_class = p.doc_class, classifier_gen = p.classifier_gen, fiscal_year = p.fiscal_year,
      fiscal_period = p.fiscal_period, period_end = p.period_end, filing_source_ref = p.filing_source_ref
  where document_id = p_document;
end $$;
revoke execute on function public.reclassify_document(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.reclassify_document(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------- 4.8 extraction functions
-- Document row lock. Requires status 'stored' and an unleased/expired/same-batch lease. The third
-- crash is closed here: attempts >= 3 → extract_failed, lease cleared, false. Otherwise lease and
-- extract_attempts + 1 (the only counting point), true.
create or replace function public.claim_document_extract_lease(p_document uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found or d.status <> 'stored' then return false; end if;
  if not (d.extract_lease_batch_id is null or d.extract_lease_until is null or d.extract_lease_until <= now() or d.extract_lease_batch_id = p_batch) then
    return false;

exec
/bin/zsh -lc "sed -n '660,1035p' supabase/migrations/20261108090000_disclosure_documents.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4
 succeeded in 0ms:
    return false;
  end if;
  if d.extract_attempts >= 3 then
    update public.disclosure_documents set status = 'extract_failed', extract_lease_until = null, extract_lease_batch_id = null where document_id = p_document;
    return false;
  end if;
  update public.disclosure_documents
  set extract_lease_batch_id = p_batch, extract_lease_until = now() + make_interval(secs => p_ttl), extract_attempts = extract_attempts + 1
  where document_id = p_document;
  return true;
end $$;
revoke execute on function public.claim_document_extract_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_document_extract_lease(uuid, uuid, int) to service_role;

-- Document row lock. The holder (extract_lease_batch_id = p_batch — an expired lease nobody else
-- claimed is still the holder's) extends its lease without counting an attempt (codex plan round 1
-- P2-7: long extractions renew before each mutating phase); status must still be 'stored'. Another
-- batch took over, or the document moved on → false, nothing changes.
create or replace function public.renew_document_extract_lease(p_document uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found or d.status <> 'stored' or d.extract_lease_batch_id is distinct from p_batch then return false; end if;
  update public.disclosure_documents set extract_lease_until = now() + make_interval(secs => p_ttl) where document_id = p_document;
  return true;
end $$;
revoke execute on function public.renew_document_extract_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.renew_document_extract_lease(uuid, uuid, int) to service_role;

-- Document row lock + extract lease. Inserts the immutable extraction (candidates role/status
-- decided here, spec §7.3: hkexnews + HK + annual/interim + text layer → zh primary, else
-- comparison; everything else none/n/a) and every page (validated: pages 1..page_count exactly,
-- char_count = length(text) in code points, text_hash = sha256(utf8(text))); status extracted |
-- no_text_layer; current_extraction_id → the new version; lease cleared. Never deletes anything.
create or replace function public.finish_document_extract(p_document uuid, p_batch uuid, p_extraction jsonb, p_pages jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; e public.document_extractions; v_role text;
        v_n int; v_distinct int; v_min int; v_max int; v_ok boolean;
begin
  if p_extraction is null or jsonb_typeof(p_extraction) <> 'object' then raise exception 'invalid_input: extraction' using errcode = '22023'; end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then raise exception 'invalid_input: pages' using errcode = '22023'; end if;
  d := public.doc_extract_lock(p_document, p_batch);
  e := jsonb_populate_record(null::public.document_extractions, p_extraction);
  if e.extractor_version is null or e.table_algo_version is null or e.has_text_layer is null or e.page_count is null then
    raise exception 'invalid_input: extraction fields' using errcode = '22023';
  end if;
  if exists (select 1 from public.document_extractions x where x.document_id = p_document and x.extractor_version = e.extractor_version and x.table_algo_version = e.table_algo_version) then
    raise exception 'revision_exists' using errcode = 'P0001';
  end if;
  select count(*)::int, count(distinct p.page_no)::int, min(p.page_no), max(p.page_no),
         coalesce(bool_and(coalesce(p.char_count = length(p.text) and p.text_hash = encode(sha256(convert_to(p.text, 'UTF8')), 'hex'), false)), true)
  into v_n, v_distinct, v_min, v_max, v_ok
  from jsonb_populate_recordset(null::public.document_pages, p_pages) p;
  if v_n <> e.page_count or v_distinct <> v_n or (v_n > 0 and (v_min <> 1 or v_max <> v_n)) or not v_ok then
    raise exception 'invalid_input: pages do not match page_count, char_count or text_hash' using errcode = '22023';
  end if;
  v_role := case when d.source = 'hkexnews' and d.market = 'HK' and d.doc_class in ('annual_report','interim_report') and e.has_text_layer
                 then case when d.language = 'zh' then 'primary' else 'comparison' end
                 else 'none' end;
  e.extraction_id := gen_random_uuid(); e.document_id := p_document;
  e.candidates_role := v_role; e.candidates_status := case when v_role = 'none' then 'n/a' else 'pending' end;
  e.candidates_attempts := 0; e.candidates_lease_until := null; e.candidates_lease_batch_id := null;
  e.batch_id := p_batch; e.created_at := now();
  insert into public.document_extractions select (e).*;
  insert into public.document_pages (extraction_id, page_no, text, text_hash, char_count, width, height, line_count, has_tables)
  select e.extraction_id, p.page_no, p.text, p.text_hash, p.char_count, p.width, p.height, coalesce(p.line_count, 0), coalesce(p.has_tables, false)
  from jsonb_populate_recordset(null::public.document_pages, p_pages) p;
  update public.disclosure_documents
  set status = case when e.has_text_layer then 'extracted' else 'no_text_layer' end,
      current_extraction_id = e.extraction_id, extract_lease_until = null, extract_lease_batch_id = null
  where document_id = p_document;
  return e.extraction_id;
end $$;
revoke execute on function public.finish_document_extract(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_document_extract(uuid, uuid, jsonb, jsonb) to service_role;

-- Document row lock + extract lease. attempts >= 3 → extract_failed; lease cleared (no counting:
-- the attempt was counted at claim). p_code is recorded by the caller in the batch errors.
create or replace function public.fail_document_extract(p_document uuid, p_batch uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_code is null or length(p_code) = 0 then raise exception 'invalid_input: code' using errcode = '22023'; end if;
  d := public.doc_extract_lock(p_document, p_batch);
  update public.disclosure_documents
  set status = case when d.extract_attempts >= 3 then 'extract_failed' else status end,
      extract_lease_until = null, extract_lease_batch_id = null
  where document_id = p_document;
end $$;
revoke execute on function public.fail_document_extract(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_document_extract(uuid, uuid, text) to service_role;

-- Document row lock; admin authority. The caller passes the CURRENT extractor and table-algorithm
-- versions (TS constants): a version already extracted → revision_exists (versions are immutable);
-- otherwise extracted|no_text_layer|extract_failed → stored with attempts reset. Already stored →
-- no-op.
create or replace function public.request_document_extract(p_document uuid, p_actor uuid, p_extractor_version text, p_table_algo_version text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_actor is null or p_extractor_version is null or p_table_algo_version is null then raise exception 'invalid_input: actor/versions' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.document_extractions x where x.document_id = p_document and x.extractor_version = p_extractor_version and x.table_algo_version = p_table_algo_version) then
    raise exception 'revision_exists' using errcode = 'P0001';
  end if;
  if d.status <> 'stored' then
    update public.disclosure_documents set status = 'stored', extract_attempts = 0, extract_lease_until = null, extract_lease_batch_id = null
    where document_id = p_document;
  end if;
end $$;
revoke execute on function public.request_document_extract(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_document_extract(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------- 4.8 candidates scheduling
-- Extraction row lock. Requires candidates_status pending|failed and an unleased/expired/same-batch
-- lease; attempts >= 3 → exhausted, lease cleared, false (the third crash closes here); otherwise
-- lease and candidates_attempts + 1 (the only counting point), true.
create or replace function public.claim_candidates_lease(p_extraction uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found or e.candidates_status not in ('pending','failed') then return false; end if;
  if not (e.candidates_lease_batch_id is null or e.candidates_lease_until is null or e.candidates_lease_until <= now() or e.candidates_lease_batch_id = p_batch) then
    return false;
  end if;
  if e.candidates_attempts >= 3 then
    update public.document_extractions set candidates_status = 'exhausted', candidates_lease_until = null, candidates_lease_batch_id = null where extraction_id = p_extraction;
    return false;
  end if;
  update public.document_extractions
  set candidates_lease_batch_id = p_batch, candidates_lease_until = now() + make_interval(secs => p_ttl), candidates_attempts = candidates_attempts + 1
  where extraction_id = p_extraction;
  return true;
end $$;
revoke execute on function public.claim_candidates_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_candidates_lease(uuid, uuid, int) to service_role;

-- Extraction row lock. The holder extends its candidates lease without counting an attempt (P2-7);
-- candidates_status must still be pending|failed. Taken over or moved on → false.
create or replace function public.renew_candidates_lease(p_extraction uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found or e.candidates_status not in ('pending','failed') or e.candidates_lease_batch_id is distinct from p_batch then return false; end if;
  update public.document_extractions set candidates_lease_until = now() + make_interval(secs => p_ttl) where extraction_id = p_extraction;
  return true;
end $$;
revoke execute on function public.renew_candidates_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.renew_candidates_lease(uuid, uuid, int) to service_role;

-- Extraction row lock + candidates lease. pending|failed → done|failed; lease cleared.
create or replace function public.finish_candidates(p_extraction uuid, p_batch uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status is null or p_status not in ('done','failed') then raise exception 'invalid_input: status' using errcode = '22023'; end if;
  perform public.doc_candidates_lock(p_extraction, p_batch);
  update public.document_extractions set candidates_status = p_status, candidates_lease_until = null, candidates_lease_batch_id = null
  where extraction_id = p_extraction;
end $$;
revoke execute on function public.finish_candidates(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finish_candidates(uuid, uuid, text) to service_role;

-- Extraction row locks (the update takes them, extraction_id order); admin/script authority. Every
-- CURRENT extraction (= its document's current_extraction_id) with candidates_role <> 'none' and
-- status done|failed|exhausted, narrowed by p_filter {source?, issuer_id?, document_id?}, goes back
-- to pending with attempts 0. Returns the number reset.
create or replace function public.request_candidates_regen(p_filter jsonb, p_actor uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_filter jsonb := coalesce(p_filter, '{}'::jsonb);
begin
  if p_actor is null then raise exception 'invalid_input: actor' using errcode = '22023'; end if;
  if jsonb_typeof(v_filter) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_filter) k where k not in ('source','issuer_id','document_id')) then
    raise exception 'invalid_input: filter' using errcode = '22023';
  end if;
  perform 1 from public.document_extractions e
  join public.disclosure_documents d on d.document_id = e.document_id and d.current_extraction_id = e.extraction_id
  where e.candidates_role <> 'none' and e.candidates_status in ('done','failed','exhausted')
    and (v_filter ->> 'source' is null or d.source = v_filter ->> 'source')
    and (v_filter ->> 'issuer_id' is null or d.issuer_id = (v_filter ->> 'issuer_id')::uuid)
    and (v_filter ->> 'document_id' is null or d.document_id = (v_filter ->> 'document_id')::uuid)
  order by e.extraction_id
  for update of e;
  update public.document_extractions e
  set candidates_status = 'pending', candidates_attempts = 0, candidates_lease_until = null, candidates_lease_batch_id = null
  from public.disclosure_documents d
  where d.document_id = e.document_id and d.current_extraction_id = e.extraction_id
    and e.candidates_role <> 'none' and e.candidates_status in ('done','failed','exhausted')
    and (v_filter ->> 'source' is null or d.source = v_filter ->> 'source')
    and (v_filter ->> 'issuer_id' is null or d.issuer_id = (v_filter ->> 'issuer_id')::uuid)
    and (v_filter ->> 'document_id' is null or d.document_id = (v_filter ->> 'document_id')::uuid);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.request_candidates_regen(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.request_candidates_regen(jsonb, uuid) to service_role;

-- ---------------------------------------------------------------- 4.8 citations
-- No lock (pages are immutable). The page must belong to the extraction and the extraction to the
-- document; 0 <= char_start < char_end <= char_count; snippet = substr(text, char_start + 1,
-- char_end - char_start) (code points); text_hash = the page's text_hash. Else invalid_citation.
create or replace function public.insert_citation(p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.document_citations; pg public.document_pages;
begin
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'invalid_citation: row' using errcode = '22023'; end if;
  c := jsonb_populate_record(null::public.document_citations, p_row);
  select p.* into pg from public.document_pages p
  join public.document_extractions e on e.extraction_id = p.extraction_id
  where p.extraction_id = c.extraction_id and p.page_no = c.page_no and e.document_id = c.document_id;
  if not found then raise exception 'invalid_citation: page' using errcode = '22023'; end if;
  if c.char_start is null or c.char_end is null or c.char_start < 0 or c.char_end <= c.char_start or c.char_end > pg.char_count then
    raise exception 'invalid_citation: range' using errcode = '22023';
  end if;
  if c.snippet is distinct from substr(pg.text, c.char_start + 1, c.char_end - c.char_start) then
    raise exception 'invalid_citation: snippet' using errcode = '22023';
  end if;
  if c.text_hash is distinct from pg.text_hash then raise exception 'invalid_citation: text_hash' using errcode = '22023'; end if;
  if c.created_by is null or c.created_ref is null then raise exception 'invalid_citation: creator' using errcode = '22023'; end if;
  c.citation_id := gen_random_uuid(); c.visibility := 'internal'; c.created_at := now();
  insert into public.document_citations select (c).*;
  return c.citation_id;
end $$;
revoke execute on function public.insert_citation(jsonb) from public, anon, authenticated;
grant execute on function public.insert_citation(jsonb) to service_role;

-- No lock. Every id must exist, be created_by human|module and belong to a public document, else
-- not_publishable (nothing changes). internal → public; returns the number that changed.
create or replace function public.publish_citations(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_ids uuid[] := coalesce(p_ids, '{}'::uuid[]); n int;
begin
  if exists (
    select 1 from unnest(v_ids) i(id)
    where not exists (
      select 1 from public.document_citations c join public.disclosure_documents d on d.document_id = c.document_id
      where c.citation_id = i.id and c.created_by in ('human','module') and d.permission = 'public')) then
    raise exception 'not_publishable' using errcode = 'P0001';
  end if;
  update public.document_citations set visibility = 'public' where citation_id = any(v_ids) and visibility = 'internal';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.publish_citations(uuid[]) from public, anon, authenticated;
grant execute on function public.publish_citations(uuid[]) to service_role;

-- ---------------------------------------------------------------- 4.8 candidates
-- Extraction row lock + candidates lease. Every citation id of every row must be a uuid of a
-- citation of THIS extraction (and so of its document), else invalid_citation; financial_fact rows
-- need value/label/unit and a non-empty period array, every kind needs value. Rows are inserted as
-- 'candidate' with empty decision fields (no inheritance here: write_candidate_checks applies it);
-- an existing (extraction, kind, extractor_ref, natural_key) is skipped. Returns {inserted}.
create or replace function public.insert_candidates(p_extraction uuid, p_batch uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.document_extractions; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  e := public.doc_candidates_lock(p_extraction, p_batch);
  if exists (
    select 1 from jsonb_array_elements(p_rows) x
    where jsonb_typeof(x -> 'citations') is distinct from 'object'
       or jsonb_typeof(x -> 'citations' -> 'value') is distinct from 'string'
       or (x ->> 'kind' = 'financial_fact' and (
            jsonb_typeof(x -> 'citations' -> 'label') is distinct from 'string'
            or jsonb_typeof(x -> 'citations' -> 'unit') is distinct from 'string'
            or jsonb_typeof(x -> 'citations' -> 'period') is distinct from 'array'
            or jsonb_array_length(x -> 'citations' -> 'period') = 0))) then
    raise exception 'invalid_citation: shape' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) x
    cross join lateral unnest(public.candidate_citation_ids(x -> 'citations')) as cid(id)
    where cid.id is null
       or cid.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from public.document_citations c where c.citation_id = cid.id::uuid and c.extraction_id = p_extraction and c.document_id = e.document_id)) then
    raise exception 'invalid_citation: reference' using errcode = '22023';
  end if;
  insert into public.extraction_candidates (candidate_id, document_id, extraction_id, kind, extractor_kind, extractor_ref, natural_key,
                                            citations, payload, fingerprint, checks, checks_passed, status, input_snapshot, batch_id, created_at)
  select gen_random_uuid(), e.document_id, p_extraction, x ->> 'kind', x ->> 'extractor_kind', x ->> 'extractor_ref', x ->> 'natural_key',
         x -> 'citations', x -> 'payload', x ->> 'fingerprint', '[]'::jsonb, false, 'candidate', x -> 'input_snapshot', p_batch, now()
  from jsonb_array_elements(p_rows) x
  on conflict on constraint extraction_candidates_key_uniq do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n);
end $$;
revoke execute on function public.insert_candidates(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_candidates(uuid, uuid, jsonb) to service_role;

-- Extraction row lock + candidates lease + each named candidate row FOR UPDATE (candidate_id order).
-- The only writer of checks: every row must be a 'candidate' of this extraction (else decided /
-- not_found). checks/checks_passed are persisted first; then, for rows that passed, a HUMAN decision
-- (confirmed|promoted) of the same document with the same fingerprint is inherited atomically:
-- confirmed, decision_kind human, decided_by of the source, decided_at now(), inherited_from.
-- Auto decisions are never inherited. Returns {written, inherited}.
create or replace function public.write_candidate_checks(p_extraction uuid, p_batch uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.document_extractions; x record; c public.extraction_candidates; src public.extraction_candidates;
        v_written int := 0; v_inherited int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  e := public.doc_candidates_lock(p_extraction, p_batch);
  for x in
    select (r ->> 'candidate_id')::uuid as candidate_id, r -> 'checks' as checks, (r ->> 'checks_passed')::boolean as checks_passed
    from jsonb_array_elements(p_rows) r order by (r ->> 'candidate_id')::uuid
  loop
    if jsonb_typeof(x.checks) is distinct from 'array' or x.checks_passed is null then raise exception 'invalid_input: checks' using errcode = '22023'; end if;
    select * into c from public.extraction_candidates where candidate_id = x.candidate_id and extraction_id = p_extraction for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if c.status <> 'candidate' then raise exception 'decided' using errcode = 'P0001'; end if;
    update public.extraction_candidates set checks = x.checks, checks_passed = x.checks_passed where candidate_id = c.candidate_id;
    v_written := v_written + 1;
    if x.checks_passed then
      select s.* into src from public.extraction_candidates s
      where s.document_id = c.document_id and s.fingerprint = c.fingerprint and s.candidate_id <> c.candidate_id
        and s.decision_kind = 'human' and s.status in ('confirmed','promoted')
      order by s.decided_at desc, s.candidate_id limit 1;
      if found then
        update public.extraction_candidates
        set status = 'confirmed', decision_kind = 'human', decided_by = src.decided_by, approval_id = null,
            decided_at = now(), inherited_from = src.candidate_id
        where candidate_id = c.candidate_id;
        v_inherited := v_inherited + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('written', v_written, 'inherited', v_inherited);
end $$;
revoke execute on function public.write_candidate_checks(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.write_candidate_checks(uuid, uuid, jsonb) to service_role;

-- Candidate row lock. Human: candidate→confirmed (requires checks_passed, else not_eligible),
-- candidate→rejected, confirmed→candidate (requires no candidate_publications row, else
-- not_eligible); the same status again is a no-op; any other transition → decided.
-- Auto: requires a rule candidate with checks_passed, an unrevoked approval (revoked →
-- approval_revoked) whose extractor_ref equals the candidate's, whose three versions equal the
-- candidate's document_extractions row, and whose concepts contain payload.concept → confirmed; a
-- row already confirmed by the same approval is a no-op; anything else → not_eligible.
-- Returns {status}.
create or replace function public.decide_candidate(p_candidate uuid, p_decision jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.extraction_candidates; e public.document_extractions; a public.extraction_approvals;
        v_kind text := p_decision ->> 'kind'; v_target text := p_decision ->> 'status'; v_by uuid; v_approval uuid;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' or v_kind is null or v_kind not in ('human','auto') then
    raise exception 'invalid_input: decision' using errcode = '22023';
  end if;
  select * into c from public.extraction_candidates where candidate_id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_kind = 'human' then
    v_by := (p_decision ->> 'decided_by')::uuid;
    if v_by is null or v_target is null or v_target not in ('confirmed','rejected','candidate') then raise exception 'invalid_input: human decision' using errcode = '22023'; end if;
    if c.status = v_target then return jsonb_build_object('status', c.status); end if;
    if c.status = 'candidate' and v_target = 'confirmed' then
      if not c.checks_passed then raise exception 'not_eligible' using errcode = 'P0001'; end if;
      update public.extraction_candidates set status = 'confirmed', decision_kind = 'human', decided_by = v_by, approval_id = null, decided_at = now(), inherited_from = null
      where candidate_id = p_candidate;
    elsif c.status = 'candidate' and v_target = 'rejected' then
      update public.extraction_candidates set status = 'rejected', decision_kind = 'human', decided_by = v_by, approval_id = null, decided_at = now(), inherited_from = null
      where candidate_id = p_candidate;
    elsif c.status = 'confirmed' and v_target = 'candidate' then
      if exists (select 1 from public.candidate_publications p where p.candidate_id = p_candidate) then raise exception 'not_eligible' using errcode = 'P0001'; end if;
      update public.extraction_candidates set status = 'candidate', decision_kind = null, decided_by = null, approval_id = null, decided_at = null, inherited_from = null
      where candidate_id = p_candidate;
    else
      raise exception 'decided' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', v_target);
  end if;

exec
/bin/zsh -lc "git show c78fd42 -- src/lib/supabase/database.types.ts; nl -ba supabase/migrations/20261108090000_disclosure_documents.sql | sed -n '1040,1060p'; rg -n 'period.*role|statement_title|column_header|concepts|payload.concept' docs/superpowers/specs/*document* | head -30; find . -name AGENTS.md -o -name AGENTS.override.md; ls -a /Users/osborn/.codex | grep config" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4
 succeeded in 80ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-O24efEgB' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Hju0C49t' (errno=Operation not permitted)
commit c78fd42046d9495a93adeacf7648863edb2bc5ac
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:29:02 2026 -0800

    feat(documents): migration one — document library tables, view, bucket, lease/version/candidate functions, triggers, privileges; UTF8 test harness
    
    research-checks criticalSuites and local-db initdb edits are separate F3-marked blocks.
    
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

diff --git a/src/lib/supabase/database.types.ts b/src/lib/supabase/database.types.ts
index d8a31b1..1346d38 100644
--- a/src/lib/supabase/database.types.ts
+++ b/src/lib/supabase/database.types.ts
@@ -11,6 +11,7 @@
 // + migrations up to 20261105091000_issuers.sql (issuers, issuer_securities, issuer_identifier_claims,
 //   industry_classifications, issuer_industry_memberships; research_entity_* link columns are not typed here)
 // + 20261106090000_financial_facts.sql (fact_sync_runs, filings, financial_facts, financial_metrics, fact_sync_scope)
+// + 20261108090000_disclosure_documents.sql (F3: disclosure_documents and its eight child/scheduling tables)
 // Regenerate with: npm run supabase:types (after supabase link)
 
 export type Market = 'A' | 'HK' | 'US' | 'JP' | 'KR' | 'TW';
@@ -679,6 +680,172 @@ export interface FactSyncScope {
   updated_at: string;
 }
 
+// F3 document pipeline — 20261108090000_disclosure_documents.sql. Hand-maintained like the blocks
+// above; RPCs are not registered (supabaseDocumentsDb narrows the client locally). bigint (bytes)
+// and numeric (width, height, precision, recall) arrive as JSON numbers from PostgREST: readers go
+// through the src/lib/documents/db.ts normalisers.
+export interface DisclosureDocument {
+  document_id: string;
+  issuer_id: string | null;
+  source: 'edgar' | 'cninfo' | 'hkexnews' | 'upload';
+  market: 'US' | 'CN' | 'HK' | 'other';
+  source_ref: string;
+  source_version: number;
+  supersedes_document_id: string | null;
+  observed_replacement: boolean;
+  form_type: string | null;
+  doc_class: 'annual_report' | 'interim_report' | 'quarterly_report' | 'results_announcement' | 'current_report' | 'registration' | 'proxy' | 'ownership' | 'other';
+  classifier_gen: number;
+  title: string;
+  language: 'zh' | 'en' | null;
+  source_url: string | null;
+  content_sha256: string;
+  bytes: number;
+  mime: 'application/pdf' | 'text/html' | 'application/xhtml+xml' | 'application/xml' | 'text/xml' | 'application/json';
+  storage_path: string;
+  acquisition: Record<string, unknown>;
+  published_at: string;
+  published_at_precision: 'instant' | 'date';
+  available_at: string;
+  available_date: string;
+  fiscal_year: number | null;
+  fiscal_period: 'FY' | 'H1' | 'Q1' | 'Q3' | null;
+  period_end: string | null;
+  filing_source_ref: string | null;
+  permission: 'public' | 'licensed' | 'private';
+  owner_user_id: string | null;
+  license_ref: string | null;
+  status: 'stored' | 'extracted' | 'no_text_layer' | 'extract_failed';
+  current_extraction_id: string | null;
+  extract_lease_until: string | null;
+  extract_lease_batch_id: string | null;
+  extract_attempts: number;
+  batch_id: string;
+  code_version: string;
+  created_at: string;
+}
+export interface DocumentAsset {
+  asset_id: string;
+  document_id: string;
+  role: 'filing_index' | 'xbrl_instance' | 'exhibit';
+  filename: string;
+  source_url: string;
+  content_sha256: string;
+  bytes: number;
+  mime: string;
+  storage_path: string;
+  acquisition: Record<string, unknown>;
+  created_at: string;
+}
+export interface DocumentExtraction {
+  extraction_id: string;
+  document_id: string;
+  extractor_version: string;
+  table_algo_version: string;
+  code_version: string;
+  has_text_layer: boolean;
+  page_count: number;
+  pages_json_path: string;
+  pages_json_sha256: string;
+  candidates_role: 'none' | 'primary' | 'comparison';
+  candidates_status: 'n/a' | 'pending' | 'done' | 'failed' | 'exhausted';
+  candidates_attempts: number;
+  candidates_lease_until: string | null;
+  candidates_lease_batch_id: string | null;
+  batch_id: string;
+  created_at: string;
+}
+export interface DocumentPage {
+  extraction_id: string;
+  page_no: number;
+  text: string;
+  text_hash: string;
+  char_count: number;
+  width: number | null;
+  height: number | null;
+  line_count: number;
+  has_tables: boolean;
+}
+export interface DocumentCitation {
+  citation_id: string;
+  document_id: string;
+  extraction_id: string;
+  page_no: number;
+  char_start: number;
+  char_end: number;
+  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
+  snippet: string;
+  text_hash: string;
+  visibility: 'internal' | 'public';
+  created_by: 'extractor' | 'human' | 'llm' | 'module';
+  created_ref: string;
+  created_at: string;
+}
+export interface ExtractionApproval {
+  approval_id: string;
+  extractor_ref: string;
+  extractor_version: string;
+  table_algo_version: string;
+  code_version: string;
+  concepts: string[];
+  gold_sha256: string;
+  precision: number;
+  recall: number;
+  report_path: string;
+  approved_by: string;
+  approved_at: string;
+  revoked_at: string | null;
+}
+export interface ExtractionCandidate {
+  candidate_id: string;
+  document_id: string;
+  extraction_id: string;
+  kind: 'financial_fact' | 'table_cell' | 'field';
+  extractor_kind: 'rule' | 'llm';
+  extractor_ref: string;
+  natural_key: string;
+  citations: Record<string, unknown>;
+  payload: Record<string, unknown>;
+  fingerprint: string;
+  checks: Array<{ check: string; blocking: boolean; passed: boolean | null; detail?: Record<string, unknown> }>;
+  checks_passed: boolean;
+  status: 'candidate' | 'confirmed' | 'rejected' | 'promoted';
+  decision_kind: 'human' | 'auto' | null;
+  decided_by: string | null;
+  approval_id: string | null;
+  decided_at: string | null;
+  inherited_from: string | null;
+  input_snapshot: Record<string, unknown>;
+  batch_id: string;
+  created_at: string;
+}
+export interface CandidatePublication {
+  candidate_id: string;
+  pub_gen: number;
+  run_id: string;
+  fact_id: string;
+  state: 'staged' | 'published' | 'abandoned';
+  created_at: string;
+  updated_at: string;
+}
+export interface DocumentSyncScope {
+  issuer_id: string;
+  source: 'edgar' | 'cninfo' | 'hkexnews';
+  reasons: string[];
+  priority: number;
+  fetch_key: string;
+  backfill_cursor: Record<string, unknown>;
+  backfill_done: boolean;
+  poll_cursor: Record<string, unknown>;
+  next_due_at: string;
+  lease_until: string | null;
+  lease_batch_id: string | null;
+  last_attempt_at: string | null;
+  last_success_at: string | null;
+  last_status: 'success' | 'failed' | null;
+  updated_at: string;
+}
+// F3 document pipeline — end
 // Issuers (supabase/migrations/20261105091000_issuers.sql). issuers, issuer_securities,
 // industry_classifications and issuer_industry_memberships are public read; claims are service-role only.
 export type IssuerStatus = 'active' | 'merged' | 'dissolved';
@@ -797,6 +964,17 @@ export type Database = {
       financial_facts: { Row: FinancialFact; Insert: Partial<FinancialFact>; Update: Partial<FinancialFact> };
       financial_metrics: { Row: FinancialMetric; Insert: Partial<FinancialMetric>; Update: Partial<FinancialMetric> };
       fact_sync_scope: { Row: FactSyncScope; Insert: Partial<FactSyncScope>; Update: Partial<FactSyncScope> };
+      // F3 document pipeline
+      disclosure_documents: { Row: DisclosureDocument; Insert: Partial<DisclosureDocument>; Update: Partial<DisclosureDocument> };
+      document_assets: { Row: DocumentAsset; Insert: Partial<DocumentAsset>; Update: Partial<DocumentAsset> };
+      document_extractions: { Row: DocumentExtraction; Insert: Partial<DocumentExtraction>; Update: Partial<DocumentExtraction> };
+      document_pages: { Row: DocumentPage; Insert: Partial<DocumentPage>; Update: Partial<DocumentPage> };
+      document_citations: { Row: DocumentCitation; Insert: Partial<DocumentCitation>; Update: Partial<DocumentCitation> };
+      extraction_approvals: { Row: ExtractionApproval; Insert: Partial<ExtractionApproval>; Update: Partial<ExtractionApproval> };
+      extraction_candidates: { Row: ExtractionCandidate; Insert: Partial<ExtractionCandidate>; Update: Partial<ExtractionCandidate> };
+      candidate_publications: { Row: CandidatePublication; Insert: Partial<CandidatePublication>; Update: Partial<CandidatePublication> };
+      document_sync_scope: { Row: DocumentSyncScope; Insert: Partial<DocumentSyncScope>; Update: Partial<DocumentSyncScope> };
+      // F3 document pipeline — end
     };
     Functions: {
       quote_alert_window_samples: {
  1040	  select * into a from public.extraction_approvals where approval_id = v_approval;
  1041	  if not found then raise exception 'not_eligible' using errcode = 'P0001'; end if;
  1042	  if a.revoked_at is not null then raise exception 'approval_revoked' using errcode = 'P0001'; end if;
  1043	  select * into e from public.document_extractions where extraction_id = c.extraction_id;
  1044	  if a.extractor_ref <> c.extractor_ref or a.extractor_version <> e.extractor_version or a.table_algo_version <> e.table_algo_version
  1045	     or a.code_version <> e.code_version or not ((c.payload ->> 'concept') = any(a.concepts)) then
  1046	    raise exception 'not_eligible' using errcode = 'P0001';
  1047	  end if;
  1048	  update public.extraction_candidates set status = 'confirmed', decision_kind = 'auto', decided_by = null, approval_id = v_approval, decided_at = now(), inherited_from = null
  1049	  where candidate_id = p_candidate;
  1050	  return jsonb_build_object('status', 'confirmed');
  1051	end $$;
  1052	revoke execute on function public.decide_candidate(uuid, jsonb) from public, anon, authenticated;
  1053	grant execute on function public.decide_candidate(uuid, jsonb) to service_role;
  1054	
  1055	-- Candidate row lock. Requires confirmed|promoted (else not_eligible). An auto-decided candidate
  1056	-- whose approval was revoked since: a confirmed one returns to 'candidate' and the call answers
  1057	-- {outcome:'approval_revoked'} WITHOUT raising (a raise would roll the reversion back; the TS
  1058	-- adapters turn the outcome into DocumentsDbError('approval_revoked')); a promoted one only answers
  1059	-- the outcome. Otherwise, under p_pub_gen: no row → insert staged; abandoned → staged with the new
  1060	-- run_id/fact_id; staged|published → already_staged. Returns {outcome:'staged'|'approval_revoked'}.
270:    -- financial_fact: {value: id, label: id, unit: id, period: [{role:'statement_title'|'column_header', citation_id}]}（§7.5）；field/table_cell 至少含 value
318:  concepts         text[] not null
374:| `decide_candidate(p_candidate, p_decision jsonb)` → jsonb | 候选行 `for update` | `{kind:'human', decided_by, status:'confirmed'|'rejected'|'candidate'}`：`candidate→confirmed` 要求 `checks_passed`（否则 `raise 'not_eligible'`）；`candidate→rejected`；`confirmed→candidate` 要求无 `candidate_publications` 行；`{kind:'auto', approval_id}`：要求 `status='candidate' and extractor_kind='rule' and checks_passed`、审批行未撤销、`approval.extractor_ref = candidate.extractor_ref`，且 `approval.extractor_version/table_algo_version/code_version` 与候选所属 **`document_extractions` 行**（经 `extraction_id` 连接）的三列完全相等、`payload->>'concept' = any(concepts)` → `confirmed` |
607:   - **期间证据**：每个候选的 `citations.period` 数组含报表标题行引用（`statement_title`）与所选列头引用（`column_header`，主列也记录）；比较列的证据因此指向它自己的列头。
647:| `period_known` | 是 | `period_end` 已解析；duration 表 `period_start` 非空且天数落在规格二的 `6M`/`12M` 区间；instant 表 `period_start` 为空；`citations.period` 含 `statement_title` 与 `column_header` 各至少一条 | 不可晋升 |
728:| `GET /api/citations?factId=<uuid>` | `factId`（必填，恰好一个） | （R5-4）`{factId, concept, periodStart, periodEnd, unit, valueText, citations:[{role, citationId, documentId, extractionId, pageNo}]}`；只对 `status='ok'` 且其 filing `mapping_gen > 0` 的事实返回（旧代 `ok` 行可经 id 取回）；引用按 §4.12 可见性过滤；不存在或不可见 → 404；`/api/facts` 的 `.HK` 支持是对规格二的接口请求（§16） |
734:| `POST /api/admin/documents/approvals` | body `{extractorRef, extractorVersion, tableAlgoVersion, codeVersion, concepts, goldSha256, precision, recall, reportPath}` | 写 `extraction_approvals`（`ea_threshold` 把 < 0.95 拒绝 → 422）；审计 |
816:`scripts/documents/eval-hk-facts.ts --gold …` 输出 `{extractor_ref, extractor_version, table_algo_version, code_version, gold_sha256, concepts, precision, recall, mismatches[]}`；精确率 = `checks_passed` 候选中与黄金一致的比例；召回 = 黄金非缺失条目中被 `checks_passed` 候选覆盖的比例；缺失条目：有候选 → 精确率分母加 1 且不一致。结果写审计目录；审批引用该文件哈希，`precision` 与 `recall` 都 ≥ 0.95（总纲 §3.5）才能写入。
config.toml

exec
/bin/zsh -lc "grep -n 'project_doc\\|fallback' /Users/osborn/.codex/config.toml; nl -ba supabase/migrations/20261108090000_disclosure_documents.sql | sed -n '451,466p;923,945p'; cat docs/audits/2026-11-06-document-pipeline/implementation-log.md | tail -15" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4
 succeeded in 0ms:
   451	
   452	-- Citation ids referenced by a candidate's citations object: every top-level string value and the
   453	-- citation_id of every object inside a top-level array (financial_fact: value/label/unit + period[]).
   454	create or replace function public.candidate_citation_ids(p_citations jsonb)
   455	returns text[] language sql immutable set search_path = public as $$
   456	  select coalesce(array_agg(x), '{}'::text[]) from (
   457	    select e.value #>> '{}' as x from jsonb_each(p_citations) e where jsonb_typeof(e.value) = 'string'
   458	    union all
   459	    select a ->> 'citation_id' from jsonb_each(p_citations) e cross join lateral jsonb_array_elements(e.value) a
   460	    where jsonb_typeof(e.value) = 'array' and jsonb_typeof(a) = 'object'
   461	  ) t
   462	$$;
   463	revoke execute on function public.candidate_citation_ids(jsonb) from public, anon, authenticated, service_role;
   464	
   465	-- ---------------------------------------------------------------- 4.8 sync scope functions
   466	-- Schedule inputs only (reasons/priority/fetch_key); never touches cursors, schedule or lease.
   923	  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
   924	  e := public.doc_candidates_lock(p_extraction, p_batch);
   925	  if exists (
   926	    select 1 from jsonb_array_elements(p_rows) x
   927	    where jsonb_typeof(x -> 'citations') is distinct from 'object'
   928	       or jsonb_typeof(x -> 'citations' -> 'value') is distinct from 'string'
   929	       or (x ->> 'kind' = 'financial_fact' and (
   930	            jsonb_typeof(x -> 'citations' -> 'label') is distinct from 'string'
   931	            or jsonb_typeof(x -> 'citations' -> 'unit') is distinct from 'string'
   932	            or jsonb_typeof(x -> 'citations' -> 'period') is distinct from 'array'
   933	            or jsonb_array_length(x -> 'citations' -> 'period') = 0))) then
   934	    raise exception 'invalid_citation: shape' using errcode = '22023';
   935	  end if;
   936	  if exists (
   937	    select 1 from jsonb_array_elements(p_rows) x
   938	    cross join lateral unnest(public.candidate_citation_ids(x -> 'citations')) as cid(id)
   939	    where cid.id is null
   940	       or cid.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   941	       or not exists (select 1 from public.document_citations c where c.citation_id = cid.id::uuid and c.extraction_id = p_extraction and c.document_id = e.document_id)) then
   942	    raise exception 'invalid_citation: reference' using errcode = '22023';
   943	  end if;
   944	  insert into public.extraction_candidates (candidate_id, document_id, extraction_id, kind, extractor_kind, extractor_ref, natural_key,
   945	                                            citations, payload, fingerprint, checks, checks_passed, status, input_snapshot, batch_id, created_at)
# F3 implementation log
- Task 1：迁移一（九表、视图、桶、函数、触发器、权限）+ 集成测试 13 个 + database.types F3 块 + UTF8 harness；Codex 审计：待审（2026-11-06）

codex
The migration contains validation gaps that allow unapproved concepts to receive automatic confirmation and malformed period evidence to be persisted. These should be addressed with explicit null-safe checks and regression coverage.

Full review comments:

- [P2] Reject null results when checking approved concepts — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/supabase/migrations/20261108090000_disclosure_documents.sql:1044-1046
  When a candidate's payload omits `concept` or sets it to null, the membership expression evaluates to NULL. With matching versions, the entire IF condition is NULL, so the candidate is automatically confirmed despite not belonging to the approval's concepts. An approval array containing a null element similarly permits unmatched concepts. Require the membership expression to be explicitly TRUE and add regression tests for these cases.

- [P2] Validate every period citation array element — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/supabase/migrations/20261108090000_disclosure_documents.sql:929-933
  A financial-fact candidate with valid value/label/unit citations but `period: [null]` or `period: ["invalid-id"]` passes this shape check. `candidate_citation_ids` then silently excludes non-object array elements, so the subsequent reference validation also succeeds and persists a candidate without valid period evidence. Reject non-object period elements and require each element's citation ID to pass reference validation rather than filtering malformed elements out.
The migration contains validation gaps that allow unapproved concepts to receive automatic confirmation and malformed period evidence to be persisted. These should be addressed with explicit null-safe checks and regression coverage.

Full review comments:

- [P2] Reject null results when checking approved concepts — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/supabase/migrations/20261108090000_disclosure_documents.sql:1044-1046
  When a candidate's payload omits `concept` or sets it to null, the membership expression evaluates to NULL. With matching versions, the entire IF condition is NULL, so the candidate is automatically confirmed despite not belonging to the approval's concepts. An approval array containing a null element similarly permits unmatched concepts. Require the membership expression to be explicitly TRUE and add regression tests for these cases.

- [P2] Validate every period citation array element — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/supabase/migrations/20261108090000_disclosure_documents.sql:929-933
  A financial-fact candidate with valid value/label/unit citations but `period: [null]` or `period: ["invalid-id"]` passes this shape check. `candidate_citation_ids` then silently excludes non-object array elements, so the subsequent reference validation also succeeds and persists a candidate without valid period evidence. Reject non-object period elements and require each element's citation ID to pass reference validation rather than filtering malformed elements out.
