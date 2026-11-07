OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b121-2e14-7ab0-b75e-23dfdd924774
--------
user
commit c2bd48d
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat c2bd48d; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1497ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wFU6WCeP' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-5z3mQj46' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/14c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ey7sum9p' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2Vqtwtk1' (errno=Operation not permitted)
commit c2bd48de24c6f18b8dc578b9b1ff74b070f605c4
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 05:51:22 2026 -0800

    feat(dq): reconcile cron route, script and production wiring; schedule US iXBRL and lineage
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 next.config.mjs                                    |  4 ++
 scripts/dq/reconcile.ts                            | 56 ++++++++++++++++
 scripts/facts/enrich-acceptance.ts                 | 11 ++--
 src/app/api/admin/dq/quarantine/[id]/route.test.ts | 11 +++-
 src/app/api/admin/dq/quarantine/[id]/route.ts      |  2 +
 src/app/api/cron/reconcile/route.test.ts           | 74 ++++++++++++++++++++++
 src/app/api/cron/reconcile/route.ts                | 54 ++++++++++++++++
 src/lib/dq/reconcile/deps.test.ts                  | 29 +++++++++
 src/lib/dq/reconcile/deps.ts                       | 55 ++++++++++++++++
 src/lib/facts/deps.ts                              | 11 ++--
 vercel.json                                        |  8 +++
 11 files changed, 304 insertions(+), 11 deletions(-)
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

exec
/bin/zsh -lc 'for p in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md AGENTS.md AGENTS.override.md CLAUDE.md; do if test -f "$p"; then printf '"'\\n%s\\n' \""'$p"; cat "$p"; fi; done; cat src/lib/dq/reconcile/pairs.ts src/lib/dq/reconcile/pair-support.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/dq/reconcile/pairs.ts
// Registry of the cycle pairs run by run.ts (spec §5.1; contract C3). Task 14 registers
// facts.lineage_same_day and us.companyfacts_vs_gold; Task 15 adds us.companyfacts_vs_ixbrl; Task 16 adds
// cn.tushare_vs_cninfo_pdf_gold. The three non-cycle pairs (sec.filing_date_vs_submissions,
// sec.filer_category, entities.isin_hkex_vs_gleif) are recorded inline through record.ts and are
// deliberately absent. inputsHashNow recomputes a reconcile_mismatch item's inputs_hash from CURRENT
// inputs for restore_reconciled (spec §5.6): left raw_hash from the item's fact, the pair's CURRENT right
// evidence for the natural key of the result row named by latest_result (RegisteredPair.currentRight —
// iXBRL fetches and hashes the primary document now, gold pairs resolve the current manifest entry; never
// the sha256 that run recorded; unobtainable → current_evidence_unavailable, plan audit P2), the CURRENT
// gold or sample file bytes, the CURRENT parser version. Any change since the last passing run → a different hash.
import type {Row} from '../../db/table-client';
import {computeInputsHash} from './inputs-hash';
import {lineageSameDayPair} from './pair-lineage';
import {sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import {usCompanyfactsVsGoldPair} from './pair-us-gold';
import type {CyclePairId,PairContext} from './types';

export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
 'facts.lineage_same_day':lineageSameDayPair(),
 'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
};

export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
 const detail=(item.detail??{}) as {pair?:unknown;latest_result?:{reconciliation_id?:unknown}};
 const pair=typeof detail.pair==='string'?RECONCILE_PAIRS[detail.pair as CyclePairId]:undefined;
 if(!pair)throw new Error('pair_not_registered');
 const factIds=((item.payload??{}) as {fact_ids?:unknown}).fact_ids;
 const factId=Array.isArray(factIds)&&typeof factIds[0]==='string'?factIds[0]:null;
 const [fact]=factId===null?[]:await ctx.db.factsByIds([factId]);
 if(!fact)throw new Error('left_fact_missing');
 const recId=detail.latest_result?.reconciliation_id;
 if(typeof recId!=='string')throw new Error('no_latest_result');
 const [rec]=await ctx.tables.select('dq_reconciliations',{id:recId},{limit:1});
 if(!rec)throw new Error('no_latest_result');
 const right=await pair.currentRight(ctx,rec);   // what the right side says NOW (plan audit P2)
 if(right===null)throw new Error('current_evidence_unavailable');
 const file=pair.inputs.repoFile===null?'':sha256Hex(await ctx.readRepoFile(pair.inputs.repoFile));
 return computeInputsHash({left_raw_hash:fact.raw_hash,right_sha256:right,gold_or_sample_sha256:file,parser_version:pair.inputs.parserVersion});
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

exec
/bin/zsh -lc 'cat src/lib/facts/providers/sec-acceptance.ts src/lib/dq/reconcile/record.ts; cat next.config.mjs; cat src/lib/dq/reconcile/pair-us-gold.ts | tail -65; cat src/lib/dq/reconcile/run.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/facts/providers/sec-acceptance.ts
// SEC acceptance times (plan 3 spec §4.5; step 9b of the US facts sync; E7). One submissions
// snapshot (sec-submissions.ts: `parsed.filings` = filings.recent plus any fetched files[] pages; the
// main document's raw bytes are in the reconcile-raw bucket under main.sha256, each page's under its own
// sha256) is indexed by accessionNumber. The snapshot is fetched with coverFrom = the earliest pending
// available_date − 7 days (plan audit R3), so every files[] page that can hold a pending filing is fetched:
// a filing listed only in a historical page is written, never left acceptance_not_found. Every edgar
// filing of the issuer whose accepted_at is null:
//  - in the snapshot with an acceptance time and filingDate = available_date →
//    set_filing_acceptance(filing, acceptanceDateTime, 'sec_submissions'): true → inserted,
//    false (same value already) → duplicates, acceptance_conflict → failed + one error per filing;
//  - filingDate ≠ available_date → a sec.filing_date_vs_submissions result (kind 'date', failed,
//    both dates as text) handed to the injected recordDateMismatch (record.ts, wired by plan-3
//    Part D) or returned unrecorded — and NO acceptance write (the filing's identity is in doubt);
//  - absent, ambiguous (conflicting copies), or without a parseable acceptance time → never a guessed time.
// Mismatches, ambiguous and not-found filings are DATA properties: they are counted under the informational
// skipped_summary (acceptance_mismatch / acceptance_ambiguous / acceptance_not_found), never in `failed`.
// Pending filings older than ACCEPTANCE_LOOKBACK_DAYS are left out of the pass and of coverFrom
// (acceptance_out_of_window) unless opts.fullHistory. Only real failures (acceptance_conflict, write
// errors, sec_unavailable) count as failed.
// fetched counts the filings for which a write was attempted. A submissions failure → sec_unavailable.
import {emptyCounts} from '../../dq/batches';
import type {BatchCounts,BatchError} from '../../dq/batches';
import type {ReconcileResultInput} from '../../dq/reconcile/types';
import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
import {FactsDbError} from '../types';
import type {Budget,FactsDb,FilingRow} from '../types';

/** Pending filings older than this (days before today) are not looked up unless fullHistory. */
export const ACCEPTANCE_LOOKBACK_DAYS=3*365;
export const ACCEPTANCE_SOURCE='sec_submissions' as const;
export const DATE_MISMATCH_PAIR='sec.filing_date_vs_submissions' as const;
/** page = the SubmissionFiling page ('recent' = the main document, else the files[] page name), kept per entry for mismatch evidence. */
export interface AcceptanceEntry{accessionNumber:string;filingDate:string;form:string;acceptedAt:string|null;page:string}
/** Margin before the earliest pending available_date: a mismatching filingDate may precede it. */
export const ACCEPTANCE_COVER_MARGIN_DAYS=7;
export interface AcceptanceDeps{
 db:Pick<FactsDb,'filingsOfIssuer'|'setFilingAcceptance'>;
 /** coverFrom ('YYYY-MM-DD') is passed to fetchSubmissions: every files[] page with filingTo >= coverFrom is fetched (plan audit R3). */
 submissions:(cik10:string,b:Budget,coverFrom:string)=>Promise<SubmissionsSnapshot>;
 /** records one sec.filing_date_vs_submissions result (record.ts, plan-3 Part D); absent → returned in `mismatches` only */
 recordDateMismatch?:(r:ReconcileResultInput)=>Promise<void>;
 /** clock for the lookback window (default: real time) */
 now?:()=>Date;
}
export interface AcceptanceOptions{/** lift the ACCEPTANCE_LOOKBACK_DAYS bound (script --full-history) */fullHistory?:boolean}
export interface AcceptanceOutcome{issuerId:string;counts:BatchCounts;errors:BatchError[];mismatches:ReconcileResultInput[];snapshotSha256:string|null}

const SEC_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** SEC acceptanceDateTime ('2024-11-01T06:01:36.000Z', UTC) → ISO; anything else (incl. rolled-over dates) → null. */
export function parseAcceptanceDateTime(v:unknown):string|null{
 if(typeof v!=='string'||!SEC_TS.test(v))return null;
 const ms=Date.parse(v);if(!Number.isFinite(ms))return null;
 const iso=new Date(ms).toISOString();
 return iso.slice(0,19)===v.slice(0,19)?iso:null;
}
/** accessionNumber → entry. An accession listed twice with different filing dates or acceptance times is ambiguous and left out. */
export function acceptanceIndex(entries:readonly SubmissionFiling[]):{index:Map<string,AcceptanceEntry>;ambiguous:string[]}{
 const index=new Map<string,AcceptanceEntry>();const bad=new Set<string>();
 for(const e of entries){
  const x:AcceptanceEntry={accessionNumber:e.accessionNumber,filingDate:e.filingDate,form:e.form,acceptedAt:parseAcceptanceDateTime(e.acceptanceDateTime),page:e.page};
  const seen=index.get(x.accessionNumber);
  if(seen&&(seen.filingDate!==x.filingDate||seen.acceptedAt!==x.acceptedAt))bad.add(x.accessionNumber);
  else if(!seen)index.set(x.accessionNumber,x);
 }
 for(const a of bad)index.delete(a);
 return {index,ambiguous:[...bad].sort()};
}
/** earliest pending available_date − ACCEPTANCE_COVER_MARGIN_DAYS, as YYYY-MM-DD. */
export function acceptanceCoverFrom(pending:readonly Pick<FilingRow,'available_date'>[]):string{
 const min=pending.map(f=>f.available_date).sort()[0];
 const d=new Date(`${min}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-ACCEPTANCE_COVER_MARGIN_DAYS);
 return d.toISOString().slice(0,10);
}
/** sha256 of the document an entry came from: the main document for 'recent', else that files[] page (null if not fetched). */
export const pageSha256=(snap:SubmissionsSnapshot,page:string):string|null=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
/** The sec.filing_date_vs_submissions result of one filing (natural key <cik>:<accession>, dates compared as text); the right side cites the entry's own page and hash. */
export function filingDateMismatch(cik:string,f:FilingRow,e:AcceptanceEntry,pageSha:string|null):ReconcileResultInput{
 return {natural_key:`${cik}:${f.source_ref}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
  left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
  detail:{left_text:f.available_date,right_text:e.filingDate,left:{filing_id:f.filing_id,source_ref:f.source_ref},right:e.page==='recent'
   ?{document:'submissions',sha256:pageSha,locator:`filings.recent[accessionNumber=${e.accessionNumber}]`}
   :{document:e.page,sha256:pageSha,locator:`${e.page}[accessionNumber=${e.accessionNumber}]`}}};
}

export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget,opts:AcceptanceOptions={}):Promise<AcceptanceOutcome>{
 const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
 const all=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
 const cutoff=new Date((deps.now?.()??new Date()).getTime()-ACCEPTANCE_LOOKBACK_DAYS*86_400_000).toISOString().slice(0,10);
 const pending=opts.fullHistory?all:all.filter(f=>f.available_date>=cutoff);
 const outOfWindow=all.length-pending.length;
 const outSummary=()=>{if(outOfWindow>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({acceptance_out_of_window:outOfWindow})});return out;};
 if(pending.length===0)return outSummary();
 let snap:SubmissionsSnapshot;
 try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
 catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
 out.snapshotSha256=snap.main.sha256;
 const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
 const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
 const amb=new Set(ambiguous);
 let notFound=0,unrecorded=0,ambiguousHit=0,mismatch=0;
 for(let i=0;i<pending.length;i++){
  const f=pending[i];
  if(budget.signal.aborted||budget.remainingMs()<=0){
   out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
  }
  if(amb.has(f.source_ref)){ambiguousHit++;continue;}   // conflicting copies: never guess
  const e=index.get(f.source_ref);
  if(!e){notFound++;continue;}
  if(e.filingDate!==f.available_date){
   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);mismatch++;
   if(deps.recordDateMismatch){
    try{await deps.recordDateMismatch(r);}
    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
   }else unrecorded++;
   continue;
  }
  if(e.acceptedAt===null){notFound++;continue;}
  out.counts.fetched++;
  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
  catch(err){
   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
  }
 }
 const summary:Record<string,number>={};
 if(notFound>0)summary.acceptance_not_found=notFound;
 if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
 if(mismatch>0)summary.acceptance_mismatch=mismatch;
 if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
 if(outOfWindow>0)summary.acceptance_out_of_window=outOfWindow;
 if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
 return out;
}
// src/lib/dq/reconcile/record.ts
// Out-of-cycle reconciliation rows (spec §5.1): sec.filing_date_vs_submissions, sec.filer_category and
// entities.isin_hkex_vs_gleif are recorded inline by their producers. Only action 'record' exists here:
// no work item, no visibility change, and cycle_id/issuer_id/market/attempt all null (constraint
// dq_reconciliations_cycle_cols). Cycle pairs must go through run.ts / apply_reconcile_result. The kind
// rules mirror the two table constraints (numeric compared needs both sides; text/date keep the values in
// detail.left_text/right_text and leave every numeric column null) so a bad row fails here with a code.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../../db/table-client';
import {DATASETS} from '../datasets';
import {compareDecimal,isDecimalText} from './decimal';
import {canonicalDecimal} from '../../facts/json-numbers';
import {CYCLE_PAIR_IDS,RECONCILE_OUTCOMES,RECONCILE_PAIR_IDS} from './types';
import type {ReconcilePairId,ReconcileResultInput} from './types';

const isStr=(v:unknown):v is string=>typeof v==='string';
/** Numeric columns are written canonical; ratio columns (rel_diff) are derived/display, pass/fail is `passed`, decided by exact comparison.
 * detail.tolerance_exact / abs_diff_exact keep the exact values next to the columns. */
export async function recordReconciliation(tables:TableClient,input:ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null},opts:{now?:()=>Date}={}):Promise<string>{
 if(!(RECONCILE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('invalid_pair');
 if((CYCLE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('cycle_pair_requires_runner');
 if(input.action!=='record')throw new Error('record_action_only');
 if(input.item!==undefined)throw new Error('record_has_no_item');
 if(!(['numeric','text','date'] as readonly unknown[]).includes(input.kind))throw new Error('invalid_kind');
 if(!(RECONCILE_OUTCOMES as readonly unknown[]).includes(input.outcome))throw new Error('invalid_outcome');
 const numeric=input.kind==='numeric';
 if(numeric&&input.outcome==='compared'&&(input.left_value===null||input.right_value===null))throw new Error('numeric_sides_required');
 if(!numeric&&(input.left_value!==null||input.right_value!==null||input.abs_diff!==null||input.rel_diff!==null))throw new Error('nonnumeric_sides_must_be_null');
 for(const v of [input.left_value,input.right_value,input.abs_diff,input.rel_diff])if(v!==null&&(!isStr(v)||!isDecimalText(v)))throw new Error('invalid_decimal_field');
 if(!isStr(input.tolerance)||!isDecimalText(input.tolerance)||compareDecimal(input.tolerance,'0')<0)throw new Error('invalid_tolerance');
 if(input.abs_diff!==null&&compareDecimal(input.abs_diff,'0')<0)throw new Error('negative_abs_diff');
 if(input.rel_diff!==null&&compareDecimal(input.rel_diff,'0')<0)throw new Error('negative_rel_diff');
 if(input.outcome!=='compared'&&input.passed)throw new Error('passed_requires_compared');
 const c=(v:string|null)=>v===null?null:canonicalDecimal(v);
 const tolerance=canonicalDecimal(input.tolerance),abs=c(input.abs_diff);
 const id=randomUUID();
 await tables.insert('dq_reconciliations',{
  id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
  left_source:input.left_source,right_source:input.right_source,left_value:c(input.left_value),right_value:c(input.right_value),
  abs_diff:abs,rel_diff:c(input.rel_diff),tolerance,passed:input.passed,
  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
 });
 return id;
}
import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: process.cwd(),
  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts).
  outputFileTracingIncludes: {
    '/api/cron/reconcile': ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'],
  },
  // Ignore the archived static demo
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    return config;
  },
  async redirects() {
    return [{ source: '/dashboard', destination: '/today', permanent: true }];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
 if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/US`);
 return env.conflicts.some(c=>String(c.key.concept)===e.concept&&String(c.key.period_end)===e.period_end&&String(c.key.unit)===e.unit&&(c.key.period_start??null)===(left.period_start??null)&&c.fact_ids.includes(left.fact_id));
}

export function usCompanyfactsVsGoldPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:DATASETS.facts('US'),right:'gold.plan2',
  inputs:{repoFile:US_GOLD_PATH,parserVersion:US_GOLD_PARSER,goldSchema:'plan2-gold/1'},
  // the current gold file is this pair's right evidence; its entry for the key must still exist and be recorded (plan audit P2)
  async currentRight(ctx,rec){
   try{
    const {json,sha256}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
    const e=usGoldEntries(json).entries.find(x=>usGoldKey(x)===String(rec.natural_key));
    return e&&!e.pending&&e.value!==null?sha256:null;
   }catch(err){if(err instanceof ReconcileConfigError)return null;throw err;}
  },
  async members(ctx){
   const {json}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
   const byOwner=new Map<string,MemberPlan>();
   const entries=[...usGoldEntries(json).entries].sort((x,y)=>x.ticker<y.ticker?-1:x.ticker>y.ticker?1:x.index-y.index);
   for(const e of entries){
    // the ticker's owner AT the entry's own date, never today; a merged owner stays the recorded owner (no redirect)
    const r=await resolveIssuer(ctx.tables,{ticker:e.ticker},{asOf:entryDate(ctx,e)});
    if(!r)throw new ReconcileConfigError('issuer_unresolved',e.ticker);
    const owner=r.redirected_from??r.issuer_id;
    const plan=byOwner.get(owner)??{issuerId:owner,market:'US' as const,expectedKeys:[]};
    plan.expectedKeys.push({naturalKey:usGoldKey(e),locator:{index:e.index,ticker:e.ticker,concept:e.concept,period_end:e.period_end,unit:e.unit,duration:e.duration,as_of:e.as_of,pending:e.pending,owner_issuer_id:owner}});
    byOwner.set(owner,plan);
   }
   return [...byOwner.values()];
  },
  async evaluate(ctx,member){
   const {json,sha256:goldSha}=await readRepoJson(ctx,US_GOLD_PATH,'invalid_gold_file');
   const current=new Map(usGoldEntries(json).entries.map(e=>[usGoldKey(e),e]));
   const open=await openMismatches(ctx.tables,PAIR,'US');
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const e=current.get(k.naturalKey);
    if(!e){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_removed'}));continue;}
    if(e.pending||e.value===null){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'pending',gold_index:e.index}));continue;}
    const frozenOwner=k.locator.owner_issuer_id;
    if(k.locator.as_of!==e.as_of||(frozenOwner!==undefined&&frozenOwner!==member.issuerId)){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_changed',gold_index:e.index,frozen_as_of:k.locator.as_of??null,as_of:e.as_of}));continue;}
    const bound=open.get(k.naturalKey);
    let rows:FactRow[];
    if(bound)rows=(await ctx.db.factsByIds([bound.factIds[0]])).filter(r=>r.issuer_id===member.issuerId).slice(0,1);   // fenced issuer's facts only
    else rows=(await ctx.db.readFacts(member.issuerId,'US',{concepts:[e.concept],asOf:entryDate(ctx,e),from:e.period_end,to:e.period_end})).rows
     .filter(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===e.duration&&r.is_current===true);
    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{gold_index:e.index,fact_ids:rows.map(r=>r.fact_id)}));continue;}
    const left=rows[0];
    if(!left){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{gold_index:e.index,as_of:e.as_of}));continue;}
    const passed=compareDecimal(left.value,e.value)===0;
    // a same-day lineage conflict on this key belongs to facts.lineage_same_day: record only, never quarantine here
    const lineageConflict=bound===undefined&&!passed&&left.status==='ok'&&await inLineageConflict(ctx,member.issuerId,e,left);
    const inputs_hash=computeInputsHash({left_raw_hash:left.raw_hash,right_sha256:goldSha,gold_or_sample_sha256:goldSha,parser_version:US_GOLD_PARSER});
    const asOfMissing=e.as_of===null;   // a restated current value must not be quarantined against an original-filing gold value
    const action=lineageConflict||(asOfMissing&&bound===undefined)?'record' as const:actionFor({bound:bound!==undefined,leftStatus:left.status,compared:true,passed,onFail:'quarantine_left'});
    const locator={document:US_GOLD_PATH,index:e.index,source:e.source};
    out.push(comparedNumeric(k.naturalKey,left.value,e.value,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:left.fact_id,action,
     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of,...(lineageConflict?{lineage_conflict:true}:{}),...(asOfMissing?{as_of_missing:true}:{})},
     ...(action==='record'?{}:{item:mismatchItem(PAIR,k.naturalKey,left,e.value,locator,inputs_hash)})}));
   }
   return out;
  },
 };
}
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
//     reconcile.<pair> (weekly) is made durable in the settling update itself (settle_reconcile_cycle writes
//     detail.freshness={status:'pending',ok,detail}; only that key of detail, so pending_members written by
//     set_merge are never clobbered) and recorded by record_cycle_freshness, which is idempotent per cycle
//     (a cycle increments consecutive_errors at most once). Recording is ALWAYS done by replayFreshness:
//     at run start and again right after a successful settle, oldest finished cycle first, stopping at the
//     first failure so the order is kept.
// cursor.attempts counts CLAIMS, not failures: a lease timeout or a lost fence consumes an attempt just like
// a thrown evaluate does; after MAX_CURSOR_ATTEMPTS (3) claims the member is terminal (exec_failed_members).
// Everything after startBatch runs inside one try/catch like runFactsSync: an unexpected exception is pushed
// as {code:'unknown'}, the batch is finished best-effort and the error is rethrown (no batch left running).
// Batch counts (§5.5): fetched = keys applied; inserted = passed; duplicates = reused; quarantined =
// mismatches that went to (or back to) an item; failed = non-compared results + mismatches recorded without
// an item + member failures. A ReconcileConfigError (bad gold/sample file, unresolvable issuer) fails the
// batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
import {randomUUID} from 'node:crypto';
import {TableError,callRpc,selectAll} from '../../db/table-client';
import type {Row,TableClient} from '../../db/table-client';
import {materialize as materializeFacts} from '../../facts/derive';
import {makeBudget} from '../../facts/sync';
import {FactsDbError} from '../../facts/types';
import type {FactsDb,Market} from '../../facts/types';
import {emptyCounts,finishBatch,startBatch} from '../batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../batches';
import {DATASETS} from '../datasets';
import {writeHookCas} from '../facts-resolver';
import type {HookState} from '../facts-resolver';
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
type Hook=HookState;
interface HookItem{itemId:string|null;issuerId:string;market:Market;hookAt?:string|null}
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
/** Materializes each distinct target once and writes every listed item's hook; never throws. Returns the number of failed targets' items. */
async function observedHookAt(tables:TableClient,id:string):Promise<string|undefined>{
 try{const at=((((await tables.select('dq_quarantine',{id},{limit:1}))[0]?.detail??{}) as {hook?:{at?:unknown}}).hook?.at);return typeof at==='string'?at:undefined;}
 catch(e){console.error('[reconcile] hook observe',e instanceof Error?e.message:String(e));return undefined;}
}
async function runHooks(deps:ReconcileDeps,list:HookItem[],errors:BatchError[]):Promise<number>{
 const mat=deps.materialize??((db:FactsDb,issuer:string,market:Market)=>materializeFacts(db,issuer,market));
 let failed=0;
 const groups=new Map<string,{target:string;market:Market;items:{id:string;at:string|undefined}[]}>();
 for(const x of list){
  let target:string;
  try{target=await targetOf(deps.tables,x.issuerId);}
  catch(e){   // an unresolvable target fails only this item's hook; the next run's step 0 retries it
   const code=e instanceof Error?e.message.slice(0,100):'target_unresolved';
   errors.push({code:'materialize_error',key:mkey(x.issuerId,x.market),message:`target_unresolved:${code}`});failed++;
   if(x.itemId)await writeHookCas(deps.tables,x.itemId,{stage:'materialize',state:'failed',at:deps.now().toISOString(),message:'target_unresolved'},typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId));
   continue;
  }
  const k=mkey(target,x.market);
  const g=groups.get(k)??{target,market:x.market,items:[] as {id:string;at:string|undefined}[]};
  // the hook.at the item carries BEFORE we materialize: the done/failed write is compare-and-set on it (Task 14b review P1)
  if(x.itemId)g.items.push({id:x.itemId,at:typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId)});groups.set(k,g);
 }
 for(const g of groups.values()){
  let hook:Hook;
  try{await mat(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:deps.now().toISOString()};}
  catch(e){
   const code=e instanceof FactsDbError?e.code:'materialize_failed';
   hook={stage:'materialize',state:'failed',at:deps.now().toISOString(),message:code};
   errors.push({code:'materialize_error',key:mkey(g.target,g.market),message:code});failed+=g.items.length;
  }
  for(const it of g.items){
   const w=await writeHookCas(deps.tables,it.id,hook,it.at);
   if(w.result==='stale')errors.push({code:'skipped_summary',key:`${it.id}:hook_stale`});   // a newer pending hook committed meanwhile wins
  }
 }
 return failed;
}
async function retryPendingHooks(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<{retried:number;failed:number}>{
 const rows=(await selectAll(deps.tables,'dq_quarantine',{reason_code:'reconcile_mismatch',status:'open'},'id')).filter(r=>{
  const d=(r.detail??{}) as {pair?:unknown;hook?:{state?:unknown};issuer_id?:unknown;market?:unknown};
  return d.pair===pair&&(d.hook?.state==='pending'||d.hook?.state==='failed')&&typeof d.issuer_id==='string'&&(d.market==='US'||d.market==='CN');
 });
 if(rows.length===0)return {retried:0,failed:0};
 const failed=await runHooks(deps,rows.map(r=>{const d=r.detail as {issuer_id:string;market:Market};return {itemId:String(r.id),issuerId:d.issuer_id,market:d.market,hookAt:((r.detail as {hook?:{at?:unknown}}).hook?.at as string|undefined)??null};}),errors);
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
 const hooks:HookItem[]=[];
 const flush=async()=>{   // never throws: a hook problem must not keep failReconcileMember from running
  if(hooks.length===0)return;
  try{await runHooks(deps,hooks.splice(0),errors);}catch(e){errors.push({code:'materialize_error',key,message:`hook_flush:${e instanceof Error?e.message.slice(0,100):'unknown'}`});}
 };
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

interface Freshness{status:'pending'|'recorded';ok:boolean;detail:Record<string,unknown>}
const freshnessOf=(row:Row):Freshness|null=>{
 const f=((row.detail??{}) as {freshness?:Partial<Freshness>}).freshness;
 return f&&(f.status==='pending'||f.status==='recorded')&&typeof f.ok==='boolean'?{status:f.status,ok:f.ok,detail:(f.detail??{}) as Record<string,unknown>}:null;
};
/** record_cycle_freshness for one settled cycle (idempotent per cycle). Never throws: false = still pending. */
async function recordFreshness(deps:ReconcileDeps,pair:CyclePairId,row:Row,errors:BatchError[]):Promise<boolean>{
 const cycleId=String(row.cycle_id);
 try{
  const r=await callRpc(deps.tables,'record_cycle_freshness',{p_pair:pair,p_cycle_id:cycleId,p_dataset:DATASETS.reconcile(pair),p_cadence:'weekly',p_at:row.finished_at?new Date(String(row.finished_at)).toISOString():deps.now().toISOString()});
  if(r==='recorded'||r==='already'||r==='no_freshness')return true;
  errors.push({code:'freshness_pending',key:cycleId,message:String(r)});return false;
 }catch(e){errors.push({code:'freshness_pending',key:cycleId,message:e instanceof Error?e.message:String(e)});return false;}
}
/** Terminal cycles of this pair whose freshness is still pending, oldest finished first; stops at the first failure to keep the order. */
async function replayFreshness(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<void>{
 const rows=(await selectAll(deps.tables,CYCLE_TABLE,{pair},'cycle_id')).filter(r=>r.status!=='running'&&freshnessOf(r)?.status==='pending')
  .sort((a,b)=>String(a.finished_at)<String(b.finished_at)?-1:String(a.finished_at)>String(b.finished_at)?1:String(a.cycle_id)<String(b.cycle_id)?-1:1);
 for(const r of rows)if(!await recordFreshness(deps,pair,r,errors))return;
}

async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string,errors:BatchError[]):Promise<{settled:boolean;status:CycleStatus}>{
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
 const fdetail={cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers};
 // one locked SQL step: status/counters + detail.freshness (pending) only; it never rewrites other detail keys (pending_members)
 const ok=await callRpc(deps.tables,'settle_reconcile_cycle',{p_pair:pair,p_cycle_id:cycleId,p_status:status,
  p_counts:{compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers,finished_at:deps.now().toISOString()},
  p_freshness:{status:'pending',ok:status==='complete',detail:fdetail}});
 if(ok!==true)return {settled:false,status};
 await replayFreshness(deps,pair,errors);   // ordered: an older pending cycle is recorded before this one
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
 await replayFreshness(deps,pair.id,errors);
 const hooks=await retryPendingHooks(deps,pair.id,errors);
 const sample=pair.inputs.repoFile===null?'':await deps.readRepoFile(pair.inputs.repoFile).then(sha256Hex,()=>'');
 const tool=(cycleId:string)=>({pair:pair.id,cycle_id:cycleId,parser:pair.inputs.parserVersion,gold_schema:pair.inputs.goldSchema??'',sample_sha256:sample,code_version:deps.codeVersion});
 const {batchId}=await startBatch(deps.tables,{producer:'reconcile',dataset:DATASETS.reconcile(pair.id),toolVersions:tool(''),codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const finish=async(cycle:CycleReport|null)=>{
  if(outcomes.size>0)errors.push({code:'outcome_summary',message:JSON.stringify(Object.fromEntries([...outcomes.entries()].sort(([a],[b])=>a<b?-1:1)))});
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  return {batchId,status,counts,errors,cycle,members,hooks} satisfies ReconcileReceipt;
 };
 try{
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
  try{settled=await settle(deps,pair.id,cycleId,errors);}
  catch(e){if(e instanceof ReconcileError&&e.code==='cursor_unaccounted')errors.push({code:'cursor_unaccounted',key:e.message});else throw e;}
  return finish({cycleId,status:settled.status,created:opened.created,settled:settled.settled,expectedTotal:Number(opened.row.expected_total)});
 }catch(e){
  // infrastructure failure after the batch started: close the receipt so no running batch dangles, then rethrow (like runFactsSync)
  errors.push({code:'unknown',message:e instanceof Error?e.message:String(e)});
  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; the runbook marks it failed */}
  throw e;
 }
}

exec
/bin/zsh -lc "find . -name '*AGENTS*' -not -path './node_modules/*'; cat package.json | head -65; nl -ba next.config.mjs | head -20; nl -ba vercel.json | tail -20; git ls-tree -r --name-only c2bd48d src/lib/dq/reconcile | grep ixbrl; ls .next/server/app/api/admin/dq/quarantine 2>/dev/null; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'; sed -n '1,80p' src/lib/facts/deps.ts; sed -n '1,100p' src/lib/dq/reconcile/pair-lineage.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 87ms:
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
     1	import createNextIntlPlugin from 'next-intl/plugin';
     2	
     3	/** @type {import('next').NextConfig} */
     4	const nextConfig = {
     5	  reactStrictMode: true,
     6	  images: { unoptimized: true },
     7	  outputFileTracingRoot: process.cwd(),
     8	  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts).
     9	  outputFileTracingIncludes: {
    10	    '/api/cron/reconcile': ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'],
    11	  },
    12	  // Ignore the archived static demo
    13	  webpack: (config) => {
    14	    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    15	    return config;
    16	  },
    17	  async redirects() {
    18	    return [{ source: '/dashboard', destination: '/today', permanent: true }];
    19	  },
    20	};
    23	      "schedule": "30 21 * * *"
    24	    },
    25	    {
    26	      "path": "/api/cron/securities-sync?region=us",
    27	      "schedule": "30 0 * * *"
    28	    },
    29	    {
    30	      "path": "/api/cron/facts-sync?market=US",
    31	      "schedule": "5 */4 * * *"
    32	    },
    33	    {
    34	      "path": "/api/cron/reconcile?pair=us.companyfacts_vs_ixbrl",
    35	      "schedule": "0 2 * * *"
    36	    },
    37	    {
    38	      "path": "/api/cron/reconcile?pair=facts.lineage_same_day",
    39	      "schedule": "0 4 * * *"
    40	    }
    41	  ]
    42	}
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-N79lwPFH' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-GEgyx5vB' (errno=Operation not permitted)
src/lib/dq/reconcile/ixbrl-trim.test.ts
src/lib/dq/reconcile/ixbrl-trim.ts
src/lib/dq/reconcile/ixbrl.test.ts
src/lib/dq/reconcile/ixbrl.ts
// src/lib/facts/deps.ts
// Production wiring of SyncDeps (spec §6.1) shared by /api/cron/facts-sync and scripts/facts/*:
// Supabase FactsDb / TableClient / snapshot store, the two adapters (fetch + parse), the cninfo
// linker (which needs the issuer's A-share ts_code and cninfo_org_id that sync.ts does not pass:
// it hands over the FilingRow only), and step 9b (SEC acceptance times through sec-submissions.ts). code_version = VERCEL_GIT_COMMIT_SHA (40 hex), else — scripts
// only — `git rev-parse HEAD` with "-dirty" when the tree has changes (sync.ts::resolveCodeVersion,
// which this delegates to); null means "refuse to apply".
import {getAdminSupabase} from '../supabase/admin';
import {selectAll,supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {supabaseFactsDb} from './db';
import {supabaseSnapshotStore} from './snapshot-store';
import {supabaseRawStore} from '../dq/raw-store';
import {fetchSubmissions} from '../entities/identifiers/sec-submissions';
import {DATE_MISMATCH_PAIR,enrichAcceptance} from './providers/sec-acceptance';
import {recordReconciliation} from '../dq/reconcile/record';
import {fetchCompanyFacts,parseCompanyFacts} from './providers/edgar-companyfacts';
import {coverageSummary,fetchTushareStatements,parseTushareStatements} from './providers/tushare-statements';
import {linkCninfoFiling} from './providers/cninfo-link';
import type {LinkIssuer} from './providers/cninfo-link';
import {chooseCnTicker} from './scope';
import {resolveCodeVersion as resolveFromEnvOrGit} from './sync';
import type {SyncDeps} from './sync';
import type {Budget,FactsDb,FilingRow} from './types';

/** allowGit=false (Vercel): only a full VERCEL_GIT_COMMIT_SHA counts; allowGit=true (scripts): env, then git HEAD (+ -dirty). */
export function resolveCodeVersion(opts:{allowGit:boolean}):string|null{
 return opts.allowGit?resolveFromEnvOrGit(process.env):resolveFromEnvOrGit(process.env,()=>{throw new Error('git_not_allowed');});
}

/** ts_code of the issuer's A-share by the scope's own selection (primary A, else the sole current A-share, B shares excluded, ambiguous/none → ''), and its cninfo_org_id. */
async function cnIssuer(tables:TableClient,issuerId:string,today:string):Promise<LinkIssuer>{
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 const current=(await selectAll(tables,'issuer_securities',{issuer_id:issuerId},'ticker')).filter(r=>isCurrentSecurity(r,today));
 const c=chooseCnTicker(current);
 return {ts_code:'ticker' in c?c.ticker:'',cninfo_org_id:typeof issuer?.cninfo_org_id==='string'?issuer.cninfo_org_id:null};
}
/** A type-1 filing is "corrected" when a type-5 filing exists for the same ts_code:end_date (spec §6.3: match 更正 titles). */
const correctedKeys=(filings:FilingRow[])=>new Set(filings.filter(f=>f.source_ref.split(':')[2]==='5').map(f=>f.source_ref.split(':').slice(0,2).join(':')));

export interface LinkerOptions{fetch?:typeof fetch;userAgent?:string;minIntervalMs?:number;today?:string}
export function cninfoLinker(tables:TableClient,db:Pick<FactsDb,'filingsOfIssuer'>,opts:LinkerOptions={}):NonNullable<SyncDeps['linkCn']>{
 const cache=new Map<string,Promise<{issuer:LinkIssuer;corrected:Set<string>}>>();
 const context=(issuerId:string)=>{
  let p=cache.get(issuerId);
  if(!p){
   p=Promise.all([cnIssuer(tables,issuerId,opts.today??new Date().toISOString().slice(0,10)),db.filingsOfIssuer(issuerId,'CN',{})]).then(([issuer,filings])=>({issuer,corrected:correctedKeys(filings)}));
   cache.set(issuerId,p);
   p.catch(()=>{if(cache.get(issuerId)===p)cache.delete(issuerId);});   // a failed lookup is not cached
  }
  return p;
 };
 return async(filing:FilingRow,b:Budget)=>{
  const {issuer,corrected}=await context(filing.issuer_id);
  if(!/^\d{6}\.(SH|SZ)$/.test(issuer.ts_code))return 'unlinkable';   // no usable A-share listing (none, ambiguous, BJ): no request is possible, no attempt consumed
  const key=filing.source_ref.split(':').slice(0,2).join(':');
  return linkCninfoFiling({form_type:filing.form_type,fiscal_year:filing.fiscal_year,period_end:filing.period_end,available_date:filing.available_date,corrected:filing.source_ref.split(':')[2]==='1'&&corrected.has(key)},issuer,{budget:b,fetch:opts.fetch,userAgent:opts.userAgent,minIntervalMs:opts.minIntervalMs});
 };
}

export interface ProductionDepsOptions{deadline:Date|null;codeVersion:string;now?:()=>Date;/** Reuse an existing admin client (scripts hold one). */admin?:ReturnType<typeof getAdminSupabase>}
export function productionSyncDeps(opts:ProductionDepsOptions):SyncDeps{
 const sb=opts.admin??getAdminSupabase();
 const tables=supabaseTableClient(sb);
 const db=supabaseFactsDb(sb);
 return {
  db,tables,storage:supabaseSnapshotStore(sb),
  fetchUs:(cik10,b)=>fetchCompanyFacts(cik10,b),
  fetchCn:(tsCode,sinceYear,b)=>fetchTushareStatements(tsCode,sinceYear,b),
  parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
  parseCn:(snapshots,o)=>parseTushareStatements(snapshots,{sinceYear:o.sinceYear}),
  coverageCn:coverageSummary,   // → coverage_summary in the batch receipt
  linkCn:cninfoLinker(tables,db),
  // 9b: one submissions fetch per published US issuer, pages back to the earliest pending filing (coverFrom, plan audit R3);
  // raw bytes into reconcile-raw; date mismatches recorded out of cycle (record.ts).
  enrichAcceptance:(issuer,cik10,b)=>enrichAcceptance({db,submissions:(c,bb,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw:supabaseRawStore(sb),budget:bb},{coverFrom}),
   recordDateMismatch:async r=>{await recordReconciliation(tables,{...r,pair:DATE_MISMATCH_PAIR,batch_id:null});}},{issuerId:issuer,cik10},b),
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion,
 };
// src/lib/dq/reconcile/pair-lineage.ts
// facts.lineage_same_day (spec §4.4, §5.1). Members: every target T that has referrers
// (issuers.status='merged' rows' merged_into, deduplicated) × each market where readFactsLineage over
// lineageOf(T) reports conflicts; expected keys = those conflicts at cycle creation, keyed
// <T>:<K>:<available_date> (K = facts/keys factKey). opts.targets restricts the enumeration (tests and
// targeted script runs); the registry instance has none. Evaluation re-reads the lineage: a conflict
// still present → compared, passed=false, action lineage_item (one lineage_conflict item per key, payload
// {fact_ids, values, key, available_date, target}; never auto-chosen); a conflict that is gone → the
// frozen fact_ids still ok are compared (equal values → passed, reason conflict_cleared), none ok →
// left_missing. A truncated lineage read is an execution failure (member retried), never a result.
import {selectAll} from '../../db/table-client';
import {CONCEPT_IDS} from '../../facts/concepts';
import {factKey} from '../../facts/keys';
import type {FactRow,LineageConflict,Market} from '../../facts/types';
import {compareDecimal} from './decimal';
import {ReconcileConfigError,comparedNumeric,notCompared,todayOf} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {ExpectedKey,MemberPlan,PairContext,ReconcileResultInput} from './types';

const MARKETS:readonly Market[]=['US','CN'];
const s=(v:unknown)=>v===null||v===undefined?null:String(v);
export const lineageNaturalKey=(target:string,c:Pick<LineageConflict,'key'|'available_date'>):string=>
 `${target}:${factKey({concept:String(c.key.concept),period_start:s(c.key.period_start),period_end:String(c.key.period_end),consolidation:String(c.key.consolidation),unit:String(c.key.unit)})}:${c.available_date}`;
const byIssuerThenId=(a:FactRow,b:FactRow)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:a.fact_id<b.fact_id?-1:a.fact_id>b.fact_id?1:0;

async function conflictsOf(ctx:PairContext,target:string,market:Market):Promise<LineageConflict[]>{
 const env=await ctx.db.readFactsLineage(await ctx.db.lineageOf(target),market,{concepts:[...CONCEPT_IDS],asOf:todayOf(ctx)});
 if(env.truncated)throw new ReconcileConfigError('lineage_read_truncated',`${target}/${market}`);
 return env.conflicts;
}

async function planOf(ctx:PairContext,target:string,market:Market):Promise<MemberPlan>{
 const keys=new Map<string,ExpectedKey>();
 for(const c of await conflictsOf(ctx,target,market)){const nk=lineageNaturalKey(target,c);if(!keys.has(nk))keys.set(nk,{naturalKey:nk,locator:{key:c.key,available_date:c.available_date,fact_ids:c.fact_ids}});}
 return {issuerId:target,market,expectedKeys:[...keys.values()]};
}

export function lineageSameDayPair(opts:{targets?:readonly string[]}={}):RegisteredPair{
 return {
  id:'facts.lineage_same_day',kind:'numeric',left:'facts.lineage',right:'facts.lineage',
  inputs:{repoFile:null,parserVersion:'lineage/1',goldSchema:null},
  async currentRight(){return null;},   // never produces reconcile_mismatch items (lineage verdicts are lineage_conflict items)
  async members(ctx){
   const merged=await selectAll(ctx.tables,'issuers',{status:'merged'},'issuer_id');
   const targets=[...new Set(merged.map(r=>r.merged_into).filter((x):x is string=>typeof x==='string'))]
    .filter(t=>opts.targets===undefined||opts.targets.includes(t)).sort();
   const out:MemberPlan[]=[];
   for(const target of targets){
    // the natural key carries no market: the same key in both markets of one target cannot be told apart (documented limitation)
    const seen=new Set<string>();
    for(const market of MARKETS){
     const plan=await planOf(ctx,target,market);
     for(const k of plan.expectedKeys){if(seen.has(k.naturalKey))throw new ReconcileConfigError('lineage_key_collision',k.naturalKey);seen.add(k.naturalKey);}
     if(plan.expectedKeys.length>0)out.push(plan);
    }
   }
   return out;
  },
  /** one pending target (plan audit Q2): the same keys members() would give it now; zero conflicts → zero keys */
  async memberFor(ctx,issuerId,market){return planOf(ctx,issuerId,market);},
  async evaluate(ctx,member){
   let live:Map<string,LineageConflict>;
   try{live=new Map((await conflictsOf(ctx,member.issuerId,member.market)).map(c=>[lineageNaturalKey(member.issuerId,c),c]));}
   catch(e){if(e instanceof ReconcileConfigError)throw new Error(`lineage_read_truncated:${member.issuerId}`);throw e;}
   const out:ReconcileResultInput[]=[];
   for(const k of member.expectedKeys){
    const c=live.get(k.naturalKey);
    const ids=c?c.fact_ids:(Array.isArray(k.locator.fact_ids)?k.locator.fact_ids.map(String):[]);
    const rows=(await ctx.db.factsByIds(ids)).sort(byIssuerThenId);
    const sides=(l:FactRow,r:FactRow)=>({left_source:`facts.lineage:${l.issuer_id}`,right_source:`facts.lineage:${r.issuer_id}`});
    const values=rows.map(r=>({issuer_id:r.issuer_id,filing:r.filing_id,fact_id:r.fact_id,value:r.value,status:r.status}));
    if(c){
     const left=rows[0];const right=left?(rows.find(r=>compareDecimal(r.value,left.value)!==0)??rows[1]):undefined;
     if(!left||!right){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'conflict_rows_missing',fact_ids:ids}));continue;}
     out.push(comparedNumeric(k.naturalKey,left.value,right.value,{passed:false,tolerance:'0',sides:sides(left,right),action:'lineage_item',
      detail:{target:member.issuerId,available_date:c.available_date,key:c.key,values,tolerance_rule:'exact/1'},
      item:{natural_key:k.naturalKey,payload:{fact_ids:c.fact_ids,values:values.map(({issuer_id,filing,fact_id,value})=>({issuer_id,filing,fact_id,value})),key:c.key,available_date:c.available_date,target:member.issuerId},detail:{target:member.issuerId,market:member.market}}}));
     continue;
    }
    const ok=rows.filter(r=>r.status==='ok');
    if(ok.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'no_ok_value',values}));continue;}
    const first=ok[0],other=ok.find(r=>compareDecimal(r.value,first.value)!==0);
    out.push(comparedNumeric(k.naturalKey,first.value,(other??ok[ok.length-1]).value,{passed:other===undefined,tolerance:'0',sides:sides(first,other??ok[ok.length-1]),action:'record',
     detail:{target:member.issuerId,reason:other===undefined?'conflict_cleared':'conflict_not_reported',values,tolerance_rule:'exact/1'}}));
   }
   return out;
  },
 };
}

codex
The new iXBRL schedule targets an unregistered pair and cannot execute successfully. The production file-tracing configuration also omits the gold manifests needed by the newly wired quarantine restoration path.

Full review comments:

- [P1] Register the iXBRL pair before scheduling it — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vercel.json:34-35
  Every scheduled 02:00 invocation will return HTTP 400: `RECONCILE_PAIRS` contains only `facts.lineage_same_day` and `us.companyfacts_vs_gold`, while the new route explicitly rejects unregistered pairs. Consequently, the advertised daily US iXBRL reconciliation never runs. Implement and register this pair before enabling its schedule, or defer the schedule until that implementation lands.

- [P2] Include gold manifests in the quarantine route's deployment — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/next.config.mjs:9-11
  The quarantine POST route now calls `restoreInputsHashNow`, which reads the current gold manifest through the dynamically constructed filesystem path in `readRepoFileFromDisk`, but the explicit tracing inclusion covers only the cron route. In a traced serverless deployment, restoring a `us.companyfacts_vs_gold` mismatch can therefore fail because its manifest is absent: `currentRight` converts the read failure into `current_evidence_unavailable`, preventing restoration even after a passing reconciliation. Include these fixtures for the quarantine route as well.
The new iXBRL schedule targets an unregistered pair and cannot execute successfully. The production file-tracing configuration also omits the gold manifests needed by the newly wired quarantine restoration path.

Full review comments:

- [P1] Register the iXBRL pair before scheduling it — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vercel.json:34-35
  Every scheduled 02:00 invocation will return HTTP 400: `RECONCILE_PAIRS` contains only `facts.lineage_same_day` and `us.companyfacts_vs_gold`, while the new route explicitly rejects unregistered pairs. Consequently, the advertised daily US iXBRL reconciliation never runs. Implement and register this pair before enabling its schedule, or defer the schedule until that implementation lands.

- [P2] Include gold manifests in the quarantine route's deployment — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/next.config.mjs:9-11
  The quarantine POST route now calls `restoreInputsHashNow`, which reads the current gold manifest through the dynamically constructed filesystem path in `readRepoFileFromDisk`, but the explicit tracing inclusion covers only the cron route. In a traced serverless deployment, restoring a `us.companyfacts_vs_gold` mismatch can therefore fail because its manifest is absent: `currentRight` converts the read failure into `current_evidence_unavailable`, preventing restoration even after a passing reconciliation. Include these fixtures for the quarantine route as well.
facts/providers/sec-acceptance.ts
// SEC acceptance times (plan 3 spec §4.5; step 9b of the US facts sync; E7). One submissions
// snapshot (sec-submissions.ts: `parsed.filings` = filings.recent plus any fetched files[] pages; the
// main document's raw bytes are in the reconcile-raw bucket under main.sha256, each page's under its own
// sha256) is indexed by accessionNumber. The snapshot is fetched with coverFrom = the earliest pending
// available_date − 7 days (plan audit R3), so every files[] page that can hold a pending filing is fetched:
// a filing listed only in a historical page is written, never left acceptance_not_found. Every edgar
// filing of the issuer whose accepted_at is null:
//  - in the snapshot with an acceptance time and filingDate = available_date →
//    set_filing_acceptance(filing, acceptanceDateTime, 'sec_submissions'): true → inserted,
//    false (same value already) → duplicates, acceptance_conflict → failed + one error per filing;
//  - filingDate ≠ available_date → a sec.filing_date_vs_submissions result (kind 'date', failed,
//    both dates as text) handed to the injected recordDateMismatch (record.ts, wired by plan-3
//    Part D) or returned unrecorded — and NO acceptance write (the filing's identity is in doubt);
//  - absent, ambiguous (conflicting copies), or without a parseable acceptance time → never a guessed time.
// Mismatches, ambiguous and not-found filings are DATA properties: they are counted under the informational
// skipped_summary (acceptance_mismatch / acceptance_ambiguous / acceptance_not_found), never in `failed`.
// Pending filings older than ACCEPTANCE_LOOKBACK_DAYS are left out of the pass and of coverFrom
// (acceptance_out_of_window) unless opts.fullHistory. Only real failures (acceptance_conflict, write
// errors, sec_unavailable) count as failed.
// fetched counts the filings for which a write was attempted. A submissions failure → sec_unavailable.
import {emptyCounts} from '../../dq/batches';
import type {BatchCounts,BatchError} from '../../dq/batches';
import type {ReconcileResultInput} from '../../dq/reconcile/types';
import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
import {FactsDbError} from '../types';
import type {Budget,FactsDb,FilingRow} from '../types';

/** Pending filings older than this (days before today) are not looked up unless fullHistory. */
export const ACCEPTANCE_LOOKBACK_DAYS=3*365;
export const ACCEPTANCE_SOURCE='sec_submissions' as const;
export const DATE_MISMATCH_PAIR='sec.filing_date_vs_submissions' as const;
/** page = the SubmissionFiling page ('recent' = the main document, else the files[] page name), kept per entry for mismatch evidence. */
export interface AcceptanceEntry{accessionNumber:string;filingDate:string;form:string;acceptedAt:string|null;page:string}
/** Margin before the earliest pending available_date: a mismatching filingDate may precede it. */
export const ACCEPTANCE_COVER_MARGIN_DAYS=7;
export interface AcceptanceDeps{
 db:Pick<FactsDb,'filingsOfIssuer'|'setFilingAcceptance'>;
 /** coverFrom ('YYYY-MM-DD') is passed to fetchSubmissions: every files[] page with filingTo >= coverFrom is fetched (plan audit R3). */
 submissions:(cik10:string,b:Budget,coverFrom:string)=>Promise<SubmissionsSnapshot>;
 /** records one sec.filing_date_vs_submissions result (record.ts, plan-3 Part D); absent → returned in `mismatches` only */
 recordDateMismatch?:(r:ReconcileResultInput)=>Promise<void>;
 /** clock for the lookback window (default: real time) */
 now?:()=>Date;
}
export interface AcceptanceOptions{/** lift the ACCEPTANCE_LOOKBACK_DAYS bound (script --full-history) */fullHistory?:boolean}
export interface AcceptanceOutcome{issuerId:string;counts:BatchCounts;errors:BatchError[];mismatches:ReconcileResultInput[];snapshotSha256:string|null}

const SEC_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** SEC acceptanceDateTime ('2024-11-01T06:01:36.000Z', UTC) → ISO; anything else (incl. rolled-over dates) → null. */
export function parseAcceptanceDateTime(v:unknown):string|null{
 if(typeof v!=='string'||!SEC_TS.test(v))return null;
 const ms=Date.parse(v);if(!Number.isFinite(ms))return null;
 const iso=new Date(ms).toISOString();
 return iso.slice(0,19)===v.slice(0,19)?iso:null;
}
/** accessionNumber → entry. An accession listed twice with different filing dates or acceptance times is ambiguous and left out. */
export function acceptanceIndex(entries:readonly SubmissionFiling[]):{index:Map<string,AcceptanceEntry>;ambiguous:string[]}{
 const index=new Map<string,AcceptanceEntry>();const bad=new Set<string>();
 for(const e of entries){
  const x:AcceptanceEntry={accessionNumber:e.accessionNumber,filingDate:e.filingDate,form:e.form,acceptedAt:parseAcceptanceDateTime(e.acceptanceDateTime),page:e.page};
  const seen=index.get(x.accessionNumber);
  if(seen&&(seen.filingDate!==x.filingDate||seen.acceptedAt!==x.acceptedAt))bad.add(x.accessionNumber);
  else if(!seen)index.set(x.accessionNumber,x);
 }
 for(const a of bad)index.delete(a);
 return {index,ambiguous:[...bad].sort()};
}
/** earliest pending available_date − ACCEPTANCE_COVER_MARGIN_DAYS, as YYYY-MM-DD. */
export function acceptanceCoverFrom(pending:readonly Pick<FilingRow,'available_date'>[]):string{
 const min=pending.map(f=>f.available_date).sort()[0];
 const d=new Date(`${min}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-ACCEPTANCE_COVER_MARGIN_DAYS);
 return d.toISOString().slice(0,10);
}
/** sha256 of the document an entry came from: the main document for 'recent', else that files[] page (null if not fetched). */
export const pageSha256=(snap:SubmissionsSnapshot,page:string):string|null=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
/** The sec.filing_date_vs_submissions result of one filing (natural key <cik>:<accession>, dates compared as text); the right side cites the entry's own page and hash. */
export function filingDateMismatch(cik:string,f:FilingRow,e:AcceptanceEntry,pageSha:string|null):ReconcileResultInput{
 return {natural_key:`${cik}:${f.source_ref}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
  left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
  detail:{left_text:f.available_date,right_text:e.filingDate,left:{filing_id:f.filing_id,source_ref:f.source_ref},right:e.page==='recent'
   ?{document:'submissions',sha256:pageSha,locator:`filings.recent[accessionNumber=${e.accessionNumber}]`}
   :{document:e.page,sha256:pageSha,locator:`${e.page}[accessionNumber=${e.accessionNumber}]`}}};
}

export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget,opts:AcceptanceOptions={}):Promise<AcceptanceOutcome>{
 const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
 const all=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
 const cutoff=new Date((deps.now?.()??new Date()).getTime()-ACCEPTANCE_LOOKBACK_DAYS*86_400_000).toISOString().slice(0,10);
 const pending=opts.fullHistory?all:all.filter(f=>f.available_date>=cutoff);
 const outOfWindow=all.length-pending.length;
 const outSummary=()=>{if(outOfWindow>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({acceptance_out_of_window:outOfWindow})});return out;};
 if(pending.length===0)return outSummary();
 let snap:SubmissionsSnapshot;
 try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
 catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
 out.snapshotSha256=snap.main.sha256;
 const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
 const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
 const amb=new Set(ambiguous);
 let notFound=0,unrecorded=0,ambiguousHit=0,mismatch=0;
 for(let i=0;i<pending.length;i++){
  const f=pending[i];
  if(budget.signal.aborted||budget.remainingMs()<=0){
   out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
  }
  if(amb.has(f.source_ref)){ambiguousHit++;continue;}   // conflicting copies: never guess
  const e=index.get(f.source_ref);
  if(!e){notFound++;continue;}
  if(e.filingDate!==f.available_date){
   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);mismatch++;
   if(deps.recordDateMismatch){
    try{await deps.recordDateMismatch(r);}
    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
   }else unrecorded++;
   continue;
  }
  if(e.acceptedAt===null){notFound++;continue;}
  out.counts.fetched++;
  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
  catch(err){
   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
  }
 }
 const summary:Record<string,number>={};
 if(notFound>0)summary.acceptance_not_found=notFound;
 if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
 if(mismatch>0)summary.acceptance_mismatch=mismatch;
 if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
 if(outOfWindow>0)summary.acceptance_out_of_window=outOfWindow;
 if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
 return out;
}
import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: process.cwd(),
  // The reconcile cron reads the sample and gold manifests at runtime (src/lib/dq/reconcile/deps.ts).
  outputFileTracingIncludes: {
    '/api/cron/reconcile': ['./src/lib/dq/fixtures/gold/**/*.json', './src/lib/facts/fixtures/gold/*.json'],
  },
  // Ignore the archived static demo
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    return config;
  },
  async redirects() {
    return [{ source: '/dashboard', destination: '/today', permanent: true }];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
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
    "typescript-eslint": "^8.65.0",
    "vitest": "^4.1.10"
  },
  "overrides": {
    "@swc/helpers": "0.5.23",
    "brace-expansion": "5.0.9",
    "nanoid": "3.3.18",
    "source-map-js": "1.2.2",
    "next": {
      "postcss": "8.5.26",
      "sharp": "0.35.5"
    }
  }
}

codex
The scheduled iXBRL job is guaranteed to be rejected because its pair is not registered. The deployment tracing also omits manifests needed by the newly wired admin restoration path.

Full review comments:

- [P1] Register the iXBRL pair before scheduling its cron — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vercel.json:34-35
  The new daily job requests `us.companyfacts_vs_ixbrl`, but `RECONCILE_PAIRS` only registers `facts.lineage_same_day` and `us.companyfacts_vs_gold`. The new route explicitly rejects unregistered pairs, so every scheduled iXBRL invocation returns HTTP 400 without creating a batch or performing reconciliation. Register the implementation before enabling this schedule, or defer the schedule until it exists.

- [P2] Include gold manifests in the quarantine route's deployment — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/next.config.mjs:9-10
  The quarantine POST route now calls `restoreInputsHashNow`, which reads the current gold manifest through the dynamic filesystem reader when restoring a `us.companyfacts_vs_gold` mismatch. The explicit tracing inclusion only covers the cron function, leaving the admin function without that runtime asset in a traced serverless deployment. A missing manifest becomes `current_evidence_unavailable`, preventing restoration even after a passing reconciliation. Include the manifests for the quarantine route as well.
The scheduled iXBRL job is guaranteed to be rejected because its pair is not registered. The deployment tracing also omits manifests needed by the newly wired admin restoration path.

Full review comments:

- [P1] Register the iXBRL pair before scheduling its cron — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vercel.json:34-35
  The new daily job requests `us.companyfacts_vs_ixbrl`, but `RECONCILE_PAIRS` only registers `facts.lineage_same_day` and `us.companyfacts_vs_gold`. The new route explicitly rejects unregistered pairs, so every scheduled iXBRL invocation returns HTTP 400 without creating a batch or performing reconciliation. Register the implementation before enabling this schedule, or defer the schedule until it exists.

- [P2] Include gold manifests in the quarantine route's deployment — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/next.config.mjs:9-10
  The quarantine POST route now calls `restoreInputsHashNow`, which reads the current gold manifest through the dynamic filesystem reader when restoring a `us.companyfacts_vs_gold` mismatch. The explicit tracing inclusion only covers the cron function, leaving the admin function without that runtime asset in a traced serverless deployment. A missing manifest becomes `current_evidence_unavailable`, preventing restoration even after a passing reconciliation. Include the manifests for the quarantine route as well.
