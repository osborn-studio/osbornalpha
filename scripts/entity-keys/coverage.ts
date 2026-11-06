/**
 * Success-criteria measurements (spec §1.1). Read-only.
 *   npx tsx scripts/entity-keys/coverage.ts [--segment e1|windows|all] [--out <file.md>]
 * E1: FIGI/ISIN coverage of open security rows of US in-scope issuers (targets 95% / 90%).
 * windows (E2): research-queue A/H rows — backfillable rows at listing_date (target 100%), with the
 * non-backfillable and open-quarantine counts reported separately. The research queue is
 * research_entity_keys with in_scope = true and a linked issuer_id (Part B contract issue 10).
 * --out writes a markdown table (e.g. docs/audits/2026-11-05-data-foundation-3/coverage-<date>.md).
 */
import {writeFileSync} from 'node:fs';
import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
import {DATASETS} from '../../src/lib/dq/datasets';
import {coverageE1,coverageE2,type E1Result,type E2Result} from '../../src/lib/entities/coverage';
import {errorMessage} from '../../src/lib/entities/load-sec';
import {SEC_ROW_KEY,keysetAll} from '../../src/lib/entities/windows';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: coverage.ts [--segment e1|windows|all] [--out <file.md>]';
function args(argv:string[]){
 let segment='all',out:string|null=null;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--segment')segment=argv[++i]??'';
  else if(argv[i]==='--out')out=argv[++i]??'';
  else{console.error(USAGE);process.exit(2);}
 }
 if(!['e1','windows','all'].includes(segment)||out===''){console.error(USAGE);process.exit(2);}
 return {segment,out};
}

async function e1(tables:TableClient){
 return coverageE1({
  scope:await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id'),
  securities:await selectAll(tables,'issuer_securities',{valid_to:null},'ticker'),
  issuers:await selectAll(tables,'issuers',{},'issuer_id'),
 });
}
async function windows(tables:TableClient){
 const rows=await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY);
 const listDates=new Map<string,string|null>();
 for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))listDates.set(String(r.ticker),typeof r.list_date==='string'?r.list_date:null);
 const queue=new Set((await keysetAll(tables,'research_entity_keys',{in_scope:true},{},'entity_id',['user_id','entity_id'])).map(r=>r.issuer_id).filter((v):v is string=>typeof v==='string'));
 const open=await selectAll(tables,'dq_quarantine',{status:'open',dataset:DATASETS.entities.windows},'id');
 const keys=new Set(open.filter(q=>q.reason_code==='window_evidence_conflict'||q.reason_code==='ownership_conflict').map(q=>String(q.natural_key)));
 return coverageE2({rows,listDates,queueIssuers:queue,openQuarantineKeys:keys});
}
const md=(at:string,a:E1Result|null,b:E2Result|null)=>[
 `# 覆盖度量（${at}）`,'',
 ...(a?['## E1 · 标识符覆盖','','| 指标 | 分子 | 分母 | 百分比 | 目标 | 达标 |','|---|---|---|---|---|---|',
  `| FIGI（美股范围发行人未关闭行） | ${a.figi.num} | ${a.figi.den} | ${a.figi.pct??'—'} | 95% | ${a.passes.figi?'是':'否'} |`,
  `| ISIN（其中发行人有 LEI 的行） | ${a.isin.num} | ${a.isin.den} | ${a.isin.pct??'—'} | 90% | ${a.passes.isin?'是':'否'} |`,'']:[]),
 ...(b?['## E2 · 持有区间（研究队列 A/H 行）','','| 指标 | 值 |','|---|---|',
  `| 可回填行中 listing_date | ${b.backfillable.num} / ${b.backfillable.den}（${b.backfillable.pct??'—'}%，目标 100%，${b.passes?'达标':'未达标'}） |`,
  `| 不可回填行 | ${b.not_backfillable} |`,`| open 隔离项（window_evidence_conflict / ownership_conflict） | ${b.open_quarantine} |`,'']:[]),
].join('\n');

async function main(){
 const {segment,out}=args(process.argv.slice(2));
 const tables=supabaseTableClient(getAdminSupabase());
 const at=new Date().toISOString();
 const a=segment==='windows'?null:await e1(tables);
 const b=segment==='e1'?null:await windows(tables);
 console.log(JSON.stringify({at,e1:a,windows:b},null,1));
 if(out)writeFileSync(out,md(at,a,b));
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
