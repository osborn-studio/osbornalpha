// src/lib/macro/judgment-contract.ts
// Mirror of the F4 judgment contract pieces the macro module implements or renders (F4 plan
// 2026-11-06-judgment-framework.md shared contract; F4 spec §11.1, §12.1). F4 is not on main yet:
// when it lands, these declarations are replaced by imports from src/lib/judgments and a type
// test asserts assignability both ways. Do not add fields here that F4 does not define.
export type Regime='recovery'|'overheat'|'stagflation'|'recession';
export const REGIMES:readonly Regime[]=['recovery','overheat','stagflation','recession'];   // also the tie-break order
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
export interface Bilingual{zh:string;en:string}
/** Minimal subset of F4 JudgmentCard that MacroJudgmentSlot renders; unknown fields are ignored. */
export interface JudgmentCardView{
 judgment_id:string;lifecycle:'abstained'|'open'|'settled'|'void'|'withdrawn'|'pending_fill';calibration:string;as_of:string;
 methodology:{id:string;version:string;title:Bilingual;href:string};
 display:{headline:Bilingual;percent:number|null;value:number|string|[number,number]|null};
 abstain_reason?:string;
}
