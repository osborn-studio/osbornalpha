OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0c4-9f33-71d1-8628-e9ed3fefc451
--------
user
commit 712d0eb
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 712d0eb; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 3598ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-yfEx82Lb' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4M3iOzGa' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-d7EGuyA0' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-uu57dUJ3' (errno=Operation not permitted)
712d0eb test(dq): keep relDiff boundary case inside the decimal cap
 src/lib/dq/reconcile/decimal.test.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

exec
/bin/zsh -lc 'git show 712d0eb; cat src/lib/dq/reconcile/decimal.test.ts; cat src/lib/dq/reconcile/decimal.ts; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees .; do for f in AGENTS.override.md AGENTS.md; do if [ -f "$d/$f" ]; then echo "--- $d/$f"; cat "$d/$f"; fi; done; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-kN5euZz4' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-up3gJfMm' (errno=Operation not permitted)
commit 712d0ebb0b5d5c4dd0b32cb595febb1325cd2d91
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:10:06 2026 -0800

    test(dq): keep relDiff boundary case inside the decimal cap
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/decimal.test.ts b/src/lib/dq/reconcile/decimal.test.ts
index 19539f0..9a4db1a 100644
--- a/src/lib/dq/reconcile/decimal.test.ts
+++ b/src/lib/dq/reconcile/decimal.test.ts
@@ -56,7 +56,7 @@ describe('decimal (scaled BigInt, spec §5.1)',()=>{
   for(const n of [501,512]){const v='9'.repeat(n);expect(relDiff(v,v)).toBe('0');}
   const a='9'.repeat(500),b=`${'9'.repeat(499)}8`;
   expect(compareDecimal(relDiff(a,b),'0')).toBe(1);
-  expect(relDiff('-'+'9'.repeat(511),'9'.repeat(511))).toBe('2');
+  expect(relDiff('-'+'9'.repeat(510),'9'.repeat(510))).toBe('2');
   expect(relDiff(`0.${'1'.repeat(200)}`,'0')).not.toBe('0');
  });
  it('withinRadius is |value − center| <= radius by cross-multiplication (inclusive)',()=>{
// src/lib/dq/reconcile/decimal.test.ts
import {describe,expect,it} from 'vitest';
import {absDecimal,addDecimal,compareDecimal,divDecimal,formatDecimal,isDecimalText,maxAbsDecimal,mulDecimal,parseDecimal,relDiff,subDecimal,withinRadius} from './decimal';

describe('decimal (scaled BigInt, spec §5.1)',()=>{
 it('parses canonical decimals into units/scale and formats them back',()=>{
  expect(parseDecimal('383285000000')).toEqual({units:383285000000n,scale:0});
  expect(parseDecimal('-6.160')).toEqual({units:-616n,scale:2});
  expect(parseDecimal('1e-3')).toEqual({units:1n,scale:3});
  expect(formatDecimal({units:-616n,scale:2})).toBe('-6.16');
  expect(formatDecimal({units:5n,scale:3})).toBe('0.005');
  expect(()=>parseDecimal('')).toThrow(/invalid_decimal/);
  expect(()=>parseDecimal('1,000')).toThrow(/invalid_decimal/);
  expect(isDecimalText('12.5')).toBe(true);expect(isDecimalText('NaN')).toBe(false);
 });
 it('compares 20-digit integers exactly where Number would not',()=>{
  const a='12345678901234567890',b='12345678901234567891';
  expect(Number(a)).toBe(Number(b));              // the reason BigInt is used
  expect(compareDecimal(a,b)).toBe(-1);expect(compareDecimal(b,a)).toBe(1);
  expect(compareDecimal('1.10','1.1')).toBe(0);expect(compareDecimal('-0','0')).toBe(0);
  expect(subDecimal(b,a)).toBe('1');
 });
 it('adds, subtracts, multiplies and takes absolute values without rounding',()=>{
  expect(addDecimal('0.1','0.2')).toBe('0.3');
  expect(subDecimal('100','100.005')).toBe('-0.005');
  expect(absDecimal('-22354000000')).toBe('22354000000');
  expect(mulDecimal('1.25','10000')).toBe('12500');
  expect(mulDecimal('0.005','1000000')).toBe('5000');
  expect(maxAbsDecimal('-7','3','1')).toBe('7');
 });
 it('divides with half-away-from-zero rounding and refuses a zero divisor',()=>{
  expect(divDecimal('2','3',4)).toBe('0.6667');
  expect(divDecimal('-2','3',4)).toBe('-0.6667');
  expect(divDecimal('1','8',2)).toBe('0.13');
  expect(divDecimal('-1','8',2)).toBe('-0.13');
  expect(divDecimal('1','4',1)).toBe('0.3');
  expect(()=>divDecimal('1','0')).toThrow('division_by_zero');
 });
 it('rel_diff = |l−r| / max(|l|,|r|,1)',()=>{
  expect(relDiff('100','101')).toBe('0.009900990099');       // scale = 10 + 3 integer digits
  expect(relDiff('0','0.5')).toBe('0.5');          // denominator floor of 1
  expect(relDiff('-5','5')).toBe('2');
  expect(relDiff('383285000000','383285000000')).toBe('0');
  expect(relDiff('383285000000.005','383285000000')).not.toBe('0');   // 0.005 on 3.8e11 keeps significance
  expect(compareDecimal(relDiff('383285000000.005','383285000000'),'0')).toBe(1);
 });
 it('overflow beyond the 512-character literal cap is a distinct decimal_overflow code',()=>{
  const big='9'.repeat(512);
  expect(addDecimal(big,'0')).toBe(big);
  expect(()=>addDecimal(big,'1')).toThrow('decimal_overflow');
  expect(()=>subDecimal(`-${'9'.repeat(511)}`,'9'.repeat(511))).toThrow('decimal_overflow');
  expect(()=>mulDecimal('9'.repeat(300),'9'.repeat(300))).toThrow('decimal_overflow');
  expect(()=>addDecimal('1,0','1')).toThrow('invalid_decimal');
 });
 it('relDiff stays inside the formatter budget for 501- and 512-digit inputs',()=>{
  for(const n of [501,512]){const v='9'.repeat(n);expect(relDiff(v,v)).toBe('0');}
  const a='9'.repeat(500),b=`${'9'.repeat(499)}8`;
  expect(compareDecimal(relDiff(a,b),'0')).toBe(1);
  expect(relDiff('-'+'9'.repeat(510),'9'.repeat(510))).toBe('2');
  expect(relDiff(`0.${'1'.repeat(200)}`,'0')).not.toBe('0');
 });
 it('withinRadius is |value − center| <= radius by cross-multiplication (inclusive)',()=>{
  expect(withinRadius('383285000000.004','383285000000','0.005')).toBe(true);
  expect(withinRadius('383285000000.005','383285000000','0.005')).toBe(true);
  expect(withinRadius('383285000000.006','383285000000','0.005')).toBe(false);
  expect(withinRadius('1234504999','1234500000','5000')).toBe(true);
  expect(withinRadius('1234505001','1234500000','5000')).toBe(false);
  expect(withinRadius('-1','1','2')).toBe(true);
  expect(()=>withinRadius('1','1','-1')).toThrow('negative_radius');
 });
});
// src/lib/dq/reconcile/decimal.ts
// Exact decimal arithmetic for reconciliation (spec §5.1). A decimal string becomes a scaled BigInt
// {units, scale} (value = units / 10^scale). Comparisons align the two scales by multiplying with
// powers of ten (cross-multiplication) and never divide; the only division is the reported ratio
// (rel_diff, tolerance), rounded half away from zero at a fixed number of places. Every input goes
// through plan 2's canonicalDecimal first, so exponents and leading/trailing zeros are accepted and
// anything else throws invalid_decimal. Number() is never applied to a value.
// Cap: every result is formatted through canonicalDecimal, whose literal limit is 512 characters; a sum,
// difference or product that would exceed it throws decimal_overflow (distinct from invalid_decimal, which
// means malformed input). Ratios (relDiff/divDecimal) are DERIVED/DISPLAY values: pass/fail must always be
// decided by exact comparison (compareDecimal/withinRadius), never by the rounded ratio.
import {canonicalDecimal} from '../../facts/json-numbers';

export interface ScaledDecimal{units:bigint;scale:number}
const pow10=(k:number)=>10n**BigInt(k);
const babs=(x:bigint)=>x<0n?-x:x;

export function parseDecimal(s:string):ScaledDecimal{
 const c=canonicalDecimal(s);
 const neg=c.startsWith('-');const body=neg?c.slice(1):c;const [i,f='']=body.split('.');
 const u=BigInt(i+f);
 return {units:neg?-u:u,scale:f.length};
}
const MAX_LITERAL=512;
export function formatDecimal(d:ScaledDecimal):string{
 const neg=d.units<0n;let digits=babs(d.units).toString();
 if(digits.length>MAX_LITERAL||d.scale>MAX_LITERAL)throw new Error('decimal_overflow');
 if(d.scale>0){digits=digits.padStart(d.scale+1,'0');digits=`${digits.slice(0,-d.scale)}.${digits.slice(-d.scale)}`;}
 if(digits.length+(neg?1:0)>MAX_LITERAL)throw new Error('decimal_overflow');
 return canonicalDecimal((neg?'-':'')+digits);
}
export const isDecimalText=(s:string):boolean=>{try{canonicalDecimal(s);return true;}catch{return false;}};
function align(a:ScaledDecimal,b:ScaledDecimal):[bigint,bigint,number]{const s=Math.max(a.scale,b.scale);return [a.units*pow10(s-a.scale),b.units*pow10(s-b.scale),s];}

export function compareDecimal(a:string,b:string):-1|0|1{const [x,y]=align(parseDecimal(a),parseDecimal(b));return x<y?-1:x>y?1:0;}
export function addDecimal(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return formatDecimal({units:x+y,scale:s});}
export function subDecimal(a:string,b:string):string{const [x,y,s]=align(parseDecimal(a),parseDecimal(b));return formatDecimal({units:x-y,scale:s});}
export function absDecimal(a:string):string{const d=parseDecimal(a);return formatDecimal({units:babs(d.units),scale:d.scale});}
export function mulDecimal(a:string,b:string):string{const x=parseDecimal(a),y=parseDecimal(b);return formatDecimal({units:x.units*y.units,scale:x.scale+y.scale});}
/** max(|x|) over the arguments (at least one). */
export function maxAbsDecimal(...xs:string[]):string{
 if(xs.length===0)throw new Error('empty_max');
 return xs.map(absDecimal).reduce((m,x)=>compareDecimal(x,m)>0?x:m);
}
/** a / b rounded half away from zero to `scale` places (one guard digit on the truncated absolute quotient). */
export function divDecimal(a:string,b:string,scale=10):string{
 if(!Number.isInteger(scale)||scale<0||scale>MAX_LITERAL)throw new Error('invalid_scale');
 const [x,y]=align(parseDecimal(a),parseDecimal(b));
 if(y===0n)throw new Error('division_by_zero');
 const q=(babs(x)*pow10(scale+1))/babs(y);
 const r=(q+5n)/10n;
 return formatDecimal({units:(x<0n)!==(y<0n)?-r:r,scale});
}
/** The ratio is <= 2, so its text is at most 2 + scale characters; 500 keeps it far inside the 512 literal cap. */
const REL_SCALE_CAP=500;
/** |l − r| / max(|l|, |r|, 1) (spec §5.1). Derived/display value. The default scale is 10 plus the digit count of the
 * denominator's integer part, so a 0.005 difference on a 3.8e11 base is not rounded to "0". */
export function relDiff(l:string,r:string,scale?:number):string{
 const den=maxAbsDecimal(l,r,'1');
 return divDecimal(absDecimal(subDecimal(l,r)),den,scale??Math.min(10+den.split('.')[0].length,REL_SCALE_CAP));
}
/** |value − center| <= radius, by aligning scales (no division). */
export function withinRadius(value:string,center:string,radius:string):boolean{
 const rad=parseDecimal(radius);if(rad.units<0n)throw new Error('negative_radius');
 const d=parseDecimal(subDecimal(value,center));
 const [x,y]=align({units:babs(d.units),scale:d.scale},rad);
 return x<=y;
}
--- /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>
codex
The adjusted fixture keeps the signed intermediate subtraction within the 512-character limit while preserving the expected relative difference of 2. No new defects were identified.
The adjusted fixture keeps the signed intermediate subtraction within the 512-character limit while preserving the expected relative difference of 2. No new defects were identified.
