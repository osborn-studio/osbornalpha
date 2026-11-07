// scripts/macro/record-fomc.ts
// Records the FOMC calendar (spec §6.1). Fetches the official federalreserve.gov page once, stores the exact bytes
// under src/lib/macro/fixtures/fomc/<sha256>.html, parses every year panel with parseFomcCalendar and appends a
// new retrieval version to src/lib/macro/data/fomc-meetings.json (append-only; earlier versions are never edited, so
// asOf reads can select them). An incomplete parse throws before anything is written; an unchanged page (same
// sha256 as an existing version) appends nothing.
// Run: npx tsx scripts/macro/record-fomc.ts [--dry-run]
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {FOMC_SOURCE_URL,parseFomcCalendar,type FomcMeeting,type FomcVersion} from '../../src/lib/macro/fomc';
const ROOT=process.cwd();
const FIX=join(ROOT,'src/lib/macro/fixtures/fomc');
const DATA=join(ROOT,'src/lib/macro/data/fomc-meetings.json');
async function main(){
 const dry=process.argv.includes('--dry-run');
 const res=await fetch(FOMC_SOURCE_URL,{headers:{'user-agent':'OsbornAlpha-macro-recorder/1'},redirect:'follow'});
 if(res.status!==200)throw new Error(`fomc_fetch:http_${res.status}`);
 const ct=res.headers.get('content-type')??'';
 if(!ct.startsWith('text/html'))throw new Error(`fomc_fetch:content_type:${ct}`);
 const bytes=new Uint8Array(await res.arrayBuffer());
 const sha=createHash('sha256').update(bytes).digest('hex');
 const retrievedAt=new Date().toISOString();
 const parsed=parseFomcCalendar(Buffer.from(bytes).toString('utf8'));
 const current:FomcVersion[]=existsSync(DATA)?JSON.parse(readFileSync(DATA,'utf8')):[];
 const years:Record<string,FomcMeeting[]>={};
 for(const p of parsed)years[String(p.year)]=p.meetings;
 const duplicate=current.some(v=>v.sha256===sha);
 const next:FomcVersion[]=duplicate?current:[...current,{retrieved_at:retrievedAt,sha256:sha,source_url:FOMC_SOURCE_URL,years}];
 console.log(JSON.stringify({sha256:sha,bytes:bytes.length,years:parsed.map(p=>[p.year,p.meetings.length]),duplicate}));
 if(dry)return;
 mkdirSync(FIX,{recursive:true});
 writeFileSync(join(FIX,`${sha}.html`),bytes);
 writeFileSync(DATA,JSON.stringify(next,null,1)+'\n');
}
main().catch(e=>{console.error(e);process.exit(1);});
