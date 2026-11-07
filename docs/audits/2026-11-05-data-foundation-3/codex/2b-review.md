OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1aea5-fcd5-7070-8616-51b43662ac6e
--------
user
commit 6488aca
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 6488aca; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 568ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-xtJ8cPPT' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LWWGFthF' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-b4hFZOkR' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Yhb4q9rT' (errno=Operation not permitted)
6488aca feat(entities): claim/1 claims, provenance whitelist and window-method columns in attachSecurity; migrate callers
 src/lib/db/memory-table-client.ts                  |  52 +++++-
 src/lib/db/pg-table-client.ts                      |   8 +-
 src/lib/db/table-client.test.ts                    |  46 ++++-
 src/lib/db/table-client.ts                         |  17 ++
 src/lib/entities/claims.test.ts                    | 154 +++++++++++++++++
 src/lib/entities/claims.ts                         | 186 +++++++++++++++++++--
 src/lib/entities/issuers-write.integration.test.ts |  35 +++-
 src/lib/entities/issuers.test.ts                   |  96 ++++++++---
 src/lib/entities/issuers.ts                        |  34 ++--
 src/lib/entities/link-research.test.ts             |  11 +-
 src/lib/entities/link-research.ts                  |  15 +-
 src/lib/entities/load-sec.test.ts                  |   8 +-
 src/lib/entities/load-sec.ts                       |   5 +-
 src/lib/entities/provenance.test.ts                |  43 +++++
 src/lib/entities/provenance.ts                     |  54 ++++++
 src/lib/entities/securities.ts                     |  75 +++++++--
 src/lib/entities/types.ts                          |  31 +++-
 17 files changed, 776 insertions(+), 94 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -25; git show 6488aca -- '"'src/lib/**/*.ts' ':"'!*test*'"' " in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>.
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xCwEv3Ir' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-UbtRjH98' (errno=Operation not permitted)
commit 6488aca77885106d5aeffbebfb876ad1eb0be24a
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 18:17:40 2026 -0800

    feat(entities): claim/1 claims, provenance whitelist and window-method columns in attachSecurity; migrate callers
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index f7c0743..8c353d3 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -8,6 +8,7 @@
 //  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
 //    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
 //    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
+//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier); one synchronous JS turn stands for the row lock.
 import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
 import type {RangeOptions,Row,TableClient} from './table-client';
 
@@ -28,7 +29,51 @@ const inRange=(row:Row,opts:RangeOptions)=>
  Object.entries(opts.gte??{}).every(([k,v])=>row[k]!=null&&cmp(row[k],v)>=0)&&
  Object.entries(opts.lt??{}).every(([k,v])=>row[k]!=null&&cmp(row[k],v)<0);
 
-export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{rows(table:string):Row[]}{
+// Plan 3 row-locking functions (migration 20261107090000, Task 1b) with the SQL functions' answers
+// and error codes; an unknown function fails like PostgreSQL (42883).
+const isObj=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
+const sameEvidence=(a:unknown,b:Row)=>isObj(a)&&a.source===b.source&&a.evidence_sha256===b.evidence_sha256;
+const SHA256=/^[0-9a-f]{64}$/;
+const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
+ append_claim_evidence(rowsOf,a){
+  const e=a.p_evidence;
+  if(!isObj(e)||typeof e.source!=='string'||e.source.length<1||e.source.length>64||typeof e.as_of!=='string'||typeof e.evidence_sha256!=='string'||!SHA256.test(e.evidence_sha256))
+   throw new TableError('rpc','append_claim_evidence','invalid_evidence','22023');
+  const row=rowsOf('issuer_identifier_claims').find(r=>r.status==='pending'&&r.issuer_id===a.p_issuer&&r.id_type===a.p_id_type&&r.value===a.p_value&&r.op===a.p_op&&r.target_key===a.p_target_key);
+  if(!row)return 'not_found';
+  const d=isObj(row.detail)?row.detail:{};
+  const sources=Array.isArray(d.sources)?d.sources:[];
+  if(sameEvidence(d.evidence,e)||sources.some(s=>sameEvidence(s,e)))return 'duplicate';
+  row.detail={...d,sources:[...sources,clone(e)]};
+  return 'appended';
+ },
+ patch_quarantine_detail(rowsOf,a){
+  const key=a.p_key;
+  if(key!=='hook'&&key!=='audit_written')throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
+  if(a.p_value===null||a.p_value===undefined)throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
+  const row=rowsOf('dq_quarantine').find(r=>r.id===a.p_id);
+  if(!row)return false;
+  row.detail={...(isObj(row.detail)?row.detail:{}),[key]:clone(a.p_value)};
+  return true;
+ },
+ // plan audit round 3, R2: guarded ISIN/FIGI write + one provenance key merged (never replaced) in one step
+ set_security_identifier(rowsOf,a){
+  const col=a.p_column,v=a.p_value,pv=a.p_provenance;
+  if((col!=='isin'&&col!=='figi')||typeof v!=='string'||v===''||!isObj(pv)||Object.keys(pv).length!==1||!(col in pv))
+   throw new TableError('rpc','set_security_identifier','invalid_identifier_write','22023');
+  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from&&r.valid_to==null);
+  if(!row)return 'not_found';
+  const prov=isObj(row.provenance)?row.provenance:{};
+  const cur=row[col]==null?null:String(row[col]);
+  if(cur!==null&&cur!==v)return 'conflict';
+  if(cur===v&&col in prov)return 'duplicate';
+  row.provenance={...prov,...clone(pv)};
+  if(cur===null){row[col]=v;return 'written';}
+  return 'duplicate';
+ },
+};
+
+export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{rows(table:string):Row[];rpc(fn:string,args:Row):Promise<unknown>}{
  const tables=new Map<string,Row[]>();
  const rowsOf=(t:string)=>{if(!tables.has(t))tables.set(t,[]);return tables.get(t)!;};
  const keyOf=(t:string,row:Row)=>(keys[t]??[]).map(k=>String(row[k])).join('\u0000');
@@ -73,5 +118,10 @@ export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{
    if(clashes(t,{...hit,...row},hit))throw dup('upsert',t);
    if(hit)Object.assign(hit,clone(row));else rows.push(clone(row));
   },
+  async rpc(fn,args){
+   const impl=MEMORY_RPC[fn];
+   if(!impl)throw new TableError('rpc',fn,`function public.${fn} does not exist`,'42883');
+   return clone(impl(rowsOf,clone(args)));
+  },
  };
 }
diff --git a/src/lib/db/pg-table-client.ts b/src/lib/db/pg-table-client.ts
index 2a9747b..bef007b 100644
--- a/src/lib/db/pg-table-client.ts
+++ b/src/lib/db/pg-table-client.ts
@@ -2,7 +2,8 @@
 // against the real schema (constraints, triggers, exclusion indexes). Production uses the Supabase
 // adapter (supabaseTableClient in table-client.ts); nothing in src/app or src/lib imports this.
 // Semantics mirror the Supabase adapter: null match values use `is null`, update returns the
-// matched row count, select/count honour gte/lt ranges and orderBy/desc/limit/offset.
+// matched row count, select/count honour gte/lt ranges and orderBy/desc/limit/offset; rpc calls
+// public.<fn> with named arguments (objects / arrays / booleans as jsonb).
 // date/timestamp/timestamptz values come back as the server's text (not JS Date) so they compare
 // and round-trip exactly like the strings PostgREST returns. Plain objects and arrays are sent as
 // JSON (jsonb columns); PostgreSQL array columns are not supported.
@@ -96,5 +97,10 @@ export function pgTableClient(pool:Pool,schema='public'):TableClient{
    const res=await run('count',table,`select count(*)::int as n from ${rel(table)}${whereSql(match,opts,values)}`,values);
    return Number(res.rows[0].n);
   },
+  async rpc(fn,args){
+   const names=Object.keys(args);
+   const text=`select ${ident(schema)}.${ident(fn)}(${names.map((k,i)=>`${ident(k)} => $${i+1}`).join(', ')}) as result`;
+   return (await run('rpc',fn,text,names.map(k=>param(args[k])))).rows[0]?.result;
+  },
  };
 }
diff --git a/src/lib/db/table-client.ts b/src/lib/db/table-client.ts
index 5016cc4..49796dc 100644
--- a/src/lib/db/table-client.ts
+++ b/src/lib/db/table-client.ts
@@ -33,6 +33,18 @@ export interface TableClient{
  select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
  upsert(table:string,row:Row,onConflict:string):Promise<void>;
  count(table:string,match:Row,opts?:RangeOptions):Promise<number>;
+ /**
+  * Calls a service-role SQL function and returns its result (plan 3: the row-locking jsonb patches
+  * append_claim_evidence / patch_quarantine_detail of migration 20261107090000). Optional so the landed
+  * test stubs stay valid; callers go through callRpc, which fails loudly when it is missing.
+  */
+ rpc?(fn:string,args:Row):Promise<unknown>;
+}
+
+/** Calls `fn` through client.rpc. A client without rpc is a wiring error (rpc_unavailable:<fn>), never a silent no-op. */
+export async function callRpc(client:TableClient,fn:string,args:Row):Promise<unknown>{
+ if(!client.rpc)throw new Error(`rpc_unavailable:${fn}`);
+ return client.rpc(fn,args);
 }
 
 /** Rejects `undefined` match values: they would otherwise be dropped or match nothing silently. */
@@ -120,5 +132,10 @@ export function supabaseTableClient(client:SupabaseClient):TableClient{
    if(count===null||count===undefined)throw new Error('count_unavailable');
    return count as number;
   },
+  async rpc(fn,args){
+   const {data,error}=await (client as unknown as {rpc:(f:string,a:Row)=>PromiseLike<{data:unknown;error:PgError|null}>}).rpc(fn,args);
+   if(error)fail('rpc',fn,error);
+   return data;
+  },
  };
 }
diff --git a/src/lib/entities/claims.ts b/src/lib/entities/claims.ts
index 2633585..6a9336b 100644
--- a/src/lib/entities/claims.ts
+++ b/src/lib/entities/claims.ts
@@ -1,24 +1,184 @@
-// Pending issuer_identifier_claims: the review queue for identifiers that contradict stored data.
-import {randomUUID} from 'node:crypto';
-import {TableError} from '../db/table-client';
-import type {TableClient} from '../db/table-client';
-import type {ClaimIdType} from './types';
+// src/lib/entities/claims.ts
+// Pending issuer_identifier_claims in the claim/1 shape (spec 3 §4.2.1; plan 3 contract C2): the review
+// queue for identifier and window changes that contradict stored data or need a human decision.
+// validateClaimDetail mirrors the SQL check identifier_claim_problem that resolve_identifier_claim
+// runs again on acceptance: keep the two in step (migration 20261107090000). A claim is keyed by
+// (issuer_id, id_type, value, op, target_key) while pending (partial unique index); filing the same key
+// again only appends new evidence to detail.sources and never changes target or params.
+import {createHash,randomUUID} from 'node:crypto';
+import {TableError,callRpc} from '../db/table-client';
+import type {Row,TableClient} from '../db/table-client';
+import {ProvenanceError,sanitizeProvenance} from './provenance';
+import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,ClaimTarget,EvidenceKind} from './types';
 
 /** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
 export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');
 
-export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string}
+export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Exclude<ClaimOp,'legacy'>;detail:ClaimDetail}
+export const CLAIM_SCHEMA='claim/1';
+export const EVIDENCE_KINDS:readonly EvidenceKind[]=['hard_identifier','official_list','name_match','filing_form','provider_mapping'];
+const ISSUER_COLUMNS:readonly string[]=['lei','cik','usci','cninfo_org_id'];
+const SECURITY_COLUMNS:readonly string[]=['isin','figi'];
+const SHARE_CLASSES:readonly string[]=['A','H','ADR','common','preferred','other','unknown'];
+const FROM_METHODS:readonly string[]=['first_observed','listing_date','ticker_change','curated'];
+const TO_METHODS:readonly string[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];
+const BACKDATE_METHODS:readonly string[]=['listing_date','ticker_change','curated'];
+const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
+const ISIN=/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
+const TICKER=/^[A-Z0-9][A-Z0-9.-]{0,31}$/;
+const SHA256=/^[0-9a-f]{64}$/;
+
+const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
+const str=(v:unknown,max=64):v is string=>typeof v==='string'&&v.length>=1&&v.length<=max;
+const onlyKeys=(o:Record<string,unknown>,allowed:readonly string[])=>Object.keys(o).every(k=>allowed.includes(k));
+
+/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
+export function isIsoDate(v:unknown):v is string{
+ if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
+ const d=new Date(`${v}T00:00:00Z`);
+ return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
+}
+const validEvidence=(e:unknown):e is ClaimEvidence=>isObj(e)&&str(e.source)&&isIsoDate(e.as_of)&&typeof e.evidence_sha256==='string'&&SHA256.test(e.evidence_sha256 as string)
+ &&(e.locator===undefined||typeof e.locator==='string')&&(e.note===undefined||typeof e.note==='string');
+
+/** op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (= SQL identifier_claim_target_key). */
+export function claimTargetKey(op:ClaimOp,target:ClaimTarget):string{
+ return target.ticker!==undefined?`${op}:${target.issuer_id}|${target.ticker}|${target.valid_from}`:`${op}:${target.issuer_id}`;
+}
+
+/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
+export function provenanceKeysFor(op:ClaimOp,idType:ClaimIdType):readonly string[]{
+ if(op==='set_identifier'||op==='correct_identifier')return [idType];
+ if(op==='attach_security')return ['isin','figi','valid_from'];
+ if(op==='close_security')return ['valid_to'];
+ if(op==='backdate_window')return ['valid_from'];
+ return [];
+}
+
+type Verdict={ok:true}|{ok:false;error:string};
+const bad=(field:string):Verdict=>({ok:false,error:`invalid_claim:${field}`});
+
+/**
+ * claim/1 check for (op, id_type, detail) per spec 3 §4.2.1; with `value`, also that the claim's value
+ * column agrees (correct_identifier new_value, close/backdate target.ticker). Unknown top-level detail
+ * keys are allowed (amend bookkeeping); unknown params keys are not, except for evidence_only.
+ */
+export function validateClaimDetail(op:ClaimOp,idType:ClaimIdType,detail:unknown,value?:string):Verdict{
+ if(op==='legacy')return {ok:false,error:'legacy_claim'};
+ if(!isObj(detail)||detail.schema!==CLAIM_SCHEMA)return bad('schema');
+ if(!EVIDENCE_KINDS.includes(detail.evidence_kind as EvidenceKind))return bad('evidence_kind');
+ const t=detail.target,pa=detail.params;
+ if(!isObj(t)||!str(t.issuer_id))return bad('target.issuer_id');
+ if(!isObj(pa))return bad('params');
+ if(!validEvidence(detail.evidence))return bad('evidence');
+ if(!Array.isArray(detail.sources)||!detail.sources.every(validEvidence))return bad('sources');
+ if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
+ const full='ticker' in t||'valid_from' in t;
+ if(full){if(!str(t.ticker,32)||!isIsoDate(t.valid_from)||Object.keys(t).length!==3)return bad('target');}
+ else if(Object.keys(t).length!==1)return bad('target');
+ switch(op){
+  case 'set_identifier':
+  case 'correct_identifier':
+   if(ISSUER_COLUMNS.includes(idType)){if(full)return bad('target');}
+   else if(SECURITY_COLUMNS.includes(idType)){if(!full)return bad('target');}
+   else return bad('op_id_type');
+   if(op==='set_identifier'){
+    if(!onlyKeys(pa,['candidates','note'])||(pa.candidates!==undefined&&!Array.isArray(pa.candidates))||(pa.note!==undefined&&typeof pa.note!=='string'))return bad('params');
+   }else{
+    if(!onlyKeys(pa,['expected_current','new_value','candidates','note'])||!str(pa.expected_current)||!str(pa.new_value)||pa.expected_current===pa.new_value)return bad('params');
+    if(value!==undefined&&pa.new_value!==value)return bad('params.new_value');
+   }
+   break;
+  case 'attach_security':
+   if(idType!=='ticker'||full)return bad('op_id_type');
+   if(!onlyKeys(pa,['share_class','valid_from','valid_from_method','source','isin','note','ticker'])||(pa.ticker!==undefined&&!(typeof pa.ticker==='string'&&TICKER.test(pa.ticker)))||!SHARE_CLASSES.includes(pa.share_class as string)
+    ||!isIsoDate(pa.valid_from)||!FROM_METHODS.includes(pa.valid_from_method as string)||!str(pa.source)
+    ||(pa.isin!==undefined&&pa.isin!==null&&!(typeof pa.isin==='string'&&ISIN.test(pa.isin as string))))return bad('params');
+   // the inserted ticker is params.ticker, else the claim value (SQL: params.ticker)
+   if(pa.ticker===undefined&&value!==undefined&&!TICKER.test(value))return bad('params.ticker');
+   break;
+  case 'close_security':
+  case 'backdate_window':
+   if(idType!=='ticker'||!full)return bad('op_id_type');
+   if(value!==undefined&&t.ticker!==value)return bad('target.ticker');
+   if(op==='close_security'){
+    if(!onlyKeys(pa,['valid_to','valid_to_method','note'])||!isIsoDate(pa.valid_to)||!TO_METHODS.includes(pa.valid_to_method as string)||(pa.valid_to as string)<=(t.valid_from as string))return bad('params');
+   }else if(!onlyKeys(pa,['new_valid_from','valid_from_method','note'])||!isIsoDate(pa.new_valid_from)||!BACKDATE_METHODS.includes(pa.valid_from_method as string)||(pa.new_valid_from as string)>=(t.valid_from as string))return bad('params');
+   break;
+  case 'evidence_only':
+   if(idType!=='ticker'||full)return bad('op_id_type');
+   if('suggested_op' in pa&&!SUGGESTED_OPS.includes(String(pa.suggested_op)))return bad('params.suggested_op');
+   break;
+  default:
+   return bad('op');
+ }
+ if(detail.provenance_written!==undefined){
+  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
+  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
+  // SQL: it must carry the op's own provenance key (the one resolve_identifier_claim merges)
+  const own=op==='close_security'?'valid_to':op==='set_identifier'||op==='correct_identifier'?idType:'valid_from';
+  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
+ }
+ return {ok:true};
+}
+
+/** Canonical JSON (keys sorted at every level, undefined dropped): the bytes whose sha256 names a record. */
+export function canonicalJson(v:unknown):string{
+ if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
+ if(isObj(v))return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
+ return JSON.stringify(v??null);
+}
+
+/** Evidence for a claim derived from an input record: sha256 over its canonical JSON; as_of is the record's date (first 10 chars) or today (UTC). */
+export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
+ const day=typeof input.asOf==='string'?input.asOf.slice(0,10):'';
+ return {
+  source:input.source,as_of:isIsoDate(day)?day:new Date().toISOString().slice(0,10),
+  evidence_sha256:createHash('sha256').update(canonicalJson(input.record)).digest('hex'),
+  ...(input.locator?{locator:input.locator}:{}),...(input.note?{note:input.note}:{}),
+ };
+}
+
+export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
+ return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
+  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
+}
+
+/**
+ * Appends `evidence` to the pending claim matching `key` (plan audit round 1, P3): ONE call of the
+ * row-locking SQL function append_claim_evidence (migration 20261107090000, Task 1b), which dedupes
+ * against the claim's evidence and sources and patches detail.sources only — concurrent filers never
+ * lose each other's evidence, target / params / the first evidence are never touched. A claim resolved
+ * meanwhile answers 'not_found' and is left alone. Needs client.rpc (callRpc: rpc_unavailable otherwise).
+ */
+async function appendEvidence(client:TableClient,key:Row,evidence:ClaimEvidence):Promise<false>{
+ await callRpc(client,'append_claim_evidence',{p_issuer:key.issuer_id,p_id_type:key.id_type,p_value:key.value,p_op:key.op,p_target_key:key.target_key,p_evidence:evidence});
+ return false;
+}
 
 /**
- * Files a pending claim unless an identical one is already pending. Retry-safe: the partial
- * unique index (issuer_id,id_type,value) where status='pending' turns a concurrent duplicate
- * into 23505, which is a no-op here. Returns whether a new claim row was written.
+ * Files a pending claim/1 claim. Validates first (throws invalid_claim:<field> / legacy_claim, no DB
+ * access). The same pending (issuer_id, id_type, value, op, target_key) → appends the new evidence to
+ * detail.sources and returns false; a concurrent duplicate (23505 on the partial unique index) is
+ * treated the same way. Returns whether a new claim row was written.
  */
 export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
- const pending={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,status:'pending'};
- if(await client.count('issuer_identifier_claims',pending)>0)return false;
+ const v=validateClaimDetail(c.op,c.id_type,c.detail,c.value);
+ if(!v.ok)throw new Error(v.error);
+ if(c.detail.target.issuer_id!==c.issuer_id)throw new Error('invalid_claim:target.issuer_id');
+ if(!str(c.source))throw new Error('invalid_claim:source');
+ if(!str(c.value))throw new Error('invalid_claim:value');
+ const target_key=claimTargetKey(c.op,c.detail.target);
+ const key:Row={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,op:c.op,target_key,status:'pending'};
+ if((await client.select('issuer_identifier_claims',key,{limit:1})).length)return appendEvidence(client,key,c.detail.evidence);
  try{
-  await client.insert('issuer_identifier_claims',{id:randomUUID(),...c,confidence:0.5,status:'pending',created_at:new Date().toISOString()});
+  await client.insert('issuer_identifier_claims',{
+   id:randomUUID(),issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,confidence:null,status:'pending',
+   op:c.op,target_key,detail:{...c.detail,sources:c.detail.sources??[]},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
+  });
   return true;
- }catch(e){if(isUnique(e))return false;throw e;}
+ }catch(e){
+  if(isUnique(e))return appendEvidence(client,key,c.detail.evidence);
+  throw e;
+ }
 }
diff --git a/src/lib/entities/issuers.ts b/src/lib/entities/issuers.ts
index 33ef564..27f5bb7 100644
--- a/src/lib/entities/issuers.ts
+++ b/src/lib/entities/issuers.ts
@@ -3,7 +3,7 @@
 import {randomUUID} from 'node:crypto';
 import type {Row,TableClient} from '../db/table-client';
 import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
-import {fileClaim,isUnique} from './claims';
+import {buildClaimDetail,claimEvidence,fileClaim,isUnique} from './claims';
 import {HARD_IDS,matchIssuer} from './merge';
 import type {ConflictReason,MatchResult} from './merge';
 import {isBlank,normalizeHkexCode,normalizeIsin} from './normalize';
@@ -65,16 +65,30 @@ async function lookup(client:TableClient,input:IssuerIdentifiers):Promise<{candi
  return {candidates,match:matchIssuer(candidates,input)};
 }
 
+const entryOf=(prov:Record<string,unknown>|undefined,k:string)=>{const e=prov?.[k];return e&&typeof e==='object'?e as Record<string,unknown>:undefined;};
 const sourceOf=(prov:Record<string,unknown>|undefined,k:string)=>{
- const entry=prov?.[k];
- const s=entry&&typeof entry==='object'?(entry as Record<string,unknown>).source:undefined;
- return typeof s==='string'&&s?s:'unknown';
+ const s=entryOf(prov,k)?.source;
+ return typeof s==='string'&&s?s.slice(0,64):'unknown';
+};
+/**
+ * Files a claim/1 claim for identifier `k` against `row`: set_identifier when the row has none,
+ * correct_identifier (expected_current = the stored value) when it differs. The evidence is the
+ * incoming identifier record itself (sha256 of its canonical JSON), so replaying the same record
+ * never appends a source (spec 3 §4.2.1; Part A contract note 3).
+ */
+const claimFor=(client:TableClient,row:Row,k:string,input:IssuerInput)=>{
+ const issuer_id=String(row.issuer_id),value=String(input[k as keyof IssuerInput]);
+ const current=row[k]==null?null:String(row[k]);
+ const op=current===null?'set_identifier':'correct_identifier';
+ const record=Object.fromEntries(ENRICH_FIELDS.filter(f=>input[f]!=null).map(f=>[f,input[f]]));
+ const evidence=claimEvidence({source:sourceOf(input.provenance,k),asOf:entryOf(input.provenance,k)?.as_of,record});
+ return fileClaim(client,{issuer_id,id_type:k as ClaimIdType,value,source:evidence.source,op,
+  detail:buildClaimDetail({evidence_kind:k==='cninfo_org_id'?'provider_mapping':'hard_identifier',target:{issuer_id},
+   params:current===null?{}:{expected_current:current,new_value:value},evidence})});
 };
-const claimFor=(client:TableClient,issuer_id:string,k:string,input:IssuerInput)=>
- fileClaim(client,{issuer_id,id_type:k as ClaimIdType,value:String(input[k as keyof IssuerInput]),source:sourceOf(input.provenance,k)});
 /** Claims, against `row`, every incoming hard id whose value differs from what `row` stores. */
 async function claimDiffering(client:TableClient,row:Row,input:IssuerInput){
- for(const k of HARD_IDS)if(input[k]&&row[k]!==input[k])await claimFor(client,String(row.issuer_id),k,input);
+ for(const k of HARD_IDS)if(input[k]&&row[k]!==input[k])await claimFor(client,row,k,input);
 }
 const provOf=(row:Row|undefined)=>(row?.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
 const conflict=(reason:ConflictReason):UpsertIssuerResult=>({issuer_id:null,created:false,conflict:true,reason});
@@ -126,14 +140,14 @@ export async function upsertIssuerByIdentifiers(client:TableClient,raw:IssuerInp
   const want=input[f];
   if(want==null)continue;
   if(existing[f]!=null){
-   if(f==='cninfo_org_id'&&existing[f]!==want)await claimFor(client,issuer_id,f,input);
+   if(f==='cninfo_org_id'&&existing[f]!==want)await claimFor(client,existing,f,input);
    continue;
   }
   let n:number;
   try{n=await client.update('issuers',{issuer_id,status:'active',[f]:null},{[f]:want,updated_at:new Date().toISOString()});}
   catch(e){
    if(!isUnique(e)||!CLAIMABLE.includes(f))throw e;
-   await claimFor(client,issuer_id,f,input);
+   await claimFor(client,existing,f,input);
    if(HARD.includes(f))return conflict('hard_id_mismatch');
    continue;
   }
@@ -141,7 +155,7 @@ export async function upsertIssuerByIdentifiers(client:TableClient,raw:IssuerInp
   const r=await reread(client,issuer_id,input);
   if('result' in r)return r.result;
   if(r.row[f]!==want&&CLAIMABLE.includes(f)){
-   await claimFor(client,issuer_id,f,input);
+   await claimFor(client,r.row,f,input);
    if(HARD.includes(f))return conflict('hard_id_mismatch');
   }
  }
diff --git a/src/lib/entities/link-research.ts b/src/lib/entities/link-research.ts
index 8d14399..fed7d3c 100644
--- a/src/lib/entities/link-research.ts
+++ b/src/lib/entities/link-research.ts
@@ -13,16 +13,18 @@ import {DATASETS} from '../dq/datasets';
 import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
 import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
 import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';
+import {claimEvidence} from './claims';
 import type {ApplyResult} from './load-sec';
 import {errorMessage,issuerReasonCode,parkConflict,summarizeSkips,withSkippedSummary} from './load-sec';
-import type {IssuerInput,ShareClass} from './types';
+import type {IssuerInput,SecurityClaimEvidence,ShareClass} from './types';
 
 type Market='A'|'HK'|'US'|'other';
 type CoreMarket=Exclude<Market,'other'>;
 export interface EntityKeyRow{user_id:string;entity_id:string;lei:string|null;usci:string|null;cik:string|null;cninfo_org_id:string|null;names_zh:unknown;names_en:unknown;home_market:Market;issuer_id:string|null}
 export interface EntitySecurityRow{user_id:string;id:string;entity_id:string;exchange_code:string;isin:string|null;market:Market;security_type:'common'|'adr'|'preferred'|'other';is_primary:boolean;valid_from:string;valid_to:string|null}
 export interface PlannedIssuer{entity_key:string;user_id:string;entity_id:string;current_issuer_id:string|null;input:IssuerInput}
-export interface PlannedSecurity{entity_key:string;user_id:string;entity_id:string;security_id:string;ticker:string;isin:string|null;share_class:ShareClass;is_primary:boolean;valid_from:string;valid_to:string|null;source:typeof CURATED;provenance:{source:typeof CURATED;as_of:string}}
+type CuratedOrigin={source:typeof CURATED;as_of:string};
+export interface PlannedSecurity{entity_key:string;user_id:string;entity_id:string;security_id:string;ticker:string;isin:string|null;share_class:ShareClass;is_primary:boolean;valid_from:string;valid_to:string|null;valid_to_method:'curated'|null;source:typeof CURATED;provenance:{valid_from:CuratedOrigin;valid_to?:CuratedOrigin};claimEvidence:SecurityClaimEvidence}
 export interface SkippedLink{entity_key:string;security_id?:string;reason:string}
 export interface PlannedLink{fetched:number;issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:SkippedLink[]}
 
@@ -109,7 +111,14 @@ export function planResearchLink(keys:EntityKeyRow[],securities:EntitySecurityRo
   const listed=universe.get(t);
   if(listed===undefined){skip(`ticker_not_in_universe:${t}`);continue;}
   if(market&&CORE.includes(listed)&&listed!==market){skip(`market_mismatch:${t}`);continue;}
-  plan.securities.push({entity_key,user_id:s.user_id,entity_id:s.entity_id,security_id:s.id,ticker:t,isin:str(s.isin),share_class:shareClass(s,t,entity),is_primary:s.is_primary===true,valid_from:s.valid_from,valid_to:s.valid_to??null,source:CURATED,provenance:{source:CURATED,as_of:asOf}});
+  const isin=str(s.isin),share_class=shareClass(s,t,entity),valid_to=s.valid_to??null;
+  const origin:CuratedOrigin={source:CURATED,as_of:asOf};
+  // The claim evidence hashes only public security fields (never user or entity ids).
+  const record={ticker:t,isin,share_class,valid_from:s.valid_from,valid_to};
+  plan.securities.push({entity_key,user_id:s.user_id,entity_id:s.entity_id,security_id:s.id,ticker:t,isin,share_class,is_primary:s.is_primary===true,
+   valid_from:s.valid_from,valid_to,valid_to_method:valid_to===null?null:'curated',source:CURATED,
+   provenance:valid_to===null?{valid_from:{...origin}}:{valid_from:{...origin},valid_to:{...origin}},
+   claimEvidence:{kind:'provider_mapping',evidence:claimEvidence({source:CURATED,asOf,record,note:'curated research security'})}});
  }
  return plan;
 }
diff --git a/src/lib/entities/load-sec.ts b/src/lib/entities/load-sec.ts
index 22a9242..bcb6808 100644
--- a/src/lib/entities/load-sec.ts
+++ b/src/lib/entities/load-sec.ts
@@ -19,7 +19,7 @@ export const SEC_SOURCE='sec_company_tickers_exchange';
 
 type FieldProvenance={source:string;as_of:string};
 export interface PlannedIssuer{cik:string;canonical_name_en:string;provenance:{cik:FieldProvenance;canonical_name_en:FieldProvenance}}
-export interface PlannedSecurity{cik:string;ticker:string;share_class:'unknown';is_primary:boolean;valid_from:string;source:string;provenance:{exchange:string}}
+export interface PlannedSecurity{cik:string;ticker:string;share_class:'unknown';is_primary:boolean;valid_from:string;source:string;provenance:{valid_from:{source:string;as_of:string;row:{exchange:string}}}}
 export interface SecLoadPlan{asOf:string;issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:string[]}
 
 /**
@@ -49,7 +49,8 @@ export function planSecLoad(rows:SecExchangeRow[],universe:ReadonlySet<string>,a
   if(!ticker){skipped.push(r.ticker);continue;}
   const first=!issuers.has(r.cik);
   if(first)issuers.set(r.cik,{cik:r.cik,canonical_name_en:r.name,provenance:{cik:prov(),canonical_name_en:prov()}});
-  securities.push({cik:r.cik,ticker,share_class:'unknown',is_primary:first,valid_from:asOf,source:SEC_SOURCE,provenance:{exchange:r.exchange}});
+  // Public provenance keeps the whitelist (spec 3 §3.1): the exchange is a copied source-row value of valid_from.
+  securities.push({cik:r.cik,ticker,share_class:'unknown',is_primary:first,valid_from:asOf,source:SEC_SOURCE,provenance:{valid_from:{source:SEC_SOURCE,as_of:asOf,row:{exchange:r.exchange}}}});
  }
  return {asOf,issuers:[...issuers.values()],securities,skipped};
 }
diff --git a/src/lib/entities/provenance.ts b/src/lib/entities/provenance.ts
new file mode 100644
index 0000000..cc6d91b
--- /dev/null
+++ b/src/lib/entities/provenance.ts
@@ -0,0 +1,54 @@
+// src/lib/entities/provenance.ts
+// Public provenance whitelist (spec 3 §3.1; plan 3 contract C2). issuer_securities.provenance and
+// issuers.provenance are anon-readable, so writers pass every object through sanitizeProvenance: only
+// whitelisted top-level keys; nested values may carry source names, ids, dates, hashes and the source
+// row values an evidence method copied, never a secret-looking key, URL credentials or a token-like
+// query parameter, or a UUID (user ids are UUIDs; no public provenance value needs one).
+export const PROVENANCE_KEYS=['isin','figi','valid_from','valid_to','pending_change'] as const;
+export const ISSUER_PROVENANCE_KEYS=['lei','cik','usci','cninfo_org_id','hkex_stock_code_primary','canonical_name_zh','canonical_name_en','country_code'] as const;
+export type ProvenanceErrorCode='not_object'|'unknown_key'|'secret_key'|'url_credentials'|'uuid_value'|'bad_value'|'too_deep'|'too_large';
+
+export class ProvenanceError extends Error{
+ constructor(readonly code:ProvenanceErrorCode,readonly path:string){
+  super(`provenance_rejected:${code}:${path}`);
+  this.name='ProvenanceError';
+ }
+}
+
+const SECRET_KEY=/token|secret|passw|api[_-]?key|apikey|auth|cookie|session|credential|private|user_?id|email/i;
+const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
+const URL_CREDENTIALS=/:\/\/[^/\s]*@|[?&#](?:token|key|apikey|api_key|access_token|sig|signature|auth|secret|password|code)=/i;
+const MAX_DEPTH=6;
+const MAX_JSON=8192;
+const isPlainObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
+
+function clean(v:unknown,path:string,depth:number):unknown{
+ if(depth>MAX_DEPTH)throw new ProvenanceError('too_deep',path);
+ if(v===null||typeof v==='boolean')return v;
+ if(typeof v==='number'){if(!Number.isFinite(v))throw new ProvenanceError('bad_value',path);return v;}
+ if(typeof v==='string'){
+  if(UUID.test(v))throw new ProvenanceError('uuid_value',path);
+  if(URL_CREDENTIALS.test(v))throw new ProvenanceError('url_credentials',path);
+  return v;
+ }
+ if(Array.isArray(v))return v.map((x,i)=>clean(x,`${path}[${i}]`,depth+1));
+ if(isPlainObject(v)){
+  const out:Record<string,unknown>={};
+  for(const [k,x] of Object.entries(v)){
+   if(SECRET_KEY.test(k))throw new ProvenanceError('secret_key',`${path}.${k}`);
+   if(x===undefined)continue;
+   out[k]=clean(x,`${path}.${k}`,depth+1);
+  }
+  return out;
+ }
+ throw new ProvenanceError('bad_value',path);
+}
+
+/** A deep copy of `p` restricted to `allowed` top-level keys; throws ProvenanceError on anything unsafe. */
+export function sanitizeProvenance(p:unknown,allowed:readonly string[]=PROVENANCE_KEYS):Record<string,unknown>{
+ if(!isPlainObject(p))throw new ProvenanceError('not_object','$');
+ for(const k of Object.keys(p))if(!allowed.includes(k))throw new ProvenanceError('unknown_key',k);
+ const out=clean(p,'$',0) as Record<string,unknown>;
+ if(JSON.stringify(out).length>MAX_JSON)throw new ProvenanceError('too_large','$');
+ return out;
+}
diff --git a/src/lib/entities/securities.ts b/src/lib/entities/securities.ts
index 680da02..88495d3 100644
--- a/src/lib/entities/securities.ts
+++ b/src/lib/entities/securities.ts
@@ -1,12 +1,22 @@
+// src/lib/entities/securities.ts
 // Ticker ownership over time. The DB enforces one open owner per ticker and no overlapping
 // half-open [valid_from, valid_to) windows; this module classifies an incoming window against the
 // rows it overlaps and turns those violations into 'duplicate' / 'conflict' outcomes.
+// Plan 3 (spec 3 §3.1, §4.2.1; contract C2): every inserted row carries valid_from_method /
+// valid_to_method (defaults: curated source → 'curated', else 'first_observed'; a closed window must
+// name its method), provenance passes the public whitelist (sanitizeProvenance) before any DB access,
+// and an ISIN contradiction becomes a claim/1 claim when the caller supplies claimEvidence: a row of
+// this issuer → set_identifier / correct_identifier on that row; another holder (open incoming window
+// only) → attach_security for the incoming security. Closed-history conflicts are only reported.
 import type {Row,TableClient} from '../db/table-client';
-import {fileClaim,isUnique} from './claims';
+import {buildClaimDetail,fileClaim,isUnique} from './claims';
 import {isBlank,normalizeIsin,normalizeTicker} from './normalize';
-import type {IssuerSecurityInput} from './types';
+import {sanitizeProvenance} from './provenance';
+import type {IssuerSecurityInput,ValidFromMethod,ValidToMethod} from './types';
 
 export type AttachResult='inserted'|'duplicate'|'conflict';
+export const VALID_FROM_METHODS:readonly ValidFromMethod[]=['first_observed','listing_date','ticker_change','curated'];
+export const VALID_TO_METHODS:readonly ValidToMethod[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];
 
 type Window={valid_from:string;valid_to:string|null};
 const str=(v:unknown)=>v==null?null:String(v);
@@ -16,13 +26,38 @@ const overlaps=(r:Row,w:Window)=>{
  return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
 };
 
+/** Window-end methods for an incoming row; throws invalid_security:<field> on a missing or unknown method. */
+export function securityMethods(raw:Pick<IssuerSecurityInput,'source'|'valid_from_method'|'valid_to_method'>,validTo:string|null):{valid_from_method:ValidFromMethod;valid_to_method:ValidToMethod|null}{
+ const from=raw.valid_from_method??(raw.source==='curated'?'curated':'first_observed');
+ if(!VALID_FROM_METHODS.includes(from))throw new Error('invalid_security:valid_from_method');
+ const to=raw.valid_to_method??null;
+ if(validTo===null){
+  if(to!==null)throw new Error('invalid_security:valid_to_method');
+  return {valid_from_method:from,valid_to_method:null};
+ }
+ if(to===null||!VALID_TO_METHODS.includes(to))throw new Error('invalid_security:valid_to_method');
+ return {valid_from_method:from,valid_to_method:to};
+}
+
 export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
  const sec={...raw,ticker:normalizeTicker(raw.ticker),isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:String(raw.valid_to)};
- // Only an ISIN conflict is recorded as a claim (a ticker conflict is not an identifier claim);
- // otherwise the return value carries the conflict.
- const conflict=async():Promise<AttachResult>=>{
-  if(sec.isin)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source});
-  return 'conflict';
+ const methods=securityMethods(raw,sec.valid_to);
+ const provenance=sanitizeProvenance(raw.provenance??{});
+ /** ISIN claim against a row of this issuer: set when the row has none, correct when it differs. */
+ const claimOnRow=async(row:Row)=>{
+  if(!sec.isin||!raw.claimEvidence)return;
+  const current=str(row.isin);
+  const op=current===null?'set_identifier':'correct_identifier';
+  await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source,op,
+   detail:buildClaimDetail({evidence_kind:raw.claimEvidence.kind,target:{issuer_id:sec.issuer_id,ticker:sec.ticker,valid_from:String(row.valid_from)},
+    params:current===null?{}:{expected_current:current,new_value:sec.isin},evidence:raw.claimEvidence.evidence})});
+ };
+ /** Another holder blocks the window: an open incoming window with an ISIN becomes attach_security. */
+ const claimAttach=async()=>{
+  if(!sec.isin||!raw.claimEvidence||sec.valid_to!==null)return;
+  await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'ticker',value:sec.ticker,source:sec.source,op:'attach_security',
+   detail:buildClaimDetail({evidence_kind:raw.claimEvidence.kind,target:{issuer_id:sec.issuer_id},
+    params:{share_class:sec.share_class,valid_from:sec.valid_from,valid_from_method:methods.valid_from_method,source:sec.source,isin:sec.isin},evidence:raw.claimEvidence.evidence})});
  };
  /** null when nothing on this ticker overlaps the incoming window (safe to insert). */
  const classify=async():Promise<AttachResult|null>=>{
@@ -34,15 +69,21 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
    // An absent incoming ISIN carries no information and never contradicts a stored one.
    const isinDiffers=sec.isin!==null&&same.isin!==sec.isin;
    if(str(same.valid_to)===sec.valid_to&&!isinDiffers)return 'duplicate';
-   if(isinDiffers)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin!,source:sec.source});
+   if(isinDiffers)await claimOnRow(same);
    return 'conflict';
   }
   const hit=rows.filter(r=>overlaps(r,sec));
   if(!hit.length)return null;
-  // Same issuer under a different valid_from: a duplicate unless the incoming ISIN contradicts
-  // an overlapping row's ISIN (an absent incoming ISIN never contradicts).
-  if(hit.every(r=>r.issuer_id===sec.issuer_id))return sec.isin!==null&&hit.some(r=>r.isin!==sec.isin)?conflict():'duplicate';
-  return conflict();
+  // Same issuer under a different valid_from: a duplicate unless the incoming ISIN contradicts an
+  // overlapping row's ISIN (an absent incoming ISIN never contradicts).
+  if(hit.every(r=>r.issuer_id===sec.issuer_id)){
+   const differing=sec.isin===null?undefined:hit.find(r=>r.isin!==sec.isin);
+   if(!differing)return 'duplicate';
+   await claimOnRow(differing);
+   return 'conflict';
+  }
+  await claimAttach();
+  return 'conflict';
  };
  const before=await classify();
  if(before)return before;
@@ -50,10 +91,7 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
   await client.insert('issuer_securities',{
    issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
    is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
-   valid_from_method:sec.source==='curated'?'curated':'first_observed',
-   // interim (plan 3 Task 1a): same rule as the migration backfill; Task 2b makes callers name the method
-   valid_to_method:sec.valid_to===null?null:(sec.source==='curated'?'curated':'unrecorded'),
-   source:sec.source,provenance:sec.provenance??{},
+   valid_from_method:methods.valid_from_method,valid_to_method:methods.valid_to_method,source:sec.source,provenance,
   });
   return 'inserted';
  }catch(e){
@@ -62,7 +100,10 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
   if(!isUnique(e))throw e;
   // The ISIN index (isin, valid_from) and the ISIN no-overlap exclusion span tickers: another
   // ticker already carries this ISIN over an overlapping window. A ticker-only re-read cannot see it.
-  if(e instanceof Error&&(e.message.includes('issuer_securities_isin_idx')||(code==='23P01'&&e.message.includes('issuer_securities_isin_no_overlap'))))return conflict();
+  if(e instanceof Error&&(e.message.includes('issuer_securities_isin_idx')||(code==='23P01'&&e.message.includes('issuer_securities_isin_no_overlap')))){
+   await claimAttach();
+   return 'conflict';
+  }
   // A concurrent writer took the window (PK, open-owner index or no-overlap exclusion): re-read once.
   const after=await classify();
   if(after)return after;
diff --git a/src/lib/entities/types.ts b/src/lib/entities/types.ts
index f0e48a4..dc7c290 100644
--- a/src/lib/entities/types.ts
+++ b/src/lib/entities/types.ts
@@ -1,13 +1,34 @@
-// Issuer master-data shapes (spec 2026-11-04 data foundation §3.1–3.2).
-import type {ShareClass} from '@/lib/supabase/database.types';
+// src/lib/entities/types.ts
+// Issuer master-data shapes (spec 2026-11-04 data foundation §3.1–3.2; spec 3 §3.1, §4.2.1; plan 3
+// contract C2).
+import type {ShareClass,ValidFromMethod,ValidToMethod} from '@/lib/supabase/database.types';
+export type {ShareClass,ValidFromMethod,ValidToMethod} from '@/lib/supabase/database.types';
 export type HardIdType='lei'|'cik'|'usci';
 /** id_type values allowed by the issuer_identifier_claims check constraint. */
-export type ClaimIdType=HardIdType|'isin'|'figi'|'cninfo_org_id';
+export type ClaimIdType=HardIdType|'isin'|'figi'|'cninfo_org_id'|'ticker';
+export type ClaimOp='legacy'|'evidence_only'|'set_identifier'|'correct_identifier'|'attach_security'|'close_security'|'backdate_window';
+/** Evidence class of a claim (facts vs judgments: a class, never a confidence number). */
+export type EvidenceKind='hard_identifier'|'official_list'|'name_match'|'filing_form'|'provider_mapping';
+export interface ClaimTarget{issuer_id:string;ticker?:string;valid_from?:string}
+export interface ClaimEvidence{source:string;as_of:string;evidence_sha256:string;locator?:string;note?:string}
+export interface ClaimDetail{schema:'claim/1';evidence_kind:EvidenceKind;target:ClaimTarget;params:Record<string,unknown>;evidence:ClaimEvidence;sources:ClaimEvidence[];provenance_written?:Record<string,unknown>}
 export interface IssuerIdentifiers{lei?:string|null;cik?:string|null;usci?:string|null;cninfo_org_id?:string|null}
 export interface IssuerInput extends IssuerIdentifiers{
  canonical_name_zh?:string|null;canonical_name_en?:string|null;country_code?:string|null;hkex_stock_code_primary?:string|null;
  provenance?:Record<string,unknown>;
 }
 export interface Issuer extends IssuerInput{issuer_id:string;status:'active'|'merged'|'dissolved';merged_into?:string|null}
-export type {ShareClass} from '@/lib/supabase/database.types';
-export interface IssuerSecurityInput{issuer_id:string;ticker:string;isin?:string|null;figi?:string|null;share_class:ShareClass;is_primary?:boolean;valid_from:string;valid_to?:string|null;source:string;provenance?:Record<string,unknown>}
+/** What a writer carries so an ISIN contradiction can become a claim/1 claim (spec 3 §4.2.1). */
+export interface SecurityClaimEvidence{kind:EvidenceKind;evidence:ClaimEvidence}
+export interface IssuerSecurityInput{
+ issuer_id:string;ticker:string;isin?:string|null;figi?:string|null;share_class:ShareClass;is_primary?:boolean;valid_from:string;valid_to?:string|null;
+ /** default: source==='curated' ? 'curated' : 'first_observed' */
+ valid_from_method?:ValidFromMethod;
+ /** required when valid_to is set, absent/null otherwise */
+ valid_to_method?:ValidToMethod|null;
+ source:string;
+ /** public: only PROVENANCE_KEYS (sanitizeProvenance) */
+ provenance?:Record<string,unknown>;
+ /** without it an ISIN contradiction is reported as 'conflict' but no claim is filed */
+ claimEvidence?:SecurityClaimEvidence;
+}

exec
/bin/zsh -lc 'git diff 6488aca''^ 6488aca -- src/lib/entities/issuers.ts; sed -n '"'140,230p' src/lib/entities/claims.ts; find . -iname '*agents*' -o -name CLAUDE.md; ls supabase/migrations/*07090000*; cat package.json | head -65; " in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 47ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-dHqtsDIL' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ONKdNxGH' (errno=Operation not permitted)
diff --git a/src/lib/entities/issuers.ts b/src/lib/entities/issuers.ts
index 33ef564..27f5bb7 100644
--- a/src/lib/entities/issuers.ts
+++ b/src/lib/entities/issuers.ts
@@ -3,7 +3,7 @@
 import {randomUUID} from 'node:crypto';
 import type {Row,TableClient} from '../db/table-client';
 import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
-import {fileClaim,isUnique} from './claims';
+import {buildClaimDetail,claimEvidence,fileClaim,isUnique} from './claims';
 import {HARD_IDS,matchIssuer} from './merge';
 import type {ConflictReason,MatchResult} from './merge';
 import {isBlank,normalizeHkexCode,normalizeIsin} from './normalize';
@@ -65,16 +65,30 @@ async function lookup(client:TableClient,input:IssuerIdentifiers):Promise<{candi
  return {candidates,match:matchIssuer(candidates,input)};
 }
 
+const entryOf=(prov:Record<string,unknown>|undefined,k:string)=>{const e=prov?.[k];return e&&typeof e==='object'?e as Record<string,unknown>:undefined;};
 const sourceOf=(prov:Record<string,unknown>|undefined,k:string)=>{
- const entry=prov?.[k];
- const s=entry&&typeof entry==='object'?(entry as Record<string,unknown>).source:undefined;
- return typeof s==='string'&&s?s:'unknown';
+ const s=entryOf(prov,k)?.source;
+ return typeof s==='string'&&s?s.slice(0,64):'unknown';
+};
+/**
+ * Files a claim/1 claim for identifier `k` against `row`: set_identifier when the row has none,
+ * correct_identifier (expected_current = the stored value) when it differs. The evidence is the
+ * incoming identifier record itself (sha256 of its canonical JSON), so replaying the same record
+ * never appends a source (spec 3 §4.2.1; Part A contract note 3).
+ */
+const claimFor=(client:TableClient,row:Row,k:string,input:IssuerInput)=>{
+ const issuer_id=String(row.issuer_id),value=String(input[k as keyof IssuerInput]);
+ const current=row[k]==null?null:String(row[k]);
+ const op=current===null?'set_identifier':'correct_identifier';
+ const record=Object.fromEntries(ENRICH_FIELDS.filter(f=>input[f]!=null).map(f=>[f,input[f]]));
+ const evidence=claimEvidence({source:sourceOf(input.provenance,k),asOf:entryOf(input.provenance,k)?.as_of,record});
+ return fileClaim(client,{issuer_id,id_type:k as ClaimIdType,value,source:evidence.source,op,
+  detail:buildClaimDetail({evidence_kind:k==='cninfo_org_id'?'provider_mapping':'hard_identifier',target:{issuer_id},
+   params:current===null?{}:{expected_current:current,new_value:value},evidence})});
 };
-const claimFor=(client:TableClient,issuer_id:string,k:string,input:IssuerInput)=>
- fileClaim(client,{issuer_id,id_type:k as ClaimIdType,value:String(input[k as keyof IssuerInput]),source:sourceOf(input.provenance,k)});
 /** Claims, against `row`, every incoming hard id whose value differs from what `row` stores. */
 async function claimDiffering(client:TableClient,row:Row,input:IssuerInput){
- for(const k of HARD_IDS)if(input[k]&&row[k]!==input[k])await claimFor(client,String(row.issuer_id),k,input);
+ for(const k of HARD_IDS)if(input[k]&&row[k]!==input[k])await claimFor(client,row,k,input);
 }
 const provOf=(row:Row|undefined)=>(row?.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
 const conflict=(reason:ConflictReason):UpsertIssuerResult=>({issuer_id:null,created:false,conflict:true,reason});
@@ -126,14 +140,14 @@ export async function upsertIssuerByIdentifiers(client:TableClient,raw:IssuerInp
   const want=input[f];
   if(want==null)continue;
   if(existing[f]!=null){
-   if(f==='cninfo_org_id'&&existing[f]!==want)await claimFor(client,issuer_id,f,input);
+   if(f==='cninfo_org_id'&&existing[f]!==want)await claimFor(client,existing,f,input);
    continue;
   }
   let n:number;
   try{n=await client.update('issuers',{issuer_id,status:'active',[f]:null},{[f]:want,updated_at:new Date().toISOString()});}
   catch(e){
    if(!isUnique(e)||!CLAIMABLE.includes(f))throw e;
-   await claimFor(client,issuer_id,f,input);
+   await claimFor(client,existing,f,input);
    if(HARD.includes(f))return conflict('hard_id_mismatch');
    continue;
   }
@@ -141,7 +155,7 @@ export async function upsertIssuerByIdentifiers(client:TableClient,raw:IssuerInp
   const r=await reread(client,issuer_id,input);
   if('result' in r)return r.result;
   if(r.row[f]!==want&&CLAIMABLE.includes(f)){
-   await claimFor(client,issuer_id,f,input);
+   await claimFor(client,r.row,f,input);
    if(HARD.includes(f))return conflict('hard_id_mismatch');
   }
  }
}

export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
 return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
}

/**
 * Appends `evidence` to the pending claim matching `key` (plan audit round 1, P3): ONE call of the
 * row-locking SQL function append_claim_evidence (migration 20261107090000, Task 1b), which dedupes
 * against the claim's evidence and sources and patches detail.sources only — concurrent filers never
 * lose each other's evidence, target / params / the first evidence are never touched. A claim resolved
 * meanwhile answers 'not_found' and is left alone. Needs client.rpc (callRpc: rpc_unavailable otherwise).
 */
async function appendEvidence(client:TableClient,key:Row,evidence:ClaimEvidence):Promise<false>{
 await callRpc(client,'append_claim_evidence',{p_issuer:key.issuer_id,p_id_type:key.id_type,p_value:key.value,p_op:key.op,p_target_key:key.target_key,p_evidence:evidence});
 return false;
}

/**
 * Files a pending claim/1 claim. Validates first (throws invalid_claim:<field> / legacy_claim, no DB
 * access). The same pending (issuer_id, id_type, value, op, target_key) → appends the new evidence to
 * detail.sources and returns false; a concurrent duplicate (23505 on the partial unique index) is
 * treated the same way. Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const v=validateClaimDetail(c.op,c.id_type,c.detail,c.value);
 if(!v.ok)throw new Error(v.error);
 if(c.detail.target.issuer_id!==c.issuer_id)throw new Error('invalid_claim:target.issuer_id');
 if(!str(c.source))throw new Error('invalid_claim:source');
 if(!str(c.value))throw new Error('invalid_claim:value');
 const target_key=claimTargetKey(c.op,c.detail.target);
 const key:Row={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,op:c.op,target_key,status:'pending'};
 if((await client.select('issuer_identifier_claims',key,{limit:1})).length)return appendEvidence(client,key,c.detail.evidence);
 try{
  await client.insert('issuer_identifier_claims',{
   id:randomUUID(),issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,confidence:null,status:'pending',
   op:c.op,target_key,detail:{...c.detail,sources:c.detail.sources??[]},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
  });
  return true;
 }catch(e){
  if(isUnique(e))return appendEvidence(client,key,c.detail.evidence);
  throw e;
 }
}
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents
supabase/migrations/20261107090000_identifiers_and_dq.sql
{
  "name": "stock-monitor",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=22.19.0 <23"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "preflight:release": "tsx scripts/release-preflight.ts",
    "securities:sync": "tsx scripts/securities-sync.ts",
    "securities:reconcile": "tsx scripts/securities-reconcile.ts",
    "test:db": "tsx scripts/ci/research-db.ts",
    "test:migrations": "tsx scripts/ci/migration-rehearsal.ts",
    "supabase:types": "echo 'database.types.ts is hand-maintained; see docs/runbooks/data-foundation.md' && exit 1",
    "check:migration-history": "tsx scripts/ci/check-migration-history.ts",
    "test:runtime-privileges": "tsx scripts/s4/runtime-privileges-smoke.ts",
    "preflight:research": "tsx scripts/s4/runtime-preflight.ts",
    "test:runtime-tls": "tsx scripts/s4/runtime-tls-smoke.ts",
    "test:revocation-consumer": "tsx scripts/revocation/consumer-smoke.ts",
    "test:revocation-registration": "tsx scripts/revocation/registration-smoke.ts",
    "test:revocation-retention": "tsx scripts/revocation/retention-smoke.ts",
    "test:revocation-list": "tsx scripts/revocation/list-smoke.ts"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.46.1",
    "ajv": "8.20.0",
    "clsx": "^2.1.1",
    "dsh-trade-strategy-evaluator": "file:vendor/dsh-trade-strategy-evaluator-0.3.0.tgz",
    "geist": "^1.7.1",
    "iconv-lite": "^0.7.2",
    "lightweight-charts": "^4.2.1",
    "next": "15.5.28",
    "next-intl": "^4.13.1",
    "pg": "^8.23.0",
    "pinyin-pro": "^3.28.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "stripe": "^22.3.0",
    "svix": "^1.98.0",
    "tailwind-merge": "^2.5.4",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  },
  "devDependencies": {
    "@next/eslint-plugin-next": "^15.5.22",
    "@playwright/test": "^1.61.1",
    "@types/node": "^22.9.0",
    "@types/pg": "^8.23.1",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "autoprefixer": "^10.4.20",
    "eslint": "^10.8.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "tsx": "^4.23.1",
    "typescript": "^5.6.3",

exec
/bin/zsh -lc "grep -nE 'ticker|target_key|provenance|correct_identifier' supabase/migrations/20261107090000_identifiers_and_dq.sql | head -85; sed -n '1,130p' src/lib/entities/claims.test.ts; rg 'attachSecurity\\(' --glob '"'!*.test.ts'"'; sed -n '1,90p' src/lib/db/pg-table-client.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
4:-- the claim/1 review queue (op, target_key, detail, resolution columns); dq_reconciliations gains
33:  add constraint issuer_securities_valid_from_method_check check (valid_from_method in ('first_observed','listing_date','ticker_change','curated')),
34:  add constraint issuer_securities_valid_to_method_check check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded')),
40:    -- Existing rows become op='legacy', target_key='', detail='{}' through the defaults: they cannot be
44:      add column target_key text not null default '',
54:  drop constraint if exists issuer_identifier_claims_target_key_check,
55:  drop constraint if exists issuer_identifier_claims_target_key_required,
58:  add constraint issuer_identifier_claims_id_type_check check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id','ticker')),
59:  add constraint issuer_identifier_claims_op_check check (op in ('legacy','evidence_only','set_identifier','correct_identifier','attach_security','close_security','backdate_window')),
60:  add constraint issuer_identifier_claims_target_key_check check (length(target_key) <= 256),
61:  add constraint issuer_identifier_claims_target_key_required check (op = 'legacy' or length(target_key) > 0),
67:create unique index issuer_identifier_claims_pending_unique on public.issuer_identifier_claims(issuer_id, id_type, value, op, target_key) where status = 'pending';
307:-- Recursive public-provenance guard (mirrors the TS sanitizeProvenance rules): no secret-like keys, no
309:-- Claim evidence may hold private notes; only what passes here may reach a public provenance column.
310:create or replace function public.claim_provenance_safe(p jsonb, p_depth int default 0) returns boolean
319:        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
323:        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
335:revoke execute on function public.claim_provenance_safe(jsonb, int) from public, anon, authenticated, service_role;
337:-- target_key = op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (claims.ts::claimTargetKey).
338:create or replace function public.identifier_claim_target_key(p_op text, p_target jsonb) returns text
340:  select p_op || ':' || case when p_target ? 'ticker'
341:    then coalesce(p_target ->> 'issuer_id', '') || '|' || coalesce(p_target ->> 'ticker', '') || '|' || coalesce(p_target ->> 'valid_from', '')
344:revoke execute on function public.identifier_claim_target_key(text, jsonb) from public, anon, authenticated, service_role;
353:  t := p_detail -> 'target'; pa := p_detail -> 'params'; pw := p_detail -> 'provenance_written';
361:  if pw is not null and jsonb_typeof(pw) <> 'object' then return 'provenance_written'; end if;
362:  full_target := t ? 'ticker' or t ? 'valid_from';
364:    if jsonb_typeof(t -> 'ticker') is distinct from 'string' or length(t ->> 'ticker') not between 1 and 32
366:       or not public.claim_keys_within(t, array['issuer_id','ticker','valid_from']) then return 'target'; end if;
370:  if p_op in ('set_identifier','correct_identifier') then
391:    if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
392:    if not public.claim_keys_within(pa, array['share_class','valid_from','valid_from_method','source','isin','note','ticker'])
395:       or coalesce(pa ->> 'valid_from_method', '') not in ('first_observed','listing_date','ticker_change','curated')
398:       or (pa ? 'ticker' and (jsonb_typeof(pa -> 'ticker') is distinct from 'string' or (pa ->> 'ticker') !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$')) then return 'params'; end if;
399:    -- the inserted ticker is params.ticker, else the claim value (which an evidence_only amendment leaves as the accession)
400:    if not (pa ? 'ticker') and p_value !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$' then return 'params.ticker'; end if;
404:    if p_id_type <> 'ticker' or not full_target then return 'op_id_type'; end if;
405:    if t ->> 'ticker' is distinct from p_value then return 'target.ticker'; end if;
409:         or coalesce(pa ->> 'valid_to_method', '') not in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded') then return 'params'; end if;
415:         or coalesce(pa ->> 'valid_from_method', '') not in ('listing_date','ticker_change','curated') then return 'params'; end if;
420:    if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
426:  -- provenance_written must carry the op's own provenance key (the one resolve merges), plus only allowed keys.
427:  if pw is not null and (not public.claim_keys_within(pw, allowed) or not public.claim_provenance_safe(pw)
428:     or (cardinality(allowed) > 0 and not pw ? (case when p_op in ('set_identifier','correct_identifier') then p_id_type when p_op = 'close_security' then 'valid_to' else 'valid_from' end))) then
429:    return 'provenance_written';
439:-- (amend_required), validates claim/1 and the stored target_key (invalid_claim), then performs the op's business write in
441:-- issuer, merges detail.provenance_written (or, absent, the claim's evidence under the op's key) into
442:-- the target row's provenance, then records status/resolved_by/resolved_at. Any failure raises and
449:  t jsonb; pa jsonb; v_pw jsonb; v_key text; v_status text; n int; v_ev jsonb; v_safe jsonb; v_ticker text;
460:    -- Only an evidence_only claim is amended, only on acceptance, only into a ticker op (§4.2.1).
470:    if (p_amend -> 'target') ? 'ticker' then v_value := p_amend -> 'target' ->> 'ticker'; end if;
482:  if c.target_key is distinct from public.identifier_claim_target_key(c.op, c.detail -> 'target') then
483:    raise exception 'invalid_claim' using errcode = '22023', detail = 'target_key';
489:  v_key := case when v_op in ('set_identifier','correct_identifier') then c.id_type when v_op = 'close_security' then 'valid_to' else 'valid_from' end;
490:  -- Fallback provenance carries only source / as_of / evidence_sha256 (+ a safe locator): the claim's
495:     and public.claim_provenance_safe(to_jsonb(v_ev ->> 'locator')) then
498:  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_safe));
503:  if not public.claim_provenance_safe(v_pw) then raise exception 'invalid_claim' using errcode = '22023', detail = 'provenance_written'; end if;
507:      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei is null;
509:      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik is null;
511:      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci is null;
513:      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id is null;
514:    elsif v_op = 'correct_identifier' and c.id_type = 'lei' then
515:      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei = pa ->> 'expected_current';
516:    elsif v_op = 'correct_identifier' and c.id_type = 'cik' then
517:      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik = pa ->> 'expected_current';
518:    elsif v_op = 'correct_identifier' and c.id_type = 'usci' then
519:      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci = pa ->> 'expected_current';
520:    elsif v_op = 'correct_identifier' and c.id_type = 'cninfo_org_id' then
521:      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id = pa ->> 'expected_current';
523:      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
524:      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and isin is null;
526:      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
527:      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi is null;
528:    elsif v_op = 'correct_identifier' and c.id_type = 'isin' then
529:      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
530:      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and isin = pa ->> 'expected_current';
531:    elsif v_op = 'correct_identifier' and c.id_type = 'figi' then
532:      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
533:      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi = pa ->> 'expected_current';
535:      v_ticker := coalesce(pa ->> 'ticker', v_value);
536:      if not exists (select 1 from public.stocks_universe where ticker = v_ticker) then
537:        raise exception 'invalid_claim' using errcode = '22023', detail = 'params.ticker';
539:      insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
540:      values (c.issuer_id, v_ticker, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
542:      update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
// src/lib/entities/claims.test.ts
import {afterEach,describe,it,expect,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {TableError} from '../db/table-client';
import {buildClaimDetail,canonicalJson,claimEvidence,claimTargetKey,fileClaim,isIsoDate,provenanceKeysFor,validateClaimDetail} from './claims';
import type {ClaimInput} from './claims';
import type {ClaimDetail,ClaimEvidence} from './types';

const SHA='b'.repeat(64);
const EV:ClaimEvidence={source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA};
const I='11111111-1111-4111-8111-111111111111';
const issuerT={issuer_id:I};
const rowT={issuer_id:I,ticker:'600519.SH',valid_from:'2001-08-27'};
const d=(over:Record<string,unknown>={})=>({schema:'claim/1',evidence_kind:'hard_identifier',target:issuerT,params:{},evidence:EV,sources:[],...over}) as ClaimDetail;
const verdict=(r:ReturnType<typeof validateClaimDetail>)=>r.ok?'ok':r.error;
const client=()=>memoryTableClient({issuer_identifier_claims:['id']});

afterEach(()=>{vi.useRealTimers();});

describe('claimTargetKey',()=>{
 it('is op:issuer for issuer-level targets and op:issuer|ticker|valid_from for security rows',()=>{
  expect(claimTargetKey('set_identifier',issuerT)).toBe(`set_identifier:${I}`);
  expect(claimTargetKey('close_security',rowT)).toBe(`close_security:${I}|600519.SH|2001-08-27`);
 });
});

describe('validateClaimDetail (mirrors identifier_claim_problem in SQL)',()=>{
 it('accepts one well-formed claim per op',()=>{
  const ok:[Parameters<typeof validateClaimDetail>[0],Parameters<typeof validateClaimDetail>[1],ClaimDetail][]=[
   ['set_identifier','lei',d()],
   ['set_identifier','isin',d({target:rowT,params:{candidates:[{compositeFIGI:'BBG000B9XRY4'}]}})],
   ['correct_identifier','figi',d({target:rowT,params:{expected_current:'BBG000B9XRY4',new_value:'BBG000B9Y5X2'}})],
   ['attach_security','ticker',d({params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x',ticker:'0700.HK'},provenance_written:{valid_from:{source:'x'}}})],
   ['attach_security','ticker',d({evidence_kind:'name_match',params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'hkex_list_name_match',isin:'CNE1000003G1'}})],
   ['close_security','ticker',d({evidence_kind:'filing_form',target:rowT,params:{valid_to:'2026-03-02',valid_to_method:'delisting'}})],
   ['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-08-01',valid_from_method:'ticker_change'}})],
   ['evidence_only','ticker',d({evidence_kind:'filing_form',params:{suggested_op:'backdate_window',accession:'0001234567-26-000001',form:'8-A12B'}})],
  ];
  for(const [op,t,detail] of ok)expect({op,t,r:verdict(validateClaimDetail(op,t,detail))}).toEqual({op,t,r:'ok'});
 });
 it('names the field at fault',()=>{
  const cases:[Parameters<typeof validateClaimDetail>,string][]=[
   [['legacy','lei',d()],'legacy_claim'],
   [['set_identifier','lei',{...d(),schema:'claim/0'}],'invalid_claim:schema'],
   [['set_identifier','lei',d({evidence_kind:'confidence'})],'invalid_claim:evidence_kind'],
   [['set_identifier','lei',d({target:{issuer_id:''}})],'invalid_claim:target.issuer_id'],
   [['set_identifier','lei',d({params:[]})],'invalid_claim:params'],
   [['set_identifier','lei',d({evidence:{...EV,evidence_sha256:'XYZ'}})],'invalid_claim:evidence'],
   [['set_identifier','lei',d({evidence:{...EV,as_of:'2026-02-30'}})],'invalid_claim:evidence'],
   [['set_identifier','lei',d({sources:[{...EV,source:''}]})],'invalid_claim:sources'],
   [['set_identifier','lei',d({target:rowT})],'invalid_claim:target'],
   [['set_identifier','lei',d({target:{issuer_id:I,extra:'x'}})],'invalid_claim:target'],
   [['set_identifier','isin',d()],'invalid_claim:target'],
   [['set_identifier','ticker',d()],'invalid_claim:op_id_type'],
   [['set_identifier','lei',d({params:{expected_current:'x'}})],'invalid_claim:params'],
   [['correct_identifier','lei',d({params:{expected_current:'A',new_value:'A'}})],'invalid_claim:params'],
   [['correct_identifier','lei',d({params:{expected_current:'A',new_value:'B'}}),'C'],'invalid_claim:params.new_value'],
   [['attach_security','ticker',d({target:rowT})],'invalid_claim:op_id_type'],
   [['attach_security','ticker',d({params:{share_class:'B',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x'}})],'invalid_claim:params'],
   [['attach_security','ticker',d({params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x',isin:'CN12'}})],'invalid_claim:params'],
   [['close_security','ticker',d({target:rowT,params:{valid_to:'2001-08-27',valid_to_method:'delisting'}})],'invalid_claim:params'],
   [['close_security','ticker',d({target:rowT,params:{valid_to:'2026-03-02',valid_to_method:'vanished'}})],'invalid_claim:params'],
   [['close_security','ticker',d({target:rowT,params:{valid_to:'2026-03-02',valid_to_method:'delisting'}}),'000001.SZ'],'invalid_claim:target.ticker'],
   [['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-09-01',valid_from_method:'listing_date'}})],'invalid_claim:params'],
   [['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-08-01',valid_from_method:'first_observed'}})],'invalid_claim:params'],
   [['evidence_only','ticker',d({params:{suggested_op:'merge'}})],'invalid_claim:params.suggested_op'],
   [['evidence_only','lei',d()],'invalid_claim:op_id_type'],
   [['set_identifier','lei',d({provenance_written:{cik:{source:'x'}}})],'invalid_claim:provenance_written:unknown_key'],
   [['set_identifier','lei',d({provenance_written:{lei:{source:'x',user_id:'u'}}})],'invalid_claim:provenance_written:secret_key'],
   [['evidence_only','ticker',d({provenance_written:{valid_from:{source:'x'}}})],'invalid_claim:provenance_written:unknown_key'],
   [['set_identifier','lei',d({provenance_written:{}})],'invalid_claim:provenance_written'],
   [['attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x',ticker:'bad ticker'}})],'invalid_claim:params'],
   [['attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x'}}),'a b'],'invalid_claim:params.ticker'],
  ];
  for(const [args,want] of cases)expect({args:JSON.stringify(args),got:verdict(validateClaimDetail(...args))}).toEqual({args:JSON.stringify(args),got:want});
 });
 it('allows exactly the provenance keys the accepted op writes',()=>{
  expect(provenanceKeysFor('set_identifier','lei')).toEqual(['lei']);
  expect(provenanceKeysFor('correct_identifier','isin')).toEqual(['isin']);
  expect(provenanceKeysFor('attach_security','ticker')).toEqual(['isin','figi','valid_from']);
  expect(provenanceKeysFor('close_security','ticker')).toEqual(['valid_to']);
  expect(provenanceKeysFor('backdate_window','ticker')).toEqual(['valid_from']);
  expect(provenanceKeysFor('evidence_only','ticker')).toEqual([]);
  expect(verdict(validateClaimDetail('attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x'},provenance_written:{valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}}})))).toBe('ok');
 });
});

describe('claim evidence helpers',()=>{
 it('hashes the canonical JSON of a record (key order never matters) and falls back to today (UTC) for a non-date as_of',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
  expect(canonicalJson({b:1,a:{d:[2,{f:1,e:null}],c:'x',u:undefined}})).toBe('{"a":{"c":"x","d":[2,{"e":null,"f":1}]},"b":1}');
  const a=claimEvidence({source:'sec',asOf:'2026-11-04T12:00:00Z',record:{cik:'320193',lei:'HWUPKR0MPOU8FGXBT394'}});
  expect(a).toEqual(claimEvidence({source:'sec',asOf:'2026-11-04',record:{lei:'HWUPKR0MPOU8FGXBT394',cik:'320193'}}));
  expect(a).toEqual({source:'sec',as_of:'2026-11-04',evidence_sha256:expect.stringMatching(/^[0-9a-f]{64}$/)});
  expect(claimEvidence({source:'x',asOf:'garbage',record:{}}).as_of).toBe('2026-11-05');
  expect(claimEvidence({source:'x',record:{},locator:'row:3',note:'n'})).toMatchObject({as_of:'2026-11-05',locator:'row:3',note:'n'});
  expect([isIsoDate('2026-02-28'),isIsoDate('2026-02-30'),isIsoDate('2026-2-3'),isIsoDate(20260228)]).toEqual([true,false,false,false]);
 });
 it('builds a claim/1 detail with an empty sources list by default',()=>{
  expect(buildClaimDetail({evidence_kind:'hard_identifier',target:issuerT,evidence:EV})).toEqual({schema:'claim/1',evidence_kind:'hard_identifier',target:issuerT,params:{},evidence:EV,sources:[]});
  expect(buildClaimDetail({evidence_kind:'provider_mapping',target:rowT,params:{candidates:[]},evidence:EV,provenance_written:{isin:{source:'gleif'}}})).toMatchObject({params:{candidates:[]},provenance_written:{isin:{source:'gleif'}}});
 });
});

describe('fileClaim',()=>{
 const input=(over:Partial<ClaimInput>={}):ClaimInput=>({issuer_id:I,id_type:'lei',value:'529900T8BM49AURSDO55',source:'gleif',op:'set_identifier',detail:d(),...over});
 it('writes a claim/1 row: op, target_key, detail with a sources list, no confidence',async()=>{
  const c=client();
  expect(await fileClaim(c,input())).toBe(true);
  expect(c.rows('issuer_identifier_claims')).toEqual([{id:expect.any(String),issuer_id:I,id_type:'lei',value:'529900T8BM49AURSDO55',source:'gleif',confidence:null,status:'pending',
   op:'set_identifier',target_key:`set_identifier:${I}`,detail:d(),resolved_by:null,resolved_at:null,created_at:expect.any(String)}]);
 });
 it('appends only new evidence to the pending claim with the same key and never changes its target or params',async()=>{
  const c=client();
  await fileClaim(c,input());
  expect(await fileClaim(c,input())).toBe(false);                                     // same evidence: nothing appended
  const later={...EV,as_of:'2026-11-06',evidence_sha256:'c'.repeat(64)};
  expect(await fileClaim(c,input({detail:d({evidence:later,params:{note:'other'}})}))).toBe(false);
  expect(c.rows('issuer_identifier_claims')[0].detail).toEqual({...d(),sources:[later]});
  expect(await fileClaim(c,input({detail:d({evidence:later})}))).toBe(false);         // already among the sources
  expect((c.rows('issuer_identifier_claims')[0].detail as ClaimDetail).sources).toEqual([later]);
  expect(await fileClaim(c,input({op:'correct_identifier',detail:d({params:{expected_current:'HWUPKR0MPOU8FGXBT394',new_value:'529900T8BM49AURSDO55'}})}))).toBe(true);   // another op is another claim
  expect(c.rows('issuer_identifier_claims')).toHaveLength(2);
 });
 it('treats a 23505 insert race as the winner existing and appends to it',async()=>{
  const c=client();
  await fileClaim(c,input());
  const select=c.select.bind(c);let blind=true;
  c.select=async(t,m,o)=>{if(t==='issuer_identifier_claims'&&blind){blind=false;return [];}return select(t,m,o);};
  const insert=c.insert.bind(c);
src/lib/entities/link-research.ts:  try{res=await attachSecurity(client,{...rest,issuer_id});}
src/lib/entities/securities.ts:export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
src/lib/entities/load-sec.ts:   const res=await attachSecurity(client,{...rest,issuer_id});
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:   await expect(attachSecurity(db,sec(a,t,'2020-01-01'))).rejects.toThrow(/^issuer_not_active$/);
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:   expect(await attachSecurity(db,sec(a,t,'2000-01-01','2005-01-01'))).toBe('inserted');
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md:1. **同 LEI**（自动，`hard_identifier`）：阶段 B 对该 LEI 返回 `HK` ticker，且该 ticker 在 `stocks_universe` 且无持有人 → `attachSecurity({issuer_id, ticker, isin, share_class, valid_from: stocks_universe.list_date ?? as_of, valid_from_method: list_date ? 'listing_date' : 'first_observed', source:'gleif_openfigi', provenance})`；已被别的发行人持有 → `ownership_conflict` 隔离。`share_class='H'` 只在该发行人同时持有 `.SH/.SZ` 行或有 USCI 时判定，否则 `unknown`。
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:@@ -49,7 +49,10 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:266:  await attachSecurity(c,{...sec,valid_to:'2010-01-01'});
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:272:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2000-01-01',valid_to:'2005-01-01'})).toBe('inserted');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:273:  expect(await attachSecurity(c,{...sec,issuer_id:'c',valid_from:'2005-01-01',valid_to:'2010-01-01'})).toBe('inserted');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:279:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2005-01-01',valid_to:'2012-01-01'})).toBe('conflict');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:285:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01'})).toBe('inserted');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:286:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01'})).toBe('duplicate');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:291:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01',isin:'US0378331005'})).toBe('inserted');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:292:  expect(await attachSecurity(c,{...sec,valid_to:'2011-01-01'})).toBe('conflict');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:293:  expect(await attachSecurity(c,{...sec,valid_to:null})).toBe('conflict');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:295:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01'})).toBe('duplicate');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:src/lib/entities/issuers.test.ts:296:  expect(await attachSecurity(c,{...sec,valid_to:'2010-01-01',isin:'US5949181045'})).toBe('conflict');
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
docs/audits/2026-11-05-data-foundation-3/codex/1a-review.md:  try{res=await attachSecurity(client,{...rest,issuer_id});}
docs/audits/2026-11-05-data-foundation-3/codex/2b-review.md: export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
docs/audits/2026-11-05-data-foundation-3/codex/2b-review.md:@@ -34,15 +69,21 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
docs/audits/2026-11-05-data-foundation-3/codex/2b-review.md:@@ -50,10 +91,7 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
docs/audits/2026-11-05-data-foundation-3/codex/2b-review.md:@@ -62,7 +100,10 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
docs/audits/2026-11-05-data-foundation-3/codex/1a-review-fix1.md:@@ -50,6 +50,7 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
docs/audits/2026-11-05-data-foundation-3/codex/1a-review-fix1.md:export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:1. **同 LEI**（自动，`hard_identifier`）：阶段 B 对该 LEI 返回 `HK` ticker，且该 ticker 在 `stocks_universe` 且无持有人 → `attachSecurity({issuer_id, ticker, isin, share_class, valid_from: stocks_universe.list_date ?? as_of, valid_from_method: list_date ? 'listing_date' : 'first_observed', source:'gleif_openfigi', provenance})`；已被别的发行人持有 → `ownership_conflict` 隔离。`share_class='H'` 只在该发行人同时持有 `.SH/.SZ` 行或有 USCI 时判定，否则 `unknown`。
docs/superpowers/specs/2026-11-04-industry-research-design.md:3. 证券：`attachSecurity({ticker: ts_code, share_class:'A', is_primary: true, valid_from: list_date ?? 观察日, source:'tushare:stock_basic', provenance:{list_date, exchange}})`；已有同发行人重叠窗口 → `duplicate`（不回填 `valid_from`；回填由规格三 F3-2 的 `listing_date` 证据脚本完成，本规格只把 `list_date` 留在 provenance）；不同发行人持有 → `conflict` → `fileClaim(pending)`。一个 orgId 已有多个 A 股 ticker（换码）→ 第二个 ticker 不自动挂，`fileClaim`。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,sec)).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,sec)).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05'})).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,ticker:' aapl '})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,sec)).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,{...sec,ticker:'  '})).rejects.toThrow('invalid_ticker');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,sec);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2026-11-05'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,{...sec,...closed('2010-01-01')});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2010-01-01'})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,valid_from:'2010-01-01'})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2000-01-01',...closed('2005-01-01')})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,issuer_id:'c',valid_from:'2005-01-01',...closed('2010-01-01')})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,{...sec,valid_from:'2010-01-01'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2005-01-01',...closed('2012-01-01')})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,...closed('2010-01-01')})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,...closed('2010-01-01')})).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,...closed('2010-01-01'),isin:'US0378331005'})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,...closed('2011-01-01')})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,sec)).toBe('conflict');                       // the open replay of a closed row
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,...closed('2010-01-01')})).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,...closed('2010-01-01'),isin:'US5949181045'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,sec)).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,isin:'US0378331005'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,{...sec,isin:'US0378331006'})).rejects.toThrow('invalid_identifier:isin');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,isin:' us0378331005 '})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,sec);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  for(let i=0;i<2;i++)expect(await attachSecurity(c,{...sec,issuer_id:'b',isin:'US0378331005'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,{...sec,valid_from:'2010-01-01'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...bare,issuer_id:'b',isin:'US0378331005'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...bare,valid_from:'2010-01-01',isin:'US5949181045'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,issuer_id:'b',valid_from:'2005-01-01',...closed('2012-01-01'),isin:'US0378331005'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(same,sec)).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(other,sec)).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,sec)).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,row)).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,sec)).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,sec)).rejects.toBeInstanceOf(TableError);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,isin:'US0378331005'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,isin:'US0378331005'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,isin:'US0378331005'})).toBe('inserted');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05',isin:'US0378331005'})).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05'})).toBe('duplicate');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  expect(await attachSecurity(c,{...sec,valid_from:'2026-11-05',isin:'US5949181045'})).toBe('conflict');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,sec);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,{...sec,ticker:'MSFT',source:'curated'});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,{...sec,ticker:'GOOG',valid_from_method:'listing_date',...closed('2020-01-01')});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,{...sec,valid_to:'2010-01-01'})).rejects.toThrow('invalid_security:valid_to_method');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,{...sec,valid_to_method:'delisting'})).rejects.toThrow('invalid_security:valid_to_method');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,{...sec,...closed('2010-01-01'),valid_to_method:'vanished' as never})).rejects.toThrow('invalid_security:valid_to_method');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,{...sec,valid_from_method:'guessed' as never})).rejects.toThrow('invalid_security:valid_from_method');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,{...sec,provenance:{exchange:'Nasdaq'}})).rejects.toBeInstanceOf(ProvenanceError);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,{...sec,provenance:{valid_from:{source:'x',user_id:'u'}}})).rejects.toThrow('provenance_rejected:secret_key');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await attachSecurity(c,{...sec,provenance:prov});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,sec)).rejects.toThrow(/^issuer_not_active$/);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  await expect(attachSecurity(c,sec)).rejects.toBeInstanceOf(TableError);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:   const res=await attachSecurity(tables,{issuer_id:input.issuerId,ticker,share_class:'unknown',is_primary:false,valid_from:input.asOf,valid_from_method:'first_observed',source:'sec_submissions',provenance:{}});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:规格：§4.2.2（规则 1 同 LEI 自动挂接：阶段 B 对该 LEI 返回 `HK` ticker、在 `stocks_universe` 且无持有人 → `attachSecurity({…, valid_from: list_date ?? as_of, valid_from_method: list_date ? 'listing_date' : 'first_observed', source:'gleif_openfigi', provenance})`；已被别的发行人持有 → `ownership_conflict` 隔离；`share_class='H'` 只在该发行人同时持有 `.SH/.SZ` 行或有 USCI 时判定，否则 `unknown`。规则 2 HKEX 名单名称归一只产 claim `attach_security`（`name_match`）：持 A 股行、无 H 股行、有名称的发行人，在 `Category='Equity'` 中找归一后完全相等者，恰一条 → claim（`params.share_class` 按规则 1、`valid_from` 同规则 1、`source='hkex_list_name_match'`），多条或零条 → 不产生。规则 3 官方名单 URL 未确认（§14-1），不实现。批次 `DATASETS.entities.ahLink`；claim 数进 `claims_summary`），§9.1 `names.test.ts`（20 对真实 A/H 名称）。`normalizeCompanyName` 规则：全角转半角、去空白与标点、去后缀词表（中文 股份有限公司/有限公司/集团/控股；英文 Limited/Ltd/Co/Company/Corp/Corporation/Holdings/Group/Inc/PLC；港股 `-H`、`- H SHS`、`(H)`）、英文小写。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:   const res=await attachSecurity(tables,a);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:  if(aTicker)expect(await attachSecurity(db,{issuer_id:out.issuer_id!,ticker:aTicker,share_class:'A',valid_from:'2020-01-01',source:'test'})).toBe('inserted');
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:  expect(await attachSecurity(c,sec)).toBe('inserted');
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:  expect(await attachSecurity(c,sec)).toBe('duplicate');
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:export async function attachSecurity(client:TableClient,sec:IssuerSecurityInput):Promise<'inserted'|'duplicate'>{
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:  try{(await attachSecurity(client,{issuer_id,ticker:s.ticker,share_class:s.share_class,is_primary:s.is_primary,valid_from:s.valid_from,source:s.source,provenance:s.provenance}))==='inserted'?counts.inserted++:counts.duplicates++;}
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:   (await attachSecurity(client,{issuer_id,ticker:s.ticker,share_class:s.share_class,is_primary:s.is_primary,valid_from:s.valid_from,valid_to:s.valid_to,source:s.source}))==='inserted'?counts.inserted++:counts.duplicates++;
// TEST-ONLY TableClient over node-postgres, so integration tests drive the same entities/dq code
// against the real schema (constraints, triggers, exclusion indexes). Production uses the Supabase
// adapter (supabaseTableClient in table-client.ts); nothing in src/app or src/lib imports this.
// Semantics mirror the Supabase adapter: null match values use `is null`, update returns the
// matched row count, select/count honour gte/lt ranges and orderBy/desc/limit/offset; rpc calls
// public.<fn> with named arguments (objects / arrays / booleans as jsonb).
// date/timestamp/timestamptz values come back as the server's text (not JS Date) so they compare
// and round-trip exactly like the strings PostgREST returns. Plain objects and arrays are sent as
// JSON (jsonb columns); PostgreSQL array columns are not supported.
import {types} from 'pg';
import type {Pool,QueryConfig} from 'pg';
import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
import type {RangeOptions,Row,SelectOptions,TableClient} from './table-client';

const IDENT=/^[a-z_][a-z0-9_]*$/;
/** Validates a table/column name and returns it double-quoted. */
export function ident(name:string):string{
 if(typeof name!=='string'||!IDENT.test(name))throw new Error(`invalid_sql_identifier:${String(name)}`);
 return `"${name}"`;
}

const param=(v:unknown)=>v!==null&&typeof v==='object'&&!(v instanceof Date)&&!Buffer.isBuffer(v)?JSON.stringify(v):v;
const placeholders=(n:number,from=1)=>Array.from({length:n},(_,i)=>`$${from+i}`).join(', ');

/** ` where …` (or '') for an equality match plus optional ranges; pushes values onto `params`. */
export function whereSql(match:Row,range:RangeOptions,params:unknown[]):string{
 const parts:string[]=[];
 const bind=(v:unknown)=>{params.push(param(v));return `$${params.length}`;};
 for(const [k,v] of Object.entries(match))parts.push(v===null?`${ident(k)} is null`:`${ident(k)} = ${bind(v)}`);
 for(const [k,v] of Object.entries(range.gte??{}))parts.push(`${ident(k)} >= ${bind(v)}`);
 for(const [k,v] of Object.entries(range.lt??{}))parts.push(`${ident(k)} < ${bind(v)}`);
 return parts.length?` where ${parts.join(' and ')}`:'';
}

export function selectSql(rel:string,match:Row,opts:SelectOptions):{text:string;values:unknown[]}{
 const values:unknown[]=[];
 let text=`select * from ${rel}${whereSql(match,opts,values)}`;
 if(opts.orderBy)text+=` order by ${ident(opts.orderBy)} ${opts.desc?'desc':'asc'}`;
 if(opts.limit!==undefined)text+=` limit ${Number(opts.limit)}`;
 if(opts.offset!==undefined)text+=` offset ${Number(opts.offset)}`;
 return {text,values};
}

export function upsertSql(rel:string,row:Row,onConflict:string):{text:string;values:unknown[]}{
 const cols=Object.keys(row);
 const conflict=onConflict.split(',').map(s=>s.trim());
 if(!cols.length||!conflict.length)throw new Error('invalid_upsert');
 const rest=cols.filter(c=>!conflict.includes(c));
 const action=rest.length?`do update set ${rest.map(c=>`${ident(c)} = excluded.${ident(c)}`).join(', ')}`:'do nothing';
 return {
  text:`insert into ${rel} (${cols.map(ident).join(', ')}) values (${placeholders(cols.length)}) on conflict (${conflict.map(ident).join(', ')}) ${action}`,
  values:cols.map(c=>param(row[c])),
 };
}

const RAW_TEXT=new Set([1082,1114,1184]); // date, timestamp, timestamptz
const getTypeParser=types.getTypeParser as (oid:number,format?:string)=>unknown;
export const typeParsers={getTypeParser:(oid:number,format?:string)=>RAW_TEXT.has(oid)?(v:string)=>v:getTypeParser(oid,format)} as unknown as QueryConfig['types'];

interface PgErr{message?:string;code?:string;detail?:string;hint?:string}

export function pgTableClient(pool:Pool,schema='public'):TableClient{
 const rel=(table:string)=>`${ident(schema)}.${ident(table)}`;
 const run=async(op:string,table:string,text:string,values:unknown[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){const err=e as PgErr;throw new TableError(op,table,err.message??String(e),err.code??null,{details:err.detail,hint:err.hint,cause:e});}
 };
 return {
  async insert(table,row){
   const cols=Object.keys(row);
   const text=cols.length
    ?`insert into ${rel(table)} (${cols.map(ident).join(', ')}) values (${placeholders(cols.length)}) returning *`
    :`insert into ${rel(table)} default values returning *`;
   return (await run('insert',table,text,cols.map(c=>param(row[c])))).rows[0] as Row;
  },
  async update(table,match,patch){
   assertUpdateMatch(match);
   const cols=Object.keys(patch);
   if(!cols.length)throw new Error('empty_update_patch');
   const values=cols.map(c=>param(patch[c]));
   const set=cols.map((c,i)=>`${ident(c)} = $${i+1}`).join(', ');
   const res=await run('update',table,`update ${rel(table)} set ${set}${whereSql(match,{},values)}`,values);
   return res.rowCount??0;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   const {text,values}=selectSql(rel(table),match,opts);
   return (await run('select',table,text,values)).rows as Row[];
  },
  async upsert(table,row,onConflict){

exec
/bin/zsh -lc "sed -n '1,65p' src/lib/entities/link-research.ts; sed -n '1,70p' src/lib/entities/issuers.ts; sed -n '575,635p' supabase/migrations/20261107090000_identifiers_and_dq.sql; git diff 6488aca"'^ 6488aca -- src/lib/entities/issuers-write.integration.test.ts; cat vitest.config.*' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// Promotes ONE user's research entities (research_entity_keys/_securities) into the global issuer
// master. planResearchLink is pure; applyResearchLink performs the writes through a TableClient and
// returns receipt counts (the script owns the ingest batch). Only entities with a valid hard
// identifier (lei/usci/cik) and a name are promoted. The public tables are anon-readable, so the
// public rows carry only source/as_of provenance: user and entity ids stay in the service-only
// receipt (tool_versions and error keys). The public provenance names the neutral source
// 'curated'; the research origin appears only in that receipt and its errors. Conflicts are parked
// as dq_quarantine rows of the run's batch.
import type {TableClient} from '../db/table-client';
import type {BatchError} from '../dq/batches';
import {emptyCounts} from '../dq/batches';
import {DATASETS} from '../dq/datasets';
import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';
import {claimEvidence} from './claims';
import type {ApplyResult} from './load-sec';
import {errorMessage,issuerReasonCode,parkConflict,summarizeSkips,withSkippedSummary} from './load-sec';
import type {IssuerInput,SecurityClaimEvidence,ShareClass} from './types';

type Market='A'|'HK'|'US'|'other';
type CoreMarket=Exclude<Market,'other'>;
export interface EntityKeyRow{user_id:string;entity_id:string;lei:string|null;usci:string|null;cik:string|null;cninfo_org_id:string|null;names_zh:unknown;names_en:unknown;home_market:Market;issuer_id:string|null}
export interface EntitySecurityRow{user_id:string;id:string;entity_id:string;exchange_code:string;isin:string|null;market:Market;security_type:'common'|'adr'|'preferred'|'other';is_primary:boolean;valid_from:string;valid_to:string|null}
export interface PlannedIssuer{entity_key:string;user_id:string;entity_id:string;current_issuer_id:string|null;input:IssuerInput}
type CuratedOrigin={source:typeof CURATED;as_of:string};
export interface PlannedSecurity{entity_key:string;user_id:string;entity_id:string;security_id:string;ticker:string;isin:string|null;share_class:ShareClass;is_primary:boolean;valid_from:string;valid_to:string|null;valid_to_method:'curated'|null;source:typeof CURATED;provenance:{valid_from:CuratedOrigin;valid_to?:CuratedOrigin};claimEvidence:SecurityClaimEvidence}
export interface SkippedLink{entity_key:string;security_id?:string;reason:string}
export interface PlannedLink{fetched:number;issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:SkippedLink[]}

/** Neutral public source name: the public rows never name the private research tables. */
export const CURATED='curated';
export const RESEARCH_LINK_DATASET=DATASETS.entities.researchLink;
const CORE:readonly string[]=['A','HK','US'];
const keyOf=(r:{user_id:string;entity_id:string})=>`${r.user_id}:${r.entity_id}`;
const str=(v:unknown)=>typeof v==='string'&&v.trim()!==''?v.trim():null;
const firstName=(v:unknown)=>Array.isArray(v)?v.map(str).find((s):s is string=>s!==null)??null:null;
// B shares trade under A-share codes but are a different class.
const B_SHARE=/^(900\d{3}\.SH|200\d{3}\.SZ)$/;
/**
 * Skip codes that mean invalid research data (→ rejectedSummary, degrades the batch). Every other
 * code is expected filtering (→ skippedSummary): no_hard_identifier and entity_not_promoted (not
 * promotable yet) and ticker_not_in_universe.
 */
const REJECT_CODES:readonly string[]=['invalid_identifier','name_required','invalid_ticker','market_mismatch'];
const isReject=(reason:string)=>REJECT_CODES.includes(reason.split(':')[0]);

type Ids={lei:string|null;usci:string|null;cik:string|null};
/** Validated hard ids, or the first invalid field. */
function hardIds(k:EntityKeyRow):Ids|{invalid:keyof Ids}{
 const lei=str(k.lei)?.toUpperCase()??null,usci=str(k.usci)?.toUpperCase()??null,rawCik=str(k.cik);
 if(lei!==null&&!isValidLei(lei))return {invalid:'lei'};
 if(usci!==null&&!isValidUsci(usci))return {invalid:'usci'};
 let cik:string|null=null;
 if(rawCik!==null){try{cik=normalizeCik(rawCik);}catch{return {invalid:'cik'};}}
 return {lei,usci,cik};
}

/**
 * Share class only from evidence: H needs an A-share home market or a USCI (a mainland issuer);
 * other HK common stock is 'unknown'. A-share codes with B-share prefixes are 'other'.
 */
function shareClass(s:EntitySecurityRow,ticker:string,entity:EntityKeyRow):ShareClass{
 if(s.security_type==='adr')return 'ADR';
 if(s.security_type!=='common')return s.security_type;
// Identifier-keyed issuer writes. Hard ids are validated before any DB access; contradictions
// become pending issuer_identifier_claims rows instead of silent overwrites.
import {randomUUID} from 'node:crypto';
import type {Row,TableClient} from '../db/table-client';
import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
import {buildClaimDetail,claimEvidence,fileClaim,isUnique} from './claims';
import {HARD_IDS,matchIssuer} from './merge';
import type {ConflictReason,MatchResult} from './merge';
import {isBlank,normalizeHkexCode,normalizeIsin} from './normalize';
import type {ClaimIdType,IssuerIdentifiers,IssuerInput} from './types';

export {attachSecurity} from './securities';
export type {AttachResult} from './securities';

type Candidate=IssuerIdentifiers&{issuer_id:string}&Row;
export interface UpsertIssuerResult{issuer_id:string|null;created:boolean;conflict?:boolean;reason?:ConflictReason}

// Identifiers first: a lost hard-id race returns before softer fields are written.
const ENRICH_FIELDS=['lei','cik','usci','cninfo_org_id','hkex_stock_code_primary','canonical_name_zh','canonical_name_en','country_code'] as const;
/** Enrichable identifiers with a unique index and a claims id_type: a lost write becomes a claim. */
const CLAIMABLE:readonly string[]=['lei','cik','usci','cninfo_org_id'];
const HARD:readonly string[]=HARD_IDS;

export function normalizeIdentifiers<T extends IssuerIdentifiers>(input:T):T{
 const out:Row={...input} as Row;
 for(const [k,v] of Object.entries(out))if(k!=='provenance'&&typeof v==='string')out[k]=isBlank(v)?null:v.trim();
 if(out.cik!=null){try{out.cik=normalizeCik(out.cik);}catch{throw new Error('invalid_identifier:cik');}}
 if(out.lei!=null){const lei=String(out.lei).toUpperCase();if(!isValidLei(lei))throw new Error('invalid_identifier:lei');out.lei=lei;}
 if(out.usci!=null){const usci=String(out.usci).toUpperCase();if(!isValidUsci(usci))throw new Error('invalid_identifier:usci');out.usci=usci;}
 if('isin' in out)out.isin=normalizeIsin(out.isin);
 if('hkex_stock_code_primary' in out)out.hkex_stock_code_primary=normalizeHkexCode(out.hkex_stock_code_primary);
 return out as T;
}

/**
 * Issuers holding any incoming hard id. A merged hit is replaced by its active merge target (one
 * hop), presented as carrying the matched id so matchIssuer sees the hit; enrichment never copies
 * that id onto the target. A dissolved hit, or a merged hit whose target is not active, lands in
 * `inactive` as the row that actually holds the id (its stored values drive claims).
 */
export async function candidatesFor(client:TableClient,input:IssuerIdentifiers):Promise<{candidates:Candidate[];inactive:Candidate[]}>{
 const byId=new Map<string,Candidate>(),overlay=new Map<string,Row>(),inactive=new Map<string,Candidate>();
 for(const k of HARD_IDS){
  if(!input[k])continue;
  for(let r of await client.select('issuers',{[k]:input[k]})){
   if(r.status==='merged'&&r.merged_into){
    const [target]=await client.select('issuers',{issuer_id:r.merged_into});
    if(!target||target.status!=='active'){inactive.set(String(r.issuer_id),r as Candidate);continue;}
    r=target;overlay.set(String(r.issuer_id),{...overlay.get(String(r.issuer_id)),[k]:input[k]});
   }else if(r.status!=='active'){inactive.set(String(r.issuer_id),r as Candidate);continue;}
   byId.set(String(r.issuer_id),r as Candidate);
  }
 }
 return {candidates:[...byId.values()].map(c=>({...c,...overlay.get(c.issuer_id)})),inactive:[...inactive.values()]};
}

async function lookup(client:TableClient,input:IssuerIdentifiers):Promise<{candidates:Candidate[];match:MatchResult}>{
 const {candidates,inactive}=await candidatesFor(client,input);
 if(inactive.length){
  // Any inactive hit blocks the write. If an active issuer was hit too, the ids are split.
  const all=[...inactive,...candidates];
  const issuer_ids=[...new Set(all.map(c=>c.issuer_id))].sort();
  return {candidates:all,match:{kind:'conflict',issuer_ids,reason:candidates.length?'identifiers_split':'inactive_issuer'}};
 }
 return {candidates,match:matchIssuer(candidates,input)};
}

const entryOf=(prov:Record<string,unknown>|undefined,k:string)=>{const e=prov?.[k];return e&&typeof e==='object'?e as Record<string,unknown>:undefined;};
const sourceOf=(prov:Record<string,unknown>|undefined,k:string)=>{
 const s=entryOf(prov,k)?.source;
-- ---------------------------------------------------------------- calendar passes (§3.1, §6.2, T3/U1)
-- The pass token {market, pass_id, batch_id} fences every pass write: the pass row is locked and must
-- be leased to token.batch_id, unexpired and unfinished, else fence_failed with no write.
create or replace function public.dq_calendar_lock_pass(p_token jsonb) returns public.dq_calendar_passes
language plpgsql set search_path = public as $$
declare p public.dq_calendar_passes;
begin
  if p_token is null or jsonb_typeof(p_token) <> 'object'
     or coalesce(p_token ->> 'market', '') not in ('US','CN')
     or coalesce(p_token ->> 'pass_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_token ->> 'batch_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'fence_failed' using errcode = 'P0001';
  end if;
  select * into p from public.dq_calendar_passes where market = p_token ->> 'market' and pass_id = (p_token ->> 'pass_id')::uuid for update;
  if not found or p.claimed_by is distinct from (p_token ->> 'batch_id')::uuid
     or p.claim_until is null or p.claim_until <= clock_timestamp() or p.finished_at is not null then
    raise exception 'fence_failed' using errcode = 'P0001';
  end if;
  return p;
end $$;
revoke execute on function public.dq_calendar_lock_pass(jsonb) from public, anon, authenticated, service_role;

-- U1: creation is serialised per market by a transaction advisory lock. No unfinished pass → create
-- it, freeze the in-scope active issuers as members, lease it to p_batch. An unfinished pass whose
-- lease is free, expired (claim_until <= now, the same test dq_calendar_lock_pass uses), or already p_batch's → (re)lease it to p_batch. Otherwise null.
create or replace function public.claim_calendar_pass(p_market text, p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; v_pass uuid;
begin
  if p_market is null or p_market not in ('US','CN') then raise exception 'invalid_market' using errcode = '22023'; end if;
  if p_batch is null then raise exception 'invalid_batch' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('dq_calendar_pass:' || p_market));
  select * into p from public.dq_calendar_passes where market = p_market and finished_at is null for update;
  if not found then
    v_pass := gen_random_uuid();
    insert into public.dq_calendar_passes(market, pass_id, started_at, claimed_by, claim_until, status)
    values (p_market, v_pass, clock_timestamp(), p_batch, clock_timestamp() + interval '10 minutes', 'running');
    insert into public.dq_calendar_pass_members(market, pass_id, issuer_id)
    select p_market, v_pass, s.issuer_id
    from public.fact_sync_scope s join public.issuers i on i.issuer_id = s.issuer_id
    where s.market = p_market and s.priority > 0 and i.status = 'active';
    return jsonb_build_object('market', p_market, 'pass_id', v_pass, 'batch_id', p_batch);
  end if;
  if p.claimed_by is null or p.claim_until is null or p.claim_until <= clock_timestamp() or p.claimed_by = p_batch then
    update public.dq_calendar_passes set claimed_by = p_batch, claim_until = clock_timestamp() + interval '10 minutes'
    where market = p.market and pass_id = p.pass_id;
    return jsonb_build_object('market', p_market, 'pass_id', p.pass_id, 'batch_id', p_batch);
  end if;
  return null;
end $$;
revoke execute on function public.claim_calendar_pass(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_calendar_pass(text, uuid) to service_role;

-- The only signature (no 3-arg overload). The member must belong to the pass and be pending, or
-- failed with attempts < 3; its rows for (issuer, market) are replaced atomically and it becomes done.
-- Rows carry the ExpectationRow columns (src/lib/dq/calendar.ts); computed_at and batch_id are set here.
create or replace function public.replace_filing_expectations(p_issuer uuid, p_market text, p_rows jsonb, p_pass_token jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; m public.dq_calendar_pass_members; n int;
begin
  p := public.dq_calendar_lock_pass(p_pass_token);
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fFuplr0c' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-nvNXgYaQ' (errno=Operation not permitted)
diff --git a/src/lib/entities/issuers-write.integration.test.ts b/src/lib/entities/issuers-write.integration.test.ts
index bf17c89..89a121f 100644
--- a/src/lib/entities/issuers-write.integration.test.ts
+++ b/src/lib/entities/issuers-write.integration.test.ts
@@ -9,7 +9,7 @@ import {afterAll,beforeAll,describe,expect,it} from 'vitest';
 import {pgTableClient} from '../db/pg-table-client';
 import {isValidIsin} from '../research/entity-keys/identifiers';
 import type {TableClient} from '../db/table-client';
-import {fileClaim} from './claims';
+import {buildClaimDetail,fileClaim} from './claims';
 import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';
 
 const enabled=!!process.env.S4_TEST_STATE;
@@ -56,7 +56,8 @@ describe.skipIf(!enabled)('issuer write path on real PostgreSQL',()=>{
   }catch(e){await c.query('rollback').catch(()=>{});throw e;}
   finally{c.release();}
  };
- const sec=(issuer_id:string,ticker:string,valid_from:string,valid_to:string|null=null)=>({issuer_id,ticker,share_class:'common' as const,valid_from,valid_to,source:'test'});
+ const EV={kind:'provider_mapping' as const,evidence:{source:'test',as_of:'2026-11-05',evidence_sha256:'e'.repeat(64)}};
+ const sec=(issuer_id:string,ticker:string,valid_from:string,valid_to:string|null=null)=>({issuer_id,ticker,share_class:'common' as const,valid_from,valid_to,valid_to_method:valid_to===null?null:'unrecorded' as const,source:'test',claimEvidence:EV});
  /** Hides existing ownership rows from the first pre-insert read, so the insert races the DB constraint. */
  const blindFirstRead=(seen:{code?:string|null})=>{
   let blind=true;
@@ -118,15 +119,31 @@ describe.skipIf(!enabled)('issuer write path on real PostgreSQL',()=>{
   expect((await admin.query(`select lei,canonical_name_en from public.issuers where issuer_id=$1`,[id])).rows[0]).toEqual({lei:null,canonical_name_en:'ZZ Write Test'});
  });
 
- it('dedupes claims through the pending-unique index even when the pre-check misses',async()=>{
+ it('dedupes claims through the pending-unique index even when the pre-check misses, appending the new evidence',async()=>{
   const id=await newIssuer();
   const lei=randomLei();
-  expect(await fileClaim(db,{issuer_id:id,id_type:'lei',value:lei,source:'test'})).toBe(true);
-  const blindCount:TableClient={...db,count:async()=>0};
-  expect(await fileClaim(blindCount,{issuer_id:id,id_type:'lei',value:lei,source:'test'})).toBe(false);
-  await expect(admin.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei',$3,'test',0.5)`,[randomUUID(),id,lei]))
+  const claim=(sha:string)=>({issuer_id:id,id_type:'lei' as const,value:lei,source:'test',op:'set_identifier' as const,
+   detail:buildClaimDetail({evidence_kind:'hard_identifier',target:{issuer_id:id},evidence:{source:'test',as_of:'2026-11-05',evidence_sha256:sha}})});
+  expect(await fileClaim(db,claim('a'.repeat(64)))).toBe(true);
+  let blind=true;
+  const blindFirstSelect:TableClient={...db,select:async(t,m,o)=>{if(t==='issuer_identifier_claims'&&blind){blind=false;return [];}return db.select(t,m,o);}};
+  expect(await fileClaim(blindFirstSelect,claim('b'.repeat(64)))).toBe(false);
+  await expect(admin.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,op,target_key) values($1,$2,'lei',$3,'test','set_identifier',$4)`,[randomUUID(),id,lei,`set_identifier:${id}`]))
    .rejects.toThrow(/issuer_identifier_claims_pending_unique/);
   expect(await pendingClaims(id)).toEqual([{id_type:'lei',value:lei}]);
+  const row=(await admin.query(`select op,target_key,confidence,detail from public.issuer_identifier_claims where issuer_id=$1`,[id])).rows[0];
+  expect(row).toMatchObject({op:'set_identifier',target_key:`set_identifier:${id}`,confidence:null});
+  expect(row.detail.sources).toEqual([{source:'test',as_of:'2026-11-05',evidence_sha256:'b'.repeat(64)}]);
+ });
+ it('concurrent appends to one pending claim keep every evidence record (append_claim_evidence row lock, plan audit P3)',async()=>{
+  const id=await newIssuer();
+  const lei=randomLei();
+  const claim=(sha:string)=>({issuer_id:id,id_type:'lei' as const,value:lei,source:'test',op:'set_identifier' as const,
+   detail:buildClaimDetail({evidence_kind:'hard_identifier',target:{issuer_id:id},evidence:{source:'test',as_of:'2026-11-05',evidence_sha256:sha}})});
+  expect(await fileClaim(db,claim('a'.repeat(64)))).toBe(true);
+  expect(await Promise.all(['c','d','e'].map(x=>fileClaim(db,claim(x.repeat(64)))))).toEqual([false,false,false]);
+  const row=(await admin.query(`select detail from public.issuer_identifier_claims where issuer_id=$1 and status='pending'`,[id])).rows[0];
+  expect(row.detail.sources.map((s:{evidence_sha256:string})=>s.evidence_sha256).sort()).toEqual(['c','d','e'].map(x=>x.repeat(64)));
  });
 
  it('classifies attachSecurity as inserted/duplicate/conflict, including closed history before an open owner',async()=>{
@@ -136,7 +153,7 @@ describe.skipIf(!enabled)('issuer write path on real PostgreSQL',()=>{
   expect(await attachSecurity(db,sec(a,t,'2010-01-01'))).toBe('duplicate');
   expect(await attachSecurity(db,sec(a,` ${t.toLowerCase()} `,'2015-01-01'))).toBe('duplicate');
   expect(await attachSecurity(db,{...sec(b,t,'2020-01-01'),isin:'US0378331005'})).toBe('conflict');
-  expect(await pendingClaims(b)).toEqual([{id_type:'isin',value:'US0378331005'}]);
+  expect(await pendingClaims(b)).toEqual([{id_type:'ticker',value:t}]);         // attach_security for the incoming security
   // Closed history ending exactly where the open owner starts: half-open windows do not overlap.
   expect(await attachSecurity(db,sec(b,t,'2000-01-01','2005-01-01'))).toBe('inserted');
   expect(await attachSecurity(db,sec(c,t,'2005-01-01','2010-01-01'))).toBe('inserted');
@@ -184,7 +201,7 @@ describe.skipIf(!enabled)('issuer write path on real PostgreSQL',()=>{
   const seen:{code?:string|null}={};
   expect(await attachSecurity(blindFirstRead(seen),{...sec(b,t2,'2015-01-01'),isin})).toBe('conflict');
   expect(seen.code).toBe('23P01');
-  expect(await pendingClaims(b)).toEqual([{id_type:'isin',value:isin}]);
+  expect(await pendingClaims(b)).toEqual([{id_type:'ticker',value:t2}]);
   expect(Number((await admin.query(`select count(*) from public.issuer_securities where ticker=$1`,[t2])).rows[0].count)).toBe(0);
  });
 
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

codex
No actionable regressions were identified in the commit. The claim format, RPC adapters, security-window metadata, and migrated callers appear consistent with the existing database contracts. Tests were inspected but not executed.
No actionable regressions were identified in the commit. The claim format, RPC adapters, security-window metadata, and migrated callers appear consistent with the existing database contracts. Tests were inspected but not executed.
