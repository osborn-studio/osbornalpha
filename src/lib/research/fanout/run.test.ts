import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {makeMockCtx} from '../test-support';
import type {ResearchCtx} from '../store';
import {listSourcesSince,mayLeaveMachine,thesisVersion} from './run';
import type {SourceDocument,Thesis} from '../types';

const src=(i:number):Record<string,unknown>=>({id:randomUUID(),source_type:'NEWS',title:'t',url:null,author:null,published_at:null,ingested_at:new Date(Date.UTC(2026,8,20,0,0,i)).toISOString(),raw_text:'x',content_hash:'h'+i,trust_level:'MEDIUM',entity_ids:[],metadata:{},permission:'public'});

describe('listSourcesSince',()=>{
 it('pages past the PostgREST 1000-row cap in a stable order',async()=>{
  const {ctx}=makeMockCtx({research_source_documents:Array.from({length:1203},(_,i)=>src(i))}) as unknown as {ctx:ResearchCtx};
  const out=await listSourcesSince(ctx,'2000-01-01T00:00:00Z');
  expect(out).toHaveLength(1203);
  expect(out.map(s=>s.ingested_at)).toEqual([...out.map(s=>s.ingested_at)].sort());
  expect(new Set(out.map(s=>s.id)).size).toBe(1203);
 });
 it('includes S4 controlled copies (PA-exported material) and respects the window start',async()=>{
  const rows=[src(1),{...src(2),metadata:{s4_controlled_copy:true},source_type:'MANUAL',permission:'private'},{...src(3),ingested_at:'2000-01-01T00:00:00Z'}];
  const {ctx}=makeMockCtx({research_source_documents:rows}) as unknown as {ctx:ResearchCtx};
  const out=await listSourcesSince(ctx,'2020-01-01T00:00:00Z');
  expect(out).toHaveLength(2);
  expect(out.some(s=>s.metadata?.s4_controlled_copy===true)).toBe(true);
 });
});

describe('mayLeaveMachine / thesisVersion',()=>{
 const base=(over:Partial<SourceDocument>):SourceDocument=>({id:'s',source_type:'NEWS',title:'t',url:null,author:null,published_at:null,ingested_at:'2026-09-20T00:00:00Z',raw_text:'x',content_hash:'h',trust_level:'MEDIUM',entity_ids:[],metadata:{},event_time:null,available_at:'2026-09-20T00:00:00Z',source_version:'1',cluster_id:null,cluster_first:null,origin_type:null,market:null,permission:'public',...over});
 it('lets only public, non-private-observation material reach external models',()=>{
  expect(mayLeaveMachine(base({}))).toBe(true);
  expect(mayLeaveMachine(base({permission:'private'}))).toBe(false);
  expect(mayLeaveMachine(base({permission:'licensed'}))).toBe(false);
  expect(mayLeaveMachine(base({origin_type:'private_observation'}))).toBe(false);
  // A controlled copy came from PA under a grant that denies external processing: never external, whatever permission says.
  expect(mayLeaveMachine(base({permission:'public',metadata:{s4_controlled_copy:true}}))).toBe(false);
 });
 it('changes the thesis version when pillars or invalidation conditions change, not when unrelated fields do',()=>{
  const t:Thesis={id:'t',title:'a',body:'b',company_ids:[],theme_ids:[],supporting_evidence_ids:[],invalidation_conditions:['x'],watch_metrics:['y'],status:'ACTIVE',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-02T00:00:00Z'};
  const v=thesisVersion(t);
  expect(v).toMatch(/^[0-9a-f]{64}$/);
  expect(thesisVersion({...t,company_ids:['c']})).toBe(v);
  expect(thesisVersion({...t,invalidation_conditions:['z']})).not.toBe(v);
  expect(thesisVersion({...t,updated_at:'2026-01-03T00:00:00Z'})).not.toBe(v);
  // WP-A7: pillars and opportunity type are part of the judged thesis; catalysts and horizons are not.
  expect(thesisVersion({...t,pillars:[{id:'p1',text:'支柱',resolvable_by:'',deadline:null}]})).not.toBe(v);
  expect(thesisVersion({...t,opportunity_type:'B'})).not.toBe(v);
  expect(thesisVersion({...t,catalysts:[{text:'c',expected_date:null}],horizon_weeks:[4]})).toBe(v);
  // A row without the new fields hashes like one with the defaults.
  expect(thesisVersion({...t,opportunity_type:'other',pillars:[]})).toBe(v);
 });
});
