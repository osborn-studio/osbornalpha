OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1aff8-70ae-7853-b8ae-bb0fdb83938b
--------
user
commit 65484a9
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 65484a9; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 256ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-dkN6RCI3' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-RZzxofwy' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gUVuieSJ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BKvyG8zM' (errno=Operation not permitted)
65484a9 fix(entities): aggregate FIGI candidates across ISINs, resolve HKEX corrections against the stored ISIN, keep OpenFIGI evidence as its own item
 src/lib/entities/identifiers/apply.test.ts | 12 +++++
 src/lib/entities/identifiers/apply.ts      |  6 +--
 src/lib/entities/identifiers/plan.test.ts  | 42 +++++++++++++++-
 src/lib/entities/identifiers/plan.ts       | 78 ++++++++++++++++++------------
 4 files changed, 104 insertions(+), 34 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || cat "$d/$f"; done; done; ls -a | head -25; git show 65484a9 --; cat src/lib/entities/identifiers/plan.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-NlN7SMOV' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-IhBOtS3d' (errno=Operation not permitted)
commit 65484a9bbf653bb6eea1ef60f1b3ad0670f00b37
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:27:19 2026 -0800

    fix(entities): aggregate FIGI candidates across ISINs, resolve HKEX corrections against the stored ISIN, keep OpenFIGI evidence as its own item
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/identifiers/apply.test.ts b/src/lib/entities/identifiers/apply.test.ts
index 28ff786..2b34b4d 100644
--- a/src/lib/entities/identifiers/apply.test.ts
+++ b/src/lib/entities/identifiers/apply.test.ts
@@ -94,3 +94,15 @@ describe('applyIdentifierPlan',()=>{
   expect(Object.keys(r.provenance as object).sort()).toEqual(['exchange','figi','isin']);
  });
 });
+
+describe('applyIdentifierPlan · evidence identity',()=>{
+ it('two filings with the same GLEIF hash and different OpenFIGI hashes keep both OpenFIGI evidence items',async()=>{
+  const c=await setup({isin:'US9999999999'});
+  const withResp=(sha:string)=>input({isin:'US9999999999',figi:null},{isinResults:new Map([['US0378331005',{job,status:'ok' as const,records:[rec()],evidence:{request_sha256:'b'.repeat(64),response_sha256:sha,index:0}}]])});
+  await applyIdentifierPlan(c,planIdentifierWrites(withResp('c'.repeat(64))),opts);
+  await applyIdentifierPlan(c,planIdentifierWrites(withResp('e'.repeat(64))),opts);
+  const [cl]=c.rows('issuer_identifier_claims').filter(x=>x.id_type==='isin');
+  const shas=((cl.detail as {sources:{source:string;evidence_sha256:string}[]}).sources).filter(s=>s.source==='openfigi').map(s=>s.evidence_sha256).sort();
+  expect(shas).toEqual(['c'.repeat(64),'e'.repeat(64)]);
+ });
+});
diff --git a/src/lib/entities/identifiers/apply.ts b/src/lib/entities/identifiers/apply.ts
index 4050e09..e36091e 100644
--- a/src/lib/entities/identifiers/apply.ts
+++ b/src/lib/entities/identifiers/apply.ts
@@ -24,7 +24,7 @@ type SetOutcome='written'|'duplicate'|'conflict'|'not_found';
 const claimFor=(w:SecurityWrite,op:'set_identifier'|'correct_identifier',current:string|null):ClaimInput=>({
  issuer_id:w.issuer_id,id_type:w.column,value:w.value,source:w.source,op,detail:{
   schema:'claim/1',evidence_kind:w.evidenceKind,target:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from},
-  params:op==='set_identifier'?{}:{expected_current:current,new_value:w.value},evidence:w.evidence,sources:[w.evidence],provenance_written:w.patch,
+  params:op==='set_identifier'?{}:{expected_current:current,new_value:w.value},evidence:w.evidence,sources:w.sources,provenance_written:w.patch,
  },
 });
 
@@ -47,8 +47,8 @@ export async function applyIdentifierPlan(tables:TableClient,plan:IdentifierPlan
   const where=`${w.ticker}:${w.valid_from}:${w.column}`;
   try{
    const outcome=await callRpc(tables,'set_security_identifier',{p_issuer:w.issuer_id,p_ticker:w.ticker,p_valid_from:w.valid_from,p_column:w.column,p_value:w.value,p_provenance:w.patch}) as SetOutcome;
-   if(outcome==='written'){counts.inserted++;continue;}
-   if(outcome==='duplicate'){counts.duplicates++;continue;}
+   if(outcome==='written'){counts.inserted++;for(const f of w.followUps??[])await fileOne(f);continue;}
+   if(outcome==='duplicate'){counts.duplicates++;for(const f of w.followUps??[])await fileOne(f);continue;}
    if(outcome==='conflict'){
     // another value is stored: read it for the claim's expected_current (resolution re-checks it under its own guard)
     const [cur]=await tables.select('issuer_securities',{...key,valid_to:null},{limit:1});
diff --git a/src/lib/entities/identifiers/plan.test.ts b/src/lib/entities/identifiers/plan.test.ts
index f73d40f..126be86 100644
--- a/src/lib/entities/identifiers/plan.test.ts
+++ b/src/lib/entities/identifiers/plan.test.ts
@@ -103,10 +103,50 @@ describe('planIdentifierWrites · stages C and D',()=>{
   expect(isin).toMatchObject({value:'KYG875721634',source:'hkex_list_of_securities',evidenceKind:'official_list',patch:{isin:{source:'hkex_list_of_securities',as_of:ASOF,evidence_sha256:'d'.repeat(64),locator:'list_of_securities:row:5'}}});
   expect(p.recons).toEqual([{naturalKey:'00700.HK:2026-01-02',passed:false,leftText:'US0378331005',rightText:'KYG875721634',leftSource:'gleif_openfigi',rightSource:'hkex_list_of_securities',
    detail:{left:{evidence_sha256:GSHA,locator:`gleif:${LEI1},US0378331005;openfigi:${RSHA}#0`},right:{document:'list_of_securities',sha256:'d'.repeat(64),locator:'row:5'}}}]);
-  expect(p.claims.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','US0378331005',{expected_current:'KYG875721634',new_value:'US0378331005'}]]);
+  // the correction assumes HKEX's value is stored, so apply files it only once the HKEX write has landed
+  expect(p.claims).toEqual([]);
+  expect(isin.followUps!.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','US0378331005',{expected_current:'KYG875721634',new_value:'US0378331005'}]]);
   const agree=planIdentifierWrites(base({stages:new Set(['A','B','D']),openRows:[HK],gleif:{sha256:GSHA,byLei:new Map([[LEI1,['KYG875721634']]])},
    isinResults:new Map([['KYG875721634',okR({idType:'ID_ISIN',idValue:'KYG875721634'},[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})])]]),hkex}));
   expect(agree.recons.map(r=>r.passed)).toEqual([true]);expect(agree.claims).toEqual([]);
   expect(planIdentifierWrites(base({stages:new Set(['D']),openRows:[HK],hkex:new Map()})).skipped).toEqual(['hkex_no_isin']);
  });
 });
+
+describe('planIdentifierWrites · review fixes',()=>{
+ const ISIN_B='US5949181045',JOB_B:FigiJob={idType:'ID_ISIN',idValue:ISIN_B};
+ const two=(order:string[])=>base({
+  gleif:{sha256:GSHA,byLei:new Map([[LEI1,order]])},
+  isinResults:new Map([['US0378331005',okR(AAPL_JOB,[rec({figi:'BBG000AAAAA1',compositeFIGI:'BBG000AAAAA1'})],0)],[ISIN_B,okR(JOB_B,[rec({figi:'BBG000BBBBB2',compositeFIGI:'BBG000BBBBB2'})],1)]]),
+ });
+ it('different FIGI groups from different ISINs: no automatic FIGI write, claims carry the complete list (both orders)',()=>{
+  const cands=[{figi:'BBG000AAAAA1',level:'composite'},{figi:'BBG000BBBBB2',level:'composite'}];
+  const outs=[['US0378331005',ISIN_B],[ISIN_B,'US0378331005']].map(o=>planIdentifierWrites(two(o)));
+  for(const p of outs){
+   expect(p.writes.filter(w=>w.column==='figi')).toEqual([]);
+   const f=p.claims.filter(c=>c.id_type==='figi');
+   expect(f.map(c=>[c.op,c.value,c.detail.params])).toEqual([['set_identifier','BBG000AAAAA1',{candidates:cands}],['set_identifier','BBG000BBBBB2',{candidates:cands}]]);
+  }
+  expect(outs[0].claims.filter(c=>c.id_type==='figi')).toEqual(outs[1].claims.filter(c=>c.id_type==='figi'));
+ });
+ it('a stored FIGI matching one of several groups is a duplicate; the alternatives become correct_identifier claims with the full list',()=>{
+  const p=planIdentifierWrites(two(['US0378331005',ISIN_B]));
+  const q=planIdentifierWrites({...two(['US0378331005',ISIN_B]),openRows:[row({figi:'BBG000AAAAA1'})]});
+  expect(q.duplicates).toBe(1);
+  const f=q.claims.filter(c=>c.id_type==='figi');
+  expect(f.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','BBG000BBBBB2',{expected_current:'BBG000AAAAA1',new_value:'BBG000BBBBB2',candidates:[{figi:'BBG000AAAAA1',level:'composite'},{figi:'BBG000BBBBB2',level:'composite'}]}]]);
+  expect(p.claims.filter(c=>c.id_type==='figi')).toHaveLength(2);
+ });
+ it('stored ISIN equal to the GLEIF value while HKEX differs: exactly one correction, expected_current = stored',()=>{
+  const res=okR(AAPL_JOB,[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})]);
+  const hkex=new Map([['00700',{isin:'KYG875721634',file:'list_of_securities' as const,sha256:'d'.repeat(64),row:5}]]);
+  const p=planIdentifierWrites(base({stages:new Set(['A','B','D']),openRows:[row({ticker:'00700.HK',isin:'US0378331005'})],isinResults:new Map([['US0378331005',res]]),hkex}));
+  expect(p.claims.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','KYG875721634',{expected_current:'US0378331005',new_value:'KYG875721634'}]]);
+  expect(p.writes.filter(w=>w.column==='isin')).toEqual([]);
+ });
+ it('ISIN claims carry the OpenFIGI response as its own evidence item so a new response appends',()=>{
+  const p=planIdentifierWrites(base({openRows:[row({isin:'US9999999999'})]}));
+  const c=p.claims.find(x=>x.id_type==='isin')!;
+  expect(c.detail.sources.map(s=>[s.source,s.evidence_sha256])).toEqual([['gleif_openfigi',GSHA],['openfigi',RSHA]]);
+ });
+});
diff --git a/src/lib/entities/identifiers/plan.ts b/src/lib/entities/identifiers/plan.ts
index dda815c..d5468d7 100644
--- a/src/lib/entities/identifiers/plan.ts
+++ b/src/lib/entities/identifiers/plan.ts
@@ -34,13 +34,19 @@ export interface SecurityWrite{
  kind:'set'|'provenance';issuer_id:string;ticker:string;valid_from:string;column:IdColumn;value:string;
  /** exactly one sanitized provenance key ({isin:…} or {figi:…}); apply merges it into the stored object */
  patch:Record<string,unknown>;source:string;evidenceKind:EvidenceKind;evidence:ClaimEvidence;
+ /** every evidence item behind the value (the primary one first); claims built from this write carry all of them */
+ sources:ClaimEvidence[];
+ /** claims that only make sense once this value is stored: apply files them when the write lands (written or duplicate) */
+ followUps?:ClaimInput[];
 }
 export interface PlannedQuarantine{naturalKey:string;reasonCode:'ownership_conflict';detail:Record<string,unknown>;payload:Record<string,unknown>}
 export interface PlannedRecon{naturalKey:string;passed:boolean;leftText:string;rightText:string;leftSource:string;rightSource:string;detail:Record<string,unknown>}
 export interface AhCandidate{issuer_id:string;ticker:string;isin:string;evidence:ClaimEvidence}
 export interface IdentifierPlan{writes:SecurityWrite[];claims:ClaimInput[];quarantines:PlannedQuarantine[];recons:PlannedRecon[];duplicates:number;skipped:string[];figiMissing:string[];ahCandidates:AhCandidate[]}
 
-interface Proposal{value:string;source:string;kind:EvidenceKind;evidence:ClaimEvidence;prov:Record<string,unknown>}
+interface Proposal{value:string;source:string;kind:EvidenceKind;evidence:ClaimEvidence;prov:Record<string,unknown>;sources?:ClaimEvidence[];after?:ClaimInput[]}
+interface FigiEntry{row:SecRow;groups:Map<string,{g:FigiGroup;r:Extract<FigiJobResult,{status:'ok'}>}>}
+type OkResult=Extract<FigiJobResult,{status:'ok'}>;
 type Op=Exclude<ClaimOp,'legacy'>;
 const keyOf=(r:{issuer_id:string;ticker:string;valid_from:string})=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
 const targetOf=(r:SecRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from});
@@ -54,16 +60,16 @@ export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
  const openOwner=new Map(input.openRows.map(r=>[r.ticker,r.issuer_id]));
  const holdsA=new Set(input.openRows.filter(r=>/\.(SH|SZ)$/.test(r.ticker)).map(r=>r.issuer_id));
  const proposals=new Map<string,{row:SecRow;col:IdColumn;list:Proposal[]}>();
- const figiClaimed=new Set<string>();
+ const figiCands=new Map<string,FigiEntry>();
  const propose=(row:SecRow,col:IdColumn,p:Proposal)=>{
   const k=`${keyOf(row)}|${col}`;
   const e=proposals.get(k)??{row,col,list:[]};
   if(!e.list.some(x=>x.value===p.value))e.list.push(p);
   proposals.set(k,e);
  };
- const claim=(c:{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Op;kind:EvidenceKind;target:ClaimDetail['target'];params:Record<string,unknown>;evidence:ClaimEvidence;written?:Record<string,unknown>})=>{
-  out.claims.push({issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,op:c.op,detail:{
-   schema:'claim/1',evidence_kind:c.kind,target:c.target,params:c.params,evidence:c.evidence,sources:[c.evidence],...(c.written?{provenance_written:c.written}:{}),
+ const claim=(c:{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Op;kind:EvidenceKind;target:ClaimDetail['target'];params:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];written?:Record<string,unknown>},into:ClaimInput[]=out.claims)=>{
+  into.push({issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,op:c.op,detail:{
+   schema:'claim/1',evidence_kind:c.kind,target:c.target,params:c.params,evidence:c.evidence,sources:c.sources??[c.evidence],...(c.written?{provenance_written:c.written}:{}),
   }});
  };
  const figiProposal=(r:Extract<FigiJobResult,{status:'ok'}>,g:FigiGroup):Proposal=>({
@@ -71,19 +77,29 @@ export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
   evidence:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`},
   prov:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,job:jobOf(r.job),level:g.level},
  });
- const multiFigi=(row:SecRow,r:Extract<FigiJobResult,{status:'ok'}>,groups:FigiGroup[])=>{
-  figiClaimed.add(keyOf(row));
-  out.skipped.push('figi_multiple_groups');
-  if(groups.some(g=>g.figi===row.figi)){out.duplicates++;return;}
-  const note=`one of ${groups.length} candidate FIGIs: ${groups.map(g=>`${g.figi}(${g.level})`).join(', ')}`;
-  // spec §4.1.2 "detail.candidates 全部列出": every per-group claim carries the full sorted list in params.candidates
-  // (Part A validateClaimDetail/identifier_claim_problem allow params.candidates for set_identifier/correct_identifier).
-  const candidates=groups.map(g=>({figi:g.figi,level:g.level}));
+ const openfigiEvidence=(r:OkResult):ClaimEvidence=>({source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`});
+ // FIGI candidates are collected per target security across every result (all ISINs, stage C) and decided once,
+ // so the order of ISIN iteration never changes the outcome (spec §4.1.2; Codex review P1).
+ const addFigi=(row:SecRow,r:OkResult,groups:FigiGroup[])=>{
+  const e=figiCands.get(keyOf(row))??{row,groups:new Map()};
+  figiCands.set(keyOf(row),e);
   for(const g of groups){
+   const old=e.groups.get(g.figi);
+   if(!old||r.evidence.response_sha256<old.r.evidence.response_sha256)e.groups.set(g.figi,{g,r});
+  }
+ };
+ const decideFigi=(e:FigiEntry)=>{
+  const list=[...e.groups.values()].sort((x,y)=>x.g.figi<y.g.figi?-1:x.g.figi>y.g.figi?1:0);
+  if(list.length===1){propose(e.row,'figi',figiProposal(list[0].r,list[0].g));return;}
+  out.skipped.push('figi_multiple_groups');
+  const note=`one of ${list.length} candidate FIGIs: ${list.map(x=>`${x.g.figi}(${x.g.level})`).join(', ')}`;
+  const candidates=list.map(x=>({figi:x.g.figi,level:x.g.level}));
+  for(const {g,r} of list){
+   if(e.row.figi===g.figi){out.duplicates++;continue;}
    const p=figiProposal(r,g);
-   const op:Op=row.figi===null?'set_identifier':'correct_identifier';
-   claim({issuer_id:row.issuer_id,id_type:'figi',value:g.figi,source:'openfigi',op,kind:'provider_mapping',target:targetOf(row),
-    params:op==='set_identifier'?{candidates}:{expected_current:row.figi,new_value:g.figi,candidates},evidence:{...p.evidence,note},written:sanitizeProvenance({figi:p.prov})});
+   const op:Op=e.row.figi===null?'set_identifier':'correct_identifier';
+   claim({issuer_id:e.row.issuer_id,id_type:'figi',value:g.figi,source:'openfigi',op,kind:'provider_mapping',target:targetOf(e.row),
+    params:op==='set_identifier'?{candidates}:{expected_current:e.row.figi,new_value:g.figi,candidates},evidence:{...p.evidence,note},written:sanitizeProvenance({figi:p.prov})});
   }
  };
 
@@ -99,13 +115,12 @@ export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
     out.skipped.push(...g.skipped);
     const locator=`gleif:${iss.lei},${isin};openfigi:${r.evidence.response_sha256}#${r.evidence.index}`;
     const evidence:ClaimEvidence={source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator};
-    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
+    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,sources:[evidence,openfigiEvidence(r)],prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
     for(const c of g.candidates){
      const own=runRows.find(x=>x.issuer_id===iss.issuer_id&&x.ticker===c.ticker);
      if(own){
       propose(own,'isin',isinProposal);
-      if(c.groups.length===1)propose(own,'figi',figiProposal(r,c.groups[0]));
-      else multiFigi(own,r,c.groups);
+      addFigi(own,r,c.groups);
       continue;
      }
      if(!input.universe.has(c.ticker)){out.skipped.push('ticker_not_in_universe');continue;}
@@ -135,18 +150,21 @@ export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
    const source=`hkex_${hk.file}`,locator=`${hk.file}:row:${hk.row}`;
    const evidence:ClaimEvidence={source,as_of:asOf,evidence_sha256:hk.sha256,locator};
    const k=`${keyOf(row)}|isin`;
+   const hkProposal:Proposal={value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator},after:[]};
    for(const b of proposals.get(k)?.list??[]){
     out.recons.push({naturalKey:`${row.ticker}:${row.valid_from}`,passed:b.value===hk.isin,leftText:b.value,rightText:hk.isin,leftSource:b.source,rightSource:source,
      detail:{left:{evidence_sha256:b.evidence.evidence_sha256,locator:b.evidence.locator},right:{document:hk.file,sha256:hk.sha256,locator:`row:${hk.row}`}}});
+    // The GLEIF-side correction is only valid against the value actually stored: it assumes HKEX's value is (or becomes) stored.
+    // Resolved below against the stored column (empty → filed by apply once the HKEX write lands; equal → filed now; else dropped).
     if(b.value!==hk.isin)claim({issuer_id:row.issuer_id,id_type:'isin',value:b.value,source:b.source,op:'correct_identifier',kind:b.kind,target:targetOf(row),
-     params:{expected_current:hk.isin,new_value:b.value},evidence:b.evidence,written:sanitizeProvenance({isin:b.prov})});
+     params:{expected_current:hk.isin,new_value:b.value},evidence:b.evidence,sources:b.sources,written:sanitizeProvenance({isin:b.prov})},hkProposal.after!);
    }
-   proposals.set(k,{row,col:'isin',list:[{value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator}}]});
+   proposals.set(k,{row,col:'isin',list:[hkProposal]});
   }
  }
 
  // Stage C: TICKER → FIGI for rows that still have none.
- const hasFigi=(row:SecRow)=>row.figi!==null||proposals.has(`${keyOf(row)}|figi`)||figiClaimed.has(keyOf(row));
+ const hasFigi=(row:SecRow)=>row.figi!==null||figiCands.has(keyOf(row));
  if(stages.has('C')){
   for(const row of runRows){
    if(hasFigi(row))continue;
@@ -157,11 +175,11 @@ export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
    out.skipped.push(...g.skipped);
    const c=g.candidates.find(x=>x.ticker===row.ticker);
    if(!c){out.skipped.push('figi_not_found');continue;}
-   if(c.groups.length===1)propose(row,'figi',figiProposal(r,c.groups[0]));
-   else multiFigi(row,r,c.groups);
+   addFigi(row,r,c.groups);
   }
  }
- out.figiMissing=[...new Set(runRows.filter(r=>!hasFigi(r)&&!input.tickerResults.has(r.ticker)).map(r=>r.ticker))].sort();
+ for(const e of figiCands.values())decideFigi(e);
+ out.figiMissing=[...new Set(runRows.filter(r=>r.figi===null&&!figiCands.has(keyOf(r))&&!input.tickerResults.has(r.ticker)).map(r=>r.ticker))].sort();
 
  // Resolve proposals against the stored values.
  for(const {row,col,list} of proposals.values()){
@@ -172,17 +190,17 @@ export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
     if(current===p.value)continue;
     const op:Op=current===null?'set_identifier':'correct_identifier';
     claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op,kind:p.kind,target:targetOf(row),
-     params:op==='set_identifier'?{}:{expected_current:current,new_value:p.value},evidence:p.evidence,written:sanitizeProvenance({[col]:p.prov})});
+     params:op==='set_identifier'?{}:{expected_current:current,new_value:p.value},evidence:p.evidence,sources:p.sources,written:sanitizeProvenance({[col]:p.prov})});
    }
    continue;
   }
   const p=list[0];
   const patch=sanitizeProvenance({[col]:p.prov});
-  const write=(kind:SecurityWrite['kind'])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence});
-  if(current===null){write('set');continue;}
-  if(current===p.value){if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
+  const write=(kind:SecurityWrite['kind'],followUps?:ClaimInput[])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence,sources:p.sources??[p.evidence],...(followUps?.length?{followUps}:{})});
+  if(current===null){write('set',p.after);continue;}
+  if(current===p.value){out.claims.push(...(p.after??[]));if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
   claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op:'correct_identifier',kind:p.kind,target:targetOf(row),
-   params:{expected_current:current,new_value:p.value},evidence:p.evidence,written:patch});
+   params:{expected_current:current,new_value:p.value},evidence:p.evidence,sources:p.sources,written:patch});
  }
  out.skipped.sort();
  return out;
// src/lib/entities/identifiers/plan.ts
// Pure planning of ISIN/FIGI writes (spec §4.1.2–§4.1.4). Inputs: the run's evidence (GLEIF subset,
// OpenFIGI job results by ISIN and by ticker, merged HKEX lists) and the current open security rows.
// Output: guarded column writes (one sanitized provenance key each), claim/1 claims, ownership
// quarantines and HKEX-vs-GLEIF text reconciliations. A stored value is never overwritten: a
// different value becomes correct_identifier. Several candidate values for one row/column are
// ambiguous and only produce claims. HK tickers found for an issuer that holds A shares are left
// to link-ah (spec §4.2.2 rule 1; contract issue 5).
import type {ClaimInput} from '../claims';
import {sanitizeProvenance} from '../provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,EvidenceKind} from '../types';
import type {HkexIsin} from './hkex-list';
import {groupFigiResults,type FigiGroup,type FigiJob,type FigiJobResult} from './openfigi';

export const ISIN_RECON_PAIR='entities.isin_hkex_vs_gleif' as const;
export type Stage='A'|'B'|'C'|'D';
export interface SecRow{issuer_id:string;ticker:string;valid_from:string;isin:string|null;figi:string|null;provenance:Record<string,unknown>}
export interface IssuerRow{issuer_id:string;lei:string|null;usci:string|null}
export interface PlanInput{
 asOf:string;stages:ReadonlySet<Stage>;
 /** the run's active issuers */
 issuers:readonly IssuerRow[];
 /** ALL open (valid_to null) security rows: ownership lookups use every issuer's rows */
 openRows:readonly SecRow[];
 universe:ReadonlySet<string>;
 gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>}|null;
 isinResults:ReadonlyMap<string,FigiJobResult>;
 tickerResults:ReadonlyMap<string,FigiJobResult>;
 /** 5-digit stock code → ISIN (mergeHkexIsins); null or empty = no HKEX ISIN source this run */
 hkex:ReadonlyMap<string,HkexIsin>|null;
}
export type IdColumn='isin'|'figi';
export interface SecurityWrite{
 kind:'set'|'provenance';issuer_id:string;ticker:string;valid_from:string;column:IdColumn;value:string;
 /** exactly one sanitized provenance key ({isin:…} or {figi:…}); apply merges it into the stored object */
 patch:Record<string,unknown>;source:string;evidenceKind:EvidenceKind;evidence:ClaimEvidence;
 /** every evidence item behind the value (the primary one first); claims built from this write carry all of them */
 sources:ClaimEvidence[];
 /** claims that only make sense once this value is stored: apply files them when the write lands (written or duplicate) */
 followUps?:ClaimInput[];
}
export interface PlannedQuarantine{naturalKey:string;reasonCode:'ownership_conflict';detail:Record<string,unknown>;payload:Record<string,unknown>}
export interface PlannedRecon{naturalKey:string;passed:boolean;leftText:string;rightText:string;leftSource:string;rightSource:string;detail:Record<string,unknown>}
export interface AhCandidate{issuer_id:string;ticker:string;isin:string;evidence:ClaimEvidence}
export interface IdentifierPlan{writes:SecurityWrite[];claims:ClaimInput[];quarantines:PlannedQuarantine[];recons:PlannedRecon[];duplicates:number;skipped:string[];figiMissing:string[];ahCandidates:AhCandidate[]}

interface Proposal{value:string;source:string;kind:EvidenceKind;evidence:ClaimEvidence;prov:Record<string,unknown>;sources?:ClaimEvidence[];after?:ClaimInput[]}
interface FigiEntry{row:SecRow;groups:Map<string,{g:FigiGroup;r:Extract<FigiJobResult,{status:'ok'}>}>}
type OkResult=Extract<FigiJobResult,{status:'ok'}>;
type Op=Exclude<ClaimOp,'legacy'>;
const keyOf=(r:{issuer_id:string;ticker:string;valid_from:string})=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
const targetOf=(r:SecRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from});
const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};

export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
 const {asOf,stages}=input;
 const out:IdentifierPlan={writes:[],claims:[],quarantines:[],recons:[],duplicates:0,skipped:[],figiMissing:[],ahCandidates:[]};
 const runIds=new Set(input.issuers.map(i=>i.issuer_id));
 const runRows=input.openRows.filter(r=>runIds.has(r.issuer_id));
 const openOwner=new Map(input.openRows.map(r=>[r.ticker,r.issuer_id]));
 const holdsA=new Set(input.openRows.filter(r=>/\.(SH|SZ)$/.test(r.ticker)).map(r=>r.issuer_id));
 const proposals=new Map<string,{row:SecRow;col:IdColumn;list:Proposal[]}>();
 const figiCands=new Map<string,FigiEntry>();
 const propose=(row:SecRow,col:IdColumn,p:Proposal)=>{
  const k=`${keyOf(row)}|${col}`;
  const e=proposals.get(k)??{row,col,list:[]};
  if(!e.list.some(x=>x.value===p.value))e.list.push(p);
  proposals.set(k,e);
 };
 const claim=(c:{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Op;kind:EvidenceKind;target:ClaimDetail['target'];params:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];written?:Record<string,unknown>},into:ClaimInput[]=out.claims)=>{
  into.push({issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,op:c.op,detail:{
   schema:'claim/1',evidence_kind:c.kind,target:c.target,params:c.params,evidence:c.evidence,sources:c.sources??[c.evidence],...(c.written?{provenance_written:c.written}:{}),
  }});
 };
 const figiProposal=(r:Extract<FigiJobResult,{status:'ok'}>,g:FigiGroup):Proposal=>({
  value:g.figi,source:'openfigi',kind:'provider_mapping',
  evidence:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`},
  prov:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,job:jobOf(r.job),level:g.level},
 });
 const openfigiEvidence=(r:OkResult):ClaimEvidence=>({source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`});
 // FIGI candidates are collected per target security across every result (all ISINs, stage C) and decided once,
 // so the order of ISIN iteration never changes the outcome (spec §4.1.2; Codex review P1).
 const addFigi=(row:SecRow,r:OkResult,groups:FigiGroup[])=>{
  const e=figiCands.get(keyOf(row))??{row,groups:new Map()};
  figiCands.set(keyOf(row),e);
  for(const g of groups){
   const old=e.groups.get(g.figi);
   if(!old||r.evidence.response_sha256<old.r.evidence.response_sha256)e.groups.set(g.figi,{g,r});
  }
 };
 const decideFigi=(e:FigiEntry)=>{
  const list=[...e.groups.values()].sort((x,y)=>x.g.figi<y.g.figi?-1:x.g.figi>y.g.figi?1:0);
  if(list.length===1){propose(e.row,'figi',figiProposal(list[0].r,list[0].g));return;}
  out.skipped.push('figi_multiple_groups');
  const note=`one of ${list.length} candidate FIGIs: ${list.map(x=>`${x.g.figi}(${x.g.level})`).join(', ')}`;
  const candidates=list.map(x=>({figi:x.g.figi,level:x.g.level}));
  for(const {g,r} of list){
   if(e.row.figi===g.figi){out.duplicates++;continue;}
   const p=figiProposal(r,g);
   const op:Op=e.row.figi===null?'set_identifier':'correct_identifier';
   claim({issuer_id:e.row.issuer_id,id_type:'figi',value:g.figi,source:'openfigi',op,kind:'provider_mapping',target:targetOf(e.row),
    params:op==='set_identifier'?{candidates}:{expected_current:e.row.figi,new_value:g.figi,candidates},evidence:{...p.evidence,note},written:sanitizeProvenance({figi:p.prov})});
  }
 };

 // Stage B: ISIN (from GLEIF, stage A) → OpenFIGI → (issuer via LEI, normalized ticker).
 if(stages.has('B')&&input.gleif){
  for(const iss of input.issuers){
   if(!iss.lei)continue;
   for(const isin of input.gleif.byLei.get(iss.lei)??[]){
    const r=input.isinResults.get(isin);
    if(!r){out.skipped.push('figi_not_queried');continue;}
    if(r.status!=='ok'){out.skipped.push(`openfigi_${r.status}`);continue;}
    const g=groupFigiResults(r.records);
    out.skipped.push(...g.skipped);
    const locator=`gleif:${iss.lei},${isin};openfigi:${r.evidence.response_sha256}#${r.evidence.index}`;
    const evidence:ClaimEvidence={source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator};
    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,sources:[evidence,openfigiEvidence(r)],prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
    for(const c of g.candidates){
     const own=runRows.find(x=>x.issuer_id===iss.issuer_id&&x.ticker===c.ticker);
     if(own){
      propose(own,'isin',isinProposal);
      addFigi(own,r,c.groups);
      continue;
     }
     if(!input.universe.has(c.ticker)){out.skipped.push('ticker_not_in_universe');continue;}
     const owner=openOwner.get(c.ticker);
     if(owner===undefined&&c.market==='HK'&&holdsA.has(iss.issuer_id)){
      out.ahCandidates.push({issuer_id:iss.issuer_id,ticker:c.ticker,isin,evidence});out.skipped.push('ah_link_candidate');continue;
     }
     claim({issuer_id:iss.issuer_id,id_type:'ticker',value:c.ticker,source:'gleif_openfigi',op:'attach_security',kind:'provider_mapping',target:{issuer_id:iss.issuer_id},
      params:{share_class:'unknown',valid_from:asOf,valid_from_method:'first_observed',source:'gleif_openfigi',isin},
      // an ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK, TCTZF): this one is only a co-mapping, so the reviewer must confirm it is the issuer's own listing
      evidence:{...evidence,note:`ticker ${c.ticker} co-mapped by ISIN ${isin}; listing not confirmed`}});
     if(owner!==undefined)out.quarantines.push({naturalKey:`${c.ticker}:${asOf}`,reasonCode:'ownership_conflict',
      detail:{reason:'ticker_owned_by_other_issuer',stage:'B',owner_issuer_id:owner},payload:{issuer_id:iss.issuer_id,ticker:c.ticker,isin}});
    }
   }
  }
 }

 // Stage D: HKEX is the primary ISIN source for .HK rows; stage-B values are compared, not written.
 if(stages.has('D')){
  if(!input.hkex||input.hkex.size===0)out.skipped.push('hkex_no_isin');
  else for(const row of runRows){
   const m=/^(\d{5})\.HK$/.exec(row.ticker);
   if(!m)continue;
   const hk=input.hkex.get(m[1]);
   if(!hk){out.skipped.push('hkex_code_not_listed');continue;}
   const source=`hkex_${hk.file}`,locator=`${hk.file}:row:${hk.row}`;
   const evidence:ClaimEvidence={source,as_of:asOf,evidence_sha256:hk.sha256,locator};
   const k=`${keyOf(row)}|isin`;
   const hkProposal:Proposal={value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator},after:[]};
   for(const b of proposals.get(k)?.list??[]){
    out.recons.push({naturalKey:`${row.ticker}:${row.valid_from}`,passed:b.value===hk.isin,leftText:b.value,rightText:hk.isin,leftSource:b.source,rightSource:source,
     detail:{left:{evidence_sha256:b.evidence.evidence_sha256,locator:b.evidence.locator},right:{document:hk.file,sha256:hk.sha256,locator:`row:${hk.row}`}}});
    // The GLEIF-side correction is only valid against the value actually stored: it assumes HKEX's value is (or becomes) stored.
    // Resolved below against the stored column (empty → filed by apply once the HKEX write lands; equal → filed now; else dropped).
    if(b.value!==hk.isin)claim({issuer_id:row.issuer_id,id_type:'isin',value:b.value,source:b.source,op:'correct_identifier',kind:b.kind,target:targetOf(row),
     params:{expected_current:hk.isin,new_value:b.value},evidence:b.evidence,sources:b.sources,written:sanitizeProvenance({isin:b.prov})},hkProposal.after!);
   }
   proposals.set(k,{row,col:'isin',list:[hkProposal]});
  }
 }

 // Stage C: TICKER → FIGI for rows that still have none.
 const hasFigi=(row:SecRow)=>row.figi!==null||figiCands.has(keyOf(row));
 if(stages.has('C')){
  for(const row of runRows){
   if(hasFigi(row))continue;
   const r=input.tickerResults.get(row.ticker);
   if(!r)continue;
   if(r.status!=='ok'){out.skipped.push(r.status==='not_found'?'figi_not_found':'openfigi_error');continue;}
   const g=groupFigiResults(r.records);
   out.skipped.push(...g.skipped);
   const c=g.candidates.find(x=>x.ticker===row.ticker);
   if(!c){out.skipped.push('figi_not_found');continue;}
   addFigi(row,r,c.groups);
  }
 }
 for(const e of figiCands.values())decideFigi(e);
 out.figiMissing=[...new Set(runRows.filter(r=>r.figi===null&&!figiCands.has(keyOf(r))&&!input.tickerResults.has(r.ticker)).map(r=>r.ticker))].sort();

 // Resolve proposals against the stored values.
 for(const {row,col,list} of proposals.values()){
  const current=row[col];
  if(list.length>1){
   out.skipped.push(`ambiguous_${col}`);
   for(const p of list){
    if(current===p.value)continue;
    const op:Op=current===null?'set_identifier':'correct_identifier';
    claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op,kind:p.kind,target:targetOf(row),
     params:op==='set_identifier'?{}:{expected_current:current,new_value:p.value},evidence:p.evidence,sources:p.sources,written:sanitizeProvenance({[col]:p.prov})});
   }
   continue;
  }
  const p=list[0];
  const patch=sanitizeProvenance({[col]:p.prov});
  const write=(kind:SecurityWrite['kind'],followUps?:ClaimInput[])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence,sources:p.sources??[p.evidence],...(followUps?.length?{followUps}:{})});
  if(current===null){write('set',p.after);continue;}
  if(current===p.value){out.claims.push(...(p.after??[]));if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
  claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op:'correct_identifier',kind:p.kind,target:targetOf(row),
   params:{expected_current:current,new_value:p.value},evidence:p.evidence,sources:p.sources,written:patch});
 }
 out.skipped.sort();
 return out;
}

exec
/bin/zsh -lc "cat src/lib/entities/identifiers/apply.ts; cat src/lib/entities/identifiers/openfigi.ts | tail -110; cat src/lib/entities/claims.ts; rg 'followUps|plan.claims|SecurityWrite' src scripts; find . -name '*AGENTS*' -o -name CLAUDE.md; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 89ms:
// src/lib/entities/identifiers/apply.ts
// Writes an IdentifierPlan (spec §4.1.2 "写入"): guarded column sets (only an empty column of an open
// row), provenance-only completions, claim/1 claims, ownership quarantines and the
// entities.isin_hkex_vs_gleif text reconciliations (written directly until record.ts exists;
// contract issue 7). Each column write goes through the migration-one function set_security_identifier
// (plan audit R2): under the security-row lock it writes the empty column and merges its ONE provenance
// key with `||` in the same UPDATE, so a concurrent write of the other column or a claim resolution never
// loses its evidence key, and a failed sibling write never leaves provenance describing a value that is
// not stored. fetched =
// rows with a table outcome; claims-only outcomes are reported in claims_summary (informational),
// a correct_identifier also as identifier_mismatch (degrades the batch to partial).
import {randomUUID} from 'node:crypto';
import {TableError,callRpc,type TableClient} from '../../db/table-client';
import {emptyCounts,type BatchCounts,type BatchError} from '../../dq/batches';
import {DATASETS} from '../../dq/datasets';
import {fileClaim,type ClaimInput} from '../claims';
import {errorMessage,parkConflict,withSkippedSummary} from '../load-sec';
import {ISIN_RECON_PAIR,type IdentifierPlan,type SecurityWrite} from './plan';

export interface IdentifierApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;claimsSummary:Record<string,number>}

const violates=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');
type SetOutcome='written'|'duplicate'|'conflict'|'not_found';
const claimFor=(w:SecurityWrite,op:'set_identifier'|'correct_identifier',current:string|null):ClaimInput=>({
 issuer_id:w.issuer_id,id_type:w.column,value:w.value,source:w.source,op,detail:{
  schema:'claim/1',evidence_kind:w.evidenceKind,target:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from},
  params:op==='set_identifier'?{}:{expected_current:current,new_value:w.value},evidence:w.evidence,sources:w.sources,provenance_written:w.patch,
 },
});

export async function applyIdentifierPlan(tables:TableClient,plan:IdentifierPlan,opts:{batchId:string;dataset:string}):Promise<IdentifierApplyResult>{
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 const claimsSummary:Record<string,number>={};
 counts.duplicates=plan.duplicates;
 const fileOne=async(c:ClaimInput)=>{
  try{
   const created=await fileClaim(tables,c);
   const k=created?c.op:`${c.op}_appended`;
   claimsSummary[k]=(claimsSummary[k]??0)+1;
   if(c.op==='correct_identifier')errors.push({code:'identifier_mismatch',key:`${c.detail.target.ticker??c.issuer_id}:${c.id_type}`,message:`${String(c.detail.params.expected_current)} -> ${c.value}`});
  }catch(e){counts.failed++;errors.push({code:'claim_error',key:`${c.issuer_id}:${c.id_type}:${c.value}`,message:errorMessage(e)});}
 };

 for(const w of plan.writes){
  const key={issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from};
  const where=`${w.ticker}:${w.valid_from}:${w.column}`;
  try{
   const outcome=await callRpc(tables,'set_security_identifier',{p_issuer:w.issuer_id,p_ticker:w.ticker,p_valid_from:w.valid_from,p_column:w.column,p_value:w.value,p_provenance:w.patch}) as SetOutcome;
   if(outcome==='written'){counts.inserted++;for(const f of w.followUps??[])await fileOne(f);continue;}
   if(outcome==='duplicate'){counts.duplicates++;for(const f of w.followUps??[])await fileOne(f);continue;}
   if(outcome==='conflict'){
    // another value is stored: read it for the claim's expected_current (resolution re-checks it under its own guard)
    const [cur]=await tables.select('issuer_securities',{...key,valid_to:null},{limit:1});
    const stored=cur?.[w.column]==null?null:String(cur[w.column]);
    if(stored===null||stored===w.value){counts.failed++;errors.push({code:'row_changed',key:where,message:'stored value changed after conflict'});continue;}
    await fileOne(claimFor(w,'correct_identifier',stored));continue;
   }
   counts.failed++;errors.push({code:'row_changed',key:where,message:outcome==='not_found'?'row missing or closed':`unexpected outcome ${String(outcome)}`});
  }catch(e){
   if(w.column==='isin'&&violates(e)){
    await fileOne(claimFor(w,'set_identifier',null));
    await parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey:`isin:${w.value}`,reasonCode:'ownership_conflict',
     detail:{reason:'isin_held_by_other_row',ticker:w.ticker,valid_from:w.valid_from},payload:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from,isin:w.value},batchId:opts.batchId},
     counts,errors,{code:'ownership_conflict',key:`isin:${w.value}`});
    continue;
   }
   counts.failed++;errors.push({code:'identifier_write_error',key:where,message:errorMessage(e)});
  }
 }
 for(const q of plan.quarantines){
  await parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey:q.naturalKey,reasonCode:q.reasonCode,detail:q.detail,payload:q.payload,batchId:opts.batchId},
   counts,errors,{code:q.reasonCode,key:q.naturalKey});
 }
 for(const c of plan.claims)await fileOne(c);
 for(const r of plan.recons){
  try{
   await tables.insert('dq_reconciliations',{
    id:randomUUID(),dataset:DATASETS.reconcile(ISIN_RECON_PAIR),pair:ISIN_RECON_PAIR,kind:'text',outcome:'compared',
    left_source:r.leftSource,right_source:r.rightSource,natural_key:r.naturalKey,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:0,passed:r.passed,
    detail:{left_text:r.leftText,right_text:r.rightText,...r.detail,tolerance_rule:'text_equal'},batch_id:opts.batchId,
    cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:new Date().toISOString(),
   });
  }catch(e){errors.push({code:'reconciliation_error',key:r.naturalKey,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
 const skippedSummary:Record<string,number>={};
 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
 const lead:BatchError[]=Object.keys(claimsSummary).length?[{code:'claims_summary',message:JSON.stringify(claimsSummary)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,claimsSummary};
}
  let bytes:Uint8Array;
  try{bytes=new Uint8Array(await res.arrayBuffer());}
  catch{
   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
   failures.push({status:res.status,request_sha256:reqSha,response_sha256:null,error:'body_read_failed'});return {res:null,bytes:null,sha:null};
  }
  const stored=await store(bytes,{role:'response',request_sha256:reqSha,http_status:res.status});
  if(!res.ok)failures.push({status:res.status,request_sha256:reqSha,response_sha256:stored.sha256});
  return {res,bytes,sha:stored.sha256};
 };
 const retryable=(r:Response|null)=>r===null||r.status===429||r.status>=500;
 /** Every caller sharing the limiter backs off, not only this one. */
 const backoff=()=>{limiter.blockedUntil=Math.max(limiter.blockedUntil,now()+BACKOFF_MS);};
 for(let start=0;start<jobs.length;start+=jobsPerRequest){
  if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
  const chunk=jobs.slice(start,start+jobsPerRequest);
  const body=JSON.stringify(chunk);
  const req=await store(new TextEncoder().encode(body),{role:'request',jobs:chunk.length});
  let out=await send(body,req.sha256);
  if(out==='exhausted')return done(true);
  if(retryable(out.res)){
   backoff();   // published first: other callers back off even when this caller cannot afford the retry
   if(budget.remainingMs()-BACKOFF_MS<=reserveMs)return done(true);
   out=await send(body,req.sha256);
   if(out==='exhausted')return done(true);
  }
  if(retryable(out.res)){backoff();return done(true);}
  const res=out.res!;
  if(!res.ok)throw new OpenFigiError('openfigi_http',String(res.status),failures[failures.length-1]);
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder().decode(out.bytes!));}catch{throw new OpenFigiError('invalid_schema','response is not JSON',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});}
  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});
  parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:out.sha!,index:i});});
 }
 return done(false);
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
// src/lib/entities/claims.ts
// Pending issuer_identifier_claims in the claim/1 shape (spec 3 §4.2.1; plan 3 contract C2): the review
// queue for identifier and window changes that contradict stored data or need a human decision.
// validateClaimDetail mirrors the SQL check identifier_claim_problem that resolve_identifier_claim
// runs again on acceptance: keep the two in step (migration 20261107090000). A claim is keyed by
// (issuer_id, id_type, value, op, target_key) while pending (partial unique index); filing the same key
// again only appends new evidence to detail.sources and never changes target or params.
import {createHash,randomUUID} from 'node:crypto';
import {TableError,callRpc} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {ProvenanceError,sanitizeProvenance} from './provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,ClaimTarget,EvidenceKind} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Exclude<ClaimOp,'legacy'>;detail:ClaimDetail}
export const CLAIM_SCHEMA='claim/1';
export const EVIDENCE_KINDS:readonly EvidenceKind[]=['hard_identifier','official_list','name_match','filing_form','provider_mapping'];
const ISSUER_COLUMNS:readonly string[]=['lei','cik','usci','cninfo_org_id'];
const SECURITY_COLUMNS:readonly string[]=['isin','figi'];
const SHARE_CLASSES:readonly string[]=['A','H','ADR','common','preferred','other','unknown'];
const FROM_METHODS:readonly string[]=['first_observed','listing_date','ticker_change','curated'];
const TO_METHODS:readonly string[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];
const BACKDATE_METHODS:readonly string[]=['listing_date','ticker_change','curated'];
const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
const ISIN=/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const TICKER=/^[A-Z0-9][A-Z0-9.-]{0,31}$/;
const SHA256=/^[0-9a-f]{64}$/;

const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max=64):v is string=>typeof v==='string'&&v.length>=1&&v.length<=max;
const onlyKeys=(o:Record<string,unknown>,allowed:readonly string[])=>Object.keys(o).every(k=>allowed.includes(k));

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(`${v}T00:00:00Z`);
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
const validEvidence=(e:unknown):e is ClaimEvidence=>isObj(e)&&str(e.source)&&isIsoDate(e.as_of)&&typeof e.evidence_sha256==='string'&&SHA256.test(e.evidence_sha256 as string)
 &&(e.locator===undefined||typeof e.locator==='string')&&(e.note===undefined||typeof e.note==='string');

/** op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (= SQL identifier_claim_target_key). */
export function claimTargetKey(op:ClaimOp,target:ClaimTarget):string{
 return target.ticker!==undefined?`${op}:${target.issuer_id}|${target.ticker}|${target.valid_from}`:`${op}:${target.issuer_id}`;
}

/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
export function provenanceKeysFor(op:ClaimOp,idType:ClaimIdType):readonly string[]{
 if(op==='set_identifier'||op==='correct_identifier')return [idType];
 if(op==='attach_security')return ['isin','figi','valid_from'];
 if(op==='close_security')return ['valid_to'];
 if(op==='backdate_window')return ['valid_from'];
 return [];
}

type Verdict={ok:true}|{ok:false;error:string};
const bad=(field:string):Verdict=>({ok:false,error:`invalid_claim:${field}`});

/**
 * claim/1 check for (op, id_type, detail) per spec 3 §4.2.1; with `value`, also that the claim's value
 * column agrees (correct_identifier new_value, close/backdate target.ticker). Unknown top-level detail
 * keys are allowed (amend bookkeeping); unknown params keys are not, except for evidence_only.
 */
export function validateClaimDetail(op:ClaimOp,idType:ClaimIdType,detail:unknown,value?:string):Verdict{
 if(op==='legacy')return {ok:false,error:'legacy_claim'};
 if(!isObj(detail)||detail.schema!==CLAIM_SCHEMA)return bad('schema');
 if(!EVIDENCE_KINDS.includes(detail.evidence_kind as EvidenceKind))return bad('evidence_kind');
 const t=detail.target,pa=detail.params;
 if(!isObj(t)||!str(t.issuer_id))return bad('target.issuer_id');
 if(!isObj(pa))return bad('params');
 if(!validEvidence(detail.evidence))return bad('evidence');
 if(!Array.isArray(detail.sources)||!detail.sources.every(validEvidence))return bad('sources');
 if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
 const full='ticker' in t||'valid_from' in t;
 if(full){if(!str(t.ticker,32)||!isIsoDate(t.valid_from)||Object.keys(t).length!==3)return bad('target');}
 else if(Object.keys(t).length!==1)return bad('target');
 switch(op){
  case 'set_identifier':
  case 'correct_identifier':
   if(ISSUER_COLUMNS.includes(idType)){if(full)return bad('target');}
   else if(SECURITY_COLUMNS.includes(idType)){if(!full)return bad('target');}
   else return bad('op_id_type');
   if(op==='set_identifier'){
    if(!onlyKeys(pa,['candidates','note'])||(pa.candidates!==undefined&&!Array.isArray(pa.candidates))||(pa.note!==undefined&&typeof pa.note!=='string'))return bad('params');
   }else{
    if(!onlyKeys(pa,['expected_current','new_value','candidates','note'])||!str(pa.expected_current)||!str(pa.new_value)||pa.expected_current===pa.new_value)return bad('params');
    if(value!==undefined&&pa.new_value!==value)return bad('params.new_value');
   }
   break;
  case 'attach_security':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if(!onlyKeys(pa,['share_class','valid_from','valid_from_method','source','isin','note','ticker'])||(pa.ticker!==undefined&&!(typeof pa.ticker==='string'&&TICKER.test(pa.ticker)))||!SHARE_CLASSES.includes(pa.share_class as string)
    ||!isIsoDate(pa.valid_from)||!FROM_METHODS.includes(pa.valid_from_method as string)||!str(pa.source)
    ||(pa.isin!==undefined&&pa.isin!==null&&!(typeof pa.isin==='string'&&ISIN.test(pa.isin as string))))return bad('params');
   // the inserted ticker is params.ticker, else the claim value (SQL: params.ticker)
   if(pa.ticker===undefined&&value!==undefined&&!TICKER.test(value))return bad('params.ticker');
   break;
  case 'close_security':
  case 'backdate_window':
   if(idType!=='ticker'||!full)return bad('op_id_type');
   if(value!==undefined&&t.ticker!==value)return bad('target.ticker');
   if(op==='close_security'){
    if(!onlyKeys(pa,['valid_to','valid_to_method','note'])||!isIsoDate(pa.valid_to)||!TO_METHODS.includes(pa.valid_to_method as string)||(pa.valid_to as string)<=(t.valid_from as string))return bad('params');
   }else if(!onlyKeys(pa,['new_valid_from','valid_from_method','note'])||!isIsoDate(pa.new_valid_from)||!BACKDATE_METHODS.includes(pa.valid_from_method as string)||(pa.new_valid_from as string)>=(t.valid_from as string))return bad('params');
   break;
  case 'evidence_only':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if('suggested_op' in pa&&!(typeof pa.suggested_op==='string'&&SUGGESTED_OPS.includes(pa.suggested_op)))return bad('params.suggested_op');
   break;
  default:
   return bad('op');
 }
 if(detail.provenance_written!==undefined){
  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
  // SQL: it must carry the op's own provenance key (the one resolve_identifier_claim merges)
  const own=op==='close_security'?'valid_to':op==='set_identifier'||op==='correct_identifier'?idType:'valid_from';
  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
 }
 return {ok:true};
}

/** Canonical JSON (keys sorted at every level, undefined dropped): the bytes whose sha256 names a record. */
export function canonicalJson(v:unknown):string{
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 if(isObj(v))return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
 return JSON.stringify(v??null);
}

/** Evidence for a claim derived from an input record: sha256 over its canonical JSON; as_of is the record's date (first 10 chars) or today (UTC). */
export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
 const day=typeof input.asOf==='string'?input.asOf.slice(0,10):'';
 return {
  source:input.source,as_of:isIsoDate(day)?day:new Date().toISOString().slice(0,10),
  evidence_sha256:createHash('sha256').update(canonicalJson(input.record)).digest('hex'),
  ...(input.locator?{locator:input.locator}:{}),...(input.note?{note:input.note}:{}),
 };
}

export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
 return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
}

/**
 * Appends every evidence item of the incoming claim (detail.evidence plus each of detail.sources) to the
 * pending claim matching `key` through the row-locking SQL function append_claim_evidence (migration
 * 20261107090000, Task 1b; plan audit round 1, P3): it dedupes against the claim's evidence and sources
 * and patches detail.sources only, so concurrent filers never lose each other's evidence and target /
 * params / the first evidence are never touched. 'not_found' = the claim was resolved meanwhile.
 * Needs client.rpc (callRpc: rpc_unavailable otherwise).
 */
async function appendEvidence(client:TableClient,key:Row,detail:ClaimDetail):Promise<'ok'|'not_found'>{
 for(const evidence of [detail.evidence,...(detail.sources??[])]){
  const r=await callRpc(client,'append_claim_evidence',{p_issuer:key.issuer_id,p_id_type:key.id_type,p_value:key.value,p_op:key.op,p_target_key:key.target_key,p_evidence:evidence});
  if(r==='not_found')return 'not_found';
 }
 return 'ok';
}

/** detail.sources without repeats by (source, evidence_sha256), and without the primary evidence itself. */
function dedupeSources(detail:ClaimDetail):ClaimEvidence[]{
 const seen=new Set([`${detail.evidence.source}\u0000${detail.evidence.evidence_sha256}`]);
 return (detail.sources??[]).filter(e=>{const k=`${e.source}\u0000${e.evidence_sha256}`;if(seen.has(k))return false;seen.add(k);return true;});
}

/**
 * Files a pending claim/1 claim. Validates first (throws invalid_claim:<field> / legacy_claim, no DB
 * access). The same pending (issuer_id, id_type, value, op, target_key) → every incoming evidence item
 * is appended to detail.sources and false is returned; a concurrent duplicate (23505 on the partial
 * unique index) is treated the same way. If the pending claim was resolved between the lookup and the
 * append ('not_found'), the whole step is retried once against the current state (a new pending claim
 * is inserted when none is pending); when that still persists nothing the call throws
 * claim_not_persisted (retryable) — it never returns false without having persisted the evidence.
 * Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const v=validateClaimDetail(c.op,c.id_type,c.detail,c.value);
 if(!v.ok)throw new Error(v.error);
 if(c.detail.target.issuer_id!==c.issuer_id)throw new Error('invalid_claim:target.issuer_id');
 if(!str(c.source))throw new Error('invalid_claim:source');
 if(!str(c.value))throw new Error('invalid_claim:value');
 const target_key=claimTargetKey(c.op,c.detail.target);
 const key:Row={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,op:c.op,target_key,status:'pending'};
 for(let attempt=0;attempt<2;attempt++){
  if((await client.select('issuer_identifier_claims',key,{limit:1})).length){
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
   continue;
  }
  try{
   await client.insert('issuer_identifier_claims',{
    id:randomUUID(),issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,confidence:null,status:'pending',
    op:c.op,target_key,detail:{...c.detail,sources:dedupeSources(c.detail)},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
   });
   return true;
  }catch(e){
   if(!isUnique(e))throw e;
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
  }
 }
 throw new Error('claim_not_persisted');
}
src/lib/securities/sync/service.ts:import { writeSecuritySnapshot, type SecurityWriteResult } from './writer';
src/lib/securities/sync/service.ts:  write?: SecurityWriteResult;
src/lib/securities/sync/service.ts:  writeSnapshot?: (snapshot: SecuritySnapshot, validation: SnapshotValidation) => Promise<SecurityWriteResult>;
src/lib/entities/identifiers/plan.ts:export interface SecurityWrite{
src/lib/entities/identifiers/plan.ts: followUps?:ClaimInput[];
src/lib/entities/identifiers/plan.ts:export interface IdentifierPlan{writes:SecurityWrite[];claims:ClaimInput[];quarantines:PlannedQuarantine[];recons:PlannedRecon[];duplicates:number;skipped:string[];figiMissing:string[];ahCandidates:AhCandidate[]}
src/lib/entities/identifiers/plan.ts:  const write=(kind:SecurityWrite['kind'],followUps?:ClaimInput[])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence,sources:p.sources??[p.evidence],...(followUps?.length?{followUps}:{})});
src/lib/entities/identifiers/apply.ts:import {ISIN_RECON_PAIR,type IdentifierPlan,type SecurityWrite} from './plan';
src/lib/entities/identifiers/apply.ts:const claimFor=(w:SecurityWrite,op:'set_identifier'|'correct_identifier',current:string|null):ClaimInput=>({
src/lib/entities/identifiers/apply.ts:   if(outcome==='written'){counts.inserted++;for(const f of w.followUps??[])await fileOne(f);continue;}
src/lib/entities/identifiers/apply.ts:   if(outcome==='duplicate'){counts.duplicates++;for(const f of w.followUps??[])await fileOne(f);continue;}
src/lib/entities/identifiers/apply.ts: for(const c of plan.claims)await fileOne(c);
src/lib/entities/identifiers/plan.test.ts:  expect(isin.followUps!.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','US0378331005',{expected_current:'KYG875721634',new_value:'US0378331005'}]]);
src/lib/entities/identifiers/apply.test.ts: it('files plan claims once, writes HKEX-vs-GLEIF text reconciliations, and summarises skips and claims',async()=>{
src/lib/securities/sync/writer.ts:export interface SecurityWriteResult {
src/lib/securities/sync/writer.ts:export interface SecurityWriterOptions {
src/lib/securities/sync/writer.ts:  options: SecurityWriterOptions = {},
src/lib/securities/sync/writer.ts:): Promise<SecurityWriteResult> {
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
No actionable regressions were identified in the changed planner and apply logic. The changes consistently aggregate FIGI candidates, condition HKEX follow-up claims on successful writes, and preserve separate OpenFIGI evidence. Tests were inspected but not executed.
No actionable regressions were identified in the changed planner and apply logic. The changes consistently aggregate FIGI candidates, condition HKEX follow-up claims on successful writes, and preserve separate OpenFIGI evidence. Tests were inspected but not executed.
