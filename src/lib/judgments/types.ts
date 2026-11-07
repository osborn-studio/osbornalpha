// src/lib/judgments/types.ts
// Shared contract of the judgment layer (plan F4 §共享契约; spec §3–§5.7, §7.2, §9). Every task uses
// these names verbatim. JudgmentsDb has three implementations: supabaseJudgmentsDb (db.ts, rpc),
// memoryJudgmentsDb (memory-judgments-db.ts, unit tests), pgJudgmentsDb (pg-judgments-db.ts, integration tests).
import type {KlineSourceName,SourceKlineSeries} from '@/lib/data/kline/types';
import type {FactRow,MetricRow,ReadFactsResult,FilingRow} from '@/lib/facts/types';

// ── markets (spec §3.3 S06) ──
export type FactsMarket='US'|'CN';
export type PriceMarket='A'|'HK'|'US';
export type Adjustment='qfq'|'hfq';

// ── subject (spec §3.1) ──
export type SubjectType='issuer'|'industry'|'macro_region'|'macro_series'|'security'|'document';
export const PUBLIC_SUBJECT_TYPES=['issuer','industry','macro_region','macro_series'] as const;
export type PublicSubjectType=typeof PUBLIC_SUBJECT_TYPES[number];
export interface Subject{type:SubjectType;key:string}

// ── kinds, producers, types (spec §3.2, §3.6, §4.3) ──
export type Kind='probability'|'categorical'|'score'|'interval';
export type ProducerKind='rule'|'model'|'human'|'third_party';
export const PUBLIC_PRODUCER_KINDS=['rule','model'] as const;
export type JudgmentType='macro_regime'|'macro_regime_asset_pair'|'recommendation_call'|'industry_lifecycle_stage'|'industry_prosperity'|'valuation_verdict'|'thesis_win_rate'|'return_range'|'sellside_rating'|'sellside_target_price'|'synthetic_fact_metric';
export interface Bilingual{zh:string;en:string}

// ── claims (spec §3.2) ──
export interface ProbabilityClaim{p:number;event:Bilingual}
export interface CategoricalClaim{selected:string;classes:string[];distribution?:Record<string,number>;scores_are_not_probabilities:boolean;margin_pp?:number;catalog_version?:string}
export interface ScoreDim{id:string;value:number|null;weight:number;coverage:boolean}
export interface ScoreClaim{value:number;scale:{min:number;max:number};dims:ScoreDim[];coverage:number;realized_metric:string}
export interface Scenario{label:string;p:number;value:number}
export interface IntervalClaim{metric:string;low:number;high:number;unit:string;nominal_coverage:number;scenarios?:Scenario[];scenario_event_hash?:string}
export type Claim=ProbabilityClaim|CategoricalClaim|ScoreClaim|IntervalClaim;
export interface Abstained{abstained:true;reason:string;missing?:string[]}

// ── conditions (spec §3.3) ──
export type NumOp='>'|'>='|'<'|'<='|'between';
export interface NumPredicate{op:NumOp;rhs:number|[number,number]}
export type Regime='recovery'|'overheat'|'stagflation'|'recession';
export interface PriceReturnParams{ticker:string;market:PriceMarket;adjustment:Adjustment;source:KlineSourceName;base_date:string;benchmark?:{ticker:string;market:PriceMarket}}
export interface FactMetricParams{issuer_id:string;market:FactsMarket;metric:string;period_start:string;period_end:string;duration:string;unit:string;input_unit:string;basis:string;formula_version:string;compare:'value'|'yoy'}
export interface MacroRegimeReplayParams{region:'US'|'CN';reference_period:string;macro_methodology_version:string;catalog_version:string}
export type Condition=
 |{resolver:'price_return';params:PriceReturnParams;predicate:NumPredicate;text:Bilingual}
 |{resolver:'fact_metric';params:FactMetricParams;predicate:NumPredicate;text:Bilingual}
 |{resolver:'macro_regime_replay';params:MacroRegimeReplayParams;predicate:{op:'eq';rhs:Regime};text:Bilingual}
 |{resolver:'industry_aggregate';params:Record<string,string|number>;predicate:NumPredicate|{op:'eq';rhs:string};text:Bilingual}
 |{resolver:'recommendation_hit';params:{recommendation_id:string};predicate:{op:'eq';rhs:true};text:Bilingual};
export type ResolverName=Condition['resolver'];
export const PUBLIC_RESOLVERS=['price_return','fact_metric','macro_regime_replay','industry_aggregate'] as const;

// ── horizon / target / label policy (spec §3.4) ──
export interface Horizon{unit:'trading_sessions'|'calendar_days'|'calendar_months'|'fiscal_quarters';n:number}
export type Target=
 |{kind:'session_index';base_date:string;n:number}
 |{kind:'date';date:string}
 |{kind:'period';period:string}
 |{kind:'fiscal_period';period_end:string;calendar:{anchor_period_end:string;months:3};extrapolated:boolean};
export type LabelPolicy='first_observed'|'cutoff_vintage';

// ── inputs (spec §3.5) ──
/** License status is NOT part of an origin (commander decision D3): it lives in docs/methodologies/licenses.json, read only by the sync script. */
export interface Origin{publisher:string;adapter:string;locator:string;transform?:string}
export interface InputRef<K extends string,R,S>{kind:K;ref:R;snapshot:S;hash:string;available_at:string;origin:Origin}
export interface FactProjection{fact_id:string;issuer_id:string;market:FactsMarket;concept:string;period_start:string|null;period_end:string;duration:string;value_text:string;unit:string;consolidation:string;available_date:string;filing_id:string;mapping_gen:number}
/** Every FactRow field the derive kernel reads (spec §3.5 S04); value is restored from value_text. */
export interface DerivationRow extends FactProjection{status:string;created_at:string;disclosure_seq:number|null;is_current:boolean|null;is_revision:boolean|null}
export interface MetricKey{issuer_id:string;market:FactsMarket;metric:string;period_start:string;period_end:string;input_unit:string;basis:string;formula_version:string}
export interface MetricSnapshot extends MetricKey{value_text:string;unit:string;duration:string;as_of:string;based_on_rev:number;lineage:MetricRow['inputs'];derivation:{formula_version:string;as_of:string;state_rev:number;rows:DerivationRow[]}}
export interface MacroObservationSnapshot{series_id:string;period_end:string;value:number;unit:string;vintage_id:string;available_at:string}
export interface MacroSnapshotSnapshot{snapshot_id:string;region:'US'|'CN';as_of:string;methodology_version:string;catalog_version:string;observation_ids:string[];primary_state:Regime|null;secondary_state:Regime|null;scores:Record<Regime,number>;norm:Record<Regime,number>;coverage:number;margin_pp:number|null;growth_axis:number|null;inflation_axis:number|null}
export interface PriceBarSnapshot{ticker:string;market:PriceMarket;date:string;source:KlineSourceName;adjustment:Adjustment;open:number|null;high:number|null;low:number|null;close:number;volume:number|null;amount:number|null;fields_present:string[]}
export const PUBLIC_TABLES=['issuer_industry_memberships','industry_classifications','macro_series'] as const;
export type PublicTable=typeof PUBLIC_TABLES[number];
export type Input=
 |InputRef<'financial_fact',{fact_id:string},FactProjection>
 |InputRef<'financial_metric',MetricKey,MetricSnapshot>
 |InputRef<'macro_observation',{series_id:string;period_end:string;vintage_id:string},MacroObservationSnapshot>
 |InputRef<'macro_snapshot',{snapshot_id:string},MacroSnapshotSnapshot>
 |InputRef<'price_bar',{ticker:string;market:PriceMarket;date:string;source:KlineSourceName;adjustment:Adjustment},PriceBarSnapshot>
 |InputRef<'table_rows',{table:PublicTable;natural_key:string},{table:PublicTable;natural_key:string;rows:Record<string,unknown>[]}>
 |InputRef<'judgment',{judgment_id:string},{judgment_id:string;claim:Claim;as_of:string}>
 |InputRef<'legacy_fill',{recommendation_id:string},{recommendation_id:string;fill_price:number;fill_date:string;market:PriceMarket;ticker:string}>
 |InputRef<'document_span',Record<string,string>,Record<string,unknown>>;
export type InputKind=Input['kind'];
export const PUBLIC_INPUT_KINDS=['financial_fact','financial_metric','macro_observation','macro_snapshot','price_bar','table_rows','judgment'] as const;

// ── producer (spec §3.6) ──
export type ProducerRef=Record<string,never>|{model:string;prompt_sha256:string;run_id:string}|{analyst_id:string;source_record:{table:string;id:string}}|{institution:string;document_id:string;version_hash:string};

// ── rows (spec §5.1–§5.5b) ──
export type MethodologyStatus='draft'|'active'|'retired';
export interface MethodologyRow{methodology_id:string;version:string;judgment_type:JudgmentType;kind:Kind;producer_kind:ProducerKind;subject_types:SubjectType[];input_kinds:InputKind[];markets:PriceMarket[]|null;title_zh:string;title_en:string;doc_path:string;doc_sha256:string;implementation_sha256:string;params:Record<string,number|string>;params_json:Record<string,unknown>;horizon:Horizon;upstream:Record<string,string>;deps_sha256:string;formula_hash:string;status:MethodologyStatus;publishable:boolean;code_version:string;created_at:string;synced_at:string}
export type MethodologyEventKind='registered'|'status_changed'|'publishable_changed'|'resynced';
export interface MethodologyEvent{event_id:string;methodology_id:string;version:string;seq:number;event:MethodologyEventKind;status:MethodologyStatus;publishable:boolean;formula_hash:string;code_version:string;actor:string;reason:string|null;occurred_at:string}
export interface JudgmentRow{judgment_id:string;subject_type:PublicSubjectType;subject_key:string;judgment_type:JudgmentType;methodology_id:string;methodology_version:string;kind:Kind;producer_kind:'rule'|'model';producer_ref:ProducerRef;producer_nonce:string;as_of:string;registered_at:string;retrospective:boolean;inputs:Input[];inputs_hash:string;abstained:boolean;abstain_reason:string|null;claim:Claim|null;condition:Condition|null;horizon:Horizon|null;target:Target|null;label_policy:LabelPolicy|null;settle_after:string|null;settle_by:string|null;code_version:string;batch_id:string;created_at:string}
/** register_judgment input: registered_at/retrospective/created_at are set by the RPC (spec §5.6). */
export type JudgmentInsert=Omit<JudgmentRow,'registered_at'|'retrospective'|'created_at'>&{retrospective_hint:{label_available_at:string|null}};
export type SettlementKind='settled'|'void'|'withdrawn'|'reopened';
export interface Realized{value:number|string|boolean;label?:string;unit:string|null;from:string|null;to:string|null;label_policy:LabelPolicy}
export interface SettlementRow{settlement_id:string;judgment_id:string;seq:number;kind:SettlementKind;outcome:'hit'|'miss'|null;realized:Realized|null;evidence:Record<string,unknown>;resolver:string;resolver_version:string;reason:string|null;actor:string;settled_at:string;request_key:string;request_digest:string;code_version:string;batch_id:string}
/** append_settlement payload; the RPC assigns settlement_id/seq/settled_at (spec §5.6). */
export type SettlementInsert=Pick<SettlementRow,'kind'|'outcome'|'realized'|'evidence'|'resolver'|'resolver_version'|'reason'|'actor'|'code_version'|'batch_id'>;
export type QueueStatus='pending'|'unavailable'|'inconsistent'|'error';
/** cutoff = the resolution cutoff of the quarantine it accepts (payload.cutoff); a cutoff_vintage override is used only at that same cutoff (plan audit P1-03). */
export interface QuarantineOverride{reason_code:string;resolution:{kind:'accept_refetched';evidence_hash:string;evidence:Record<string,unknown>}|{kind:'choose_fact';chosen:Record<string,unknown>};evidence_hash:string;resolved_by:string;at:string;cutoff:string}
export interface QueueRow{judgment_id:string;settle_after:string;settle_by:string;label_policy:LabelPolicy;next_attempt_at:string;attempts:number;last_status:QueueStatus|null;last_detail:Record<string,unknown>;leased_until:string|null;lease_token:string|null;override:QuarantineOverride|null;closed_at:string|null;updated_at:string}
export interface QueuePatch{last_status:QueueStatus;last_detail:Record<string,unknown>;next_attempt_at:string;attempts_increment:0|1}
export type CalibrationState='insufficient'|'failed'|'calibrated'|'evaluated'|'self_assessed';
export type ScopeType='all'|'market'|'subject_type';
export interface CalibrationScope{scope_type:ScopeType;scope_key:string}
/** frozen_at / n: the freeze_calibration_cohort snapshot of the generation (plan audit P1-10); registered_at_lte = settled_at_lte = frozen_at. */
export interface QueryBounds{window_from:string;window_to:string;registered_at_lte:string;settled_at_lte:string;frozen_at:string;n:number}
export interface CalibrationRow{calibration_id:string;methodology_id:string;methodology_version:string;scope_type:ScopeType;scope_key:string;window_from:string;window_to:string;n_registered:number;n_settled:number;n_independent:number;n_void:number;n_retrospective_excluded:number;threshold_n:number;ece_max:number;kind:Kind;state:Exclude<CalibrationState,'self_assessed'>;valid_until:string;validity_revision:number;metrics:Record<string,unknown>;reliability:ReliabilityBin[];isotonic_segments:{x_min:number;x_max:number;p:number}[]|null;cohort_path:string;cohort_sha256:string;query_bounds:QueryBounds;fingerprint:string;algorithm_version:string;code_version:string;computed_at:string;batch_id:string}
export interface ReliabilityBin{bin_low:number;bin_high:number;n:number;mean_p:number|null;hit_rate:number|null;wilson_low:number|null;wilson_high:number|null}
/** latest_judgment_cards / judgment_history / calibration_cohort* row (spec §5.6 judgment_envelope). */
export interface Envelope{judgment:JudgmentRow;settlement:SettlementRow|null;calibration:CalibrationRow|null;calibration_valid:boolean;methodology_state:MethodologyEvent|null}
export type CardView='latest'|'as_known';
export type AppendStatus='applied'|'already_applied'|'already_final'|'request_key_conflict';

// ── data access (spec §5.7) ──
export interface JudgmentsDb{
 serverTime():Promise<string>;
 methodology(id:string,version:string):Promise<MethodologyRow|null>;
 subjectExists(subject:Subject):Promise<'active'|'inactive'|'missing'>;
 getJudgment(id:string):Promise<JudgmentRow|null>;
 /** Inputs containment lookup (GIN): judgments whose inputs contain {kind:'macro_snapshot',ref:{snapshot_id}} (spec §7.1). */
 judgmentsBySnapshot(snapshotId:string):Promise<string[]>;
 registerJudgment(row:JudgmentInsert,queue:{settle_after:string;settle_by:string;label_policy:LabelPolicy}|null):Promise<{registered_at:string;retrospective:boolean}>;
 latestCards(subject:Subject,opts:{types?:JudgmentType[];view:CardView;cutoff?:string}):Promise<Envelope[]>;
 historyOf(subject:Subject,type:JudgmentType,methodology:{id:string;version:string},opts:{view:CardView;cutoff?:string;before?:string;limit:number}):Promise<Envelope[]>;
 claimDue(limit:number,leaseSeconds:number):Promise<QueueRow[]>;
 /** Plan audit T-01: leases ONE queue row for the admin "settle one now" attempt (claim_judgment locks the row): open and not live-leased
  *  (a lease past leased_until counts as free) → {status:'claimed', lease_token, row} whatever next_attempt_at; a live lease → 'leased';
  *  a closed (or absent) queue → 'closed'. The caller then appends / quarantines / releases WITH that token, so a concurrent cron claim
  *  makes exactly one side lease_lost / leased. */
 claimOne(judgmentId:string,leaseSeconds:number):Promise<{status:'claimed';lease_token:string;row:QueueRow}|{status:'leased'|'closed'}>;
 /** Token-fenced release (§5.4). last_detail.incident (plan audit R3-01) is never written here: the locked row's open incident is
  *  carried over unchanged and a patch incident is ignored, so a transient pending / unavailable / error attempt cannot end it. */
 releaseLease(judgmentId:string,leaseToken:string,patch:QueuePatch):Promise<void>;
 queueRow(judgmentId:string):Promise<QueueRow|null>;
 queueList(opts:{filter:'due'|'backoff'|'leased'|'all';limit:number;after?:string}):Promise<QueueRow[]>;
 settlementsOf(judgmentIds:string[]):Promise<SettlementRow[]>;
 appendSettlement(judgmentId:string,leaseToken:string|null,requestKey:string,row:SettlementInsert):Promise<{seq:number;status:AppendStatus}>;
 /** Lease-checked quarantine publish (plan audit Q1-02): ONE transaction locks the queue row, checks the lease, upserts the open
  *  dq_quarantine item ('judgments' / 'judgment_settlements' / judgment_id / reasonCode) with payload, writes last_status
  *  'inconsistent' + last_detail = patch.last_detail with incident = {quarantine_id, reason_code, evidence_hash, cutoff, quarantined_at}
  *  (an open incident's quarantined_at is kept, Q1-01 / R3-01) + next_attempt_at,
  *  clears the lease; attempts unchanged. A lost lease writes nothing. */
 quarantineSettlement(judgmentId:string,leaseToken:string,reasonCode:string,payload:Record<string,unknown>,patch:QueuePatch,batchId:string):Promise<{status:'quarantined'|'lease_lost';quarantine_id:string|null}>;
 /** Atomic acceptance (plan audit P1-04): locks queue then item; only for the open queue's open incident (last_detail.incident, whatever
  *  the last attempt status, R3-01). override.evidence_hash / override.cutoff are the identity the hook read: both must equal the locked
  *  queue last_detail.incident AND the locked item payload (Q1-03); no open incident → 'stale'. */
 applyQuarantineOverride(judgmentId:string,override:QuarantineOverride,quarantineId:string,audit:Record<string,unknown>):Promise<'applied'|'stale'|'closed'|'item_not_open'>;
 /** Atomic rejection (plan audit P1-05): void + item resolved_reject + audit in one transaction; replay-safe on requestKey. expected = the
  *  evidence_hash / cutoff the hook read; no open incident, or any difference from the locked queue last_detail.incident (R3-01) or the
  *  item payload → 'stale' (Q1-03). The void closes the queue and so ends the incident. */
 rejectQuarantinedSettlement(judgmentId:string,quarantineId:string,expected:{evidence_hash:string;cutoff:string},requestKey:string,row:SettlementInsert,audit:Record<string,unknown>):Promise<{seq:number;status:AppendStatus|'stale'|'item_not_open'}>;
 /** Public envelope by id (plan audit P2-01; RLS-gated, judgment_history view semantics). */
 envelopeById(id:string,opts:{view:CardView;cutoff?:string}):Promise<Envelope|null>;
 calibrationCohort(methodology:string,version:string,window:{from:string;to:string},cutoff:string,after:string|null,limit:number):Promise<Envelope[]>;
 calibrationCohortInternal(methodology:string,version:string,window:{from:string;to:string},cutoff:string,after:string|null,limit:number):Promise<Envelope[]>;
 /** Freezes a calibration generation's cohort in one statement (plan audit P1-10). The generation is claimed first (marker
  *  cohort:<generation>, Q1-05): an already claimed generation — even an empty one — returns already_frozen with its stored
  *  frozen_at / n and inserts nothing. */
 freezeCalibrationCohort(generation:string,methodology:string,version:string,window:{from:string;to:string}):Promise<{status:'frozen'|'already_frozen';frozen_at:string;n:number}>;
 /** The frozen members of a generation, keyset on judgment_id; settlement = the one frozen with it. */
 cohortMembers(generation:string,after:string|null,limit:number):Promise<Envelope[]>;
 /** Deletes the generation's members and its marker; returns the member rows deleted. */
 clearCalibrationGeneration(generation:string):Promise<number>;
 latestCalibration(methodology:string,version:string,scope:CalibrationScope):Promise<{row:CalibrationRow;valid:boolean}|null>;
 calibrationValidity(methodology:string,version:string):Promise<{revision:number}>;
 insertCalibration(row:CalibrationRow,expectedRevision:number):Promise<'inserted'|'duplicate'|'stale_revision'>;
 syncMethodology(row:Omit<MethodologyRow,'created_at'|'synced_at'>,actor:string,reason:string|null):Promise<{changed:boolean;seq:number}>;
 listMethodologies(status?:MethodologyStatus):Promise<MethodologyRow[]>;
 methodologyStateAt(id:string,version:string,cutoff:string):Promise<MethodologyEvent|null>;
 jobState(job:string):Promise<{state:Record<string,unknown>;updated_at:string}|null>;
 /** Optimistic lock on updated_at; ok=false when the expectation failed. updated_at = the revision just written (plan audit T-04), so a writer keeps ownership of it. */
 setJobState(job:string,expectedUpdatedAt:string|null,state:Record<string,unknown>):Promise<{ok:boolean;updated_at:string|null}>;
 repairStaleBatches(dataset:string,olderThanSeconds:number):Promise<number>;
}

// ── macro read interface (spec §12.1; implemented by the macro workbench later, by fixtures now) ──
export interface RegimeResult{primary_state:Regime;secondary_state:Regime|null;scores:Record<Regime,number>;norm:Record<Regime,number>;coverage:number;margin_pp:number;growth_axis:number|null;inflation_axis:number|null}
export interface MacroSnapshotRow{snapshot_id:string;region:'US'|'CN';as_of:string;methodology_version:string;catalog_version:string;observation_ids:string[];regime:RegimeResult|null;created_at:string;status:'active'|'superseded'|'failed'}
export interface MacroObservationRef{series_id:string;period_end:string;vintage_id:string;value:number;unit:string;available_at:string}
export interface MacroReadApi{
 observation(observationId:string):Promise<MacroObservationRef|null>;
 snapshot(snapshotId:string):Promise<MacroSnapshotRow|null>;
 snapshotsSince(marker:{created_at:string;snapshot_id:string}|null,limit:number):Promise<MacroSnapshotRow[]>;
 seriesCatalog(region:'US'|'CN'):Promise<Record<string,unknown>[]>;
 classifyAsOf(region:'US'|'CN',referencePeriod:string,cutoff:string,macroMethodologyVersion:string):Promise<{regime:RegimeResult|null;observation_refs:MacroObservationRef[];catalog:{version:string;weights:Record<string,number>;rules_version:string}}>;
}

// ── inputs db (spec §5.7) ──
export type KlineFailure={failure:'unsupported'|'empty'|'not_found'|'rate_limited'|'transient'|'protocol'|'invalid_data'|'timeout'};
export interface KlineRangeRequest{ticker:string;market:PriceMarket;adjustment:Adjustment;source:KlineSourceName;from:string;to:string;signal:AbortSignal}
export interface DeriveAsOfResult{metrics:MetricRow[];envelope:ReadFactsResult}
export interface JudgmentInputsDb{
 facts:{readFacts(issuer:string,market:FactsMarket,opts:{concepts:string[];asOf:string;history?:boolean}):Promise<ReadFactsResult>;factsByIds(ids:string[]):Promise<FactRow[]>;filingsOfIssuer(issuer:string,market:FactsMarket,opts:{to?:string;limit?:number}):Promise<FilingRow[]>};
 deriveMetricsAsOf(issuer:string,market:FactsMarket,asOf:string,formulaVersion:string):Promise<DeriveAsOfResult>;
 macro:MacroReadApi;
 tableRows(table:PublicTable,naturalKey:string):Promise<Record<string,unknown>[]>;
 /** Public judgment lookup (anon; publishable only). */
 publicJudgment(id:string):Promise<JudgmentRow|null>;
 kline(req:KlineRangeRequest):Promise<SourceKlineSeries|KlineFailure>;
 issuerPrimarySecurity(issuerId:string,on:string):Promise<{ticker:string;market:PriceMarket}|null>;
}

// ── methodology module (spec §4.1) ──
export type Active<C extends Claim>={abstained:false;claim:C};
export interface WorkItem{
 subject:Subject;asOf:string;binding?:Record<string,string>;
 /** DB server time at which produce() observes inputs; set by produce from db.serverTime(); methods pass it to buildOrAbstain/buildInput. */
 observedAt:string;
}
export interface Methodology<C extends Claim=Claim>{
 id:string;version:string;judgment_type:JudgmentType;kind:Kind;producer_kind:ProducerKind;
 subject_types:SubjectType[];markets?:PriceMarket[];input_kinds:InputKind[];
 upstream?:{macro_methodology_version?:string;facts_formula_version?:string};
 title:Bilingual;doc:string;params:Record<string,number|string>;params_json?:Record<string,unknown>;horizon:Horizon;
 /** Non-import dependencies hashed into formula_hash (data files, rule tables). Paths relative to repo root. */
 deps:string[];
 /** Absolute repo-relative path of this module file (import-closure root for implementation_sha256). */
 module:string;
 status:MethodologyStatus;
 gather(item:WorkItem,db:JudgmentInputsDb):Promise<Input[]|Abstained>;
 resolveTarget(item:WorkItem,inputs:Input[],db:JudgmentInputsDb):Promise<Target|Abstained>;
 compute(subject:Subject,inputs:Input[]):Active<C>|Abstained;
 condition(subject:Subject,inputs:Input[],claim:C):Condition;
}

// ── resolvers (spec §7.2–§7.3) ──
export type ResolverResult=
 |{status:'resolved';value:number|string|boolean;label?:string;unit:string|null;from:string|null;to:string|null;label_available_at:string;evidence:Record<string,unknown>}
 |{status:'pending';reason:string;estimated_at?:string}
 |{status:'unavailable';failure:string}
 |{status:'inconsistent';reason_code:'settlement_basis_mismatch'|'settlement_ambiguous_fact'|'settlement_base_bar_missing'|'settlement_benchmark_gap';detail:Record<string,unknown>;evidence_hash:string;evidence:Record<string,unknown>};
export interface ResolveContext{judgment:JudgmentRow;cutoff:string;now:string;inputsDb:JudgmentInputsDb;signal:AbortSignal}
export interface Resolver{
 name:ResolverName;version:string;
 validateParams(params:unknown):boolean;
 /** Estimated earliest instant the label can be known (spec §3.4 retrospective rule 3); null = unknown. */
 labelAvailableAt(params:unknown,target:Target):string|null;
 /** Worst-case fetch time per judgment, for the cron budget (spec §7.1). */
 maxFetchMs:number;
 resolve(ctx:ResolveContext):Promise<ResolverResult>;
 /** Build the Resolved result from a quarantine override's frozen evidence (spec §7.6); no reads. */
 fromOverride(judgment:JudgmentRow,override:QuarantineOverride):ResolverResult;
}

// ── display (spec §9) ──
export type Lifecycle='abstained'|'open'|'settled'|'void'|'withdrawn'|'pending_fill';
export interface JudgmentCard{
 judgment_id:string;subject:Subject;judgment_type:JudgmentType;kind:Kind;
 lifecycle:Lifecycle;outcome:'hit'|'miss'|null;calibration:CalibrationState;retrospective:boolean;
 as_of:string;registered_at:string;
 methodology:{id:string;version:string;title:Bilingual;href:string};
 display:{headline:Bilingual;percent:number|null;value:number|string|[number,number]|null;scale?:{min:number;max:number};dims?:{id:string;label:Bilingual;value:number|null;coverage:boolean}[];band?:'low'|'mid'|'high';nominal_coverage?:number};
 condition:{text:Bilingual;horizon:Horizon;target:Target;label_policy:LabelPolicy;settle_after:string;settle_by:string}|null;
 settlement:{kind:SettlementKind;outcome:'hit'|'miss'|null;realized:Realized|null;settled_at:string;evidence_summary:Bilingual}|null;
 calibration_summary:{n_independent:number;n_total:number;threshold_n:number;brier:number|null;brier_skill:number|null;ece_raw_holdout:number|null;valid_until:string;hit_rate:{rate:number;low:number|null;high:number|null}|null;accuracy?:number|null;coverage?:number|null;spearman?:number|null;href:string}|null;
 inputs:{kind:InputKind;ref:unknown;available_at:string;origin:Origin;href:string|null}[];
 abstain_reason?:string;missing?:string[];
 merged_from?:string;
}
export interface PrivateJudgmentCard extends JudgmentCard{source:'recommendation'}
