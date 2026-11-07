// src/lib/industry/memberships.ts
// Point-in-time membership estimator (spec §4.6). Industry X on day `on` = the issuers that, by the evidence
// known at `knownBy`, are valid on `on`:
//   effective_valid_to(knownBy) = valid_to when valid_to is not null and valid_to_available_date <= knownBy, else null
//   member(on, knownBy) ⇔ status='ok' ∧ available_date <= knownBy ∧ valid_from <= on
//                         ∧ (effective_valid_to(knownBy) is null ∨ effective_valid_to(knownBy) > on)
// Aggregation/valuation use knownBy = facts_as_of; pages default knownBy = today. All dates 'YYYY-MM-DD'
// (text order = date order). The pure functions are the reference the SQL/memory implementations must match;
// membersAt reads candidates through IndustryDb.membershipCandidates and filters here.
// Window ends written by the resolver (resolve-memberships.ts, spec 7th draft K3): upstream out_date is the LAST member day
// (inclusive), so a closed window has valid_to = valid_to_available_date = out_date + 1 day, further bounded by the delisting
// date (min(out_date + 1, delist_date)); the half-open [valid_from, valid_to) test below is therefore exact.
// countUnresolved applies the same estimator to CURRENT source records with issuer_id null (spec §5.2
// n_unresolved), using the v1 assumptions available_date = in_date and valid_to_available_date = out_date,
// and counts distinct ts_code. K4: a ts_code whose delist_date (industry_security_delistings) is <= `on` is not unresolved
// (it was no longer listed on `on`); callers pass the delist dates as `delist`.
import {IndustryDbError} from './types';
import type {IndustryDb,MembersAtQuery,MembershipRow,SourceMembershipRow} from './types';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const assertDate=(v:string,name:string)=>{if(!DATE.test(v))throw new Error(`invalid_date:${name}`);};

export function effectiveValidTo(r:Pick<MembershipRow,'valid_to'|'valid_to_available_date'>,knownBy:string):string|null{
 return r.valid_to!==null&&r.valid_to_available_date!==null&&r.valid_to_available_date<=knownBy?r.valid_to:null;
}

export function isMemberAt(r:Pick<MembershipRow,'status'|'available_date'|'valid_from'|'valid_to'|'valid_to_available_date'>,on:string,knownBy:string):boolean{
 if(r.status!=='ok'||r.available_date>knownBy||r.valid_from>on)return false;
 const end=effectiveValidTo(r,knownBy);
 return end===null||end>on;
}

/** Rows of the queried (scheme, version, code, level) that are members at (on, knownBy); one row per issuer (latest valid_from), sorted by issuer_id. */
export function membersAtPure(rows:MembershipRow[],q:MembersAtQuery):MembershipRow[]{
 assertDate(q.on,'on');assertDate(q.knownBy,'knownBy');
 const best=new Map<string,MembershipRow>();
 for(const r of rows){
  if(r.scheme!==q.scheme||r.version!==q.version||r.code!==q.code||r.level!==q.level||!isMemberAt(r,q.on,q.knownBy))continue;
  const have=best.get(r.issuer_id);
  if(!have||r.valid_from>have.valid_from)best.set(r.issuer_id,r);
 }
 return [...best.values()].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
}

export async function membersAt(db:IndustryDb,q:MembersAtQuery):Promise<MembershipRow[]>{
 return membersAtPure(await db.membershipCandidates({scheme:q.scheme,version:q.version,code:q.code,level:q.level,on:q.on}),q);
}

/** Like the SQL adapters (db.ts levelColumn): a level outside 1–3 is an error, not "no match". */
const assertLevel=(level:number)=>{if(level!==1&&level!==2&&level!==3)throw new IndustryDbError('unknown',`invalid_level:${level}`);};
const codeAt=(r:SourceMembershipRow,level:number)=>{assertLevel(level);return level===1?r.l1_code:level===2?r.l2_code:r.l3_code;};

export interface UnresolvedQuery{code:string;level:number;on:string;knownBy:string;
 /** ts_code → delist_date (industry_security_delistings): delisted on or before `on` → not counted (K4) */
 delist?:ReadonlyMap<string,string>}

/** Distinct ts_code of current, unresolved source records of the code that are members at (on, knownBy). Deterministic: the record kept per ts_code is the first by (ts_code, in_date, id). */
export function unresolvedAt(rows:SourceMembershipRow[],q:UnresolvedQuery):SourceMembershipRow[]{
 assertDate(q.on,'on');assertDate(q.knownBy,'knownBy');
 assertLevel(q.level);   // even for an empty set
 const byTs=new Map<string,SourceMembershipRow>();
 const sorted=[...rows].sort((a,b)=>a.ts_code<b.ts_code?-1:a.ts_code>b.ts_code?1:a.in_date<b.in_date?-1:a.in_date>b.in_date?1:a.id<b.id?-1:a.id>b.id?1:0);
 for(const r of sorted){
  if(r.status!=='current'||r.issuer_id!==null||codeAt(r,q.level)!==q.code)continue;
  // spec 7th draft §5.2 (K3): in_date <= on, in_date <= knownBy, out_date null or out_date >= on (out_date is the last member day)
  if(r.in_date>q.on||r.in_date>q.knownBy||(r.out_date!==null&&r.out_date<q.on))continue;
  const gone=q.delist?.get(r.ts_code);
  if(gone!==undefined&&gone<=q.on)continue;   // K4
  if(!byTs.has(r.ts_code))byTs.set(r.ts_code,r);
 }
 return [...byTs.values()];
}
export const countUnresolved=(rows:SourceMembershipRow[],q:UnresolvedQuery):number=>unresolvedAt(rows,q).length;
