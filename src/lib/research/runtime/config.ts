import type {PoolConfig} from 'pg';
type Env=Record<string,string|undefined>;
const deny=():never=>{throw new Error('research_configuration_invalid');};
const loopback=['localhost','127.0.0.1','[::1]'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type ResearchConfig={mode:'local'|'production';db:PoolConfig;owners:string[];origin?:string};
export function researchConfig(env:Env=process.env):ResearchConfig {
 try {
  if(env.ALPHA_S4_ENABLED!=='1')deny();
  const mode=env.ALPHA_RESEARCH_RUNTIME_MODE??'local';if(mode!=='local'&&mode!=='production')deny();
  const url=new URL(env.ALPHA_S4_DATABASE_URL||'invalid');
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||!url.username||!url.password)deny();
  const user=decodeURIComponent(url.username),password=decodeURIComponent(url.password),database=decodeURIComponent(url.pathname.slice(1));
  if(!/^[A-Za-z0-9_-]+$/.test(database)||!user||!password)deny();
  const port=url.port?Number(url.port):5432;if(!Number.isInteger(port)||port<1||port>65535)deny();
  const db:PoolConfig={host:url.hostname==='[::1]'?'::1':url.hostname,port,user,password,database,ssl:false,options:'-c search_path=pg_catalog,public',max:6,
   connectionTimeoutMillis:5000,statement_timeout:15000,idle_in_transaction_session_timeout:30000,application_name:'alpha-s4'};
  if(mode==='local') {
   if(env.VERCEL==='1'||env.VERCEL_ENV!==undefined||!loopback.includes(url.hostname))deny();
   if(url.hostname==='localhost')db.host='127.0.0.1';
   return {mode,db,owners:[]};
  }
  // Trusted deployment environment, never request headers. This parser does not unlock runtime.
  if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.ALPHA_S4_LOCAL_AUTH!==undefined||env.ALPHA_S4_LOCAL_SESSION_SECRET!==undefined)deny();
  if(!/^[a-f0-9]{40}$/.test(env.ALPHA_S4_RELEASE_SHA??'')||env.ALPHA_S4_RELEASE_SHA!==env.VERCEL_GIT_COMMIT_SHA)deny();
  if(loopback.includes(url.hostname)||url.hostname!==env.ALPHA_S4_DB_HOST||String(port)!==env.ALPHA_S4_DB_PORT||database!==env.ALPHA_S4_DB_NAME||user!==env.ALPHA_S4_DB_ROLE)deny();
  if(['postgres','service_role','supabase_admin','authenticated','anon'].includes(user))deny();
  const origin=new URL(env.ALPHA_S4_ORIGIN||'invalid');
  if(origin.protocol!=='https:'||origin.origin!==env.ALPHA_S4_ORIGIN||loopback.includes(origin.hostname))deny();
  const owners=(env.ALPHA_S4_OWNER_IDS??'').split(',');
  if(!owners.length||owners.length>10||owners.some(x=>!uuid.test(x))||new Set(owners).size!==owners.length)deny();
  db.max=2;db.ssl={rejectUnauthorized:true,servername:url.hostname};
  return {mode:'production',db,owners,origin:origin.origin};
 }catch {return deny();}
}
export function preflightConfig(env:Env=process.env) {
 try{const c=researchConfig(env);return {mode:c.mode,checks:{configuration:'passed'},readyForProduction:false,
  blockedBy:['production_runtime_not_released','database_privileges_not_verified','TLS_handshake_not_verified','receipt_checkpoint_not_verified','revocation_freshness_not_verified','global_connection_budget_not_verified']};
 }catch{return {mode:'unknown',checks:{configuration:'failed'},readyForProduction:false,blockedBy:['configuration_invalid']};}
}
