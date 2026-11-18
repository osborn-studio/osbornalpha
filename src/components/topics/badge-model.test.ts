import {describe,expect,it} from 'vitest';
import {driftBadge,stateBadge} from './badge-model';
describe('topic badges (X7)',()=>{
 it.each([['ok',{kind:'ok'}],['missing',{kind:'shared',state:'missing'}],['withheld',{kind:'shared',state:'withheld'}],['not_served',{kind:'shared',state:'notServed'}],
  ['retracted',{kind:'shared',state:'retracted'}],['unsupported',{kind:'local',key:'states.unsupported',shape:'dashed',tone:'neutral'}]] as const)('state %s',(s,want)=>{
  expect(stateBadge(s,'reason_x')).toMatchObject({...want,reasonKey:s==='ok'?null:'reasons.reason_x'});
 });
 it.each([['revised',{kind:'shared',state:'revised'}],['newer_period',{kind:'local',key:'drift.newer_period',shape:'solid',tone:'warn'}],
  ['now_withheld',{kind:'local',key:'drift.now_withheld',shape:'dotted',tone:'neutral'}],['retracted',{kind:'shared',state:'retracted'}],
  ['unverifiable',{kind:'local',key:'drift.unverifiable',shape:'dashed',tone:'neutral'}]] as const)('drift %s',(d,want)=>{expect(driftBadge(d)).toMatchObject(want);});
 it('adds the reconstruction mark for basis reconstruction',async()=>{const {basisBadge}=await import('./badge-model');expect(basisBadge('reconstruction')).toEqual({kind:'shared',state:'reconstructed'});expect(basisBadge('point_in_time')).toBeNull();});
});
import {SAMPLES} from '@/lib/evidence/fixtures';
import zh from '../../../messages/zh/topics.json';
import en from '../../../messages/en/topics.json';
it('localizes every sample reason in both locales',()=>{
 for(const sample of Object.values(SAMPLES).flat()){
  const reason=sample.expect.split(':')[1];if(reason==='null')continue;
  for(const messages of [zh,en])expect(messages).toHaveProperty(`reasons.${reason}`,expect.any(String));
 }
});
