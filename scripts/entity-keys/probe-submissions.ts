/**
 * Verification helper for spec §14-9 (Task 6a Step 9): fetches one CIK's submissions including
 * every filings.files[] page and prints the page structure the parser saw. No database access.
 *   npx tsx scripts/entity-keys/probe-submissions.ts <cik> [<out-dir>]
 * With <out-dir>, writes the exact main and page bytes there (for a trimmed fixture).
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {memoryRawStore} from '../../src/lib/dq/raw-store';
import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';

async function main(){
 const [cik,out]=process.argv.slice(2);
 if(!cik){console.error('usage: probe-submissions.ts <cik> [<out-dir>]');process.exit(2);}
 const raw=memoryRawStore();
 const s=await fetchSubmissions(cik,{fetch,raw},{coverFrom:'1993-01-01'});
 const byPage:Record<string,{n:number;earliest:string;latest:string}>={};
 for(const f of s.parsed.filings){const p=byPage[f.page]??={n:0,earliest:f.filingDate,latest:f.filingDate};p.n++;if(f.filingDate<p.earliest)p.earliest=f.filingDate;if(f.filingDate>p.latest)p.latest=f.filingDate;}
 console.log(JSON.stringify({cik:s.cik,files:s.parsed.files,complete:s.complete,main:s.main,pages:s.pages,byPage,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,tickers:s.parsed.tickers},null,1));
 if(out){mkdirSync(out,{recursive:true});for(const [path,bytes] of raw.objects)writeFileSync(join(out,path.split('/').pop()!),bytes);}
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
