OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b015-ae4e-7680-8e46-6807008154dd
--------
user
commit f044fea
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline f044fea; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 243ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-XAt6qPFO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LBvdmfYc' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/5b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-96hbtCaO' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-cHEkG7kQ' (errno=Operation not permitted)
f044fea feat(entities): resolveIssuer asOf (today deprecated), window methods in securities, resolve route asOf with historical caching
 src/app/api/entities/resolve/route.test.ts | 40 ++++++++++++++++++++++--
 src/app/api/entities/resolve/route.ts      | 23 ++++++++------
 src/lib/entities/resolve.test.ts           | 15 +++++++++
 src/lib/entities/resolve.ts                | 50 ++++++++++++++++++++++--------
 4 files changed, 102 insertions(+), 26 deletions(-)

exec
/bin/zsh -lc "cat src/lib/entities/resolve.ts; cat src/lib/entities/types.ts; cat src/lib/db/table-client.ts; rg 'ResolvedSecurity|ResolvedIssuer|asOf' src/lib/entities src/app/api/entities -n; find .claude .cursor -maxdepth 2 -type f; ls /Users/osborn/.codex/*config*; rg -n '4.3.5|historical|asOf' docs/spec* docs/plans/*foundation* 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
// Read-side issuer resolution: exactly one of ticker / ISIN / CIK / LEI → canonical issuer with
// its securities. Zero identifiers → 'empty_query'; more than one → 'ambiguous_query' (callers
// must not rely on an implicit precedence between conflicting identifiers).
// Effective dates: validity windows are DATE-level and evaluated against a UTC calendar date
// (`asOf`, default = current UTC date; `today` is the deprecated synonym, spec 3 §4.3.5);
// exchange-local trading dates are out of scope. A security row is current at `asOf` iff
// valid_from <= asOf and (valid_to is null or valid_to > asOf). Each security carries its window
// methods (observation bounds vs evidenced dates, spec 3 §4.3.1) so callers can judge the ends.
// `date` columns arrive from PostgREST as 'YYYY-MM-DD' strings, so ISO strings compare
// lexicographically; the in-memory client used in tests must be fed the same string form.
// Merges: one merged_into hop is followed (result carries redirected_from); a merged target
// returns null rather than walking a chain, so cycles and stale chains surface as not-found.
// Provenance (source) and identifier claims are deliberately not part of the response.
import type {Row,TableClient} from '../db/table-client';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {isValidIsin,isValidLei,normalizeCik} from '../research/entity-keys/identifiers';
import type {ValidFromMethod,ValidToMethod} from './types';

export interface ResolveQuery{ticker?:string;isin?:string;cik?:string;lei?:string}
export interface ResolvedSecurity{ticker:string;isin:string|null;figi:string|null;share_class:string|null;is_primary:boolean;valid_from:string;valid_to:string|null;valid_from_method:ValidFromMethod|null;valid_to_method:ValidToMethod|null}
export interface ResolvedIssuer{
 issuer_id:string;status:string;redirected_from?:string;
 names:{zh:string|null;en:string|null};
 identifiers:{cik:string|null;lei:string|null;usci:string|null};
 securities:ResolvedSecurity[];
}
export interface ResolveOptions{
 includeExpired?:boolean;
 /** Evaluation date 'YYYY-MM-DD' (UTC calendar date); default = current UTC date. */
 asOf?:string;
 /** @deprecated use asOf (same meaning). Both given and different → invalid_as_of. */
 today?:string;
}
/** Cache-Control for a resolve evaluated at a past date (spec 3 §4.3.5). */
export const HISTORICAL_CACHE_CONTROL='public, max-age=600, s-maxage=3600';

const FROM_METHODS:readonly string[]=['first_observed','listing_date','ticker_change','curated'];
const TO_METHODS:readonly string[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];

const str=(v:unknown)=>typeof v==='string'?v:null;
const isCurrent=(r:Row,today:string)=>{const from=str(r.valid_from),to=str(r.valid_to);return from!==null&&from<=today&&(to===null||to>today);};
/** The one validity predicate (valid_from <= today && (valid_to is null || valid_to > today)); reused by the facts scope (plan 2 Task 14). */
export const isCurrentSecurity=isCurrent;
const toSecurity=(r:Row):ResolvedSecurity=>({
 ticker:String(r.ticker),isin:str(r.isin),figi:str(r.figi),share_class:str(r.share_class),is_primary:r.is_primary===true,valid_from:String(r.valid_from),valid_to:str(r.valid_to),
 valid_from_method:typeof r.valid_from_method==='string'&&FROM_METHODS.includes(r.valid_from_method)?r.valid_from_method as ValidFromMethod:null,
 valid_to_method:typeof r.valid_to_method==='string'&&TO_METHODS.includes(r.valid_to_method)?r.valid_to_method as ValidToMethod:null,
});

/** A real calendar date in the exact form 'YYYY-MM-DD' (2026-02-30 and ' 2026-11-05' are rejected). */
export function isCalendarDate(s:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const ms=Date.parse(`${s}T00:00:00Z`);
 return !Number.isNaN(ms)&&new Date(ms).toISOString().slice(0,10)===s;
}

/** asOf wins; today is its deprecated synonym (invalid_today kept for callers that still pass it). */
function resolveAsOf(opts:ResolveOptions):string{
 if(opts.asOf!==undefined&&opts.today!==undefined&&opts.asOf!==opts.today)throw new Error('invalid_as_of');
 if(opts.asOf!==undefined){if(!isCalendarDate(opts.asOf))throw new Error('invalid_as_of');return opts.asOf;}
 if(opts.today!==undefined){if(!isCalendarDate(opts.today))throw new Error('invalid_today');return opts.today;}
 return new Date().toISOString().slice(0,10);
}

/**
 * Ticker candidates in lookup order. The exact (trimmed, upper-cased, '/'→'.') form comes first:
 * the shared normalizer strips Wind suffixes (.A/.N/.O/...), which would turn BRK.A into BRK.
 * The normalized form is only a fallback when the exact form has NO rows at all: a ticker the
 * schema knows (even if only expired or future rows exist) is authoritative, so XYZ.A with only
 * expired rows resolves to null rather than to whoever holds XYZ today.
 */
function tickerCandidates(raw:string):string[]{
 const exact=raw.trim().toUpperCase().replace(/\//g,'.');
 const market=inferCoreMarket(raw);
 const normalized=(market&&normalizeSecurityTicker(raw,market))||exact;
 return normalized===exact?[exact]:[exact,normalized];
}

type Lookup={column:'lei'|'cik'|'isin';value:string}|{column:'ticker';values:string[]};

/** Requires exactly one non-blank identifier and validates it. */
function parseQuery(q:ResolveQuery):Lookup{
 const t=(v?:string)=>v?.trim()||undefined;
 const given=(['ticker','isin','cik','lei'] as const).filter(k=>t(q[k])!==undefined);
 if(given.length===0)throw new Error('empty_query');
 if(given.length>1)throw new Error('ambiguous_query');
 const key=given[0],raw=t(q[key])!;
 switch(key){
  case 'lei':{const v=raw.toUpperCase();if(!isValidLei(v))throw new Error('invalid_identifier:lei');return {column:'lei',value:v};}
  case 'isin':{const v=raw.toUpperCase();if(!isValidIsin(v))throw new Error('invalid_identifier:isin');return {column:'isin',value:v};}
  case 'cik':{try{return {column:'cik',value:normalizeCik(raw)};}catch{throw new Error('invalid_identifier:cik');}}
  case 'ticker':return {column:'ticker',values:tickerCandidates(raw)};
 }
}

/** The single issuer owning a current row among `rows`; null if none; 'ambiguous_owner' if several. */
function currentOwner(rows:Row[],today:string):string|null{
 const owners=new Set(rows.filter(r=>isCurrent(r,today)).map(r=>str(r.issuer_id)).filter((v):v is string=>v!==null));
 // Prevented by the schema for both lookups (issuer_securities_no_overlap per ticker,
 // issuer_securities_isin_no_overlap per ISIN); kept as defense against non-conforming data.
 if(owners.size>1)throw new Error('ambiguous_owner');
 return owners.values().next().value??null;
}

export async function resolveIssuer(client:TableClient,q:ResolveQuery,opts:ResolveOptions={}):Promise<ResolvedIssuer|null>{
 const lookup=parseQuery(q);
 const today=resolveAsOf(opts);
 let issuerId:string|null=null;
 if(lookup.column==='lei'||lookup.column==='cik'){
  issuerId=str((await client.select('issuers',{[lookup.column]:lookup.value},{limit:1}))[0]?.issuer_id);
 }else if(lookup.column==='ticker'){
  // Fall back to the next candidate only when this one has no rows at all (see tickerCandidates).
  for(const v of lookup.values){
   const rows=await client.select('issuer_securities',{ticker:v});
   if(rows.length===0)continue;
   issuerId=currentOwner(rows,today);
   break;
  }
 }else{
  issuerId=currentOwner(await client.select('issuer_securities',{isin:lookup.value}),today);
 }
 if(!issuerId)return null;
 let issuer=(await client.select('issuers',{issuer_id:issuerId},{limit:1}))[0];
 if(!issuer)return null;
 let redirectedFrom:string|undefined;
 if(issuer.status==='merged'){
  const target=str(issuer.merged_into);
  if(!target)return null;
  redirectedFrom=issuerId;
  issuer=(await client.select('issuers',{issuer_id:target},{limit:1}))[0];
  if(!issuer||issuer.status==='merged')return null;
 }
 const id=String(issuer.issuer_id);
 // Single page: PostgREST caps responses at 1000 rows, far above any one issuer's listings.
 const secs=await client.select('issuer_securities',{issuer_id:id},{orderBy:'valid_from'});
 return {
  issuer_id:id,status:String(issuer.status),...(redirectedFrom?{redirected_from:redirectedFrom}:{}),
  names:{zh:str(issuer.canonical_name_zh),en:str(issuer.canonical_name_en)},
  identifiers:{cik:str(issuer.cik),lei:str(issuer.lei),usci:str(issuer.usci)},
  securities:(opts.includeExpired?secs:secs.filter(r=>isCurrent(r,today))).map(toSecurity),
 };
}

/**
 * Cache-Control for a successful resolve. Validity windows flip at UTC date boundaries, so a
 * shared cache may hold a response at most until the next UTC midnight (clamped to [60, 3600]s);
 * stale-while-revalidate is kept short, so a pre-midnight answer can still be served after the
 * flip: worst case ≈ 11 minutes past midnight (the 60s floor plus the 600s revalidate window).
 */
export function successCacheControl(now:Date):string{
 const nextMidnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
 const secs=Math.min(3600,Math.max(60,Math.floor((nextMidnight-now.getTime())/1000)));
 return `public, s-maxage=${secs}, stale-while-revalidate=600`;
}
// src/lib/entities/types.ts
// Issuer master-data shapes (spec 2026-11-04 data foundation §3.1–3.2; spec 3 §3.1, §4.2.1; plan 3
// contract C2).
import type {ShareClass,ValidFromMethod,ValidToMethod} from '@/lib/supabase/database.types';
export type {ShareClass,ValidFromMethod,ValidToMethod} from '@/lib/supabase/database.types';
export type HardIdType='lei'|'cik'|'usci';
/** id_type values allowed by the issuer_identifier_claims check constraint. */
export type ClaimIdType=HardIdType|'isin'|'figi'|'cninfo_org_id'|'ticker';
export type ClaimOp='legacy'|'evidence_only'|'set_identifier'|'correct_identifier'|'attach_security'|'close_security'|'backdate_window';
/** Evidence class of a claim (facts vs judgments: a class, never a confidence number). */
export type EvidenceKind='hard_identifier'|'official_list'|'name_match'|'filing_form'|'provider_mapping';
export interface ClaimTarget{issuer_id:string;ticker?:string;valid_from?:string}
export interface ClaimEvidence{source:string;as_of:string;evidence_sha256:string;locator?:string;note?:string}
export interface ClaimDetail{schema:'claim/1';evidence_kind:EvidenceKind;target:ClaimTarget;params:Record<string,unknown>;evidence:ClaimEvidence;sources:ClaimEvidence[];provenance_written?:Record<string,unknown>}
export interface IssuerIdentifiers{lei?:string|null;cik?:string|null;usci?:string|null;cninfo_org_id?:string|null}
export interface IssuerInput extends IssuerIdentifiers{
 canonical_name_zh?:string|null;canonical_name_en?:string|null;country_code?:string|null;hkex_stock_code_primary?:string|null;
 provenance?:Record<string,unknown>;
}
export interface Issuer extends IssuerInput{issuer_id:string;status:'active'|'merged'|'dissolved';merged_into?:string|null}
/** What a writer carries so an ISIN contradiction can become a claim/1 claim (spec 3 §4.2.1). */
export interface SecurityClaimEvidence{kind:EvidenceKind;evidence:ClaimEvidence}
export interface IssuerSecurityInput{
 issuer_id:string;ticker:string;isin?:string|null;figi?:string|null;share_class:ShareClass;is_primary?:boolean;valid_from:string;valid_to?:string|null;
 /** default: source==='curated' ? 'curated' : 'first_observed' */
 valid_from_method?:ValidFromMethod;
 /** required when valid_to is set, absent/null otherwise */
 valid_to_method?:ValidToMethod|null;
 source:string;
 /** public: only PROVENANCE_KEYS (sanitizeProvenance) */
 provenance?:Record<string,unknown>;
 /** without it an ISIN contradiction is reported as 'conflict' but no claim is filed */
 claimEvidence?:SecurityClaimEvidence;
}
// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
// PostgREST caps every response (max_rows, default 1000), so select() returns at most one
// page. Reads that may exceed one page must use selectAll(), which pages in a fixed order.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
/** Inclusive lower (`gte`) and exclusive upper (`lt`) bounds per column. ISO timestamp strings compare as text, numbers numerically. */
export interface RangeOptions{gte?:Record<string,string|number>;lt?:Record<string,string|number>}
// offset requires orderBy: unordered pages are not stable across requests.
// limit is an integer 1..MAX_PAGE; offset a non-negative safe integer.
export interface SelectOptions extends RangeOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}

/** Largest page PostgREST returns by default; also the limit and selectAll page-size ceiling. */
export const MAX_PAGE=1000;

/** Table operation failure; `code` is the PostgreSQL SQLSTATE when known (e.g. '23505' unique violation). */
export class TableError extends Error{
 readonly details?:string;
 readonly hint?:string;
 constructor(readonly op:string,readonly table:string,message:string,readonly code:string|null=null,extra:{details?:string|null;hint?:string|null;cause?:unknown}={}){
  super(`${table} ${op}: ${message}`,extra.cause===undefined?undefined:{cause:extra.cause});
  this.name='TableError';
  if(extra.details)this.details=extra.details;
  if(extra.hint)this.hint=extra.hint;
 }
}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 /** Returns the number of rows the match hit. An empty match is rejected (no whole-table updates). */
 update(table:string,match:Row,patch:Row):Promise<number>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
 count(table:string,match:Row,opts?:RangeOptions):Promise<number>;
 /**
  * Calls a service-role SQL function and returns its result (plan 3: the row-locking jsonb patches
  * append_claim_evidence / patch_quarantine_detail / set_security_identifier of migration 20261107090000). Optional so the landed
  * test stubs stay valid; callers go through callRpc, which fails loudly when it is missing.
  */
 rpc?(fn:string,args:Row):Promise<unknown>;
}

/** Calls `fn` through client.rpc. A client without rpc is a wiring error (rpc_unavailable:<fn>), never a silent no-op. */
export async function callRpc(client:TableClient,fn:string,args:Row):Promise<unknown>{
 if(!client.rpc)throw new Error(`rpc_unavailable:${fn}`);
 return client.rpc(fn,args);
}

/** Rejects `undefined` match values: they would otherwise be dropped or match nothing silently. */
export function assertMatch(match:Row):void{
 if(!match||typeof match!=='object')throw new Error('undefined_match_value');
 for(const v of Object.values(match))if(v===undefined)throw new Error('undefined_match_value');
}

export function assertUpdateMatch(match:Row):void{
 assertMatch(match);
 if(Object.keys(match).length===0)throw new Error('empty_update_match');
}

const okBound=(v:unknown)=>typeof v==='string'||(typeof v==='number'&&Number.isFinite(v));
function checkRange(opts:RangeOptions):void{
 for(const r of [opts.gte,opts.lt]){
  if(r===undefined)continue;
  if(!r||typeof r!=='object'||Object.values(r).some(v=>!okBound(v)))throw new Error('invalid_select_options');
 }
}

export function checkSelectOptions(opts:SelectOptions):void{
 if(opts.limit!==undefined&&(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>MAX_PAGE))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&(!Number.isSafeInteger(opts.offset)||opts.offset<0))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');
 checkRange(opts);
}

export function checkRangeOptions(opts:RangeOptions):void{checkRange(opts);}

/**
 * Reads every matching row, paging by `offset` in `orderBy` order and stopping only on an empty
 * page, so a server max_rows below pageSize cannot truncate the result. `orderBy` must be a
 * unique column (ties make offset pages overlap or skip). Pages are separate requests, so the
 * result is not a snapshot: concurrent writes can be missed or seen twice.
 */
export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE)throw new Error(`selectAll pageSize must be 1..${MAX_PAGE}`);
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

// `.eq(k,null)` renders `k=eq.null`, which never matches in SQL; null must use `.is`.
const applyMatch=(q:any,match:Row)=>{for(const [k,v] of Object.entries(match))q=v===null?q.is(k,null):q.eq(k,v);return q;};
const applyRange=(q:any,opts:RangeOptions)=>{
 for(const [k,v] of Object.entries(opts.gte??{}))q=q.gte(k,v);
 for(const [k,v] of Object.entries(opts.lt??{}))q=q.lt(k,v);
 return q;
};

interface PgError{message:string;code?:string;details?:string|null;hint?:string|null}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type does describe the dq/issuer tables, but TableClient takes
 // table names as plain strings so the same callers run over the in-memory client too; the
 // loosely typed handle keeps that parity instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 const fail=(op:string,table:string,error:PgError):never=>{throw new TableError(op,table,error.message,error.code??null,{details:error.details,hint:error.hint,cause:error});};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)fail('insert',table,error);return data as Row;},
  // Exact count from Content-Range; no rows are returned. A missing count fails closed.
  async update(table,match,patch){
   assertUpdateMatch(match);
   const {count,error}=await applyMatch(db.from(table).update(patch,{count:'exact'}),match);
   if(error)fail('update',table,error);
   if(count===null||count===undefined)throw new Error('update_count_unavailable');
   return count as number;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let q=applyRange(applyMatch(db.from(table).select('*'),match),opts);
   if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});
   if(opts.limit!==undefined||opts.offset!==undefined){const from=opts.offset??0;q=q.range(from,from+(opts.limit??MAX_PAGE)-1);}
   const {data,error}=await q;if(error)fail('select',table,error);return (data??[]) as Row[];
  },
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)fail('upsert',table,error);},
  async count(table,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   const {count,error}=await applyRange(applyMatch(db.from(table).select('*',{count:'exact',head:true}),match),opts);
   if(error)fail('count',table,error);
   if(count===null||count===undefined)throw new Error('count_unavailable');
   return count as number;
  },
  async rpc(fn,args){
   const {data,error}=await (client as unknown as {rpc:(f:string,a:Row)=>PromiseLike<{data:unknown;error:PgError|null}>}).rpc(fn,args);
   if(error)fail('rpc',fn,error);
   return data;
  },
 };
}
src/app/api/entities/resolve/route.ts:11:// asOf, so either error would be a server bug and correctly surfaces as a 500.
src/app/api/entities/resolve/route.ts:17: // One clock for the whole request: the default asOf and the cache lifetime share it.
src/app/api/entities/resolve/route.ts:21: for(const k of [...KEYS,'includeExpired','asOf'])if(url.searchParams.getAll(k).length>1)return err('duplicate_parameter',`${k} given more than once`,400);
src/app/api/entities/resolve/route.ts:35: const asOfParam=url.searchParams.get('asOf');
src/app/api/entities/resolve/route.ts:36: if(asOfParam!==null&&(!isCalendarDate(asOfParam)||asOfParam>today))return err('invalid_parameter:asOf','asOf must be a YYYY-MM-DD calendar date not after today (UTC)',400);
src/app/api/entities/resolve/route.ts:37: const asOf=asOfParam??today;
src/app/api/entities/resolve/route.ts:40:  const result=await resolveIssuer(supabaseTableClient(getAnonSupabase()),q,{includeExpired:includeExpired==='1',asOf});
src/app/api/entities/resolve/route.ts:42:  // A past asOf answers for fixed windows (cache a fixed time). For today: if the UTC date flipped
src/app/api/entities/resolve/route.ts:44:  const cacheControl=asOf<today?HISTORICAL_CACHE_CONTROL:utcDate(new Date())!==today?'no-store':successCacheControl(now);
src/app/api/entities/resolve/route.test.ts:65:    expect(mocks.resolveIssuer).toHaveBeenCalledWith(expect.anything(), { ticker: 'brk/b' }, { includeExpired: true, asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
src/app/api/entities/resolve/route.test.ts:79:    expect(mocks.resolveIssuer).toHaveBeenCalledWith(expect.anything(), { ticker: 'AAPL' }, { includeExpired: false, asOf: '2026-11-05' });
src/app/api/entities/resolve/route.test.ts:93:    expect(mocks.resolveIssuer).toHaveBeenCalledWith(expect.anything(), { ticker: 'AAPL' }, { includeExpired: false, asOf: '2026-11-05' });
src/app/api/entities/resolve/route.test.ts:117:  it('passes a historical asOf through and caches it for a fixed window', async () => {
src/app/api/entities/resolve/route.test.ts:121:    const res = await get('?ticker=OLD&asOf=2026-11-01');
src/app/api/entities/resolve/route.test.ts:124:    expect(mocks.resolveIssuer).toHaveBeenCalledWith(expect.anything(), { ticker: 'OLD' }, { includeExpired: false, asOf: '2026-11-01' });
src/app/api/entities/resolve/route.test.ts:127:  it('treats asOf equal to today like no asOf (bounded cache until UTC midnight)', async () => {
src/app/api/entities/resolve/route.test.ts:131:    const res = await get('?ticker=AAPL&asOf=2026-11-05');
src/app/api/entities/resolve/route.test.ts:135:  it('400 invalid_parameter:asOf for malformed or future dates, 400 duplicate_parameter for two', async () => {
src/app/api/entities/resolve/route.test.ts:138:    await expectError(await get('?ticker=AAPL&asOf=2026-02-30'), 400, 'invalid_parameter:asOf');
src/app/api/entities/resolve/route.test.ts:139:    await expectError(await get('?ticker=AAPL&asOf=20261101'), 400, 'invalid_parameter:asOf');
src/app/api/entities/resolve/route.test.ts:140:    await expectError(await get('?ticker=AAPL&asOf=2026-11-06'), 400, 'invalid_parameter:asOf');
src/app/api/entities/resolve/route.test.ts:141:    await expectError(await get('?ticker=AAPL&asOf=2026-11-01&asOf=2026-11-02'), 400, 'duplicate_parameter');
src/lib/entities/issuers.ts:84: const evidence=claimEvidence({source:sourceOf(input.provenance,k),asOf:entryOf(input.provenance,k)?.as_of,record});
src/lib/entities/link-research.ts:85: * `universe` maps stocks_universe tickers to their market. `asOf` (YYYY-MM-DD of the run) dates
src/lib/entities/link-research.ts:88:export function planResearchLink(keys:EntityKeyRow[],securities:EntitySecurityRow[],universe:ReadonlyMap<string,string>,asOf:string):PlannedLink{
src/lib/entities/link-research.ts:99:  const origin={source:CURATED,as_of:asOf};
src/lib/entities/link-research.ts:115:  const origin:CuratedOrigin={source:CURATED,as_of:asOf};
src/lib/entities/link-research.ts:121:   claimEvidence:{kind:'provider_mapping',evidence:claimEvidence({source:CURATED,asOf,record,note:'curated research security'})}});
src/lib/entities/resolve.ts:5:// (`asOf`, default = current UTC date; `today` is the deprecated synonym, spec 3 §4.3.5);
src/lib/entities/resolve.ts:6:// exchange-local trading dates are out of scope. A security row is current at `asOf` iff
src/lib/entities/resolve.ts:7:// valid_from <= asOf and (valid_to is null or valid_to > asOf). Each security carries its window
src/lib/entities/resolve.ts:20:export interface ResolvedSecurity{ticker:string;isin:string|null;figi:string|null;share_class:string|null;is_primary:boolean;valid_from:string;valid_to:string|null;valid_from_method:ValidFromMethod|null;valid_to_method:ValidToMethod|null}
src/lib/entities/resolve.ts:21:export interface ResolvedIssuer{
src/lib/entities/resolve.ts:25: securities:ResolvedSecurity[];
src/lib/entities/resolve.ts:30: asOf?:string;
src/lib/entities/resolve.ts:31: /** @deprecated use asOf (same meaning). Both given and different → invalid_as_of. */
src/lib/entities/resolve.ts:44:const toSecurity=(r:Row):ResolvedSecurity=>({
src/lib/entities/resolve.ts:57:/** asOf wins; today is its deprecated synonym (invalid_today kept for callers that still pass it). */
src/lib/entities/resolve.ts:59: if(opts.asOf!==undefined&&opts.today!==undefined&&opts.asOf!==opts.today)throw new Error('invalid_as_of');
src/lib/entities/resolve.ts:60: if(opts.asOf!==undefined){if(!isCalendarDate(opts.asOf))throw new Error('invalid_as_of');return opts.asOf;}
src/lib/entities/resolve.ts:105:export async function resolveIssuer(client:TableClient,q:ResolveQuery,opts:ResolveOptions={}):Promise<ResolvedIssuer|null>{
src/lib/entities/claims.test.ts:93:  const a=claimEvidence({source:'sec',asOf:'2026-11-04T12:00:00Z',record:{cik:'320193',lei:'HWUPKR0MPOU8FGXBT394'}});
src/lib/entities/claims.test.ts:94:  expect(a).toEqual(claimEvidence({source:'sec',asOf:'2026-11-04',record:{lei:'HWUPKR0MPOU8FGXBT394',cik:'320193'}}));
src/lib/entities/claims.test.ts:96:  expect(claimEvidence({source:'x',asOf:'garbage',record:{}}).as_of).toBe('2026-11-05');
src/lib/entities/identifiers/plan.ts:22: asOf:string;stages:ReadonlySet<Stage>;
src/lib/entities/identifiers/plan.ts:58: const {asOf,stages}=input;
src/lib/entities/identifiers/plan.ts:78: const openfigiEvidence=(r:OkResult):ClaimEvidence=>({source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`});
src/lib/entities/identifiers/plan.ts:82:  prov:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,job:jobOf(r.job),level:g.level},
src/lib/entities/identifiers/plan.ts:120:    const evidence:ClaimEvidence={source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator};
src/lib/entities/identifiers/plan.ts:121:    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,sources:[evidence,openfigiEvidence(r)],prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
src/lib/entities/identifiers/plan.ts:135:      params:{share_class:'unknown',valid_from:asOf,valid_from_method:'first_observed',source:'gleif_openfigi',isin},
src/lib/entities/identifiers/plan.ts:138:     if(owner!==undefined)out.quarantines.push({naturalKey:`${c.ticker}:${asOf}`,reasonCode:'ownership_conflict',
src/lib/entities/identifiers/plan.ts:154:   const evidence:ClaimEvidence={source,as_of:asOf,evidence_sha256:hk.sha256,locator};
src/lib/entities/identifiers/plan.ts:156:   const hkProposal:Proposal={value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator},after:[]};
src/lib/entities/windows.ts:54:export function planWindowBackfill(rows:readonly WindowRow[],universe:ReadonlyMap<string,UniverseDates>,asOf:string):WindowPlan{
src/lib/entities/windows.ts:69:   const provenance=sanitizeProvenance({valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}});
src/lib/entities/windows.ts:76:   else plan.changes.push({kind:'to',row:last,validFrom:vf,newValidTo:u.delist_date,provenance:sanitizeProvenance({valid_to:{source:'stocks_universe.delist_date',provider:u.source,as_of:asOf,row:{delist_date:u.delist_date,source:u.source,source_updated_at:u.source_updated_at}}})});
src/lib/entities/identifiers/plan.test.ts:16: asOf:ASOF,stages:new Set(['A','B']),issuers:[{issuer_id:I1,lei:LEI1,usci:null}],openRows:[row({})],
src/lib/entities/cninfo-org-id.ts:19:export interface CninfoDeps{tables:TableClient;raw:RawStore;lookup:(code:string)=>Promise<CninfoLookup>;asOf:string;sleep?:(ms:number)=>Promise<void>;intervalMs?:number}
src/lib/entities/cninfo-org-id.ts:63:   const evidence:ClaimEvidence={source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:sha,locator:`topSearch:keyWord=${t.code}`};
src/lib/entities/cninfo-org-id.ts:72:   const outcome=await callRpc(tables,'set_issuer_identifier',{p_issuer:t.issuer_id,p_column:'cninfo_org_id',p_value:orgId,p_provenance:{source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:sha}}) as string;
src/lib/entities/load-sec.test.ts:44:  expect(plan.asOf).toBe(AS_OF);
src/lib/entities/load-sec.test.ts:85:  const first=await applySecLoad(c,plan,{asOf:AS_OF,batchId:BATCH,batchProducerMeta:meta()});
src/lib/entities/load-sec.test.ts:88:  const second=await applySecLoad(c,plan,{asOf:AS_OF,batchId:BATCH,batchProducerMeta:meta()});
src/lib/entities/load-sec.test.ts:99:  const res=await applySecLoad(c,plan,{asOf:AS_OF,batchId:BATCH,batchProducerMeta:{sourceRows:5,rejected:[{index:4,reason:'invalid_cik'}]}});
src/lib/entities/load-sec.test.ts:112:  await applySecLoad(c,plan,{asOf:AS_OF,batchId:BATCH,batchProducerMeta:{sourceRows:5,rejected:[]}});
src/lib/entities/load-sec.test.ts:119:  const res=await applySecLoad(c,planSecLoad(rows,new Set(['AAPL','GOOG','GOOGL']),AS_OF),{asOf:AS_OF,batchId:BATCH,batchProducerMeta:meta()});
src/lib/entities/load-sec.test.ts:131:  const res=await applySecLoad(c,planSecLoad(rows.slice(0,1),new Set(['AAPL']),AS_OF),{asOf:AS_OF,batchId:BATCH,batchProducerMeta:{sourceRows:100,rejected}});
src/lib/entities/load-sec.test.ts:146:  const res=await applySecLoad(c,planSecLoad(rows.slice(0,1),new Set(['AAPL']),AS_OF),{asOf:AS_OF,batchId:BATCH,batchProducerMeta:meta(1)});
src/lib/entities/load-sec.test.ts:155:  await applySecLoad(c,planSecLoad(rows.slice(0,1),new Set(['AAPL']),AS_OF),{asOf:AS_OF,batchId:BATCH,batchProducerMeta:meta(1)});
src/lib/entities/load-sec.test.ts:160:  const res=await applySecLoad(memoryTableClient(),planSecLoad(rows,new Set(),AS_OF),{asOf:AS_OF,batchId:BATCH,batchProducerMeta:meta()});
src/lib/entities/load-sec.test.ts:168:  await expect(applySecLoad(memoryTableClient(),planSecLoad(rows,new Set(['AAPL']),AS_OF),{asOf:'2026-11-06',batchId:BATCH,batchProducerMeta:meta()})).rejects.toThrow('as_of_mismatch');
src/lib/entities/identifiers/apply.test.ts:25: asOf:ASOF,stages:new Set(['A','B']),issuers:[{issuer_id:I1,lei:LEI1,usci:null}],
src/lib/entities/cninfo-org-id.test.ts:31:  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:null,bytes:bytes('[]')},'000001':new CninfoLookupError('cninfo 503',bytes('<html>busy</html>')) })},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
src/lib/entities/cninfo-org-id.test.ts:40:  await fillCninfoOrgIds({tables:c,raw:memoryRawStore(),asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'x'},bytes:bytes('[]')},'000001':{hit:null,bytes:bytes('[]')}})},targets,{batchId:'33333333-3333-4333-8333-333333333333'});
src/lib/entities/cninfo-org-id.test.ts:49:  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'贵州茅台'},bytes:bytes('[{"code":"600519","orgId":"gssh0600519"}]')},'000001':{hit:null,bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
src/lib/entities/cninfo-org-id.test.ts:63:  const res=await fillCninfoOrgIds({tables:c,raw:memoryRawStore(),asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':new Error('cninfo 503'),'000001':{hit:{orgId:'gssz0000001',name:'平安银行'},bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
src/lib/entities/cninfo-org-id.test.ts:72:  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'x'},bytes:bytes('[]')},'000001':{hit:null,bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:null});
src/lib/entities/claims.ts:133:export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
src/lib/entities/claims.ts:134: const day=typeof input.asOf==='string'?input.asOf.slice(0,10):'';
src/lib/entities/load-sec.ts:23:export interface SecLoadPlan{asOf:string;issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:string[]}
src/lib/entities/load-sec.ts:41:export function planSecLoad(rows:SecExchangeRow[],universe:ReadonlySet<string>,asOf:string):SecLoadPlan{
src/lib/entities/load-sec.ts:43: const prov=():FieldProvenance=>({source:SEC_SOURCE,as_of:asOf});
src/lib/entities/load-sec.ts:53:  securities.push({cik:r.cik,ticker,share_class:'unknown',is_primary:first,valid_from:asOf,source:SEC_SOURCE,provenance:{valid_from:{source:SEC_SOURCE,as_of:asOf,row:{exchange:r.exchange}}}});
src/lib/entities/load-sec.ts:55: return {asOf,issuers:[...issuers.values()],securities,skipped};
src/lib/entities/load-sec.ts:109:export interface SecApplyOptions{asOf:string;batchId:string;batchProducerMeta:{sourceRows:number;rejected:SecExchangeParse['rejected']}}
src/lib/entities/load-sec.ts:119: if(plan.asOf!==opts.asOf)throw new Error('as_of_mismatch');
src/lib/entities/resolve.test.ts:104: it('accepts asOf as the evaluation date; today is a deprecated synonym',async()=>{
src/lib/entities/resolve.test.ts:106:  expect((await resolveIssuer(c,{ticker:'AAPL.FUT'},{asOf:'2030-06-01'}))?.issuer_id).toBe('a');
src/lib/entities/resolve.test.ts:107:  expect((await resolveIssuer(c,{ticker:'AAPL.OLD'},{asOf:'1995-01-01'}))?.issuer_id).toBe('a');
src/lib/entities/resolve.test.ts:108:  expect((await resolveIssuer(c,{ticker:'AAPL.OLD'},{asOf:'1995-01-01',today:'1995-01-01'}))?.issuer_id).toBe('a');
src/lib/entities/resolve.test.ts:109:  await expect(resolveIssuer(c,{ticker:'AAPL'},{asOf:'2026-11-05',today:'2026-11-04'})).rejects.toThrow('invalid_as_of');
src/lib/entities/resolve.test.ts:110:  for(const asOf of ['2026-02-30','20261105',' 2026-11-05'])await expect(resolveIssuer(c,{ticker:'AAPL'},{asOf})).rejects.toThrow('invalid_as_of');
src/lib/entities/resolve.test.ts:115:  const out=await resolveIssuer(c,{ticker:'AAPL'},{asOf:TODAY,includeExpired:true});
.claude/agents/john-cameron.md
.claude/scratch/insp3.ts
.claude/scratch/codex-prompt-1b.txt
.claude/scratch/REVIEW-SPEC.md
.claude/scratch/insp2.ts
.claude/scratch/codex-prompt-1a.txt
.claude/scratch/REVIEW-QUALITY.md
.claude/scratch/codex-task.sh
.claude/scratch/task-ranges.txt
.claude/scratch/codex-prompt-4b.txt
.claude/scratch/codex-prompt-4a.txt
.claude/scratch/codex-prompt-5a.txt
.claude/scratch/codex-prompt-5b.txt
.claude/scratch/insp.ts
.claude/scratch/codex-2b-fix.txt
.claude/scratch/codex-prompt-2a.txt
.claude/scratch/p1.txt
.claude/scratch/codex-prompt-2b.txt
.claude/scratch/codex-prompt-3b.txt
.claude/scratch/db-one.ts
.claude/scratch/insp4.ts
.claude/scratch/codex-prompt-3a.txt
.claude/scratch/IMPLEMENTER.md
.claude/launch.json
/Users/osborn/.codex/config.toml
zsh:1: no matches found: docs/spec*

exec
/bin/zsh -lc "sed -n '1,65p' src/app/api/entities/resolve/route.test.ts; rg -n '4.3.5|asOf|historical' docs/superpowers/specs/*foundation*; rg -n 'ResolvedSecurity|ResolvedIssuer' src --glob '"'!resolve.ts'"'; rg -n 'ValidFromMethod|ValidToMethod' src/lib/supabase/database.types.ts; cat vitest.config.*; rg -n 'project_doc' /Users/osborn/.codex/config.toml; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*' " in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveIssuer: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/anon', () => ({ getAnonSupabase: () => ({ from: mocks.from }) }));
vi.mock('@/lib/entities/resolve', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/entities/resolve')>();
  return { ...original, resolveIssuer: mocks.resolveIssuer };
});

import { GET } from './route';

const get = (qs: string) => GET(new Request(`http://localhost/api/entities/resolve${qs}`));
async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  expect((await res.json()).error.code).toBe(code);
}

describe('GET /api/entities/resolve', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('400 empty_query with no-store', async () => {
    await expectError(await get(''), 400, 'empty_query');
    await expectError(await get('?ticker='), 400, 'empty_query');
    expect(mocks.resolveIssuer).not.toHaveBeenCalled();
  });

  it('400 invalid_identifier for unsafe characters instead of dropping the param', async () => {
    await expectError(await get('?cik=%21'), 400, 'invalid_identifier:cik');
    await expectError(await get('?ticker=AAPL%20X'), 400, 'invalid_identifier:ticker');
    expect(mocks.resolveIssuer).not.toHaveBeenCalled();
  });

  it('400 duplicate_parameter', async () => {
    await expectError(await get('?ticker=AAPL&ticker=MSFT'), 400, 'duplicate_parameter');
  });

  it('400 ambiguous_query for more than one identifier', async () => {
    await expectError(await get('?ticker=AAPL&cik=320193'), 400, 'ambiguous_query');
    expect(mocks.resolveIssuer).not.toHaveBeenCalled();
  });

  it('400 when includeExpired is anything but 1', async () => {
    await expectError(await get('?ticker=AAPL&includeExpired=2'), 400, 'invalid_parameter');
    await expectError(await get('?ticker=AAPL&includeExpired=1&includeExpired=1'), 400, 'duplicate_parameter');
  });

  it('404 with no-store when the resolver returns null', async () => {
    mocks.resolveIssuer.mockResolvedValue(null);
    await expectError(await get('?ticker=ZZZZ'), 404, 'not_found');
  });

  it('200 with bounded shared caching and passes includeExpired and slash tickers through', async () => {
    mocks.resolveIssuer.mockResolvedValue({ issuer_id: 'a' });
    const res = await get('?ticker=brk%2Fb&includeExpired=1');
    expect(res.status).toBe(200);
    const cc = res.headers.get('Cache-Control') ?? '';
    expect(cc).toContain('s-maxage=');
    expect(cc).toContain('stale-while-revalidate=600');
    expect(await res.json()).toEqual({ issuer_id: 'a' });
    expect(mocks.resolveIssuer).toHaveBeenCalledWith(expect.anything(), { ticker: 'brk/b' }, { includeExpired: true, asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:15:2. **有证据的持有区间。** `issuer_securities.valid_from/valid_to` 可从"首次观测日"升级为"有证据的上市/退市/换码日"，每一行记录证据方法与所用源行值；没有证据的保持 `first_observed`。`resolveIssuer` 接受 `asOf`。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:26:| E3 | 换码夹具（§4.3.4）三个 `asOf` 的解析结果与夹具一致 | `load-sec.test.ts` |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:55:| 解析 | `resolveIssuer(client, q, {includeExpired, today})` | `asOf` 作为正式参数名 |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:359:- 换码夹具：T0（CIK X 持 OLD）、T1（X 持 NEW，OLD 消失，`as_of=T0+1d`）、T2（仍无 OLD，`as_of=T0+8d`，不同 sha256，submissions 夹具 `tickers=['NEW']`）。断言：`resolveIssuer({ticker:'OLD'},{asOf:T0})` = X；T1 后 T2 前 `{asOf:T1}` = X；T2 后 `{asOf:T1}` = null、`{asOf:T0}` = X；OLD 行 `valid_to_method='sec_file_absent'`、NEW 行仍 `first_observed`、存在一条 `evidence_only` claim；缺少 submissions 确认时不关闭。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:361:#### 4.3.5 `resolveIssuer` 的 `asOf`
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:363:`ResolveOptions{includeExpired?, asOf?, today?}` 同义；都给且不等 → `invalid_as_of`；`today` 标 `@deprecated`。`ResolvedSecurity` 加 `valid_from_method/valid_to_method`。`GET /api/entities/resolve?ticker=…&asOf=`：`asOf` ≤ 今天否则 400；历史 `asOf` 缓存 `public, max-age=600, s-maxage=3600`。规格二读接口加 `tickerAsOf`（有则按其解析，无则今天）；响应 `resolution:{tickerAsOf, issuerId, validFromMethod}`。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:372:- 读接口：`issuerId`=T，`lineage`，`conflicts`，每行 `recordedIssuerId`。**`/metrics` 无 `asOf`（T8 规定修法，保留落地的前后两次读取守卫）**：读指标前后各读一次谱系成员与 `stateRevs(lineage)`；两次的成员与 rev 向量必须相同，且每个返回行的 `based_on_lineage` 等于该向量；任何不一致或读取不稳定 → `metrics:[]`、`stale:true`，沿用落地的 stale 缓存策略（`STALE_CACHE_CONTROL`）；不内联重算（由上述操作路径重算）。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:382:- 路由：读项与候选 → 由候选 `filingRef` 经新增的 `FactsDb.findFilingBySourceRef(source, sourceRef)`（`source` 由项市场决定）定位 filing，取其 `issuer_id/market`（不信任 payload）→ `readFacts(issuer, market, {concepts: 该组, asOf: 今天, includeNonOk:false})` 得 `stateRev` 与该组当前代 `ok` 行 → TS 评估规格二 §7 规则（候选 ∪ ok 行）；失败 → 400 `rule_failed`，不写库 → 新建批次（`producer='dq-resolver'`，`dataset = 项.dataset`）→ `adoptCandidate(item, n, batch, stateRev, resolvedBy)`：`stale_evaluation` → 重读重评一次再调用，仍过期 → 409；`batch_mismatch` 为编程错误 → 500；`replay_required`/`filing_not_found` → 409；其余码按 §8。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:519:| `GET /api/entities/resolve` | `asOf`；`securities[]` 加两方法字段 |
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:600:- `resolve.test.ts`：`asOf/today`；新字段。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:607:- `datasets.test.ts`；`facts-resolver.test.ts`（`resolveFactsItem` 分派穷举：采用、恢复、谱系、`reconcile_review` 只改状态、落地路径；拒绝通用翻转；`rule_failed`、`stale_evaluation` 重试、恢复禁用、`keep_fact_id`；三类新裁决的缺失/pending/failed 钩子恢复与 502 语义，T10）；`materialize.test.ts`（`--pending-hooks` 覆盖采用、恢复、谱系、对账隔离四类）；`metrics` 路由测试（谱系向量前后不一致 → `metrics:[]`、`stale:true`，T8）；路由测试（`asOf/tickerAsOf`、admin dq 新字段与 `market`、claims 顺序与 `amend`、quarantine 新字段）；`messages/parity.test.ts`。
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md:633:| F3-2 持有区间与 `asOf` | `backfill-windows.ts`、`sec-submissions.ts`、`load-sec` 换码、`resolveIssuer(asOf)`、路由 | F3-0 | E2、E3；回填回执 | 3 |
docs/superpowers/specs/2026-11-04-data-foundation-design.md:15:2. **财务数字成为时点事实。** `financial_facts` 存"当时披露的值"，每个值带 `available_at`、来源文件、原始字段名、版本序号；重述不覆盖，只追加。任何历史时点 `asOf` 都能回放当时可见的报表。
docs/superpowers/specs/2026-11-04-data-foundation-design.md:19:成功标准：对 S&P 500 + nasdaq_top500 + us_china 三个宇宙的美股和 `in_scope` A 股队列，能用 `asOf=2024-06-30` 回放出当时可见的最近四期合并报表；回放结果与保存的快照逐字段一致；与 10 家公司的原文抽样对账差异 ≤ 0.5%。
docs/superpowers/specs/2026-11-04-data-foundation-design.md:197:-- 在 asOf 时刻可见的、某概念某期的最新值
docs/superpowers/specs/2026-11-04-data-foundation-design.md:201:where issuer_id = $1 and status = 'ok' and available_at <= $asOf
docs/superpowers/specs/2026-11-04-data-foundation-design.md:205:封装为 `src/lib/facts/read.ts::getFactsAsOf(issuerId, {concepts, from, to, asOf})`。没有 `asOf` 时取最新。
docs/superpowers/specs/2026-11-04-data-foundation-design.md:233:| revenue_yoy / net_income_yoy | 同期对比，用同一 `asOf` 可见值 | |
docs/superpowers/specs/2026-11-04-data-foundation-design.md:247:| `GET /api/facts/[ticker]?concepts=revenue,net_income&from=2016-01-01&asOf=2024-06-30&freq=annual\|quarterly` | `{issuerId, facts[], provenance: {filings[]}, asOf, mappingVersion}` | 公共只读；concepts 白名单；最多 40 期 |
docs/superpowers/specs/2026-11-04-data-foundation-design.md:248:| `GET /api/facts/[ticker]/metrics?metrics=gross_margin,roe&asOf=` | `{metrics[], formulaVersion, inputs}` | 同上 |
docs/superpowers/specs/2026-11-04-data-foundation-design.md:339:- 单元（vitest，`.ts`）：概念映射与回退顺序；companyfacts 解析（固定一份真实 JSON 夹具，如 AAPL CIK0000320193 截取）；Tushare 行解析（含 `update_flag` 重述）；`vintage_seq` 与 `supersedes` 计算；`getFactsAsOf` 的时点语义（asOf 早于重述 → 旧值）；单季差分可逆；恒等式规则；FIGI 映射解析。
docs/superpowers/specs/2026-11-04-data-foundation-design.md:355:| WP-F2a 美股事实 | companyfacts 适配、facts/filings 表、桶、读接口、cron | sp500 最近 8 期四表回填；asOf 回放测试通过 |
docs/superpowers/specs/2026-11-04-data-foundation-design.md:361:1. `asOf=2024-06-30` 查 AAPL revenue FY2023 → 返回 10-K 2023-11-03 披露值，而非后续 10-K 2024 的重述值。
docs/superpowers/specs/2026-11-04-data-foundation-design.md:362:2. 一家 A 股 2023 年报重述（update_flag=1）：两条 fact 并存，`vintage_seq` 1/2，`supersedes` 正确；`asOf` 早于重述日取 1。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:15:1. **披露日志。** `financial_facts` 记录"哪份文件、在哪个可得日期、对哪个概念的哪个期间、用哪个单位、披露了什么值"。同一期间被多份文件重复披露就有多行；值变了就是修订。任意 `asOf`（日期）都能回放当时可见的最新披露。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:18:4. **公共只读接口。** 事实、派生、披露文件三个读接口按 ticker 查询（ticker 按**今天**的归属解析为发行人，`asOf` 只作用于事实），读取通过一个 SQL 函数在单一快照内完成。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:21:- sp500 / nasdaq_top500 / us_china 三个宇宙内每个有 CIK 且 companyfacts 可得的发行人，最近 8 个财期的 §3 概念已入库（companyfacts 里没有的概念保持缺失，不计失败）；`GET /api/facts/AAPL?concepts=revenue&asOf=2024-06-30` 返回 period_end 2023-09-30 revenue 的 2023-11-03 10-K 披露行，而不是 FY2024 10-K 中的同期行。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:22:- A 股（范围见 §6.4）10 年三表已入库；一家 `report_type=5`（调整前）与 `report_type=1`（最新）同期不同值且公告日不同的公司，两行并存，`asOf` 早于更正公告日取调整前值；其年报 filing 带巨潮公告 id 与 PDF 链接。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:290:  readFacts(issuer, market, opts: {concepts, asOf, from?, to?, history?, limit?, includeNonOk?}): Promise<{stateRev, rows, truncated}>;   // rpc read_facts（信封）
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:309:`available_date` 是**日期**：EDGAR `filed`；Tushare `f_ann_date ?? ann_date`；都缺 → 隔离 `missing_available_date`。`asOf` 为 `YYYY-MM-DD`，可见 ⇔ `available_date <= asOf`。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:315:2. `status='ok' and available_date <= asOf` 的行按 `(available_date, created_at, fact_id)` 升序成序列。同一 `available_date` 下不同值不会同时为 `ok`（§5.3 冲突规则保证，且与到达顺序无关）。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:357:5. `readFacts(issuer, market, {concepts: all, asOf: 今天, history: true, includeNonOk: true})`（`truncated` → `read_truncated`，废弃运行）+ `openConflicts` → `planFactWrites`（§5.3，纯函数：输出新行、隔离集、冲突处置、并入项）。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:427:`FORMULA_VERSION='facts-derive/1.0'`。输入 = `readFacts(issuer, market, {concepts: 所需全部, asOf, history: true})`；按 market 选公式与 `basis`；纯函数；输出含 `input_unit`、`basis`、扁平 `inputs`。缺输入、单位不一致、分母为 0、期间匹配不唯一 → 不产出。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:431:**版本一致性（审计 N14，第 5 稿收紧）**：差分 `A − B`（如 `9M − 6M`）只在两个操作数属于同一报表版本集时产出：(a) `A` 与 `B` 的当前披露来自**同一 filing**；或 (b) `A` 与 `B` 在 `asOf` 下的披露序列都**从未修订**（序列内没有值变化，`is_revision` 全为 false）。其余情形（例如 9M 已修订而 6M 未修订且无同 filing 的 6M 披露）不产出。`inputs` 列出两者与所依据的规则（`a` / `b`）。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:450:共同约定：公共只读（anon 客户端，`read_facts` 以 `security invoker` 受 RLS 约束）；`force-dynamic`；参数重复 → 400；ticker 同正则；`resolveIssuer({ticker},{today})` → 无 → 404 `unknown_ticker`；`market` 由 ticker 后缀决定（`.SH/.SZ/.BJ` → CN，否则 US）；`asOf` 为 `YYYY-MM-DD` 且 ≤ 今天；错误与空结果 `no-store`；成功：有 `asOf` 且早于今天 → `public, max-age=600, s-maxage=3600`（容忍度），否则 `successCacheControl(now)`。响应顶层 `mappingGen` = 当前代；每行带自己的 `mappingGen`；`truncated` 透传。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:454:| `GET /api/facts/[ticker]` | `concepts`（必填，白名单）或 `factIds`（≤ 100，证据查询，不限代、只限 `ok`）、`from`/`to`、`asOf`、`durations`、`history=1`、`limit`（K 数，默认 200、最大 1000） | `{issuerId, ticker, market, asOf, mappingGen, truncated, facts:[{factId, concept, sourceConcept, statement, periodStart, periodEnd, duration, value: value_text, unit, availableDate, filingId, disclosureSeq, isCurrent, isRevision, mappingGen, rawHash}], filings:[{filingId, formType, periodEnd, availableDate, sourceRef, url, documentRef, documentUrl, citation}]}` |
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:455:| `GET /api/facts/[ticker]/metrics` | `metrics`、`from`/`to`、`asOf`、`limit` | `{…, formulaVersion, metrics:[{metric, periodStart, periodEnd, duration, value, unit, inputUnit, basis, inputs, basedOnRev}]}`；无 `asOf` 读表（过滤当前 `formula_version`），有则实时 derive |
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:498:`sync-us.integration.test.ts`：美股夹具两遍（第二遍全 duplicates）；更晚 filing 修订夹具 → `versioned=1`、`asOf` 两侧回放；映射升级（`MAPPING_GEN+1`）重跑后旧代行不可见、`factIds` 仍可查；并发两个 `runFactsSync` 争同一发行人（pg 实现）；`materialize` 两次一致、过期计算被拒；美股黄金断言。`sync-cn.integration.test.ts`：只在 A 股夹具录入后创建；同上 + 修订对 + 同日冲突 + 巨潮挂接 + A 股黄金断言。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:526:1. `asOf=2024-06-30` 的 AAPL revenue → 2023-11-03 行 `disclosureSeq=1`；`asOf=2025-06-30` → `disclosureSeq=2`、`isRevision=false`。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:527:2. A 股修订对：`asOf` 早于更正日取调整前值；年报 `citation='linked'`。
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:617:| 2026-11-04 | §9 `/api/facts/{ticker}` | (a) `factIds` 证据模式下 `disclosureSeq / isCurrent / isRevision` 为 `null`（不伪造序列字段），且限本发行人本市场、已发布 filing 的 `ok` 行，不施加 `asOf`；(b) `durations` 过滤发生在**自然键限额之前**；(c) 返回的 filings 仅为被返回事实引用的**已发布**（`mapping_gen>0`）filing | Codex 挑战 Task 16：伪造 `isCurrent`、期限过滤晚于键限额、未发布 filing 公开 | `src/app/api/facts/[ticker]/route.ts`、`public-route.ts`；接受 |
docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:619:| 2026-11-04 | §9 `/api/facts/{ticker}/metrics` | 响应多一个 `stale` 字段；新鲜物化指标 `Cache-Control: s-maxage=60`，stale `s-maxage=30`；带 `asOf` 时即时派生，`truncated` 时无行 | 见 16.1 `based_on_rev` 守卫；短缓存避免裁决后长期陈旧 | `metrics/route.ts`、`public-route.ts`（`FRESH_METRICS_CACHE_CONTROL`、`STALE_CACHE_CONTROL`）；接受 |
723:  valid_from_method: ValidFromMethod;
724:  valid_to_method: ValidToMethod | null;
770:export type ValidFromMethod = 'first_observed' | 'listing_date' | 'ticker_change' | 'curated';
771:export type ValidToMethod = 'delisting' | 'ticker_change' | 'sec_file_absent' | 'curated' | 'merge_close' | 'unrecorded';
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

codex
The changes preserve existing resolution behavior while adding validated asOf support, historical caching, and security-window metadata consistently with the specification. No actionable regressions were identified; tests were inspected but not executed.
The changes preserve existing resolution behavior while adding validated asOf support, historical caching, and security-window metadata consistently with the specification. No actionable regressions were identified; tests were inspected but not executed.
