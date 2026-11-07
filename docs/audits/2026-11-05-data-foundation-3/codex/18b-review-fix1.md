OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b3a4-3b9f-74e1-9aaa-95e02ab917e0
--------
user
commit 858b7dd
2026-11-07T01:34:09.318648Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 858b7dd; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 9046ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-CQJWgq1Q' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jxgFWP4K' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/18b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pWsb8yNL' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-B61BdXPg' (errno=Operation not permitted)
858b7dd6 fix(dq): calendar preview never touches production storage; CN schedule validated and judged per period
 .../2026-11-05-data-foundation-3/verification.md   |  6 ++++-
 scripts/dq/calendar-sync.ts                        |  2 +-
 src/lib/dq/calendar-deps.test.ts                   | 14 ++++++++++++
 src/lib/dq/calendar-deps.ts                        |  5 +++--
 src/lib/dq/calendar-sync.test.ts                   | 26 +++++++++++++++++++++-
 src/lib/dq/calendar-sync.ts                        | 18 ++++++++++++++-
 src/lib/dq/disclosure-fixtures.test.ts             | 10 ++++++---
 7 files changed, 72 insertions(+), 9 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do [ ! -f "$p" ] || cat "$p"; done; ls -a | head -30; git show 858b7dd --; cat src/lib/dq/calendar-sync.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-zq3cnb4P' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eC2ZYfuU' (errno=Operation not permitted)
commit 858b7dd66b60650326db5f90e7e83d4045a949b7
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:33:49 2026 -0800

    fix(dq): calendar preview never touches production storage; CN schedule validated and judged per period
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
index b7f39141..2e2608f3 100644
--- a/docs/audits/2026-11-05-data-foundation-3/verification.md
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -123,4 +123,8 @@
 
 **结论。** 语义与计划一致：`actual_date` = 定期报告实际披露日，`end_date` = 报告期末，`modify_date` = 预约日修订记录，`ann_date` = 预约记录公告日。`parseDisclosureDate` 解析两份夹具全部行。据此 `CN_DISCLOSURE_VERIFIED` 翻 `true`（独立提交）。
 
-**保留事项（不阻塞翻开关）。** (1) Tushare 对尚无预约记录的期间不返回行（`end_date=20261231` 为 0 行；记录在期末当日即出现，`ann_date=end_date`），所以"上游成功但该期无行"= 暂无预约，日历按法定期限给 `pending`/`overdue`，若 Tushare 回填滞后可能把一个期限已过但行未到的期间标 `overdue`；这是 CN 数据延迟的固有风险，已由 `detail.schedule_*` 之外的行级 `upstream_sha256` 留证。(2) 只核对了两只 A 股的整历史与两个报告期的全市场形状；北交所（`.BJ`）未单独抽查。
+**日历如何使用该响应（审查后收紧，Task 18b 复审）。** code=0 不等于可用的预约表：`calendar-sync.ts` 把缺 `end_date/pre_date/actual_date` 列、`data:null`（`fields=[]`）判为 `bad_shape`，`has_more=true` 判为 `has_more`（offset 分页在并列行上不稳定，见计划二 17 号核对，不拼页），两者都得 `upstream_lookup='unavailable'` → `unknown_upstream`，原始字节仍入桶，原因进 `skipped_summary(schedule_unavailable)`。响应可用时按**期间**判定：只有响应里存在该 `end_date` 的行，才可由上游把该期判为 `pending`/`overdue`/`filed_not_ingested`；没有该期的行 → 该期保持 `unknown_upstream`（`detail.upstream_incomplete`、`detail.schedule_row_missing`），不因"上游没有这行"而判逾期；已入库的已发布 filing 仍使该期为 `received`。这样 Tushare 对尚无预约记录的期间不返回行（`end_date=20261231` 为 0 行）不会产生假逾期。
+
+**时间戳说明。** 夹具 meta 的 `fetched_at` 是脚本取响应时 `new Date().toISOString()` 的 UTC 值：2026-11-07T01:24Z；本机当时 `date -u` 为 2026-11-07 01:31（PST 为 2026-11-06 17:31），所以正确，对应上文标题里的本地日期 2026-11-06。
+
+**保留事项。** 只核对了两只 A 股的整历史与两个报告期的全市场形状；北交所（`.BJ`）未单独抽查。
diff --git a/scripts/dq/calendar-sync.ts b/scripts/dq/calendar-sync.ts
index 74076713..3838f3a9 100644
--- a/scripts/dq/calendar-sync.ts
+++ b/scripts/dq/calendar-sync.ts
@@ -87,7 +87,7 @@ async function main(){
  }
  const admin=getAdminSupabase();
  if(!args.apply){
-  const deps={...productionCalendarDeps({deadline:null,codeVersion,admin}),raw:memoryRawStore()};
+  const deps=productionCalendarDeps({deadline:null,codeVersion,admin,raw:memoryRawStore()});
   const out=await previewCalendar(deps,{market:args.market,issuerIds:args.issuers.length?args.issuers:undefined,limit:args.limit});
   console.log(JSON.stringify({mode:'preview (nothing written; pass --apply)',market:args.market,out},null,1));
   process.exit(out.some(o=>o.errors.length>0)?1:0);
diff --git a/src/lib/dq/calendar-deps.test.ts b/src/lib/dq/calendar-deps.test.ts
index 67460fe4..ffd40872 100644
--- a/src/lib/dq/calendar-deps.test.ts
+++ b/src/lib/dq/calendar-deps.test.ts
@@ -7,6 +7,7 @@ vi.mock('../entities/identifiers/sec-submissions',async(orig)=>({...(await orig<
 vi.mock('../supabase/admin',()=>({getAdminSupabase:()=>{throw new Error('no admin in unit tests');}}));
 
 import {productionCalendarDeps} from './calendar-deps';
+import {memoryRawStore} from './raw-store';
 import {DISCLOSURE_FIELDS} from './calendar-sync';
 
 const fakeAdmin={rpc:vi.fn(),from:vi.fn(),storage:{from:vi.fn()}} as never;
@@ -26,4 +27,17 @@ describe('productionCalendarDeps',()=>{
   expect(deps.budget.remainingMs()).toBeGreaterThan(200_000);
   expect(deps.codeVersion).toBe('c');
  });
+ it('an injected raw store is the one the returned deps AND the submissions fetcher use (preview must never upload to the Supabase store)',async()=>{
+  const uploads:string[]=[];
+  const admin={rpc:vi.fn(),from:vi.fn(),storage:{from:(b:string)=>{uploads.push(b);throw new Error('production storage touched');}}} as never;
+  const raw=memoryRawStore();
+  const deps=productionCalendarDeps({deadline:null,codeVersion:'c',admin,raw});
+  expect(deps.raw).toBe(raw);
+  mocks.submissions.mockClear();
+  mocks.submissions.mockResolvedValue({cik:'320193',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'s',path:'p'},pages:[],complete:true,
+   parsed:{cik:'320193',name:null,category:null,fiscalYearEnd:null,tickers:[],exchanges:[],formerNames:[],filings:[],files:[]}});
+  await deps.submissions('0000320193',deps.budget);
+  expect(mocks.submissions.mock.calls[0][1].raw).toBe(raw);
+  expect(uploads).toEqual([]);
+ });
 });
diff --git a/src/lib/dq/calendar-deps.ts b/src/lib/dq/calendar-deps.ts
index 77d31493..d4571628 100644
--- a/src/lib/dq/calendar-deps.ts
+++ b/src/lib/dq/calendar-deps.ts
@@ -10,15 +10,16 @@ import {fetchSubmissions} from '../entities/identifiers/sec-submissions';
 import {supabaseFactsDb} from '../facts/db';
 import {makeBudget} from '../facts/sync';
 import {supabaseRawStore} from './raw-store';
+import type {RawStore} from './raw-store';
 import {submissionsView} from './filer-categories';
 import {filingsWindowStart} from './calendar';
 import {DISCLOSURE_FIELDS,supabaseCalendarPassDb} from './calendar-sync';
 import type {CalendarSyncDeps} from './calendar-sync';
 
-export interface CalendarDepsOptions{deadline:Date|null;codeVersion:string;now?:()=>Date;/** Reuse an existing admin client (scripts hold one). */admin?:ReturnType<typeof getAdminSupabase>}
+export interface CalendarDepsOptions{deadline:Date|null;codeVersion:string;now?:()=>Date;/** Reuse an existing admin client (scripts hold one). */admin?:ReturnType<typeof getAdminSupabase>;/** Raw-evidence store for BOTH the returned deps and the submissions fetcher; default = the Supabase bucket. Previews pass a memory store. */raw?:RawStore}
 export function productionCalendarDeps(opts:CalendarDepsOptions):CalendarSyncDeps{
  const sb=opts.admin??getAdminSupabase();
- const raw=supabaseRawStore(sb);
+ const raw=opts.raw??supabaseRawStore(sb);
  const now=opts.now??(()=>new Date());
  return {
   tables:supabaseTableClient(sb),db:supabaseFactsDb(sb),passes:supabaseCalendarPassDb(sb),raw,
diff --git a/src/lib/dq/calendar-sync.test.ts b/src/lib/dq/calendar-sync.test.ts
index dfa8f9fe..50d8dff4 100644
--- a/src/lib/dq/calendar-sync.test.ts
+++ b/src/lib/dq/calendar-sync.test.ts
@@ -319,10 +319,34 @@ describe('runCalendarSync (CN)',()=>{
   await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
   expect([...h.raw.objects.keys()].filter(k=>!k.endsWith('.meta.json'))).toHaveLength(1);   // landed raw-store also writes a .meta.json sidecar
   const rows=rowsOf(h.tables,C);
-  expect(rows.every(x=>x.upstream_lookup==='ok'&&x.detail.schedule_unavailable===undefined&&typeof x.detail.upstream_sha256==='string')).toBe(true);
+  expect(rows.filter(x=>['2026-09-30','2026-06-30'].includes(x.period_end)).every(x=>x.upstream_lookup==='ok'&&x.detail.schedule_unavailable===undefined&&typeof x.detail.upstream_sha256==='string')).toBe(true);
   expect(rows.find(x=>x.period_end==='2026-09-30')).toMatchObject({disclosure_state:'overdue',expected_date:'2026-10-30',upstream_filed_date:null});
   expect(rows.find(x=>x.period_end==='2026-06-30')).toMatchObject({disclosure_state:'filed_not_ingested',expected_date:'2026-08-29',upstream_filed_date:'2026-08-28',detail:expect.objectContaining({schedule_modified:true})});
  });
+ const CN_FIELDS=['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'];
+ const cnRaw=(p:Partial<TushareRaw>={}):TushareRaw=>({bytes:new TextEncoder().encode('{"code":0}'),sha256:'x',httpStatus:200,requestId:null,code:0,msg:'',fields:CN_FIELDS,items:[],hasMore:false,...p});
+ it('a code-0 response that is not a usable schedule (data:null, missing fields, has_more) is unavailable, never a false overdue; the bytes are still kept',async()=>{
+  for(const [name,raw] of [['data_null',cnRaw({fields:[],items:[]})],['missing_field',cnRaw({fields:['ts_code','end_date','pre_date'],items:[['600000.SH','20260930','20261030']]})],['empty_has_more',cnRaw({items:[],hasMore:true})],['has_more_rows',cnRaw({items:[['600000.SH','20260930','20260930','20261030','20261030',null]],hasMore:true})]] as const){
+   const h=await harness({market:'CN',members:[C],disclosure:async()=>raw});
+   const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
+   const rows=rowsOf(h.tables,C);
+   expect(rows.length,name).toBeGreaterThan(0);
+   expect(rows.every(x=>x.upstream_lookup==='unavailable'&&x.disclosure_state==='unknown_upstream'),name).toBe(true);
+   expect(rows.some(x=>x.disclosure_state==='overdue'),name).toBe(false);
+   expect(r.errors.find(e=>e.key==='schedule_unavailable')?.message,name).toMatch(name==='has_more_rows'||name==='empty_has_more'?/has_more/:/bad_shape/);
+   expect([...h.raw.objects.keys()].filter(k=>!k.endsWith('.meta.json')),name).toHaveLength(1);
+  }
+ });
+ it('per-period coverage: a CN slot with no schedule row stays unknown_upstream (never overdue); a row or a published filing still decides',async()=>{
+  const h=await harness({market:'CN',members:[C],disclosure:async()=>cnRaw({items:[['600000.SH','20260630','20260630','20260829','20260828',null]]})});
+  await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
+  const rows=rowsOf(h.tables,C);
+  expect(rows.find(x=>x.period_end==='2026-06-30')).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested'});
+  const missing=rows.filter(x=>x.period_end!=='2026-06-30');
+  expect(missing.length).toBeGreaterThan(0);
+  expect(missing.every(x=>x.upstream_lookup==='unavailable'&&x.disclosure_state==='unknown_upstream'&&x.detail.upstream_incomplete===true)).toBe(true);
+  expect(missing.some(x=>x.disclosure_state==='overdue')).toBe(false);
+ });
  it('a Tushare API error code (积分不足) is unavailable with the code as reason',async()=>{
   const h=await harness({market:'CN',members:[C],disclosure:async()=>({bytes:new Uint8Array(),sha256:'x',httpStatus:200,requestId:null,code:40203,msg:'',fields:[],items:[],hasMore:false})});
   const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
diff --git a/src/lib/dq/calendar-sync.ts b/src/lib/dq/calendar-sync.ts
index 916a5dff..f5a4d4db 100644
--- a/src/lib/dq/calendar-sync.ts
+++ b/src/lib/dq/calendar-sync.ts
@@ -33,6 +33,8 @@ import type {SubmissionsView} from './filer-categories';
 /** Verified 2026-11-06 against real disclosure_date responses (600519.SH, 000333.SZ; docs/audits/2026-11-05-data-foundation-3/verification.md "CN disclosure_date 真实响应核对"): actual_date = periodic-report disclosure date, null while only scheduled. */
 export const CN_DISCLOSURE_VERIFIED=true;
 export const DISCLOSURE_FIELDS='ts_code,ann_date,end_date,pre_date,actual_date,modify_date';
+/** Columns the CN schedule needs: a response without one of them is not a schedule. */
+const CN_REQUIRED_FIELDS=['end_date','pre_date','actual_date'] as const;
 export const MIN_MEMBER_MS=60_000;
 export const MAX_MEMBER_ATTEMPTS=3;
 export const PASS_MAX_AGE_MS=2*86_400_000;
@@ -135,6 +137,16 @@ export function applyUpstreamCoverage(rows:ExpectationRow[],entries:readonly UsU
  });
 }
 
+/** CN counterpart of applyUpstreamCoverage: a period is judged from the schedule only if the response has a row for its end_date; without one it stays unknown (missing stays missing). Positive evidence is kept. */
+export function applyCnCoverage(rows:ExpectationRow[],schedule:readonly CnScheduleRow[]):ExpectationRow[]{
+ const have=new Set(schedule.map(r=>r.end_date));
+ return rows.map((r):ExpectationRow=>{
+  if((r.disclosure_state!=='pending'&&r.disclosure_state!=='overdue')||have.has(r.period_end))return r;
+  const {estimated_due_passed:_e,...detail}=r.detail;
+  return {...r,upstream_lookup:'unavailable',upstream_filed_date:null,disclosure_state:'unknown_upstream',detail:{...detail,upstream_incomplete:true,schedule_row_missing:true}};
+ });
+}
+
 interface MemberResult{profile:FilingProfile|null;rows:ExpectationRow[];upstreamUnavailable:boolean;noProfile:boolean;noFye:boolean;noCategory:boolean;errors:BatchError[];scheduleReason?:string}
 async function display(tables:TableClient,issuerId:string,scope:Row|undefined,market:Market,today:string):Promise<{ticker:string|null;name:string|null}>{
  const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
@@ -170,7 +182,10 @@ async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string
    else{
     // a storage failure is a real error (member failed, retryable), not an informational upstream gap
     const stored=await deps.raw.put({kind:'tushare-disclosure',bytes:raw.bytes,contentType:'application/json',meta:{api:'disclosure_date',ts_code:fetchKey}},deps.budget).catch((e:unknown)=>{throw e instanceof RawStoreError?e:new RawStoreError('raw_upload_failed',errText(e));});
-    if(CN_DISCLOSURE_VERIFIED)upstream={lookup:'ok',cn:parseDisclosureDate(raw),sha256:stored.sha256};
+    // code 0 alone proves nothing: data:null, a missing column or a partial page (has_more; offset paging is not order-stable, plan 2 §17) is not a schedule
+    if(!CN_REQUIRED_FIELDS.every(f=>raw.fields.includes(f))||!Array.isArray(raw.items)){upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='bad_shape';}
+    else if(raw.hasMore){upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='has_more';}
+    else if(CN_DISCLOSURE_VERIFIED)upstream={lookup:'ok',cn:parseDisclosureDate(raw),sha256:stored.sha256};
     else{upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='unverified';}
    }
   }catch(e){if(e instanceof RawStoreError)throw e;scheduleReason=e instanceof TushareError&&e.code===-1?'no_token':e instanceof Error&&(e.message==='no_ts_code')?'no_ts_code':'error';}
@@ -181,6 +196,7 @@ async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string
  let rows=computeExpectations({profile,categories,filings,upstream,today});
  // US: coverage is per expected period (plan audit Q1); positive evidence is never discarded.
  if(upstream.lookup==='ok'&&market==='US')rows=applyUpstreamCoverage(rows,upstream.us??[]);
+ if(upstream.lookup==='ok'&&market==='CN')rows=applyCnCoverage(rows,upstream.cn??[]);
  const shown=await display(deps.tables,issuerId,scope,market,today);
  // US: a positive-evidence row cites the submissions page that holds its entry (historical pages have their own bytes); the manifest lists every page used
  // keyed by (accession, filingDate): conflicting copies of one accession can sit on different pages and the selected copy is the one whose date is upstream_filed_date
diff --git a/src/lib/dq/disclosure-fixtures.test.ts b/src/lib/dq/disclosure-fixtures.test.ts
index 1b5afb55..7b63a209 100644
--- a/src/lib/dq/disclosure-fixtures.test.ts
+++ b/src/lib/dq/disclosure-fixtures.test.ts
@@ -32,7 +32,11 @@ describe.each(['600519.SH','000333.SZ'])('recorded disclosure_date %s',ts=>{
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(meta.sha256);
   expect(meta).toMatchObject({api:'disclosure_date',params:{ts_code:ts},fields:DISCLOSURE_FIELDS,code:0});
   expect(data.fields.join(',')).toBe(DISCLOSURE_FIELDS);
-  expect(JSON.stringify(meta)).not.toMatch(/token/i);
+  // no secrets in either file: no "token" key/text, and (when the secret is loaded) never its value
+  for(const text of [bytes.toString('utf8'),JSON.stringify(meta)]){
+   expect(text).not.toMatch(/token/i);
+   if(process.env.TUSHARE_TOKEN)expect(text).not.toContain(process.env.TUSHARE_TOKEN);
+  }
  });
  it('parseDisclosureDate reads every recorded row into ISO dates',()=>{
   const rows=parseDisclosureDate(data);
@@ -47,7 +51,7 @@ describe.each(['600519.SH','000333.SZ'])('recorded disclosure_date %s',ts=>{
   }
   expect(new Set(rows.map(r=>r.end_date)).size).toBe(rows.length);   // one row per period end
  });
- it('actual_date is the announcement date of the periodic report: equals income rt1 ann_date for every period both files cover',()=>{
+ it('actual_date is the announcement date of the periodic report: equals the earliest income rt1 ann_date for every period both files cover',()=>{
   const ann=incomeAnn(ts);
   const rows=parseDisclosureDate(data);
   let compared=0;
@@ -55,7 +59,7 @@ describe.each(['600519.SH','000333.SZ'])('recorded disclosure_date %s',ts=>{
    const a=ann.get(r.end_date.replaceAll('-',''));
    if(!a)continue;
    compared++;
-   expect(a.map(iso),r.end_date).toContain(r.actual_date);
+   expect([...new Set(a.map(iso))].sort()[0],r.end_date).toBe(r.actual_date);   // earliest rt1 ann_date = original publication
   }
   expect(compared).toBeGreaterThanOrEqual(40);
  });
// src/lib/dq/calendar-sync.ts
// Filing-calendar writer (spec §6.2; pass protocol T3/U1 via the migration-one functions). One
// ingest_batches row per run (producer filing-calendar, dataset dq.calendar.us|cn). A run claims the
// market's pass (claim_calendar_pass: a new pass freezes its members; an expired lease is taken over;
// a lease held by another worker → this run does nothing, skipped_summary(pass_claimed)). Within the
// budget it processes pending members, then failed members with attempts < 3, in issuer_id order:
// inputs (profile + issuer_filer_categories + filingsForCalendar + upstream list) → computeExpectations →
// replace_filing_expectations (atomic: rows replaced + the issuer profile upserted under the same fence + member done;
// a stale worker therefore writes neither rows nor profile).
// A member whose inputs fail → fail_calendar_member. Any fence_failed stops this worker at once.
// With nothing left to process the pass is settled by finish_calendar_pass (from persisted state only)
// and freshness is recorded: complete → ok, complete_with_failures or a pass older than 2 days → not ok.
// Upstream: US = SEC submissions (raw kept by the fetcher, Task 6); CN = Tushare disclosure_date via
// tushareCallRaw, response bytes into reconcile-raw (T15). The disclosure_date semantics are verified against
// real responses (CN_DISCLOSURE_VERIFIED); with the flag false CN rows would keep upstream_lookup='unavailable'.
import type {SupabaseClient} from '@supabase/supabase-js';
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {TushareError} from '../data/sources/tushare';
import type {TushareRaw} from '../data/sources/tushare';
import type {Budget,FactsDb,Market} from '../facts/types';
import {emptyCounts,finishBatch,startBatch} from './batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
import {recordAttempt} from './freshness';
import {DATASETS} from './datasets';
import {RawStoreError} from './raw-store';
import type {RawStore} from './raw-store';
import {CALENDAR_RULES_VERSION,computeExpectations,filingsWindowStart} from './calendar';
import type {CalendarUpstream,CnScheduleRow,ExpectationRow,FilerCategoryRow,FilingProfile,UsUpstreamEntry} from './calendar';
import type {SubmissionsView} from './filer-categories';

/** Verified 2026-11-06 against real disclosure_date responses (600519.SH, 000333.SZ; docs/audits/2026-11-05-data-foundation-3/verification.md "CN disclosure_date 真实响应核对"): actual_date = periodic-report disclosure date, null while only scheduled. */
export const CN_DISCLOSURE_VERIFIED=true;
export const DISCLOSURE_FIELDS='ts_code,ann_date,end_date,pre_date,actual_date,modify_date';
/** Columns the CN schedule needs: a response without one of them is not a schedule. */
const CN_REQUIRED_FIELDS=['end_date','pre_date','actual_date'] as const;
export const MIN_MEMBER_MS=60_000;
export const MAX_MEMBER_ATTEMPTS=3;
export const PASS_MAX_AGE_MS=2*86_400_000;

// ---------------------------------------------------------------- pass functions (C5)
export interface CalendarPassToken{market:Market;pass_id:string;batch_id:string}
export type CalendarPassErrorCode='fence_failed'|'pass_incomplete'|'member_not_claimable'|'invalid_rows'|'unknown';
export class CalendarPassError extends Error{constructor(public readonly code:CalendarPassErrorCode,message?:string){super(message??code);this.name='CalendarPassError';}}
const PASS_CODES:readonly CalendarPassErrorCode[]=['fence_failed','pass_incomplete','member_not_claimable','invalid_rows'];
/** SQL raises the code as the message (C5); PostgREST and node-postgres both surface it as error.message. */
export function toCalendarPassError(e:{message?:string}):CalendarPassError{
 const head=(e.message??'').split(/[\s:]/,1)[0];
 return new CalendarPassError((PASS_CODES as readonly string[]).includes(head)?head as CalendarPassErrorCode:'unknown',e.message);
}
export interface CalendarPassDb{
 claimPass(market:Market,batchId:string):Promise<CalendarPassToken|null>;
 /** `profile` is upserted in the same fenced transaction (replace_filing_expectations.p_profile); null leaves the stored profile untouched. */
 replaceExpectations(issuer:string,market:Market,rows:ExpectationRow[],token:CalendarPassToken,profile:FilingProfile|null):Promise<number>;
 failMember(token:CalendarPassToken,issuer:string,error:string):Promise<void>;
 finishPass(token:CalendarPassToken):Promise<'complete'|'complete_with_failures'>;
}
/** p_rows payload: every dq_filing_expectations column except issuer_id/market (the function's own args) and computed_at/batch_id (set by the function from now() and the token). */
export const expectationArgs=(rows:ExpectationRow[])=>rows.map(({issuer_id:_i,market:_m,...r})=>r);
/** p_profile payload: the issuer_filing_profiles columns except issuer_id/market (the function's own args). */
export const profileArgs=(p:FilingProfile|null)=>p?(({issuer_id:_i,market:_m,...r})=>r)(p):null;
export function supabaseCalendarPassDb(client:SupabaseClient):CalendarPassDb{
 const c=client as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toCalendarPassError(error);return data as T;};
 return {
  claimPass:(market,batch)=>call<CalendarPassToken|null>('claim_calendar_pass',{p_market:market,p_batch:batch}),
  replaceExpectations:(issuer,market,rows,token,profile)=>call<number>('replace_filing_expectations',{p_issuer:issuer,p_market:market,p_rows:expectationArgs(rows),p_pass_token:token,p_profile:profileArgs(profile)}).then(Number),
  failMember:async(token,issuer,error)=>{await call('fail_calendar_member',{p_pass_token:token,p_issuer:issuer,p_error:error.slice(0,500)});},
  finishPass:(token)=>call<'complete'|'complete_with_failures'>('finish_calendar_pass',{p_pass_token:token}),
 };
}

// ---------------------------------------------------------------- deps and receipt
export interface CalendarSyncDeps{
 tables:TableClient;db:Pick<FactsDb,'filingsForCalendar'>;passes:CalendarPassDb;raw:RawStore;
 /** US upstream + profile source; the production fetcher (Task 6 fetchSubmissions) stores the raw JSON and pages. */
 submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
 /** CN upstream: tushareCallRaw('disclosure_date', {ts_code}, DISCLOSURE_FIELDS). */
 disclosureDate:(tsCode:string,b:Budget)=>Promise<TushareRaw>;
 now:()=>Date;budget:Budget;codeVersion:string|null;
}
export interface CalendarSyncOptions{market:Market;limit:number;triggeredBy:TriggeredBy}
export interface CalendarDetail{pass_id:string|null;issuers_done:number;issuers_failed:number;rows:number;by_deadline_state:Record<string,number>;by_disclosure_state:Record<string,number>;upstream_unavailable:number;no_fiscal_year_end:number;no_category:number;no_profile:number}
export interface CalendarReceipt{batchId:string;status:BatchStatus;passId:string|null;passStatus:'running'|'complete'|'complete_with_failures'|null;counts:BatchCounts;errors:BatchError[];detail:CalendarDetail}

const iso=(d:Date)=>d.toISOString().slice(0,10);
const ymd=(s:unknown)=>typeof s==='string'&&/^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:null;
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
const errText=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);

/** MMDD against a leap-year calendar (0229 allowed; 0231 / 0431 are not days). */
const validMmdd=(s:string|null):s is string=>{
 if(s===null||!/^\d{4}$/.test(s))return false;
 const m=+s.slice(0,2),d=+s.slice(2);
 return m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(2000,m,0)).getUTCDate();   // 2000 is a leap year
};
/** Profile from SEC submissions: regime = latest original annual form; week52 when the fiscal year end is not a month end or a recent annual period end is not one. */
export function profileFromSubmissions(issuerId:string,v:SubmissionsView,today:string):FilingProfile|null{
 const annual=v.entries.filter(e=>e.form==='10-K'||e.form==='20-F'||e.form==='40-F').sort((a,b)=>b.filingDate.localeCompare(a.filingDate));
 if(annual.length===0)return null;
 const fye=validMmdd(v.fiscalYearEnd)?v.fiscalYearEnd:null;
 const lastDay=(mm:number)=>new Date(Date.UTC(2001,mm,0)).getUTCDate();   // 2001: Feb 28 (29 checked below)
 const fyeIsMonthEnd=fye===null||+fye.slice(2)===lastDay(+fye.slice(0,2))||fye==='0229';
 const reportEndsOff=annual.slice(0,3).some(e=>{if(!e.reportDate)return false;const d=new Date(`${e.reportDate}T00:00:00Z`);return new Date(d.getTime()+86_400_000).getUTCDate()!==1;});
 return {issuer_id:issuerId,market:'US',category_raw_current:v.category,regime:annual[0].form as FilingProfile['regime'],fiscal_year_end:fye,week52_pattern:!fyeIsMonthEnd||reportEndsOff,source:'sec_submissions',source_sha256:v.sha256,as_of:today};
}
export const cnProfile=(issuerId:string,today:string):FilingProfile=>({issuer_id:issuerId,market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'cn_statutory',source_sha256:null,as_of:today});
const profileFromRow=(r:Row):FilingProfile=>({issuer_id:String(r.issuer_id),market:r.market as Market,category_raw_current:r.category_raw_current==null?null:String(r.category_raw_current),regime:r.regime as FilingProfile['regime'],fiscal_year_end:r.fiscal_year_end==null?null:String(r.fiscal_year_end),week52_pattern:r.week52_pattern===true,source:String(r.source),source_sha256:r.source_sha256==null?null:String(r.source_sha256),as_of:String(r.as_of)});
const categoryFromRow=(r:Row):FilerCategoryRow=>({issuer_id:String(r.issuer_id),fiscal_year:Number(r.fiscal_year),acceleration:r.acceleration as FilerCategoryRow['acceleration'],smaller_reporting:r.smaller_reporting==null?null:r.smaller_reporting===true,category_raw:String(r.category_raw),source:'ixbrl_dei',accession:String(r.accession),evidence_sha256:String(r.evidence_sha256),as_of:String(r.as_of)});
/** disclosure_date rows from a raw response (field order from the response, dates → ISO). */
export function parseDisclosureDate(raw:Pick<TushareRaw,'fields'|'items'>):CnScheduleRow[]{
 const at=(name:string)=>raw.fields.indexOf(name);
 const [e,a,p,ac,mo]=['end_date','ann_date','pre_date','actual_date','modify_date'].map(at);
 if(e<0)return [];
 return raw.items.flatMap(it=>{const end=ymd(it[e]);return end?[{end_date:end,ann_date:a<0?null:ymd(it[a]),pre_date:p<0?null:ymd(it[p]),actual_date:ac<0?null:ymd(it[ac]),modify_date:mo<0?null:ymd(it[mo])}]:[];});
}

/**
 * Per-period US upstream coverage (plan audit Q1; spec §6.1 "recent 最早条目早于 period_end").
 * The submissions list can prove "nothing filed" for a period only when its earliest entry is before that
 * period's end (every filing for the period comes after the period ends). For each row:
 * - covered (earliest filingDate < period_end) → kept as computed;
 * - positive evidence (received / received_late / filed_not_ingested, i.e. a matching filing or a matching
 *   upstream entry) → kept as computed, whatever the coverage;
 * - otherwise (pending / overdue without coverage) → unknown_upstream, upstream_lookup 'unavailable',
 *   detail.upstream_incomplete=true, detail.upstream_covered_from=earliest filingDate (null for an empty list).
 * Only those rows change; one uncovered old period never rewrites a recent row.
 */
export function applyUpstreamCoverage(rows:ExpectationRow[],entries:readonly UsUpstreamEntry[]):ExpectationRow[]{
 const earliest=entries.map(e=>e.filingDate).sort()[0]??null;
 return rows.map((r):ExpectationRow=>{
  if(earliest!==null&&earliest<r.period_end)return r;
  if(r.disclosure_state!=='pending'&&r.disclosure_state!=='overdue')return r;
  const {estimated_due_passed:_e,...detail}=r.detail;
  return {...r,upstream_lookup:'unavailable',upstream_filed_date:null,disclosure_state:'unknown_upstream',detail:{...detail,upstream_incomplete:true,upstream_covered_from:earliest}};
 });
}

/** CN counterpart of applyUpstreamCoverage: a period is judged from the schedule only if the response has a row for its end_date; without one it stays unknown (missing stays missing). Positive evidence is kept. */
export function applyCnCoverage(rows:ExpectationRow[],schedule:readonly CnScheduleRow[]):ExpectationRow[]{
 const have=new Set(schedule.map(r=>r.end_date));
 return rows.map((r):ExpectationRow=>{
  if((r.disclosure_state!=='pending'&&r.disclosure_state!=='overdue')||have.has(r.period_end))return r;
  const {estimated_due_passed:_e,...detail}=r.detail;
  return {...r,upstream_lookup:'unavailable',upstream_filed_date:null,disclosure_state:'unknown_upstream',detail:{...detail,upstream_incomplete:true,schedule_row_missing:true}};
 });
}

interface MemberResult{profile:FilingProfile|null;rows:ExpectationRow[];upstreamUnavailable:boolean;noProfile:boolean;noFye:boolean;noCategory:boolean;errors:BatchError[];scheduleReason?:string}
async function display(tables:TableClient,issuerId:string,scope:Row|undefined,market:Market,today:string):Promise<{ticker:string|null;name:string|null}>{
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 let ticker:string|null=market==='CN'?(scope?.fetch_key==null?null:String(scope.fetch_key)):null;
 if(market==='US'){const secs=(await selectAll(tables,'issuer_securities',{issuer_id:issuerId},'ticker')).filter(r=>isCurrentSecurity(r,today));ticker=String((secs.find(r=>r.is_primary===true)??secs[0])?.ticker??'')||null;}
 const name=issuer?(issuer.canonical_name_en??issuer.canonical_name_zh??null) as string|null:null;
 return {ticker,name};
}

async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string,today:string):Promise<MemberResult>{
 const [scope]=await deps.tables.select('fact_sync_scope',{issuer_id:issuerId,market},{limit:1});
 const fetchKey=scope?.fetch_key==null?'':String(scope.fetch_key);
 const errors:BatchError[]=[];
 let profile:FilingProfile|null=null;let upstream:CalendarUpstream;let scheduleReason:string|undefined;
 let fresh:FilingProfile|null=null;   // written with the fenced replace call only when computed from a live fetch (stored profile reuse → null)
 let view:SubmissionsView|null=null;
 if(market==='US'){
  try{if(!/^\d{10}$/.test(fetchKey))throw new Error('no_cik');view=await deps.submissions(fetchKey,deps.budget);}
  catch(e){errors.push({code:'sec_unavailable',key:issuerId,message:errText(e)});}
  if(view){
   profile=profileFromSubmissions(issuerId,view,today);
   fresh=profile;
   upstream={lookup:'ok',us:view.entries.map(e=>({form:e.form,reportDate:e.reportDate,filingDate:e.filingDate,accessionNumber:e.accessionNumber})),sha256:view.sha256};
  }else upstream={lookup:'unavailable'};
  if(!profile){const [stored]=await deps.tables.select('issuer_filing_profiles',{issuer_id:issuerId,market},{limit:1});if(stored)profile=profileFromRow(stored);}
 }else{
  profile=fresh=cnProfile(issuerId,today);
  upstream={lookup:'unavailable'};
  try{
   if(!/^\d{6}\.(SH|SZ|BJ)$/.test(fetchKey))throw new Error('no_ts_code');
   const raw=await deps.disclosureDate(fetchKey,deps.budget);
   if(raw.code!==0)scheduleReason=`api_code_${raw.code}`;
   else{
    // a storage failure is a real error (member failed, retryable), not an informational upstream gap
    const stored=await deps.raw.put({kind:'tushare-disclosure',bytes:raw.bytes,contentType:'application/json',meta:{api:'disclosure_date',ts_code:fetchKey}},deps.budget).catch((e:unknown)=>{throw e instanceof RawStoreError?e:new RawStoreError('raw_upload_failed',errText(e));});
    // code 0 alone proves nothing: data:null, a missing column or a partial page (has_more; offset paging is not order-stable, plan 2 §17) is not a schedule
    if(!CN_REQUIRED_FIELDS.every(f=>raw.fields.includes(f))||!Array.isArray(raw.items)){upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='bad_shape';}
    else if(raw.hasMore){upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='has_more';}
    else if(CN_DISCLOSURE_VERIFIED)upstream={lookup:'ok',cn:parseDisclosureDate(raw),sha256:stored.sha256};
    else{upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='unverified';}
   }
  }catch(e){if(e instanceof RawStoreError)throw e;scheduleReason=e instanceof TushareError&&e.code===-1?'no_token':e instanceof Error&&(e.message==='no_ts_code')?'no_ts_code':'error';}
 }
 if(!profile)return {profile:null,rows:[],upstreamUnavailable:upstream.lookup==='unavailable',noProfile:true,noFye:false,noCategory:false,errors,scheduleReason};
 const categories=market==='US'?(await selectAll(deps.tables,'issuer_filer_categories',{issuer_id:issuerId},'fiscal_year')).map(categoryFromRow):[];
 const filings=await deps.db.filingsForCalendar(issuerId,market,{fromPeriodEnd:filingsWindowStart(today)});
 let rows=computeExpectations({profile,categories,filings,upstream,today});
 // US: coverage is per expected period (plan audit Q1); positive evidence is never discarded.
 if(upstream.lookup==='ok'&&market==='US')rows=applyUpstreamCoverage(rows,upstream.us??[]);
 if(upstream.lookup==='ok'&&market==='CN')rows=applyCnCoverage(rows,upstream.cn??[]);
 const shown=await display(deps.tables,issuerId,scope,market,today);
 // US: a positive-evidence row cites the submissions page that holds its entry (historical pages have their own bytes); the manifest lists every page used
 // keyed by (accession, filingDate): conflicting copies of one accession can sit on different pages and the selected copy is the one whose date is upstream_filed_date
 const pageOf=new Map<string,SubmissionsView['entries'][number]>();
 for(const e of view?.entries??[]){const k=`${e.accessionNumber}|${e.filingDate}`;if(!pageOf.has(k))pageOf.set(k,e);}
 const manifest=view?(view.pages??[{name:'recent',sha256:view.sha256}]):null;
 rows=rows.map(r=>{
  const hit=typeof r.detail.upstream_accession==='string'?pageOf.get(`${r.detail.upstream_accession}|${r.upstream_filed_date}`):undefined;
  const cite=hit&&hit.pageSha256?{upstream_sha256:hit.pageSha256,upstream_page:hit.page}:upstream.sha256?{upstream_sha256:upstream.sha256,...(manifest?{upstream_page:manifest[0]?.name??'recent'}:{})}:{};
  return {...r,detail:{...r.detail,display:shown,...cite,...(manifest?{upstream_pages:manifest}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}};
 });
 return {profile:fresh,rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
}

/**
 * Any throw after startBatch (claim RPC, member-list read, failMember/finishPass storage errors, freshness
 * write) must not leave the batch 'running': the error is recorded as run_aborted, the batch is finished
 * (best effort: the storage that failed may be the batch table itself) and the error rethrown. The pass is
 * never finished on an infrastructure error — it stays leased/resumable and the next run takes it over.
 */
export async function runCalendarSync(deps:CalendarSyncDeps,opts:CalendarSyncOptions):Promise<CalendarReceipt>{
 const aborted:{counts:BatchCounts;errors:BatchError[];batchId:string|null}={counts:emptyCounts(),errors:[],batchId:null};
 try{return await runCalendarSyncInner(deps,opts,aborted);}
 catch(e){
  if(aborted.batchId){
   aborted.errors.push({code:'run_aborted',message:errText(e)});
   try{await finishBatch(deps.tables,aborted.batchId,{counts:aborted.counts,errors:aborted.errors},deps.now());}catch{/* batch already finished or storage down: the original error wins */}
  }
  throw e;
 }
}
async function runCalendarSyncInner(deps:CalendarSyncDeps,opts:CalendarSyncOptions,shared:{counts:BatchCounts;errors:BatchError[];batchId:string|null}):Promise<CalendarReceipt>{
 const {market}=opts;

 const {counts,errors}=shared;const schedule:Record<string,number>={};
 const detail:CalendarDetail={pass_id:null,issuers_done:0,issuers_failed:0,rows:0,by_deadline_state:{},by_disclosure_state:{},upstream_unavailable:0,no_fiscal_year_end:0,no_category:0,no_profile:0};
 const {batchId}=await startBatch(deps.tables,{producer:'filing-calendar',dataset:DATASETS.calendar(market),toolVersions:{rules:CALENDAR_RULES_VERSION,market},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy});
 shared.batchId=batchId;
 const finish=async(passId:string|null,passStatus:CalendarReceipt['passStatus']):Promise<CalendarReceipt>=>{
  if(Object.keys(schedule).length)errors.push({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify(schedule)});
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  return {batchId,status,passId,passStatus,counts,errors,detail};
 };
 const token=await deps.passes.claimPass(market,batchId);
 if(!token){errors.push({code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})});return finish(null,null);}
 detail.pass_id=token.pass_id;
 const now=deps.now();const today=iso(now);
 const members=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
 const todo=[...members.filter(m=>m.state==='pending'),...members.filter(m=>m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)].map(m=>String(m.issuer_id)).slice(0,opts.limit);
 let fenced=false;
 for(const [i,issuer] of todo.entries()){
  if(deps.budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:todo.length-i})});break;}
  counts.fetched++;
  let result:MemberResult;
  try{result=await computeMember(deps,market,issuer,today);}
  catch(e){
   counts.failed++;detail.issuers_failed++;errors.push({code:e instanceof RawStoreError?'raw_upload_failed':'member_failed',key:issuer,message:errText(e)});
   try{await deps.passes.failMember(token,issuer,errText(e));}
   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
   continue;
  }
  try{await deps.passes.replaceExpectations(issuer,market,result.rows,token,result.profile);}
  catch(e){
   if(e instanceof CalendarPassError&&e.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}
   counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
   try{await deps.passes.failMember(token,issuer,errText(e));}
   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
   continue;
  }
  counts.inserted++;detail.issuers_done++;detail.rows+=result.rows.length;
  errors.push(...result.errors);
  if(result.scheduleReason)bump(schedule,result.scheduleReason);
  if(result.upstreamUnavailable)detail.upstream_unavailable++;
  if(result.noProfile)detail.no_profile++;
  if(result.noFye)detail.no_fiscal_year_end++;
  if(result.noCategory)detail.no_category++;
  for(const r of result.rows){bump(detail.by_deadline_state,r.deadline_state);bump(detail.by_disclosure_state,r.disclosure_state);}
 }
 if(fenced)return finish(token.pass_id,'running');
 const after=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
 if(after.some(m=>m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)))return finish(token.pass_id,'running');
 let passStatus:'complete'|'complete_with_failures';
 try{passStatus=await deps.passes.finishPass(token);}
 catch(e){if(e instanceof CalendarPassError&&(e.code==='fence_failed'||e.code==='pass_incomplete')){errors.push({code:e.code,key:token.pass_id});return finish(token.pass_id,'running');}throw e;}
 const [pass]=await deps.tables.select('dq_calendar_passes',{market,pass_id:token.pass_id},{limit:1});
 const startedAt=String(pass?.started_at??now.toISOString()),finishedAt=String(pass?.finished_at??deps.now().toISOString());
 const tooLong=Date.parse(finishedAt)-Date.parse(startedAt)>PASS_MAX_AGE_MS;
 await recordAttempt(deps.tables,DATASETS.calendar(market),{ok:passStatus==='complete'&&!tooLong,cadence:'daily',now:deps.now(),detail:{pass_id:token.pass_id,started_at:startedAt,finished_at:finishedAt,status:passStatus,...(tooLong?{pass_too_long:true}:{})}});
 return finish(token.pass_id,passStatus);
}

/** Read-only preview for scripts (no batch, no pass, no profile write; deps.raw should be a memory store): the rows each scope member would get. */
export async function previewCalendar(deps:CalendarSyncDeps,opts:{market:Market;issuerIds?:string[];limit:number}):Promise<{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]>{
 const now=deps.now();
 const scope=(await selectAll(deps.tables,'fact_sync_scope',{market:opts.market},'issuer_id')).filter(r=>opts.issuerIds?opts.issuerIds.includes(String(r.issuer_id)):Number(r.priority)>0);
 const out:{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]=[];
 for(const r of scope.slice(0,opts.issuerIds?undefined:opts.limit)){
  const m=await computeMember(deps,opts.market,String(r.issuer_id),iso(now));
  out.push({issuerId:String(r.issuer_id),rows:m.rows,errors:m.errors});
 }
 return out;
}

exec
/bin/zsh -lc 'cat src/lib/dq/calendar-deps.ts; cat src/lib/dq/calendar.ts; cat package.json; find . -name AGENTS.md -o -name AGENTS.override.md; ls .claude; cat src/lib/tushare/client.ts 2>/dev/null' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 612ms:
// src/lib/dq/calendar-deps.ts
// Production wiring of CalendarSyncDeps (spec §6.2) shared by /api/cron/filing-calendar and
// scripts/dq/calendar-sync.ts: Supabase TableClient / FactsDb / pass functions / reconcile-raw store,
// SEC submissions (Task 6 fetcher: raw JSON and pages kept in the bucket) and Tushare disclosure_date
// through tushareCallRaw (bytes kept by calendar-sync, T15). The budget derives from the deadline.
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient} from '../db/table-client';
import {tushareCallRaw} from '../data/sources/tushare';
import {fetchSubmissions} from '../entities/identifiers/sec-submissions';
import {supabaseFactsDb} from '../facts/db';
import {makeBudget} from '../facts/sync';
import {supabaseRawStore} from './raw-store';
import type {RawStore} from './raw-store';
import {submissionsView} from './filer-categories';
import {filingsWindowStart} from './calendar';
import {DISCLOSURE_FIELDS,supabaseCalendarPassDb} from './calendar-sync';
import type {CalendarSyncDeps} from './calendar-sync';

export interface CalendarDepsOptions{deadline:Date|null;codeVersion:string;now?:()=>Date;/** Reuse an existing admin client (scripts hold one). */admin?:ReturnType<typeof getAdminSupabase>;/** Raw-evidence store for BOTH the returned deps and the submissions fetcher; default = the Supabase bucket. Previews pass a memory store. */raw?:RawStore}
export function productionCalendarDeps(opts:CalendarDepsOptions):CalendarSyncDeps{
 const sb=opts.admin??getAdminSupabase();
 const raw=opts.raw??supabaseRawStore(sb);
 const now=opts.now??(()=>new Date());
 return {
  tables:supabaseTableClient(sb),db:supabaseFactsDb(sb),passes:supabaseCalendarPassDb(sb),raw,
  submissions:async(cik10,b)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:filingsWindowStart(new Date().toISOString().slice(0,10))})),
  disclosureDate:(tsCode,b)=>tushareCallRaw('disclosure_date',{ts_code:tsCode},DISCLOSURE_FIELDS,{budget:b}),
  now,budget:makeBudget(opts.deadline,now),codeVersion:opts.codeVersion,
 };
}
// src/lib/dq/calendar.ts
// Filing-calendar rules (spec §6.1, plan 3 C7; CALENDAR_RULES_VERSION 'filing-calendar/1'). Pure:
// profile + per-fiscal-year filer categories + calendar filings + upstream list + today → one
// expectation row per expected report period. deadline_state (is the due date known?) and
// disclosure_state (was it received / filed upstream?) are orthogonal. Missing stays missing:
// no category for FY N−1 → no_rule; an estimated (52/53-week) period end never counts as overdue;
// an unavailable upstream lookup gives unknown_upstream, never overdue.
// Dates are ISO 'YYYY-MM-DD' strings, compared as text, computed in UTC.
import type {CalendarFiling,Market} from '../facts/types';

export const CALENDAR_RULES_VERSION='filing-calendar/1';
export type ReportKind='10-K'|'10-Q'|'20-F'|'40-F'|'annual'|'semiannual'|'q1'|'q3';
export type DeadlineState='statutory'|'estimated'|'no_rule';
export type DisclosureState='pending'|'overdue'|'filed_not_ingested'|'received'|'received_late'|'unknown_upstream';
export type Acceleration='large_accelerated'|'accelerated'|'non_accelerated';
export interface FilingProfile{issuer_id:string;market:Market;category_raw_current:string|null;regime:'10-K'|'20-F'|'40-F'|'cn';fiscal_year_end:string|null;week52_pattern:boolean;source:string;source_sha256:string|null;as_of:string}
export interface FilerCategoryRow{issuer_id:string;fiscal_year:number;acceleration:Acceleration;smaller_reporting:boolean|null;category_raw:string;source:'ixbrl_dei';accession:string;evidence_sha256:string;as_of:string}
export interface UsUpstreamEntry{form:string;reportDate:string|null;filingDate:string;accessionNumber:string}
/** Dates ISO (calendar-sync converts Tushare YYYYMMDD with ymd()). */
export interface CnScheduleRow{end_date:string;ann_date:string|null;pre_date:string|null;actual_date:string|null;modify_date:string|null}
export interface CalendarUpstream{lookup:'ok'|'unavailable'|'not_applicable';us?:UsUpstreamEntry[];cn?:CnScheduleRow[];sha256?:string}
export interface ExpectationRow{issuer_id:string;market:Market;report_kind:ReportKind;period_end:string;period_end_estimated:boolean;deadline_state:DeadlineState;due_date:string|null;due_rule:string;expected_date:string|null;upstream_lookup:'ok'|'unavailable'|'not_applicable';upstream_filed_date:string|null;disclosure_state:DisclosureState;received_filing_id:string|null;received_date:string|null;profile_as_of:string|null;detail:Record<string,unknown>}

// ---------------------------------------------------------------- dates
const DAY=86_400_000;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const toMs=(iso:string)=>{if(!ISO.test(iso))throw new Error(`invalid_date:${iso}`);return Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10));};
const fromMs=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export const addDays=(iso:string,n:number)=>fromMs(toMs(iso)+n*DAY);
export const diffDays=(a:string,b:string)=>Math.round((toMs(a)-toMs(b))/DAY);
/** Last day of month m (1..12; values outside 1..12 roll over years). */
export const monthEnd=(y:number,m:number)=>fromMs(Date.UTC(y,m,0));
const ym=(iso:string)=>({y:+iso.slice(0,4),m:+iso.slice(5,7)});
export const isMonthEnd=(iso:string)=>{const {y,m}=ym(iso);return monthEnd(y,m)===iso;};
/** The month end closest to the date (52/53-week period ends fall within a week of one). */
export function nearestMonthEnd(iso:string):string{
 const {y,m}=ym(iso);const cur=monthEnd(y,m),prev=monthEnd(y,m-1);
 return Math.abs(diffDays(iso,prev))<Math.abs(diffDays(cur,iso))?prev:cur;
}
/** n months later; a month-end stays a month-end, any other day is clamped to the target month's length. */
export function addMonthsAnchored(iso:string,n:number):string{
 const {y,m}=ym(iso);
 if(isMonthEnd(iso))return monthEnd(y,m+n);
 const last=monthEnd(y,m+n);
 return +iso.slice(8,10)>+last.slice(8,10)?last:`${last.slice(0,8)}${iso.slice(8,10)}`;
}
/** Fiscal year label = calendar year of the month end nearest the fiscal-year-end date (shared with filer-categories). */
export const fiscalYearOfPeriodEnd=(periodEnd:string)=>+nearestMonthEnd(periodEnd).slice(0,4);
/** Rule 12b-2 applicability: periods of fiscal year N use the category from the FY N−1 10-K cover; none → null (no_rule). */
export const applicableCategory=(categories:readonly FilerCategoryRow[],fiscalYear:number):FilerCategoryRow|null=>categories.find(c=>c.fiscal_year===fiscalYear-1)??null;

// ---------------------------------------------------------------- Rule 0-3 roll-forward
/**
 * Federal holidays (5 U.S.C. 6103) as observed — OPM "Federal Holidays" schedule
 * (https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/, checked 2026-11-05).
 * 17 CFR 240.0-3(a): papers due on a Saturday, Sunday or holiday may be filed on the first
 * business day following. 2027-12-31 is the observed New Year's Day 2028 (Jan 1 2028 is a Saturday).
 * Maintained per year; a year without an entry throws (the row becomes no_rule, never a guessed date).
 */
export const SEC_HOLIDAYS:Readonly<Record<number,readonly string[]>>={
 // 2021–2023 per the OPM schedules as published (Juneteenth from 2021; New Year 2022 observed 2021-12-31, Veterans Day 2023 observed Fri 11-10).
 2021:['2021-01-01','2021-01-18','2021-02-15','2021-05-31','2021-06-18','2021-07-05','2021-09-06','2021-10-11','2021-11-11','2021-11-25','2021-12-24','2021-12-31'],
 2022:['2022-01-17','2022-02-21','2022-05-30','2022-06-20','2022-07-04','2022-09-05','2022-10-10','2022-11-11','2022-11-24','2022-12-26'],
 2023:['2023-01-02','2023-01-16','2023-02-20','2023-05-29','2023-06-19','2023-07-04','2023-09-04','2023-10-09','2023-11-10','2023-11-23','2023-12-25'],
 2024:['2024-01-01','2024-01-15','2024-02-19','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-10-14','2024-11-11','2024-11-28','2024-12-25'],
 2025:['2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-10-13','2025-11-11','2025-11-27','2025-12-25'],
 2026:['2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25'],
 2027:['2027-01-01','2027-01-18','2027-02-15','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-10-11','2027-11-11','2027-11-25','2027-12-24','2027-12-31'],
};
/**
 * Additional days EDGAR was closed and the SEC announced filings due that day are timely on the next
 * operational business day: 2024-12-24 (sec.gov/newsroom/whats-new/edgar-closed-24-25-december-2024),
 * 2025-01-09 (national day of mourning), 2025-12-24 and 2025-12-26
 * (sec.gov/newsroom/whats-new/edgar-will-be-closed-december-24-2025-through-december-26-2025).
 */
export const SEC_CLOSURES:Readonly<Record<number,readonly string[]>>={2021:[],2022:[],2023:[],2024:['2024-12-24'],2025:['2025-01-09','2025-12-24','2025-12-26'],2026:[],2027:[]};
export class HolidayTableMissing extends Error{constructor(public readonly year:number){super(`holiday_table_missing:${year}`);this.name='HolidayTableMissing';}}
export function isSecBusinessDay(iso:string):boolean{
 const dow=new Date(toMs(iso)).getUTCDay();
 if(dow===0||dow===6)return false;
 const y=+iso.slice(0,4);const h=SEC_HOLIDAYS[y];
 if(!h)throw new HolidayTableMissing(y);
 return !h.includes(iso)&&!(SEC_CLOSURES[y]??[]).includes(iso);
}
/** Rule 0-3: a due date on a weekend, holiday or closure moves to the next SEC business day. */
export function rollForward(iso:string):string{
 let d=iso;
 for(let i=0;i<=15;i++){if(isSecBusinessDay(d))return d;d=addDays(d,1);}
 throw new Error(`roll_forward_exhausted:${iso}`);
}

// ---------------------------------------------------------------- deadlines
const US_DAYS:Record<Acceleration,{annual:number;quarterly:number;rule:string}>={
 large_accelerated:{annual:60,quarterly:40,rule:'us.laf/1'},accelerated:{annual:75,quarterly:40,rule:'us.acc/1'},non_accelerated:{annual:90,quarterly:45,rule:'us.non/1'},
};
const CN_DUE:Record<'annual'|'q1'|'semiannual'|'q3',(y:number)=>string>={annual:y=>`${y+1}-04-30`,q1:y=>`${y}-04-30`,semiannual:y=>`${y}-08-31`,q3:y=>`${y}-10-31`};
interface Deadline{state:DeadlineState;due:string|null;rule:string;detail:Record<string,unknown>}
const noRule=(rule:string,detail:Record<string,unknown>={}):Deadline=>({state:'no_rule',due:null,rule,detail});
function statutory(rule:string,raw:string,roll:boolean,detail:Record<string,unknown>={}):Deadline{
 if(!roll)return {state:'statutory',due:raw,rule,detail};
 try{return {state:'statutory',due:rollForward(raw),rule,detail};}
 catch(e){if(e instanceof HolidayTableMissing)return noRule('none.holiday_table_missing/1',{...detail,holiday_year:e.year});throw e;}
}
function deadlineOf(regime:FilingProfile['regime'],kind:ReportKind,periodEnd:string,fiscalYear:number,categories:readonly FilerCategoryRow[]):Deadline{
 if(regime==='cn')return statutory(`cn.${kind}/1`,CN_DUE[kind as keyof typeof CN_DUE](+periodEnd.slice(0,4)),false);
 if(regime==='40-F')return noRule('none.40f/1');
 if(regime==='20-F')return statutory('us.20f/1',addMonthsAnchored(periodEnd,4),true);
 const cat=applicableCategory(categories,fiscalYear);
 if(!cat)return noRule('none.no_category_for_fy/1',{fiscal_year:fiscalYear,no_category:true});
 const d=US_DAYS[cat.acceleration];
 return statutory(d.rule,addDays(periodEnd,kind==='10-K'?d.annual:d.quarterly),true,{fiscal_year:fiscalYear,category_fiscal_year:cat.fiscal_year,acceleration:cat.acceleration});
}

// ---------------------------------------------------------------- periods
const ANNUAL:Record<FilingProfile['regime'],ReportKind>={'10-K':'10-K','20-F':'20-F','40-F':'40-F',cn:'annual'};
const CN_KIND:Record<number,ReportKind>={3:'q1',6:'semiannual',9:'q3',12:'annual'};
function kindOf(regime:FilingProfile['regime'],month:number,anchor:number):ReportKind|null{
 if(regime==='cn')return CN_KIND[month]??null;
 if(month===anchor)return ANNUAL[regime];
 return regime==='10-K'?'10-Q':null;
}
/** A filing counts as received only when its run is published and its mapping generation is active (> 0); amendments never match (form_type exact). */
const counts=(f:CalendarFiling,kind:ReportKind)=>f.form_type===kind&&f.run_status==='published'&&f.mapping_gen>0&&f.period_end!==null;
export const MATCH_DAYS=7;
export const PERIODS=6;
/** Slots generated before filtering: PERIODS ended ones plus the current slot and one whose 52/53-week end may still lie after today. */
const SLOT_COUNT=PERIODS+2;
/** Months between slots: 20-F / 40-F issuers file only the annual report, so their slots are a year apart (plan audit P6). */
const strideOf=(regime:FilingProfile['regime'])=>regime==='20-F'||regime==='40-F'?12:3;
/** Earliest period_end the rules can look at (the oldest slot at the widest stride, its ±7-day match window, and one year of 52/53-week estimation basis): calendar-sync passes it as filingsForCalendar fromPeriodEnd and as the submissions coverFrom. */
export function filingsWindowStart(today:string):string{const {y,m}=ym(today);return addDays(monthEnd(y,m-12*SLOT_COUNT-12),-MATCH_DAYS);}

interface Estimate{periodEnd:string;basis:Record<string,unknown>}
/** 52/53-week estimate for the slot ending in grid month-end `grid`: latest observed actual of the same position + 364 days per year, +7 when that lands nearer the anchor month end; no observation → the grid month end. */
export function estimatePeriodEnd(grid:string,observed:readonly {date:string;source:string}[]):Estimate{
 const month=ym(grid).m;
 const prior=observed.filter(o=>ym(nearestMonthEnd(o.date)).m===month&&nearestMonthEnd(o.date)<grid).sort((a,b)=>b.date.localeCompare(a.date))[0];
 if(!prior)return {periodEnd:grid,basis:{source:'month_end'}};
 let e=prior.date;
 for(let i=0;i<10&&nearestMonthEnd(e)<grid;i++){
  const c=addDays(e,364),y=ym(c).y;
  // anchor month end nearest the candidate (a period ending in the first days of the next month belongs to the previous anchor)
  const t=[y-1,y,y+1].map(yy=>monthEnd(yy,month)).sort((a,b)=>Math.abs(diffDays(c,a))-Math.abs(diffDays(c,b)))[0];
  const c7=addDays(c,7);
  e=Math.abs(diffDays(c7,t))<Math.abs(diffDays(c,t))?c7:c;   // ties keep +364
 }
 if(nearestMonthEnd(e)!==grid)return {periodEnd:grid,basis:{source:'month_end',fallback_from:prior.date}};
 return {periodEnd:e,basis:{source:prior.source,from:prior.date}};
}

export function computeExpectations(input:{profile:FilingProfile;categories:FilerCategoryRow[];filings:CalendarFiling[];upstream:CalendarUpstream;today:string}):ExpectationRow[]{
 const {profile,categories,filings,upstream,today}=input;
 const regime=profile.regime;
 const fye=regime==='cn'?'1231':profile.fiscal_year_end;
 if(fye===null)return [];   // spec §8: no fiscal_year_end → no rows (calendar-sync counts no_fiscal_year_end)
 const week52=regime!=='cn'&&profile.week52_pattern;
 const base:Record<string,unknown>={rules_version:CALENDAR_RULES_VERSION};
 // Anchor month: the latest received annual report's actual period end wins over submissions fiscalYearEnd (§6.1).
 let anchor=ym(nearestMonthEnd(`2000-${fye.slice(0,2)}-${fye.slice(2,4)}`)).m;   // '0203' → January, '0102' → December (D2)
 const latestAnnual=filings.filter(f=>counts(f,ANNUAL[regime])).sort((a,b)=>b.period_end!.localeCompare(a.period_end!))[0];
 if(latestAnnual&&regime!=='cn'){
  const pe=latestAnnual.period_end!;const m=ym(nearestMonthEnd(pe)).m;
  if(m!==anchor||(!week52&&pe.slice(5).replace('-','')!==fye))base.fye_mismatch=true;
  anchor=m;
 }
 const usEntries=upstream.lookup==='ok'?upstream.us??[]:[];
 const cnRows=upstream.lookup==='ok'?upstream.cn??[]:[];
 // slot grid, newest first: quarter months around the anchor, or the anchor month only for annual-only regimes
 const stride=strideOf(regime);
 const slots:{grid:string;month:number}[]=[];
 for(let {y,m}=ym(today),i=0;slots.length<SLOT_COUNT&&i<SLOT_COUNT*stride+12;i++,m--){
  if(m<1){m+=12;y--;}
  if(((m-anchor)%stride+stride)%stride===0)slots.push({grid:monthEnd(y,m),month:m});
 }
 const rows:ExpectationRow[]=[];
 const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>;evidenceEnd?:string}[]=[];
 for(const s of slots){
  const kind=kindOf(regime,s.month,anchor);
  if(!kind||!week52){
   const received=kind?earliest(filings.filter(f=>counts(f,kind)&&f.period_end===s.grid)):null;
   planned.push({...s,kind,periodEnd:s.grid,estimated:false,received});
   continue;
  }
  const observed=[...filings.filter(f=>counts(f,kind)).map(f=>({date:f.period_end!,source:'filing'})),...usEntries.filter(e=>e.form===kind&&e.reportDate).map(e=>({date:e.reportDate!,source:'sec_submissions'}))];
  const est=estimatePeriodEnd(s.grid,observed);
  const matches=filings.filter(f=>counts(f,kind)&&Math.abs(diffDays(f.period_end!,est.periodEnd))<=MATCH_DAYS);
  const received=earliest(matches);
  if(received)planned.push({...s,kind,periodEnd:received.period_end!,estimated:false,received,basis:{replaced_estimate:est.periodEnd}});
  else{
   // upstream evidence is matched before the ended-slot cut: an actual report date before today makes the slot ended (D3)
   const evidence=usEntries.filter(e=>e.form===kind&&e.reportDate!==null&&Math.abs(diffDays(e.reportDate,est.periodEnd))<=MATCH_DAYS).map(e=>e.reportDate!).sort()[0];
   planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis,evidenceEnd:evidence});
  }
 }
 // applicable report kinds first, THEN the PERIODS limit (plan audit P6: a slot without a kind never takes a place)
 const ended=planned.filter(p=>p.kind!==null&&(p.periodEnd<today||(p.evidenceEnd!==undefined&&p.evidenceEnd<today))).slice(0,PERIODS);
 for(const p of ended){
  if(!p.kind)continue;
  const monthsAhead=((anchor-p.month)%12+12)%12;
  const fiscalYear=+monthEnd(+p.grid.slice(0,4),p.month+monthsAhead).slice(0,4);
  let dl=deadlineOf(regime,p.kind,p.periodEnd,fiscalYear,categories);
  const detail:Record<string,unknown>={...base,...dl.detail};
  if(p.basis)detail[p.estimated?'estimate_basis':'estimate']=p.basis;
  if(p.estimated&&dl.state==='statutory')dl={...dl,state:'estimated',rule:`${dl.rule}/est`};
  let expected:string|null=null,upstreamFiled:string|null=null,state:DisclosureState;
  const cnRow=regime==='cn'?cnRows.filter(r=>r.end_date===p.periodEnd).sort((a,b)=>(b.ann_date??'').localeCompare(a.ann_date??''))[0]:undefined;
  if(cnRow){expected=cnRow.pre_date;if(cnRow.modify_date)detail.schedule_modified=true;}
  if(p.received){
   state=dl.due!==null&&p.received.available_date>dl.due?'received_late':'received';
  }else if(upstream.lookup==='unavailable'){
   state='unknown_upstream';
  }else{
   const up=regime==='cn'?(cnRow?.actual_date?{date:cnRow.actual_date,accession:null}:null)
    :earliestEntry(usEntries.filter(e=>e.form===p.kind&&e.reportDate!==null&&Math.abs(diffDays(e.reportDate,p.periodEnd))<=MATCH_DAYS));
   if(up){state='filed_not_ingested';upstreamFiled=up.date;if(up.accession)detail.upstream_accession=up.accession;}
   else if(dl.due!==null&&today>dl.due){
    if(dl.state==='statutory')state='overdue';
    else{state='pending';if(dl.state==='estimated')detail.estimated_due_passed=true;}
   }else state='pending';
  }
  rows.push({issuer_id:profile.issuer_id,market:profile.market,report_kind:p.kind,period_end:p.periodEnd,period_end_estimated:p.estimated,
   deadline_state:dl.state,due_date:dl.due,due_rule:dl.rule,expected_date:expected,upstream_lookup:upstream.lookup,upstream_filed_date:upstreamFiled,
   disclosure_state:state,received_filing_id:p.received?.filing_id??null,received_date:p.received?.available_date??null,profile_as_of:profile.as_of,detail});
 }
 return rows;
}
const earliest=(fs:CalendarFiling[])=>[...fs].sort((a,b)=>a.available_date.localeCompare(b.available_date)||a.filing_id.localeCompare(b.filing_id))[0]??null;
const earliestEntry=(es:UsUpstreamEntry[])=>{const e=[...es].sort((a,b)=>a.filingDate.localeCompare(b.filingDate))[0];return e?{date:e.filingDate,accession:e.accessionNumber}:null;};
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
agents
launch.json
scratch

exec
/bin/zsh -lc "ls vitest*; cat vitest.config.*; sed -n '1,100p' src/lib/dq/disclosure-fixtures.test.ts; rg -n 'hasMore|fields:|items:' src/lib/data/sources/tushare.ts; for d in . .claude src src/lib src/lib/dq scripts scripts/dq docs docs/audits docs/audits/2026-11-05-data-foundation-3; do for f in AGENTS.override.md AGENTS.md; do [ "'! -f "$d/$f" ] || cat "$d/$f"; done; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
// Recorded real Tushare disclosure_date responses (2026-11-06, verification.md "CN disclosure_date 真实响应核对"):
// parseDisclosureDate must read every recorded row, and actual_date must equal the announcement date the plan-2
// income rt1 fixtures record for the same period (the semantic check behind CN_DISCLOSURE_VERIFIED).
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {DISCLOSURE_FIELDS,parseDisclosureDate} from './calendar-sync';

const DIR=join(__dirname,'fixtures/tushare');
const FACTS=join(__dirname,'../facts/fixtures/tushare');
const load=(ts:string)=>{
 const bytes=readFileSync(join(DIR,`disclosure_date.${ts}.json`));
 const meta=JSON.parse(readFileSync(join(DIR,`disclosure_date.${ts}.meta.json`),'utf8')) as {api:string;params:{ts_code:string};fields:string;sha256:string;code:number};
 const data=(JSON.parse(bytes.toString('utf8')) as {data:{fields:string[];items:unknown[][]}}).data;
 return {bytes,meta,data};
};
const iso=(s:string)=>`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
/** income rt1 (original publication) ann_date by end_date, from the plan-2 fixture. */
function incomeAnn(ts:string):Map<string,string[]>{
 const file=readdirSync(FACTS).sort().find(f=>f.startsWith(`${ts}.`)&&f.includes('.income.rt1.')&&!f.endsWith('.meta.json'))!;
 const d=(JSON.parse(readFileSync(join(FACTS,file),'utf8')) as {data:{fields:string[];items:unknown[][]}}).data;
 const e=d.fields.indexOf('end_date'),a=d.fields.indexOf('ann_date');
 const m=new Map<string,string[]>();
 for(const it of d.items)m.set(String(it[e]),[...(m.get(String(it[e]))??[]),String(it[a])]);
 return m;
}

describe.each(['600519.SH','000333.SZ'])('recorded disclosure_date %s',ts=>{
 const {bytes,meta,data}=load(ts);
 it('is a verbatim recording: sha256 matches the meta, field list is DISCLOSURE_FIELDS, no secrets',()=>{
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(meta.sha256);
  expect(meta).toMatchObject({api:'disclosure_date',params:{ts_code:ts},fields:DISCLOSURE_FIELDS,code:0});
  expect(data.fields.join(',')).toBe(DISCLOSURE_FIELDS);
  // no secrets in either file: no "token" key/text, and (when the secret is loaded) never its value
  for(const text of [bytes.toString('utf8'),JSON.stringify(meta)]){
   expect(text).not.toMatch(/token/i);
   if(process.env.TUSHARE_TOKEN)expect(text).not.toContain(process.env.TUSHARE_TOKEN);
  }
 });
 it('parseDisclosureDate reads every recorded row into ISO dates',()=>{
  const rows=parseDisclosureDate(data);
  expect(rows).toHaveLength(data.items.length);
  expect(rows.length).toBeGreaterThan(40);
  for(const r of rows){
   expect(r.end_date).toMatch(/^\d{4}-(03-31|06-30|09-30|12-31)$/);
   expect(r.pre_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   expect(r.actual_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   expect(r.ann_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   if(r.modify_date!==null)expect(r.modify_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  expect(new Set(rows.map(r=>r.end_date)).size).toBe(rows.length);   // one row per period end
 });
 it('actual_date is the announcement date of the periodic report: equals the earliest income rt1 ann_date for every period both files cover',()=>{
  const ann=incomeAnn(ts);
  const rows=parseDisclosureDate(data);
  let compared=0;
  for(const r of rows){
   const a=ann.get(r.end_date.replaceAll('-',''));
   if(!a)continue;
   compared++;
   expect([...new Set(a.map(iso))].sort()[0],r.end_date).toBe(r.actual_date);   // earliest rt1 ann_date = original publication
  }
  expect(compared).toBeGreaterThanOrEqual(40);
 });
});
32:    fields: string[];
33:    items: any[][];
48:  fields: string,
610:export interface TushareRaw { bytes: Uint8Array; sha256: string; httpStatus: number; requestId: string | null; code: number; msg: string; fields: string[]; items: unknown[][]; hasMore: boolean }
629:export async function tushareCallRaw(api_name: string, params: Record<string, unknown>, fields: string, opts: TushareRawOptions = {}): Promise<TushareRaw> {
650:    fields: Array.isArray(data?.fields) ? (data!.fields as string[]) : [], items: Array.isArray(data?.items) ? (data!.items as unknown[][]) : [], hasMore: data?.has_more === true,

codex
The injected raw store consistently reaches the submissions fetcher, preventing preview uploads. The CN validation and per-period coverage changes preserve positive filing evidence while avoiding unsupported overdue classifications. No actionable regressions were identified; tests were not executed.
The injected raw store consistently reaches the submissions fetcher, preventing preview uploads. The CN validation and per-period coverage changes preserve positive filing evidence while avoiding unsupported overdue classifications. No actionable regressions were identified; tests were not executed.
