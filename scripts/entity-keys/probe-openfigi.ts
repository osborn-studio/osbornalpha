/**
 * Live check for spec §4.1.2 / §14-2 (Task 3b Step 8): maps AAPL, Kweichow Moutai and Tencent by
 * ISIN and by TICKER WITHOUT an API key, prints exchCode/securityType/compositeFIGI per record and
 * writes the exact response bytes for verification.md.
 *   npx tsx scripts/entity-keys/probe-openfigi.ts <out-dir>
 * No database access. Never pass OPENFIGI_API_KEY here (the check is the keyless path).
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {memoryRawStore} from '../../src/lib/dq/raw-store';
import {groupFigiResults,mapJobs,type FigiJob} from '../../src/lib/entities/identifiers/openfigi';

const ISIN_JOBS:FigiJob[]=[{idType:'ID_ISIN',idValue:'US0378331005'},{idType:'ID_ISIN',idValue:'CNE0000018R8'},{idType:'ID_ISIN',idValue:'KYG875721634'}];
const TICKER_JOBS:FigiJob[]=[{idType:'TICKER',idValue:'AAPL',exchCode:'US'},{idType:'TICKER',idValue:'600519',exchCode:'CG'},{idType:'TICKER',idValue:'700',exchCode:'HK'}];

async function main(){
 const out=process.argv[2];
 if(!out){console.error('usage: probe-openfigi.ts <out-dir>');process.exit(2);}
 mkdirSync(out,{recursive:true});
 for(const [label,jobs] of [['isin',ISIN_JOBS],['ticker',TICKER_JOBS]] as const){
  const raw=memoryRawStore();
  const res=await mapJobs(jobs,{fetch,raw,apiKey:null});
  if(res.exhausted){console.error(`${label}: rate limited / unavailable`);process.exitCode=1;continue;}
  for(const [path,bytes] of raw.objects)writeFileSync(join(out,`openfigi-${label}-${path.split('/').pop()}`),bytes);
  res.results.forEach((r,i)=>{
   console.log(`== ${label} ${jobs[i].idValue} → ${r?.status}`);
   if(r?.status==='ok'){
    for(const x of r.records)console.log(`  exchCode=${x.exchCode} ticker=${x.ticker} securityType=${x.securityType} securityType2=${x.securityType2} marketSector=${x.marketSector} compositeFIGI=${x.compositeFIGI} figi=${x.figi}`);
    console.log('  grouped:',JSON.stringify(groupFigiResults(r.records)));
   }
   if(r)console.log(`  response_sha256=${r.evidence.response_sha256}`);
  });
 }
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
