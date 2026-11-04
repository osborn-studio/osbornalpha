// Identifier-keyed issuer writes. Hard ids are validated before any DB access; contradictions
// become pending issuer_identifier_claims rows instead of silent overwrites.
import {randomUUID} from 'node:crypto';
import type {Row,TableClient} from '../db/table-client';
import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
import {fileClaim,isUnique} from './claims';
import {HARD_IDS,matchIssuer} from './merge';
import type {ConflictReason,MatchResult} from './merge';
import {isBlank,normalizeIsin} from './securities';
import type {ClaimIdType,IssuerIdentifiers,IssuerInput} from './types';

export {attachSecurity} from './securities';
export type {AttachResult} from './securities';

type Candidate=IssuerIdentifiers&{issuer_id:string}&Row;
export interface UpsertIssuerResult{issuer_id:string|null;created:boolean;conflict?:boolean;reason?:ConflictReason}

const ENRICH_FIELDS=['canonical_name_zh','canonical_name_en','country_code','lei','cik','usci','cninfo_org_id','hkex_stock_code_primary'] as const;
/** Enrichable identifiers with a unique index and a claims id_type: a lost write becomes a claim. */
const CLAIMABLE:readonly string[]=['lei','cik','usci','cninfo_org_id'];

export function normalizeIdentifiers<T extends IssuerIdentifiers>(input:T):T{
 const out:Row={...input} as Row;
 for(const [k,v] of Object.entries(out))if(k!=='provenance'&&typeof v==='string')out[k]=isBlank(v)?null:v.trim();
 if(out.cik!=null){try{out.cik=normalizeCik(out.cik);}catch{throw new Error('invalid_identifier:cik');}}
 if(out.lei!=null){const lei=String(out.lei).toUpperCase();if(!isValidLei(lei))throw new Error('invalid_identifier:lei');out.lei=lei;}
 if(out.usci!=null){const usci=String(out.usci).toUpperCase();if(!isValidUsci(usci))throw new Error('invalid_identifier:usci');out.usci=usci;}
 if('isin' in out)out.isin=normalizeIsin(out.isin);
 if(typeof out.hkex_stock_code_primary==='string'&&/^\d{1,5}$/.test(out.hkex_stock_code_primary))out.hkex_stock_code_primary=out.hkex_stock_code_primary.padStart(5,'0');
 return out as T;
}

/**
 * Issuers holding any incoming hard id. A merged hit is replaced by its merge target (one hop),
 * presented as carrying the matched id so matchIssuer sees the hit; enrichment never copies that
 * id onto the target. Dissolved hits, and merges into a non-active issuer, land in `inactive`.
 */
export async function candidatesFor(client:TableClient,input:IssuerIdentifiers):Promise<{candidates:Candidate[];inactive:Candidate[]}>{
 const byId=new Map<string,Candidate>(),overlay=new Map<string,Row>(),inactive=new Map<string,Candidate>();
 for(const k of HARD_IDS){
  if(!input[k])continue;
  for(let r of await client.select('issuers',{[k]:input[k]})){
   if(r.status==='merged'&&r.merged_into){
    const [target]=await client.select('issuers',{issuer_id:r.merged_into});
    if(!target||target.status!=='active'){inactive.set(String((target??r).issuer_id),(target??r) as Candidate);continue;}
    r=target;overlay.set(String(r.issuer_id),{...overlay.get(String(r.issuer_id)),[k]:input[k]});
   }else if(r.status==='merged'||r.status==='dissolved'){inactive.set(String(r.issuer_id),r as Candidate);continue;}
   byId.set(String(r.issuer_id),r as Candidate);
  }
 }
 return {candidates:[...byId.values()].map(c=>({...c,...overlay.get(c.issuer_id)})),inactive:[...inactive.values()]};
}

async function lookup(client:TableClient,input:IssuerIdentifiers):Promise<{candidates:Candidate[];match:MatchResult}>{
 const {candidates,inactive}=await candidatesFor(client,input);
 if(inactive.length)return {candidates:inactive,match:{kind:'conflict',issuer_ids:inactive.map(c=>c.issuer_id).sort(),reason:'inactive_issuer'}};
 return {candidates,match:matchIssuer(candidates,input)};
}

const sourceOf=(prov:Record<string,unknown>|undefined,k:string)=>{
 const entry=prov?.[k];
 const s=entry&&typeof entry==='object'?(entry as Record<string,unknown>).source:undefined;
 return typeof s==='string'&&s?s:'unknown';
};
const claimFor=(client:TableClient,issuer_id:string,k:string,input:IssuerInput)=>
 fileClaim(client,{issuer_id,id_type:k as ClaimIdType,value:String(input[k as keyof IssuerInput]),source:sourceOf(input.provenance,k)});
const provOf=(row:Row|undefined)=>(row?.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;

export async function upsertIssuerByIdentifiers(client:TableClient,raw:IssuerInput):Promise<UpsertIssuerResult>{
 const input=normalizeIdentifiers(raw);
 let {candidates,match}=await lookup(client,input);
 if(match.kind==='new'){
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
  // inactive_issuer claims every incoming hard id (a review flag); otherwise only contradicting ones.
  for(const id of match.issuer_ids){
   const existing=candidates.find(c=>c.issuer_id===id);
   for(const k of HARD_IDS)if(input[k]&&(match.reason==='inactive_issuer'||existing?.[k]!==input[k]))await claimFor(client,id,k,input);
  }
  return {issuer_id:null,created:false,conflict:true,reason:match.reason};
 }
 const issuer_id=match.issuer_id;
 const existing=candidates.find(c=>c.issuer_id===issuer_id)!;
 const written=new Set<string>();
 // Each field is written only while still null, so a concurrent writer is never overwritten.
 for(const f of ENRICH_FIELDS){
  if(existing[f]!=null||input[f]==null)continue;
  let n:number;
  try{n=await client.update('issuers',{issuer_id,[f]:null},{[f]:input[f],updated_at:new Date().toISOString()});}
  catch(e){if(!isUnique(e)||!CLAIMABLE.includes(f))throw e;await claimFor(client,issuer_id,f,input);continue;}
  if(n>0){written.add(f);continue;}
  const [now]=await client.select('issuers',{issuer_id});
  if(now?.[f]!==input[f]&&CLAIMABLE.includes(f))await claimFor(client,issuer_id,f,input);
 }
 // Provenance is a read-modify-write: a concurrent provenance write between this read and the
 // update can be lost. Accepted: only keys we wrote, or that had no entry and whose field (if any)
 // holds our value, are merged, so a lost write misses attribution but never misattributes.
 const incoming=input.provenance??{};
 const [row]=Object.keys(incoming).length?await client.select('issuers',{issuer_id}):[];
 const prov=provOf(row);
 const keys=Object.keys(incoming).filter(k=>written.has(k)||(!(k in prov)&&(!(ENRICH_FIELDS as readonly string[]).includes(k)||row?.[k]===input[k as keyof IssuerInput])));
 if(keys.length)await client.update('issuers',{issuer_id},{provenance:{...prov,...Object.fromEntries(keys.map(k=>[k,incoming[k]]))},updated_at:new Date().toISOString()});
 return {issuer_id,created:false};
}
