OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b3b3-3d45-7d63-8563-b41740b50d06
--------
user
commit 505d74f
2026-11-07T01:50:32.880065Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 505d74f; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 4703ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-MQ8PQ54n' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xVQw7ygH' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/20-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3z4huc1H' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-G95W5Zdw' (errno=Operation not permitted)
505d74fc docs(data-foundation-3): runbook chapter 9, spec §15 deviations, spec 1/2 pointers, gate and SEC smoke records
 .../implementation-log.md                          |  40 +++++++
 .../2026-11-05-data-foundation-3/verification.md   |  30 ++++++
 docs/runbooks/data-foundation.md                   | 119 ++++++++++++++++++++-
 ...04-data-foundation-2-disclosure-facts-design.md |   8 +-
 ...tion-3-identifiers-and-reconciliation-design.md |  71 +++++++++++-
 .../specs/2026-11-04-data-foundation-design.md     |   4 +-
 6 files changed, 263 insertions(+), 9 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || { echo "$d/$f"; cat "$d/$f"; }; done; done; git show 505d74f --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 4ms:
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wsseaOil' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-tEFSuFrv' (errno=Operation not permitted)
commit 505d74fc3f7075b0999a2139c3fb3ad4e93f8665
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:49:22 2026 -0800

    docs(data-foundation-3): runbook chapter 9, spec §15 deviations, spec 1/2 pointers, gate and SEC smoke records
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/implementation-log.md b/docs/audits/2026-11-05-data-foundation-3/implementation-log.md
index 52cdeca6..b8044d86 100644
--- a/docs/audits/2026-11-05-data-foundation-3/implementation-log.md
+++ b/docs/audits/2026-11-05-data-foundation-3/implementation-log.md
@@ -45,3 +45,43 @@
 | 19a /api/admin/dq 读模型扩展（日历、声明、按对账对、market） | f272c11, 3afa741 | ✅（偏差：按对 distinct natural_key 取最新行计数，执行 14c 裁决） | Approved with notes → 已修（restorable 实时核对限 25 次/并发 4/按请求记忆，超限 restorable_checked:false） | review/challenge P2 每次加载下载全部对账历史 → 迁移一新增 dq_reconcile_failed_counts() 与索引（接口对齐记录 #74，DB 用例与 test:migrations 通过）；P3 未上游行先限 100 再排序 → 查询内按应披露日排序；复审无问题。已知限制：离开样本的键保留最后一次失败计数 | 2 |
 | 18b 生产装配、cron /api/cron/filing-calendar、脚本、vercel.json、日历集成（critical）＋ CN disclosure_date 真实核对 | 46c5b70, f82be60, 363f207, 858b7dd | ✅（5 参 replaceExpectations、64 位 sha、DB 5/5） | Approved with notes → 已修 | challenge P2 预览仍上传生产桶、CN code=0 响应不验形状/has_more 致虚假 overdue → 修复（raw 注入；bad_shape/has_more → unavailable；无排期行的期间保持 unknown_upstream）；复审无问题。真实 Tushare disclosure_date（600519.SH、000333.SZ）：HTTP 200 code=0、无积分错误；actual_date 与利润表 rt1 最早 ann_date 44/44 期一致、仅排期时为 null；ann_date 为排期记录日；modify_date 为修订时间戳 → CN_DISCLOSURE_VERIFIED=true（363f207）。--no-db 网络冒烟 AAPL/COST/WMT 通过 | 2 |
 | 19b /admin/dq 页面面板与 i18n（对照 Claude Design 画布） | bbf66ae, 2af023c | ✅（布局按画布 7 个 artboard；未建画布额外项均非计划/规格要求） | Approved with notes → 已修（无障碍名与 aria-expanded、issuer_not_active 文案、未知 deadline_state 兜底、改正表单共享草稿与焦点回归） | challenge/review P2：成功恢复读错 restore_note 字段、候选/谱系行的通用 Accept 绕过所选项 → 修复（successNoticeCode/conflictCode、quarantineActions 纯函数按原因给按钮与 POST 体并单测；歧义行"采用所选/仅确认知晓/拒绝"，谱系行"按所选保留行接受/拒绝"）；复审无问题。未在浏览器中运行（本 worktree 无 .env.local/管理员会话）→ E9 owner 目检 | 2 |
+
+## Task 20 收尾（2026-11-07）
+
+### 门禁（HEAD dc0b281，含 19b 修复 2af023c）
+
+| 命令 | 结果 |
+|---|---|
+| `npm test` | 341 文件通过、30 跳过；3596 通过、384 跳过（共 3980），0 失败 |
+| `npm run typecheck` | 退出 0 |
+| `npm run lint`（`--max-warnings=0`） | 退出 0 |
+| `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db` | 末次：371 文件通过、3978 通过、2 跳过；`criticalSuites:31`、`criticalPassed:383`、`criticalSkipped:0`、`migrations:52`，无 inventory drift（PostgreSQL 17.10，隔离集群，已清理） |
+| `... npm run test:migrations` | PASS：fresh schema equals seeded upgrade；现有行保留；两个本地集群已停止 |
+
+`test:db` 本机偶发失败：同一 HEAD 上连续三次全量运行，第 1 次 `dq-extensions.integration.test.ts` "read_facts is a wrapper…"（`deadlock detected`），第 2 次 `owned-process-group.test.ts`（真实进程组终止），均与本机其他进程并发运行同时发生（`ps` 见另有 vitest/postgres 进程）；两个文件单独重跑 55/55 通过，第 3 次全量全绿。第 1 次失败的是计划自身的 critical 套件，死锁在并发负载下出现、单独重跑不复现，未在代码里修（不属本任务；若 CI 上复现请回到 Task 8 系套件查锁序）。
+
+### 真实 SEC 冒烟（无库写入，默认 UA，详见 `verification.md` "日历冒烟（2026-11-07 UTC）"）
+
+- `filer-categories.ts --no-db`（AAPL/COST/WMT）：9 行均 `large_accelerated`，`sec.filer_category` 对账 3/3 passed，failed 0。
+- `calendar-sync.ts --market US --no-db`：每家 6 行，错误 0。AAPL、COST 估计行与 SEC `reportDate` 差 0–7 天；**COST 第三季度差 20–21 天（pending，不产生 overdue）**，±7 天对 12/12/12/16 周型申报人不足；WMT 无估计行。
+- US 对账冒烟：`reconcile.ts` 无无库模式，记"需 owner 环境（已同步 facts.us + 样本清单）"，未改脚本。
+
+### 退出条件
+
+| # | 标准 | 结果 | 证据 |
+|---|---|---|---|
+| E1 | FIGI ≥ 95%、ISIN ≥ 90% | 待 owner 首轮 `fill-identifiers --apply` 后 `coverage.ts`（无 OpenFIGI key，按 25 请求/分钟） | — |
+| E2 | 可回填行 `listing_date` 100% | 待 `backfill-windows --apply` | — |
+| E3 | 换码夹具三个 asOf | 通过 | `load-sec` 单测（`npm test` 全绿）、Task 6b |
+| E4 | `us.companyfacts_vs_ixbrl` ≥ 98% | 待 owner 周期回执；离线夹具（AAPL/MSFT，全部 origin=both，例外 0）已通过 `ixbrl-pair.integration.test.ts` | `ixbrl-run-<date>.md`（待产生） |
+| E5 | `cn.tushare_vs_cninfo_pdf_gold` ≥ 95% | **未达成**，不报数字；降级仅因 owner 决策 C（`TUSHARE_TOKEN` 已可用、真实 Tushare 夹具已并入） | runbook 9.5、`verification.md` F3-6 |
+| E6 | 每个范围内发行人有最近已结束期行 | 待 owner `calendar-sync --apply` 回执（`issuers_done`、`by_deadline_state`、`upstream_unavailable`）；`calendar.integration.test.ts` 通过 | — |
+| E7 | `accepted_at` ≥ 99% | **未测量**：`enrich-acceptance --report` 需生产库（owner 动作）；逻辑与 DB 用例通过 | Task 12 |
+| E8 | `ambiguous_value` 选定 → 读接口值与 `based_on_lineage` 变化 | 通过 | `dq-extensions.integration.test.ts`（含 `resolveFactsItem` 分派） |
+| E9 | 下拉含登记表；逾期卡与日历面板按市场筛选、显示 `no_rule`/估计行 | 路由与视图单测通过；**页面未在浏览器运行**（本 worktree 无 `.env.local`/管理员会话），人工视觉验收待 owner | Task 19b 行 |
+
+### 收尾说明
+
+- 文档提交：runbook 第 9 章、规格三 §15（偏差表含接口对齐记录 #69–74 与实施期遗留清单）、规格一 §3.2 ISIN 撤回标注、规格二 §15 指向与分派例外、`verification.md` 冒烟节、本节。无代码改动。
+- 已核对遗留清单中"Task X must…"项均已落地：`use_dedicated_resolver`/`target_not_active` 映射（`facts-resolver.ts`、quarantine 路由）、`recordDateMismatch` 接线（`deps.ts`、`enrich-acceptance.ts`）、iXBRL 对使用共享 `secPacer`（`pair-us-ixbrl.ts`）、vercel.json 含 `reconcile?pair=us.companyfacts_vs_ixbrl` 02:00 条目。
+- 未能核对/未做：Task 8c 的"reconcile_mismatch 项不跨谱系"仅作为限制登记，没有另行证明；2021–2025 SEC 假日表与 `SEC_CLOSURES` 2025-01-09 仍未经 OPM/SEC 公告复核；北交所 `disclosure_date` 未抽查；E1/E2/E4/E6/E7 的生产数字与 E9 视觉验收均待 owner。
diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
index 2e2608f3..8d16e5d0 100644
--- a/docs/audits/2026-11-05-data-foundation-3/verification.md
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -128,3 +128,33 @@
 **时间戳说明。** 夹具 meta 的 `fetched_at` 是脚本取响应时 `new Date().toISOString()` 的 UTC 值：2026-11-07T01:24Z；本机当时 `date -u` 为 2026-11-07 01:31（PST 为 2026-11-06 17:31），所以正确，对应上文标题里的本地日期 2026-11-06。
 
 **保留事项。** 只核对了两只 A 股的整历史与两个报告期的全市场形状；北交所（`.BJ`）未单独抽查。
+
+## 日历冒烟（2026-11-07 UTC，Task 20，真实 SEC，无库写入）
+
+命令（均 `--no-db`，默认 SEC User-Agent `DEFAULT_USER_AGENT`——本机无 `EDGAR_USER_AGENT`；sec.gov 全部 200）：
+
+- `node --import tsx scripts/dq/filer-categories.ts --no-db --cik 320193 --cik 909832 --cik 104169`：退出码 0；`counts`：fetched 9 / inserted 9 / failed 0，`errors: []`；三家各 3 行（FY2024–FY2026）全部 `large_accelerated`（来源 `ixbrl_dei`）；`reconciliations`（`sec.filer_category`）3 条均 `passed:true`。
+- `node --import tsx scripts/dq/calendar-sync.ts --market US --no-db --cik 320193 --cik 909832 --cik 104169`：退出码 0；`errors: []`；每家 6 行。表中"差"= 本规则期末 − SEC submissions 同报告的 `reportDate`（另取 `data.sec.gov/submissions/CIK….json` 的 `recent` 列独立核对）。
+
+| 发行人 | 报告 | 规则期末（实际/估计） | SEC `reportDate` | 差（天） | 行状态 |
+|---|---|---|---|---|---|
+| AAPL | 10-K FY2026 | 2026-10-03（估计） | 2026-09-26 | +7 | filed_not_ingested |
+| AAPL | 10-Q | 2026-06-27（估计） | 2026-06-27 | 0 | filed_not_ingested |
+| AAPL | 10-Q | 2026-03-28（估计） | 2026-03-28 | 0 | filed_not_ingested |
+| AAPL | 10-Q | 2026-01-03（估计） | 2025-12-27 | +7 | filed_not_ingested |
+| AAPL | 10-K FY2025 | 2025-09-27（估计） | 2025-09-27 | 0 | filed_not_ingested |
+| AAPL | 10-Q | 2025-06-28（估计） | 2025-06-28 | 0 | filed_not_ingested |
+| COST | 10-K FY2026 | 2026-08-30（估计） | 2026-08-30 | 0 | filed_not_ingested |
+| COST | 10-Q Q3 | 2026-05-31（估计，月末基准） | 2026-05-10 | +21 | **pending**（未匹配，`estimated_due_passed=true`；SEC 已于 2026-06-03 申报） |
+| COST | 10-Q Q2 | 2026-02-22（估计） | 2026-02-15 | +7 | filed_not_ingested |
+| COST | 10-Q Q1 | 2025-11-30（估计） | 2025-11-23 | +7 | filed_not_ingested |
+| COST | 10-K FY2025 | 2025-08-31（估计） | 2025-08-31 | 0 | filed_not_ingested |
+| COST | 10-Q Q3 | 2025-05-31（估计，月末基准） | 2025-05-11 | +20 | **pending**（同上） |
+| WMT | 6 行（10-K 2026-01-31；10-Q 2025-10-31、2026-04-30、2026-07-31、2025-07-31、2026-10-31） | 全部实际月末，无估计行 | 逐期相同 | 0 | 5 行 filed_not_ingested；10-Q 2026-10-31 `pending`（法定期限 2026-12-10 未到） |
+
+结论（规格三 §14 第 5 问：±7 天是否足够）：
+- AAPL（52/53 周）与 COST 的年报：估计偏差 0–7 天，匹配成功；AAPL 的 10-K 与首季度 10-Q、COST 的 Q1/Q2 恰为 +7，处在 ±7 的边界上。
+- **COST 第三季度估计偏差 20–21 天，超出 ±7**：规则以月末（05-31）作基准，无法跟随 12/12/12/16 周的季度网格，行停在 `pending` 且标 `estimated_due_passed`，不计逾期（不产生假 overdue）。±7 天对 12/12/12/16 周型申报人不够；已作为已知限制登记（规格三 §15.2、runbook 9.8），不为此改规则。
+- WMT（月末财年末 01-31）无估计行，期限均为法定值；AAPL 的 10-K `fiscalYearEnd` 0926 与实际期末一致。
+
+对账 US pair 冒烟：`scripts/dq/reconcile.ts` 没有无库模式（它需要库里已有同步好的事实与样本清单），记"US 对账冒烟需 owner 环境（已同步的 facts.us + 样本清单），见 runbook 9.2 第 8 步"，不为此改脚本。
diff --git a/docs/runbooks/data-foundation.md b/docs/runbooks/data-foundation.md
index cf8edeb6..b7dff84e 100644
--- a/docs/runbooks/data-foundation.md
+++ b/docs/runbooks/data-foundation.md
@@ -1,6 +1,6 @@
-# 数据底座运行手册（DQ 基础 + 发行人主数据 + 披露事实库）
+# 数据底座运行手册（DQ 基础 + 发行人主数据 + 披露事实库 + 标识符与对账）
 
-适用迁移：`supabase/migrations/20261105090000_dq_foundation.sql`、`supabase/migrations/20261105091000_issuers.sql`、`supabase/migrations/20261106090000_financial_facts.sql`。
+适用迁移：`supabase/migrations/20261105090000_dq_foundation.sql`、`supabase/migrations/20261105091000_issuers.sql`、`supabase/migrations/20261106090000_financial_facts.sql`、`supabase/migrations/20261107090000_identifiers_and_dq.sql`、`supabase/migrations/20261107091000_facts_extensions.sql`。
 类型定义：`src/lib/supabase/database.types.ts`（手工维护，与上述迁移逐列对应）。`npm run supabase:types` 只是占位：它打印提示并以退出码 1 结束，**不会**生成类型；改迁移时请同步手改该文件。
 
 ## 1. 表与访问权限
@@ -141,8 +141,8 @@ drop table if exists public.ingest_batches;
 
 - `src/lib/db/pg-table-client.ts` 目前仅用于测试（集成测试），生产路径走 Supabase TableClient。
 - `/api/entities/resolve` 尚无限流。
-- 看板 dataset 下拉选项只来自当前已加载的 freshness/批次/隔离行，未出现在这些行中的隔离数据集选不到；需要一个独立的数据集清单（inventory）查询。
-- FIGI/ISIN 补全与 A/H 股配对放在 plan 3。
+- 看板 dataset 下拉已改为登记表 `DQ_DATASET_INVENTORY` ∪ 已加载行（计划三 Task 2）。
+- FIGI/ISIN 补全与 A/H 股配对：见第 9 章（计划三）。
 
 ## 8. 披露事实库（计划二）
 
@@ -342,3 +342,114 @@ select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where
 - `GET /api/facts/{ticker}/metrics`：无 `asOf` 时读物化行，且仅当所有行 `based_on_rev` = 当前 `fact_state_rev` 才返回，否则 `stale:true` + 无行；新鲜指标 `s-maxage=60`，stale `s-maxage=30`。带 `asOf` 时即时用 `read_facts` 信封派生，`truncated` 时无行。
 - `GET /api/filings/{ticker}`：只返回已发布（`mapping_gen>0`）的 filing，已发布过滤在 `limit` 之前。
 - 票据解析：精确匹配优先（`BRK.A` 不会被规范化成 `BRK`），市场取自实际匹配到的证券行（不是后缀猜测），HK 证券拒绝；合并后的发行人经源证券行重定向。
+
+## 9. 标识符补全、对账与日历新鲜度（计划三）
+
+规格：`docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md`（下称"规格三"）；计划：`docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md`；实施日志：`docs/audits/2026-11-05-data-foundation-3/implementation-log.md`；核对记录：`docs/audits/2026-11-05-data-foundation-3/verification.md`。
+
+### 9.1 迁移
+
+| 文件 | 内容 | 依赖 |
+|---|---|---|
+| `20261107090000_identifiers_and_dq.sql` | `issuer_securities` 方法列与回填；`issuer_identifier_claims` 的 `op/target_key/detail/resolved_*` 与新唯一索引；`dq_reconciliations` 的 `pair/kind/outcome/detail/cycle_*`；`dq_reconcile_cycles`/`dq_reconcile_cursor`；`dq_calendar_passes`/`dq_calendar_pass_members`；`issuer_filer_categories`；`dq_filing_expectations`；`issuer_filing_profiles`；`dq_freshness` 加 `weekly`；`resolve_identifier_claim`；`replace_filing_expectations`（5 参，含 `p_profile`）；`dq_reconcile_failed_counts()`；`set_security_window`/`set_security_identifier`/`set_issuer_identifier`/`patch_security_provenance`/`close_security_absent`/`patch_quarantine_detail`；四个日历遍函数；触发器 `issuers_topology_guard`；桶 `reconcile-raw` | 计划一 |
+| `20261107091000_facts_extensions.sql` | `filings.accepted_at/acceptance_source`；`financial_metrics.based_on_lineage`（回填）；`fact_promote_rows` 附加谓词；`read_filing_facts`、`read_facts_lineage`（`read_facts` 改包装）、`replace_financial_metrics_lineage`（旧函数改包装）、`set_filing_acceptance`、`adopt_candidate`、`restore_reconciled`、`resolve_lineage_conflict`、`apply_reconcile_result`、`open_reconcile_cycle`、`settle_reconcile_cycle`、`record_cycle_freshness`、游标函数、`set_merge`、`set_dissolved` | 计划二 `20261106090000` |
+
+- 两个文件都已登记 `supabase/migrations.lock.json`，**合并后不可再改**；修正一律新迁移（合并前的原地修改已记入实施日志）。
+- 生产按文件名顺序各执行一次（托管库按 owner 的部署流程执行，非超级用户，见 `alpha-production-deploy-and-hosted-db` 记忆）；回填只在加列那次执行，重放不改写已写入的证据（`npm run test:migrations` 在有数据的库上演练两次）。
+- 执行后核对：`select count(*) from issuer_securities where valid_to is not null and valid_to_method is null` = 0；`select count(*) from issuer_identifier_claims where op='legacy'` = 迁移前声明行数；`select count(*) from financial_metrics where jsonb_array_length(based_on_lineage) < 1` = 0。
+- 合并后，`issuers.status/merged_into` 的任何改动只能经 `set_merge`/`set_dissolved`（直接 `update` 抛 `topology_write_forbidden`）。§1.1 的手工合并步骤改为：先手工关闭/转移证券行 → `select public.set_merge('<source>','<target>','<RESEARCH_OWNER_USER_ID>')`。
+
+### 9.2 首轮运行顺序（owner，合并后；cron 与脚本不要同时跑同一数据集）
+
+所有脚本默认 dry-run，`--apply` 才写库；需要 `node --env-file=.env.local --import tsx …`（`tsx` 不读 `.env.local`）。命令行以各脚本的 usage 为准：
+
+1. `scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--as-of YYYY-MM-DD] [--apply --fetched-at <下载时刻 ISO>]`：换码检测、`stale_snapshot`/`incomplete_snapshot` 守卫。
+2. `scripts/entity-keys/fill-identifiers.ts --gleif <lei-isin.csv> --hkex <dir> [--stage A|B|C|D|all] [--gleif-downloaded-at <ISO>] [--issuer <uuid>]... [--apply]`：先 dry-run 看预估报告；OpenFIGI exchCode/securityType 实测核对已完成（`verification.md` Task 3b，无 key），`EXCH_MAP_VERIFIED=true`；之后 `--apply`，再 `scripts/entity-keys/coverage.ts [--segment e1|windows|all] [--out <file.md>]` 得 E1 数字。
+3. `scripts/entity-keys/backfill-windows.ts --apply`，再 `coverage.ts --segment windows` 得 E2。
+4. `scripts/entity-keys/link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]`；产生的 pending 声明在 `/admin/dq` 声明面板审核（§9.6）。
+5. `scripts/facts/enrich-acceptance.ts [--issuer <ticker>]... [--full-history] [--apply]`，再 `--report` 得 E7（需生产库，见 9.9）。
+6. `scripts/dq/filer-categories.ts [--issuer <uuid>]... [--limit n] [--apply]`（每个范围内美股发行人最近 3 份 10-K 封面 → `issuer_filer_categories`；同时记 `sec.filer_category`）。
+7. `scripts/dq/calendar-sync.ts --market US [--issuer <uuid>]... [--limit n] --apply`，再 `--market CN --apply`（一次跑不完就再跑，同一遍会继续）。
+8. `scripts/dq/select-us-sample.ts`（`--fixtures` 或 `--live --universe <path> --out <path>`）生成/核对样本清单（变更走 PR），然后 `scripts/dq/reconcile.ts --pair us.companyfacts_vs_ixbrl [--issuer <ticker>...] --apply`；周期回执 + `docs/audits/2026-11-05-data-foundation-3/ixbrl-run-<date>.md` 得 E4。
+9. `scripts/dq/reconcile.ts --pair facts.lineage_same_day --apply`（无合并时空转）。
+10. `scripts/facts/materialize.ts --pending-hooks`（扫描并补做未完成的物化钩子）。
+
+### 9.3 cron 与顺序（`vercel.json`，UTC）
+
+| 时刻 | 路径 | 说明 |
+|---|---|---|
+| 每 4 小时 :05 | `/api/cron/facts-sync?market=US`、`?market=CN` | 计划二 |
+| 01:00 | `/api/cron/filing-calendar?market=US` | 日历遍；持租约，重复投递无害（`pass_claimed`） |
+| 01:10 | `/api/cron/filing-calendar?market=CN` | **不受** `FACTS_CN_ENABLED` 门控：CN 日历只计算法定节点并如实显示不可查 |
+| 02:00 | `/api/cron/reconcile?pair=us.companyfacts_vs_ixbrl` | 对账周期；新鲜度节奏 weekly |
+| 04:00 | `/api/cron/reconcile?pair=facts.lineage_same_day` | 无成员时空转 |
+| （未加） | `/api/cron/reconcile?pair=cn.tushare_vs_cninfo_pdf_gold` | 门槛：`FACTS_CN_ENABLED` 开启 **且** 黄金集核实完成、`gold-cn.integration.test.ts` 登记且绿（规格三 §5.4 T15） |
+
+顺序意图：日历先于对账；US 对账先于谱系对账。所有 cron 路由：缺 `CRON_SECRET` → 503；缺 `VERCEL_GIT_COMMIT_SHA` → 503 `code_version_unavailable`；HTTP 回执只含码与计数。
+
+### 9.4 owner 事项（规格三 §13）
+
+| 事项 | 默认（计划三按此实施） | 状态 |
+|---|---|---|
+| 决策 A OpenFIGI 许可与展示 | FIGI 入库并公开展示；证券描述只作匹配 | 待 owner 确认 |
+| 决策 B A 股 ISIN 不推导 | 不推导；E1 按实际覆盖 | 待确认 |
+| 决策 C 黄金集抄录/复核人与日期 | — | 未指定 → F3-6 未达成 |
+| 决策 D 对账容差 | 美股精确；A 股印刷精度区间 | 待确认 |
+| 决策 E 样本规则 | 美股 30 家；A 股 min(30, N)，FY2022–FY2025 | 待确认 |
+| 决策 F 对账失败隔离已公开事实 | 隔离（公共接口答案会变） | 待确认 |
+| 决策 G 换码关闭门槛 | 两次缺失、≥ 7 天、不同哈希、submissions 确认 | 待确认 |
+| 决策 H 样本清单授权 | `RESEARCH_OWNER_USER_ID` 的范围 | 待确认 |
+| 决策 I E1 未达标处理 | 按实际数字报告，由 owner 决定 | 待 E1 数字 |
+| 秘密 | `OPENFIGI_API_KEY`（可选，无 key 按 25 请求/分钟；本机无，实施按无 key 路径）、`TUSHARE_TOKEN`（现已可用，仓库外 `~/.config/osbornalpha/secrets.env`；Vercel 环境另需配置）、`EDGAR_USER_AGENT`（真实联系方式；缺省时用 `DEFAULT_USER_AGENT`，sec.gov 实测可用）、`CRON_SECRET` | 见左 |
+
+### 9.5 CN 状态（Tushare 已核对；黄金集仍降级）
+
+- `TUSHARE_TOKEN` 已可用；计划二 §15 1/4/5 的公告日核对与真实 Tushare 夹具已由 PR #104 合入本分支（`docs/audits/2026-11-04-data-foundation-2/17-tushare-verification.md`）。
+- 日历：`src/lib/dq/calendar-sync.ts::CN_DISCLOSURE_VERIFIED=true`（2026-11-06 用 600519.SH、000333.SZ 的真实 `disclosure_date` 响应核对 `actual_date`/`modify_date` 语义，见 `verification.md`，原始响应入桶 `reconcile-raw/tushare-disclosure/<sha256>.json`）。响应缺列/`data:null`（`bad_shape`）、`has_more` → `unavailable`；**CN 槽在 Tushare 没有排期行时保持 `unknown_upstream`，不按法定期限判逾期**（Task 18b 复审后的收紧）。回执 `skipped_summary(schedule_unavailable)` 给出原因计数（`no_token`、`api_code_<n>`、`unverified`、`bad_shape`、`has_more`）。北交所（`.BJ`）未单独抽查。
+- 对账：`gold-cn.integration.test.ts` 不存在；`cn.tushare_vs_cninfo_pdf_gold` 只交付模式、校验器、脚本（`select-cn-sample.ts`、`gold-pdf.ts`）与抄录指引（`docs/runbooks/cn-gold-transcription.md`）。**降级仅因 owner 决策 C（抄录人/复核人未指定）**；E5 记"未达成"，不报数字。解除步骤见 `verification.md` "F3-6"。
+- 事实层：计划二的 `FACTS_CN_ENABLED` 门控不变（缺省开启，CN facts-sync 已在 `vercel.json`）。
+
+### 9.6 声明审核（`/admin/dq` 标识符声明面板，`POST /api/admin/dq/claims/[id]`）
+
+- 体 `{status:'accepted'|'rejected', amend?:{op,target,params}}`；接受在同一事务内按 op 写目标行（`resolve_identifier_claim`）。
+- `evidence_only`（8-A/25、换码观测）：读原文后用面板的修订表单指定证券行、生效日与方法，提交为 `amend`；脚本**从不**预填所有权日期。
+- `legacy`（计划三之前的声明）：页面只显示"需 SQL 处理"，按 §4 用 SQL 处理或拒绝。
+- 409：`already_resolved`、`legacy_claim`、`amend_required`、`value_conflict`、`ownership_conflict`、`already_closed`（项保持 pending）。
+
+### 9.7 隔离项的新处置（`POST /api/admin/dq/quarantine/[id]`）
+
+| 原因 | 接受 | 说明 |
+|---|---|---|
+| `ambiguous_value` | 带 `chosen_candidate_index` → `adopt_candidate` | 不带索引的接受 = 确认知晓（计划二路径）；`stale_evaluation` 自动重评一次后 409 |
+| `reconcile_mismatch` | `restore_reconciled` | 要求最近一次对账通过且当前输入哈希相同，否则 409 `not_passing`（先重跑对账）；`promoted=0` → 200 + `restore_note='no_rows_promoted'` |
+| `lineage_conflict` | 带 `keep_fact_id` → `resolve_lineage_conflict` | 结束后该键该日在谱系内恰一个 `ok` 值，否则回滚 `unresolved`；目标已非活跃 → 409 `target_not_active` |
+| `reconcile_review` | 只改状态 | 舍入印刷的 A 股差异，人工判断 |
+
+通用的 `resolve_facts_quarantine` 对 `reconcile_mismatch`/`lineage_conflict` 抛 `use_dedicated_resolver`（22023），路由映射为 409。物化钩子未完成（崩溃于函数提交与物化之间）→ `scripts/facts/materialize.ts --pending-hooks`。
+
+### 9.8 日历运维
+
+- 遍：每市场同一时刻至多一个未完成遍，租约 10 分钟；成员冻结于建遍时；成员失败 3 次为终态，遍以 `complete_with_failures` 结束（新鲜度 `ok:false`）。查看：`select market, pass_id, status, started_at, finished_at, claimed_by, claim_until from dq_calendar_passes order by started_at desc limit 5;`、`select state, count(*) from dq_calendar_pass_members where market='US' and pass_id='<id>' group by 1;`、失败原因 `select issuer_id, attempts, last_error from dq_calendar_pass_members where state='failed' and pass_id='<id>';`。
+- 遍卡住（租约持有者崩溃）：等 10 分钟租约过期，下一次 cron/脚本自动接管；**不要**手工改成员状态。
+- 状态含义：`overdue` 只来自法定期限已知、期末为实际值、上游查得到且未申报；`filed_not_ingested` = SEC/巨潮已申报但本库未入库（查 facts-sync）；`unknown_upstream` = 上游不可查（含 CN 无排期行）；`no_rule` = 期限未知（无 N−1 财年封面类别、40-F、表外年份）。估计期末（52/53 周）不计逾期，`detail.estimated_due_passed=true` 表示估计期限已过。
+- **已知限制**：52/53 周申报人（如 Costco 12/12/12/16 周）10-Q 期末不按月末网格，估计偏差可达约 3 周（2026-11-07 冒烟：COST 第三季度估计 05-31 对实际 05-10，差 21 天），10-Q 行可能停在 `pending`（带 `estimated_due_passed`）；年报不受影响。AAPL 的年报与部分 10-Q 估计差 7 天（冒烟已匹配）。
+- **每年 12 月**：在 `src/lib/dq/calendar.ts::SEC_HOLIDAYS` 补次年联邦假日（OPM 表），并按 SEC 公告补 `SEC_CLOSURES`；表外年份的行为 `no_rule`（`none.holiday_table_missing/1`）。2021–2025 假日表未经 OPM 复核（OPM 页面只列当前及后续年份）；`SEC_CLOSURES` 的 2025-01-09 未证实（2024-12-24、2025-12-24/26 已证实）。
+- 申报人类别每季度跑一次 `filer-categories.ts --apply`（新 10-K 出现后）；没有 N−1 财年封面类别的发行人在回执 `no_category` 计数里。`issuer_filer_categories` 无可排序列，并发两个运行时较旧快照可能覆盖同财年较新类别（cron 单日一次 + 手工脚本，风险低；彻底修复需加 `accepted_at`/`filing_date` 列与条件写）。
+
+### 9.9 验证记录
+
+| 项 | 位置 | 状态 |
+|---|---|---|
+| OpenFIGI exchCode/securityType/compositeFIGI 实测（无 key）、HKEX 表头、submissions 分页结构 | `verification.md` Task 3a/3b/6a | 2026-11-05/06 已核；`EXCH_MAP_VERIFIED=true` |
+| SEC 假日与 Rule 0-3 来源 | `verification.md` "SEC 假日与 Rule 0-3" | 2026/2027 已对 OPM；2021–2025 未复核 |
+| 52/53 周估计（AAPL、COST、WMT） | `verification.md` "日历冒烟（2026-11-07）" | 已核；±7 天对 COST 第三季度不足 |
+| `disclosure_date` 语义 | `verification.md` "CN disclosure_date 真实响应核对" | 已核，`CN_DISCLOSURE_VERIFIED=true` |
+| E1–E9 | 实施日志末尾"Task 20 收尾"退出条件表 | 见该表 |
+| E7 `enrich-acceptance --report` 实测 | — | 需生产库，owner 动作（未跑） |
+| 规格三 §11 独立验证（标识符抽样 20 条、换码 5 例、日历规则人工核对） | 实施日志 | 待 owner/核对人 |
+
+### 9.10 回滚
+
+- 代码：回退提交即可；cron 先从 `vercel.json` 删除对应项并部署，再回退代码。
+- 数据：计划三新表都可整体清空而不影响计划一/二的读路径（`dq_filing_expectations`、`issuer_filing_profiles`、`issuer_filer_categories`、`dq_calendar_*`、`dq_reconcile_*`）；`dq_reconciliations` 只追加，按 `pair` 删除计划三写入的行即可。**不要**删除 `reconcile-raw` 桶中的对象（证据，内容寻址）。
+- 迁移二的函数改包装（`read_facts`、`replace_financial_metrics`）签名不变，回退代码不需要回退迁移；确需回退迁移时新写迁移恢复计划二的函数体，不改已锁文件。
diff --git a/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md b/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md
index fc3b5637..6d077b39 100644
--- a/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md
+++ b/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md
@@ -558,10 +558,12 @@ Codex 七轮（01/03/05/07/09/11/13）与处置（04/06/08/10/12/14）；独立
 1. Tushare type 1 被更正后公告日是否变化；type 5 公告日；同日并存；`limit/offset/has_more`。
 2. companyfacts 多类别股本 `dei` 条目形态。
 3. 6-K 申报人的 companyfacts 覆盖。
-4. SEC `acceptanceDateTime`（计划三）。
-5. 合并后发行人的事实归属（计划三）。
+4. SEC `acceptanceDateTime`（计划三）。→ 已由规格三 §4.5 实现（`filings.accepted_at`）。
+5. 合并后发行人的事实归属（计划三）。→ 已由规格三 §4.4 实现（读时谱系、`set_merge`）。
 6. `financial_history`（公司研究规格）。
-7. 被隔离候选（无事实行的三种）的人工选定路径。
+7. 被隔离候选（无事实行的三种）的人工选定路径。→ 已由规格三 §4.6 实现（`ambiguous_value` 经 `adopt_candidate`；`odd_duration`/`missing_available_date` 仍只能确认知晓）。
+
+> **分派例外（规格三，2026-11-05）**：§7.3 "facts.* 项的接受全部经 `resolve_facts_quarantine`" 自计划三起有四个例外，分派点为 `src/lib/dq/facts-resolver.ts::resolveFactsItem`：`ambiguous_value` 带 `chosen_candidate_index` → `adopt_candidate`；`reconcile_mismatch` → `restore_reconciled`；`lineage_conflict` 带 `keep_fact_id` → `resolve_lineage_conflict`；`reconcile_review` → 只改状态。其余原因不变。`fact_promote_rows` 增加两条资格谓词（规格三 §3.2），三个提升入口都遵守。
 
 ---
 
diff --git a/docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md b/docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md
index aa712d75..9f4f6005 100644
--- a/docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md
+++ b/docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md
@@ -709,4 +709,73 @@ export const DQ_DATASET_INVENTORY: readonly {dataset; producer; cadence:Cadence}
 
 ## 15. 实施记录与偏差
 
-（计划三落地后补记，格式同规格一 §14。预先登记的接受限制：52/53 周申报人的期末为估计值直至收到申报，且估计行不计逾期；对账右侧不确定性只按印刷/标注精度建区间，且舍入印刷的不一致不自动隔离；换码生效日只来自人工声明，脚本只记观测界。）
+实施计划：`docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md`；实施日志：`docs/audits/2026-11-05-data-foundation-3/implementation-log.md`；核对记录：`docs/audits/2026-11-05-data-foundation-3/verification.md`；运行手册：`docs/runbooks/data-foundation.md` 第 9 章。
+
+预先登记的接受限制：52/53 周申报人的期末为估计值直至收到申报，且估计行不计逾期；对账右侧不确定性只按印刷/标注精度建区间，且舍入印刷的不一致不自动隔离；换码生效日只来自人工声明，脚本只记观测界。
+
+本节列出实施中与正文不一致之处；未列出者无偏差。来源：实施日志各任务行、计划"接口对齐记录"#69–74（执行期指挥者裁决）、实施期遗留清单。
+
+### 15.1 数据模型与 SQL
+
+迁移一/二在合并前原地修改（锁文件 sha 随之更新）；下列函数/列为规格 §3.1 清单之外的新增或改签名。
+
+| 条款 | 偏差 | 原因 | 位置 |
+|---|---|---|---|
+| §3.1 函数清单 | 新增 `set_security_window`（持有区间与 delisting 回填）、`patch_security_provenance`、`close_security_absent`（换码关闭，标记校验）、`set_issuer_identifier`、`set_security_identifier`（守卫写 ISIN/FIGI，同一 UPDATE 按键合并 provenance）、`append_claim_evidence`、`patch_quarantine_detail`（行锁 jsonb 补丁，带 `p_expect_hook_at` CAS） | Codex 审计：读后整体替换丢并发证据/覆盖较新结果、provenance 覆盖丢失、钩子完成覆盖新 pending | 迁移一，`src/lib/db/table-client.ts::callRpc` |
+| §3.2 `resolve_facts_quarantine` | 对 `reconcile_mismatch`/`lineage_conflict` 拒绝（22023 `use_dedicated_resolver`），路由映射 409；`restore_reconciled`/`resolve_lineage_conflict` 另映射 `target_not_active`（P0001）等错误码 | 通用入口会绕过恢复哈希与谱系裁决 | 迁移二、`facts-resolver.ts`、quarantine 路由 |
+| §3.2 周期 | 迁移二新增 `settle_reconcile_cycle`、`record_cycle_freshness`、`open_reconcile_cycle(p_pair,p_cycle_id,p_started_at,p_members,p_pending)`；`pending_members` 元素为 `{issuer_id,market,source}`；`dq_reconcile_cycle:<pair>` advisory 锁必须先于任何行锁（`set_merge` 最先取，`set_dissolved` 不取） | 计划审计 Q2/R1：建周期丢并发登记、与合并死锁 | 迁移二 §12–14、接口对齐记录 #64、#66 |
+| 接口对齐 #73 | `replace_filing_expectations` 改 5 参 `(p_issuer,p_market,p_rows,p_pass_token,p_profile jsonb default null)`，旧 4 参删除；档案在令牌/租约/成员校验后同事务 upsert，TS 不再单独写档案 | 档案写入绕过日历遍栅栏（Codex 18a P2） | 迁移一 |
+| 接口对齐 #74 | 新增 `dq_reconcile_failed_counts() returns table(pair,failed)`（`distinct on (pair,natural_key)` 取最新行）与索引 `dq_reconciliations_pair_key_latest_idx`；`restorable` 实时核对每次加载至多 25 次、并发 4、按请求记忆，超限行 `restorable:false, restorable_checked:false` | 每次看板加载下载全部对账历史（Codex 19a P2） | 迁移一、`/api/admin/dq` |
+| §3.2 `fact_promote_rows` / 守卫测试 | 迁移二重放全套件用串行化咨询锁；重放事务 `deadlock_timeout=50ms`；拓扑守卫测试改用无引用方新发行人 | 并发测试死锁、测试隔离 | `*.integration.test.ts` |
+| §4.1.2 raw 桶 | `reconcile-raw` 桶与 `RawContentType` 增 `application/vnd.ms-excel`→`xls` | HKEX 两份名单是 OLE `.xls`，不是 xlsx（实测） | 迁移一、`raw-store.ts` |
+
+### 15.2 日历（F3-7）
+
+| 日期 | 条款 | 偏差 | 原因 | 位置 |
+|---|---|---|---|---|
+| 2026-11-05 | §6.1 封面类别解析顺序 | 先判 "non-accelerated"，再 "large accelerated"，再 "accelerated filer"；不识别无连字符 "nonaccelerated"（SEC 封面均为 "Non-accelerated Filer"） | "Non-accelerated Filer" 也含 "accelerated filer"，按正文顺序会误判 | `src/lib/dq/filer-categories.ts` |
+| 2026-11-05 | §6.1 "最近 6 个已结束报告期" | 先按适用报告种类过滤再取槽：10-K/CN 以年报月为锚的季度槽；20-F/40-F 只有年报，槽距 12 个月（接口对齐 #62） | 计划审计 P6：年报-only 发行人也得 6 个已结束期 | `calendar.ts::computeExpectations`、`filingsWindowStart` |
+| 2026-11-06 | §6.1 52/53 周估计 | 下一期估计 = 上期实际 + 364 天 = c，在 {c, c+7} 中取离年度锚月月末更近者（平局取 c）；锚月经 `nearestMonthEnd` 归一；回退锚（无已收年报）同样归一；先把上游证据配到槽再选 6 个已结束槽（接口对齐 #69–71）。计划原文"出锚月再 +7"对次月月初结账者错 7 天 | 17a 质量审查与 Codex P2 | `calendar.ts` |
+| 2026-11-05 | §6.1 "最近观测到的同类实际 period_end" | 观测集合 = 已收到的 filing ∪ SEC submissions 同 form 的 `reportDate`；无观测 → 该槽月末作估计；锚月以最近一份已收年报的实际期末优先于 `fiscalYearEnd`，不一致标 `detail.fye_mismatch` | submissions 是一手来源 | `estimatePeriodEnd` |
+| 2026-11-06 | §6.1 Rule 0-3 | `SEC_HOLIDAYS` 覆盖 2021–2027（OPM 观察日）+ `SEC_CLOSURES`；表外年份 `no_rule`（`none.holiday_table_missing/1`）；`rollForward` 超出 15 天上限抛错（#72）。**2021–2025 未经 OPM 复核**（OPM 页面只列当前及后续年份），`SEC_CLOSURES` 的 2025-01-09 未证实 | 不猜日期；20-F 早期财年不应落 `no_rule` | `calendar.ts`、`verification.md` |
+| 2026-11-05 | §6.1 20-F "财年末后 4 个月" | 月末期末 → 4 个月后的月末；非月末 → 同日（超出月长取月末） | 正文未定义 | `addMonthsAnchored` |
+| 2026-11-05 | §6.1 US `upstream_lookup` | 按期间判覆盖（#65）：`最早 filingDate < period_end` 为已覆盖；未覆盖但有正证据的行保持原行，未覆盖且无证据的 `pending`/`overdue` 行改 `unknown_upstream` + `upstream_incomplete` | 一个老期间不应拖垮全部行 | `applyUpstreamCoverage` |
+| 2026-11-06 | §6.1 CN `disclosure_date` | 先以 `CN_DISCLOSURE_VERIFIED=false` 门控；2026-11-06 用真实 Tushare 响应（600519.SH、000333.SZ，TUSHARE_TOKEN 已可用）核对 `actual_date`=实际披露日、`modify_date`=预约修订时间戳、`ann_date`=预约记录日后翻 `true`。响应缺列/`data:null` → `bad_shape`，`has_more` → `unavailable`；**无排期行的 CN 槽保持 `unknown_upstream`，不按法定期限判 overdue**（取代 18b 初版的相反行为）。北交所未抽查 | 正文要求真实响应核实语义；offset 分页在并列行上不稳定 | `calendar-sync.ts`、`verification.md` |
+| 2026-11-05 | §6.2 档案 | submissions 不可用时用已存档案计算（行均 `unknown_upstream`）；无档案 → 不出行（回执 `no_profile`） | 期限规则只依赖档案与类别 | `calendar-sync.ts` |
+| 2026-11-05 | §6.2 cron | CN 日历 cron 不受 `FACTS_CN_ENABLED` 门控 | 日历只计算法定节点并如实显示不可查 | `filing-calendar/route.ts` |
+| 2026-11-05 | §7 看板行 | 日历行 `detail.display={ticker,name}` 由写入端提供 | `TableClient` 无联表 | `calendar-sync.ts`、`dashboard-blocks.ts` |
+| 2026-11-06 | 预览 | `--no-db`/预览模式的原始响应经注入的内存 raw store，不碰生产桶 | Codex 18b P2 | `calendar-sync.ts` |
+
+已知限制：（1）52/53 周申报人（Costco 12/12/12/16 周）10-Q 期末不按月末网格，日历规则对其季报期望偏差可达约 3 周，10-Q 行可能停在 `pending`，年报不受影响（2026-11-07 冒烟实测 COST 第三季度差 21 天，见 `verification.md`）；（2）`issuer_filer_categories` 无可排序列（仅 `as_of`=运行日），并发两个 filer-categories 运行时较旧快照可能覆盖同财年较新 10-K 的类别，后续项为加 `accepted_at`/`filing_date` 列与条件写。
+
+### 15.3 标识符、事实扩展、对账（F3-1…F3-6）
+
+| 条款 | 偏差 | 原因 | 位置 |
+|---|---|---|---|
+| §4.1.1 HKEX 名单 | 工作表声明的 `<dimension>` 是 `A1:R8`（实际 `A1:R17083`），以 `nodim:true` 读取；ISINs-assigned 两份 `.xls` 列名为 `HK Stock Code`/`Stocks`；占位值（`Not Available` 等）= 无 ISIN 不计拒绝；合并后 16 个 `-OLD` 并行柜台剔除（`superseded_counter`） | 实测表头 | `parseHkexList`、`mergeHkexIsins` |
+| §4.1.2 OpenFIGI | 无 API key 实测，`EXCH_MAP_VERIFIED=true`；腾讯 ISIN 另映射 `80700.HK`/`TCTZF`，适配器不选场所，调用方按待挂接 ticker 取候选；`OPENFIGI_API_KEY` 不可用，生产按 25 请求/分钟 | 决策 A 前的无 key 路径 | `openfigi.ts`、`verification.md` |
+| §4.1.5 / 规格一 §3.2 | A 股 ISIN 不由代码推导（规格一 ISIN 行已标"已撤回"） | NSIN 与证券代码无函数关系 | 规格一 §3.2 |
+| §4.2 A+H 配对 | 自动挂接只凭 HKEX ISIN；其余（LEI/名称规则）一律 claim/隔离；HKEX 名单用简称，规则 2 命中率低（5 家抽查 2 家相等） | 精度优先；`-OLD` 柜台不得自动挂接 | `link-ah.ts`、`verification.md` Task 7a |
+| §4.3.3 submissions | `fetchSubmissions` 合并分页，全进程单一 SEC pacer（`secPacer`，120 ms）也覆盖 companyfacts 与 iXBRL 对；`recent` 条数不固定（AAPL 1,004） | SEC 限速 | `shared.ts` |
+| §4.4/§4.5 受理时刻 | 不可解析项（日期不符/歧义/未找到）为信息码不计 `failed`；默认 3 年回看（`--full-history` 解除）；以 `coverFrom` = 最早待补日 − 7 天抓分页；`sec.filing_date_vs_submissions` 的记录器经 `deps.ts` 与脚本接上；**E7 实测需生产库，未跑，owner 动作** | 命令官裁决（Task 12） | `enrich-acceptance.ts` |
+| §4.5 / Task 12–14 | 对账记录（`recordReconciliation`）去重是尽力而为：并发写者可能重复记录 record-only 行，无业务影响；失败计数按对的 distinct `natural_key` 计 | 接受的并发重复 | `record.ts`、#74 |
+| §5 `fact_promote_rows` 之外的分派 | 见规格二 §15 分派例外。`restore_reconciled` 只提升一个发行人的行：reconcile_mismatch 项不跨谱系（经 `use_dedicated_resolver`/`target_not_active` 守卫；未做跨谱系场景的额外证明） | Task 8c 遗留项 | 迁移二 |
+| §5.2 US 黄金对 | 绑定 ticker 在 entry `as_of`（缺省今日）的持有人；无 `as_of` 的条目只记录不隔离；冻结条目变更 → `entry_changed`；谱系冲突延缓只针对参与事实；同键同日出现在同一目标的 US+CN 时 `lineage_key_collision`（文档化限制） | 历史条目不应按今日解析持有人 | `pair-us-gold.ts`、`pair-lineage.ts` |
+| §5.3 iXBRL 对 | 标签回退不一致 → `review_item`（不隔离）；左侧 `precision` 不保留（null）；429 → `sec_rate_limited` 运行失败；失败体入桶；`doc_url` 无查询串；字节上限在下载时强制 | Codex 15a 审计 | `pair-us-ixbrl.ts` |
+| §5.4 CN 黄金对 | 交付模式、校验器、对账对、`select-cn-sample.ts`、`gold-pdf.ts`、抄录指引；**不建黄金文件与 `gold-cn.integration.test.ts`、无 CN 对账 cron**。降级条件现仅为 owner 决策 C（`TUSHARE_TOKEN` 已可用，PR #104 的真实 Tushare 夹具已并入）；E5 未达成，不报数字 | T15 | `verification.md` F3-6 |
+| §3.2 接受/采用 | `ambiguous_value` 采用：全谱系锁与冲突检查；`readFacts` 带 `history:true`，`truncated` → `read_truncated`（#60）；`batch_mismatch` 恢复为 500 | Codex 8b/11 | `facts-resolver.ts` |
+| §7 看板失败计数 | 离开样本的键保留其最后一次失败计数（Task 19a），样本变更后需 owner 注意 | `distinct on` 最新行语义 | `dq_reconcile_failed_counts()` |
+| 性能 | `loadReconciliationsByPair`（若仍被使用）读每对的全部 `dq_reconciliations` 行；失败计数已由 SQL 聚合替代，其余消费者随表增长无界，后续改 SQL 视图/RPC | 当前量级可行 | `dashboard-blocks.ts` |
+
+### 15.4 看板（F3-8）
+
+| 日期 | 条款 | 偏差 | 原因 | 位置 |
+|---|---|---|---|---|
+| 2026-11-05 | §10 F3-3 "claims 面板" | 声明面板与其 i18n 在 Task 19b 实现（不在 Task 7） | 与其他 `/admin/dq` 面板同一画布、同一任务 | `src/app/(app)/admin/dq/panels.tsx` |
+| 2026-11-06 | §7.2 "通过且输入未变时恢复可用" | 页面按 `latest_result.passed` 启用；"输入未变"由服务器在请求时校验（409 `not_passing`） | 客户端无法计算当前输入哈希 | `dashboard-view.ts::quarantineControl` |
+| 2026-11-05 | §9.1 i18n parity 路径 | 实际为 `src/i18n/messages-parity.test.ts` | 仓库既有位置 | — |
+| 2026-11-07 | E9 | 页面按画布 7 个 artboard 落地；**未在浏览器运行**（本 worktree 无 `.env.local`/管理员会话），人工视觉验收是 owner 动作 | 环境 | Task 19b 日志 |
+
+### 15.5 未达成的退出条件
+
+见实施日志"Task 20 收尾"退出条件表：E1/E2/E4/E6/E7 需 owner 首轮运行（生产库）后取数；E5 未达成（决策 C，不报数字）；E9 人工视觉验收待 owner。
diff --git a/docs/superpowers/specs/2026-11-04-data-foundation-design.md b/docs/superpowers/specs/2026-11-04-data-foundation-design.md
index a47c0c06..c0efa8d0 100644
--- a/docs/superpowers/specs/2026-11-04-data-foundation-design.md
+++ b/docs/superpowers/specs/2026-11-04-data-foundation-design.md
@@ -85,10 +85,12 @@ issuer_industry_memberships            -- 时点成分（只建表，行业规
 | CIK ↔ 美股 ticker | SEC `company_tickers.json`、`company_tickers_exchange.json` | 已有 `scripts/entity-keys/parse-sec-tickers.ts`，改为写 `issuers`/`issuer_securities` | 免费，日更 |
 | LEI ↔ ISIN | GLEIF ISIN-LEI 映射 CSV | 已有 `parse-gleif-isin-lei.ts` | 免费 |
 | 统一社会信用代码、巨潮 orgId | 巨潮 | 已有 `fill-cninfo-org-id.ts` | A 股 |
-| ISIN（A 股 CNE…、港股 HK…、美股 US…） | GLEIF 映射；交易所代码表；OpenFIGI 返回 | 新 `scripts/entity-keys/fill-isin.ts` | A 股 ISIN 规则可由代码推导作兜底，并标 `provenance.method='derived'` |
+| ISIN（A 股 CNE…、港股 HK…、美股 US…） | GLEIF 映射；交易所代码表；OpenFIGI 返回 | 新 `scripts/entity-keys/fill-isin.ts` | A 股 ISIN 规则可由代码推导作兜底，并标 `provenance.method='derived'` **（已撤回，2026-11-05：A 股 ISIN 不由代码推导，见规格三 §4.1.5）** |
 | FIGI | OpenFIGI v3 `/mapping`（按 ticker + exchCode，或 ISIN） | 新 `src/lib/entities/providers/openfigi.ts` | 免费 key，限速 25 req/min；使用条款见开放问题 |
 | A/H 双重上市配对 | 港交所 A+H 名单、GLEIF 同 LEI、名称归一 | 新 `scripts/entity-keys/link-ah.ts` | 人工审核 `pending` 项 |
 
+> **已撤回（2026-11-05）**：上表 ISIN 行的"A 股 ISIN 规则可由代码推导作兜底"已撤回——A 股 ISIN 的 NSIN 由境内编码机构分配，与证券代码无函数关系；ISIN 只来自 GLEIF、交易所名单与 OpenFIGI，取不到保持为空。见 `docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md` §4.1.5。FIGI 行与 A/H 配对行由规格三 §4.1–§4.2 实现（脚本名以规格三为准：`fill-identifiers.ts`、`src/lib/entities/identifiers/openfigi.ts`）。
+
 解析规则：同一 LEI 或 CIK → 同一发行人；无 LEI/CIK 时用 USCI；都没有则按名称归一 + 人工确认进 `issuer_identifier_claims(status='pending')`。自动合并只发生在"硬标识符"一致时。
 
 ### 3.3 代码位置

exec
/bin/zsh -lc "nl -ba docs/runbooks/data-foundation.md | sed -n '365,460p'; cat scripts/dq/reconcile.ts | head -150; head -100 scripts/entity-keys/backfill-windows.ts; head -100 scripts/entity-keys/link-ah.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
   365	
   366	1. `scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--as-of YYYY-MM-DD] [--apply --fetched-at <下载时刻 ISO>]`：换码检测、`stale_snapshot`/`incomplete_snapshot` 守卫。
   367	2. `scripts/entity-keys/fill-identifiers.ts --gleif <lei-isin.csv> --hkex <dir> [--stage A|B|C|D|all] [--gleif-downloaded-at <ISO>] [--issuer <uuid>]... [--apply]`：先 dry-run 看预估报告；OpenFIGI exchCode/securityType 实测核对已完成（`verification.md` Task 3b，无 key），`EXCH_MAP_VERIFIED=true`；之后 `--apply`，再 `scripts/entity-keys/coverage.ts [--segment e1|windows|all] [--out <file.md>]` 得 E1 数字。
   368	3. `scripts/entity-keys/backfill-windows.ts --apply`，再 `coverage.ts --segment windows` 得 E2。
   369	4. `scripts/entity-keys/link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]`；产生的 pending 声明在 `/admin/dq` 声明面板审核（§9.6）。
   370	5. `scripts/facts/enrich-acceptance.ts [--issuer <ticker>]... [--full-history] [--apply]`，再 `--report` 得 E7（需生产库，见 9.9）。
   371	6. `scripts/dq/filer-categories.ts [--issuer <uuid>]... [--limit n] [--apply]`（每个范围内美股发行人最近 3 份 10-K 封面 → `issuer_filer_categories`；同时记 `sec.filer_category`）。
   372	7. `scripts/dq/calendar-sync.ts --market US [--issuer <uuid>]... [--limit n] --apply`，再 `--market CN --apply`（一次跑不完就再跑，同一遍会继续）。
   373	8. `scripts/dq/select-us-sample.ts`（`--fixtures` 或 `--live --universe <path> --out <path>`）生成/核对样本清单（变更走 PR），然后 `scripts/dq/reconcile.ts --pair us.companyfacts_vs_ixbrl [--issuer <ticker>...] --apply`；周期回执 + `docs/audits/2026-11-05-data-foundation-3/ixbrl-run-<date>.md` 得 E4。
   374	9. `scripts/dq/reconcile.ts --pair facts.lineage_same_day --apply`（无合并时空转）。
   375	10. `scripts/facts/materialize.ts --pending-hooks`（扫描并补做未完成的物化钩子）。
   376	
   377	### 9.3 cron 与顺序（`vercel.json`，UTC）
   378	
   379	| 时刻 | 路径 | 说明 |
   380	|---|---|---|
   381	| 每 4 小时 :05 | `/api/cron/facts-sync?market=US`、`?market=CN` | 计划二 |
   382	| 01:00 | `/api/cron/filing-calendar?market=US` | 日历遍；持租约，重复投递无害（`pass_claimed`） |
   383	| 01:10 | `/api/cron/filing-calendar?market=CN` | **不受** `FACTS_CN_ENABLED` 门控：CN 日历只计算法定节点并如实显示不可查 |
   384	| 02:00 | `/api/cron/reconcile?pair=us.companyfacts_vs_ixbrl` | 对账周期；新鲜度节奏 weekly |
   385	| 04:00 | `/api/cron/reconcile?pair=facts.lineage_same_day` | 无成员时空转 |
   386	| （未加） | `/api/cron/reconcile?pair=cn.tushare_vs_cninfo_pdf_gold` | 门槛：`FACTS_CN_ENABLED` 开启 **且** 黄金集核实完成、`gold-cn.integration.test.ts` 登记且绿（规格三 §5.4 T15） |
   387	
   388	顺序意图：日历先于对账；US 对账先于谱系对账。所有 cron 路由：缺 `CRON_SECRET` → 503；缺 `VERCEL_GIT_COMMIT_SHA` → 503 `code_version_unavailable`；HTTP 回执只含码与计数。
   389	
   390	### 9.4 owner 事项（规格三 §13）
   391	
   392	| 事项 | 默认（计划三按此实施） | 状态 |
   393	|---|---|---|
   394	| 决策 A OpenFIGI 许可与展示 | FIGI 入库并公开展示；证券描述只作匹配 | 待 owner 确认 |
   395	| 决策 B A 股 ISIN 不推导 | 不推导；E1 按实际覆盖 | 待确认 |
   396	| 决策 C 黄金集抄录/复核人与日期 | — | 未指定 → F3-6 未达成 |
   397	| 决策 D 对账容差 | 美股精确；A 股印刷精度区间 | 待确认 |
   398	| 决策 E 样本规则 | 美股 30 家；A 股 min(30, N)，FY2022–FY2025 | 待确认 |
   399	| 决策 F 对账失败隔离已公开事实 | 隔离（公共接口答案会变） | 待确认 |
   400	| 决策 G 换码关闭门槛 | 两次缺失、≥ 7 天、不同哈希、submissions 确认 | 待确认 |
   401	| 决策 H 样本清单授权 | `RESEARCH_OWNER_USER_ID` 的范围 | 待确认 |
   402	| 决策 I E1 未达标处理 | 按实际数字报告，由 owner 决定 | 待 E1 数字 |
   403	| 秘密 | `OPENFIGI_API_KEY`（可选，无 key 按 25 请求/分钟；本机无，实施按无 key 路径）、`TUSHARE_TOKEN`（现已可用，仓库外 `~/.config/osbornalpha/secrets.env`；Vercel 环境另需配置）、`EDGAR_USER_AGENT`（真实联系方式；缺省时用 `DEFAULT_USER_AGENT`，sec.gov 实测可用）、`CRON_SECRET` | 见左 |
   404	
   405	### 9.5 CN 状态（Tushare 已核对；黄金集仍降级）
   406	
   407	- `TUSHARE_TOKEN` 已可用；计划二 §15 1/4/5 的公告日核对与真实 Tushare 夹具已由 PR #104 合入本分支（`docs/audits/2026-11-04-data-foundation-2/17-tushare-verification.md`）。
   408	- 日历：`src/lib/dq/calendar-sync.ts::CN_DISCLOSURE_VERIFIED=true`（2026-11-06 用 600519.SH、000333.SZ 的真实 `disclosure_date` 响应核对 `actual_date`/`modify_date` 语义，见 `verification.md`，原始响应入桶 `reconcile-raw/tushare-disclosure/<sha256>.json`）。响应缺列/`data:null`（`bad_shape`）、`has_more` → `unavailable`；**CN 槽在 Tushare 没有排期行时保持 `unknown_upstream`，不按法定期限判逾期**（Task 18b 复审后的收紧）。回执 `skipped_summary(schedule_unavailable)` 给出原因计数（`no_token`、`api_code_<n>`、`unverified`、`bad_shape`、`has_more`）。北交所（`.BJ`）未单独抽查。
   409	- 对账：`gold-cn.integration.test.ts` 不存在；`cn.tushare_vs_cninfo_pdf_gold` 只交付模式、校验器、脚本（`select-cn-sample.ts`、`gold-pdf.ts`）与抄录指引（`docs/runbooks/cn-gold-transcription.md`）。**降级仅因 owner 决策 C（抄录人/复核人未指定）**；E5 记"未达成"，不报数字。解除步骤见 `verification.md` "F3-6"。
   410	- 事实层：计划二的 `FACTS_CN_ENABLED` 门控不变（缺省开启，CN facts-sync 已在 `vercel.json`）。
   411	
   412	### 9.6 声明审核（`/admin/dq` 标识符声明面板，`POST /api/admin/dq/claims/[id]`）
   413	
   414	- 体 `{status:'accepted'|'rejected', amend?:{op,target,params}}`；接受在同一事务内按 op 写目标行（`resolve_identifier_claim`）。
   415	- `evidence_only`（8-A/25、换码观测）：读原文后用面板的修订表单指定证券行、生效日与方法，提交为 `amend`；脚本**从不**预填所有权日期。
   416	- `legacy`（计划三之前的声明）：页面只显示"需 SQL 处理"，按 §4 用 SQL 处理或拒绝。
   417	- 409：`already_resolved`、`legacy_claim`、`amend_required`、`value_conflict`、`ownership_conflict`、`already_closed`（项保持 pending）。
   418	
   419	### 9.7 隔离项的新处置（`POST /api/admin/dq/quarantine/[id]`）
   420	
   421	| 原因 | 接受 | 说明 |
   422	|---|---|---|
   423	| `ambiguous_value` | 带 `chosen_candidate_index` → `adopt_candidate` | 不带索引的接受 = 确认知晓（计划二路径）；`stale_evaluation` 自动重评一次后 409 |
   424	| `reconcile_mismatch` | `restore_reconciled` | 要求最近一次对账通过且当前输入哈希相同，否则 409 `not_passing`（先重跑对账）；`promoted=0` → 200 + `restore_note='no_rows_promoted'` |
   425	| `lineage_conflict` | 带 `keep_fact_id` → `resolve_lineage_conflict` | 结束后该键该日在谱系内恰一个 `ok` 值，否则回滚 `unresolved`；目标已非活跃 → 409 `target_not_active` |
   426	| `reconcile_review` | 只改状态 | 舍入印刷的 A 股差异，人工判断 |
   427	
   428	通用的 `resolve_facts_quarantine` 对 `reconcile_mismatch`/`lineage_conflict` 抛 `use_dedicated_resolver`（22023），路由映射为 409。物化钩子未完成（崩溃于函数提交与物化之间）→ `scripts/facts/materialize.ts --pending-hooks`。
   429	
   430	### 9.8 日历运维
   431	
   432	- 遍：每市场同一时刻至多一个未完成遍，租约 10 分钟；成员冻结于建遍时；成员失败 3 次为终态，遍以 `complete_with_failures` 结束（新鲜度 `ok:false`）。查看：`select market, pass_id, status, started_at, finished_at, claimed_by, claim_until from dq_calendar_passes order by started_at desc limit 5;`、`select state, count(*) from dq_calendar_pass_members where market='US' and pass_id='<id>' group by 1;`、失败原因 `select issuer_id, attempts, last_error from dq_calendar_pass_members where state='failed' and pass_id='<id>';`。
   433	- 遍卡住（租约持有者崩溃）：等 10 分钟租约过期，下一次 cron/脚本自动接管；**不要**手工改成员状态。
   434	- 状态含义：`overdue` 只来自法定期限已知、期末为实际值、上游查得到且未申报；`filed_not_ingested` = SEC/巨潮已申报但本库未入库（查 facts-sync）；`unknown_upstream` = 上游不可查（含 CN 无排期行）；`no_rule` = 期限未知（无 N−1 财年封面类别、40-F、表外年份）。估计期末（52/53 周）不计逾期，`detail.estimated_due_passed=true` 表示估计期限已过。
   435	- **已知限制**：52/53 周申报人（如 Costco 12/12/12/16 周）10-Q 期末不按月末网格，估计偏差可达约 3 周（2026-11-07 冒烟：COST 第三季度估计 05-31 对实际 05-10，差 21 天），10-Q 行可能停在 `pending`（带 `estimated_due_passed`）；年报不受影响。AAPL 的年报与部分 10-Q 估计差 7 天（冒烟已匹配）。
   436	- **每年 12 月**：在 `src/lib/dq/calendar.ts::SEC_HOLIDAYS` 补次年联邦假日（OPM 表），并按 SEC 公告补 `SEC_CLOSURES`；表外年份的行为 `no_rule`（`none.holiday_table_missing/1`）。2021–2025 假日表未经 OPM 复核（OPM 页面只列当前及后续年份）；`SEC_CLOSURES` 的 2025-01-09 未证实（2024-12-24、2025-12-24/26 已证实）。
   437	- 申报人类别每季度跑一次 `filer-categories.ts --apply`（新 10-K 出现后）；没有 N−1 财年封面类别的发行人在回执 `no_category` 计数里。`issuer_filer_categories` 无可排序列，并发两个运行时较旧快照可能覆盖同财年较新类别（cron 单日一次 + 手工脚本，风险低；彻底修复需加 `accepted_at`/`filing_date` 列与条件写）。
   438	
   439	### 9.9 验证记录
   440	
   441	| 项 | 位置 | 状态 |
   442	|---|---|---|
   443	| OpenFIGI exchCode/securityType/compositeFIGI 实测（无 key）、HKEX 表头、submissions 分页结构 | `verification.md` Task 3a/3b/6a | 2026-11-05/06 已核；`EXCH_MAP_VERIFIED=true` |
   444	| SEC 假日与 Rule 0-3 来源 | `verification.md` "SEC 假日与 Rule 0-3" | 2026/2027 已对 OPM；2021–2025 未复核 |
   445	| 52/53 周估计（AAPL、COST、WMT） | `verification.md` "日历冒烟（2026-11-07）" | 已核；±7 天对 COST 第三季度不足 |
   446	| `disclosure_date` 语义 | `verification.md` "CN disclosure_date 真实响应核对" | 已核，`CN_DISCLOSURE_VERIFIED=true` |
   447	| E1–E9 | 实施日志末尾"Task 20 收尾"退出条件表 | 见该表 |
   448	| E7 `enrich-acceptance --report` 实测 | — | 需生产库，owner 动作（未跑） |
   449	| 规格三 §11 独立验证（标识符抽样 20 条、换码 5 例、日历规则人工核对） | 实施日志 | 待 owner/核对人 |
   450	
   451	### 9.10 回滚
   452	
   453	- 代码：回退提交即可；cron 先从 `vercel.json` 删除对应项并部署，再回退代码。
   454	- 数据：计划三新表都可整体清空而不影响计划一/二的读路径（`dq_filing_expectations`、`issuer_filing_profiles`、`issuer_filer_categories`、`dq_calendar_*`、`dq_reconcile_*`）；`dq_reconciliations` 只追加，按 `pair` 删除计划三写入的行即可。**不要**删除 `reconcile-raw` 桶中的对象（证据，内容寻址）。
   455	- 迁移二的函数改包装（`read_facts`、`replace_financial_metrics`）签名不变，回退代码不需要回退迁移；确需回退迁移时新写迁移恢复计划二的函数体，不改已锁文件。
// scripts/dq/reconcile.ts
/**
 * Runs one reconciliation pair (spec §5.5).
 *
 *   node --env-file=.env.local --import tsx scripts/dq/reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]
 *
 * Without --apply: dry run — members + evaluate only (right documents go to an in-memory raw store, no
 * batch, no cycle, no result rows, no items); prints one JSON line per expected key
 * {issuer, market, natural_key, outcome, passed, action} and a summary. With --apply: one runReconcile
 * batch (triggered_by 'script', no deadline; code_version = VERCEL_GIT_COMMIT_SHA or git HEAD, refused when
 * unavailable) and the full receipt as JSON. --issuer restricts which members are processed (tickers are
 * resolved with resolveIssuer as of today). --apply for a cn.* pair is refused (exit 2) unless FACTS_CN_ENABLED=1. Exit 0 ok, 1 when the batch
 * is not success or a member failed, 2 on bad arguments.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {memoryRawStore} from '../../src/lib/dq/raw-store';
import {parseReconcileArgs,productionReconcileDeps} from '../../src/lib/dq/reconcile/deps';
import {runReconcile} from '../../src/lib/dq/reconcile/run';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

async function main(){
 const args=parseReconcileArgs(process.argv.slice(2));
 if('exit' in args){console.error(args.message);process.exit(args.exit);}
 const {pair,apply,tickers}=args;
 const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const today=new Date().toISOString().slice(0,10);
 const issuerIds:string[]=[];
 for(const t of tickers){const r=await resolveIssuer(tables,{ticker:t},{today});if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}issuerIds.push(r.issuer_id);}
 const codeVersion=apply?resolveCodeVersion({allowGit:true}):'dry-run';
 if(!codeVersion){console.error('code_version unavailable (VERCEL_GIT_COMMIT_SHA or git HEAD): refusing to apply');process.exit(2);}
 const base=productionReconcileDeps({deadline:null,codeVersion,admin:sb});
 const deps=apply?base:{...base,raw:memoryRawStore()};
 const receipt=await runReconcile(deps,{pair,triggeredBy:'script',dryRun:!apply,...(issuerIds.length?{issuerIds}:{})});
 if(!apply){
  let n=0;
  for(const m of receipt.dryRun??[])for(const r of m.results){n++;console.log(JSON.stringify({issuer:m.issuerId,market:m.market,natural_key:r.natural_key,outcome:r.outcome,passed:r.passed,action:r.action}));}
  console.log(JSON.stringify({pair,dry_run:true,members:receipt.dryRun?.length??0,keys:n}));
  process.exit(0);
 }
 console.log(JSON.stringify(receipt,null,1));
 process.exit(receipt.status==='success'&&receipt.members.every(m=>m.outcome!=='failed')?0:1);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
/**
 * Evidenced holding windows (spec §4.3.2): earliest row per ticker → stocks_universe.list_date,
 * latest open row → delist_date; conflicts are quarantined. A-share and HK universe rows only
 * (US carries no list_date).
 *   npx tsx scripts/entity-keys/backfill-windows.ts [--apply]
 * Dry run (default): prints the plan, writes nothing. --apply records an ingest batch (dataset
 * entities.windows) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {errorMessage} from '../../src/lib/entities/load-sec';
import {SEC_ROW_KEY,WINDOWS_RULES_VERSION,applyWindowBackfill,keysetAll,planWindowBackfill,windowsOutcome,type UniverseDates,type WindowRow} from '../../src/lib/entities/windows';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.windows;
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;

async function load(tables:TableClient){
 const rows:WindowRow[]=(await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY)).map(r=>({
  issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from),valid_to:str(r.valid_to),
  valid_from_method:String(r.valid_from_method),valid_to_method:str(r.valid_to_method),
  provenance:(r.provenance&&typeof r.provenance==='object'?r.provenance:{}) as Record<string,unknown>,
 }));
 const universe=new Map<string,UniverseDates>();
 for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))
  universe.set(String(r.ticker),{ticker:String(r.ticker),list_date:str(r.list_date),delist_date:str(r.delist_date),source:str(r.source),source_updated_at:str(r.source_updated_at)});
 return {rows:rows.filter(r=>universe.has(r.ticker)),universe};
}

async function main(){
 const argv=process.argv.slice(2);
 if(argv.some(a=>a!=='--apply')){console.error('usage: backfill-windows.ts [--apply]');process.exit(2);}
 const tables=supabaseTableClient(getAdminSupabase());
 const asOf=new Date().toISOString().slice(0,10);
 if(!argv.includes('--apply')){
  const {rows,universe}=await load(tables);
  const plan=planWindowBackfill(rows,universe,asOf);
  console.log(JSON.stringify({mode:'dry-run (nothing written; pass --apply)',rows:rows.length,
   changes:{from:plan.changes.filter(c=>c.kind==='from').length,to:plan.changes.filter(c=>c.kind==='to').length},
   conflicts:plan.conflicts.length,unchanged:plan.unchanged,firstConflicts:plan.conflicts.slice(0,10).map(c=>({ticker:c.row.ticker,valid_from:c.row.valid_from,reason:c.reason}))},null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'backfill-windows',dataset:DATASET,toolVersions:{rules:WINDOWS_RULES_VERSION,as_of:asOf}});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{
  const {rows,universe}=await load(tables);
  ({counts,errors}=await applyWindowBackfill(tables,planWindowBackfill(rows,universe,asOf),{batchId,dataset:DATASET}));
 }catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
 finally{
  try{status=await finishBatch(tables,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=windowsOutcome(status,counts);
 await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 process.exitCode=outcome.exitCode;
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
/**
 * A+H linking (spec §4.2.2): rule 1 same LEI (GLEIF ISIN → OpenFIGI HK line → automatic attach at
 * the listing date), rule 2 HKEX list name match (attach_security claims only).
 *   npx tsx scripts/entity-keys/link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]
 * <dir> holds the HKEX files named in HKEX_LIST_FILES: ListOfSecurities.xlsx (names, categories) and the ISIN
 * workbooks (isinsehk.xls, isino.xls); an OpenFIGI HK ticker is attached automatically only when the HKEX ISIN of its stock code equals the
 * ISIN OpenFIGI mapped; every other hit becomes an attach_security claim (a ticker-level FIGI lookup is evidence only).
 * Dry run (default): no batch, nothing written (raw evidence hashed in memory); OpenFIGI is called.
 * --apply refuses while EXCH_MAP_VERIFIED is false (Task 3b) and records an ingest batch
 * (dataset entities.ah-link) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional OPENFIGI_API_KEY.
 */
import {createReadStream,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore,type RawStore} from '../../src/lib/dq/raw-store';
import {filterGleifLines,subsetForLeis} from '../../src/lib/entities/identifiers/gleif';
import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList,type HkexFileId,type HkexListParse} from '../../src/lib/entities/identifiers/hkex-list';
import {NAMES_VERSION} from '../../src/lib/entities/identifiers/names';
import {EXCH_MAP_VERIFIED,EXCH_MAP_VERSION,OPENFIGI_VERSION,groupFigiResults,mapIsins,mapTickers} from '../../src/lib/entities/identifiers/openfigi';
import {applyAhLinks,figiErrorsFromResults,figiHitsFromResults,planAhLinks,selectAhIssuers,type TickerLookup,type UniverseListing} from '../../src/lib/entities/link-ah';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.ahLink;
const USAGE='usage: link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]';
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
function bad():never{console.error(USAGE);process.exit(2);}

async function main(){
 const argv=process.argv.slice(2);
 let gleifPath:string|null=null,hkexDir:string|null=null,apply=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply')apply=true;
  else if(argv[i]==='--gleif')gleifPath=argv[++i]??bad();
  else if(argv[i]==='--hkex')hkexDir=argv[++i]??bad();
  else bad();
 }
 if(!gleifPath||!existsSync(gleifPath)||!hkexDir||!existsSync(hkexDir))bad();
 if(apply&&!EXCH_MAP_VERIFIED){console.error('exch_map_unverified: run the Task 3b OpenFIGI live check first (verification.md)');process.exit(2);}
 const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
 const openOwner=new Map(open.map(r=>[String(r.ticker),String(r.issuer_id)]));
 const issuers=selectAhIssuers((await selectAll(tables,'issuers',{status:'active'},'issuer_id')).map(r=>({
  issuer_id:String(r.issuer_id),lei:str(r.lei),usci:str(r.usci),names:[str(r.canonical_name_en),str(r.canonical_name_zh)].filter((n):n is string=>n!==null)})),
  open.map(o=>({issuer_id:String(o.issuer_id),ticker:String(o.ticker)})));
 const universe=new Map<string,UniverseListing>((await selectAll(tables,'stocks_universe',{market:'HK'},'ticker')).map(r=>[String(r.ticker),{list_date:str(r.list_date),source:str(r.source),source_updated_at:str(r.source_updated_at)}]));
 const leis=new Set(issuers.map(i=>i.lei).filter((l):l is string=>l!==null));
 const lines:string[]=[];
 for await(const l of filterGleifLines(createInterface({input:createReadStream(gleifPath),crlfDelay:Infinity}),leis))lines.push(l);
 const subset=subsetForLeis(lines,leis);
 const hkexParses:HkexListParse[]=[];const hkexBytes=new Map<HkexFileId,Uint8Array>();
 for(const f of HKEX_LIST_FILES){
  const p=join(hkexDir,f.file);
  if(!existsSync(p))continue;
  const b=new Uint8Array(readFileSync(p));
  hkexParses.push(parseHkexList(b,f.id));hkexBytes.set(f.id,b);
 }
 const listParse=hkexParses.find(p=>p.file==='list_of_securities')??null;
 const merged=hkexParses.length?mergeHkexIsins(hkexParses):null;
 const hkexIsins=merged?.hasIsinColumn?merged.byCode:null;

 const run=async(raw:RawStore,batchId:string|null)=>{
  const gleifRaw=await raw.put({kind:'gleif',bytes:new TextEncoder().encode(subset.csv),contentType:'text/csv',meta:{purpose:'ah-link',leis:subset.byLei.size}});
  const hkexRaw=new Map<HkexFileId,{sha256:string;path:string}>();
  for(const p of hkexParses){
   const f=HKEX_LIST_FILES.find(x=>x.id===p.file)!;
   const st=await raw.put({kind:'hkex',bytes:hkexBytes.get(p.file)!,contentType:f.contentType,meta:{file:f.file}});
   hkexRaw.set(p.file,{sha256:st.sha256,path:st.path});
  }
  const deps={fetch,raw,apiKey:process.env.OPENFIGI_API_KEY||null};
  const m=await mapIsins([...new Set([...subset.byLei.values()].flat())].sort(),deps);
  const figiHits=figiHitsFromResults(issuers,subset,m.byKey);
  // OpenFIGI tickers are hints: only an HKEX ISIN equal to the hit's ISIN attaches automatically; a ticker-level lookup is claim evidence for the rest
  const unvalidated=[...new Set(figiHits.filter(h=>h.figi&&!hkexIsins?.has(h.ticker.slice(0,5))).map(h=>h.ticker))].sort();
  const tickerLookup=new Map<string,TickerLookup>();
  let exhausted=m.exhausted,tickerFailures=0;
  if(unvalidated.length&&!exhausted){
   const t=await mapTickers(unvalidated,deps);
   exhausted=t.exhausted;tickerFailures=t.failures.length+t.unprocessed.length;
   for(const [tk,r] of t.byKey){
    if(r.status!=='ok')continue;
    const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
    if(c&&c.groups.length===1)tickerLookup.set(tk,{figi:c.groups[0].figi,level:c.groups[0].level,evidence:r.evidence});
   }
  }
  const listRaw=hkexRaw.get('list_of_securities');
  const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,hkexSuperseded:new Set((merged?.dropped??[]).map(d=>d.stockCode)),tickerLookup,figiErrors:figiErrorsFromResults(issuers,subset,m.byKey),
   hkex:listParse?{rows:listParse.rows,file:listParse.file,sha256:listParse.sha256}:null,
   raw:{gleif:{sha256:gleifRaw.sha256,path:gleifRaw.path},...(listRaw?{hkex:listRaw}:{})}});
  return {plan,exhausted,figiFailures:m.failures.length+m.unprocessed.length+tickerFailures,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
 };
 if(!apply){
  const {plan,exhausted}=await run(memoryRawStore(),null);

exec
/bin/zsh -lc "head -85 scripts/facts/materialize.ts; head -60 scripts/dq/select-us-sample.ts; rg -n 'create table|references.*dq_recon|dq_reconciliations|restore_reconciled' supabase/migrations/20261107091000_facts_extensions.sql | head -45; head -70 scripts/dq/filer-categories.ts; head -60 scripts/dq/calendar-sync.ts; rg -n 'claimed_by|claim_until|last_error|attempts|state ' supabase/migrations/20261107090000_identifiers_and_dq.sql | head -40" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/**
 * Rebuild financial_metrics per issuer (spec §8 materialize).
 *
 *   node --env-file=.env.local --import tsx scripts/facts/materialize.ts --market US|CN (--issuer <ticker>... | --all)
 *   node --env-file=.env.local --import tsx scripts/facts/materialize.ts --pending-hooks
 *
 * --all = every fact_sync_scope row of the market with priority > 0. Each issuer: read_facts
 * envelope → deriveMetrics → replace_financial_metrics under the envelope's state_rev (one retry on
 * stale_computation; truncated reads are refused). Prints one JSON line per issuer. Exit 1 if any
 * issuer failed, 2 on bad arguments.
 *
 * --pending-hooks (alone): finish every unfinished materialisation (src/lib/dq/pending-hooks.ts, spec §4.6 U2): one JSON line
 * per target, then a summary; exit 1 when a target failed, a hook write was rejected or an item has no target (items superseded by a newer pending hook are only counted as skippedStale).
 */
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {runPendingHooks} from '../../src/lib/dq/pending-hooks';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {supabaseFactsDb} from '../../src/lib/facts/db';
import {materialize} from '../../src/lib/facts/derive';
import type {Market} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: materialize.ts --market US|CN (--issuer <ticker>... | --all) | --pending-hooks';

async function main(){
 const argv=process.argv.slice(2);let market:string|undefined,all=false;const tickers:string[]=[];
 if(argv.includes('--pending-hooks')){
  if(argv.length!==1){console.error(USAGE);process.exit(2);}
  const sb=getAdminSupabase();
  const r=await runPendingHooks({db:supabaseFactsDb(sb),tables:supabaseTableClient(sb)});
  for(const t of r.targets)console.log(JSON.stringify(t));
  console.log(JSON.stringify({items:r.items,targets:r.targets.length,failed:r.failed,hookWriteFailed:r.hookWriteFailed,skippedStale:r.skippedStale,untargeted:r.untargeted}));
  process.exit(r.failed>0||r.hookWriteFailed>0||r.untargeted.length>0?1:0);
 }
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--market'&&v){market=v;i++;}
  else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else if(x==='--all')all=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if((market!=='US'&&market!=='CN')||(all===(tickers.length>0))){console.error(USAGE);process.exit(2);}
 const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const db=supabaseFactsDb(sb);
 const today=new Date().toISOString().slice(0,10);
 let issuers:{issuerId:string;label:string}[];
 if(all){
  issuers=(await selectAll(tables,'fact_sync_scope',{market},'issuer_id')).filter(r=>Number(r.priority)>0).map(r=>({issuerId:String(r.issuer_id),label:String(r.fetch_key)}));
 }else{
  issuers=[];
  for(const t of tickers){
   const r=await resolveIssuer(tables,{ticker:t},{today});
   if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}
   issuers.push({issuerId:r.issuer_id,label:t});
  }
 }
 let failed=0;
 for(const {issuerId,label} of issuers){
  try{
   const r=await materialize(db,issuerId,market as Market,{today});
   console.log(JSON.stringify({issuer:issuerId,label,market,...r}));
  }catch(e){
   failed++;
   console.log(JSON.stringify({issuer:issuerId,label,market,error:e instanceof Error?e.message:String(e)}));
  }
 }
 console.log(JSON.stringify({issuers:issuers.length,failed}));
 process.exit(failed>0?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
// scripts/dq/select-us-sample.ts
/**
 * Builds the US iXBRL sample manifest (spec §5.3).
 *
 *   npx tsx scripts/dq/select-us-sample.ts --fixtures [--out src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json] [--generated-at <ISO>]
 *   node --env-file=.env.local --import tsx scripts/dq/select-us-sample.ts --live --universe <sp500 payload.json> --out <path> [--n 30]
 *
 * --fixtures (offline, deterministic): plan 2's companyfacts fixtures of AAPL and MSFT and the recorded trimmed
 * primary documents of their FY2023 10-Ks (record-ixbrl-fixture.ts) → selection 'fixture/1', sinceYear 2016.
 * doc_sha256 = the SOURCE document sha256 from the recording meta (the trimmed copy differs; the pair then marks
 * detail.right.doc_sha_mismatch); is_inline_xbrl, submissions_category and primary_document come from the
 * recorded submissions entry.
 * --live (network, never in CI; logic in reconcile/us-sample-live.ts; --raw-dir <dir> or Supabase retains the exact
 * companyfacts/submissions/document bytes, recorded in filing.provenance; a retention failure aborts): candidates = universe constituents ∩ SEC company_tickers.json (ticker → CIK), deduplicated by CIK;
 * required = the US tickers of plan2.json; per candidate the submissions JSON gives fiscalYearEnd, category,
 * exchanges and recent filings; pickSample(n) applies the quotas; per picked issuer: regime = latest annual form
 * (10-K or 20-F); filings = latest inline 10-K + latest inline 10-Q, or latest inline 20-F; companyfacts and each
 * primary document are fetched and buildSampleFiling derives the keys → selection 'live/1'. A filing whose sides
 * are too small is skipped with a warning; unmet quotas are printed and give exit code 1 (the file is still
 * written for review; the FINAL manifest is re-checked for issuer count, mandatory tickers, quotas, 10-K+10-Q / 20-F coverage).
 * The manifest is validated before it is written. Exit 0 ok, 1 on failure or unmet quota, 2 on bad arguments.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fetchCompanyFacts} from '../../src/lib/facts/providers/edgar-companyfacts';
import {budgetFor,secPacer,snapshotOf} from '../../src/lib/facts/providers/shared';
import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
import {US_GOLD_PATH,usGoldEntries} from '../../src/lib/dq/reconcile/pair-us-gold';
import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,buildSampleFiling,validateUsSample} from '../../src/lib/dq/reconcile/us-sample';
import type {SampleIssuer,UsSample} from '../../src/lib/dq/reconcile/us-sample';
import {MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
import {liveSample} from '../../src/lib/dq/reconcile/us-sample-live';
import type {LiveInput,LiveResult} from '../../src/lib/dq/reconcile/us-sample-live';
import {rawStoreFor} from '../../src/lib/dq/raw-dir-store';

const USAGE='usage: select-us-sample.ts (--fixtures [--out <path>] [--generated-at <ISO>] | --live --universe <path> --out <path> [--raw-dir <dir>] [--n 30])';
const FIXTURE_SINCE_YEAR=2016;
const FIXTURES=[
 {ticker:'AAPL',cik:'320193',accn:'0000320193-23-000106',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
 {ticker:'MSFT',cik:'789019',accn:'0000950170-23-035122',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
] as const;
interface RecordingMeta{source_url:string;source_sha256:string;submissions:{form:string|null;reportDate:string|null;primaryDocument:string;isInlineXBRL:boolean;category:string|null}}

function fixtureSample(generatedAt:string):UsSample{
 const issuers:SampleIssuer[]=FIXTURES.map(fx=>{
  const meta=JSON.parse(readFileSync(`${fx.doc}.meta.json`,'utf8')) as RecordingMeta;
  const filing=buildSampleFiling({cik:fx.cik,accn:fx.accn,form:meta.submissions.form??'10-K',period_end:meta.submissions.reportDate,primary_document:meta.submissions.primaryDocument,doc_url:meta.source_url,
   is_inline_xbrl:meta.submissions.isInlineXBRL,submissions_category:meta.submissions.category,companyfacts:snapshotOf(new Uint8Array(readFileSync(fx.companyfacts)),{source:'edgar'}),
   doc:new Uint8Array(readFileSync(fx.doc)),doc_sha256:meta.source_sha256,sinceYear:FIXTURE_SINCE_YEAR});
  return {cik:fx.cik,ticker:fx.ticker,regime:'10-K',filings:[filing]};
 });
 return {schema:US_SAMPLE_SCHEMA,generated_at:generatedAt,selection:'fixture/1',issuers};
}

const UA=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
async function get(url:string):Promise<Uint8Array>{
 await secPacer.admit({budget:budgetFor(120_000),reserveMs:0});
 const res=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(60_000)});
 if(!res.ok)throw new Error(`http_${res.status} ${url}`);
 const declared=Number(res.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_IXBRL_BYTES){await res.body?.cancel();throw new Error(`too_large ${url}`);}
18:--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
420:-- restore_reconciled). Callers hold the scope lock (promote_quarantined, resolve_facts_quarantine,
421:-- restore_reconciled).
601:-- ---------------------------------------------------------------- 9. restore after a passing re-run (spec §3.2 restore_reconciled, §5.6, R1)
609:create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
651:revoke execute on function public.restore_reconciled(uuid, uuid, text, uuid) from public, anon, authenticated;
652:grant execute on function public.restore_reconciled(uuid, uuid, text, uuid) to service_role;
734:  -- migration two: these two reasons close only through restore_reconciled / resolve_lineage_conflict
850:  from public.dq_reconciliations r
856:     or exists (select 1 from unnest(v_keys) k where not exists (select 1 from public.dq_reconciliations r
858:     or exists (select 1 from public.dq_reconciliations r
903:declare c public.dq_reconcile_cursor; v_existing public.dq_reconciliations; f public.financial_facts; v_run text;
939:  -- mirror dq_reconciliations_numeric_sides / _nonnumeric_sides as invalid_result (22023) before anything is read or written
945:  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
1015:  insert into public.dq_reconciliations (id, dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed, batch_id,
// scripts/dq/filer-categories.ts
/**
 * Filer categories from 10-K covers (spec §6.1). Dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/dq/filer-categories.ts [--issuer <issuer_uuid>]... [--limit n] [--apply]
 *   node --import tsx scripts/dq/filer-categories.ts --no-db --cik 320193 [--cik ...]
 *
 * Dry run: reads the US scope, fetches submissions + the latest three 10-K primary documents, parses
 * the covers and prints the rows; documents go to an in-memory raw store; nothing is written. --apply
 * writes the raw documents to bucket reconcile-raw, upserts issuer_filer_categories, records
 * sec.filer_category, finishes an ingest_batches receipt (triggered_by script) and needs a code
 * version. --no-db (with --cik) needs no environment at all: synthetic issuer ids, memory stores.
 * Exit 0 on success, 1 when the batch (or, in a dry run, any issuer) failed, 2 on bad arguments.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {memoryTableClient} from '../../src/lib/db/memory-table-client';
import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
import {fetchSecDocument,submissionsView,syncFilerCategories} from '../../src/lib/dq/filer-categories';
import type {FilerCategoryDeps} from '../../src/lib/dq/filer-categories';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import {supabaseFactsDb} from '../../src/lib/facts/db';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {padCik} from '../../src/lib/facts/providers/shared';
import {makeBudget} from '../../src/lib/facts/sync';
import type {ScopeRow} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: filer-categories.ts [--issuer <uuid>]... [--limit n] [--apply] | --no-db --cik <cik> [--cik ...]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
interface Args{issuers:string[];ciks:string[];limit:number;apply:boolean;noDb:boolean}
function parseArgs(argv:string[]):Args{
 const a:Args={issuers:[],ciks:[],limit:500,apply:false,noDb:false};
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--issuer'){const v=next(i++);if(!UUID.test(v)){console.error('--issuer takes an issuer_id uuid');process.exit(2);}a.issuers.push(v);}
  else if(x==='--cik')a.ciks.push(next(i++));
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--apply')a.apply=true;
  else if(x==='--no-db')a.noDb=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>5000){console.error('--limit must be 1..5000');process.exit(2);}
 if(a.noDb&&(a.apply||a.ciks.length===0||a.issuers.length>0)){console.error('--no-db needs --cik and excludes --apply/--issuer');process.exit(2);}
 if(!a.noDb&&a.ciks.length>0){console.error('--cik is only for --no-db');process.exit(2);}
 if(a.ciks.some(c=>!/^\d{1,10}$/.test(c))){console.error('--cik must be digits');process.exit(2);}
 return a;
}
const scopeRow=(issuer_id:string,cik10:string):ScopeRow=>({issuer_id,market:'US',reasons:['cli'],priority:10,fetch_key:cik10,next_due_at:new Date().toISOString(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const codeVersion=resolveCodeVersion({allowGit:true})??(args.apply?null:'dry-run');
 if(!codeVersion){console.error('code version unavailable; refusing --apply');process.exit(2);}
 const budget=makeBudget(null);
 let deps:FilerCategoryDeps;
 if(args.noDb){
  const rows=args.ciks.map((c,i)=>scopeRow(`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,padCik(c)));
  const raw=memoryRawStore();
  deps={tables:memoryTableClient({issuer_filer_categories:['issuer_id','fiscal_year']}),db:{scopeAll:async()=>rows},raw,
   submissions:async(cik10,b)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:`${new Date().getUTCFullYear()-4}-01-01`})),
   fetchDocument:(url,b)=>fetchSecDocument(url,b),now:()=>new Date(),budget,codeVersion};
 }else{
  const admin=getAdminSupabase();
  const raw=args.apply?supabaseRawStore(admin):memoryRawStore();
  deps={tables:supabaseTableClient(admin),db:supabaseFactsDb(admin),raw,
   submissions:async(cik10,b)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:`${new Date().getUTCFullYear()-4}-01-01`})),
   fetchDocument:(url,b)=>fetchSecDocument(url,b),now:()=>new Date(),budget,codeVersion};
 }
 const receipt=await syncFilerCategories(deps,{issuerIds:args.issuers.length?args.issuers:undefined,limit:args.limit,dryRun:!args.apply,triggeredBy:'script'});
// scripts/dq/calendar-sync.ts
/**
 * Filing calendar from the command line (spec §6.2). Preview by default.
 *
 *   node --env-file=.env.local --import tsx scripts/dq/calendar-sync.ts --market US|CN [--issuer <uuid>]... [--limit n] [--apply]
 *   node --import tsx scripts/dq/calendar-sync.ts --market US --no-db --cik 320193 [--cik ...]
 *
 * Preview: previewCalendar over the market scope (or the given issuers): fetches upstream, computes
 * the rows and prints them; no batch, no pass, no profile, no bucket write (memory raw store).
 * --apply runs the pass protocol exactly like the cron (claims the market pass, processes members,
 * settles it when done) with an 8-minute budget, below the 10-minute pass lease; run it again to
 * continue a pass. --issuer is preview-only (a pass always works on its frozen members).
 * --no-db (US, with --cik): memory stores, synthetic issuer ids, no stored filings; filer categories
 * are first derived from the live 10-K covers (syncFilerCategories into the memory tables), so the
 * printed rows show real deadlines and every SEC-listed report as filed_not_ingested — a network-only
 * check of the rules against AAPL/COST/WMT-style filers (spec §14 question 5).
 * Exit 0 on success, 1 when the batch failed (or a preview issuer had errors), 2 on bad arguments.
 */
import {memoryTableClient} from '../../src/lib/db/memory-table-client';
import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
import {productionCalendarDeps} from '../../src/lib/dq/calendar-deps';
import {previewCalendar,runCalendarSync} from '../../src/lib/dq/calendar-sync';
import type {CalendarSyncDeps} from '../../src/lib/dq/calendar-sync';
import {fetchSecDocument,submissionsView,syncFilerCategories} from '../../src/lib/dq/filer-categories';
import {filingsWindowStart} from '../../src/lib/dq/calendar';
import {memoryRawStore} from '../../src/lib/dq/raw-store';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {padCik} from '../../src/lib/facts/providers/shared';
import {makeBudget} from '../../src/lib/facts/sync';
import type {Market,ScopeRow} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: calendar-sync.ts --market US|CN [--issuer <uuid>]... [--limit n] [--apply] | --market US --no-db --cik <cik> [--cik ...]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const APPLY_BUDGET_MS=8*60_000;
interface Args{market:Market;issuers:string[];ciks:string[];limit:number;apply:boolean;noDb:boolean}
function parseArgs(argv:string[]):Args{
 const a:Args={market:'US',issuers:[],ciks:[],limit:200,apply:false,noDb:false};let market:string|undefined;
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--market')market=next(i++);
  else if(x==='--issuer'){const v=next(i++);if(!UUID.test(v)){console.error('--issuer takes an issuer_id uuid');process.exit(2);}a.issuers.push(v);}
  else if(x==='--cik')a.ciks.push(next(i++));
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--apply')a.apply=true;
  else if(x==='--no-db')a.noDb=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(market!=='US'&&market!=='CN'){console.error(USAGE);process.exit(2);}
 a.market=market;
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>5000){console.error('--limit must be 1..5000');process.exit(2);}
 if(a.apply&&a.issuers.length>0){console.error('--issuer is preview-only');process.exit(2);}
 if(a.noDb&&(a.apply||a.market!=='US'||a.ciks.length===0||a.issuers.length>0)){console.error('--no-db needs --market US and --cik, and excludes --apply/--issuer');process.exit(2);}
 if(!a.noDb&&a.ciks.length>0){console.error('--cik is only for --no-db');process.exit(2);}
 if(a.ciks.some(c=>!/^\d{1,10}$/.test(c))){console.error('--cik must be digits');process.exit(2);}
 return a;
}

async function noDbDeps(ciks:string[],codeVersion:string):Promise<CalendarSyncDeps>{
142:  state            text not null default 'pending' check (state in ('pending','claimed','done','failed')),
143:  claimed_by       uuid references public.ingest_batches(batch_id) on delete set null,
144:  claim_until      timestamptz,
145:  attempts         int not null default 0 check (attempts >= 0),
146:  last_error       text,
156:  constraint drc_done_accounted check (state <> 'done' or (compared_passed is not null and compared_failed is not null and not_compared is not null and compared_passed + compared_failed + not_compared = expected))
166:  claimed_by   uuid references public.ingest_batches(batch_id) on delete set null,   -- one leased worker per market and pass
167:  claim_until  timestamptz,
179:  state       text not null default 'pending' check (state in ('pending','done','failed')),
180:  attempts    int not null default 0 check (attempts >= 0),
181:  last_error  text,
209:  deadline_state       text not null check (deadline_state in ('statutory','estimated','no_rule')),
215:  disclosure_state     text not null check (disclosure_state in ('pending','overdue','filed_not_ingested','received','received_late','unknown_upstream')),
224:  -- deadline_state and disclosure_state are orthogonal: a no_rule row may still be received.
225:  constraint dfe_due_iff_known check ((due_date is null) = (deadline_state = 'no_rule')),
226:  constraint dfe_received_iff check ((disclosure_state in ('received','received_late')) = (received_filing_id is not null and received_date is not null)),
227:  constraint dfe_late_requires_due check (disclosure_state <> 'received_late' or due_date is not null),
229:  constraint dfe_overdue_requires_statutory check (disclosure_state <> 'overdue' or deadline_state = 'statutory'),
230:  constraint dfe_unknown_upstream_iff check ((disclosure_state = 'unknown_upstream') = (upstream_lookup = 'unavailable' and received_filing_id is null))
232:-- received_filing_id and received_date travel together, whatever the state (Codex round 1 P2)
594:  if not found or p.claimed_by is distinct from (p_token ->> 'batch_id')::uuid
595:     or p.claim_until is null or p.claim_until <= clock_timestamp() or p.finished_at is not null then
604:-- lease is free, expired (claim_until <= now, the same test dq_calendar_lock_pass uses), or already p_batch's → (re)lease it to p_batch. Otherwise null.
615:    insert into public.dq_calendar_passes(market, pass_id, started_at, claimed_by, claim_until, status)
623:  if p.claimed_by is null or p.claim_until is null or p.claim_until <= clock_timestamp() or p.claimed_by = p_batch then
624:    update public.dq_calendar_passes set claimed_by = p_batch, claim_until = clock_timestamp() + interval '10 minutes'
634:-- belong to the pass and be pending, or failed with attempts < 3; its rows for (issuer, market) are
647:  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
665:      (x ->> 'profile_as_of')::date, coalesce(x -> 'detail', '{}'::jsonb), clock_timestamp(), p.claimed_by
686:  update public.dq_calendar_pass_members set state = 'done', done_at = clock_timestamp()
688:  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
700:  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
703:  update public.dq_calendar_pass_members set state = 'failed', attempts = attempts + 1, last_error = left(coalesce(p_error, 'unknown'), 1000)
705:  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
718:             and (state = 'pending' or (state = 'failed' and attempts < 3))) then
721:  v_status := case when exists (select 1 from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and state <> 'done')
759:-- materialize hook state and the audit mark; quarantine.ts::patchQuarantineDetail). It locks the item and
839:-- Outcomes: 'written', 'duplicate' (already evidenced at p_new_date with the key present), 'conflict' (state moved

codex
This documentation-only patch introduces two actionable operational errors: an incorrect dry-run safety guarantee and an unsupported calendar command combination. No runtime implementation changes are included.

Full review comments:

- [P2] Exempt materialization from the dry-run guarantee — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/docs/runbooks/data-foundation.md:364-364
  The statement that all listed scripts require `--apply` to write is false for step 10: `scripts/facts/materialize.ts --pending-hooks` immediately invokes `runPendingHooks`, updating materialized metrics and hook state without an apply flag. An operator following this section to preview the first-run sequence could therefore mutate production data unexpectedly. Explicitly identify this command as write-through and exclude it from the dry-run guarantee.

- [P2] Remove the issuer filter from the calendar apply command — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/docs/runbooks/data-foundation.md:372-372
  The documented command permits combining `--issuer` with `--apply`, but `scripts/dq/calendar-sync.ts::parseArgs` explicitly rejects that combination with `--issuer is preview-only` and exits 2. An owner using the advertised filter will not synchronize any calendar rows. Document filtered preview separately from market-wide apply, which processes the pass's frozen membership.
This documentation-only patch introduces two actionable operational errors: an incorrect dry-run safety guarantee and an unsupported calendar command combination. No runtime implementation changes are included.

Full review comments:

- [P2] Exempt materialization from the dry-run guarantee — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/docs/runbooks/data-foundation.md:364-364
  The statement that all listed scripts require `--apply` to write is false for step 10: `scripts/facts/materialize.ts --pending-hooks` immediately invokes `runPendingHooks`, updating materialized metrics and hook state without an apply flag. An operator following this section to preview the first-run sequence could therefore mutate production data unexpectedly. Explicitly identify this command as write-through and exclude it from the dry-run guarantee.

- [P2] Remove the issuer filter from the calendar apply command — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/docs/runbooks/data-foundation.md:372-372
  The documented command permits combining `--issuer` with `--apply`, but `scripts/dq/calendar-sync.ts::parseArgs` explicitly rejects that combination with `--issuer is preview-only` and exits 2. An owner using the advertised filter will not synchronize any calendar rows. Document filtered preview separately from market-wide apply, which processes the pass's frozen membership.
