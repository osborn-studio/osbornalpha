// src/lib/topics/flags.test.ts
import {describe,expect,it} from 'vitest';
import {TOPIC_STALE_DAYS,topicsEnabled} from './flags';
import {TopicError,TOPIC_ERROR_STATUS} from './errors';

describe('topics flag',()=>{
 it.each([[undefined,false],['',false],['0',false],['true',false],['1',true]] as const)('TOPICS_ENABLED=%s → %s',(v,on)=>{
  expect(topicsEnabled({TOPICS_ENABLED:v})).toBe(on);
 });
 it('uses the D9 default',()=>{expect(TOPIC_STALE_DAYS).toBe(90);});
});
describe('TopicError',()=>{
 it('maps every spec §13.1 code to its status',()=>{
  expect(TOPIC_ERROR_STATUS).toEqual({topics_disabled:404,not_found:404,no_version_at_asof:404,topic_retired:410,version_unpublished:410,
   invalid_parameter:400,slug_taken:409,revision_conflict:409,publish_blocked:409,resolver_degraded:409,licence_confirmation_missing:409,
   quota_exceeded:429,code_version_unavailable:503,unsupported_media_type:415,forbidden_origin:403,invalid_body:400});
 });
 it('keeps the detail after the colon and looks the status up by the head',()=>{
  const e=new TopicError('publish_blocked:dangling_slot,numeral_in_owner_text');
  expect([e.code,e.status]).toEqual(['publish_blocked:dangling_slot,numeral_in_owner_text',409]);
 });
});
