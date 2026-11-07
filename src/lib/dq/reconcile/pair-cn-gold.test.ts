// src/lib/dq/reconcile/pair-cn-gold.test.ts
import {randomUUID} from 'node:crypto';
import type {Row} from '../../db/table-client';
import {describe,expect,it} from 'vitest';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {makeBudget} from '../../facts/sync';
import type {FilingFactRow} from '../../facts/types';
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
  {concept:'eps_basic',value:'49.93',...D,unit:'CNY/share'},
  {concept:'operating_cash_flow',value:'1.00',...D,unit:'USD'},{concept:'operating_cash_flow',value:'1.00',...D,duration:'6M'}]});   // decoys: wrong unit, wrong duration
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

const PAIR='cn.tushare_vs_cninfo_pdf_gold';
const rowsFor=(tickers:string[],over:(t:string,fy:number,c:string)=>Partial<GoldCnRow>=()=>({}))=>tickers.flatMap(t=>[2022,2023,2024,2025].flatMap(fy=>CN_GOLD_CONCEPTS.map(c=>goldRow(t,fy,c,fy===2024&&t===TICKER?{...OVERRIDE[c],...over(t,fy,c)}:over(t,fy,c)))));
const bytesOf=(tickers:string[],over?:(t:string,fy:number,c:string)=>Partial<GoldCnRow>)=>new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers,fiscal_years:[2022,2023,2024,2025],concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R2',rows:rowsFor(tickers,over)}));
const withGold=(ctx:PairContext,bytes:Uint8Array):PairContext=>({...ctx,readRepoFile:async p=>{if(p!==CN_GOLD_PATH)throw new Error(`missing ${p}`);return bytes;}});
async function pin(s:Awaited<ReturnType<typeof setup>>,concept:string,fy=2024){
 const fact=s.facts.get(concept)!;
 await s.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.cn',reason_code:'reconcile_mismatch',status:'open',natural_key:`${PAIR}:${TICKER}:${fy}:${concept}:1:${fact.fact_id}`,payload:{fact_ids:[fact.fact_id]},detail:{pair:PAIR}});
 return fact;
}

describe('review findings',()=>{
 it('T14: a pinned open item from another filing never substitutes when the gold row now names a different tushare_source_ref',async()=>{
  const s=await setup();
  const pinned=await pin(s,'revenue_operating');
  const REF2='600519.SH:20241231:1:20250410';
  await seedPublished(s.db,{issuer:s.issuer,market:'CN',sourceRef:REF2,availableDate:'2025-04-10',facts:[{concept:'revenue_operating',value:'1234567.89',...D}]});
  const ctx=withGold(s.ctx,bytesOf([TICKER],(t,fy,c)=>fy===2024&&c==='revenue_operating'?{tushare_source_ref:REF2}:{}));
  const pair=cnTushareVsGoldPair();const [m]=await pair.members(ctx);
  const rev=byKey(await pair.evaluate(ctx,m),'revenue_operating');
  expect(rev).toMatchObject({passed:false,outcome:'incomplete_gold',action:'record',detail:expect.objectContaining({binding_changed:true})});
  expect(rev.left_fact_id).toBeUndefined();
  expect(pinned.fact_id).toBeTruthy();
 });
 it('a pinned open item of the verified filing keeps its fact and routes back to the item',async()=>{
  const s=await setup();
  const pinned=await pin(s,'revenue_operating');
  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
  expect(byKey(await pair.evaluate(s.ctx,m),'revenue_operating')).toMatchObject({outcome:'compared',passed:true,action:'quarantine_left',left_fact_id:pinned.fact_id});
 });
 it('merged issuer: the member is the recorded owner of the filing, and its facts are compared',async()=>{
  const s=await setup();
  const target=randomUUID();
  await s.tables.insert('issuers',{issuer_id:target,status:'active',merged_into:null,cik:null,lei:null,usci:null,canonical_name_en:null,canonical_name_zh:'target'});
  await s.tables.update('issuers',{issuer_id:s.issuer},{status:'merged',merged_into:target});
  s.db.setTopology({[s.issuer]:{status:'merged',merged_into:target}});
  const pair=cnTushareVsGoldPair();const members=await pair.members(s.ctx);
  expect(members).toHaveLength(1);expect(members[0]).toMatchObject({issuerId:s.issuer,market:'CN'});
  expect(byKey(await pair.evaluate(s.ctx,members[0]),'revenue_operating')).toMatchObject({outcome:'compared',passed:true});
 });
 it('two tickers of one issuer make one member with all keys',async()=>{
  const s=await setup();
  await s.tables.insert('issuer_securities',{issuer_id:s.issuer,ticker:'000001.SZ',valid_from:'2001-08-27',valid_to:null,is_primary:false,share_class:'A',isin:null,figi:null});
  const ctx=withGold(s.ctx,bytesOf([TICKER,'000001.SZ']));
  const members=await cnTushareVsGoldPair().members(ctx);
  expect(members).toHaveLength(1);expect(members[0].expectedKeys).toHaveLength(48);
  expect(new Set(members[0].expectedKeys.map(k=>k.naturalKey)).size).toBe(48);
 });
 it('a filing of another issuer than the member is not compared (binding changed)',async()=>{
  const s=await setup();
  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
  const other=randomUUID();
  const res=await pair.evaluate(s.ctx,{...m,issuerId:other});
  expect(byKey(res,'revenue_operating')).toMatchObject({outcome:'incomplete_gold',passed:false,detail:expect.objectContaining({binding_changed:true})});
 });
 it('binds by source_ref even when another tushare filing carries the matching document_ref and other values',async()=>{
  const s=await setup();
  const REF3='600519.SH:20241231:1:20250501';
  const other=await seedPublished(s.db,{issuer:s.issuer,market:'CN',sourceRef:REF3,availableDate:'2025-05-01',facts:[{concept:'revenue_operating',value:'9999',...D}]});
  await s.db.updateFilingLink(other.filingId,{document_ref:`ann-${TICKER}-2024`,document_url:null,link_attempts:1});
  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
  const rev=byKey(await pair.evaluate(s.ctx,m),'revenue_operating');
  expect(rev).toMatchObject({passed:true,left_value:'1234567.89',left_fact_id:s.facts.get('revenue_operating')!.fact_id});
 });
 it('left_ambiguous when two active facts match the key',async()=>{
  const s=await setup();
  const db={...s.db,readFilingFacts:async(id:string,inc:boolean)=>{const r=await s.db.readFilingFacts(id,inc);return [...r,...r.filter(x=>x.concept==='revenue_operating').map(x=>({...x,fact_id:randomUUID()}) as FilingFactRow)];}} as typeof s.db;
  const ctx={...s.ctx,db};
  const pair=cnTushareVsGoldPair();const [m]=await pair.members(ctx);
  expect(byKey(await pair.evaluate(ctx,m),'revenue_operating')).toMatchObject({outcome:'left_ambiguous',passed:false,action:'record'});
 });
 it('a changed gold file mid-cycle is incomplete_gold (one gold sha per cycle)',async()=>{
  const s=await setup();
  const pair=cnTushareVsGoldPair();const [m]=await pair.members(s.ctx);
  const res=await pair.evaluate(withGold(s.ctx,new TextEncoder().encode(JSON.stringify({schema:GOLD_CN_SCHEMA,tickers:[TICKER],fiscal_years:[2022,2023,2024,2025],concepts:[...CN_GOLD_CONCEPTS],recorded_by:'R1',reviewed_by:'R3',rows:rowsFor([TICKER])}))),m);
  expect(res).toHaveLength(24);
  expect(res.every(r=>r.outcome==='incomplete_gold'&&r.passed===false&&r.detail.reason==='gold_changed')).toBe(true);
 });
 it('currentRight: the pdf sha of the current manifest row; null when the key or the file is gone',async()=>{
  const s=await setup();const pair=cnTushareVsGoldPair();
  expect(await pair.currentRight(s.ctx,{natural_key:`${TICKER}:2024:revenue_operating:1`} as Row)).toBe('c'.repeat(64));
  expect(await pair.currentRight(s.ctx,{natural_key:`${TICKER}:2019:revenue_operating:1`} as Row)).toBeNull();
  expect(await pair.currentRight({...s.ctx,readRepoFile:async()=>{throw new Error('ENOENT');}},{natural_key:`${TICKER}:2024:revenue_operating:1`} as Row)).toBeNull();
 });
});
