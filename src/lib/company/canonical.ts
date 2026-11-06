// src/lib/company/canonical.ts
// Canonical JSON and the server-computed identities of issuer_events (spec §4.1, §4.6 ⑤; plan Task 2).
// Byte-identical to public.company_canonical_json(jsonb) in 20261112091000_company_research_functions.sql:
// object keys in Unicode code-point order (UTF-8 byte order; SQL collate "C"), no whitespace, strings
// escaped exactly like JSON.stringify (== PostgreSQL to_json(text)), numbers only as safe integers.
// Strings PostgreSQL cannot store (U+0000, lone surrogates) are refused so the two sides can never
// disagree. Hashes are sha256 over the UTF-8 bytes, lowercase hex. Deliberately imports nothing from
// types.ts (Task 3) — callers pass plain strings.
import {createHash} from 'node:crypto';

export class CanonicalJsonError extends Error{constructor(message:string){super(message);this.name='CanonicalJsonError';}}
const LONE_SURROGATE=/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const utf8=(s:string)=>Buffer.from(s,'utf8');
/** Code-point order (= UTF-8 byte order = PostgreSQL collate "C"); NOT the default UTF-16 sort. */
export const compareCodePoints=(a:string,b:string):number=>Buffer.compare(utf8(a),utf8(b));
const str=(s:string):string=>{
 if(s.includes('\u0000'))throw new CanonicalJsonError('nul_in_string');
 if(LONE_SURROGATE.test(s))throw new CanonicalJsonError('lone_surrogate');
 return JSON.stringify(s);
};
export function canonicalJson(v:unknown):string{
 if(v===null)return 'null';
 switch(typeof v){
  case 'boolean':return v?'true':'false';
  case 'number':
   if(!Number.isSafeInteger(v))throw new CanonicalJsonError(`unsafe_number:${String(v)}`);
   return String(v);   // String(-0) === '0'
  case 'string':return str(v);
  case 'object':{
   if(Array.isArray(v))return '['+v.map(x=>{if(x===undefined)throw new CanonicalJsonError('undefined_in_array');return canonicalJson(x);}).join(',')+']';
   const proto=Object.getPrototypeOf(v);
   if(proto!==Object.prototype&&proto!==null)throw new CanonicalJsonError('not_a_plain_object');
   const o=v as Record<string,unknown>;
   const keys=Object.keys(o).filter(k=>o[k]!==undefined).sort(compareCodePoints);
   return '{'+keys.map(k=>`${str(k)}:${canonicalJson(o[k])}`).join(',')+'}';
  }
  default:throw new CanonicalJsonError(`unsupported_type:${typeof v}`);
 }
}
export const sha256Utf8=(s:string):string=>createHash('sha256').update(s,'utf8').digest('hex');
/** issuer_events.event_id = sha256(canonical({issuer_id, market, kind, natural_key})); uuid text is lowercase in PostgreSQL. */
export const eventIdOf=(issuerId:string,market:string,kind:string,naturalKey:string):string=>
 sha256Utf8(canonicalJson({issuer_id:issuerId.toLowerCase(),market,kind,natural_key:naturalKey}));
/** issuer_events.payload_hash = sha256(canonical(payload)); meta is never hashed. */
export const payloadHashOf=(payload:Record<string,unknown>):string=>sha256Utf8(canonicalJson(payload));
