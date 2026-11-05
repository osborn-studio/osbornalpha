// src/lib/facts/rules.test.ts
import {describe,it,expect} from 'vitest';
import {INFO_CODES,batchStatusFromCounts,emptyCounts} from '../dq/batches';
import {evaluateFactRules,summarizeWarnings,mergeWarnings} from './rules';
import type {FactInsert,FactRow} from './types';

const ISSUER='00000000-0000-4000-8000-000000000001';
const F1='10000000-0000-4000-8000-000000000001',F2='10000000-0000-4000-8000-000000000002';
const sourceRefOf=new Map([[F1,'acc-1'],[F2,'acc-2']]);
let n=0;
const ins=(concept:string,value:string,over:Partial<FactInsert>={}):FactInsert=>({fact_id:`30000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:ISSUER,market:'US',filing_id:F1,concept,source_concept:concept,statement:'BS',period_start:null,period_end:'2023-09-30',duration:'INSTANT',value,unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...over});
const ok=(concept:string,value:string,over:Partial<FactRow>={}):FactRow=>({...ins(concept,value),run_id:'r',value_text:value,status:'ok',created_at:'2024-01-01T00:00:00Z',...over});
const IS={statement:'IS' as const,period_start:'2022-10-01',duration:'12M' as const};
const run=(newRows:FactInsert[],okRows:FactRow[]=[])=>evaluateFactRules({newRows,okRows,sourceRefOf,issuerId:ISSUER,market:'US',mappingGen:1});

describe('evaluateFactRules',()=>{
 it('passes a balanced sheet and quarantines only the new rows of an unbalanced one',()=>{
  expect(run([ins('total_assets','1000'),ins('liabilities_and_equity','1004')]).quarantine).toEqual([]);
  const assets=ins('total_assets','1000');
  const out=run([assets],[ok('liabilities_and_equity','1100')]);
  expect(out.quarantine).toHaveLength(1);
  expect(out.quarantine[0]).toMatchObject({reason:'identity_bs',rule:'identity_bs',factIds:[assets.fact_id],naturalKey:`${ISSUER}:US:BS:2023-09-30:USD:acc-1:1`,key:{statement:'BS',period_end:'2023-09-30',unit:'USD',source_ref:'acc-1'}});
  expect(out.quarantine[0].detail).toMatchObject({left:'1000',right:'1100',concepts:['total_assets','liabilities_and_equity']});
 });
 it('falls back to liabilities + equity_total and skips the check when inputs are missing or in another unit',()=>{
  const bad=run([ins('total_assets','1000'),ins('total_liabilities','600'),ins('equity_total','300')]);
  expect(bad.quarantine.map(q=>q.reason)).toEqual(['identity_bs']);
  expect(bad.quarantine[0].factIds).toHaveLength(3);
  expect(run([ins('total_assets','1000'),ins('total_liabilities','600')]).quarantine).toEqual([]);
  expect(run([ins('total_assets','1000')],[ok('liabilities_and_equity','1100',{unit:'EUR'})]).quarantine).toEqual([]);
  // the identity is checked inside one filing: an ok row from another filing is not an input
  expect(run([ins('total_assets','1000')],[ok('liabilities_and_equity','1100',{filing_id:F2})]).quarantine).toEqual([]);
 });
 it('checks gross profit only when disclosed and names identity_gp with the IS key',()=>{
  const gp=ins('gross_profit','40',IS);
  const out=run([gp,ins('revenue','100',IS),ins('cost_of_revenue','70',IS)]);
  expect(out.quarantine).toHaveLength(1);
  expect(out.quarantine[0]).toMatchObject({reason:'identity_gp',naturalKey:`${ISSUER}:US:IS:2022-10-01:2023-09-30:USD:acc-1:1`,factIds:[gp.fact_id,expect.any(String),expect.any(String)]});
  expect(run([ins('gross_profit','30',IS),ins('revenue','100',IS),ins('cost_of_revenue','70',IS)]).quarantine).toEqual([]);
  expect(run([ins('revenue','100',IS),ins('cost_of_revenue','70',IS)]).quarantine).toEqual([]);
 });
 it('does not quarantine when every input of a failing identity is an old ok row',()=>{
  expect(run([ins('cash','5')],[ok('total_assets','1000'),ok('liabilities_and_equity','1100')]).quarantine).toEqual([]);
 });
 it('collects warnings per rule without quarantining',()=>{
  const out=run([ins('revenue','100',IS),ins('cost_of_revenue','250',IS)]);
  expect(out.quarantine).toEqual([]);
  expect(out.warnings.get('gross_margin_range')).toEqual([`${ISSUER}:US:IS:2022-10-01:2023-09-30:USD:acc-1:1`]);
  expect(out.warnings.get('revenue_jump')).toEqual([]);
  const prior=ok('revenue','10',{...IS,filing_id:F2,period_start:'2021-10-01',period_end:'2022-09-30',is_current:true});
  const jump=run([ins('revenue','1000',IS)],[prior]);
  expect(jump.warnings.get('revenue_jump')).toHaveLength(1);
  expect(run([ins('revenue','100',IS)],[prior]).warnings.get('revenue_jump')).toEqual([]);
  expect(run([ins('revenue','1000',IS)],[prior,ok('revenue','20',{...IS,filing_id:F1,period_start:'2021-10-01',period_end:'2022-09-30'})]).warnings.get('revenue_jump')).toEqual([]); // ambiguous prior → no warning
 });
 it('summarises warnings as one informational batch error per rule and merges across issuers',()=>{
  const a=new Map([['gross_margin_range',['k1']],['revenue_jump',[]]]);
  const merged=mergeWarnings(a,new Map([['gross_margin_range',['k2']],['revenue_jump',['k3']]]));
  const errors=summarizeWarnings(merged);
  expect(errors).toEqual([
   {code:'rule_warning_summary',key:'gross_margin_range',message:JSON.stringify({count:2,keys:['k1','k2']})},
   {code:'rule_warning_summary',key:'revenue_jump',message:JSON.stringify({count:1,keys:['k3']})},
  ]);
  expect(INFO_CODES).toEqual(['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit']);
  expect(batchStatusFromCounts({...emptyCounts(),inserted:1},errors)).toBe('success');
  expect(summarizeWarnings(new Map([['x',[]]]))).toEqual([]);
 });
 it('compares exact decimals: no float rounding, no overflow on huge values',()=>{
  // 31-digit values: doubles keep ~15 significant digits, exact decimals keep all of them
  const big='1'+'0'.repeat(30);
  expect(run([ins('total_assets',big),ins('liabilities_and_equity',big+'.5')]).quarantine).toEqual([]);
  expect(run([ins('total_assets',big),ins('liabilities_and_equity','1006'+'0'.repeat(27))]).quarantine).toHaveLength(1);
  // 300-digit literals overflow doubles to Infinity but stay exact here
  const huge='9'+'0'.repeat(299);
  expect(run([ins('total_assets',huge),ins('liabilities_and_equity',huge)]).quarantine).toEqual([]);
  expect(run([ins('total_assets',huge),ins('liabilities_and_equity','8'+'0'.repeat(299))]).quarantine).toHaveLength(1);
  // boundary: diff = 0.5% of max(|l|,|r|) at r = 1000/0.995 = 1005.0251256...
  expect(run([ins('total_assets','1000'),ins('liabilities_and_equity','1005.025')]).quarantine).toEqual([]);
  expect(run([ins('total_assets','1000'),ins('liabilities_and_equity','1005.026')]).quarantine).toHaveLength(1);
  expect(run([ins('total_assets','200'),ins('liabilities_and_equity','200.995')]).quarantine).toEqual([]);
  // gross margin boundary |margin| = 1 passes exactly; just beyond warns
  expect(run([ins('revenue','100',IS),ins('cost_of_revenue','200',IS)]).warnings.get('gross_margin_range')).toEqual([]);
  expect(run([ins('revenue','100',IS),ins('cost_of_revenue','200.0000000000000001',IS)]).warnings.get('gross_margin_range')).toHaveLength(1);
 });
 it('does not fill identity inputs from a superseded mapping generation',()=>{
  const assets=ins('total_assets','1000',{mapping_gen:2});
  expect(run([assets],[ok('liabilities_and_equity','1100',{mapping_gen:1})]).quarantine).toEqual([]);
  expect(run([assets],[ok('liabilities_and_equity','1100',{mapping_gen:2})]).quarantine).toHaveLength(1);
 });
 it('checks CN gross margin against revenue_operating, not total revenue',()=>{
  const cn=(rows:FactInsert[])=>evaluateFactRules({newRows:rows,okRows:[],sourceRefOf,issuerId:ISSUER,market:'CN',mappingGen:1});
  const cny={...IS,unit:'CNY',market:'CN' as const};
  expect(cn([ins('revenue','1000',cny),ins('revenue_operating','100',cny),ins('cost_of_revenue','250',cny)]).warnings.get('gross_margin_range')).toHaveLength(1);
  expect(cn([ins('revenue','100',cny),ins('revenue_operating','1000',cny),ins('cost_of_revenue','250',cny)]).warnings.get('gross_margin_range')).toEqual([]);
  expect(cn([ins('revenue','100',cny),ins('cost_of_revenue','250',cny)]).warnings.get('gross_margin_range')).toEqual([]);
 });
 it('resolves revenue_jump priors from new rows too: bulk and incremental ingestion agree',()=>{
  const y1=ins('revenue','10',{...IS,period_start:'2021-10-01',period_end:'2022-09-30',filing_id:F2});
  const y2=ins('revenue','1000',IS);
  expect(run([y1,y2]).warnings.get('revenue_jump')).toHaveLength(1);
  const stored=ok('revenue','10',{...IS,filing_id:F2,period_start:'2021-10-01',period_end:'2022-09-30',is_current:true});
  expect(run([y2],[stored]).warnings.get('revenue_jump')).toHaveLength(1);
 });
 it('keeps operands as exact decimal strings and tests exact boundaries',()=>{
  const q=run([ins('total_assets','9007199254740993'),ins('liabilities_and_equity','1')]).quarantine;
  expect(q[0].detail).toMatchObject({left:'9007199254740993',right:'1'});
  expect(run([ins('total_assets','995'),ins('liabilities_and_equity','1000')]).quarantine).toEqual([]);
  const prior=ok('revenue','10',{...IS,filing_id:F2,period_start:'2021-10-01',period_end:'2022-09-30',is_current:true});
  expect(run([ins('revenue','110',IS)],[prior]).warnings.get('revenue_jump')).toEqual([]);
  expect(run([ins('revenue','111',IS)],[prior]).warnings.get('revenue_jump')).toHaveLength(1);
 });
});
