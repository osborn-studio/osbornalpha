// src/lib/macro/strategy/deviations.ts
// Deviation cases macro-deviations/1 (spec 2026-11-07 §6.4, draft 3 N13; judgment layer on only). Enumerate macro_regime
// cards of a region through F4: latest card, then /history pages until an empty page; more than 5000 cards → incomplete.
// The cursor is the last card's as_of (exclusive `before`). Advancing past a FULL page with that timestamp-only cursor
// can never prove that no unseen card shares the boundary as_of (the page may end [… T+1, T] while another card with T
// sits behind it), so every full page marks the result incomplete; the walk still continues to collect the rest. Only
// a stable (as_of, judgment_id) cursor from F4 (plan open item D19) can lift this. A cursor that does not move stops the
// walk, incomplete.
// Keep macro_regime@v1 cards with lifecycle 'settled' whose latest settlement outcome is 'miss'. For each, diff the
// registered inputs (macro_observation frozen projections) against the latest settlement's evidence.observation_refs,
// matched by (series_id, period_end); classification is exhaustive (revised / unchanged / dropped / newly_available with
// later_period / backfill / new_series). Evidence without observation_refs → evidence_incomplete; never recomputed here.
// No narrative. F4Unavailable propagates to the route (→ 503 judgments_unavailable).
import type {DeviationCase,DiffKind,NewlySubkind,Region} from './contract';
import {asRegime,type F4CardLite,type F4Client,type F4JudgmentDetail} from './f4-client';

export const DEVIATION_CAP=5000;
export const HISTORY_PAGE=500;
export const METHOD={id:'macro_regime',version:'v1'} as const;
export interface FrozenObs{series_id:string;period_end:string;vintage_id:string;value:number}
type Diff=DeviationCase['diffs'][number];

const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
function frozenObs(v:unknown):FrozenObs|null{
 if(!isObj(v))return null;
 const value=typeof v.value==='number'?v.value:typeof v.value==='string'&&v.value.trim()!==''?Number(v.value):NaN;
 if(typeof v.series_id!=='string'||typeof v.period_end!=='string'||typeof v.vintage_id!=='string'||!Number.isFinite(value))return null;
 return {series_id:v.series_id,period_end:v.period_end,vintage_id:v.vintage_id,value};
}
const latestPeriods=(rows:readonly FrozenObs[])=>{const m=new Map<string,string>();for(const r of rows){const p=m.get(r.series_id);if(!p||r.period_end>p)m.set(r.series_id,r.period_end);}return m;};
/** Exhaustive diff of registered vs settled observations (spec §6.4 N13). settled = null → evidence incomplete (no diffs). */
export function classifyDiffs(registered:readonly FrozenObs[],settled:readonly FrozenObs[]):Diff[]{
 const key=(r:FrozenObs)=>`${r.series_id}|${r.period_end}`;
 const reg=new Map(registered.map(r=>[key(r),r]));const set=new Map(settled.map(r=>[key(r),r]));
 const regLatest=latestPeriods(registered);const setLatest=latestPeriods(settled);
 const role=(latest:Map<string,string>,r:FrozenObs):'latest'|'comparison'=>latest.get(r.series_id)===r.period_end?'latest':'comparison';
 const cell=(r:FrozenObs|undefined)=>r?{vintage_id:r.vintage_id,value:r.value}:null;
 const out:Diff[]=[];
 for(const k of [...new Set([...reg.keys(),...set.keys()])].sort()){
  const a=reg.get(k);const b=set.get(k);const any=(a??b)!;
  let kind:DiffKind;let subkind:NewlySubkind|null=null;
  if(a&&b)kind=a.vintage_id===b.vintage_id?'unchanged':'revised';
  else if(a)kind='dropped';
  else{kind='newly_available';const l=regLatest.get(any.series_id);subkind=l===undefined?'new_series':any.period_end>l?'later_period':'backfill';}
  out.push({series_id:any.series_id,period_end:any.period_end,role:a?role(regLatest,a):role(setLatest,b!),kind,subkind,registered:cell(a),settled:cell(b)});
 }
 return out;
}
/** null unless the card is macro_regime@v1, settled, and its latest settlement is a miss. */
export function deviationCase(region:Region,card:F4CardLite,detail:F4JudgmentDetail):DeviationCase|null{
 if(card.methodology.id!==METHOD.id||card.methodology.version!==METHOD.version||card.lifecycle!=='settled')return null;
 const latest=[...detail.settlements].sort((x,y)=>x.settled_at<y.settled_at?1:x.settled_at>y.settled_at?-1:0)[0];
 if(!latest||latest.outcome!=='miss')return null;
 const selected=detail.selected??card.selected;if(!selected)return null;
 const registered=detail.inputs.filter(i=>i.kind==='macro_observation').map(i=>frozenObs(i.snapshot)).filter((x):x is FrozenObs=>x!==null);
 const refs=latest.evidence?.observation_refs;
 const realized=asRegime(latest.realized)??(isObj(latest.realized)?asRegime(latest.realized.selected)??asRegime(latest.realized.primary_state):null);
 const base={judgment_id:detail.judgment_id,settlement_id:latest.settlement_id??null,region,as_of:detail.as_of,selected,realized};
 if(!Array.isArray(refs))return {...base,evidence_state:'evidence_incomplete',diffs:[]};
 const settled=refs.map(frozenObs);
 if(settled.some(x=>x===null))return {...base,evidence_state:'evidence_incomplete',diffs:[]};
 return {...base,evidence_state:'complete',diffs:classifyDiffs(registered,settled as FrozenObs[])};
}
/** Enumerate the region's macro_regime cards to an empty history page (cap 5000), then build cases for settled misses. */
export async function listDeviationCases(f4:F4Client,region:Region):Promise<{cases:DeviationCase[];incomplete:boolean}>{
 const latest=await f4.latestRegimeCard(region);
 if(!latest)return {cases:[],incomplete:false};
 const seen=new Map<string,F4CardLite>([[latest.judgment_id,latest]]);let incomplete=false;let before:string|null=null;
 for(;;){
  const page=await f4.history(latest.judgment_id,before,HISTORY_PAGE);
  if(page.length===0)break;
  for(const c of page)if(!seen.has(c.judgment_id))seen.set(c.judgment_id,c);
  if(seen.size>DEVIATION_CAP){incomplete=true;break;}
  const next=page[page.length-1].as_of;
  if(before!==null&&next>=before){incomplete=true;break;}   // cursor did not move: stop rather than loop
  if(page.length>=HISTORY_PAGE)incomplete=true;             // full page + timestamp-only cursor: completeness unprovable (R2-3)
  before=next;
 }
 const cards=[...seen.values()].slice(0,DEVIATION_CAP).filter(c=>c.methodology.id===METHOD.id&&c.methodology.version===METHOD.version&&c.lifecycle==='settled');
 const cases:DeviationCase[]=[];
 for(const c of cards){
  const detail=await f4.judgmentDetail(c.judgment_id);if(!detail)continue;
  const dc=deviationCase(region,c,detail);if(dc)cases.push(dc);
 }
 cases.sort((x,y)=>x.as_of<y.as_of?1:x.as_of>y.as_of?-1:x.judgment_id<y.judgment_id?-1:1);
 return {cases,incomplete};
}
