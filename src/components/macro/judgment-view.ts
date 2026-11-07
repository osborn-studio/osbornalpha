// src/components/macro/judgment-view.ts
// Reading F4 responses for MacroJudgmentSlot (spec §3.2). F4's /api/judgments is not on main yet, so its envelope is
// read tolerantly; only well-formed JudgmentCardView entries render. A percent is shown only when display.percent is
// a finite number.
import type {JudgmentCardView} from '@/lib/macro/judgment-contract';
import type {RegimeContribution} from '@/lib/macro/types';
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
function isCard(v:unknown):v is JudgmentCardView{
 return isObj(v)&&typeof v.judgment_id==='string'&&typeof v.lifecycle==='string'&&typeof v.as_of==='string'&&isObj(v.methodology)&&isObj(v.display)&&isObj(v.display.headline);
}
export function cardsFromResponse(json:unknown):JudgmentCardView[]{
 const list:unknown[]=Array.isArray(json)?json:isObj(json)?(Array.isArray(json.judgments)?json.judgments:Array.isArray(json.cards)?json.cards:isObj(json.judgment)?[json.judgment]:[]):[];
 return list.filter(isCard);
}
export const percentOf=(c:JudgmentCardView):number|null=>typeof c.display.percent==='number'&&Number.isFinite(c.display.percent)?c.display.percent:null;
export function contributionsFrom(json:unknown):RegimeContribution[]{
 const candidates=[isObj(json)?json.contributions:undefined,isObj(json)&&isObj(json.regime)?json.regime.contributions:undefined,isObj(json)&&isObj(json.snapshot)?json.snapshot.contributions:undefined];
 const arr=candidates.find(Array.isArray) as unknown[]|undefined;
 return (arr??[]).filter((c):c is RegimeContribution=>isObj(c)&&typeof c.series_id==='string'&&typeof c.rule_id==='string'&&typeof c.weight==='number'&&isObj(c.contribution));
}
export const contributionText=(c:RegimeContribution):string=>Object.entries(c.contribution).filter(([,v])=>v!==0).map(([k,v])=>`${k} ${v}`).join(' · ')||'0';
