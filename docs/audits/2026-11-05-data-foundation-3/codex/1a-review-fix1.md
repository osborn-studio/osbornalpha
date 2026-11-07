OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1ae87-c365-7041-a59b-b5b62a92091b
--------
user
commit 0fd6c74
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 0fd6c74; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 501ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-KBsqwmjn' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-na42cjhw' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wYcCg8l2' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-a0mInIvb' (errno=Operation not permitted)
0fd6c74 fix(dq): attachSecurity writes valid_from_method; received filing and date must travel together
 src/lib/entities/identifiers.integration.test.ts          | 9 +++++++++
 src/lib/entities/issuers.integration.test.ts              | 2 +-
 src/lib/entities/securities.ts                            | 1 +
 supabase/migrations/20261107090000_identifiers_and_dq.sql | 2 ++
 4 files changed, 13 insertions(+), 1 deletion(-)

exec
/bin/zsh -lc 'pwd; ls -a; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; git show 0fd6c74; cat src/lib/entities/securities.ts; cat supabase/migrations/20261107090000_identifiers_and_dq.sql' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public
reports
scripts
skills
src
supabase
tailwind.config.ts
tsconfig.json
tsconfig.tsbuildinfo
vendor
vercel.json
vitest.config.ts
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-84x1CLbr' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-8UOmGaBt' (errno=Operation not permitted)
commit 0fd6c74defb8f10695699816ed72c37cf1e4e719
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 17:44:41 2026 -0800

    fix(dq): attachSecurity writes valid_from_method; received filing and date must travel together
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 7b4fa64..b6244fa 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -222,6 +222,13 @@ describe.skipIf(!enabled)('plan 3 migration one: schema',()=>{
   });
  },240000);
 
+ it('keeps valid_from_method=curated for a curated row written after the migration, across a replay',async()=>{
+  const a=await issuer();const t=await ticker();
+  await sec(a,t,'2020-01-01',null,{source:'curated',valid_from_method:'curated'});
+  await replayMigration(admin,readFileSync(MIGRATION,'utf8'));
+  expect(await q(`select valid_from_method from public.issuer_securities where issuer_id=$1`,[a])).toEqual([{valid_from_method:'curated'}]);
+ });
+
  it('enforces the window-method checks and to_method_iff_to on issuer_securities',async()=>{
   const a=await issuer();const t=await ticker();
   expect((await fails(sec(a,t,'2020-01-01',null,{valid_from_method:'guessed'}))).message).toMatch(/issuer_securities_valid_from_method_check/);
@@ -359,6 +366,8 @@ describe.skipIf(!enabled)('plan 3 migration one: schema',()=>{
   await bad({deadline_state:'no_rule'},/dfe_due_iff_known/);                                        // no_rule with a due date
   await bad({due_date:null},/dfe_due_iff_known/);                                                   // statutory without one
   await bad({disclosure_state:'received'},/dfe_received_iff/);                                      // received without the filing
+  await bad({upstream_lookup:'unavailable',disclosure_state:'pending',received_filing_id:randomUUID()},/dfe_received_pair/);   // filing without a date
+  await bad({upstream_lookup:'unavailable',disclosure_state:'pending',received_date:'2027-02-01'},/dfe_received_pair/);       // date without a filing
   await bad(filed(),/dfe_received_iff/);                                                            // pending yet carries a filing
   await bad({disclosure_state:'received',received_filing_id:randomUUID()},/dfe_received_iff/);     // missing received_date
   await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'received_late',...filed()},/dfe_late_requires_due/);
diff --git a/src/lib/entities/issuers.integration.test.ts b/src/lib/entities/issuers.integration.test.ts
index c1b77cc..d706c14 100644
--- a/src/lib/entities/issuers.integration.test.ts
+++ b/src/lib/entities/issuers.integration.test.ts
@@ -53,7 +53,7 @@ describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
  };
  const usTicker=async()=>{const t=await newTicker('US');if(!t) throw new Error('ZZ test ticker collided');return t;};
  // plan 3: a closed window must name how it was closed (issuer_securities_to_method_iff_to)
-const sec=(issuer:string,ticker:string,from:string,to:string|null,extraCols='',extraVals='',params:unknown[]=[])=>admin.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source${to===null?'':',valid_to_method'}${extraCols}) values($1,$2,$3,$4,'test'${to===null?'':",'unrecorded'"}${extraVals})`,[issuer,ticker,from,to,...params]);
+ const sec=(issuer:string,ticker:string,from:string,to:string|null,extraCols='',extraVals='',params:unknown[]=[])=>admin.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source${to===null?'':',valid_to_method'}${extraCols}) values($1,$2,$3,$4,'test'${to===null?'':",'unrecorded'"}${extraVals})`,[issuer,ticker,from,to,...params]);
  const newVersion=async()=>{
   const version='t'+hex(4);
   await admin.query(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('custom',$1,'10',1,'Energy')`,[version]);
diff --git a/src/lib/entities/securities.ts b/src/lib/entities/securities.ts
index 05fa39e..9a15a89 100644
--- a/src/lib/entities/securities.ts
+++ b/src/lib/entities/securities.ts
@@ -50,6 +50,7 @@ export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput)
   await client.insert('issuer_securities',{
    issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
    is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
+   valid_from_method:sec.source==='curated'?'curated':'first_observed',
    // interim (plan 3 Task 1a): same rule as the migration backfill; Task 2b makes callers name the method
    valid_to_method:sec.valid_to===null?null:(sec.source==='curated'?'curated':'unrecorded'),
    source:sec.source,provenance:sec.provenance??{},
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index e7355ed..38835f2 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -229,6 +229,8 @@ create table if not exists public.dq_filing_expectations (
   constraint dfe_overdue_requires_statutory check (disclosure_state <> 'overdue' or deadline_state = 'statutory'),
   constraint dfe_unknown_upstream_iff check ((disclosure_state = 'unknown_upstream') = (upstream_lookup = 'unavailable' and received_filing_id is null))
 );
+-- received_filing_id and received_date travel together, whatever the state (Codex round 1 P2)
+alter table public.dq_filing_expectations drop constraint if exists dfe_received_pair, add constraint dfe_received_pair check ((received_filing_id is null) = (received_date is null));
 create index if not exists dq_filing_expectations_state_idx on public.dq_filing_expectations(market, disclosure_state, due_date);
 
 create table if not exists public.issuer_filing_profiles (
// Ticker ownership over time. The DB enforces one open owner per ticker and no overlapping
// half-open [valid_from, valid_to) windows; this module classifies an incoming window against the
// rows it overlaps and turns those violations into 'duplicate' / 'conflict' outcomes.
import type {Row,TableClient} from '../db/table-client';
import {fileClaim,isUnique} from './claims';
import {isBlank,normalizeIsin,normalizeTicker} from './normalize';
import type {IssuerSecurityInput} from './types';

export type AttachResult='inserted'|'duplicate'|'conflict';

type Window={valid_from:string;valid_to:string|null};
const str=(v:unknown)=>v==null?null:String(v);
/** Half-open overlap with null valid_to = +∞. Dates are ISO 'YYYY-MM-DD', so text order is date order. */
const overlaps=(r:Row,w:Window)=>{
 const from=String(r.valid_from),to=str(r.valid_to);
 return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
};

export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
 const sec={...raw,ticker:normalizeTicker(raw.ticker),isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:String(raw.valid_to)};
 // The claims check has no 'ticker' id_type, so only an ISIN can be recorded as a claim;
 // otherwise the return value carries the conflict.
 const conflict=async():Promise<AttachResult>=>{
  if(sec.isin)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source});
  return 'conflict';
 };
 /** null when nothing on this ticker overlaps the incoming window (safe to insert). */
 const classify=async():Promise<AttachResult|null>=>{
  // A ticker has a handful of ownership rows at most; overlap is computed here, not in SQL.
  const rows=await client.select('issuer_securities',{ticker:sec.ticker},{orderBy:'valid_from'});
  const same=rows.find(r=>r.issuer_id===sec.issuer_id&&String(r.valid_from)===sec.valid_from);
  if(same){
   // Same primary key: a replay is a duplicate only if the window end and (when given) ISIN agree.
   // An absent incoming ISIN carries no information and never contradicts a stored one.
   const isinDiffers=sec.isin!==null&&same.isin!==sec.isin;
   if(str(same.valid_to)===sec.valid_to&&!isinDiffers)return 'duplicate';
   if(isinDiffers)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin!,source:sec.source});
   return 'conflict';
  }
  const hit=rows.filter(r=>overlaps(r,sec));
  if(!hit.length)return null;
  // Same issuer under a different valid_from: a duplicate unless the incoming ISIN contradicts
  // an overlapping row's ISIN (an absent incoming ISIN never contradicts).
  if(hit.every(r=>r.issuer_id===sec.issuer_id))return sec.isin!==null&&hit.some(r=>r.isin!==sec.isin)?conflict():'duplicate';
  return conflict();
 };
 const before=await classify();
 if(before)return before;
 try{
  await client.insert('issuer_securities',{
   issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
   valid_from_method:sec.source==='curated'?'curated':'first_observed',
   // interim (plan 3 Task 1a): same rule as the migration backfill; Task 2b makes callers name the method
   valid_to_method:sec.valid_to===null?null:(sec.source==='curated'?'curated':'unrecorded'),
   source:sec.source,provenance:sec.provenance??{},
  });
  return 'inserted';
 }catch(e){
  const code=(e as {code?:unknown})?.code;
  if(code==='23514'&&e instanceof Error&&e.message.includes('issuer_not_active:'))throw new Error('issuer_not_active');
  if(!isUnique(e))throw e;
  // The ISIN index (isin, valid_from) and the ISIN no-overlap exclusion span tickers: another
  // ticker already carries this ISIN over an overlapping window. A ticker-only re-read cannot see it.
  if(e instanceof Error&&(e.message.includes('issuer_securities_isin_idx')||(code==='23P01'&&e.message.includes('issuer_securities_isin_no_overlap'))))return conflict();
  // A concurrent writer took the window (PK, open-owner index or no-overlap exclusion): re-read once.
  const after=await classify();
  if(after)return after;
  // A unique violation that no current row explains is an exact replay that raced us.
  if(code==='23505')return 'duplicate';
  throw e;
 }
}
-- supabase/migrations/20261107090000_identifiers_and_dq.sql
-- Data foundation 3, migration one (spec 2026-11-04-data-foundation-3 §3.1; plan 3 Tasks 1a/1b).
-- issuer_securities gains evidence methods for both window ends; issuer_identifier_claims becomes
-- the claim/1 review queue (op, target_key, detail, resolution columns); dq_reconciliations gains
-- pair/kind/outcome/detail and the cycle-result columns; new tables hold reconcile cycles and
-- cursors, calendar passes and their frozen members, filer categories, filing expectations and
-- filing profiles; dq_freshness accepts 'weekly'; bucket reconcile-raw stores raw evidence.
-- Replayable: every column added to an existing table is added together with its one-time backfill
-- inside a guard on information_schema.columns, so a replay never rewrites evidence written after
-- the first run (spec §3). Constraints are dropped-if-exists then added (old rows satisfy them).
-- New tables are service-role only (RLS on, client roles revoked; service_role gets only what its
-- writers need — function-written tables are SELECT only). Business writes go through the security
-- definer functions in the second half (Task 1b); errors carry the code as the message.
-- The hosted postgres role is not a superuser: no `alter function … owner`; search_path = public.
-- Only the buckets table is referenced (local harness).

-- ---------------------------------------------------------------- issuer_securities: window-end methods (§3.1, §4.3.1)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_securities' and column_name = 'valid_from_method') then
    alter table public.issuer_securities
      add column valid_from_method text not null default 'first_observed',
      add column valid_to_method text;
    -- One-time backfill: curated rows were entered by hand; a closed row of any other source has no
    -- evidence for its end (an observation bound, 'unrecorded').
    update public.issuer_securities set valid_from_method = 'curated' where source = 'curated';
    update public.issuer_securities set valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end where valid_to is not null;
  end if;
end $$;
alter table public.issuer_securities
  drop constraint if exists issuer_securities_valid_from_method_check,
  drop constraint if exists issuer_securities_valid_to_method_check,
  drop constraint if exists issuer_securities_to_method_iff_to,
  add constraint issuer_securities_valid_from_method_check check (valid_from_method in ('first_observed','listing_date','ticker_change','curated')),
  add constraint issuer_securities_valid_to_method_check check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded')),
  add constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null));

-- ---------------------------------------------------------------- issuer_identifier_claims: claim/1 (§3.1, §4.2.1)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_identifier_claims' and column_name = 'op') then
    -- Existing rows become op='legacy', target_key='', detail='{}' through the defaults: they cannot be
    -- resolved by the route, only by runbook §4 SQL or rejection.
    alter table public.issuer_identifier_claims
      add column op text not null default 'legacy',
      add column target_key text not null default '',
      add column detail jsonb not null default '{}',
      add column resolved_by uuid,
      add column resolved_at timestamptz;
  end if;
end $$;
alter table public.issuer_identifier_claims alter column confidence drop not null;
alter table public.issuer_identifier_claims
  drop constraint if exists issuer_identifier_claims_id_type_check,
  drop constraint if exists issuer_identifier_claims_op_check,
  drop constraint if exists issuer_identifier_claims_target_key_check,
  drop constraint if exists issuer_identifier_claims_target_key_required,
  drop constraint if exists issuer_identifier_claims_detail_object,
  drop constraint if exists issuer_identifier_claims_pending_has_no_resolution,
  add constraint issuer_identifier_claims_id_type_check check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id','ticker')),
  add constraint issuer_identifier_claims_op_check check (op in ('legacy','evidence_only','set_identifier','correct_identifier','attach_security','close_security','backdate_window')),
  add constraint issuer_identifier_claims_target_key_check check (length(target_key) <= 256),
  add constraint issuer_identifier_claims_target_key_required check (op = 'legacy' or length(target_key) > 0),
  add constraint issuer_identifier_claims_detail_object check (jsonb_typeof(detail) = 'object'),
  add constraint issuer_identifier_claims_pending_has_no_resolution check (status <> 'pending' or resolved_at is null);
-- At most one PENDING claim per (issuer, id_type, value, op, target): fileClaim converges concurrent
-- filers on it (23505 → append evidence to the winner's detail.sources).
drop index if exists public.issuer_identifier_claims_pending_unique;
create unique index issuer_identifier_claims_pending_unique on public.issuer_identifier_claims(issuer_id, id_type, value, op, target_key) where status = 'pending';

-- ---------------------------------------------------------------- dq_reconciliations: pairs, kinds, outcomes, cycle rows (§3.1, T2)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dq_reconciliations' and column_name = 'pair') then
    alter table public.dq_reconciliations
      add column pair text not null default 'legacy',
      add column kind text not null default 'numeric',
      add column outcome text not null default 'compared',
      add column detail jsonb not null default '{}',
      add column cycle_id text,
      add column issuer_id uuid,
      add column market text,
      add column attempt int;
    -- The table had no writer before this migration (production is empty); any row is legacy.
    update public.dq_reconciliations set outcome = 'legacy';
  end if;
end $$;
alter table public.dq_reconciliations
  drop constraint if exists dq_reconciliations_pair_check,
  drop constraint if exists dq_reconciliations_kind_check,
  drop constraint if exists dq_reconciliations_outcome_check,
  drop constraint if exists dq_reconciliations_detail_object,
  drop constraint if exists dq_reconciliations_market_check,
  drop constraint if exists dq_reconciliations_attempt_check,
  drop constraint if exists dq_reconciliations_cycle_cols,
  drop constraint if exists dq_reconciliations_numeric_sides,
  drop constraint if exists dq_reconciliations_nonnumeric_sides,
  add constraint dq_reconciliations_pair_check check (length(pair) between 1 and 64),
  add constraint dq_reconciliations_kind_check check (kind in ('numeric','text','date')),
  add constraint dq_reconciliations_outcome_check check (outcome in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold','legacy')),
  add constraint dq_reconciliations_detail_object check (jsonb_typeof(detail) = 'object'),
  add constraint dq_reconciliations_market_check check (market is null or market in ('US','CN')),
  add constraint dq_reconciliations_attempt_check check (attempt is null or attempt >= 1),
  -- Cycle result rows (T2) carry all four columns; old rows and out-of-cycle records carry none.
  add constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null)),
  add constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null)),
  -- text/date values live in detail.left_text/right_text; passed is string/date equality.
  add constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null));
create index if not exists dq_reconciliations_pair_created_idx on public.dq_reconciliations(pair, created_at desc);
-- The accepted-result marker: at most one row per cycle and key (apply_reconcile_result reuses it).
create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;

-- ---------------------------------------------------------------- dq_freshness: weekly cadence (§3.1)
alter table public.dq_freshness
  drop constraint if exists dq_freshness_expected_cadence_check,
  add constraint dq_freshness_expected_cadence_check check (expected_cadence in ('daily','weekly','monthly','quarterly','event'));

-- ---------------------------------------------------------------- reconcile cycles and cursor (§3.1, §5.5)
create table if not exists public.dq_reconcile_cycles (
  pair                text not null check (length(pair) between 1 and 64),
  cycle_id            text not null check (length(cycle_id) between 1 and 64),
  started_at          timestamptz not null,
  finished_at         timestamptz,
  members             jsonb not null,                                -- frozen [{issuer_id, market, expected_keys}]
  status              text not null check (status in ('running','complete','complete_with_gaps')),
  expected_total      int not null check (expected_total >= 0),
  compared_passed     int not null default 0 check (compared_passed >= 0),
  compared_failed     int not null default 0 check (compared_failed >= 0),
  not_compared        int not null default 0 check (not_compared >= 0),
  exec_failed_members int not null default 0 check (exec_failed_members >= 0),
  detail              jsonb not null default '{}',                   -- pending_members (set_merge, migration two) and settlement notes
  primary key (pair, cycle_id),
  constraint dq_reconcile_cycles_members_array check (jsonb_typeof(members) = 'array'),
  constraint dq_reconcile_cycles_detail_object check (jsonb_typeof(detail) = 'object'),
  constraint dq_reconcile_cycles_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
);
create unique index if not exists dq_reconcile_cycles_running_uniq on public.dq_reconcile_cycles(pair) where status = 'running';

create table if not exists public.dq_reconcile_cursor (
  pair             text not null,
  cycle_id         text not null,
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  expected         int not null,                                     -- this member's expected key count (frozen)
  state            text not null default 'pending' check (state in ('pending','claimed','done','failed')),
  claimed_by       uuid references public.ingest_batches(batch_id) on delete set null,
  claim_until      timestamptz,
  attempts         int not null default 0 check (attempts >= 0),
  last_error       text,
  done_at          timestamptz,
  compared_passed  int,
  compared_failed  int,
  not_compared     int,
  primary key (pair, cycle_id, issuer_id, market),
  constraint dq_reconcile_cursor_cycle_fkey foreign key (pair, cycle_id) references public.dq_reconcile_cycles(pair, cycle_id) on delete restrict,
  constraint drc_expected_nonneg check (expected >= 0),
  constraint drc_counters_nonneg check ((compared_passed is null or compared_passed >= 0) and (compared_failed is null or compared_failed >= 0) and (not_compared is null or not_compared >= 0)),
  -- S5: a done row has all three counters, non-null, summing to expected; settlement never coalesces.
  constraint drc_done_accounted check (state <> 'done' or (compared_passed is not null and compared_failed is not null and not_compared is not null and compared_passed + compared_failed + not_compared = expected))
);
create index if not exists dq_reconcile_cursor_state_idx on public.dq_reconcile_cursor(pair, cycle_id, state);

-- ---------------------------------------------------------------- calendar passes (§3.1, §6.2, T3/U1)
create table if not exists public.dq_calendar_passes (
  market       text not null check (market in ('US','CN')),
  pass_id      uuid not null,
  started_at   timestamptz not null,
  finished_at  timestamptz,
  claimed_by   uuid references public.ingest_batches(batch_id) on delete set null,   -- one leased worker per market and pass
  claim_until  timestamptz,
  status       text not null default 'running' check (status in ('running','complete','complete_with_failures')),
  primary key (market, pass_id),
  constraint dcp_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
);
create unique index if not exists dq_calendar_passes_open_uniq on public.dq_calendar_passes(market) where finished_at is null;

-- Frozen when the pass is created (in-scope issuers); scope changes during a pass go to the next one.
create table if not exists public.dq_calendar_pass_members (
  market      text not null,
  pass_id     uuid not null,
  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
  state       text not null default 'pending' check (state in ('pending','done','failed')),
  attempts    int not null default 0 check (attempts >= 0),
  last_error  text,
  done_at     timestamptz,
  primary key (market, pass_id, issuer_id),
  constraint dq_calendar_pass_members_pass_fkey foreign key (market, pass_id) references public.dq_calendar_passes(market, pass_id) on delete restrict
);
create index if not exists dq_calendar_pass_members_state_idx on public.dq_calendar_pass_members(market, pass_id, state);

-- ---------------------------------------------------------------- filer categories, expectations, profiles (§3.1, §6.1)
-- Per fiscal year, from that year's 10-K cover page (iXBRL dei), never from submissions.category.
create table if not exists public.issuer_filer_categories (
  issuer_id          uuid not null references public.issuers(issuer_id) on delete restrict,
  fiscal_year        int not null,
  acceleration       text not null check (acceleration in ('large_accelerated','accelerated','non_accelerated')),
  smaller_reporting  boolean,
  category_raw       text not null check (length(category_raw) between 1 and 256),
  source             text not null check (source in ('ixbrl_dei')),
  accession          text not null check (length(accession) between 1 and 32),
  evidence_sha256    text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  as_of              date not null,
  primary key (issuer_id, fiscal_year)
);

create table if not exists public.dq_filing_expectations (
  issuer_id            uuid not null references public.issuers(issuer_id) on delete restrict,
  market               text not null check (market in ('US','CN')),
  report_kind          text not null check (report_kind in ('10-K','10-Q','20-F','40-F','annual','semiannual','q1','q3')),
  period_end           date not null,
  period_end_estimated boolean not null default false,
  deadline_state       text not null check (deadline_state in ('statutory','estimated','no_rule')),
  due_date             date,
  due_rule             text not null check (length(due_rule) between 1 and 64),
  expected_date        date,                                            -- CN appointment date (same period)
  upstream_lookup      text not null check (upstream_lookup in ('ok','unavailable','not_applicable')),
  upstream_filed_date  date,
  disclosure_state     text not null check (disclosure_state in ('pending','overdue','filed_not_ingested','received','received_late','unknown_upstream')),
  received_filing_id   uuid,
  received_date        date,
  profile_as_of        date,
  detail               jsonb not null default '{}',
  computed_at          timestamptz not null,
  batch_id             uuid not null references public.ingest_batches(batch_id) on delete restrict,
  primary key (issuer_id, market, report_kind, period_end),
  constraint dq_filing_expectations_detail_object check (jsonb_typeof(detail) = 'object'),
  -- deadline_state and disclosure_state are orthogonal: a no_rule row may still be received.
  constraint dfe_due_iff_known check ((due_date is null) = (deadline_state = 'no_rule')),
  constraint dfe_received_iff check ((disclosure_state in ('received','received_late')) = (received_filing_id is not null and received_date is not null)),
  constraint dfe_late_requires_due check (disclosure_state <> 'received_late' or due_date is not null),
  -- estimated rows are never overdue: past due they stay pending with detail.estimated_due_passed=true
  constraint dfe_overdue_requires_statutory check (disclosure_state <> 'overdue' or deadline_state = 'statutory'),
  constraint dfe_unknown_upstream_iff check ((disclosure_state = 'unknown_upstream') = (upstream_lookup = 'unavailable' and received_filing_id is null))
);
-- received_filing_id and received_date travel together, whatever the state (Codex round 1 P2)
alter table public.dq_filing_expectations drop constraint if exists dfe_received_pair, add constraint dfe_received_pair check ((received_filing_id is null) = (received_date is null));
create index if not exists dq_filing_expectations_state_idx on public.dq_filing_expectations(market, disclosure_state, due_date);

create table if not exists public.issuer_filing_profiles (
  issuer_id             uuid not null references public.issuers(issuer_id) on delete restrict,
  market                text not null check (market in ('US','CN')),
  category_raw_current  text,                                           -- submissions.category as written; reference only, never decides a deadline
  regime                text not null check (regime in ('10-K','20-F','40-F','cn')),
  fiscal_year_end       text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'),
  week52_pattern        boolean not null default false,
  source                text not null check (length(source) between 1 and 64),
  source_sha256         text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  as_of                 date not null,
  updated_at            timestamptz not null default now(),
  primary key (issuer_id, market)
);

-- ---------------------------------------------------------------- privileges (service-role only)
do $$ declare t text; begin
  foreach t in array array['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
-- run.ts creates and settles cycles and inserts the frozen cursor rows; claiming, completing and
-- failing a cursor row happen only in migration two's functions (fenced).
grant select, insert, update on public.dq_reconcile_cycles to service_role;
grant select, insert on public.dq_reconcile_cursor to service_role;
-- Written only by the pass functions below (fenced): read-only for every client role.
grant select on public.dq_calendar_passes, public.dq_calendar_pass_members, public.dq_filing_expectations to service_role;
-- Plain registries written by the calendar sync and filer-category scripts through TableClient.
grant select, insert, update, delete on public.issuer_filer_categories, public.issuer_filing_profiles to service_role;

-- ---------------------------------------------------------------- bucket reconcile-raw (§3.1)
-- Content-addressed raw evidence (<kind>/<sha256>.<ext>), private, no object-level policy, so only
-- the service role reaches it. Uploads use upsert:false; 409 means the bytes are already stored.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reconcile-raw', 'reconcile-raw', false, 52428800,
        array['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

exec
/bin/zsh -lc "find . -name AGENTS.override.md -o -name AGENTS.md; sed -n '1,115p' src/lib/entities/identifiers.integration.test.ts; sed -n '330,390p' src/lib/entities/identifiers.integration.test.ts; sed -n '16,52p' supabase/migrations/20261107090000_identifiers_and_dq.sql; rg 'received_date|valid_from_method' src/lib/entities/types.ts src/lib/entities/securities.test.ts; cat vitest.config.ts; ls .claude; git log -4 --oneline" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 77ms:
// src/lib/entities/identifiers.integration.test.ts
// Plan 3 Task 1 (spec 3 §3.1, §9.2): migration 20261107090000 on real PostgreSQL. Task 1a covers the
// guarded column additions and their one-time backfill (a seeded pre-migration database is upgraded,
// new evidence is written, then the migration is replayed and must not rewrite it), every new
// constraint, service-role-only privileges on the new tables and the reconcile-raw bucket. Task 1b
// appends resolve_identifier_claim, the calendar pass functions and the topology guard.
// test:db builds a fresh cluster per run, so rows are not cleaned up (every test uses its own
// issuers and tickers). Calendar passes are the one shared resource (one open pass per market):
// every test that touches them runs inside withCalendarLock, a session advisory lock shared with
// Task 18's calendar.integration.test.ts.
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261107090000_identifiers_and_dq.sql';
const VERSION='20261107090000';
const NEW_TABLES=['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'];
const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
const SHA='a'.repeat(64);

// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
  }finally{c.release();}
 }
}

type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);

// The bootstrap scripts/s4/local-db.ts runs before the migrations (roles are cluster-wide and exist).
const BOOTSTRAP=`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;

/** A throwaway database in the same cluster, migrated up to (not including) `version`; dropped afterwards. */
async function withPreMigrationDatabase(adminUrl:string,version:string,body:(db:Pool)=>Promise<void>):Promise<void>{
 const name='df3_upgrade_'+randomBytes(4).toString('hex');
 const root=new Pool({connectionString:adminUrl,max:1});
 await root.query(`create database ${name}`);
 const url=new URL(adminUrl);url.pathname=`/${name}`;
 const db=new Pool({connectionString:url.toString(),max:2});
 try{
  await db.query(BOOTSTRAP);
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<version).sort()){
   try{await db.query(readFileSync(join('supabase/migrations',f),'utf8'));}
   catch(e){throw new Error(`pre-migration ${f}: ${(e as Error).message}`);}
  }
  await body(db);
 }finally{
  await db.end();
  await root.query(`drop database if exists ${name} with (force)`);
  await root.end();
 }
}

/**
 * Calendar passes are one-open-per-market shared state. Every suite that touches them holds this
 * session advisory lock for the body and closes any open pass before and after, so concurrent
 * suites never see each other's leases (Task 18b's calendar.integration.test.ts uses the same key).
 * Plan 3 advisory-lock registry (接口对齐记录 #4): 724311001 = CALENDAR_TEST_LOCK (test-only, session);
 * the SQL function claim_calendar_pass uses pg_advisory_xact_lock(hashtext('dq_calendar_pass:'||market)).
 */
const CALENDAR_TEST_LOCK=724_311_001;
async function withCalendarLock(pool:Pool,body:()=>Promise<void>):Promise<void>{
 const c=await pool.connect();
 try{
  await c.query('select pg_advisory_lock($1)',[CALENDAR_TEST_LOCK]);
  const close=()=>c.query(`update public.dq_calendar_passes set status='complete_with_failures',finished_at=clock_timestamp() where finished_at is null`);
  await close();
  try{await body();}finally{await close();}
 }finally{
  await c.query('select pg_advisory_unlock($1)',[CALENDAR_TEST_LOCK]).catch(()=>{});
  c.release();
 }
}

let admin:Pool;
let adminUrl:string;
const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
const insertRow=(table:string,row:Record<string,unknown>)=>{
 const cols=Object.keys(row);
 return admin.query(`insert into public.${table}(${cols.join(',')}) values(${cols.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
};
const issuer=async(name='ZZ Ident Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
const ticker=async(market='US')=>{
 const t='ZZ'+hex(4);
 const r=await q(`insert into public.stocks_universe(ticker,name,market) values($1,'Ident Test',$2) on conflict (ticker) do nothing returning ticker`,[t,market]);
 if(r.length!==1)throw new Error('ZZ test ticker collided');
 return t;
};
const batch=async(dataset='dq.calendar.cn',producer='filing-calendar')=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,$2,$3)`,[id,producer,dataset]);return id;};
/** issuer_securities row with source 'test' (so the default method is first_observed) plus `extra` columns. */
const sec=(iss:string,t:string,from:string,to:string|null,extra:Record<string,unknown>={})=>insertRow('issuer_securities',{issuer_id:iss,ticker:t,valid_from:from,valid_to:to,source:'test',...extra});

beforeAll(async()=>{
 if(!enabled)return;
 adminUrl=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl;
 admin=new Pool({connectionString:adminUrl});
   expect((await fails(pass('HK'))).message).toMatch(/dq_calendar_passes_market_check/);
   expect((await fails(pass('US','complete'))).message).toMatch(/dcp_finished_iff_terminal/);
   expect((await fails(pass('US','running',new Date().toISOString()))).message).toMatch(/dcp_finished_iff_terminal/);
   expect((await fails(pass('US','paused',new Date().toISOString()))).message).toMatch(/dq_calendar_passes_status_check/);
   const member=async(over:Record<string,unknown>)=>insertRow('dq_calendar_pass_members',{market:'CN',pass_id:open,issuer_id:await issuer(),...over});
   const first=await issuer();
   await member({issuer_id:first});
   expect((await fails(member({issuer_id:first}))).message).toMatch(/dq_calendar_pass_members_pkey/);
   expect((await fails(member({attempts:-1}))).message).toMatch(/dq_calendar_pass_members_attempts_check/);
   expect((await fails(member({state:'claimed'}))).message).toMatch(/dq_calendar_pass_members_state_check/);
   expect((await fails(member({pass_id:randomUUID()}))).message).toMatch(/dq_calendar_pass_members_pass_fkey/);
   await member({state:'failed',attempts:3,last_error:'sec_unavailable'});
  });
 });

 it('dq_filing_expectations: every dfe_* combination, the other checks and the key',async()=>{
  const b=await batch('dq.calendar.us');const iss=await issuer();
  let n=0;
  // each row gets its own period_end unless the case sets one, so only the asserted constraint can fail
  const exp=(over:Record<string,unknown>)=>{
   n++;
   return insertRow('dq_filing_expectations',{issuer_id:iss,market:'US',report_kind:'10-K',period_end:`${2010+n}-12-31`,deadline_state:'statutory',due_date:'2027-03-01',due_rule:'10-K.large_accelerated.60d',upstream_lookup:'ok',disclosure_state:'pending',computed_at:new Date().toISOString(),batch_id:b,...over});
  };
  const filed=()=>({received_filing_id:randomUUID(),received_date:'2027-02-01'});
  await exp({});                                                                                    // statutory, pending
  await exp({deadline_state:'no_rule',due_date:null,due_rule:'none.src_only'});                       // no_rule, pending
  await exp({deadline_state:'no_rule',due_date:null,due_rule:'none.src_only',disclosure_state:'received',...filed()});   // no_rule rows may be received
  await exp({deadline_state:'estimated',period_end_estimated:true,detail:JSON.stringify({estimated_due_passed:true})});   // estimated past due stays pending
  await exp({disclosure_state:'overdue'});
  await exp({disclosure_state:'received_late',received_filing_id:randomUUID(),received_date:'2027-03-05'});
  await exp({disclosure_state:'filed_not_ingested',upstream_filed_date:'2027-02-20'});
  await exp({upstream_lookup:'unavailable',disclosure_state:'unknown_upstream'});
  await exp({upstream_lookup:'unavailable',disclosure_state:'received',...filed()});                  // received although the lookup was unavailable
  await exp({market:'CN',report_kind:'annual',upstream_lookup:'not_applicable',expected_date:'2027-04-20'});
  await exp({period_end:'2099-06-30'});
  const bad=async(over:Record<string,unknown>,constraint:RegExp)=>expect((await fails(exp(over))).message).toMatch(constraint);
  await bad({deadline_state:'no_rule'},/dfe_due_iff_known/);                                        // no_rule with a due date
  await bad({due_date:null},/dfe_due_iff_known/);                                                   // statutory without one
  await bad({disclosure_state:'received'},/dfe_received_iff/);                                      // received without the filing
  await bad({upstream_lookup:'unavailable',disclosure_state:'pending',received_filing_id:randomUUID()},/dfe_received_pair/);   // filing without a date
  await bad({upstream_lookup:'unavailable',disclosure_state:'pending',received_date:'2027-02-01'},/dfe_received_pair/);       // date without a filing
  await bad(filed(),/dfe_received_iff/);                                                            // pending yet carries a filing
  await bad({disclosure_state:'received',received_filing_id:randomUUID()},/dfe_received_iff/);     // missing received_date
  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'received_late',...filed()},/dfe_late_requires_due/);
  await bad({deadline_state:'estimated',disclosure_state:'overdue'},/dfe_overdue_requires_statutory/);
  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'overdue'},/dfe_overdue_requires_statutory/);
  await bad({disclosure_state:'unknown_upstream'},/dfe_unknown_upstream_iff/);                      // lookup was ok
  await bad({upstream_lookup:'unavailable'},/dfe_unknown_upstream_iff/);                            // unavailable, nothing received, not unknown_upstream
  await bad({market:'HK'},/dq_filing_expectations_market_check/);
  await bad({report_kind:'8-K'},/dq_filing_expectations_report_kind_check/);
  await bad({deadline_state:'late'},/dq_filing_expectations_deadline_state_check/);
  await bad({disclosure_state:'missing'},/dq_filing_expectations_disclosure_state_check/);
  await bad({upstream_lookup:'maybe'},/dq_filing_expectations_upstream_lookup_check/);
  await bad({detail:'[]'},/dq_filing_expectations_detail_object/);
  await bad({batch_id:randomUUID()},/dq_filing_expectations_batch_id_fkey/);
  await bad({period_end:'2099-06-30'},/dq_filing_expectations_pkey/);
 });

 it('issuer_filer_categories and issuer_filing_profiles: checks and composite keys',async()=>{
  const iss=await issuer();
  const cat=(over:Record<string,unknown>)=>insertRow('issuer_filer_categories',{issuer_id:iss,fiscal_year:2025,acceleration:'large_accelerated',smaller_reporting:false,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'0000320193-25-000079',evidence_sha256:SHA,as_of:'2026-11-05',...over});

-- ---------------------------------------------------------------- issuer_securities: window-end methods (§3.1, §4.3.1)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_securities' and column_name = 'valid_from_method') then
    alter table public.issuer_securities
      add column valid_from_method text not null default 'first_observed',
      add column valid_to_method text;
    -- One-time backfill: curated rows were entered by hand; a closed row of any other source has no
    -- evidence for its end (an observation bound, 'unrecorded').
    update public.issuer_securities set valid_from_method = 'curated' where source = 'curated';
    update public.issuer_securities set valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end where valid_to is not null;
  end if;
end $$;
alter table public.issuer_securities
  drop constraint if exists issuer_securities_valid_from_method_check,
  drop constraint if exists issuer_securities_valid_to_method_check,
  drop constraint if exists issuer_securities_to_method_iff_to,
  add constraint issuer_securities_valid_from_method_check check (valid_from_method in ('first_observed','listing_date','ticker_change','curated')),
  add constraint issuer_securities_valid_to_method_check check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded')),
  add constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null));

-- ---------------------------------------------------------------- issuer_identifier_claims: claim/1 (§3.1, §4.2.1)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_identifier_claims' and column_name = 'op') then
    -- Existing rows become op='legacy', target_key='', detail='{}' through the defaults: they cannot be
    -- resolved by the route, only by runbook §4 SQL or rejection.
    alter table public.issuer_identifier_claims
      add column op text not null default 'legacy',
      add column target_key text not null default '',
      add column detail jsonb not null default '{}',
      add column resolved_by uuid,
      add column resolved_at timestamptz;
  end if;
end $$;
alter table public.issuer_identifier_claims alter column confidence drop not null;
alter table public.issuer_identifier_claims
  drop constraint if exists issuer_identifier_claims_id_type_check,
rg: src/lib/entities/securities.test.ts: No such file or directory (os error 2)
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
agents
launch.json
scratch
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-mFoTFdGg' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-8KG4Wl8Z' (errno=Operation not permitted)
0fd6c74 fix(dq): attachSecurity writes valid_from_method; received filing and date must travel together
52c5414 feat(dq): migration one schema — window methods, claim/1 columns, reconcile and calendar tables, reconcile-raw bucket
0747088 docs(plan): data foundation 3 plan final (Codex plan round 4 V1 applied; ready for execution)
8cf3215 docs(plan): data foundation 3 plan draft 4 (Codex plan round 3 R1-R3 applied)

codex
The changes correctly preserve curated security-window provenance and enforce paired filing IDs and receipt dates. No actionable regressions were identified in the diff or surrounding code; database integration tests were not run.
The changes correctly preserve curated security-window provenance and enforce paired filing IDs and receipt dates. No actionable regressions were identified in the diff or surrounding code; database integration tests were not run.
