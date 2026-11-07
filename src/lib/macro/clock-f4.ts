// F4 clock card reader and matcher (P5 draft 8 §§2.3, 2.4, 3.3). All HTTP data is untrusted.
import type {Region} from './types';
import type {Lifecycle} from '@/lib/judgments/types';
import type {F4Match,F4Claim} from './clock-contract';
import {REGIMES} from './judgment-contract';

export const ACCEPTED_F4_VERSIONS:readonly string[]=['v1'];
export interface F4Reader{listCards(region:Region):Promise<unknown>;detail(judgmentId:string):Promise<unknown>}

type ObjectValue=Record<string,unknown>;
type Input={kind:string;ref:unknown};
type Card={judgment_id:string;lifecycle:Lifecycle;methodology:{id:string;version:string;href:string};inputs:Input[];as_of:string;calibration:string;abstain_reason:string|null};
const lifecycleValues:readonly Lifecycle[]=['abstained','open','settled','void','withdrawn','pending_fill'];
const object=(v:unknown):v is ObjectValue=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const string=(v:unknown):v is string=>typeof v==='string';
const malformed=(where:string):Error=>new Error(`malformed_${where}`);
function snapshotIds(inputs:Input[]):string[]{
 return inputs.filter(i=>i.kind==='macro_snapshot').map(i=>{
  if(!object(i.ref)||!string(i.ref.snapshot_id))throw malformed('card');
  return i.ref.snapshot_id;
 });
}
function parseCard(value:unknown,where:string):Card{
 if(!object(value)||!string(value.judgment_id)||!string(value.as_of)||!string(value.calibration)||!lifecycleValues.includes(value.lifecycle as Lifecycle)||!object(value.methodology))throw malformed(where);
 const m=value.methodology;
 if(!string(m.id)||!string(m.version)||!string(m.href)||!Array.isArray(value.inputs)||!value.inputs.every(i=>object(i)&&string(i.kind)&&Object.hasOwn(i,'ref'))||value.abstain_reason!==undefined&&!string(value.abstain_reason))throw malformed(where);
 const inputs=value.inputs as Input[];
 try{snapshotIds(inputs);}catch{throw malformed(where);}
 return {judgment_id:value.judgment_id,lifecycle:value.lifecycle as Lifecycle,methodology:{id:m.id,version:m.version,href:m.href},inputs,as_of:value.as_of,calibration:value.calibration,abstain_reason:value.abstain_reason as string|undefined??null};
}
function parseClaim(value:unknown):F4Claim{
 if(!object(value)||!REGIMES.includes(value.selected as F4Claim['selected'])||!object(value.distribution)||!REGIMES.every(q=>typeof (value.distribution as ObjectValue)[q]==='number'&&Number.isFinite((value.distribution as ObjectValue)[q]))||Object.keys(value.distribution).length!==REGIMES.length||!(value.margin_pp===null||typeof value.margin_pp==='number'&&Number.isFinite(value.margin_pp))||!(value.catalog_version===null||string(value.catalog_version))||value.scores_are_not_probabilities!==true)throw malformed('detail');
 return {selected:value.selected as F4Claim['selected'],distribution:value.distribution as F4Claim['distribution'],margin_pp:value.margin_pp as number|null,catalog_version:value.catalog_version as string|null,scores_are_not_probabilities:true};
}
function detailMatch(list:Card,body:unknown,snapshotId:string):{card:Card;claim:unknown}{
 if(!object(body)||!object(body.card)||!object(body.judgment))throw malformed('detail');
 const card=parseCard(body.card,'detail'),judgment=body.judgment;
 if(card.judgment_id!==list.judgment_id||card.lifecycle!==list.lifecycle||card.methodology.id!==list.methodology.id||card.methodology.version!==list.methodology.version||JSON.stringify(snapshotIds(card.inputs).sort())!==JSON.stringify(snapshotIds(list.inputs).sort())||!snapshotIds(card.inputs).includes(snapshotId)||judgment.judgment_id!==list.judgment_id||judgment.methodology_id!==list.methodology.id||judgment.methodology_version!==list.methodology.version)throw new Error('detail_mismatch');
 return {card,claim:judgment.claim};
}
function reason(error:unknown):string{
 if(error instanceof Error){
  if(error.name==='AbortError')return 'timeout';
  if(/^(malformed_list|malformed_card|malformed_detail|detail_mismatch|timeout|http_\d+)$/.test(error.message))return error.message;
 }
 return 'exception';
}
export function fetchF4Reader(env:Readonly<Record<string,string|undefined>>=process.env,fetcher:typeof fetch=fetch):F4Reader|null{
 const raw=env.NEXT_PUBLIC_SITE_URL;
 if(!raw)return null;
 let base:string;
 try{const url=new URL(raw);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;base=url.origin;}
 catch{return null;}
 async function get(path:string):Promise<unknown>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
  try{
   const response=await fetcher(`${base}${path}`,{signal:controller.signal,cache:'no-store',headers:{accept:'application/json'}});
   if(!response.ok)throw new Error(`http_${response.status}`);
   try{return await response.json();}catch{throw malformed('detail');}
  }finally{clearTimeout(timer);}
 }
 return {
  listCards(region){const params=new URLSearchParams({subject_type:'macro_region',subject_key:region,types:'macro_regime',include_abstained:'1'});return get(`/api/judgments?${params}`);},
  detail(judgmentId){return get(`/api/judgments/${encodeURIComponent(judgmentId)}`);},
 };
}
export async function matchF4Card(reader:F4Reader|null,region:Region,snapshotId:string,accepted:readonly string[]=ACCEPTED_F4_VERSIONS):Promise<F4Match>{
 if(!reader)return {status:'unavailable',reason:'no_base_url'};
 try{
  const response=await reader.listCards(region);
  const values=Array.isArray(response)?response:object(response)?response.cards:null;
  if(!Array.isArray(values))throw malformed('list');
  const cards=values.map(v=>parseCard(v,'list'));
  const regime=cards.filter(c=>c.methodology.id==='macro_regime');
  const candidates=regime.filter(c=>accepted.includes(c.methodology.version)&&snapshotIds(c.inputs).includes(snapshotId));
  if(!candidates.length){
   if(!regime.length)return {status:'none'};
   const latest=[...regime].sort((a,b)=>b.as_of.localeCompare(a.as_of)||a.judgment_id.localeCompare(b.judgment_id))[0];
   const earlierSnapshotId=snapshotIds(latest.inputs)[0];
   if(!earlierSnapshotId)throw malformed('list');
   return {status:'earlier',judgment_id:latest.judgment_id,earlier_snapshot_id:earlierSnapshotId};
  }
  candidates.sort((a,b)=>accepted.indexOf(b.methodology.version)-accepted.indexOf(a.methodology.version)||b.as_of.localeCompare(a.as_of)||a.judgment_id.localeCompare(b.judgment_id));
  const selected=candidates[0];
  const {card,claim:rawClaim}=detailMatch(selected,await reader.detail(selected.judgment_id),snapshotId);
  if(card.lifecycle!=='open'&&card.lifecycle!=='settled')return {status:'ineligible',judgment_id:card.judgment_id,lifecycle:card.lifecycle,abstain_reason:card.abstain_reason};
  const claim=parseClaim(rawClaim);
  return {status:'card',judgment_id:card.judgment_id,claim,card:{selected:claim.selected,lifecycle:card.lifecycle,calibration:card.calibration,methodology:card.methodology,as_of:card.as_of}};
 }catch(error){return {status:'unavailable',reason:reason(error)};}
}
