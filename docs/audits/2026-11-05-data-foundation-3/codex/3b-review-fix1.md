OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1afec-c714-7270-bb24-da72704e5f96
--------
user
commit 250a894
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat --oneline 250a894; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JvTYc8qs' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-zsuIi23L' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-zLTSPDM1' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-5gfjk1h2' (errno=Operation not permitted)
250a894 fix(entities): OpenFIGI failure evidence retention, shared serialized throttling, own-property exchange lookup
 .../2026-11-05-data-foundation-3/verification.md   |  4 +-
 src/lib/entities/identifiers/openfigi.test.ts      | 48 +++++++++++++
 src/lib/entities/identifiers/openfigi.ts           | 79 +++++++++++++++-------
 3 files changed, 106 insertions(+), 25 deletions(-)
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
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show 250a894 --; cat AGENTS.md 2>/dev/null; cat CLAUDE.md 2>/dev/null' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 268ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-AIrp7YCu' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NA6od6IA' (errno=Operation not permitted)
commit 250a89412d6543490f27133bbd76898b29ebe9d6
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:14:39 2026 -0800

    fix(entities): OpenFIGI failure evidence retention, shared serialized throttling, own-property exchange lookup
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
index cb7f951..3bfd94f 100644
--- a/docs/audits/2026-11-05-data-foundation-3/verification.md
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -26,12 +26,12 @@
 
 | 证券 | 期望（代码假设） | 实测 exchCode / ticker / securityType / marketSector / compositeFIGI | 分组结果（`grouped`） | 一致 |
 |---|---|---|---|---|
-| AAPL `US0378331005` | US 场所码 ∈ EXCH_MAP，Common Stock，composite `BBG000B9XRY4`，恰 1 组 | 303 条记录；`US`/`UN`/`UW` 等，ticker `AAPL`，Common Stock，Equity，composite `BBG000B9XRY4`（其余为海外场所码，被 `exch_unknown` 跳过） | `US AAPL` 恰 1 组 `BBG000B9XRY4`（composite；exch `UN,US,UW`） | 是 |
+| AAPL `US0378331005` | US 场所码 ∈ EXCH_MAP，Common Stock，composite `BBG000B9XRY4`，恰 1 组 | 303 条记录；分组后的场所码 `UA,UN,UP,US,UW`，ticker `AAPL`，Common Stock，Equity，composite `BBG000B9XRY4`（其余为海外场所码，被 `exch_unknown` 跳过） | `US AAPL` 恰 1 组 `BBG000B9XRY4`（composite；exch `UA,UN,UP,US,UW`） | 是 |
 | 贵州茅台 `CNE0000018R8` | `CG`/`CH`，ticker `600519`，类型 ∈ ALLOWED，恰 1 组 `600519.SH` | 3 条记录；`CH` + `CG`，ticker `600519`，Common Stock，Equity，composite `BBG000BC4595` | `CN 600519.SH` 恰 1 组 `BBG000BC4595`（exch `CG,CH`） | 是 |
 | 腾讯 `KYG875721634` | `HK`，ticker `700`，Common Stock，恰 1 组 `00700.HK` | 168 条记录；`HK` ticker `700`（composite `BBG000BJ35F4`）；另有 `HK` ticker `80700`（人民币柜台，composite `BBG01GXJQJR6`）与 `US` ticker `TCTZF`（OTC，composite `BBG000QMWZW4`），均 Common Stock/Equity | 3 个 ticker 各 1 组：`HK 00700.HK`、`HK 80700.HK`、`US TCTZF` | 部分：`00700.HK` 恰 1 组；同 ISIN 还映射出 `80700.HK` 与 `TCTZF` 两个 ticker |
 | TICKER `AAPL/US`、`600519/CG`、`700/HK` | 各恰 1 组，与 ISIN 结果同 FIGI | 一次响应 3 个 job：`US AAPL` composite `BBG000B9XRY4`；`CG 600519` composite `BBG000BC4595`；`HK 700` composite `BBG000BJ35F4` | 各恰 1 组，composite FIGI 与 ISIN 结果相同 | 是 |
 
-全部 `securityType` = `Common Stock`、`marketSector` = `Equity`（含 600519 与 0700，不需要扩 `ALLOWED_SECURITY_TYPES`）；所有 A/H 场所码（`US,UN,UW,CG,CH,HK`）已在 `EXCH_MAP`，无需改映射。`EXCH_MAP_VERSION` 保持 `exch-map/1`。
+全部 `securityType` = `Common Stock`、`marketSector` = `Equity`（含 600519 与 0700，不需要扩 `ALLOWED_SECURITY_TYPES`）；分组输出中观察到的场所码（`UA,UN,UP,US,UW,CG,CH,HK`）已在 `EXCH_MAP`，无需改映射。`EXCH_MAP_VERSION` 保持 `exch-map/1`。
 
 决策（计划规则 1 与 4）：三家都"目标 ticker 恰 1 组且 FIGI 正确" → `EXCH_MAP_VERIFIED=true`。腾讯 ISIN 还映射出两个附带 ticker（`80700.HK` 人民币柜台、`TCTZF` OTC），不改适配器（不发明场所偏好）；后续任务（4a `plan.ts`、7a `link-ah`）必须按"待挂接证券的 ticker"取对应候选，而不是把 ISIN 的全部 ticker 当作该发行人的证券，也不得因 ISIN 级结果出现多个 ticker 就认定冲突。夹具 `recorded-probe-isin.json` 的断言相应写为 `['00700.HK:1','80700.HK:1','TCTZF:1']`。
 
diff --git a/src/lib/entities/identifiers/openfigi.test.ts b/src/lib/entities/identifiers/openfigi.test.ts
index 21a4503..dc51aaf 100644
--- a/src/lib/entities/identifiers/openfigi.test.ts
+++ b/src/lib/entities/identifiers/openfigi.test.ts
@@ -143,6 +143,54 @@ describe('mapJobs',()=>{
  });
 });
 
+describe('failure evidence, shared throttling, own-property lookups',()=>{
+ const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
+ const stored=(h:{raw:{objects:Map<string,Uint8Array>}})=>[...h.raw.objects.entries()].filter(([k])=>!k.endsWith('.meta.json')).map(([,v])=>sha(v));
+ it('stores the request before sending and every failure body before retrying or throwing',async()=>{
+  const body=(t:string)=>()=>new Response(t,{status:429});
+  const h=harness([body('{"error":"first"}'),body('slow down')]);
+  const out=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h.deps);
+  expect(out.exhausted).toBe(true);expect(out.failures).toHaveLength(2);
+  const hashes=stored(h);
+  expect(hashes).toContain(out.failures[0].request_sha256);
+  expect(hashes).toContain(sha(new TextEncoder().encode('{"error":"first"}')));
+  expect(out.failures.map(f=>f.response_sha256)).toEqual([sha(new TextEncoder().encode('{"error":"first"}')),sha(new TextEncoder().encode('slow down'))]);
+  expect(out.failures.map(f=>f.status)).toEqual([429,429]);
+  // terminal 4xx: the error carries the evidence and the body is stored
+  const h2=harness([()=>new Response('{"error":"bad"}',{status:400})]);
+  const err=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h2.deps).catch(e=>e) as OpenFigiError;
+  expect(err).toBeInstanceOf(OpenFigiError);expect(err.evidence?.status).toBe(400);
+  expect(stored(h2)).toContain(err.evidence!.response_sha256);expect(stored(h2)).toContain(err.evidence!.request_sha256);
+  // a network error stores the request only
+  const h3=harness([boom,boom]);
+  const net=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h3.deps);
+  expect(net.failures.map(f=>f.response_sha256)).toEqual([null,null]);expect(stored(h3)).toContain(net.failures[0].request_sha256);
+ });
+ it('spaces requests across mapIsins then mapTickers with shared deps',async()=>{
+  const h=harness([ok([{data:AAPL}]),ok([{data:AAPL}])]);
+  const times:number[]=[];const f0=h.deps.fetch;
+  const deps={...h.deps,fetch:(async(...a:Parameters<typeof fetch>)=>{times.push(h.deps.now());return f0(...a);}) as typeof fetch};
+  await mapIsins(['US0378331005'],deps);
+  await mapTickers(['AAPL'],deps);
+  expect(times[1]-times[0]).toBeGreaterThanOrEqual(3000);
+  expect(h.sleeps).toEqual([3000]);
+ });
+ it('queues concurrent calls on one limiter',async()=>{
+  const h=harness([ok([{data:AAPL}]),ok([{data:AAPL}]),ok([{data:AAPL}])]);
+  await Promise.all([mapIsins(['A1'],h.deps),mapIsins(['A2'],h.deps),mapTickers(['AAPL'],h.deps)]);
+  // three requests, each queued 3 s behind the previous one (virtual clock: sleeps accumulate to 6 s)
+  expect(h.calls).toHaveLength(3);expect(h.sleeps).toEqual([3000,3000]);expect(h.deps.now()).toBe(6000);
+ });
+ it('treats Object.prototype names as unknown exchange codes',()=>{
+  for(const c of ['toString','__proto__','constructor','hasOwnProperty'])expect(securityTickerFor(c,'AAPL')).toEqual({ok:false,reason:`exch_unknown:${c}`});
+  expect(groupFigiResults([eq({exchCode:'constructor'})]).skipped).toEqual(['exch_unknown:constructor']);
+ });
+ it('infers the board from the code prefix only for CH',()=>{
+  expect(securityTickerFor('CG','000001')).toEqual({ok:true,market:'CN',ticker:'000001.SH'});
+  expect(securityTickerFor('CS','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SZ'});
+ });
+});
+
 const RECORDED=new URL('../fixtures/openfigi/recorded-probe-isin.json',import.meta.url);
 describe('recorded probe (Task 3b Step 8)',()=>{
  it.skipIf(!existsSync(RECORDED))('maps AAPL, 600519 and 0700 to exactly one group per ticker (Tencent ISIN also lists 80700.HK and the OTC line TCTZF)',()=>{
diff --git a/src/lib/entities/identifiers/openfigi.ts b/src/lib/entities/identifiers/openfigi.ts
index 156794e..3f6a2a8 100644
--- a/src/lib/entities/identifiers/openfigi.ts
+++ b/src/lib/entities/identifiers/openfigi.ts
@@ -30,11 +30,12 @@ export interface FigiEvidence{request_sha256:string;response_sha256:string;index
 export type FigiJobResult=
  |{job:FigiJob;status:'ok';records:FigiRecord[];evidence:FigiEvidence}
  |{job:FigiJob;status:'not_found'|'error';message:string;evidence:FigiEvidence};
-export interface MapResult{results:(FigiJobResult|null)[];exhausted:boolean;requests:number}
-export interface MappedBy{byKey:Map<string,FigiJobResult>;exhausted:boolean;unprocessed:string[];unsupported:string[];requests:number}
+export interface FigiFailure{status:number|null;request_sha256:string;response_sha256:string|null}
+export interface MapResult{results:(FigiJobResult|null)[];exhausted:boolean;requests:number;failures:FigiFailure[]}
+export interface MappedBy{byKey:Map<string,FigiJobResult>;exhausted:boolean;unprocessed:string[];unsupported:string[];requests:number;failures:FigiFailure[]}
 export interface OpenFigiDeps{fetch:typeof fetch;raw:RawStore;apiKey?:string|null;sleep?:(ms:number)=>Promise<void>;now?:()=>number;budget?:Budget}
 export class OpenFigiError extends Error{
- constructor(readonly code:'invalid_schema'|'openfigi_http',detail?:string){super(detail?`${code}: ${detail}`:code);this.name='OpenFigiError';}
+ constructor(readonly code:'invalid_schema'|'openfigi_http',detail?:string,readonly evidence?:FigiFailure){super(detail?`${code}: ${detail}`:code);this.name='OpenFigiError';}
 }
 
 export function openFigiLimits(apiKey?:string|null):{jobsPerRequest:number;minIntervalMs:number}{
@@ -58,43 +59,75 @@ function parseItem(job:FigiJob,item:unknown,evidence:FigiEvidence):FigiJobResult
  throw new OpenFigiError('invalid_schema','job result');
 }
 
+/** One serialized pacer per (fetch, quota identity): every mapJobs call sharing them queues behind the same clock. */
+interface Pacer{last:number|null;tail:Promise<void>}
+const PACERS=new WeakMap<object,Map<string,Pacer>>();
+function pacerFor(deps:OpenFigiDeps):Pacer{
+ let m=PACERS.get(deps.fetch);
+ if(!m){m=new Map();PACERS.set(deps.fetch,m);}
+ const id=deps.apiKey?`key:${deps.apiKey}`:'anon';
+ let p=m.get(id);
+ if(!p){p={last:null,tail:Promise.resolve()};m.set(id,p);}
+ return p;
+}
+async function pace(p:Pacer,interval:number,now:()=>number,sleep:(ms:number)=>Promise<void>):Promise<void>{
+ const prev=p.tail;let release!:()=>void;
+ p.tail=new Promise<void>(r=>{release=r;});
+ await prev;
+ try{
+  if(p.last!==null){const wait=p.last+interval-now();if(wait>0)await sleep(wait);}
+  p.last=now();
+ }finally{release();}
+}
+
 export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise<MapResult>{
  const {jobsPerRequest,minIntervalMs}=openFigiLimits(deps.apiKey);
  const sleep=deps.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
  const now=deps.now??Date.now;
+ const pacer=pacerFor(deps);
  const results:(FigiJobResult|null)[]=jobs.map(()=>null);
+ const failures:FigiFailure[]=[];
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(deps.apiKey)headers['X-OPENFIGI-APIKEY']=deps.apiKey;
- let last:number|null=null,requests=0;
- const send=async(body:string):Promise<Response|null>=>{
-  if(last!==null){const wait=last+minIntervalMs-now();if(wait>0)await sleep(wait);}
-  last=now();requests++;
-  try{return await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:deps.budget?.signal});}
-  catch(e){if(deps.budget?.signal.aborted)throw e;return null;}
+ let requests=0;
+ const store=async(bytes:Uint8Array,meta:Record<string,string|number>)=>{
+  let json=true;
+  try{JSON.parse(new TextDecoder().decode(bytes));}catch{json=false;}
+  return deps.raw.put({kind:'openfigi',bytes,contentType:json?'application/json':'text/html',meta},deps.budget);
+ };
+ /** The request is stored before it is sent; every received response is stored before anything else happens. */
+ const send=async(body:string,reqSha:string):Promise<{res:Response|null;bytes:Uint8Array|null;sha:string|null}>=>{
+  await pace(pacer,minIntervalMs,now,sleep);
+  requests++;
+  let res:Response;
+  try{res=await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:deps.budget?.signal});}
+  catch(e){if(deps.budget?.signal.aborted)throw e;failures.push({status:null,request_sha256:reqSha,response_sha256:null});return {res:null,bytes:null,sha:null};}
+  const bytes=new Uint8Array(await res.arrayBuffer());
+  const stored=await store(bytes,{role:'response',request_sha256:reqSha,http_status:res.status});
+  if(!res.ok)failures.push({status:res.status,request_sha256:reqSha,response_sha256:stored.sha256});
+  return {res,bytes,sha:stored.sha256};
  };
  const retryable=(r:Response|null)=>r===null||r.status===429||r.status>=500;
  for(let start=0;start<jobs.length;start+=jobsPerRequest){
   const chunk=jobs.slice(start,start+jobsPerRequest);
   const body=JSON.stringify(chunk);
-  let res=await send(body);
-  if(retryable(res)){await sleep(BACKOFF_MS);res=await send(body);}
-  if(res===null||retryable(res))return {results,exhausted:true,requests};
-  if(!res.ok)throw new OpenFigiError('openfigi_http',String(res.status));
-  const bytes=new Uint8Array(await res.arrayBuffer());
-  const req=await deps.raw.put({kind:'openfigi',bytes:new TextEncoder().encode(body),contentType:'application/json',meta:{role:'request',jobs:chunk.length}},deps.budget);
-  const resp=await deps.raw.put({kind:'openfigi',bytes,contentType:'application/json',meta:{role:'response',request_sha256:req.sha256}},deps.budget);
+  const req=await store(new TextEncoder().encode(body),{role:'request',jobs:chunk.length});
+  let out=await send(body,req.sha256);
+  if(retryable(out.res)){await sleep(BACKOFF_MS);out=await send(body,req.sha256);}
+  if(out.res===null||retryable(out.res))return {results,exhausted:true,requests,failures};
+  if(!out.res.ok)throw new OpenFigiError('openfigi_http',String(out.res.status),failures[failures.length-1]);
   let parsed:unknown;
-  try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new OpenFigiError('invalid_schema','response is not JSON');}
-  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length');
-  parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:resp.sha256,index:i});});
+  try{parsed=JSON.parse(new TextDecoder().decode(out.bytes!));}catch{throw new OpenFigiError('invalid_schema','response is not JSON',{status:out.res.status,request_sha256:req.sha256,response_sha256:out.sha});}
+  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length',{status:out.res.status,request_sha256:req.sha256,response_sha256:out.sha});
+  parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:out.sha!,index:i});});
  }
- return {results,exhausted:false,requests};
+ return {results,exhausted:false,requests,failures};
 }
 
 function keyed(keys:readonly string[],jobs:FigiJob[],out:MapResult,unsupported:string[]):MappedBy{
  const byKey=new Map<string,FigiJobResult>();const unprocessed:string[]=[];
  keys.forEach((k,i)=>{const r=out.results[i];if(r)byKey.set(k,r);else unprocessed.push(k);});
- return {byKey,exhausted:out.exhausted,unprocessed,unsupported,requests:out.requests};
+ return {byKey,exhausted:out.exhausted,unprocessed,unsupported,requests:out.requests,failures:out.failures};
 }
 
 export async function mapIsins(isins:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
@@ -124,13 +157,13 @@ export async function mapTickers(tickers:readonly string[],deps:OpenFigiDeps):Pr
 }
 
 export function securityTickerFor(exchCode:string|null|undefined,ticker:string|null|undefined):{ok:true;market:FigiMarket;ticker:string}|{ok:false;reason:string}{
- const kind=exchCode?EXCH_MAP[exchCode]:undefined;
+ const kind=exchCode&&Object.hasOwn(EXCH_MAP,exchCode)?EXCH_MAP[exchCode]:undefined;
  if(!kind)return {ok:false,reason:`exch_unknown:${exchCode??'null'}`};
  const raw=(ticker??'').trim().toUpperCase();
  if(kind==='US'){const t=normalizeSecurityTicker(raw,'US');return t?{ok:true,market:'US',ticker:t}:{ok:false,reason:'ticker_invalid'};}
  if(kind==='HK'){const t=normalizeSecurityTicker(raw,'HK');return t?{ok:true,market:'HK',ticker:t}:{ok:false,reason:'ticker_invalid'};}
  if(!/^\d{6}$/.test(raw))return {ok:false,reason:'ticker_invalid'};
- const suffix=kind==='SH'?'SH':kind==='SZ'?'SZ':/^[69]/.test(raw)?'SH':/^[03]/.test(raw)?'SZ':null;
+ const suffix=kind==='SH'?'SH':kind==='SZ'?'SZ':kind==='CH'?(/^[69]/.test(raw)?'SH':/^[03]/.test(raw)?'SZ':null):null;
  if(!suffix)return {ok:false,reason:`exch_unknown:CH:${raw[0]}`};
  return {ok:true,market:'CN',ticker:`${raw}.${suffix}`};
 }

exec
/bin/zsh -lc 'for d in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do ls "$d"/AGENTS* 2>/dev/null; done; cat src/lib/entities/identifiers/openfigi.ts; cat src/lib/entities/raw-store.ts; cat src/lib/entities/identifiers/openfigi.test.ts; cat package.json' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS*
// src/lib/entities/identifiers/openfigi.ts
// Stage B/C (spec §4.1.2–§4.1.3): OpenFIGI v3 mapping adapter. mapJobs throttles to 80% of the
// documented limits (no key: 25 requests/min and 10 jobs/request; key: 250/min and 100 jobs),
// backs off BACKOFF_MS once on 429/5xx/network failure and then gives up the rest of the run
// (exhausted → the caller records quota_exhausted). Each request's job array and the exact
// response bytes go to reconcile-raw; the API key travels only in a header and is never stored.
// groupFigiResults is pure: equity filter, EXCH_MAP, grouping by compositeFIGI (composite level)
// or figi (venue level), sorted so the order of API results never changes the outcome. No venue
// preference is invented: several groups for one ticker means "do not write, file claims".
import type {Budget} from '../../facts/types';
import type {RawStore} from '../../dq/raw-store';
import {normalizeSecurityTicker} from '../../securities/ticker';

export const OPENFIGI_URL='https://api.openfigi.com/v3/mapping';
export const OPENFIGI_VERSION='v3';
export const EXCH_MAP_VERSION='exch-map/1';
/** True only after the Task 3b live check (verification.md). fill-identifiers/link-ah --apply refuse while false. */
export const EXCH_MAP_VERIFIED:boolean=true;
/** openfigi.com/about/exchange-codes. CG→.SH, CS→.SZ, CH (China composite) by code prefix (6/9→.SH, 0/3→.SZ). */
export const EXCH_MAP:Readonly<Record<string,'US'|'SH'|'SZ'|'CH'|'HK'>>={US:'US',UN:'US',UW:'US',UA:'US',UR:'US',UP:'US',UQ:'US',CG:'SH',CS:'SZ',CH:'CH',HK:'HK'};
/** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
export const ALLOWED_SECURITY_TYPES:ReadonlySet<string>=new Set(['Common Stock','ADR','GDR']);
export const BACKOFF_MS=60_000;
const FIGI=/^BBG[A-Z0-9]{9}$/;

export type FigiMarket='US'|'CN'|'HK';
export interface FigiJob{idType:'ID_ISIN'|'TICKER';idValue:string;exchCode?:string}
export interface FigiRecord{figi:string;compositeFIGI?:string|null;ticker?:string|null;exchCode?:string|null;securityType?:string|null;securityType2?:string|null;marketSector?:string|null;name?:string|null;shareClassFIGI?:string|null}
export interface FigiEvidence{request_sha256:string;response_sha256:string;index:number}
export type FigiJobResult=
 |{job:FigiJob;status:'ok';records:FigiRecord[];evidence:FigiEvidence}
 |{job:FigiJob;status:'not_found'|'error';message:string;evidence:FigiEvidence};
export interface FigiFailure{status:number|null;request_sha256:string;response_sha256:string|null}
export interface MapResult{results:(FigiJobResult|null)[];exhausted:boolean;requests:number;failures:FigiFailure[]}
export interface MappedBy{byKey:Map<string,FigiJobResult>;exhausted:boolean;unprocessed:string[];unsupported:string[];requests:number;failures:FigiFailure[]}
export interface OpenFigiDeps{fetch:typeof fetch;raw:RawStore;apiKey?:string|null;sleep?:(ms:number)=>Promise<void>;now?:()=>number;budget?:Budget}
export class OpenFigiError extends Error{
 constructor(readonly code:'invalid_schema'|'openfigi_http',detail?:string,readonly evidence?:FigiFailure){super(detail?`${code}: ${detail}`:code);this.name='OpenFigiError';}
}

export function openFigiLimits(apiKey?:string|null):{jobsPerRequest:number;minIntervalMs:number}{
 const keyed=!!apiKey;
 const perMinute=Math.floor((keyed?250:25)*0.8);
 return {jobsPerRequest:keyed?100:10,minIntervalMs:Math.ceil(60_000/perMinute)};
}

function parseItem(job:FigiJob,item:unknown,evidence:FigiEvidence):FigiJobResult{
 if(!item||typeof item!=='object'||Array.isArray(item))throw new OpenFigiError('invalid_schema','job result');
 const o=item as {data?:unknown;error?:unknown;warning?:unknown};
 if(Array.isArray(o.data)){
  const records=o.data.map(r=>{
   if(!r||typeof r!=='object'||typeof (r as FigiRecord).figi!=='string')throw new OpenFigiError('invalid_schema','record');
   return r as FigiRecord;
  });
  return records.length?{job,status:'ok',records,evidence}:{job,status:'not_found',message:'empty data',evidence};
 }
 if(typeof o.warning==='string')return {job,status:'not_found',message:o.warning,evidence};
 if(typeof o.error==='string')return {job,status:'error',message:o.error,evidence};
 throw new OpenFigiError('invalid_schema','job result');
}

/** One serialized pacer per (fetch, quota identity): every mapJobs call sharing them queues behind the same clock. */
interface Pacer{last:number|null;tail:Promise<void>}
const PACERS=new WeakMap<object,Map<string,Pacer>>();
function pacerFor(deps:OpenFigiDeps):Pacer{
 let m=PACERS.get(deps.fetch);
 if(!m){m=new Map();PACERS.set(deps.fetch,m);}
 const id=deps.apiKey?`key:${deps.apiKey}`:'anon';
 let p=m.get(id);
 if(!p){p={last:null,tail:Promise.resolve()};m.set(id,p);}
 return p;
}
async function pace(p:Pacer,interval:number,now:()=>number,sleep:(ms:number)=>Promise<void>):Promise<void>{
 const prev=p.tail;let release!:()=>void;
 p.tail=new Promise<void>(r=>{release=r;});
 await prev;
 try{
  if(p.last!==null){const wait=p.last+interval-now();if(wait>0)await sleep(wait);}
  p.last=now();
 }finally{release();}
}

export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise<MapResult>{
 const {jobsPerRequest,minIntervalMs}=openFigiLimits(deps.apiKey);
 const sleep=deps.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 const now=deps.now??Date.now;
 const pacer=pacerFor(deps);
 const results:(FigiJobResult|null)[]=jobs.map(()=>null);
 const failures:FigiFailure[]=[];
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(deps.apiKey)headers['X-OPENFIGI-APIKEY']=deps.apiKey;
 let requests=0;
 const store=async(bytes:Uint8Array,meta:Record<string,string|number>)=>{
  let json=true;
  try{JSON.parse(new TextDecoder().decode(bytes));}catch{json=false;}
  return deps.raw.put({kind:'openfigi',bytes,contentType:json?'application/json':'text/html',meta},deps.budget);
 };
 /** The request is stored before it is sent; every received response is stored before anything else happens. */
 const send=async(body:string,reqSha:string):Promise<{res:Response|null;bytes:Uint8Array|null;sha:string|null}>=>{
  await pace(pacer,minIntervalMs,now,sleep);
  requests++;
  let res:Response;
  try{res=await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:deps.budget?.signal});}
  catch(e){if(deps.budget?.signal.aborted)throw e;failures.push({status:null,request_sha256:reqSha,response_sha256:null});return {res:null,bytes:null,sha:null};}
  const bytes=new Uint8Array(await res.arrayBuffer());
  const stored=await store(bytes,{role:'response',request_sha256:reqSha,http_status:res.status});
  if(!res.ok)failures.push({status:res.status,request_sha256:reqSha,response_sha256:stored.sha256});
  return {res,bytes,sha:stored.sha256};
 };
 const retryable=(r:Response|null)=>r===null||r.status===429||r.status>=500;
 for(let start=0;start<jobs.length;start+=jobsPerRequest){
  const chunk=jobs.slice(start,start+jobsPerRequest);
  const body=JSON.stringify(chunk);
  const req=await store(new TextEncoder().encode(body),{role:'request',jobs:chunk.length});
  let out=await send(body,req.sha256);
  if(retryable(out.res)){await sleep(BACKOFF_MS);out=await send(body,req.sha256);}
  if(out.res===null||retryable(out.res))return {results,exhausted:true,requests,failures};
  if(!out.res.ok)throw new OpenFigiError('openfigi_http',String(out.res.status),failures[failures.length-1]);
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder().decode(out.bytes!));}catch{throw new OpenFigiError('invalid_schema','response is not JSON',{status:out.res.status,request_sha256:req.sha256,response_sha256:out.sha});}
  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length',{status:out.res.status,request_sha256:req.sha256,response_sha256:out.sha});
  parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:out.sha!,index:i});});
 }
 return {results,exhausted:false,requests,failures};
}

function keyed(keys:readonly string[],jobs:FigiJob[],out:MapResult,unsupported:string[]):MappedBy{
 const byKey=new Map<string,FigiJobResult>();const unprocessed:string[]=[];
 keys.forEach((k,i)=>{const r=out.results[i];if(r)byKey.set(k,r);else unprocessed.push(k);});
 return {byKey,exhausted:out.exhausted,unprocessed,unsupported,requests:out.requests,failures:out.failures};
}

export async function mapIsins(isins:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
 const keys=[...new Set(isins)];
 const jobs=keys.map(idValue=>({idType:'ID_ISIN' as const,idValue}));
 return keyed(keys,jobs,await mapJobs(jobs,deps),[]);
}

/** Reverse lookup for TICKER jobs (spec §4.1.3); null = no OpenFIGI exchange code for this ticker. */
export function exchCodeFor(ticker:string):{exchCode:string;idValue:string}|null{
 const cn=/^(\d{6})\.(SH|SZ)$/.exec(ticker);
 if(cn)return {exchCode:cn[2]==='SH'?'CG':'CS',idValue:cn[1]};
 const hk=/^(\d{5})\.HK$/.exec(ticker);
 if(hk)return {exchCode:'HK',idValue:hk[1].replace(/^0+(?=\d)/,'')};
 if(/^[A-Z][A-Z0-9.]{0,7}$/.test(ticker)&&!/\.(SH|SZ|BJ|HK)$/.test(ticker))return {exchCode:'US',idValue:ticker.replace(/\./g,'/')};
 return null;
}

export async function mapTickers(tickers:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
 const keys:string[]=[],jobs:FigiJob[]=[],unsupported:string[]=[];
 for(const t of [...new Set(tickers)]){
  const x=exchCodeFor(t);
  if(!x){unsupported.push(t);continue;}
  keys.push(t);jobs.push({idType:'TICKER',idValue:x.idValue,exchCode:x.exchCode});
 }
 return keyed(keys,jobs,await mapJobs(jobs,deps),unsupported);
}

export function securityTickerFor(exchCode:string|null|undefined,ticker:string|null|undefined):{ok:true;market:FigiMarket;ticker:string}|{ok:false;reason:string}{
 const kind=exchCode&&Object.hasOwn(EXCH_MAP,exchCode)?EXCH_MAP[exchCode]:undefined;
 if(!kind)return {ok:false,reason:`exch_unknown:${exchCode??'null'}`};
 const raw=(ticker??'').trim().toUpperCase();
 if(kind==='US'){const t=normalizeSecurityTicker(raw,'US');return t?{ok:true,market:'US',ticker:t}:{ok:false,reason:'ticker_invalid'};}
 if(kind==='HK'){const t=normalizeSecurityTicker(raw,'HK');return t?{ok:true,market:'HK',ticker:t}:{ok:false,reason:'ticker_invalid'};}
 if(!/^\d{6}$/.test(raw))return {ok:false,reason:'ticker_invalid'};
 const suffix=kind==='SH'?'SH':kind==='SZ'?'SZ':kind==='CH'?(/^[69]/.test(raw)?'SH':/^[03]/.test(raw)?'SZ':null):null;
 if(!suffix)return {ok:false,reason:`exch_unknown:CH:${raw[0]}`};
 return {ok:true,market:'CN',ticker:`${raw}.${suffix}`};
}

export interface FigiGroup{figi:string;level:'composite'|'venue';exchCodes:string[];securityType:string}
export interface FigiCandidate{market:FigiMarket;ticker:string;groups:FigiGroup[]}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

export function groupFigiResults(records:readonly FigiRecord[]):{candidates:FigiCandidate[];skipped:string[]}{
 const sorted=[...records].sort((a,b)=>cmp(a.compositeFIGI??a.figi,b.compositeFIGI??b.figi)||cmp(a.exchCode??'',b.exchCode??'')||cmp(a.figi,b.figi));
 const byTicker=new Map<string,{market:FigiMarket;ticker:string;groups:Map<string,FigiGroup>}>();
 const skipped:string[]=[];
 for(const r of sorted){
  if(r.marketSector!=='Equity'){skipped.push(`market_sector:${r.marketSector??'null'}`);continue;}
  if(!r.securityType||!ALLOWED_SECURITY_TYPES.has(r.securityType)){skipped.push(`security_type:${r.securityType??'null'}`);continue;}
  const composite=typeof r.compositeFIGI==='string'&&r.compositeFIGI!=='';
  const figi=composite?r.compositeFIGI!:r.figi;
  if(!FIGI.test(figi)){skipped.push('invalid_figi');continue;}
  const t=securityTickerFor(r.exchCode,r.ticker);
  if(!t.ok){skipped.push(t.reason);continue;}
  const key=`${t.market}|${t.ticker}`;
  const entry=byTicker.get(key)??{market:t.market,ticker:t.ticker,groups:new Map<string,FigiGroup>()};
  byTicker.set(key,entry);
  const gk=`${composite?'c':'v'}:${figi}`;
  const g=entry.groups.get(gk)??{figi,level:composite?'composite':'venue',exchCodes:[],securityType:r.securityType};
  if(r.exchCode&&!g.exchCodes.includes(r.exchCode))g.exchCodes.push(r.exchCode);
  entry.groups.set(gk,g);
 }
 const candidates=[...byTicker.values()]
  .sort((a,b)=>cmp(`${a.market}|${a.ticker}`,`${b.market}|${b.ticker}`))
  .map(e=>({market:e.market,ticker:e.ticker,groups:[...e.groups.values()].map(g=>({...g,exchCodes:[...g.exchCodes].sort()})).sort((a,b)=>cmp(a.figi,b.figi))}));
 return {candidates,skipped:skipped.sort()};
}
cat: src/lib/entities/raw-store.ts: No such file or directory
// src/lib/entities/identifiers/openfigi.test.ts
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {memoryRawStore} from '../../dq/raw-store';
import {
 ALLOWED_SECURITY_TYPES,BACKOFF_MS,EXCH_MAP,EXCH_MAP_VERSION,OPENFIGI_URL,OpenFigiError,
 exchCodeFor,groupFigiResults,mapIsins,mapJobs,mapTickers,openFigiLimits,securityTickerFor,type FigiRecord,
} from './openfigi';

const eq=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000B9XRY4',compositeFIGI:'BBG000B9XRY4',ticker:'AAPL',exchCode:'US',securityType:'Common Stock',marketSector:'Equity',...o});
// Trimmed ID_ISIN result shapes (spec §9.1): AAPL composite + US venues + a German line; Moutai CG/CH; Tencent HK.
const AAPL:FigiRecord[]=[eq({}),eq({figi:'BBG000B9XVV8',exchCode:'UW'}),eq({figi:'BBG000B9Y5X2',exchCode:'UN'}),eq({figi:'BBG000BG9JS1',compositeFIGI:'BBG000BG9DH4',exchCode:'GR'})];
const MOUTAI:FigiRecord[]=[eq({figi:'BBG000MOUTA1',compositeFIGI:'BBG000MOUTA1',ticker:'600519',exchCode:'CH'}),eq({figi:'BBG000MOUTA2',compositeFIGI:'BBG000MOUTA1',ticker:'600519',exchCode:'CG'})];
const TENCENT:FigiRecord[]=[eq({figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1',ticker:'700',exchCode:'HK'})];
const BOND:FigiRecord[]=[eq({figi:'BBG00BOND001',compositeFIGI:null,ticker:'AAPL 2.4 05/03/23',exchCode:null,securityType:'GLOBAL',marketSector:'Corp'})];
const VENUES:FigiRecord[]=[eq({figi:'BBG000VENUE1',compositeFIGI:null,ticker:'ZZX'}),eq({figi:'BBG000VENUE2',compositeFIGI:null,ticker:'ZZX'})];

type Reply=()=>Response;
const ok=(body:unknown):Reply=>()=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
const status=(s:number):Reply=>()=>new Response('{}',{status:s});
const boom:Reply=()=>{throw new TypeError('fetch failed');};
function harness(replies:Reply[]){
 const calls:{url:string;init:RequestInit}[]=[];const sleeps:number[]=[];let t=0;
 const fetch=(async(url:string|URL|Request,init?:RequestInit)=>{calls.push({url:String(url),init:init??{}});const r=replies.shift();if(!r)throw new Error('unexpected fetch');return r();}) as typeof globalThis.fetch;
 const raw=memoryRawStore();
 return {calls,sleeps,raw,deps:{fetch,raw,now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;}}};
}
const isinItems=(n:number)=>Array.from({length:n},()=>({data:AAPL}));

describe('limits and EXCH_MAP',()=>{
 it('throttles to 80% of the documented limits',()=>{
  expect(openFigiLimits(null)).toEqual({jobsPerRequest:10,minIntervalMs:3000});
  expect(openFigiLimits('k')).toEqual({jobsPerRequest:100,minIntervalMs:300});
  expect(EXCH_MAP_VERSION).toBe('exch-map/1');
  expect(Object.keys(EXCH_MAP).sort()).toEqual(['CG','CH','CS','HK','UA','UN','UP','UQ','UR','US','UW']);
  expect([...ALLOWED_SECURITY_TYPES].sort()).toEqual(['ADR','Common Stock','GDR']);
 });
 it('maps exchange codes to security tickers and back',()=>{
  expect(securityTickerFor('UW','AAPL')).toEqual({ok:true,market:'US',ticker:'AAPL'});
  expect(securityTickerFor('US','BRK/B')).toEqual({ok:true,market:'US',ticker:'BRK.B'});
  expect(securityTickerFor('CG','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SH'});
  expect(securityTickerFor('CS','000001')).toEqual({ok:true,market:'CN',ticker:'000001.SZ'});
  expect(securityTickerFor('CH','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SH'});
  expect(securityTickerFor('CH','300750')).toEqual({ok:true,market:'CN',ticker:'300750.SZ'});
  expect(securityTickerFor('CH','430047')).toEqual({ok:false,reason:'exch_unknown:CH:4'});
  expect(securityTickerFor('HK','700')).toEqual({ok:true,market:'HK',ticker:'00700.HK'});
  expect(securityTickerFor('GR','AAPL')).toEqual({ok:false,reason:'exch_unknown:GR'});
  expect(securityTickerFor(null,'AAPL')).toEqual({ok:false,reason:'exch_unknown:null'});
  expect(exchCodeFor('AAPL')).toEqual({exchCode:'US',idValue:'AAPL'});
  expect(exchCodeFor('BRK.B')).toEqual({exchCode:'US',idValue:'BRK/B'});
  expect(exchCodeFor('600519.SH')).toEqual({exchCode:'CG',idValue:'600519'});
  expect(exchCodeFor('000001.SZ')).toEqual({exchCode:'CS',idValue:'000001'});
  expect(exchCodeFor('00700.HK')).toEqual({exchCode:'HK',idValue:'700'});
  expect(exchCodeFor('430047.BJ')).toBeNull();
 });
});

describe('groupFigiResults',()=>{
 it('groups by compositeFIGI, drops unknown venues and non-equity lines',()=>{
  const g=groupFigiResults([...AAPL,...BOND]);
  expect(g.candidates).toEqual([{market:'US',ticker:'AAPL',groups:[{figi:'BBG000B9XRY4',level:'composite',exchCodes:['UN','US','UW'],securityType:'Common Stock'}]}]);
  expect(g.skipped).toEqual(['exch_unknown:GR','market_sector:Corp']);
  expect(groupFigiResults(MOUTAI).candidates).toEqual([{market:'CN',ticker:'600519.SH',groups:[{figi:'BBG000MOUTA1',level:'composite',exchCodes:['CG','CH'],securityType:'Common Stock'}]}]);
  expect(groupFigiResults(TENCENT).candidates[0]).toMatchObject({market:'HK',ticker:'00700.HK'});
 });
 it('keeps venue-level results without compositeFIGI as separate groups (never picks a venue)',()=>{
  const g=groupFigiResults(VENUES);
  expect(g.candidates).toEqual([{market:'US',ticker:'ZZX',groups:[
   {figi:'BBG000VENUE1',level:'venue',exchCodes:['US'],securityType:'Common Stock'},
   {figi:'BBG000VENUE2',level:'venue',exchCodes:['US'],securityType:'Common Stock'},
  ]}]);
 });
 it('is independent of result order (permuted fixtures give identical output)',()=>{
  const all=[...AAPL,...MOUTAI,...VENUES,...BOND];
  const base=groupFigiResults(all);
  for(const perm of [[...all].reverse(),[...all.slice(3),...all.slice(0,3)],[all[5],all[0],...all.slice(1,5),...all.slice(6)]])expect(groupFigiResults(perm)).toEqual(base);
 });
 it('skips security types outside the allowed set and malformed FIGIs',()=>{
  const g=groupFigiResults([eq({securityType:'Preference'}),eq({figi:'XX1',compositeFIGI:null})]);
  expect(g.candidates).toEqual([]);expect(g.skipped).toEqual(['invalid_figi','security_type:Preference']);
 });
});

describe('mapJobs',()=>{
 it('splits into 10-job requests without a key, waits 3 s between them, stores request and response bytes',async()=>{
  const h=harness([ok(isinItems(10)),ok(isinItems(10)),ok(isinItems(5))]);
  const isins=Array.from({length:25},(_,i)=>`US03783310${String(i).padStart(2,'0')}`);
  const out=await mapIsins(isins,h.deps);
  expect(h.calls).toHaveLength(3);
  expect(h.calls[0].url).toBe(OPENFIGI_URL);
  expect(JSON.parse(String(h.calls[0].init.body))).toHaveLength(10);
  expect(JSON.parse(String(h.calls[0].init.body))[0]).toEqual({idType:'ID_ISIN',idValue:isins[0]});
  expect((h.calls[0].init.headers as Record<string,string>)['X-OPENFIGI-APIKEY']).toBeUndefined();
  expect(h.sleeps).toEqual([3000,3000]);
  expect(out.exhausted).toBe(false);expect(out.byKey.size).toBe(25);expect(out.requests).toBe(3);
  const r=out.byKey.get(isins[24])!;
  expect(r.status).toBe('ok');
  // content-addressed store: the two identical 10-item responses share one object (3 requests + 2 responses),
  // and memoryRawStore keeps a .meta.json sidecar per stored object: 5 objects + 5 sidecars
  expect(h.raw.objects.size).toBe(10);
  const bytes=[...h.raw.objects.values()].map(b=>createHash('sha256').update(b).digest('hex'));
  expect(bytes).toContain(r.evidence.request_sha256);expect(bytes).toContain(r.evidence.response_sha256);
  expect(r.evidence.index).toBe(4);
 });
 it('sends 100 jobs per request with a key, and never stores the key',async()=>{
  const h=harness([ok(isinItems(25))]);
  await mapIsins(Array.from({length:25},(_,i)=>`US03783310${String(i).padStart(2,'0')}`),{...h.deps,apiKey:'secret-key'});
  expect(h.calls).toHaveLength(1);
  expect((h.calls[0].init.headers as Record<string,string>)['X-OPENFIGI-APIKEY']).toBe('secret-key');
  for(const b of h.raw.objects.values())expect(new TextDecoder().decode(b)).not.toContain('secret-key');
 });
 it('backs off 60 s once on 429, 5xx or a network error, then succeeds',async()=>{
  for(const first of [status(429),status(503),boom]){
   const h=harness([first,ok([{data:TENCENT}])]);
   const out=await mapJobs([{idType:'ID_ISIN',idValue:'KYG875721634'}],h.deps);
   expect(h.sleeps).toContain(BACKOFF_MS);
   expect(out.exhausted).toBe(false);expect(out.results[0]?.status).toBe('ok');
  }
 });
 it('gives up the rest of the run after a second failure (exhausted, unprocessed listed)',async()=>{
  const h=harness([ok(isinItems(10)),status(429),status(429)]);
  const isins=Array.from({length:15},(_,i)=>`US03783310${String(i).padStart(2,'0')}`);
  const out=await mapIsins(isins,h.deps);
  expect(out.exhausted).toBe(true);
  expect(out.byKey.size).toBe(10);
  expect(out.unprocessed).toEqual(isins.slice(10));
 });
 it('maps warning to not_found and error to error; rejects malformed responses and other HTTP errors',async()=>{
  const h=harness([ok([{warning:'No identifier found.'},{error:'Invalid idValue format.'},{data:[]}])]);
  const out=await mapJobs([{idType:'ID_ISIN',idValue:'A'},{idType:'ID_ISIN',idValue:'B'},{idType:'ID_ISIN',idValue:'C'}],h.deps);
  expect(out.results.map(r=>r?.status)).toEqual(['not_found','error','not_found']);
  await expect(mapJobs([{idType:'ID_ISIN',idValue:'A'}],harness([ok([])]).deps)).rejects.toThrow(OpenFigiError);
  await expect(mapJobs([{idType:'ID_ISIN',idValue:'A'}],harness([ok([{nope:1}])]).deps)).rejects.toThrow('invalid_schema');
  await expect(mapJobs([{idType:'ID_ISIN',idValue:'A'}],harness([status(400)]).deps)).rejects.toThrow('openfigi_http');
 });
 it('mapTickers builds TICKER jobs with the reverse exchCode and lists unsupported tickers',async()=>{
  const h=harness([ok([{data:AAPL},{data:TENCENT}])]);
  const out=await mapTickers(['AAPL','00700.HK','430047.BJ'],h.deps);
  expect(JSON.parse(String(h.calls[0].init.body))).toEqual([{idType:'TICKER',idValue:'AAPL',exchCode:'US'},{idType:'TICKER',idValue:'700',exchCode:'HK'}]);
  expect(out.unsupported).toEqual(['430047.BJ']);
  expect([...out.byKey.keys()]).toEqual(['AAPL','00700.HK']);
 });
});

describe('failure evidence, shared throttling, own-property lookups',()=>{
 const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 const stored=(h:{raw:{objects:Map<string,Uint8Array>}})=>[...h.raw.objects.entries()].filter(([k])=>!k.endsWith('.meta.json')).map(([,v])=>sha(v));
 it('stores the request before sending and every failure body before retrying or throwing',async()=>{
  const body=(t:string)=>()=>new Response(t,{status:429});
  const h=harness([body('{"error":"first"}'),body('slow down')]);
  const out=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h.deps);
  expect(out.exhausted).toBe(true);expect(out.failures).toHaveLength(2);
  const hashes=stored(h);
  expect(hashes).toContain(out.failures[0].request_sha256);
  expect(hashes).toContain(sha(new TextEncoder().encode('{"error":"first"}')));
  expect(out.failures.map(f=>f.response_sha256)).toEqual([sha(new TextEncoder().encode('{"error":"first"}')),sha(new TextEncoder().encode('slow down'))]);
  expect(out.failures.map(f=>f.status)).toEqual([429,429]);
  // terminal 4xx: the error carries the evidence and the body is stored
  const h2=harness([()=>new Response('{"error":"bad"}',{status:400})]);
  const err=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h2.deps).catch(e=>e) as OpenFigiError;
  expect(err).toBeInstanceOf(OpenFigiError);expect(err.evidence?.status).toBe(400);
  expect(stored(h2)).toContain(err.evidence!.response_sha256);expect(stored(h2)).toContain(err.evidence!.request_sha256);
  // a network error stores the request only
  const h3=harness([boom,boom]);
  const net=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],h3.deps);
  expect(net.failures.map(f=>f.response_sha256)).toEqual([null,null]);expect(stored(h3)).toContain(net.failures[0].request_sha256);
 });
 it('spaces requests across mapIsins then mapTickers with shared deps',async()=>{
  const h=harness([ok([{data:AAPL}]),ok([{data:AAPL}])]);
  const times:number[]=[];const f0=h.deps.fetch;
  const deps={...h.deps,fetch:(async(...a:Parameters<typeof fetch>)=>{times.push(h.deps.now());return f0(...a);}) as typeof fetch};
  await mapIsins(['US0378331005'],deps);
  await mapTickers(['AAPL'],deps);
  expect(times[1]-times[0]).toBeGreaterThanOrEqual(3000);
  expect(h.sleeps).toEqual([3000]);
 });
 it('queues concurrent calls on one limiter',async()=>{
  const h=harness([ok([{data:AAPL}]),ok([{data:AAPL}]),ok([{data:AAPL}])]);
  await Promise.all([mapIsins(['A1'],h.deps),mapIsins(['A2'],h.deps),mapTickers(['AAPL'],h.deps)]);
  // three requests, each queued 3 s behind the previous one (virtual clock: sleeps accumulate to 6 s)
  expect(h.calls).toHaveLength(3);expect(h.sleeps).toEqual([3000,3000]);expect(h.deps.now()).toBe(6000);
 });
 it('treats Object.prototype names as unknown exchange codes',()=>{
  for(const c of ['toString','__proto__','constructor','hasOwnProperty'])expect(securityTickerFor(c,'AAPL')).toEqual({ok:false,reason:`exch_unknown:${c}`});
  expect(groupFigiResults([eq({exchCode:'constructor'})]).skipped).toEqual(['exch_unknown:constructor']);
 });
 it('infers the board from the code prefix only for CH',()=>{
  expect(securityTickerFor('CG','000001')).toEqual({ok:true,market:'CN',ticker:'000001.SH'});
  expect(securityTickerFor('CS','600519')).toEqual({ok:true,market:'CN',ticker:'600519.SZ'});
 });
});

const RECORDED=new URL('../fixtures/openfigi/recorded-probe-isin.json',import.meta.url);
describe('recorded probe (Task 3b Step 8)',()=>{
 it.skipIf(!existsSync(RECORDED))('maps AAPL, 600519 and 0700 to exactly one group per ticker (Tencent ISIN also lists 80700.HK and the OTC line TCTZF)',()=>{
  const items=JSON.parse(readFileSync(RECORDED,'utf8')) as {data?:FigiRecord[]}[];
  const tickers=items.map(i=>groupFigiResults(i.data??[]).candidates.map(c=>`${c.ticker}:${c.groups.length}`));
  expect(tickers).toEqual([['AAPL:1'],['600519.SH:1'],['00700.HK:1','80700.HK:1','TCTZF:1']]);
 });
});
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

exec
/bin/zsh -lc "cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; cat src/lib/dq/raw-store.ts; rg 'mapIsins|mapTickers|MapResult|MappedBy' src scripts --glob '"'!openfigi*'"'; cat tsconfig.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/dq/raw-store.ts
// Raw evidence for identifiers, calendar and reconciliation (spec 3 §3.1 bucket reconcile-raw; plan 3
// contract C6). Content-addressed: put() hashes the bytes itself and stores them at
// <kind>/<sha256>.<ext> plus a <kind>/<sha256>.meta.json sidecar, both with upsert:false, so identical
// bytes fetched again answer 'exists' and stored evidence is never rewritten (the first sidecar wins).
// The sidecar holds metadata only: values that look like credentials (URL userinfo, token-like query
// parameters) are refused before any upload. Any other upload failure is
// RawStoreError('raw_upload_failed'): the caller marks that issuer/file failed and writes no row that
// depends on it. The budget's abort signal cuts the wait. Mirrors src/lib/facts/snapshot-store.ts.
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Budget} from '../facts/types';

export const RECONCILE_RAW_BUCKET='reconcile-raw';
export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf';
export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf'];
export type RawContentType='application/json'|'text/html'|'application/pdf'|'text/csv'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/vnd.ms-excel'|'application/zip';
export interface RawPut{kind:RawKind;bytes:Uint8Array;contentType:RawContentType;meta?:Record<string,string|number>}
export interface RawStored{sha256:string;path:string;status:'stored'|'exists'}
export interface RawStore{put(item:RawPut,budget?:Budget):Promise<RawStored>;sha256Of(path:string):string}
export const RAW_EXT:Record<RawContentType,string>={
 'application/json':'json','text/html':'html','application/pdf':'pdf','text/csv':'csv',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/vnd.ms-excel':'xls','application/zip':'zip',
};
export const rawPath=(kind:RawKind,sha256:string,ext:string)=>`${kind}/${sha256}.${ext}`;
// Full object filename + .meta.json: the same bytes stored under two content types get distinct sidecars.
export const rawMetaPath=(path:string)=>`${path}.meta.json`;

export class RawStoreError extends Error{
 constructor(readonly code:'raw_upload_failed'|'raw_invalid',readonly reason?:string){
  super(reason?`${code}: ${reason}`:code);
  this.name='RawStoreError';
 }
}

const PATH=new RegExp(`^(${RAW_KINDS.join('|')})/([0-9a-f]{64})\\.(${Object.values(RAW_EXT).join('|')})$`);
const CREDENTIAL=/:\/\/[^/\s]*@|[?&#](?:token|key|apikey|api_key|access_token|sig|signature|auth|secret|password)=/i;
const CREDENTIAL_NAME=/api[-_]?key|token|secret|password|authorization|cookie|^(?:key|sig|signature|auth)$/i;
/** A string value that parses as a URL is also checked by its decoded query/fragment parameter names and userinfo. */
function urlHasCredential(v:string):boolean{
 let u:URL;
 try{u=new URL(v);}catch{return false;}
 if(u.username||u.password)return true;
 for(const name of u.searchParams.keys())if(CREDENTIAL_NAME.test(name))return true;
 const frag=u.hash.replace(/^#/,'');
 if(frag.includes('='))for(const name of new URLSearchParams(frag).keys())if(CREDENTIAL_NAME.test(name))return true;
 return false;
}

export const sha256Hex=(bytes:Uint8Array):string=>createHash('sha256').update(bytes).digest('hex');

/** The sha256 a content-addressed data path names; throws raw_invalid for anything else (sidecars included). */
function sha256Of(path:string):string{
 const m=PATH.exec(path);
 if(!m)throw new RawStoreError('raw_invalid',`path:${path.slice(0,80)}`);
 return m[2];
}

function prepare(item:RawPut):{sha256:string;path:string;meta:string}{
 if(!RAW_KINDS.includes(item.kind))throw new RawStoreError('raw_invalid',`kind:${String(item.kind).slice(0,40)}`);
 const ext=RAW_EXT[item.contentType];
 if(!ext)throw new RawStoreError('raw_invalid',`content_type:${String(item.contentType).slice(0,80)}`);
 if(!(item.bytes instanceof Uint8Array))throw new RawStoreError('raw_invalid','bytes');
 for(const [k,v] of Object.entries(item.meta??{})){
  if(typeof v==='number'?!Number.isFinite(v):typeof v!=='string')throw new RawStoreError('raw_invalid',`meta:${k}`);
  if(CREDENTIAL_NAME.test(k))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
  if(typeof v==='string'&&(CREDENTIAL.test(v)||urlHasCredential(v)))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
 }
 const sha256=sha256Hex(item.bytes);
 // System keys last: caller meta can never overwrite what the sidecar asserts about the bytes.
 const meta=JSON.stringify({...item.meta,kind:item.kind,sha256,bytes:item.bytes.byteLength,content_type:item.contentType});
 return {sha256,path:rawPath(item.kind,sha256,ext),meta};
}

interface UploadError{message:string;statusCode?:string|number;status?:number}
const isExists=(e:UploadError)=>String(e.statusCode??e.status??'')==='409'||/already exists|duplicate/i.test(e.message);

function withinBudget<T>(p:Promise<T>,budget?:Budget):Promise<T>{
 if(!budget)return p;
 if(budget.signal.aborted)return Promise.reject(new RawStoreError('raw_upload_failed','budget_exhausted'));
 return new Promise<T>((resolve,reject)=>{
  const onAbort=()=>reject(new RawStoreError('raw_upload_failed','budget_exhausted'));
  budget.signal.addEventListener('abort',onAbort,{once:true});
  p.then(v=>{budget.signal.removeEventListener('abort',onAbort);resolve(v);},e=>{budget.signal.removeEventListener('abort',onAbort);reject(e);});
 });
}

export function supabaseRawStore(admin:SupabaseClient):RawStore{
 const bucket=()=>admin.storage.from(RECONCILE_RAW_BUCKET);
 const upload=async(path:string,body:Uint8Array|string,contentType:string,budget?:Budget):Promise<'stored'|'exists'>=>{
  // checked before the call: an already-aborted budget performs zero uploads
  if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
  const {error}=await withinBudget(bucket().upload(path,body,{contentType,upsert:false}),budget);
  if(!error)return 'stored';
  if(isExists(error as UploadError))return 'exists';
  throw new RawStoreError('raw_upload_failed',(error as UploadError).message);
 };
 return {
  sha256Of,
  async put(item,budget){
   const {sha256,path,meta}=prepare(item);
   const status=await upload(path,item.bytes,item.contentType,budget);
   await upload(rawMetaPath(path),meta,'application/json',budget);
   return {sha256,path,status};
  },
 };
}

export function memoryRawStore():RawStore&{objects:Map<string,Uint8Array>}{
 const objects=new Map<string,Uint8Array>();
 return {
  objects,
  sha256Of,
  async put(item,budget){
   const {sha256,path,meta}=prepare(item);
   if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
   // a copy: later mutation of the caller's buffer cannot rewrite evidence; stored objects and sidecars are immutable
   const status:RawStored['status']=objects.has(path)?'exists':'stored';
   if(status==='stored')objects.set(path,new Uint8Array(item.bytes));
   if(!objects.has(rawMetaPath(path)))objects.set(rawMetaPath(path),new TextEncoder().encode(meta));
   return {sha256,path,status};
  },
 };
}
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "legacy-demo", "supabase/functions"]
}

codex
The evidence-retention change introduces a retry regression when a retryable HTTP response has an interrupted body. Such failures now escape rather than following the adapter's backoff policy.

Review comment:

- [P2] Retry when reading a retryable HTTP response body fails — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/openfigi.ts:107-107
  If OpenFIGI returns 429 or 5xx headers but the connection resets while streaming the body, `res.arrayBuffer()` rejects outside the network-error catch. This now aborts `mapJobs` immediately instead of performing the existing backoff and retry; previously these statuses were retried without reading their bodies. Handle body-read failures as retryable transport failures, retaining the request hash and HTTP status even when no complete response body can be stored.
The evidence-retention change introduces a retry regression when a retryable HTTP response has an interrupted body. Such failures now escape rather than following the adapter's backoff policy.

Review comment:

- [P2] Retry when reading a retryable HTTP response body fails — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/identifiers/openfigi.ts:107-107
  If OpenFIGI returns 429 or 5xx headers but the connection resets while streaming the body, `res.arrayBuffer()` rejects outside the network-error catch. This now aborts `mapJobs` immediately instead of performing the existing backoff and retry; previously these statuses were retried without reading their bodies. Handle body-read failures as retryable transport failures, retaining the request hash and HTTP status even when no complete response body can be stored.
