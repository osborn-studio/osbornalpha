// src/lib/dq/reconcile/pairs.test.ts
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {TableClient} from '../../db/table-client';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {makeBudget} from '../../facts/sync';
import type {FilingFactRow,FilingRow} from '../../facts/types';
import {memoryRawStore} from '../raw-store';
import {computeInputsHash} from './inputs-hash';
import {ReconcileConfigError,actionFor,activeRows,openMismatches,sha256Hex} from './pair-support';
import {lineageSameDayPair} from './pair-lineage';
import {US_GOLD_PARSER,US_GOLD_PATH,usCompanyfactsVsGoldPair,usGoldEntries,usGoldKey} from './pair-us-gold';
import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
import {reconcileTables,seedPublished} from './testing';
import {CYCLE_PAIR_IDS} from './types';
import type {MemberPlan,PairContext} from './types';

const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
function setup(){
 const tables=reconcileTables();const db=memoryFactsDb(tables);
 const files=new Map<string,Uint8Array>();
 const ctx:PairContext={db,tables,raw:memoryRawStore(),now:()=>new Date('2026-11-05T00:00:00Z'),budget:makeBudget(null),
  fetch:(async()=>{throw new Error('no network in unit tests');}) as unknown as typeof fetch,
  readRepoFile:async p=>{const b=files.get(p);if(!b)throw new Error(`missing ${p}`);return b;}};
 return {tables,db,ctx,files};
}
async function issuer(tables:TableClient,ticker:string,o:{status?:string;merged_into?:string|null}={}){
 const id=randomUUID();
 await tables.insert('issuers',{issuer_id:id,status:o.status??'active',merged_into:o.merged_into??null,cik:null,lei:null,usci:null,canonical_name_en:ticker,canonical_name_zh:null});
 await tables.insert('issuer_securities',{issuer_id:id,ticker,valid_from:'2000-01-01',valid_to:null,is_primary:true,share_class:'common',isin:null,figi:null});
 return id;
}
const goldFile=(entries:object[])=>({version:1,ready:false,required:{US:true,CN:false},entries});
const entry=(o:{ticker?:string;concept?:string;period_end?:string;value?:string;recorded_by?:string;as_of?:string}={})=>({issuer:{ticker:o.ticker??'ZGOLD',market:'US'},concept:o.concept??'revenue',period_end:o.period_end??'2023-12-31',unit:'USD',value:o.value??'1000',as_of:o.as_of??'2024-03-01',source:{document:'ZGOLD 10-K FY2023',page_or_row:'p. 40',url:'https://example.invalid/zgold'},recorded_by:o.recorded_by??'R1',recorded_at:'2026-11-01T00:00:00Z'});
const FY23={period_start:'2023-01-01',period_end:'2023-12-31'};

describe('registry',()=>{
 it('holds only cycle pairs, keyed by their own id, with lineage and US gold registered by Task 14',()=>{
  for(const [id,p] of Object.entries(RECONCILE_PAIRS)){expect(CYCLE_PAIR_IDS as readonly string[]).toContain(id);expect(p!.id).toBe(id);expect(typeof p!.currentRight).toBe('function');}
  expect(RECONCILE_PAIRS['facts.lineage_same_day']).toBeDefined();
  expect(RECONCILE_PAIRS['us.companyfacts_vs_gold']?.inputs).toEqual({repoFile:US_GOLD_PATH,parserVersion:US_GOLD_PARSER,goldSchema:'plan2-gold/1'});
 });
 it('actionFor: bound → quarantine_left; failed ok row → onFail; everything else record',()=>{
  expect(actionFor({bound:true,leftStatus:'quarantined',compared:true,passed:true,onFail:'quarantine_left'})).toBe('quarantine_left');
  expect(actionFor({bound:true,leftStatus:'quarantined',compared:false,passed:false,onFail:'quarantine_left'})).toBe('quarantine_left');
  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:false,onFail:'quarantine_left'})).toBe('quarantine_left');
  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:false,onFail:'review_item'})).toBe('review_item');
  expect(actionFor({bound:false,leftStatus:'quarantined',compared:true,passed:false,onFail:'quarantine_left'})).toBe('record');
  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:true,onFail:'quarantine_left'})).toBe('record');
  expect(actionFor({bound:false,leftStatus:null,compared:false,passed:false,onFail:'quarantine_left'})).toBe('record');
 });
 it('activeRows keeps the active generation of published runs, ok or quarantined (T1)',()=>{
  const filing={mapping_gen:2} as FilingRow;
  const r=(o:Partial<FilingFactRow>)=>({fact_id:randomUUID(),mapping_gen:2,run_status:'published',status:'ok',...o}) as FilingFactRow;
  const rows=[r({}),r({status:'quarantined'}),r({mapping_gen:1}),r({run_status:'staged'}),r({status:'staged'})];
  expect(activeRows(rows,filing)).toEqual(rows.slice(0,2));
  expect(activeRows(rows,{mapping_gen:0} as FilingRow)).toEqual([]);
 });
});

describe('us.companyfacts_vs_gold (T15)',()=>{
 it('the landed plan2.json has two US entries, both <pending> (ready:false)',()=>{
  const json=JSON.parse(readFileSync(US_GOLD_PATH,'utf8'));
  const g=usGoldEntries(json);
  expect(g.ready).toBe(false);
  expect(g.entries.map(e=>[e.ticker,e.pending])).toEqual([['AAPL',true],['MSFT',true]]);
 });
 it('every <pending> entry yields exactly one incomplete_gold result and is never compared',async()=>{
  const {tables,ctx,files}=setup();await issuer(tables,'ZGOLD');
  files.set(US_GOLD_PATH,enc(goldFile([entry({recorded_by:'<pending>'}),entry({concept:'net_income_parent',value:'<pending>'})])));
  const pair=usCompanyfactsVsGoldPair();
  const [m]=await pair.members(ctx);
  const res=await pair.evaluate(ctx,m);
  expect(res.map(r=>[r.outcome,r.passed,r.left_value,r.right_value,r.action])).toEqual([['incomplete_gold',false,null,null,'record'],['incomplete_gold',false,null,null,'record']]);
 });
 it('compares recorded entries exactly against the current ok row; a mismatch quarantines with a mismatch item; a missing fact is left_missing',async()=>{
  const {tables,db,ctx,files}=setup();const id=await issuer(tables,'ZGOLD');
  const seeded=await seedPublished(db,{issuer:id,market:'US',sourceRef:'0009990100-24-000001',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'1000',...FY23},{concept:'net_income_parent',value:'100',...FY23}]});
  const bytes=enc(goldFile([entry(),entry({concept:'net_income_parent',value:'101'}),entry({concept:'total_assets',value:'5'})]));files.set(US_GOLD_PATH,bytes);
  const pair=usCompanyfactsVsGoldPair();
  const [m]=await pair.members(ctx);
  expect(m.expectedKeys.map(k=>k.naturalKey)).toEqual(['ZGOLD:revenue:2023-12-31:12M:USD','ZGOLD:net_income_parent:2023-12-31:12M:USD','ZGOLD:total_assets:2023-12-31:INSTANT:USD']);
  const [ok,bad,missing]=await pair.evaluate(ctx,m);
  const [revRow,niRow]=await db.factsByIds(seeded.factIds).then(rs=>[rs.find(r=>r.concept==='revenue')!,rs.find(r=>r.concept==='net_income_parent')!]);
  expect(ok).toMatchObject({outcome:'compared',passed:true,left_value:'1000',right_value:'1000',abs_diff:'0',rel_diff:'0',tolerance:'0',action:'record',left_fact_id:revRow.fact_id});
  expect(ok.inputs_hash).toBe(computeInputsHash({left_raw_hash:revRow.raw_hash,right_sha256:sha256Hex(bytes),gold_or_sample_sha256:sha256Hex(bytes),parser_version:US_GOLD_PARSER}));
  expect(bad).toMatchObject({outcome:'compared',passed:false,left_value:'100',right_value:'101',abs_diff:'1',action:'quarantine_left',left_fact_id:niRow.fact_id});
  expect(bad.item?.natural_key).toBe(`us.companyfacts_vs_gold:ZGOLD:net_income_parent:2023-12-31:12M:USD:${niRow.fact_id}`);
  expect(bad.item?.payload).toMatchObject({fact_ids:[niRow.fact_id],left_value:'100',right_value:'101',key:{issuer_id:id,market:'US',concept:'net_income_parent'}});
  expect(bad.item?.detail).toMatchObject({pair:'us.companyfacts_vs_gold',issuer_id:id,market:'US'});
  expect(missing).toMatchObject({outcome:'left_missing',passed:false,action:'record'});
 });
 it('an open reconcile_mismatch item binds the key to its fact and a now-passing result goes back to the item (quarantine_left, passed)',async()=>{
  const {tables,db,ctx,files}=setup();const id=await issuer(tables,'ZGOLD');
  const seeded=await seedPublished(db,{issuer:id,market:'US',sourceRef:'0009990100-24-000002',availableDate:'2024-02-01',facts:[{concept:'net_income_parent',value:'100',...FY23}]});
  const nk='ZGOLD:net_income_parent:2023-12-31:12M:USD';
  await tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`us.companyfacts_vs_gold:${nk}:${seeded.factIds[0]}`,reason_code:'reconcile_mismatch',detail:{pair:'us.companyfacts_vs_gold'},payload:{fact_ids:[seeded.factIds[0]]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'});
  expect([...(await openMismatches(tables,'us.companyfacts_vs_gold','US')).keys()]).toEqual([nk]);
  files.set(US_GOLD_PATH,enc(goldFile([entry({concept:'net_income_parent',value:'100'})])));
  const pair=usCompanyfactsVsGoldPair();const [m]=await pair.members(ctx);
  const [r]=await pair.evaluate(ctx,m);
  expect(r).toMatchObject({outcome:'compared',passed:true,action:'quarantine_left',left_fact_id:seeded.factIds[0]});
  expect(r.item?.natural_key).toBe(`us.companyfacts_vs_gold:${nk}:${seeded.factIds[0]}`);
 });
 it('refuses a gold file with duplicate keys or an unresolvable ticker',async()=>{
  const {tables,ctx,files}=setup();await issuer(tables,'ZGOLD');
  const pair=usCompanyfactsVsGoldPair();
  files.set(US_GOLD_PATH,enc(goldFile([entry(),entry()])));
  await expect(pair.members(ctx)).rejects.toMatchObject({code:'invalid_gold_file'});
  files.set(US_GOLD_PATH,enc(goldFile([entry({ticker:'NOPE'})])));
  await expect(pair.members(ctx)).rejects.toBeInstanceOf(ReconcileConfigError);
  await expect(pair.members(ctx)).rejects.toMatchObject({code:'issuer_unresolved'});
  files.delete(US_GOLD_PATH);
  await expect(pair.members(ctx)).rejects.toMatchObject({code:'invalid_gold_file'});
 });
});

describe('facts.lineage_same_day (§4.4)',()=>{
 async function merged(){
  const s=setup();
  const target=await issuer(s.tables,'ZTGT');const source=await issuer(s.tables,'ZSRC',{status:'merged'});
  await s.tables.update('issuers',{issuer_id:source},{merged_into:target});
  s.db.setTopology({[source]:{status:'merged',merged_into:target}});
  const t=await seedPublished(s.db,{issuer:target,market:'US',sourceRef:'0009990200-24-000001',availableDate:'2024-02-15',facts:[{concept:'revenue',value:'1200',...FY23},{concept:'net_income_parent',value:'50',...FY23}]});
  const src=await seedPublished(s.db,{issuer:source,market:'US',sourceRef:'0009990201-24-000001',availableDate:'2024-02-15',facts:[{concept:'revenue',value:'1000',...FY23},{concept:'net_income_parent',value:'50',...FY23}]});
  return {...s,target,source,t,src};
 }
 it('freezes one member per target and market with a conflict, keyed <T>:<K>:<available_date>',async()=>{
  const {ctx,target}=await merged();
  const members=await lineageSameDayPair().members(ctx);
  expect(members).toEqual([{issuerId:target,market:'US',expectedKeys:[{naturalKey:`${target}:revenue:2023-01-01:2023-12-31:consolidated:USD:2024-02-15`,locator:expect.objectContaining({available_date:'2024-02-15'})}]}]);
  expect(await lineageSameDayPair({targets:[]}).members(ctx)).toEqual([]);
  // plan audit Q2: the per-target resolver gives a pending target the same keys, and zero keys when it has no conflict
  expect(await lineageSameDayPair({targets:[]}).memberFor!(ctx,target,'US')).toEqual(members[0]);
  expect(await lineageSameDayPair().memberFor!(ctx,target,'CN')).toEqual({issuerId:target,market:'CN',expectedKeys:[]});
 });
 it('a live conflict is compared, failed, and becomes a lineage_item with every value',async()=>{
  const {ctx,target,source,t,src}=await merged();
  const pair=lineageSameDayPair();const [m]=await pair.members(ctx);
  const [r]=await pair.evaluate(ctx,m);
  expect(r).toMatchObject({kind:'numeric',outcome:'compared',passed:false,tolerance:'0',action:'lineage_item'});
  expect(new Set([r.left_value,r.right_value])).toEqual(new Set(['1000','1200']));
  expect(r.item?.natural_key).toBe(m.expectedKeys[0].naturalKey);
  expect(new Set(r.item?.payload.fact_ids as string[])).toEqual(new Set([t.factIds[0],src.factIds[0]]));
  expect((r.item?.payload.values as {issuer_id:string}[]).map(v=>v.issuer_id).sort()).toEqual([source,target].sort());
  expect(r.item?.detail).toEqual({target,market:'US'});
 });
 it('a frozen key whose conflict is gone compares the remaining ok values (conflict_cleared) or is left_missing',async()=>{
  const {ctx,target,t,src}=await merged();
  const pair=lineageSameDayPair();
  const plan:MemberPlan={issuerId:target,market:'US',expectedKeys:[
   {naturalKey:`${target}:net_income_parent:2023-01-01:2023-12-31:consolidated:USD:2024-02-15`,locator:{fact_ids:[t.factIds[1],src.factIds[1]]}},
   {naturalKey:`${target}:net_income_parent:2022-01-01:2022-12-31:consolidated:USD:2023-02-15`,locator:{fact_ids:[]}},
  ]};
  const [cleared,gone]=await pair.evaluate(ctx,plan);
  expect(cleared).toMatchObject({outcome:'compared',passed:true,left_value:'50',right_value:'50',action:'record',detail:expect.objectContaining({reason:'conflict_cleared'})});
  expect(gone).toMatchObject({outcome:'left_missing',passed:false,action:'record'});
 });
});

describe('inputsHashNow (restore-side recomputation, spec §5.6)',()=>{
 it('recomputes from the current fact raw_hash, the pair\'s CURRENT right evidence for the key (never the recorded right sha256), the CURRENT gold file and parser version (plan audit P2)',async()=>{
  const {tables,db,ctx,files}=setup();const id=await issuer(tables,'ZGOLD');
  const seeded=await seedPublished(db,{issuer:id,market:'US',sourceRef:'0009990100-24-000003',availableDate:'2024-02-01',facts:[{concept:'revenue',value:'1000',...FY23}]});
  const [fact]=await db.factsByIds(seeded.factIds);
  const nk=usGoldKey(usGoldEntries(goldFile([entry()])).entries[0]);
  const rec=randomUUID();
  await tables.insert('dq_reconciliations',{id:rec,dataset:'reconcile.us.companyfacts_vs_gold',pair:'us.companyfacts_vs_gold',natural_key:nk,detail:{right:{sha256:'recorded-by-the-last-run'}}});
  const item={id:randomUUID(),reason_code:'reconcile_mismatch',status:'open',payload:{fact_ids:[fact.fact_id]},detail:{pair:'us.companyfacts_vs_gold',latest_result:{passed:true,reconciliation_id:rec}}};
  const at=(gold:Uint8Array)=>computeInputsHash({left_raw_hash:fact.raw_hash,right_sha256:sha256Hex(gold),gold_or_sample_sha256:sha256Hex(gold),parser_version:US_GOLD_PARSER});
  const v1=enc(goldFile([entry()]));files.set(US_GOLD_PATH,v1);
  expect(await inputsHashNow(ctx,item)).toBe(at(v1));
  const v2=enc(goldFile([entry({value:'1001'})]));files.set(US_GOLD_PATH,v2);
  expect(await inputsHashNow(ctx,item)).toBe(at(v2));                                     // changed evidence → a different hash
  files.set(US_GOLD_PATH,enc(goldFile([entry({recorded_by:'<pending>'})])));
  await expect(inputsHashNow(ctx,item)).rejects.toThrow('current_evidence_unavailable');  // the entry is pending again
  files.set(US_GOLD_PATH,enc(goldFile([entry({concept:'net_income_parent'})])));
  await expect(inputsHashNow(ctx,item)).rejects.toThrow('current_evidence_unavailable');  // the key left the manifest
  files.set(US_GOLD_PATH,v1);
  await expect(inputsHashNow(ctx,{...item,detail:{pair:'us.companyfacts_vs_gold'}})).rejects.toThrow('no_latest_result');
  await expect(inputsHashNow(ctx,{...item,detail:{pair:'sec.filer_category',latest_result:{reconciliation_id:rec}}})).rejects.toThrow('pair_not_registered');
  await expect(inputsHashNow(ctx,{...item,payload:{fact_ids:[randomUUID()]}})).rejects.toThrow('left_fact_missing');
 });
});
