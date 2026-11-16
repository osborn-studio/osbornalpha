// src/lib/company/types.ts
// Shared contract of the company research module (plan 2026-11-06 §共享契约; spec §4, §5.3,
// §5.6, §6, §0). Every task uses these names verbatim. CompanyDb has three implementations:
// supabaseCompanyDb (db.ts, rpc + from), memoryCompanyDb (unit tests), pgCompanyDb (integration).
import type {Market,FactRow,FilingRow,Duration,MetricDuration} from '@/lib/facts/types';
export type {Market};

export type EventKind='filing_published'|'period_first_seen'|'fact_revised';
export const EVENT_KINDS:readonly EventKind[]=['filing_published','period_first_seen','fact_revised'];

/** What deriveIssuerEvents produces and replace_company_digest accepts (event_id/payload_hash are server-computed). */
export interface EventInput{
 kind:EventKind;natural_key:string;occurred_on:string;period_end:string|null;concept:string|null;filing_id:string|null;
 payload:Record<string,unknown>;meta:Record<string,unknown>;
}
/** A stored issuer_events row (service_role only, §0 #64). */
export interface EventRow extends EventInput{
 event_id:string;issuer_id:string;market:Market;payload_hash:string;based_on_rev:number;
 first_seen_at:string;payload_changed_at:string|null;retired_at:string|null;rebuilt_at:string;rebuild_id:string;rebuild_batch_id:string;
}
export interface CitationSummary{linked:number;pending:number;edgar:number}
export interface CoverageInput{
 filings_count:number;facts_count:number;concepts_covered:number;
 earliest_period_end:string|null;latest_period_end:string|null;latest_available_date:string|null;
 citation_summary:CitationSummary;scope_last_success_at:string|null;scope_last_status:'success'|'failed'|null;
}
export interface CoverageRow extends CoverageInput{issuer_id:string;market:Market;based_on_rev:number;rebuilt_at:string;rebuild_id:string;rebuild_batch_id:string}
export interface WatchRow{user_id:string;issuer_id:string;note:string|null;muted:boolean;created_at:string;updated_at:string}
export interface DigestStateRow{
 issuer_id:string;market:Market;digested_rev:number;attempt_seq:number;last_attempt_id:number|null;
 last_success_attempt_id:number|null;last_failed_attempt_id:number|null;last_attempt_at:string|null;
 last_status:'success'|'failed'|null;consecutive_failures:number;next_attempt_at:string;swept_at:string|null;updated_at:string;
}
export interface DueStream{issuerId:string;market:Market;stateRev:number;digestedRev:number}
export interface ReplaceResult{upserted:number;changed:number;retired:number;revived:number}

/** One verified association fact → snapshot (company_fact_evidence, §0.1 item 2). */
export interface EvidenceIndexRow{
 fact_id:string;raw_hash:string;snapshot_sha256:string;snapshot_path:string;hash_locator:string;json_pointer:string;field:string|null;
 source:'edgar'|'tushare';api:string|null;url:string|null;params:Record<string,unknown>|null;
 captured_at:string|null;http_status:number|null;page:number|null;index_version:string;
}
export const EVIDENCE_INDEX_VERSION='company-evidence/1';
/** Output of company_fact_evidence(fact_ids) per fact (joined server-side with run → batch). */
export interface EvidenceRecord extends EvidenceIndexRow{run_id:string;code_version:string|null;tool_versions:Record<string,unknown>|null;mapping_version:string}
export interface PdfLocator{page:number;table:string|null;row:string;column:string;documentUrl:string}

/** §0 #62 — the DTO every financial-value response carries in its `evidence` dictionary. */
export interface EvidenceDto{
 factId:string;rawHash:string;
 snapshot:{source:'edgar'|'tushare';sha256:string;path:string;api:string|null;url:string|null;params:Record<string,unknown>|null;capturedAt:string|null;httpStatus:number|null;page:number|null;download:string|null};
 locator:{hashLocator:string;jsonPointer:string;field:string|null;pdf:PdfLocator|null};
 run:{runId:string;codeVersion:string|null;toolVersions:Record<string,unknown>|null};
 mappingVersion:string;unitRule:string|null;
 sourceDocument:{kind:'edgar_index'|'cninfo_pdf';url:string}|null;
}
export type WithheldReason='evidence_incomplete'|'citation_pending';
export interface WithheldCell{kind:'withheld';reason:WithheldReason;factId:string}
export interface FactCell{kind:'fact';factId:string;value:string;unit:string;availableDate:string;filingId:string;disclosureSeq:number;isRevision:boolean;mappingGen:number;rawHash:string;runId:string;otherUnits:boolean}
export interface DerivedCell{kind:'derived';metric:string;value:string;unit:string;inputUnit:string;basis:string;formulaVersion:string;inputs:{factId:string;concept:string;filingId:string;availableDate:string;quarter?:[string,string];ytdRule?:'a'|'b'}[];rule?:'a'|'b'}
/** Grid cell (spec §5.3). null = no visible fact in the row's primary unit for this period (periods with only other-unit facts are listed in statements-grid GridResult.otherUnitOnly → "—" + U). `otherUnits` drives the U badge on a value cell. */
export type Cell=FactCell|DerivedCell|WithheldCell|null;
export interface WithheldCounts{evidenceIncomplete:number;citationPending:number}

export type StatementKind='IS'|'BS'|'CF';
export type Basis='disclosed'|'annual'|'quarterly';
export interface PeriodCol{key:string;periodStart:string;periodEnd:string;duration:Duration|MetricDuration}
export interface GridRow{concept:string;unit:string|null;unitKind:'money'|'shares'|'per_share'|'ratio';sourceConcepts:string[];notes:string|null;cells:Record<string,Cell>}
export interface FilingSummary{filingId:string;formType:string;fiscalYear:number|null;fiscalPeriod:string|null;periodEnd:string|null;availableDate:string;sourceRef:string;source:'edgar'|'tushare';url:string|null;documentUrl:string|null;citation:'edgar'|'linked'|'pending';linkAttempts:number;factCount:number;mappingGen:number}

/** company_read_snapshot result: read_facts envelope + same-statement filings (§0.1 item 3). */
export interface ReadSnapshotResult{stateRev:number;rows:FactRow[];truncated:boolean;filings:FilingSummary[]}
export interface ReadSnapshotOptions{concepts:string[]|null;asOf:string;from?:string|null;to?:string|null;history:boolean;limit?:number}

export class CompanyDbError extends Error{constructor(public code:'stale_computation'|'stale_attempt'|'invalid_event'|'unknown_stream'|'watch_limit'|'invalid_read'|'invalid_evidence'|'internal',message?:string){super(message??code);this.name='CompanyDbError';}}

export interface InboxRow extends EventRow{read:boolean}
export interface CompanyDb{
 // digest (service_role)
 digestDue(now:Date,limit:number,market?:Market):Promise<DueStream[]>;   // market filter applies before the limit (plan audit Q6)
 sweepDue(olderThan:Date,now:Date,limit:number,market?:Market):Promise<DueStream[]>;
 beginAttempt(issuer:string,market:Market,now:Date):Promise<number>;
 replaceDigest(issuer:string,market:Market,batch:string,attemptId:number,rebuildId:string,basedOnRev:number,sweep:boolean,events:EventInput[],coverage:CoverageInput):Promise<ReplaceResult>;
 markDigestFailed(issuer:string,market:Market,attemptId:number,now:Date):Promise<boolean>;
 backlog():Promise<{failedStreams:number}>;
 digestState(issuer:string,market:Market):Promise<DigestStateRow|null>;
 replaceEvidence(issuer:string,market:Market,attemptId:number,basedOnRev:number,rows:EvidenceIndexRow[]):Promise<{upserted:number;deleted:number}>;   // evidence fence: stale_computation / stale_attempt like replaceDigest
 // reads behind the evidence gate (service_role; routes assemble + gate server-side, §0 #64)
 eventsOfIssuer(issuer:string,market:Market,opts:{since?:string;until?:string;kinds?:EventKind[];cursor?:string|null;limit:number}):Promise<{rows:EventRow[];nextCursor:string|null}>;
 eventsOfIssuers(issuers:string[],opts:{kinds?:EventKind[];cursor?:string|null;limit:number}):Promise<{rows:EventRow[];nextCursor:string|null}>;
 evidenceOf(factIds:string[]):Promise<Map<string,EvidenceRecord>>;   // rpc company_fact_evidence, ≤100 per call (batches internally)
 // public reads (anon)
 coverageOf(issuers:string[]):Promise<CoverageRow[]>;
 listCoverage(filter:{market?:Market;issuerIds?:string[]},sort:'latest_available_date'|'latest_period_end'|'name',page:{offset:number;limit:number}):Promise<{rows:CoverageRow[];total:number}>;
 // per user (session client, RLS)
 watchesOf(userId:string):Promise<WatchRow[]>;
 upsertWatch(userId:string,issuerId:string):Promise<{row:WatchRow;created:boolean}>;   // watch_limit → CompanyDbError('watch_limit')
 patchWatch(userId:string,issuerId:string,patch:{note?:string|null;muted?:boolean}):Promise<WatchRow|null>;
 deleteWatch(userId:string,issuerId:string):Promise<boolean>;
 markRead(userId:string,issuerId:string,eventIds:string[]):Promise<{inserted:number}>;
 readEventIds(userId:string,eventIds:string[]):Promise<Set<string>>;
}

/** Optional overview-only explanation for null cells at the exact selected period.
 * Emitted only for multiple distinct units with one candidate per unit and all inputs gated eligible.
 * Absence makes no claim about why a cell is null. No candidate IDs, values or unit names are exposed.
 */
export interface OverviewUnavailableReasons{facts:Record<string,'multiple_units'>;derived:Record<string,'multiple_units'>}
