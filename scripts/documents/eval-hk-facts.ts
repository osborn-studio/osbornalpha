/**
 * HK gold-set evaluation (spec §11.4). Writes the report an extraction approval references.
 *
 *   node --env-file=.env.local --import tsx scripts/documents/eval-hk-facts.ts [--gold <path>] [--source db|fixtures] [--fixtures <dir>] [--out <path>] [--apply]
 *
 * --source db (default; service role): for every gold document (source.document_sha256) the current
 * extraction of the HKEX document with that content hash and its HK rule candidates as the pipeline
 * stored them (checks_passed as written). Versions come from the extraction rows and must be uniform.
 * --source fixtures (no database, no network): runs generate + checks offline on the recorded
 * fixtures/hkex/*.pages.json whose header hash matches (citations trivially ok; no prior/English
 * cross-checks) — a development aid, NOT approval evidence (its code_version is the fixture's).
 * Output: {extractor_ref, extractor_version, table_algo_version, code_version, gold_sha256, concepts,
 * precision, recall, counts, mismatches[]} to stdout; --apply also writes --out (default
 * docs/audits/2026-11-06-document-pipeline/eval-hk-facts-<date>.json).
 * Exit 0 when evaluated, 1 when gold documents are missing, nothing is scorable, or versions are mixed, 2 on bad arguments.
 */
import {createHash} from 'node:crypto';
import {existsSync,realpathSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {allPages} from '../../src/lib/documents/candidates/run';
import {supabaseDocumentsDb} from '../../src/lib/documents/db';
import {isPendingGold,loadRecordedFixture,recordedOfflineDoc,offlineHkCandidates,scoredRows,scoreHkFacts} from '../../src/lib/documents/hk-facts/eval';
import type {HkEvalVersions,HkGoldFile,ScoredCandidate} from '../../src/lib/documents/hk-facts/eval';
import {HK_EXTRACTOR_REF} from '../../src/lib/documents/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: eval-hk-facts.ts [--gold <path>] [--source db|fixtures] [--fixtures <dir>] [--out <path>] [--apply]';
const bad=(m:string):never=>{console.error(m);console.error(USAGE);process.exit(2);};
interface Args{gold:string;source:'db'|'fixtures';fixtures:string;out:string;apply:boolean}
function parseArgs(argv:string[]):Args{
 const a:Args={apply:false,gold:'src/lib/documents/fixtures/gold/hk-facts.json',source:'db',fixtures:'src/lib/documents/fixtures/hkex',out:`docs/audits/2026-11-06-document-pipeline/eval-hk-facts-${new Date().toISOString().slice(0,10)}.json`};
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--'))bad(`missing value for ${argv[i]}`);return v as string;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--gold')a.gold=next(i++);
  else if(x==='--source'){const v=next(i++);if(v!=='db'&&v!=='fixtures')bad('--source must be db or fixtures');a.source=v as Args['source'];}
  else if(x==='--fixtures')a.fixtures=next(i++);
  else if(x==='--out')a.out=next(i++);
  else if(x==='--apply')a.apply=true;else bad(`unknown argument: ${x}`);
 }
 return a;
}
async function fromFixtures(dir:string,shas:string[]){
 const byHash=new Map<string,{file:string;raw:unknown}>();
 if(existsSync(dir))for(const f of readdirSync(dir).filter(n=>n.endsWith('.pages.json'))){const raw=JSON.parse(readFileSync(join(dir,f),'utf8'));try{byHash.set(loadRecordedFixture(raw).header.content_sha256,{file:f,raw});}catch{/* skip */}}
 const rows:ScoredCandidate[]=[];const versions:HkEvalVersions[]=[];const missing:string[]=[];
 for(const s of shas){
  const hit=byHash.get(s);if(!hit){missing.push(s);continue;}
  const {header,pages}=loadRecordedFixture(hit.raw);
  const {candidates,results}=await offlineHkCandidates(pages,recordedOfflineDoc(header,hit.file.replace(/\.pages\.json$/,'')));
  rows.push(...scoredRows(s,candidates,results));
  versions.push({extractor_ref:HK_EXTRACTOR_REF,extractor_version:pages.extractor_version,table_algo_version:pages.table_algo_version,code_version:pages.code_version});
 }
 return {rows,versions,missing};
}
async function fromDb(shas:string[]){
 const admin=getAdminSupabase();const db=supabaseDocumentsDb(admin);
 const rows:ScoredCandidate[]=[];const versions:HkEvalVersions[]=[];const missing:string[]=[];
 for(const s of shas){
  const {data,error}=await admin.from('disclosure_documents').select('document_id,current_extraction_id').eq('source','hkexnews').eq('content_sha256',s).order('source_version',{ascending:false}).limit(1);
  if(error)throw new Error(error.message);
  const doc=(data??[])[0] as {current_extraction_id:string|null}|undefined;
  if(!doc?.current_extraction_id){missing.push(s);continue;}
  const ex=await db.extractionById(doc.current_extraction_id);
  if(!ex){missing.push(s);continue;}
  const cands=(await allPages(c=>db.candidatesOf({extractionId:ex.extraction_id},{cursor:c,limit:1000}))).filter(c=>c.kind==='financial_fact'&&c.extractor_ref===HK_EXTRACTOR_REF);
  rows.push(...scoredRows(s,cands,cands.map(c=>({candidate_id:c.candidate_id,checks_passed:c.checks_passed}))));
  versions.push({extractor_ref:HK_EXTRACTOR_REF,extractor_version:ex.extractor_version,table_algo_version:ex.table_algo_version,code_version:ex.code_version});
 }
 return {rows,versions,missing};
}

export async function main(argv:string[]=process.argv.slice(2)){
 const args=parseArgs(argv);
 const goldBytes=readFileSync(args.gold);
 const gold=JSON.parse(goldBytes.toString('utf8')) as HkGoldFile;
 const shas=[...new Set(gold.entries.filter(e=>!isPendingGold(e)).map(e=>e.source.document_sha256))].sort();
 if(shas.length===0){console.error('no recorded gold entries: nothing to score');return 1;}
 const got=args.source==='db'?await fromDb(shas):await fromFixtures(args.fixtures,shas);
 if(got.missing.length>0){
  console.error(JSON.stringify({error:'missing_gold_documents',missing_documents:got.missing}));
  return 1;
 }
 const versionKeys=['extractor_ref','extractor_version','table_algo_version','code_version'] as const;
 if(got.versions.length===0||versionKeys.some(key=>new Set(got.versions.map(v=>v[key])).size!==1||got.versions.some(v=>!v[key]))){
  console.error(JSON.stringify({error:'mixed_versions',documents:shas,versions:got.versions}));
  return 1;
 }
 const report={...scoreHkFacts(gold,createHash('sha256').update(goldBytes).digest('hex'),got.rows,got.versions[0]),source:args.source,missing_documents:got.missing,generated_at:new Date().toISOString()};
 if(args.apply){
  mkdirSync(dirname(args.out),{recursive:true});
  writeFileSync(args.out,`${JSON.stringify(report,null,1)}\n`);
 }
 console.log(JSON.stringify(report,null,1));
 return 0;
}

if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url)))main().then(code=>{process.exitCode=code;}).catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
