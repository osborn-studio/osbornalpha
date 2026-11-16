// src/lib/macro/strategy/hash.ts
// Canonical JSON + SHA-256 (spec 2026-11-07 §4.4 N3, §4.5): manifest_hash = sha256Hex(canonicalJson(body)) is a manifest's
// single identity; explain-request.ts hashes request payloads the same way. Object keys sorted by UTF-16 code unit,
// undefined members dropped, arrays in order, finite numbers only (decimals travel as strings). Defined here (Task 3)
// because StrategyDb.putManifest needs it before manifest.ts exists; manifest.ts re-exports both.
import {createHash} from 'node:crypto';

/** JSON with object keys sorted (UTF-16 code unit order), undefined members dropped, arrays in order (sparse arrays rejected), finite numbers only. */
export function canonicalJson(v:unknown):string{
 if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
 if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('canonical_json_unsupported:number');return JSON.stringify(v);}
 if(Array.isArray(v)){   // holes would hash as absent but store as null: reject (Array.prototype.map skips them)
  for(let i=0;i<v.length;i++)if(!(i in v))throw new Error('canonical_json_unsupported:sparse_array');
  return `[${v.map(canonicalJson).join(',')}]`;
 }
 if(typeof v==='object'){const o=v as Record<string,unknown>;return `{${Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;}
 throw new Error(`canonical_json_unsupported:${typeof v}`);
}
export const sha256Hex=(text:string):string=>createHash('sha256').update(text,'utf8').digest('hex');
