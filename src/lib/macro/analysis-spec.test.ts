// Analysis request validation and input freezing (spec §7, §8, §0.2 M18/M22).
import {describe,expect,it} from 'vitest';
import {canonicalJson,freezeInputs,inputsHash,validateAnalysisRequest} from './analysis-spec';
import {catalogById} from './catalog';
import type {ObservationRow} from './types';
const ok={request_id:'0b8f8d3e-4a7c-4b7e-9e55-0f6f1f2a3b4c',kind:'change',indicator_id:'US_DFF',asset_id:'US_UST10Y',lag:0,window:'10y'};
const fields=(b:unknown)=>{const r=validateAnalysisRequest(b);return r.ok?[]:r.errors.map(e=>`${e.field}:${e.code}`);};
describe('validateAnalysisRequest',()=>{
 it('accepts a valid change request and resolves catalog entries',()=>{
  const r=validateAnalysisRequest(ok);
  expect(r.ok).toBe(true);
  if(r.ok){expect(r.indicator.id).toBe('US_DFF');expect(r.asset.id).toBe('US_UST10Y');}
 });
 it('schema errors are field-level',()=>{
  expect(fields({...ok,lag:13})).toContain('lag:maximum');
  expect(fields({...ok,lag:1.5})).toContain('lag:type');
  expect(fields({...ok,request_id:'not-a-uuid'})).toContain('request_id:pattern');
  expect(fields({...ok,window:'3y'})).toContain('window:enum');
  expect(fields({...ok,extra:1})).toContain('extra:additionalProperties');
  const missing:Record<string,unknown>={...ok};delete missing.asset_id;expect(fields(missing)).toContain('asset_id:required');
 });
 it('catalog rules: role, status, monthly',()=>{
  expect(fields({...ok,indicator_id:'NOPE'})).toContain('indicator_id:not_indicator');
  expect(fields({...ok,indicator_id:'US_WTI'})).toContain('indicator_id:not_indicator');
  expect(fields({...ok,indicator_id:'US_VIX'})).toContain('indicator_id:not_active');
  expect(fields({...ok,indicator_id:'CN_GDP_YOY'})).toContain('indicator_id:not_monthly');
  expect(fields({...ok,asset_id:'US_SP500'})).toContain('asset_id:not_active');
  expect(fields({...ok,asset_id:'US_CPI_YOY'})).toContain('asset_id:not_asset');
 });
 it('event window rules',()=>{
  expect(fields({...ok,kind:'event_window'})).toContain('event_n:required');
  expect(fields({...ok,kind:'event_window',event_n:6,indicator_id:'CN_PMI_MFG',asset_id:'CN_CGB10Y'})).toContain('indicator_id:event_window_requires_us_policy_rate');
  expect(fields({...ok,kind:'event_window',event_n:6,lag:2})).toContain('lag:must_be_zero_for_event_window');
  expect(fields({...ok,event_n:6})).toContain('event_n:only_for_event_window');
  expect(fields({...ok,kind:'event_window',event_n:6})).toEqual([]);
 });
});
describe('freezeInputs / inputsHash',()=>{
 const row=(id:string,d:string,v:string)=>({observation_id:id,series_id:'X',period_end:d,value_text:v,version:2,available_at:'2026-01-01T00:00:00Z',status:'ok'} as unknown as ObservationRow);
 const frozen=()=>freezeInputs({indicator:catalogById('US_DFF')!,asset:catalogById('US_UST10Y')!,
  indicatorRows:[row('b','2024-02-29','5.33'),row('a','2024-01-31','5.33')],assetRows:[row('c','2024-01-31','3.99')],
  events:[{kind:'policy_target_change',region:'US',effective_date:'2024-09-18',upper_from:'5.5',upper_to:'5',lower_from:'5.25',lower_to:'4.75',change_bp:'-50',source:'derived',evidence:['1','2','3','4'],version:'macro-events/1'}],
  cutoff:'2026-11-06T00:00:00.000Z',catalogVersion:'macro-catalog/abc'});
 it('keeps only id/period/value, sorted, with the series actually read',()=>{
  expect(frozen()).toEqual({
   indicator:{series_id:'US_DFF',source_series_id:'US_DFF',change_kind:catalogById('US_DFF')!.changeKind,observations:[{observation_id:'a',period_end:'2024-01-31',value_text:'5.33'},{observation_id:'b',period_end:'2024-02-29',value_text:'5.33'}]},
   asset:{series_id:'US_UST10Y',source_series_id:'US_DGS10',change_kind:'bp',observations:[{observation_id:'c',period_end:'2024-01-31',value_text:'3.99'}]},
   events:[{effective_date:'2024-09-18',change_bp:'-50',evidence:['1','2','3','4']}],
   cutoff:'2026-11-06T00:00:00.000Z',catalog_version:'macro-catalog/abc'});
 });
 it('hash is SHA-256 of canonical JSON (key order independent)',()=>{
  const f=frozen();
  expect(inputsHash(f)).toMatch(/^[0-9a-f]{64}$/);
  const reordered=JSON.parse(JSON.stringify({catalog_version:f.catalog_version,cutoff:f.cutoff,events:f.events,asset:f.asset,indicator:f.indicator}));
  expect(inputsHash(reordered)).toBe(inputsHash(f));
  expect(canonicalJson({b:1,a:[{d:'x',c:null}]})).toBe('{"a":[{"c":null,"d":"x"}],"b":1}');
 });
});
