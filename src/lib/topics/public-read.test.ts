// src/lib/topics/public-read.test.ts
import {describe,expect,it} from 'vitest';
import {TopicError} from './errors';
import {publishedFixture} from './fixtures/published';
import {listTopics,readEvidence,readTopic,readVersions} from './public-read';
const deps=(f:ReturnType<typeof publishedFixture>,now='2026-11-15T00:00:00Z')=>({db:f.db,now:()=>new Date(now),preview:false});
describe('public read',()=>{
 it('A2: lists nothing while the switch is off',async()=>{
  const f=publishedFixture();f.db.setPublicFlag(false);
  await expect(listTopics(deps(f),{limit:50})).rejects.toEqual(new TopicError('not_found'));
  await expect(readTopic(deps(f),'rates-and-banks',{})).rejects.toEqual(new TopicError('not_found'));
 });
 it('lists published topics newest first with counts',async()=>{
  const f=publishedFixture();
  const {items,nextCursor}=await listTopics(deps(f),{limit:50});
  expect(items.map(i=>[i.slug,i.version_no])).toEqual([['rates-and-banks',2],['cn-company',1]]);
  expect(items[1].evidence_counts).toMatchObject({ok:3,withheld:9});expect(nextCursor).toBeNull();
 });
 it('filters by category and title prefix, and pages by cursor',async()=>{
  const f=publishedFixture();
  expect((await listTopics(deps(f),{limit:50,category:'company'})).items.map(i=>i.slug)).toEqual(['cn-company']);
  expect((await listTopics(deps(f),{limit:50,q:'利率'})).items.map(i=>i.slug)).toEqual(['rates-and-banks']);
  const p1=await listTopics(deps(f),{limit:1});expect(p1.nextCursor).not.toBeNull();
  expect((await listTopics(deps(f),{limit:1,cursor:p1.nextCursor!})).items.map(i=>i.slug)).toEqual(['cn-company']);
 });
 it('A3: returns every evidence item of the snapshot with a state',async()=>{
  const f=publishedFixture();const d=await readTopic(deps(f),'rates-and-banks',{});
  expect(d.evidence.length).toBe(f.snapshots['rates-and-banks'][2].evidence.length);
  expect(d.evidence.every(e=>e.state.length>0)).toBe(true);expect([d.view,d.version.version_no,d.total_versions]).toEqual(['current',2,2]);
 });
 it('reads a named version and marks it superseded',async()=>{
  const d=await readTopic(deps(publishedFixture()),'rates-and-banks',{version:1});
  expect([d.view,d.version.superseded,d.current_version_no]).toEqual(['version',true,2]);
 });
 it('D12: an unpublished version answers 410 with metadata only',async()=>{
  const f=publishedFixture();await f.unpublishCurrent('rates-and-banks','privacy');
  await expect(readTopic(deps(f),'rates-and-banks',{version:2})).rejects.toMatchObject({code:'version_unpublished',status:410,detail:{version_no:2,reason:'privacy'}});
  expect((await readTopic(deps(f),'rates-and-banks',{})).version.version_no).toBe(1);
  expect((await readVersions(deps(f),'rates-and-banks')).map(v=>[v.version_no,v.unpublish_reason])).toEqual([[2,'privacy'],[1,null]]);
 });
 it('a retired slug answers 410 topic_retired with the category only',async()=>{
  const f=publishedFixture();await f.retire('cn-company','licence');
  await expect(readTopic(deps(f),'cn-company',{})).rejects.toMatchObject({code:'topic_retired',status:410,detail:{reason:'licence'}});
 });
 it('serves the frozen drawer for one ordinal',async()=>{
  const e=await readEvidence(deps(publishedFixture()),'rates-and-banks',1);
  expect(e.drawer).toMatchObject({kind:'macro_observation'});expect(e.version_no).toBe(2);
  await expect(readEvidence(deps(publishedFixture()),'rates-and-banks',99)).rejects.toEqual(new TopicError('not_found'));
 });
 it('D9: marks a version older than 90 days stale',async()=>{
  const d=await readTopic(deps(publishedFixture(),'2027-03-01T00:00:00Z'),'rates-and-banks',{});
  expect([d.stale,d.age_days>90]).toEqual([true,true]);
 });
});
it('A5: replay preserves withdrawal and selection history',async()=>{
 const f=publishedFixture();await f.unpublishCurrent('rates-and-banks','privacy');
 await expect(readTopic(deps(f),'rates-and-banks',{asOf:'2026-11-08'})).rejects.toMatchObject({code:'version_unpublished'});
 await expect(readTopic(deps(f),'rates-and-banks',{asOf:'2026-10-31'})).rejects.toMatchObject({code:'no_version_at_asof'});
 const d=await readTopic(deps(f),'rates-and-banks',{asOf:'2026-11-01'});
 expect([d.version.version_no,d.view]).toEqual([1,'replay']);
});
it('gates every public read, including metadata and drawers',async()=>{
 const f=publishedFixture();f.db.setPublicFlag(false);
 await expect(readVersions(deps(f),'rates-and-banks')).rejects.toEqual(new TopicError('not_found'));
 await expect(readEvidence(deps(f),'rates-and-banks',1)).rejects.toEqual(new TopicError('not_found'));
});
it('rejects invalid filters and malformed cursors',async()=>{
 const d=deps(publishedFixture());
 await expect(listTopics(d,{limit:50,q:'x'.repeat(33)})).rejects.toEqual(new TopicError('invalid_parameter:q'));
 for(const limit of [0,201,1.5])await expect(listTopics(d,{limit})).rejects.toEqual(new TopicError('invalid_parameter:limit'));
 for(const cursor of ['','%%%','YWJj'])await expect(listTopics(d,{limit:50,cursor})).rejects.toEqual(new TopicError('invalid_parameter:cursor'));
 expect((await listTopics(d,{limit:50,q:'RATES'})).items.map(i=>i.slug)).toEqual(['rates-and-banks']);
});
it('returns metadata only after all versions are withdrawn',async()=>{
 const f=publishedFixture();await f.unpublishCurrent('rates-and-banks','privacy');await f.unpublishCurrent('rates-and-banks','error');
 await expect(readTopic(deps(f),'rates-and-banks',{})).rejects.toMatchObject({code:'version_unpublished',detail:{version_no:2,reason:'privacy'}});
 await expect(readEvidence(deps(f),'rates-and-banks',1,1)).rejects.toMatchObject({code:'version_unpublished'});
 expect((await listTopics(deps(f),{limit:50})).items.map(i=>i.slug)).toEqual(['cn-company']);
});
it('uses real, deterministic fixture publications with realistic evidence',async()=>{
 const a=publishedFixture(),b=publishedFixture();
 const [ar,br]=await Promise.all([a.db.publicTopics(),b.db.publicTopics()]);expect(ar).toEqual(br);
 const d=await readTopic(deps(a),'rates-and-banks',{});
 expect(d.evidence[0].fact?.slots.value).toEqual({value_text:'3.75',unit:'pct'});
 expect(d.evidence.slice(0,2).map(e=>e.fact?.slots.series)).toEqual(['US_UNRATE','US_UNRATE']);
 expect(d.evidence.some(e=>e.kind==='industry_metric'&&e.basis==='reconstruction')).toBe(true);
 expect(d.evidence.some(e=>e.kind==='judgment'&&e.state==='ok')).toBe(true);
 expect(d.expected_slots[0].reason_code).toBe('industry_not_published');expect(d.entries[0].entry_type).toBe('owner_note');
});
it('applies stored drift to the directory, dossier, replay and drawer',async()=>{
 const f=publishedFixture();const t=await f.db.publicTopicBySlug('rates-and-banks');
 await f.db.upsertDrift([{version_id:t!.current_version_id!,ordinal:3,drift:'now_withheld',current_identity:null}], '2026-11-14T00:00:00.000Z',true,null);
 const d=deps(f);
 expect((await listTopics(d,{limit:50})).items[0].drift_counts.now_withheld).toBe(1);
 for(const options of [{},{version:2},{asOf:'2026-11-08'}]){
  const out=await readTopic(d,'rates-and-banks',options);
  expect(out.evidence[2]).toMatchObject({masked:true,fact:null,drift:'now_withheld'});expect(out.drift_unchecked).toBe(false);
 }
 const out=await readEvidence(d,'rates-and-banks',3);
 expect(out.drawer).toEqual({kind:'financial_fact',identity:expect.any(Object),reason:'now_withheld'});
 expect(JSON.stringify(out)).not.toContain('1000');
});
