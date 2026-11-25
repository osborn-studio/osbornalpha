import {expect,it} from 'vitest';
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
  for(const row of result.rows)expect(row).toMatchObject({source:{vendor:'gildata',product:'datamap-mcp',sha256:expect.stringMatching(/^[0-9a-f]{64}$/),
   retrieval_id:expect.any(String),canonical_sha256:expect.any(String),api_names:expect.any(Array),template:{id:expect.any(String),version:1},
   locator:view==='classifications'?null:expect.any(Object),fetched_at:expect.any(String)}});
 }
 const log=await get('view=retrievals&limit=1');
 expect(log.rows).toHaveLength(1);expect(log.rows[0]).toHaveProperty('request_canonical');expect(log.rows[0]).not.toHaveProperty('bytes');
});
