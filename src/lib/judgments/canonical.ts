// src/lib/judgments/canonical.ts
// Content addressing of the judgment layer (spec §3.5, §6.1). The only entry point to the RFC 8785
// implementation in src/lib/research/ingest/pa-v1/json.js (imported the same way as
// src/lib/research/s4/ledger.ts; json.js has no .d.ts, allowJs infers loose types, so this wrapper
// pins the signatures). inputsHash = digest of the [kind, ref, hash] triples sorted by
// (kind, canonicalize(ref), hash) in UTF-16 order: the input order never changes the hash.
// jsonClean removes undefined object members (canonicalize refuses them, JSON storage drops them),
// so digests of objects with optional fields match what the database stores.
import {canonicalize as jcs,digest as jcsDigest,sha256 as jcsSha256} from '../research/ingest/pa-v1/json.js';
import {JudgmentError} from './errors';
import type {InputKind} from './types';

/** Arrays with holes or non-index own properties do not survive JSON storage and would hash differently from what is stored (review H-04). */
function assertDense(v:unknown):void{
 if(Array.isArray(v)){
  if(Object.keys(v).length!==v.length)throw new JudgmentError('invalid_parameter','sparse array or array with extra properties');
  for(let i=0;i<v.length;i++){if(!(i in v))throw new JudgmentError('invalid_parameter',`sparse array hole at index ${i}`);assertDense(v[i]);}
 }else if(v!==null&&typeof v==='object')for(const x of Object.values(v as Record<string,unknown>))assertDense(x);
}
export const canonicalize=(v:unknown):string=>{assertDense(v);return jcs(v);};
export const digest=(v:unknown):string=>{assertDense(v);return jcsDigest(v);};
export const sha256=(bytes:string|Uint8Array):string=>jcsSha256(bytes);

export function jsonClean<T>(v:T):T{
 assertDense(v);
 return jsonCleanDense(v);
}
function jsonCleanDense<T>(v:T):T{
 if(Array.isArray(v))return v.map(x=>jsonCleanDense(x)) as T;
 if(v!==null&&typeof v==='object'){
  const out:Record<string,unknown>={};
  for(const [k,x] of Object.entries(v as Record<string,unknown>))if(x!==undefined)Object.defineProperty(out,k,{value:jsonCleanDense(x),enumerable:true,writable:true,configurable:true});
  return out as T;
 }
 return v;
}

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function inputsHash(inputs:readonly {kind:InputKind;ref:unknown;hash:string}[]):string{
 const rows=inputs.map(i=>({kind:i.kind,key:jcs(i.ref),hash:i.hash,triple:[i.kind,i.ref,i.hash]}));
 rows.sort((a,b)=>cmp(a.kind,b.kind)||cmp(a.key,b.key)||cmp(a.hash,b.hash));
 return jcsDigest(rows.map(r=>r.triple));
}
