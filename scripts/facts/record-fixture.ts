/**
 * Record provider fixtures for the facts tests (plan 2 §11.1). Modes:
 *   npx tsx scripts/facts/record-fixture.ts --edgar <cik>                 → src/lib/facts/fixtures/edgar/CIK<10>.trimmed.json
 *   npx tsx scripts/facts/record-fixture.ts --edgar-revise <cik>          → CIK<10>.revised.json (trimmed + one later 10-K entry)
 * EDGAR trimming keeps only catalogue tags and entries with end >= 2019-01-01 and re-serialises with the
 * original number literals (scanJsonNumbers + stringifyPreservingNumbers; no value round-trips through a JS
 * number).
 *   node --env-file=<file outside the repo with TUSHARE_TOKEN> --import tsx scripts/facts/record-fixture.ts --tushare <ts_code> [--since-year <yyyy>]
 *                                                                          → fixtures/tushare/<ts_code>.<api>.rt<n>.p<k>.json (+ .meta.json), byte-exact pages
 * Tushare pages are written byte-for-byte as received; the .meta.json sibling carries the request params, fields,
 * http status, has_more, recorded_at and the page sha256. Real fixtures (fixtures/tushare) replace the synthetic ones
 * (fixtures/tushare/_synthetic) in the loader automatically. After recording, do the report_type 1/4/5 and paging
 * check of spec §15 item 1 and write the result into docs/audits/2026-11-04-data-foundation-2/17-tushare-verification.md.
 * (--cninfo mode is added by Task 13.) Exit 2 on bad arguments or a missing TUSHARE_TOKEN.
 */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FACT_CONCEPTS} from '../../src/lib/facts/concepts';
import {scanJsonNumbers} from '../../src/lib/facts/json-numbers';
import {budgetFor,padCik,stringifyPreservingNumbers} from '../../src/lib/facts/providers/shared';
import {companyFactsUrl,fetchCompanyFacts,tagsOf} from '../../src/lib/facts/providers/edgar-companyfacts';
import {fetchTushareStatements} from '../../src/lib/facts/providers/tushare-statements';

const ROOT=fileURLToPath(new URL('../../src/lib/facts/fixtures/',import.meta.url));
const SINCE_END='2019-01-01';
const USAGE='usage: record-fixture.ts --edgar <cik> | --edgar-revise <cik> | --tushare <ts_code> [--since-year <yyyy>]';
const TAGS=new Set(FACT_CONCEPTS.flatMap(tagsOf));
// The revision used by sync-us.integration.test.ts: FY2023 revenue re-disclosed by a later 10-K with a
// different value. The base entry is selected by accn AND the exact period (a 10-K carries comparative
// years under the same accn, round-1 #18) and its literal must equal baseVal before anything is written;
// the same start/end/val/filed literals are asserted downstream (Task 10 Step 9, Task 11).
const REVISION={baseAccn:'0000320193-23-000106',tag:'RevenueFromContractWithCustomerExcludingAssessedTax',start:'2022-09-25',end:'2023-09-30',baseVal:'383285000000',accn:'0000320193-25-900001',fy:'2025',filed:'2025-11-01',val:'383285000001'};
type Tree=Record<string,unknown>;
const num=(v:unknown)=>v&&typeof v==='object'&&typeof (v as {__num?:unknown}).__num==='string'?(v as {__num:string}).__num:null;
const write=(rel:string,text:string)=>{const p=join(ROOT,rel);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,text);console.log(`wrote ${p} (${text.length} chars)`);};
const fail=(msg:string):never=>{console.error(msg);process.exit(2);};

function trimCompanyFacts(tree:Tree):{facts:Tree;kept:string[]}{
 const facts:Tree={};const kept:string[]=[];
 for(const [tax,tags] of Object.entries((tree.facts??{}) as Record<string,Record<string,{units?:Record<string,Tree[]>}>>)){
  for(const [tag,body] of Object.entries(tags)){
   if(!TAGS.has(`${tax}:${tag}`))continue;
   const units:Tree={};
   for(const [unit,entries] of Object.entries(body.units??{})){const keep=entries.filter(e=>typeof e.end==='string'&&e.end>=SINCE_END);if(keep.length)units[unit]=keep;}
   if(!Object.keys(units).length)continue;
   ((facts[tax]??={}) as Tree)[tag]={units};kept.push(`${tax}:${tag}`);
  }
 }
 return {facts,kept:kept.sort()};
}

async function recordEdgar(cik:string){
 const cik10=padCik(cik);const url=companyFactsUrl(cik10);
 const snap=await fetchCompanyFacts(cik10,budgetFor(300_000));
 const tree=scanJsonNumbers(snap.bytes) as Tree;
 const {facts,kept}=trimCompanyFacts(tree);
 const out={__recorded:{at:new Date().toISOString(),source_sha256:snap.sha256,url,bytes:snap.bytes.byteLength,trimmed:{since_end:SINCE_END,tags:kept}},cik:tree.cik,entityName:tree.entityName,facts};
 write(`edgar/CIK${cik10}.trimmed.json`,stringifyPreservingNumbers(out,1));
}
function reviseEdgar(cik:string){
 const cik10=padCik(cik);
 const tree=scanJsonNumbers(new Uint8Array(readFileSync(join(ROOT,`edgar/CIK${cik10}.trimmed.json`)))) as Tree;
 const units=(((tree.facts as Tree)['us-gaap'] as Tree)[REVISION.tag] as {units:Record<string,Tree[]>}).units;
 const usd=units.USD??fail(`no USD entries for ${REVISION.tag}`);
 const base=usd.find(e=>e.accn===REVISION.baseAccn&&e.fp==='FY'&&e.start===REVISION.start&&e.end===REVISION.end)??fail(`base entry ${REVISION.baseAccn} for ${REVISION.start}..${REVISION.end} not found`);
 if(num(base.val)!==REVISION.baseVal)fail(`base value ${num(base.val)} differs from the expected ${REVISION.baseVal}: verify the fixture (Task 10 Step 8) before revising`);
 if(usd.some(e=>e.accn===REVISION.accn))fail('already revised');
 usd.push({start:REVISION.start,end:REVISION.end,val:{__num:REVISION.val},accn:REVISION.accn,fy:{__num:REVISION.fy},fp:'FY',form:'10-K',filed:REVISION.filed,frame:'CY2023'});
 (tree.__recorded as Tree).revision={...REVISION};
 write(`edgar/CIK${cik10}.revised.json`,stringifyPreservingNumbers(tree,1));
}
async function recordTushare(tsCode:string,sinceYear:number){
 if(!process.env.TUSHARE_TOKEN)fail('TUSHARE_TOKEN is not set (pass it with node --env-file=<file outside the repo>)');
 if(!Number.isInteger(sinceYear)||sinceYear<1990||sinceYear>2100)fail('bad --since-year');
 const snaps=await fetchTushareStatements(tsCode,sinceYear,budgetFor(600_000));
 for(const s of snaps){
  const rt=(s.meta.params as {report_type:string}).report_type;
  const base=`tushare/${tsCode}.${s.meta.api}.rt${rt}.p${s.meta.page}`;
  const p=join(ROOT,`${base}.json`);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,s.bytes);console.log(`wrote ${p} (${s.bytes.byteLength} bytes, sha256 ${s.sha256.slice(0,8)})`);
  write(`${base}.meta.json`,JSON.stringify({recorded_at:s.meta.fetched_at,sha256:s.sha256,http_status:s.meta.http_status,has_more:s.meta.has_more,params:s.meta.params,fields:s.meta.fields},null,1));
 }
}
async function main(){
 const [mode,...rest]=process.argv.slice(2);
 if(mode==='--edgar'&&rest[0])return recordEdgar(rest[0]);
 if(mode==='--edgar-revise'&&rest[0])return reviseEdgar(rest[0]);
 if(mode==='--tushare'&&rest[0]){const i=rest.indexOf('--since-year');return recordTushare(rest[0],i>=0?Number(rest[i+1]):new Date().getUTCFullYear()-10);}
 fail(USAGE);
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
