// src/lib/evals/canonical-json.ts
// Canonical JSON for every F6 hash (spec §5.3 projection_hash, §6.3 report_sha256, §7.2 report bytes):
// object keys sorted by UTF-16 code unit, no whitespace, strings and keys escaped by JSON.stringify,
// object members whose value is undefined dropped (as JSON.stringify does). Numbers must be finite
// (decimal values travel as strings, never as JS numbers). Arrays may not hold undefined; only plain
// objects, arrays, strings, finite numbers, booleans and null are accepted — anything else throws.
import {createHash} from 'node:crypto';
import type {Projection} from './types';

export function canonicalJson(v:unknown):string{
 if(v===null)return 'null';
 switch(typeof v){
  case 'string':return JSON.stringify(v);
  case 'boolean':return v?'true':'false';
  case 'number':
   if(!Number.isFinite(v))throw new RangeError('canonical_json:non_finite_number');
   return JSON.stringify(v);
  case 'object':{
   if(Array.isArray(v))return `[${v.map(x=>{if(x===undefined)throw new TypeError('canonical_json:undefined_in_array');return canonicalJson(x);}).join(',')}]`;
   const proto=Object.getPrototypeOf(v);
   if(proto!==Object.prototype&&proto!==null)throw new TypeError('canonical_json:not_a_plain_object');
   const o=v as Record<string,unknown>;
   const keys=Object.keys(o).filter(k=>o[k]!==undefined).sort();
   return `{${keys.map(k=>`${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  default:throw new TypeError(`canonical_json:unsupported_${typeof v}`);
 }
}
export const sha256Hex=(s:string|Uint8Array):string=>createHash('sha256').update(s).digest('hex');
export const projectionHash=(p:Projection):string=>sha256Hex(canonicalJson(p));
