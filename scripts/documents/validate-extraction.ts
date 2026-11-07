/**
 * Real-bytes validation (spec §11.3, F3-4 exit condition; local only, never CI).
 *
 *   node --env-file=.env.local --import tsx scripts/documents/validate-extraction.ts [--gold <path>] [--fixtures <dir>] [--out <path>] [--apply]
 *
 * For every gold document hash with a recorded fixtures/hkex/*.pages.json: downloads header.source_url
 * (User-Agent EDGAR_USER_AGENT or the collectors' DEFAULT_USER_AGENT, 120 s timeout), requires
 * sha256(bytes) = header.content_sha256, runs the real extractPdf, compares every page's
 * text_hash (sha256 of the UTF-8 text) with the recorded layout, then runs generate + checks
 * offline and scores the result against the gold file. Report:
 * docs/audits/2026-11-06-document-pipeline/real-bytes-validation-<date>.json (default --out).
 * Without --apply only stdout is written.
 * Exit 0 when every document matched bytes, page texts, and gold, 1 otherwise, 2 on bad arguments.
 */
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {extractPdf} from '../../src/lib/documents/extract/pdf';
import {sha256Hex} from '../../src/lib/documents/extract/pages-json';
import {isPendingGold,loadRecordedFixture,recordedOfflineDoc,offlineHkCandidates,scoredRows,scoreHkFacts} from '../../src/lib/documents/hk-facts/eval';
import type {HkGoldFile,ScoredCandidate} from '../../src/lib/documents/hk-facts/eval';
import {EXTRACTOR_VERSION,HK_EXTRACTOR_REF,TABLE_ALGO_VERSION} from '../../src/lib/documents/types';
import type {PagesJson} from '../../src/lib/documents/types';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';

const USAGE='usage: validate-extraction.ts [--gold <path>] [--fixtures <dir>] [--out <path>] [--apply]';
const bad=(m:string):never=>{console.error(m);console.error(USAGE);process.exit(2);};
interface Args{gold:string;fixtures:string;out:string;apply:boolean}
function parseArgs(argv:string[]):Args{
 const a:Args={apply:false,gold:'src/lib/documents/fixtures/gold/hk-facts.json',fixtures:'src/lib/documents/fixtures/hkex',out:`docs/audits/2026-11-06-document-pipeline/real-bytes-validation-${new Date().toISOString().slice(0,10)}.json`};
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--'))bad(`missing value for ${argv[i]}`);return v as string;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--gold')a.gold=next(i++);else if(x==='--fixtures')a.fixtures=next(i++);else if(x==='--out')a.out=next(i++);else if(x==='--apply')a.apply=true;else bad(`unknown argument: ${x}`);
 }
 return a;
}
const textHash=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');

export async function main(argv:string[]=process.argv.slice(2)){
 const args=parseArgs(argv);
 const goldBytes=readFileSync(args.gold);const gold=JSON.parse(goldBytes.toString('utf8')) as HkGoldFile;
 const shas=[...new Set(gold.entries.filter(e=>!isPendingGold(e)).map(e=>e.source.document_sha256))].sort();
 const fixtures=new Map<string,string>();
 if(existsSync(args.fixtures))for(const f of readdirSync(args.fixtures).filter(n=>n.endsWith('.pages.json'))){try{fixtures.set(loadRecordedFixture(JSON.parse(readFileSync(join(args.fixtures,f),'utf8'))).header.content_sha256,f);}catch{/* skip */}}
 const ua=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const codeVersion=resolveCodeVersion({allowGit:true})??'unknown';
 const budget={remainingMs:()=>Number.POSITIVE_INFINITY};
 const documents:Record<string,unknown>[]=[];const rows:ScoredCandidate[]=[];let ok=shas.length>0;
 for(const s of shas){
  const file=fixtures.get(s);
  if(!file){documents.push({content_sha256:s,error:'missing_fixture'});ok=false;continue;}
  const {header,pages:recorded,recordedPageNos}=loadRecordedFixture(JSON.parse(readFileSync(join(args.fixtures,file),'utf8')));
  const res=await fetch(header.source_url,{headers:{'User-Agent':ua},signal:AbortSignal.timeout(120_000)});
  if(!res.ok){documents.push({file,source_url:header.source_url,error:`http_${res.status}`});ok=false;continue;}
  const bytes=new Uint8Array(await res.arrayBuffer());
  const got=sha256Hex(bytes);
  if(got!==s){documents.push({file,source_url:header.source_url,error:'content_sha256_mismatch',expected:s,got});ok=false;continue;}
  const fresh=await extractPdf(bytes,budget);
  const recordedHash=new Map(recorded.pages.filter(p=>recordedPageNos.includes(p.page_no)).map(p=>[p.page_no,textHash(p.text)]));   // a --pages subset compares only its pages
  const mismatches=fresh.pages.filter(p=>recordedHash.has(p.page_no)&&recordedHash.get(p.page_no)!==textHash(p.text)).map(p=>p.page_no);
  if(fresh.pages.length!==header.page_count||mismatches.length>0)ok=false;
  const json:PagesJson={extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:codeVersion,content_sha256:s,has_text_layer:fresh.hasTextLayer,pages:fresh.pages};
  const {candidates,results}=await offlineHkCandidates(json,recordedOfflineDoc(header,file.replace(/\.pages\.json$/,'')));
  rows.push(...scoredRows(s,candidates,results));
  documents.push({file,source_url:header.source_url,content_sha256:s,bytes:bytes.length,page_count:fresh.pages.length,recorded_page_count:header.page_count,compared_pages:recordedPageNos.length,text_hash_mismatches:mismatches,candidates:candidates.length,checks_passed:results.filter(r=>r.checks_passed).length});
 }
 const evaluation=scoreHkFacts(gold,createHash('sha256').update(goldBytes).digest('hex'),rows,{extractor_ref:HK_EXTRACTOR_REF,extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:codeVersion});
 const bytes_text_ok=ok;const gold_ok=shas.length>0&&evaluation.mismatches.length===0;
 ok=bytes_text_ok&&gold_ok;
 const report={generated_at:new Date().toISOString(),code_version:codeVersion,ok,bytes_text_ok,gold_ok,documents,evaluation};
 if(args.apply){
  mkdirSync(dirname(args.out),{recursive:true});
  writeFileSync(args.out,`${JSON.stringify(report,null,1)}\n`);
 }
 console.log(JSON.stringify(report,null,1));
 return ok?0:1;
}

if(process.argv[1]?.endsWith('validate-extraction.ts'))main().then(code=>{process.exitCode=code;}).catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
