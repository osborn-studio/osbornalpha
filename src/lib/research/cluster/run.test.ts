import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {makeMockCtx} from '../test-support';
import type {ResearchCtx} from '../store';
import {runAlign,runCluster} from './run';

const at=(s:number)=>new Date(Date.UTC(2026,8,20,0,0,s)).toISOString();
const src=(i:number,over:Record<string,unknown>={}):Record<string,unknown>=>({id:randomUUID(),source_type:'NEWS',title:`title ${i}`,url:null,author:null,published_at:null,ingested_at:at(i),available_at:at(i),raw_text:`body ${i}`,content_hash:'h'+i,trust_level:'MEDIUM',entity_ids:[],metadata:{},permission:'public',cluster_id:null,cluster_first:null,...over});
const mk=(seed:Record<string,Record<string,unknown>[]>)=>{const m=makeMockCtx(seed);return {ctx:m.ctx as unknown as ResearchCtx,store:m.store};};

describe('runCluster',()=>{
 it('writes cluster ids for duplicates and singletons, audits, and is idempotent',async()=>{
  const a=src(1,{url:'https://www.sec.gov/x?utm_source=a'}),b=src(2,{url:'https://sec.gov/x'}),c=src(3,{url:'https://example.com/other'});
  const {ctx,store}=mk({research_source_documents:[a,b,c]});
  const first=await runCluster(ctx,{});
  expect(first).toMatchObject({scanned:3,fresh:3,written:3,clusters:2});
  const rows=store.rows('research_source_documents');
  const ra=rows.find(r=>r.id===a.id)!,rb=rows.find(r=>r.id===b.id)!,rc=rows.find(r=>r.id===c.id)!;
  expect(ra.cluster_id).toBe(rb.cluster_id);expect(ra.cluster_first).toBe(true);expect(rb.cluster_first).toBe(false);
  expect(rc.cluster_id).not.toBeNull();expect(rc.cluster_id).not.toBe(ra.cluster_id);expect(rc.cluster_first).toBe(true);
  expect(store.rows('research_audit_log').filter(r=>r.action==='cluster.run')).toHaveLength(1);
  const second=await runCluster(ctx,{});
  expect(second).toMatchObject({scanned:3,fresh:0,written:0,clusters:0});
 });
 it('joins a new source to an existing cluster and demotes the old first when the newcomer is earlier',async()=>{
  const a=src(5,{url:'https://a.test/p'});
  const {ctx,store}=mk({research_source_documents:[a]});
  await runCluster(ctx,{});
  const cid=store.rows('research_source_documents')[0].cluster_id as string;
  const early=src(1,{url:'https://a.test/p?fbclid=1'});
  store.seed('research_source_documents',[{user_id:ctx.userId,...early}]);
  const out=await runCluster(ctx,{});
  expect(out.written).toBe(2);
  const rows=store.rows('research_source_documents');
  expect(rows.find(r=>r.id===early.id)).toMatchObject({cluster_id:cid,cluster_first:true});
  expect(rows.find(r=>r.id===a.id)).toMatchObject({cluster_id:cid,cluster_first:false});
 });
});

describe('runCluster with a --since window',()=>{
 it('keeps the original first member when the window excludes it, and still matches new duplicates against old clusters',async()=>{
  const a=src(1,{url:'https://a.test/p'}),b=src(2,{url:'https://a.test/p?utm_source=x'});
  const {ctx,store}=mk({research_source_documents:[a,b]});
  await runCluster(ctx,{});
  const rows=()=>store.rows('research_source_documents');
  const cid=rows().find(r=>r.id===a.id)!.cluster_id as string;
  // Window holds only b: nothing fresh, so nothing is written and b is not promoted.
  expect(await runCluster(ctx,{since:at(2)})).toMatchObject({scanned:1,fresh:0,written:0});
  expect(rows().find(r=>r.id===b.id)).toMatchObject({cluster_id:cid,cluster_first:false});
  // A later duplicate inside the window joins the old cluster as a non-first member.
  const c=src(9,{url:'https://www.a.test/p'});
  store.seed('research_source_documents',[{user_id:ctx.userId,...c}]);
  expect(await runCluster(ctx,{since:at(5)})).toMatchObject({scanned:1,fresh:1,written:1,clusters:1});
  expect(rows().find(r=>r.id===c.id)).toMatchObject({cluster_id:cid,cluster_first:false});
  expect(rows().find(r=>r.id===a.id)).toMatchObject({cluster_id:cid,cluster_first:true});
 });
});

describe('runAlign',()=>{
 const ent=(name:string,aliases:string[],ticker:string|null=null)=>({id:randomUUID(),type:'COMPANY',name,aliases,ticker});
 it('aligns single-candidate sources, queues multi-candidate ones, merges entity_ids, audits, and is idempotent',async()=>{
  const hs=ent('Hundsun Technologies',['恒生电子'],'600570.SH'),th=ent('Hithink RoyalFlush',['同花顺']);
  const one=src(1,{title:'恒生电子发布公告',raw_text:'恒生电子今日公告。',entity_ids:['pre-existing']});
  const two=src(2,{title:'金融IT板块',raw_text:'恒生电子与同花顺双双上涨。'});
  const none=src(3,{title:'unrelated',raw_text:'nothing here'});
  const {ctx,store}=mk({research_entities:[hs,th],research_source_documents:[one,two,none]});
  const out=await runAlign(ctx,{});
  expect(out).toMatchObject({scanned:3,sources_aligned:1,sources_ambiguous:1,rows_written:3,entity_ids_merged:1});
  const al=store.rows('research_source_entity_alignments');
  expect(al.filter(r=>r.source_id===one.id)).toMatchObject([{entity_id:hs.id,status:'aligned',method:'rule',decided_by:'rule'}]);
  expect(al.filter(r=>r.source_id===two.id).map(r=>r.status)).toEqual(['ambiguous','ambiguous']);
  const rows=store.rows('research_source_documents');
  expect(rows.find(r=>r.id===one.id)!.entity_ids).toEqual(['pre-existing',hs.id]);
  expect(rows.find(r=>r.id===two.id)!.entity_ids).toEqual([]);
  expect(store.rows('research_audit_log').filter(r=>r.action==='align.run')).toHaveLength(1);
  expect(await runAlign(ctx,{})).toMatchObject({rows_written:0,entity_ids_merged:0});
 });
 it('never overwrites an existing decision: a human rejection blocks the rule from re-proposing the pair',async()=>{
  const hs=ent('Hundsun Technologies',['恒生电子']);
  const s=src(1,{raw_text:'恒生电子'});
  const {ctx,store}=mk({research_entities:[hs],research_source_documents:[s],research_source_entity_alignments:[{source_id:s.id,entity_id:hs.id,method:'human',status:'rejected',confidence:null,evidence:{},decided_at:at(0),decided_by:'owner'}]});
  const out=await runAlign(ctx,{});
  expect(out).toMatchObject({rows_written:0,entity_ids_merged:0});
  expect(store.rows('research_source_entity_alignments')).toHaveLength(1);
  expect(store.rows('research_source_documents')[0].entity_ids).toEqual([]);
 });
 it('reconciles entity_ids from an existing aligned row instead of skipping the source outright',async()=>{
  const hs=ent('Hundsun Technologies',['恒生电子']);
  const s=src(1,{raw_text:'恒生电子',entity_ids:[]});
  const {ctx,store}=mk({research_entities:[hs],research_source_documents:[s],research_source_entity_alignments:[{source_id:s.id,entity_id:hs.id,method:'rule',status:'aligned',confidence:0.8,evidence:{},decided_at:at(0),decided_by:'rule'}]});
  expect(await runAlign(ctx,{})).toMatchObject({rows_written:0,entity_ids_merged:1});
  expect(store.rows('research_source_documents')[0].entity_ids).toEqual([hs.id]);
 });
 it('records collector-provided entity_ids as aligned (method collector) and does not second-guess them with the text rule',async()=>{
  const hs=ent('Hundsun Technologies',['恒生电子']),th=ent('Hithink RoyalFlush',['同花顺']);
  const s=src(1,{raw_text:'恒生电子与同花顺双双上涨。',entity_ids:[hs.id,'not-a-known-entity']});
  const {ctx,store}=mk({research_entities:[hs,th],research_source_documents:[s]});
  expect(await runAlign(ctx,{})).toMatchObject({sources_aligned:1,sources_ambiguous:0,rows_written:1,entity_ids_merged:0});
  expect(store.rows('research_source_entity_alignments')).toMatchObject([{source_id:s.id,entity_id:hs.id,method:'collector',status:'aligned',confidence:1,decided_by:'collector'}]);
  expect(store.rows('research_source_documents')[0].entity_ids).toEqual([hs.id,'not-a-known-entity']);
 });
 it('matches A2 entity-key names and listing codes, not only the legacy entity row',async()=>{
  const hs=ent('Hundsun',[]);
  const s=src(1,{raw_text:'Hundsun Tech (600570.SH) reported results.'});
  const {ctx,store}=mk({research_entities:[hs],research_source_documents:[s],
   research_entity_keys:[{entity_id:hs.id,names_en:['Hundsun Technologies Inc.','Hundsun Tech'],names_zh:['恒生电子'],aliases:[],home_market:'A',in_scope:true,updated_at:at(0)}],
   research_entity_securities:[{id:randomUUID(),entity_id:hs.id,exchange_code:'600570.SH',market:'A',security_type:'common',is_primary:true,valid_from:'2003-12-16'}]});
  expect(await runAlign(ctx,{})).toMatchObject({sources_aligned:1,rows_written:1});
  expect(store.rows('research_source_entity_alignments')[0]).toMatchObject({entity_id:hs.id,status:'aligned',evidence:{hits:3}}); // "Hundsun", "Hundsun Tech" and "600570.SH" all hit
 });
});
