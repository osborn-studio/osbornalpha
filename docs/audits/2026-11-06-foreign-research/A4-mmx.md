<audit_target>
Task A4 implementation against the supplied Task A4 plan and the broker-research specification.
</audit_target>

<findings>
1. **P1 — The canonical JSON “UTF-16 code-unit sort” does not match the implementation.**

   **Evidence**

   The plan requires:

   > “sorts keys by UTF-16 code unit”

   and explicitly gives:

   > `expect(canonicalJson({B:1,a:1,_:1})).toBe('{"B":"1","_":"1","a":"1"}');`

   The implementation uses:

   ```ts
   Object.keys(o).filter(k => o[k] !== undefined)
     .sort()
     .map(k => JSON.stringify(k) + ':' + canonicalJson(o[k]))
   ```

   JavaScript’s default string sort is UTF-16 code-unit order, so the test above happens to pass. However, the implementation does not explicitly implement the stated contract and the test does not exercise a case where UTF-16 ordering differs from UTF-8/Unicode-code-point ordering.

   More importantly, the plan’s required canonical representation says every number is a decimal string, but the implementation preserves `Date` objects as ISO strings and `bigint` values as strings without enforcing a single documented normalization policy for those values.

   **Impact**

   The function is used for `behavior_digest`, disclosure input hashes, and memory-database stand-ins. A future change to sort semantics or number/date serialization can silently change hashes while the current tests remain green. The implementation is not a literal implementation of the plan’s canonicalization contract.

   **Prescriptive fix**

   Make the canonicalization contract explicit and implement it directly:

   - document supported scalar types;
   - sort keys with an explicit UTF-16 comparator;
   - define one representation for `Date` and `bigint`;
   - add a regression test using a key/value pair that distinguishes UTF-16 code-unit ordering from code-point ordering;
   - add tests for all supported scalar types and object/array undefined behavior.

2. **P1 — `supabaseBrokerResearchDb.publicReports()` uses the wrong PostgREST JSONB containment shape.**

   **Evidence**

   The implementation builds a target facet and applies:

   ```ts
   q = q.contains('target_facets', JSON.stringify([facet]));
   ```

   The surrounding comment says:

   > “ONE element must hold every key”

   and the contract test models each facet as an object:

   ```ts
   {issuer_id, rating, security_ticker, currency}
   ```

   However, PostgREST `cs`/`contains` against a JSONB array column requires the right-hand operand to have the same JSONB containment semantics. Passing `[facet]` asks for an array containing the scalar/object `facet`, not an array containing an object with the requested keys. The SQL view’s `target_facets` representation and the intended PostgreSQL containment predicate are not established by this TypeScript code.

   The test stub does not validate this behavior: it accepts any `contains` call and returns fixture rows regardless of the query.

   **Impact**

   In production, issuer/rating/security/currency filters can silently return no rows, or can match incorrectly depending on the actual `target_facets` JSONB shape. This affects the public reports endpoint and therefore public search correctness.

   **Prescriptive fix**

   Use the exact JSONB containment form supported by the deployed view:

   - if the column is an array of objects, use an object predicate against the array’s elements, or add a database-side RPC/view predicate;
   - if the column is a JSON object, use the corresponding object containment expression;
   - add a real Postgres integration test that exercises the same `.contains()` query and proves:
     - issuer + rating on the same target matches;
     - issuer on target A and rating on target B does not match;
     - security ticker and currency are correlated on one target;
   - make the PostgREST stub enforce the containment shape rather than ignoring it.

3. **P1 — `supabaseBrokerResearchDb.publicReports()` does not implement the cursor contract correctly for equal publication dates.**

   **Evidence**

   The implementation uses:

   ```ts
   q = q.or(
     `published_date.lt.${filter.cursor.publishedDate},` +
     `and(published_date.eq.${filter.cursor.publishedDate},report_id.lt.${filter.cursor.reportId})`
   );
   ```

   The implementation’s own ordering is:

   ```ts
   .order('published_date', {ascending:false})
   .order('report_id', {ascending:false})
   ```

   and the cursor is interpreted as:

   > `published_date desc, report_id desc`

   The SQL condition therefore needs the same descending UUID comparison. PostgREST’s `lt` operator is ascending by default; the generated condition is not equivalent to `report_id < cursor` under a descending UUID ordering.

   **Impact**

   For multiple reports with the same `published_date`, keyset pagination can duplicate the boundary report or skip reports, depending on the database comparison/order behavior. Public report lists are therefore not reliably complete or duplicate-free.

   **Prescriptive fix**

   Encode the cursor as an explicit descending tuple:

   ```ts
   published_date.lt.<date>
   or (
     published_date.eq.<date>
     and report_id.lt.<uuid>
   )
   ```

   only if the database ordering is changed to ascending UUID; otherwise use the correct descending comparison mechanism, preferably a dedicated RPC with:

   ```sql
   (published_date, report_id) < (cursor_date, cursor_id)
   ```

   with both columns ordered descending. Add a regression test with several same-date reports and assert exact non-overlapping pages.

4. **P1 — The public report bundle can expose private target fields through the public target view.**

   **Evidence**

   The public target view implementation returns:

   ```ts
   price_at_report: t.price_at_report,
   price_currency: t.price_currency,
   price_as_of_date: t.price_as_of_date
   ```

   even when `allows_public_target_price` is false.

   The specification requires:

   > “`allows_public_target_price=false` 时：目标价、空间、`target_*` 引用、含该数值的片段 / 摘要 / 标题都不出现”

   and the public view contract says target-price-derived columns are conditional. The current memory implementation does conditionally suppress `target_price`, `target_currency`, `target_horizon_months`, `upside_pct`, and `upside_formula_version`, but leaves report-time price fields visible.

   **Impact**

   A restricted-target-price report can still expose the numeric relationship between the restricted target and the report-time price through `price_at_report`, and public DTOs can contain values that should have been filtered under the licence’s target-price restriction. This is a licence-gating bypass risk and violates the mandated value-level disclosure behavior.

   **Prescriptive fix**

   Decide and enforce the exact public semantics in the SQL view and both adapters. If the restriction is intended to hide the target-price surface only, explicitly document that report-time price remains public and add tests for that interpretation. If it is intended to hide the target-price-derived surface, null/omit `price_at_report`, `price_currency`, `price_as_of_date`, and all related facets whenever `allows_public_target_price=false`.

   At minimum, add a real anon-role value-level test asserting that a restricted target price cannot be inferred from public rows and that no prohibited numeric value appears anywhere in the response.

5. **P1 — The Supabase adapter does not enforce the “service role only for private writes” boundary in its API surface.**

   **Evidence**

   `supabaseBrokerResearchDb` accepts arbitrary clients:

   ```ts
   export function supabaseBrokerResearchDb(
     clients:{admin?:SupabaseClient|null;anon?:SupabaseClient|null}
   ):BrokerResearchDb
   ```

   and uses the `admin` client for all private table access, but the contract does not verify that the supplied admin client is actually a service-role client. The implementation also exposes public methods that accept a client-independent `admin` client:

   ```ts
   const admin = () => {
     if (!clients.admin) throw new BrokerResearchDbError('admin_client_required');
     return clients.admin as unknown as NarrowClient;
   };
   ```

   The database contract test only verifies that `publicReport` fails when no anon client is supplied and that `getSettings` fails when no admin client is supplied. It does not test that a client with anon/authenticated privileges cannot be used for private operations.

   **Impact**

   A caller can accidentally inject an anon or authenticated client into the admin slot. The adapter then issues private table/RPC calls with that client. Depending on the deployed database grants, this either fails at runtime or exposes private operations to an under-privileged caller. It also makes the implementation’s security boundary dependent on caller discipline rather than on the adapter contract.

   **Prescriptive fix**

   Make the constructor require a dedicated service-role client type and do not accept a generic `SupabaseClient` for the admin role. At minimum:

   - validate the service-role key at construction;
   - expose separate constructors or explicit `serviceRole` naming;
   - add tests that pass anon/authenticated clients to the private path and assert rejection before any query;
   - ensure all private RPCs are invoked through the service-role client only.

6. **P2 — `pageAll()` can issue an unbounded number of requests and has no global result limit for several private reads.**

   **Evidence**

   The helper computes:

   ```ts
   const size = limit === undefined
     ? READ_PAGE
     : Math.min(READ_PAGE, limit - out.length);
   ```

   but when `limit` is undefined it loops until an empty page:

   ```ts
   for (let start = 0;;) {
     ...
     if (part.length === 0) return out;
     out.push(...part);
     start += part.length;
   }
   ```

   The comment says:

   > “Complete-set read in a fixed order”

   This is true, but several callers intentionally request complete sets from unbounded tables, including:

   ```ts
   listLicences()
   listRuns(documentId)
   listFields(reportId)
   listTargets(reportId)
   listSnippets(reportId)
   listSummaries(reportId)
   listInstitutions()
   listAnalysts(inst)
   listAccessLog(opts)
   purgeSteps(documentId)
   writesFor(documentId)
   pendingWritesFor(documentId)
   ```

   The public API’s `limit` is capped only by the caller’s filter; the adapter itself does not enforce the specification’s maximum of 200 for public report listings.

   **Impact**

   A large or unexpectedly growing private dataset can cause excessive database round trips, memory growth, and request timeouts. More importantly, a caller can request an unbounded public page, contrary to the API contract’s maximum limit.

   **Prescriptive fix**

   - enforce `publicReports.limit` as `1..200` in the adapter, returning an invalid-parameter error or clamping according to the API contract;
   - apply bounded limits to all administrative complete-set reads where the caller does not explicitly need every row;
   - use cursor-based reads for logs, runs, fields, and access records;
   - add a guard against unbounded loops and test the maximum-limit behavior.

7. **P2 — `setPublicEnabled()` and `setApprovedGoldCorpus()` perform non-atomic client-side updates.**

   **Evidence**

   The implementation writes timestamps and fields directly:

   ```ts
   await run(from('broker_research_settings')
     .update({
       public_enabled: flag,
       updated_by: by,
       updated_at: new Date().toISOString()
     })
     .eq('id',1));
   ```

   and similarly for the gold corpus hash.

   The plan’s data-access contract explicitly requires writes needing:

   > “server time, an attempts counter or a hash”

   to use an RPC. These are security-relevant settings changes and should be serialized with the database’s audit/update triggers. The adapter also cannot verify that exactly one settings row was updated.

   **Impact**

   A missing settings row yields a successful no-op. Concurrent updates can overwrite fields, and the client clock can disagree with database time. For the public switch and approved gold-corpus hash, these are publication-gate controls, so a no-op or race is material.

   **Prescriptive fix**

   Add service-role RPCs such as:

   ```sql
   broker_settings_set_public(flag uuid, by uuid)
   broker_settings_set_gold(hash text, by uuid)
   ```

   Each should lock/update the singleton row, use `now()`, verify one affected row, and emit the required audit event. Update the shared contract and both adapters.

8. **P2 — `confirmLicence()` can report success for a licence whose version changed between the update and the subsequent existence check.**

   **Evidence**

   The implementation performs:

   ```ts
   const hit = await run(...update(...).eq('licence_id', id).eq('version', version)...)
   if (hit.length) return 'confirmed';

   await required(
     from('broker_report_licences')
       .select('licence_id')
       .eq('licence_id', id),
     'licence'
   );
   return 'version_mismatch';
   ```

   The confirmation update itself is correctly version-constrained, but the fallback existence check is not tied to the same version. A concurrent material update can change the row between the two statements, and the result remains `version_mismatch`, which is safe for confirmation. However, the method does not return the actual current version, and the contract has no atomic “confirm only if current version” RPC or database-side state transition.

   **Impact**

   The method is not incorrectly confirming a stale licence, but it is not an atomic confirmation operation and does not provide enough information for the caller to distinguish “not found” from “version mismatch.” Under concurrent edits, the caller can receive an ambiguous result and retry against a changing licence.

   **Prescriptive fix**

   Use a single SQL RPC that locks the licence and performs the version check and confirmation atomically, returning a structured result such as `confirmed`, `version_mismatch` with the current version, or `not_found`.

9. **P2 — `transitionIntent()` does not enforce the required “same administrator” and expiry checks.**

   **Evidence**

   The interface receives only:

   ```ts
   transitionIntent(id, fromStatus, to, patch)
   ```

   The implementation checks only the current status:

   ```ts
   if (!i || i.status !== from) return false;
   if (to !== from && !INTENT_MOVES.has(`${from}>${to}`)) fail(...)
   ```

   The specification requires:

   > “`created_by` 必须是当前管理员，过期 → `expired`”

   The adapter has no `by` parameter and never checks `expires_at`. The in-memory implementation has the same omission.

   **Impact**

   Any caller with access to the admin client can advance another administrator’s upload intent, and an expired intent can be revived through a normal transition. This breaks the upload state machine’s ownership and expiry guarantees.

   **Prescriptive fix**

   Change the contract to require the acting administrator:

   ```ts
   transitionIntent(
     id,
     fromStatus,
     to,
     patch,
     by
   )
   ```

   or add a dedicated RPC accepting `p_by`. In the transaction:

   - lock the intent;
   - verify `created_by = p_by`;
   - verify `expires_at > now()`;
   - reject or atomically transition expired intents to `expired`;
   - enforce the allowed transition graph.

   Add tests for a different administrator, an expired intent, and concurrent transitions.

10. **P2 — `insertDocument()` does not preserve the caller’s `uploaded_at` and can create a document with an invalid licence reference.**

   **Evidence**

   The implementation overwrites the supplied row:

   ```ts
   documents.set(row.document_id, {
     ...row,
     page_count: null,
     uploaded_at: stamp(),
     ...
   });
   ```

   The SQL schema defines `uploaded_at` as the time the document became available, and the upload flow is expected to set that timestamp when the document is committed. The memory adapter instead always resets it when the document is inserted.

   The implementation also does not verify that `licence_id` exists or that the licence is confirmed. The contract test creates a licence but never tests a missing licence.

   **Impact**

   The memory implementation cannot faithfully replay `available_at` semantics, especially for delayed promotion or recovery paths. Invalid licence references can be accepted in memory, allowing tests to pass against state that PostgreSQL would reject.

   **Prescriptive fix**

   Define the contract explicitly:

   - either require `uploaded_at` in `insertDocument()` and preserve it, or remove it from the input type and document that it is generated at insertion;
   - validate the licence exists and is usable at the database boundary;
   - add a memory implementation constraint and a contract test for missing licences and timestamp preservation.

11. **P2 — `updateDocument()` can bypass the document transition state machine.**

   **Evidence**

   The Supabase adapter performs a direct update:

   ```ts
   async updateDocument(id,patch){
     await run(
       from('broker_report_documents')
         .update(dropUndefined(patch))
         .eq('document_id',id)
     );
   }
   ```

   The memory adapter does validate transitions, but the Supabase adapter relies entirely on database triggers. The database trigger is described in the plan as protecting document state, while the contract test’s invalid transition assertion exercises only the memory implementation:

   ```ts
   expect(await code(db.updateDocument(doc,{status:'parsed'})))
     .toBe('document_transition_invalid');
   ```

   **Impact**

   If the deployed trigger is missing, incomplete, or differs from the memory implementation, Supabase callers can transition documents into illegal states. The two implementations do not provide the promised equivalent guarantees, and the shared contract cannot detect the divergence because the Supabase implementation is not run against the same contract.

   **Prescriptive fix**

   Move document state changes behind a service-role RPC that performs the transition and state validation in the database, or explicitly document `updateDocument()` as an administrative patch API and ensure the database trigger is part of the integration contract. Add a real database contract test for every legal and illegal transition.

12. **P2 — `setSnippetStatus()` and `setSummaryStatus()` are not atomic approval operations.**

   **Evidence**

   The adapter performs a plain update:

   ```ts
   await run(
     from('broker_report_snippets')
       .update(dropUndefined(patch))
       .eq('snippet_id',id)
   );
   ```

   and similarly for summaries.

   The in-memory implementation performs the approval gates before mutating the row, but the Supabase implementation does not perform equivalent checks locally. It relies on database triggers. If a trigger is absent, an approved snippet can be stored with:

   - text longer than the current licence limit;
   - `disclosure_check.passed = false`;
   - a stale disclosure digest;
   - a missing approver.

   **Impact**

   The two implementations do not share the same approval invariants. A caller can approve public-facing text without the checks that the memory adapter enforces, and the SQL adapter’s public rows may then expose unapproved or restricted content.

   **Prescriptive fix**

   Add service-role RPCs:

   ```sql
   broker_snippet_set_status(
     p_snippet uuid,
     p_status text,
     p_approved_by uuid,
     p_disclosure_check jsonb
   )
   ```

   ```sql
   broker_summary_set_status(...)
   ```

   Perform locking, current-licence checks, disclosure digest checks, stale-summary checks, and publication-state checks in the transaction. Use the same functions from both adapters.

13. **P2 — `insertSnippet()` and `insertSummary()` discard required caller state or silently force it.**

   **Evidence**

   The adapter always forces snippets to draft:

   ```ts
   from('broker_report_snippets').insert({
     ...row,
     status:'draft'
   })
   ```

   and always forces summary status to draft:

   ```ts
   from('broker_report_summaries').insert({
     ...row,
     status:'draft'
   })
   ```

   The memory implementation does the same for snippets, but its summary insertion does not appear to preserve the complete approval contract consistently. The contract permits `insertSummary()` to receive `status: 'draft'` and later approve it, so forcing draft is safe only if the API explicitly forbids insertion as approved.

   The larger issue is that `insertSnippet()` and `insertSummary()` do not perform or request the disclosure digest/current-input validation that the later approval path depends on.

   **Impact**

   Callers can construct rows with inconsistent `disclosure_check`, `input_hash`, or lineage values and persist them, leaving the database to reject them only if triggers exist. The adapter contract does not make the required fields explicit or fail early.

   **Prescriptive fix**

   Define separate input types:

   ```ts
   DraftSnippetInput
   DraftSummaryInput
   ```

   excluding `status` and approval fields. Enforce required disclosure/lineage fields at insertion or move all approval-related validation into one service-role RPC.

14. **P2 — The memory implementation’s “basis” calculation does not match the specified effective-field semantics for absent required fields.**

   **Evidence**

   The implementation defines:

   ```ts
   const effBasis =
     e('ticker') &&
     e('rating') &&
     e('target_price') &&
     (e('target_price', true) ||
       (e('target_currency') &&
        e('price_at_report') &&
        e('price_currency') &&
        e('price_as_of_date')));
   ```

   The `e()` helper returns true for any effective field regardless of whether the field is `absent`:

   ```ts
   const e = (fld, absent?) =>
     mine.some(p =>
       p.isEff &&
       p.f.field === fld &&
       (absent === undefined || (p.f.status === 'absent') === absent)
     );
   ```

   Consequently, a target with an `absent` target price is considered `effective` if the other required target fields exist, even though the specification defines a target as effectively materialized only when the target’s required fields are effective and numeric values are available. The in-memory implementation also sets `target_price` to null for absent rows, while the basis logic treats that as sufficient.

   **Impact**

   Memory tests can report a target as effective when the database would retain candidate basis or emit a required-field blocker. This creates false confidence in publish-blocker and materialization behavior.

   **Prescriptive fix**

   Define one explicit basis predicate shared by SQL and memory:

   - a target is `effective` only if its ticker is effective;
   - rating is effective (including an explicit absent rating);
   - target price is effective and either has a numeric value or is explicitly absent;
   - when target price is present, its currency, report-time price, price currency, and price date are effective with the required typed values;
   - otherwise use `candidate`.

   Add the same absent-target-price scenario to the pg contract.

15. **P2 — `fieldReview(..., 'absent')` creates a replacement row but can leave the original row’s `corrected` data in the database.**

   **Evidence**

   The implementation performs:

   ```ts
   if(f.status!=='rejected')
     Object.assign(f,{
       status:'rejected',
       corrected:null,
       reviewed_by:by,
       reviewed_at:now()
     });

   newField({
     report_id:f.report_id,
     ...
     status:'absent',
     ...
   });
   ```

   The original row is correctly nulled in the in-memory implementation. However, the Supabase implementation delegates this whole operation to:

   ```ts
   this.fieldReview(...)
   ```

   The Supabase adapter does not validate that the original row was rejected before creating the absent row, and the shared contract’s expected error is only asserted in memory.

   **Impact**

   Any divergence between the SQL function and the memory action can leave a confirmed/corrected row alongside an absent row, violating the effective-value uniqueness rule or causing the wrong field to win during materialization. The contract test does not verify this transition against PostgreSQL.

   **Prescriptive fix**

   Implement absent creation as one database RPC that locks the field and report, rejects the original row and inserts the absent row in the same transaction, enforcing the unique effective index. Add a real Postgres test that confirms the original row is rejected and its correction is cleared.

16. **P2 — `fieldReview()` does not validate the corrected payload against the field’s typed conversion rules.**

   **Evidence**

   The implementation validates only:

   ```ts
   if(corr.value_num != null &&
      !/^-?[0-9]+(\.[0-9]+)?$/.test(String(corr.value_num)))
     fail(...)

   if(corr.value_date != null) {
     ...
   }
   ```

   It does not enforce field-specific rules such as:

   - `target_price.value_currency` must be an ISO currency;
   - `published_date.value_date` must be present;
   - `target_horizon.value_num` must represent a positive number of months;
   - `target_price.value_unit` must be `price`;
   - `wacc` and other percentage fields must use `pct`.

   The specification requires:

   > “服务端按同一转换表校验类型一致”

   **Impact**

   A corrected row can be approved with a syntactically valid but semantically invalid typed value. It can then materialize into the wrong target representation or pass a publish gate it should fail.

   **Prescriptive fix**

   Reuse the typed conversion/validation module in the service layer and enforce it in the database RPC as well. Validate field, unit, currency, date, numeric presence, and positive/finite constraints atomically. Add unit tests for every field in the conversion table.

17. **P2 — `upsertTargetOverride()` does not validate the target key or issuer resolution.**

   **Evidence**

   The implementation accepts the row as supplied:

   ```ts
   overrides.set(k, {
     ...,
     target_key: row.target_key,
     security_ticker: row.security_ticker,
     issuer_id: row.issuer_id,
     ...
   });
   ```

   The Supabase adapter similarly forwards the values to the RPC without local validation.

   The specification requires the override to be tied to a normalized target and to resolve to a valid security/issuer pair. The shared contract only checks that the target changes after an override; it does not test malformed keys, nonexistent securities, or conflicting issuer IDs.

   **Impact**

   Invalid overrides can create targets with mismatched `security_ticker` and `issuer_id`, causing incorrect public facets, history, and claim registration. The memory implementation can accept state PostgreSQL would reject.

   **Prescriptive fix**

   Validate and resolve overrides in a service-role RPC:

   - require a canonical target key;
   - verify the security exists in `stocks_universe`;
   - resolve/validate the issuer;
   - require issuer agreement unless an explicit administrative correction path is defined;
   - store the resolution snapshot used;
   - return the materialized receipt only after successful resolution.

18. **P2 — `publishBlockers()` does not enforce all blockers required by the specification.**

   **Evidence**

   The memory implementation checks many conditions, but the `restricted_value_in_text` handling is incomplete:

   ```ts
   const res = rr?.results.find(
     x => x.rule === 'disclosure' &&
          x.detail?.surface === surface
   );
   if (!res || res.passed !== true)
     if (surface !== 'title_original' || r.title_public === null)
       b.push(`restricted_value_in_text:${surface}`);
   ```

   It only consults rule receipt results for title surfaces. It separately checks snippets and summaries using `db_digest`, but does not verify that:
   - the snippet/summary disclosure check was generated with the current licence version and current analyst state;
   - the summary’s numeric grounding and overlap checks remain valid;
   - the title’s disclosure check is represented by the current disclosure inputs;
   - the report’s `title_restricted` state agrees with the title strategy.

   The specification requires the blocker to cover:

   > “`title_public`、`title_zh`、`title_en`、任一 `approved` 片段、任一 `approved` 摘要”

   and explicitly includes disclosure-input invalidation.

   **Impact**

   A report can be considered publishable while an approved surface lacks a valid current disclosure result or while the report’s computed `title_restricted` value is stale. This can expose restricted text publicly.

   **Prescriptive fix**

   Implement one database-side disclosure predicate/function used by both the blocker function and the public views. For every required surface:

   - recompute the current disclosure inputs;
   - require `disclosure_check.passed = true`;
   - require the stored input hash/digest to equal the current digest;
   - validate summary grounding/overlap;
   - derive `title_restricted` using the specified title strategy.

   Do not rely on a rule receipt as a substitute for the current per-surface check.

19. **P2 — The public target/history data path does not consistently enforce target-price licence gating.**

   **Evidence**

   In the Supabase adapter, the public target query uses:

   ```ts
   .select(PUBLIC_TARGET_COLUMNS)
   ```

   where `PUBLIC_TARGET_COLUMNS` includes:

   ```ts
   target_price:target_price::text,
   target_currency,
   target_horizon_months,
   upside_pct:upside_pct::text,
   price_at_report:price_at_report::text,
   price_currency,
   price_as_of_date
   ```

   The adapter assumes the SQL view performs all conditional nulling. The public view contract in the plan says:

   > `target_price = case when allows_public_target_price then … end`

   but the selected list also requests fields whose suppression semantics are not represented in the adapter. The memory implementation’s `targetView()` does suppress target-related columns, but `historyView()` constructs rows directly from `targetView(r)` and therefore inherits the same behavior.

   **Impact**

   The correctness of a licence restriction depends entirely on the migration view matching the memory implementation. The A4 contract does not execute the public queries against the real PostgreSQL view with a restricted licence. A mismatch is silent and can expose restricted values.

   **Prescriptive fix**

   Add a real-role PostgreSQL contract test covering:

   - `allows_public_target_price=false`;
   - every public view;
   - report list, detail, citations, snippets, summaries, history, and spread;
   - value-level assertions for target price, target currency, upside, and target-derived numbers.

   The adapter should not assume that a selected column is safe merely because its name is present in a column list.

20. **P2 — `publicReports()` does not return the API’s required `count` or `nextCursor` contract.**

   **Evidence**

   The specification defines the public response as:

   > `{reports:[...], nextCursor, count}`

   The adapter returns only:

   ```ts
   return bundles(reports, targets, summaries, snippets, institutions);
   ```

   The `PublicReportBundle` type and implementation contain no `count` or `nextCursor` fields.

   **Impact**

   The public route cannot satisfy the specified response shape without adding an undocumented parallel implementation. Consumers cannot reliably paginate or know the result count.

   **Prescriptive fix**

   Extend the public result type to include:

   ```ts
   {
     reports: PublicReportBundle[];
     nextCursor: {publishedDate: string; reportId: string} | null;
     count: number;
   }
   ```

   Define whether `count` is the page count or total matching count, document it, and add an API-level test for both the first page and subsequent pages.

21. **P2 — The shared contract does not actually run against the Supabase implementation.**

   **Evidence**

   The only invocation of the shared contract is:

   ```ts
   brokerResearchDbContract(
     'memoryBrokerResearchDb contract',
     async() => {
       const db = memoryBrokerResearchDb();
       ...
     }
   );
   ```

   The Supabase adapter is tested only with a stub:

   ```ts
   const s = stub(...)
   ```

   The plan requires:

   > “the same scenarios run against memoryBrokerResearchDb ... and pgBrokerResearchDb”

   and the implementation log claims:

   > “37 unit tests PASS”

   but no PostgreSQL contract harness is present in the changed files. The stub returns canned rows and does not enforce SQL predicates, triggers, uniqueness, transition rules, JSONB containment, or RPC semantics.

   **Impact**

   The implementation can pass all A4 unit tests while diverging from PostgreSQL behavior in exactly the areas that matter: publication blockers, licence gating, row limits, transitions, approval checks, and public view predicates.

   **Prescriptive fix**

   Add a `pgBrokerResearchDb` harness to the shared contract suite and run the same scenarios against the isolated PostgreSQL test database. Keep the Supabase wiring test as a separate adapter-level test, but do not treat it as the SQL contract.

22. **P2 — The PostgREST stub does not enforce the server-side row cap or filter semantics.**

   **Evidence**

   The stub is described as:

   > “带服务端行数上限的 PostgREST 桩”

   but its builder methods merely record calls:

   ```ts
   for (const m of [
     'select','insert','update','upsert','eq','is','in','like',
     'gte','lte','lt','or','order','limit','range','single','maybeSingle'
   ]) b[m] = (...a) => {
     calls.push(['from',table,m,...a]);
     return b;
   };
   ```

   The result is always:

   ```ts
   Promise.resolve({
     data: rows.length ? rows.shift() : null,
     error: null
   })
   ```

   It does not apply `range`, `limit`, `eq`, `in`, `contains`, `order`, or any other predicate. Thus the test named:

   > “reads every public detail child ... across capped responses”

   does not prove that the implementation handles a server cap correctly; it merely demonstrates that the fixture has multiple rows and the implementation requests them.

   **Impact**

   The regression tests can pass while the real Supabase client behaves differently under PostgREST row limits, especially for keyset pagination and child-row reads.

   **Prescriptive fix**

   Implement a stateful query stub that:

   - applies filters and `contains`;
   - applies `range` and `limit`;
   - applies ordering;
   - returns a configured maximum page size smaller than the requested range;
   - returns an empty page only after all matching rows are exhausted.

   Assert the actual ranges requested and compare the returned page sequence with the expected sequence.

23. **P2 — `publicReport()` does not guarantee a complete, deterministic child result under the server row cap.**

   **Evidence**

   The adapter uses:

   ```ts
   pageAll(() => pub(...).select(...).eq('report_id',id).order(...))
   ```

   for each child view. This is better than a single `.limit()`, but `pageAll()` relies on the server honoring the requested `range` and does not verify that the returned page is smaller than or equal to the requested range.

   The changed test claims:

   > “reads every public detail child and institution across capped responses”

   but the stub does not enforce a cap, and the implementation has no check for a server returning an unbounded page.

   **Impact**

   If PostgREST ignores or clamps `range` unexpectedly, a detail request can silently truncate citations, snippets, summaries, or analysts. Public evidence would then be incomplete without an error.

   **Prescriptive fix**

   Use cursor pagination with a unique deterministic order for each child query, or use a dedicated database RPC returning JSON. Validate page boundaries and continue until the terminal marker, rather than relying solely on `range`.

24. **P2 — `publicAnalysts()` can return an incomplete result because it applies a hard-coded limit before aggregation.**

   **Evidence**

   The implementation reads:

   ```ts
   .eq('institution_id', opts.institutionId)
   .limit(5000)
   ```

   and only then calls:

   ```ts
   analystsDistinct(...)
   ```

   If an institution has more than 5,000 public analyst bindings, the distinct analyst list is incomplete. The hard-coded limit is not part of the specified API contract, and there is no pagination or completeness check.

   **Impact**

   Public analyst directories can silently omit analysts for large institutions, while the result appears complete.

   **Prescriptive fix**

   Remove the arbitrary limit and use a complete paginated read, or aggregate distinct analysts in a database view/RPC with a documented limit and total count. Add a fixture with more than the cap and assert completeness.

25. **P2 — `ratingHistory()` has an inconsistent pagination boundary and does not enforce a maximum limit.**

   **Evidence**

   The implementation computes the limit once:

   ```ts
   return (await pageAll(
     () => q.order(...),
     opts.limit
   )).map(publicRow);
   ```

   but `opts.limit` is not bounded or validated. The same method also returns history rows without applying a report-visibility predicate locally; it relies entirely on the view.

   The specification requires the history endpoint to have a bounded limit and the general API contract specifies maximum limits for public reads.

   **Impact**

   Callers can request unbounded history data, causing excessive memory and database usage. If the view’s ordering differs from the requested ordering, the method can return an inconsistent page.

   **Prescriptive fix**

   Validate and cap `opts.limit`, use a deterministic cursor based on `(published_date, report_id, target_key)`, and ensure the database view’s ordering exactly matches the cursor semantics.

26. **P2 — `spreadReports()` uses an unbounded report loop and does not guarantee deterministic winner ordering.**

   **Evidence**

   The implementation reads all spread rows and then performs one request per row:

   ```ts
   const rows = await pageAll(...);
   const out = [];
   for (const row of rows) {
     const r = await this.publicReport(String(row.report_id));
     if (r) out.push(r);
   }
   ```

   The comment says:

   > “exhaust institution
