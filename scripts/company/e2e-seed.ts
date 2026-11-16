// scripts/company/e2e-seed.ts
/**
 * Prepares a LOCAL Supabase stack for e2e/company.spec.ts (spec §12.3, decision I default: local Playwright
 * report attached to the PR, re-run by the reviewer). Refuses any non-local Supabase URL.
 *
 *   node --import tsx scripts/company/e2e-seed.ts --apply
 *
 * Environment (exported in the shell; never a .env* file in this worktree): NEXT_PUBLIC_SUPABASE_URL
 * (http://127.0.0.1:54321), SUPABASE_SERVICE_ROLE_KEY, E2E_EMAIL, E2E_PASSWORD, VERCEL_GIT_COMMIT_SHA.
 * Steps: issuers AAPL / MSFT (US, by CIK) and an HK-only Tencent issuer → US facts replayed from the recorded
 * companyfacts fixtures (runFactsSync with fetchUs replaced; snapshots go to the local Storage bucket so the
 * evidence index can verify them) → scripts/facts/materialize.ts → scripts/company/digest.ts --full --apply →
 * the e2e user (created if missing, password set to E2E_PASSWORD) with its company watches cleared.
 * Re-runnable: a second run publishes duplicates only and rebuilds the digest idempotently.
 */
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getAdminSupabase} from '../../src/lib/supabase/admin';
import {productionSyncDeps} from '../../src/lib/facts/deps';
import {runFactsSync} from '../../src/lib/facts/sync';
import type {SyncDeps} from '../../src/lib/facts/sync';
import {ProviderError,snapshotOf} from '../../src/lib/facts/providers/shared';
import {companyFactsUrl} from '../../src/lib/facts/providers/edgar-companyfacts';

const US=[
 {ticker:'AAPL',cik:'320193',name:'Apple Inc.',file:'CIK0000320193.trimmed.json'},
 {ticker:'MSFT',cik:'789019',name:'Microsoft Corp.',file:'CIK0000789019.trimmed.json'},
];
const HK={ticker:'00700.HK',zh:'腾讯控股',en:'Tencent Holdings Ltd.'};

function fail(msg:string):never{throw new Error(`e2e-seed: ${msg}`);}
function env(name:string):string{const v=process.env[name];if(!v)fail(`${name} is required`);return v;}

// Untyped table access for seeding only (the generated Database types do not cover every column used here).
type AnyClient={from:(t:string)=>any};
async function ensureIssuer(sb:AnyClient,row:{cik?:string;zh?:string;en:string;country:string}):Promise<string>{
 const sel=row.cik?sb.from('issuers').select('issuer_id').eq('cik',row.cik):sb.from('issuers').select('issuer_id').eq('canonical_name_en',row.en);
 const {data,error}=await sel.limit(1);
 if(error)fail(`issuers read: ${error.message}`);
 if(data?.[0])return String(data[0].issuer_id);
 const id=randomUUID();
 const ins=await sb.from('issuers').insert({issuer_id:id,canonical_name_en:row.en,canonical_name_zh:row.zh??null,country_code:row.country,cik:row.cik??null});
 if(ins.error)fail(`issuers insert: ${ins.error.message}`);
 return id;
}
async function ensureSecurity(sb:AnyClient,issuerId:string,ticker:string,name:string,market:'US'|'HK'){
 const u=await sb.from('stocks_universe').upsert({ticker,name,market},{onConflict:'ticker',ignoreDuplicates:true});
 if(u.error)fail(`stocks_universe: ${u.error.message}`);
 const {data,error}=await sb.from('issuer_securities').select('issuer_id').eq('ticker',ticker).limit(1);
 if(error)fail(`issuer_securities read: ${error.message}`);
 if(data?.[0])return;
 const ins=await sb.from('issuer_securities').insert({issuer_id:issuerId,ticker,share_class:'common',is_primary:true,valid_from:'2000-01-01',source:'e2e-seed'});
 if(ins.error)fail(`issuer_securities insert: ${ins.error.message}`);
}
function runScript(args:string[]){
 const r=spawnSync(process.execPath,['--import','tsx',...args],{stdio:'inherit',env:process.env});
 if(r.status!==0)fail(`${args.join(' ')} exited ${r.status}`);
}

export async function main(args=process.argv.slice(2)){
 if(args.join(' ')!=='--apply')fail('usage: e2e-seed.ts --apply');
 const host=new URL(env('NEXT_PUBLIC_SUPABASE_URL')).hostname;
 if(!['127.0.0.1','localhost'].includes(host))fail(`refusing non-local Supabase host ${host}`);
 env('SUPABASE_SERVICE_ROLE_KEY');
 const email=env('E2E_EMAIL'),password=env('E2E_PASSWORD'),codeVersion=env('VERCEL_GIT_COMMIT_SHA');
 const admin=getAdminSupabase();
 const sb=admin as unknown as AnyClient;

 const ids:Record<string,string>={};
 for(const u of US){ids[u.ticker]=await ensureIssuer(sb,{cik:u.cik,en:u.name,country:'US'});await ensureSecurity(sb,ids[u.ticker],u.ticker,u.name,'US');}
 const hk=await ensureIssuer(sb,{zh:HK.zh,en:HK.en,country:'HK'});
 await ensureSecurity(sb,hk,HK.ticker,HK.zh,'HK');

 const files=new Map(US.map(u=>[u.cik.padStart(10,'0'),u.file]));
 const base=productionSyncDeps({deadline:null,codeVersion,admin});
 const deps:SyncDeps={...base,linkCn:undefined,enrichAcceptance:undefined,fetchUs:async(cik10)=>{
  const f=files.get(cik10);
  if(!f)throw new ProviderError('no_companyfacts',cik10);
  return snapshotOf(new Uint8Array(readFileSync(`src/lib/facts/fixtures/edgar/${f}`)),{source:'edgar',url:companyFactsUrl(cik10)});
 }};
 const r=await runFactsSync(deps,{market:'US',limit:10,issuerIds:Object.values(ids),dryRun:false,triggeredBy:'script'});
 console.log(JSON.stringify({facts:{status:r.status,detail:r.detail,counts:r.counts}}));
 if(r.detail.failed>0)fail('facts replay failed');

 runScript(['scripts/facts/materialize.ts','--market','US','--issuer','AAPL','--issuer','MSFT']);
 runScript(['scripts/company/digest.ts','--full','--market','US','--apply']);

 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 let userId=created.data.user?.id;
 if(!userId){
  const list=await admin.auth.admin.listUsers({page:1,perPage:1000});
  const u=list.data.users.find(x=>x.email===email);
  if(!u)fail(`could not create or find ${email}: ${created.error?.message??'unknown'}`);
  userId=u.id;
  const upd=await admin.auth.admin.updateUserById(userId,{password});
  if(upd.error)fail(`password reset: ${upd.error.message}`);
 }
 const del=await sb.from('company_watches').delete().eq('user_id',userId);
 if(del.error)fail(`clearing watches: ${del.error.message}`);
 console.log(JSON.stringify({seeded:true,issuers:{...ids,'00700.HK':hk}}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
}
