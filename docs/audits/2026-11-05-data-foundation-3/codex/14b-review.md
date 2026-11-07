OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b100-e840-7513-a555-e0428ec57322
--------
user
commit c1a6e47
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline c1a6e47; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 4768ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-n244guYt' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Hy7lLZmo' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rEVsZ6SW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-dT3dOwt6' (errno=Operation not permitted)
c1a6e47 feat(dq): reconcile cycle runner with fenced per-key commits, hook recovery and settlement
 src/lib/dq/reconcile/run.test.ts | 295 +++++++++++++++++++++++++++++++++++++
 src/lib/dq/reconcile/run.ts      | 306 +++++++++++++++++++++++++++++++++++++++
 2 files changed, 601 insertions(+)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a; cat src/lib/dq/reconcile/run.ts; cat src/lib/dq/reconcile/run.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
// src/lib/dq/reconcile/run.ts
// Reconciliation cycle runner (spec §5.5; §3.1 cycles/cursor; §3.2 apply_reconcile_result and the cursor
// functions; §5.6; §8). One call = one batch for one pair:
//  0. pending hooks: open reconcile_mismatch items of this pair whose detail.hook is pending/failed are
//     materialized first, at T(i) = issuers.merged_into ?? i (crash between apply and materialize, U2);
//  1. cycle: the pair's running cycle, else (plan audit Q2) snapshot pending_members → resolve keys AFTER
//     the snapshot (pair.members, then pair.memberFor for each snapshot target members() missed) →
//     db.openReconcileCycle: under the cycle lock set_merge also takes, cycle row + cursors + removal of
//     exactly the snapshot entries in one transaction (later registrations wait for the next cycle; a
//     concurrent creator's running cycle is returned). Cursor rows are still ensured on every run (heal);
//  2. members in (issuer_id, market) order whose cursor is claimable; a member starts only with >= 60 s of
//     budget; every claim goes through claim_reconcile_member (fence);
//  3. keys this member already committed in this cycle (an earlier attempt) are read back first and are
//     final: they count as duplicates and are NEVER re-evaluated; evaluate runs only for the missing keys,
//     and a member whose keys all exist completes without any upstream read (spec T2; plan audit P5; their
//     pending hooks are step 0's job). One apply_reconcile_result per remaining key (result row + item +
//     visibility, atomic); a reused key is a duplicate; fence_failed stops this worker at once (committed
//     keys stay valid, the next claimer reuses them); visibility changes are materialized once per target at
//     the end of the member and the item hooks set done/failed — detail.hook alone, through
//     patchQuarantineDetail (row lock; a concurrent latest_result is never rolled back, plan audit P4); complete_reconcile_member derives the counts; any other exception →
//     fail_reconcile_member (the third failure is terminal);
//  4. settlement when every cursor is done or terminally failed: each done cursor must satisfy
//     drc_done_accounted (never coalesced); complete iff not_compared = 0 and no failed member; freshness
//     reconcile.<pair> (weekly) is recorded ONLY by the worker whose guarded update settled the cycle.
// Batch counts (§5.5): fetched = keys applied; inserted = passed; duplicates = reused; quarantined =
// mismatches that went to (or back to) an item; failed = non-compared results + mismatches recorded without
// an item + member failures. A ReconcileConfigError (bad gold/sample file, unresolvable issuer) fails the
// batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
import {randomUUID} from 'node:crypto';
import {TableError,selectAll} from '../../db/table-client';
import type {Row,TableClient} from '../../db/table-client';
import {materialize as materializeFacts} from '../../facts/derive';
import {makeBudget} from '../../facts/sync';
import {FactsDbError} from '../../facts/types';
import type {FactsDb,Market} from '../../facts/types';
import {emptyCounts,finishBatch,startBatch} from '../batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../batches';
import {DATASETS} from '../datasets';
import {recordAttempt} from '../freshness';
import {patchQuarantineDetail} from '../quarantine';
import type {RawStore} from '../raw-store';
import {ReconcileConfigError,sha256Hex} from './pair-support';
import type {PairRunContext,RegisteredPair} from './pair-support';
import {RECONCILE_PAIRS} from './pairs';
import {MAX_CURSOR_ATTEMPTS} from './types';
import type {ApplyReconcileOutcome,CyclePairId,CycleStatus,ExpectedKey,Fence,MemberCounts,MemberPlan,PendingMember,ReconcileResultInput} from './types';

export const MIN_MEMBER_MS=60_000;
export const CYCLE_TABLE='dq_reconcile_cycles',CURSOR_TABLE='dq_reconcile_cursor';
const MARKETS:readonly Market[]=['US','CN'];

export interface ReconcileDeps{
 db:FactsDb;tables:TableClient;raw:RawStore;fetch:typeof fetch;readRepoFile:(path:string)=>Promise<Uint8Array>;
 now:()=>Date;deadline:Date|null;codeVersion:string;
 pairs?:Partial<Record<CyclePairId,RegisteredPair>>;
 materialize?:(db:FactsDb,issuer:string,market:Market)=>Promise<unknown>;
}
export interface ReconcileOptions{pair:CyclePairId;triggeredBy:TriggeredBy;issuerIds?:string[];dryRun?:boolean}
export type MemberOutcome='done'|'failed'|'claimed_elsewhere'|'fence_lost'|'not_started';
export interface MemberReport{issuerId:string;market:Market;outcome:MemberOutcome;counts?:MemberCounts;code?:string}
export interface CycleReport{cycleId:string;status:CycleStatus;created:boolean;settled:boolean;expectedTotal:number}
export interface ReconcileReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];cycle:CycleReport|null;members:MemberReport[];hooks:{retried:number;failed:number};dryRun?:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]}
export class ReconcileError extends Error{constructor(public readonly code:string,message?:string){super(message??code);this.name='ReconcileError';}}

interface FrozenMember{issuer_id:string;market:Market;expected_keys:ExpectedKey[]}
interface Hook{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
const mkey=(issuer:string,market:string)=>`${issuer}:${market}`;
const isFence=(e:unknown)=>e instanceof FactsDbError&&e.code==='fence_failed';
const codeOf=(e:unknown):string=>e instanceof FactsDbError||e instanceof ReconcileError||e instanceof ReconcileConfigError?e.code:`exception:${(e instanceof Error?e.message:String(e)).slice(0,200)}`;

function frozenOf(row:Row):FrozenMember[]{
 if(!Array.isArray(row.members))throw new ReconcileError('cycle_members_invalid');
 return row.members.map(m=>{
  const x=m as Partial<FrozenMember>;
  if(typeof x.issuer_id!=='string'||(x.market!=='US'&&x.market!=='CN')||!Array.isArray(x.expected_keys))throw new ReconcileError('cycle_members_invalid');
  return {issuer_id:x.issuer_id,market:x.market,expected_keys:x.expected_keys};
 });
}
/** set_merge registrations still waiting in a cycle row; an entry leaves only through open_reconcile_cycle (plan audit Q2). */
const pendingOf=(row:Row):PendingMember[]=>{
 const d=(row.detail??{}) as {pending_members?:unknown};
 if(!Array.isArray(d.pending_members))return [];
 return d.pending_members.filter((p):p is PendingMember=>!!p&&typeof (p as Row).issuer_id==='string'&&typeof (p as Row).source==='string'&&((p as Row).market==='US'||(p as Row).market==='CN'));
};
function freeze(plans:MemberPlan[]):FrozenMember[]{
 const byKey=new Map<string,FrozenMember>();
 for(const p of plans){
  const k=mkey(p.issuerId,p.market);if(byKey.has(k))throw new ReconcileError('duplicate_member',k);
  if(new Set(p.expectedKeys.map(e=>e.naturalKey)).size!==p.expectedKeys.length)throw new ReconcileError('duplicate_expected_key',k);
  byKey.set(k,{issuer_id:p.issuerId,market:p.market,expected_keys:p.expectedKeys});
 }
 return [...byKey.values()].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.market<b.market?-1:a.market>b.market?1:0);
}

/**
 * A new cycle without a window (plan audit Q2):
 *  1. snapshot the pending entries (plain read);
 *  2. resolve expected keys AFTER the snapshot — pair.members(ctx), then pair.memberFor for each snapshot
 *     target members() did not list — so every merge in the snapshot is visible to the resolver (a zero-key
 *     member is a resolved answer, never a placeholder);
 *  3. db.openReconcileCycle: under the cycle lock set_merge also takes, the cycle row, its cursors and the
 *     removal of exactly the snapshot entries commit together. An entry registered after the snapshot is not
 *     consumed and joins the next cycle; a running cycle created meanwhile is returned (created:false).
 * The runner never rewrites a cycle row's detail. A crash before 3 leaves nothing; after 3 the cycle and
 * cursors exist and the next run uses them.
 */
async function openCycle(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunContext):Promise<{row:Row;created:boolean}>{
 const [existing]=await deps.tables.select(CYCLE_TABLE,{pair:pair.id,status:'running'},{limit:1});
 if(existing)return {row:existing,created:false};
 const pending=(await selectAll(deps.tables,CYCLE_TABLE,{pair:pair.id},'cycle_id')).flatMap(pendingOf);
 const plans=[...await pair.members(ctx)];
 const listed=new Set(plans.map(p=>mkey(p.issuerId,p.market)));
 for(const p of pending){
  const k=mkey(p.issuer_id,p.market);if(listed.has(k))continue;
  if(!pair.memberFor)throw new ReconcileError('pending_without_resolver',`${pair.id}:${k}`);
  const plan=await pair.memberFor(ctx,p.issuer_id,p.market);
  if(plan.issuerId!==p.issuer_id||plan.market!==p.market)throw new ReconcileError('evaluate_contract',k);
  plans.push(plan);listed.add(k);
 }
 const members=freeze(plans);
 const startedAt=deps.now();
 const cycleId=`${pair.id}-${startedAt.toISOString().slice(0,10)}-${randomUUID().slice(0,8)}`;
 const out=await deps.db.openReconcileCycle({pair:pair.id,cycleId,startedAt:startedAt.toISOString(),members,pending});
 return {row:out.cycle as Row,created:out.created};
}

async function readCursors(tables:TableClient,pair:CyclePairId,cycleId:string):Promise<Row[]>{
 const out:Row[]=[];
 for(const market of MARKETS)out.push(...await selectAll(tables,CURSOR_TABLE,{pair,cycle_id:cycleId,market},'issuer_id'));
 return out.sort((a,b)=>String(a.issuer_id)<String(b.issuer_id)?-1:String(a.issuer_id)>String(b.issuer_id)?1:String(a.market)<String(b.market)?-1:1);
}
async function ensureCursors(tables:TableClient,pair:CyclePairId,cycleId:string,members:FrozenMember[]):Promise<void>{
 const have=new Set((await readCursors(tables,pair,cycleId)).map(c=>mkey(String(c.issuer_id),String(c.market))));
 for(const m of members){
  if(have.has(mkey(m.issuer_id,m.market)))continue;
  try{
   await tables.insert(CURSOR_TABLE,{pair,cycle_id:cycleId,issuer_id:m.issuer_id,market:m.market,expected:m.expected_keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
  }catch(e){if(!(e instanceof TableError&&e.code==='23505'))throw e;}
 }
}
function claimable(c:Row,now:Date):boolean{
 const until=c.claim_until===null||c.claim_until===undefined?null:Date.parse(String(c.claim_until));
 if(c.state==='pending')return true;
 if(c.state==='claimed')return until!==null&&until<now.getTime();
 if(c.state==='failed')return Number(c.attempts)<MAX_CURSOR_ATTEMPTS;
 return false;
}

async function targetOf(tables:TableClient,issuer:string):Promise<string>{
 const [r]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
 return typeof r?.merged_into==='string'?r.merged_into:issuer;
}
/** detail.hook alone, through the row-locking patch (plan audit P4); a missing item is a no-op. Never throws. */
async function setHook(tables:TableClient,id:string,hook:Hook):Promise<void>{
 try{await patchQuarantineDetail(tables,id,'hook',hook);}
 catch(e){console.error('[reconcile] hook write',e instanceof Error?e.message:String(e));}
}
/** Materializes each distinct target once and writes every listed item's hook; never throws. Returns the number of failed targets' items. */
async function runHooks(deps:ReconcileDeps,list:{itemId:string|null;issuerId:string;market:Market}[],errors:BatchError[]):Promise<number>{
 const mat=deps.materialize??((db:FactsDb,issuer:string,market:Market)=>materializeFacts(db,issuer,market));
 const groups=new Map<string,{target:string;market:Market;items:string[]}>();
 for(const x of list){
  const target=await targetOf(deps.tables,x.issuerId);const k=mkey(target,x.market);
  const g=groups.get(k)??{target,market:x.market,items:[]};if(x.itemId)g.items.push(x.itemId);groups.set(k,g);
 }
 let failed=0;
 for(const g of groups.values()){
  let hook:Hook;
  try{await mat(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:deps.now().toISOString()};}
  catch(e){
   const code=e instanceof FactsDbError?e.code:'materialize_failed';
   hook={stage:'materialize',state:'failed',at:deps.now().toISOString(),message:code};
   errors.push({code:'materialize_error',key:mkey(g.target,g.market),message:code});failed+=g.items.length;
  }
  for(const id of g.items)await setHook(deps.tables,id,hook);
 }
 return failed;
}
async function retryPendingHooks(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<{retried:number;failed:number}>{
 const rows=(await selectAll(deps.tables,'dq_quarantine',{reason_code:'reconcile_mismatch',status:'open'},'id')).filter(r=>{
  const d=(r.detail??{}) as {pair?:unknown;hook?:{state?:unknown};issuer_id?:unknown;market?:unknown};
  return d.pair===pair&&(d.hook?.state==='pending'||d.hook?.state==='failed')&&typeof d.issuer_id==='string'&&(d.market==='US'||d.market==='CN');
 });
 if(rows.length===0)return {retried:0,failed:0};
 const failed=await runHooks(deps,rows.map(r=>{const d=r.detail as {issuer_id:string;market:Market};return {itemId:String(r.id),issuerId:d.issuer_id,market:d.market};}),errors);
 return {retried:rows.length,failed};
}

/** Natural keys this member already committed in this cycle (any earlier attempt); final, never re-evaluated (spec T2; plan audit P5). */
async function acceptedKeys(tables:TableClient,fence:Fence):Promise<Set<string>>{
 const rows=await selectAll(tables,'dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market},'natural_key');
 return new Set(rows.map(r=>String(r.natural_key)));
}
function assertOnePerKey(plan:MemberPlan,results:ReconcileResultInput[]):void{
 if(results.length!==plan.expectedKeys.length||results.some((r,i)=>r.natural_key!==plan.expectedKeys[i].naturalKey))throw new ReconcileError('evaluate_contract');
}
function tally(r:ReconcileResultInput,out:ApplyReconcileOutcome,c:BatchCounts,outcomes:Map<string,number>):void{
 c.fetched++;
 if(out.reused){c.duplicates++;return;}
 if(r.outcome!=='compared'){c.failed++;outcomes.set(r.outcome,(outcomes.get(r.outcome)??0)+1);return;}
 if(r.passed){c.inserted++;return;}
 if(r.action==='record')c.failed++;else c.quarantined++;
}

async function processMember(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunContext,fence:Fence,plan:MemberPlan,counts:BatchCounts,errors:BatchError[],outcomes:Map<string,number>):Promise<MemberReport>{
 const key=mkey(fence.issuer_id,fence.market);
 const report=(outcome:MemberOutcome,extra:{counts?:MemberCounts;code?:string}={}):MemberReport=>({issuerId:fence.issuer_id,market:fence.market,outcome,...extra});
 const hooks:{itemId:string|null;issuerId:string;market:Market}[]=[];
 const flush=async()=>{if(hooks.length>0){await runHooks(deps,hooks.splice(0),errors);}};
 try{
  const accepted=await acceptedKeys(deps.tables,fence);
  const missing:MemberPlan={...plan,expectedKeys:plan.expectedKeys.filter(k=>!accepted.has(k.naturalKey))};
  const reused=plan.expectedKeys.length-missing.expectedKeys.length;
  counts.fetched+=reused;counts.duplicates+=reused;
  const results=missing.expectedKeys.length===0?[]:await pair.evaluate(ctx,missing);   // all keys committed → no upstream read at all
  assertOnePerKey(missing,results);
  for(const result of results){
   let out:ApplyReconcileOutcome;
   try{out=await deps.db.applyReconcileResult(fence,result);}
   catch(e){if(isFence(e)){errors.push({code:'fence_failed',key});await flush();return report('fence_lost');}throw e;}
   tally(result,out,counts,outcomes);
   if(out.materialize)hooks.push({itemId:out.itemId,issuerId:out.materialize.issuerId,market:out.materialize.market});
  }
  await flush();
  try{return report('done',{counts:await deps.db.completeReconcileMember(fence)});}
  catch(e){if(isFence(e)){errors.push({code:'fence_failed',key});return report('fence_lost');}throw e;}
 }catch(e){
  await flush();
  const code=codeOf(e);
  counts.failed++;errors.push({code:'member_failed',key,message:code});
  try{await deps.db.failReconcileMember(fence,code);}
  catch(f){if(isFence(f)){errors.push({code:'fence_failed',key});return report('fence_lost',{code});}throw f;}
  return report('failed',{code});
 }
}

async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string):Promise<{settled:boolean;status:CycleStatus}>{
 const rows=await readCursors(deps.tables,pair,cycleId);
 if(!rows.every(c=>c.state==='done'||(c.state==='failed'&&Number(c.attempts)>=MAX_CURSOR_ATTEMPTS)))return {settled:false,status:'running'};
 let passed=0,failedCmp=0,notCompared=0,failedMembers=0;
 for(const c of rows){
  if(c.state==='failed'){failedMembers++;continue;}
  const v=[c.compared_passed,c.compared_failed,c.not_compared].map(x=>x===null||x===undefined?null:Number(x));
  if(v.some(x=>x===null||!Number.isSafeInteger(x)||x<0)||(v[0]!+v[1]!+v[2]!)!==Number(c.expected))throw new ReconcileError('cursor_unaccounted',mkey(String(c.issuer_id),String(c.market)));
  passed+=v[0]!;failedCmp+=v[1]!;notCompared+=v[2]!;
 }
 const status:CycleStatus=notCompared===0&&failedMembers===0?'complete':'complete_with_gaps';
 const now=deps.now();
 const n=await deps.tables.update(CYCLE_TABLE,{pair,cycle_id:cycleId,status:'running'},{status,finished_at:now.toISOString(),compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers});
 if(n!==1)return {settled:false,status};
 await recordAttempt(deps.tables,DATASETS.reconcile(pair),{ok:status==='complete',cadence:'weekly',now,detail:{cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers}});
 return {settled:true,status};
}

export async function runReconcile(deps:ReconcileDeps,opts:ReconcileOptions):Promise<ReconcileReceipt>{
 const pair=(deps.pairs??RECONCILE_PAIRS)[opts.pair];
 if(!pair)throw new ReconcileError('pair_not_registered',opts.pair);
 const budget=makeBudget(deps.deadline,deps.now);
 const base={db:deps.db,tables:deps.tables,raw:deps.raw,now:deps.now,budget,fetch:deps.fetch,readRepoFile:deps.readRepoFile};
 const want=opts.issuerIds?new Set(opts.issuerIds):null;
 if(opts.dryRun){
  const ctx:PairRunContext={...base,batchId:null,dryRun:true};
  const out:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]=[];
  for(const plan of await pair.members(ctx)){
   if(want&&!want.has(plan.issuerId))continue;
   const results=await pair.evaluate(ctx,plan);assertOnePerKey(plan,results);
   out.push({issuerId:plan.issuerId,market:plan.market,results});
  }
  return {batchId:null,status:'dry_run',counts:emptyCounts(),errors:[],cycle:null,members:[],hooks:{retried:0,failed:0},dryRun:out};
 }
 const counts=emptyCounts();const errors:BatchError[]=[];const outcomes=new Map<string,number>();const members:MemberReport[]=[];
 const hooks=await retryPendingHooks(deps,pair.id,errors);
 const sample=pair.inputs.repoFile===null?'':await deps.readRepoFile(pair.inputs.repoFile).then(sha256Hex,()=>'');
 const tool=(cycleId:string)=>({pair:pair.id,cycle_id:cycleId,parser:pair.inputs.parserVersion,gold_schema:pair.inputs.goldSchema??'',sample_sha256:sample,code_version:deps.codeVersion});
 const {batchId}=await startBatch(deps.tables,{producer:'reconcile',dataset:DATASETS.reconcile(pair.id),toolVersions:tool(''),codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const finish=async(cycle:CycleReport|null)=>{
  if(outcomes.size>0)errors.push({code:'outcome_summary',message:JSON.stringify(Object.fromEntries([...outcomes.entries()].sort(([a],[b])=>a<b?-1:1)))});
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  return {batchId,status,counts,errors,cycle,members,hooks} satisfies ReconcileReceipt;
 };
 const ctx:PairRunContext={...base,batchId,dryRun:false};
 let opened:{row:Row;created:boolean};
 try{opened=await openCycle(deps,pair,ctx);}
 catch(e){if(e instanceof ReconcileConfigError){errors.push({code:e.code,message:e.message});return finish(null);}throw e;}
 const cycleId=String(opened.row.cycle_id);const frozen=frozenOf(opened.row);
 await deps.tables.update('ingest_batches',{batch_id:batchId,status:'running'},{tool_versions:tool(cycleId)});
 await ensureCursors(deps.tables,pair.id,cycleId,frozen);
 const plans=new Map<string,MemberPlan>(frozen.map(m=>[mkey(m.issuer_id,m.market),{issuerId:m.issuer_id,market:m.market,expectedKeys:m.expected_keys}]));
 for(const c of await readCursors(deps.tables,pair.id,cycleId)){
  const issuerId=String(c.issuer_id),market=c.market as Market,key=mkey(issuerId,market);
  if(want&&!want.has(issuerId))continue;
  if(!claimable(c,deps.now()))continue;
  const plan=plans.get(key);
  if(!plan){errors.push({code:'member_failed',key,message:'cursor_without_member'});continue;}
  if(budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',key});members.push({issuerId,market,outcome:'not_started'});continue;}
  const fence=await deps.db.claimReconcileMember(pair.id,cycleId,issuerId,market,batchId);
  if(!fence){errors.push({code:'skipped_summary',key:`${key}:claimed`});members.push({issuerId,market,outcome:'claimed_elsewhere'});continue;}
  const r=await processMember(deps,pair,ctx,fence,plan,counts,errors,outcomes);
  members.push(r);
  if(r.outcome==='fence_lost')break;
 }
 let settled:{settled:boolean;status:CycleStatus}={settled:false,status:'running'};
 try{settled=await settle(deps,pair.id,cycleId);}
 catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
 return finish({cycleId,status:settled.status,created:opened.created,settled:settled.settled,expectedTotal:Number(opened.row.expected_total)});
}
// src/lib/dq/reconcile/run.test.ts
import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import type {Row,TableClient} from '../../db/table-client';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {FactsDbError} from '../../facts/types';
import type {FactsDb,Market} from '../../facts/types';
import {memoryRawStore} from '../raw-store';
import {ReconcileConfigError} from './pair-support';
import type {RegisteredPair} from './pair-support';
import {CURSOR_TABLE,CYCLE_TABLE,MIN_MEMBER_MS,runReconcile} from './run';
import type {ReconcileDeps} from './run';
import {reconcileTables,seedPublished} from './testing';
import type {CyclePairId,MemberPlan,ReconcileResultInput} from './types';

const PAIR:CyclePairId='us.companyfacts_vs_gold';
const T0='2026-11-05T02:00:00.000Z';
const rec=(nk:string,over:Partial<ReconcileResultInput>={}):ReconcileResultInput=>({natural_key:nk,kind:'numeric',outcome:'compared',passed:true,left_value:'1',right_value:'1',abs_diff:'0',rel_diff:'0',tolerance:'0',left_source:'l',right_source:'r',detail:{},action:'record',...over});
const miss=(nk:string)=>rec(nk,{outcome:'right_missing',passed:false,right_value:null,left_value:null,abs_diff:null,rel_diff:null});
const keys=(...nks:string[])=>nks.map(naturalKey=>({naturalKey,locator:{}}));
function stubPair(members:MemberPlan[],evaluate:(m:MemberPlan)=>Promise<ReconcileResultInput[]>|ReconcileResultInput[]):RegisteredPair{
 return {id:PAIR,kind:'numeric',left:'l',right:'r',inputs:{repoFile:null,parserVersion:'stub/1',goldSchema:null},currentRight:async()=>null,members:async()=>members,evaluate:async(_ctx,m)=>evaluate(m)};
}
function harness(pair:RegisteredPair,over:Partial<ReconcileDeps>={}){
 const tables=reconcileTables();const db=memoryFactsDb(tables);let clock=T0;db.setNow(clock);
 const materialize=vi.fn<(db:FactsDb,issuer:string,market:string)=>Promise<unknown>>(async()=>({rows:0,stateRev:0,retried:false}));
 const deps:ReconcileDeps={db,tables,raw:memoryRawStore(),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,
  readRepoFile:async()=>{throw new Error('no repo files');},now:()=>new Date(clock),deadline:null,codeVersion:'test',pairs:{[PAIR]:pair},materialize,...over};
 const advance=(ms:number)=>{clock=new Date(Date.parse(clock)+ms).toISOString();db.setNow(clock);};
 return {tables,db,deps,materialize,advance};
}
const A='00000000-0000-4000-8000-00000000000a',B='00000000-0000-4000-8000-00000000000b';
const freshness=(t:TableClient)=>t.select('dq_freshness',{dataset:`reconcile.${PAIR}`}).then(r=>r[0]);
const cursors=(t:TableClient)=>t.select(CURSOR_TABLE,{pair:PAIR},{orderBy:'issuer_id'});

describe('runReconcile — cycle, counts, settlement',()=>{
 it('creates a frozen cycle, applies one result per key, maps batch counts, materializes once and settles with gaps',async()=>{
  const pairRef:{p?:RegisteredPair}={};   // the stub needs the seeded fact_id, known only after harness() created the db
  const h=harness({...stubPair([],()=>[]),members:async c=>pairRef.p!.members(c),evaluate:async(c,m)=>pairRef.p!.evaluate(c,m)});
  const seeded=await seedPublished(h.db,{issuer:A,market:'US',sourceRef:'acc-a',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'100',period_start:'2023-01-01',period_end:'2023-12-31'}]});
  const [fact]=await h.db.factsByIds(seeded.factIds);
  pairRef.p=stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2','k3')}],()=>[
   rec('k1'),
   rec('k2',{passed:false,left_value:'100',right_value:'101',abs_diff:'1',rel_diff:'0.0099009901',action:'quarantine_left',left_fact_id:fact.fact_id,inputs_hash:'h2',
    item:{natural_key:`${PAIR}:k2:${fact.fact_id}`,payload:{key:{issuer_id:A,market:'US',concept:'revenue'},fact_ids:[fact.fact_id],left_value:'100',right_value:'101',right_locator:{}},detail:{pair:PAIR,inputs_hash:'h2',issuer_id:A,market:'US'}}}),
   miss('k3'),
  ]);
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'script'});
  expect(r.counts).toEqual({fetched:3,inserted:1,duplicates:0,versioned:0,quarantined:1,failed:1});
  expect(r.status).toBe('partial');
  expect(r.errors).toContainEqual({code:'outcome_summary',message:'{"right_missing":1}'});
  expect(r.cycle).toMatchObject({created:true,settled:true,status:'complete_with_gaps',expectedTotal:3});
  expect(r.members).toEqual([{issuerId:A,market:'US',outcome:'done',counts:{compared_passed:1,compared_failed:1,not_compared:1}}]);
  const [cycle]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(cycle).toMatchObject({status:'complete_with_gaps',expected_total:3,compared_passed:1,compared_failed:1,not_compared:1,exec_failed_members:0});
  expect(cycle.members).toEqual([{issuer_id:A,market:'US',expected_keys:keys('k1','k2','k3')}]);
  expect(String(cycle.cycle_id)).toMatch(/^us\.companyfacts_vs_gold-2026-11-05-[0-9a-f]{8}$/);
  expect(await h.tables.select('dq_reconciliations',{cycle_id:cycle.cycle_id})).toHaveLength(3);
  expect(h.db.facts().find(f=>f.fact_id===fact.fact_id)?.status).toBe('quarantined');
  expect(h.materialize).toHaveBeenCalledTimes(1);expect(h.materialize).toHaveBeenCalledWith(h.db,A,'US');
  const [item]=await h.tables.select('dq_quarantine',{reason_code:'reconcile_mismatch'});
  expect((item.detail as {hook:{state:string}}).hook.state).toBe('done');
  const [batch]=await h.tables.select('ingest_batches',{batch_id:r.batchId});
  expect(batch).toMatchObject({producer:'reconcile',dataset:`reconcile.${PAIR}`,status:'partial'});
  expect(batch.tool_versions).toMatchObject({pair:PAIR,cycle_id:cycle.cycle_id,parser:'stub/1',gold_schema:'',sample_sha256:'',code_version:'test'});
  expect(await freshness(h.tables)).toMatchObject({expected_cadence:'weekly',consecutive_errors:1,last_ok_at:null});
 });
 it('a cycle whose mismatches all went to items is complete and records freshness ok',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1',{passed:false,left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',action:'review_item',item:{natural_key:`${PAIR}:k1:x`,payload:{fact_ids:[]},detail:{pair:PAIR,issuer_id:A,market:'US'}}})]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({settled:true,status:'complete'});
  expect(r.counts).toMatchObject({fetched:1,quarantined:1,failed:0});
  expect(await freshness(h.tables)).toMatchObject({expected_cadence:'weekly',consecutive_errors:0,status:'fresh'});
 });
 it('R2 regression: a cycle whose keys are all not compared is complete_with_gaps and freshness ok:false',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2')}],()=>[miss('k1'),rec('k2',{outcome:'incomplete_gold',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null})]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({settled:true,status:'complete_with_gaps'});
  expect(r.counts).toMatchObject({fetched:2,inserted:0,failed:2});
  expect(await freshness(h.tables)).toMatchObject({consecutive_errors:1});
 });
 it('an empty pair settles a zero-member cycle as complete',async()=>{
  const h=harness(stubPair([],()=>[]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'success',cycle:{settled:true,status:'complete',expectedTotal:0},members:[]});
 });
 it('a concurrent creator wins: openReconcileCycle returns its running cycle (created false) and the winner is used',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],m=>m.issuerId===B?[rec('w1')]:[rec('k1')]));
  const real=h.db.openReconcileCycle.bind(h.db);let raced=false;
  const racing:FactsDb={...h.db,openReconcileCycle:async i=>{
   if(!raced){raced=true;await real({...i,cycleId:'winner',members:[{issuer_id:B,market:'US',expected_keys:keys('w1')}],pending:[]});}   // the other runner commits first
   return real(i);}};
  const r=await runReconcile({...h.deps,db:racing},{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({cycleId:'winner',created:false});
  expect(r.members.map(m=>m.issuerId)).toEqual([B]);
  expect(await h.tables.select(CYCLE_TABLE,{pair:PAIR})).toHaveLength(1);
 });
 // ---- pending members (plan audit Q2): keys resolved after the snapshot; only snapshot entries consumed; atomic creation
 const EB={issuer_id:B,market:'US' as const,source:'src-b'};
 const oldCycle=(pending:unknown[])=>({pair:PAIR,cycle_id:'old',started_at:'2026-11-01T00:00:00.000Z',finished_at:'2026-11-01T01:00:00.000Z',members:[],status:'complete',expected_total:0,compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{pending_members:pending}});
 const pendingPair=(o:{members?:()=>Promise<MemberPlan[]>}={})=>{
  const memberFor=vi.fn(async(_c:unknown,issuerId:string,market:Market):Promise<MemberPlan>=>({issuerId,market,expectedKeys:keys('b1')}));
  const base=stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],m=>m.issuerId===A?[rec('k1')]:[rec('b1')]);
  return {pair:{...base,...(o.members?{members:o.members}:{}),memberFor} as RegisteredPair,memberFor};
 };
 const pendingOfOld=async(t:TableClient)=>((await t.select(CYCLE_TABLE,{pair:PAIR,cycle_id:'old'}))[0].detail as {pending_members:unknown[];pending_consumed_by?:string});
 it('a pending target that members() missed gets its keys from memberFor before freezing (never a zero-key placeholder); its entry is consumed',async()=>{
  const {pair,memberFor}=pendingPair();const h=harness(pair);
  await h.tables.insert(CYCLE_TABLE,oldCycle([EB]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  const [fresh]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:r.cycle!.cycleId});
  expect(fresh.members).toEqual([{issuer_id:A,market:'US',expected_keys:keys('k1')},{issuer_id:B,market:'US',expected_keys:keys('b1')}]);
  expect(fresh).toMatchObject({expected_total:2,detail:{pending_merged_from:['old'],pending_transferred:[EB]}});
  expect(memberFor).toHaveBeenCalledTimes(1);
  expect(await pendingOfOld(h.tables)).toEqual({pending_members:[],pending_consumed_by:r.cycle!.cycleId});
  expect(r.members.map(m=>[m.issuerId,m.outcome])).toEqual([[A,'done'],[B,'done']]);
  expect(r.cycle).toMatchObject({settled:true,status:'complete'});
 });
 for(const when of ['while members() runs','after members(), before openReconcileCycle'] as const){
  it(`interleaving: a merge registered ${when} (after the snapshot) is neither lost nor frozen with zero keys; the next cycle takes it with resolved keys`,async()=>{
   let h:ReturnType<typeof harness>;let landed=false;
   const land=async()=>{if(landed)return;landed=true;const d=await pendingOfOld(h.tables);await h.tables.update(CYCLE_TABLE,{pair:PAIR,cycle_id:'old'},{detail:{...d,pending_members:[...d.pending_members,EB]}});};   // set_merge commits here
   const {pair,memberFor}=pendingPair(when==='while members() runs'?{members:async()=>{await land();return [{issuerId:A,market:'US',expectedKeys:keys('k1')}];}}:{});
   h=harness(pair);
   await h.tables.insert(CYCLE_TABLE,oldCycle([]));
   const real=h.db.openReconcileCycle.bind(h.db);
   const db:FactsDb={...h.db,openReconcileCycle:async i=>{if(when!=='while members() runs')await land();return real(i);}};
   const r1=await runReconcile({...h.deps,db},{pair:PAIR,triggeredBy:'cron'});
   const [c1]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:r1.cycle!.cycleId});
   expect(c1.members).toEqual([{issuer_id:A,market:'US',expected_keys:keys('k1')}]);
   expect(memberFor).not.toHaveBeenCalled();
   expect((await pendingOfOld(h.tables)).pending_members).toEqual([EB]);                  // still pending: not overwritten, not consumed
   expect(r1.cycle).toMatchObject({settled:true});
   h.advance(60_000);
   const r2=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
   const [c2]=await h.tables.select(CYCLE_TABLE,{pair:PAIR,cycle_id:r2.cycle!.cycleId});
   expect(c2.members).toEqual([{issuer_id:A,market:'US',expected_keys:keys('k1')},{issuer_id:B,market:'US',expected_keys:keys('b1')}]);
   expect(memberFor).toHaveBeenCalledTimes(1);
   expect((await pendingOfOld(h.tables)).pending_members).toEqual([]);
  });
 }
 it('crash recovery: dying before openReconcileCycle commits leaves pending intact; dying right after it leaves the cycle and every cursor, and the next run uses them without consuming again',async()=>{
  const {pair,memberFor}=pendingPair();const h=harness(pair);
  await h.tables.insert(CYCLE_TABLE,oldCycle([EB]));
  const dead:FactsDb={...h.db,openReconcileCycle:async()=>{throw new Error('connection reset');}};
  await expect(runReconcile({...h.deps,db:dead},{pair:PAIR,triggeredBy:'cron'})).rejects.toThrow('connection reset');
  expect(await h.tables.select(CYCLE_TABLE,{pair:PAIR})).toHaveLength(1);
  expect(await cursors(h.tables)).toEqual([]);
  expect((await pendingOfOld(h.tables)).pending_members).toEqual([EB]);
  const real=h.db.openReconcileCycle.bind(h.db);
  const late:FactsDb={...h.db,openReconcileCycle:async i=>{await real(i);throw new Error('worker killed');}};
  await expect(runReconcile({...h.deps,db:late},{pair:PAIR,triggeredBy:'cron'})).rejects.toThrow('worker killed');
  const running=await h.tables.select(CYCLE_TABLE,{pair:PAIR,status:'running'});
  expect(running).toHaveLength(1);
  expect((await cursors(h.tables)).map(c=>[c.issuer_id,c.state])).toEqual([[A,'pending'],[B,'pending']]);
  expect(await pendingOfOld(h.tables)).toEqual({pending_members:[],pending_consumed_by:running[0].cycle_id});
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.cycle).toMatchObject({cycleId:running[0].cycle_id,created:false,settled:true,status:'complete'});
  expect(memberFor).toHaveBeenCalledTimes(2);                                               // once per creation attempt, never for the existing cycle
 });
});

describe('runReconcile — fences, failures, budget',()=>{
 it('fence_failed stops the worker; after the lease expires the next worker reuses the committed key',async()=>{
  const pair=stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2')}],m=>m.expectedKeys.map(k=>rec(k.naturalKey)));   // honours the missing-key subset (P5)
  const h=harness(pair);
  let calls=0;
  const flaky:FactsDb={...h.db,applyReconcileResult:async(f,r)=>{calls++;if(calls===2)throw new FactsDbError('fence_failed');return h.db.applyReconcileResult(f,r);}};
  const r1=await runReconcile({...h.deps,db:flaky},{pair:PAIR,triggeredBy:'cron'});
  expect(r1.members).toEqual([{issuerId:A,market:'US',outcome:'fence_lost'}]);
  expect(r1.errors).toContainEqual({code:'fence_failed',key:`${A}:US`});
  expect(r1.cycle).toMatchObject({settled:false,status:'running'});
  const r2=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});   // lease still held: nothing claimable
  expect(r2.members).toEqual([]);
  h.advance(11*60_000);
  const r3=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r3.members[0]).toMatchObject({outcome:'done',counts:{compared_passed:2,compared_failed:0,not_compared:0}});
  expect(r3.counts).toMatchObject({fetched:2,duplicates:1,inserted:1});
  const [cycle]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(await h.tables.select('dq_reconciliations',{cycle_id:cycle.cycle_id})).toHaveLength(2);
  expect(r3.cycle).toMatchObject({settled:true,status:'complete'});
 });
 it('T2 / plan audit P5: a worker that dies after committing every key is completed from the accepted rows — no re-evaluation, even with the upstream down',async()=>{
  let calls=0;
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2')}],()=>{calls++;if(calls>1)throw new Error('sec_unavailable:http_503');return [rec('k1'),rec('k2')];}));
  const dying:FactsDb={...h.db,completeReconcileMember:async()=>{throw new Error('worker_killed');},failReconcileMember:async()=>{throw new Error('worker_killed');}};
  await expect(runReconcile({...h.deps,db:dying},{pair:PAIR,triggeredBy:'cron'})).rejects.toThrow('worker_killed');   // both keys committed, nothing completed
  expect((await cursors(h.tables))[0]).toMatchObject({state:'claimed',attempts:1});
  h.advance(11*60_000);                                                                                                 // the lease expires
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(calls).toBe(1);                                                                                                // the upstream is never asked again
  expect(r.members).toEqual([{issuerId:A,market:'US',outcome:'done',counts:{compared_passed:2,compared_failed:0,not_compared:0}}]);
  expect(r.counts).toMatchObject({fetched:2,duplicates:2,inserted:0,failed:0});
  expect(r.cycle).toMatchObject({settled:true,status:'complete'});
  const [cycle]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(await h.tables.select('dq_reconciliations',{cycle_id:cycle.cycle_id})).toHaveLength(2);
 });
 it('evaluate failures are retried up to three attempts, then the member is terminal and the cycle settles with gaps',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>{throw new Error('sec_unavailable:http_503');}));
  for(let i=1;i<=3;i++){
   const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
   expect(r.members).toEqual([{issuerId:A,market:'US',outcome:'failed',code:'exception:sec_unavailable:http_503'}]);
   expect(r.counts.failed).toBe(1);
   expect((await cursors(h.tables))[0]).toMatchObject({state:'failed',attempts:i});
   expect(r.cycle?.settled).toBe(i===3);
  }
  const [cycle]=await h.tables.select(CYCLE_TABLE,{pair:PAIR});
  expect(cycle).toMatchObject({status:'complete_with_gaps',exec_failed_members:1});
  const r4=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});   // a new cycle starts after settlement
  expect(r4.cycle).toMatchObject({created:true});
 });
 it('an evaluate that does not return one result per expected key in order is a member failure (evaluate_contract)',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1','k2')}],()=>[rec('k2'),rec('k1')]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.members[0]).toMatchObject({outcome:'failed',code:'evaluate_contract'});
  expect(await h.tables.select('dq_reconciliations',{})).toHaveLength(0);
 });
 it('does not start a member with less than 60 s of budget (deadline_hit, informational)',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1')]));
  const r=await runReconcile({...h.deps,deadline:new Date(Date.parse(T0)+MIN_MEMBER_MS-1000)},{pair:PAIR,triggeredBy:'cron'});
  expect(r.members).toEqual([{issuerId:A,market:'US',outcome:'not_started'}]);
  expect(r.errors).toEqual([{code:'deadline_hit',key:`${A}:US`}]);
  expect(r.status).toBe('success');
  expect((await cursors(h.tables))[0]).toMatchObject({state:'pending',attempts:0});
 });
 it('issuerIds restricts which members are processed; settlement refuses a done cursor with null counts (S5)',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('a1')},{issuerId:B,market:'US',expectedKeys:keys('b1')}],m=>[rec(m.issuerId===A?'a1':'b1')]));
  const r1=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'script',issuerIds:[A]});
  expect(r1.members.map(m=>m.issuerId)).toEqual([A]);expect(r1.cycle?.settled).toBe(false);
  await h.tables.update(CURSOR_TABLE,{pair:PAIR,issuer_id:A},{compared_passed:null});
  const r2=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'script',issuerIds:[B]});
  expect(r2.errors).toContainEqual(expect.objectContaining({code:'cursor_unaccounted',key:`${A}:US`}));
  expect(r2.cycle).toMatchObject({settled:false,status:'running'});
  expect(await freshness(h.tables)).toBeUndefined();
 });
 it('a config error refuses the run: batch failed with the code, no cycle',async()=>{
  const h=harness({...stubPair([],()=>[]),members:async()=>{throw new ReconcileConfigError('invalid_gold_file','entries');}});
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'failed',cycle:null});
  expect(r.errors).toEqual([{code:'invalid_gold_file',message:'entries'}]);
  expect(await h.tables.select(CYCLE_TABLE,{pair:PAIR})).toEqual([]);
 });
 it('an unregistered pair is refused before any write',async()=>{
  const h=harness(stubPair([],()=>[]));
  await expect(runReconcile({...h.deps,pairs:{}},{pair:PAIR,triggeredBy:'cron'})).rejects.toMatchObject({code:'pair_not_registered'});
  expect(await h.tables.select('ingest_batches',{})).toEqual([]);
 });
});

describe('runReconcile — hooks and dry run',()=>{
 it('materializes pending/failed hooks of open mismatch items of THIS pair first, at the merge target',async()=>{
  const h=harness(stubPair([],()=>[]));
  const T='00000000-0000-4000-8000-0000000000ff';
  await h.tables.insert('issuers',{issuer_id:A,status:'merged',merged_into:T});
  const item=(pair:string,state:string)=>({id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`${pair}:k:${randomUUID()}`,reason_code:'reconcile_mismatch',detail:{pair,issuer_id:A,market:'US',hook:{stage:'materialize',state,at:T0}},payload:{fact_ids:[]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:T0});
  const mine=item(PAIR,'pending'),failed=item(PAIR,'failed'),done=item(PAIR,'done'),other=item('us.companyfacts_vs_ixbrl','pending');
  for(const i of [mine,failed,done,other])await h.tables.insert('dq_quarantine',i);
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.hooks).toEqual({retried:2,failed:0});
  expect(h.materialize).toHaveBeenCalledTimes(1);expect(h.materialize).toHaveBeenCalledWith(h.db,T,'US');
  const state=async(id:string)=>((await h.tables.select('dq_quarantine',{id}))[0].detail as {hook:{state:string}}).hook.state;
  expect([await state(mine.id),await state(failed.id),await state(done.id),await state(other.id)]).toEqual(['done','done','done','pending']);
 });
 it('plan audit P4: a hook write patches only detail.hook — a newer latest_result committed right before it survives',async()=>{
  const h=harness(stubPair([],()=>[]));
  const id=randomUUID();
  await h.tables.insert('dq_quarantine',{id,dataset:'facts.us',table_name:'financial_facts',natural_key:`${PAIR}:k:p4`,reason_code:'reconcile_mismatch',detail:{pair:PAIR,issuer_id:A,market:'US',latest_result:{passed:false,reconciliation_id:'r1'},hook:{stage:'materialize',state:'pending',at:T0}},payload:{},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:T0});
  // a concurrent apply_reconcile_result commits a newer result just before our hook write; the old read-then-replace wrote its stale copy back
  const newer=async()=>{const [cur]=await h.tables.select('dq_quarantine',{id});await h.tables.update('dq_quarantine',{id},{detail:{...(cur.detail as Row),latest_result:{passed:true,reconciliation_id:'r2'}}});};
  let fired=false;
  const racing:TableClient={...h.tables,
   async update(t,m,p){if(t==='dq_quarantine'&&'detail' in p&&!fired){fired=true;await newer();}return h.tables.update(t,m,p);},
   async rpc(fn,a){if(fn==='patch_quarantine_detail'&&!fired){fired=true;await newer();}return h.tables.rpc(fn,a);}};
  const r=await runReconcile({...h.deps,tables:racing},{pair:PAIR,triggeredBy:'cron'});
  expect(r.hooks).toEqual({retried:1,failed:0});
  const [row]=await h.tables.select('dq_quarantine',{id});
  expect(row.detail).toMatchObject({latest_result:{passed:true,reconciliation_id:'r2'},hook:{stage:'done',state:'done'}});
 });
 it('a materialize failure leaves the hook failed and reports materialize_error (visibility already committed)',async()=>{
  const h=harness(stubPair([],()=>[]),{materialize:async()=>{throw new FactsDbError('stale_computation');}});
  await h.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`${PAIR}:k:x`,reason_code:'reconcile_mismatch',detail:{pair:PAIR,issuer_id:A,market:'US',hook:{stage:'materialize',state:'pending',at:T0}},payload:{},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:T0});
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'cron'});
  expect(r.hooks).toEqual({retried:1,failed:1});
  expect(r.errors).toContainEqual(expect.objectContaining({code:'materialize_error',message:'stale_computation'}));
  expect(r.status).toBe('failed');   // nothing landed and a non-informational error
 });
 it('dry run evaluates without batch, cycle or result rows',async()=>{
  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')},{issuerId:B,market:'US',expectedKeys:keys('k2')}],m=>[rec(m.expectedKeys[0].naturalKey)]));
  const r=await runReconcile(h.deps,{pair:PAIR,triggeredBy:'script',dryRun:true,issuerIds:[B]});
  expect(r).toMatchObject({status:'dry_run',batchId:null,cycle:null});
  expect(r.dryRun).toEqual([{issuerId:B,market:'US',results:[rec('k2')]}]);
  expect(await h.tables.select('ingest_batches',{})).toEqual([]);
  expect(await h.tables.select(CYCLE_TABLE,{})).toEqual([]);
 });
});

exec
/bin/zsh -lc "sed -n '265,340p' src/lib/dq/reconcile/run.ts; cat src/lib/dq/reconcile/pair-support.ts | head -120; ls .claude; find . -name AGENTS.md -o -name AGENTS.override.md; rg -n 'claim_reconcile_member|attempts >=|attempts <' supabase/migrations/*recon*; cat src/lib/dq/batches.ts | tail -100; cat src/lib/db/table-client.ts | head -160" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 673ms:
   if(want&&!want.has(plan.issuerId))continue;
   const results=await pair.evaluate(ctx,plan);assertOnePerKey(plan,results);
   out.push({issuerId:plan.issuerId,market:plan.market,results});
  }
  return {batchId:null,status:'dry_run',counts:emptyCounts(),errors:[],cycle:null,members:[],hooks:{retried:0,failed:0},dryRun:out};
 }
 const counts=emptyCounts();const errors:BatchError[]=[];const outcomes=new Map<string,number>();const members:MemberReport[]=[];
 const hooks=await retryPendingHooks(deps,pair.id,errors);
 const sample=pair.inputs.repoFile===null?'':await deps.readRepoFile(pair.inputs.repoFile).then(sha256Hex,()=>'');
 const tool=(cycleId:string)=>({pair:pair.id,cycle_id:cycleId,parser:pair.inputs.parserVersion,gold_schema:pair.inputs.goldSchema??'',sample_sha256:sample,code_version:deps.codeVersion});
 const {batchId}=await startBatch(deps.tables,{producer:'reconcile',dataset:DATASETS.reconcile(pair.id),toolVersions:tool(''),codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const finish=async(cycle:CycleReport|null)=>{
  if(outcomes.size>0)errors.push({code:'outcome_summary',message:JSON.stringify(Object.fromEntries([...outcomes.entries()].sort(([a],[b])=>a<b?-1:1)))});
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  return {batchId,status,counts,errors,cycle,members,hooks} satisfies ReconcileReceipt;
 };
 const ctx:PairRunContext={...base,batchId,dryRun:false};
 let opened:{row:Row;created:boolean};
 try{opened=await openCycle(deps,pair,ctx);}
 catch(e){if(e instanceof ReconcileConfigError){errors.push({code:e.code,message:e.message});return finish(null);}throw e;}
 const cycleId=String(opened.row.cycle_id);const frozen=frozenOf(opened.row);
 await deps.tables.update('ingest_batches',{batch_id:batchId,status:'running'},{tool_versions:tool(cycleId)});
 await ensureCursors(deps.tables,pair.id,cycleId,frozen);
 const plans=new Map<string,MemberPlan>(frozen.map(m=>[mkey(m.issuer_id,m.market),{issuerId:m.issuer_id,market:m.market,expectedKeys:m.expected_keys}]));
 for(const c of await readCursors(deps.tables,pair.id,cycleId)){
  const issuerId=String(c.issuer_id),market=c.market as Market,key=mkey(issuerId,market);
  if(want&&!want.has(issuerId))continue;
  if(!claimable(c,deps.now()))continue;
  const plan=plans.get(key);
  if(!plan){errors.push({code:'member_failed',key,message:'cursor_without_member'});continue;}
  if(budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',key});members.push({issuerId,market,outcome:'not_started'});continue;}
  const fence=await deps.db.claimReconcileMember(pair.id,cycleId,issuerId,market,batchId);
  if(!fence){errors.push({code:'skipped_summary',key:`${key}:claimed`});members.push({issuerId,market,outcome:'claimed_elsewhere'});continue;}
  const r=await processMember(deps,pair,ctx,fence,plan,counts,errors,outcomes);
  members.push(r);
  if(r.outcome==='fence_lost')break;
 }
 let settled:{settled:boolean;status:CycleStatus}={settled:false,status:'running'};
 try{settled=await settle(deps,pair.id,cycleId);}
 catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
 return finish({cycleId,status:settled.status,created:opened.created,settled:settled.settled,expectedTotal:Number(opened.row.expected_total)});
}
// src/lib/dq/reconcile/pair-support.ts
// Pieces shared by the cycle pairs (spec §5.1–§5.6). RegisteredPair = C3 ReconcilePair plus its input
// recipe (repo file, parser version, gold schema) used for batch tool_versions and inputs_hash.
// PairRunContext = PairContext plus the batch id and dry-run flag the runner passes (record.ts side rows
// need the batch; dry runs must not write). ReconcileConfigError refuses a run (invalid gold/sample file,
// unresolvable issuer) — the runner finishes the batch failed with the code. activeRows is the T1/S2
// binding filter over read_filing_facts rows. openMismatches is the explicit re-check binding: an OPEN
// reconcile_mismatch item of this pair (natural_key '<pair>:<result natural_key>:<fact_id>') pins its key
// to payload.fact_ids[0] whatever the generation or status. Result builders keep the dq_reconciliations
// kind/side rules; actionFor is the one action rule every fact-backed pair uses (contract note 2).
import {createHash} from 'node:crypto';
import {selectAll} from '../../db/table-client';
import type {Row,TableClient} from '../../db/table-client';
import {keyComponents} from '../../facts/keys';
import type {FactRow,FactStatus,FilingFactRow,FilingRow,Market} from '../../facts/types';
import {DATASETS} from '../datasets';
import {absDecimal,relDiff,subDecimal} from './decimal';
import type {CyclePairId,MemberPlan,PairContext,ReconcileAction,ReconcileKind,ReconcileOutcome,ReconcilePair,ReconcileResultInput} from './types';

export interface PairInputs{repoFile:string|null;parserVersion:string;goldSchema:string|null}
/**
 * The CURRENT right-side evidence of one stored result (restore, spec §3.2 / §5.6; plan audit P2): the
 * sha256 the pair would read NOW for `rec` (its dq_reconciliations row, keyed by rec.natural_key) — iXBRL:
 * the current primary document fetched and hashed now; gold pairs: the current manifest's evidence for the
 * key — or null when it cannot be obtained now (fetch failed, entry gone or pending). Never the sha256 the
 * last run recorded (rec.detail.right.sha256).
 */
export type CurrentRight=(ctx:PairContext,rec:Row)=>Promise<string|null>;
export interface RegisteredPair extends ReconcilePair{
 inputs:PairInputs;currentRight:CurrentRight;
 /**
  * Expected keys of ONE target (plan audit Q2): the runner calls it for every pending_members target that
  * members(ctx) did not list, after its pending snapshot, so the merge is already visible. Its answer is
  * final for the cycle (a zero-key plan is a resolved answer). Only pairs that receive pending members
  * (facts.lineage_same_day) implement it; a pending entry for a pair without it fails the run.
  */
 memberFor?(ctx:PairContext,issuerId:string,market:Market):Promise<MemberPlan>;
}
export interface PairRunContext extends PairContext{batchId:string|null;dryRun:boolean}
/** The run context behind a PairContext; a context without the flags counts as a dry run (no side writes). */
export const runContextOf=(ctx:PairContext):PairRunContext=>{const c=ctx as Partial<PairRunContext>;return {...ctx,batchId:c.batchId??null,dryRun:c.dryRun??true};};

export type ReconcileConfigCode='invalid_gold_file'|'invalid_sample_file'|'issuer_unresolved'|'lineage_read_truncated'|'lineage_key_collision';
export class ReconcileConfigError extends Error{constructor(public readonly code:ReconcileConfigCode,message?:string){super(message??code);this.name='ReconcileConfigError';}}

export const sha256Hex=(b:Uint8Array|string):string=>createHash('sha256').update(b).digest('hex');
export const todayOf=(ctx:PairContext):string=>ctx.now().toISOString().slice(0,10);
/** Repo JSON with the sha256 of its exact bytes; unreadable or malformed → ReconcileConfigError(code). */
export async function readRepoJson(ctx:PairContext,path:string,code:'invalid_gold_file'|'invalid_sample_file'):Promise<{json:unknown;sha256:string}>{
 let bytes:Uint8Array;
 try{bytes=await ctx.readRepoFile(path);}catch(e){throw new ReconcileConfigError(code,`read ${path}: ${e instanceof Error?e.message:String(e)}`);}
 try{return {json:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:sha256Hex(bytes)};}
 catch{throw new ReconcileConfigError(code,`json ${path}`);}
}

/** T1 binding filter: rows of the filing's ACTIVE generation (> 0) from published runs, ok or quarantined. */
export function activeRows(rows:readonly FilingFactRow[],filing:FilingRow):FilingFactRow[]{
 if(!(filing.mapping_gen>0))return [];
 return rows.filter(r=>r.mapping_gen===filing.mapping_gen&&r.run_status==='published'&&(r.status==='ok'||r.status==='quarantined'));
}
export const factKeyOf=(r:{concept:string;period_start:string|null;period_end:string;unit:string})=>`${r.concept}|${r.period_start??''}|${r.period_end}|${r.unit}`;
export const fractionDigits=(v:string):number=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};
export const mismatchItemKey=(pair:CyclePairId,naturalKey:string,factId:string)=>`${pair}:${naturalKey}:${factId}`;

export interface OpenMismatch{itemId:string;factIds:string[]}
export async function openMismatches(tables:TableClient,pair:CyclePairId,market:Market):Promise<Map<string,OpenMismatch>>{
 const rows=await selectAll(tables,'dq_quarantine',{dataset:DATASETS.facts(market),reason_code:'reconcile_mismatch',status:'open'},'id');
 const out=new Map<string,OpenMismatch>();const prefix=`${pair}:`;
 for(const r of rows){
  if(((r.detail??{}) as {pair?:unknown}).pair!==pair)continue;
  const raw=((r.payload??{}) as {fact_ids?:unknown}).fact_ids;
  const factIds=Array.isArray(raw)?raw.filter((x):x is string=>typeof x==='string'):[];
  const nk=String(r.natural_key);
  if(factIds.length===0||!nk.startsWith(prefix)||!nk.endsWith(`:${factIds[0]}`))continue;
  out.set(nk.slice(prefix.length,nk.length-factIds[0].length-1),{itemId:String(r.id),factIds});
 }
 return out;
}

export interface Sides{left_source:string;right_source:string}
export interface ResultExtras{left_fact_id?:string;inputs_hash?:string;action?:ReconcileAction;item?:ReconcileResultInput['item']}
const extras=(x:ResultExtras)=>({...(x.left_fact_id!==undefined?{left_fact_id:x.left_fact_id}:{}),...(x.inputs_hash!==undefined?{inputs_hash:x.inputs_hash}:{}),...(x.item!==undefined?{item:x.item}:{})});
/** A non-compared result: every value column null, passed false, detail.reason defaults to the outcome. */
export function notCompared(natural_key:string,kind:ReconcileKind,outcome:Exclude<ReconcileOutcome,'compared'>,sides:Sides,detail:Record<string,unknown>,x:ResultExtras={}):ReconcileResultInput{
 return {natural_key,kind,outcome,passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',...sides,detail:{reason:outcome,...detail},action:x.action??'record',...extras(x)};
}
/** A compared numeric result with exact abs_diff and rel_diff. */
export function comparedNumeric(natural_key:string,left:string,right:string,o:{passed:boolean;tolerance:string;sides:Sides;detail:Record<string,unknown>}&ResultExtras):ReconcileResultInput{
 return {natural_key,kind:'numeric',outcome:'compared',passed:o.passed,left_value:left,right_value:right,abs_diff:absDecimal(subDecimal(left,right)),rel_diff:relDiff(left,right),tolerance:o.tolerance,...o.sides,detail:o.detail,action:o.action??'record',...extras(o)};
}
/** Contract note 2: bound through an open item → back to it; failed compare of an ok row → onFail; else record. */
export function actionFor(o:{bound:boolean;leftStatus:FactStatus|null;compared:boolean;passed:boolean;onFail:'quarantine_left'|'review_item'}):ReconcileAction{
 if(o.bound)return 'quarantine_left';
 if(o.compared&&!o.passed&&o.leftStatus==='ok')return o.onFail;
 return 'record';
}
/** The work item of a fact-backed mismatch (spec §5.6 payload); apply_reconcile_result adds reconciliation_id, latest_result and hook. */
export function mismatchItem(pair:CyclePairId,naturalKey:string,left:FactRow,rightValue:string|null,rightLocator:Record<string,unknown>,inputsHash:string):NonNullable<ReconcileResultInput['item']>{
 return {natural_key:mismatchItemKey(pair,naturalKey,left.fact_id),
  payload:{key:keyComponents(left.issuer_id,left.market,left),fact_ids:[left.fact_id],left_value:left.value,right_value:rightValue,right_locator:rightLocator},
  detail:{pair,inputs_hash:inputsHash,issuer_id:left.issuer_id,market:left.market}};
}
agents
launch.json
scratch
zsh:1: no matches found: supabase/migrations/*recon*
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
   if(error)fail('count',table,error);
   if(count===null||count===undefined)throw new Error('count_unavailable');
   return count as number;
  },
  async rpc(fn,args){
   const {data,error}=await (client as unknown as {rpc:(f:string,a:Row)=>PromiseLike<{data:unknown;error:PgError|null}>}).rpc(fn,args);
   if(error)fail('rpc',fn,error);
   return data;
  },
 };
}

exec
/bin/zsh -lc "rg -n 'claim_reconcile_member|hook.*pending|materialize.*issuerId' supabase src/lib/facts | head -70; ls -a /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude; rg -n 'async evaluate|evaluate\\(' src/lib/dq/reconcile/*ts; rg -n 'recordAttempt|last_ok_at' src/lib/dq/freshness.ts; git show c1a6e47 --format=fuller --no-patch" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 6ms:
src/lib/facts/facts.integration.test.ts:306:  expect(await one(`select detail->'hook' v from public.dq_quarantine where id=$1`,[itemId])).toMatchObject({stage:'materialize',state:'pending'});   // durable pending hook, same transaction
src/lib/facts/db.test.ts:228:   if(fn==='claim_reconcile_member')return {data:null};
src/lib/facts/db.test.ts:252:  expect(calls.at(-1)).toEqual({fn:'claim_reconcile_member',args:{p_pair:'us.companyfacts_vs_ixbrl',p_cycle_id:'c1',p_issuer:I1,p_market:'US',p_batch:'b'}});
src/lib/facts/db.test.ts:255:  expect(await db.applyReconcileResult(fence,result)).toEqual({reused:false,reconciliationId:'r1',itemId:null,quarantined:1,materialize:{issuerId:I1,market:'US'}});
src/lib/facts/db.ts:109:  materialize:m&&typeof m==='object'?{issuerId:String(m.issuer_id),market:m.market as Market}:null};
src/lib/facts/db.ts:275:  async claimReconcileMember(pair,cycleId,issuer,market,batch){return fenceFromJson(await call<unknown>('claim_reconcile_member',{p_pair:pair,p_cycle_id:cycleId,p_issuer:issuer,p_market:market,p_batch:batch}));},
src/lib/facts/db-contract.ts:173:   expect((done.detail as {hook:{stage:string;state:string;at:string}}).hook).toMatchObject({stage:'materialize',state:'pending'});
src/lib/facts/db-contract.ts:466:   expect(it.detail).toMatchObject({chosen_candidate_index:1,adopted_fact_id:out.factId,run_id:out.runId,issuer_id:iss,market:'US',hook:{stage:'materialize',state:'pending'}});
src/lib/facts/db-contract.ts:477:   expect(q1).toMatchObject({reused:false,quarantined:1,materialize:{issuerId:iss,market:'US'}});
src/lib/facts/db-contract.ts:486:   expect(item.detail).toMatchObject({pair,issuer_id:iss,market:'US',latest_result:{passed:false,inputs_hash:'h1'},hook:{stage:'materialize',state:'pending'}});
src/lib/facts/memory-facts-db.ts:379:   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:now(),detail:{...((it.detail as Record<string,unknown>|undefined)??{}),chosen_fact_ids:picked,...(FACT_ROW_REASONS.includes(String(it.reason_code))?{hook:{stage:'materialize',state:'pending',at:now()}}:{})}});
src/lib/facts/memory-facts-db.ts:503:    detail:{...detailOf(it),chosen_candidate_index:index,adopted_fact_id:fact_id,run_id,issuer_id:g.issuer_id,market:g.market,batch_id:batchId,hook:{stage:'materialize',state:'pending',at:t0}}});
src/lib/facts/memory-facts-db.ts:520:   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:t0,detail:{...d,restored_by_batch:batchId,chosen_fact_ids:ids,hook:{stage:'materialize',state:'pending',at:t0}}});
src/lib/facts/memory-facts-db.ts:551:    detail:{...detailOf(it),chosen_fact_ids:[keep],quarantined_fact_ids:others.map(f=>f.fact_id).sort(cmp),issuer_id:t,market,batch_id:batchId,hook:{stage:'materialize',state:'pending',at:t0}}});
src/lib/facts/memory-facts-db.ts:588:    const hook={stage:'materialize',state:'pending',at:t0};
supabase/migrations/20261107091000_facts_extensions.sql:480:-- hook = pending, state_rev + 1.
supabase/migrations/20261107091000_facts_extensions.sql:593:                                            'market', g.market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
supabase/migrations/20261107091000_facts_extensions.sql:607:-- through fact_promote_rows; state_rev + 1; hook = pending. skipped lists every member not
supabase/migrations/20261107091000_facts_extensions.sql:637:                                            'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
supabase/migrations/20261107091000_facts_extensions.sql:662:-- (chosen_fact_ids, quarantined_fact_ids, issuer_id = T, market, hook pending); every member
supabase/migrations/20261107091000_facts_extensions.sql:717:                                            'market', v_market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
supabase/migrations/20261107091000_facts_extensions.sql:769:                then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
supabase/migrations/20261107091000_facts_extensions.sql:824:create or replace function public.claim_reconcile_member(p_pair text, p_cycle_id text, p_issuer uuid, p_market text, p_batch uuid)
supabase/migrations/20261107091000_facts_extensions.sql:838:revoke execute on function public.claim_reconcile_member(text, text, uuid, text, uuid) from public, anon, authenticated;
supabase/migrations/20261107091000_facts_extensions.sql:839:grant execute on function public.claim_reconcile_member(text, text, uuid, text, uuid) to service_role;
supabase/migrations/20261107091000_facts_extensions.sql:891:--   latest_result, issuer_id, market, hook pending}; the row → quarantined; state_rev + 1;
supabase/migrations/20261107091000_facts_extensions.sql:974:                || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end,
supabase/migrations/20261107091000_facts_extensions.sql:983:        || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end
supabase/migrations/20261107090000_identifiers_and_dq.sql:746:-- detail->'hook'->>'at' is distinct from it, a newer pending hook (a restore / adoption / lineage verdict
supabase/migrations/20261106090000_financial_facts.sql:570:-- detail.hook = {stage:'materialize', state:'pending', at} so an unfinished materialize is durable.
supabase/migrations/20261106090000_financial_facts.sql:612:                then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
src/lib/facts/pg-facts-db.ts:93:  async claimReconcileMember(pair,cycleId,issuer,market,batch){return fenceFromJson(await fn<unknown>('public.claim_reconcile_member($1,$2,$3,$4,$5)',[pair,cycleId,issuer,market,batch]));},
.
..
agents
launch.json
worktrees
src/lib/dq/reconcile/pair-lineage.ts:61:  async evaluate(ctx,member){
src/lib/dq/reconcile/run.test.ts:22: return {id:PAIR,kind:'numeric',left:'l',right:'r',inputs:{repoFile:null,parserVersion:'stub/1',goldSchema:null},currentRight:async()=>null,members:async()=>members,evaluate:async(_ctx,m)=>evaluate(m)};
src/lib/dq/reconcile/run.test.ts:39:  const h=harness({...stubPair([],()=>[]),members:async c=>pairRef.p!.members(c),evaluate:async(c,m)=>pairRef.p!.evaluate(c,m)});
src/lib/dq/reconcile/pair-us-gold.ts:94:  async evaluate(ctx,member){
src/lib/dq/reconcile/pairs.test.ts:74:  const res=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:84:  const [ok,bad,missing]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:102:  const [r]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:154:  const [r]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:165:  const [r]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:187:  const [r]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:196:  const [r]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:203:  const [r]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:212:  const [r]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:223:  const results=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:258:  const [r]=await pair.evaluate(ctx,m);
src/lib/dq/reconcile/pairs.test.ts:273:  const [cleared,gone]=await pair.evaluate(ctx,plan);
src/lib/dq/reconcile/types.ts:48: evaluate(ctx:PairContext,member:MemberPlan):Promise<ReconcileResultInput[]>;
src/lib/dq/reconcile/run.ts:215:  const results=missing.expectedKeys.length===0?[]:await pair.evaluate(ctx,missing);   // all keys committed → no upstream read at all
src/lib/dq/reconcile/run.ts:266:   const results=await pair.evaluate(ctx,plan);assertOnePerKey(plan,results);
3:// producer that stops running never calls recordAttempt again. Fails closed, never fresh: an
35:export async function recordAttempt(client:TableClient,dataset:string,input:{ok:boolean;cadence:Cadence;now?:Date;detail?:Record<string,unknown>}):Promise<FreshnessStatus>{
41: const storedOk=existing?.last_ok_at?new Date(existing.last_ok_at as string):null;
48:  dataset,expected_cadence:input.cadence,last_ok_at:lastOkAt?lastOkAt.toISOString():null,last_attempt_at:now.toISOString(),
58:  cadence:r.expected_cadence as Cadence,lastOkAt:r.last_ok_at?new Date(r.last_ok_at as string):null,
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-EqcifggZ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-kE4dES2x' (errno=Operation not permitted)
commit c1a6e47bdb68be0e4b8b72abac155750d435e9c4
Author:     gilosbornhello <osbornhello@gmail.com>
AuthorDate: Fri Nov 6 05:16:12 2026 -0800
Commit:     gilosbornhello <osbornhello@gmail.com>
CommitDate: Fri Nov 6 05:16:12 2026 -0800

    feat(dq): reconcile cycle runner with fenced per-key commits, hook recovery and settlement
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

exec
/bin/zsh -lc "sed -n '740,785p' supabase/migrations/20261107090000_identifiers_and_dq.sql; sed -n '820,855p' supabase/migrations/20261107091000_facts_extensions.sql; rg -n 'patchQuarantineDetail' src/lib/dq/quarantine.ts; sed -n '940,1005p' supabase/migrations/20261107091000_facts_extensions.sql; nl -ba src/lib/dq/reconcile/run.ts | sed -n '146,181p'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 43ms:
-- patch_quarantine_detail is the only TS-side writer of dq_quarantine.detail once an item exists (the
-- materialize hook state and the audit mark; quarantine.ts::patchQuarantineDetail). It locks the item and
-- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
-- rewrote latest_result, the chosen ids or the resolution columns is never rolled back to an older read.
-- Two keys only: 'hook' and 'audit_written'. Returns jsonb: true = written, false = no such item, 'stale'
-- = compare-and-set refused (Task 11 review, Codex P2): when p_expect_hook_at is given and the item's
-- detail->'hook'->>'at' is distinct from it, a newer pending hook (a restore / adoption / lineage verdict
-- committed after the caller observed the item) belongs to its own owner and nothing is written.
-- the 3-argument boolean version (earlier drafts) must go: with it alive, a named 3-argument call would be ambiguous against the defaulted 4-argument one
drop function if exists public.patch_quarantine_detail(uuid, text, jsonb);
create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb, p_expect_hook_at text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or p_key not in ('hook', 'audit_written') or p_value is null then
    raise exception 'invalid_detail_key' using errcode = '22023';
  end if;
  perform 1 from public.dq_quarantine where id = p_id for update;
  if not found then return to_jsonb(false); end if;
  if p_expect_hook_at is not null
     and (select detail->'hook'->>'at' from public.dq_quarantine where id = p_id) is distinct from p_expect_hook_at then
    return to_jsonb('stale'::text);
  end if;
  update public.dq_quarantine set detail = detail || jsonb_build_object(p_key, p_value) where id = p_id;
  return to_jsonb(true);
end $$;
revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.patch_quarantine_detail(uuid, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------- guarded identifier write (plan audit round 3, R2)
-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
-- (identifiers/apply.ts, Task 4a). It share-locks the issuer (resolve_identifier_claim's order: issuer, then
-- security), locks the open row (issuer, ticker, valid_from, valid_to null) and
-- in ONE UPDATE writes the column (only when empty) and merges the single provenance key with
-- `provenance || p_provenance` — never a whole-object replacement — so a concurrent write of the other
-- column, or a claim resolution (which also merges with ||), keeps its key. p_provenance must carry
-- exactly the key p_column. Outcomes: 'written' (the column was empty), 'duplicate' (the same value is
-- stored; a missing provenance key is completed in the same UPDATE), 'conflict' (another value is
-- stored; nothing written — the caller files correct_identifier), 'not_found' (no open row). ISIN
-- uniqueness / no-overlap violations (23505 / 23P01) pass through unchanged.
create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_cur text; v_prov jsonb; n int;
begin
  if p_column is null or p_column not in ('isin', 'figi') or coalesce(p_value, '') = ''
     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array[p_column] then
revoke execute on function public.reconcile_frozen_keys(text, text, uuid, text) from public, anon, authenticated, service_role;

-- Claimable iff pending, or claimed with an expired lease, or failed with attempts < 3 (failed at
-- 3 is terminal), and the cycle is running. One atomic update; the post-claim attempts is the fence.
create or replace function public.claim_reconcile_member(p_pair text, p_cycle_id text, p_issuer uuid, p_market text, p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_attempt int;
begin
  if p_batch is null then raise exception 'invalid_batch' using errcode = '22023'; end if;
  update public.dq_reconcile_cursor c
  set state = 'claimed', claimed_by = p_batch, claim_until = clock_timestamp() + interval '10 minutes', attempts = c.attempts + 1, last_error = null
  where c.pair = p_pair and c.cycle_id = p_cycle_id and c.issuer_id = p_issuer and c.market = p_market
    and (c.state = 'pending' or (c.state = 'claimed' and c.claim_until < clock_timestamp()) or (c.state = 'failed' and c.attempts < 3))
    and exists (select 1 from public.dq_reconcile_cycles y where y.pair = c.pair and y.cycle_id = c.cycle_id and y.status = 'running')
  returning c.attempts into v_attempt;
  if not found then return null; end if;
  return jsonb_build_object('pair', p_pair, 'cycle_id', p_cycle_id, 'issuer_id', p_issuer, 'market', p_market, 'batch_id', p_batch, 'attempt', v_attempt);
end $$;
revoke execute on function public.claim_reconcile_member(text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_reconcile_member(text, text, uuid, text, uuid) to service_role;

-- Counts derived from the member's accepted result rows of this cycle (compared ∧ passed /
-- compared ∧ ¬passed / any other outcome); their sum must equal expected, else member_incomplete.
create or replace function public.complete_reconcile_member(p_fence jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.dq_reconcile_cursor; v_p int; v_f int; v_n int; v_keys text[];
begin
  c := public.reconcile_fence_lock(p_fence);
  select count(*) filter (where r.outcome = 'compared' and r.passed), count(*) filter (where r.outcome = 'compared' and not r.passed), count(*) filter (where r.outcome <> 'compared')
    into v_p, v_f, v_n
  from public.dq_reconciliations r
  where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market;
  if v_p + v_f + v_n <> c.expected then raise exception 'member_incomplete' using errcode = 'P0001'; end if;
  -- exact coverage of the frozen key set: every frozen key has an accepted result and nothing else does
  v_keys := public.reconcile_frozen_keys(c.pair, c.cycle_id, c.issuer_id, c.market);
  if v_keys is null
81:export async function patchQuarantineDetail(client:TableClient,id:string,key:'hook'|'audit_written',value:unknown,expectHookAt?:string):Promise<boolean|'stale'>{
  if p_result ->> 'kind' = 'numeric' then
    if p_result ->> 'outcome' = 'compared' and (v_lv is null or v_rv is null) then raise exception 'invalid_result' using errcode = '22023'; end if;
  elsif v_lv is not null or v_rv is not null or v_ad is not null or v_rd is not null then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
  if found then
    if v_existing.issuer_id is distinct from c.issuer_id or v_existing.market is distinct from c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    return jsonb_build_object('reused', true, 'reconciliation_id', v_existing.id, 'item_id', coalesce(v_existing.detail -> 'item_id', 'null'::jsonb), 'quarantined', 0, 'materialize', 'null'::jsonb);
  end if;
  v_dataset := case c.market when 'US' then 'facts.us' else 'facts.cn' end;
  v_latest := jsonb_build_object('passed', p_result -> 'passed', 'reconciliation_id', v_rid, 'at', to_jsonb(v_now), 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb));
  if v_left is not null then
    perform 1 from public.fact_sync_scope where issuer_id = c.issuer_id and market = c.market for update;
    select * into f from public.financial_facts where fact_id = v_left;
    if not found or f.issuer_id <> c.issuer_id or f.market <> c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    select r.status into v_run from public.fact_sync_runs r where r.run_id = f.run_id;
  end if;
  -- a failing compare on a published left row that is ok OR already quarantined (for another reason, with no
  -- open item of this pair yet) opens the reconcile_mismatch item, so fact_promote_rows blocks a later generic
  -- promotion; only an ok row changes visibility (status, state_rev, hook, materialize).
  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
     and p_result ->> 'outcome' = 'compared' and (p_result -> 'passed') = 'false'::jsonb then
    v_nk_item := c.pair || ':' || v_nk || ':' || v_left::text;
    if length(v_nk_item) > 512 then raise exception 'invalid_result' using errcode = '22023'; end if;
    select q.id into v_item from public.dq_quarantine q
    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = v_nk_item and q.reason_code = 'reconcile_mismatch' and q.status = 'open'
    for update;
    if v_item is null then
      v_item := gen_random_uuid();
      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
      values (v_item, v_dataset, 'financial_facts', v_nk_item, 'reconcile_mismatch',
              jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb), 'latest_result', v_latest,
                                 'issuer_id', c.issuer_id, 'market', c.market)
                || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end,
              jsonb_build_object('key', jsonb_build_object('issuer_id', f.issuer_id, 'market', f.market, 'concept', f.concept, 'period_start', f.period_start, 'period_end', f.period_end,
                                                           'consolidation', f.consolidation, 'unit', f.unit, 'available_date', f.available_date),
                                 'fact_ids', jsonb_build_array(v_left), 'left_value', coalesce(p_result -> 'left_value', 'null'::jsonb), 'right_value', coalesce(p_result -> 'right_value', 'null'::jsonb),
                                 'right_locator', coalesce(p_result -> 'detail' -> 'right' -> 'locator', 'null'::jsonb)),
              c.claimed_by, 'open');
    else
      update public.dq_quarantine
      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest)
        || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end
      where id = v_item;
    end if;
    if f.status = 'ok' then
      update public.financial_facts set status = 'quarantined' where fact_id = v_left and status = 'ok';
      v_q := 1;
      update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = c.issuer_id and market = c.market;
      v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
    end if;
  elsif v_left is not null and f.status = 'quarantined' and p_result ->> 'outcome' = 'compared' then
    with upd as (
      update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch' and q.status = 'open' and q.detail ->> 'pair' = c.pair
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? v_left::text
      returning q.id)
    select upd.id into v_item from upd order by upd.id limit 1;
  end if;
  if v_action in ('review_item','lineage_item') then
    v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
    -- two members creating the same item key serialise here, the second reuses the open item (no 23505 on the open-key index)
    perform pg_advisory_xact_lock(hashtext('dq_item:' || v_dataset || ':' || v_reason || ':' || (p_result -> 'item' ->> 'natural_key')));
    select q.id into v_item from public.dq_quarantine q
    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = p_result -> 'item' ->> 'natural_key' and q.reason_code = v_reason and q.status = 'open';
   146	 return false;
   147	}
   148	
   149	async function targetOf(tables:TableClient,issuer:string):Promise<string>{
   150	 const [r]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
   151	 return typeof r?.merged_into==='string'?r.merged_into:issuer;
   152	}
   153	/** detail.hook alone, through the row-locking patch (plan audit P4); a missing item is a no-op. Never throws. */
   154	async function setHook(tables:TableClient,id:string,hook:Hook):Promise<void>{
   155	 try{await patchQuarantineDetail(tables,id,'hook',hook);}
   156	 catch(e){console.error('[reconcile] hook write',e instanceof Error?e.message:String(e));}
   157	}
   158	/** Materializes each distinct target once and writes every listed item's hook; never throws. Returns the number of failed targets' items. */
   159	async function runHooks(deps:ReconcileDeps,list:{itemId:string|null;issuerId:string;market:Market}[],errors:BatchError[]):Promise<number>{
   160	 const mat=deps.materialize??((db:FactsDb,issuer:string,market:Market)=>materializeFacts(db,issuer,market));
   161	 const groups=new Map<string,{target:string;market:Market;items:string[]}>();
   162	 for(const x of list){
   163	  const target=await targetOf(deps.tables,x.issuerId);const k=mkey(target,x.market);
   164	  const g=groups.get(k)??{target,market:x.market,items:[]};if(x.itemId)g.items.push(x.itemId);groups.set(k,g);
   165	 }
   166	 let failed=0;
   167	 for(const g of groups.values()){
   168	  let hook:Hook;
   169	  try{await mat(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:deps.now().toISOString()};}
   170	  catch(e){
   171	   const code=e instanceof FactsDbError?e.code:'materialize_failed';
   172	   hook={stage:'materialize',state:'failed',at:deps.now().toISOString(),message:code};
   173	   errors.push({code:'materialize_error',key:mkey(g.target,g.market),message:code});failed+=g.items.length;
   174	  }
   175	  for(const id of g.items)await setHook(deps.tables,id,hook);
   176	 }
   177	 return failed;
   178	}
   179	async function retryPendingHooks(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<{retried:number;failed:number}>{
   180	 const rows=(await selectAll(deps.tables,'dq_quarantine',{reason_code:'reconcile_mismatch',status:'open'},'id')).filter(r=>{
   181	  const d=(r.detail??{}) as {pair?:unknown;hook?:{state?:unknown};issuer_id?:unknown;market?:unknown};

codex
Hook completion can erase newer recovery work during concurrent resolution. Settlement also has an unrecoverable gap between committing the cycle and recording freshness.

Full review comments:

- [P1] Guard hook completion against a newer pending hook — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:154-155
  If a restore or lineage verdict commits after materialization finishes but before this write, it installs a new pending hook for a newer visibility change. This unconditional patch overwrites that hook with `done`, so recovery can permanently skip the required materialization. Capture the hook timestamp before materializing and pass it as `expectHookAt` to `patchQuarantineDetail`, preserving a newer hook when the compare-and-set returns `stale`.

- [P2] Make freshness publication recoverable after settlement — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:249-251
  If `recordAttempt` fails or the worker exits after the cycle update commits, the cycle remains terminal without publishing its freshness result. Subsequent runs open a new cycle, and another settling worker returns at `n !== 1`, so neither can recover the missing publication. Commit settlement and freshness atomically, or persist a pending publication marker that subsequent runs retry.
Hook completion can erase newer recovery work during concurrent resolution. Settlement also has an unrecoverable gap between committing the cycle and recording freshness.

Full review comments:

- [P1] Guard hook completion against a newer pending hook — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:154-155
  If a restore or lineage verdict commits after materialization finishes but before this write, it installs a new pending hook for a newer visibility change. This unconditional patch overwrites that hook with `done`, so recovery can permanently skip the required materialization. Capture the hook timestamp before materializing and pass it as `expectHookAt` to `patchQuarantineDetail`, preserving a newer hook when the compare-and-set returns `stale`.

- [P2] Make freshness publication recoverable after settlement — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/run.ts:249-251
  If `recordAttempt` fails or the worker exits after the cycle update commits, the cycle remains terminal without publishing its freshness result. Subsequent runs open a new cycle, and another settling worker returns at `n !== 1`, so neither can recover the missing publication. Commit settlement and freshness atomically, or persist a pending publication marker that subsequent runs retry.
