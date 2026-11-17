import {createClient} from '@supabase/supabase-js';
import {describe,expect,it,vi} from 'vitest';
import {MacroDbError,observationFromRow} from '../db';
import {memoryMacroDb} from '../memory-db';
import {strategyHistoriesReader,type HistoriesReader} from './history-rpc';
import {obs} from './testing/fixture';
import {macroDbStrategyPort} from './wiring';

const asOf='2026-11-07T00:00:00Z';
const options={asOf,maxRows:10};
const row=obs('US_UNRATE','2026-09-30','4.1');

describe('projected history RPC',()=>{
 it('uses the anon client and exactly the legacy normalization, including nulls and timestamp offsets',async()=>{
  const raw={...row,available_at:'2026-10-01T02:00:00+02:00',ingested_at:'2026-10-01T00:00:00.123456Z',derived_from:[1,'id'],retrieval_id:null,transform:null};
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const request=new Request(input,init);
   expect(request.headers.get('apikey')).toBe('anon-fixture');
   expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/macro_strategy_histories');
   expect(await request.json()).toEqual({p_series:['US_UNRATE','EMPTY'],p_as_of:asOf,p_from:null,p_to:null});
   return new Response(JSON.stringify([{series_id:'US_UNRATE',raw_count:2,rows:[[raw.observation_id,raw.period_end,raw.value_text,raw.version,raw.available_at,raw.ingested_at,raw.retrieval_id,raw.derived_from,raw.transform]]},{series_id:'EMPTY',raw_count:0,rows:[]}]),{headers:{'content-type':'application/json'}});
  });
  const client=createClient('https://fixture.invalid','anon-fixture',{global:{fetch:fetcher}});
  const got=await strategyHistoriesReader(client)(['US_UNRATE','EMPTY'],{asOf});
  const {locator:_l,code_version:_c,batch_id:_b,...expected}=observationFromRow(raw);
  expect(got).toEqual([{series_id:'US_UNRATE',raw_count:2,rows:[expected]},{series_id:'EMPTY',raw_count:0,rows:[]}]);
 });
 it('coalesces by cutoff and bounds, deduplicates series and chunks at 64',async()=>{
  const reader=vi.fn<HistoriesReader>(async ids=>ids.map(series_id=>({series_id,raw_count:0,rows:[]})));
  const port=macroDbStrategyPort(memoryMacroDb(),{historiesReader:reader});
  await Promise.all([...Array.from({length:130},(_,i)=>port.seriesHistory(`S${i}`,options)),port.seriesHistory('S0',options),port.seriesHistory('S0',{...options,from:'2026-01-01'}),port.seriesHistory('S0',{...options,to:'2026-01-01'}),port.seriesHistory('S0',{...options,asOf:'2026-11-08T00:00:00Z'})]);
  expect(reader.mock.calls.map(c=>c[0].length).sort((a,b)=>a-b)).toEqual([1,1,1,2,64,64]);
  await port.seriesHistory('S0',options);expect(reader).toHaveBeenCalledTimes(7);
 });
 it.each([{raw:2,periods:2,max:1,ok:false},{raw:16,periods:1,max:1,ok:true},{raw:17,periods:1,max:1,ok:false},{raw:100000,periods:1,max:7000,ok:true},{raw:100001,periods:1,max:7000,ok:false},{raw:110000,periods:1,max:110000,ok:true}])('preserves raw cap ladder and period cap: $raw / $periods / $max',async({raw,periods,max,ok})=>{
  const rows=Array.from({length:periods},()=>row);
  const legacy=macroDbStrategyPort({...memoryMacroDb(),seriesHistory:async(_id,o)=>{if(raw>o.maxRows)throw new MacroDbError('truncated');return rows.map(o=>({...o,locator:null,code_version:'test',batch_id:'test'}));}});
  const rpc=macroDbStrategyPort(memoryMacroDb(),{historiesReader:async ids=>ids.map(series_id=>({series_id,raw_count:raw,rows}))});
  const a=await Promise.allSettled([legacy.seriesHistory('US_UNRATE',{asOf,maxRows:max}),rpc.seriesHistory('US_UNRATE',{asOf,maxRows:max})]);
  expect(a[1]).toEqual(a[0]);expect(a[0].status).toBe(ok?'fulfilled':'rejected');
 });
 it.each(['57014','42501'])('propagates %s unchanged without fallback or retry',async code=>{
  const error={code,message:'failure'},reader=vi.fn<HistoriesReader>(async()=>{throw error;});
  const legacy=vi.fn();const port=macroDbStrategyPort({...memoryMacroDb(),seriesHistory:legacy},{historiesReader:reader});
  await expect(port.seriesHistory('S',options)).rejects.toBe(error);
  expect(reader).toHaveBeenCalledTimes(1);expect(legacy).not.toHaveBeenCalled();
 });
 it.each(['PGRST202','42883'])('remembers missing function %s across port instances for the process',async code=>{
  vi.resetModules();const {macroDbStrategyPort:wire}=await import('./wiring');
  const reader=vi.fn<HistoriesReader>(async()=>{throw {code};}),legacy=vi.fn(async()=>[]);
  const db={...memoryMacroDb(),seriesHistory:legacy};
  const port=wire(db,{historiesReader:reader});
  expect(await Promise.all([port.seriesHistory('A',options),port.seriesHistory('B',options)])).toEqual([[],[]]);
  expect(await wire(db,{historiesReader:reader}).seriesHistory('C',options)).toEqual([]);
  expect(reader).toHaveBeenCalledTimes(1);expect(legacy).toHaveBeenCalledTimes(3);
 });
});
