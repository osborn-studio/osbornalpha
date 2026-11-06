// src/lib/facts/types.ts
// Shared contract of the facts layer (plan 2 §共享契约, spec §4.8; plan 3 C4, spec §3.2). Every task
// uses these names verbatim. FactsDb has three implementations: supabaseFactsDb (db.ts, rpc),
// memoryFactsDb (memory-facts-db.ts, unit tests), pgFactsDb (pg-facts-db.ts, integration tests).
// The reconciliation types are imported as types only (no runtime cycle with src/lib/dq).
import type {ApplyReconcileOutcome,CyclePairId,Fence,MemberCounts,OpenCycleInput,OpenCycleResult,ReconcileResultInput} from '../dq/reconcile/types';
export type Market='US'|'CN';
export type Statement='IS'|'BS'|'CF'|'DEI';
export type Duration='3M'|'6M'|'9M'|'12M'|'INSTANT';
export type MetricDuration=Duration|'TTM';
export type FactStatus='staged'|'ok'|'quarantined';
export type RunStatus='staged'|'published'|'abandoned';
export type FormType='10-K'|'10-Q'|'20-F'|'40-F'|'10-K/A'|'10-Q/A'|'20-F/A'|'annual'|'semiannual'|'q1'|'q3'|'restatement'|'other';
export type Origin='sec'|'sse'|'szse'|'bse';
export type Source='edgar'|'tushare';
export type UnitKind='money'|'shares'|'per_share';

export interface ConceptDef{
 id:string;statement:Statement;nature:'duration'|'instant';unitKind:UnitKind;
 usGaap:string[];ifrs:string[];
 tushare:{api:'income'|'balancesheet'|'cashflow';field:string}|{api:'income'|'balancesheet'|'cashflow';sum:string[]}|null;
 notes?:string;
}

/** 一个解析出的候选事实（value 为规范十进制字符串，§6.2） */
export interface FactCandidate{
 concept:string;sourceConcept:string;statement:Statement;
 periodStart:string|null;periodEnd:string;duration:Duration;
 value:string;unit:string;consolidation:'consolidated';
 filingRef:string;                 // = FilingCandidate.sourceRef
 rawHash:string;
}
export interface FilingCandidate{
 sourceRef:string;market:Market;source:Source;origin:Origin;formType:FormType;
 fiscalYear:number|null;fiscalPeriod:'FY'|'Q1'|'Q2'|'Q3'|'H1'|'9M'|null;
 periodEnd:string|null;availableDate:string;url:string|null;
}
export interface ParseResult{candidates:FactCandidate[];filings:FilingCandidate[];skipped:{reason:string;n:number}[];ambiguous:{key:string;candidates:FactCandidate[]}[];oddDuration:FactCandidate[];missingAvailableDate:Record<string,unknown>[]}

export interface RawSnapshot{bytes:Uint8Array;sha256:string;meta:{source:Source;api?:string;url?:string;params?:Record<string,unknown>;fields?:string;fetched_at:string;http_status:number;has_more?:boolean;page?:number}}
export interface Budget{remainingMs():number;signal:AbortSignal}

export interface FactRow{
 fact_id:string;issuer_id:string;market:Market;filing_id:string;run_id:string;concept:string;source_concept:string;statement:Statement;
 period_start:string|null;period_end:string;duration:Duration;value:string;value_text:string;unit:string;consolidation:string;
 available_date:string;mapping_gen:number;mapping_version:string;status:FactStatus;raw_hash:string;created_at:string;
 disclosure_seq?:number;is_current?:boolean;is_revision?:boolean;   // 只有 readFacts 返回时带
}
export interface FilingRow{
 filing_id:string;issuer_id:string;market:Market;source:Source;origin:Origin;form_type:FormType;fiscal_year:number|null;fiscal_period:string|null;
 period_end:string|null;available_date:string;source_ref:string;url:string|null;document_ref:string|null;document_url:string|null;
 link_attempts:number;mapping_gen:number;run_id:string;created_at:string;
 /** SEC acceptance time (ISO) written once by set_filing_acceptance (plan 3 §4.5) */
 accepted_at:string|null;acceptance_source:'sec_submissions'|null;
}
export interface ScopeRow{issuer_id:string;market:Market;reasons:string[];priority:number;fetch_key:string;next_due_at:string;lease_until:string|null;lease_batch_id:string|null;state_rev:number;last_attempt_at:string|null;last_success_at:string|null;last_batch_id:string|null;last_status:'success'|'failed'|null}
/** One member of a lineage and its fact-state version (plan 3 §4.4). */
export interface LineageRev{issuer_id:string;state_rev:number}
export interface MetricRow{issuer_id:string;market:Market;metric:string;period_start:string;period_end:string;duration:MetricDuration;value:string;unit:string;input_unit:string;basis:string;formula_version:string;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string;ytd_rule?:'same_filing'|'never_revised';quarter?:[string,string]}[];based_on_rev:number;
 /** the complete lineage state the row was derived from (issuer_id ascending); compared as a whole (T8) */
 based_on_lineage:LineageRev[];as_of:string}
export interface ConflictItem{id:string;natural_key:string;fact_ids:string[];available_date:string;key:Record<string,string|null>}
export interface LineageConflict{key:Record<string,string|null>;available_date:string;fact_ids:string[]}

export interface ReadFactsOptions{concepts:string[];asOf:string;from?:string;to?:string;history?:boolean;limit?:number;includeNonOk?:boolean}
export interface ReadFactsResult{stateRev:number;rows:FactRow[];truncated:boolean}
export interface ReadFactsLineageResult{stateRevs:LineageRev[];lineage:string[];rows:FactRow[];conflicts:LineageConflict[];truncated:boolean}
export type FilingFactRow=FactRow&{run_status:RunStatus};
export type CalendarFiling=FilingRow&{run_status:RunStatus;accepted_at:string|null};

export type FactsDbErrorCode='lease_lost'|'run_pending'|'run_published'|'mapping_gen_regression'|'stale_computation'|'stale_plan'|'run_abandoned'|'read_truncated'|'duplicate_key'|'invalid_chosen'|'item_not_open'|'unknown'
 |'fence_failed'|'member_incomplete'|'stale_evaluation'|'batch_mismatch'|'invalid_choice'|'invalid_candidate'|'generation_moved'
 |'duplicate'|'conflict_exists'|'replay_required'|'filing_not_found'|'not_passing'|'lineage_changed'|'scope_missing'|'unresolved'
 |'acceptance_conflict'|'source_not_active'|'has_referrers'|'topology_write_forbidden'|'invalid_result'
 |'use_dedicated_resolver'|'target_not_active'|'invalid_members';
export class FactsDbError extends Error{constructor(public code:FactsDbErrorCode,message?:string){super(message??code);this.name='FactsDbError';}}

export interface FactsDb{
 claimLease(issuer:string,market:Market,batch:string,ttlSeconds:number):Promise<boolean>;
 beginRun(issuer:string,market:Market,batch:string,mappingGen:number):Promise<string>;
 /** source_ref → filing_id，含已存在者 */
 stageFilings(run:string,rows:FilingInsert[]):Promise<Map<string,string>>;
 stageFacts(run:string,rows:FactInsert[]):Promise<number>;
 quarantineFacts(run:string,factIds:string[],itemId:string):Promise<number>;
 /** expectedRev: the state_rev the plan was read at; a different current value fails as stale_plan (a promotion landed after planning). */
 publishRun(run:string,manifest:string[],expectedRev?:number):Promise<number>;
 abandonRun(run:string):Promise<void>;
 releaseLease(issuer:string,market:Market,batch:string,outcome:'success'|'failed',nextDue:string):Promise<void>;
 resolveFactsQuarantine(itemId:string,chosen:string[],resolvedBy:string):Promise<{promoted:number;skipped:number;chosenFactIds:string[]}>;
 /** plan-2 wrapper of replaceMetricsLineage with the one-member vector [{issuer, basedOnRev}] */
 replaceMetrics(issuer:string,market:Market,basedOnRev:number,rows:MetricRow[]):Promise<number>;
 readFacts(issuer:string,market:Market,opts:ReadFactsOptions):Promise<ReadFactsResult>;
 /** Rows for the given ids: deduped, ordered by fact_id; unknown ids are omitted. */
 factsByIds(ids:string[]):Promise<FactRow[]>;
 openConflicts(issuer:string,market:Market):Promise<ConflictItem[]>;
 filingsOfIssuer(issuer:string,market:Market,opts:{from?:string;to?:string;limit?:number;unlinkedOnly?:boolean}):Promise<FilingRow[]>;
 updateFilingLink(filingId:string,patch:{document_ref?:string|null;document_url?:string|null;link_attempts:number}):Promise<void>;
 /** snapshotAt: when the sources behind `rows` were read. A retirement (priority 0 over a stored priority > 0) applies only to a row whose scope was neither changed nor confirmed active after it (scope_confirmed_at <= snapshotAt); activations and upserts always apply. */
 reconcileScope(market:Market,rows:{issuer_id:string;reasons:string[];priority:number;fetch_key:string}[],snapshotAt?:string):Promise<number>;
 scopeDue(market:Market,now:string,limit:number):Promise<ScopeRow[]>;
 /** 指定发行人的 scope 行（不看 priority / next_due_at；缺行者不返回），供脚本 `--issuer` 与回放测试直指发行人（审计 round-1 #13） */
 scopeRows(market:Market,issuerIds:string[]):Promise<ScopeRow[]>;
 /** Every scope row of the market, priority 0 included, ordered by issuer_id (complete set, paged to exhaustion) */
 scopeAll(market:Market):Promise<ScopeRow[]>;
 metricsOfIssuer(issuer:string,market:Market,formulaVersion:string):Promise<MetricRow[]>;
 // ---- plan 3 (C4)
 /** materialisation target T(i) = i.merged_into ?? i (unknown issuer → itself) */
 targetOf(issuer:string):Promise<string>;
 /** [target, ...issuers whose merged_into = target, ascending] */
 lineageOf(target:string):Promise<string[]>;
 /** one snapshot; issuer_id ascending, deduped; no scope row ⇒ 0 */
 stateRevs(issuers:string[],market:Market):Promise<LineageRev[]>;
 readFactsLineage(issuers:string[],market:Market,opts:ReadFactsOptions):Promise<ReadFactsLineageResult>;
 /** every generation and status of one filing (includeNonOk=false: ok only), with the run status; no binding */
 readFilingFacts(filingId:string,includeNonOk:boolean):Promise<FilingFactRow[]>;
 replaceMetricsLineage(issuer:string,market:Market,basedOn:LineageRev[],rows:MetricRow[]):Promise<number>;
 findFilingBySourceRef(source:Source,sourceRef:string):Promise<FilingRow|null>;
 /** every filing with period_end >= fromPeriodEnd (complete set, never cut by a row count, T9), ordered by period_end, available_date, filing_id */
 filingsForCalendar(issuer:string,market:Market,opts:{fromPeriodEnd:string}):Promise<CalendarFiling[]>;
 setFilingAcceptance(filingId:string,acceptedAt:string,source:'sec_submissions'):Promise<boolean>;
 adoptCandidate(itemId:string,index:number,batchId:string,expectedRev:number,resolvedBy:string):Promise<{factId:string;runId:string;issuerId:string;market:Market}>;
 restoreReconciled(itemId:string,batchId:string,inputsHashNow:string,resolvedBy:string):Promise<{promoted:number;skipped:{fact_id:string;reason:string}[]}>;
 resolveLineageConflict(itemId:string,keepFactId:string,batchId:string,resolvedBy:string):Promise<{quarantined:number}>;
 claimReconcileMember(pair:CyclePairId,cycleId:string,issuer:string,market:Market,batchId:string):Promise<Fence|null>;
 applyReconcileResult(fence:Fence,result:ReconcileResultInput):Promise<ApplyReconcileOutcome>;
 completeReconcileMember(fence:Fence):Promise<MemberCounts>;
 failReconcileMember(fence:Fence,error:string):Promise<void>;
 /** atomic cycle creation (open_reconcile_cycle, plan audit Q2): under the pair's cycle lock (shared with set_merge) a running cycle is returned unchanged (created:false); else the cycle row and one pending cursor per member are inserted and ONLY the listed pending entries leave the cycle rows' pending_members */
 openReconcileCycle(input:OpenCycleInput):Promise<OpenCycleResult>;
 setMerge(source:string,target:string,resolvedBy:string):Promise<{repointed:number}>;
 setDissolved(issuer:string,resolvedBy:string):Promise<void>;
}
/** stageFilings 的输入行（写入端生成 filing_id） */
export interface FilingInsert extends FilingCandidate{filing_id:string;issuer_id:string}
/** stageFacts 的输入行（写入端生成 fact_id；status 由函数置 staged） */
export interface FactInsert{fact_id:string;issuer_id:string;market:Market;filing_id:string;concept:string;source_concept:string;statement:Statement;period_start:string|null;period_end:string;duration:Duration;value:string;unit:string;consolidation:'consolidated';available_date:string;mapping_gen:number;mapping_version:string;raw_hash:string}
