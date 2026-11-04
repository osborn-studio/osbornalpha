// Hard identifiers (LEI, CIK, USCI) decide automatic merges; anything softer becomes a claim.
import type {HardIdType,IssuerIdentifiers} from './types';

export const HARD_IDS:readonly HardIdType[]=['lei','cik','usci'];
export type MatchResult={kind:'same';issuer_id:string}|{kind:'new'}|{kind:'conflict';issuer_ids:string[];reason:'identifiers_split'|'hard_id_mismatch'};

export function matchIssuer(candidates:(IssuerIdentifiers&{issuer_id:string})[],incoming:IssuerIdentifiers):MatchResult{
 const present=HARD_IDS.filter(k=>incoming[k]);
 if(present.length===0)throw new Error('no_hard_identifier');
 const hits=new Set<string>();
 for(const c of candidates)for(const k of present)if(c[k]&&c[k]===incoming[k])hits.add(c.issuer_id);
 if(hits.size===0)return {kind:'new'};
 if(hits.size>1)return {kind:'conflict',issuer_ids:[...hits].sort(),reason:'identifiers_split'};
 const [id]=hits;const hit=candidates.find(c=>c.issuer_id===id)!;
 for(const k of present)if(hit[k]&&hit[k]!==incoming[k])return {kind:'conflict',issuer_ids:[id],reason:'hard_id_mismatch'};
 return {kind:'same',issuer_id:id};
}
