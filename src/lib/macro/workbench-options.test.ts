// Correlation options come from the catalog (active, monthly) and every preset is a valid request (spec §3.4).
import {describe,expect,it} from 'vitest';
import {PRESETS} from '@/components/macro/correlation-presets';
import {validateAnalysisRequest} from './analysis-spec';
import {correlationOptions} from './workbench-options';
describe('correlation options and presets',()=>{
 const o=correlationOptions();
 it('lists only active monthly indicators and assets',()=>{
  expect(o.indicators.length).toBeGreaterThan(0);expect(o.assets.length).toBeGreaterThan(0);
  expect(o.indicators.map(x=>x.id)).not.toContain('US_VIX');expect(o.indicators.map(x=>x.id)).not.toContain('CN_GDP_YOY');
  expect(o.assets.map(x=>x.id)).not.toContain('US_SP500');
 });
 it('has 8 presets, each a valid request whose series are offered by the form',()=>{
  expect(PRESETS).toHaveLength(8);
  for(const p of PRESETS){
   const r=validateAnalysisRequest({...p.form,request_id:'0b8f8d3e-4a7c-4b7e-9e55-0f6f1f2a3b4c'});
   expect([p.id,r.ok?'ok':r.errors]).toEqual([p.id,'ok']);
   expect(o.indicators.some(x=>x.id===p.form.indicator_id)).toBe(true);
   expect(o.assets.some(x=>x.id===p.form.asset_id)).toBe(true);
  }
  expect(new Set(PRESETS.map(p=>p.form.kind))).toEqual(new Set(['change','level','rolling','event_window']));
 });
});
