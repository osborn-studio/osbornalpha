// src/lib/facts/keys.ts
// Natural-key strings (spec §5.2 K, §7.1 quarantine natural_key formats). One place renders
// them so plan, rules, read and the SQL-side items agree byte for byte. A null period_start
// (instants) renders as the empty segment.
import type {Market,Statement} from './types';

export interface FactKey{concept:string;period_start:string|null;period_end:string;consolidation:string;unit:string}
const seg=(s:string|null)=>s??'';

/** K within one issuer and market: concept:period_start:period_end:consolidation:unit. */
export const factKey=(k:FactKey):string=>[k.concept,seg(k.period_start),k.period_end,k.consolidation,k.unit].join(':');
/** Candidate key = K + filing + mapping generation (§5.3 duplicate rule). */
export const candidateKey=(k:FactKey,filingId:string,mappingGen:number):string=>`${factKey(k)}:${filingId}:${mappingGen}`;
/** same_day_conflict natural_key (§7.1). */
export const sameDayConflictKey=(issuer:string,market:Market,k:FactKey,availableDate:string):string=>[issuer,market,factKey(k),availableDate].join(':');
/** ambiguous_value / odd_duration natural_key (§7.1). */
export const ambiguousKey=(issuer:string,market:Market,k:FactKey,sourceRef:string,mappingGen:number):string=>[issuer,market,factKey(k),sourceRef,String(mappingGen)].join(':');
/** identity_bs (BS, period_end only) and identity_gp (IS, period_start:period_end) natural_key (§7.1). */
export const identityKey=(issuer:string,market:Market,statement:Extract<Statement,'IS'|'BS'>,periodStart:string|null,periodEnd:string,unit:string,sourceRef:string,mappingGen:number):string=>
 statement==='BS'?[issuer,market,'BS',periodEnd,unit,sourceRef,String(mappingGen)].join(':'):[issuer,market,'IS',seg(periodStart),periodEnd,unit,sourceRef,String(mappingGen)].join(':');
/** The K components as stored in quarantine payload.key. */
export const keyComponents=(issuer:string,market:Market,k:FactKey):Record<string,string|null>=>({issuer_id:issuer,market,concept:k.concept,period_start:k.period_start,period_end:k.period_end,consolidation:k.consolidation,unit:k.unit});
