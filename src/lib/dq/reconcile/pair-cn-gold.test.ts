// src/lib/dq/reconcile/pair-cn-gold.test.ts
import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {makeBudget} from '../../facts/sync';
import {memoryRawStore} from '../raw-store';
import {divDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {CN_GOLD_CONCEPTS,CN_GOLD_PARSER,CN_GOLD_PATH,GOLD_CN_SCHEMA} from './gold-cn';
import type {GoldCnRow} from './gold-cn';
import {sha256Hex} from './pair-support';
import {cnTushareVsGoldPair} from './pair-cn-gold';
import {RECONCILE_PAIRS} from './pairs';
import {goldRow,reconcileTables,seedPublished} from './testing';
import type {PairContext,ReconcileResultInput} from './types';

const TICKER='600519.SH',REF='600519.SH:20241231:1:20250403';
const D={period_start:'2024-01-01',period_end:'2024-12-31'},I={period_start:null,period_end:'2024-12-31'};
const OVERRIDE:Record<string,Partial<GoldCnRow>>={
 revenue_operating:{printed_value:'1234567.89'},                                         // exact, equal → passed
 net_income_parent:{printed_value:'1234567.89'},                                         // exact, left .90 → quarantine_left
 total_assets:{printed_value:'123.46',printed_unit_multiplier:10000},                    // 万元: |1234567.89 − 1234600| = 32.11 ≤ 50 → passed
 equity_parent:{printed_value:'123.46',printed_unit_multiplier:10000},                   // 万元: |1234700 − 1234600| = 100 > 50 → review_item
 operating_cash_flow:{printed_value:'1.00'},                                             // no fact → left_missing
 eps_basic:{printed_value:'49.93'},
};
function goldBytes(){
 const rows=[2022,2023,2024,2025].flatMap(fy=>CN_GOLD_CONCEPTS.map(c=>goldRow(TICKER,fy,c,fy===2024?OVERRIDE[c]:{})));
 return new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[TICKER],fiscal_years:[2022,2023,2024,2025],concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R2',rows}));
}
async function setup(){
 const tables=reconcileTables();const db=memoryFactsDb(tables);const issuer=randomUUID();
 await tables.insert('issuers',{issuer_id:issuer,status:'active',merged_into:null,cik:null,lei:null,usci:null,canonical_name_en:null,canonical_name_zh:'贵州茅台'});
 await tables.insert('issuer_securities',{issuer_id:issuer,ticker:TICKER,valid_from:'2001-08-27',valid_to:null,is_primary:true,share_class:'A',isin:null,figi:null});
 const seeded=await seedPublished(db,{issuer,market:'CN',sourceRef:REF,availableDate:'2025-04-03',facts:[
  {concept:'revenue_operating',value:'1234567.89',...D},{concept:'net_income_parent',value:'1234567.9',...D},
  {concept:'total_assets',value:'1234567.89',...I},{concept:'equity_parent',value:'1234700',...I},
  {concept:'eps_basic',value:'49.93',...D,unit:'CNY/share'}]});
 const bytes=goldBytes();
 const ctx:PairContext={db,tables,raw:memoryRawStore(),now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,
  readRepoFile:async p=>{if(p!==CN_GOLD_PATH)throw new Error(`missing ${p}`);return bytes;}};
 const facts=new Map((await db.factsByIds(seeded.factIds)).map(f=>[f.concept,f]));
 return {db,tables,ctx,issuer,seeded,facts,goldSha:sha256Hex(bytes)};
}
const byKey=(res:ReconcileResultInput[],concept:string,fy=2024)=>res.find(r=>r.natural_key===`${TICKER}:${fy}:${concept}:1`)!;

describe('cn.tushare_vs_cninfo_pdf_gold',()=>{
 it('is registered with the gold file and parser version',()=>{
  expect(RECONCILE_PAIRS['cn.tushare_vs_cninfo_pdf_gold']?.inputs).toEqual({repoFile:CN_GOLD_PATH,parserVersion:CN_GOLD_PARSER,goldSchema:GOLD_CN_SCHEMA});
 });
 it('one result per gold row: printed-precision interval, quarantine only for exact printing, review item for rounded printing',async()=>{
  const s=await setup();
  const pair=cnTushareVsGoldPair();
  const [m]=await pair.members(s.ctx);
  expect(m).toMatchObject({issuerId:s.issuer,market:'CN'});expect(m.expectedKeys).toHaveLength(24);
  const res=await pair.evaluate(s.ctx,m);
  expect(res).toHaveLength(24);
  const rev=byKey(res,'revenue_operating');
  expect(rev).toMatchObject({outcome:'compared',passed:true,action:'record',left_value:'1234567.89',right_value:'1234567.89',tolerance:divDecimal('0.005','1234567.89',20)});
  expect(rev.detail).toMatchObject({tolerance_rule:'printed_precision/1',interval:{center:'1234567.89',radius:'0.005'},document_ref_mismatch:true});
  expect(rev.inputs_hash).toBe(computeInputsHash({left_raw_hash:s.facts.get('revenue_operating')!.raw_hash,right_sha256:'c'.repeat(64),gold_or_sample_sha256:s.goldSha,parser_version:CN_GOLD_PARSER}));
  const ni=byKey(res,'net_income_parent');
  expect(ni).toMatchObject({outcome:'compared',passed:false,action:'quarantine_left',left_value:'1234567.9',right_value:'1234567.89',left_fact_id:s.facts.get('net_income_parent')!.fact_id});
  expect(ni.item?.natural_key).toBe(`cn.tushare_vs_cninfo_pdf_gold:${TICKER}:2024:net_income_parent:1:${s.facts.get('net_income_parent')!.fact_id}`);
  expect(byKey(res,'total_assets')).toMatchObject({outcome:'compared',passed:true,action:'record',right_value:'1234600',tolerance:divDecimal('50','1234600',20)});
  const eq=byKey(res,'equity_parent');
  expect(eq).toMatchObject({outcome:'compared',passed:false,action:'review_item',left_value:'1234700',right_value:'1234600'});
  expect(eq.item?.payload).toMatchObject({fact_ids:[s.facts.get('equity_parent')!.fact_id]});
  expect(eq.detail.auto_quarantine).toBe(false);
  expect(byKey(res,'operating_cash_flow')).toMatchObject({outcome:'left_missing',action:'record'});
  expect(byKey(res,'eps_basic')).toMatchObject({outcome:'compared',passed:true});
  expect(byKey(res,'total_assets',2023)).toMatchObject({outcome:'left_unlinked',passed:false});
  expect(res.filter(r=>r.outcome==='left_unlinked')).toHaveLength(18);
 });
 it('binds by the verified tushare_source_ref only: a matching document_ref clears the mismatch flag, a different one never rebinds',async()=>{
  const s=await setup();
  await s.db.updateFilingLink(s.seeded.filingId,{document_ref:`ann-${TICKER}-2024`,document_url:null,link_attempts:1});
  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
  const rev=byKey(await pair.evaluate(s.ctx,m),'revenue_operating');
  expect(rev.detail.document_ref_mismatch).toBeUndefined();
  await s.db.updateFilingLink(s.seeded.filingId,{document_ref:'some-correction-announcement',document_url:null,link_attempts:2});
  const again=byKey(await pair.evaluate(s.ctx,m),'revenue_operating');
  expect(again).toMatchObject({outcome:'compared',passed:true,left_fact_id:s.facts.get('revenue_operating')!.fact_id,detail:expect.objectContaining({document_ref_mismatch:true})});
 });
 it('a missing or invalid gold file refuses the run (degraded path: the file does not exist yet)',async()=>{
  const s=await setup();
  const pair=cnTushareVsGoldPair();
  await expect(pair.members({...s.ctx,readRepoFile:async()=>{throw new Error('ENOENT');}})).rejects.toMatchObject({code:'invalid_gold_file'});
  await expect(pair.members({...s.ctx,readRepoFile:async()=>new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[],rows:[]}))})).rejects.toMatchObject({code:'invalid_gold_file'});
 });
});
