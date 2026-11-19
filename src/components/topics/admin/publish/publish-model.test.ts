// Topic plan T6.8: publication eligibility and confirmation contents.
import {expect,it} from 'vitest';
import type {DisclosureCheck} from '@/lib/topics/types';
import {publishModel,retireEnabled,versionStatusKey} from './publish-model';
const checks:DisclosureCheck[]=(['warn','pass','block','block'] as const).map((result,id)=>({result,id,key:'check',codes:[],detail:{}}));
const receipt={passed:false,draft_hash:'current',checks};
const input={receipt,draftHash:'current',versions:[{version_no:3,status:'unpublished'},{version_no:1,status:'current'}],preview:null,retired:false};
it('counts each blocking check and each outcome',()=>{
 expect(publishModel(input)).toEqual({canPublish:false,reason:'blocked',remaining:2,totals:{block:2,warn:1,pass:1},nextVersion:4,dialog:null});
});
it('requires a passing receipt for the current draft and a live topic',()=>{
 const passed={...receipt,passed:true,checks:checks.slice(0,2)};
 expect(publishModel({...input,receipt:passed})).toMatchObject({canPublish:true,reason:'ok',remaining:0});
 expect(publishModel({...input,receipt:null})).toMatchObject({canPublish:false,reason:'no_receipt'});
 expect(publishModel({...input,receipt:passed,draftHash:'new'})).toMatchObject({canPublish:false,reason:'stale_receipt'});
 expect(publishModel({...input,receipt:passed,retired:true})).toMatchObject({canPublish:false,reason:'retired'});
});
it('summarizes frozen evidence in display order and omits zero counts',()=>{
 const preview={counts:{retracted:1,missing:0,unsupported:0,ok:3,not_served:0,withheld:2},evidence:6,expected_slots:1};
 expect(publishModel({...input,versions:[],preview})).toMatchObject({nextVersion:1,dialog:{evidence:6,distribution:[{state:'ok',n:3},{state:'withheld',n:2},{state:'retracted',n:1}],slots:1,summary:false}});
});
it('requires the exact slug and maps each version status',()=>{
 expect(retireEnabled('banks','banks')).toBe(true);
 for(const input of [' banks','banks ','Banks',''])expect(retireEnabled(input,'banks')).toBe(false);
 expect((['current','superseded','unpublished'] as const).map(versionStatusKey)).toEqual(['versionStatus.current','versionStatus.superseded','versionStatus.unpublished']);
});

it('only projects current values for revisions and periods for newer periods',async()=>{
 const {driftDetail}=await import('./publish-model');
 const identity={period:'2026-10',value_text:'4.2',unit:'pct',available_at:null};
 for(const drift of ['now_withheld','retracted','unchanged','unverifiable','newer_period','revised'] as const){
  const row=driftDetail({version_id:'v',ordinal:3,drift,current_identity:identity,checked_at:'time'});
  expect(row).toMatchObject({ordinal:3,checked_at:'time',period:['revised','newer_period'].includes(drift)?identity.period:null,value:drift==='revised'?identity.value_text:null});
 }
});

it('shows the latest replay result for the requested version, including zero mismatches',async()=>{
 const {lastVerification}=await import('./publish-model');
 const event={id:1,topic_id:'id',action:'replay_verify' as const,actor:'actor',created_at:'then',detail:{version_no:1,mismatched:[]}};
 const audit=[event,{...event,id:2,created_at:'now',detail:{version_no:1,mismatched:[{ordinal:1,reason:'digest_changed'}]}},{...event,id:3,detail:{version_no:2,mismatched:[]}}];
 expect(lastVerification(audit,1)).toEqual({time:'now',mismatches:1});
 expect(lastVerification(audit,2)).toEqual({time:'then',mismatches:0});
 expect(lastVerification(audit,3)).toBeNull();
});

it('models rejection details and approval state for the workflow cards',async()=>{
 const {summaryRunModel}=await import('./publish-model');
 expect(summaryRunModel(null)).toEqual({kind:'empty'});
 const summary={summary_id:'summary',run_id:'run',topic_id:'topic',draft_hash:'hash',approved_by:null,approved_at:null,locale:'zh' as const,
  rendered:{facts:[{fact_id:'ev:1',text:'Fact',refs:[1]}],points:[],counterpoints:[],incomparable:[],provider:'example',model:'m',prompt_version:'p',validator_version:'v'}};
 for(const status of ['generated','approved','discarded'] as const){
  const card=summaryRunModel({state:'accepted',summary:{...summary,status},validation:null,failure_codes:[]});
  expect(card).toEqual(status==='discarded'?{kind:'empty'}:{kind:status==='approved'?'approved':'accepted',id:'summary',facts:1,points:0,counterpoints:0});
 }
 expect(summaryRunModel({state:'rejected',summary:null,validation:{failures:[{code:'numeral',match:'3'}]},failure_codes:['numeral']})).toEqual({kind:'rejected',code:'numeral',match:'3'});
 expect(summaryRunModel({state:'failed',summary:null,validation:null,failure_codes:['provider_error']})).toEqual({kind:'error',code:'provider_error'});
});
it('shows an attached summary in the confirmation',()=>{
 const preview={counts:{retracted:0,missing:0,unsupported:0,ok:1,not_served:0,withheld:0},evidence:1,expected_slots:0,summary:true};
 expect(publishModel({...input,preview}).dialog?.summary).toBe(true);
});
