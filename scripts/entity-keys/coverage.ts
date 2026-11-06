/**
 * Success-criteria measurements (spec §1.1). Read-only.
 *   npx tsx scripts/entity-keys/coverage.ts [--segment e1|all] [--out <file.md>]
 * E1: FIGI/ISIN coverage of open security rows of US in-scope issuers (targets 95% / 90%).
 * --out writes a markdown table (e.g. docs/audits/2026-11-05-data-foundation-3/e1-<date>.md).
 */
import {writeFileSync} from 'node:fs';
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {coverageE1,type E1Result} from '../../src/lib/entities/coverage';
import {errorMessage} from '../../src/lib/entities/load-sec';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

function args(argv:string[]){
 let segment='all',out:string|null=null;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--segment')segment=argv[++i]??'';
  else if(argv[i]==='--out')out=argv[++i]??null;
  else{console.error('usage: coverage.ts [--segment e1|all] [--out <file.md>]');process.exit(2);}
 }
 if(!['e1','all'].includes(segment)||(argv.includes('--out')&&!out)){console.error('usage: coverage.ts [--segment e1|all] [--out <file.md>]');process.exit(2);}
 return {segment,out};
}
const e1Markdown=(r:E1Result,at:string)=>[
 `## E1 · 标识符覆盖（${at}）`,'','| 指标 | 分子 | 分母 | 百分比 | 目标 | 达标 |','|---|---|---|---|---|---|',
 `| FIGI（美股范围发行人未关闭行） | ${r.figi.num} | ${r.figi.den} | ${r.figi.pct??'—'} | 95% | ${r.passes.figi?'是':'否'} |`,
 `| ISIN（其中发行人有 LEI 的行） | ${r.isin.num} | ${r.isin.den} | ${r.isin.pct??'—'} | 90% | ${r.passes.isin?'是':'否'} |`,'',
].join('\n');

async function main(){
 const {out}=args(process.argv.slice(2));
 const tables=supabaseTableClient(getAdminSupabase());
 const at=new Date().toISOString();
 const e1=coverageE1({
  scope:await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id'),
  securities:await selectAll(tables,'issuer_securities',{valid_to:null},'ticker'),
  issuers:await selectAll(tables,'issuers',{},'issuer_id'),
 });
 console.log(JSON.stringify({at,e1},null,1));
 if(out)writeFileSync(out,e1Markdown(e1,at));
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
