// Identifier-keyed issuer writes. Hard ids are validated before any DB access; contradictions
// become pending issuer_identifier_claims rows instead of silent overwrites.
import {randomUUID} from 'node:crypto';
import type {Row,TableClient} from '../db/table-client';
import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
import {fileClaim,isUnique} from './claims';
import {HARD_IDS,matchIssuer} from './merge';
import type {ConflictReason,MatchResult} from './merge';
import {isBlank,normalizeHkexCode,normalizeIsin} from './normalize';
import type {ClaimIdType,IssuerIdentifiers,IssuerInput} from './types';

export {attachSecurity} from './securities';
export type {AttachResult} from './securities';

type Candidate=IssuerIdentifiers&{issuer_id:string}&Row;
export interface UpsertIssuerResult{issuer_id:string|null;created:boolean;conflict?:boolean;reason?:ConflictReason}

// Identifiers first: a lost hard-id race returns before softer fields are written.
const ENRICH_FIELDS=['lei','cik','usci','cninfo_org_id','hkex_stock_code_primary','canonical_name_zh','canonical_name_en','country_code'] as const;
/** Enrichable identifiers with a unique index and a claims id_type: a lost write becomes a claim. */
const CLAIMABLE:readonly string[]=['lei','cik','usci','cninfo_org_id'];
const HARD:readonly string[]=HARD_IDS;

export function normalizeIdentifiers<T extends IssuerIdentifiers>(input:T):T{
 const out:Row={...input} as Row;
 for(const [k,v] of Object.entries(out))if(k!=='provenance'&&typeof v==='string')out[k]=isBlank(v)?null:v.trim();
 if(out.cik!=null){try{out.cik=normalizeCik(out.cik);}catch{throw new Error('invalid_identifier:cik');}}
 if(out.lei!=null){const lei=String(out.lei).toUpperCase();if(!isValidLei(lei))throw new Error('invalid_identifier:lei');out.lei=lei;}
 if(out.usci!=null){const usci=String(out.usci).toUpperCase();if(!isValidUsci(usci))throw new Error('invalid_identifier:usci');out.usci=usci;}
 if('isin' in out)out.isin=normalizeIsin(out.isin);
 if('hkex_stock_code_primary' in out)out.hkex_stock_code_primary=normalizeHkexCode(out.hkex_stock_code_primary);
 return out as T;
}

/**
 * Issuers holding any incoming hard id. A merged hit is replaced by its active merge target (one
 * hop), presented as carrying the matched id so matchIssuer sees the hit; enrichment never copies
 * that id onto the target. A dissolved hit, or a merged hit whose target is not active, lands in
 * `inactive` as the row that actually holds the id (its stored values drive claims).
 */
export async function candidatesFor(client:TableClient,input:IssuerIdentifiers):Promise<{candidates:Candidate[];inactive:Candidate[]}>{
 const byId=new Map<string,Candidate>(),overlay=new Map<string,Row>(),inactive=new Map<string,Candidate>();
 for(const k of HARD_IDS){
  if(!input[k])continue;
  for(let r of await client.select('issuers',{[k]:input[k]})){
   if(r.status==='merged'&&r.merged_into){
    const [target]=await client.select('issuers',{issuer_id:r.merged_into});
    if(!target||target.status!=='active'){inactive.set(String(r.issuer_id),r as Candidate);continue;}
    r=target;overlay.set(String(r.issuer_id),{...overlay.get(String(r.issuer_id)),[k]:input[k]});
   }else if(r.status!=='active'){inactive.set(String(r.issuer_id),r as Candidate);continue;}
   byId.set(String(r.issuer_id),r as Candidate);
  }
 }
 return {candidates:[...byId.values()].map(c=>({...c,...overlay.get(c.issuer_id)})),inactive:[...inactive.values()]};
}

async function lookup(client:TableClient,input:IssuerIdentifiers):Promise<{candidates:Candidate[];match:MatchResult}>{
 const {candidates,inactive}=await candidatesFor(client,input);
 if(inactive.length){
  // Any inactive hit blocks the write. If an active issuer was hit too, the ids are split.
  const all=[...inactive,...candidates];
  const issuer_ids=[...new Set(all.map(c=>c.issuer_id))].sort();
  return {candidates:all,match:{kind:'conflict',issuer_ids,reason:candidates.length?'identifiers_split':'inactive_issuer'}};
 }
 return {candidates,match:matchIssuer(candidates,input)};
}

const sourceOf=(prov:Record<string,unknown>|undefined,k:string)=>{
 const entry=prov?.[k];
 const s=entry&&typeof entry==='object'?(entry as Record<string,unknown>).source:undefined;
 return typeof s==='string'&&s?s:'unknown';
};
const claimFor=(client:TableClient,issuer_id:string,k:string,input:IssuerInput)=>
 fileClaim(client,{issuer_id,id_type:k as ClaimIdType,value:String(input[k as keyof IssuerInput]),source:sourceOf(input.provenance,k)});
/** Claims, against `row`, every incoming hard id whose value differs from what `row` stores. */
async function claimDiffering(client:TableClient,row:Row,input:IssuerInput){
 for(const k of HARD_IDS)if(input[k]&&row[k]!==input[k])await claimFor(client,String(row.issuer_id),k,input);
}
const provOf=(row:Row|undefined)=>(row?.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
const conflict=(reason:ConflictReason):UpsertIssuerResult=>({issuer_id:null,created:false,conflict:true,reason});

/** Re-read after a guarded write matched nothing: a missing or non-active issuer ends the call. */
async function reread(client:TableClient,issuer_id:string,input:IssuerInput):Promise<{row:Row}|{result:UpsertIssuerResult}>{
 const [row]=await client.select('issuers',{issuer_id});
 if(!row)return {result:conflict('inactive_issuer')};
 if(row.status!=='active'){await claimDiffering(client,row,input);return {result:conflict('inactive_issuer')};}
 return {row};
}

/**
 * Not atomic across fields: each enrichment is its own guarded update. When a hard id (lei, cik,
 * usci) is lost to a race or unique violation, the call files a claim and returns
 * hard_id_mismatch; identifiers ordered before it may already be written. A cninfo_org_id that
 * contradicts the stored value is claimed and enrichment continues.
 */
export async function upsertIssuerByIdentifiers(client:TableClient,raw:IssuerInput):Promise<UpsertIssuerResult>{
 const input=normalizeIdentifiers(raw);
 let {candidates,match}=await lookup(client,input);
 if(match.kind==='new'){
  if(input.canonical_name_zh==null&&input.canonical_name_en==null)throw new Error('name_required');
  const now=new Date().toISOString();
  const issuer_id=randomUUID();
  const row:Row={issuer_id,status:'active',merged_into:null,created_at:now,updated_at:now,provenance:input.provenance??{}};
  for(const f of ENRICH_FIELDS)row[f]=input[f]??null;
  try{await client.insert('issuers',row);return {issuer_id,created:true};}
  catch(e){
   if(!isUnique(e))throw e;
   // A concurrent writer won the unique index; re-read once and reuse its row.
   ({candidates,match}=await lookup(client,input));
   if(match.kind==='new')throw e;
  }
 }
 if(match.kind==='conflict'){
  for(const id of match.issuer_ids){
   const existing=candidates.find(c=>c.issuer_id===id);
   if(existing)await claimDiffering(client,existing,input);
  }
  return conflict(match.reason);
 }
 const issuer_id=match.issuer_id;
 const existing=candidates.find(c=>c.issuer_id===issuer_id)!;
 const written=new Set<string>();
 // Each field is written only while still null on a still-active issuer, so a concurrent writer
 // is never overwritten and a merged/dissolved issuer is never enriched.
 for(const f of ENRICH_FIELDS){
  const want=input[f];
  if(want==null)continue;
  if(existing[f]!=null){
   if(f==='cninfo_org_id'&&existing[f]!==want)await claimFor(client,issuer_id,f,input);
   continue;
  }
  let n:number;
  try{n=await client.update('issuers',{issuer_id,status:'active',[f]:null},{[f]:want,updated_at:new Date().toISOString()});}
  catch(e){
   if(!isUnique(e)||!CLAIMABLE.includes(f))throw e;
   await claimFor(client,issuer_id,f,input);
   if(HARD.includes(f))return conflict('hard_id_mismatch');
   continue;
  }
  if(n>0){written.add(f);continue;}
  const r=await reread(client,issuer_id,input);
  if('result' in r)return r.result;
  if(r.row[f]!==want&&CLAIMABLE.includes(f)){
   await claimFor(client,issuer_id,f,input);
   if(HARD.includes(f))return conflict('hard_id_mismatch');
  }
 }
 // Provenance is read-modify-write guarded by updated_at (optimistic, one retry). Only keys we
 // wrote, or that had no entry and whose field (if any) holds our value, are merged, so a write
 // lost after the retry misses attribution but never misattributes.
 const incoming=input.provenance??{};
 if(!Object.keys(incoming).length)return {issuer_id,created:false};
 for(let attempt=0;attempt<2;attempt++){
  const r=await reread(client,issuer_id,input);
  if('result' in r)return r.result;
  const row=r.row,prov=provOf(row);
  const keys=Object.keys(incoming).filter(k=>written.has(k)||(!(k in prov)&&(!(ENRICH_FIELDS as readonly string[]).includes(k)||row[k]===input[k as keyof IssuerInput])));
  if(!keys.length)break;
  const n=await client.update('issuers',{issuer_id,status:'active',updated_at:row.updated_at},
   {provenance:{...prov,...Object.fromEntries(keys.map(k=>[k,incoming[k]]))},updated_at:new Date().toISOString()});
  if(n>0)break;
 }
 return {issuer_id,created:false};
}
