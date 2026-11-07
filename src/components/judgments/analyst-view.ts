// src/components/judgments/analyst-view.ts
// Pure view logic for the /analyst confidence column and self-assessment block (spec §11.2, §8.6; canvas board 6).
// Confidence renders as a tercile band + "uncalibrated"; the registered p is a decimal shown only in the row expansion and is
// never formatted as a percent. Type-only imports, so this file is safe in client bundles.
import type {PrivateJudgmentCard} from '@/lib/judgments/types';
import type {SelfAssessment} from '@/lib/judgments/adapters/recommendation';
import type {Band} from '@/lib/judgments/band';

export const BANDS:readonly Band[]=['low','mid','high'];
export interface ConfidenceView{band:Band|null;registered:string|null;lifecycle:PrivateJudgmentCard['lifecycle']|null;outcome:'hit'|'miss'|null;
 abstainReason:string|null;condition:PrivateJudgmentCard['condition'];headline:PrivateJudgmentCard['display']['headline']|null}
export function confidenceView(card:PrivateJudgmentCard|null):ConfidenceView{
 if(!card)return {band:null,registered:null,lifecycle:null,outcome:null,abstainReason:null,condition:null,headline:null};
 const v=card.display.value;
 return {band:card.display.band??null,registered:typeof v==='number'?v.toFixed(2):null,lifecycle:card.lifecycle,outcome:card.outcome,
  abstainReason:card.abstain_reason??null,condition:card.condition,headline:card.display.headline};
}
/** One lit segment per band position (low | mid | high), as on the canvas. */
export const bandSegments=(band:Band|null)=>BANDS.map(b=>b===band);
const ratio=(v:number|null,d=3)=>v===null?'—':v.toFixed(d);
/** Hit rates are settlement statistics (spec §9.3 "命中率"), not the registered p, so they may be shown as a share. */
const share=(v:number|null)=>v===null?'—':`${Math.round(v*100)}%`;
const interval=(lo:number|null,hi:number|null)=>lo===null||hi===null?null:`${Math.round(lo*100)}–${Math.round(hi*100)}%`;
export interface SelfAssessmentView{empty:boolean;settled:number;independent:number;hitRate:string;interval:string|null;brier:string;brierSkill:string;
 bands:Array<{band:Band;n:number;hits:number;rate:string;interval:string|null}>}
export function selfAssessmentView(sa:SelfAssessment):SelfAssessmentView{
 return {empty:sa.n_independent===0,settled:sa.n_total,independent:sa.n_independent,hitRate:share(sa.hit_rate?.rate??null),
  interval:sa.hit_rate?interval(sa.hit_rate.low,sa.hit_rate.high):null,brier:ratio(sa.brier),
  brierSkill:sa.brier_skill===null?'—':`${sa.brier_skill>0?'+':''}${sa.brier_skill.toFixed(2)}`,
  bands:sa.bands.map(b=>({band:b.band,n:b.n,hits:b.hits,rate:share(b.rate),interval:interval(b.low,b.high)}))};
}
