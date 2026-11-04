// Identifier-keyed issuer writes. Hard ids are validated before any DB access; contradictions
// become pending issuer_identifier_claims rows instead of silent overwrites.
import {randomUUID} from 'node:crypto';
import type {Row,TableClient} from '../db/table-client';
import {isValidLei,isValidUsci,normalizeCik} from '../research/entity-keys/identifiers';
import {HARD_IDS,matchIssuer} from './merge';
import type {IssuerIdentifiers,IssuerInput,IssuerSecurityInput} from './types';

type Candidate=IssuerIdentifiers&{issuer_id:string}&Row;
export interface UpsertIssuerResult{issuer_id:string|null;created:boolean;conflict?:boolean}
export type AttachResult='inserted'|'duplicate'|'conflict';

const ENRICH_FIELDS=['canonical_name_zh','canonical_name_en','country_code','lei','cik','usci','cninfo_org_id','hkex_stock_code_primary'] as const;

export function normalizeIdentifiers<T extends IssuerIdentifiers>(input:T):T{
 const out={...input};
 if(out.cik!=null){try{out.cik=normalizeCik(out.cik);}catch{throw new Error('invalid_identifier:cik');}}
 if(out.lei!=null){const lei=String(out.lei).trim().toUpperCase();if(!isValidLei(lei))throw new Error('invalid_identifier:lei');out.lei=lei;}
 if(out.usci!=null){const usci=String(out.usci).trim().toUpperCase();if(!isValidUsci(usci))throw new Error('invalid_identifier:usci');out.usci=usci;}
 return out;
}

export async function candidatesFor(client:TableClient,input:IssuerIdentifiers):Promise<Candidate[]>{
 const byId=new Map<string,Candidate>();
 for(const k of HARD_IDS){
  if(!input[k])continue;
  for(const r of await client.select('issuers',{[k]:input[k]}))byId.set(String(r.issuer_id),r as Candidate);
 }
 return [...byId.values()];
}

const sourceOf=(prov:Record<string,unknown>|undefined,k:string)=>{
 const entry=prov?.[k];
 const s=entry&&typeof entry==='object'?(entry as Record<string,unknown>).source:undefined;
 return typeof s==='string'&&s?s:'unknown';
};

const claim=(issuer_id:string,id_type:string,value:string,source:string):Row=>
 ({id:randomUUID(),issuer_id,id_type,value,source,confidence:0.5,status:'pending',created_at:new Date().toISOString()});

const isDuplicateKey=(e:unknown)=>e instanceof Error&&e.message.includes('duplicate key');

export async function upsertIssuerByIdentifiers(client:TableClient,raw:IssuerInput):Promise<UpsertIssuerResult>{
 const input=normalizeIdentifiers(raw);
 let candidates=await candidatesFor(client,input);
 let match=matchIssuer(candidates,input);
 if(match.kind==='new'){
  const now=new Date().toISOString();
  const issuer_id=randomUUID();
  const row:Row={issuer_id,status:'active',merged_into:null,created_at:now,updated_at:now,provenance:input.provenance??{}};
  for(const f of ENRICH_FIELDS)row[f]=input[f]??null;
  try{await client.insert('issuers',row);return {issuer_id,created:true};}
  catch(e){
   if(!isDuplicateKey(e))throw e;
   // A concurrent writer won the unique index; re-read once and reuse its row.
   candidates=await candidatesFor(client,input);
   match=matchIssuer(candidates,input);
   if(match.kind==='new')throw e;
  }
 }
 if(match.kind==='conflict'){
  for(const id of match.issuer_ids){
   const existing=candidates.find(c=>c.issuer_id===id);
   for(const k of HARD_IDS){
    const value=input[k];
    if(!value||existing?.[k]===value)continue;
    await client.insert('issuer_identifier_claims',claim(id,k,value,sourceOf(input.provenance,k)));
   }
  }
  return {issuer_id:null,created:false,conflict:true};
 }
 const existing=candidates.find(c=>c.issuer_id===match.issuer_id)!;
 const patch:Row={};
 for(const f of ENRICH_FIELDS)if(existing[f]==null&&input[f]!=null)patch[f]=input[f];
 const prov=(existing.provenance&&typeof existing.provenance==='object'?existing.provenance:{}) as Record<string,unknown>;
 patch.provenance={...prov,...(input.provenance??{})};
 patch.updated_at=new Date().toISOString();
 await client.update('issuers',{issuer_id:match.issuer_id},patch);
 return {issuer_id:match.issuer_id,created:false};
}

export async function attachSecurity(client:TableClient,sec:IssuerSecurityInput):Promise<AttachResult>{
 const [current]=await client.select('issuer_securities',{ticker:sec.ticker,valid_to:null},{orderBy:'valid_from',desc:true,limit:1});
 if(!current){
  await client.insert('issuer_securities',{
   issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin??null,figi:sec.figi??null,share_class:sec.share_class,
   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to??null,source:sec.source,provenance:sec.provenance??{},
  });
  return 'inserted';
 }
 if(current.issuer_id===sec.issuer_id)return 'duplicate';
 // Another issuer holds the open interval; never overwrite it. The DB check has no 'ticker'
 // id_type, so only an ISIN can be recorded as a claim; otherwise the return value carries it.
 if(sec.isin)await client.insert('issuer_identifier_claims',claim(sec.issuer_id,'isin',sec.isin,sec.source));
 return 'conflict';
}
