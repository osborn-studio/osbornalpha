// One-time networked recorder for the FRED parser tests (spec §12 "录制夹具"). For every active native
// FRED series in the catalog it fetches the public CSV with cosd=2015-01-01 (keeps fixtures small, ~380 KB
// total), writes the exact response bytes to src/lib/macro/fixtures/fred/<CODE>.csv and a manifest.json
// with url, fetched_at, http_status, content_type and sha256 of the bytes. No API key. Run:
//   npx tsx scripts/macro/record-fred-fixtures.ts
//   npx tsx scripts/macro/record-fred-fixtures.ts --codes WALCL,RRPONTSYD,WTREGEN --ids US_WALCL_W,US_RRPONTSYD_D,US_WTREGEN_W
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ALL_SERIES} from '../../src/lib/macro/series-registry';

const DIR=join(process.cwd(),'src/lib/macro/fixtures/fred');
const COSD='2015-01-01';
interface ManifestEntry{code:string;series_id:string;url:string;fetched_at:string;sha256:string;content_type:string;http_status:number}

async function main(){
 const usage=()=>{console.error('Usage: record-fred-fixtures.ts [--codes CODE[,CODE...]] [--ids ID[,ID...]]');process.exit(2);};
 const options=new Map<string,string>();
 for(let i=2;i<process.argv.length;i+=2){
  const name=process.argv[i],value=process.argv[i+1];
  if(!['--codes','--ids'].includes(name)||options.has(name)||!value||value.startsWith('--'))usage();
  options.set(name,value);
 }
 const codes=options.get('--codes')?.split(',');
 const ids=options.get('--ids')?.split(',');
 const catalogDefs=ALL_SERIES.filter(d=>d.source?.adapter==='fred_csv'&&d.status==='active'&&!d.derive&&!d.aliasOf);
 const selectedCodes=codes??catalogDefs.map(d=>d.source!.seriesKey);
 if(selectedCodes.some(code=>!(/^[A-Z0-9_]{1,40}$/).test(code))||(ids!==undefined&&(ids.length!==selectedCodes.length||ids.some(id=>id.length===0))))usage();
 const defs=selectedCodes.map((code,i)=>({id:ids?.[i]??(codes?code:catalogDefs[i].id),source:{seriesKey:code}}));
 mkdirSync(DIR,{recursive:true});
 const manifestPath=join(DIR,'manifest.json');
 const existing:ManifestEntry[]=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):[];
 const manifest=new Map(existing.map(entry=>[entry.code,entry]));
 for(const d of defs){
  const code=d.source!.seriesKey;
  const url=`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${code}&cosd=${COSD}`;
  const res=await fetch(url,{headers:{'user-agent':'OsbornAlpha-macro-fixture-recorder/1'}});
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(res.status!==200)throw new Error(`${code}: HTTP ${res.status}`);
  const head=new TextDecoder().decode(bytes.slice(0,64));
  if(!head.startsWith(`observation_date,${code}`))throw new Error(`${code}: unexpected header ${JSON.stringify(head.slice(0,40))}`);
  writeFileSync(join(DIR,`${code}.csv`),bytes);
  manifest.set(code,{code,series_id:d.id,url,fetched_at:new Date().toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),content_type:res.headers.get('content-type')??'',http_status:res.status});
  console.log(`${code}\t${bytes.byteLength} bytes`);
 }
 writeFileSync(manifestPath,JSON.stringify([...manifest.values()].sort((a,b)=>a.code.localeCompare(b.code)),null,1)+'\n');
}
main().catch(e=>{console.error(e);process.exit(1);});
