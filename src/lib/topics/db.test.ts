// src/lib/topics/db.test.ts
import {randomUUID} from 'node:crypto';
import {topicsDbContract} from './db-contract';
import {memoryTopicsDb} from './memory-db';
topicsDbContract('memory',async()=>{const m=memoryTopicsDb();return {db:m,newId:randomUUID,setPublic:async on=>{m.setPublicFlag(on);},asPublic:()=>m};});

// Function guards and detached reads (spec §4.4–§4.9).
import {describe,expect,it} from 'vitest';
import {canonicalJson} from '@/lib/evidence/hash';
import {fixtureVersion} from './db-contract';
import type {DraftBody} from './types';
const actor='00000000-0000-4000-8000-0000000000aa';
const body:DraftBody={title:{zh:'a',en:'a'},dek:{zh:'',en:''},sections:[],evidence:[],expected_slots:[],entries:[],blocks_provenance:{}};
async function draft(){
 const db=memoryTopicsDb();const t=await db.createTopic({slug:'guards-test',category:'macro',body,actor});
 const receiptId=await db.recordDisclosure({topicId:t.topic_id,draftHash:t.draft_hash,checks:[],passed:true,codeVersion:'test',actor});
 const f=fixtureVersion({db,newId:randomUUID,setPublic:async()=>{},asPublic:()=>db},'guards-test');
 return {db,t,input:{topicId:t.topic_id,expectedDraftHash:t.draft_hash,...f,summaryId:null as string|null,receiptId,cutoff:'2026-11-10T00:00:00.000Z',actor}};
}
describe('memory function guards',()=>{
 it.each(['draft_changed','disclosure_receipt','admin_projection','restricted_value','evidence_mismatch','as_of_after_cutoff','summary_provider_unconfirmed','summary_mismatch'])('rejects %s atomically',async code=>{
  const {db,t,input}=await draft();const snap=JSON.parse(input.snapshotText);
  if(code==='draft_changed')input.expectedDraftHash='0'.repeat(64);
  if(code==='disclosure_receipt')input.receiptId=randomUUID();
  if(code==='admin_projection'){snap.admin_only=true;input.snapshotText=canonicalJson(snap);}
  if(code==='restricted_value'){snap.evidence[0].resolved.state='withheld';input.snapshotText=canonicalJson(snap);}
  if(code==='evidence_mismatch')input.evidence=[];
  if(code==='as_of_after_cutoff')input.cutoff='2026-10-01T00:00:00.000Z';
  if(code.startsWith('summary_'))input.summaryId=randomUUID();
  if(code==='summary_mismatch')await db.setPublicEnabled({publicEnabled:false,summaryPublicEnabled:true,summaryProviderNote:'confirmed',licenceConfirmations:{},actor});
  await expect(db.publish(input)).rejects.toThrow(`publish_blocked:${code}`);
  expect(await db.versionsOfTopic(t.topic_id)).toEqual([]);
  expect((await db.auditOf(t.topic_id)).map(a=>a.action)).toEqual(['create','disclosure_check']);
 });
 it('keeps versions detached, falls back on unpublish and excludes withdrawn evidence',async()=>{
  const {db,t,input}=await draft();db.now(new Date('2026-11-11T00:00:00.123Z'));
  const a=await db.publish(input);const b=await db.publish(input);
  expect(await db.unpublish({topicId:t.topic_id,reason:'privacy',note:null,actor})).toEqual({current_version_no:1});
  const versions=await db.versionsOfTopic(t.topic_id);versions[0].snapshot.topic.title.en='mutated';
  expect((await db.versionsOfTopic(t.topic_id))[0].snapshot.topic.title.en).toBe('guards-test');
  expect((await db.liveEvidence(null,100)).map(e=>e.version_id)).toEqual([a.version_id]);
  expect(await db.liveEvidence({version_id:a.version_id,ordinal:1},100)).toEqual([]);
  expect(b.version_no).toBe(2);
  expect((await db.versionsOfTopic(t.topic_id))[0].published_at).toBe('2026-11-11T00:00:00.123Z');
 });
 it('keeps the completed watermark on partial drift and records only allowed events',async()=>{
  const {db,t,input}=await draft();const v=await db.publish(input);
  const row={version_id:v.version_id,ordinal:1,drift:'revised' as const,current_identity:null};
  expect(await db.upsertDrift([row],'2026-11-12T00:00:00Z',true,null)).toBe(1);
  await db.upsertDrift([row],'2026-11-13T00:00:00Z',false,{version_id:v.version_id,ordinal:1});
  expect((await db.settings()).drift_checked_at).toBe('2026-11-12T00:00:00.000Z');
  expect((await db.settings()).drift_cursor).toEqual({version_id:v.version_id,ordinal:1});
  await db.recordEvent({topicId:t.topic_id,actor,action:'preview',detail:{version_no:1}});
  expect((await db.auditOf(t.topic_id)).at(-1)?.action).toBe('preview');
 });
 it('enforces the attribution gate and retired state',async()=>{
  const {db,t,input}=await draft();await db.publish(input);
  await expect(db.setPublicEnabled({publicEnabled:true,summaryPublicEnabled:false,summaryProviderNote:null,licenceConfirmations:{},actor})).rejects.toThrow('licence_confirmation_missing');
  expect(await db.publicOpen()).toBe(false);
  await db.retire({topicId:t.topic_id,reason:'privacy',note:null,actor});
  await expect(db.saveDraft({topicId:t.topic_id,expectedRevision:1,body,actor})).rejects.toThrow('topic_retired');
  await expect(db.publish(input)).rejects.toThrow('topic_retired');
 });
});

import {vi} from 'vitest';
import type {Pool} from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {pgTopicsDb} from './pg-db';
import {supabaseTopicsDb} from './db';
describe('remote adapter boundaries (spec §4.9)',()=>{
 it('fails closed without the required Supabase client',async()=>{
  const db=supabaseTopicsDb({});
  await expect(db.publicOpen()).rejects.toThrow('client_unavailable');
  await expect(db.settings()).rejects.toThrow('client_unavailable');
  await expect(db.createTopic({slug:'remote-test',category:'macro',body,actor})).rejects.toThrow('client_unavailable');
 });
 it('sends canonical draft text and four drift arguments to Supabase RPCs',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:2,error:null});
  const db=supabaseTopicsDb({admin:{rpc} as unknown as SupabaseClient});
  await db.createTopic({slug:'remote-test',category:'macro',body,actor});
  expect(rpc).toHaveBeenLastCalledWith('topic_create',{p_slug:'remote-test',p_category:'macro',p_body_text:canonicalJson(body),p_actor:actor});
  const cursor={version_id:randomUUID(),ordinal:2};
  expect(await db.upsertDrift([],'2026-11-12T00:00:00Z',false,cursor)).toBe(2);
  expect(rpc).toHaveBeenLastCalledWith('topic_upsert_drift',{p_rows:[],p_checked_at:'2026-11-12T00:00:00Z',p_complete:false,p_cursor:cursor});
  rpc.mockResolvedValue({data:null,error:{message:'revision_conflict extra detail'}});
  await expect(db.saveDraft({topicId:randomUUID(),expectedRevision:1,body,actor})).rejects.toThrow(/^revision_conflict$/);
 });
 it('normalizes PG timestamps and counts without losing milliseconds',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{published_at:new Date('2026-11-11T00:00:00.123Z'),version_no:'2'}]});
  const db=pgTopicsDb({query} as unknown as Pool);
  expect(await db.versionsOfTopic(randomUUID())).toEqual([{published_at:'2026-11-11T00:00:00.123Z',version_no:2}]);
 });
 it('rolls back and releases each authenticated read even on failure',async()=>{
  const query=vi.fn(async(sql:string)=>{if(sql.startsWith('select'))throw new Error('permission_denied details');return {rows:[]};});
  const release=vi.fn(),connect=vi.fn().mockResolvedValue({query,release});
  const db=pgTopicsDb({connect} as unknown as Pool,{role:'authenticated'});
  await expect(db.publicOpen()).rejects.toThrow(/^permission_denied$/);
  expect(query.mock.calls.map(c=>c[0])).toEqual(['begin','set local role authenticated',expect.stringContaining('topics_open_v'),'rollback']);
  expect(release).toHaveBeenCalledOnce();
  await expect(db.settings()).rejects.toThrow('client_unavailable');
 });
});
