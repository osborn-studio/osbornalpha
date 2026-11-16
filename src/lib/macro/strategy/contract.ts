// src/lib/macro/strategy/contract.ts
// Shared types of the macro strategy module (spec 2026-11-07 §4–§6). The P1+P2 declarations are no longer mirrored: since
// WP-S6 they are the real types from src/lib/macro/{types,judgment-contract,events}. Types the strategy code only partly
// needs are narrowed projections (Pick / Omit) of the real ones, so P1 drift fails typecheck; contract.types.test.ts pins
// the relation both ways. RulesView / RuleRow are this module's own projection of P1 regime.ts RULES.
import type * as P1 from '../types';
import type {EventInput as P2EventInput,PolicyEvent as P2PolicyEvent} from '../events';
import {REGIMES as P1_REGIMES,type Regime as P1Regime} from '../judgment-contract';
// ---- P1+P2 types (re-exports and projections) ----
export type Region=P1.Region;
export type SeriesType=P1.SeriesType;
export type ChangeKind=P1.ChangeKind;
export type Bilingual=P1.Bilingual;
export type DeriveRule=P1.DeriveRule;
/** Real MacroSeriesDef with the source narrowed to the fields strategy code reads (adapter / seriesKey / attribution dropped). */
export type MacroSeriesDef=Omit<P1.MacroSeriesDef,'source'>&{source:Pick<P1.SeriesSource,'publisher'|'via'|'fetchHost'|'rights'>|null};
/** Real ObservationRow without storage-only members (locator, code_version, batch_id). */
export type ObservationRow=Omit<P1.ObservationRow,'locator'|'code_version'|'batch_id'>;
/** Real SnapshotRecord without failure_reason. */
export type SnapshotRecord=Omit<P1.SnapshotRecord,'failure_reason'>;
export type Regime=P1Regime;
export const REGIMES:readonly Regime[]=P1_REGIMES;
export type Timeliness=P1.Timeliness;
export type EventInput=P2EventInput;
export type PolicyEvent=P2PolicyEvent;
/** Read-only projection of P1 regime.ts RULES (spec §5.2). support values are rule parameters, never shown as percentages. */
export interface RuleRow{rule_id:string;type:SeriesType;condition:Bilingual;support:Partial<Record<Regime,number>>}
export interface RulesView{rulesVersion:string;rows:RuleRow[]}
// ---- this module ----
export type ManifestKind='transmission'|'policy_response'|'cycle_table'|'review'|'explain_facts';
export type InputSource={kind:'snapshot';snapshot_id:string}|{kind:'history';as_of:string};
export interface ManifestInput{series_id:string;role:string;observation_id:string;period_end:string;value_text:string;version:number;available_at:string;source:InputSource}
export type EventBasis='range'|'single_target'|'single_to_range';
export type StrategyPolicyEvent=PolicyEvent&{basis:EventBasis};
/** transition_unverified: the 2008 switch could not be verified (near = 2008-12-16). history_truncated: an event-source read
 *  was truncated, so there are no events at all (near = the cutoff date); views show it, never an empty history. */
export interface EventGap{kind:'transition_unverified'|'history_truncated';reason:string;near:string}
export interface FrozenSnapshot{snapshot_id:string;created_at:string;as_of:string;catalog_counts:{verified:number;missing:number;restricted:number};observation_ids:string[];history_ids:string[]}
/** Catalog projection frozen into a manifest (spec §4.5 N2): replay never reads the live catalog. */
export type FrozenSeriesDef=Pick<MacroSeriesDef,'id'|'region'|'role'|'type'|'name'|'unit'|'status'|'reason'|'aliasOf'|'derive'|'changeKind'|'releaseLagDays'|'nativeFrequency'|'period'>;
export interface ManifestRead{series_id:string;purpose:string;state:'ok'|'missing'|'truncated'}
/** The whole canonical manifest body; manifest_hash = sha256Hex(canonicalJson(body)) is its single identity (spec §4.4 N3).
 *  params = the calculation parameters (transmission {region}, policy_response {window}, cycle_table {boundary}, review
 *  {region, month}, explain_facts {subject…}); views and replay read them from here. facts (explain_facts only) = the exact
 *  fact list given to the model, so an explanation's input is rebuilt from its manifest alone. */
export interface StrategyManifest{
 kind:ManifestKind;params:Record<string,string|number>;cutoff:string;
 snapshots:{US:FrozenSnapshot|null;CN:FrozenSnapshot|null};
 baseline?:{cutoff:string;US:FrozenSnapshot|null;CN:FrozenSnapshot|null};
 catalog:FrozenSeriesDef[];rules?:RulesView;reads:ManifestRead[];
 inputs:ManifestInput[];events?:StrategyPolicyEvent[];gaps?:EventGap[];timeliness?:{series_id:string;state:Timeliness}[];facts?:Fact[];
 catalog_version:string;method_version:string;code_version:string;
}
export interface StoredManifest{manifest_id:string;manifest_hash:string;body:StrategyManifest;created_at:string}
/** Role of an observation taken from a snapshot (spec §4.5): 'latest' = max period_end; 'prev' / 'prev3m' = comparison periods.
 *  ManifestInput.role is '<purpose>:<series_id>:<latest|prev|prev3m|base|end|from|to|month_end|history|evidence>' — writers use the helpers in
 *  manifest.ts ('history' = a whole daily window, cycle-table columns; 'evidence' = an event-source row an event or the 2008 switch check reads). */
export type SnapshotRole='latest'|'prev'|'prev3m';
export type NodeState='observed'|'derived'|'assumption'|'missing'|'restricted'|'not_in_catalog';
export interface ObsRef{observation_id:string;series_id:string;period_end:string;value_text:string;version:number;available_at:string;source:InputSource}
export interface NodeView{id:string;state:NodeState;label:Bilingual;value_text:string|null;unit:string|null;period_end:string|null;inputs:ObsRef[];reason:Bilingual|null}
export type Stage='economy'|'policy'|'liquidity'|'rates'|'risk'|'assets';
export interface TransmissionView{version:string;region:Region;manifest_id:string;cutoff:string;snapshots:{US:string|null;CN:string|null};catalog_version:string;stages:{stage:Stage;label:Bilingual;nodes:NodeView[];edge:{text:Bilingual;kind:'assumption'}|null}[]}
export interface PlaybookView{regime:Regime;title:Bilingual;triggers:{rule_id:string;type:SeriesType;condition:Bilingual;support:number}[];mechanism:Bilingual[];implications:{favored:Bilingual[];disfavored:Bilingual[]};watch:{series_id:string;name:Bilingual}[]}
export interface F4Mark{regime:Regime|null;judgment_id:string;snapshot_match:boolean;as_of:string}
/** Number-free F4 summary rendered by P3/P4 (spec §5.2 N12). Never carries distribution, margin, accuracy or percent. */
export interface F4Summary{judgment_id:string;selected:Regime|null;lifecycle:string;outcome:'hit'|'miss'|null;calibration:string;methodology:{id:string;version:string};as_of:string;href:string|null}
export type JudgmentStatus='disabled'|'unavailable'|'ok';
export interface TransmissionResponse{transmission:TransmissionView;playbooks:PlaybookView[];judgment_status:JudgmentStatus;f4?:{mark:F4Mark;summary:F4Summary}}
export type ExclusionReason='incomplete_window'|'overlap'|'non_positive_base'|'missing_endpoint';
export interface EndpointRef{period_end:string;value_text:string;inputs:ObsRef[]}   // spread endpoints carry two inputs
export interface EventRow{effective_date:string;change_bp:string;basis:EventBasis;base:EndpointRef|null;end:EndpointRef|null;change_raw:number|null;change_text:string|null;selected:boolean;exclusion:ExclusionReason|null}
export type Cell=
 |{status:'stats';n:number;median_raw:number;q1_raw:number;q3_raw:number;unit:'pct'|'bp';events:EventRow[]}
 |{status:'events_only';n:number;unit:'pct'|'bp';events:EventRow[]}
 |{status:'insufficient';unit:'pct'|'bp';events:EventRow[]}
 |{status:'restricted'|'not_in_catalog'|'missing';reason:Bilingual};
export interface ResponseDim{id:string;label:Bilingual;unit:'pct'|'bp';kind:'series'|'spread'|'restricted'|'not_in_catalog';series?:string;a?:string;b?:string;coverage:{from:string|null;to:string|null}}
export interface PolicyResponseView{version:string;window:1|3|6;manifest_id:string;cutoff:string;dims:ResponseDim[];rows:{direction:'hike'|'cut'|'qe_qt';cells:Record<string,Cell>}[];sentences:Bilingual[]}
export type Boundary='event_day'|'first_trading_day'|'month_end';
export interface Episode{index:number;direction:'hike'|'cut';start:string;end:string;events:number;upper_from:string;upper_to:string;cumulative_bp:string;left_censored:boolean;ongoing:boolean;gap_after:boolean}
export type CycleCell={status:'ok';from:ObsRef;to:ObsRef;change_raw:number|null;change_text:string;change_kind:'pct'|'bp'}|{status:'missing';reason:'out_of_coverage'|'degenerate'|'non_positive_base'|'history_truncated'|'month_not_closed'}|{status:'restricted'};
export interface CycleColumn{id:string;label:Bilingual;change_kind:'pct'|'bp';daily_series:string|null;monthly_series:string|null;restricted:boolean}
export interface CycleTableView{version:string;episodes_version:string;boundary:Boundary;manifest_id:string;cutoff:string;episodes:Episode[];columns:CycleColumn[];cells:Record<string,Record<string,CycleCell>>;gaps:EventGap[]}  // cells[episodeIndex][columnId]
export type FactKind='level'|'change'|'policy_event'|'derived'|'response_cell'|'revision'|'release'|'timeliness'|'episode'|'asset_move'|'coverage';
export interface Fact{fact_id:string;kind:FactKind;template:string;slots:Record<string,{value_text:string;unit:string}|string>;series_id?:string;period_end?:string;source_inputs:string[]}
export interface ReviewFacts{
 region:Region;month:string;cutoff:string;baseline_cutoff:string;snapshot_id:string|null;baseline_snapshot_id:string|null;baseline_missing:boolean;
 releases:Fact[];revisions:Fact[];timeliness:Fact[];policy_events:Fact[];episode_changes:Fact[];asset_moves:Fact[];coverage:Fact[];
}
export type ReviewStatus='ok'|'insufficient';
export interface ReviewResult{result_id:string;region:Region;month:string;status:ReviewStatus;manifest_id:string;manifest_hash:string;facts:ReviewFacts;method_version:string;code_version:string;created_at:string}
export type ExplanationState='running'|'accepted'|'rejected'|'failed'|'abandoned';
export interface RenderedExplanation{facts:{fact_id:string;text:string}[];hypotheses:{text:string;fact_ids:string[]}[];counterpoints:{text:string;fact_ids:string[]}[]}
export interface ExplanationProjection{explanation_id:string;subject_kind:'snapshot'|'review';subject_id:string;locale:'zh'|'en';manifest_id:string;state:ExplanationState;rendered:RenderedExplanation|null;failure_codes:string[];provider:string|null;model:string|null;prompt_version:string;validator_version:string;created_at:string;finished_at:string|null}
export type DiffKind='revised'|'dropped'|'unchanged'|'newly_available';
export type NewlySubkind='later_period'|'backfill'|'new_series';
export interface DeviationCase{judgment_id:string;settlement_id:string|null;region:Region;as_of:string;selected:Regime;realized:Regime|null;evidence_state:'complete'|'evidence_incomplete';diffs:{series_id:string;period_end:string;role:'latest'|'comparison';kind:DiffKind;subkind:NewlySubkind|null;registered:{vintage_id:string;value:number}|null;settled:{vintage_id:string;value:number}|null}[]}
export const VERSIONS={transmission:'macro-transmission/1',playbooks:'macro-playbooks/1',events:'macro-strategy-events/1',response:'macro-policy-response/1',
 cycleTable:'macro-cycle-table/1',episodes:'macro-policy-episodes/1',facts:'macro-facts/1',review:'macro-review/1',prompt:'macro-explain-prompt/1',
 validator:'macro-explain-validator/1',deviations:'macro-deviations/1'} as const;
