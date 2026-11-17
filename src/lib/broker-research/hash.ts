// src/lib/broker-research/hash.ts
// canonicalJson / sha256Hex (plan 契约补充). Used ONLY for hashes TS owns (behavior_digest,
// disclosure_check.inputs_hash) and for memoryBrokerResearchDb's stand-in digests. effective_hash,
// rules_input_hash, summary_input_digest and snapshot_hash are computed in SQL and never here:
// jsonb's text form differs from canonicalJson. Keys sorted by UTF-16 code unit, no whitespace,
// arrays in order, every number written as its decimal string, Dates as ISO strings.
import {createHash} from 'node:crypto';

export function canonicalJson(v:unknown):string{
 if(v===null)return 'null';
 if(typeof v==='string')return JSON.stringify(v);
 if(typeof v==='boolean')return v?'true':'false';
 if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('canonical_json_non_finite');return JSON.stringify(String(v));}
 if(typeof v==='bigint')return JSON.stringify(v.toString());
 if(v instanceof Date)return JSON.stringify(v.toISOString());
 if(Array.isArray(v))return '['+v.map(x=>x===undefined?'null':canonicalJson(x)).join(',')+']';
 if(typeof v==='object'){
  const o=v as Record<string,unknown>;
  return '{'+Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(o[k])).join(',')+'}';
 }
 throw new Error(`canonical_json_unsupported:${typeof v}`);
}
export const sha256Hex=(s:string):string=>createHash('sha256').update(s,'utf8').digest('hex');
