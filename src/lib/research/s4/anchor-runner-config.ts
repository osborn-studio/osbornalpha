import {readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import type {PoolConfig} from 'pg';
import {checkpointRegistryConfig,type CheckpointRegistryConfig} from './checkpoint-registry';

/** Operator configuration for the anchor runner process (ADR 2026-10-18 §4). Explicit fields
 * only: no connection URL, TLS verified against the host name, plaintext solely for an explicit
 * loopback test target. Secrets are kept non-enumerable so a serialized config never carries them. */
type Env=Record<string,string|undefined>;
export interface AnchorRunnerConfig {
  manifestPath:string; receiptRoot:string; principalId:string; owners:string[];
  db:PoolConfig; registry:CheckpointRegistryConfig; intervalSeconds:number; watchdogMs:number;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOOPBACK=['127.0.0.1','::1','localhost'];
const ADMIN_NAMES=['postgres','supabase_admin','service_role','authenticated','anon','root','admin','s4_admin'];
const deny=():never=>{throw new Error('runner_configuration_invalid');};
/** RFC 6066 forbids an IP literal as SNI; Node still checks the IP SAN against the host. */
export function isIpLiteral(host:string):boolean{return /^(\d{1,3}\.){3}\d{1,3}$/.test(host)||host.includes(':');}

export function anchorRunnerConfig(env:Env=process.env):AnchorRunnerConfig{
  if(env.ALPHA_ANCHOR_DB_URL!==undefined)deny();
  const manifestPath=env.ALPHA_ANCHOR_MANIFEST,receiptRoot=env.ALPHA_ANCHOR_RECEIPT_ROOT,principalId=env.ALPHA_ANCHOR_PRINCIPAL_ID;
  if(!manifestPath||!isAbsolute(manifestPath)||!receiptRoot||!isAbsolute(receiptRoot)||!principalId||!UUID.test(principalId))deny();
  const owners=(env.ALPHA_ANCHOR_OWNERS??'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!owners.length||owners.length>10||owners.some(o=>!UUID.test(o))||new Set(owners).size!==owners.length)deny();
  const host=env.ALPHA_ANCHOR_DB_HOST,database=env.ALPHA_ANCHOR_DB_DATABASE,user=env.ALPHA_ANCHOR_DB_USER,password=env.ALPHA_ANCHOR_DB_PASSWORD;
  if(!host||!/^[A-Za-z0-9.:\-]+$/.test(host)||!database||!/^[A-Za-z0-9_]+$/.test(database)||!user||!/^[A-Za-z0-9_.]+$/.test(user)||!password)deny(); // pooler logins are role.projectref
  if(ADMIN_NAMES.includes(user!.toLowerCase().split('.')[0]))deny();
  const port=Number(env.ALPHA_ANCHOR_DB_PORT);
  if(!Number.isInteger(port)||port<1||port>65535)deny();
  const loopback=LOOPBACK.includes(host!),insecure=env.ALPHA_ANCHOR_DB_INSECURE_LOOPBACK==='1';
  if(insecure&&!loopback)deny();
  const intervalSeconds=env.ALPHA_ANCHOR_INTERVAL_SECONDS===undefined?60:Number(env.ALPHA_ANCHOR_INTERVAL_SECONDS);
  if(!Number.isInteger(intervalSeconds)||intervalSeconds<5||intervalSeconds>3600)deny();
  const watchdogMs=env.ALPHA_ANCHOR_WATCHDOG_MS===undefined?5000:Number(env.ALPHA_ANCHOR_WATCHDOG_MS);
  if(!Number.isInteger(watchdogMs)||watchdogMs<100||watchdogMs>30000)deny();
  // The hosted database may present a chain from the provider's own CA (Supabase prod CA).
  const caFile=env.ALPHA_ANCHOR_DB_CA_FILE;
  let ca:string|undefined;
  if(caFile!==undefined){
    if(insecure||!isAbsolute(caFile))deny();
    try{ca=readFileSync(caFile,'utf8');}catch{return deny();}
    if(!/-----BEGIN CERTIFICATE-----/.test(ca))deny();
  }
  const db:PoolConfig={host:host==='localhost'?'127.0.0.1':host,port,database,user,
    ssl:insecure?false:{rejectUnauthorized:true,...(isIpLiteral(host!)?{}:{servername:host}),...(ca?{ca}:{})},
    max:2,connectionTimeoutMillis:5000,statement_timeout:15000,idle_in_transaction_session_timeout:30000,application_name:'alpha-anchor-runner'};
  // No startup `options`: the pooler path may reject them, and every runner call is a fully
  // qualified SECURITY DEFINER function with its own pinned search_path.
  Object.defineProperty(db,'password',{value:password,enumerable:false,writable:false});
  let registry:CheckpointRegistryConfig;
  try{registry=checkpointRegistryConfig(env);}catch{return deny();}
  return {manifestPath:manifestPath!,receiptRoot:receiptRoot!,principalId:principalId!,owners,db,registry,intervalSeconds,watchdogMs};
}
