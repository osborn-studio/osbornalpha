// src/lib/macro/types.ts
// Shared macro types (spec §4). Every later module imports from here; changing a shape here is a
// plan change, not an implementation detail.
export type Region='US'|'CN';
export type SeriesType='policy_rate'|'bond_yield'|'fx'|'inflation_yoy'|'pmi'|'labor_rate'|'growth_yoy'|'liquidity_yoy'|'risk_index'|'asset_price';
export type SeriesStatus='active'|'missing'|'restricted';
export type Adapter='fred_csv'|'akshare';
export type Rights='public_domain'|'official_open'|'third_party';
export type ChangeKind='bp'|'pp'|'pct'|'points';
export type NativeFrequency='daily'|'monthly'|'quarterly'|'event';
export type PeriodKind='day'|'month'|'quarter';
export interface Bilingual{zh:string;en:string}
export interface SeriesSource{adapter:Adapter;fetchHost:string;publisher:Bilingual;via?:Bilingual;seriesKey:string;rights:Rights;attribution:Bilingual}
export type DeriveRule={kind:'month_end';from:string}|{kind:'yoy_from_index';from:string}|{kind:'index_minus_100';from:string};
export interface MacroSeriesDef{
 id:string;region:Region;role:'indicator'|'asset'|'event_source';type:SeriesType|null;name:Bilingual;unit:string;
 nativeFrequency:NativeFrequency;period:PeriodKind;adjustment:'sa'|'nsa'|'na';status:SeriesStatus;reason?:Bilingual;
 source:SeriesSource|null;            // null only for status missing; derived series carry the source of their input
 derive?:DeriveRule;                  // present ⇒ series is derived (no own evidence)
 aliasOf?:string;                     // asset view of another series (same observations); no own rows
 revisionPolicy:'revisable'|'immutable';weight:number;changeKind:ChangeKind;releaseLagDays?:number;definitionVersion:number;
}
/** Where a parser found a value inside the evidence bytes. html_cell (Task 9, ChinaBond / SAFE HTML tables): table = 0-based
 *  index of the <table> start tag in document order (comments stripped), row = 0-based <tr> directly inside it (header = 0),
 *  cell = 0-based <td>/<th> in that row (parsers/html-table.ts). */
export type Locator={kind:'csv_row';line:number;column:number}|{kind:'json_pointer';pointer:string}|{kind:'html_cell';table:number;row:number;cell:number};
/** Exact fetched bytes plus the receipt of this one retrieval (spec §0.2 N2). sha256 = hex of bytes. */
export interface EvidenceInput{sha256:string;bytes:Uint8Array;adapter:Adapter;fetchUrl:string;fetchHost:string;httpStatus:number;contentType:string;fetchedAt:string;toolVersions:Record<string,string>}
/** macro_evidence_objects: byte object, deduplicated by sha256. */
export interface EvidenceObject{sha256:string;object_path:string;adapter:Adapter;content_type:string;byte_length:number;created_at:string}
/** macro_retrievals: one row per retrieval, even when the bytes repeat. */
export interface Retrieval{retrieval_id:string;sha256:string;fetch_url:string;fetch_host:string;http_status:number;fetched_at:string;batch_id:string;tool_versions:Record<string,string>}
/** One value located inside one evidence object by a parser. periodEnd is ISO date (period end per series definition). */
export interface ParsedPoint{seriesId:string;periodEnd:string;valueText:string;locator:Locator}
/** rejected = a quarantined version refused by macro_resolve_conflict (never eligible again, never readable by anon). */
export type ObservationStatus='ok'|'quarantined'|'rejected';
export interface ObservationRow{
 observation_id:string;series_id:string;period_end:string;value_text:string;version:number;
 available_at:string;availability_basis:'first_seen';ingested_at:string;status:ObservationStatus;
 retrieval_id:string|null;locator:Locator|null;derived_from:string[]|null;transform:string|null;code_version:string;batch_id:string;
}
/** A row submitted to macro_write_observations. Exactly one of (retrieval_id+locator) | (derived_from+transform).
 *  available_at: native = the retrieval's fetched_at; derived = max available_at of ALL inputs (spec §0.2 M6). */
export type ObservationWrite=
 |{series_id:string;period_end:string;value_text:string;available_at:string;revisable:boolean;retrieval_id:string;locator:Locator}
 |{series_id:string;period_end:string;value_text:string;available_at:string;revisable:boolean;derived_from:string[];transform:string};
/** previously_rejected (第 5 稿 P1-2): the value was rejected before for this (series, period); nothing is inserted, the call
 *  counts it under `duplicates`, and the conflict is informational (no quarantine item, no error). */
export type WriteConflictReason='unexpected_revision'|'conflicting_rows'|'stale_delivery'|'missing_evidence'|'missing_input'|'previously_rejected';
export interface WriteResult{
 inserted:number;duplicates:number;versioned:number;quarantined:number;
 /** observation_id: the quarantined row (newly inserted, or the existing same-value quarantined row of an eligible or the
  *  current batch — 第 5 稿 P1-6) for unexpected_revision / stale_delivery; the rejected row for previously_rejected; null for
  *  conflicting_rows / missing_evidence / missing_input (nothing stored). Task 6 links quarantined rows to the dq_quarantine
  *  item via macro_link_quarantine (第 4 稿 P1-4). */
 conflicts:{series_id:string;period_end:string;reason:WriteConflictReason;value_text:string;current_value_text:string|null;observation_id:string|null}[];
}
export interface CatalogCounts{verified:number;missing:number;restricted:number}
export interface RegimeContribution{series_id:string;observation_id:string;rule_id:string;weight:number;support:Partial<Record<'recovery'|'overheat'|'stagflation'|'recession',number>>;contribution:Record<'recovery'|'overheat'|'stagflation'|'recession',number>}
export interface PublishInput{
 region:Region;expectedRevision:number;expectedInputRevision:number;asOf:string;methodologyVersion:string;catalogVersion:string;
 observationIds:string[];
 /** Frozen display history (第 4 稿 P1-8): the last 24 eligible observations per indicator (sparklines); validated like the manifest. */
 historyIds:string[];catalogCounts:CatalogCounts;
 regime:import('./judgment-contract').RegimeResult|null;contributions:RegimeContribution[];rulesVersion:string;uncoveredWeight:number;
 /** Idempotency key (第 5 稿 P1-4): 'ingest:<batch_id>' (ingest finish) or 'cron:<batch_id>' (cron). A key that already
  *  published returns that snapshot (replayed:true) instead of publishing again. Omitted only by tests and the rollback path. */
 publishKey?:string;
 /** Owner fence (第 5 稿 P1-3): the AKShare finish passes its batch and owner token; cron passes neither (its batch has no run). */
 batchId?:string;ownerToken?:string|null;
 /** Finish fence (review A2): the run's CURRENT finish token; required with ownerToken, else `fenced` (a rotated-out finisher cannot claim the publish key). */
 finishToken?:string|null;
}
export interface PublishResult{snapshot_id:string;revision:number;replayed:boolean}
export interface SnapshotRecord{
 snapshot_id:string;region:Region;as_of:string;revision:number;methodology_version:string;catalog_version:string;
 observation_ids:string[];history_ids:string[];catalog_counts:CatalogCounts;status:'active'|'superseded'|'failed';failure_reason:string|null;created_at:string;
}
export interface RegimeRecord{snapshot_id:string;region:Region;regime:import('./judgment-contract').RegimeResult|null;contributions:RegimeContribution[];rules_version:string;uncovered_weight:number}
export type AnalysisKind='change'|'level'|'rolling'|'event_window';
export interface ChunkCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
/** Same shape as dq/batches BatchError (kept structural so types.ts imports nothing from dq). */
export interface ChunkError{code:string;key?:string;message?:string}
/** macro_ingest_chunks row (第 4 稿 P1-6/P2-1): claimed as processing, completed once with counts, errors and claim/location keys.
 *  Chunk counts are NATIVE outcomes only (chunks carry evidence); derived counts live in FinishProgress.derived (第 5 稿 P2-2).
 *  native_usable (第 6 稿 P2-1): native rows that are usable data = inserted + versioned + duplicates EXCLUDING previously_rejected
 *  (the RPC counts a rejected redelivery under duplicates); kept apart from the six DQ counters, which stay unchanged. Derivation,
 *  publication and freshness ok gate on Σ native_usable > 0. */
export interface ChunkRecord{seq:number;total:number;state:'processing'|'done';counts:ChunkCounts;native_usable:number;errors:ChunkError[];claim_keys:string[];located_keys:string[]}
/** aborted (第 5 稿 P1-3): a takeover fenced this run; every later mutation carrying its owner token raises `fenced`. */
export type IngestRunState='open'|'finishing'|'finished'|'aborted';
/** The lease answer of macro_claim_ingest (第 5 稿 P1-3/P2-1). ownerToken only when claimed. aborted = batch ids of this
 *  dataset's aborted runs whose ingest_batches row is still running (the caller finishes them failed; idempotent sweep). */
export interface IngestClaim{status:'claimed'|'busy';ownerToken:string|null;aborted:string[];holder:string|null}
/** Exclusive finish (第 5 稿 P1-4): beginFinish hands the owner a fresh finishToken (rotated on every resume, which fences an
 *  older concurrent finisher of the same owner at its next checkpoint); every recordFinishStep presents both tokens. */
export interface FinishFence{ownerToken:string;finishToken:string}
/** Steps recorded through macro_record_finish_step. freshness_recorded is NOT one of them (第 6 稿 P1-1): only
 *  macro_record_freshness writes it, in the same transaction as the dq_freshness upsert. */
export type FinishStep='derived'|'batch_finished'|'published'|'publish_attempt'|'receipt';
/** macro_ingest_runs.finish_progress (第 4 稿 P2-4; 第 5 稿 P1-4/P1-5/P2-2; 第 6 稿 P1-1): every finish step that already happened,
 *  so a retried finish resumes. freshness_recorded is written atomically with the freshness side effect (status = the stored
 *  dq_freshness status), so a retry either sees it and skips, or repeats a write that never committed — never a double count.
 *  publish_attempt appends to attempts[] (retryable publication failures; the run stays finishing). */
export interface FinishProgress{
 derived?:{counts:ChunkCounts;errors:ChunkError[]}|{skipped:'no_native_outcomes'};
 batch_finished?:{status:string;date:string};
 freshness_recorded?:{ok:boolean;status:string};
 published?:Record<string,unknown>;
 attempts?:{at:string;status:string;reason:string|null}[];
 receipt?:Record<string,unknown>;
 aborted?:{by:string;reason:'max_age'|'stalled_chunk'};
}
/** ingest_batches statuses a finalizer may write (第 6 稿 P1-1/P2-4); 'running' is only ever read back. Structural twin of
 *  dq/batches BatchStatus (types.ts imports nothing from dq). */
export type FinalStatus='success'|'partial'|'failed'|'rejected';
/** MacroDb.finalizeBatch input: status computed in TS (batchStatusFromCounts, or an explicit 'failed' for a fatal abort), the six
 *  counters, errors already capped like finishBatch (≤ 100 + one `truncated`, messages ≤ 500), finishedAt ISO (SQL keeps it ≥ started_at). */
export interface FinalizeInput{status:FinalStatus;counts:ChunkCounts;errors:ChunkError[];finishedAt:string}
/** finalized=false: the batch was no longer running (an earlier attempt finished it); status is the stored one, read back. */
export interface FinalizeResult{status:FinalStatus|'running';finalized:boolean}
/** MacroDb.recordFreshness input (第 6 稿 P1-1): same semantics as dq/freshness recordAttempt. dataset must be the run's dataset. */
export interface FreshnessWrite{dataset:string;ok:boolean;cadence:'daily'|'monthly'|'quarterly'|'event';now:string;detail:Record<string,unknown>}
/** One member of a dq_quarantine item (macro_quarantine_members ⨝ macro_observations; 第 4 稿 P1-4). */
export interface QuarantineMember{observation_id:string;series_id:string;period_end:string;value_text:string;version:number;status:ObservationStatus}
export type Timeliness='current'|'late'|'missing'|'n/a';
