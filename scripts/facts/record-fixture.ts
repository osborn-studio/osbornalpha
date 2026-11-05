/**
 * Record provider fixtures for the facts tests (plan 2 §11.1). Modes:
 *   npx tsx scripts/facts/record-fixture.ts --edgar <cik>                 → src/lib/facts/fixtures/edgar/CIK<10>.trimmed.json
 *   npx tsx scripts/facts/record-fixture.ts --edgar-revise <cik>          → CIK<10>.revised.json (trimmed + one later 10-K entry)
 * EDGAR trimming keeps only catalogue tags and entries with end >= 2019-01-01 and re-serialises with the
 * original number literals (scanJsonNumbers + stringifyPreservingNumbers; no value round-trips through a JS
 * number). (--tushare and --cninfo modes are added by Tasks 12/13.) Exit 2 on bad arguments.
 */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FACT_CONCEPTS} from '../../src/lib/facts/concepts';
import {scanJsonNumbers} from '../../src/lib/facts/json-numbers';
import {budgetFor,padCik,stringifyPreservingNumbers} from '../../src/lib/facts/providers/shared';
import {companyFactsUrl,fetchCompanyFacts,tagsOf} from '../../src/lib/facts/providers/edgar-companyfacts';

const ROOT=fileURLToPath(new URL('../../src/lib/facts/fixtures/',import.meta.url));
const SINCE_END='2019-01-01';
const USAGE='usage: record-fixture.ts --edgar <cik> | --edgar-revise <cik>';
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
async function main(){
 const [mode,...rest]=process.argv.slice(2);
 if(mode==='--edgar'&&rest[0])return recordEdgar(rest[0]);
 if(mode==='--edgar-revise'&&rest[0])return reviseEdgar(rest[0]);
 fail(USAGE);
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
