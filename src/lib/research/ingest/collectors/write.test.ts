import {beforeEach,describe,expect,it} from 'vitest';
import {makeMockCtx,type MockStore} from '../../test-support';
import type {ResearchCtx} from '../../store';
import {ingestVersioned} from './write';
import {ingestSource} from '../../sources';

let ctx:ResearchCtx,store:MockStore;
beforeEach(()=>{({ctx,store}=makeMockCtx() as unknown as {ctx:ResearchCtx;store:MockStore});});
const base={source_type:'FILING' as const,title:'恒生电子公告',url:'http://static.cninfo.com.cn/finalpage/2026-09-23/1.PDF',market:'A' as const,permission:'public' as const,event_time:'2026-09-23T00:00:00Z',available_at:'2026-09-23T01:00:00Z'};

describe('ingestVersioned',()=>{
 it('writes version 1 for a new URL, dedupes identical content, and appends version 2 for changed content while keeping v1',async()=>{
  const v1=await ingestVersioned(ctx,{...base,raw_text:'标题 v1'});
  expect(v1).toMatchObject({duplicate:false,source_version:'1',versioned:false});
  const dup=await ingestVersioned(ctx,{...base,raw_text:'标题 v1'});
  expect(dup).toMatchObject({id:v1.id,duplicate:true,source_version:'1',versioned:false});
  const v2=await ingestVersioned(ctx,{...base,raw_text:'标题 v1 + 正文已抽取'});
  expect(v2).toMatchObject({duplicate:false,source_version:'2',versioned:true});
  expect(v2.id).not.toBe(v1.id);
  const rows=store.rows('research_source_documents').filter(r=>r.url===base.url).map(r=>r.source_version).sort();
  expect(rows).toEqual(['1','2']);
  const v3=await ingestVersioned(ctx,{...base,raw_text:'第三版'});
  expect(v3.source_version).toBe('3');
 });
 it('treats rows without a URL as unversioned singletons and keeps the legacy defaults',async()=>{
  const r=await ingestVersioned(ctx,{...base,url:null,raw_text:'note'});
  expect(r.source_version).toBe('1');
  const row=store.rows('research_source_documents')[0];
  expect(row).toMatchObject({source_version:'1',permission:'public',market:'A',event_time:'2026-09-23T00:00:00Z',available_at:'2026-09-23T01:00:00Z'});
 });
 it('lets ingestSource accept an explicit source_version and origin_type but rejects invalid ones',async()=>{
  const ok=await ingestSource(ctx,{source_type:'FILING',title:'t',raw_text:'x',source_version:'7',origin_type:'filing'});
  expect(store.rows('research_source_documents').find(r=>r.id===ok.id)).toMatchObject({source_version:'7',origin_type:'filing'});
  await expect(ingestSource(ctx,{source_type:'FILING',title:'t',raw_text:'y',source_version:'0'})).rejects.toThrow(/source_version/);
  await expect(ingestSource(ctx,{source_type:'FILING',title:'t',raw_text:'z',source_version:'v2'})).rejects.toThrow(/source_version/);
  await expect(ingestSource(ctx,{source_type:'FILING',title:'t',raw_text:'w',origin_type:'rumor' as any})).rejects.toThrow(/origin_type/);
 });
});
