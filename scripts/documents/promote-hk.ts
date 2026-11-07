/**
 * HK fact promotion from the command line (spec §6.3, §7.7). No deadline; dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/documents/promote-hk.ts (--issuer <ticker|issuer_id>... | --due [--limit n]) [--pub-gen n] [--apply]
 *
 * --issuer accepts an issuer_id (uuid) or a ticker resolved by today's ownership (e.g. 0268.HK).
 * --due takes the issuers promotionDue selects (the cron's choice).
 * Dry run: per issuer the active candidate count (confirmed/promoted rule candidates) and the staged
 * publications of the generation; writes nothing. --apply opens one ingest_batches row
 * (documents-candidates / documents.candidates, triggered_by script; needs a code version) and runs
 * runHkFactsSync. --pub-gen overrides HK_PUB_GEN (owner-run generation bumps only).
 * Exit 0 on success, 1 when any issuer failed, 2 on bad arguments.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../../src/lib/dq/batches';
import type {BatchError} from '../../src/lib/dq/batches';
import {allPages,supabaseCandidatesDeps} from '../../src/lib/documents/candidates/run';
import {runHkFactsSync} from '../../src/lib/documents/hk-facts/promote';
import {HK_PUB_GEN} from '../../src/lib/documents/types';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: promote-hk.ts (--issuer <ticker|uuid>... | --due [--limit n]) [--pub-gen n] [--apply]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad=(m:string):never=>{console.error(m);console.error(USAGE);process.exit(2);};
interface Args{issuers:string[];due:boolean;limit:number;pubGen:number;apply:boolean}
function parseArgs(argv:string[]):Args{
 const a:Args={issuers:[],due:false,limit:25,pubGen:HK_PUB_GEN,apply:false};
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--'))bad(`missing value for ${argv[i]}`);return v as string;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--issuer')a.issuers.push(next(i++));
  else if(x==='--due')a.due=true;
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--pub-gen')a.pubGen=Number(next(i++));
  else if(x==='--apply')a.apply=true;
  else bad(`unknown argument: ${x}`);
 }
 if(a.due===(a.issuers.length>0))bad('give either --issuer or --due');
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>1000)bad('--limit must be 1..1000');
 if(!Number.isInteger(a.pubGen)||a.pubGen<HK_PUB_GEN)bad(`--pub-gen must be an integer >= ${HK_PUB_GEN}`);
 return a;
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
 const codeVersion=resolveCodeVersion({allowGit:true});
 if(args.apply&&!codeVersion)bad('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');
 const deps=supabaseCandidatesDeps(admin,{deadline:null,codeVersion});
 let issuerIds:string[];
 if(args.due)issuerIds=(await deps.port.promotionDue(args.pubGen,args.limit)).map(d=>d.issuerId);
 else{
  issuerIds=[];const today=new Date().toISOString().slice(0,10);
  for(const x of args.issuers){
   if(UUID.test(x)){issuerIds.push(x);continue;}
   const r=await resolveIssuer(tables,{ticker:x},{today});
   if(!r)bad(`unknown ticker: ${x}`);
   issuerIds.push((r as {issuer_id:string}).issuer_id);
  }
 }
 if(!args.apply){
  const report=[];
  for(const id of issuerIds){
   const active=[...await allPages(c=>deps.db.candidatesOf({issuerId:id,status:'confirmed'},{cursor:c,limit:1000})),...await allPages(c=>deps.db.candidatesOf({issuerId:id,status:'promoted'},{cursor:c,limit:1000}))].filter(c=>c.kind==='financial_fact'&&c.extractor_kind==='rule');
   const staged=await allPages(c=>deps.db.publicationsOf({issuerId:id,pubGen:args.pubGen,state:'staged'},{cursor:c,limit:1000}));
   report.push({issuerId:id,active:active.length,confirmed:active.filter(c=>c.status==='confirmed').length,stagedPublications:staged.length});
  }
  console.log(JSON.stringify({mode:'dry-run (no batch written; pass --apply to promote)',pubGen:args.pubGen,issuers:report},null,1));
  process.exit(0);
 }
 const {batchId}=await startBatch(tables,{producer:'documents-candidates',dataset:'documents.candidates',toolVersions:{hk_pub_gen:String(args.pubGen),trigger:'promote-hk'},codeVersion:codeVersion as string,triggeredBy:'script'});
 const outcomes=await runHkFactsSync(deps,{issuerIds,batchId,triggeredBy:'script',pubGen:args.pubGen});
 const counts=emptyCounts();const errors:BatchError[]=[];
 for(const o of outcomes){for(const k of ['fetched','inserted','duplicates','versioned','quarantined','failed'] as const)counts[k]+=o.counts[k];errors.push(...o.errors);}
 const status=await finishBatch(tables,batchId,{counts,errors});
 console.log(JSON.stringify({mode:'apply',batchId,status,pubGen:args.pubGen,counts,issuers:outcomes},null,1));
 process.exit(outcomes.some(o=>o.outcome==='failed')?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
