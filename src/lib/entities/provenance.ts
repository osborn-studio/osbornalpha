// src/lib/entities/provenance.ts
// Public provenance whitelist (spec 3 §3.1; plan 3 contract C2). issuer_securities.provenance and
// issuers.provenance are anon-readable, so writers pass every object through sanitizeProvenance: only
// whitelisted top-level keys; nested values may carry source names, ids, dates, hashes and the source
// row values an evidence method copied, never a secret-looking key, URL credentials or a token-like
// query parameter, or a UUID (user ids are UUIDs; no public provenance value needs one).
export const PROVENANCE_KEYS=['isin','figi','valid_from','valid_to','pending_change'] as const;
export const ISSUER_PROVENANCE_KEYS=['lei','cik','usci','cninfo_org_id','hkex_stock_code_primary','canonical_name_zh','canonical_name_en','country_code'] as const;
export type ProvenanceErrorCode='not_object'|'unknown_key'|'secret_key'|'url_credentials'|'secret_text'|'uuid_value'|'bad_value'|'too_deep'|'too_long';

export class ProvenanceError extends Error{
 constructor(readonly code:ProvenanceErrorCode,readonly path:string){
  super(`provenance_rejected:${code}:${path}`);
  this.name='ProvenanceError';
 }
}

// These rules are exactly those of the SQL guard claim_provenance_safe (migration 20261107090000), which
// is authoritative: TS must reject everything SQL rejects, and adds no check of its own.
const SECRET_KEY=/(secret|token|passw|api[_-]?key|authorization|user_?id|cookie|credential|private)/i;
const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const URL_QUERY=/[a-z][a-z0-9+.-]*:\/\/[^\s]*[?#]|\?[^\s]*=/i;
const SECRET_TEXT=/(token|secret|passw[a-z]*|api[_-]?key|\bkey)\s*[=:]/i;
const MAX_DEPTH=4;
const MAX_STRING=500;
const isPlainObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;

function clean(v:unknown,path:string,depth:number):unknown{
 if(depth>MAX_DEPTH)throw new ProvenanceError('too_deep',path);
 if(v===null||typeof v==='boolean')return v;
 if(typeof v==='number'){if(!Number.isFinite(v))throw new ProvenanceError('bad_value',path);return v;}
 if(typeof v==='string'){
  if(v.length>MAX_STRING)throw new ProvenanceError('too_long',path);
  if(URL_QUERY.test(v))throw new ProvenanceError('url_credentials',path);
  if(UUID.test(v))throw new ProvenanceError('uuid_value',path);
  if(SECRET_TEXT.test(v))throw new ProvenanceError('secret_text',path);
  return v;
 }
 if(Array.isArray(v))return v.map((x,i)=>clean(x,`${path}[${i}]`,depth+1));
 if(isPlainObject(v)){
  const out:Record<string,unknown>={};
  for(const [k,x] of Object.entries(v)){
   if(SECRET_KEY.test(k))throw new ProvenanceError('secret_key',`${path}.${k}`);
   if(x===undefined)continue;
   out[k]=clean(x,`${path}.${k}`,depth+1);
  }
  return out;
 }
 throw new ProvenanceError('bad_value',path);
}

/** A deep copy of `p` restricted to `allowed` top-level keys; throws ProvenanceError on anything unsafe. */
export function sanitizeProvenance(p:unknown,allowed:readonly string[]=PROVENANCE_KEYS):Record<string,unknown>{
 if(!isPlainObject(p))throw new ProvenanceError('not_object','$');
 for(const k of Object.keys(p))if(!allowed.includes(k))throw new ProvenanceError('unknown_key',k);
 return clean(p,'$',0) as Record<string,unknown>;
}
