// src/lib/industry/classifications.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {planClassificationNodes,runClassificationsSw} from './classifications';
import type {ClassifyInputRow} from './classifications';
import {memoryIndustryDb} from './memory-industry-db';
import {fixtureTushareCall} from './providers/tushare-industry';
import type {IndustryDeps,ManifestStore} from './types';

const NOW='2026-11-09T02:00:00.000Z';
const loc={api:'index_classify',params:{},page:1,offset:0,row:0};
const row=(over:Partial<ClassifyInputRow>):ClassifyInputRow=>({index_code:'801120.SI',industry_name:'食品饮料',parent_code:'0',level:'L1',industry_code:'340000',is_pub:'1',src:'SW2021',raw_hash:'h',locator:loc,...over});
const unusedManifests:ManifestStore={put:async()=>{throw new Error('unused');},get:async()=>{throw new Error('unused');},remove:async()=>{throw new Error('unused');}};
const tablesFor=()=>memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id']});

describe('planClassificationNodes',()=>{
 it('maps parent_code given in the industry_code namespace to the parent index_code, parents first',()=>{
  const plan=planClassificationNodes([
   row({index_code:'851251.SI',industry_name:'白酒Ⅲ',parent_code:'340500',level:'L3',industry_code:'340501'}),
   row({index_code:'801125.SI',industry_name:'白酒Ⅱ',parent_code:'340000',level:'L2',industry_code:'340500'}),
   row({}),
  ]);
  expect(plan.unmapped).toEqual([]);expect(plan.rejected).toEqual([]);
  expect(plan.nodes.map(n=>[n.code,n.level,n.parent_code,n.attributes.parent_via])).toEqual([['801120.SI',1,null,'root'],['801125.SI',2,'801120.SI','industry_code'],['851251.SI',3,'801125.SI','industry_code']]);
  expect(plan.nodes[1]).toEqual({scheme:'sw2021',version:'2021',code:'801125.SI',level:2,name_zh:'白酒Ⅱ',name_en:null,parent_code:'801120.SI',
   attributes:{industry_code:'340500',parent_industry_code:'340000',parent_via:'industry_code',is_pub:'1',src:'SW2021'}});
 });
 it('accepts a parent_code already in the index_code namespace',()=>{
  const plan=planClassificationNodes([row({}),row({index_code:'801125.SI',industry_name:'白酒Ⅱ',parent_code:'801120.SI',level:'L2',industry_code:'340500'})]);
  expect(plan.nodes[1]).toMatchObject({parent_code:'801120.SI',attributes:{parent_via:'index_code'}});
 });
 it('quarantines unknown parents, level mismatches, non-root L1 parents and every descendant of an unmapped node',()=>{
  const plan=planClassificationNodes([
   row({}),
   row({index_code:'801099.SI',industry_name:'X',parent_code:'999999',level:'L2',industry_code:'990100'}),        // parent_not_found
   row({index_code:'851999.SI',industry_name:'Y',parent_code:'990100',level:'L3',industry_code:'990101'}),        // parent_unmapped
   row({index_code:'851998.SI',industry_name:'Z',parent_code:'340000',level:'L3',industry_code:'340999'}),        // parent is L1: mismatch
   row({index_code:'801998.SI',industry_name:'W',parent_code:'340000',level:'L1',industry_code:'980000'}),        // L1 with a parent
  ]);
  expect(plan.nodes.map(n=>n.code)).toEqual(['801120.SI']);
  expect(plan.unmapped.map(u=>[u.code,u.reason])).toEqual([['801998.SI','root_with_parent'],['801099.SI','parent_not_found'],['851999.SI','parent_unmapped'],['851998.SI','parent_level_mismatch']]);
 });
 it('rejects rows of another src, bad level, no name, or a repeated index_code',()=>{
  const plan=planClassificationNodes([row({}),row({src:'SW2014',index_code:'801010.SI'}),row({level:'X',index_code:'801011.SI'}),row({industry_name:null,index_code:'801012.SI'}),row({})]);
  expect(plan.rejected).toEqual(['rejected_src:801010.SI','rejected_row_shape:801011.SI','rejected_name:801012.SI','rejected_repeated:801120.SI']);
 });
});

describe('runClassificationsSw (real index_classify recordings)',()=>{
 it('loads the full tree 31 / 134 / 346 once (every parent_code via industry_code); a rerun is unchanged; a renamed node is quarantined, never overwritten',async()=>{
  const tables=tablesFor();const db=memoryIndustryDb();
  const deps:IndustryDeps={tables,db,facts:memoryFactsDb(),manifests:unusedManifests,now:()=>new Date(NOW),codeVersion:'sha',tushare:fixtureTushareCall()};
  const first=await runClassificationsSw(deps,{sleep:async()=>{}});
  expect(first.status).toBe('success');
  expect(first.counts).toEqual({fetched:511,inserted:511,duplicates:0,versioned:0,quarantined:0,failed:0});
  const tree=await db.classificationTree('sw2021','2021');
  expect([1,2,3].map(l=>tree.filter(n=>n.level===l).length)).toEqual([31,134,346]);
  expect(tree.find(n=>n.code==='850822.SI')).toMatchObject({level:3,parent_code:'801083.SI',name_zh:'印制电路板',attributes:{industry_code:'270202',parent_industry_code:'270200',parent_via:'industry_code'}});
  expect(tree.filter(n=>n.level>1).every(n=>n.attributes.parent_via==='industry_code')).toBe(true);
  expect(tree.some(n=>n.code==='850401.SI')).toBe(true);
  const second=await runClassificationsSw(deps,{sleep:async()=>{}});
  expect(second.counts).toMatchObject({inserted:0,duplicates:511});
  const renamed:IndustryDeps={...deps,tushare:async(api,params,fields)=>{
   // synthetic edit of a real response: upstream renames 801080.SI 电子
   const r=await fixtureTushareCall()(api,params,fields);
   return {...r,items:r.items.map(it=>it[0]==='801080.SI'?it.map((v,i)=>i===1?'电子Ⅰ':v):it)};
  }};
  const third=await runClassificationsSw(renamed,{sleep:async()=>{}});
  expect(third.status).toBe('partial');
  expect(third.counts).toMatchObject({duplicates:510,quarantined:1});
  expect(tables.rows('dq_quarantine').map(q=>[q.dataset,q.table_name,q.natural_key,q.reason_code])).toEqual([['industry.sw2021.classifications','industry_classifications','sw2021:2021:801080.SI','classification_name_conflict']]);
  expect((await db.classificationTree('sw2021','2021')).find(n=>n.code==='801080.SI')!.name_zh).toBe('电子');
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'industry.sw2021.classifications',expected_cadence:'weekly'});
 });
 it('a fetch failure finishes the batch failed with the provider code and records a failed attempt',async()=>{
  const tables=tablesFor();
  const deps:IndustryDeps={tables,db:memoryIndustryDb(),facts:memoryFactsDb(),manifests:unusedManifests,now:()=>new Date(NOW),codeVersion:'sha',
   tushare:async()=>{const {IndustryProviderError}=await import('./providers/tushare-industry');throw new IndustryProviderError('quota_exhausted','api_code_40203');}};
  const r=await runClassificationsSw(deps,{sleep:async()=>{}});
  expect(r).toMatchObject({status:'failed',exitCode:1,errors:[{code:'quota_exhausted',message:'api_code_40203'}]});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1});
 });
});
