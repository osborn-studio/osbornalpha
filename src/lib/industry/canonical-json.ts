// src/lib/industry/canonical-json.ts
// Canonical JSON (spec §5.3 content addressing). One rendering for hashing and storage: object keys
// sorted by UTF-16 code unit at every depth, no whitespace, array order kept (callers sort arrays by
// the manifest's total orders before rendering), undefined object members dropped (like
// JSON.stringify), strings rendered with JSON.stringify and otherwise UNTOUCHED (decimal strings such
// as '1.50' are evidence and are never re-formatted here). Numbers must be safe integers (counts,
// levels, state_rev, mapping_gen): a fractional, non-finite or unsafe number throws
// canonical_json_number, so money and ratios can only travel as decimal strings. Non-plain objects
// (Date, Map, class instances), bigint, functions and undefined array items throw canonical_json_type.
import {createHash} from 'node:crypto';

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
function render(v:unknown,path:string):string{
 if(v===null)return 'null';
 if(typeof v==='boolean')return v?'true':'false';
 if(typeof v==='number'){
  if(!Number.isSafeInteger(v))throw new Error(`canonical_json_number:${path}`);
  return String(v===0?0:v);   // -0 → 0
 }
 if(typeof v==='string')return JSON.stringify(v);
 if(Array.isArray(v))return `[${v.map((x,i)=>{if(x===undefined)throw new Error(`canonical_json_type:${path}[${i}]`);return render(x,`${path}[${i}]`);}).join(',')}]`;
 if(typeof v==='object'){
  const proto=Object.getPrototypeOf(v);
  if(proto!==Object.prototype&&proto!==null)throw new Error(`canonical_json_type:${path}`);
  const entries=Object.entries(v as Record<string,unknown>).filter(([,x])=>x!==undefined).sort((a,b)=>cmp(a[0],b[0]));
  return `{${entries.map(([k,x])=>`${JSON.stringify(k)}:${render(x,`${path}.${k}`)}`).join(',')}}`;
 }
 throw new Error(`canonical_json_type:${path}`);
}
export function canonicalJson(value:unknown):string{return render(value,'$');}
/** Lower-case hex SHA-256 of the UTF-8 bytes of a string, or of raw bytes. */
export function sha256Hex(input:string|Uint8Array):string{return createHash('sha256').update(input).digest('hex');}
