/**
 * Record provider fixtures of the industry module (spec §10). Tushare pages are written in the envelope the
 * Task 5 fixtureTushareCall serves — {"request":{api_name,params,fields},"response_sha256":…, <the response
 * object's own keys, byte-for-byte>} — so numeric literals are never re-serialized and the token (never a
 * request param) never reaches a file. SEC files are written as received, with a .meta.json sibling.
 *
 * Tushare (needs TUSHARE_TOKEN; exit 2 without it). Never print the token; run with the env file outside the repo:
 *   node --env-file="$HOME/.config/osbornalpha/secrets.env" --import tsx scripts/industry/record-fixture.ts --sw-classify
 *        → src/lib/industry/fixtures/tushare/index_classify-SW2021-L<n>.json  (levels L1..L3; 31/134/346 on 2026-11-06)
 *   … --sw-members <l1_code>     → index_member_all-<l1>-<Y|N>-p<k>.json  (is_new Y and N, limit/offset 2000 rows/page)
 *   … --stock-basic <L|D|P>      → stock_basic-<status>-p<k>.json          (upstream returns only L unless asked, K-§17.1)
 *   … --sw-daily <index_code>    → sw_daily-<code>-p<k>.json               (deferred I-3 input; recording only)
 *   … --daily-basic <YYYYMMDD>   → daily_basic-<date>-p<k>.json            (6000 rows/page; free_share included, K1)
 *   … --trade-cal                → trade_cal-SSE-p<k>.json
 * SEC (no token; EDGAR_USER_AGENT or DEFAULT_USER_AGENT; ≤ 10 requests/s):
 *   npx tsx scripts/industry/record-fixture.ts --sec-submissions <cik>  → fixtures/sec/submissions-<cik10>.json
 *   npx tsx scripts/industry/record-fixture.ts --sic-codes              → fixtures/sec/sic-codes.html
 * Every file directly in fixtures/tushare is served by fixtureTushareCall (rows merged per api): record a new
 * whole-market page into a scratch directory first, and only move into fixtures/tushare what tests should see.
 * Exit 1 on an upstream error (Tushare code ≠ 0, HTTP ≠ 200), 2 on bad arguments or a missing token.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tushareCallRaw} from '../../src/lib/data/sources/tushare';
import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';

const ROOT=fileURLToPath(new URL('../../src/lib/industry/fixtures/',import.meta.url));
const USAGE='usage: record-fixture.ts --sw-classify | --sw-members <l1_code> | --stock-basic <L|D|P> | --sw-daily <index_code> | --daily-basic <YYYYMMDD> | --trade-cal | --sec-submissions <cik> | --sic-codes';
const SEC_SIC_CODES_URL='https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list';
function fail(msg:string):never{console.error(msg);process.exit(2);}
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
function write(rel:string,bytes:Uint8Array,meta:Record<string,unknown>){
 const p=join(ROOT,rel);mkdirSync(join(p,'..'),{recursive:true});
 writeFileSync(p,bytes);writeFileSync(p.replace(/\.(json|html)$/,'.meta.json'),JSON.stringify({...meta,recorded_at:new Date().toISOString(),sha256:sha(bytes),bytes:bytes.byteLength},null,1)+'\n');
 console.log(`wrote ${p} (${bytes.byteLength} bytes)`);
}

/** Pages one Tushare API by offset until has_more is false; each page is its own file in the fixture envelope. */
async function tusharePages(api:string,params:Record<string,unknown>,fields:string,pageSize:number,name:(k:number)=>string){
 for(let k=0,offset=0;;k++,offset+=pageSize){
  const r=await tushareCallRaw(api,params,fields,{limit:pageSize,offset});
  if(r.code!==0){console.error(`${api} code ${r.code}`);process.exit(1);}   // never echo the upstream message (it may quote the request)
  const body=new TextDecoder().decode(r.bytes).trim();
  if(!body.startsWith('{'))fail(`${api}: response is not a JSON object`);
  const head=JSON.stringify({request:{api_name:api,params:{...params,limit:pageSize,offset},fields},response_sha256:sha(r.bytes)});
  const p=join(ROOT,'tushare',name(k));mkdirSync(join(p,'..'),{recursive:true});
  writeFileSync(p,`${head.slice(0,-1)},${body.slice(1)}\n`);
  console.log(`wrote ${p} (${r.items.length} rows, has_more ${r.hasMore})`);
  if(!r.hasMore||r.items.length===0)return;
 }
}
async function secGet(url:string):Promise<Uint8Array>{
 const res=await fetch(url,{headers:{'User-Agent':process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,'Accept-Encoding':'gzip, deflate'}});
 if(res.status!==200){console.error(`GET ${url} → HTTP ${res.status}`);process.exit(1);}
 return new Uint8Array(await res.arrayBuffer());
}

async function main(){
 const [mode,arg]=process.argv.slice(2);
 const needsToken=['--sw-classify','--sw-members','--stock-basic','--sw-daily','--daily-basic','--trade-cal'];
 if(mode===undefined)fail(USAGE);
 if(needsToken.includes(mode)&&!process.env.TUSHARE_TOKEN)fail('TUSHARE_TOKEN not set (pass --env-file with a file outside the repo)');
 switch(mode){
  case '--sw-classify':
   for(const level of ['L1','L2','L3'])await tusharePages('index_classify',{level,src:'SW2021'},'index_code,industry_name,parent_code,level,industry_code,is_pub,src',5000,k=>`index_classify-SW2021-${level}${k?`-p${k}`:''}.json`);
   return;
  case '--sw-members':
   if(!arg||!/^\d{6}\.SI$/.test(arg))fail(USAGE);
   for(const isNew of ['Y','N'])await tusharePages('index_member_all',{l1_code:arg,is_new:isNew},'l1_code,l1_name,l2_code,l2_name,l3_code,l3_name,ts_code,name,in_date,out_date,is_new',2000,k=>`index_member_all-${arg}-${isNew}-p${k}.json`);
   return;
  case '--stock-basic':
   if(!arg||!['L','D','P'].includes(arg))fail(USAGE);
   await tusharePages('stock_basic',{list_status:arg},'ts_code,symbol,name,fullname,exchange,list_status,list_date,delist_date',5000,k=>`stock_basic-${arg}-p${k}.json`);
   return;
  case '--sw-daily':
   if(!arg||!/^\d{6}\.SI$/.test(arg))fail(USAGE);
   await tusharePages('sw_daily',{ts_code:arg},'ts_code,trade_date,name,open,low,high,close,change,pct_change,vol,amount,pe,pb,float_mv,total_mv',4000,k=>`sw_daily-${arg}-p${k}.json`);
   return;
  case '--daily-basic':
   if(!arg||!/^\d{8}$/.test(arg))fail(USAGE);
   await tusharePages('daily_basic',{trade_date:arg},'ts_code,trade_date,close,total_share,free_share,total_mv',6000,k=>`daily_basic-${arg}-p${k}.json`);
   return;
  case '--trade-cal':
   await tusharePages('trade_cal',{exchange:'SSE'},'exchange,cal_date,is_open,pretrade_date',10000,k=>`trade_cal-SSE-p${k}.json`);
   return;
  case '--sec-submissions':{
   if(!arg||!/^[1-9]\d{0,9}$/.test(arg))fail(USAGE);
   const cik10=arg.padStart(10,'0');const url=`https://data.sec.gov/submissions/CIK${cik10}.json`;
   write(`sec/submissions-${cik10}.json`,await secGet(url),{url});
   return;
  }
  case '--sic-codes':
   write('sec/sic-codes.html',await secGet(SEC_SIC_CODES_URL),{url:SEC_SIC_CODES_URL});
   return;
  default:fail(USAGE);
 }
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
