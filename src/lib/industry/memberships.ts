// src/lib/industry/memberships.ts
// Point-in-time membership estimator (spec §4.6). Industry X on day `on` = the issuers that, by the evidence
// known at `knownBy`, are valid on `on`:
//   effective_valid_to(knownBy) = valid_to when valid_to is not null and valid_to_available_date <= knownBy, else null
//   member(on, knownBy) ⇔ status='ok' ∧ available_date <= knownBy ∧ valid_from <= on
//                         ∧ (effective_valid_to(knownBy) is null ∨ effective_valid_to(knownBy) > on)
// Aggregation/valuation use knownBy = facts_as_of; pages default knownBy = today. All dates 'YYYY-MM-DD'
// (text order = date order). The pure functions are the reference the SQL/memory implementations must match;
// membersAt reads candidates through IndustryDb.membershipCandidates and filters here.
// countUnresolved applies the same estimator to CURRENT source records with issuer_id null (spec §5.2
// n_unresolved), using the v1 assumptions available_date = in_date and valid_to_available_date = out_date,
// and counts distinct ts_code.
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

const codeAt=(r:SourceMembershipRow,level:number)=>level===1?r.l1_code:level===2?r.l2_code:level===3?r.l3_code:null;

/** Distinct ts_code of current, unresolved source records of the code that are members at (on, knownBy). */
export function unresolvedAt(rows:SourceMembershipRow[],q:{code:string;level:number;on:string;knownBy:string}):SourceMembershipRow[]{
 assertDate(q.on,'on');assertDate(q.knownBy,'knownBy');
 const byTs=new Map<string,SourceMembershipRow>();
 for(const r of rows){
  if(r.status!=='current'||r.issuer_id!==null||codeAt(r,q.level)!==q.code)continue;
  // spec 7th draft §5.2 (K3): in_date <= on, in_date <= knownBy, out_date null or out_date >= on (out_date is the last member day)
  if(r.in_date>q.on||r.in_date>q.knownBy||(r.out_date!==null&&r.out_date<q.on))continue;
  if(!byTs.has(r.ts_code))byTs.set(r.ts_code,r);
 }
 return [...byTs.values()].sort((a,b)=>a.ts_code<b.ts_code?-1:a.ts_code>b.ts_code?1:0);
}
export const countUnresolved=(rows:SourceMembershipRow[],q:{code:string;level:number;on:string;knownBy:string}):number=>unresolvedAt(rows,q).length;
