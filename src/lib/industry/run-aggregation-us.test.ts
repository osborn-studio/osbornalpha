import {describe,it,expect,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsBatchReader} from '../facts/read-batch';
import {encodeManifest} from './manifest';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {FactsDbError} from '../facts/types';
import type {FactRow,ScopeRow} from '../facts/types';
import {memoryIndustryDb} from './memory-industry-db';
import {memoryManifestStore} from './manifest';
import {AGG_CONCEPTS_US,expectedGridUs} from './method-us';
import {replayFromManifest} from './replay';
import {runIndustryAggregationUs} from './run-aggregation-us';
import type {IndustryDeps} from './types-us';
async function fixture(ready=3,size=6){
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id'],issuers:['issuer_id']});
 const db=memoryIndustryDb({tables}),manifests=memoryManifestStore(db),base=memoryFactsDb(tables);
 await db.upsertClassifications('b',['2000','3000'].map(code=>({scheme:'sic',version:'sec-current',code,level:1,name_zh:null,name_en:code,parent_code:null,attributes:{}})));
 const ids=Array.from({length:size},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`).sort();
 for(const id of ids){await tables.insert('issuers',{issuer_id:id});await db.applyMemberships('b',id,'sic','sec-current',[{code:'2000',level:1,valid_from:'2026-04-01',valid_to:null,available_date:'2026-04-01',valid_to_available_date:null,source:'edgar:submissions',provenance:{availability:'effective_date_assumed'}}],[],{});}
 const scopes:ScopeRow[]=ids.map((issuer_id,i)=>({issuer_id,market:'US',reasons:[],priority:1,fetch_key:'1',next_due_at:'2026-04-01T00:00:00Z',lease_until:null,lease_batch_id:null,state_rev:7,last_attempt_at:null,last_success_at:i<ready?'2026-04-01T00:00:00Z':null,last_batch_id:null,last_status:null}));
 const rows=(issuer_id:string):FactRow[]=>[2022,2023,2024,2025].flatMap(y=>['revenue','net_income_parent','gross_profit'].map(concept=>({fact_id:`${issuer_id}:${y}:${concept}`,issuer_id,market:'US' as const,filing_id:'f',run_id:'r',concept,source_concept:concept,statement:'IS' as const,period_start:`${y}-01-01`,period_end:`${y}-12-31`,duration:'12M' as const,value:concept==='revenue'?'10':'2',value_text:'2',unit:'USD',consolidation:'consolidated' as const,available_date:'2026-03-01',mapping_gen:1,mapping_version:'m',status:'ok' as const,raw_hash:'h',created_at:'2026-03-01T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false})));
 const facts={...base,scopeAll:vi.fn(async()=>scopes),readFacts:vi.fn(async(id:string)=>({stateRev:7,truncated:false,rows:rows(id)})),filingsOfIssuer:vi.fn(async()=>[])};
 const deps:IndustryDeps={tables,db,manifests,facts,now:()=>new Date('2026-04-01T00:00:00Z'),codeVersion:'test'};
 return {deps,db,manifests,tables,ids,facts};
}
describe('US run',()=>{
 it.each([false,true])('stops envelope scheduling over budget and fails through cleanup (dryRun=%j)',async dryRun=>{
  const {deps,db,facts,manifests,tables,ids}=await fixture(18,18),read=facts.readFacts.getMockImplementation()!;
  let elapsed=0;const start=deps.now().getTime();deps.now=()=>new Date(start+elapsed);
  facts.readFacts.mockImplementation(async id=>{const env=await read(id);elapsed=101;return env;});
  const fail=vi.spyOn(db,'failRun'),stage=vi.spyOn(db,'stageMetricRows'),put=vi.spyOn(manifests,'put');
  const insert=vi.spyOn(tables,'insert'),upsert=vi.spyOn(tables,'upsert');
  const r=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01',dryRun,deadlineMs:100,concurrency:2});
  expect(r).toMatchObject({status:'failed',code:'time_budget_exceeded',batchStatus:dryRun?null:'failed'});
  expect(facts.readFacts.mock.calls.length).toBeGreaterThan(0);expect(facts.readFacts.mock.calls.length).toBeLessThan(ids.length);
  expect(stage).not.toHaveBeenCalled();expect(put).not.toHaveBeenCalled();expect(facts.filingsOfIssuer).not.toHaveBeenCalled();
  if(dryRun){expect(fail).not.toHaveBeenCalled();expect(insert).not.toHaveBeenCalled();expect(upsert).not.toHaveBeenCalled();}
  else{
   expect(fail).toHaveBeenCalledWith('aggregate',r.runId,'time_budget_exceeded');
   expect(await db.metricRun(r.runId!)).toMatchObject({status:'failed'});
   expect(await tables.select('ingest_batches',{})).toMatchObject([{status:'failed'}]);
   expect(await tables.select('dq_freshness',{dataset:'industry.agg.sic'})).toMatchObject([{last_ok_at:null,last_attempt_at:deps.now().toISOString(),consecutive_errors:1,detail:{status:'failed',code:'time_budget_exceeded'}}]);
  }
 });
 it.each(['envelopes','filings','manifests'] as const)('checks the budget after %s before uploading or staging',async phase=>{
  const {deps,db,facts,manifests}=await fixture(),read=facts.readFacts.getMockImplementation()!;
  let elapsed=0;const start=deps.now().getTime();deps.now=()=>new Date(start+elapsed);
  if(phase==='envelopes')facts.readFacts.mockImplementation(async id=>{const env=await read(id);elapsed=101;return env;});
  if(phase==='filings')facts.filingsOfIssuer.mockImplementation(async()=>{elapsed=101;return [];});
  const put=vi.spyOn(manifests,'put'),stage=vi.spyOn(db,'stageMetricRows');
  const r=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01',deadlineMs:100},{replay:m=>{if(phase==='manifests')elapsed=101;return replayFromManifest(m);}});
  expect(r).toMatchObject({status:'failed',code:'time_budget_exceeded',batchStatus:'failed'});
  expect(put).not.toHaveBeenCalled();expect(stage).not.toHaveBeenCalled();
 });
 it('publishes the entire grid with snapshot dependencies, weekly freshness, one US envelope per issuer',async()=>{
  const {deps,db,manifests,tables,ids,facts}=await fixture();const r=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01'});
  expect(r).toMatchObject({status:'active',groups:6,cells:{ok:21,missing:21},timings:{members:0,envelopes:0,filings:0,compute:0,manifests:0,stage:0,activate:0,total:0}});
  const run=await db.metricRun(r.runId!);expect(run).toMatchObject({expected_grid:expectedGridUs(['2000','3000'],'2026-04-01'),history_class:'reconstruction',knowledge_date:'2026-04-01',coverage_summary:{universe:6,ready:3,min_percent:50}});
  const rows=await db.metricRowsOfRun(r.runId!);expect(rows).toHaveLength(42);expect(rows.every(c=>c.status==='ok'||c.missing_reason==='no_members')).toBe(true);
  const dependencies=await db.runDependencies('aggregate',r.runId!);expect(dependencies).toHaveLength(18);
  for(const pe of run!.expected_grid.period_ends)expect(dependencies.filter(d=>d.cell_key===`2000:${pe}`).map(d=>d.issuer_id).sort()).toEqual(ids);
  expect(dependencies.every(d=>d.state_rev===7)).toBe(true);
  expect(facts.readFacts).toHaveBeenCalledTimes(6);for(const id of ids)expect(facts.readFacts).toHaveBeenCalledWith(id,'US',{concepts:[...AGG_CONCEPTS_US],asOf:'2026-04-01',history:true});
  expect(facts.scopeAll).toHaveBeenCalledWith('US');
  expect(rows.find(c=>c.code==='2000'&&c.period_end==='2025-12-31'&&c.metric==='revenue_sum')!.manifest_hash).toBe('32ada5ff45bb56b493c06cf69b3c183600770962f28c521ca08ef7f350995f3e');
  for(const row of rows.filter(c=>c.status==='ok'))expect(replayFromManifest(await manifests.get(row.manifest_hash!)).reproduced).toBe(true);
  expect(await tables.select('dq_freshness',{dataset:'industry.agg.sic'})).toMatchObject([{expected_cadence:'weekly',consecutive_errors:0}]);
 });
 it('fully computes a dry run with zero writes and useful display samples',async()=>{
  const {deps,db,manifests,tables,facts}=await fixture();
  const create=vi.spyOn(db,'createMetricRun'),start=vi.spyOn(tables,'insert'),put=vi.spyOn(manifests,'put');
  const r=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01',dryRun:true});
  expect(r).toMatchObject({status:'dry_run',batchId:null,runId:null,groups:6,cells:{ok:21,missing:21},preview:{industriesMinMembers:1,displayableValueCells:18,sample:[{code:'2000',n_members:6,revenue_sum:{value:'60',n_with_data:6},net_margin:{value:'0.2',n_with_data:6}},{code:'3000',n_members:0,revenue_sum:{value:null,n_with_data:0},net_margin:{value:null,n_with_data:0}}]}});
  expect(facts.readFacts).toHaveBeenCalledTimes(6);expect(create).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();expect(put).not.toHaveBeenCalled();expect(manifests.objects.size).toBe(0);
  for(const table of ['ingest_batches','dq_freshness','dq_quarantine'])expect(await tables.select(table,{})).toEqual([]);
 });
 it('fetches filings only for used facts and reports latest revenue exclusion reasons and dry timings',async()=>{
  const {deps,facts,ids}=await fixture();const read=facts.readFacts.getMockImplementation()!;
  facts.readFacts.mockImplementation(async id=>{
   const env=await read(id),i=ids.indexOf(id);
   if(i===0)return {...env,rows:[]};
   if(i===1)return {...env,rows:env.rows.map(r=>({...r,unit:'EUR'}))};
   if(i===2)return {...env,rows:env.rows.flatMap(r=>[r,{...r,fact_id:r.fact_id+':duplicate'}])};
   if(i===3)return {...env,truncated:true};
   if(i===4)return {...env,rows:env.rows.filter(r=>r.period_end<'2025-01-01')};
   return env;
  });
  const r=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01',dryRun:true});
  expect(facts.filingsOfIssuer.mock.calls).toEqual(ids.slice(4).map(id=>[id,'US',{}]));
  expect(r.preview).toMatchObject({roleReasons:{missing_concept:2,unit_excluded:1,ambiguous_period:1,read_truncated:1}});
  expect(r).toHaveProperty('timings');
  const timings=r.timings!;expect(Object.keys(timings).sort()).toEqual(['members','envelopes','filings','compute','manifests','stage','activate','total'].sort());
  for(const ms of Object.values(timings))expect(ms).toBeGreaterThanOrEqual(0);
  expect(timings.stage).toBe(0);expect(timings.activate).toBe(0);
 });
 it('defaults to sixteen concurrent reads',async()=>{
  const {deps,facts}=await fixture(18,18),read=facts.readFacts.getMockImplementation()!;let reading=0,maxReads=0;
  facts.readFacts.mockImplementation(async id=>{reading++;maxReads=Math.max(maxReads,reading);try{await Promise.resolve();return await read(id);}finally{reading--;}});
  expect(await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01',dryRun:true})).toMatchObject({status:'dry_run'});
  expect(maxReads).toBe(16);
 });
 it('bounds envelope reads and uploads and stages identical content despite shuffled reads',async()=>{
  const {deps,db,facts,manifests}=await fixture();
  const first=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01'});
  const originalRead=facts.readFacts.getMockImplementation()!,originalPut=manifests.put.bind(manifests);
  let reading=0,uploading=0,maxReads=0,maxUploads=0;
  facts.readFacts.mockImplementation(async id=>{reading++;maxReads=Math.max(maxReads,reading);await new Promise(r=>setTimeout(r,1));try{return await originalRead(id);}finally{reading--;}});
  manifests.put=async(kind,canonical)=>{uploading++;maxUploads=Math.max(maxUploads,uploading);await new Promise(r=>setTimeout(r,1));try{return await originalPut(kind,canonical);}finally{uploading--;}};
  const tree=db.classificationTree.bind(db),members=db.membershipCandidates.bind(db);
  const shuffled={...deps,db:{...db,classificationTree:async(...args:Parameters<typeof tree>)=>(await tree(...args)).reverse(),membershipCandidates:async(...args:Parameters<typeof members>)=>(await members(...args)).reverse()}};
  const second=await runIndustryAggregationUs(shuffled,{factsAsOf:'2026-04-01',concurrency:2});
  expect(second.status).toBe('active');expect(maxReads).toBe(2);expect(maxUploads).toBe(2);
  const content=async(id:string)=>(await db.metricRowsOfRun(id)).map(({run_id:_,updated_at:__,...row})=>row);
  expect(await content(second.runId!)).toEqual(await content(first.runId!));
 });
 it('self-check mismatches become missing and quarantine only on apply',async()=>{
  const {deps,db,tables,manifests}=await fixture();
  const hooks={replay:(m:Parameters<typeof replayFromManifest>[0])=>({...replayFromManifest(m),reproduced:false,mismatches:['revenue_sum:12M:'+m.period_end.slice(0,4)+'-01-01']})};
  const dry=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01',dryRun:true},hooks);
  expect(dry).toMatchObject({status:'dry_run',manifestMismatches:6});expect(await tables.select('dq_quarantine',{})).toEqual([]);expect(manifests.objects.size).toBe(0);
  const applied=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01'},hooks);
  expect(applied).toMatchObject({status:'active',manifestMismatches:6});
  expect((await db.metricRowsOfRun(applied.runId!)).filter(c=>c.metric==='revenue_sum').every(c=>c.missing_reason==='manifest_mismatch')).toBe(true);
  expect(await tables.select('dq_quarantine',{})).toHaveLength(6);
 });
 it('fails below 50% readiness, including an empty universe',async()=>{
  const {deps,db}=await fixture(2);const r=await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01'});
  expect(r).toMatchObject({status:'failed',code:'facts_scope_not_ready'});expect(await db.metricRun(r.runId!)).toMatchObject({status:'failed',coverage_summary:{universe:6,ready:2,min_percent:50}});
  const empty={...deps,db:{...db,membershipCandidates:async()=>[]}};expect(await runIndustryAggregationUs(empty,{factsAsOf:'2026-04-01',dryRun:true})).toMatchObject({status:'failed',code:'facts_scope_not_ready'});
 });
});

describe('US batch envelopes',()=>{
 it('keeps receipts, rows, dependencies and all canonical manifests identical',async()=>{
  const {deps,db,facts,ids}=await fixture();
  const original=facts.readFacts.getMockImplementation()!;
  const full=async(id:string)=>{
   const env=await original(id),seed=env.rows[0];
   const extra:FactRow[]=[...(['3M','6M','9M'] as const).map(duration=>({...seed,fact_id:id+duration,duration})),
    ...[2021,2026].map(y=>({...seed,fact_id:id+y,period_start:`${y}-01-01`,period_end:`${y}-12-31`})),
    {...seed,fact_id:id+'old',is_current:false,disclosure_seq:1},
    {...seed,fact_id:id+'eur',unit:'EUR'}];
   if(id===ids[0])extra.push({...env.rows.at(-3)!,fact_id:id+'ambiguous',period_start:'2025-02-01',period_end:'2025-11-30'});
   if(id===ids[1])env.rows=env.rows.map(r=>({...r,unit:'EUR'}));
   return {...env,rows:[...env.rows,...extra]};
  };
  facts.readFacts.mockImplementation(full);
  const stage=vi.spyOn(db,'stageMetricRows'),dependencies=vi.spyOn(db,'stageRunDependencies');
  const canonical:unknown[][]=[[],[]];
  const run=async(i:number)=>runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01'},{replay:m=>{canonical[i].push(encodeManifest(m));return replayFromManifest(m);}});
  const a=await run(0),rows=stage.mock.calls.map(c=>c[1]),refs=dependencies.mock.calls.map(c=>c.slice(1));stage.mockClear();dependencies.mockClear();
  const reader=memoryFactsBatchReader({readFacts:async(id,_market,o)=>{
   const env=await full(id);
   return {...env,rows:env.rows.filter(r=>(o.history||r.is_current)&&(!o.from||r.period_end>=o.from)&&(!o.to||r.period_end<=o.to))};
  }});
  const readFactsBatch=vi.fn(reader.readFactsBatch);deps.factsBatch={readFactsBatch};facts.readFacts.mockClear();
  const b=await run(1);
  expect(readFactsBatch).toHaveBeenCalledWith(ids,'US',{concepts:[...AGG_CONCEPTS_US],asOf:'2026-04-01',history:false,from:'2022-01-01',to:'2025-12-31',durations:['12M']});
  const content=({timings:_,batchId:__,runId:___,generation:____,activatedAt:_____,...r}:typeof a)=>r;
  expect(a.status).toBe('active');expect(content(b)).toEqual(content(a));
  expect(stage.mock.calls.map(c=>c[1])).toEqual(rows);expect(dependencies.mock.calls.map(c=>c.slice(1))).toEqual(refs);
  expect(canonical[1]).toEqual(canonical[0]);expect(facts.readFacts).not.toHaveBeenCalled();
 });
 it('chunks each issuer once and bounds concurrent chunks',async()=>{
  const {deps,facts,ids}=await fixture(11,11),reader=memoryFactsBatchReader({readFacts:facts.readFacts.getMockImplementation()!});let active=0,max=0;
  const readFactsBatch=vi.fn(async(...args:Parameters<typeof reader.readFactsBatch>)=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));try{return await reader.readFactsBatch(...args);}finally{active--;}});
  deps.factsBatch={readFactsBatch};
  expect(await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01',dryRun:true,envelopeBatch:3,envelopeBatchConcurrency:2})).toMatchObject({status:'dry_run'});
  expect(readFactsBatch).toHaveBeenCalledTimes(4);expect(max).toBe(2);expect(readFactsBatch.mock.calls.flatMap(c=>[...c[0]])).toEqual(ids);expect(facts.readFacts).not.toHaveBeenCalled();
 });
 it.each(['missing','issuer','market'])('fails closed for %s envelope',async mode=>{
  const {deps,db,facts}=await fixture(),reader=memoryFactsBatchReader({readFacts:facts.readFacts.getMockImplementation()!});
  deps.factsBatch={readFactsBatch:async(...args)=>{const out=await reader.readFactsBatch(...args),id=args[0][0];if(mode==='missing')out.delete(id);else out.get(id)!.rows[0]={...out.get(id)!.rows[0],...(mode==='issuer'?{issuer_id:'other'}:{market:'CN' as const})};return out;}};
  const activate=vi.spyOn(db,'activateMetricRun');expect(await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01'})).toMatchObject({status:'failed',code:mode==='missing'?'batch_incomplete':'envelope_scope_mismatch'});expect(activate).not.toHaveBeenCalled();
 });
 it('checks budget between chunks',async()=>{
  const {deps,db,facts}=await fixture(),reader=memoryFactsBatchReader({readFacts:facts.readFacts.getMockImplementation()!});let elapsed=0;const start=deps.now().getTime();deps.now=()=>new Date(start+elapsed);
  const readFactsBatch=vi.fn(async(...args:Parameters<typeof reader.readFactsBatch>)=>{const out=await reader.readFactsBatch(...args);elapsed=101;return out;});deps.factsBatch={readFactsBatch};
  const activate=vi.spyOn(db,'activateMetricRun');expect(await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01',deadlineMs:100,envelopeBatch:2,envelopeBatchConcurrency:1})).toMatchObject({status:'failed',code:'time_budget_exceeded'});expect(readFactsBatch).toHaveBeenCalledTimes(1);expect(activate).not.toHaveBeenCalled();
 });
});

it('reports adapter incomplete responses with the same stable batch code',async()=>{
 const {deps,db}=await fixture();deps.factsBatch={readFactsBatch:async()=>{throw new FactsDbError('unknown','batch_incomplete:missing');}};
 const activate=vi.spyOn(db,'activateMetricRun');expect(await runIndustryAggregationUs(deps,{factsAsOf:'2026-04-01'})).toMatchObject({status:'failed',code:'batch_incomplete'});expect(activate).not.toHaveBeenCalled();
});
