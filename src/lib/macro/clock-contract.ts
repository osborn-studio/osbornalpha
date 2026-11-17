// Clock DTOs (P5 draft 8 §§2.4, 3.3, 5.2). Shared by projection, route and UI.
import type {Bilingual,ChangeKind,Region,SeriesType} from './types';
import type {Regime} from './judgment-contract';
import type {Lifecycle} from '@/lib/judgments/types';
export const CLOCK_VIEW_VERSION='macro-clock-view/1';
export type ClockStatus='ok'|'snapshot_not_active'|'version_unsupported'|'integrity_error'|'record_missing'|'reconcile_failed'|'f4_unavailable'|'f4_none'|'f4_earlier'|'f4_ineligible'|'f4_mismatch';
export type RegimeStatus='classified'|'coverage_below_threshold'|'zero_score'|'unknown';
export interface ClockDiagnostic{code:string;ids:string[]}
export interface ClockMeta{version:typeof CLOCK_VIEW_VERSION;status:ClockStatus;snapshot:{id:string;region:Region;as_of:string;created_at:string;catalog_version:string;methodology_version:string;rules_version:string|null};regime_status:RegimeStatus;f4:{judgment_id:string|null;lifecycle:Lifecycle|null;abstain_reason:string|null;earlier_snapshot_id:string|null;methodology_version:string|null};diagnostics:ClockDiagnostic[]}
export interface ClockCard{selected:Regime;lifecycle:'open'|'settled';calibration:string;methodology:{id:string;version:string;href:string};as_of:string}
export interface ClockSummary{primary:Regime;secondary:Regime|null;margin_pp:number;coverage:number;matched_weight:number;denominator:number;uncovered_weight:number;growth_axis:number|null;inflation_axis:number|null;scores:Record<Regime,number>;norm:Record<Regime,number>;tolerance:number}
export type RowState='matched'|'not_matched'|'no_data'|'missing'|'restricted';
export interface ClockObs{observation_id:string;period_end:string;value_text:string;version:number}
export interface ClockRow{series_id:string;name:Bilingual;type:SeriesType;unit:string;change_kind:ChangeKind;weight:number;state:RowState;latest:ClockObs|null;comparisons:(ClockObs&{roles:('prev'|'prev3m')[]})[];inputs_present:{prev:boolean;prev3m:boolean};display_change:{kind:ChangeKind;value_text:string}|null;rule:{id:string;label:Bilingual;support:Record<Regime,number>}|null;contribution:Record<Regime,number>|null;reason:Bilingual|null}
export interface DisplayRow{series_id:string;name:Bilingual;unit:string;latest:ClockObs|null}
export interface QuadrantView{regime:Regime;score:number;norm:number;rank:'primary'|'secondary'|'other';drivers:{series_id:string;name:Bilingual;contribution:number;weight:number;support:number}[]}
export type ClockOk=ClockMeta&{status:'ok';card:ClockCard;summary:ClockSummary;quadrants:QuadrantView[];rows:ClockRow[];display_only_rows:DisplayRow[]};
export type ClockView=ClockOk|(ClockMeta&{status:Exclude<ClockStatus,'ok'>});
export interface F4Claim{selected:Regime;distribution:Record<Regime,number>;margin_pp:number|null;catalog_version:string|null;scores_are_not_probabilities:true}
export type F4Match=|{status:'card';card:ClockCard;judgment_id:string;claim:F4Claim}|{status:'none'}|{status:'earlier';judgment_id:string;earlier_snapshot_id:string}|{status:'ineligible';judgment_id:string;lifecycle:Lifecycle;abstain_reason:string|null}|{status:'unavailable';reason:string};
export interface MethodManifestRow{series_id:string;type:SeriesType|null;unit:string;change_kind:ChangeKind;name:Bilingual;weight:number;display_only:boolean;state:RowState;reason:Bilingual|null;latest_observation_id:string|null;prev_observation_id:string|null;prev3m_observation_id:string|null;matched:boolean;rule_id:string|null;support:Record<Regime,number>|null;contribution:Record<Regime,number>|null}
export interface MethodManifest{version:'macro-method-manifest/1';weights_version:string;rules_version:string;catalog_version:string;denominator:number;rows:MethodManifestRow[]}
