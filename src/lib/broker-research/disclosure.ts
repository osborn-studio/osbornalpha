// Content disclosure for titles, snippets and summaries (spec §4.11, disclosure/1).
// Keep private values out of public text unless the licence explicitly permits them.
import type {DisclosureCheck} from './types';
import {canonicalJson,sha256Hex} from './hash';
import {canonicalDecimal} from '../facts/json-numbers';
import {dec,decAbs,decShift,decString,round1} from './decimal';
import {DISCLOSURE_VERSION} from './versions';
export interface DisclosureTarget{target_key:string;target_price:string|null;upside_pct:string|null}
export interface DisclosureAnalyst{analyst_id:string;display_name:string;name_variants:string[];public_display:boolean}
export interface DisclosureInput{allowsPublicTargetPrice:boolean;targets:DisclosureTarget[];analysts:DisclosureAnalyst[]}
export interface NumberToken{raw:string;value:string;percent:boolean}
export function numberTokens(text:string):NumberToken[]{
 const t=text.normalize('NFKC');
 return [...t.matchAll(/(?<![\d.])(?<!\d,)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?![\d])(\s?%)?/g)].map(m=>({raw:m[0],value:canonicalDecimal(`${m[1].replace(/,/g,'')}${m[2]??''}`),percent:m[3]!==undefined}));
}
const nameKey=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const byKey=<T>(k:(x:T)=>string)=>(a:T,b:T)=>k(a)<k(b)?-1:k(a)>k(b)?1:0;
export function disclosureInputsHash(text:string,input:DisclosureInput):string{
 return sha256Hex(canonicalJson({version:DISCLOSURE_VERSION,text_sha256:sha256Hex(text),allows_public_target_price:input.allowsPublicTargetPrice,
  targets:[...input.targets].sort(byKey(t=>t.target_key)).map(t=>({target_key:t.target_key,target_price:t.target_price,upside_pct:t.upside_pct})),
  analysts:[...input.analysts].sort(byKey(a=>a.analyst_id)).map(a=>({analyst_id:a.analyst_id,display_name:a.display_name,name_variants:[...a.name_variants],public_display:a.public_display}))}));
}
export function checkDisclosure(text:string,input:DisclosureInput):DisclosureCheck{
 const hits:DisclosureCheck['hits']=[],seen=new Set<string>();
 const hit=(h:DisclosureCheck['hits'][number])=>{const key=JSON.stringify(h);if(!seen.has(key)){seen.add(key);hits.push(h);}};
 if(!input.allowsPublicTargetPrice){
  const tokens=numberTokens(text);
  for(const target of input.targets){
   const price=target.target_price===null?null:canonicalDecimal(target.target_price);
   const pct=target.upside_pct===null?null:decString(decShift(decAbs(dec(target.upside_pct)),2));
   for(const token of tokens){
    const decimalPct=decString(decShift(dec(token.value),2));
    const priceHit=price!==null&&(token.value===price||round1(token.value)===round1(price));
    const upsideHit=pct!==null&&(token.value===pct||round1(token.value)===round1(pct)||(!token.percent&&round1(decimalPct)===round1(pct)));
    if(priceHit||upsideHit)hit({kind:'restricted_value:target',token:token.raw.trim(),target_key:target.target_key});
   }
  }
 }
 const hay=nameKey(text);
 for(const analyst of input.analysts){
  if(analyst.public_display)continue;
  for(const name of [analyst.display_name,...analyst.name_variants]){const n=nameKey(name);if(n&&hay.includes(n))hit({kind:'restricted_name',token:name,analyst_id:analyst.analyst_id});}
 }
 return {version:DISCLOSURE_VERSION,inputs_hash:disclosureInputsHash(text,input),passed:hits.length===0,hits};
}
