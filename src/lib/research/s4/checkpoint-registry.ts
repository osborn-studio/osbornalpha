import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {Pool,type PoolConfig} from 'pg';

/** Client for the independent checkpoint registry (ADR 2026-10-18 §4, candidate C1).
 * The registry is a separate database outside the Alpha recovery domain. This client can
 * only execute the three functions granted to `alpha_checkpoint_client`; it never reads
 * tables, never logs connection details, and reports a deadline or lost response as
 * `unknown` rather than as a failure. A confirm whose response was lost is retried with
 * the same request id and resolves as a duplicate. */
type Env=Record<string,string|undefined>;
export interface CheckpointRegistryConfig { db:PoolConfig; deadlineMs:number }
export type RegistryQuery=(text:string,values:unknown[])=>Promise<{rows:Array<{result:unknown}>}>;
export type RegistryOutcome<T>={ok:true;value:T}|{ok:false;outcome:'unknown'|'denied'|'conflict'|'unavailable';code:string};
export interface ConfirmRequest { requestId:string; databaseIdentity:string; ownerScopeHash:string; storeId:string; lastSequence:string; lastHash:string; generation:number }
export interface ConfirmedCheckpoint { checkpointId:string; confirmedAt:string; duplicate:boolean; lastSequence:string; generation:number }
export interface LatestCheckpoint { lastSequence:string; lastHash:string; generation:number; storeId:string; confirmedAt:string }
export interface IdentityState { databaseIdentity:string; storeId:string; generation:number; durabilityReady:boolean }

const LOOPBACK=['127.0.0.1','::1','localhost'];
const ADMIN_NAMES=['postgres','supabase_admin','service_role','authenticated','anon','root','admin'];
const deny=():never=>{throw new Error('registry_configuration_invalid');};
const DEFAULT_DEADLINE_MS=4500;

/** Explicit fields only; a connection URL is refused so query parameters cannot weaken TLS. */
export function checkpointRegistryConfig(env:Env=process.env):CheckpointRegistryConfig{
 if(env.ALPHA_ANCHOR_REGISTRY_URL!==undefined)deny();
 const host=env.ALPHA_ANCHOR_REGISTRY_HOST,database=env.ALPHA_ANCHOR_REGISTRY_DATABASE,user=env.ALPHA_ANCHOR_REGISTRY_USER,password=env.ALPHA_ANCHOR_REGISTRY_PASSWORD;
 if(!host||!/^[A-Za-z0-9.:\-]+$/.test(host)||!database||!/^[A-Za-z0-9_]+$/.test(database)||!user||!/^[A-Za-z0-9_]+$/.test(user)||!password)deny();
 if(ADMIN_NAMES.includes(user!.toLowerCase()))deny();
 const port=Number(env.ALPHA_ANCHOR_REGISTRY_PORT);
 if(!Number.isInteger(port)||port<1||port>65535)deny();
 const loopback=LOOPBACK.includes(host!);
 const insecure=env.ALPHA_ANCHOR_REGISTRY_INSECURE_LOOPBACK==='1';
 if(insecure&&!loopback)deny();
 // A managed instance may present a certificate from the provider's private CA (Tencent). The CA
 // file is operator configuration, must be absolute, and is read once here; it is not a secret.
 const caFile=env.ALPHA_ANCHOR_REGISTRY_CA_FILE;
 let ca:string|undefined;
 if(caFile!==undefined){
  if(insecure||!isAbsolute(caFile))deny();
  try{ca=readFileSync(caFile,'utf8');}catch{return deny();}
  if(!/-----BEGIN CERTIFICATE-----/.test(ca))deny();
 }
 const db:PoolConfig={host:host==='localhost'?'127.0.0.1':host,port,database,user,
  ssl:insecure?false:{rejectUnauthorized:true,...(/^(\d{1,3}\.){3}\d{1,3}$/.test(host!)||host!.includes(':')?{}:{servername:host}),...(ca?{ca}:{})},
  max:1,connectionTimeoutMillis:5000,statement_timeout:DEFAULT_DEADLINE_MS,application_name:'alpha-anchor-registry',options:'-c search_path=pg_catalog'};
 // Keep the secret out of any serialized copy of the configuration; pg reads it by property access.
 Object.defineProperty(db,'password',{value:password,enumerable:false,writable:false});
 return {db,deadlineMs:DEFAULT_DEADLINE_MS};
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,HASH=/^[0-9a-f]{64}$/,SEQUENCE=/^[1-9][0-9]{0,17}$/;
const DENIED=new Set(['anchor_identity_unregistered','anchor_store_mismatch','anchor_generation_fenced','permission_denied','invalid_schema']);
const CONFLICT=new Set(['anchor_hash_conflict','anchor_checkpoint_regression','anchor_request_conflict','unique_violation']);

function token(message:unknown):string{
 const m=typeof message==='string'?/^[a-z][a-z0-9_]*/.exec(message):null;
 return m?m[0]:'';
}
/** SQLSTATE and the function's own error token decide the outcome; nothing else is retained. */
function outcome(error:unknown):RegistryOutcome<never>{
 const e=error as {code?:string;message?:string};
 const code=typeof e?.code==='string'?e.code:undefined,t=token(e?.message);
 if(code==='42501')return {ok:false,outcome:'denied',code:t.startsWith('anchor_')||t==='invalid_schema'?t:'permission_denied'};
 if(code==='22023')return {ok:false,outcome:'denied',code:'invalid_schema'};
 if(code==='23505')return {ok:false,outcome:'conflict',code:'unique_violation'};
 if(code==='58000')return {ok:false,outcome:'unavailable',code:'durability_unavailable'};
 if(code==='P0001'){
  if(CONFLICT.has(t))return {ok:false,outcome:'conflict',code:t};
  if(DENIED.has(t))return {ok:false,outcome:'denied',code:t};
  return {ok:false,outcome:'denied',code:'function_error'};
 }
 return {ok:false,outcome:'unknown',code:code??'transport'};
}
function num(value:unknown):number{const n=Number(value);if(!Number.isSafeInteger(n))throw Object.assign(new Error('invalid_schema'),{code:'22023'});return n;}
function str(value:unknown):string{if(typeof value!=='string'&&typeof value!=='number')throw Object.assign(new Error('invalid_schema'),{code:'22023'});return String(value);}

export function createCheckpointRegistry(config:CheckpointRegistryConfig,deps:{query?:RegistryQuery}={}){
 let pool:Pool|undefined;
 const query:RegistryQuery=deps.query??(async(text,values)=>{
  if(!pool){pool=new Pool(config.db);pool.on('error',error=>{console.error('checkpoint registry idle client error',{code:(error as {code?:string}).code??'unknown'});});}
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('registry deadline'),{code:'deadline'})),config.deadlineMs);});
  try{return await Promise.race([pool.query(text,values),deadline]);}
  finally{if(timer)clearTimeout(timer);}
 });
 async function call<T>(text:string,values:unknown[],map:(result:unknown)=>T):Promise<RegistryOutcome<T>>{
  try{
   const rows=(await query(text,values)).rows;
   if(rows.length!==1)return {ok:false,outcome:'unknown',code:'malformed_response'};
   return {ok:true,value:map(rows[0].result)};
  }catch(error){return outcome(error);}
 }
 return {
  async confirm(request:ConfirmRequest):Promise<RegistryOutcome<ConfirmedCheckpoint>>{
   const r=request;
   if(!UUID.test(r.requestId)||!UUID.test(r.databaseIdentity)||!UUID.test(r.storeId)||!HASH.test(r.ownerScopeHash)||!HASH.test(r.lastHash)||!SEQUENCE.test(r.lastSequence)||!Number.isSafeInteger(r.generation)||r.generation<1){
    return {ok:false,outcome:'denied',code:'invalid_schema'};
   }
   return call('select anchor_private.confirm_checkpoint($1,$2,$3,$4,$5,$6,$7) as result',[r.requestId,r.databaseIdentity,r.ownerScopeHash,r.storeId,r.lastSequence,r.lastHash,r.generation],result=>{
    const o=result as Record<string,unknown>;
    return {checkpointId:str(o.checkpoint_id),confirmedAt:str(o.confirmed_at),duplicate:o.duplicate===true,lastSequence:str(o.last_sequence),generation:num(o.generation)};
   });
  },
  async latest(databaseIdentity:string,ownerScopeHash:string):Promise<RegistryOutcome<LatestCheckpoint|null>>{
   if(!UUID.test(databaseIdentity)||!HASH.test(ownerScopeHash))return {ok:false,outcome:'denied',code:'invalid_schema'};
   return call('select anchor_private.latest_checkpoint($1,$2) as result',[databaseIdentity,ownerScopeHash],result=>{
    if(result===null)return null;
    const o=result as Record<string,unknown>;
    return {lastSequence:str(o.last_sequence),lastHash:str(o.last_hash),generation:num(o.generation),storeId:str(o.store_id),confirmedAt:str(o.confirmed_at)};
   });
  },
  async identityState(databaseIdentity:string):Promise<RegistryOutcome<IdentityState>>{
   if(!UUID.test(databaseIdentity))return {ok:false,outcome:'denied',code:'invalid_schema'};
   return call('select anchor_private.identity_state($1) as result',[databaseIdentity],result=>{
    const o=result as Record<string,unknown>;
    return {databaseIdentity:str(o.database_identity),storeId:str(o.store_id),generation:num(o.generation),durabilityReady:o.durability_ready===true};
   });
  },
  async close(){await pool?.end();pool=undefined;},
 };
}
