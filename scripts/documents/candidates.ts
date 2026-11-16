/**
 * Document candidates from the command line (spec §6.3, §7.3). No deadline; dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/documents/candidates.ts [--limit n] [--extraction <uuid>]...
 *        [--phases candidates,auto,promote] [--apply]
 *   node --env-file=.env.local --import tsx scripts/documents/candidates.ts --regenerate
 *        [--filter source=hkexnews,issuer=<uuid>,document=<uuid>] --actor <auth user uuid> [--apply]
 *
 * Dry run: lists the due extractions (and, once Task 16 wires it, the issuers due for promotion);
 * writes nothing. --apply records an ingest_batches receipt (dataset documents.candidates,
 * triggered_by script) and needs a code version (VERCEL_GIT_COMMIT_SHA or a git checkout).
 * --regenerate (after an HK_LABEL_GEN / HK_RULES_VERSION bump) calls request_candidates_regen for the
 * current extraction versions matching the filter; the next run (cron or this script) regenerates.
 * --actor is the admin user recorded by the function (DOCUMENTS_ADMIN_USER_ID is the fallback).
 * Exit 0 on success, 1 when the batch failed, 2 on bad arguments.
 */
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {runDocumentsCandidates,supabaseCandidatesDeps} from '../../src/lib/documents/candidates/run';
import type {CandidatesPhase} from '../../src/lib/documents/candidates/run';
import type {CandidatesFilter,ListedSource} from '../../src/lib/documents/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: candidates.ts [--limit n] [--extraction <uuid>]... [--phases candidates,auto,promote] [--regenerate [--filter k=v,...] --actor <uuid>] [--apply]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHASES:readonly CandidatesPhase[]=['candidates','auto','promote'];
const SOURCES:readonly ListedSource[]=['edgar','cninfo','hkexnews'];
interface Args{limit:number;extractions:string[];phases?:CandidatesPhase[];regenerate:boolean;filter:CandidatesFilter;actor?:string;apply:boolean}
const bad=(msg:string):never=>{console.error(msg);console.error(USAGE);process.exit(2);};

function parseFilter(s:string):CandidatesFilter{
 const out:CandidatesFilter={};
 for(const part of s.split(',').filter(Boolean)){
  const [k,v]=part.split('=');
  if(k==='source'){if(!SOURCES.includes(v as ListedSource))bad(`bad source: ${v}`);out.source=v as ListedSource;}
  else if(k==='issuer'){if(!UUID.test(v??''))bad(`bad issuer: ${v}`);out.issuer_id=v;}
  else if(k==='document'){if(!UUID.test(v??''))bad(`bad document: ${v}`);out.document_id=v;}
  else bad(`unknown filter key: ${k}`);
 }
 return out;
}
function parseArgs(argv:string[]):Args{
 const a:Args={limit:25,extractions:[],regenerate:false,filter:{},apply:false};
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--'))bad(`missing value for ${argv[i]}`);return v as string;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--extraction'){const v=next(i++);if(!UUID.test(v))bad(`bad extraction id: ${v}`);a.extractions.push(v);}
  else if(x==='--phases'){const v=next(i++).split(',');if(v.some(p=>!PHASES.includes(p as CandidatesPhase)))bad(`bad phases: ${v.join(',')}`);a.phases=v as CandidatesPhase[];}
  else if(x==='--regenerate')a.regenerate=true;
  else if(x==='--filter')a.filter=parseFilter(next(i++));
  else if(x==='--actor'){const v=next(i++);if(!UUID.test(v))bad(`bad actor: ${v}`);a.actor=v;}
  else if(x==='--apply')a.apply=true;
  else bad(`unknown argument: ${x}`);
 }
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>1000)bad('--limit must be 1..1000');
 if(!a.regenerate&&(Object.keys(a.filter).length>0||a.actor!==undefined))bad('--filter/--actor only with --regenerate');
 if(a.regenerate&&(a.extractions.length>0||a.phases!==undefined))bad('--regenerate excludes --extraction/--phases');
 return a;
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const admin=getAdminSupabase();
 if(args.regenerate){
  const actor=args.actor??process.env.DOCUMENTS_ADMIN_USER_ID;
  if(!actor||!UUID.test(actor))bad('--regenerate needs --actor <uuid> (or DOCUMENTS_ADMIN_USER_ID)');
  if(!args.apply){console.log(JSON.stringify({mode:'dry-run (pass --apply to request regeneration)',filter:args.filter,actor},null,1));process.exit(0);}
  const deps=supabaseCandidatesDeps(admin,{deadline:null,codeVersion:null});
  const requested=await deps.db.requestCandidatesRegen(args.filter,actor as string);
  console.log(JSON.stringify({mode:'apply',filter:args.filter,requested},null,1));
  process.exit(0);
 }
 const codeVersion=resolveCodeVersion({allowGit:true});
 if(args.apply&&!codeVersion)bad('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');
 const deps=supabaseCandidatesDeps(admin,{deadline:null,codeVersion});
 const receipt=await runDocumentsCandidates(deps,{limit:args.limit,extractionIds:args.extractions.length>0?args.extractions:undefined,dryRun:!args.apply,triggeredBy:'script',phases:args.phases});
 console.log(JSON.stringify({mode:args.apply?'apply':'dry-run (no batch written; pass --apply to write)',codeVersion,...receipt},null,1));
 process.exit(args.apply&&receipt.status==='failed'?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
