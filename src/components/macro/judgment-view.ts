// src/components/macro/judgment-view.ts
// Validate F4 response fields at the frontend boundary. Clock selection uses categorical display.value only.
import type {Bilingual,JudgmentCardView} from '@/lib/macro/judgment-contract';
import type {RegimeContribution} from '@/lib/macro/types';
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const isBilingual=(v:unknown):v is Bilingual=>isObj(v)&&typeof v.zh==='string'&&typeof v.en==='string';
const LIFECYCLES=new Set(['abstained','open','settled','void','withdrawn','pending_fill']);
/** A card plus the macro snapshot its judgment was computed from (null when the card does not say). */
export type JudgmentCard=JudgmentCardView&{input_snapshot_id:string|null; judgment_type:unknown; kind:unknown; subject:unknown; retrospective:unknown; has_snapshot_input:boolean; settlement_summary:Bilingual|null};
/** Every field the slot renders is validated, including nested ones: a card that fails is not rendered. */
function toCard(v:unknown):JudgmentCard|null{
 if(!isObj(v)||typeof v.judgment_id!=='string'||typeof v.lifecycle!=='string'||!LIFECYCLES.has(v.lifecycle)||typeof v.calibration!=='string'||typeof v.as_of!=='string')return null;
 const m=v.methodology,d=v.display;
 if(!isObj(m)||typeof m.id!=='string'||typeof m.version!=='string'||!isBilingual(m.title)||typeof m.href!=='string'||(!/^\/(?!\/)/.test(m.href)||/[\\\u0000-\u0020]/.test(m.href)))return null;
 if(!isObj(d)||!isBilingual(d.headline))return null;
 if(d.percent!==undefined&&d.percent!==null&&typeof d.percent!=='number')return null;
 if(v.abstain_reason!==undefined&&typeof v.abstain_reason!=='string')return null;
 const inputs=isObj(v.inputs)?v.inputs.snapshot_id:undefined;
 const refs=Array.isArray(v.inputs)?v.inputs.filter(i=>isObj(i)&&i.kind==='macro_snapshot').map(i=>isObj(i.ref)?i.ref.snapshot_id:null):[];
 const snap=refs.length===1&&typeof refs[0]==='string'&&refs[0].length>0?refs[0]:Array.isArray(v.inputs)?null:[v.input_snapshot_id,v.macro_snapshot_id,inputs].find((x):x is string=>typeof x==='string')??null;
 return {has_snapshot_input:Array.isArray(v.inputs)&&refs.length===1&&snap!==null,settlement_summary:isObj(v.settlement)&&isBilingual(v.settlement.evidence_summary)?v.settlement.evidence_summary:null,judgment_type:v.judgment_type,kind:v.kind,subject:v.subject,retrospective:v.retrospective,judgment_id:v.judgment_id,lifecycle:v.lifecycle as JudgmentCardView['lifecycle'],calibration:v.calibration,as_of:v.as_of,
  methodology:{id:m.id,version:m.version,title:m.title,href:m.href},
  display:{headline:d.headline,percent:typeof d.percent==='number'?d.percent:null,value:(d.value as JudgmentCardView['display']['value'])??null},
  ...(typeof v.abstain_reason==='string'?{abstain_reason:v.abstain_reason}:{}),input_snapshot_id:snap};
}
/** A valid envelope (array, {judgments}, {cards} or {judgment}) with all cards well-formed → ok (possibly empty); anything else → malformed. */
export function parseJudgments(json:unknown):{ok:true;cards:JudgmentCard[]}|{ok:false}{
 const list:unknown[]|null=Array.isArray(json)?json:isObj(json)?(Array.isArray(json.judgments)?json.judgments:Array.isArray(json.cards)?json.cards:isObj(json.judgment)?[json.judgment]:null):null;
 if(list===null)return {ok:false};
 const cards=list.map(toCard);
 return cards.every(c=>c!==null)?{ok:true,cards:cards as JudgmentCard[]}:{ok:false};
}
export const percentOf=(c:JudgmentCardView):number|null=>typeof c.display.percent==='number'&&Number.isFinite(c.display.percent)?c.display.percent:null;
export function contributionsFrom(json:unknown):RegimeContribution[]{
 const candidates=[isObj(json)?json.contributions:undefined,isObj(json)&&isObj(json.regime)?json.regime.contributions:undefined,isObj(json)&&isObj(json.snapshot)?json.snapshot.contributions:undefined];
 const arr=candidates.find(Array.isArray) as unknown[]|undefined;
 return (arr??[]).filter((c):c is RegimeContribution=>isObj(c)&&typeof c.series_id==='string'&&typeof c.rule_id==='string'&&typeof c.observation_id==='string'&&typeof c.weight==='number'&&Number.isFinite(c.weight)&&isObj(c.contribution)&&Object.values(c.contribution).every(x=>typeof x==='number'&&Number.isFinite(x)));
}
export const contributionText=(c:RegimeContribution):string=>Object.entries(c.contribution).filter(([,v])=>v!==0).map(([k,v])=>`${k} ${v}`).join(' · ')||'0';

export type ClockView={selected:import('@/lib/macro/judgment-contract').Regime|null;card:JudgmentCard|null;reason:string|null};
/** Only the latest-view public F4 categorical card may select a quadrant. Never parse the headline. */
export function clockFrom(cards:JudgmentCard[],region:'US'|'CN'):ClockView{
 const matching=cards.filter(c=>c.methodology.id==='macro_regime'&&c.methodology.version==='v2');
 if(matching.length!==1)return {selected:null,card:null,reason:matching.length?'ambiguous':'missing'};
 const card=matching[0];
 const no=(reason:string):ClockView=>({selected:null,card,reason});
 if(!['insufficient','failed','calibrated'].includes(card.calibration)||card.judgment_type!=='macro_regime'||card.kind!=='categorical'||!isObj(card.subject)||card.subject.type!=='macro_region'||card.subject.key!==region||card.retrospective!==false||!Number.isFinite(Date.parse(card.as_of)))return no('invalid');
 if(card.lifecycle!=='open')return no(card.lifecycle);
 if(!card.has_snapshot_input||!card.input_snapshot_id)return no('snapshot');
 const value=card.display.value;
 if(value!=='recovery'&&value!=='overheat'&&value!=='stagflation'&&value!=='recession')return no('invalid');
 // F4 categorical cards never carry a probability percentage.
 if(card.display.percent!==null)return no('invalid');
 return {selected:value,card,reason:null};
}
/** Bind the fetched evidence to the requested immutable snapshot, never the overview snapshot. */
export function basisFrom(json:unknown,snapshotId:string):RegimeContribution[]|null{
 if(!isObj(json)||!isObj(json.snapshot)||json.snapshot.snapshot_id!==snapshotId)return null;
 return contributionsFrom(json);
}
