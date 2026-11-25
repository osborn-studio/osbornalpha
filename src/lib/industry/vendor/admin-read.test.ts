import {expect,it,vi} from 'vitest';
import {memoryTableClient} from '../../db/memory-table-client';
import {memoryVendorIndustryDb} from './db';
import {readVendorAdmin} from './admin-read';
const read=(q:string)=>readVendorAdmin(new URL('https://example.test/?'+q),{db:memoryVendorIndustryDb(),tables:memoryTableClient()});
it.each(['classifications','memberships&code=801080.SI','observations&code=801080.SI'])('empty active %s',async v=>{
 expect(await read('view='+v)).toEqual({run:null,rows:[]});
});
it.each([['view=bad','view'],['limit=4','limit'],['view=memberships','code'],['view=retrievals&limit=201','limit'],
 ['view=observations&code=801080.SI&metric=stage','metric'],['view=observations&code=801080.SI&from=2024-02-30','from'],
 ['view=runs&view=runs','view']])('rejects %s',async(q,param)=>await expect(read(q)).rejects.toThrow('invalid_parameter:'+param));

it('joins each active snapshot to evidence and scopes the run list licenses and observation interval',async()=>{
 const {fixtureDirSource}=await import('./fixtures-dir');
 const {runGildataFinancials,runGildataMemberships}=await import('./ingest');
 const {memoryVendorRawStore}=await import('../../vendor/raw-store');
 const {SW2021_L1_GILDATA}=await import('./sw2021-gildata-codes');
 const deps={db:memoryVendorIndustryDb(),tables:memoryTableClient(),raw:memoryVendorRawStore(),
  source:fixtureDirSource('src/lib/vendor/gildata/fixtures'),codeVersion:'test',now:()=>new Date('2026-11-24Z'),
  universe:SW2021_L1_GILDATA.filter(r=>r.indexCode==='801080.SI')};
 const opts={mode:'apply',triggeredBy:'script',fromYear:2024,toYear:2025} as const;
 for(const key of ['scheme:sw2021:2021','vendor:gildata:industry-financials','unrelated'])
  await deps.tables.insert('industry_dataset_licenses',{dataset_key:key,status:'internal'});
 for(const ingest of [runGildataFinancials,runGildataMemberships])expect((await ingest(deps,opts)).status).toBe('success');
 const get=(query:string)=>readVendorAdmin(new URL('https://example.test/?'+query),deps);
 expect(await get('')).toMatchObject({run:null,licenses:[{dataset_key:'scheme:sw2021:2021'},{dataset_key:'vendor:gildata:industry-financials'}]});
 expect((await get('')).rows).toHaveLength(2);
 for(const [view,count] of [['classifications',1],['memberships&code=801080.SI',6],
  ['observations&code=801080.SI&metric=revenue_cum&from=2024-12-31&to=2024-12-31',1]] as const){
  const result=await get('view='+view);
  expect(result.run).toMatchObject({generation:1,origin:'vendor_reported',history_class:'reconstruction',parser_version:expect.any(String),mapping_version:expect.any(String)});
  expect(result.rows).toHaveLength(count);
  for(const row of result.rows!)expect(row).toMatchObject({source:{vendor:'gildata',product:'datamap-mcp',sha256:expect.stringMatching(/^[0-9a-f]{64}$/),
   retrieval_id:expect.any(String),canonical_sha256:expect.any(String),api_names:expect.any(Array),template:{id:expect.any(String),version:1},
   locator:view==='classifications'?null:expect.any(Object),fetched_at:expect.any(String)}});
 }
 const identity='metric=revenue_cum&period_end=2024-12-31';
 const grid=await get('view=grid&'+identity);
 expect(grid.rows).toMatchObject([{code:'801080.SI',source:{interface:expect.any(String),locator:{row:expect.any(Number)}}}]);
 const gridRow=grid.rows?.[0];
 if(!gridRow||!('value_text' in gridRow))throw Error('expected grid observation');
 const replay='view=replay&code=801080.SI&duration=YTD&'+identity;
 expect(await get(replay)).toMatchObject({match:true,replayed_text:gridRow.value_text,source:gridRow.source});
 await expect(get(replay.replace('2024','2023'))).rejects.toThrow('not_found');
 const [original]=await deps.db.observationsOfRun((await deps.db.activeRun('financials'))!.run_id,{code:'801080.SI',metric:'revenue_cum',from:'2024-12-31',to:'2024-12-31'});
 const observations=vi.spyOn(deps.db,'observationsOfRun');
 observations.mockResolvedValueOnce([{...original,value_text:'-99'}]);
 expect(await get(replay)).toMatchObject({match:false,observation:{value_text:'-99'}});
 const download=vi.spyOn(deps.raw,'get');
 observations.mockResolvedValueOnce([{...original,status:'missing',value_text:null,missing_reason:'vendor_not_provided'}]);
 expect(await get(replay)).toMatchObject({match:null,replayed_text:null,observation:{value_text:null}});
 expect(download).not.toHaveBeenCalled();
 const log=await get('view=retrievals&limit=1');
 expect(log.rows).toHaveLength(1);expect(log.rows?.[0]).toHaveProperty('request_canonical');expect(log.rows?.[0]).not.toHaveProperty('bytes');
});

it.each([['grid&metric=gross_margin','period_end'],['grid&period_end=2024-12-31','metric'],
 ['grid&metric=gross_margin&period_end=2024-12-31&period_end=2025-12-31','period_end'],
 ['grid&metric=revenue_yoy&period_end=2025-12-31','metric'],['grid&code=x','code'],
 ['replay&code=801080.SI&metric=revenue_cum&period_end=2024-12-31','duration'],
 ['replay&code=801080.SI&metric=revenue_cum&duration=X&period_end=2024-12-31','duration']])('rejects %s',async(q,key)=>{
 await expect(read('view='+q)).rejects.toThrow('invalid_parameter:'+key);
});
