// src/lib/industry/types.ts
// Shared contract of the industry module (plan 2026-11-06 §共享契约; spec 6th draft §4.3–§6.1, §9).
// Every task uses these names verbatim. IndustryDb has three implementations: supabaseIndustryDb
// (db.ts: from() + rpc()), memoryIndustryDb (memory-industry-db.ts, unit tests), pgIndustryDb
// (pg-industry-db.ts, integration tests). No implementation writes a protected table directly:
// every write is one of the SQL functions of migration 20261111091000 (spec §4.3, V1/V2).
import type {MetricRow,FactRow} from '../facts/types';

export type Scheme='sw2021'|'sic';
export type SchemeVersion='2021'|'sec-current';
export type DatasetKey='scheme:sw2021:2021'|'scheme:sic:sec-current'|'marks:tushare-daily_basic'|'official:tushare-sw_daily';
export type LicenseStatus='internal'|'public';
export type MembershipStatus='ok'|'quarantined'|'superseded';
export type Availability='effective_date_assumed'|'evidenced'|'observed';
export type ResolutionMethod='today'|'as_of';
export type HistoryClass='point_in_time'|'reconstruction';
export type MetricRunStatus='building'|'active'|'superseded'|'failed';
export type ValuationRunStatus='building'|'published'|'active'|'superseded'|'failed';
export type RunKind='aggregate'|'valuation';
export type AggMetric='revenue_sum'|'net_income_parent_sum'|'gross_margin'|'roe'|'revenue_yoy'|'net_income_yoy'|'member_count';
export type AggDuration='3M'|'12M'|'TTM'|'INSTANT';
export type CellStatus='ok'|'missing';
export type MissingReason='empty_set'|'zero_denominator'|'no_members'|'financial_excluded'|'unresolved_over_limit'|'manifest_mismatch';
export type RoleReason='missing_concept'|'unit_excluded'|'read_truncated'|'version_inconsistent'|'not_in_comparable_set'|'financial_excluded';
export type ObservationKind='marks'|'official';
export type ObservationOutcome='inserted'|'duplicate'|'superseded_previous';

/** industry_classifications row (spec §4.2) */
export interface ClassificationRow{scheme:Scheme;version:SchemeVersion;code:string;level:number;name_zh:string|null;name_en:string|null;parent_code:string|null;attributes:Record<string,unknown>}

/** industry_source_memberships row (spec §4.3–§4.4): immutable import evidence */
export interface SourceMembershipRow{
 id:string;scheme:'sw2021';version:'2021';source:string;ts_code:string;name:string|null;
 l1_code:string;l2_code:string;l3_code:string;in_date:string;out_date:string|null;
 observed_at:string;batch_id:string;raw_hash:string;locator:Record<string,unknown>;
 status:'current'|'superseded';superseded_by:string|null;
 issuer_id:string|null;resolution:{method?:ResolutionMethod;resolved_at?:string;as_of?:string;membership_ids?:string[]};
 resolution_error:{code:string;at:string;detail?:string}|null;
}
/** Input to upsertSourceMemberships (id, status, issuer fields are assigned by the function) */
export interface SourceMembershipInput{source:string;ts_code:string;name:string|null;l1_code:string;l2_code:string;l3_code:string;in_date:string;out_date:string|null;observed_at:string;raw_hash:string;locator:Record<string,unknown>}

/** issuer_industry_memberships row (spec §4.3) */
export interface MembershipRow{
 membership_id:string;issuer_id:string;scheme:Scheme;version:SchemeVersion;code:string;level:number;
 valid_from:string;valid_to:string|null;available_date:string;valid_to_available_date:string|null;
 source:string;source_membership_id:string|null;batch_id:string;status:MembershipStatus;superseded_by:string|null;
 provenance:{availability:Availability;source_membership_id?:string;raw_hash?:string;locator?:Record<string,unknown>}&Record<string,unknown>;
}
/** One target row for apply_industry_memberships (membership_id is preallocated inside the function) */
export interface MembershipTarget{code:string;level:number;valid_from:string;valid_to:string|null;available_date:string;valid_to_available_date:string|null;source:string;provenance:MembershipRow['provenance']}
export interface ApplyMembershipsResult{inserted:number;closed:number;superseded:number;duplicates:number;membership_ids:string[]}
/** correctMembershipWindows: quarantined = ok rows whose corrected window is empty (R3-1). */
export interface CorrectWindowsResult extends ApplyMembershipsResult{quarantined:number}

/** industry_security_delistings row (spec 7th draft K4): delisting date of a ts_code with the stock_basic page evidence */
export interface DelistingRow{ts_code:string;delist_date:string;list_status:string;observed_at:string;batch_id:string;raw_hash:string}
export type DelistingInput=Omit<DelistingRow,'batch_id'>;
export interface UpsertDelistingsResult{inserted:number;unchanged:number;changed:{ts_code:string;old_date:string;new_date:string}[]}
/** quarantineMembershipLineage: ok rows of the predecessors of the given replacement records moved to quarantined. */
export interface QuarantineLineageResult{quarantined:number;membership_ids:string[]}

/** Point-in-time query (spec §4.6) */
export interface MembersAtQuery{scheme:Scheme;version:SchemeVersion;code:string;level:number;on:string;knownBy:string}

/** security_marks row (spec §6.1; free_share = Tushare free_share 万股 × 10000, nullable, K1) */
export interface MarkRow{observation_id:string;ticker:string;trade_date:string;fetch_event_id:string;observed_at:string;close:string;total_share:string;free_share:string|null;market_cap:string;source:string;upstream:'sse'|'szse'|'bse';raw_hash:string;locator:Record<string,unknown>;batch_id:string;status:'ok'|'quarantined'|'superseded';supersedes:string|null}
/** apply_observations input row; numbers are canonical decimal strings */
export interface MarkInput{ticker:string;trade_date:string;close:string;total_share:string;free_share?:string|null;source:string;upstream:'sse'|'szse'|'bse';raw_hash:string;locator:Record<string,unknown>;status?:'ok'|'quarantined'}
export interface OfficialInput{scheme:'sw2021';version:'2021';code:string;trade_date:string;metric:'pe'|'pb'|'total_mv'|'float_mv'|'close';value:string;source:string;upstream:string;raw_hash:string;locator:Record<string,unknown>}
export interface ObservationResult{inserted:number;duplicates:number;superseded:number}

/** Aggregate run header (spec §4.3 industry_metric_runs) */
export interface MetricRunRow{
 run_id:string;scheme:Scheme;version:SchemeVersion;level:number;generation:number;facts_as_of:string;knowledge_date:string;
 history_class:HistoryClass;method_version:string;config_hash:string;formula_version:string;code_version:string;
 expected_grid:{codes:string[];period_ends:string[];metrics:AggMetric[]};fingerprint_at:string;reused_from_run:string|null;batch_id:string;
 status:MetricRunStatus;coverage_summary:Record<string,unknown>;created_at:string;activated_at:string|null;
}
export type NewMetricRun=Omit<MetricRunRow,'run_id'|'generation'|'status'|'coverage_summary'|'created_at'|'activated_at'>;
/** industry_metrics row: one cell, ok or missing (spec §4.3) */
export interface MetricCellRow{
 run_id:string;code:string;metric:AggMetric;period_start:string;period_end:string;duration:AggDuration;
 status:CellStatus;missing_reason:MissingReason|null;value:string|null;unit:string;
 n_members:number;n_with_data:number;n_unresolved:number;manifest_hash:string|null;updated_at:string|null;
}
export type StagedMetricCell=Omit<MetricCellRow,'run_id'|'updated_at'>;
/** industry_run_dependencies row: one per (cell, candidate member) (spec §4.3, U4/V6) */
export interface RunDependency{cell_key:string;issuer_id:string;state_rev:number}

/** Valuation shapes (tables/functions land in Task 1–2; the valuation pipeline is deferred) */
export interface ValuationRunRow{run_id:string;scheme:Scheme;version:SchemeVersion;level:number;generation:number;method_version:string;config_hash:string;formula_version:string;code_version:string;expected_dates:string[];comparator_basis:'ttm'|'static'|'unknown';recompute_from:string;carried_from_run:string|null;fingerprint_at:string;batch_id:string;status:ValuationRunStatus;reconciliation:Record<string,unknown>;created_at:string;published_at:string|null;activated_at:string|null}
export interface ValuationCellRow{run_id:string;scheme:Scheme;version:SchemeVersion;code:string;trade_date:string;metric:'pe_ttm'|'pe_static'|'pb'|'market_cap';status:CellStatus;missing_reason:string|null;value:string|null;facts_as_of:string;n_members:number|null;n_with_data:number|null;n_unresolved:number|null;mcap_coverage:string|null;manifest_hash:string|null;updated_at:string|null;series_qualified:boolean;published:boolean}

/** Content-addressed manifest (spec §5.3; schema 'industry-manifest/2') */
export interface ManifestMember{issuer_id:string;ticker:string|null;valid_from:string;valid_to:string|null;available_date:string;valid_to_available_date:string|null;source_membership_id:string|null;raw_hash:string|null;locator:Record<string,unknown>|null;resolution_method:ResolutionMethod|null}
export interface ManifestUnresolved{ts_code:string;in_date:string;out_date:string|null;source_membership_id:string}
export interface ManifestFact{issuer_id:string;concept:string;period_start:string|null;period_end:string;duration:string;fact_id:string;value_text:string;unit:string;consolidation:string;available_date:string;mapping_gen:number;filing_id:string;source_ref:string|null;raw_hash:string;citation:'edgar'|'linked'|'pending'|null}
export interface ManifestDerived{issuer_id:string;metric:string;period_start:string;period_end:string;duration:string;value:string;unit:string;basis:string;formula_version:string;inputs:MetricRow['inputs']}
export interface ManifestRole{issuer_id:string;metric:AggMetric;duration:AggDuration;role:'included'|'excluded';reason?:RoleReason}
export interface ManifestCell{metric:AggMetric;duration:AggDuration;period_start:string;status:CellStatus;value_text?:string;missing_reason?:MissingReason;n_members:number;n_with_data:number;n_unresolved:number;unit:string}
export interface AggregateManifest{
 schema:'industry-manifest/2';kind:'aggregate';scheme:Scheme;version:SchemeVersion;code:string;level:number;period_end:string;
 facts_as_of:string;knowledge_date:string;history_class:HistoryClass;method_version:string;config_hash:string;formula_version:string;code_version:string;
 members:ManifestMember[];unresolved:ManifestUnresolved[];member_state_revs:{issuer_id:string;state_rev:number}[];
 facts:ManifestFact[];derived:ManifestDerived[];roles:ManifestRole[];cells:ManifestCell[];warnings:string[];
}
/** One GC claim: the index row's incarnation object path and the claim token (Codex plan audit round 2 R2-1). */
export interface ManifestGcClaim{hash:string;objectPath:string;claim:string}
export interface ManifestStore{
 /** Registers the index row FIRST (refused with manifest_gc_in_progress while GC holds a claim), then uploads the gzip of the canonical JSON at the row's object_path (sha256/<hash>/<upload uuid>.json.gz). Idempotent. */
 put(kind:RunKind,canonical:string):Promise<{hash:string;existed:boolean}>;
 get(hash:string):Promise<AggregateManifest>;
 remove(objects:{hash:string;objectPath:string}[]):Promise<{removed:string[];failed:string[]}>;
}

export interface FreshnessRow{dataset:string;status:'fresh'|'stale'|'error'|'missing';last_ok_at:string|null}

export type IndustryDbErrorCode='membership_conflict'|'membership_overlap'|'same_day_change'|'incomplete_run'|'obsolete_run'|'dependencies_incomplete'|'dependency_regression'|'pairs_mismatch'|'illegal_transition'|'run_not_building'|'fetch_event_payload_changed'|'manifest_gc_in_progress'|'lease_lost'|'unknown';
export class IndustryDbError extends Error{constructor(public code:IndustryDbErrorCode,message?:string){super(message??code);this.name='IndustryDbError';}}

export interface IndustryDb{
 // classifications & licences
 upsertClassifications(batch:string,rows:ClassificationRow[]):Promise<{inserted:number;unchanged:number;conflicts:ClassificationRow[]}>;
 classificationTree(scheme:Scheme,version:SchemeVersion):Promise<ClassificationRow[]>;
 setDatasetLicense(key:DatasetKey,status:LicenseStatus,by:string,note:string|null):Promise<void>;
 isDatasetPublic(key:DatasetKey):Promise<boolean>;
 // source records (rpc upsert_industry_source_memberships / record_industry_source_resolution_error)
 upsertSourceMemberships(batch:string,rows:SourceMembershipInput[]):Promise<{inserted:number;superseded:number;duplicates:number;changed:{old_id:string;new_id:string;nullToDate:boolean}[]}>;
 currentSourceMemberships(opts:{l1Code?:string;unresolvedOnly?:boolean}):Promise<SourceMembershipRow[]>;
 recordResolutionError(ids:string[],error:{code:string;at:string;detail?:string}):Promise<number>;
 // memberships (rpc apply_industry_memberships / apply_sic_memberships)
 applyMemberships(batch:string,issuer:string,scheme:Scheme,version:SchemeVersion,rows:MembershipTarget[],sourceIds:string[],resolution:Record<string,unknown>):Promise<ApplyMembershipsResult>;
 /** Rewrites ok windows of ONE current, resolved record (superseded → corrected row; R2-2); an empty corrected window quarantines the row (R3-1). */
 correctMembershipWindows(batch:string,issuer:string,scheme:Scheme,version:SchemeVersion,sourceId:string,rows:MembershipTarget[]):Promise<CorrectWindowsResult>;
 /** Quarantines the ok rows of the predecessors (supersession chain) of current, unresolved replacement records, atomically (rpc quarantine_industry_membership_lineage). */
 quarantineMembershipLineage(batch:string,scheme:Scheme,version:SchemeVersion,sourceIds:string[],reason:string):Promise<QuarantineLineageResult>;
 // delistings (K4): direct table writes (service_role insert/update)
 /** New ts_code → inserted; same date → unchanged (row kept); other date → updated (new evidence) and listed in `changed`. */
 upsertDelistings(batch:string,rows:DelistingInput[]):Promise<UpsertDelistingsResult>;
 delistings():Promise<DelistingRow[]>;
 /** Lease-fenced (R2-3): lease_lost unless industry_sync_scope(issuer,'sic') is leased to fence.leaseBatch and unexpired; code null = provenance only ('none'). */
 applySicMembership(batch:string,issuer:string,observed:string,code:string|null,provenance:Record<string,unknown>,fence:{leaseBatch:string;secSubmissions?:Record<string,unknown>|null}):Promise<'inserted'|'duplicate'|'changed'|'none'>;
 /** All rows of the code (any status) whose windows can intersect `on`; callers filter with memberships.ts */
 membershipCandidates(q:{scheme:Scheme;version:SchemeVersion;code:string;level:number;on:string}):Promise<MembershipRow[]>;
 membershipsOfIssuer(issuer:string,q:{scheme?:Scheme;on?:string}):Promise<MembershipRow[]>;
 // observations (rpc begin_industry_fetch_event / retry_industry_fetch_event / apply_observations)
 beginFetchEvent(job:string,params:Record<string,unknown>,batch:string):Promise<string>;
 retryFetchEvent(id:string):Promise<void>;
 applyObservations(kind:'marks',fetchEventId:string,rows:MarkInput[]):Promise<ObservationResult>;
 applyObservations(kind:'official',fetchEventId:string,rows:OfficialInput[]):Promise<ObservationResult>;
 currentMarksOn(tradeDate:string,tickers:string[]):Promise<MarkRow[]>;
 // aggregate runs (rpc create_/stage_/set_*_coverage/activate_/fail_)
 createMetricRun(row:NewMetricRun):Promise<{runId:string;generation:number}>;
 setMetricRunCoverage(run:string,summary:Record<string,unknown>):Promise<void>;
 stageMetricRows(run:string,rows:StagedMetricCell[]):Promise<number>;
 stageRunDependencies(run:string,kind:RunKind,rows:RunDependency[]):Promise<number>;
 activateMetricRun(run:string):Promise<{activatedAt:string}>;
 failRun(kind:RunKind,run:string,reason:string):Promise<void>;
 activeMetricRun(scheme:Scheme,version:SchemeVersion,level:number):Promise<MetricRunRow|null>;
 metricRun(run:string):Promise<MetricRunRow|null>;
 metricRowsOfRun(run:string,filter?:{codes?:string[];metrics?:AggMetric[];periodEnds?:string[];durations?:AggDuration[]}):Promise<MetricCellRow[]>;
 runDependencies(kind:RunKind,run:string):Promise<RunDependency[]>;
 // valuation (read side only in this plan; write RPCs are exercised by integration tests directly)
 activeValuationRun(scheme:Scheme,version:SchemeVersion,level:number):Promise<ValuationRunRow|null>;
 publishedValuations(run:string,filter:{codes?:string[];from?:string;to?:string}):Promise<ValuationCellRow[]>;
 // manifests index (rpc put_industry_manifest / gc_industry_manifest_candidates / delete_industry_manifests)
 registerManifest(hash:string,kind:RunKind,byteLength:number):Promise<boolean>;
 manifestObjectPath(hash:string):Promise<string|null>;
 manifestGcCandidates(limit:number):Promise<ManifestGcClaim[]>;
 deleteManifestIndex(claims:{hash:string;claim:string}[]):Promise<number>;
 pruneRuns(keep:number):Promise<number>;
 // misc
 stateFingerprint(market:'CN'):Promise<{takenAt:string;revs:Map<string,number>}>;
 freshness():Promise<FreshnessRow[]>;
 metricRunVisible(run:string):Promise<boolean>;
 /** Count of current, unresolved source records for the code on `on` known by `knownBy` (spec §5.2 n_unresolved; distinct ts_code) */
 unresolvedCount(q:{code:string;level:number;on:string;knownBy:string}):Promise<number>;
 unresolvedOf(q:{code:string;level:number;on:string;knownBy:string}):Promise<ManifestUnresolved[]>;
}

/** Dependencies of the orchestrators: injected so unit tests run on memory implementations. */
export interface IndustryDeps{
 tables:import('../db/table-client').TableClient;   // ingest_batches, dq_*, issuers, issuer_securities, stocks_universe
 db:IndustryDb;
 facts:Pick<import('../facts/types').FactsDb,'readFacts'|'filingsOfIssuer'|'scopeAll'>;
 manifests:ManifestStore;
 now:()=>Date;
 codeVersion:string|null;
 tushare?:(api:string,params:Record<string,unknown>,fields:string)=>Promise<{fields:string[];items:unknown[][];has_more:boolean;raw:Uint8Array}>;
 fetch?:typeof fetch;
}
export type {FactRow};
