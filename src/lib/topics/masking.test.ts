// src/lib/topics/masking.test.ts
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {maskingFixture} from './fixtures/published';
import {maskSnapshot} from './masking';
describe('read-time masking (spec §5.4, A5b)',()=>{
 const f=maskingFixture();   // evidence 1 ok (value '3.75'), 2 ok ('4.3'), 3 ok ('1000'); summary facts ev:1, ev:2, ev:3; point A cites ev:1+ev:3, point B cites ev:2
 it('shows revised and newer_period in current and version views but not in replay',()=>{
  const d=new Map([[2,{version_id:'v',ordinal:2,drift:'revised' as const,current_identity:{value_text:'4.2',unit:'pct',period:'2026-08',available_at:'2026-10-03T12:30:00.000Z'}}]]);
  expect(maskSnapshot(f.snapshot,d,'current').evidence[1]).toMatchObject({drift:'revised',masked:false,current:{value_text:'4.2'}});
  expect(maskSnapshot(f.snapshot,d,'replay').evidence[1]).toMatchObject({drift:null,masked:false,current:null});
 });
 it.each(['retracted','now_withheld'] as const)('%s removes the value, the drawer payload and the summary sentences in every view',drift=>{
  const d=new Map([[3,{version_id:'v',ordinal:3,drift,current_identity:null}]]);
  for(const view of ['current','version','replay'] as const){
   const out=maskSnapshot(f.snapshot,d,view);
   expect(out.evidence[2]).toMatchObject({masked:true,fact:null,drift});
   expect(out.drawers.get(3)).toEqual({kind:'financial_fact',identity:expect.any(Object),reason:drift});
   expect(out.summary!.facts.find(x=>x.fact_id==='ev:3')!.text).toBe('');
   expect(out.summary!.points.map(p=>p.fact_ids)).toEqual([['ev:2']]);expect(out.summary!.hidden_points).toBe(1);
   expect(JSON.stringify(out)).not.toContain('1000');
  }
 });
 it('never changes the snapshot it was given',()=>{
  const before=sha256Hex(canonicalJson(f.snapshot));
  maskSnapshot(f.snapshot,new Map([[3,{version_id:'v',ordinal:3,drift:'retracted',current_identity:null}]]),'current');
  expect(sha256Hex(canonicalJson(f.snapshot))).toBe(before);
 });
});
it('shows nonmasking drift in both named and current views only',()=>{
 const f=maskingFixture();
 for(const drift of ['revised','newer_period'] as const){
  const d=new Map([[2,{version_id:'v',ordinal:2,drift,current_identity:{value_text:'4.2',unit:'pct',period:'2026-09',available_at:'2026-10-03T12:30:00.000Z'}}]]);
  for(const view of ['current','version'] as const)expect(maskSnapshot(f.snapshot,d,view).evidence[1]).toMatchObject({drift,masked:false,current:{value_text:'4.2'}});
  expect(maskSnapshot(f.snapshot,d,'replay').evidence[1]).toMatchObject({drift:null,current:null,masked:false});
 }
});
