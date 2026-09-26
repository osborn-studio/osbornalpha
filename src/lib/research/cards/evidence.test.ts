import {describe,expect,it} from 'vitest';
import {collectEvidence,type LedgerRow} from './evidence';
import type {SourceDocument} from '../types';

const S1='11111111-1111-4111-8111-111111111111',S2='22222222-2222-4222-8222-222222222222',S3='33333333-3333-4333-8333-333333333333',S4='44444444-4444-4444-8444-444444444444';
const T1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',T2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const src=(id:string,over:Partial<SourceDocument>={}):SourceDocument=>({id,source_type:'NEWS',title:'t'+id.slice(0,2),url:`https://news-${id.slice(0,1)}.example.com/a`,author:null,published_at:null,ingested_at:'2026-09-22T00:00:00Z',raw_text:'body',content_hash:'h'+id,trust_level:'MEDIUM',entity_ids:[],metadata:{},event_time:null,available_at:'2026-09-22T00:00:00Z',source_version:'1',cluster_id:null,cluster_first:null,origin_type:null,market:'US',permission:'public',...over});
let n=0;
const row=(source_id:string,thesis_id:string,question_id:string,selected:string|null,backend='rule',abstained=false):LedgerRow=>({id:`j-${++n}`,source_id,thesis_id,question_id,backend,selected,abstained});
const relevant=(s:string,t:string,dir='support',backend='rule')=>[row(s,t,'Q1','true',backend),row(s,t,'Q2',dir,backend)];

describe('collectEvidence',()=>{
 it('keeps relevant, first-in-cluster, non-retelling, exportable pairs and classifies direction',()=>{
  const sources=[src(S1),src(S2,{cluster_id:'c',cluster_first:false}),src(S3),src(S4,{permission:'private'})];
  const rows=[
   ...relevant(S1,T1,'support'),row(S1,T1,'Q3','filing_or_regulator'),
   ...relevant(S2,T1,'support'),                       // duplicate in cluster → out
   ...relevant(S3,T1,'weaken'),row(S3,T1,'Q3','retelling','llm_deepseek'), // retelling → out
   ...relevant(S4,T1,'support'),                       // private → counted, not used
   row(S1,T2,'Q1','false'),row(S1,T2,'Q2','support'),  // not relevant to T2
  ];
  const out=collectEvidence({rows,sources,priorHosts:new Set(['news-1.example.com'])});
  expect(out.excluded_private).toBe(1);
  expect(out.theses.map(t=>t.thesis_id)).toEqual([T1]);
  const t1=out.theses[0];
  expect(t1.support.map(e=>e.source_id)).toEqual([S1]);
  expect(t1.counter).toEqual([]);
  expect(t1.support[0]).toMatchObject({origin:'filing_or_regulator',host:'news-1.example.com',unfamiliar:false,source_version:'1'});
  expect(t1.support[0].judgment_ids).toHaveLength(3);
 });
 it('treats any-backend relevance, both directions, Q5 retelling, unfamiliar hosts and independent sources',()=>{
  const sources=[src(S1),src(S2,{url:'https://blog.unknown.org/x'}),src(S3,{cluster_id:'c',cluster_first:true}),src(S4,{url:'https://news-1.example.com/other'})];
  const rows=[
   row(S1,T1,'Q1','false'),row(S1,T1,'Q1','true','jev'),row(S1,T1,'Q2','support'),row(S1,T1,'Q2','trigger_invalidation','jev'),row(S1,T1,'Q3',null,'jev',true),row(S1,T1,'Q3','analyst_or_media'),
   ...relevant(S2,T1,'weaken'),row(S2,T1,'Q3','third_party_data','jev'),
   ...relevant(S3,T1,'support'),row(S3,T1,'Q5','true','llm_deepseek'), // cluster_first but judged as retelling of baseline → out
   ...relevant(S4,T1,'support'),row(S4,T1,'Q3','analyst_or_media'),
  ];
  const out=collectEvidence({rows,sources,priorHosts:new Set(['news-1.example.com'])});
  const t1=out.theses[0];
  expect(t1.support.map(e=>e.source_id).sort()).toEqual([S1,S4].sort());
  expect(t1.counter.map(e=>e.source_id).sort()).toEqual([S1,S2].sort());
  expect(t1.support.find(e=>e.source_id===S1)!.origin).toBe('analyst_or_media'); // jev abstained → rule answer
  expect(t1.counter.find(e=>e.source_id===S2)).toMatchObject({origin:'third_party_data',unfamiliar:true,host:'blog.unknown.org'});
  // S1 and S4 share (analyst_or_media, news-1.example.com) → one independent source; S2 is another.
  expect(t1.independent_sources).toBe(2);
  expect(t1.unfamiliar_hosts).toEqual(['blog.unknown.org']);
 });
 it('orders theses by evidence volume and returns nothing for an empty ledger',()=>{
  const sources=[src(S1),src(S2)];
  const rows=[...relevant(S1,T2,'support'),...relevant(S2,T2,'support'),...relevant(S1,T1,'support')];
  const out=collectEvidence({rows,sources,priorHosts:new Set()});
  expect(out.theses.map(t=>t.thesis_id)).toEqual([T2,T1]);
  expect(collectEvidence({rows:[],sources,priorHosts:new Set()}).theses).toEqual([]);
 });
});
