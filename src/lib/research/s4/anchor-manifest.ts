import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {fail,parseStrict} from '../ingest/pa-v1/json.js';

/** Operator-owned runner identity (ADR 2026-10-18 §4). Trusted deployment configuration, never an
 * HTTP input and never discovered from uploaded data. It is not a secret and not an authority:
 * the fence (C1 / `research_s4_runtime_identity`, both still unbuilt) decides whether the
 * generation it claims may write. `checkpoint_endpoint_ref` is deliberately absent until I1.5. */
export interface RunnerManifest {
  store_id: string;
  database_identity: string;
  deployment_generation: number;
  authorized_owner_scope: string[];
  format_version: 1;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SCOPE_HASH=/^[0-9a-f]{64}$/;
const FIELDS=['store_id','database_identity','deployment_generation','authorized_owner_scope','format_version'] as const;
export const MAX_MANIFEST_BYTES=64*1024;

export function parseRunnerManifest(input:string|Buffer):RunnerManifest {
  const bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
  if(bytes.length>MAX_MANIFEST_BYTES)fail('input_limit');
  const value=parseStrict(bytes) as Record<string,unknown>;
  if(!value||typeof value!=='object'||Array.isArray(value))fail('invalid_schema');
  const keys=Object.keys(value).sort();
  if(keys.join(',')!==[...FIELDS].sort().join(','))fail('invalid_schema');
  const {store_id,database_identity,deployment_generation,authorized_owner_scope,format_version}=value;
  if(typeof store_id!=='string'||!UUID.test(store_id))fail('invalid_schema');
  if(typeof database_identity!=='string'||!UUID.test(database_identity))fail('invalid_schema');
  if(typeof deployment_generation!=='number'||!Number.isSafeInteger(deployment_generation)||deployment_generation<0)fail('invalid_schema');
  if(!Array.isArray(authorized_owner_scope)||!authorized_owner_scope.length||authorized_owner_scope.length>1024)fail('invalid_schema');
  const scopes=authorized_owner_scope as unknown[];
  if(!scopes.every(s=>typeof s==='string'&&SCOPE_HASH.test(s))||new Set(scopes).size!==scopes.length)fail('invalid_schema');
  if(format_version!==1)fail('invalid_schema');
  return {store_id:store_id as string,database_identity:database_identity as string,deployment_generation:deployment_generation as number,
    authorized_owner_scope:[...(authorized_owner_scope as string[])],format_version:1};
}

/** Reads the manifest from an absolute path that only operator configuration may supply.
 * The file must be a regular, non-symlinked file owned by this process's uid with no group/other bits. */
export async function readRunnerManifest(path:string):Promise<RunnerManifest> {
  if(typeof path!=='string'||!isAbsolute(path)||typeof process.getuid!=='function')fail('scope_denied');
  let file;
  try{file=await open(path,constants.O_NOFOLLOW|constants.O_RDONLY);}catch(e){if((e as {code?:string}).code==='ELOOP')fail('scope_denied');throw e;}
  try{
    const stat=await file.stat();
    if(!stat.isFile()||stat.uid!==process.getuid!()||(stat.mode&0o077)!==0)fail('scope_denied');
    if(stat.size>MAX_MANIFEST_BYTES)fail('input_limit');
    return parseRunnerManifest(await file.readFile());
  }finally{await file.close();}
}
