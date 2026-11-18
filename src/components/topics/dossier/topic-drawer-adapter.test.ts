// Topic drawer variants (spec §6.4, D8).
import {describe,expect,it} from 'vitest';
import type {EvidenceDetailDto} from '@/lib/topics/public-dto';
import {topicDrawerInput} from './topic-drawer-adapter';
const detail:EvidenceDetailDto={version_no:2,evidence:{ordinal:1,section_key:'s',kind:'macro_observation',state:'ok',reason:null,basis:'point_in_time',label:{zh:'失业率',en:'Unemployment'},fact:{template:'topic.macro_level',slots:{value:{value_text:'12345.6',unit:'pct'}}},period:'2026-08-31',available_at:'2026-09-05',drift:null,masked:false,current:null},drawer:{kind:'macro_observation',identity:{id:'observation',label:'失业率'},source:{publisher:'FRED',adapter:'fred',url:null,locator:null,evidence_sha256:null},times:{period:'2026-08-31',available_at:'2026-09-05',ingested_at:null},transform:{code_version:null,mapping_version:null,method_version:null},licence:{status:'public',note_key:'macro:rights:public_domain'},attribution_key:'macro:attribution',links:{module_href:'/macro/US_UNRATE'}}};
const text=(key:string)=>key;
const adapt=(patch:Partial<EvidenceDetailDto['evidence']>={})=>topicDrawerInput({detail:{...detail,evidence:{...detail.evidence,...patch}},locale:'zh',text});
describe('topic drawer adapter',()=>{
 it('maps visible facts',()=>expect(adapt()).toEqual({variant:'ok',payload:detail.drawer,extras:{mark:'fact',value:'12,345.6%',period:'2026-08-31'}}));
 it('maps revised values',()=>expect(adapt({drift:'revised',current:{value_text:'12346.6',unit:'pct',period:'2026-08-31',available_at:'2026-09-06'}})).toEqual({variant:'revised',payload:detail.drawer,revised:{frozen:{value:'12,345.6%',available_at:'2026-09-05'},current:{value:'12,346.6%',available_at:'2026-09-06'}}}));
 it.each([{state:'withheld' as const},{drift:'now_withheld' as const}])('maps restricted evidence without a payload',patch=>{
  const out=adapt({...patch,reason:'licence_unconfirmed'});
  expect(out).toEqual({variant:'withheld',kind:'macro_observation',identity:{id:'observation',label:'失业率'},reason:{code:'licence_unconfirmed',text:'reasons.licence_unconfirmed'}});
  expect(out).not.toHaveProperty('payload');expect(JSON.stringify(out)).not.toContain('12345');
 });
 it.each([{masked:true},{state:'retracted' as const}])('maps removed evidence without a payload',patch=>{
  const out=adapt({...patch,reason:'quarantined'});
  expect(out).toEqual({variant:'retracted',kind:'macro_observation',identity:{id:'observation',label:'失业率'},retraction:{category:'reasons.quarantined',at:null}});
  expect(out).not.toHaveProperty('payload');expect(JSON.stringify(out)).not.toContain('12345');
 });
 it.each(['missing','not_served','unsupported'] as const)('rejects non-drawer state %s',state=>expect(()=>adapt({state})).toThrow('drawer_unavailable'));
 it('marks judgments and localizes identity',()=>{
  expect(adapt({kind:'judgment'})).toMatchObject({extras:{mark:'judgment'}});
  expect(topicDrawerInput({detail:{...detail,evidence:{...detail.evidence,state:'withheld'}},locale:'en',text})).toMatchObject({identity:{label:'Unemployment'}});
 });
});

it('keeps the masking reason from identity-only drawer details',()=>{
 const out=topicDrawerInput({detail:{...detail,evidence:{...detail.evidence,masked:true,drift:'now_withheld'},drawer:{kind:'macro_observation',identity:{id:'observation',label:'失业率'},reason:'now_withheld'}},locale:'zh',text});
 expect(out).toMatchObject({variant:'retracted',retraction:{category:'reasons.now_withheld',at:null}});
});
