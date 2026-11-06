// src/lib/entities/securities.ts
// Ticker ownership over time. The DB enforces one open owner per ticker and no overlapping
// half-open [valid_from, valid_to) windows; this module classifies an incoming window against the
// rows it overlaps and turns those violations into 'duplicate' / 'conflict' outcomes.
// Plan 3 (spec 3 §3.1, §4.2.1; contract C2): every inserted row carries valid_from_method /
// valid_to_method (defaults: curated source → 'curated', else 'first_observed'; a closed window must
// name its method), provenance passes the public whitelist (sanitizeProvenance) before any DB access,
// and an ISIN contradiction becomes a claim/1 claim when the caller supplies claimEvidence: a row of
// this issuer → set_identifier / correct_identifier on that row; another holder (open incoming window
// only) → attach_security for the incoming security. Closed-history conflicts are only reported.
import type {Row,TableClient} from '../db/table-client';
import {buildClaimDetail,fileClaim,isUnique} from './claims';
import {isBlank,normalizeIsin,normalizeTicker} from './normalize';
import {sanitizeProvenance} from './provenance';
import type {IssuerSecurityInput,ValidFromMethod,ValidToMethod} from './types';

export type AttachResult='inserted'|'duplicate'|'conflict';
export const VALID_FROM_METHODS:readonly ValidFromMethod[]=['first_observed','listing_date','ticker_change','curated'];
export const VALID_TO_METHODS:readonly ValidToMethod[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];

type Window={valid_from:string;valid_to:string|null};
const str=(v:unknown)=>v==null?null:String(v);
/** Half-open overlap with null valid_to = +∞. Dates are ISO 'YYYY-MM-DD', so text order is date order. */
const overlaps=(r:Row,w:Window)=>{
 const from=String(r.valid_from),to=str(r.valid_to);
 return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
};

/** Window-end methods for an incoming row; throws invalid_security:<field> on a missing or unknown method. */
export function securityMethods(raw:Pick<IssuerSecurityInput,'source'|'valid_from_method'|'valid_to_method'>,validTo:string|null):{valid_from_method:ValidFromMethod;valid_to_method:ValidToMethod|null}{
 const from=raw.valid_from_method??(raw.source==='curated'?'curated':'first_observed');
 if(!VALID_FROM_METHODS.includes(from))throw new Error('invalid_security:valid_from_method');
 const to=raw.valid_to_method??null;
 if(validTo===null){
  if(to!==null)throw new Error('invalid_security:valid_to_method');
  return {valid_from_method:from,valid_to_method:null};
 }
 if(to===null||!VALID_TO_METHODS.includes(to))throw new Error('invalid_security:valid_to_method');
 return {valid_from_method:from,valid_to_method:to};
}

export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
 const sec={...raw,ticker:normalizeTicker(raw.ticker),isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:String(raw.valid_to)};
 const methods=securityMethods(raw,sec.valid_to);
 const provenance=sanitizeProvenance(raw.provenance??{});
 /** ISIN claim against a row of this issuer: set when the row has none, correct when it differs. */
 const claimOnRow=async(row:Row)=>{
  if(!sec.isin||!raw.claimEvidence)return;
  const current=str(row.isin);
  const op=current===null?'set_identifier':'correct_identifier';
  await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source,op,
   detail:buildClaimDetail({evidence_kind:raw.claimEvidence.kind,target:{issuer_id:sec.issuer_id,ticker:sec.ticker,valid_from:String(row.valid_from)},
    params:current===null?{}:{expected_current:current,new_value:sec.isin},evidence:raw.claimEvidence.evidence})});
 };
 /** Another holder blocks the window: an open incoming window with an ISIN becomes attach_security. */
 const claimAttach=async()=>{
  if(!sec.isin||!raw.claimEvidence||sec.valid_to!==null)return;
  await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'ticker',value:sec.ticker,source:sec.source,op:'attach_security',
   detail:buildClaimDetail({evidence_kind:raw.claimEvidence.kind,target:{issuer_id:sec.issuer_id},
    params:{share_class:sec.share_class,valid_from:sec.valid_from,valid_from_method:methods.valid_from_method,source:sec.source,isin:sec.isin},evidence:raw.claimEvidence.evidence})});
 };
 /** null when nothing on this ticker overlaps the incoming window (safe to insert). */
 const classify=async():Promise<AttachResult|null>=>{
  // A ticker has a handful of ownership rows at most; overlap is computed here, not in SQL.
  const rows=await client.select('issuer_securities',{ticker:sec.ticker},{orderBy:'valid_from'});
  const same=rows.find(r=>r.issuer_id===sec.issuer_id&&String(r.valid_from)===sec.valid_from);
  if(same){
   // Same primary key: a replay is a duplicate only if the window end and (when given) ISIN agree.
   // An absent incoming ISIN carries no information and never contradicts a stored one.
   const isinDiffers=sec.isin!==null&&same.isin!==sec.isin;
   if(str(same.valid_to)===sec.valid_to&&!isinDiffers)return 'duplicate';
   if(isinDiffers)await claimOnRow(same);
   return 'conflict';
  }
  const hit=rows.filter(r=>overlaps(r,sec));
  if(!hit.length)return null;
  // Same issuer under a different valid_from: a duplicate unless the incoming ISIN contradicts an
  // overlapping row's ISIN (an absent incoming ISIN never contradicts).
  if(hit.every(r=>r.issuer_id===sec.issuer_id)){
   const differing=sec.isin===null?undefined:hit.find(r=>r.isin!==sec.isin);
   if(!differing)return 'duplicate';
   await claimOnRow(differing);
   return 'conflict';
  }
  await claimAttach();
  return 'conflict';
 };
 const before=await classify();
 if(before)return before;
 try{
  await client.insert('issuer_securities',{
   issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
   valid_from_method:methods.valid_from_method,valid_to_method:methods.valid_to_method,source:sec.source,provenance,
  });
  return 'inserted';
 }catch(e){
  const code=(e as {code?:unknown})?.code;
  if(code==='23514'&&e instanceof Error&&e.message.includes('issuer_not_active:'))throw new Error('issuer_not_active');
  if(!isUnique(e))throw e;
  // The ISIN index (isin, valid_from) and the ISIN no-overlap exclusion span tickers: another
  // ticker already carries this ISIN over an overlapping window. A ticker-only re-read cannot see it.
  if(e instanceof Error&&(e.message.includes('issuer_securities_isin_idx')||(code==='23P01'&&e.message.includes('issuer_securities_isin_no_overlap')))){
   await claimAttach();
   return 'conflict';
  }
  // A concurrent writer took the window (PK, open-owner index or no-overlap exclusion): re-read once.
  const after=await classify();
  if(after)return after;
  // A unique violation that no current row explains is an exact replay that raced us.
  if(code==='23505')return 'duplicate';
  throw e;
 }
}
