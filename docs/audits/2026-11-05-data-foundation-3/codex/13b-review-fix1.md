OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0d1-14d7-71b1-88c4-18bb78948928
--------
user
commit b116bc6
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline b116bc6; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 3013ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-wSUT8pFz' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ljSqC3SV' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Dz3GHKQ3' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2ajYjpys' (errno=Operation not permitted)
b116bc6 fix(dq): harden iXBRL parser (tuple ancestry, unit namespaces, dei conflicts, continuations, decimal bounds, context checks)
 src/lib/dq/reconcile/ixbrl.test.ts | 43 +++++++++++++++++++++++++++++--
 src/lib/dq/reconcile/ixbrl.ts      | 52 +++++++++++++++++++++++++-------------
 2 files changed, 75 insertions(+), 20 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || { echo "$d/$f"; cat "$d/$f"; }; done; done; ls -a | head -30; git show b116bc6 --; cat src/lib/dq/reconcile/ixbrl.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
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
git: error: couldn't create cache file '/tmp/xcrun_db-haJqqtEM' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ta7aCMRX' (errno=Operation not permitted)
commit b116bc6b3113ca89842675a45c84be14d1c96bce
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:23:57 2026 -0800

    fix(dq): harden iXBRL parser (tuple ancestry, unit namespaces, dei conflicts, continuations, decimal bounds, context checks)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/ixbrl.test.ts b/src/lib/dq/reconcile/ixbrl.test.ts
index 60ec4a2..eac372f 100644
--- a/src/lib/dq/reconcile/ixbrl.test.ts
+++ b/src/lib/dq/reconcile/ixbrl.test.ts
@@ -137,11 +137,11 @@ describe('document-level behaviour and the tokenizer bounds',()=>{
  it('a document without any ix element is not_inline_xbrl',()=>{
   expect(parseInlineXbrl('<html><body><p>Annual report</p></body></html>')).toEqual({facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]});
  });
- it('ix:fraction, ix:tuple and tuple members are unsupported; conflicting dei texts keep the first and report',()=>{
+ it('ix:fraction, ix:tuple and tuple members are unsupported; conflicting dei texts drop the key and report',()=>{
   const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"></ix:tuple><ix:fraction name="us-gaap:F" contextRef="d" unitRef="usd"><ix:numerator>1</ix:numerator><ix:denominator>2</ix:denominator></ix:fraction>'+nf('tupleRef="t1"','1')+'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>');
   expect(d.facts).toEqual([]);
   expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','ix_fraction','tuple_member','nonnumeric_conflict']);
-  expect(d.nonNumeric['dei:EntityFilerCategory']).toBe('Accelerated Filer');
+  expect(d.nonNumeric['dei:EntityFilerCategory']).toBeUndefined();   // conflicting → unavailable
  });
  it('decodes the five XML entities, &nbsp; and numeric references; leaves unknown entities literal',()=>{
   expect(decodeEntities('a&lt;b&gt;&amp;&quot;&apos;&nbsp;&#65;&#x42;&bogus;')).toBe('a<b>&"\' AB&bogus;');
@@ -162,3 +162,42 @@ describe('document-level behaviour and the tokenizer bounds',()=>{
   expect([...tokenizeXml(src)].map(t=>[t.t,src.slice(t.start,t.end)])).toEqual([['open','<a x="1">'],['text','hi'],['close','</a>']]);
  });
 });
+
+describe('plan-review hardening (Codex round)',()=>{
+ it('facts nested anywhere inside ix:tuple are excluded and reported, with or without tupleRef',()=>{
+  const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:tuple name="us-gaap:U" tupleID="t2">'+nf('','7')+'</ix:tuple></ix:tuple>'+nf('','8','us-gaap:Assets','i'));
+  expect(d.facts.map(f=>f.value)).toEqual(['8']);
+  expect(d.nonNumeric).toEqual({});
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','tuple_member','ix_tuple','tuple_member']);
+ });
+ it('validates measure namespace and local name together',()=>{
+  const res=RES+'<xbrli:unit id="bad1"><xbrli:measure>xbrli:USD</xbrli:measure></xbrli:unit><xbrli:unit id="bad2"><xbrli:measure>iso4217:shares</xbrli:measure></xbrli:unit><xbrli:unit id="bad3"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>iso4217:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>';
+  const d=parseInlineXbrl(doc(nf('','1','us-gaap:Revenues','d','bad1')+nf('','1','us-gaap:Revenues','d','bad2')+nf('','1','us-gaap:Revenues','d','bad3')+nf('','1'),res));
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['unit','unit','unit']);
+  expect(d.facts.map(f=>f.unit)).toEqual(['USD']);
+ });
+ it('a repeated value after a conflict does not resurrect the dei key',()=>{
+  const e=(t:string)=>`<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">${t}</ix:nonNumeric>`;
+  const d=one(e('A')+e('B')+e('A')+e('B'));
+  expect(d.nonNumeric).toEqual({});
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['nonnumeric_conflict']);
+ });
+ it('continuedAt facts are unsupported(continuation); fragments never reach nonNumeric',()=>{
+  const d=one('<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d" continuedAt="k1">Large Acc</ix:nonNumeric><ix:continuation id="k1">elerated Filer</ix:continuation>'+nf('continuedAt="k2"','1')+nf('','2','us-gaap:Assets','i'));
+  expect(d.nonNumeric).toEqual({});
+  expect(d.facts.map(f=>f.value)).toEqual(['2']);
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['continuation','continuation']);
+ });
+ it('an out-of-bounds numeric literal is a fact-level unsupported(decimal_bounds); other facts survive',()=>{
+  const d=one(nf('','1'.repeat(513))+nf('','5','us-gaap:Assets','i')+nf('scale="99"','1'.repeat(450),'us-gaap:Liabilities'));
+  expect(d.facts.map(f=>f.value)).toEqual(['5']);
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['decimal_bounds','decimal_bounds']);
+ });
+ it('a duplicate context id makes facts referencing it unsupported; a context without identifier is unsupported(entity)',()=>{
+  const noId='<xbrli:context id="noid"><xbrli:entity></xbrli:entity><xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period></xbrli:context>';
+  const res=RES+ctx('dup',DUR)+ctx('dup','<xbrli:instant>2024-01-01</xbrli:instant>')+noId;
+  const d=parseInlineXbrl(doc(nf('','1','us-gaap:Revenues','dup')+nf('','2','us-gaap:Revenues','noid')+nf('','3'),res));
+  expect(d.facts.map(f=>f.value)).toEqual(['3']);
+  expect(d.unsupported.map(u=>[u.reason,u.contextRef])).toEqual([['context_duplicate','dup'],['entity','noid']]);
+ });
+});
diff --git a/src/lib/dq/reconcile/ixbrl.ts b/src/lib/dq/reconcile/ixbrl.ts
index d3c7e33..5ce5d5c 100644
--- a/src/lib/dq/reconcile/ixbrl.ts
+++ b/src/lib/dq/reconcile/ixbrl.ts
@@ -175,9 +175,9 @@ export function indexIxFacts(facts:readonly IxFact[]):Map<string,{values:string[
 // ---------------- parser ----------------
 interface Frame{name:string;ns:NsMap;uri:string|null;local:string}
 interface RawCtx{id:string;scheme:string;ident:string;start:string;end:string;instant:string;forever:boolean;dimensional:boolean}
-interface RawUnit{id:string;measures:string[];num:string[];den:string[]}
-interface FactFrame{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;inner:string|null}
-interface RawFact{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string}
+interface RawUnit{id:string;measures:string[];num:string[];den:string[];bad:boolean}
+interface FactFrame{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;inner:string|null;tuple:boolean}
+interface RawFact{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;tuple:boolean}
 /**
  * Mutable parser state, one explicitly typed object (plan audit P7): the open/close callbacks and the token
  * loop all read and write it through `st.*`. Closure `let`s assigned inside callbacks are invisible to the
@@ -185,7 +185,7 @@ interface RawFact{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string}
  * strict 5.9); property reads of a typed object are narrowed per use instead.
  */
 interface ParseState{
- sawIx:boolean;exclude:number;
+ sawIx:boolean;exclude:number;tuple:number;
  ctx:RawCtx|null;ctxField:'ident'|'start'|'end'|'instant'|null;segDepth:number;
  unit:RawUnit|null;unitPart:'num'|'den'|null;measure:{ns:NsMap;text:string}|null;
 }
@@ -199,6 +199,7 @@ function periodOf(c:RawCtx):{start:string|null;end:string}|null{
  return null;
 }
 function unitString(u:RawUnit):string|null{
+ if(u.bad)return null;
  if(u.num.length>0||u.den.length>0)return u.num.length===1&&u.den.length===1&&u.measures.length===0?`${u.num[0]}/${u.den[0]}`:null;
  return u.measures.length===1?u.measures[0]:null;
 }
@@ -209,17 +210,22 @@ export function parseInlineXbrl(doc:string):IxbrlDocument{
  const stack:Frame[]=[];
  const contexts=new Map<string,RawCtx>();const units=new Map<string,RawUnit>();const rawFacts:RawFact[]=[];
  const open:FactFrame[]=[];
- const st:ParseState={sawIx:false,exclude:0,ctx:null,ctxField:null,segDepth:-1,unit:null,unitPart:null,measure:null};
+ const dupCtx=new Set<string>(),dupUnits=new Set<string>(),conflicted=new Set<string>();
+ const st:ParseState={sawIx:false,exclude:0,tuple:0,ctx:null,ctxField:null,segDepth:-1,unit:null,unitPart:null,measure:null};
 
  const onOpen=(f:Frame,attrs:[string,string][])=>{
   if(st.ctx!==null&&st.segDepth>=0){st.ctx.dimensional=true;return;}   // any element inside segment / scenario
   if(f.uri===NS.ix){
    st.sawIx=true;
    if(f.local==='nonFraction'||f.local==='nonNumeric'){
-    if(attrOf(attrs,'tupleRef')!==undefined)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
-    open.push({kind:f.local==='nonFraction'?'nf':'nn',attrs,ns:f.ns,text:'',inner:null});
+    const member=attrOf(attrs,'tupleRef')!==undefined||st.tuple>0;   // directly or transitively inside ix:tuple
+    if(member)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
+    open.push({kind:f.local==='nonFraction'?'nf':'nn',attrs,ns:f.ns,text:'',inner:null,tuple:member});
    }else if(f.local==='exclude')st.exclude++;
-   else if(f.local==='fraction'||f.local==='tuple')out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
+   else if(f.local==='fraction'||f.local==='tuple'){
+    if(f.local==='tuple')st.tuple++;
+    out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
+   }
    return;
   }
   if(f.uri!==NS.xbrli)return;
@@ -233,7 +239,7 @@ export function parseInlineXbrl(doc:string):IxbrlDocument{
    if(f.local==='forever'){st.ctx.forever=true;return;}
    return;
   }
-  if(f.local==='unit'){st.unit={id:attrOf(attrs,'id')??'',measures:[],num:[],den:[]};return;}
+  if(f.local==='unit'){st.unit={id:attrOf(attrs,'id')??'',measures:[],num:[],den:[],bad:false};return;}
   if(st.unit!==null){
    if(f.local==='unitNumerator')st.unitPart='num';
    else if(f.local==='unitDenominator')st.unitPart='den';
@@ -243,27 +249,31 @@ export function parseInlineXbrl(doc:string):IxbrlDocument{
  const onClose=(f:Frame)=>{
   if(f.uri===NS.ix){
    if(f.local==='exclude'){st.exclude=Math.max(0,st.exclude-1);return;}
+   if(f.local==='tuple'){st.tuple=Math.max(0,st.tuple-1);return;}
    if(f.local==='nonFraction'||f.local==='nonNumeric'){
     const fr=open.pop();if(!fr)return;
     const text=fr.inner??fr.text;
     const parent=open[open.length-1];
     if(parent){if(parent.kind==='nf')parent.inner=text;else parent.text+=text;}
-    rawFacts.push({kind:fr.kind,attrs:fr.attrs,ns:fr.ns,text});
+    rawFacts.push({kind:fr.kind,attrs:fr.attrs,ns:fr.ns,text,tuple:fr.tuple});
    }
    return;
   }
   if(f.uri!==NS.xbrli)return;
   if(st.ctx!==null){
-   if(f.local==='context'){contexts.set(st.ctx.id,st.ctx);st.ctx=null;st.ctxField=null;st.segDepth=-1;return;}
+   if(f.local==='context'){if(contexts.has(st.ctx.id))dupCtx.add(st.ctx.id);contexts.set(st.ctx.id,st.ctx);st.ctx=null;st.ctxField=null;st.segDepth=-1;return;}
    if((f.local==='segment'||f.local==='scenario')&&st.segDepth===stack.length){st.segDepth=-1;return;}
    if(f.local==='identifier'||f.local==='startDate'||f.local==='endDate'||f.local==='instant')st.ctxField=null;
    return;
   }
   if(st.unit!==null){
-   if(f.local==='unit'){units.set(st.unit.id,st.unit);st.unit=null;st.unitPart=null;return;}
+   if(f.local==='unit'){if(units.has(st.unit.id))dupUnits.add(st.unit.id);units.set(st.unit.id,st.unit);st.unit=null;st.unitPart=null;return;}
    if(f.local==='measure'&&st.measure!==null){
     const r=resolveQName(st.measure.text.trim(),st.measure.ns,true);
-    const m=r.uri===NS.iso4217||r.uri===NS.xbrli?r.local:`{${r.uri??''}}${r.local}`;
+    // namespace and local name are validated together: iso4217 → ISO currency code, xbrli → shares | pure
+    const okMeasure=(r.uri===NS.iso4217&&/^[A-Z]{3}$/.test(r.local))||(r.uri===NS.xbrli&&(r.local==='shares'||r.local==='pure'));
+    if(!okMeasure)st.unit.bad=true;
+    const m=okMeasure?r.local:`{${r.uri??''}}${r.local}`;
     (st.unitPart==='num'?st.unit.num:st.unitPart==='den'?st.unit.den:st.unit.measures).push(m);st.measure=null;return;
    }
    if(f.local==='unitNumerator'||f.local==='unitDenominator')st.unitPart=null;
@@ -300,25 +310,30 @@ export function parseInlineXbrl(doc:string):IxbrlDocument{
   if(!nameQ){out.unsupported.push({reason:'name'});continue;}
   const q=resolveQName(nameQ.trim(),f.ns,true);const name=canonicalConcept(q.uri,q.local);
   if(f.kind==='nn'){
-   if(!DEI_NON_NUMERIC.includes(name))continue;
+   if(!DEI_NON_NUMERIC.includes(name)||f.tuple)continue;
+   if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
+   if(conflicted.has(name))continue;   // once conflicting, unavailable for good
    const text=f.text.replace(/\s+/g,' ').trim();
    const prev=out.nonNumeric[name];
    if(prev===undefined)out.nonNumeric[name]=text;
-   else if(prev!==text)out.unsupported.push({reason:'nonnumeric_conflict',name});
+   else if(prev!==text){delete out.nonNumeric[name];conflicted.add(name);out.unsupported.push({reason:'nonnumeric_conflict',name});}
    continue;
   }
-  if(attrOf(f.attrs,'tupleRef')!==undefined)continue;   // reported when opened
+  if(f.tuple)continue;   // reported when opened
+  if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
   const contextRef=attrOf(f.attrs,'contextRef')??'';
   const c=contexts.get(contextRef);
   if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
+  if(dupCtx.has(contextRef)){out.unsupported.push({reason:'context_duplicate',name,contextRef});continue;}
   if(c.dimensional)continue;
+  if(c.ident.trim()===''||c.scheme.trim()===''){out.unsupported.push({reason:'entity',name,contextRef});continue;}
   const period=periodOf(c);
   if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
   const where={name,contextRef,periodStart:period.start,periodEnd:period.end};
   const nil=nsAttr(f.attrs,f.ns,NS.xsi,'nil');
   if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
   const unitRef=attrOf(f.attrs,'unitRef')??'';
-  const u=units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
+  const u=dupUnits.has(unitRef)?undefined:units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
   if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
   const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
   if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
@@ -328,7 +343,8 @@ export function parseInlineXbrl(doc:string):IxbrlDocument{
   const digits=fmt===null?null:parseFactText(fmt,f.text);
   if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
   const scale=Number(scaleRaw);
-  let value=canonicalDecimal(`${digits}e${scale}`);
+  let value:string;
+  try{value=canonicalDecimal(`${digits}e${scale}`);}catch{out.unsupported.push({reason:'decimal_bounds',...where});continue;}
   if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
   out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:attrOf(f.attrs,'decimals')??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
  }
// src/lib/dq/reconcile/ixbrl.ts
// Inline XBRL subset parser (spec §5.2), IXBRL_PARSER_VERSION='ixbrl/1'.
// A bounded streaming XML tokenizer (elements, attributes, the five XML entities plus &nbsp; and numeric
// character references; comments, processing instructions and a DOCTYPE WITHOUT internal subset are
// skipped; an internal DTD subset is refused; CDATA is literal text; script/style content is raw text;
// depth <= 1000, attributes <= 256 per element) feeds a parser that resolves every element name and every
// QName value through the in-scope xmlns declarations, so prefixes never matter.
// Supported subset (each has a test); everything else lands in `unsupported` and is never merged:
//  - xbrli:context: entity/identifier; period startDate+endDate | instant, dates YYYY-MM-DD. ANY child
//    element inside segment or scenario marks the context dimensional and its facts are skipped (out of
//    scope by design, not reported). Facts carry (entity, period), so equal contexts with different ids
//    give the same key (ixFactKey) — the normalised dedupe.
//  - xbrli:unit: one measure, or divide with exactly one numerator and one denominator measure; iso4217
//    and xbrli measures become USD / shares / pure, then facts/units.ts normalizeUnit ('USD/shares' →
//    'USD/share'); anything else → unsupported(unit).
//  - ix:nonFraction: name, contextRef, unitRef, scale, sign, decimals, format, xsi:nil. Text grammar by
//    format (transformation registries 2015-02-26, 2020-02-12, 2022-02-16 only):
//      (no format), num-dot-decimal, numdotdecimal   ^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$   commas dropped
//      num-comma-decimal, numcommadecimal            ^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$    dots dropped, comma = point
//      fixed-zero, zerodash                          → 0
//      numwordsen                                    'no' | 'none' (trimmed, case-insensitive) → 0
//    any other format or no match → unsupported(format); xsi:nil = true|1 → unsupported(nil).
//    value = canonical decimal × 10^scale, negated when sign='-'. A nested ix:nonFraction gives the outer
//    fact the innermost text; text inside ix:exclude is not fact text.
//  - ix:nonNumeric: only dei:EntityFilerCategory, dei:DocumentFiscalYearFocus, dei:DocumentPeriodEndDate
//    (whitespace-collapsed raw text; a second, different text → unsupported(nonnumeric_conflict)).
//  - ix:fraction, ix:tuple and facts with tupleRef → unsupported. No ix element at all → not_inline_xbrl.
// Malformed XML throws IxbrlParseError(code); the pair turns that into unsupported results.
import {canonicalDecimal} from '../../facts/json-numbers';
import {normalizeUnit} from '../../facts/units';

export const IXBRL_PARSER_VERSION='ixbrl/1';
export const MAX_IXBRL_BYTES=50*1024*1024;
export const NS={ix:'http://www.xbrl.org/2013/inlineXBRL',xbrli:'http://www.xbrl.org/2003/instance',xbrldi:'http://xbrl.org/2006/xbrldi',xsi:'http://www.w3.org/2001/XMLSchema-instance',iso4217:'http://www.xbrl.org/2003/iso4217',xml:'http://www.w3.org/XML/1998/namespace'} as const;
export const TRANSFORM_NS:readonly string[]=['http://www.xbrl.org/inlineXBRL/transformation/2015-02-26','http://www.xbrl.org/inlineXBRL/transformation/2020-02-12','http://www.xbrl.org/inlineXBRL/transformation/2022-02-16'];
export const DEI_NON_NUMERIC:readonly string[]=['dei:EntityFilerCategory','dei:DocumentFiscalYearFocus','dei:DocumentPeriodEndDate'];

export interface IxFact{name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number;entity:string;contextRef:string;unitRef:string}
export interface IxUnsupported{reason:string;name?:string;contextRef?:string;periodStart?:string|null;periodEnd?:string}
export interface IxbrlDocument{facts:IxFact[];nonNumeric:Record<string,string>;unsupported:IxUnsupported[]}
export class IxbrlParseError extends Error{constructor(public readonly code:string){super(code);this.name='IxbrlParseError';}}

// ---------------- tokenizer ----------------
export type XmlToken=
 |{t:'open';name:string;attrs:[string,string][];self:boolean;start:number;end:number}
 |{t:'close';name:string;start:number;end:number}
 |{t:'text';text:string;start:number;end:number};
const MAX_DEPTH=1000,MAX_ATTRS=256;
const NAME_RE=/[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y;
const NAMED:Record<string,string>={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",nbsp:' '};
const fail=(code:string):never=>{throw new IxbrlParseError(code);};
const isWs=(c:number)=>c===32||c===9||c===10||c===13;
function nameAt(doc:string,at:number):string|null{NAME_RE.lastIndex=at;const m=NAME_RE.exec(doc);return m?m[0]:null;}

export function decodeEntities(s:string):string{
 if(!s.includes('&'))return s;
 return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,31});/g,(m,b:string)=>{
  if(b[0]!=='#')return NAMED[b]??m;
  const cp=b[1]==='x'||b[1]==='X'?Number.parseInt(b.slice(2),16):Number.parseInt(b.slice(1),10);
  return cp>0&&cp<=0x10ffff&&(cp<0xd800||cp>0xdfff)?String.fromCodePoint(cp):m;
 });
}

/** Streaming tokens with source offsets [start, end). Throws IxbrlParseError on malformed markup. */
export function* tokenizeXml(doc:string):Generator<XmlToken>{
 const n=doc.length;let i=doc.charCodeAt(0)===0xfeff?1:0;let depth=0;let rawEnd:string|null=null;let lower:string|null=null;
 while(i<n){
  if(rawEnd!==null){
   lower??=doc.toLowerCase();
   const e=lower.indexOf(rawEnd,i);if(e<0)fail('unterminated_raw_text');
   if(e>i)yield {t:'text',text:doc.slice(i,e),start:i,end:e};
   rawEnd=null;i=e;continue;
  }
  const lt=doc.indexOf('<',i);
  if(lt<0){yield {t:'text',text:decodeEntities(doc.slice(i)),start:i,end:n};break;}
  if(lt>i)yield {t:'text',text:decodeEntities(doc.slice(i,lt)),start:i,end:lt};
  if(doc.startsWith('<!--',lt)){const e=doc.indexOf('-->',lt+4);if(e<0)fail('unterminated_comment');i=e+3;continue;}
  if(doc.startsWith('<![CDATA[',lt)){const e=doc.indexOf(']]>',lt+9);if(e<0)fail('unterminated_cdata');yield {t:'text',text:doc.slice(lt+9,e),start:lt,end:e+3};i=e+3;continue;}
  if(doc.startsWith('<?',lt)){const e=doc.indexOf('?>',lt+2);if(e<0)fail('unterminated_pi');i=e+2;continue;}
  if(doc.startsWith('<!',lt)){const e=doc.indexOf('>',lt+2);if(e<0)fail('unterminated_declaration');if(doc.slice(lt,e).includes('['))fail('dtd_unsupported');i=e+1;continue;}
  if(doc.charCodeAt(lt+1)===47){
   const name=nameAt(doc,lt+2)??fail('bad_close_tag');
   let j=lt+2+name.length;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='>')fail('bad_close_tag');
   depth--;if(depth<0)fail('unbalanced_close');
   yield {t:'close',name,start:lt,end:j+1};i=j+1;continue;
  }
  const name=nameAt(doc,lt+1)??fail('bad_open_tag');
  let j=lt+1+name.length;const attrs:[string,string][]=[];let self=false;
  for(;;){
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(j>=n)fail('unterminated_tag');
   if(doc.startsWith('/>',j)){self=true;j+=2;break;}
   if(doc[j]==='>'){j++;break;}
   const an=nameAt(doc,j)??fail('bad_attribute');j+=an.length;
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='=')fail('bad_attribute');
   j++;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   const q=doc[j];if(q!=='"'&&q!=="'")fail('bad_attribute');
   const e=doc.indexOf(q,j+1);if(e<0)fail('unterminated_attribute');
   attrs.push([an,decodeEntities(doc.slice(j+1,e))]);j=e+1;
   if(attrs.length>MAX_ATTRS)fail('too_many_attributes');
  }
  yield {t:'open',name,attrs,self,start:lt,end:j};
  if(!self){
   depth++;if(depth>MAX_DEPTH)fail('too_deep');
   const local=name.slice(name.indexOf(':')+1).toLowerCase();
   if(local==='script'||local==='style')rawEnd=`</${name.toLowerCase()}`;
  }
  i=j;
 }
 if(rawEnd!==null)fail('unterminated_raw_text');
}

// ---------------- names ----------------
export type NsMap=ReadonlyMap<string,string>;   // prefix ('' = default namespace) → URI
/** Element names and QName values use the default namespace when unprefixed (useDefault); plain attribute names never do. */
export function resolveQName(q:string,ns:NsMap,useDefault:boolean):{uri:string|null;local:string}{
 const k=q.indexOf(':');
 if(k<0)return {uri:useDefault?(ns.get('')??null):null,local:q};
 const p=q.slice(0,k);
 return {uri:p==='xml'?NS.xml:(ns.get(p)??null),local:q.slice(k+1)};
}
/** Canonical concept name: us-gaap / dei / ifrs-full / srt by namespace URI pattern (any taxonomy year), else Clark notation {uri}local. */
export function canonicalConcept(uri:string|null,local:string):string{
 if(uri!==null){
  if(/^http:\/\/fasb\.org\/us-gaap\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `us-gaap:${local}`;
  if(/^http:\/\/xbrl\.sec\.gov\/dei\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `dei:${local}`;
  if(/^https?:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full$/.test(uri))return `ifrs-full:${local}`;
  if(/^http:\/\/fasb\.org\/srt\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `srt:${local}`;
 }
 return `{${uri??''}}${local}`;
}
const attrOf=(attrs:readonly [string,string][],name:string)=>attrs.find(([k])=>k===name)?.[1];
function nsAttr(attrs:readonly [string,string][],ns:NsMap,uri:string,local:string):string|undefined{
 for(const [k,v] of attrs){
  const i=k.indexOf(':');if(i<0)continue;
  const p=k.slice(0,i);if(p==='xmlns')continue;
  if(ns.get(p)===uri&&k.slice(i+1)===local)return v;
 }
 return undefined;
}

// ---------------- values ----------------
const RE_DOT=/^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$/;
const RE_COMMA=/^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$/;
/** Digits (no exponent) for a format's text, or null when the text does not match the format's grammar. */
export function parseFactText(format:string,text:string):string|null{
 switch(format){
  case 'none':case 'num-dot-decimal':case 'numdotdecimal':return RE_DOT.test(text)?text.replace(/[\s,]/g,''):null;
  case 'num-comma-decimal':case 'numcommadecimal':return RE_COMMA.test(text)?text.replace(/[\s.]/g,'').replace(',','.'):null;
  case 'fixed-zero':case 'zerodash':return '0';
  case 'numwordsen':{const t=text.trim().toLowerCase();return t==='no'||t==='none'?'0':null;}
  default:return null;
 }
}
function formatOf(q:string|undefined,ns:NsMap):string|null{
 if(q===undefined)return 'none';
 const r=resolveQName(q.trim(),ns,true);
 return r.uri!==null&&TRANSFORM_NS.includes(r.uri)?r.local:null;
}
/** Right-side key of a fact: (concept, canonical context = entity + period, unit). */
export const ixFactKey=(f:Pick<IxFact,'name'|'entity'|'periodStart'|'periodEnd'|'unit'>)=>[f.name,f.entity,f.periodStart??'',f.periodEnd,f.unit].join('|');
/** Facts grouped by ixFactKey with their DISTINCT values (canonical decimal equality), in document order. */
export function indexIxFacts(facts:readonly IxFact[]):Map<string,{values:string[];facts:IxFact[]}>{
 const out=new Map<string,{values:string[];facts:IxFact[]}>();
 for(const f of facts){
  const k=ixFactKey(f);const g=out.get(k)??{values:[],facts:[]};
  if(!g.values.includes(f.value))g.values.push(f.value);
  g.facts.push(f);out.set(k,g);
 }
 return out;
}

// ---------------- parser ----------------
interface Frame{name:string;ns:NsMap;uri:string|null;local:string}
interface RawCtx{id:string;scheme:string;ident:string;start:string;end:string;instant:string;forever:boolean;dimensional:boolean}
interface RawUnit{id:string;measures:string[];num:string[];den:string[];bad:boolean}
interface FactFrame{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;inner:string|null;tuple:boolean}
interface RawFact{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;tuple:boolean}
/**
 * Mutable parser state, one explicitly typed object (plan audit P7): the open/close callbacks and the token
 * loop all read and write it through `st.*`. Closure `let`s assigned inside callbacks are invisible to the
 * loop's control-flow analysis (TS narrows them to their initial null/false → `never`, TS2322/TS2339 under
 * strict 5.9); property reads of a typed object are narrowed per use instead.
 */
interface ParseState{
 sawIx:boolean;exclude:number;tuple:number;
 ctx:RawCtx|null;ctxField:'ident'|'start'|'end'|'instant'|null;segDepth:number;
 unit:RawUnit|null;unitPart:'num'|'den'|null;measure:{ns:NsMap;text:string}|null;
}
const DATE=/^\d{4}-\d{2}-\d{2}$/;

function periodOf(c:RawCtx):{start:string|null;end:string}|null{
 if(c.forever)return null;
 const s=c.start.trim(),e=c.end.trim(),i=c.instant.trim();
 if(i!==''&&s===''&&e==='')return DATE.test(i)?{start:null,end:i}:null;
 if(i===''&&DATE.test(s)&&DATE.test(e)&&s<=e)return {start:s,end:e};
 return null;
}
function unitString(u:RawUnit):string|null{
 if(u.bad)return null;
 if(u.num.length>0||u.den.length>0)return u.num.length===1&&u.den.length===1&&u.measures.length===0?`${u.num[0]}/${u.den[0]}`:null;
 return u.measures.length===1?u.measures[0]:null;
}

export function parseInlineXbrl(doc:string):IxbrlDocument{
 const out:IxbrlDocument={facts:[],nonNumeric:{},unsupported:[]};
 const root:NsMap=new Map([['xml',NS.xml]]);
 const stack:Frame[]=[];
 const contexts=new Map<string,RawCtx>();const units=new Map<string,RawUnit>();const rawFacts:RawFact[]=[];
 const open:FactFrame[]=[];
 const dupCtx=new Set<string>(),dupUnits=new Set<string>(),conflicted=new Set<string>();
 const st:ParseState={sawIx:false,exclude:0,tuple:0,ctx:null,ctxField:null,segDepth:-1,unit:null,unitPart:null,measure:null};

 const onOpen=(f:Frame,attrs:[string,string][])=>{
  if(st.ctx!==null&&st.segDepth>=0){st.ctx.dimensional=true;return;}   // any element inside segment / scenario
  if(f.uri===NS.ix){
   st.sawIx=true;
   if(f.local==='nonFraction'||f.local==='nonNumeric'){
    const member=attrOf(attrs,'tupleRef')!==undefined||st.tuple>0;   // directly or transitively inside ix:tuple
    if(member)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
    open.push({kind:f.local==='nonFraction'?'nf':'nn',attrs,ns:f.ns,text:'',inner:null,tuple:member});
   }else if(f.local==='exclude')st.exclude++;
   else if(f.local==='fraction'||f.local==='tuple'){
    if(f.local==='tuple')st.tuple++;
    out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
   }
   return;
  }
  if(f.uri!==NS.xbrli)return;
  if(f.local==='context'){st.ctx={id:attrOf(attrs,'id')??'',scheme:'',ident:'',start:'',end:'',instant:'',forever:false,dimensional:false};return;}
  if(st.ctx!==null){
   if(f.local==='segment'||f.local==='scenario'){st.segDepth=stack.length;return;}
   if(f.local==='identifier'){st.ctx.scheme=attrOf(attrs,'scheme')??'';st.ctxField='ident';return;}
   if(f.local==='startDate'){st.ctxField='start';return;}
   if(f.local==='endDate'){st.ctxField='end';return;}
   if(f.local==='instant'){st.ctxField='instant';return;}
   if(f.local==='forever'){st.ctx.forever=true;return;}
   return;
  }
  if(f.local==='unit'){st.unit={id:attrOf(attrs,'id')??'',measures:[],num:[],den:[],bad:false};return;}
  if(st.unit!==null){
   if(f.local==='unitNumerator')st.unitPart='num';
   else if(f.local==='unitDenominator')st.unitPart='den';
   else if(f.local==='measure')st.measure={ns:f.ns,text:''};
  }
 };
 const onClose=(f:Frame)=>{
  if(f.uri===NS.ix){
   if(f.local==='exclude'){st.exclude=Math.max(0,st.exclude-1);return;}
   if(f.local==='tuple'){st.tuple=Math.max(0,st.tuple-1);return;}
   if(f.local==='nonFraction'||f.local==='nonNumeric'){
    const fr=open.pop();if(!fr)return;
    const text=fr.inner??fr.text;
    const parent=open[open.length-1];
    if(parent){if(parent.kind==='nf')parent.inner=text;else parent.text+=text;}
    rawFacts.push({kind:fr.kind,attrs:fr.attrs,ns:fr.ns,text,tuple:fr.tuple});
   }
   return;
  }
  if(f.uri!==NS.xbrli)return;
  if(st.ctx!==null){
   if(f.local==='context'){if(contexts.has(st.ctx.id))dupCtx.add(st.ctx.id);contexts.set(st.ctx.id,st.ctx);st.ctx=null;st.ctxField=null;st.segDepth=-1;return;}
   if((f.local==='segment'||f.local==='scenario')&&st.segDepth===stack.length){st.segDepth=-1;return;}
   if(f.local==='identifier'||f.local==='startDate'||f.local==='endDate'||f.local==='instant')st.ctxField=null;
   return;
  }
  if(st.unit!==null){
   if(f.local==='unit'){if(units.has(st.unit.id))dupUnits.add(st.unit.id);units.set(st.unit.id,st.unit);st.unit=null;st.unitPart=null;return;}
   if(f.local==='measure'&&st.measure!==null){
    const r=resolveQName(st.measure.text.trim(),st.measure.ns,true);
    // namespace and local name are validated together: iso4217 → ISO currency code, xbrli → shares | pure
    const okMeasure=(r.uri===NS.iso4217&&/^[A-Z]{3}$/.test(r.local))||(r.uri===NS.xbrli&&(r.local==='shares'||r.local==='pure'));
    if(!okMeasure)st.unit.bad=true;
    const m=okMeasure?r.local:`{${r.uri??''}}${r.local}`;
    (st.unitPart==='num'?st.unit.num:st.unitPart==='den'?st.unit.den:st.unit.measures).push(m);st.measure=null;return;
   }
   if(f.local==='unitNumerator'||f.local==='unitDenominator')st.unitPart=null;
  }
 };

 for(const tok of tokenizeXml(doc)){
  if(tok.t==='text'){
   if(st.ctx!==null&&st.ctxField!==null&&st.segDepth<0)st.ctx[st.ctxField]+=tok.text;
   if(st.measure!==null)st.measure.text+=tok.text;
   if(open.length>0&&st.exclude===0)open[open.length-1].text+=tok.text;
   continue;
  }
  if(tok.t==='open'){
   const parent=stack.length>0?stack[stack.length-1].ns:root;
   let ns:NsMap=parent;
   const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
   if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
   const {uri,local}=resolveQName(tok.name,ns,true);
   const frame:Frame={name:tok.name,ns,uri,local};
   if(tok.self){onOpen(frame,tok.attrs);onClose(frame);}
   else{onOpen(frame,tok.attrs);stack.push(frame);}
   continue;
  }
  const frame=stack.pop();
  if(!frame||frame.name!==tok.name)throw new IxbrlParseError('mismatched_close');
  onClose(frame);
 }
 if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
 if(!st.sawIx)return {facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]};

 for(const f of rawFacts){
  const nameQ=attrOf(f.attrs,'name');
  if(!nameQ){out.unsupported.push({reason:'name'});continue;}
  const q=resolveQName(nameQ.trim(),f.ns,true);const name=canonicalConcept(q.uri,q.local);
  if(f.kind==='nn'){
   if(!DEI_NON_NUMERIC.includes(name)||f.tuple)continue;
   if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
   if(conflicted.has(name))continue;   // once conflicting, unavailable for good
   const text=f.text.replace(/\s+/g,' ').trim();
   const prev=out.nonNumeric[name];
   if(prev===undefined)out.nonNumeric[name]=text;
   else if(prev!==text){delete out.nonNumeric[name];conflicted.add(name);out.unsupported.push({reason:'nonnumeric_conflict',name});}
   continue;
  }
  if(f.tuple)continue;   // reported when opened
  if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
  const contextRef=attrOf(f.attrs,'contextRef')??'';
  const c=contexts.get(contextRef);
  if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
  if(dupCtx.has(contextRef)){out.unsupported.push({reason:'context_duplicate',name,contextRef});continue;}
  if(c.dimensional)continue;
  if(c.ident.trim()===''||c.scheme.trim()===''){out.unsupported.push({reason:'entity',name,contextRef});continue;}
  const period=periodOf(c);
  if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
  const where={name,contextRef,periodStart:period.start,periodEnd:period.end};
  const nil=nsAttr(f.attrs,f.ns,NS.xsi,'nil');
  if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
  const unitRef=attrOf(f.attrs,'unitRef')??'';
  const u=dupUnits.has(unitRef)?undefined:units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
  const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
  const sign=attrOf(f.attrs,'sign');
  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
  const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
  const digits=fmt===null?null:parseFactText(fmt,f.text);
  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
  const scale=Number(scaleRaw);
  let value:string;
  try{value=canonicalDecimal(`${digits}e${scale}`);}catch{out.unsupported.push({reason:'decimal_bounds',...where});continue;}
  if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:attrOf(f.attrs,'decimals')??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
 }
 return out;
}

exec
/bin/zsh -lc 'find . -name AGENTS.md -o -name AGENTS.override.md -o -name CLAUDE.md; cat src/lib/facts/units.ts; cat src/lib/facts/json-numbers.ts | head -110; ls src/lib/dq/reconcile; cat package.json | head -80; cat src/lib/dq/reconcile/ixbrl.test.ts | head -55' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 711ms:
// src/lib/facts/units.ts
// Unit normalisation (spec §3). companyfacts units become 'USD' (or another ISO currency as-is),
// 'shares', '<CCY>/share' and 'pure'; Tushare money is 'CNY', eps 'CNY/share', total_share
// 'shares'. The unit is part of the fact key, so this is the only place where two spellings may
// be merged; anything else is kept distinct or rejected (null) and never silently converted.
import type {UnitKind} from './types';

/** Active + retired-since-2008 ISO 4217 alphabetic codes (funds/metals/test codes, XDR and XSU excluded), sorted; older filings (companyfacts goes back to ~2009) use retired codes; other currencies are kept as-is (spec §3). */
export const CURRENCIES=['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BYR','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CYP','CZK','DJF','DKK','DOP','DZD','EEK','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LTL','LVL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRO','MRU','MTL','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SKK','SLE','SLL','SOS','SRD','SSP','STD','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VEF','VES','VND','VUV','WST','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMK','ZMW','ZWG','ZWL'] as const;
const CURRENCY=new Set<string>(CURRENCIES);
export const MAX_UNIT_LENGTH=16;

/** companyfacts unit → stored unit, or null when the shape is not one we store (e.g. 'USD/EUR', 'Year', 'sqft'). */
export function normalizeUnit(raw:string):string|null{
 if(raw==='shares'||raw==='pure')return raw;
 if(CURRENCY.has(raw))return raw;
 const m=/^([A-Z]{3})\/shares$/.exec(raw);
 if(m&&CURRENCY.has(m[1]))return `${m[1]}/share`;
 return null;
}

/** Stored unit of a Tushare column by unit kind; money and per-share values are in CNY. */
export function rawUnitOf(kind:UnitKind,currency:string='CNY'):string{
 if(!CURRENCY.has(currency))throw new Error(`unknown_currency:${currency}`);
 return kind==='money'?currency:kind==='shares'?'shares':`${currency}/share`;
}

/** Units a concept of this kind may carry; feed to unitRule('unit_'+kind, unit, allowedUnits(kind)). */
export function allowedUnits(kind:UnitKind):readonly string[]{
 return kind==='money'?CURRENCIES:kind==='shares'?['shares']:CURRENCIES.map(c=>`${c}/share`);
}

/** Kind of a stored unit, or null for units no concept carries ('pure'). */
export function unitKindOf(unit:string):UnitKind|null{
 if(unit==='shares')return 'shares';
 if(CURRENCY.has(unit))return 'money';
 const m=/^([A-Z]{3})\/share$/.exec(unit);
 return m&&CURRENCY.has(m[1])?'per_share':null;
}
// src/lib/facts/json-numbers.ts
// Lossless numeric decoding (spec §6.2, audit N8/R3-7). JSON.parse would turn a 20-digit integer
// or 1e5 into a double, so scanJsonNumbers first rewrites every numeric literal outside strings
// into {"__num":"<literal>"} and parses that. decodeWithSchema then decodes by field name:
// control fields (cik, fy, code, has_more, report_type, …) → integer JS number; decimal fields
// (val, statement value columns) → canonicalDecimal string, inserted into numeric as text;
// any other numeric field → JS number. Equality of values is always on the canonical form.
export interface NumToken{__num:string}
export const isNumToken=(v:unknown):v is NumToken=>typeof v==='object'&&v!==null&&typeof (v as NumToken).__num==='string'&&Object.keys(v as object).length===1;

const TOKEN=/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const JSON_INT=/^-?(?:0|[1-9]\d*)(?![\d])/;
/** True when the string token at [end) is followed by optional JSON whitespace and ':' (i.e. it is an object key). */
function isKeyAt(text:string,end:number):boolean{
 for(let i=end;i<text.length;i++){
  const c=text.charCodeAt(i);
  if(c===32||c===9||c===10||c===13)continue;
  return c===58;
 }
 return false;
}
/**
 * JSON.parse with every numeric literal wrapped as {__num:'<original text>'}. Strings are left intact.
 * The input is first validated with a plain JSON.parse (malformed text fails fast, before the regex pass), and
 * fails closed if an object key decodes to the reserved marker `__num` (also in escaped spellings).
 */
export function scanJsonNumbers(input:Uint8Array|string):unknown{
 const text=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true}).decode(input);
 JSON.parse(text);
 const rewritten=text.replace(TOKEN,(m,offset:number)=>{
  if(m.charCodeAt(0)===34){
   // only a string that could decode to '__num' (7..64 chars, starts with '"_' or has an escape) is parsed
   if(m.length>=7&&m.length<=64&&(m.charCodeAt(1)===95||m.includes('\\'))&&isKeyAt(text,offset+m.length)&&JSON.parse(m)==='__num')throw new Error('reserved_key:__num');
   return m;
  }
  if(!JSON_INT.test(m))throw new Error(`invalid_json_number:${m.slice(0,40)}`);
  return `{"__num":"${m}"}`;
 });
 return JSON.parse(rewritten);
}

const DECIMAL=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
/** Raw-input cap, exponent cap and output cap are chosen together: every accepted output is <= MAX_LITERAL chars, so canonicalDecimal is idempotent. */
const MAX_LITERAL=512;
const MAX_EXPONENT=200;
/** Canonical decimal text: no exponent, no leading/trailing zeros, '-0' → '0'. Throws invalid_decimal. */
export function canonicalDecimal(raw:string):string{
 if(raw.length>MAX_LITERAL)throw new Error('invalid_decimal:length');
 const m=DECIMAL.exec(raw);
 if(!m)throw new Error(`invalid_decimal:${raw.slice(0,40)}`);
 const exp=m[4]===undefined?0:Number(m[4]);
 if(!Number.isSafeInteger(exp)||Math.abs(exp)>MAX_EXPONENT)throw new Error('invalid_decimal:exponent');
 const digits=m[2]+(m[3]??'');
 const point=m[2].length+exp;
 let intPart:string,fracPart:string;
 if(point<=0){intPart='0';fracPart='0'.repeat(-point)+digits;}
 else if(point>=digits.length){intPart=digits+'0'.repeat(point-digits.length);fracPart='';}
 else{intPart=digits.slice(0,point);fracPart=digits.slice(point);}
 intPart=intPart.replace(/^0+(?=\d)/,'');
 let end=fracPart.length;
 while(end>0&&fracPart.charCodeAt(end-1)===48)end--;
 fracPart=fracPart.slice(0,end);
 const zero=intPart==='0'&&fracPart==='';
 const out=`${m[1]==='-'&&!zero?'-':''}${intPart}${fracPart?`.${fracPart}`:''}`;
 if(out.length>MAX_LITERAL)throw new Error('invalid_decimal:length');
 return out;
}
export const decimalEquals=(a:string,b:string):boolean=>canonicalDecimal(a)===canonicalDecimal(b);

export interface NumberSchema{control:readonly string[];decimal:readonly string[]}
export const EDGAR_NUMBER_SCHEMA:NumberSchema={control:['cik','fy'],decimal:['val']};
/** Tushare control columns; the adapter adds the statement's value columns as `decimal`. */
export const TUSHARE_CONTROL_FIELDS:readonly string[]=['code','has_more','report_type','comp_type','is_calc','update_flag','end_type'];

export function decodeNumber(raw:string,mode:'control'|'decimal'|'number',field:string|null):string|number{
 if(mode==='decimal')return canonicalDecimal(raw);
 if(mode==='control'){
  // integrality on the exact decimal text first; Number() would round 1.00000000000000001 to 1 and 1e-400 to 0
  let canon:string;
  try{canon=canonicalDecimal(raw);}catch{throw new Error(`invalid_control_field:${field??''}`);}
  const n=Number(canon);
  if(!/^-?\d+$/.test(canon)||!Number.isSafeInteger(n))throw new Error(`invalid_control_field:${field??''}`);
  return n;
 }
 return Number(raw);
}
const modeOf=(schema:NumberSchema,field:string|null)=>field!==null&&schema.decimal.includes(field)?'decimal':field!==null&&schema.control.includes(field)?'control':'number';

/** Walks a scanJsonNumbers result and decodes every NumToken by the name of its nearest enclosing field. */
export function decodeWithSchema(value:unknown,schema:NumberSchema,field:string|null=null):unknown{
 if(isNumToken(value))return decodeNumber(value.__num,modeOf(schema,field),field);
 if(Array.isArray(value))return value.map(v=>decodeWithSchema(v,schema,field));
 if(value!==null&&typeof value==='object'){
  // fromEntries defines own properties, so a '__proto__' key stays data and never touches the prototype
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,v])=>[k,decodeWithSchema(v,schema,k)]));
 }
 return value;
}

/** Positional rows (Tushare items) → objects keyed by `fields`, each cell decoded by its column name. */
export function decodeColumns(fields:string[],items:unknown[][],schema:NumberSchema):Record<string,unknown>[]{
 return items.map(row=>{
  if(row.length!==fields.length)throw new Error(`invalid_row_width:${row.length}`);
  return Object.fromEntries(fields.map((f,i)=>[f,decodeWithSchema(row[i],schema,f)]));
 });
}
decimal.test.ts
decimal.ts
inputs-hash.test.ts
inputs-hash.ts
ixbrl.test.ts
ixbrl.ts
record.test.ts
record.ts
types.ts
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
// src/lib/dq/reconcile/ixbrl.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {IXBRL_PARSER_VERSION,IxbrlParseError,decodeEntities,indexIxFacts,ixFactKey,parseInlineXbrl,tokenizeXml} from './ixbrl';
import type {IxFact} from './ixbrl';

const AAPL=readFileSync(new URL('../fixtures/ixbrl/aapl-10k-2023.handtrim.htm',import.meta.url),'utf8');
/** Renames every prefix: xmlns declarations, element names, QName attribute values and QName text (measure, explicitMember). */
function rewritePrefixes(doc:string,map:Record<string,string>):string{
 let out=doc;
 for(const [from,to] of Object.entries(map)){
  const esc=from.replace(/[-]/g,'\\-');
  out=out.replaceAll(`xmlns:${from}=`,`xmlns:${to}=`).replace(new RegExp(`(?<=[<\\/"\\s>])${esc}:`,'g'),`${to}:`);
 }
 return out;
}
const HEAD='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:ixt3="http://www.xbrl.org/inlineXBRL/transformation/2015-02-26" xmlns:ixt5="http://www.xbrl.org/inlineXBRL/transformation/2022-02-16" xmlns:ixt-sec="http://www.sec.gov/inlineXBRL/transformation/2015-08-31" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';
const ENTITY='<xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier>';
const DUR='<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>';
const ctx=(id:string,period:string,o:{segment?:string;scenario?:string}={})=>`<xbrli:context id="${id}"><xbrli:entity>${ENTITY}${o.segment?`<xbrli:segment>${o.segment}</xbrli:segment>`:''}</xbrli:entity><xbrli:period>${period}</xbrli:period>${o.scenario?`<xbrli:scenario>${o.scenario}</xbrli:scenario>`:''}</xbrli:context>`;
const USD='<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>';
const RES=ctx('d',DUR)+ctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')+USD;
const doc=(body:string,res=RES)=>`${HEAD}<body><div style="display:none"><ix:header><ix:resources>${res}</ix:resources></ix:header></div>${body}</body></html>`;
const nf=(attrs:string,text:string,name='us-gaap:Revenues',contextRef='d',unitRef='usd')=>`<ix:nonFraction name="${name}" contextRef="${contextRef}" unitRef="${unitRef}" ${attrs}>${text}</ix:nonFraction>`;
const one=(body:string,res?:string)=>parseInlineXbrl(doc(body,res));
const valueOf=(body:string)=>{const d=one(body);return d.facts.length===1?d.facts[0].value:d.unsupported.map(u=>u.reason).join(',');};
const byName=(facts:IxFact[],name:string)=>facts.filter(f=>f.name===name);

describe('parseInlineXbrl on the AAPL FY2023 10-K fixture',()=>{
 const d=parseInlineXbrl(AAPL);
 it('extracts the 11 non-dimensional facts with canonical names, contexts, units and scaled values',()=>{
  expect(IXBRL_PARSER_VERSION).toBe('ixbrl/1');
  expect(d.unsupported).toEqual([]);
  expect(d.facts).toHaveLength(11);
  const rev=byName(d.facts,'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax');
  expect(rev.map(f=>[f.periodStart,f.periodEnd,f.value])).toEqual([['2022-09-25','2023-09-30','383285000000'],['2021-09-26','2022-09-24','394328000000'],['2020-09-27','2021-09-25','365817000000'],['2022-09-25','2023-09-30','383285000000']]);
  expect(rev[0]).toMatchObject({unit:'USD',decimals:'-6',scale:6,entity:'http://www.sec.gov/CIK#0000320193',contextRef:'c-1',unitRef:'usd'});
  expect(byName(d.facts,'us-gaap:EarningsPerShareBasic')[0]).toMatchObject({value:'6.16',unit:'USD/share',decimals:'2',scale:0});
  expect(byName(d.facts,'us-gaap:NetCashProvidedByUsedInInvestingActivities').map(f=>f.value)).toEqual(['3705000000','-22354000000']);
  expect(byName(d.facts,'us-gaap:Assets')[0]).toMatchObject({periodStart:null,periodEnd:'2023-09-30',value:'352583000000'});
  expect(byName(d.facts,'dei:EntityCommonStockSharesOutstanding')[0]).toMatchObject({periodStart:null,periodEnd:'2023-10-20',unit:'shares',value:'15552752000',decimals:'INF'});
 });
 it('skips the dimensional (segment) context: the iPhone member value is not a fact and not unsupported',()=>{
  expect(d.facts.some(f=>f.value==='200583000000')).toBe(false);
 });
 it('reads only the three dei nonNumeric facts, whitespace-collapsed',()=>{
  expect(d.nonNumeric).toEqual({'dei:DocumentFiscalYearFocus':'2023','dei:DocumentPeriodEndDate':'September 30, 2023','dei:EntityFilerCategory':'Large Accelerated Filer'});
 });
 it('repeated tagging of one value collapses to one value per right-side key',()=>{
  const idx=indexIxFacts(d.facts);
  const k=ixFactKey(byName(d.facts,'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax')[0]);
  expect(idx.get(k)?.values).toEqual(['383285000000']);
  expect(idx.get(k)?.facts).toHaveLength(2);
 });
 it('resolves namespaces by xmlns declarations: a document with every prefix renamed parses identically',()=>{

exec
/bin/zsh -lc 'node node_modules/vitest/vitest.mjs run src/lib/dq/reconcile/ixbrl.test.ts --no-cache --configLoader runner' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 1316ms:
failed to load config from /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
ReferenceError: __dirname is not defined
    at eval (/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts:10:65)
    at async ESModulesEvaluator.runInlinedModule (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:809:3)
    at async ModuleRunner.directRequest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1270:59)
    at async ModuleRunner.cachedRequest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1177:73)
    at async ModuleRunner.import (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1132:10)
    at async runnerImport (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36558:18)
    at async runnerImportConfigFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37336:35)
    at async loadConfigFromFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37305:42)
    at async resolveConfig (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36906:22)
    at async _createServer (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:24268:65)




codex
No actionable regressions were identified in the parser hardening or its added tests. Test execution could not be verified because Vitest configuration loading failed with `__dirname is not defined`.
No actionable regressions were identified in the parser hardening or its added tests. Test execution could not be verified because Vitest configuration loading failed with `__dirname is not defined`.
