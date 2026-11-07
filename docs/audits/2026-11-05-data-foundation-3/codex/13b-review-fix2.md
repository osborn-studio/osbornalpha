OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0d5-ba95-7f81-b0c1-490c46ecc08b
--------
user
commit 90cfb0e
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 90cfb0e; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1908ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-HhGawymw' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-d3xJgRVW' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eIgMUlOO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-evacyQ7m' (errno=Operation not permitted)
90cfb0e fix(dq): iXBRL tokenizer raw-text scan, sign/decimals/ref validation, strict attributes
 src/lib/dq/reconcile/ixbrl.test.ts | 43 +++++++++++++++++++++++++++++++++++++-
 src/lib/dq/reconcile/ixbrl.ts      | 27 +++++++++++++++++-------
 2 files changed, 61 insertions(+), 9 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude; do ls "$d"/AGENTS* 2>/dev/null; done; ls -a | head; git show 90cfb0e --; cat src/lib/dq/reconcile/ixbrl.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: /Volumes/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS*
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rNvSSLXT' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pIzIhiO0' (errno=Operation not permitted)
commit 90cfb0ea641b7a12c5572a9b0e252d0fca837fa3
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:29:06 2026 -0800

    fix(dq): iXBRL tokenizer raw-text scan, sign/decimals/ref validation, strict attributes
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/ixbrl.test.ts b/src/lib/dq/reconcile/ixbrl.test.ts
index eac372f..ddfd597 100644
--- a/src/lib/dq/reconcile/ixbrl.test.ts
+++ b/src/lib/dq/reconcile/ixbrl.test.ts
@@ -66,7 +66,8 @@ describe('parseInlineXbrl on the AAPL FY2023 10-K fixture',()=>{
 describe('ix:nonFraction text grammar by format (spec §5.2 regexes)',()=>{
  it.each([
   ['',' 1,234.5 ','1234.5'],
-  ['','-12','-12'],
+  ['','-12','sign'],
+  ['sign="-"','-12','sign'],
   ['','1.234,5','format'],
   ['format="ixt:num-dot-decimal"','1,234,567.89','1234567.89'],
   ['format="ixt3:numdotdecimal"','12.5','12.5'],
@@ -201,3 +202,43 @@ describe('plan-review hardening (Codex round)',()=>{
   expect(d.unsupported.map(u=>[u.reason,u.contextRef])).toEqual([['context_duplicate','dup'],['entity','noid']]);
  });
 });
+
+describe('plan-review hardening (quality round)',()=>{
+ it('script end-tag search does not lowercase the document: length-changing case folds before it are harmless; </scriptx does not end it',()=>{
+  const d=one('<p>İİİİ</p><script>var a="</scriptx>";</script >'+nf('','4'));
+  expect(d.facts.map(f=>f.value)).toEqual(['4']);
+  expect(()=>[...tokenizeXml('<script>a</scriptx>')]).toThrow(IxbrlParseError);
+ });
+ it('absent or empty contextRef / unitRef are unsupported(context) / unsupported(unit)',()=>{
+  const d=one('<ix:nonFraction name="us-gaap:Revenues" unitRef="usd">1</ix:nonFraction><ix:nonFraction name="us-gaap:Revenues" contextRef="" unitRef="usd">1</ix:nonFraction><ix:nonFraction name="us-gaap:Revenues" contextRef="d">1</ix:nonFraction><ix:nonFraction name="us-gaap:Revenues" contextRef="d" unitRef="">1</ix:nonFraction>');
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['context','context','unit','unit']);
+ });
+ it('decimals must be INF or an integer',()=>{
+  expect(valueOf(nf('decimals="-6"','1'))).toBe('1');
+  expect(valueOf(nf('decimals="INF"','1'))).toBe('1');
+  expect(valueOf(nf('decimals="2.5"','1'))).toBe('decimals');
+  expect(valueOf(nf('decimals="inf"','1'))).toBe('decimals');
+  expect(valueOf(nf('decimals=""','1'))).toBe('decimals');
+ });
+ it('trims the identifier scheme in the entity',()=>{
+  const res=ctx('d',DUR).replace('scheme="http://www.sec.gov/CIK"','scheme=" http://www.sec.gov/CIK "')+USD;
+  expect(parseInlineXbrl(doc(nf('','1'),res)).facts[0].entity).toBe('http://www.sec.gov/CIK#0000000001');
+ });
+ it.each([
+  ['duplicate attribute','<a x="1" x="2"/>','bad_attribute'],
+  ['no whitespace between attributes','<a x="1"y="2"/>','bad_attribute'],
+  ['too deep','<a>'.repeat(1001),'too_deep'],
+  ['too many attributes',`<a ${Array.from({length:257},(_,k)=>`a${k}="1"`).join(' ')}/>`,'too_many_attributes'],
+  ['unterminated comment','<!-- x','unterminated_comment'],
+  ['unterminated cdata','<![CDATA[x','unterminated_cdata'],
+  ['unterminated pi','<?x','unterminated_pi'],
+  ['unterminated declaration','<!DOCTYPE x','unterminated_declaration'],
+  ['unterminated tag','<a ','unterminated_tag'],
+  ['unterminated attribute','<a x="1','unterminated_attribute'],
+  ['unterminated raw text','<script>x','unterminated_raw_text'],
+  ['bad close tag (empty)','<a></>','bad_close_tag'],
+  ['bad close tag (open)','<a></a','bad_close_tag'],
+ ])('tokenizer: %s → %s',(_n,src,code)=>{
+  try{[...tokenizeXml(src)];throw new Error('no error');}catch(e){expect(e instanceof IxbrlParseError?e.code:String(e)).toBe(code);}
+ });
+});
diff --git a/src/lib/dq/reconcile/ixbrl.ts b/src/lib/dq/reconcile/ixbrl.ts
index 5ce5d5c..3d4a741 100644
--- a/src/lib/dq/reconcile/ixbrl.ts
+++ b/src/lib/dq/reconcile/ixbrl.ts
@@ -63,11 +63,17 @@ export function decodeEntities(s:string):string{
 
 /** Streaming tokens with source offsets [start, end). Throws IxbrlParseError on malformed markup. */
 export function* tokenizeXml(doc:string):Generator<XmlToken>{
- const n=doc.length;let i=doc.charCodeAt(0)===0xfeff?1:0;let depth=0;let rawEnd:string|null=null;let lower:string|null=null;
+ const n=doc.length;let i=doc.charCodeAt(0)===0xfeff?1:0;let depth=0;let rawEnd:string|null=null;
  while(i<n){
   if(rawEnd!==null){
-   lower??=doc.toLowerCase();
-   const e=lower.indexOf(rawEnd,i);if(e<0)fail('unterminated_raw_text');
+   // end tag: '</' + the element name (case-insensitive) + whitespace or '>'; no whole-document lowercasing (length-changing case folds)
+   let e=-1;
+   for(let k=doc.indexOf('</',i);k>=0;k=doc.indexOf('</',k+2)){
+    const nm=doc.slice(k+2,k+2+rawEnd.length);
+    const nx=doc.charCodeAt(k+2+rawEnd.length);
+    if(nm.toLowerCase()===rawEnd&&(nx===62||isWs(nx))){e=k;break;}
+   }
+   if(e<0)fail('unterminated_raw_text');
    if(e>i)yield {t:'text',text:doc.slice(i,e),start:i,end:e};
    rawEnd=null;i=e;continue;
   }
@@ -93,19 +99,21 @@ export function* tokenizeXml(doc:string):Generator<XmlToken>{
    if(doc.startsWith('/>',j)){self=true;j+=2;break;}
    if(doc[j]==='>'){j++;break;}
    const an=nameAt(doc,j)??fail('bad_attribute');j+=an.length;
+   if(attrs.some(([k])=>k===an))fail('bad_attribute');   // duplicate attribute
    while(j<n&&isWs(doc.charCodeAt(j)))j++;
    if(doc[j]!=='=')fail('bad_attribute');
    j++;while(j<n&&isWs(doc.charCodeAt(j)))j++;
    const q=doc[j];if(q!=='"'&&q!=="'")fail('bad_attribute');
    const e=doc.indexOf(q,j+1);if(e<0)fail('unterminated_attribute');
    attrs.push([an,decodeEntities(doc.slice(j+1,e))]);j=e+1;
+   if(j<n&&!isWs(doc.charCodeAt(j))&&doc[j]!=='>'&&doc[j]!=='/')fail('bad_attribute');   // attributes need separating whitespace
    if(attrs.length>MAX_ATTRS)fail('too_many_attributes');
   }
   yield {t:'open',name,attrs,self,start:lt,end:j};
   if(!self){
    depth++;if(depth>MAX_DEPTH)fail('too_deep');
    const local=name.slice(name.indexOf(':')+1).toLowerCase();
-   if(local==='script'||local==='style')rawEnd=`</${name.toLowerCase()}`;
+   if(local==='script'||local==='style')rawEnd=name.toLowerCase();
   }
   i=j;
  }
@@ -232,7 +240,7 @@ export function parseInlineXbrl(doc:string):IxbrlDocument{
   if(f.local==='context'){st.ctx={id:attrOf(attrs,'id')??'',scheme:'',ident:'',start:'',end:'',instant:'',forever:false,dimensional:false};return;}
   if(st.ctx!==null){
    if(f.local==='segment'||f.local==='scenario'){st.segDepth=stack.length;return;}
-   if(f.local==='identifier'){st.ctx.scheme=attrOf(attrs,'scheme')??'';st.ctxField='ident';return;}
+   if(f.local==='identifier'){st.ctx.scheme=(attrOf(attrs,'scheme')??'').trim();st.ctxField='ident';return;}
    if(f.local==='startDate'){st.ctxField='start';return;}
    if(f.local==='endDate'){st.ctxField='end';return;}
    if(f.local==='instant'){st.ctxField='instant';return;}
@@ -322,7 +330,7 @@ export function parseInlineXbrl(doc:string):IxbrlDocument{
   if(f.tuple)continue;   // reported when opened
   if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
   const contextRef=attrOf(f.attrs,'contextRef')??'';
-  const c=contexts.get(contextRef);
+  const c=contextRef===''?undefined:contexts.get(contextRef);
   if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
   if(dupCtx.has(contextRef)){out.unsupported.push({reason:'context_duplicate',name,contextRef});continue;}
   if(c.dimensional)continue;
@@ -333,20 +341,23 @@ export function parseInlineXbrl(doc:string):IxbrlDocument{
   const nil=nsAttr(f.attrs,f.ns,NS.xsi,'nil');
   if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
   const unitRef=attrOf(f.attrs,'unitRef')??'';
-  const u=dupUnits.has(unitRef)?undefined:units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
+  const u=unitRef===''||dupUnits.has(unitRef)?undefined:units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
   if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
   const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
   if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
+  const decimalsRaw=attrOf(f.attrs,'decimals')?.trim();
+  if(decimalsRaw!==undefined&&!/^(INF|-?\d+)$/.test(decimalsRaw)){out.unsupported.push({reason:'decimals',...where});continue;}
   const sign=attrOf(f.attrs,'sign');
   if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
   const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
   const digits=fmt===null?null:parseFactText(fmt,f.text);
   if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
+  if(digits.startsWith('-')){out.unsupported.push({reason:'sign',...where});continue;}   // the sign belongs in the sign attribute
   const scale=Number(scaleRaw);
   let value:string;
   try{value=canonicalDecimal(`${digits}e${scale}`);}catch{out.unsupported.push({reason:'decimal_bounds',...where});continue;}
   if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
-  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:attrOf(f.attrs,'decimals')??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
+  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:decimalsRaw??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
  }
  return out;
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
 const n=doc.length;let i=doc.charCodeAt(0)===0xfeff?1:0;let depth=0;let rawEnd:string|null=null;
 while(i<n){
  if(rawEnd!==null){
   // end tag: '</' + the element name (case-insensitive) + whitespace or '>'; no whole-document lowercasing (length-changing case folds)
   let e=-1;
   for(let k=doc.indexOf('</',i);k>=0;k=doc.indexOf('</',k+2)){
    const nm=doc.slice(k+2,k+2+rawEnd.length);
    const nx=doc.charCodeAt(k+2+rawEnd.length);
    if(nm.toLowerCase()===rawEnd&&(nx===62||isWs(nx))){e=k;break;}
   }
   if(e<0)fail('unterminated_raw_text');
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
   if(attrs.some(([k])=>k===an))fail('bad_attribute');   // duplicate attribute
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='=')fail('bad_attribute');
   j++;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   const q=doc[j];if(q!=='"'&&q!=="'")fail('bad_attribute');
   const e=doc.indexOf(q,j+1);if(e<0)fail('unterminated_attribute');
   attrs.push([an,decodeEntities(doc.slice(j+1,e))]);j=e+1;
   if(j<n&&!isWs(doc.charCodeAt(j))&&doc[j]!=='>'&&doc[j]!=='/')fail('bad_attribute');   // attributes need separating whitespace
   if(attrs.length>MAX_ATTRS)fail('too_many_attributes');
  }
  yield {t:'open',name,attrs,self,start:lt,end:j};
  if(!self){
   depth++;if(depth>MAX_DEPTH)fail('too_deep');
   const local=name.slice(name.indexOf(':')+1).toLowerCase();
   if(local==='script'||local==='style')rawEnd=name.toLowerCase();
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
   if(f.local==='identifier'){st.ctx.scheme=(attrOf(attrs,'scheme')??'').trim();st.ctxField='ident';return;}
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
  const c=contextRef===''?undefined:contexts.get(contextRef);
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
  const u=unitRef===''||dupUnits.has(unitRef)?undefined:units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
  const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
  const decimalsRaw=attrOf(f.attrs,'decimals')?.trim();
  if(decimalsRaw!==undefined&&!/^(INF|-?\d+)$/.test(decimalsRaw)){out.unsupported.push({reason:'decimals',...where});continue;}
  const sign=attrOf(f.attrs,'sign');
  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
  const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
  const digits=fmt===null?null:parseFactText(fmt,f.text);
  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
  if(digits.startsWith('-')){out.unsupported.push({reason:'sign',...where});continue;}   // the sign belongs in the sign attribute
  const scale=Number(scaleRaw);
  let value:string;
  try{value=canonicalDecimal(`${digits}e${scale}`);}catch{out.unsupported.push({reason:'decimal_bounds',...where});continue;}
  if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:decimalsRaw??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
 }
 return out;
}

exec
/bin/zsh -lc "cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; find . -name 'AGENTS*' -o -name 'CLAUDE.md'; cat package.json; rg 'decimals|sign attribute' docs/spec* docs -g '*13*' -g '*recon*' | head -50; rg 'decimals' src/lib/dq/reconcile" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 300ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>{
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
zsh:1: no matches found: docs/spec*
src/lib/dq/reconcile/ixbrl.ts://  - ix:nonFraction: name, contextRef, unitRef, scale, sign, decimals, format, xsi:nil. Text grammar by
src/lib/dq/reconcile/ixbrl.ts:export interface IxFact{name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number;entity:string;contextRef:string;unitRef:string}
src/lib/dq/reconcile/ixbrl.ts:  const decimalsRaw=attrOf(f.attrs,'decimals')?.trim();
src/lib/dq/reconcile/ixbrl.ts:  if(decimalsRaw!==undefined&&!/^(INF|-?\d+)$/.test(decimalsRaw)){out.unsupported.push({reason:'decimals',...where});continue;}
src/lib/dq/reconcile/ixbrl.ts:  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:decimalsRaw??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
src/lib/dq/reconcile/decimal.test.ts: it('parses canonical decimals into units/scale and formats them back',()=>{
src/lib/dq/reconcile/ixbrl.test.ts:  expect(rev[0]).toMatchObject({unit:'USD',decimals:'-6',scale:6,entity:'http://www.sec.gov/CIK#0000320193',contextRef:'c-1',unitRef:'usd'});
src/lib/dq/reconcile/ixbrl.test.ts:  expect(byName(d.facts,'us-gaap:EarningsPerShareBasic')[0]).toMatchObject({value:'6.16',unit:'USD/share',decimals:'2',scale:0});
src/lib/dq/reconcile/ixbrl.test.ts:  expect(byName(d.facts,'dei:EntityCommonStockSharesOutstanding')[0]).toMatchObject({periodStart:null,periodEnd:'2023-10-20',unit:'shares',value:'15552752000',decimals:'INF'});
src/lib/dq/reconcile/ixbrl.test.ts: it('decimals must be INF or an integer',()=>{
src/lib/dq/reconcile/ixbrl.test.ts:  expect(valueOf(nf('decimals="-6"','1'))).toBe('1');
src/lib/dq/reconcile/ixbrl.test.ts:  expect(valueOf(nf('decimals="INF"','1'))).toBe('1');
src/lib/dq/reconcile/ixbrl.test.ts:  expect(valueOf(nf('decimals="2.5"','1'))).toBe('decimals');
src/lib/dq/reconcile/ixbrl.test.ts:  expect(valueOf(nf('decimals="inf"','1'))).toBe('decimals');
src/lib/dq/reconcile/ixbrl.test.ts:  expect(valueOf(nf('decimals=""','1'))).toBe('decimals');

exec
/bin/zsh -lc "sed -n '1,30p' src/lib/dq/reconcile/ixbrl.test.ts; ls node_modules/.bin/tsx 2>/dev/null; nl -ba src/lib/dq/reconcile/ixbrl.ts | sed -n '343,355p'; rg -n 'unsupported|decimals' src/lib/dq/reconcile/pair.ts | head -20" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
node_modules/.bin/tsx
   343	  const unitRef=attrOf(f.attrs,'unitRef')??'';
   344	  const u=unitRef===''||dupUnits.has(unitRef)?undefined:units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
   345	  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
   346	  const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
   347	  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
   348	  const decimalsRaw=attrOf(f.attrs,'decimals')?.trim();
   349	  if(decimalsRaw!==undefined&&!/^(INF|-?\d+)$/.test(decimalsRaw)){out.unsupported.push({reason:'decimals',...where});continue;}
   350	  const sign=attrOf(f.attrs,'sign');
   351	  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
   352	  const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
   353	  const digits=fmt===null?null:parseFactText(fmt,f.text);
   354	  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
   355	  if(digits.startsWith('-')){out.unsupported.push({reason:'sign',...where});continue;}   // the sign belongs in the sign attribute
rg: src/lib/dq/reconcile/pair.ts: IO error for operation on src/lib/dq/reconcile/pair.ts: No such file or directory (os error 2)

codex
The new decimals validation rejects valid integer representations, causing previously supported facts to be omitted.

Review comment:

- [P2] Accept explicitly positive integer decimals — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl.ts:349-349
  For an otherwise valid fact with `decimals="+2"` or `decimals="+0"`, this validation now discards the fact as unsupported. XBRL decimals accepts XML Schema integers, whose lexical representation permits a leading `+`; these facts were accepted before this commit. Allow either sign in the integer branch and add a regression test for explicitly positive decimals.
The new decimals validation rejects valid integer representations, causing previously supported facts to be omitted.

Review comment:

- [P2] Accept explicitly positive integer decimals — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl.ts:349-349
  For an otherwise valid fact with `decimals="+2"` or `decimals="+0"`, this validation now discards the fact as unsupported. XBRL decimals accepts XML Schema integers, whose lexical representation permits a leading `+`; these facts were accepted before this commit. Allow either sign in the integer branch and add a regression test for explicitly positive decimals.
