// src/lib/macro/strategy/f4-client.ts
// F4 read client (spec 2026-11-07 §9.1 last paragraph, §5.2, §6.2, §6.4). P3/P4 never import src/lib/judgments: they read
// F4's public HTTP routes on this site (NEXT_PUBLIC_SITE_URL) with a 3-second timeout. Any failure (no base URL, network,
// timeout, non-2xx, a 404 that is not JSON i.e. the route does not exist, malformed body) throws F4Unavailable; a JSON 404
// from the detail route means "no such judgment" → null. Only number-free fields are projected (spec §5.2 N12).
// F4CardLite / F4JudgmentDetail live in f4-types.ts (Task 6) and are re-exported here, never redeclared.
import type {Region,Regime} from './contract';
import {REGIMES} from './contract';
import type {F4CardLite,F4JudgmentDetail} from './f4-types';

export type {F4CardLite,F4JudgmentDetail};
export interface F4Client{
 latestRegimeCard(region:Region,opts?:{asOf?:string}):Promise<F4CardLite|null>;
 judgmentDetail(id:string):Promise<F4JudgmentDetail|null>;
 history(id:string,before:string|null,limit:number):Promise<F4CardLite[]>;
}
export class F4Unavailable extends Error{constructor(message='f4_unavailable'){super(message);this.name='F4Unavailable';}}
export const F4_TIMEOUT_MS=3000;

type Json=Record<string,unknown>;
const isObj=(v:unknown):v is Json=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown):string|null=>typeof v==='string'?v:null;
export const asRegime=(v:unknown):Regime|null=>typeof v==='string'&&(REGIMES as readonly string[]).includes(v)?v as Regime:null;
/** JudgmentCard (F4 spec §9.2) → number-free projection; the categorical value of macro_regime is display.value. */
export function cardLite(c:unknown):F4CardLite{
 if(!isObj(c))throw new F4Unavailable('f4_malformed:card');
 const m=isObj(c.methodology)?c.methodology:null;const id=str(c.judgment_id);const asOf=str(c.as_of);
 if(!id||!asOf||!m||!str(m.id)||!str(m.version))throw new F4Unavailable('f4_malformed:card');
 const display=isObj(c.display)?c.display:{};
 return {judgment_id:id,lifecycle:str(c.lifecycle)??'unknown',calibration:str(c.calibration)??'unknown',as_of:asOf,methodology:{id:m.id as string,version:m.version as string},selected:asRegime(display.value)};
}
export function judgmentDetailOf(body:unknown):F4JudgmentDetail{
 if(!isObj(body)||!isObj(body.judgment))throw new F4Unavailable('f4_malformed:detail');
 const j=body.judgment;const card=isObj(body.card)?body.card:{};const display=isObj(card.display)?card.display:{};
 const id=str(j.judgment_id)??str(card.judgment_id);const asOf=str(j.as_of)??str(card.as_of);
 if(!id||!asOf)throw new F4Unavailable('f4_malformed:detail');
 const claim=isObj(j.claim)?j.claim:{};
 const bad=()=>new F4Unavailable('f4_malformed:detail');
 // Required collections are validated, never normalized: a missing / non-array collection or an invalid entry is malformed.
 if(!Array.isArray(j.inputs)||!Array.isArray(body.settlements))throw bad();
 const inputs=j.inputs.map(x=>{
  if(!isObj(x)||str(x.kind)===null||(x.ref!==undefined&&!isObj(x.ref))||(x.snapshot!==undefined&&!isObj(x.snapshot)))throw bad();
  return {...x,kind:x.kind as string,ref:isObj(x.ref)?x.ref:{},snapshot:isObj(x.snapshot)?x.snapshot:{}};
 });
 const settlements=body.settlements.map(s=>{
  const settledAt=isObj(s)?str(s.settled_at):null;
  if(!isObj(s)||!settledAt||Number.isNaN(Date.parse(settledAt))||str(s.outcome)===null||(s.settlement_id!==undefined&&str(s.settlement_id)===null)||(s.evidence!==undefined&&s.evidence!==null&&!isObj(s.evidence)))throw bad();
  return {...s,settlement_id:str(s.settlement_id)??undefined,outcome:str(s.outcome),realized:s.realized??null,evidence:isObj(s.evidence)?s.evidence:null,settled_at:settledAt};
 });
 return {judgment_id:id,as_of:asOf,selected:asRegime(claim.selected)??asRegime(display.value),inputs,settlements};
}
export function createF4Client(o:{baseUrl?:string|null;fetch?:typeof fetch;timeoutMs?:number}={}):F4Client{
 const base=(o.baseUrl===undefined?process.env.NEXT_PUBLIC_SITE_URL??null:o.baseUrl)?.replace(/\/+$/,'')||null;
 const doFetch=o.fetch??fetch;const timeoutMs=o.timeoutMs??F4_TIMEOUT_MS;
 async function get(path:string,params:Record<string,string>,allowNotFound:boolean):Promise<unknown|null>{
  if(!base)throw new F4Unavailable('f4_unconfigured');
  const url=`${base}${path}${Object.keys(params).length?`?${new URLSearchParams(params)}`:''}`;
  let res:Response;
  try{res=await doFetch(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store',headers:{accept:'application/json'}});}
  catch(e){throw new F4Unavailable(`f4_fetch_failed:${e instanceof Error?e.name:'error'}`);}
  const json=(res.headers.get('content-type')??'').includes('application/json');
  if(res.status===404&&allowNotFound&&json)return null;
  if(!res.ok)throw new F4Unavailable(`f4_status:${res.status}`);
  if(!json)throw new F4Unavailable('f4_not_json');
  try{return await res.json();}catch{throw new F4Unavailable('f4_malformed:json');}
 }
 return {
  async latestRegimeCard(region,opts){
   const p:Record<string,string>={subject_type:'macro_region',subject_key:region,types:'macro_regime'};
   if(opts?.asOf){p.view='as_known';p.asOf=opts.asOf;}
   const body=await get('/api/judgments',p,false);
   if(!isObj(body)||!Array.isArray(body.cards))throw new F4Unavailable('f4_malformed:list');
   const card=body.cards.find(c=>isObj(c)&&c.judgment_type==='macro_regime')??null;
   return card?cardLite(card):null;
  },
  async judgmentDetail(id){
   const body=await get(`/api/judgments/${encodeURIComponent(id)}`,{},true);
   return body===null?null:judgmentDetailOf(body);
  },
  async history(id,before,limit){
   const p:Record<string,string>={limit:String(limit)};if(before)p.before=before;
   const body=await get(`/api/judgments/${encodeURIComponent(id)}/history`,p,false);
   const list=isObj(body)?(Array.isArray(body.cards)?body.cards:Array.isArray(body.items)?body.items:null):null;
   if(!list)throw new F4Unavailable('f4_malformed:history');
   return list.map(cardLite);
  },
 };
}
