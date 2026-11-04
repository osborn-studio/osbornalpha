// Ticker ownership over time. The DB enforces one open owner per ticker and no overlapping
// half-open [valid_from, valid_to) windows; this module classifies an incoming window against the
// rows it overlaps and turns those violations into 'duplicate' / 'conflict' outcomes.
import type {Row,TableClient} from '../db/table-client';
import {fileClaim,isUnique} from './claims';
import {isBlank,normalizeIsin,normalizeTicker} from './normalize';
import type {IssuerSecurityInput} from './types';

// Re-exported for existing importers (link-research.ts); new code should import './normalize'.
export {isBlank,normalizeIsin} from './normalize';

export type AttachResult='inserted'|'duplicate'|'conflict';

type Window={valid_from:string;valid_to:string|null};
const str=(v:unknown)=>v==null?null:String(v);
/** Half-open overlap with null valid_to = +∞. Dates are ISO 'YYYY-MM-DD', so text order is date order. */
const overlaps=(r:Row,w:Window)=>{
 const from=String(r.valid_from),to=str(r.valid_to);
 return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
};

export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
 const sec={...raw,ticker:normalizeTicker(raw.ticker),isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:String(raw.valid_to)};
 // The claims check has no 'ticker' id_type, so only an ISIN can be recorded as a claim;
 // otherwise the return value carries the conflict.
 const conflict=async():Promise<AttachResult>=>{
  if(sec.isin)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source});
  return 'conflict';
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
   if(isinDiffers)await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin!,source:sec.source});
   return 'conflict';
  }
  const hit=rows.filter(r=>overlaps(r,sec));
  if(!hit.length)return null;
  if(hit.every(r=>r.issuer_id===sec.issuer_id))return 'duplicate';
  return conflict();
 };
 const before=await classify();
 if(before)return before;
 try{
  await client.insert('issuer_securities',{
   issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,source:sec.source,provenance:sec.provenance??{},
  });
  return 'inserted';
 }catch(e){
  const code=(e as {code?:unknown})?.code;
  if(code==='23514'&&e instanceof Error&&e.message.includes('issuer_not_active:'))throw new Error('issuer_not_active');
  if(!isUnique(e))throw e;
  // The ISIN index (isin, valid_from) spans tickers: another ticker already carries this ISIN.
  if(e instanceof Error&&e.message.includes('issuer_securities_isin_idx'))return conflict();
  // A concurrent writer took the window (PK, open-owner index or no-overlap exclusion): re-read once.
  const after=await classify();
  if(after)return after;
  // A unique violation that no current row explains is an exact replay that raced us.
  if(code==='23505')return 'duplicate';
  throw e;
 }
}
