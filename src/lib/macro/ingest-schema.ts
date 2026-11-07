// src/lib/macro/ingest-schema.ts
// Request body validation for POST /api/macro/ingest (spec §4.4, §8, §0.2 M24). Hand-written rather than ajv:
// the three bodies are small and fixed, and explicit checks give stable error codes ('invalid_body:<path>')
// without schema compilation at cold start. Unknown keys are rejected everywhere (a renamed field must fail,
// not be silently ignored). Limits: 4 MB per request (checked by the route on raw bytes), ≤ 50 evidence
// items and ≤ 20 000 claims per chunk, ≤ 1000 chunks per batch.
export const MAX_BODY_BYTES=4*1024*1024;
export const MAX_EVIDENCE=50,MAX_CLAIMS=20_000,MAX_CHUNKS=1000;
export interface EvidenceItem{series_id:string;sha256:string;url:string;status:number;content_type:string;fetched_at:string;bytes_b64:string}
export interface ClaimItem{series_id:string;period_label:string;value_text:string}
/** Collector-side result per expected series (第 4 稿 P2-2); code only (and required) when ok is false. */
export interface SeriesOutcome{series_id:string;ok:boolean;code?:string}
/** owner_token (第 5 稿 P1-3): returned by start, carried by every chunk and finish. takeover (P2-1): only `true`, on a restart. */
export type IngestBody=
 |{action:'start';tool_versions:Record<string,string>;takeover?:true}
 |{action:'chunk';batch_id:string;owner_token:string;seq:number;total:number;evidence:EvidenceItem[];claims:ClaimItem[]}
 |{action:'finish';batch_id:string;owner_token:string;total:number;series_outcomes:SeriesOutcome[]};
export type SchemaResult={ok:true;body:IngestBody}|{ok:false;error:string};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERIES=/^CN_[A-Z0-9_]{1,60}$/;
const SHA=/^[0-9a-f]{64}$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const B64=/^[A-Za-z0-9+/]*={0,2}$/;
const DECIMAL_TEXT=/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const TOOL_KEY=/^[A-Za-z0-9_.-]{1,40}$/;
const OUTCOME_CODE=/^[a-z0-9_.:-]{1,64}$/;
export const MAX_OUTCOMES=200;

class Invalid extends Error{}
const fail=(path:string):never=>{throw new Invalid(`invalid_body:${path}`);};
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
function exactKeys(v:unknown,keys:readonly string[],path:string):Record<string,unknown>{
 if(!isObj(v))return fail(path);
 for(const k of Object.keys(v))if(!keys.includes(k))fail(`${path}.${k}`);
 for(const k of keys)if(!(k in v))fail(`${path}.${k}`);
 return v;
}
const str=(v:unknown,path:string,max:number,re?:RegExp)=>typeof v==='string'&&v.length>=1&&v.length<=max&&(!re||re.test(v))?v:fail(path);
const int=(v:unknown,path:string,min:number,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max?v:fail(path);

function evidenceItem(v:unknown,path:string):EvidenceItem{
 const o=exactKeys(v,['series_id','sha256','url','status','content_type','fetched_at','bytes_b64'],path);
 const url=str(o.url,`${path}.url`,2048);
 let ok=false;try{ok=new URL(url).protocol==='https:';}catch{ok=false;}
 if(!ok)fail(`${path}.url`);
 const fetched=str(o.fetched_at,`${path}.fetched_at`,40,ISO_UTC);
 if(!Number.isFinite(Date.parse(fetched)))fail(`${path}.fetched_at`);
 const b64=typeof o.bytes_b64==='string'&&o.bytes_b64.length<=MAX_BODY_BYTES&&o.bytes_b64.length%4===0&&B64.test(o.bytes_b64)?o.bytes_b64:fail(`${path}.bytes_b64`);
 return {series_id:str(o.series_id,`${path}.series_id`,64,SERIES),sha256:str(o.sha256,`${path}.sha256`,64,SHA),url,status:int(o.status,`${path}.status`,100,599),
  content_type:str(o.content_type,`${path}.content_type`,200),fetched_at:fetched,bytes_b64:b64};
}
function seriesOutcome(v:unknown,path:string):SeriesOutcome{
 if(!isObj(v))return fail(path);
 for(const k of Object.keys(v))if(!['series_id','ok','code'].includes(k))fail(`${path}.${k}`);
 const series_id=str(v.series_id,`${path}.series_id`,64,SERIES);
 if(typeof v.ok!=='boolean')fail(`${path}.ok`);
 if(v.ok)return 'code' in v?fail(`${path}.code`):{series_id,ok:true};
 return {series_id,ok:false,code:str(v.code,`${path}.code`,64,OUTCOME_CODE)};
}
function claimItem(v:unknown,path:string):ClaimItem{
 const o=exactKeys(v,['series_id','period_label','value_text'],path);
 return {series_id:str(o.series_id,`${path}.series_id`,64,SERIES),period_label:str(o.period_label,`${path}.period_label`,40),value_text:str(o.value_text,`${path}.value_text`,64,DECIMAL_TEXT)};
}

export function parseIngestBody(v:unknown):SchemaResult{
 try{
  if(!isObj(v))return {ok:false,error:'invalid_body:root'};
  if(v.action==='start'){
   const takeover='takeover' in v;
   const o=exactKeys(v,takeover?['action','tool_versions','takeover']:['action','tool_versions'],'root');
   if(takeover&&o.takeover!==true)fail('takeover');
   const tv=o.tool_versions;
   if(!isObj(tv))fail('tool_versions');
   const entries=Object.entries(tv as Record<string,unknown>);
   if(entries.length<1||entries.length>20)fail('tool_versions');
   for(const [k,val] of entries){if(!TOOL_KEY.test(k))fail(`tool_versions.${k}`);str(val,`tool_versions.${k}`,100);}
   return {ok:true,body:{action:'start',tool_versions:Object.fromEntries(entries) as Record<string,string>,...(takeover?{takeover:true as const}:{})}};
  }
  if(v.action==='chunk'){
   const o=exactKeys(v,['action','batch_id','owner_token','seq','total','evidence','claims'],'root');
   const total=int(o.total,'total',1,MAX_CHUNKS),seq=int(o.seq,'seq',0,MAX_CHUNKS-1);
   if(seq>=total)fail('seq');
   if(!Array.isArray(o.evidence)||o.evidence.length<1||o.evidence.length>MAX_EVIDENCE)fail('evidence');
   if(!Array.isArray(o.claims)||o.claims.length>MAX_CLAIMS)fail('claims');
   return {ok:true,body:{action:'chunk',batch_id:str(o.batch_id,'batch_id',36,UUID),owner_token:str(o.owner_token,'owner_token',36,UUID),seq,total,
    evidence:(o.evidence as unknown[]).map((e,i)=>evidenceItem(e,`evidence[${i}]`)),claims:(o.claims as unknown[]).map((c,i)=>claimItem(c,`claims[${i}]`))}};
  }
  if(v.action==='finish'){
   const o=exactKeys(v,['action','batch_id','owner_token','total','series_outcomes'],'root');
   const batch_id=str(o.batch_id,'batch_id',36,UUID),owner_token=str(o.owner_token,'owner_token',36,UUID),total=int(o.total,'total',0,MAX_CHUNKS);
   if(!Array.isArray(o.series_outcomes)||o.series_outcomes.length>MAX_OUTCOMES)fail('series_outcomes');
   const series_outcomes=(o.series_outcomes as unknown[]).map((x,i)=>seriesOutcome(x,`series_outcomes[${i}]`));
   if(new Set(series_outcomes.map(x=>x.series_id)).size!==series_outcomes.length)fail('series_outcomes');
   return {ok:true,body:{action:'finish',batch_id,owner_token,total,series_outcomes}};
  }
  return {ok:false,error:'invalid_body:action'};
 }catch(e){
  if(e instanceof Invalid)return {ok:false,error:e.message};
  throw e;
 }
}
