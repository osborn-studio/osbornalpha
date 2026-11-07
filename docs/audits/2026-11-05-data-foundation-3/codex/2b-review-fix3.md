OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1aeae-457a-75f3-b209-028738d99c9f
--------
user
commit fb4bc0a
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline fb4bc0a; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 468ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-AxkRU6nB' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Hqz2oPST' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2b-challenge-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2b-review-fix3.md
?? docs/audits/2026-11-05-data-foundation-3/codex/2b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3n7IyR1I' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rIIesgre' (errno=Operation not permitted)
fb4bc0a fix(entities): reject URL userinfo hidden by extra slashes, protocol-relative form or control characters
 src/lib/entities/issuers.test.ts    |  6 ++++++
 src/lib/entities/provenance.test.ts |  2 ++
 src/lib/entities/provenance.ts      | 11 +++++++++--
 3 files changed, 17 insertions(+), 2 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo "$p"; cat "$p"; fi; done; ls -a; git show fb4bc0a; cat src/lib/entities/provenance.ts; cat src/lib/entities/provenance.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
tailwind.config.ts
tsconfig.json
tsconfig.tsbuildinfo
vendor
vercel.json
vitest.config.ts
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-SPl8fwlW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZyxPqCV3' (errno=Operation not permitted)
commit fb4bc0a7ff28afb6a9f912205dee359ee087d98e
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Thu Nov 5 18:26:29 2026 -0800

    fix(entities): reject URL userinfo hidden by extra slashes, protocol-relative form or control characters
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/issuers.test.ts b/src/lib/entities/issuers.test.ts
index 98c338b..5d67959 100644
--- a/src/lib/entities/issuers.test.ts
+++ b/src/lib/entities/issuers.test.ts
@@ -399,6 +399,12 @@ describe('attachSecurity',()=>{
   await expect(attachSecurity(c,{...sec,valid_from_method:'guessed' as never})).rejects.toThrow('invalid_security:valid_from_method');
   expect(c.rows('issuer_securities')).toEqual([]);
  });
+ it('rejects userinfo URLs (extra slashes, protocol-relative, control characters) in provenance before any insert',async()=>{
+  const c=client();
+  for(const u of ['https:////bob:pw@example.com/f.csv','//bob:pw@example.com/f.csv','https://bo\tb:pw@example.com/f.csv'])
+   await expect(attachSecurity(c,{...sec,provenance:{valid_from:{source:'x',locator:u}}})).rejects.toThrow('provenance_rejected:url_credentials');
+  expect(c.rows('issuer_securities')).toEqual([]);
+ });
  it('passes provenance through the public whitelist before any write',async()=>{
   const c=client();
   await expect(attachSecurity(c,{...sec,provenance:{exchange:'Nasdaq'}})).rejects.toBeInstanceOf(ProvenanceError);
diff --git a/src/lib/entities/provenance.test.ts b/src/lib/entities/provenance.test.ts
index 76633fa..402f6e5 100644
--- a/src/lib/entities/provenance.test.ts
+++ b/src/lib/entities/provenance.test.ts
@@ -28,6 +28,8 @@ describe('sanitizeProvenance',()=>{
   for(const k of ['auth','session_id','email','apikey'])expect(code({valid_from:{[k]:'x'}})).toBe(`secret_key@$.valid_from.${k}`);
   expect(code({isin:{locator:'https://api.example/x?token=abc'}})).toBe('url_credentials@$.isin.locator');
   expect(code({isin:{locator:'https://bob:pw@example.com/f.csv'}})).toBe('url_credentials@$.isin.locator');
+  for(const u of ['https:////bob:pw@example.com/f.csv','//bob:pw@example.com/f.csv','https://bo\tb:pw@example.com/f.csv','https://bob:p\nw@example.com/f.csv'])
+   expect({u,r:code({isin:{locator:u}})}).toEqual({u,r:'url_credentials@$.isin.locator'});
   expect(code({isin:{locator:'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx'}})).toBe('ok');
   expect(code({valid_from:{source:'curated',entity:'5f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'}})).toBe('uuid_value@$.valid_from.entity');
   expect(code({figi:{level:Number.POSITIVE_INFINITY}})).toBe('bad_value@$.figi.level');
diff --git a/src/lib/entities/provenance.ts b/src/lib/entities/provenance.ts
index c982767..ee3b62d 100644
--- a/src/lib/entities/provenance.ts
+++ b/src/lib/entities/provenance.ts
@@ -20,8 +20,15 @@ export class ProvenanceError extends Error{
 // email keys, 8 KB total): a claim then fails at filing instead of at acceptance.
 const SECRET_KEY=/(secret|token|passw|api[_-]?key|apikey|auth|authorization|user_?id|cookie|session|credential|private|email)/i;
 const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
-const URL_QUERY=/[a-z][a-z0-9+.-]*:\/\/[^\s]*[?#]|\?[^\s]*=|:\/\/[^/\s]*@/i;
+const URL_QUERY=/[a-z][a-z0-9+.-]*:\/\/[^\s]*[?#]|\?[^\s]*=/i;
 const SECRET_TEXT=/(token|secret|passw[a-z]*|api[_-]?key|\bkey)\s*[=:]/i;
+/** URL userinfo (user:pw@host), also protocol-relative, with extra slashes, or hidden by control/whitespace characters. */
+function hasUserinfo(v:string):boolean{
+ const c=v.replace(/[\x00-\x20\x7f]/g,'');
+ if(/\/\/+[^/?#]*@/.test(c))return true;
+ try{const u=new URL(c,'https://base.invalid/');return u.username!==''||u.password!=='';}
+ catch{return false;}
+}
 const MAX_DEPTH=4;
 const MAX_STRING=500;
 const MAX_JSON=8192;
@@ -33,7 +40,7 @@ function clean(v:unknown,path:string,depth:number):unknown{
  if(typeof v==='number'){if(!Number.isFinite(v))throw new ProvenanceError('bad_value',path);return v;}
  if(typeof v==='string'){
   if(v.length>MAX_STRING)throw new ProvenanceError('too_long',path);
-  if(URL_QUERY.test(v))throw new ProvenanceError('url_credentials',path);
+  if(URL_QUERY.test(v)||hasUserinfo(v))throw new ProvenanceError('url_credentials',path);
   if(UUID.test(v))throw new ProvenanceError('uuid_value',path);
   if(SECRET_TEXT.test(v))throw new ProvenanceError('secret_text',path);
   return v;
// src/lib/entities/provenance.ts
// Public provenance whitelist (spec 3 §3.1; plan 3 contract C2). issuer_securities.provenance and
// issuers.provenance are anon-readable, so writers pass every object through sanitizeProvenance: only
// whitelisted top-level keys; nested values may carry source names, ids, dates, hashes and the source
// row values an evidence method copied, never a secret-looking key, URL credentials or a token-like
// query parameter, or a UUID (user ids are UUIDs; no public provenance value needs one).
// NOTE: the issuer write path (upsertIssuerByIdentifiers) is NOT yet routed through sanitizeProvenance
// (ISSUER_PROVENANCE_KEYS is ready for it); that wiring is a runbook 9.x follow-up.
export const PROVENANCE_KEYS=['isin','figi','valid_from','valid_to','pending_change'] as const;
export const ISSUER_PROVENANCE_KEYS=['lei','cik','usci','cninfo_org_id','hkex_stock_code_primary','canonical_name_zh','canonical_name_en','country_code'] as const;
export type ProvenanceErrorCode='not_object'|'unknown_key'|'secret_key'|'url_credentials'|'secret_text'|'uuid_value'|'bad_value'|'too_deep'|'too_long'|'too_large';

export class ProvenanceError extends Error{
 constructor(readonly code:ProvenanceErrorCode,readonly path:string){
  super(`provenance_rejected:${code}:${path}`);
  this.name='ProvenanceError';
 }
}

// These rules include every rule of the SQL guard claim_provenance_safe (migration 20261107090000), which
// is authoritative: TS must reject everything SQL rejects. TS may be stricter (URL userinfo, auth/session/
// email keys, 8 KB total): a claim then fails at filing instead of at acceptance.
// Deliberately strict: bare `auth` and `private` also reject innocent keys such as `author` or `private_company`;
// a false rejection fails loudly at filing, a missed secret would be public.
const SECRET_KEY=/(secret|token|passw|api[_-]?key|apikey|auth|authorization|user_?id|cookie|session|credential|private|email)/i;
const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const URL_QUERY=/[a-z][a-z0-9+.-]*:\/\/[^\s]*[?#]|\?[^\s]*=/i;
const SECRET_TEXT=/(token|secret|passw[a-z]*|api[_-]?key|\bkey)\s*[=:]/i;
/** URL userinfo (user:pw@host), also protocol-relative, with extra slashes, or hidden by control/whitespace characters. */
function hasUserinfo(v:string):boolean{
 const c=v.replace(/[\x00-\x20\x7f]/g,'');
 if(/\/\/+[^/?#]*@/.test(c))return true;
 try{const u=new URL(c,'https://base.invalid/');return u.username!==''||u.password!=='';}
 catch{return false;}
}
const MAX_DEPTH=4;
const MAX_STRING=500;
const MAX_JSON=8192;
const isPlainObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;

function clean(v:unknown,path:string,depth:number):unknown{
 if(depth>MAX_DEPTH)throw new ProvenanceError('too_deep',path);
 if(v===null||typeof v==='boolean')return v;
 if(typeof v==='number'){if(!Number.isFinite(v))throw new ProvenanceError('bad_value',path);return v;}
 if(typeof v==='string'){
  if(v.length>MAX_STRING)throw new ProvenanceError('too_long',path);
  if(URL_QUERY.test(v)||hasUserinfo(v))throw new ProvenanceError('url_credentials',path);
  if(UUID.test(v))throw new ProvenanceError('uuid_value',path);
  if(SECRET_TEXT.test(v))throw new ProvenanceError('secret_text',path);
  return v;
 }
 if(Array.isArray(v))return v.map((x,i)=>clean(x,`${path}[${i}]`,depth+1));
 if(isPlainObject(v)){
  const out:Record<string,unknown>={};
  for(const [k,x] of Object.entries(v)){
   if(SECRET_KEY.test(k))throw new ProvenanceError('secret_key',`${path}.${k}`);
   if(x===undefined)continue;
   out[k]=clean(x,`${path}.${k}`,depth+1);
  }
  return out;
 }
 throw new ProvenanceError('bad_value',path);
}

/** A deep copy of `p` restricted to `allowed` top-level keys; throws ProvenanceError on anything unsafe. */
export function sanitizeProvenance(p:unknown,allowed:readonly string[]=PROVENANCE_KEYS):Record<string,unknown>{
 if(!isPlainObject(p))throw new ProvenanceError('not_object','$');
 for(const k of Object.keys(p))if(!allowed.includes(k))throw new ProvenanceError('unknown_key',k);
 const out=clean(p,'$',0) as Record<string,unknown>;
 if(JSON.stringify(out).length>MAX_JSON)throw new ProvenanceError('too_large','$');
 return out;
}
// src/lib/entities/provenance.test.ts
import {describe,it,expect} from 'vitest';
import {ISSUER_PROVENANCE_KEYS,PROVENANCE_KEYS,ProvenanceError,sanitizeProvenance} from './provenance';

const code=(p:unknown,allowed?:readonly string[])=>{
 try{sanitizeProvenance(p,allowed);return 'ok';}
 catch(e){return e instanceof ProvenanceError?`${e.code}@${e.path}`:'other';}
};

describe('sanitizeProvenance',()=>{
 it('keeps the whitelisted keys of spec 3 §3.1 and returns a deep copy',()=>{
  const p={
   valid_from:{source:'stocks_universe.list_date',provider:'tushare',as_of:'2026-11-05',row:{list_date:'2001-08-27',source:'tushare',source_updated_at:'2026-11-04T00:00:00Z'}},
   figi:{source:'openfigi',as_of:'2026-11-05',evidence_sha256:'a'.repeat(64),job:{idType:'ID_ISIN',idValue:'CNE0000018R8'},level:'composite'},
   pending_change:{first_missing_as_of:'2026-11-01',first_missing_sha256:'b'.repeat(64),replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']},
  };
  const out=sanitizeProvenance(p);
  expect(out).toEqual(p);
  (out.valid_from as {row:{list_date:string}}).row.list_date='x';
  expect(p.valid_from.row.list_date).toBe('2001-08-27');
  expect(sanitizeProvenance({})).toEqual({});
  expect(PROVENANCE_KEYS).toEqual(['isin','figi','valid_from','valid_to','pending_change']);
 });
 it('rejects unknown top-level keys, secret-looking keys, URL credentials, UUIDs, bad values, depth and size',()=>{
  expect(code({exchange:'NYSE'})).toBe('unknown_key@exchange');
  expect(code({valid_from:{source:'x',api_key:'k'}})).toBe('secret_key@$.valid_from.api_key');
  expect(code({valid_from:{source:'x',row:{user_id:'u'}}})).toBe('secret_key@$.valid_from.row.user_id');
  for(const k of ['auth','session_id','email','apikey'])expect(code({valid_from:{[k]:'x'}})).toBe(`secret_key@$.valid_from.${k}`);
  expect(code({isin:{locator:'https://api.example/x?token=abc'}})).toBe('url_credentials@$.isin.locator');
  expect(code({isin:{locator:'https://bob:pw@example.com/f.csv'}})).toBe('url_credentials@$.isin.locator');
  for(const u of ['https:////bob:pw@example.com/f.csv','//bob:pw@example.com/f.csv','https://bo\tb:pw@example.com/f.csv','https://bob:p\nw@example.com/f.csv'])
   expect({u,r:code({isin:{locator:u}})}).toEqual({u,r:'url_credentials@$.isin.locator'});
  expect(code({isin:{locator:'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx'}})).toBe('ok');
  expect(code({valid_from:{source:'curated',entity:'5f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'}})).toBe('uuid_value@$.valid_from.entity');
  expect(code({figi:{level:Number.POSITIVE_INFINITY}})).toBe('bad_value@$.figi.level');
  expect(code({figi:{at:new Date(0)}})).toBe('bad_value@$.figi.at');
  expect(code([])).toBe('not_object@$');
  expect(code(null)).toBe('not_object@$');
  expect(code({valid_from:{a:{b:{c:{d:{e:{f:{g:1}}}}}}}})).toBe('too_deep@$.valid_from.a.b.c.d');
  expect(code({figi:{x:'y'.repeat(501)}})).toBe('too_long@$.figi.x');
  expect(code({figi:Object.fromEntries(Array.from({length:25},(_,i)=>[`k${i}`,'y'.repeat(400)]))})).toBe('too_large@$');
 });
 it('takes another whitelist for issuer provenance',()=>{
  expect(sanitizeProvenance({lei:{source:'gleif',as_of:'2026-11-05'}},ISSUER_PROVENANCE_KEYS)).toEqual({lei:{source:'gleif',as_of:'2026-11-05'}});
  expect(()=>sanitizeProvenance({isin:{source:'x'}},ISSUER_PROVENANCE_KEYS)).toThrow('provenance_rejected:unknown_key:isin');
 });
});

// One case per rule of the SQL guard claim_provenance_safe: TS must reject everything SQL rejects.
describe('sanitizeProvenance agrees with SQL claim_provenance_safe',()=>{
 const cases:[string,unknown,string][]=[
  ['secret key',{figi:{api_key:'x'}},'secret_key'],
  ['authorization key',{figi:{authorization:'x'}},'secret_key'],
  ['url query',{isin:{locator:'https://h.example/f?a=1'}},'url_credentials'],
  ['url fragment',{isin:{locator:'https://h.example/f#frag'}},'url_credentials'],
  ['bare query assignment',{isin:{locator:'/x?a=b'}},'url_credentials'],
  ['encoded token name (Codex bypass)',{isin:{locator:'https://h.example/f?%74oken=abc'}},'url_credentials'],
  ['access-token (Codex bypass)',{isin:{locator:'https://h.example/f?access-token=abc'}},'url_credentials'],
  ['X-Amz-Signature (Codex bypass)',{isin:{locator:'https://h.example/f?X-Amz-Signature=abc'}},'url_credentials'],
  ['uuid',{figi:{x:'5f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'}},'uuid_value'],
  ['key= text',{figi:{note:'use key=abc'}},'secret_text'],
  ['token: text',{figi:{note:'token: abc'}},'secret_text'],
  ['password= text',{figi:{note:'password = abc'}},'secret_text'],
  ['string over 500',{figi:{x:'y'.repeat(501)}},'too_long'],
  ['depth over 4',{figi:{a:{b:{c:{d:1}}}}},'too_deep'],
 ];
 for(const [name,p,want] of cases)it(`rejects ${name}`,()=>{expect(code(p).startsWith(`${want}@`)).toBe(true);});
 it('accepts depth 4 and a 500 character string',()=>{
  expect(code({figi:{a:{b:{c:1}}}})).toBe('ok');
  expect(code({figi:{x:'y'.repeat(500)}})).toBe('ok');
 });
 it('validateClaimDetail turns each rejection into invalid_claim:provenance_written',async()=>{
  const {validateClaimDetail}=await import('./claims');
  for(const [name,p] of cases){
   const prov=(p as {isin?:unknown;figi?:unknown});
   const r=validateClaimDetail('set_identifier','isin',{schema:'claim/1',evidence_kind:'hard_identifier',target:{issuer_id:'i',ticker:'T',valid_from:'2020-01-01'},params:{},
    evidence:{source:'s',as_of:'2026-11-05',evidence_sha256:'a'.repeat(64)},sources:[],provenance_written:{isin:prov.isin??prov.figi}} as never);
   expect({name,r:r.ok?'ok':r.error.startsWith('invalid_claim:provenance_written')}).toEqual({name,r:true});
  }
 });
});

exec
/bin/zsh -lc 'for d in . src src/lib src/lib/entities ../../ ..; do for f in AGENTS.override.md AGENTS.md; do if [ -f "$d/$f" ]; then echo "$d/$f"; cat "$d/$f"; fi; done; done; cat package.json | head -60; git rev-parse HEAD; find . -name AGENTS.override.md -o -name AGENTS.md -not -path '"'./node_modules/*' -not -path './vendor/*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 41ms:
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-yLx5HlzR' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-c5c7XXSb' (errno=Operation not permitted)
fb4bc0a7ff28afb6a9f912205dee359ee087d98e

codex
The change strengthens userinfo detection and adds focused regression coverage without introducing an identifiable correctness regression. Runtime verification was limited by the read-only sandbox.
The change strengthens userinfo detection and adds focused regression coverage without introducing an identifiable correctness regression. Runtime verification was limited by the read-only sandbox.
