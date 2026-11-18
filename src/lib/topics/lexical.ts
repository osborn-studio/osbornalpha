// src/lib/topics/lexical.ts
// Owner text lexical checks (spec §4.5, §6.6 check 5).
// The only file (with its test) that spells advice terms. Owner text passes the macro numeral and
// forbidden-term checks unchanged, plus this list; it is not subject to the regime-word rule.
import {lexicalFailures} from '@/lib/macro/strategy/explain-validate';
import {withoutSlots} from './slots';
export const ADVICE_TERMS:readonly string[]=['买入','卖出','推荐','增持','减持','目标价','建仓','抄底','建议','buy','sell','recommend','overweight','underweight','target price','accumulate'];
const isAscii=(s:string)=>/^[\x20-\x7e]+$/.test(s);
export function adviceMatches(text:string):string[]{
 const t=text.normalize('NFKC');
 return ADVICE_TERMS.filter(term=>isAscii(term)?new RegExp(`\\b${term.replace(/ /g,'\\s+')}\\b`,'i').test(t):t.includes(term));
}
export type OwnerTextFailure={code:'numeral_in_owner_text'|'forbidden_term'|'advice_term';match:string};
export function ownerTextFailures(text:string):OwnerTextFailure[]{
 const bare=withoutSlots(text).normalize('NFKC');
 const base=lexicalFailures(bare).filter(f=>f.code!=='regime_term').map(f=>({code:f.code==='numeral'?'numeral_in_owner_text' as const:'forbidden_term' as const,match:f.match}));
 // Preserve inherited failures and add complete diagnostic fragments for quantities already rejected.
 const numerals=new Set(base.filter(f=>f.code==='numeral_in_owner_text').map(f=>f.match));
 const complete=new Set<string>();
 for(const m of bare.matchAll(/\p{Nd}+(?:[.,]\p{Nd}+)*(?:[%‰‱])?/gu)){
  if(lexicalFailures(m[0]).some(f=>f.code==='numeral'))complete.add(m[0]);
 }
 for(const fragment of numerals)if(fragment.endsWith('个')){
  for(const m of bare.matchAll(new RegExp(`${fragment}[年月日周]`,'gu')))complete.add(m[0]);
 }
 for(const match of complete)if(!numerals.has(match))base.push({code:'numeral_in_owner_text',match});
 return [...base,...adviceMatches(bare).map(match=>({code:'advice_term' as const,match}))];
}
