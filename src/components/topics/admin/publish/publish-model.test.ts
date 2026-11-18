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
