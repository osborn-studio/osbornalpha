import {describe,it,expect,vi} from 'vitest';
import {prepareAnalysis} from './analysis-service';
import {dataHash,inputsHash,freezeInputs} from './analysis-spec';
import {catalogById} from './catalog';
import {US_TARGET_UPPER_ID,US_TARGET_LOWER_ID} from './events';
const spec={request_id:'0b8f8d3e-4a7c-4b7e-9e55-0f6f1f2a3b4c',kind:'change' as const,indicator_id:'US_DFF',asset_id:'US_UST10Y',lag:0,window:'all' as const};
const options={cutoff:'2026-11-01T00:00:00.000Z',codeVersion:'c'.repeat(40),history:'eligible_as_of' as const};
describe('shared analysis preparation',()=>{
 it('uses eligible vintages and aliases, freezes missing inputs and returns a failed analysis',async()=>{
  const eligibleHistoryAsOf=vi.fn(async()=>[]);const seriesHistory=vi.fn(async()=>[]);
  const r=await prepareAnalysis({db:{eligibleHistoryAsOf,seriesHistory}},spec,options);
  expect(eligibleHistoryAsOf.mock.calls).toEqual([['US_DFF',{to:'2026-11-01',asOf:options.cutoff,maxRows:5000}],['US_DGS10',{to:'2026-11-01',asOf:options.cutoff,maxRows:5000}]]);
  expect(seriesHistory).not.toHaveBeenCalled();expect(r.failure?.code).toBe('insufficient_sample');
  expect(r.results).toBeNull();expect(r.inputs_hash).toBe(inputsHash(r.inputs));
 });
 it('reads both policy event sources with daily limits through the selected history',async()=>{
  const seriesHistory=vi.fn(async()=>[]);const eligibleHistoryAsOf=vi.fn(async()=>[]);
  await prepareAnalysis({db:{seriesHistory,eligibleHistoryAsOf}},{...spec,kind:'event_window',event_n:6},{...options,history:'as_of'});
  for(const id of [US_TARGET_UPPER_ID,US_TARGET_LOWER_ID])expect(seriesHistory).toHaveBeenCalledWith(id,{asOf:options.cutoff,maxRows:20000});
  expect(eligibleHistoryAsOf).not.toHaveBeenCalled();
 });
});
describe('dataHash',()=>{
 const inputs=()=>freezeInputs({indicator:catalogById('US_DFF')!,asset:catalogById('US_UST10Y')!,indicatorRows:[],assetRows:[],cutoff:options.cutoff,catalogVersion:'a'});
 it('ignores cutoff and catalog version but changes for revised observations and events',()=>{
  const a=inputs(),b={...a,cutoff:'2026-11-02T00:00:00Z',catalog_version:'b'};
  expect(inputsHash(a)).not.toBe(inputsHash(b));expect(dataHash(a)).toBe(dataHash(b));
  const c=structuredClone(a);c.indicator.observations.push({observation_id:'revision',period_end:'2026-01-31',value_text:'1'});
  expect(dataHash(c)).not.toBe(dataHash(a));
  const revision=structuredClone(c);revision.indicator.observations[0]={...revision.indicator.observations[0],observation_id:'revised',value_text:'2'};
  expect(dataHash(revision)).not.toBe(dataHash(c));
  expect(dataHash({...a,events:[]})).not.toBe(dataHash(a));
 });
});
