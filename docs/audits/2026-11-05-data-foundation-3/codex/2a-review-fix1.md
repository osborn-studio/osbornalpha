OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1ae9e-d564-7a60-b5a0-5be4d755926a
--------
user
commit f324aa7
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline f324aa7; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 459ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-W9yehbHM' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-NfsWcuex' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ebeFrEvC' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iXUs6Ut9' (errno=Operation not permitted)
f324aa7 fix(dq): raw-store aborts before uploading, per-extension sidecars, credential-name filter
 src/lib/dq/raw-store.test.ts | 49 ++++++++++++++++++++++++++++++++++++++++++--
 src/lib/dq/raw-store.ts      | 29 +++++++++++++++++++-------
 2 files changed, 69 insertions(+), 9 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../.. ../../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if [ -f "$d/$f" ]; then echo ==== $d/$f; cat "$d/$f"; fi; done; done; git show f324aa7 --; cat src/lib/dq/raw-store.ts; find src -name AGENTS.md -o -name AGENTS.override.md -o -name CLAUDE.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: === not found

exec
/bin/zsh -lc 'for d in . .. ../.. ../../.. ../../../.. ../../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if [ -f "$d/$f" ]; then printf '"'\\n%s\\n' \""'$d/$f"; cat "$d/$f"; fi; done; done; git show f324aa7 --; cat src/lib/dq/raw-store.ts; find src -name AGENTS.md -o -name AGENTS.override.md -o -name CLAUDE.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

../../../AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jQXGj1oq' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XtccmfE0' (errno=Operation not permitted)
commit f324aa71a2a8169e6dc869efd6c69a3021b51061
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 18:09:23 2026 -0800

    fix(dq): raw-store aborts before uploading, per-extension sidecars, credential-name filter
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/raw-store.test.ts b/src/lib/dq/raw-store.test.ts
index d5b5605..3f4ed9a 100644
--- a/src/lib/dq/raw-store.test.ts
+++ b/src/lib/dq/raw-store.test.ts
@@ -17,12 +17,12 @@ describe('raw paths',()=>{
   const h=sha('{}');
   expect(sha256Hex(enc('{}'))).toBe(h);
   expect(rawPath('sec-submissions',h,'json')).toBe(`sec-submissions/${h}.json`);
-  expect(rawMetaPath(`cn-gold-pdf/${h}.pdf`)).toBe(`cn-gold-pdf/${h}.meta.json`);
+  expect(rawMetaPath(`cn-gold-pdf/${h}.pdf`)).toBe(`cn-gold-pdf/${h}.pdf.meta.json`);
   expect(RAW_EXT).toEqual({'application/json':'json','text/html':'html','application/pdf':'pdf','text/csv':'csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/zip':'zip'});
   const store=memoryRawStore();
   expect(store.sha256Of(`hkex/${h}.xlsx`)).toBe(h);
   expect(supabaseRawStore({} as never).sha256Of(`gleif/${h}.csv`)).toBe(h);
-  for(const bad of [`hkex/${h}.exe`,`nope/${h}.json`,`hkex/${h.slice(1)}.json`,`hkex/${h}.meta.json`,'../etc/passwd'])expect(()=>store.sha256Of(bad)).toThrow(RawStoreError);
+  for(const bad of [`hkex/${h}.exe`,`nope/${h}.json`,`hkex/${h.slice(1)}.json`,`hkex/${h}.meta.json`,`hkex/${h}.json.meta.json`,'../etc/passwd'])expect(()=>store.sha256Of(bad)).toThrow(RawStoreError);
  });
 });
 
@@ -61,6 +61,51 @@ describe('memoryRawStore',()=>{
  });
 });
 
+describe('cross-extension and credential hardening',()=>{
+ const ZIP='application/zip' as const,XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
+ it('memory: identical bytes under two content types keep two objects and two sidecars; sidecars are never overwritten',async()=>{
+  const store=memoryRawStore();
+  const a=await store.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP,meta:{note:'first'}});
+  const b=await store.put({kind:'hkex',bytes:enc('PK'),contentType:XLSX,meta:{note:'second'}});
+  expect([a.status,b.status]).toEqual(['stored','stored']);
+  expect(a.path).not.toBe(b.path);
+  expect(JSON.parse(dec(store.objects.get(rawMetaPath(a.path))))).toMatchObject({content_type:ZIP,note:'first'});
+  expect(JSON.parse(dec(store.objects.get(rawMetaPath(b.path))))).toMatchObject({content_type:XLSX,note:'second'});
+  expect((await store.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP,meta:{note:'third'}})).status).toBe('exists');
+  expect(JSON.parse(dec(store.objects.get(rawMetaPath(a.path))))).toMatchObject({note:'first'});
+ });
+ it('supabase: cross-extension puts upload four distinct paths',async()=>{
+  const upload=vi.fn<(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>>(async()=>({error:null}));
+  const admin={storage:{from:()=>({upload})}} as never;const s=supabaseRawStore(admin);
+  const a=await s.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP});const b=await s.put({kind:'hkex',bytes:enc('PK'),contentType:XLSX});
+  const paths=upload.mock.calls.map(c=>c[0]);
+  expect(new Set(paths).size).toBe(4);
+  expect(paths).toEqual([a.path,rawMetaPath(a.path),b.path,rawMetaPath(b.path)]);
+  expect(JSON.parse(upload.mock.calls[3][1] as string)).toMatchObject({content_type:XLSX});
+ });
+ it('supabase: an already-aborted budget performs zero uploads; abort between object and sidecar skips the sidecar',async()=>{
+  const upload=vi.fn(async()=>({error:null}));const s=supabaseRawStore({storage:{from:()=>({upload})}} as never);
+  await expect(s.put(item('{}'),aborted())).rejects.toThrow('raw_upload_failed: budget_exhausted');
+  expect(upload).not.toHaveBeenCalled();
+  const c=new AbortController();
+  const up2=vi.fn(async()=>{c.abort();return {error:null};});
+  const s2=supabaseRawStore({storage:{from:()=>({upload:up2})}} as never);
+  await expect(s2.put(item('{}'),{remainingMs:()=>1,signal:c.signal})).rejects.toThrow('budget_exhausted');
+  expect(up2).toHaveBeenCalledTimes(1);
+ });
+ it('rejects credential-like meta keys and URL parameter names (decoded) before any upload',async()=>{
+  const upload=vi.fn(async()=>({error:null}));const s=supabaseRawStore({storage:{from:()=>({upload})}} as never);
+  const mem=memoryRawStore();
+  for(const meta of <Record<string,string>[]>[{api_key:'SECRET'},{Authorization:'Bearer x'},{cookie:'a=b'},{url:'https://example.test/?%61pi_key=SECRET'},{url:'https://example.test/a?x=1&Token=z'},{url:'https://example.test/#access_token=z'}]){
+   await expect(s.put(item('{}',{meta}))).rejects.toThrow(/raw_invalid: meta_credential:/);
+   await expect(mem.put(item('{}',{meta}))).rejects.toThrow(/raw_invalid: meta_credential:/);
+  }
+  expect(upload).not.toHaveBeenCalled();
+  expect(mem.objects.size).toBe(0);
+  await expect(mem.put(item('{}',{meta:{url:'https://example.test/?page=2'}}))).resolves.toMatchObject({status:'stored'});
+ });
+});
+
 describe('supabaseRawStore',()=>{
  const fake=(upload:(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>)=>{const from=vi.fn(()=>({upload}));return {admin:{storage:{from}} as never,from};};
  it('uploads the body then the sidecar with upsert:false into reconcile-raw',async()=>{
diff --git a/src/lib/dq/raw-store.ts b/src/lib/dq/raw-store.ts
index b2a3518..fbfc473 100644
--- a/src/lib/dq/raw-store.ts
+++ b/src/lib/dq/raw-store.ts
@@ -23,7 +23,8 @@ export const RAW_EXT:Record<RawContentType,string>={
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/zip':'zip',
 };
 export const rawPath=(kind:RawKind,sha256:string,ext:string)=>`${kind}/${sha256}.${ext}`;
-export const rawMetaPath=(path:string)=>path.replace(/\.[a-z]+$/,'.meta.json');
+// Full object filename + .meta.json: the same bytes stored under two content types get distinct sidecars.
+export const rawMetaPath=(path:string)=>`${path}.meta.json`;
 
 export class RawStoreError extends Error{
  constructor(readonly code:'raw_upload_failed'|'raw_invalid',readonly reason?:string){
@@ -34,6 +35,17 @@ export class RawStoreError extends Error{
 
 const PATH=new RegExp(`^(${RAW_KINDS.join('|')})/([0-9a-f]{64})\\.(${Object.values(RAW_EXT).join('|')})$`);
 const CREDENTIAL=/:\/\/[^/\s]*@|[?&#](?:token|key|apikey|api_key|access_token|sig|signature|auth|secret|password)=/i;
+const CREDENTIAL_NAME=/api[-_]?key|token|secret|password|authorization|cookie|^(?:key|sig|signature|auth)$/i;
+/** A string value that parses as a URL is also checked by its decoded query/fragment parameter names and userinfo. */
+function urlHasCredential(v:string):boolean{
+ let u:URL;
+ try{u=new URL(v);}catch{return false;}
+ if(u.username||u.password)return true;
+ for(const name of u.searchParams.keys())if(CREDENTIAL_NAME.test(name))return true;
+ const frag=u.hash.replace(/^#/,'');
+ if(frag.includes('='))for(const name of new URLSearchParams(frag).keys())if(CREDENTIAL_NAME.test(name))return true;
+ return false;
+}
 
 export const sha256Hex=(bytes:Uint8Array):string=>createHash('sha256').update(bytes).digest('hex');
 
@@ -51,7 +63,8 @@ function prepare(item:RawPut):{sha256:string;path:string;meta:string}{
  if(!(item.bytes instanceof Uint8Array))throw new RawStoreError('raw_invalid','bytes');
  for(const [k,v] of Object.entries(item.meta??{})){
   if(typeof v==='number'?!Number.isFinite(v):typeof v!=='string')throw new RawStoreError('raw_invalid',`meta:${k}`);
-  if(typeof v==='string'&&CREDENTIAL.test(v))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
+  if(CREDENTIAL_NAME.test(k))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
+  if(typeof v==='string'&&(CREDENTIAL.test(v)||urlHasCredential(v)))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
  }
  const sha256=sha256Hex(item.bytes);
  // System keys last: caller meta can never overwrite what the sidecar asserts about the bytes.
@@ -75,6 +88,8 @@ function withinBudget<T>(p:Promise<T>,budget?:Budget):Promise<T>{
 export function supabaseRawStore(admin:SupabaseClient):RawStore{
  const bucket=()=>admin.storage.from(RECONCILE_RAW_BUCKET);
  const upload=async(path:string,body:Uint8Array|string,contentType:string,budget?:Budget):Promise<'stored'|'exists'>=>{
+  // checked before the call: an already-aborted budget performs zero uploads
+  if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
   const {error}=await withinBudget(bucket().upload(path,body,{contentType,upsert:false}),budget);
   if(!error)return 'stored';
   if(isExists(error as UploadError))return 'exists';
@@ -99,11 +114,11 @@ export function memoryRawStore():RawStore&{objects:Map<string,Uint8Array>}{
   async put(item,budget){
    const {sha256,path,meta}=prepare(item);
    if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
-   if(objects.has(path))return {sha256,path,status:'exists'};
-   // a copy: later mutation of the caller's buffer cannot rewrite evidence
-   objects.set(path,new Uint8Array(item.bytes));
-   objects.set(rawMetaPath(path),new TextEncoder().encode(meta));
-   return {sha256,path,status:'stored'};
+   // a copy: later mutation of the caller's buffer cannot rewrite evidence; stored objects and sidecars are immutable
+   const status:RawStored['status']=objects.has(path)?'exists':'stored';
+   if(status==='stored')objects.set(path,new Uint8Array(item.bytes));
+   if(!objects.has(rawMetaPath(path)))objects.set(rawMetaPath(path),new TextEncoder().encode(meta));
+   return {sha256,path,status};
   },
  };
 }
// src/lib/dq/raw-store.ts
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
export type RawContentType='application/json'|'text/html'|'application/pdf'|'text/csv'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/zip';
export interface RawPut{kind:RawKind;bytes:Uint8Array;contentType:RawContentType;meta?:Record<string,string|number>}
export interface RawStored{sha256:string;path:string;status:'stored'|'exists'}
export interface RawStore{put(item:RawPut,budget?:Budget):Promise<RawStored>;sha256Of(path:string):string}
export const RAW_EXT:Record<RawContentType,string>={
 'application/json':'json','text/html':'html','application/pdf':'pdf','text/csv':'csv',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/zip':'zip',
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

exec
/bin/zsh -lc "rg 'rawMetaPath|\\.meta\\.json|rawStore.put|raw\\.put' src/lib/dq src/app -n | head -100; cat package.json; cat src/lib/dq/raw-store.test.ts; ls -a | head -35; git log -4 --oneline" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/dq/raw-store.test.ts:4:import {RAW_EXT,RECONCILE_RAW_BUCKET,RawStoreError,memoryRawStore,rawMetaPath,rawPath,sha256Hex,supabaseRawStore} from './raw-store';
src/lib/dq/raw-store.test.ts:16: it('content-addresses <kind>/<sha256>.<ext> with a .meta.json sidecar and parses the sha back',()=>{
src/lib/dq/raw-store.test.ts:20:  expect(rawMetaPath(`cn-gold-pdf/${h}.pdf`)).toBe(`cn-gold-pdf/${h}.pdf.meta.json`);
src/lib/dq/raw-store.test.ts:25:  for(const bad of [`hkex/${h}.exe`,`nope/${h}.json`,`hkex/${h.slice(1)}.json`,`hkex/${h}.meta.json`,`hkex/${h}.json.meta.json`,'../etc/passwd'])expect(()=>store.sha256Of(bad)).toThrow(RawStoreError);
src/lib/dq/raw-store.test.ts:36:  expect(JSON.parse(dec(store.objects.get(rawMetaPath(first.path))))).toEqual({
src/lib/dq/raw-store.test.ts:72:  expect(JSON.parse(dec(store.objects.get(rawMetaPath(a.path))))).toMatchObject({content_type:ZIP,note:'first'});
src/lib/dq/raw-store.test.ts:73:  expect(JSON.parse(dec(store.objects.get(rawMetaPath(b.path))))).toMatchObject({content_type:XLSX,note:'second'});
src/lib/dq/raw-store.test.ts:75:  expect(JSON.parse(dec(store.objects.get(rawMetaPath(a.path))))).toMatchObject({note:'first'});
src/lib/dq/raw-store.test.ts:83:  expect(paths).toEqual([a.path,rawMetaPath(a.path),b.path,rawMetaPath(b.path)]);
src/lib/dq/raw-store.test.ts:118:  expect(upload.mock.calls[1][0]).toBe(rawMetaPath(out.path));
src/lib/dq/raw-store.ts:4:// <kind>/<sha256>.<ext> plus a <kind>/<sha256>.meta.json sidecar, both with upsert:false, so identical
src/lib/dq/raw-store.ts:26:// Full object filename + .meta.json: the same bytes stored under two content types get distinct sidecars.
src/lib/dq/raw-store.ts:27:export const rawMetaPath=(path:string)=>`${path}.meta.json`;
src/lib/dq/raw-store.ts:103:   await upload(rawMetaPath(path),meta,'application/json',budget);
src/lib/dq/raw-store.ts:120:   if(!objects.has(rawMetaPath(path)))objects.set(rawMetaPath(path),new TextEncoder().encode(meta));
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
// src/lib/dq/raw-store.test.ts
import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {RAW_EXT,RECONCILE_RAW_BUCKET,RawStoreError,memoryRawStore,rawMetaPath,rawPath,sha256Hex,supabaseRawStore} from './raw-store';
import type {RawPut} from './raw-store';

const enc=(s:string)=>new TextEncoder().encode(s);
const dec=(b:Uint8Array|undefined)=>new TextDecoder().decode(b);
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const item=(text:string,over:Partial<RawPut>={}):RawPut=>({kind:'sec-submissions',bytes:enc(text),contentType:'application/json',
 meta:{url:'https://data.sec.gov/submissions/CIK0000320193.json',fetched_at:'2026-11-05T00:00:00.000Z',http_status:200},...over});
const budget=()=>({remainingMs:()=>60_000,signal:new AbortController().signal});
const aborted=()=>{const c=new AbortController();c.abort();return {remainingMs:()=>0,signal:c.signal};};

describe('raw paths',()=>{
 it('content-addresses <kind>/<sha256>.<ext> with a .meta.json sidecar and parses the sha back',()=>{
  const h=sha('{}');
  expect(sha256Hex(enc('{}'))).toBe(h);
  expect(rawPath('sec-submissions',h,'json')).toBe(`sec-submissions/${h}.json`);
  expect(rawMetaPath(`cn-gold-pdf/${h}.pdf`)).toBe(`cn-gold-pdf/${h}.pdf.meta.json`);
  expect(RAW_EXT).toEqual({'application/json':'json','text/html':'html','application/pdf':'pdf','text/csv':'csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/zip':'zip'});
  const store=memoryRawStore();
  expect(store.sha256Of(`hkex/${h}.xlsx`)).toBe(h);
  expect(supabaseRawStore({} as never).sha256Of(`gleif/${h}.csv`)).toBe(h);
  for(const bad of [`hkex/${h}.exe`,`nope/${h}.json`,`hkex/${h.slice(1)}.json`,`hkex/${h}.meta.json`,`hkex/${h}.json.meta.json`,'../etc/passwd'])expect(()=>store.sha256Of(bad)).toThrow(RawStoreError);
 });
});

describe('memoryRawStore',()=>{
 it('stores once at the content address, answers exists on a repeat and keeps the first sidecar',async()=>{
  const store=memoryRawStore();
  const first=await store.put(item('{"a":1}'),budget());
  expect(first).toEqual({sha256:sha('{"a":1}'),path:`sec-submissions/${sha('{"a":1}')}.json`,status:'stored'});
  expect(await store.put(item('{"a":1}',{meta:{fetched_at:'2026-11-06T00:00:00.000Z'}}))).toEqual({...first,status:'exists'});
  expect(store.objects.get(first.path)).toEqual(enc('{"a":1}'));
  expect(JSON.parse(dec(store.objects.get(rawMetaPath(first.path))))).toEqual({
   url:'https://data.sec.gov/submissions/CIK0000320193.json',fetched_at:'2026-11-05T00:00:00.000Z',http_status:200,
   kind:'sec-submissions',sha256:first.sha256,bytes:7,content_type:'application/json',
  });
 });
 it('keeps its own copy of the bytes',async()=>{
  const store=memoryRawStore();const it1=item('{"a":1}');
  const {path}=await store.put(it1);
  it1.bytes[0]=0;
  expect(dec(store.objects.get(path))).toBe('{"a":1}');
 });
 it('stores every content type under its extension',async()=>{
  const store=memoryRawStore();
  expect((await store.put({kind:'cn-gold-pdf',bytes:enc('%PDF-1.7'),contentType:'application/pdf'})).path).toBe(`cn-gold-pdf/${sha('%PDF-1.7')}.pdf`);
  expect((await store.put({kind:'hkex',bytes:enc('PK'),contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})).path).toBe(`hkex/${sha('PK')}.xlsx`);
 });
 it('refuses an unknown kind or content type, credential-like meta, a non-finite number and an exhausted budget',async()=>{
  const store=memoryRawStore();
  await expect(store.put(item('{}',{kind:'tickers' as never}))).rejects.toThrow('raw_invalid: kind:tickers');
  await expect(store.put(item('{}',{contentType:'image/png' as never}))).rejects.toThrow('raw_invalid: content_type:image/png');
  await expect(store.put(item('{}',{meta:{url:'https://api.example/x?token=abc'}}))).rejects.toThrow('raw_invalid: meta_credential:url');
  await expect(store.put(item('{}',{meta:{url:'https://user:pw@example.com/x'}}))).rejects.toThrow('raw_invalid: meta_credential:url');
  await expect(store.put(item('{}',{meta:{n:Number.NaN}}))).rejects.toThrow('raw_invalid: meta:n');
  await expect(store.put(item('{}'),aborted())).rejects.toThrow('raw_upload_failed: budget_exhausted');
  expect(store.objects.size).toBe(0);
 });
});

describe('cross-extension and credential hardening',()=>{
 const ZIP='application/zip' as const,XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
 it('memory: identical bytes under two content types keep two objects and two sidecars; sidecars are never overwritten',async()=>{
  const store=memoryRawStore();
  const a=await store.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP,meta:{note:'first'}});
  const b=await store.put({kind:'hkex',bytes:enc('PK'),contentType:XLSX,meta:{note:'second'}});
  expect([a.status,b.status]).toEqual(['stored','stored']);
  expect(a.path).not.toBe(b.path);
  expect(JSON.parse(dec(store.objects.get(rawMetaPath(a.path))))).toMatchObject({content_type:ZIP,note:'first'});
  expect(JSON.parse(dec(store.objects.get(rawMetaPath(b.path))))).toMatchObject({content_type:XLSX,note:'second'});
  expect((await store.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP,meta:{note:'third'}})).status).toBe('exists');
  expect(JSON.parse(dec(store.objects.get(rawMetaPath(a.path))))).toMatchObject({note:'first'});
 });
 it('supabase: cross-extension puts upload four distinct paths',async()=>{
  const upload=vi.fn<(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>>(async()=>({error:null}));
  const admin={storage:{from:()=>({upload})}} as never;const s=supabaseRawStore(admin);
  const a=await s.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP});const b=await s.put({kind:'hkex',bytes:enc('PK'),contentType:XLSX});
  const paths=upload.mock.calls.map(c=>c[0]);
  expect(new Set(paths).size).toBe(4);
  expect(paths).toEqual([a.path,rawMetaPath(a.path),b.path,rawMetaPath(b.path)]);
  expect(JSON.parse(upload.mock.calls[3][1] as string)).toMatchObject({content_type:XLSX});
 });
 it('supabase: an already-aborted budget performs zero uploads; abort between object and sidecar skips the sidecar',async()=>{
  const upload=vi.fn(async()=>({error:null}));const s=supabaseRawStore({storage:{from:()=>({upload})}} as never);
  await expect(s.put(item('{}'),aborted())).rejects.toThrow('raw_upload_failed: budget_exhausted');
  expect(upload).not.toHaveBeenCalled();
  const c=new AbortController();
  const up2=vi.fn(async()=>{c.abort();return {error:null};});
  const s2=supabaseRawStore({storage:{from:()=>({upload:up2})}} as never);
  await expect(s2.put(item('{}'),{remainingMs:()=>1,signal:c.signal})).rejects.toThrow('budget_exhausted');
  expect(up2).toHaveBeenCalledTimes(1);
 });
 it('rejects credential-like meta keys and URL parameter names (decoded) before any upload',async()=>{
  const upload=vi.fn(async()=>({error:null}));const s=supabaseRawStore({storage:{from:()=>({upload})}} as never);
  const mem=memoryRawStore();
  for(const meta of <Record<string,string>[]>[{api_key:'SECRET'},{Authorization:'Bearer x'},{cookie:'a=b'},{url:'https://example.test/?%61pi_key=SECRET'},{url:'https://example.test/a?x=1&Token=z'},{url:'https://example.test/#access_token=z'}]){
   await expect(s.put(item('{}',{meta}))).rejects.toThrow(/raw_invalid: meta_credential:/);
   await expect(mem.put(item('{}',{meta}))).rejects.toThrow(/raw_invalid: meta_credential:/);
  }
  expect(upload).not.toHaveBeenCalled();
  expect(mem.objects.size).toBe(0);
  await expect(mem.put(item('{}',{meta:{url:'https://example.test/?page=2'}}))).resolves.toMatchObject({status:'stored'});
 });
});

describe('supabaseRawStore',()=>{
 const fake=(upload:(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>)=>{const from=vi.fn(()=>({upload}));return {admin:{storage:{from}} as never,from};};
 it('uploads the body then the sidecar with upsert:false into reconcile-raw',async()=>{
  const upload=vi.fn<(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>>(async()=>({error:null}));const {admin,from}=fake(upload);
  const out=await supabaseRawStore(admin).put(item('<html/>',{kind:'sec-document',contentType:'text/html',meta:{accession:'0000320193-25-000079'}}),budget());
  expect(out).toEqual({sha256:sha('<html/>'),path:`sec-document/${sha('<html/>')}.html`,status:'stored'});
  expect(from).toHaveBeenCalledWith(RECONCILE_RAW_BUCKET);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0]).toEqual([out.path,enc('<html/>'),{contentType:'text/html',upsert:false}]);
  expect(upload.mock.calls[1][0]).toBe(rawMetaPath(out.path));
  expect(upload.mock.calls[1][2]).toEqual({contentType:'application/json',upsert:false});
  expect(JSON.parse(upload.mock.calls[1][1] as string)).toEqual({accession:'0000320193-25-000079',kind:'sec-document',sha256:out.sha256,bytes:7,content_type:'text/html'});
 });
 it('maps 409 / already exists to exists and any other error to raw_upload_failed',async()=>{
  expect((await supabaseRawStore(fake(async()=>({error:{statusCode:'409',message:'The resource already exists'}})).admin).put(item('{}'))).status).toBe('exists');
  expect((await supabaseRawStore(fake(async()=>({error:{message:'Duplicate'}})).admin).put(item('{}'))).status).toBe('exists');
  const down=fake(async()=>({error:{statusCode:500,message:'storage down'}}));
  const e=await supabaseRawStore(down.admin).put(item('{}')).catch(x=>x);
  expect(e).toBeInstanceOf(RawStoreError);
  expect(e).toMatchObject({code:'raw_upload_failed',message:'raw_upload_failed: storage down'});
 });
 it('rejects without waiting for a hung upload once the budget aborts',async()=>{
  const hung=fake(()=>new Promise(()=>{}));const c=new AbortController();
  const p=supabaseRawStore(hung.admin).put(item('{}'),{remainingMs:()=>1,signal:c.signal});
  c.abort();
  await expect(p).rejects.toThrow('raw_upload_failed: budget_exhausted');
 });
 it('validates before any upload',async()=>{
  const upload=vi.fn(async()=>({error:null}));const {admin}=fake(upload);
  await expect(supabaseRawStore(admin).put(item('{}',{meta:{u:'https://x.example/?api_key=1'}}))).rejects.toThrow('raw_invalid: meta_credential:u');
  expect(upload).not.toHaveBeenCalled();
 });
});
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oQQhULzT' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-7WGvDDQV' (errno=Operation not permitted)
f324aa7 fix(dq): raw-store aborts before uploading, per-extension sidecars, credential-name filter
f2c1f7d docs(audit): plan 3 implementation log and Codex reports for Tasks 1a-1b
73393c4 feat(dq): typed dataset registry, weekly cadence, dashboard dataset inventory and the reconcile-raw evidence store
a651281 fix(entities): locator and provenance_written guards, guarded identifier write, no-key-update issuer lock, lenient rejection

exec
/bin/zsh -lc './node_modules/.bin/vitest run src/lib/dq/raw-store.test.ts --no-cache' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 493ms:
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/dq/raw-store.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/dq/raw-store.test.ts [ src/lib/dq/raw-store.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/ky9bkqkvr6wh32osP9xqe/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  18:10:36
   Duration  261ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable regressions were identified in the abort checks, per-extension sidecars, or credential filtering. Test execution was blocked by the read-only sandbox, so verification was limited to code inspection.
No actionable regressions were identified in the abort checks, per-extension sidecars, or credential filtering. Test execution was blocked by the read-only sandbox, so verification was limited to code inspection.
