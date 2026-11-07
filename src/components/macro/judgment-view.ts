// src/components/macro/judgment-view.ts
// Reading F4 responses for MacroJudgmentSlot (spec §3.2). F4's /api/judgments is not on main yet, so its envelope is
// read tolerantly but validated: a malformed envelope is "unavailable", a valid empty list is "no judgments". A percent is shown only when display.percent is
// a finite number.
import type {Bilingual,JudgmentCardView} from '@/lib/macro/judgment-contract';
import type {RegimeContribution} from '@/lib/macro/types';
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const isBilingual=(v:unknown):v is Bilingual=>isObj(v)&&typeof v.zh==='string'&&typeof v.en==='string';
const LIFECYCLES=new Set(['abstained','open','settled','void','withdrawn','pending_fill']);
/** A card plus the macro snapshot its judgment was computed from (null when the card does not say). */
export type JudgmentCard=JudgmentCardView&{input_snapshot_id:string|null};
/** Every field the slot renders is validated, including nested ones: a card that fails is not rendered. */
function toCard(v:unknown):JudgmentCard|null{
 if(!isObj(v)||typeof v.judgment_id!=='string'||typeof v.lifecycle!=='string'||!LIFECYCLES.has(v.lifecycle)||typeof v.calibration!=='string'||typeof v.as_of!=='string')return null;
 const m=v.methodology,d=v.display;
 if(!isObj(m)||typeof m.id!=='string'||typeof m.version!=='string'||!isBilingual(m.title)||typeof m.href!=='string'||!/^\/(?!\/)/.test(m.href))return null;
 if(!isObj(d)||!isBilingual(d.headline))return null;
 if(d.percent!==undefined&&d.percent!==null&&typeof d.percent!=='number')return null;
 if(v.abstain_reason!==undefined&&typeof v.abstain_reason!=='string')return null;
 const inputs=isObj(v.inputs)?v.inputs.snapshot_id:undefined;
 const snap=[v.input_snapshot_id,v.macro_snapshot_id,inputs].find((x):x is string=>typeof x==='string')??null;
 return {judgment_id:v.judgment_id,lifecycle:v.lifecycle as JudgmentCardView['lifecycle'],calibration:v.calibration,as_of:v.as_of,
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
 return (arr??[]).filter((c):c is RegimeContribution=>isObj(c)&&typeof c.series_id==='string'&&typeof c.rule_id==='string'&&typeof c.weight==='number'&&isObj(c.contribution)&&Object.values(c.contribution).every(x=>typeof x==='number'));
}
export const contributionText=(c:RegimeContribution):string=>Object.entries(c.contribution).filter(([,v])=>v!==0).map(([k,v])=>`${k} ${v}`).join(' · ')||'0';
