// One-time networked recorder for the FRED parser tests (spec §12 "录制夹具"). For every active native
// FRED series in the catalog it fetches the public CSV with cosd=2015-01-01 (keeps fixtures small, ~380 KB
// total), writes the exact response bytes to src/lib/macro/fixtures/fred/<CODE>.csv and a manifest.json
// with url, fetched_at, http_status, content_type and sha256 of the bytes. No API key. Run:
//   npx tsx scripts/macro/record-fred-fixtures.ts
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {MACRO_CATALOG} from '../../src/lib/macro/catalog';

const DIR=join(process.cwd(),'src/lib/macro/fixtures/fred');
const COSD='2015-01-01';

async function main(){
 mkdirSync(DIR,{recursive:true});
 const defs=MACRO_CATALOG.filter(d=>d.source?.adapter==='fred_csv'&&d.status==='active'&&!d.derive&&!d.aliasOf);
 const manifest:{code:string;series_id:string;url:string;fetched_at:string;sha256:string;content_type:string;http_status:number}[]=[];
 for(const d of defs){
  const code=d.source!.seriesKey;
  const url=`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${code}&cosd=${COSD}`;
  const res=await fetch(url,{headers:{'user-agent':'OsbornAlpha-macro-fixture-recorder/1'}});
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(res.status!==200)throw new Error(`${code}: HTTP ${res.status}`);
  const head=new TextDecoder().decode(bytes.slice(0,64));
  if(!head.startsWith(`observation_date,${code}`))throw new Error(`${code}: unexpected header ${JSON.stringify(head.slice(0,40))}`);
  writeFileSync(join(DIR,`${code}.csv`),bytes);
  manifest.push({code,series_id:d.id,url,fetched_at:new Date().toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),content_type:res.headers.get('content-type')??'',http_status:res.status});
  console.log(`${code}\t${bytes.byteLength} bytes`);
 }
 manifest.sort((a,b)=>a.code.localeCompare(b.code));
 writeFileSync(join(DIR,'manifest.json'),JSON.stringify(manifest,null,1)+'\n');
}
main().catch(e=>{console.error(e);process.exit(1);});
