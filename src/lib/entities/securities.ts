// Ticker ownership over time. The DB enforces one open owner per ticker and no overlapping
// windows; this module turns those violations into 'duplicate' / 'conflict' outcomes.
import type {Row,TableClient} from '../db/table-client';
import {isValidIsin} from '../research/entity-keys/identifiers';
import {fileClaim,isUnique} from './claims';
import type {IssuerSecurityInput} from './types';

export type AttachResult='inserted'|'duplicate'|'conflict';

export const isBlank=(v:unknown)=>v==null||(typeof v==='string'&&v.trim()==='');

/** Blank → null; otherwise trimmed, upper-cased and check-digit validated. */
export function normalizeIsin(v:unknown):string|null{
 if(isBlank(v))return null;
 const isin=String(v).trim().toUpperCase();
 if(!isValidIsin(isin))throw new Error('invalid_identifier:isin');
 return isin;
}

const openOwner=async(client:TableClient,ticker:string):Promise<Row|undefined>=>
 (await client.select('issuer_securities',{ticker,valid_to:null},{orderBy:'valid_from',desc:true,limit:1}))[0];

export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
 const sec={...raw,isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:raw.valid_to!};
 // Another issuer holds the open interval; never overwrite it. The claims check has no 'ticker'
 // id_type, so only an ISIN can be recorded as a claim; otherwise the return value carries it.
 const classify=async(owner:Row):Promise<AttachResult>=>{
  if(owner.issuer_id===sec.issuer_id)return 'duplicate';
  if(sec.isin)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source});
  return 'conflict';
 };
 if(sec.valid_to!==null&&await client.count('issuer_securities',{issuer_id:sec.issuer_id,ticker:sec.ticker,valid_from:sec.valid_from})>0)return 'duplicate';
 const current=await openOwner(client,sec.ticker);
 if(current)return classify(current);
 try{
  await client.insert('issuer_securities',{
   issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,source:sec.source,provenance:sec.provenance??{},
  });
  return 'inserted';
 }catch(e){
  if(e instanceof Error&&e.message.includes('issuer_not_active'))throw new Error('issuer_not_active');
  if(!isUnique(e))throw e;
  // A concurrent writer took the ticker (open-owner index, PK or no-overlap exclusion): re-read once.
  const winner=await openOwner(client,sec.ticker);
  if(winner)return classify(winner);
  throw e;
 }
}
