OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b38b-5e01-7543-ac4f-bba5999add74
--------
user
commit 2fd099b
2026-11-07T01:06:59.733334Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat 2fd099b; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2123ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-pRIw1Lb7' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-EaabF39j' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/18a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-aLzAAvUj' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-PUyRSMHB' (errno=Operation not permitted)
commit 2fd099b76e773a60d8ba142b84bfd39dfa196f27
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:06:44 2026 -0800

    feat(dq): filing-calendar sync over the pass protocol (profiles, SEC/Tushare upstream, fenced writes, receipt)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 src/lib/dq/calendar-sync.test.ts | 255 +++++++++++++++++++++++++++++++++++++++
 src/lib/dq/calendar-sync.ts      | 245 +++++++++++++++++++++++++++++++++++++
 2 files changed, 500 insertions(+)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do [ ! -f "$p" ] || cat "$p"; done; ls -a; git show 2fd099b -- src/lib/dq/calendar-sync.ts src/lib/dq/calendar-sync.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Smya0aDo' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YK6K9Mbh' (errno=Operation not permitted)
commit 2fd099b76e773a60d8ba142b84bfd39dfa196f27
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:06:44 2026 -0800

    feat(dq): filing-calendar sync over the pass protocol (profiles, SEC/Tushare upstream, fenced writes, receipt)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/calendar-sync.test.ts b/src/lib/dq/calendar-sync.test.ts
new file mode 100644
index 00000000..06378378
--- /dev/null
+++ b/src/lib/dq/calendar-sync.test.ts
@@ -0,0 +1,255 @@
+// src/lib/dq/calendar-sync.test.ts
+import {describe,expect,it} from 'vitest';
+import {memoryTableClient} from '../db/memory-table-client';
+import {TushareError} from '../data/sources/tushare';
+import type {TushareRaw} from '../data/sources/tushare';
+import type {Budget,CalendarFiling,Market} from '../facts/types';
+import {memoryRawStore} from './raw-store';
+import type {ExpectationRow} from './calendar';
+import {CalendarPassError,applyUpstreamCoverage,expectationArgs,parseDisclosureDate,previewCalendar,profileFromSubmissions,runCalendarSync,toCalendarPassError} from './calendar-sync';
+import type {CalendarPassDb,CalendarPassToken,CalendarSyncDeps} from './calendar-sync';
+import type {SubmissionsView} from './filer-categories';
+
+const A='00000000-0000-4000-8000-0000000000a1',B='00000000-0000-4000-8000-0000000000a2',C='00000000-0000-4000-8000-0000000000a3';
+const NOW=new Date('2026-11-05T01:00:00Z');
+const budget=(ms=300_000):Budget=>({remainingMs:()=>ms,signal:new AbortController().signal});
+
+/** In-memory model of the four pass functions (same rules as the SQL: one unfinished pass per market, lease, fence on every write). */
+function memoryPasses(tables:ReturnType<typeof memoryTableClient>,scope:()=>string[]){
+ let leaseValid=true;
+ const passes:{market:Market;pass_id:string;claimed_by:string;finished:boolean;status:string}[]=[];
+ const fence=(t:CalendarPassToken)=>{const p=passes.find(x=>x.market===t.market&&x.pass_id===t.pass_id);if(!p||p.finished||p.claimed_by!==t.batch_id||!leaseValid)throw new CalendarPassError('fence_failed');return p;};
+ const member=async(t:CalendarPassToken,issuer:string)=>(await tables.select('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer}))[0];
+ const db:CalendarPassDb&{expire():void;holdBy(market:Market,batch:string):Promise<void>;passes:typeof passes}={
+  passes,
+  expire(){leaseValid=false;},
+  async holdBy(market,batch){await db.claimPass(market,batch);},
+  async claimPass(market,batch){
+   const open=passes.find(p=>p.market===market&&!p.finished);
+   if(open){if(leaseValid&&open.claimed_by!==batch)return null;if(!leaseValid){open.claimed_by=batch;leaseValid=true;return {market,pass_id:open.pass_id,batch_id:batch};}return null;}
+   const pass_id=`p${passes.length+1}`;passes.push({market,pass_id,claimed_by:batch,finished:false,status:'running'});leaseValid=true;
+   await tables.insert('dq_calendar_passes',{market,pass_id,started_at:NOW.toISOString(),finished_at:null,status:'running'});
+   for(const issuer_id of scope())await tables.insert('dq_calendar_pass_members',{market,pass_id,issuer_id,state:'pending',attempts:0});
+   return {market,pass_id,batch_id:batch};
+  },
+  async replaceExpectations(issuer,market,rows,t){
+   fence(t);const m=await member(t,issuer);
+   if(!m||!(m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<3)))throw new CalendarPassError('member_not_claimable');
+   for(const r of tables.rows('dq_filing_expectations').filter(r=>r.issuer_id===issuer&&r.market===market))await tables.update('dq_filing_expectations',{issuer_id:issuer,market,report_kind:r.report_kind,period_end:r.period_end},{deleted:true});
+   for(const r of rows)await tables.insert('dq_filing_expectations',{...r,batch_id:t.batch_id});
+   await tables.update('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer},{state:'done'});
+   return rows.length;
+  },
+  async failMember(t,issuer,error){fence(t);const m=await member(t,issuer);await tables.update('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer},{state:'failed',attempts:Number(m.attempts)+1,last_error:error});},
+  async finishPass(t){
+   const p=fence(t);const ms=await tables.select('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id});
+   if(ms.some(m=>m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<3)))throw new CalendarPassError('pass_incomplete');
+   p.finished=true;p.status=ms.every(m=>m.state==='done')?'complete':'complete_with_failures';
+   await tables.update('dq_calendar_passes',{market:t.market,pass_id:t.pass_id},{status:p.status,finished_at:NOW.toISOString()});
+   return p.status as 'complete'|'complete_with_failures';
+  },
+ };
+ return db;
+}
+
+const view=(p:Partial<SubmissionsView>={}):SubmissionsView=>({cik10:'0000000001',sha256:'sub-sha',category:'Large accelerated filer',fiscalYearEnd:'1231',entries:[
+ {accessionNumber:'0000000001-26-000020',filingDate:'2026-08-04',reportDate:'2026-06-30',form:'10-Q',primaryDocument:'q2.htm',isInlineXBRL:true},
+ {accessionNumber:'0000000001-26-000005',filingDate:'2026-02-20',reportDate:'2025-12-31',form:'10-K',primaryDocument:'k.htm',isInlineXBRL:true},
+ {accessionNumber:'0000000001-24-000001',filingDate:'2024-01-10',reportDate:'2023-09-30',form:'10-Q',primaryDocument:'old.htm',isInlineXBRL:true}],...p});
+// complete C4 CalendarFiling (FilingRow incl. acceptance_source) before the override spread (plan audit P9)
+const published=(issuer:string,form:CalendarFiling['form_type'],periodEnd:string,available:string,p:Partial<CalendarFiling>={}):CalendarFiling=>({filing_id:`f-${issuer.slice(-2)}-${periodEnd}`,issuer_id:issuer,market:'US',source:'edgar',origin:'sec',form_type:form,fiscal_year:null,fiscal_period:null,period_end:periodEnd,available_date:available,source_ref:`ref-${periodEnd}`,url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:`${available}T00:00:00Z`,run_status:'published',accepted_at:null,acceptance_source:null,...p});
+
+async function harness(o:{market?:Market;members?:string[];filings?:Record<string,CalendarFiling[]>;submissions?:(cik:string)=>Promise<SubmissionsView>;disclosure?:(ts:string)=>Promise<TushareRaw>;budgetMs?:number}={}){
+ const market=o.market??'US';const members=o.members??[A,B];
+ const tables=memoryTableClient({issuer_filing_profiles:['issuer_id','market'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
+ for(const [i,id] of members.entries()){
+  await tables.insert('issuers',{issuer_id:id,canonical_name_en:`Issuer ${i}`,status:'active'});
+  await tables.insert('fact_sync_scope',{issuer_id:id,market,priority:10,fetch_key:market==='US'?`000000000${i+1}`:`60000${i}.SH`});
+  if(market==='US')await tables.insert('issuer_securities',{issuer_id:id,ticker:`T${i}`,is_primary:true,valid_from:'2020-01-01',valid_to:null});
+  await tables.insert('issuer_filer_categories',{issuer_id:id,fiscal_year:2024,acceleration:'large_accelerated',smaller_reporting:null,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'x',evidence_sha256:'e',as_of:'2026-11-01'});
+  await tables.insert('issuer_filer_categories',{issuer_id:id,fiscal_year:2025,acceleration:'large_accelerated',smaller_reporting:null,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'y',evidence_sha256:'e',as_of:'2026-11-01'});
+ }
+ const passes=memoryPasses(tables,()=>members);
+ const raw=memoryRawStore();
+ const deps:CalendarSyncDeps={tables,passes,raw,
+  db:{filingsForCalendar:async(issuer,_m,opts)=>{expect(opts.fromPeriodEnd).toBe('2017-11-23');return o.filings?.[issuer]??[];}},
+  submissions:o.submissions??(async()=>view()),
+  disclosureDate:o.disclosure??(async()=>{throw new TushareError(-1,'TUSHARE_TOKEN not configured');}),
+  now:()=>NOW,budget:budget(o.budgetMs),codeVersion:'c'.repeat(40)};
+ return {deps,tables,passes,raw,market};
+}
+const rowsOf=(tables:ReturnType<typeof memoryTableClient>,issuer:string)=>tables.rows('dq_filing_expectations').filter(r=>r.issuer_id===issuer&&!r.deleted) as unknown as ExpectationRow[];
+
+describe('runCalendarSync (US)',()=>{
+ it('claims a pass, writes profiles and rows for every member, settles complete and records fresh',async()=>{
+  const h=await harness({filings:{[A]:[published(A,'10-Q','2026-06-30','2026-08-03')]}});
+  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(r).toMatchObject({status:'success',passId:'p1',passStatus:'complete',counts:{fetched:2,inserted:2,failed:0}});
+  expect(h.tables.rows('issuer_filing_profiles').map(p=>[p.issuer_id,p.regime,p.fiscal_year_end,p.week52_pattern,p.category_raw_current,p.source_sha256])).toEqual([[A,'10-K','1231',false,'Large accelerated filer','sub-sha'],[B,'10-K','1231',false,'Large accelerated filer','sub-sha']]);
+  const a=rowsOf(h.tables,A);
+  expect(a).toHaveLength(6);
+  expect(a.find(x=>x.period_end==='2026-06-30')).toMatchObject({disclosure_state:'received',upstream_lookup:'ok'});
+  expect(rowsOf(h.tables,B).find(x=>x.period_end==='2026-06-30')).toMatchObject({disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-08-04'});
+  expect(a[0].detail).toMatchObject({display:{ticker:'T0',name:'Issuer 0'},upstream_sha256:'sub-sha',rules_version:'filing-calendar/1'});
+  expect(r.detail).toMatchObject({pass_id:'p1',issuers_done:2,rows:12,upstream_unavailable:0,no_category:0,no_fiscal_year_end:0,no_profile:0});
+  expect(r.detail.by_disclosure_state.received).toBe(1);
+  expect(h.tables.rows('dq_freshness')[0]).toMatchObject({dataset:'dq.calendar.us',expected_cadence:'daily',status:'fresh'});
+  expect(h.tables.rows('ingest_batches')[0]).toMatchObject({producer:'filing-calendar',dataset:'dq.calendar.us',triggered_by:'cron',tool_versions:{rules:'filing-calendar/1',market:'US'}});
+ });
+ it('a lease held by another worker → nothing is processed, skipped_summary(pass_claimed), success',async()=>{
+  const h=await harness();
+  await h.passes.holdBy('US','other-batch');
+  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(r).toMatchObject({passId:null,passStatus:null,status:'success',counts:{fetched:0}});
+  expect(r.errors).toEqual([{code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})}]);
+  expect(h.tables.rows('dq_filing_expectations')).toHaveLength(0);
+  h.passes.expire();
+  const again=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(again).toMatchObject({passId:'p1',passStatus:'complete'});   // expired lease taken over
+ });
+ it('SEC unavailable → unknown_upstream rows from the stored profile, sec_unavailable makes the batch partial; no profile at all → no rows',async()=>{
+  const h=await harness({submissions:async()=>{throw new Error('sec_unavailable: http_503');}});
+  await h.tables.upsert('issuer_filing_profiles',{issuer_id:A,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'old',as_of:'2026-10-01'},'issuer_id,market');
+  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(r.status).toBe('partial');expect(r.passStatus).toBe('complete');
+  expect(rowsOf(h.tables,A).every(x=>x.disclosure_state==='unknown_upstream'&&x.profile_as_of==='2026-10-01')).toBe(true);
+  expect(rowsOf(h.tables,B)).toHaveLength(0);
+  expect(r.detail).toMatchObject({no_profile:1,upstream_unavailable:2});
+  expect(r.errors.filter(e=>e.code==='sec_unavailable').map(e=>e.key)).toEqual([A,B]);
+ });
+ it('upstream coverage is per period: only uncovered periods without evidence read as unavailable (plan audit Q1)',async()=>{
+  // earliest entry 2026-02-20: periods ending after it are covered; older ones are not
+  const h=await harness({members:[A],submissions:async()=>view({entries:view().entries.slice(0,2)})});
+  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  const rows=rowsOf(h.tables,A);
+  const at=(pe:string)=>rows.find(x=>x.period_end===pe)!;
+  expect(at('2026-06-30')).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-08-04'});
+  expect(at('2026-09-30')).toMatchObject({upstream_lookup:'ok',disclosure_state:'pending'});          // covered, nothing filed yet
+  expect(at('2026-09-30').detail.upstream_incomplete).toBeUndefined();
+  expect(at('2025-12-31')).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-02-20'});   // uncovered, positive evidence kept
+  const old=rows.filter(x=>x.period_end<'2025-12-31');
+  expect(old.length).toBeGreaterThan(0);
+  expect(old.every(x=>x.upstream_lookup==='unavailable'&&x.disclosure_state==='unknown_upstream'&&x.detail.upstream_incomplete===true&&x.detail.upstream_covered_from==='2026-02-20')).toBe(true);
+ });
+ it('20-F with known 2025/2024 filings and incomplete older history keeps the 2025 and 2024 evidence (plan audit Q1 regression)',async()=>{
+  const f20=view({fiscalYearEnd:'1231',category:null,entries:[
+   {accessionNumber:'0000000001-26-000003',filingDate:'2026-04-15',reportDate:'2025-12-31',form:'20-F',primaryDocument:'f25.htm',isInlineXBRL:true},
+   {accessionNumber:'0000000001-25-000004',filingDate:'2025-04-20',reportDate:'2024-12-31',form:'20-F',primaryDocument:'f24.htm',isInlineXBRL:true}]});
+  const h=await harness({members:[A],submissions:async()=>f20});
+  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  const rows=rowsOf(h.tables,A);
+  expect(rows.map(x=>x.period_end)).toEqual(['2025-12-31','2024-12-31','2023-12-31','2022-12-31','2021-12-31','2020-12-31']);   // six annual periods reach 2020
+  expect(rows.every(x=>x.report_kind==='20-F')).toBe(true);
+  expect(rows[0]).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-04-15'});   // was unknown_upstream before Q1
+  expect(rows[1]).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2025-04-20'});
+  expect(rows.slice(2).every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable'&&x.detail.upstream_incomplete===true)).toBe(true);
+  expect(rows.some(x=>x.disclosure_state==='overdue')).toBe(false);
+ });
+ it('applyUpstreamCoverage: received rows and covered rows unchanged; an empty list leaves only evidence-bearing rows',()=>{
+  const row=(pe:string,state:ExpectationRow['disclosure_state'],o:Partial<ExpectationRow>={}):ExpectationRow=>({issuer_id:A,market:'US',report_kind:'10-Q',period_end:pe,period_end_estimated:false,deadline_state:'statutory',due_date:null,due_rule:'r',expected_date:null,upstream_lookup:'ok',upstream_filed_date:null,disclosure_state:state,received_filing_id:null,received_date:null,profile_as_of:null,detail:{estimated_due_passed:true},...o});
+  const rows=[row('2026-06-30','overdue'),row('2025-06-30','received',{received_filing_id:'f',received_date:'2025-08-01'}),row('2025-03-31','overdue')];
+  const out=applyUpstreamCoverage(rows,[{form:'10-Q',reportDate:'2025-12-31',filingDate:'2026-02-01',accessionNumber:'a'}]);
+  expect(out[0]).toBe(rows[0]);expect(out[1]).toBe(rows[1]);
+  expect(out[2]).toMatchObject({disclosure_state:'unknown_upstream',upstream_lookup:'unavailable',detail:{upstream_incomplete:true,upstream_covered_from:'2026-02-01'}});
+  expect(out[2].detail.estimated_due_passed).toBeUndefined();
+  expect(applyUpstreamCoverage(rows,[]).map(r=>r.disclosure_state)).toEqual(['unknown_upstream','received','unknown_upstream']);
+ });
+ it('budget and limit: unprocessed members keep the pass running; a later run finishes it',async()=>{
+  const h=await harness();
+  const first=await runCalendarSync(h.deps,{market:'US',limit:1,triggeredBy:'cron'});
+  expect(first).toMatchObject({passStatus:'running',counts:{fetched:1,inserted:1}});
+  expect(h.tables.rows('dq_freshness')).toHaveLength(0);
+  const low=await harness({budgetMs:59_000});
+  const none=await runCalendarSync(low.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(none.errors).toContainEqual({code:'deadline_hit',message:JSON.stringify({not_started:2})});
+  h.passes.expire();   // the first run's lease lapses before the next run (cron is hours apart)
+  const second=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(second).toMatchObject({passId:'p1',passStatus:'complete',counts:{fetched:1}});
+ });
+ it('a failing member is failed (attempts+1), retried by later runs, and the pass ends complete_with_failures after 3 attempts',async()=>{
+  let calls=0;
+  const h=await harness({members:[A,B]});
+  h.deps.db={filingsForCalendar:async(issuer)=>{if(issuer===B){calls++;throw new Error('boom');}return [];}};
+  const r1=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(r1).toMatchObject({passStatus:'running',status:'partial',counts:{fetched:2,inserted:1,failed:1}});
+  expect(r1.errors).toContainEqual({code:'member_failed',key:B,message:'boom'});
+  h.passes.expire();const r2=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(r2.counts.fetched).toBe(1);
+  h.passes.expire();const r3=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(r3.passStatus).toBe('complete_with_failures');
+  expect(calls).toBe(3);
+  expect(h.tables.rows('dq_freshness')[0]).toMatchObject({dataset:'dq.calendar.us',consecutive_errors:1});
+ });
+ it('fence_failed on a write stops the worker immediately',async()=>{
+  const h=await harness();
+  const real=h.passes.replaceExpectations;
+  h.passes.replaceExpectations=async(...a)=>{h.passes.expire();return real(...a);};
+  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
+  expect(r.passStatus).toBe('running');
+  expect(r.errors).toContainEqual({code:'fence_failed',key:A});
+  expect(r.counts.fetched).toBe(1);
+ });
+});
+
+describe('runCalendarSync (CN)',()=>{
+ it('without TUSHARE_TOKEN every unreceived row is unknown_upstream and the reason is summarised',async()=>{
+  const h=await harness({market:'CN',members:[C]});
+  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
+  expect(r).toMatchObject({status:'success',passStatus:'complete'});
+  const rows=rowsOf(h.tables,C);
+  expect(rows.map(x=>x.report_kind)).toEqual(['q3','semiannual','q1','annual','q3','semiannual']);
+  expect(rows.every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable'&&x.deadline_state==='statutory'&&x.expected_date===null)).toBe(true);
+  expect(rows[0].detail).toMatchObject({schedule_unavailable:'no_token',display:{ticker:'600000.SH',name:'Issuer 0'}});
+  expect(r.errors).toContainEqual({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify({no_token:1})});
+  expect(h.tables.rows('issuer_filing_profiles')[0]).toMatchObject({regime:'cn',fiscal_year_end:'1231',source:'cn_statutory'});
+ });
+ it('a real response is kept in the bucket with its sha256 but stays unavailable until the semantics are verified',async()=>{
+  const bytes=new TextEncoder().encode('{"code":0}');
+  const h=await harness({market:'CN',members:[C],disclosure:async(ts)=>{expect(ts).toBe('600000.SH');return {bytes,sha256:'x',httpStatus:200,requestId:null,code:0,msg:'',fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600000.SH','20260701','20260930','20261028',null,null]],hasMore:false};}});
+  await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
+  expect([...h.raw.objects.keys()].filter(k=>!k.endsWith('.meta.json'))).toHaveLength(1);   // landed raw-store also writes a .meta.json sidecar
+  const rows=rowsOf(h.tables,C);
+  expect(rows.every(x=>x.upstream_lookup==='unavailable'&&x.detail.schedule_unavailable==='unverified'&&typeof x.detail.upstream_sha256==='string')).toBe(true);
+ });
+ it('a Tushare API error code (积分不足) is unavailable with the code as reason',async()=>{
+  const h=await harness({market:'CN',members:[C],disclosure:async()=>({bytes:new Uint8Array(),sha256:'x',httpStatus:200,requestId:null,code:40203,msg:'',fields:[],items:[],hasMore:false})});
+  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
+  expect(r.errors).toContainEqual({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify({api_code_40203:1})});
+  expect(h.raw.objects.size).toBe(0);
+ });
+});
+
+describe('previewCalendar',()=>{
+ it('computes rows for scope members without a batch, a pass or a profile write',async()=>{
+  const h=await harness();
+  const out=await previewCalendar(h.deps,{market:'US',limit:1});
+  expect(out.map(o=>[o.issuerId,o.rows.length])).toEqual([[A,6]]);
+  expect(h.tables.rows('ingest_batches')).toHaveLength(0);
+  expect(h.tables.rows('issuer_filing_profiles')).toHaveLength(0);
+  expect(h.tables.rows('dq_calendar_passes')).toHaveLength(0);
+ });
+});
+
+describe('helpers',()=>{
+ it('maps SQL messages to pass error codes',()=>{
+  expect(toCalendarPassError({message:'fence_failed'}).code).toBe('fence_failed');
+  expect(toCalendarPassError({message:'pass_incomplete'}).code).toBe('pass_incomplete');
+  expect(toCalendarPassError({message:'permission denied'}).code).toBe('unknown');
+ });
+ it('expectationArgs drops issuer_id/market only',()=>{
+  const row={issuer_id:A,market:'US',report_kind:'10-K',period_end:'2025-12-31'} as unknown as ExpectationRow;
+  expect(expectationArgs([row])).toEqual([{report_kind:'10-K',period_end:'2025-12-31'}]);
+ });
+ it('parses disclosure_date rows by field name, dates to ISO',()=>{
+  expect(parseDisclosureDate({fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600519.SH','20260115','20251231','20260403','20260403',null],['600519.SH',null,'bad',null,null,null]]}))
+   .toEqual([{end_date:'2025-12-31',ann_date:'2026-01-15',pre_date:'2026-04-03',actual_date:'2026-04-03',modify_date:null}]);
+ });
+ it('profile: regime from the latest annual form, 52/53-week detection, no annual form → null',()=>{
+  expect(profileFromSubmissions(A,view(),'2026-11-05')).toMatchObject({regime:'10-K',fiscal_year_end:'1231',week52_pattern:false});
+  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0927',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
+  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0930',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
+  expect(profileFromSubmissions(A,view({entries:[{accessionNumber:'f',filingDate:'2026-04-01',reportDate:'2025-12-31',form:'20-F',primaryDocument:'f',isInlineXBRL:true},{accessionNumber:'k',filingDate:'2025-03-01',reportDate:'2024-12-31',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.regime).toBe('20-F');
+  expect(profileFromSubmissions(A,view({entries:[]}),'2026-11-05')).toBeNull();
+  expect(profileFromSubmissions(A,view({fiscalYearEnd:'1331'}),'2026-11-05')?.fiscal_year_end).toBeNull();
+ });
+});
diff --git a/src/lib/dq/calendar-sync.ts b/src/lib/dq/calendar-sync.ts
new file mode 100644
index 00000000..d7fee329
--- /dev/null
+++ b/src/lib/dq/calendar-sync.ts
@@ -0,0 +1,245 @@
+// src/lib/dq/calendar-sync.ts
+// Filing-calendar writer (spec §6.2; pass protocol T3/U1 via the migration-one functions). One
+// ingest_batches row per run (producer filing-calendar, dataset dq.calendar.us|cn). A run claims the
+// market's pass (claim_calendar_pass: a new pass freezes its members; an expired lease is taken over;
+// a lease held by another worker → this run does nothing, skipped_summary(pass_claimed)). Within the
+// budget it processes pending members, then failed members with attempts < 3, in issuer_id order:
+// profile write (issuer_filing_profiles), inputs (profile + issuer_filer_categories + filingsForCalendar
+// + upstream list) → computeExpectations → replace_filing_expectations (atomic replace + member done).
+// A member whose inputs fail → fail_calendar_member. Any fence_failed stops this worker at once.
+// With nothing left to process the pass is settled by finish_calendar_pass (from persisted state only)
+// and freshness is recorded: complete → ok, complete_with_failures or a pass older than 2 days → not ok.
+// Upstream: US = SEC submissions (raw kept by the fetcher, Task 6); CN = Tushare disclosure_date via
+// tushareCallRaw, response bytes into reconcile-raw (T15). Until the disclosure_date semantics are
+// verified against a real response (CN_DISCLOSURE_VERIFIED), CN rows keep upstream_lookup='unavailable'.
+import type {SupabaseClient} from '@supabase/supabase-js';
+import {selectAll} from '../db/table-client';
+import type {Row,TableClient} from '../db/table-client';
+import {isCurrentSecurity} from '../entities/resolve';
+import {TushareError} from '../data/sources/tushare';
+import type {TushareRaw} from '../data/sources/tushare';
+import type {Budget,FactsDb,Market} from '../facts/types';
+import {emptyCounts,finishBatch,startBatch} from './batches';
+import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
+import {recordAttempt} from './freshness';
+import {DATASETS} from './datasets';
+import type {RawStore} from './raw-store';
+import {CALENDAR_RULES_VERSION,computeExpectations,filingsWindowStart} from './calendar';
+import type {CalendarUpstream,CnScheduleRow,ExpectationRow,FilerCategoryRow,FilingProfile,UsUpstreamEntry} from './calendar';
+import type {SubmissionsView} from './filer-categories';
+
+/** Flip only after docs/audits/2026-11-05-data-foundation-3/verification.md records a real disclosure_date response check (spec §6.1 T15). */
+export const CN_DISCLOSURE_VERIFIED=false;
+export const DISCLOSURE_FIELDS='ts_code,ann_date,end_date,pre_date,actual_date,modify_date';
+export const MIN_MEMBER_MS=60_000;
+export const MAX_MEMBER_ATTEMPTS=3;
+export const PASS_MAX_AGE_MS=2*86_400_000;
+
+// ---------------------------------------------------------------- pass functions (C5)
+export interface CalendarPassToken{market:Market;pass_id:string;batch_id:string}
+export type CalendarPassErrorCode='fence_failed'|'pass_incomplete'|'member_not_claimable'|'invalid_rows'|'unknown';
+export class CalendarPassError extends Error{constructor(public readonly code:CalendarPassErrorCode,message?:string){super(message??code);this.name='CalendarPassError';}}
+const PASS_CODES:readonly CalendarPassErrorCode[]=['fence_failed','pass_incomplete','member_not_claimable','invalid_rows'];
+/** SQL raises the code as the message (C5); PostgREST and node-postgres both surface it as error.message. */
+export function toCalendarPassError(e:{message?:string}):CalendarPassError{
+ const head=(e.message??'').split(/[\s:]/,1)[0];
+ return new CalendarPassError((PASS_CODES as readonly string[]).includes(head)?head as CalendarPassErrorCode:'unknown',e.message);
+}
+export interface CalendarPassDb{
+ claimPass(market:Market,batchId:string):Promise<CalendarPassToken|null>;
+ replaceExpectations(issuer:string,market:Market,rows:ExpectationRow[],token:CalendarPassToken):Promise<number>;
+ failMember(token:CalendarPassToken,issuer:string,error:string):Promise<void>;
+ finishPass(token:CalendarPassToken):Promise<'complete'|'complete_with_failures'>;
+}
+/** p_rows payload: every dq_filing_expectations column except issuer_id/market (the function's own args) and computed_at/batch_id (set by the function from now() and the token). */
+export const expectationArgs=(rows:ExpectationRow[])=>rows.map(({issuer_id:_i,market:_m,...r})=>r);
+export function supabaseCalendarPassDb(client:SupabaseClient):CalendarPassDb{
+ const c=client as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
+ const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toCalendarPassError(error);return data as T;};
+ return {
+  claimPass:(market,batch)=>call<CalendarPassToken|null>('claim_calendar_pass',{p_market:market,p_batch:batch}),
+  replaceExpectations:(issuer,market,rows,token)=>call<number>('replace_filing_expectations',{p_issuer:issuer,p_market:market,p_rows:expectationArgs(rows),p_pass_token:token}).then(Number),
+  failMember:async(token,issuer,error)=>{await call('fail_calendar_member',{p_pass_token:token,p_issuer:issuer,p_error:error.slice(0,500)});},
+  finishPass:(token)=>call<'complete'|'complete_with_failures'>('finish_calendar_pass',{p_pass_token:token}),
+ };
+}
+
+// ---------------------------------------------------------------- deps and receipt
+export interface CalendarSyncDeps{
+ tables:TableClient;db:Pick<FactsDb,'filingsForCalendar'>;passes:CalendarPassDb;raw:RawStore;
+ /** US upstream + profile source; the production fetcher (Task 6 fetchSubmissions) stores the raw JSON and pages. */
+ submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
+ /** CN upstream: tushareCallRaw('disclosure_date', {ts_code}, DISCLOSURE_FIELDS). */
+ disclosureDate:(tsCode:string,b:Budget)=>Promise<TushareRaw>;
+ now:()=>Date;budget:Budget;codeVersion:string|null;
+}
+export interface CalendarSyncOptions{market:Market;limit:number;triggeredBy:TriggeredBy}
+export interface CalendarDetail{pass_id:string|null;issuers_done:number;issuers_failed:number;rows:number;by_deadline_state:Record<string,number>;by_disclosure_state:Record<string,number>;upstream_unavailable:number;no_fiscal_year_end:number;no_category:number;no_profile:number}
+export interface CalendarReceipt{batchId:string;status:BatchStatus;passId:string|null;passStatus:'running'|'complete'|'complete_with_failures'|null;counts:BatchCounts;errors:BatchError[];detail:CalendarDetail}
+
+const iso=(d:Date)=>d.toISOString().slice(0,10);
+const ymd=(s:unknown)=>typeof s==='string'&&/^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:null;
+const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
+const errText=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
+
+/** Profile from SEC submissions: regime = latest original annual form; week52 when the fiscal year end is not a month end or a recent annual period end is not one. */
+export function profileFromSubmissions(issuerId:string,v:SubmissionsView,today:string):FilingProfile|null{
+ const annual=v.entries.filter(e=>e.form==='10-K'||e.form==='20-F'||e.form==='40-F').sort((a,b)=>b.filingDate.localeCompare(a.filingDate));
+ if(annual.length===0)return null;
+ const fye=v.fiscalYearEnd!==null&&/^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$/.test(v.fiscalYearEnd)?v.fiscalYearEnd:null;
+ const lastDay=(mm:number)=>new Date(Date.UTC(2001,mm,0)).getUTCDate();   // 2001: Feb 28 (29 checked below)
+ const fyeIsMonthEnd=fye===null||+fye.slice(2)===lastDay(+fye.slice(0,2))||fye==='0229';
+ const reportEndsOff=annual.slice(0,3).some(e=>{if(!e.reportDate)return false;const d=new Date(`${e.reportDate}T00:00:00Z`);return new Date(d.getTime()+86_400_000).getUTCDate()!==1;});
+ return {issuer_id:issuerId,market:'US',category_raw_current:v.category,regime:annual[0].form as FilingProfile['regime'],fiscal_year_end:fye,week52_pattern:!fyeIsMonthEnd||reportEndsOff,source:'sec_submissions',source_sha256:v.sha256,as_of:today};
+}
+export const cnProfile=(issuerId:string,today:string):FilingProfile=>({issuer_id:issuerId,market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'cn_statutory',source_sha256:null,as_of:today});
+const profileFromRow=(r:Row):FilingProfile=>({issuer_id:String(r.issuer_id),market:r.market as Market,category_raw_current:r.category_raw_current==null?null:String(r.category_raw_current),regime:r.regime as FilingProfile['regime'],fiscal_year_end:r.fiscal_year_end==null?null:String(r.fiscal_year_end),week52_pattern:r.week52_pattern===true,source:String(r.source),source_sha256:r.source_sha256==null?null:String(r.source_sha256),as_of:String(r.as_of)});
+const categoryFromRow=(r:Row):FilerCategoryRow=>({issuer_id:String(r.issuer_id),fiscal_year:Number(r.fiscal_year),acceleration:r.acceleration as FilerCategoryRow['acceleration'],smaller_reporting:r.smaller_reporting==null?null:r.smaller_reporting===true,category_raw:String(r.category_raw),source:'ixbrl_dei',accession:String(r.accession),evidence_sha256:String(r.evidence_sha256),as_of:String(r.as_of)});
+/** disclosure_date rows from a raw response (field order from the response, dates → ISO). */
+export function parseDisclosureDate(raw:Pick<TushareRaw,'fields'|'items'>):CnScheduleRow[]{
+ const at=(name:string)=>raw.fields.indexOf(name);
+ const [e,a,p,ac,mo]=['end_date','ann_date','pre_date','actual_date','modify_date'].map(at);
+ if(e<0)return [];
+ return raw.items.flatMap(it=>{const end=ymd(it[e]);return end?[{end_date:end,ann_date:a<0?null:ymd(it[a]),pre_date:p<0?null:ymd(it[p]),actual_date:ac<0?null:ymd(it[ac]),modify_date:mo<0?null:ymd(it[mo])}]:[];});
+}
+
+/**
+ * Per-period US upstream coverage (plan audit Q1; spec §6.1 "recent 最早条目早于 period_end").
+ * The submissions list can prove "nothing filed" for a period only when its earliest entry is before that
+ * period's end (every filing for the period comes after the period ends). For each row:
+ * - covered (earliest filingDate < period_end) → kept as computed;
+ * - positive evidence (received / received_late / filed_not_ingested, i.e. a matching filing or a matching
+ *   upstream entry) → kept as computed, whatever the coverage;
+ * - otherwise (pending / overdue without coverage) → unknown_upstream, upstream_lookup 'unavailable',
+ *   detail.upstream_incomplete=true, detail.upstream_covered_from=earliest filingDate (null for an empty list).
+ * Only those rows change; one uncovered old period never rewrites a recent row.
+ */
+export function applyUpstreamCoverage(rows:ExpectationRow[],entries:readonly UsUpstreamEntry[]):ExpectationRow[]{
+ const earliest=entries.map(e=>e.filingDate).sort()[0]??null;
+ return rows.map((r):ExpectationRow=>{
+  if(earliest!==null&&earliest<r.period_end)return r;
+  if(r.disclosure_state!=='pending'&&r.disclosure_state!=='overdue')return r;
+  const {estimated_due_passed:_e,...detail}=r.detail;
+  return {...r,upstream_lookup:'unavailable',upstream_filed_date:null,disclosure_state:'unknown_upstream',detail:{...detail,upstream_incomplete:true,upstream_covered_from:earliest}};
+ });
+}
+
+interface MemberResult{rows:ExpectationRow[];upstreamUnavailable:boolean;noProfile:boolean;noFye:boolean;noCategory:boolean;errors:BatchError[];scheduleReason?:string}
+async function display(tables:TableClient,issuerId:string,scope:Row|undefined,market:Market,today:string):Promise<{ticker:string|null;name:string|null}>{
+ const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
+ let ticker:string|null=market==='CN'?(scope?.fetch_key==null?null:String(scope.fetch_key)):null;
+ if(market==='US'){const secs=(await selectAll(tables,'issuer_securities',{issuer_id:issuerId},'ticker')).filter(r=>isCurrentSecurity(r,today));ticker=String((secs.find(r=>r.is_primary===true)??secs[0])?.ticker??'')||null;}
+ const name=issuer?(issuer.canonical_name_en??issuer.canonical_name_zh??null) as string|null:null;
+ return {ticker,name};
+}
+
+async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string,today:string,nowIso:string,write=true):Promise<MemberResult>{
+ const [scope]=await deps.tables.select('fact_sync_scope',{issuer_id:issuerId,market},{limit:1});
+ const fetchKey=scope?.fetch_key==null?'':String(scope.fetch_key);
+ const errors:BatchError[]=[];
+ let profile:FilingProfile|null=null;let upstream:CalendarUpstream;let scheduleReason:string|undefined;
+ if(market==='US'){
+  let view:SubmissionsView|null=null;
+  try{if(!/^\d{10}$/.test(fetchKey))throw new Error('no_cik');view=await deps.submissions(fetchKey,deps.budget);}
+  catch(e){errors.push({code:'sec_unavailable',key:issuerId,message:errText(e)});}
+  if(view){
+   profile=profileFromSubmissions(issuerId,view,today);
+   if(profile&&write)await deps.tables.upsert('issuer_filing_profiles',{...profile,updated_at:nowIso},'issuer_id,market');
+   upstream={lookup:'ok',us:view.entries.map(e=>({form:e.form,reportDate:e.reportDate,filingDate:e.filingDate,accessionNumber:e.accessionNumber})),sha256:view.sha256};
+  }else upstream={lookup:'unavailable'};
+  if(!profile){const [stored]=await deps.tables.select('issuer_filing_profiles',{issuer_id:issuerId,market},{limit:1});if(stored)profile=profileFromRow(stored);}
+ }else{
+  profile=cnProfile(issuerId,today);
+  if(write)await deps.tables.upsert('issuer_filing_profiles',{...profile,updated_at:nowIso},'issuer_id,market');
+  upstream={lookup:'unavailable'};
+  try{
+   if(!/^\d{6}\.(SH|SZ|BJ)$/.test(fetchKey))throw new Error('no_ts_code');
+   const raw=await deps.disclosureDate(fetchKey,deps.budget);
+   if(raw.code!==0)scheduleReason=`api_code_${raw.code}`;
+   else{
+    const stored=await deps.raw.put({kind:'tushare-disclosure',bytes:raw.bytes,contentType:'application/json',meta:{api:'disclosure_date',ts_code:fetchKey}},deps.budget);
+    if(CN_DISCLOSURE_VERIFIED)upstream={lookup:'ok',cn:parseDisclosureDate(raw),sha256:stored.sha256};
+    else{upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='unverified';}
+   }
+  }catch(e){scheduleReason=e instanceof TushareError&&e.code===-1?'no_token':e instanceof Error&&(e.message==='no_ts_code')?'no_ts_code':'error';}
+ }
+ if(!profile)return {rows:[],upstreamUnavailable:upstream.lookup==='unavailable',noProfile:true,noFye:false,noCategory:false,errors,scheduleReason};
+ const categories=market==='US'?(await selectAll(deps.tables,'issuer_filer_categories',{issuer_id:issuerId},'fiscal_year')).map(categoryFromRow):[];
+ const filings=await deps.db.filingsForCalendar(issuerId,market,{fromPeriodEnd:filingsWindowStart(today)});
+ let rows=computeExpectations({profile,categories,filings,upstream,today});
+ // US: coverage is per expected period (plan audit Q1); positive evidence is never discarded.
+ if(upstream.lookup==='ok'&&market==='US')rows=applyUpstreamCoverage(rows,upstream.us??[]);
+ const shown=await display(deps.tables,issuerId,scope,market,today);
+ rows=rows.map(r=>({...r,detail:{...r.detail,display:shown,...(upstream.sha256?{upstream_sha256:upstream.sha256}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}}));
+ return {rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
+}
+
+export async function runCalendarSync(deps:CalendarSyncDeps,opts:CalendarSyncOptions):Promise<CalendarReceipt>{
+ const {market}=opts;
+ const counts=emptyCounts();const errors:BatchError[]=[];const schedule:Record<string,number>={};
+ const detail:CalendarDetail={pass_id:null,issuers_done:0,issuers_failed:0,rows:0,by_deadline_state:{},by_disclosure_state:{},upstream_unavailable:0,no_fiscal_year_end:0,no_category:0,no_profile:0};
+ const {batchId}=await startBatch(deps.tables,{producer:'filing-calendar',dataset:DATASETS.calendar(market),toolVersions:{rules:CALENDAR_RULES_VERSION,market},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy});
+ const finish=async(passId:string|null,passStatus:CalendarReceipt['passStatus']):Promise<CalendarReceipt>=>{
+  if(Object.keys(schedule).length)errors.push({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify(schedule)});
+  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
+  return {batchId,status,passId,passStatus,counts,errors,detail};
+ };
+ const token=await deps.passes.claimPass(market,batchId);
+ if(!token){errors.push({code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})});return finish(null,null);}
+ detail.pass_id=token.pass_id;
+ const now=deps.now();const today=iso(now);
+ const members=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
+ const todo=[...members.filter(m=>m.state==='pending'),...members.filter(m=>m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)].map(m=>String(m.issuer_id)).slice(0,opts.limit);
+ let fenced=false;
+ for(const [i,issuer] of todo.entries()){
+  if(deps.budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:todo.length-i})});break;}
+  counts.fetched++;
+  let result:MemberResult;
+  try{result=await computeMember(deps,market,issuer,today,now.toISOString());}
+  catch(e){
+   counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
+   try{await deps.passes.failMember(token,issuer,errText(e));}
+   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
+   continue;
+  }
+  try{await deps.passes.replaceExpectations(issuer,market,result.rows,token);}
+  catch(e){
+   if(e instanceof CalendarPassError&&e.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}
+   counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
+   try{await deps.passes.failMember(token,issuer,errText(e));}
+   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
+   continue;
+  }
+  counts.inserted++;detail.issuers_done++;detail.rows+=result.rows.length;
+  errors.push(...result.errors);
+  if(result.scheduleReason)bump(schedule,result.scheduleReason);
+  if(result.upstreamUnavailable)detail.upstream_unavailable++;
+  if(result.noProfile)detail.no_profile++;
+  if(result.noFye)detail.no_fiscal_year_end++;
+  if(result.noCategory)detail.no_category++;
+  for(const r of result.rows){bump(detail.by_deadline_state,r.deadline_state);bump(detail.by_disclosure_state,r.disclosure_state);}
+ }
+ if(fenced)return finish(token.pass_id,'running');
+ const after=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
+ if(after.some(m=>m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)))return finish(token.pass_id,'running');
+ let passStatus:'complete'|'complete_with_failures';
+ try{passStatus=await deps.passes.finishPass(token);}
+ catch(e){if(e instanceof CalendarPassError&&(e.code==='fence_failed'||e.code==='pass_incomplete')){errors.push({code:e.code,key:token.pass_id});return finish(token.pass_id,'running');}throw e;}
+ const [pass]=await deps.tables.select('dq_calendar_passes',{market,pass_id:token.pass_id},{limit:1});
+ const startedAt=String(pass?.started_at??now.toISOString()),finishedAt=String(pass?.finished_at??deps.now().toISOString());
+ const tooLong=Date.parse(finishedAt)-Date.parse(startedAt)>PASS_MAX_AGE_MS;
+ await recordAttempt(deps.tables,DATASETS.calendar(market),{ok:passStatus==='complete'&&!tooLong,cadence:'daily',now:deps.now(),detail:{pass_id:token.pass_id,started_at:startedAt,finished_at:finishedAt,status:passStatus,...(tooLong?{pass_too_long:true}:{})}});
+ return finish(token.pass_id,passStatus);
+}
+
+/** Read-only preview for scripts (no batch, no pass, no profile write; deps.raw should be a memory store): the rows each scope member would get. */
+export async function previewCalendar(deps:CalendarSyncDeps,opts:{market:Market;issuerIds?:string[];limit:number}):Promise<{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]>{
+ const now=deps.now();
+ const scope=(await selectAll(deps.tables,'fact_sync_scope',{market:opts.market},'issuer_id')).filter(r=>opts.issuerIds?opts.issuerIds.includes(String(r.issuer_id)):Number(r.priority)>0);
+ const out:{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]=[];
+ for(const r of scope.slice(0,opts.issuerIds?undefined:opts.limit)){
+  const m=await computeMember(deps,opts.market,String(r.issuer_id),iso(now),now.toISOString(),false);
+  out.push({issuerId:String(r.issuer_id),rows:m.rows,errors:m.errors});
+ }
+ return out;
+}

exec
/bin/zsh -lc 'find . -name AGENTS.md -o -name AGENTS.override.md; cat src/lib/dq/filer-categories.ts | head -180; cat supabase/migrations/*calendar*' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 48ms:
// src/lib/dq/filer-categories.ts
// Per-fiscal-year filer categories from 10-K covers (spec §6.1 申报人类别, §3.1 issuer_filer_categories).
// For each in-scope US issuer: SEC submissions → its latest 3 original 10-Ks → each primary document
// (raw bytes into bucket reconcile-raw, sha256 = evidence_sha256) → the §5.2 inline-XBRL parser →
// dei:EntityFilerCategory → acceleration. Only-SRC / unparseable covers write no row (no usable
// category; the calendar then has no rule for that fiscal year). The latest 10-K's cover is also
// compared with submissions `category` as pair sec.filer_category (record.ts, kind text, record only).
// fiscal_year = calendar year of the month end nearest the 10-K's period end (calendar.ts
// fiscalYearOfPeriodEnd), the same label the calendar uses for its N−1 lookup.
import {PacerError,secPacer,sleep} from '../facts/providers/shared';
import type {Budget,FactsDb} from '../facts/types';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from './batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
import {recordAttempt} from './freshness';
import {DATASETS,DQ_DATASET_INVENTORY} from './datasets';
import type {RawStore} from './raw-store';
import {CALENDAR_RULES_VERSION,fiscalYearOfPeriodEnd} from './calendar';
import type {Acceleration,FilerCategoryRow} from './calendar';
import {IXBRL_PARSER_VERSION,parseInlineXbrl} from './reconcile/ixbrl';
import {filerClass,readLimited} from './reconcile/pair-us-ixbrl';
import {recordReconciliation} from './reconcile/record';
import {primaryDocumentUrl} from '../research/ingest/collectors/edgar';
import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
import type {SubmissionsSnapshot} from '../entities/identifiers/sec-submissions';

/** The submissions fields the calendar and this module read. Built only by submissionsView (one adaptation point to Task 6's snapshot). */
export interface SubmissionsEntryView{accessionNumber:string;filingDate:string;reportDate:string|null;form:string;primaryDocument:string;isInlineXBRL:boolean}
export interface SubmissionsView{cik10:string;sha256:string;category:string|null;fiscalYearEnd:string|null;entries:SubmissionsEntryView[]}
// Task 6a shape (Part B): SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:ParsedSubmissions, complete};
// parsed.filings already merges recent with the fetched files[] pages; primaryDocument / isInlineXBRL may be null.
export function submissionsView(s:SubmissionsSnapshot):SubmissionsView{
 return {cik10:s.cik.padStart(10,'0'),sha256:s.main.sha256,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,
  entries:s.parsed.filings.map(e=>({accessionNumber:e.accessionNumber,filingDate:e.filingDate,reportDate:e.reportDate||null,form:e.form,primaryDocument:e.primaryDocument??'',isInlineXBRL:e.isInlineXBRL===true}))};
}

/**
 * Cover text → category. The non-accelerated test runs first because "Non-accelerated Filer" also
 * contains "accelerated filer" (spec §6.1 lists large → accelerated → non; same outcomes). Smaller
 * reporting status is only ever `true` (the words appear) or null (unknown) — never inferred false.
 */
export function parseFilerCategory(raw:string):{acceleration:Acceleration;smaller_reporting:boolean|null}|null{
 const acceleration=filerClass(raw.replace(/\s+/g,' ').trim());   // the one classifier (pair-us-ixbrl.ts), shared with the reconcile pair
 if(acceleration===null)return null;
 return {acceleration,smaller_reporting:raw.toLowerCase().includes('smaller reporting')?true:null};
}
const norm=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
/** Latest n original 10-Ks by filing date (amendments never: a 10-K/A cover restates, it does not determine status). */
export const latestTenKs=(v:SubmissionsView,n=3)=>v.entries.filter(e=>e.form==='10-K'&&e.primaryDocument!=='').sort((a,b)=>b.filingDate.localeCompare(a.filingDate)||b.accessionNumber.localeCompare(a.accessionNumber)).slice(0,n);
const ISO=/^\d{4}-\d{2}-\d{2}$/;
/** dei values by local name; Task 13's parser keys nonNumeric by the canonical 'dei:<Local>' QName. */
export function coverOf(doc:string):{category:string|null;periodEnd:string|null}{
 const nn=parseInlineXbrl(doc).nonNumeric;
 const cat=nn['dei:EntityFilerCategory'];const pe=nn['dei:DocumentPeriodEndDate'];
 return {category:cat!==undefined&&cat.trim()!==''?cat.trim():null,periodEnd:pe!==undefined&&ISO.test(pe.trim())?pe.trim():null};
}

export const MAX_DOCUMENT_BYTES=50*1024*1024;
const RESERVE_MS=20_000;
// Shares THE process-wide SEC pacer (submissions, companyfacts, documents): the fair-access limit is per source address.
const pacer=secPacer;
export const resetDocumentPacing=()=>pacer.reset();
export class FilerCategoryError extends Error{constructor(public readonly code:'document_unavailable'|'document_too_large',message?:string){super(message??code);this.name='FilerCategoryError';}}
export interface DocumentFetchOptions{fetch?:typeof fetch;userAgent?:string;sleep?:typeof sleep;now?:()=>number}
/** One SEC archive document (UA, 120 ms pacing, 60 s timeout, 50 MB cap). Thrown messages carry status codes only. */
export async function fetchSecDocument(url:string,budget:Budget,opts:DocumentFetchOptions={}):Promise<Uint8Array>{
 try{await pacer.admit({budget,reserveMs:RESERVE_MS,now:opts.now,sleep:opts.sleep});}catch(e){throw new FilerCategoryError('document_unavailable',e instanceof PacerError?e.code:'budget_aborted');}
 const timeoutMs=Math.min(60_000,budget.remainingMs()-RESERVE_MS);
 if(timeoutMs<=0)throw new FilerCategoryError('document_unavailable','budget_exhausted');
 let res:Response;
 try{res=await (opts.fetch??fetch)(url,{headers:{'User-Agent':opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'text/html'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});}
 catch{throw new FilerCategoryError('document_unavailable','network');}
 if(!res.ok)throw new FilerCategoryError('document_unavailable',`http_${res.status}`);
 const cl=res.headers.get('content-length');
 if(cl!==null&&/^\d+$/.test(cl)&&Number(cl)>MAX_DOCUMENT_BYTES){await res.body?.cancel().catch(()=>undefined);throw new FilerCategoryError('document_too_large');}
 let got:{bytes:Uint8Array;exceeded:boolean};
 try{got=await readLimited(res,MAX_DOCUMENT_BYTES);}catch{throw new FilerCategoryError('document_unavailable','network');}   // capped while streaming; no unbounded arrayBuffer()
 if(got.exceeded)throw new FilerCategoryError('document_too_large');
 return got.bytes;
}

export interface FilerCategoryDeps{
 tables:TableClient;db:Pick<FactsDb,'scopeAll'>;raw:RawStore;
 submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
 fetchDocument:(url:string,b:Budget)=>Promise<Uint8Array>;
 now:()=>Date;budget:Budget;codeVersion:string|null;
}
export interface FilerCategoryOptions{issuerIds?:string[];limit:number;dryRun:boolean;triggeredBy:TriggeredBy}
export interface FilerCategoryReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];rows:FilerCategoryRow[];reconciliations:{natural_key:string;passed:boolean}[]}
/** Stop starting issuers when less than this remains (one submissions + three documents). */
export const MIN_ISSUER_MS=30_000;

export async function syncFilerCategories(deps:FilerCategoryDeps,opts:FilerCategoryOptions):Promise<FilerCategoryReceipt>{
 const today=deps.now().toISOString().slice(0,10);
 const scope=(await deps.db.scopeAll('US')).filter(r=>opts.issuerIds?opts.issuerIds.includes(r.issuer_id):r.priority>0);
 const members=scope.sort((a,b)=>a.issuer_id.localeCompare(b.issuer_id)).slice(0,opts.issuerIds?undefined:opts.limit);
 const counts=emptyCounts();const errors:BatchError[]=[];const rows:FilerCategoryRow[]=[];const recs:FilerCategoryReceipt['reconciliations']=[];
 const skipped:Record<string,number>={};const skip=(r:string)=>{skipped[r]=(skipped[r]??0)+1;};
 const batchId=opts.dryRun?null:(await startBatch(deps.tables,{producer:'filer-categories',dataset:DATASETS.filerCategories,toolVersions:{parser:IXBRL_PARSER_VERSION,rules:CALENDAR_RULES_VERSION},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy})).batchId;
 let processed=0,incomplete=false,fatal:unknown=null;
 try{
 for(const m of members){
  if(deps.budget.remainingMs()<MIN_ISSUER_MS){incomplete=true;errors.push({code:'deadline_hit',message:JSON.stringify({not_started:members.length-processed})});break;}
  processed++;
  let view:SubmissionsView;
  try{view=await deps.submissions(m.fetch_key,deps.budget);}
  catch(e){counts.fetched++;counts.failed++;errors.push({code:'sec_unavailable',key:m.issuer_id,message:(e as Error).message.slice(0,200)});continue;}
  const seen=new Set<number>();
  for(const [i,e] of latestTenKs(view).entries()){
   if(!e.isInlineXBRL){skip('not_inline_xbrl');continue;}
   const fail=(code:string)=>{counts.fetched++;counts.failed++;errors.push({code,key:`${m.issuer_id}:${e.accessionNumber}`});};
   let bytes:Uint8Array,sha256:string;
   try{bytes=await deps.fetchDocument(primaryDocumentUrl(view.cik10,e.accessionNumber,e.primaryDocument),deps.budget);}
   catch(err){fail(err instanceof FilerCategoryError?err.code:'document_unavailable');continue;}
   try{sha256=(await deps.raw.put({kind:'sec-document',bytes,contentType:'text/html',meta:{cik:view.cik10,accession:e.accessionNumber,document:e.primaryDocument}},deps.budget)).sha256;}
   catch{fail('raw_upload_failed');continue;}   // no evidence in the bucket → no row depends on it (spec §3.1 bucket rule)
   // One bad document never escapes the loop: a parse or write failure is that document's failure.
   let cover:ReturnType<typeof coverOf>;
   try{cover=coverOf(new TextDecoder().decode(bytes));}catch{fail('parse_error');continue;}
   const parsed=cover.category===null?null:parseFilerCategory(cover.category);
   const periodEnd=e.reportDate&&ISO.test(e.reportDate)?e.reportDate:cover.periodEnd;
   const fiscalYear=parsed&&periodEnd?fiscalYearOfPeriodEnd(periodEnd):null;
   try{
    if(i===0&&view.category!==null&&cover.category!==null){
     const passed=norm(view.category)===norm(cover.category);
     if(batchId)await recordReconciliation(deps.tables,{pair:'sec.filer_category',batch_id:batchId,natural_key:`${view.cik10}:${e.accessionNumber}`,kind:'text',outcome:'compared',passed,
      left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec_submissions.category',right_source:'ixbrl_dei.EntityFilerCategory',
      detail:{left_text:view.category,right_text:cover.category,left:{sha256:view.sha256},right:{document:e.primaryDocument,sha256}},action:'record'});
     recs.push({natural_key:`${view.cik10}:${e.accessionNumber}`,passed});
    }
    if(!parsed){skip(cover.category===null?'no_category':'category_unusable');continue;}
    if(!periodEnd||fiscalYear===null){skip('no_period_end');continue;}
    if(seen.has(fiscalYear)){skip('fiscal_year_duplicate');continue;}   // a newer 10-K already covers this fiscal year
    const row:FilerCategoryRow={issuer_id:m.issuer_id,fiscal_year:fiscalYear,acceleration:parsed.acceleration,smaller_reporting:parsed.smaller_reporting,category_raw:cover.category!,source:'ixbrl_dei',accession:e.accessionNumber,evidence_sha256:sha256,as_of:today};
    // Ordering limitation: issuer_filer_categories has no filing-date/accepted_at column (only as_of = run date) and TableClient.update
    // matches on equality only, so a stale concurrent worker could overwrite a newer 10-K's row for the same fiscal year.
    // Runs are serialised by cadence (event/script); a conditional write needs a schema change (reported, not done here).
    if(batchId)await deps.tables.upsert('issuer_filer_categories',{...row},'issuer_id,fiscal_year');
    seen.add(fiscalYear);rows.push(row);
    counts.fetched++;counts.inserted++;
   }catch{fail('write_failed');}
  }
 }
 }catch(e){fatal=e;errors.push({code:'unexpected',message:(e instanceof Error?e.message:String(e)).slice(0,200)});counts.failed++;}
 if(Object.keys(skipped).length)errors.push({code:'skipped_summary',key:'filer-categories',message:JSON.stringify(skipped)});
 if(!batchId)return {batchId:null,status:'dry_run',counts,errors,rows,reconciliations:recs};
 // The receipt is always finalised once the batch exists (finishBatch + one freshness attempt), also after an unexpected error.
 const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
 const cadence=DQ_DATASET_INVENTORY.find(d=>d.dataset===DATASETS.filerCategories)!.cadence;
 // Fresh only when every selected issuer was processed and nothing failed (incomplete coverage must not advance last_ok_at).
 const ok=fatal===null&&!incomplete&&status==='success';
 await recordAttempt(deps.tables,DATASETS.filerCategories,{ok,cadence,now:deps.now(),detail:{batch_id:batchId,rows:rows.length,issuers:members.length,processed,incomplete}});
 return {batchId,status,counts,errors,rows,reconciliations:recs};
}
zsh:1: no matches found: supabase/migrations/*calendar*

exec
/bin/zsh -lc "rg -n 'claim_calendar_pass|finish_calendar_pass|replace_filing_expectations' supabase; cat src/lib/dq/batches.ts | tail -100; cat src/lib/db/table-client.ts | head -130; rg -n 'complete|pages|failed' src/lib/entities/identifiers/sec-submissions.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
supabase/migrations/20261107090000_identifiers_and_dq.sql:605:create or replace function public.claim_calendar_pass(p_market text, p_batch uuid)
supabase/migrations/20261107090000_identifiers_and_dq.sql:630:revoke execute on function public.claim_calendar_pass(text, uuid) from public, anon, authenticated;
supabase/migrations/20261107090000_identifiers_and_dq.sql:631:grant execute on function public.claim_calendar_pass(text, uuid) to service_role;
supabase/migrations/20261107090000_identifiers_and_dq.sql:636:create or replace function public.replace_filing_expectations(p_issuer uuid, p_market text, p_rows jsonb, p_pass_token jsonb)
supabase/migrations/20261107090000_identifiers_and_dq.sql:673:revoke execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) from public, anon, authenticated;
supabase/migrations/20261107090000_identifiers_and_dq.sql:674:grant execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) to service_role;
supabase/migrations/20261107090000_identifiers_and_dq.sql:694:create or replace function public.finish_calendar_pass(p_pass_token jsonb)
supabase/migrations/20261107090000_identifiers_and_dq.sql:708:revoke execute on function public.finish_calendar_pass(jsonb) from public, anon, authenticated;
supabase/migrations/20261107090000_identifiers_and_dq.sql:709:grant execute on function public.finish_calendar_pass(jsonb) to service_role;
// quarantined rows and informational entries (INFO_CODES) do not degrade status. The row is written with finished_at:null so the DB invariant
// (status='running' iff finished_at is null) holds. Only a running batch can be finished.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

export type BatchStatus='running'|'success'|'partial'|'failed'|'rejected';
export type TriggeredBy='cron'|'manual'|'script';
/**
 * Receipt counters, all non-negative safe integers:
 * - fetched: rows read from the source;
 * - inserted: new rows written; duplicates: rows already present unchanged (no write);
 * - versioned: rows that superseded an existing version; quarantined: rows parked in dq_quarantine;
 * - failed: rows that could not be processed at all.
 * inserted+duplicates+versioned+quarantined+failed is the number of rows with an outcome; it may
 * be below fetched (rows filtered out by design), but fetched > 0 with no outcome at all means the
 * producer lost track of its rows and the batch finishes as failed ('unaccounted').
 */
export interface BatchCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export interface BatchError{code:string;key?:string;message?:string}
export interface StartBatchInput{producer:string;dataset:string;toolVersions?:Record<string,string>;codeVersion?:string;triggeredBy?:TriggeredBy}

const TRIGGERS:readonly TriggeredBy[]=['cron','manual','script'];
export const emptyCounts=():BatchCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});

const COUNTERS:readonly (keyof BatchCounts)[]=['fetched','inserted','duplicates','versioned','quarantined','failed'];
const MAX_ERRORS=100,MAX_MESSAGE=500;

function assertCounts(counts:BatchCounts):void{
 if(!counts||COUNTERS.some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0))throw new Error('invalid_counts');
}

/** First MAX_ERRORS errors with messages capped, plus a `truncated` marker for the rest. */
function capErrors(errors:BatchError[]):BatchError[]{
 const kept=errors.slice(0,MAX_ERRORS).map(e=>e.message!==undefined&&e.message.length>MAX_MESSAGE?{...e,message:e.message.slice(0,MAX_MESSAGE)}:e);
 return errors.length>MAX_ERRORS?[...kept,{code:'truncated',message:`${errors.length-MAX_ERRORS} more`}]:kept;
}

/**
 * Error codes that only inform the receipt reader: `skipped_summary` (input rows left out by
 * expected filtering, e.g. not in the universe or not promotable yet) and `relink` (a research
 * entity re-pointed to another issuer), `rule_warning_summary` (one per warning rule per batch, facts spec §7.2),
 * `coverage_summary` (Tushare coverage summary, §6.3), `deadline_hit` (issuers not started after the deadline, §6.1) and `claims_summary` (identifier claims filed per op, data foundation 3 §4.2.2/§8). They stay in `errors` but never make a batch partial or
 * failed. `rejected_summary` (malformed or invalid input rows) is deliberately NOT informational:
 * it makes the batch partial, or failed when nothing landed.
 */
export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary'] as const;
export type InfoCode=typeof INFO_CODES[number];
export const isInfoError=(e:BatchError)=>(INFO_CODES as readonly string[]).includes(e.code);

const accounted=(c:BatchCounts)=>c.inserted+c.duplicates+c.versioned+c.quarantined+c.failed;
export const UNACCOUNTED_ERROR:BatchError={code:'unaccounted',message:'fetched rows without outcomes'};

/**
 * Pure status: rejected flag wins; fetched rows with no outcome → failed; any failure or
 * non-informational error → partial if something landed, else failed. Errors whose code is in
 * INFO_CODES are ignored here (a run whose only entries are skips/relinks is a success).
 */
export function batchStatusFromCounts(counts:BatchCounts,errors:BatchError[],flags:{rejected?:boolean}={}):BatchStatus{
 assertCounts(counts);
 if(flags.rejected)return 'rejected';
 if(counts.fetched>0&&accounted(counts)===0)return 'failed';
 const landed=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined;
 if(counts.failed>0||errors.some(e=>!isInfoError(e)))return landed>0?'partial':'failed';
 return 'success';
}

export async function startBatch(client:TableClient,input:StartBatchInput):Promise<{batchId:string}>{
 const ok=(s:unknown)=>typeof s==='string'&&s.length>=1&&s.length<=64;
 const trigger=input.triggeredBy??'script';
 if(!ok(input.producer)||!ok(input.dataset)||!TRIGGERS.includes(trigger))throw new Error('invalid_batch');
 const batchId=randomUUID();
 await client.insert('ingest_batches',{
  batch_id:batchId,producer:input.producer,dataset:input.dataset,status:'running',
  started_at:new Date().toISOString(),finished_at:null,counts:emptyCounts(),errors:[],
  tool_versions:input.toolVersions??{},code_version:input.codeVersion??null,triggered_by:trigger,
 });
 return {batchId};
}

/**
 * Finishes a running batch. An unaccounted receipt (fetched > 0, no outcomes) finishes as failed
 * with an appended {code:'unaccounted'} error. Throws invalid_now when `now` or the stored
 * started_at is not a valid date, rather than writing a NaN finished_at.
 */
export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean},now=new Date()):Promise<BatchStatus>{
 const status=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_now');
 const unaccounted=!result.rejected&&result.counts.fetched>0&&accounted(result.counts)===0;
 const errors=unaccounted?[UNACCOUNTED_ERROR,...result.errors]:result.errors;
 const [batch]=await client.select('ingest_batches',{batch_id:batchId},{limit:1});
 if(!batch||batch.status!=='running')throw new Error('batch_not_running');
 const startedAt=Date.parse(String(batch.started_at));
 if(!Number.isFinite(startedAt))throw new Error('invalid_now');
 // Never before started_at (DB check finished_after_started), even under clock skew.
 const finishedAt=new Date(Math.max(now.getTime(),startedAt));
 // Matching on status='running' keeps a concurrent finish from being overwritten.
 const n=await client.update('ingest_batches',{batch_id:batchId,status:'running'},{status,counts:result.counts,errors:capErrors(errors),finished_at:finishedAt.toISOString()});
 if(n!==1)throw new Error('batch_not_running');
 return status;
}
// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
// PostgREST caps every response (max_rows, default 1000), so select() returns at most one
// page. Reads that may exceed one page must use selectAll(), which pages in a fixed order.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
/** Inclusive lower (`gte`) and exclusive upper (`lt`) bounds per column. ISO timestamp strings compare as text, numbers numerically. */
export interface RangeOptions{gte?:Record<string,string|number>;lt?:Record<string,string|number>}
// offset requires orderBy: unordered pages are not stable across requests.
// limit is an integer 1..MAX_PAGE; offset a non-negative safe integer.
export interface SelectOptions extends RangeOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}

/** Largest page PostgREST returns by default; also the limit and selectAll page-size ceiling. */
export const MAX_PAGE=1000;

/** Table operation failure; `code` is the PostgreSQL SQLSTATE when known (e.g. '23505' unique violation). */
export class TableError extends Error{
 readonly details?:string;
 readonly hint?:string;
 constructor(readonly op:string,readonly table:string,message:string,readonly code:string|null=null,extra:{details?:string|null;hint?:string|null;cause?:unknown}={}){
  super(`${table} ${op}: ${message}`,extra.cause===undefined?undefined:{cause:extra.cause});
  this.name='TableError';
  if(extra.details)this.details=extra.details;
  if(extra.hint)this.hint=extra.hint;
 }
}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 /** Returns the number of rows the match hit. An empty match is rejected (no whole-table updates). */
 update(table:string,match:Row,patch:Row):Promise<number>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
 count(table:string,match:Row,opts?:RangeOptions):Promise<number>;
 /**
  * Calls a service-role SQL function and returns its result (plan 3: the row-locking jsonb patches
  * append_claim_evidence / patch_quarantine_detail / set_security_identifier of migration 20261107090000). Optional so the landed
  * test stubs stay valid; callers go through callRpc, which fails loudly when it is missing.
  */
 rpc?(fn:string,args:Row):Promise<unknown>;
}

/** Calls `fn` through client.rpc. A client without rpc is a wiring error (rpc_unavailable:<fn>), never a silent no-op. */
export async function callRpc(client:TableClient,fn:string,args:Row):Promise<unknown>{
 if(!client.rpc)throw new Error(`rpc_unavailable:${fn}`);
 return client.rpc(fn,args);
}

/** Rejects `undefined` match values: they would otherwise be dropped or match nothing silently. */
export function assertMatch(match:Row):void{
 if(!match||typeof match!=='object')throw new Error('undefined_match_value');
 for(const v of Object.values(match))if(v===undefined)throw new Error('undefined_match_value');
}

export function assertUpdateMatch(match:Row):void{
 assertMatch(match);
 if(Object.keys(match).length===0)throw new Error('empty_update_match');
}

const okBound=(v:unknown)=>typeof v==='string'||(typeof v==='number'&&Number.isFinite(v));
function checkRange(opts:RangeOptions):void{
 for(const r of [opts.gte,opts.lt]){
  if(r===undefined)continue;
  if(!r||typeof r!=='object'||Object.values(r).some(v=>!okBound(v)))throw new Error('invalid_select_options');
 }
}

export function checkSelectOptions(opts:SelectOptions):void{
 if(opts.limit!==undefined&&(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>MAX_PAGE))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&(!Number.isSafeInteger(opts.offset)||opts.offset<0))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');
 checkRange(opts);
}

export function checkRangeOptions(opts:RangeOptions):void{checkRange(opts);}

/**
 * Reads every matching row, paging by `offset` in `orderBy` order and stopping only on an empty
 * page, so a server max_rows below pageSize cannot truncate the result. `orderBy` must be a
 * unique column (ties make offset pages overlap or skip). Pages are separate requests, so the
 * result is not a snapshot: concurrent writes can be missed or seen twice.
 */
export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE)throw new Error(`selectAll pageSize must be 1..${MAX_PAGE}`);
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

// `.eq(k,null)` renders `k=eq.null`, which never matches in SQL; null must use `.is`.
const applyMatch=(q:any,match:Row)=>{for(const [k,v] of Object.entries(match))q=v===null?q.is(k,null):q.eq(k,v);return q;};
const applyRange=(q:any,opts:RangeOptions)=>{
 for(const [k,v] of Object.entries(opts.gte??{}))q=q.gte(k,v);
 for(const [k,v] of Object.entries(opts.lt??{}))q=q.lt(k,v);
 return q;
};

interface PgError{message:string;code?:string;details?:string|null;hint?:string|null}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type does describe the dq/issuer tables, but TableClient takes
 // table names as plain strings so the same callers run over the in-memory client too; the
 // loosely typed handle keeps that parity instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 const fail=(op:string,table:string,error:PgError):never=>{throw new TableError(op,table,error.message,error.code??null,{details:error.details,hint:error.hint,cause:error});};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)fail('insert',table,error);return data as Row;},
  // Exact count from Content-Range; no rows are returned. A missing count fails closed.
  async update(table,match,patch){
   assertUpdateMatch(match);
   const {count,error}=await applyMatch(db.from(table).update(patch,{count:'exact'}),match);
   if(error)fail('update',table,error);
   if(count===null||count===undefined)throw new Error('update_count_unavailable');
   return count as number;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let q=applyRange(applyMatch(db.from(table).select('*'),match),opts);
   if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});
   if(opts.limit!==undefined||opts.offset!==undefined){const from=opts.offset??0;q=q.range(from,from+(opts.limit??MAX_PAGE)-1);}
   const {data,error}=await q;if(error)fail('select',table,error);return (data??[]) as Row[];
  },
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)fail('upsert',table,error);},
  async count(table,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   const {count,error}=await applyRange(applyMatch(db.from(table).select('*',{count:'exact',head:true}),match),opts);
6:// merged snapshot. An accession repeated across pages is kept once when the copies agree; copies that
31:export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
163:   const pages:StoredDoc[]=[];
165:   // An accession repeated across pages is kept once only when the copies agree; a copy with a different filingDate/acceptanceDateTime is KEPT so consumers can see the conflict (additive: plan 3 Task 12).
170:    pages.push(p.doc);
173:   return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
202: const shaOf=(page:string)=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;

exec
/bin/zsh -lc "sed -n '585,710p' supabase/migrations/20261107090000_identifiers_and_dq.sql; sed -n '190,260p' src/lib/dq/calendar-sync.test.ts; rg -n 'profile|regime|week52' src/lib/dq/calendar.ts | head -40; nl -ba src/lib/dq/calendar-sync.ts | tail -80" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
  if p_market is distinct from p.market then raise exception 'fence_failed' using errcode = 'P0001'; end if;
  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
    raise exception 'member_not_claimable' using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_rows) x
                where jsonb_typeof(x) <> 'object'
                   or (x ? 'issuer_id' and x ->> 'issuer_id' is distinct from p_issuer::text)
                   or (x ? 'market' and x ->> 'market' is distinct from p_market)) then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  begin
    delete from public.dq_filing_expectations where issuer_id = p_issuer and market = p_market;
    insert into public.dq_filing_expectations(issuer_id, market, report_kind, period_end, period_end_estimated, deadline_state,
      due_date, due_rule, expected_date, upstream_lookup, upstream_filed_date, disclosure_state, received_filing_id, received_date,
      profile_as_of, detail, computed_at, batch_id)
    select p_issuer, p_market, x ->> 'report_kind', (x ->> 'period_end')::date, coalesce((x ->> 'period_end_estimated')::boolean, false),
      x ->> 'deadline_state', (x ->> 'due_date')::date, x ->> 'due_rule', (x ->> 'expected_date')::date, x ->> 'upstream_lookup',
      (x ->> 'upstream_filed_date')::date, x ->> 'disclosure_state', (x ->> 'received_filing_id')::uuid, (x ->> 'received_date')::date,
      (x ->> 'profile_as_of')::date, coalesce(x -> 'detail', '{}'::jsonb), clock_timestamp(), p.claimed_by
    from jsonb_array_elements(p_rows) x;
    get diagnostics n = row_count;
  exception when check_violation or not_null_violation or unique_violation or foreign_key_violation
              or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or invalid_parameter_value then
    raise exception 'invalid_rows' using errcode = '22023';
  end;
  update public.dq_calendar_pass_members set state = 'done', done_at = clock_timestamp()
  where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer;
  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
  return n;
end $$;
revoke execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) to service_role;

create or replace function public.fail_calendar_member(p_pass_token jsonb, p_issuer uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; m public.dq_calendar_pass_members;
begin
  p := public.dq_calendar_lock_pass(p_pass_token);
  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
    raise exception 'member_not_claimable' using errcode = 'P0001';
  end if;
  update public.dq_calendar_pass_members set state = 'failed', attempts = attempts + 1, last_error = left(coalesce(p_error, 'unknown'), 1000)
  where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer;
  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
end $$;
revoke execute on function public.fail_calendar_member(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_calendar_member(jsonb, uuid, text) to service_role;

-- Settles only from persisted member state: anything still processable → pass_incomplete; else all
-- done → complete, otherwise complete_with_failures; both terminal states write finished_at.
create or replace function public.finish_calendar_pass(p_pass_token jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; v_status text;
begin
  p := public.dq_calendar_lock_pass(p_pass_token);
  if exists (select 1 from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id
             and (state = 'pending' or (state = 'failed' and attempts < 3))) then
    raise exception 'pass_incomplete' using errcode = 'P0001';
  end if;
  v_status := case when exists (select 1 from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and state <> 'done')
                   then 'complete_with_failures' else 'complete' end;
  update public.dq_calendar_passes set status = v_status, finished_at = clock_timestamp() where market = p.market and pass_id = p.pass_id;
  return v_status;
end $$;
revoke execute on function public.finish_calendar_pass(jsonb) from public, anon, authenticated;
grant execute on function public.finish_calendar_pass(jsonb) to service_role;

  expect(r.counts.fetched).toBe(1);
 });
});

describe('runCalendarSync (CN)',()=>{
 it('without TUSHARE_TOKEN every unreceived row is unknown_upstream and the reason is summarised',async()=>{
  const h=await harness({market:'CN',members:[C]});
  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'success',passStatus:'complete'});
  const rows=rowsOf(h.tables,C);
  expect(rows.map(x=>x.report_kind)).toEqual(['q3','semiannual','q1','annual','q3','semiannual']);
  expect(rows.every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable'&&x.deadline_state==='statutory'&&x.expected_date===null)).toBe(true);
  expect(rows[0].detail).toMatchObject({schedule_unavailable:'no_token',display:{ticker:'600000.SH',name:'Issuer 0'}});
  expect(r.errors).toContainEqual({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify({no_token:1})});
  expect(h.tables.rows('issuer_filing_profiles')[0]).toMatchObject({regime:'cn',fiscal_year_end:'1231',source:'cn_statutory'});
 });
 it('a real response is kept in the bucket with its sha256 but stays unavailable until the semantics are verified',async()=>{
  const bytes=new TextEncoder().encode('{"code":0}');
  const h=await harness({market:'CN',members:[C],disclosure:async(ts)=>{expect(ts).toBe('600000.SH');return {bytes,sha256:'x',httpStatus:200,requestId:null,code:0,msg:'',fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600000.SH','20260701','20260930','20261028',null,null]],hasMore:false};}});
  await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect([...h.raw.objects.keys()].filter(k=>!k.endsWith('.meta.json'))).toHaveLength(1);   // landed raw-store also writes a .meta.json sidecar
  const rows=rowsOf(h.tables,C);
  expect(rows.every(x=>x.upstream_lookup==='unavailable'&&x.detail.schedule_unavailable==='unverified'&&typeof x.detail.upstream_sha256==='string')).toBe(true);
 });
 it('a Tushare API error code (积分不足) is unavailable with the code as reason',async()=>{
  const h=await harness({market:'CN',members:[C],disclosure:async()=>({bytes:new Uint8Array(),sha256:'x',httpStatus:200,requestId:null,code:40203,msg:'',fields:[],items:[],hasMore:false})});
  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect(r.errors).toContainEqual({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify({api_code_40203:1})});
  expect(h.raw.objects.size).toBe(0);
 });
});

describe('previewCalendar',()=>{
 it('computes rows for scope members without a batch, a pass or a profile write',async()=>{
  const h=await harness();
  const out=await previewCalendar(h.deps,{market:'US',limit:1});
  expect(out.map(o=>[o.issuerId,o.rows.length])).toEqual([[A,6]]);
  expect(h.tables.rows('ingest_batches')).toHaveLength(0);
  expect(h.tables.rows('issuer_filing_profiles')).toHaveLength(0);
  expect(h.tables.rows('dq_calendar_passes')).toHaveLength(0);
 });
});

describe('helpers',()=>{
 it('maps SQL messages to pass error codes',()=>{
  expect(toCalendarPassError({message:'fence_failed'}).code).toBe('fence_failed');
  expect(toCalendarPassError({message:'pass_incomplete'}).code).toBe('pass_incomplete');
  expect(toCalendarPassError({message:'permission denied'}).code).toBe('unknown');
 });
 it('expectationArgs drops issuer_id/market only',()=>{
  const row={issuer_id:A,market:'US',report_kind:'10-K',period_end:'2025-12-31'} as unknown as ExpectationRow;
  expect(expectationArgs([row])).toEqual([{report_kind:'10-K',period_end:'2025-12-31'}]);
 });
 it('parses disclosure_date rows by field name, dates to ISO',()=>{
  expect(parseDisclosureDate({fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600519.SH','20260115','20251231','20260403','20260403',null],['600519.SH',null,'bad',null,null,null]]}))
   .toEqual([{end_date:'2025-12-31',ann_date:'2026-01-15',pre_date:'2026-04-03',actual_date:'2026-04-03',modify_date:null}]);
 });
 it('profile: regime from the latest annual form, 52/53-week detection, no annual form → null',()=>{
  expect(profileFromSubmissions(A,view(),'2026-11-05')).toMatchObject({regime:'10-K',fiscal_year_end:'1231',week52_pattern:false});
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0927',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0930',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
  expect(profileFromSubmissions(A,view({entries:[{accessionNumber:'f',filingDate:'2026-04-01',reportDate:'2025-12-31',form:'20-F',primaryDocument:'f',isInlineXBRL:true},{accessionNumber:'k',filingDate:'2025-03-01',reportDate:'2024-12-31',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.regime).toBe('20-F');
  expect(profileFromSubmissions(A,view({entries:[]}),'2026-11-05')).toBeNull();
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'1331'}),'2026-11-05')?.fiscal_year_end).toBeNull();
 });
});
3:// profile + per-fiscal-year filer categories + calendar filings + upstream list + today → one
16:export interface FilingProfile{issuer_id:string;market:Market;category_raw_current:string|null;regime:'10-K'|'20-F'|'40-F'|'cn';fiscal_year_end:string|null;week52_pattern:boolean;source:string;source_sha256:string|null;as_of:string}
22:export interface ExpectationRow{issuer_id:string;market:Market;report_kind:ReportKind;period_end:string;period_end_estimated:boolean;deadline_state:DeadlineState;due_date:string|null;due_rule:string;expected_date:string|null;upstream_lookup:'ok'|'unavailable'|'not_applicable';upstream_filed_date:string|null;disclosure_state:DisclosureState;received_filing_id:string|null;received_date:string|null;profile_as_of:string|null;detail:Record<string,unknown>}
104:function deadlineOf(regime:FilingProfile['regime'],kind:ReportKind,periodEnd:string,fiscalYear:number,categories:readonly FilerCategoryRow[]):Deadline{
105: if(regime==='cn')return statutory(`cn.${kind}/1`,CN_DUE[kind as keyof typeof CN_DUE](+periodEnd.slice(0,4)),false);
106: if(regime==='40-F')return noRule('none.40f/1');
107: if(regime==='20-F')return statutory('us.20f/1',addMonthsAnchored(periodEnd,4),true);
115:const ANNUAL:Record<FilingProfile['regime'],ReportKind>={'10-K':'10-K','20-F':'20-F','40-F':'40-F',cn:'annual'};
117:function kindOf(regime:FilingProfile['regime'],month:number,anchor:number):ReportKind|null{
118: if(regime==='cn')return CN_KIND[month]??null;
119: if(month===anchor)return ANNUAL[regime];
120: return regime==='10-K'?'10-Q':null;
129:const strideOf=(regime:FilingProfile['regime'])=>regime==='20-F'||regime==='40-F'?12:3;
151:export function computeExpectations(input:{profile:FilingProfile;categories:FilerCategoryRow[];filings:CalendarFiling[];upstream:CalendarUpstream;today:string}):ExpectationRow[]{
152: const {profile,categories,filings,upstream,today}=input;
153: const regime=profile.regime;
154: const fye=regime==='cn'?'1231':profile.fiscal_year_end;
156: const week52=regime!=='cn'&&profile.week52_pattern;
160: const latestAnnual=filings.filter(f=>counts(f,ANNUAL[regime])).sort((a,b)=>b.period_end!.localeCompare(a.period_end!))[0];
161: if(latestAnnual&&regime!=='cn'){
163:  if(m!==anchor||(!week52&&pe.slice(5).replace('-','')!==fye))base.fye_mismatch=true;
168: // slot grid, newest first: quarter months around the anchor, or the anchor month only for annual-only regimes
169: const stride=strideOf(regime);
178:  const kind=kindOf(regime,s.month,anchor);
179:  if(!kind||!week52){
201:  let dl=deadlineOf(regime,p.kind,p.periodEnd,fiscalYear,categories);
206:  const cnRow=regime==='cn'?cnRows.filter(r=>r.end_date===p.periodEnd).sort((a,b)=>(b.ann_date??'').localeCompare(a.ann_date??''))[0]:undefined;
213:   const up=regime==='cn'?(cnRow?.actual_date?{date:cnRow.actual_date,accession:null}:null)
221:  rows.push({issuer_id:profile.issuer_id,market:profile.market,report_kind:p.kind,period_end:p.periodEnd,period_end_estimated:p.estimated,
223:   disclosure_state:state,received_filing_id:p.received?.filing_id??null,received_date:p.received?.available_date??null,profile_as_of:profile.as_of,detail});
   166	 if(!profile)return {rows:[],upstreamUnavailable:upstream.lookup==='unavailable',noProfile:true,noFye:false,noCategory:false,errors,scheduleReason};
   167	 const categories=market==='US'?(await selectAll(deps.tables,'issuer_filer_categories',{issuer_id:issuerId},'fiscal_year')).map(categoryFromRow):[];
   168	 const filings=await deps.db.filingsForCalendar(issuerId,market,{fromPeriodEnd:filingsWindowStart(today)});
   169	 let rows=computeExpectations({profile,categories,filings,upstream,today});
   170	 // US: coverage is per expected period (plan audit Q1); positive evidence is never discarded.
   171	 if(upstream.lookup==='ok'&&market==='US')rows=applyUpstreamCoverage(rows,upstream.us??[]);
   172	 const shown=await display(deps.tables,issuerId,scope,market,today);
   173	 rows=rows.map(r=>({...r,detail:{...r.detail,display:shown,...(upstream.sha256?{upstream_sha256:upstream.sha256}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}}));
   174	 return {rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
   175	}
   176	
   177	export async function runCalendarSync(deps:CalendarSyncDeps,opts:CalendarSyncOptions):Promise<CalendarReceipt>{
   178	 const {market}=opts;
   179	 const counts=emptyCounts();const errors:BatchError[]=[];const schedule:Record<string,number>={};
   180	 const detail:CalendarDetail={pass_id:null,issuers_done:0,issuers_failed:0,rows:0,by_deadline_state:{},by_disclosure_state:{},upstream_unavailable:0,no_fiscal_year_end:0,no_category:0,no_profile:0};
   181	 const {batchId}=await startBatch(deps.tables,{producer:'filing-calendar',dataset:DATASETS.calendar(market),toolVersions:{rules:CALENDAR_RULES_VERSION,market},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy});
   182	 const finish=async(passId:string|null,passStatus:CalendarReceipt['passStatus']):Promise<CalendarReceipt>=>{
   183	  if(Object.keys(schedule).length)errors.push({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify(schedule)});
   184	  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
   185	  return {batchId,status,passId,passStatus,counts,errors,detail};
   186	 };
   187	 const token=await deps.passes.claimPass(market,batchId);
   188	 if(!token){errors.push({code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})});return finish(null,null);}
   189	 detail.pass_id=token.pass_id;
   190	 const now=deps.now();const today=iso(now);
   191	 const members=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
   192	 const todo=[...members.filter(m=>m.state==='pending'),...members.filter(m=>m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)].map(m=>String(m.issuer_id)).slice(0,opts.limit);
   193	 let fenced=false;
   194	 for(const [i,issuer] of todo.entries()){
   195	  if(deps.budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:todo.length-i})});break;}
   196	  counts.fetched++;
   197	  let result:MemberResult;
   198	  try{result=await computeMember(deps,market,issuer,today,now.toISOString());}
   199	  catch(e){
   200	   counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
   201	   try{await deps.passes.failMember(token,issuer,errText(e));}
   202	   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
   203	   continue;
   204	  }
   205	  try{await deps.passes.replaceExpectations(issuer,market,result.rows,token);}
   206	  catch(e){
   207	   if(e instanceof CalendarPassError&&e.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}
   208	   counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
   209	   try{await deps.passes.failMember(token,issuer,errText(e));}
   210	   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
   211	   continue;
   212	  }
   213	  counts.inserted++;detail.issuers_done++;detail.rows+=result.rows.length;
   214	  errors.push(...result.errors);
   215	  if(result.scheduleReason)bump(schedule,result.scheduleReason);
   216	  if(result.upstreamUnavailable)detail.upstream_unavailable++;
   217	  if(result.noProfile)detail.no_profile++;
   218	  if(result.noFye)detail.no_fiscal_year_end++;
   219	  if(result.noCategory)detail.no_category++;
   220	  for(const r of result.rows){bump(detail.by_deadline_state,r.deadline_state);bump(detail.by_disclosure_state,r.disclosure_state);}
   221	 }
   222	 if(fenced)return finish(token.pass_id,'running');
   223	 const after=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
   224	 if(after.some(m=>m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)))return finish(token.pass_id,'running');
   225	 let passStatus:'complete'|'complete_with_failures';
   226	 try{passStatus=await deps.passes.finishPass(token);}
   227	 catch(e){if(e instanceof CalendarPassError&&(e.code==='fence_failed'||e.code==='pass_incomplete')){errors.push({code:e.code,key:token.pass_id});return finish(token.pass_id,'running');}throw e;}
   228	 const [pass]=await deps.tables.select('dq_calendar_passes',{market,pass_id:token.pass_id},{limit:1});
   229	 const startedAt=String(pass?.started_at??now.toISOString()),finishedAt=String(pass?.finished_at??deps.now().toISOString());
   230	 const tooLong=Date.parse(finishedAt)-Date.parse(startedAt)>PASS_MAX_AGE_MS;
   231	 await recordAttempt(deps.tables,DATASETS.calendar(market),{ok:passStatus==='complete'&&!tooLong,cadence:'daily',now:deps.now(),detail:{pass_id:token.pass_id,started_at:startedAt,finished_at:finishedAt,status:passStatus,...(tooLong?{pass_too_long:true}:{})}});
   232	 return finish(token.pass_id,passStatus);
   233	}
   234	
   235	/** Read-only preview for scripts (no batch, no pass, no profile write; deps.raw should be a memory store): the rows each scope member would get. */
   236	export async function previewCalendar(deps:CalendarSyncDeps,opts:{market:Market;issuerIds?:string[];limit:number}):Promise<{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]>{
   237	 const now=deps.now();
   238	 const scope=(await selectAll(deps.tables,'fact_sync_scope',{market:opts.market},'issuer_id')).filter(r=>opts.issuerIds?opts.issuerIds.includes(String(r.issuer_id)):Number(r.priority)>0);
   239	 const out:{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]=[];
   240	 for(const r of scope.slice(0,opts.issuerIds?undefined:opts.limit)){
   241	  const m=await computeMember(deps,opts.market,String(r.issuer_id),iso(now),now.toISOString(),false);
   242	  out.push({issuerId:String(r.issuer_id),rows:m.rows,errors:m.errors});
   243	 }
   244	 return out;
   245	}

codex
The worker leaves batches unfinished on pass-level failures and permits stale workers to overwrite shared profiles outside the lease fence. Both issues affect recovery and correctness under operational failures.

Full review comments:

- [P2] Finalize the batch when pass-level operations fail — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/calendar-sync.ts:187-191
  If claiming the pass, reading its members, or recording freshness throws, execution escapes after `startBatch` without calling `finishBatch`. A transient database failure therefore leaves a permanently running receipt, even when the pass has already completed. Wrap the post-start workflow in error handling that records the failure and attempts batch finalization before returning or rethrowing.

- [P2] Fence profile writes with the calendar pass token — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/calendar-sync.ts:145-145
  When a worker resumes after its lease expires and another worker takes over, `computeMember` can still overwrite `issuer_filing_profiles` before `replaceExpectations` detects the stale token. This can replace the takeover worker's newer regime or fiscal-year-end profile with stale data; subsequent runs use that stored profile when SEC is unavailable. Pass the token into the profile-writing operation and enforce the lease atomically in the database, rather than fencing only the expectation replacement.
The worker leaves batches unfinished on pass-level failures and permits stale workers to overwrite shared profiles outside the lease fence. Both issues affect recovery and correctness under operational failures.

Full review comments:

- [P2] Finalize the batch when pass-level operations fail — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/calendar-sync.ts:187-191
  If claiming the pass, reading its members, or recording freshness throws, execution escapes after `startBatch` without calling `finishBatch`. A transient database failure therefore leaves a permanently running receipt, even when the pass has already completed. Wrap the post-start workflow in error handling that records the failure and attempts batch finalization before returning or rethrowing.

- [P2] Fence profile writes with the calendar pass token — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/calendar-sync.ts:145-145
  When a worker resumes after its lease expires and another worker takes over, `computeMember` can still overwrite `issuer_filing_profiles` before `replaceExpectations` detects the stale token. This can replace the takeover worker's newer regime or fiscal-year-end profile with stale data; subsequent runs use that stored profile when SEC is unavailable. Pass the token into the profile-writing operation and enforce the lease atomically in the database, rather than fencing only the expectation replacement.
