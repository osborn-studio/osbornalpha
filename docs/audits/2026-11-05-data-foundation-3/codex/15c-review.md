OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b144-f2d3-7121-a845-dcc6477882fa
--------
user
commit 2874999
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 2874999; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1285ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-44mJukAV' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-lIWpBTuA' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0n9jsPKQ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QPdTYLzI' (errno=Operation not permitted)
28749997 test(dq): critical offline integration for US iXBRL reconciliation and lineage same-day conflicts
 scripts/ci/research-checks.ts                      |   2 +-
 .../dq/reconcile/ixbrl-pair.integration.test.ts    | 212 +++++++++++++++++++++
 src/lib/dq/reconcile/lineage.integration.test.ts   | 109 +++++++++++
 3 files changed, 322 insertions(+), 1 deletion(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS /Volumes/AGENTS /Volumes/AIMATE_WORK/AGENTS /Volumes/AIMATE_WORK/Developer/AGENTS /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS .claude/AGENTS AGENTS; do for s in .override.md .md; do test ! -f "$p$s" || cat "$p$s"; done; done; git show 2874999 --; ls -a | head -40' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4NLs86Ov' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-d58y4wr4' (errno=Operation not permitted)
commit 28749997166629dd525fd457829cdf271371c102
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:30:27 2026 -0800

    test(dq): critical offline integration for US iXBRL reconciliation and lineage same-day conflicts
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/ci/research-checks.ts b/scripts/ci/research-checks.ts
index 909514d9..2f6800dd 100644
--- a/scripts/ci/research-checks.ts
+++ b/scripts/ci/research-checks.ts
@@ -12,7 +12,7 @@ export const criticalSuites = [
   'entity-keys/entity-keys.integration.test.ts', 'ledger/calls-import.integration.test.ts',
   'cluster/alignments.integration.test.ts', 'fanout/run.integration.test.ts',
   'cards/cards.integration.test.ts', 'thesis-extension.integration.test.ts', 'weekly/weekly.integration.test.ts',
-].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts', 'src/lib/entities/ah-link.integration.test.ts', 'src/lib/dq/dq-extensions.integration.test.ts');
+].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts', 'src/lib/entities/ah-link.integration.test.ts', 'src/lib/dq/dq-extensions.integration.test.ts', 'src/lib/dq/reconcile/ixbrl-pair.integration.test.ts', 'src/lib/dq/reconcile/lineage.integration.test.ts');
 
 export function migrationInventory(root = process.cwd()) {
   const directory = join(root, 'supabase/migrations');
diff --git a/src/lib/dq/reconcile/ixbrl-pair.integration.test.ts b/src/lib/dq/reconcile/ixbrl-pair.integration.test.ts
new file mode 100644
index 00000000..bcfb5c96
--- /dev/null
+++ b/src/lib/dq/reconcile/ixbrl-pair.integration.test.ts
@@ -0,0 +1,212 @@
+// src/lib/dq/reconcile/ixbrl-pair.integration.test.ts
+// Spec §9.3 (critical): us.companyfacts_vs_ixbrl on real PostgreSQL with pgFactsDb + pgTableClient.
+//  1. AAPL and MSFT FY2023 10-K fixtures (plan-2 companyfacts + recorded trimmed primary documents, re-keyed onto
+//     synthetic CIKs/accessions) are synced and reconciled: every expected key has exactly one result row and
+//     every key passes except the registered, explained exceptions (us-ixbrl-sample-v1.exceptions.json);
+//  2. a synthetic issuer ZQZZ whose companyfacts revenue is injected (1001 vs the document's 1000): mismatch →
+//     reconcile_mismatch item + left quarantined (one transaction) → invisible to read_facts → materialized
+//     metrics drop the dependent ratio;
+//  3. restore before a passing re-run → not_passing;
+//  4. the right document is corrected (1001), a new cycle passes, latest_result.passed with inputs_hash equal to
+//     the restore-side recomputation; a changed sample or a changed / missing primary document after the pass
+//     → not_passing / current_evidence_unavailable (plan audit P2); then restore_reconciled
+//     promotes the row, it is current again and the metric comes back after materialize.
+// The cases share state and run in order.
+import {randomUUID} from 'node:crypto';
+import {readFileSync} from 'node:fs';
+import {Pool} from 'pg';
+import {afterAll,beforeAll,describe,expect,it} from 'vitest';
+import {pgTableClient} from '../../db/pg-table-client';
+import type {TableClient} from '../../db/table-client';
+import {MAPPING_GEN} from '../../facts/concepts';
+import {FORMULA_VERSION,materialize} from '../../facts/derive';
+import {pgFactsDb} from '../../facts/pg-facts-db';
+import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
+import {ProviderError,snapshotOf} from '../../facts/providers/shared';
+import {memorySnapshotStore} from '../../facts/snapshot-store';
+import {makeBudget,runFactsSync} from '../../facts/sync';
+import type {SyncDeps} from '../../facts/sync';
+import type {FactsDb,RawSnapshot} from '../../facts/types';
+import {startBatch} from '../batches';
+import {memoryRawStore} from '../raw-store';
+import {usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
+import {inputsHashNow} from './pairs';
+import {runReconcile} from './run';
+import type {ReconcileDeps} from './run';
+import type {PairContext} from './types';
+import {US_SAMPLE_PATH,buildSampleFiling} from './us-sample';
+import type {UsSample} from './us-sample';
+
+const enabled=!!process.env.S4_TEST_STATE;
+const PAIR='us.companyfacts_vs_ixbrl' as const;
+const ADMIN=randomUUID();
+const enc=(s:string)=>new TextEncoder().encode(s);
+const today=()=>new Date().toISOString().slice(0,10);
+
+// ---- identity re-keying (bijective; keeps this suite disjoint from sync-us.integration.test.ts) ----
+const rekeyCik=(cik:string)=>`99${cik}`;
+const rekeyAccn=(a:string)=>{if(!/^00\d{8}-\d{2}-\d{6}$/.test(a))throw new Error(`unexpected accession ${a}`);return `99${a.slice(2)}`;};
+const unkey=(nk:string)=>nk.replace(/^99(\d+):99(\d{8}-\d{2}-\d{6})/,(_m,c:string,a:string)=>`${c}:00${a}`);
+function rekeyCompanyfacts(path:string,cik:string):Uint8Array{
+ let t=readFileSync(path,'utf8');
+ t=t.replace(/"accn"(\s*):(\s*)"(\d{10}-\d{2}-\d{6})"/g,(_m,a:string,b:string,accn:string)=>`"accn"${a}:${b}"${rekeyAccn(accn)}"`);
+ const before=t;t=t.replace(new RegExp(`"cik"(\\s*):(\\s*)${cik}\\b`),(_m,a:string,b:string)=>`"cik"${a}:${b}${rekeyCik(cik)}`);
+ if(t===before)throw new Error(`cik ${cik} not found in ${path}`);
+ return enc(t);
+}
+const rekeyDoc=(path:string,cik:string)=>enc(readFileSync(path,'utf8').replaceAll(`>${cik.padStart(10,'0')}<`,`>${rekeyCik(cik).padStart(10,'0')}<`));
+
+const REAL=[
+ {ticker:'ZQAA',cik:'320193',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
+ {ticker:'ZQMS',cik:'789019',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
+] as const;
+interface Exception{natural_key:string;outcome:string;explanation:string}
+const EXCEPTIONS=JSON.parse(readFileSync('src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.exceptions.json','utf8')) as Exception[];
+
+// ---- synthetic issuer with an injected companyfacts value ----
+const ZZ={ticker:'ZQZZ',cik:'9990003',name:'ZQ Reconcile Co'};
+const ZZ_ACCN='0009990003-25-000001';
+const ZZ_URL=`https://www.sec.gov/Archives/edgar/data/${ZZ.cik}/${ZZ_ACCN.replace(/-/g,'')}/zq-20241231.htm`;
+const cfe=(start:string|undefined,end:string,val:number)=>({...(start?{start}:{}),end,val,accn:ZZ_ACCN,fy:2024,fp:'FY',form:'10-K',filed:'2025-02-15'});
+const zzCompanyfacts=()=>enc(JSON.stringify({cik:Number(ZZ.cik),entityName:ZZ.name,facts:{'us-gaap':{
+ Revenues:{units:{USD:[cfe('2024-01-01','2024-12-31',1001)]}},            // injected: the filed document says 1000
+ NetIncomeLoss:{units:{USD:[cfe('2024-01-01','2024-12-31',100)]}},
+ Assets:{units:{USD:[cfe(undefined,'2024-12-31',5000)]}},
+ StockholdersEquity:{units:{USD:[cfe(undefined,'2024-12-31',2000)]}},
+}}}));
+const H='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024">';
+const zctx=(id:string,period:string)=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">000${ZZ.cik}</xbrli:identifier></xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
+const znf=(name:string,c:string,v:string)=>`<ix:nonFraction name="us-gaap:${name}" contextRef="${c}" unitRef="usd">${v}</ix:nonFraction>`;
+const zzDoc=(revenue:string)=>enc(`${H}<body><ix:header><ix:resources>${zctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}${zctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>`
+ +'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>'
+ +znf('Revenues','d',revenue)+znf('NetIncomeLoss','d','100')+znf('Assets','i','5,000')+znf('StockholdersEquity','i','2,000')+'</body></html>');
+
+describe.skipIf(!enabled)('us.companyfacts_vs_ixbrl on real PostgreSQL (§9.3)',()=>{
+ let admin:Pool;let db:FactsDb;let tables:TableClient;
+ const ids:Record<string,string>={};
+ const docs=new Map<string,Uint8Array>();
+ let sampleBytes:Uint8Array=new Uint8Array();let firstCycle='';let scope:{issuer_id:string;fetch_key:string}[]=[];   // widened: buildSample returns Uint8Array (plan audit P10)
+ const fakeFetch=(async(url:string|URL)=>{const b=docs.get(String(url));return b?new Response(new Uint8Array(b),{status:200}):new Response('',{status:404});}) as unknown as typeof fetch;   // owned copy = DOM BodyInit
+ const readRepoFile=async(p:string)=>p===US_SAMPLE_PATH?sampleBytes:new Uint8Array(readFileSync(p));
+ const rdeps=():ReconcileDeps=>({db,tables,raw:memoryRawStore(),fetch:fakeFetch,readRepoFile,now:()=>new Date(),deadline:null,codeVersion:'test',pairs:{[PAIR]:usCompanyfactsVsIxbrlPair()}});
+ const pairCtx=(over:Partial<PairContext>={}):PairContext=>({db,tables,raw:memoryRawStore(),now:()=>new Date(),budget:makeBudget(null),fetch:fakeFetch,readRepoFile,...over});
+ const q=(text:string,values:unknown[]=[])=>admin.query(text,values).then(r=>r.rows);
+ function buildSample(zzRevenue:string):Uint8Array{
+  const v1=JSON.parse(readFileSync(US_SAMPLE_PATH,'utf8')) as UsSample;
+  const issuers=v1.issuers.filter(i=>REAL.some(r=>r.cik===i.cik)).map(i=>({...i,cik:rekeyCik(i.cik),
+   filings:i.filings.map(f=>({...f,accn:rekeyAccn(f.accn),doc_url:f.doc_url.replace(`/data/${i.cik}/`,`/data/${rekeyCik(i.cik)}/`).replace(f.accn.replace(/-/g,''),rekeyAccn(f.accn).replace(/-/g,''))}))}));
+  const zz=buildSampleFiling({cik:ZZ.cik,accn:ZZ_ACCN,form:'10-K',period_end:'2024-12-31',primary_document:'zq-20241231.htm',doc_url:ZZ_URL,is_inline_xbrl:true,submissions_category:'Non-accelerated filer',
+   companyfacts:snapshotOf(zzCompanyfacts(),{source:'edgar'}),doc:zzDoc(zzRevenue),sinceYear:2016});
+  return enc(JSON.stringify({...v1,issuers:[...issuers,{cik:ZZ.cik,ticker:ZZ.ticker,regime:'10-K',filings:[zz]}]}));
+ }
+ const revFactId=async()=>(await q(`select fact_id from public.financial_facts where issuer_id=$1 and concept='revenue'`,[ids.ZZ]))[0].fact_id as string;
+ const zzItem=async()=>(await q(`select id,status,dataset,detail,payload from public.dq_quarantine where reason_code='reconcile_mismatch' and detail->>'pair'=$1 and payload->'fact_ids'->>0=$2`,[PAIR,await revFactId()]))[0] as {id:string;status:string;dataset:string;detail:Record<string,any>;payload:Record<string,any>};
+ const netMargin=async()=>(await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION)).find(m=>m.metric==='net_margin'&&m.duration==='12M');
+
+ beforeAll(async()=>{
+  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
+  admin=new Pool({connectionString:state.adminUrl});db=pgFactsDb(admin);tables=pgTableClient(admin);
+  expect((await q(`select count(*)::int as n from public.dq_reconcile_cycles where pair=$1 and status='running'`,[PAIR]))[0].n,'a foreign running cycle of this pair (contract note 14)').toBe(0);
+  await q(`insert into auth.users(id,email) values($1,$2) on conflict (id) do nothing`,[ADMIN,`${ADMIN}@ixbrl.test`]);
+  const provision=async(ticker:string,cik:string,name:string)=>{
+   await q(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[ticker,name]);
+   await q(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),name,cik]);
+   const id=(await q(`select issuer_id from public.issuers where cik=$1`,[cik]))[0].issuer_id as string;
+   await q(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[id,ticker]);
+   return id;
+  };
+  const fixtures=new Map<string,Uint8Array>();
+  for(const r of REAL){ids[r.ticker]=await provision(r.ticker,rekeyCik(r.cik),`${r.ticker} fixture copy`);fixtures.set(rekeyCik(r.cik).padStart(10,'0'),rekeyCompanyfacts(r.companyfacts,r.cik));}
+  ids.ZZ=await provision(ZZ.ticker,ZZ.cik,ZZ.name);fixtures.set(ZZ.cik.padStart(10,'0'),zzCompanyfacts());
+  scope=Object.entries(ids).map(([t,id])=>({issuer_id:id,fetch_key:(t==='ZZ'?ZZ.cik:rekeyCik(REAL.find(r=>r.ticker===t)!.cik)).padStart(10,'0')}));
+  await db.reconcileScope('US',scope.map(x=>({...x,reasons:['test'],priority:10})));
+  await q(`update public.fact_sync_scope set next_due_at='2999-01-01' where issuer_id = any($1::uuid[])`,[Object.values(ids)]);
+  const deps:SyncDeps={db,tables,storage:memorySnapshotStore(),
+   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const b=fixtures.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10)});},
+   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
+   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
+   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
+   now:()=>new Date(),deadline:null,codeVersion:'test'};
+  const sync=await runFactsSync(deps,{market:'US',limit:10,issuerIds:Object.values(ids),dryRun:false,triggeredBy:'script',mappingGen:MAPPING_GEN});
+  expect(sync.detail).toMatchObject({published:Object.keys(ids).length,failed:0});
+  for(const r of REAL){
+   const meta=JSON.parse(readFileSync(`${r.doc}.meta.json`,'utf8')) as {source_url:string};
+   const accn=meta.source_url.split('/')[7];   // 10+2+6 digits without dashes
+   docs.set(meta.source_url.replace(`/data/${r.cik}/`,`/data/${rekeyCik(r.cik)}/`).replace(accn,`99${accn.slice(2)}`),rekeyDoc(r.doc,r.cik));
+  }
+  docs.set(ZZ_URL,zzDoc('1,000'));
+  sampleBytes=buildSample('1,000');
+ },180_000);
+ afterAll(async()=>{
+  if(db&&scope.length>0)await db.reconcileScope('US',scope.map(x=>({...x,reasons:[],priority:0}))).catch(()=>{});
+  await admin?.end();
+ });
+
+ it('every expected key gets exactly one result; AAPL/MSFT copies pass except registered exceptions; the injected ZZ revenue is quarantined, invisible and rematerialized',async()=>{
+  await materialize(db,ids.ZZ,'US');
+  expect((await netMargin())?.value).toBe('0.0999000999');   // 100 / 1001 before reconciliation
+  const r1=await runReconcile(rdeps(),{pair:PAIR,triggeredBy:'script'});
+  firstCycle=r1.cycle!.cycleId;
+  expect(r1.cycle).toMatchObject({created:true,settled:true});
+  expect(r1.members.every(m=>m.outcome==='done')).toBe(true);
+  const rows=await q(`select natural_key,outcome,passed,issuer_id from public.dq_reconciliations where pair=$1 and cycle_id=$2`,[PAIR,firstCycle]) as {natural_key:string;outcome:string;passed:boolean;issuer_id:string}[];
+  expect(rows.length).toBe(r1.cycle!.expectedTotal);
+  expect(new Set(rows.map(r=>r.natural_key)).size).toBe(rows.length);
+  const byKey=(a:{natural_key:string},b:{natural_key:string})=>a.natural_key<b.natural_key?-1:1;
+  const realFailures=rows.filter(r=>r.issuer_id!==ids.ZZ&&!r.passed).map(r=>({natural_key:unkey(r.natural_key),outcome:r.outcome==='compared'?'compared_failed':r.outcome})).sort(byKey);
+  expect(realFailures).toEqual(EXCEPTIONS.map(({natural_key,outcome})=>({natural_key,outcome})).sort(byKey));
+  expect(rows.filter(r=>r.issuer_id!==ids.ZZ).length).toBeGreaterThan(REAL.length*20);
+  expect(r1.cycle!.status).toBe(EXCEPTIONS.some(e=>e.outcome!=='compared_failed')?'complete_with_gaps':'complete');
+  const zzRows=rows.filter(r=>r.issuer_id===ids.ZZ).sort(byKey);
+  expect(zzRows.map(r=>[r.natural_key.split(':')[2],r.outcome,r.passed])).toEqual([['equity_parent','compared',true],['net_income_parent','compared',true],['revenue','compared',false],['total_assets','compared',true]]);
+  const item=await zzItem();
+  expect(item).toMatchObject({status:'open',dataset:'facts.us'});
+  expect(item.detail.hook.state).toBe('done');
+  expect(item.detail.latest_result).toMatchObject({passed:false});
+  expect((await q(`select status from public.financial_facts where fact_id=$1`,[await revFactId()]))[0].status).toBe('quarantined');
+  const visible=await db.readFacts(ids.ZZ,'US',{concepts:['revenue'],asOf:today()});
+  expect(visible.rows.filter(r=>r.period_end==='2024-12-31')).toEqual([]);
+  expect(await netMargin()).toBeUndefined();
+  const [rev]=await db.stateRevs([ids.ZZ],'US');
+  const metric=(await db.metricsOfIssuer(ids.ZZ,'US',FORMULA_VERSION))[0];
+  if(metric)expect(metric.based_on_lineage).toEqual([{issuer_id:ids.ZZ,state_rev:rev.state_rev}]);
+ },300_000);
+
+ it('restore is refused while the latest result is not passing',async()=>{
+  const item=await zzItem();
+  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
+  await expect(db.restoreReconciled(item.id,batchId,await inputsHashNow(pairCtx(),item),ADMIN)).rejects.toMatchObject({code:'not_passing'});
+  expect((await zzItem()).status).toBe('open');
+ });
+
+ it('a corrected right document passes in a new cycle; restore needs the current inputs hash, promotes the row and the metric returns',async()=>{
+  docs.set(ZZ_URL,zzDoc('1,001'));sampleBytes=buildSample('1,001');
+  const r2=await runReconcile(rdeps(),{pair:PAIR,triggeredBy:'script'});
+  expect(r2.cycle).toMatchObject({created:true,settled:true});expect(r2.cycle!.cycleId).not.toBe(firstCycle);
+  const item=await zzItem();
+  expect(item.status).toBe('open');
+  expect(item.detail.latest_result).toMatchObject({passed:true});
+  const hashNow=await inputsHashNow(pairCtx(),item);
+  expect(item.detail.latest_result.inputs_hash).toBe(hashNow);
+  const changed=await inputsHashNow(pairCtx({readRepoFile:async p=>p===US_SAMPLE_PATH?enc(`${new TextDecoder().decode(sampleBytes)} `):new Uint8Array(readFileSync(p))}),item);
+  expect(changed).not.toBe(hashNow);
+  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
+  await expect(db.restoreReconciled(item.id,batchId,changed,ADMIN)).rejects.toMatchObject({code:'not_passing'});
+  // plan audit P2: the primary document changes after the pass while the sample bytes stay → a different current hash, restore refused
+  const passedDoc=docs.get(ZZ_URL)!;docs.set(ZZ_URL,zzDoc('1,002'));
+  const docChanged=await inputsHashNow(pairCtx(),item);
+  expect(docChanged).not.toBe(hashNow);
+  await expect(db.restoreReconciled(item.id,batchId,docChanged,ADMIN)).rejects.toMatchObject({code:'not_passing'});
+  docs.delete(ZZ_URL);
+  await expect(inputsHashNow(pairCtx(),item)).rejects.toThrow('current_evidence_unavailable');   // 404 now → restore stays disabled
+  docs.set(ZZ_URL,passedDoc);
+  expect(await inputsHashNow(pairCtx(),item)).toBe(hashNow);
+  const res=await db.restoreReconciled(item.id,batchId,hashNow,ADMIN);
+  expect(res).toEqual({promoted:1,skipped:[]});
+  expect((await zzItem()).status).toBe('resolved_accept');
+  const visible=await db.readFacts(ids.ZZ,'US',{concepts:['revenue'],asOf:today()});
+  expect(visible.rows.filter(r=>r.period_end==='2024-12-31'&&r.is_current).map(r=>r.value)).toEqual(['1001']);
+  await materialize(db,ids.ZZ,'US');
+  expect((await netMargin())?.value).toBe('0.0999000999');
+ },300_000);
+});
diff --git a/src/lib/dq/reconcile/lineage.integration.test.ts b/src/lib/dq/reconcile/lineage.integration.test.ts
new file mode 100644
index 00000000..28b94926
--- /dev/null
+++ b/src/lib/dq/reconcile/lineage.integration.test.ts
@@ -0,0 +1,109 @@
+// src/lib/dq/reconcile/lineage.integration.test.ts
+// Spec §9.3 (critical): facts.lineage_same_day on real PostgreSQL. Two synthetic issuers disclose FY2023
+// revenue on the same day with different values; after set_merge(source → target) the lineage read reports the
+// conflict and suppresses the current value; the pair writes a failed result and a lineage_conflict item;
+// resolve_lineage_conflict keeps the target's row (the other is quarantined), the conflict disappears, the kept
+// value is current again with its recorded issuer, and materialize writes metrics whose based_on_lineage holds
+// both members' state revisions.
+import {randomUUID} from 'node:crypto';
+import {readFileSync} from 'node:fs';
+import {Pool} from 'pg';
+import {afterAll,beforeAll,describe,expect,it} from 'vitest';
+import {pgTableClient} from '../../db/pg-table-client';
+import type {TableClient} from '../../db/table-client';
+import {MAPPING_GEN} from '../../facts/concepts';
+import {FORMULA_VERSION,materialize} from '../../facts/derive';
+import {pgFactsDb} from '../../facts/pg-facts-db';
+import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
+import {ProviderError,snapshotOf} from '../../facts/providers/shared';
+import {memorySnapshotStore} from '../../facts/snapshot-store';
+import {runFactsSync} from '../../facts/sync';
+import type {FactsDb,RawSnapshot} from '../../facts/types';
+import {startBatch} from '../batches';
+import {memoryRawStore} from '../raw-store';
+import {lineageSameDayPair} from './pair-lineage';
+import {runReconcile} from './run';
+
+const enabled=!!process.env.S4_TEST_STATE;
+const PAIR='facts.lineage_same_day' as const;
+const ADMIN=randomUUID();
+const S={ticker:'ZQLS',cik:'9990011',name:'ZQ Lineage Source',accn:'0009990011-24-000001',revenue:1000};
+const T={ticker:'ZQLT',cik:'9990012',name:'ZQ Lineage Target',accn:'0009990012-24-000001',revenue:1200};
+const doc=(x:typeof S,withNetIncome:boolean)=>new TextEncoder().encode(JSON.stringify({cik:Number(x.cik),entityName:x.name,facts:{'us-gaap':{
+ Revenues:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:x.revenue,accn:x.accn,fy:2023,fp:'FY',form:'10-K',filed:'2024-02-15'}]}},
+ ...(withNetIncome?{NetIncomeLoss:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:120,accn:x.accn,fy:2023,fp:'FY',form:'10-K',filed:'2024-02-15'}]}}}:{}),
+}}}));
+const K='revenue:2023-01-01:2023-12-31:consolidated:USD';
+
+describe.skipIf(!enabled)('facts.lineage_same_day on real PostgreSQL (§9.3)',()=>{
+ let admin:Pool;let db:FactsDb;let tables:TableClient;let s='';let t='';
+ const q=(text:string,values:unknown[]=[])=>admin.query(text,values).then(r=>r.rows);
+ const today=()=>new Date().toISOString().slice(0,10);
+ const factOf=async(issuer:string)=>(await q(`select fact_id from public.financial_facts where issuer_id=$1 and concept='revenue'`,[issuer]))[0].fact_id as string;
+ beforeAll(async()=>{
+  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
+  admin=new Pool({connectionString:state.adminUrl});db=pgFactsDb(admin);tables=pgTableClient(admin);
+  expect((await q(`select count(*)::int as n from public.dq_reconcile_cycles where pair=$1 and status='running'`,[PAIR]))[0].n,'a foreign running cycle of this pair (contract note 14)').toBe(0);
+  // set_merge audits into research_audit_log, whose user_id references auth.users: the resolver must exist (Task 8a's user fixture; plan audit P11)
+  await q(`insert into auth.users(id,email) values($1,$2) on conflict (id) do nothing`,[ADMIN,`${ADMIN}@lineage.test`]);
+  const provision=async(x:typeof S)=>{
+   await q(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[x.ticker,x.name]);
+   await q(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),x.name,x.cik]);
+   const id=(await q(`select issuer_id from public.issuers where cik=$1`,[x.cik]))[0].issuer_id as string;
+   await q(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[id,x.ticker]);
+   return id;
+  };
+  s=await provision(S);t=await provision(T);
+  await db.reconcileScope('US',[{issuer_id:s,reasons:['test'],priority:10,fetch_key:S.cik.padStart(10,'0')},{issuer_id:t,reasons:['test'],priority:10,fetch_key:T.cik.padStart(10,'0')}]);
+  await q(`update public.fact_sync_scope set next_due_at='2999-01-01' where issuer_id = any($1::uuid[])`,[[s,t]]);
+  const bytes=new Map([[S.cik.padStart(10,'0'),doc(S,false)],[T.cik.padStart(10,'0'),doc(T,true)]]);
+  const sync=await runFactsSync({db,tables,storage:memorySnapshotStore(),
+   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const b=bytes.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10)});},
+   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
+   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
+   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
+   now:()=>new Date(),deadline:null,codeVersion:'test'},{market:'US',limit:10,issuerIds:[s,t],dryRun:false,triggeredBy:'script',mappingGen:MAPPING_GEN});
+  expect(sync.detail).toMatchObject({published:2,failed:0});
+ },120_000);
+ afterAll(async()=>{
+  if(db&&s&&t)await db.reconcileScope('US',[{issuer_id:s,reasons:[],priority:0,fetch_key:S.cik.padStart(10,'0')},{issuer_id:t,reasons:[],priority:0,fetch_key:T.cik.padStart(10,'0')}]).catch(()=>{});
+  await admin?.end();
+ });
+
+ it('set_merge → the lineage read reports the same-day conflict and suppresses the current value',async()=>{
+  await q(`update public.issuer_securities set valid_to=current_date, valid_to_method='curated' where issuer_id=$1 and valid_to is null`,[s]);
+  expect(await db.setMerge(s,t,ADMIN)).toEqual({repointed:0});
+  const lineage=await db.lineageOf(t);
+  expect(lineage).toEqual([t,s]);
+  const env=await db.readFactsLineage(lineage,'US',{concepts:['revenue','net_income_parent'],asOf:today()});
+  expect(env.conflicts).toHaveLength(1);
+  expect(new Set(env.conflicts[0].fact_ids)).toEqual(new Set([await factOf(s),await factOf(t)]));
+  expect(env.rows.filter(r=>r.concept==='revenue'&&r.is_current)).toEqual([]);
+  expect(env.rows.filter(r=>r.concept==='net_income_parent'&&r.is_current).map(r=>r.value)).toEqual(['120']);
+ });
+
+ it('the pair writes a failed numeric result and one lineage_conflict item; resolve_lineage_conflict restores one current value; metrics carry both lineage revisions',async()=>{
+  const r=await runReconcile({db,tables,raw:memoryRawStore(),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,readRepoFile:async()=>{throw new Error('no repo file');},
+   now:()=>new Date(),deadline:null,codeVersion:'test',pairs:{[PAIR]:lineageSameDayPair({targets:[t]})}},{pair:PAIR,triggeredBy:'script',issuerIds:[t]});
+  expect(r.members).toEqual([expect.objectContaining({issuerId:t,market:'US',outcome:'done',counts:{compared_passed:0,compared_failed:1,not_compared:0}})]);
+  const nk=`${t}:${K}:2024-02-15`;
+  const [row]=await q(`select kind,outcome,passed,left_value::text as l,right_value::text as r from public.dq_reconciliations where pair=$1 and natural_key=$2`,[PAIR,nk]);
+  expect(row).toMatchObject({kind:'numeric',outcome:'compared',passed:false});
+  expect(new Set([row.l,row.r])).toEqual(new Set(['1000','1200']));
+  const items=await q(`select id,status,dataset,payload from public.dq_quarantine where reason_code='lineage_conflict' and natural_key=$1`,[nk]);
+  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({status:'open',dataset:'facts.us'});
+  const keep=await factOf(t);
+  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
+  expect(await db.resolveLineageConflict(items[0].id,keep,batchId,ADMIN)).toEqual({quarantined:1});
+  expect((await q(`select status,detail from public.dq_quarantine where id=$1`,[items[0].id]))[0]).toMatchObject({status:'resolved_accept',detail:expect.objectContaining({chosen_fact_ids:[keep]})});
+  expect((await q(`select status from public.financial_facts where fact_id=$1`,[await factOf(s)]))[0].status).toBe('quarantined');
+  const env=await db.readFactsLineage([t,s],'US',{concepts:['revenue'],asOf:today()});
+  expect(env.conflicts).toEqual([]);
+  expect(env.rows.filter(x=>x.is_current).map(x=>[x.issuer_id,x.value])).toEqual([[t,'1200']]);
+  await materialize(db,t,'US');
+  const revs=(await db.stateRevs([t,s],'US')).sort((a,b)=>a.issuer_id<b.issuer_id?-1:1);
+  const metrics=await db.metricsOfIssuer(t,'US',FORMULA_VERSION);
+  expect(metrics.find(m=>m.metric==='net_margin'&&m.duration==='12M')?.value).toBe('0.1');
+  for(const m of metrics)expect([...m.based_on_lineage].sort((a,b)=>a.issuer_id<b.issuer_id?-1:1)).toEqual(revs);
+ },120_000);
+});
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

exec
/bin/zsh -lc 'cat scripts/ci/research-checks.ts; cat vitest.config.*; cat src/lib/dq/reconcile/pair-lineage.ts; cat src/lib/dq/reconcile/pair-us-ixbrl.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const recoveredMigration = {
  file: '20260904090000_watchlist_decision_sync.sql',
  sha256: '31b96984bd7fb6b3a3db557618a830ee6cd77d45ee3186452eefe7b218019107',
};
export const criticalSuites = [
  's4/integration.test.ts', 's4/anchor-two-phase.integration.test.ts', 's4/anchor-runner.integration.test.ts', 's4/checkpoint-registry.integration.test.ts', 's4/anchor-runner-program.integration.test.ts', 's4/ledger.integration.test.ts', 's4/source-extension.integration.test.ts',
  's6/arm-lineage.integration.test.ts', 's6/store.integration.test.ts', 's6/arm-report-db.integration.test.ts',
  'entity-keys/entity-keys.integration.test.ts', 'ledger/calls-import.integration.test.ts',
  'cluster/alignments.integration.test.ts', 'fanout/run.integration.test.ts',
  'cards/cards.integration.test.ts', 'thesis-extension.integration.test.ts', 'weekly/weekly.integration.test.ts',
].map(p => `src/lib/research/${p}`).concat('src/lib/observability/quote-snapshot.integration.test.ts', 'src/lib/analyst/recommendations-append-only.integration.test.ts', 'src/lib/dq/dq-foundation.integration.test.ts', 'src/lib/entities/issuers.integration.test.ts', 'src/lib/entities/issuers-write.integration.test.ts', 'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts', 'src/lib/entities/identifiers.integration.test.ts', 'src/lib/entities/ah-link.integration.test.ts', 'src/lib/dq/dq-extensions.integration.test.ts', 'src/lib/dq/reconcile/ixbrl-pair.integration.test.ts', 'src/lib/dq/reconcile/lineage.integration.test.ts');

export function migrationInventory(root = process.cwd()) {
  const directory = join(root, 'supabase/migrations');
  const files = readdirSync(directory).filter(f => f.endsWith('.sql')).sort();
  const versions = new Set<string>();
  for (const file of files) {
    const version = /^(\d{14})_.+\.sql$/.exec(file)?.[1];
    if (!version || versions.has(version)) throw new Error(`Invalid/duplicate migration version: ${file}`);
    versions.add(version);
  }
  if (!files.includes(recoveredMigration.file)) throw new Error('Recovered migration missing');
  if (createHash('sha256').update(readFileSync(join(directory, recoveredMigration.file))).digest('hex') !== recoveredMigration.sha256) {
    throw new Error('Recovered migration bytes changed');
  }
  const lock = JSON.parse(readFileSync(join(root, 'supabase/migrations.lock.json'), 'utf8')) as { migrations: { file: string; sha256: string }[] };
  const maxLocked = lock.migrations.map(m => m.file.slice(0, 14)).sort().at(-1);
  if (!maxLocked) throw new Error('Migration lock is empty');
  for (const entry of lock.migrations) {
    if (!files.includes(entry.file) || createHash('sha256').update(readFileSync(join(directory, entry.file))).digest('hex') !== entry.sha256) throw new Error(`Locked migration changed/missing: ${entry.file}`);
  }
  for (const file of files) {
    if (!lock.migrations.some(m => m.file === file) && file.slice(0, 14) <= maxLocked) throw new Error(`Non-append migration: ${file}`);
  }
  return files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(join(directory, file))).digest('hex') }));
}

type Report = { success?: boolean; testResults?: { name: string; assertionResults: { status: string }[] }[] };
export function verifyDatabaseReport(report: Report, root = process.cwd()) {
  if (report.success !== true) throw new Error('Vitest did not succeed');
  let passed = 0;
  for (const file of criticalSuites) {
    const results = report.testResults?.filter(t => t.name === join(root, file));
    if (results?.length !== 1 || !results[0].assertionResults.length) throw new Error(`Critical suite missing/empty: ${file}`);
    if (results[0].assertionResults.some(t => t.status !== 'passed')) throw new Error(`Critical suite failed/skipped: ${file}`);
    passed += results[0].assertionResults.length;
  }
  return { criticalSuites: criticalSuites.length, criticalPassed: passed, criticalSkipped: 0 };
}

export function verifyCriticalSuiteInventory(root = process.cwd()) {
  const source = join(root, 'src');
  const discovered = readdirSync(source, { recursive: true }).filter((p): p is string => typeof p === 'string' && p.endsWith('.test.ts'))
    .filter(p => readFileSync(join(source, p), 'utf8').includes('S4_TEST_STATE'))
    .map(p => 'src/' + p.replaceAll('\\', '/')).sort();
  if (JSON.stringify(discovered) !== JSON.stringify([...criticalSuites].sort())) throw new Error('Database suite inventory drift');
}
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
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
// src/lib/dq/reconcile/pair-us-ixbrl.ts
// us.companyfacts_vs_ixbrl (spec §5.2, §5.3, T1). Members and expected keys come ONLY from the frozen sample
// manifest (US_SAMPLE_PATH). Per accession, in this order:
//  1. no local filing (edgar, accn) → every key left_unlinked (the document is not fetched);
//  2. right document: is_inline_xbrl=false → unsupported(not_inline_xbrl); else GET doc_url with the shared process-wide SEC pacer
//     (secPacer, 120 ms, User-Agent EDGAR_USER_AGENT/default, 5xx retried twice then THROWN, 429 THROWN at once as sec_rate_limited = execution failure),
//     404 → unsupported(document_not_found), > 50 MB → unsupported(document_too_large); accepted bytes go to
//     reconcile-raw (content-addressed, sha256 = right_sha256) and are parsed; IxbrlParseError →
//     unsupported(parse_error:<code>); no ix element → unsupported(not_inline_xbrl);
//  3. left: read_filing_facts(filing, includeNonOk) filtered by activeRows (active generation, published,
//     ok|quarantined); an OPEN reconcile_mismatch item of the key pins its fact instead (explicit re-check,
//     any generation); 0 rows → left_missing, > 1 → left_ambiguous;
//  4. right match on the filer's facts (entity = CIK): the left row's source_concept in the same period and
//     unit, else the plan 2 fallback order (tagsOf) — first present tag, detail.tag_mismatch=true; none →
//     unsupported when the parser reported an unsupported fact of those tags for that period, else
//     right_missing; several distinct values → right_ambiguous (never quarantines);
//  5. exact comparison (tolerance 0: the iXBRL value is the filed value); action by actionFor (quarantine
//     only an ok left row, bound keys go back to their item). detail: left {fact_id, raw_hash, status,
//     precision null (value_text is canonicalised, trailing zeros are not retained)}, right {document, sha256, path, locator {name,
//     contextRef, unitRef}, precision {decimals, scale}}, inputs_hash = computeInputsHash(left raw_hash, right
//     sha256, sample sha256, IXBRL_PARSER_VERSION).
// currentRight (restore, plan audit P2): the sample filing that holds the result's natural key, its primary
// document fetched NOW and hashed; unobtainable (sample gone, not inline, 404, too large, SEC down) → null.
// sec.filer_category is NOT recorded here: its single producer is scripts/dq/filer-categories.ts (Task 17b,
// spec §6.1; plan 3 接口对齐记录). filerClass stays exported for select-us-sample.ts.
import {conceptById} from '../../facts/concepts';
import {tagsOf} from '../../facts/providers/edgar-companyfacts';
import {secPacer,sleep} from '../../facts/providers/shared';
import {memoryRawStore} from '../raw-store';
import type {RawStore} from '../raw-store';
import type {FactRow} from '../../facts/types';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {compareDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {IXBRL_PARSER_VERSION,IxbrlParseError,MAX_IXBRL_BYTES,indexIxFacts,ixFactKey,parseInlineXbrl} from './ixbrl';
import type {IxbrlDocument,IxFact} from './ixbrl';
import {ReconcileConfigError,runContextOf,actionFor,activeRows,comparedNumeric,factKeyOf,mismatchItem,notCompared,openMismatches,readRepoJson,sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,PairContext,ReconcileOutcome,ReconcileResultInput} from './types';
import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,entityIs,usNaturalKey,validateUsSample} from './us-sample';
import type {SampleFiling,UsSample} from './us-sample';

const PAIR='us.companyfacts_vs_ixbrl' as const;
const SIDES={left_source:'edgar.companyfacts',right_source:'edgar.ixbrl'};
const RESERVE_MS=10_000;

export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status:'too_large';content_length:number|null;bytes_read:number};
/** Raw-evidence metadata never carries a query string, fragment or credentials: scheme, host and path only. */
const evidenceUrl=(u:string):string=>{try{const x=new URL(u);return `${x.protocol}//${x.host}${x.pathname}`;}catch{return '';}};
const FAILURE_BODY_CAP=1024*1024;
/** Dry runs never write production storage: evidence goes to an ephemeral in-memory store (hashes are still computed locally). */
const storeOf=(ctx:PairContext):RawStore=>runContextOf(ctx).dryRun?memoryRawStore():ctx.raw;
/**
 * Reads at most `limit` bytes of the body while streaming; past the limit the stream is cancelled and
 * exceeded=true (bytes then hold the first `limit` bytes). A response without a stream falls back to arrayBuffer.
 */
async function readLimited(res:Response,limit:number):Promise<{bytes:Uint8Array;exceeded:boolean}>{
 if(!res.body){const all=new Uint8Array(await res.arrayBuffer());return all.byteLength>limit?{bytes:all.slice(0,limit),exceeded:true}:{bytes:all,exceeded:false};}
 const reader=res.body.getReader();const chunks:Uint8Array[]=[];let n=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  if(n+value.byteLength>limit){chunks.push(value.slice(0,limit-n));n=limit;await reader.cancel().catch(()=>undefined);return {bytes:concat(chunks,n),exceeded:true};}
  chunks.push(value);n+=value.byteLength;
 }
 return {bytes:concat(chunks,n),exceeded:false};
}
function concat(chunks:Uint8Array[],n:number):Uint8Array{const out=new Uint8Array(n);let o=0;for(const c of chunks){out.set(c,o);o+=c.byteLength;}return out;}
/** A non-accepted response body is evidence too (404 page, SEC error page): stored content-addressed, capped at 1 MB (truncated + flagged). */
async function storeFailure(ctx:PairContext,res:Response,url:string):Promise<void>{
 let got:{bytes:Uint8Array;exceeded:boolean};
 try{got=await readLimited(res,FAILURE_BODY_CAP);}catch{got={bytes:new Uint8Array(),exceeded:false};}
 await storeOf(ctx).put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(url),http_status:res.status,outcome:'failure',...(got.exceeded?{truncated:1}:{})}},ctx.budget);
}
export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFetch>{
 const ua=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 for(let attempt=0;;attempt++){
  await secPacer.admit({budget:ctx.budget,reserveMs:RESERVE_MS});
  const timeout=Math.min(60_000,ctx.budget.remainingMs()-RESERVE_MS);
  if(!(timeout>0))throw new Error('sec_unavailable:budget_exhausted');
  const res=await ctx.fetch(url,{headers:{'User-Agent':ua,Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.any([ctx.budget.signal,AbortSignal.timeout(timeout)])});
  if(res.status===404){await storeFailure(ctx,res,url);return {status:'not_found'};}
  if(res.status===429){await storeFailure(ctx,res,url);throw new Error('sec_rate_limited');}   // a run failure at once: no retry against a throttling SEC
  if(res.status>=500){
   await storeFailure(ctx,res,url);
   if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
   throw new Error(`sec_unavailable:http_${res.status}`);
  }
  if(!res.ok){await storeFailure(ctx,res,url);throw new Error(`sec_unavailable:http_${res.status}`);}
  const cl=res.headers.get('content-length'),declared=cl!==null&&/^\d+$/.test(cl)?Number(cl):null;
  if(declared!==null&&declared>MAX_IXBRL_BYTES){await res.body?.cancel().catch(()=>undefined);return {status:'too_large',content_length:declared,bytes_read:0};}
  const got=await readLimited(res,MAX_IXBRL_BYTES);
  return got.exceeded?{status:'too_large',content_length:declared,bytes_read:got.bytes.byteLength}:{status:'ok',bytes:got.bytes};
 }
}

/** §6.1 categories, case-insensitive; 'non-accelerated' is tested before 'accelerated'; SRC alone or unparseable → null. */
export function filerClass(text:string|null|undefined):'large_accelerated'|'accelerated'|'non_accelerated'|null{
 if(!text)return null;
 const t=text.toLowerCase();
 if(t.includes('large accelerated'))return 'large_accelerated';
 if(t.includes('non-accelerated')||t.includes('non accelerated'))return 'non_accelerated';
 if(t.includes('accelerated filer'))return 'accelerated';
 return null;
}

async function loadSample(ctx:PairContext):Promise<{sample:UsSample;sha256:string}>{
 const {json,sha256}=await readRepoJson(ctx,US_SAMPLE_PATH,'invalid_sample_file');
 const v=validateUsSample(json);
 if(!v.ok)throw new ReconcileConfigError('invalid_sample_file',v.errors.slice(0,5).join('; '));
 return {sample:v.sample,sha256};
}

type Right={kind:'ok';sha256:string;path:string;doc:IxbrlDocument;index:Map<string,{values:string[];facts:IxFact[]}>;shaMismatch:boolean}|{kind:'unsupported';reason:string;sha256:string;size?:{content_length:number|null;bytes_read:number}};
async function rightSide(ctx:PairContext,f:SampleFiling,cik:string):Promise<Right>{
 if(f.is_inline_xbrl===false)return {kind:'unsupported',reason:'not_inline_xbrl',sha256:''};
 const got=await fetchSecDocument(f.doc_url,ctx);
 if(got.status!=='ok')return {kind:'unsupported',reason:got.status==='not_found'?'document_not_found':'document_too_large',sha256:'',...(got.status==='too_large'?{size:{content_length:got.content_length,bytes_read:got.bytes_read}}:{})};
 const stored=await storeOf(ctx).put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(f.doc_url),accn:f.accn,http_status:200}},ctx.budget);
 let doc:IxbrlDocument;
 try{doc=parseInlineXbrl(new TextDecoder('utf-8').decode(got.bytes));}
 catch(e){if(e instanceof IxbrlParseError)return {kind:'unsupported',reason:`parse_error:${e.code}`,sha256:stored.sha256};throw e;}
 if(doc.unsupported.some(u=>u.reason==='not_inline_xbrl'))return {kind:'unsupported',reason:'not_inline_xbrl',sha256:stored.sha256};
 const filer=doc.facts.filter(x=>entityIs(x.entity,cik)).map(x=>({...x,entity:'filer'}));
 return {kind:'ok',sha256:stored.sha256,path:stored.path,doc,index:indexIxFacts(filer),shaMismatch:stored.sha256!==f.doc_sha256};
}

const withTagNote=<T extends {detail?:Record<string,unknown>}>(item:T,fallback:boolean):T=>fallback?{...item,detail:{...item.detail,tag_mismatch:true}}:item;
interface KeyLoc{cik:string;accn:string;concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:string}

export function usCompanyfactsVsIxbrlPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:'edgar.companyfacts',right:'edgar.ixbrl',
  inputs:{repoFile:US_SAMPLE_PATH,parserVersion:IXBRL_PARSER_VERSION,goldSchema:US_SAMPLE_SCHEMA},
  async currentRight(ctx,rec){
   let sample:UsSample;
   try{sample=(await loadSample(ctx)).sample;}catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
   const nk=String(rec.natural_key);
   const entry=sample.issuers.flatMap(i=>i.filings.map(f=>({cik:i.cik,f}))).find(x=>x.f.expected_keys.some(k=>usNaturalKey(x.cik,x.f.accn,k)===nk))?.f;
   if(!entry||entry.is_inline_xbrl===false)return null;
   try{const got=await fetchSecDocument(entry.doc_url,ctx);return got.status==='ok'?sha256Hex(got.bytes):null;}
   catch(e){console.error('[reconcile] current right document',e instanceof Error?e.message:String(e));return null;}
  },
  async members(ctx){
   const {sample}=await loadSample(ctx);
   const out:MemberPlan[]=[];
   for(const iss of sample.issuers){
    const [row]=await ctx.tables.select('issuers',{cik:iss.cik},{limit:1});
    if(!row)throw new ReconcileConfigError('issuer_unresolved',`cik ${iss.cik}`);
    out.push({issuerId:String(row.issuer_id),market:'US',expectedKeys:iss.filings.flatMap(f=>f.expected_keys.map(k=>({naturalKey:usNaturalKey(iss.cik,f.accn,k),locator:{cik:iss.cik,accn:f.accn,concept:k.concept,period_start:k.period_start,period_end:k.period_end,unit:k.unit,source_concept:k.source_concept,origin:k.origin}})))});
   }
   return out;
  },
  async evaluate(ctx,member){
   const {sample,sha256:sampleSha}=await loadSample(ctx);
   const open=await openMismatches(ctx.tables,PAIR,'US');
   const results:ReconcileResultInput[]=new Array(member.expectedKeys.length);
   const groups=new Map<string,number[]>();
   member.expectedKeys.forEach((k,i)=>{const loc=k.locator as unknown as KeyLoc;const g=`${loc.cik}|${loc.accn}`;groups.set(g,[...(groups.get(g)??[]),i]);});
   for(const [g,idxs] of groups){
    const [cik,accn]=g.split('|');
    const entry=sample.issuers.find(x=>x.cik===cik)?.filings.find(f=>f.accn===accn);
    const every=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>{for(const i of idxs)results[i]=notCompared(member.expectedKeys[i].naturalKey,'numeric',outcome,SIDES,{accn,...detail});};
    if(!entry){every('unsupported',{reason:'sample_changed'});continue;}
    const filing=await ctx.db.findFilingBySourceRef('edgar',accn);
    if(!filing){every('left_unlinked',{});continue;}
    const right=await rightSide(ctx,entry,cik);
    const byKey=new Map<string,FactRow[]>();
    if(right.kind==='ok'||open.size>0)for(const r of activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing)){const kf=factKeyOf(r);byKey.set(kf,[...(byKey.get(kf)??[]),r]);}
    for(const i of idxs){
     const k=member.expectedKeys[i];const loc=k.locator as unknown as KeyLoc;const nk=k.naturalKey;
     const bound=open.get(nk);
     const rows=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1):(byKey.get(factKeyOf(loc))??[]);
     const left=rows.length===1?rows[0]:null;
     const rightSha=right.sha256;
     const inputs_hash=computeInputsHash({left_raw_hash:left?.raw_hash??'',right_sha256:rightSha,gold_or_sample_sha256:sampleSha,parser_version:IXBRL_PARSER_VERSION});
     const base={accn,origin:loc.origin,unit:loc.unit,tolerance_rule:'exact/1',inputs_hash,
      left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:null,precision_note:'not_retained'}:null};
     const backToItem=bound!==undefined&&left!==null;
     const nc=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>notCompared(nk,'numeric',outcome,SIDES,{...base,...detail},{inputs_hash,...(left?{left_fact_id:left.fact_id}:{}),...(backToItem?{action:'quarantine_left' as const,item:mismatchItem(PAIR,nk,left!,null,{document:entry.doc_url,accn},inputs_hash)}:{})});
     if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha,...(right.size?right.size:{})}});continue;}
     const rightBase={document:entry.doc_url,sha256:rightSha,path:right.path,...(right.shaMismatch?{doc_sha_mismatch:true}:{})};
     if(rows.length===0){results[i]=nc('left_missing',{right:rightBase});continue;}
     if(rows.length>1){results[i]=nc('left_ambiguous',{fact_ids:rows.map(r=>r.fact_id),right:rightBase});continue;}
     const l=left!;
     const def=conceptById(loc.concept);
     const tags=[l.source_concept,...(def?tagsOf(def):[]).filter(t=>t!==l.source_concept)];
     let hit:{values:string[];facts:IxFact[]}|undefined;let tag:string|undefined;
     for(const t of tags){const h=right.index.get(ixFactKey({name:t,entity:'filer',periodStart:loc.period_start,periodEnd:loc.period_end,unit:loc.unit}));if(h){hit=h;tag=t;break;}}
     if(!hit||tag===undefined){
      const u=right.doc.unsupported.find(x=>x.name!==undefined&&tags.includes(x.name)&&x.periodEnd===loc.period_end&&(x.periodStart??null)===loc.period_start);
      results[i]=u?nc('unsupported',{reason:u.reason,right:{...rightBase,locator:{name:u.name,contextRef:u.contextRef}}}):nc('right_missing',{right:rightBase});
      continue;
     }
     const first=hit.facts[0];
     const locator={name:tag,contextRef:first.contextRef,unitRef:first.unitRef};
     if(hit.values.length>1){results[i]=nc('right_ambiguous',{right:{...rightBase,locator,values:hit.values}});continue;}
     const rv=hit.values[0];
     const passed=compareDecimal(l.value,rv)===0;
     // a mismatch found through the plan-2 tag FALLBACK is a human check, never a quarantine; only exact-tag mismatches quarantine ok rows
     const viaFallback=tag!==l.source_concept;
     const action=actionFor({bound:bound!==undefined,leftStatus:l.status,compared:true,passed,onFail:viaFallback?'review_item':'quarantine_left'});
     results[i]=comparedNumeric(nk,l.value,rv,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:l.fact_id,action,
      detail:{...base,right:{...rightBase,locator,precision:{decimals:first.decimals,scale:first.scale}},scale:first.scale,...(tag!==l.source_concept?{tag_mismatch:true}:{})},
      ...(action==='record'?{}:{item:withTagNote(mismatchItem(PAIR,nk,l,rv,{...locator,document:entry.doc_url},inputs_hash),viaFallback)})});
    }
   }
   return results;
  },
 };
}

exec
/bin/zsh -lc "rg -n 'reconcileScope|sinceYear' src/lib/facts/{pg-facts-db.ts,sync.ts}; cat scripts/ci/* | grep -n -E 'parallel|criticalSuites|vitest|sequence'; cat src/lib/facts/sync-us.integration.test.ts | head -120; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -iname '*agents*'; cat package.json | grep -E 'test|typecheck'; cat src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.exceptions.json | head -25" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/facts/pg-facts-db.ts:64:  reconcileScope:(market,input,snapshotAt)=>fn<number>('public.reconcile_fact_sync_scope($1,$2::jsonb,$3::timestamptz)',[market,JSON.stringify(input),snapshotAt??null]),
src/lib/facts/sync.ts:26:import {reconcileScope,scopeRowFor} from './scope';
src/lib/facts/sync.ts:36: fetchCn:(tsCode:string,sinceYear:number,b:Budget)=>Promise<RawSnapshot[]>;
src/lib/facts/sync.ts:38: parseUs:(snapshot:RawSnapshot,opts:{sinceYear:number})=>ParseResult;
src/lib/facts/sync.ts:39: parseCn:(snapshots:RawSnapshot[],opts:{sinceYear:number})=>ParseResult;
src/lib/facts/sync.ts:49: * issuerIds given (scripts, replay tests): those issuers run directly — no reconcileScope first,
src/lib/facts/sync.ts:51: * tables (scopeRowFor): seeded through reconcileScope with reasons ['explicit'] when applying,
src/lib/facts/sync.ts:56:export interface SyncOptions{market:Market;limit:number;issuerIds?:string[];dryRun:boolean;triggeredBy:TriggeredBy;sinceYear?:number;mappingGen?:number}
src/lib/facts/sync.ts:153:async function fetchAndParse(deps:SyncDeps,market:Market,issuer:string,fetchKey:string,sinceYear:number,budget:Budget,store:boolean):Promise<Fetched>{
src/lib/facts/sync.ts:154: const snapshots:RawSnapshot[]=market==='US'?[await deps.fetchUs(fetchKey,budget)]:await deps.fetchCn(fetchKey,sinceYear,budget);
src/lib/facts/sync.ts:160: try{parsed=market==='US'?deps.parseUs(snapshots[0],{sinceYear}):deps.parseCn(snapshots,{sinceYear});}
src/lib/facts/sync.ts:168:export async function syncIssuerFacts(deps:SyncDeps,batchId:string,input:{scope:ScopeRow;market:Market;sinceYear:number;mappingGen?:number;budget:Budget}):Promise<IssuerOutcome>{
src/lib/facts/sync.ts:169: const {db,tables}=deps;const {scope,market,sinceYear,budget}=input;const issuer=scope.issuer_id;const gen=input.mappingGen??MAPPING_GEN;const dataset=datasetOf(market);
src/lib/facts/sync.ts:213:  const {parsed,sha256s}=await fetchAndParse(deps,market,issuer,scope.fetch_key,sinceYear,budget,true);
src/lib/facts/sync.ts:359: * reconcileScope when applying (reasons ['explicit'], priority SCOPE_PRIORITY; the next cron
src/lib/facts/sync.ts:379:  await deps.db.reconcileScope(opts.market,seed);
src/lib/facts/sync.ts:386:async function dryRun(deps:SyncDeps,opts:SyncOptions,sinceYear:number,gen:number,budget:Budget):Promise<SyncReceipt> {
src/lib/facts/sync.ts:395:   const {parsed,sha256s}=await fetchAndParse(deps,opts.market,scope.issuer_id,scope.fetch_key,sinceYear,budget,false);
src/lib/facts/sync.ts:412: const sinceYear=opts.sinceYear??deps.now().getUTCFullYear()-10;const gen=opts.mappingGen??MAPPING_GEN;
src/lib/facts/sync.ts:414: if(opts.dryRun)return dryRun(deps,opts,sinceYear,gen,budget);
src/lib/facts/sync.ts:423:  if(opts.issuerIds===undefined)await reconcileScope({db:deps.db,tables:deps.tables},market);
src/lib/facts/sync.ts:433:   const r=await syncIssuerFacts(deps,batchId,{scope,market,sinceYear,mappingGen:gen,budget});
485:export const criticalSuites = [
522:  for (const file of criticalSuites) {
528:  return { criticalSuites: criticalSuites.length, criticalPassed: passed, criticalSkipped: 0 };
536:  if (JSON.stringify(discovered) !== JSON.stringify([...criticalSuites].sort())) throw new Error('Database suite inventory drift');
561:    const report = join(output, 'vitest.json');
563:      const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`], {
// src/lib/facts/sync-us.integration.test.ts
// Plan 2 §11.3 offline replay on real PostgreSQL: AAPL + MSFT trimmed companyfacts fixtures injected as
// fetchUs, pgFactsDb + pgTableClient, memory snapshot store. Two runs (second = all duplicates), a later
// 10-K revision fixture (versioned=1, asOf replay on both sides; the revised fixture then STAYS active so
// later generations cover it, round-1 #15), mapping-gen bump (old generation invisible but fetchable by id;
// the active generation is carried forward to every later run), two concurrent runs on one issuer (lease),
// stale replaceMetrics rejected, materialize twice identical (§11.3), and the US gold gate
// (fixtures/gold/plan2.json, round-1 #19). Two cases beyond the plan close review carry-overs:
//  - R7-1 materialize half: a published same_day_conflict is resolved through resolveFactsQuarantine and the
//    derived metrics then carry the chosen fact (and never the unchosen one) in their inputs;
//  - a real stale_computation interleaving: state_rev moves between materialize's readFacts and
//    replaceMetrics, materialize retries once and the stored metrics are based on the current state_rev.
// The cases run in order and SHARE STATE by design (fixtures swapped to the revised one, activeGen bumped, ZZ issuer evolving); do not
// run or reorder them in isolation.
// Gold gate deviation from the plan: while the gold file says ready:false the gate WARNS and does not fail
// (the owner has not transcribed yet); recorded entries are still replayed, and ready:true enforces it all.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgFactsDb} from './pg-facts-db';
import {memorySnapshotStore} from './snapshot-store';
import {runFactsSync} from './sync';
import type {SyncDeps,SyncOptions} from './sync';
import {MAPPING_GEN,conceptById} from './concepts';
import {FORMULA_VERSION,materialize} from './derive';
import {ProviderError,snapshotOf} from './providers/shared';
import {companyFactsUrl,parseCompanyFacts} from './providers/edgar-companyfacts';
import type {FactRow,FactsDb,RawSnapshot} from './types';

const enabled=!!process.env.S4_TEST_STATE;
// Deterministic issuer ids so any other suite loading the same fixture shares the issuer (filings.source_ref is global).
// Every gold-asserted US issuer must appear here with a recorded fixture (gold `ready` gate).
// THE fixture issuer list. Adding a gold issuer = record its fixture (record-fixture.ts --edgar <cik>) and add
// one entry here: stocks_universe / issuers / issuer_securities provisioning, the scope rows, the fixture map
// and every replay run all derive from this list, so nothing else needs touching (round-2 #19, round-3 N3).
const FIXTURE_ISSUERS:readonly {ticker:string;cik:string;name:string}[]=[
 {ticker:'AAPL',cik:'320193',name:'Apple Inc.'},
 {ticker:'MSFT',cik:'789019',name:'Microsoft Corp.'},
];
const CIK:Record<string,string>=Object.fromEntries(FIXTURE_ISSUERS.map(i=>[i.ticker,i.cik]));
const FIX:Record<string,string>=Object.fromEntries(FIXTURE_ISSUERS.map(i=>[i.cik.padStart(10,'0'),`CIK${i.cik.padStart(10,'0')}.trimmed.json`]));
const REVISED='CIK0000320193.revised.json';
const fx=(n:string)=>new Uint8Array(readFileSync(new URL(`./fixtures/edgar/${n}`,import.meta.url)));
const today=()=>new Date().toISOString().slice(0,10);
interface GoldEntry{issuer:{ticker:string;market:'US'|'CN'};concept:string;period_end:string;unit:string;duration?:string;value:string;as_of?:string|null;source?:{document?:string;page_or_row?:string;url?:string};recorded_by:string;recorded_at?:string|null}
interface GoldFile{ready:boolean;required:{US:boolean;CN:boolean};entries:GoldEntry[]}
const isPending=(e:GoldEntry)=>e.recorded_by==='<pending>'||e.value==='<pending>';
const blank=(v:unknown)=>typeof v!=='string'||v.trim()===''||v.trim()==='<pending>';
/** Provenance a human must have written down: document, page/row, url and a recording timestamp. Returns the missing fields. */
const provenanceGaps=(e:GoldEntry):string[]=>[...(['document','page_or_row','url'] as const).filter(k=>blank(e.source?.[k])).map(k=>`source.${k}`),...(e.recorded_at==null||blank(e.recorded_at)?['recorded_at']:[])];
/** No CN replay suite exists yet (sync-cn.integration.test.ts is created only with real Tushare fixtures), so CN entries cannot be replay-verified here. */
const CN_REPLAY_SUITE=false;

// Synthetic issuer for the quarantine/materialize cases (not a gold issuer): FY2023 revenue disclosed twice on the
// same day by two accessions with different values (a same_day_conflict), plus one net income in the first accession.
const ZZ={ticker:'ZZCF',cik:'9990001',name:'ZZ Conflict Co'};
const ZZ_CIK10=ZZ.cik.padStart(10,'0');
const ZZ_ACCN_A='0009990001-24-000001',ZZ_ACCN_B='0009990001-24-000002';
const ZZ_ACCN_C='0009990001-24-000003';
let zzRevised=false;   // flips on when the competing writer of the stale_computation case publishes a later, changed FY2023 revenue
const zzDoc=()=>{
 const e=(accn:string,val:number,form:string,filed='2024-02-15')=>({start:'2023-01-01',end:'2023-12-31',val,accn,fy:2023,fp:'FY',form,filed});
 return new TextEncoder().encode(JSON.stringify({cik:Number(ZZ.cik),entityName:ZZ.name,facts:{'us-gaap':{
  Revenues:{units:{USD:[e(ZZ_ACCN_A,1000,'10-K'),e(ZZ_ACCN_B,1001,'10-K/A'),...(zzRevised?[e(ZZ_ACCN_C,1002,'10-K/A','2024-03-01')]:[])]}},
  NetIncomeLoss:{units:{USD:[e(ZZ_ACCN_A,100,'10-K')]}},
 }}}));
};

describe.skipIf(!enabled)('F2-3 US offline replay on real PostgreSQL',()=>{
 let admin:Pool;let db:FactsDb;let deps:SyncDeps;
 const issuers:Record<string,string>={};
 let zz='';
 const fixtures={...FIX};
 let activeGen=MAPPING_GEN;   // bumped by the mapping-gen test; every later run must use it (a lower gen is mapping_gen_regression)
 // mappingGen is a SyncOptions field (Part B), not a SyncDeps field.
 const run=(ids:string[],extra:Partial<SyncOptions>={})=>runFactsSync(deps,{market:'US',limit:10,issuerIds:ids,dryRun:false,triggeredBy:'script',mappingGen:activeGen,...extra});
 const revenueFy23=(asOf:string,history=true)=>db.readFacts(issuers.AAPL,'US',{concepts:['revenue'],asOf,from:'2023-09-30',to:'2023-09-30',history}).then(r=>r.rows.filter(x=>x.duration==='12M'));
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  // Provision every fixture issuer from the one list, in FK order: stocks_universe (issuer_securities.ticker
  // references it; ON CONFLICT DO NOTHING does not cover a missing parent) → issuers → issuer_securities.
  const provision=async(ticker:string,cik:string,name:string)=>{
   await admin.query(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[ticker,name]);
   await admin.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),name,cik]);
   const id=(await admin.query(`select issuer_id from public.issuers where cik=$1`,[cik])).rows[0].issuer_id as string;
   await admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[id,ticker]);
   return id;
  };
  for(const {ticker,cik,name} of FIXTURE_ISSUERS){
   expect(FIX[cik.padStart(10,'0')],`${ticker}: fixture file name`).toBeDefined();
   issuers[ticker]=await provision(ticker,cik,name);
  }
  zz=await provision(ZZ.ticker,ZZ.cik,ZZ.name);
  db=pgFactsDb(admin);
  await db.reconcileScope('US',[...FIXTURE_ISSUERS.map(i=>({issuer_id:issuers[i.ticker],reasons:['test'],priority:10,fetch_key:i.cik.padStart(10,'0')})),{issuer_id:zz,reasons:['test'],priority:10,fetch_key:ZZ_CIK10}]);
  deps={db,tables:pgTableClient(admin),storage:memorySnapshotStore(),
   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{
    if(cik10===ZZ_CIK10)return snapshotOf(zzDoc(),{source:'edgar',url:companyFactsUrl(cik10)});
    const n=fixtures[cik10];if(!n)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(fx(n),{source:'edgar',url:companyFactsUrl(cik10)});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
   now:()=>new Date(),deadline:null,codeVersion:'test'};
 });
 // Facts and filings are append-only and test:db builds a fresh database per run, so rows are not deleted;
 // the cleanup that does apply covers every fixture issuer: retire their scope rows (priority 0) so no
 // scheduled-path test of another suite picks them up.
 afterAll(async()=>{
  if(db&&Object.keys(issuers).length>0)await db.reconcileScope('US',[...FIXTURE_ISSUERS.filter(i=>issuers[i.ticker]).map(i=>({issuer_id:issuers[i.ticker],reasons:[],priority:0,fetch_key:i.cik.padStart(10,'0')})),...(zz?[{issuer_id:zz,reasons:[],priority:0,fetch_key:ZZ_CIK10}]:[])]).catch(()=>{});
  await admin?.end();
 });

 it('first run publishes every fixture issuer; AAPL revenue asOf 2024-06-30 is the 2023-11-03 10-K row, not a later comparative',async()=>{
  const r1=await run(Object.values(issuers));                                           // every fixture-backed issuer, so every gold issuer has facts
  expect(r1.status).toBe('success');expect(r1.detail).toMatchObject({published:Object.keys(CIK).length,failed:0});
  expect(r1.counts.inserted+r1.counts.duplicates).toBeGreaterThan(100);
  const rows=await revenueFy23('2024-06-30',false);
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/agents
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "test:db": "tsx scripts/ci/research-db.ts",
    "test:migrations": "tsx scripts/ci/migration-rehearsal.ts",
    "test:runtime-privileges": "tsx scripts/s4/runtime-privileges-smoke.ts",
    "test:runtime-tls": "tsx scripts/s4/runtime-tls-smoke.ts",
    "test:revocation-consumer": "tsx scripts/revocation/consumer-smoke.ts",
    "test:revocation-registration": "tsx scripts/revocation/registration-smoke.ts",
    "test:revocation-retention": "tsx scripts/revocation/retention-smoke.ts",
    "test:revocation-list": "tsx scripts/revocation/list-smoke.ts"
    "@playwright/test": "^1.61.1",
    "vitest": "^4.1.10"
[]

exec
/bin/zsh -lc 'node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false 2>&1 | head -65' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
exec
/bin/zsh -lc "cat scripts/ci/research-db.ts; rg -n 'us.companyfacts_vs_ixbrl|facts.lineage_same_day' src/lib/dq/dq-extensions.integration.test.ts; rg -n 'reconcile_fact_sync_scope' supabase/migrations/* | tail -10; cat src/lib/dq/reconcile/us-sample.ts | head -130" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/** One bounded full test run, with a fresh loopback database and a fail-closed report gate. */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startLocalDatabase, stopLocalDatabase } from '../s4/local-db';
import { migrationInventory, verifyDatabaseReport, verifyCriticalSuiteInventory } from './research-checks';

async function main() {
  const manifest = migrationInventory();
  verifyCriticalSuiteInventory();
  mkdirSync('reports', { recursive: true });
  rmSync('reports/research-db-summary.json', { force: true });
  let summary: Record<string, unknown> | undefined;
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const output = mkdtempSync(join(tmpdir(), 'alpha-db-report-'));
  let primaryError: unknown;
  let database: Awaited<ReturnType<typeof startLocalDatabase>> | undefined;
  try {
    database = await startLocalDatabase();
    abort.signal.throwIfAborted();
    const report = join(output, 'vitest.json');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`], {
        stdio: 'inherit', signal: abort.signal, env: { ...process.env, S4_TEST_STATE: database!.stateFile },
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Vitest exit ${code}`)));
    });
    const results = JSON.parse(readFileSync(report, 'utf8'));
    summary = { ...verifyDatabaseReport(results), totalPassed: results.numPassedTests, migrations: manifest, testedAt: new Date().toISOString(), postgresVersion: database.postgresVersion, scope: 'isolated PostgreSQL; not Supabase production equivalence' };
  } catch (e) { primaryError = e; throw e; } finally {
    try { if (database) stopLocalDatabase(database, primaryError); }
    finally {
      rmSync(output, { recursive: true, force: true });
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    }
  }
  writeFileSync('reports/research-db-summary.json', JSON.stringify({ ...summary, cleanup: 'stopped' }, null, 2));
  console.log(JSON.stringify({ ...summary, migrations: manifest.length, cleanup: 'stopped' }));
}
main().catch(e => { console.error((e as Error).message); process.exitCode = 1; });
313:  it('set_merge registers the target as a pending member of the latest facts.lineage_same_day cycle',async()=>{
316:    await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values('facts.lineage_same_day',$1,now()+interval '100 years',now()+interval '100 years','[]','complete',0)`,[`facts.lineage_same_day-test-${randomUUID().slice(0,8)}`]);
318:    const [latest]=(await c.query(`select detail from public.dq_reconcile_cycles where pair='facts.lineage_same_day' order by (status='running') desc, started_at desc limit 1`)).rows;
326:    await c.query("select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'))");   // same key set_merge takes, before the deletes
327:    await c.query(`delete from public.dq_reconcile_cursor where pair='facts.lineage_same_day'`);
328:    await c.query(`delete from public.dq_reconcile_cycles where pair='facts.lineage_same_day'`);
330:    expect((await c.query(`select count(*)::int n from public.dq_reconcile_cycles where pair='facts.lineage_same_day'`)).rows[0].n).toBe(0);
918:  const LINEAGE='facts.lineage_same_day';
supabase/migrations/20261106090000_financial_facts.sql:14:-- call reconcile_fact_sync_scope (schedule inputs, no lease).
supabase/migrations/20261106090000_financial_facts.sql:139:  scope_confirmed_at timestamptz not null default now(),   -- last time reconcile_fact_sync_scope saw the row active in its sources or changed it (retirement guard)
supabase/migrations/20261106090000_financial_facts.sql:318:drop function if exists public.reconcile_fact_sync_scope(text, jsonb);
supabase/migrations/20261106090000_financial_facts.sql:323:create or replace function public.reconcile_fact_sync_scope(p_market text, p_rows jsonb, p_snapshot_at timestamptz default null)
supabase/migrations/20261106090000_financial_facts.sql:344:revoke execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) from public, anon, authenticated;
supabase/migrations/20261106090000_financial_facts.sql:345:grant execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) to service_role;
// src/lib/dq/reconcile/us-sample.ts
// US iXBRL sample manifest (spec §5.3; schema 'us-ixbrl-sample/1'). The manifest freezes members and expected
// keys of us.companyfacts_vs_ixbrl. Expected keys are the UNION of two independent sources: (a) plan 2's
// companyfacts adapter on the accession's raw snapshot (candidates, ambiguous and odd-duration entries of that
// accession), (b) the iXBRL parser on the primary document (filer entity only, tag in FACT_CONCEPTS, unit kind
// and period nature matching the concept, period end >= sinceYear-01-01, highest-priority tag per key). A key
// from one source only is still expected — at run time it becomes left_missing or right_missing and exposes
// the adapter's or parser's gap instead of shrinking the denominator. Each side needs >= 4 keys. pickSample is
// the §5.3 selection: required (plan-2 gold) tickers, the rest at equal steps in ticker order up to n, then
// quota swaps (>= 3 NYSE, >= 3 Nasdaq, >= 2 fiscal year end not 12-31, >= 2 not large accelerated); a quota
// that cannot be met is reported, never faked.
import {FACT_CONCEPTS,conceptById} from '../../facts/concepts';
import {parseCompanyFacts,tagsOf} from '../../facts/providers/edgar-companyfacts';
import type {ConceptDef,FactCandidate,ParseResult,RawSnapshot} from '../../facts/types';
import {unitKindOf} from '../../facts/units';
import {parseInlineXbrl} from './ixbrl';
import type {IxbrlDocument} from './ixbrl';
import {sha256Hex} from './pair-support';

export const US_SAMPLE_SCHEMA='us-ixbrl-sample/1';
export const US_SAMPLE_PATH='src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json';
export const MIN_KEYS_PER_SIDE=4;
export type KeyOrigin='left'|'right'|'both';
export interface SampleKey{concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:KeyOrigin}
export interface RawRef{path:string;sha256:string}
/** Live samples: where the exact bytes the keys were derived from were retained (RawStore paths). */
export interface SampleProvenance{companyfacts:RawRef;submissions:RawRef;document:RawRef}
export interface SampleFiling{provenance?:SampleProvenance;accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;raw_sha256:string;doc_sha256:string;expected_keys:SampleKey[]}
export interface SampleIssuer{cik:string;ticker:string;regime:'10-K'|'20-F';filings:SampleFiling[]}
export interface UsSample{schema:typeof US_SAMPLE_SCHEMA;generated_at:string;selection:string;issuers:SampleIssuer[]}
type KeyCore=Omit<SampleKey,'origin'>;

export const usNaturalKey=(cik:string,accn:string,k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${cik}:${accn}:${k.concept}:${k.period_start??''}:${k.period_end}:${k.unit}`;
const kk=(k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${k.concept}|${k.period_start??''}|${k.period_end}|${k.unit}`;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const TAG_CONCEPT=(()=>{const m=new Map<string,ConceptDef>();for(const c of FACT_CONCEPTS)for(const t of tagsOf(c))if(!m.has(t))m.set(t,c);return m;})();

/** The context entity is the SEC CIK of the filer (identifier compared without leading zeros). */
export const entityIs=(entity:string,cik:string):boolean=>entity.startsWith('http://www.sec.gov/CIK#')&&entity.slice(entity.indexOf('#')+1).replace(/^0+/,'')===cik.replace(/^0+/,'');

export function companyfactsKeys(parse:ParseResult,accn:string):Map<string,KeyCore>{
 const out=new Map<string,KeyCore>();
 const add=(c:FactCandidate)=>{if(c.filingRef!==accn)return;const k={concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,unit:c.unit,source_concept:c.sourceConcept};if(!out.has(kk(k)))out.set(kk(k),k);};
 parse.candidates.forEach(add);parse.ambiguous.forEach(a=>a.candidates.forEach(add));parse.oddDuration.forEach(add);
 return out;
}
export function ixbrlKeys(doc:IxbrlDocument,cik:string,sinceDate:string):Map<string,KeyCore>{
 const out=new Map<string,KeyCore>();
 for(const f of doc.facts){
  if(!entityIs(f.entity,cik))continue;
  const c=TAG_CONCEPT.get(f.name);
  if(!c||unitKindOf(f.unit)!==c.unitKind||(c.nature==='duration')!==(f.periodStart!==null)||f.periodEnd<sinceDate)continue;
  const k={concept:c.id,period_start:f.periodStart,period_end:f.periodEnd,unit:f.unit,source_concept:f.name};
  const prev=out.get(kk(k));
  if(!prev||tagsOf(c).indexOf(f.name)<tagsOf(c).indexOf(prev.source_concept))out.set(kk(k),k);
 }
 return out;
}

export interface BuildFilingInput{cik:string;accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;companyfacts:RawSnapshot;doc:Uint8Array;doc_sha256?:string;sinceYear:number}
export function buildSampleFiling(i:BuildFilingInput):SampleFiling{
 const left=companyfactsKeys(parseCompanyFacts(i.companyfacts,{sinceYear:i.sinceYear}),i.accn);
 const right=ixbrlKeys(parseInlineXbrl(new TextDecoder('utf-8').decode(i.doc)),i.cik,`${i.sinceYear}-01-01`);
 const keys:SampleKey[]=[];
 for(const [k,v] of left)keys.push({...v,origin:right.has(k)?'both':'left'});
 for(const [k,v] of right)if(!left.has(k))keys.push({...v,origin:'right'});
 keys.sort((a,b)=>cmp(kk(a),kk(b)));
 const nLeft=keys.filter(k=>k.origin!=='right').length,nRight=keys.filter(k=>k.origin!=='left').length;
 if(nLeft<MIN_KEYS_PER_SIDE||nRight<MIN_KEYS_PER_SIDE)throw new Error(`sample_side_too_small:${i.accn}:left=${nLeft}:right=${nRight}`);
 return {accn:i.accn,form:i.form,period_end:i.period_end,primary_document:i.primary_document,doc_url:i.doc_url,is_inline_xbrl:i.is_inline_xbrl,submissions_category:i.submissions_category,raw_sha256:i.companyfacts.sha256,doc_sha256:i.doc_sha256??sha256Hex(i.doc),expected_keys:keys};
}

const DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,ACCN=/^\d{10}-\d{2}-\d{6}$/;
export function validateUsSample(json:unknown):{ok:true;sample:UsSample}|{ok:false;errors:string[]}{
 const errors:string[]=[];const e=(m:string)=>{errors.push(m);};
 const s=json as Partial<UsSample>|null;
 if(!s||typeof s!=='object')return {ok:false,errors:['not_an_object']};
 if(s.schema!==US_SAMPLE_SCHEMA)e('schema');
 if(typeof s.generated_at!=='string'||Number.isNaN(Date.parse(s.generated_at)))e('generated_at');
 if(typeof s.selection!=='string'||s.selection==='')e('selection');
 if(!Array.isArray(s.issuers)||s.issuers.length===0)return {ok:false,errors:[...errors,'issuers']};
 const nks=new Set<string>();
 s.issuers.forEach((iss,ii)=>{
  const at=`issuers[${ii}]`;
  if(typeof iss?.cik!=='string'||!/^[1-9]\d{0,9}$/.test(iss.cik))e(`${at}.cik`);
  if(typeof iss?.ticker!=='string'||iss.ticker==='')e(`${at}.ticker`);
  if(iss?.regime!=='10-K'&&iss?.regime!=='20-F')e(`${at}.regime`);
  if(!Array.isArray(iss?.filings)||iss.filings.length===0){e(`${at}.filings`);return;}
  iss.filings.forEach((f,fi)=>{
   const fa=`${at}.filings[${fi}]`;
   if(typeof f?.accn!=='string'||!ACCN.test(f.accn))e(`${fa}.accn`);
   if(typeof f?.form!=='string'||f.form==='')e(`${fa}.form`);
   if(f?.period_end!==null&&!(typeof f?.period_end==='string'&&DATE.test(f.period_end)))e(`${fa}.period_end`);
   if(typeof f?.primary_document!=='string'||f.primary_document==='')e(`${fa}.primary_document`);
   if(typeof f?.doc_url!=='string'||!f.doc_url.startsWith(`https://www.sec.gov/Archives/edgar/data/${iss.cik}/`)||/[?#@]/.test(f.doc_url))e(`${fa}.doc_url`);
   if(f?.is_inline_xbrl!==null&&typeof f?.is_inline_xbrl!=='boolean')e(`${fa}.is_inline_xbrl`);
   if(f?.submissions_category!==null&&typeof f?.submissions_category!=='string')e(`${fa}.submissions_category`);
   if(typeof f?.raw_sha256!=='string'||!SHA.test(f.raw_sha256))e(`${fa}.raw_sha256`);
   if(typeof f?.doc_sha256!=='string'||!SHA.test(f.doc_sha256))e(`${fa}.doc_sha256`);
   if(f?.provenance!==undefined){
    const pv=f.provenance as Partial<SampleProvenance>|null;
    const ref=(r:unknown,kind:string,sha:unknown)=>{const x=r as Partial<RawRef>|null;return !!x&&typeof x.path==='string'&&typeof x.sha256==='string'&&SHA.test(x.sha256)&&x.path.startsWith(`${kind}/${x.sha256}.`)&&x.sha256===sha;};
    if(!pv||typeof pv!=='object')e(`${fa}.provenance`);
    else{
     if(!ref(pv.companyfacts,'sec-companyfacts',f.raw_sha256))e(`${fa}.provenance.companyfacts`);
     if(!ref(pv.document,'sec-document',f.doc_sha256))e(`${fa}.provenance.document`);
     if(!ref(pv.submissions,'sec-submissions',(pv.submissions as Partial<RawRef>|undefined)?.sha256))e(`${fa}.provenance.submissions`);
    }
   }
   if(!Array.isArray(f?.expected_keys)){e(`${fa}.expected_keys`);return;}
   let nl=0,nr=0;
   f.expected_keys.forEach((k,ki)=>{
    const ka=`${fa}.expected_keys[${ki}]`;
    const def=typeof k?.concept==='string'?conceptById(k.concept):undefined;
    if(!def)e(`${ka}.concept`);
    if(k?.period_start!==null&&!(typeof k?.period_start==='string'&&DATE.test(k.period_start)))e(`${ka}.period_start`);
    if(typeof k?.period_end!=='string'||!DATE.test(k.period_end))e(`${ka}.period_end`);
    if(typeof k?.unit!=='string'||k.unit==='')e(`${ka}.unit`);
    if(typeof k?.source_concept!=='string'||k.source_concept==='')e(`${ka}.source_concept`);
    if(k?.origin!=='left'&&k?.origin!=='right'&&k?.origin!=='both')e(`${ka}.origin`);
    if(k?.origin!=='right')nl++;if(k?.origin!=='left')nr++;
    const nk=usNaturalKey(String(iss.cik),String(f.accn),k);
    if(nks.has(nk))e(`${ka}: duplicate ${nk}`);nks.add(nk);
   });
   if(nl<MIN_KEYS_PER_SIDE||nr<MIN_KEYS_PER_SIDE)e(`${fa}: fewer than ${MIN_KEYS_PER_SIDE} keys per side (left=${nl}, right=${nr})`);
  });
 });
 return errors.length>0?{ok:false,errors}:{ok:true,sample:s as UsSample};
}


exec
/bin/zsh -lc "sed -n '285,345p' src/lib/dq/dq-extensions.integration.test.ts; sed -n '900,1040p' src/lib/dq/dq-extensions.integration.test.ts; sed -n '1,70p' src/lib/dq/dq-extensions.integration.test.ts; rg -n 'pending|issuerIds|cycle' src/lib/dq/reconcile/run.ts | head -60; sed -n '323,345p' supabase/migrations/20261106090000_financial_facts.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
    await expect(c.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[d])).rejects.toMatchObject({code:'23514',message:expect.stringContaining('topology_write_forbidden')});
    await c.query('rollback to savepoint s1');
    await c.query('savepoint s2');
    await expect(c.query(`select public.set_merge($1,$2,$3)`,[a,b,by])).rejects.toMatchObject({message:'source_not_active'});   // error path
    await c.query('rollback to savepoint s2');
    expect(['',null]).toContain((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v);
    await expect(c.query(`update public.issuers set merged_into=null,status='active' where issuer_id=$1`,[a])).rejects.toMatchObject({code:'23514'});
    await c.query('rollback');
   }finally{c.release();}
   expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[a])).toEqual([{status:'active',merged_into:null}]);   // rolled back
  });

  it('set_merge (R3): A→B then B→C re-points A to C before retiring B; every affected scope (both markets, placeholders created) bumps; audit rows; plan-1 trigger errors pass through',async()=>{
   const a=await issuer(),b=await issuer(),c=await issuer(),by=await user();
   expect(await merge(a,b,by)).toEqual({repointed:0});
   expect(await q(`select market,priority,reasons,fetch_key,state_rev from public.fact_sync_scope where issuer_id=$1 order by market`,[a])).toEqual([{market:'CN',priority:0,reasons:[],fetch_key:'topology',state_rev:'1'},{market:'US',priority:0,reasons:[],fetch_key:'topology',state_rev:'1'}]);
   expect(await merge(b,c,by)).toEqual({repointed:1});
   expect(await q(`select issuer_id,status,merged_into from public.issuers where issuer_id=any($1::uuid[]) order by issuer_id`,[[a,b,c]])).toEqual([{issuer_id:a,status:'merged',merged_into:c},{issuer_id:b,status:'merged',merged_into:c},{issuer_id:c,status:'active',merged_into:null}].sort((x,y)=>x.issuer_id<y.issuer_id?-1:1));
   expect(await q(`select issuer_id,market,state_rev from public.fact_sync_scope where issuer_id=any($1::uuid[]) order by issuer_id,market`,[[a,b,c]])).toEqual([a,b,c].sort().flatMap(id=>['CN','US'].map(m=>({issuer_id:id,market:m,state_rev:id===c?'1':'2'}))));
   expect(await q(`select action,object_id,detail from public.research_audit_log where user_id=$1 order by created_at`,[by])).toEqual([{action:'entities.merge',object_id:a,detail:{source:a,target:b,repointed:0}},{action:'entities.merge',object_id:b,detail:{source:b,target:c,repointed:1}}]);
   expect(await fails(merge(b,c,by))).toMatchObject({message:'source_not_active'});
   const d=await issuer();
   expect(await fails(merge(d,b,by))).toMatchObject({code:'23514',message:expect.stringContaining('merge_target_not_active')});
   expect(await fails(merge(d,d,by))).toMatchObject({message:'invalid_merge',code:'22023'});
   expect(await fails(merge(d,randomUUID(),by))).toMatchObject({message:expect.stringContaining('merge_target_not_active')});
   expect(await q(`select status from public.issuers where issuer_id=$1`,[d])).toEqual([{status:'active'}]);
  });

  it('set_merge registers the target as a pending member of the latest facts.lineage_same_day cycle',async()=>{
   const s=await issuer(),t=await issuer(),by=await user();
   await inRolledBackTx(admin,async c=>{
    await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values('facts.lineage_same_day',$1,now()+interval '100 years',now()+interval '100 years','[]','complete',0)`,[`facts.lineage_same_day-test-${randomUUID().slice(0,8)}`]);
    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);
    const [latest]=(await c.query(`select detail from public.dq_reconcile_cycles where pair='facts.lineage_same_day' order by (status='running') desc, started_at desc limit 1`)).rows;
    expect(latest.detail.pending_members).toEqual(expect.arrayContaining([{issuer_id:t,market:'CN',source:s},{issuer_id:t,market:'US',source:s}]));   // one entry per merged source (plan audit Q2)
   });
  });

  it('set_merge with an empty dq_reconcile_cycles table commits and leaves no cycle row (registration falls back to the runner re-enumerating merged_into, decision #6)',async()=>{
   const s=await issuer(),t=await issuer(),by=await user();
   await inRolledBackTx(admin,async c=>{
    await c.query("select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'))");   // same key set_merge takes, before the deletes
    await c.query(`delete from public.dq_reconcile_cursor where pair='facts.lineage_same_day'`);
    await c.query(`delete from public.dq_reconcile_cycles where pair='facts.lineage_same_day'`);
    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[s,t,by])).rows[0].v).toEqual({repointed:0});
    expect((await c.query(`select count(*)::int n from public.dq_reconcile_cycles where pair='facts.lineage_same_day'`)).rows[0].n).toBe(0);
    expect((await c.query(`select status,merged_into from public.issuers where issuer_id=$1`,[s])).rows).toEqual([{status:'merged',merged_into:t}]);
   });
  });

  it('set_merge serialises with materialisation: a lineage write that waits behind it is refused as stale_computation',async()=>{
   const {iss:t}=await published();const {iss:s}=await sibling('100');const by=await user();
   await inTx(admin,async({c,pid,commit})=>{
    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);
    const p=one(`select public.replace_financial_metrics_lineage($1,'US',$2::jsonb,'[]'::jsonb) v`,[t,JSON.stringify([{issuer_id:t,state_rev:1}])]);p.catch(()=>{});
    await stillBlockedBehind(admin,pid,p);
    await commit();
    expect(await fails(p)).toMatchObject({message:'stale_computation'});
   });
  });

  it('open_reconcile_cycle freezes issuer_id as canonical uuid text (upper-case input works end to end); a non-uuid issuer_id and a natural key repeated across members are invalid_members',async()=>{
   const {iss}=await published();const pair=newPair();const cy=`${pair}-c`;
   const out=await openC(admin,pair,cy,[{issuer_id:iss.toUpperCase(),market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}],[]);
   expect(out.cycle.members).toEqual([{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   expect(await apply(fence,res('k1',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))).toMatchObject({reused:false});
   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:0,not_compared:0});
   const p2=newPair(),other=await issuer();
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:'not-a-uuid',market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:iss,market:'US',expected_keys:[]},{issuer_id:iss.toUpperCase(),market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'dup',locator:{}}]},{issuer_id:other,market:'US',expected_keys:['dup']}],[]))).toMatchObject({message:'invalid_members'});
   expect(await q(`select 1 from public.dq_reconcile_cycles where pair=$1`,[p2])).toEqual([]);
  });

  // ---- open_reconcile_cycle (section 13, plan audit Q2): atomic creation, per-entry consumption, the lock shared with set_merge
  type Opened={created:boolean;cycle:Record<string,any>;transferred:unknown[]};
  const openC=(c:Pool|PoolClient,pair:string,id:string,members:unknown[],pending:unknown[])=>
   c.query(`select public.open_reconcile_cycle($1,$2,now(),$3::jsonb,$4::jsonb) v`,[pair,id,JSON.stringify(members),JSON.stringify(pending)]).then(r=>r.rows[0].v as Opened);
  const LINEAGE='facts.lineage_same_day';
  const lid=()=>`${LINEAGE}-${randomUUID().slice(0,8)}`;
  /** inside a rolled-back transaction only: no running lineage cycle from another suite, plus a "latest" row set_merge writes to */
  const lineageStage=async(c:PoolClient,pending:unknown[])=>{
   await c.query(`update public.dq_reconcile_cycles set status='complete', finished_at=now() where pair=$1 and status='running'`,[LINEAGE]);
   const id=`${LINEAGE}-old-${randomUUID().slice(0,8)}`;
   await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now()+interval '100 years',now()+interval '100 years','[]','complete',0,$3::jsonb)`,[LINEAGE,id,JSON.stringify({pending_members:pending})]);
   return id;
  };
  const pendingIn=async(c:Pool|PoolClient,pair:string,id:string)=>(await c.query(`select detail from public.dq_reconcile_cycles where pair=$1 and cycle_id=$2`,[pair,id])).rows[0].detail as Record<string,unknown>;

  it('open_reconcile_cycle: cycle row and every cursor in one call; only the listed pending entries are consumed; a running cycle is returned unchanged',async()=>{
   const t1=await issuer(),t2=await issuer();
   const e1={issuer_id:t1,market:'US',source:randomUUID()},e2={issuer_id:t2,market:'US',source:randomUUID()};
   await inRolledBackTx(admin,async c=>{
    const old=await lineageStage(c,[e1,e2]);
    const id=lid();
    const out=await openC(c,LINEAGE,id,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k1',locator:{}},{naturalKey:'k2',locator:{}}]}],[e1]);
    expect(out).toMatchObject({created:true,transferred:[e1],cycle:{cycle_id:id,status:'running',expected_total:2,detail:{pending_merged_from:[old],pending_transferred:[e1]}}});
    expect((await c.query(`select issuer_id,market,expected,state from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[LINEAGE,id])).rows).toEqual([{issuer_id:t1,market:'US',expected:2,state:'pending'}]);
    expect(await pendingIn(c,LINEAGE,old)).toEqual({pending_members:[e2],pending_consumed_by:id});    // e2 was not listed: it waits for the next cycle
    const again=await openC(c,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[]}],[e2]);
    expect(again).toMatchObject({created:false,transferred:[],cycle:{cycle_id:id}});
    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([e2]);                        // nothing consumed by the loser
   });
  });

  it('open_reconcile_cycle: a merge registered after the runner snapshot survives creation — neither overwritten nor consumed (stale-snapshot interleaving)',async()=>{
   const s=await issuer(),t=await issuer(),t0=await issuer(),by=await user();
   const e0={issuer_id:t0,market:'US',source:randomUUID()};
   await inRolledBackTx(admin,async c=>{
    const old=await lineageStage(c,[e0]);
    const snapshot=[e0];                                                          // the runner read pending_members here
    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);                  // a merge lands before the function runs
    const out=await openC(c,LINEAGE,lid(),[{issuer_id:t0,market:'US',expected_keys:[]}],snapshot);
    expect(out.transferred).toEqual([e0]);
    expect((out.cycle.members as {issuer_id:string}[]).map(m=>m.issuer_id)).toEqual([t0]);
    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([{issuer_id:t,market:'CN',source:s},{issuer_id:t,market:'US',source:s}]);
   });
  });

  it('open_reconcile_cycle and set_merge serialise on the cycle lock, both ways',async()=>{
   const s1=await issuer(),t1=await issuer(),s2=await issuer(),t2=await issuer(),by=await user();
   let waiter:Promise<void>|undefined;
   await inTx(admin,async({c,pid})=>{
    await c.query(`select public.set_merge($1,$2,$3)`,[s1,t1,by]);                // holds the cycle lock until this transaction ends
    waiter=inRolledBackTx(admin,async c2=>{await openC(c2,LINEAGE,lid(),[],[]);},1);waiter.catch(()=>{});
    await stillBlockedBehind(admin,pid,waiter);
   });                                                                              // rolled back: the merge never happened, the waiter proceeds
   await expect(waiter).resolves.toBeUndefined();
   let merger:Promise<unknown>|undefined;
   await inTx(admin,async({c,pid})=>{
    await openC(c,LINEAGE,lid(),[],[]);                                             // takes the cycle lock (created or not)
    merger=one(`select public.set_merge($1,$2,$3) v`,[s2,t2,by]);merger.catch(()=>{});
    await stillBlockedBehind(admin,pid,merger);
   });                                                                              // rolled back: no cycle was created
   await expect(merger).resolves.toEqual({repointed:0});
  });

  it('lock order (plan audit R1): a creator whose cycle contains the merge target and a concurrent set_merge into that target both complete, in either order — no deadlock',async()=>{
   const s1=await issuer(),t1=await issuer(),s2=await issuer(),t2=await issuer(),by=await user();
   const lockSql=`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`;
   // (a) the creator already holds the cycle lock and has not inserted its cursors yet; the merge arrives now.
   //     Fixed order: the merge waits on the advisory lock holding NO scope/issuer row; the creator's cursor
   //     insert for t1 (KEY SHARE on issuers via the FK) does not wait; both finish. Old order: the merge held
   //     t1 FOR UPDATE while waiting → 40P01 on one side.
   let merger:Promise<unknown>|undefined;let opened:Opened|undefined;
   await inTx(admin,async({c,pid})=>{
    await lineageStage(c,[]);
    await c.query(lockSql,[LINEAGE]);                                              // what open_reconcile_cycle takes first
    merger=inRolledBackTx(admin,async c2=>{
     expect((await c2.query(`select public.set_merge($1,$2,$3) v`,[s1,t1,by])).rows[0].v).toEqual({repointed:0});
    },1);merger.catch(()=>{});
    await stillBlockedBehind(admin,pid,merger);
    expect(await q(`select distinct l.locktype from pg_locks l join pg_stat_activity a on a.pid=l.pid where not l.granted and $1 = any(pg_blocking_pids(a.pid))`,[pid])).toEqual([{locktype:'advisory'}]);   // the merge waits on the advisory lock, not on a row
    opened=await openC(c,LINEAGE,lid(),[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[]);   // re-entrant advisory lock; cursor insert on t1
   });                                                                              // rolled back
   expect(opened).toMatchObject({created:true});
   await expect(merger).resolves.toBeUndefined();
   // (b) the merge into t2 runs first and holds every lock; the creator for a cycle containing t2 waits, then finishes.
   let creator:Promise<void>|undefined;
   await inTx(admin,async({c,pid})=>{
    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[s2,t2,by])).rows[0].v).toEqual({repointed:0});
    creator=inRolledBackTx(admin,async c2=>{
     await lineageStage(c2,[]);
     expect(await openC(c2,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[])).toMatchObject({created:true});
    },1);creator.catch(()=>{});
    await stillBlockedBehind(admin,pid,creator);
   });                                                                              // rolled back: the creator proceeds
   await expect(creator).resolves.toBeUndefined();
  });

  it('open_reconcile_cycle: invalid members are refused; a creator that dies before commit leaves pending, cycle and cursors untouched, and the rerun consumes once (crash recovery)',async()=>{
   const t1=await issuer();const pair=newPair();
   const e1={issuer_id:t1,market:'US',source:randomUUID()};
   expect(await fails(openC(admin,pair,`${pair}-x`,[],[e1]))).toMatchObject({message:'invalid_members',code:'22023'});              // a pending entry without its resolved member
   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US',expected_keys:[]},{issuer_id:t1,market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US'}],[]))).toMatchObject({message:'invalid_members'});   // keys not resolved
   const old=`${pair}-old`;
   await q(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now(),now(),'[]','complete',0,$3::jsonb)`,[pair,old,JSON.stringify({pending_members:[e1]})]);
   await inRolledBackTx(admin,async c=>{await openC(c,pair,`${pair}-dead`,[{issuer_id:t1,market:'US',expected_keys:[]}],[e1]);});   // the creator dies before commit
   expect(await q(`select cycle_id from public.dq_reconcile_cycles where pair=$1`,[pair])).toEqual([{cycle_id:old}]);
   expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1`,[pair])).toEqual([{n:0}]);
   expect((await pendingIn(admin,pair,old)).pending_members).toEqual([e1]);
   expect(await openC(admin,pair,`${pair}-live`,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[e1])).toMatchObject({created:true,transferred:[e1]});
   expect((await pendingIn(admin,pair,old)).pending_members).toEqual([]);
   expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[pair,`${pair}-live`])).toEqual([{n:1}]);
  });

  // ---- Task 14b review: settle_reconcile_cycle / record_cycle_freshness
  const COUNTS={compared_passed:1,compared_failed:0,not_compared:0,exec_failed_members:0};
  const settleC=(pair:string,id:string,ok:boolean,status='complete')=>one(`select public.settle_reconcile_cycle($1,$2,$3,$4::jsonb,$5::jsonb) v`,[pair,id,status,JSON.stringify(COUNTS),JSON.stringify({status:'pending',ok,detail:{cycle_id:id}})]) as Promise<boolean>;
  const recordF=(pair:string,id:string,dataset:string,cadence:string,at:string)=>one(`select public.record_cycle_freshness($1,$2,$3,$4,$5::timestamptz) v`,[pair,id,dataset,cadence,at]) as Promise<string>;
  const freshRow=async(dataset:string)=>(await q(`select * from public.dq_freshness where dataset=$1`,[dataset]))[0];

  it('settle_reconcile_cycle: a pending_members entry committed while settlement waits on the cycle lock survives; only detail.freshness is added; a settled cycle answers false',async()=>{
   const pair=newPair(),i1=await issuer();const id=await cycle(pair,[{issuer_id:i1,expected:1}]);
   const entry={issuer_id:i1,market:'US',source:randomUUID()};
   let settling:Promise<boolean>|undefined;
   await inTx(admin,async({c,pid,commit})=>{
    await c.query(`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`,[pair]);   // what set_merge holds while it registers
    settling=settleC(pair,id,true);settling.catch(()=>{});
    await stillBlockedBehind(admin,pid,settling);
// src/lib/dq/dq-extensions.integration.test.ts
// F3-4 (plan 3 spec §3.2, §9.2): migration 20261107091000 on real PostgreSQL — filings acceptance
// columns and set_filing_acceptance, financial_metrics.based_on_lineage (upgrade + replay),
// read_filing_facts, read_facts_lineage (and read_facts as a wrapper with identical output),
// replace_financial_metrics_lineage (and its wrapper), set_merge / set_dissolved with the topology
// guard (S1, R3), fact_promote_rows predicates on every promotion entry (T6), adopt_candidate (T1,
// T5, U3), restore_reconciled (R1), resolve_lineage_conflict, the reconcile cursor and
// apply_reconcile_result (T2), grants. Every test owns its issuers (and its `test.<hex>` pair), so
// suites running in parallel on the shared database never meet.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgFactsDb} from '../facts/pg-facts-db';
import {FORMULA_VERSION,materialize} from '../facts/derive';
import {resolveFactsItem} from './facts-resolver';
import {computeFreshness} from './freshness';
import type {Cadence} from './freshness';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261107091000_facts_extensions.sql';
const PLAN2='supabase/migrations/20261106090000_financial_facts.sql';

// Same replay policy as facts.integration.test.ts (not exported there).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);return;}
  catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}
/** body inside one transaction that is ALWAYS rolled back; retried on lock timeout / deadlock (body must be repeatable). */
async function inRolledBackTx(pool:Pool,body:(c:PoolClient)=>Promise<void>,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s'`);await body(c);return;}
  catch(e){
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{await c.query('rollback').catch(()=>{});c.release();}
 }
}
interface Tx{c:PoolClient;pid:number;commit():Promise<void>}
async function inTx(pool:Pool,body:(tx:Tx)=>Promise<void>):Promise<void>{
 const c=await pool.connect();let open=false;let broken:Error|undefined;
 try{
  await c.query('begin');open=true;
  const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
  await body({c,pid,commit:async()=>{await c.query('commit');open=false;}});
 }finally{
  if(open)await c.query('rollback').catch(e=>{broken=e as Error;});
  c.release(broken);
 }
}
async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
 let settled=false;p.then(()=>{settled=true;},()=>{settled=true;});
 for(const deadline=Date.now()+3000;;){
  const n=Number((await pool.query(`select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid])).rows[0].n);
  if(n>=1)break;
  if(settled||Date.now()>deadline)throw new Error(`no backend blocked behind pid ${pid} (settled=${settled})`);
  await new Promise(r=>setTimeout(r,20));
2:// Reconciliation cycle runner (spec §5.5; §3.1 cycles/cursor; §3.2 apply_reconcile_result and the cursor
4://  0. pending hooks: open reconcile_mismatch items of this pair whose detail.hook is pending/failed are
6://  1. cycle: the pair's running cycle, else (plan audit Q2) snapshot pending_members → resolve keys AFTER
8://     db.openReconcileCycle: under the cycle lock set_merge also takes, cycle row + cursors + removal of
9://     exactly the snapshot entries in one transaction (later registrations wait for the next cycle; a
10://     concurrent creator's running cycle is returned). Cursor rows are still ensured on every run (heal);
13://  3. keys this member already committed in this cycle (an earlier attempt) are read back first and are
16://     pending hooks are step 0's job). One apply_reconcile_result per remaining key (result row + item +
24://     reconcile.<pair> (weekly) is made durable in the settling update itself (settle_reconcile_cycle writes
25://     detail.freshness={status:'pending',ok,detail}; only that key of detail, so pending_members written by
26://     set_merge are never clobbered) and recorded by record_cycle_freshness, which is idempotent per cycle
27://     (a cycle increments consecutive_errors at most once). Recording is ALWAYS done by replayFreshness:
28://     at run start and again right after a successful settle, oldest finished cycle first, stopping at the
37:// batch with its code and creates no cycle. Dry run: members + evaluate only, no writes by the runner.
58:export const CYCLE_TABLE='dq_reconcile_cycles',CURSOR_TABLE='dq_reconcile_cursor';
67:export interface ReconcileOptions{pair:CyclePairId;triggeredBy:TriggeredBy;issuerIds?:string[];dryRun?:boolean}
70:export interface CycleReport{cycleId:string;status:CycleStatus;created:boolean;settled:boolean;expectedTotal:number}
71:export interface ReconcileReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];cycle:CycleReport|null;members:MemberReport[];hooks:{retried:number;failed:number};dryRun?:{issuerId:string;market:Market;results:ReconcileResultInput[]}[]}
82: if(!Array.isArray(row.members))throw new ReconcileError('cycle_members_invalid');
85:  if(typeof x.issuer_id!=='string'||(x.market!=='US'&&x.market!=='CN')||!Array.isArray(x.expected_keys))throw new ReconcileError('cycle_members_invalid');
89:/** set_merge registrations still waiting in a cycle row; an entry leaves only through open_reconcile_cycle (plan audit Q2). */
90:const pendingOf=(row:Row):PendingMember[]=>{
91: const d=(row.detail??{}) as {pending_members?:unknown};
92: if(!Array.isArray(d.pending_members))return [];
93: return d.pending_members.filter((p):p is PendingMember=>!!p&&typeof (p as Row).issuer_id==='string'&&typeof (p as Row).source==='string'&&((p as Row).market==='US'||(p as Row).market==='CN'));
106: * A new cycle without a window (plan audit Q2):
107: *  1. snapshot the pending entries (plain read);
111: *  3. db.openReconcileCycle: under the cycle lock set_merge also takes, the cycle row, its cursors and the
113: *     consumed and joins the next cycle; a running cycle created meanwhile is returned (created:false).
114: * The runner never rewrites a cycle row's detail. A crash before 3 leaves nothing; after 3 the cycle and
120: const pending=(await selectAll(deps.tables,CYCLE_TABLE,{pair:pair.id},'cycle_id')).flatMap(pendingOf);
123: for(const p of pending){
125:  if(!pair.memberFor)throw new ReconcileError('pending_without_resolver',`${pair.id}:${k}`);
132: const cycleId=`${pair.id}-${startedAt.toISOString().slice(0,10)}-${randomUUID().slice(0,8)}`;
133: const out=await deps.db.openReconcileCycle({pair:pair.id,cycleId,startedAt:startedAt.toISOString(),members,pending});
134: return {row:out.cycle as Row,created:out.created};
137:async function readCursors(tables:TableClient,pair:CyclePairId,cycleId:string):Promise<Row[]>{
139: for(const market of MARKETS)out.push(...await selectAll(tables,CURSOR_TABLE,{pair,cycle_id:cycleId,market},'issuer_id'));
142:async function ensureCursors(tables:TableClient,pair:CyclePairId,cycleId:string,members:FrozenMember[]):Promise<void>{
143: const have=new Set((await readCursors(tables,pair,cycleId)).map(c=>mkey(String(c.issuer_id),String(c.market))));
147:   await tables.insert(CURSOR_TABLE,{pair,cycle_id:cycleId,issuer_id:m.issuer_id,market:m.market,expected:m.expected_keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
153: if(c.state==='pending')return true;
196:   if(w.result==='stale')errors.push({code:'skipped_summary',key:`${it.id}:hook_stale`});   // a newer pending hook committed meanwhile wins
204:  return d.pair===pair&&(d.hook?.state==='pending'||d.hook?.state==='failed')&&typeof d.issuer_id==='string'&&(d.market==='US'||d.market==='CN');
211:/** Natural keys this member already committed in this cycle (any earlier attempt); final, never re-evaluated (spec T2; plan audit P5). */
213: const rows=await selectAll(tables,'dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market},'natural_key');
262:interface Freshness{status:'pending'|'recorded';ok:boolean;detail:Record<string,unknown>}
265: return f&&(f.status==='pending'||f.status==='recorded')&&typeof f.ok==='boolean'?{status:f.status,ok:f.ok,detail:(f.detail??{}) as Record<string,unknown>}:null;
267:/** record_cycle_freshness for one settled cycle (idempotent per cycle). Never throws: false = still pending. */
269: const cycleId=String(row.cycle_id);
271:  const r=await callRpc(deps.tables,'record_cycle_freshness',{p_pair:pair,p_cycle_id:cycleId,p_dataset:DATASETS.reconcile(pair),p_cadence:'weekly',p_at:row.finished_at?new Date(String(row.finished_at)).toISOString():deps.now().toISOString()});
273:  errors.push({code:'freshness_pending',key:cycleId,message:String(r)});return false;
274: }catch(e){errors.push({code:'freshness_pending',key:cycleId,message:e instanceof Error?e.message:String(e)});return false;}
276:/** Terminal cycles of this pair whose freshness is still pending, oldest finished first; stops at the first failure to keep the order. */
278: const rows=(await selectAll(deps.tables,CYCLE_TABLE,{pair},'cycle_id')).filter(r=>r.status!=='running'&&freshnessOf(r)?.status==='pending')
279:  .sort((a,b)=>String(a.finished_at)<String(b.finished_at)?-1:String(a.finished_at)>String(b.finished_at)?1:String(a.cycle_id)<String(b.cycle_id)?-1:1);
283:async function settle(deps:ReconcileDeps,pair:CyclePairId,cycleId:string,errors:BatchError[]):Promise<{settled:boolean;status:CycleStatus}>{
284: const rows=await readCursors(deps.tables,pair,cycleId);
294: const fdetail={cycle_id:cycleId,compared_passed:passed,compared_failed:failedCmp,not_compared:notCompared,exec_failed_members:failedMembers};
295: // one locked SQL step: status/counters + detail.freshness (pending) only; it never rewrites other detail keys (pending_members)
create or replace function public.reconcile_fact_sync_scope(p_market text, p_rows jsonb, p_snapshot_at timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_market is null or p_market not in ('US','CN') then raise exception 'invalid_market' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
  select distinct on ((x ->> 'issuer_id')) (x ->> 'issuer_id')::uuid, p_market, coalesce(x -> 'reasons', '[]'::jsonb), (x ->> 'priority')::int, x ->> 'fetch_key'
  from jsonb_array_elements(p_rows) x
  on conflict (issuer_id, market) do update
    set reasons = excluded.reasons, priority = excluded.priority, fetch_key = excluded.fetch_key, updated_at = now(), scope_confirmed_at = now()
    where (fact_sync_scope.reasons, fact_sync_scope.priority, fact_sync_scope.fetch_key)
          is distinct from (excluded.reasons, excluded.priority, excluded.fetch_key)
      and (p_snapshot_at is null or excluded.priority > 0 or fact_sync_scope.priority = 0 or fact_sync_scope.scope_confirmed_at <= p_snapshot_at);
  get diagnostics n = row_count;
  -- Unchanged active rows are confirmed too (not counted): a stale run's retirement must not win over them.
  update public.fact_sync_scope s set scope_confirmed_at = now()
  from jsonb_array_elements(p_rows) x
  where s.issuer_id = (x ->> 'issuer_id')::uuid and s.market = p_market and (x ->> 'priority')::int > 0 and s.priority > 0 and s.scope_confirmed_at < now();
  return n;
end $$;
revoke execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_fact_sync_scope(text, jsonb, timestamptz) to service_role;

 succeeded in 9146ms:
exec
/bin/zsh -lc "rg -n 'references public.dq_reconcile_cycles|foreign key.*cycle|dq_reconcile_cycles' supabase/migrations/202611* | head -35; sed -n '116,136p' src/lib/dq/reconcile/run.ts; sed -n '304,365p' src/lib/dq/reconcile/run.ts; rg -n \"LINEAGE|lineageStage\" src/lib/dq/dq-extensions.integration.test.ts | tail -35; cat src/lib/facts/keys.ts | head -55" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
supabase/migrations/20261107090000_identifiers_and_dq.sql:116:create table if not exists public.dq_reconcile_cycles (
supabase/migrations/20261107090000_identifiers_and_dq.sql:130:  constraint dq_reconcile_cycles_members_array check (jsonb_typeof(members) = 'array'),
supabase/migrations/20261107090000_identifiers_and_dq.sql:131:  constraint dq_reconcile_cycles_detail_object check (jsonb_typeof(detail) = 'object'),
supabase/migrations/20261107090000_identifiers_and_dq.sql:132:  constraint dq_reconcile_cycles_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
supabase/migrations/20261107090000_identifiers_and_dq.sql:134:create unique index if not exists dq_reconcile_cycles_running_uniq on public.dq_reconcile_cycles(pair) where status = 'running';
supabase/migrations/20261107090000_identifiers_and_dq.sql:152:  constraint dq_reconcile_cursor_cycle_fkey foreign key (pair, cycle_id) references public.dq_reconcile_cycles(pair, cycle_id) on delete restrict,
supabase/migrations/20261107090000_identifiers_and_dq.sql:252:  foreach t in array array['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'] loop
supabase/migrations/20261107090000_identifiers_and_dq.sql:259:grant select, insert, update on public.dq_reconcile_cycles to service_role;
supabase/migrations/20261107091000_facts_extensions.sql:24:-- creates a review / lineage item; it holds no other member's row) → fact rows → dq_reconcile_cycles
supabase/migrations/20261107091000_facts_extensions.sql:338:  update public.dq_reconcile_cycles c
supabase/migrations/20261107091000_facts_extensions.sql:346:    and c.cycle_id = (select y.cycle_id from public.dq_reconcile_cycles y where y.pair = 'facts.lineage_same_day' order by (y.status = 'running') desc, y.started_at desc limit 1);
supabase/migrations/20261107091000_facts_extensions.sql:808:-- The member's frozen expected natural keys (dq_reconcile_cycles.members[].expected_keys, each element
supabase/migrations/20261107091000_facts_extensions.sql:814:  from public.dq_reconcile_cycles y, jsonb_array_elements(y.members) m
supabase/migrations/20261107091000_facts_extensions.sql:833:    and exists (select 1 from public.dq_reconcile_cycles y where y.pair = c.pair and y.cycle_id = c.cycle_id and y.status = 'running')
supabase/migrations/20261107091000_facts_extensions.sql:1027:-- The only writer of new dq_reconcile_cycles rows. Under the pair's cycle lock — the advisory lock
supabase/migrations/20261107091000_facts_extensions.sql:1043:declare v_row public.dq_reconcile_cycles; r record; v_members jsonb; v_keep jsonb; v_take jsonb; v_from text[] := '{}'; v_moved jsonb := '[]'::jsonb;
supabase/migrations/20261107091000_facts_extensions.sql:1047:  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
supabase/migrations/20261107091000_facts_extensions.sql:1073:    insert into public.dq_reconcile_cycles (pair, cycle_id, started_at, finished_at, members, status, expected_total, detail)
supabase/migrations/20261107091000_facts_extensions.sql:1077:    select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
supabase/migrations/20261107091000_facts_extensions.sql:1084:  for r in select c.cycle_id, c.detail from public.dq_reconcile_cycles c
supabase/migrations/20261107091000_facts_extensions.sql:1092:      update public.dq_reconcile_cycles
supabase/migrations/20261107091000_facts_extensions.sql:1098:  update public.dq_reconcile_cycles
supabase/migrations/20261107091000_facts_extensions.sql:1121:declare v_row public.dq_reconcile_cycles; v_n int;
supabase/migrations/20261107091000_facts_extensions.sql:1128:  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and cycle_id = p_cycle_id and status = 'running' for update;
supabase/migrations/20261107091000_facts_extensions.sql:1130:  update public.dq_reconcile_cycles
supabase/migrations/20261107091000_facts_extensions.sql:1148:  v_row public.dq_reconcile_cycles; v_fresh jsonb; v_ok boolean; v_ex public.dq_freshness;
supabase/migrations/20261107091000_facts_extensions.sql:1157:  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and cycle_id = p_cycle_id for update;
supabase/migrations/20261107091000_facts_extensions.sql:1184:  update public.dq_reconcile_cycles
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
918:  const LINEAGE='facts.lineage_same_day';
919:  const lid=()=>`${LINEAGE}-${randomUUID().slice(0,8)}`;
921:  const lineageStage=async(c:PoolClient,pending:unknown[])=>{
922:   await c.query(`update public.dq_reconcile_cycles set status='complete', finished_at=now() where pair=$1 and status='running'`,[LINEAGE]);
923:   const id=`${LINEAGE}-old-${randomUUID().slice(0,8)}`;
924:   await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now()+interval '100 years',now()+interval '100 years','[]','complete',0,$3::jsonb)`,[LINEAGE,id,JSON.stringify({pending_members:pending})]);
933:    const old=await lineageStage(c,[e1,e2]);
935:    const out=await openC(c,LINEAGE,id,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k1',locator:{}},{naturalKey:'k2',locator:{}}]}],[e1]);
937:    expect((await c.query(`select issuer_id,market,expected,state from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[LINEAGE,id])).rows).toEqual([{issuer_id:t1,market:'US',expected:2,state:'pending'}]);
938:    expect(await pendingIn(c,LINEAGE,old)).toEqual({pending_members:[e2],pending_consumed_by:id});    // e2 was not listed: it waits for the next cycle
939:    const again=await openC(c,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[]}],[e2]);
941:    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([e2]);                        // nothing consumed by the loser
949:    const old=await lineageStage(c,[e0]);
952:    const out=await openC(c,LINEAGE,lid(),[{issuer_id:t0,market:'US',expected_keys:[]}],snapshot);
955:    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([{issuer_id:t,market:'CN',source:s},{issuer_id:t,market:'US',source:s}]);
964:    waiter=inRolledBackTx(admin,async c2=>{await openC(c2,LINEAGE,lid(),[],[]);},1);waiter.catch(()=>{});
970:    await openC(c,LINEAGE,lid(),[],[]);                                             // takes the cycle lock (created or not)
986:    await lineageStage(c,[]);
987:    await c.query(lockSql,[LINEAGE]);                                              // what open_reconcile_cycle takes first
993:    opened=await openC(c,LINEAGE,lid(),[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[]);   // re-entrant advisory lock; cursor insert on t1
1002:     await lineageStage(c2,[]);
1003:     expect(await openC(c2,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[])).toMatchObject({created:true});
// src/lib/facts/keys.ts
// Natural-key strings (spec §5.2 K, §7.1 quarantine natural_key formats). One place renders
// them so plan, rules, read and the SQL-side items agree byte for byte. A null period_start
// (instants) renders as the empty segment.
import type {Market,Statement} from './types';

export interface FactKey{concept:string;period_start:string|null;period_end:string;consolidation:string;unit:string}
const seg=(s:string|null)=>s??'';

/** K within one issuer and market: concept:period_start:period_end:consolidation:unit. */
export const factKey=(k:FactKey):string=>[k.concept,seg(k.period_start),k.period_end,k.consolidation,k.unit].join(':');
/** Candidate key = K + filing + mapping generation (§5.3 duplicate rule). */
export const candidateKey=(k:FactKey,filingId:string,mappingGen:number):string=>`${factKey(k)}:${filingId}:${mappingGen}`;
/** same_day_conflict natural_key (§7.1). */
export const sameDayConflictKey=(issuer:string,market:Market,k:FactKey,availableDate:string):string=>[issuer,market,factKey(k),availableDate].join(':');
/** ambiguous_value / odd_duration natural_key (§7.1). */
export const ambiguousKey=(issuer:string,market:Market,k:FactKey,sourceRef:string,mappingGen:number):string=>[issuer,market,factKey(k),sourceRef,String(mappingGen)].join(':');
/** identity_bs (BS, period_end only) and identity_gp (IS, period_start:period_end) natural_key (§7.1). */
export const identityKey=(issuer:string,market:Market,statement:Extract<Statement,'IS'|'BS'>,periodStart:string|null,periodEnd:string,unit:string,sourceRef:string,mappingGen:number):string=>
 statement==='BS'?[issuer,market,'BS',periodEnd,unit,sourceRef,String(mappingGen)].join(':'):[issuer,market,'IS',seg(periodStart),periodEnd,unit,sourceRef,String(mappingGen)].join(':');
/** The K components as stored in quarantine payload.key; same_day_conflict items also carry available_date (promotion guard matches on it). */
export const keyComponents=(issuer:string,market:Market,k:FactKey,availableDate?:string):Record<string,string|null>=>({issuer_id:issuer,market,concept:k.concept,period_start:k.period_start,period_end:k.period_end,consolidation:k.consolidation,unit:k.unit,...(availableDate===undefined?{}:{available_date:availableDate})});

codex
No actionable defects were identified in the added integration tests or critical-suite registration. TypeScript checking passed; database-backed execution was not verified in the read-only environment.
No actionable defects were identified in the added integration tests or critical-suite registration. TypeScript checking passed; database-backed execution was not verified in the read-only environment.
