import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {makeMockCtx} from '../test-support';
import {buildWikiSourcePack,canonicalJson,computePackHash,packFromRows} from './source-pack';

const sha=(t:string)=>createHash('sha256').update(t,'utf8').digest('hex');
const E1='aaaaaaaa-0000-4000-8000-000000000001',E2='aaaaaaaa-0000-4000-8000-000000000002',E3='aaaaaaaa-0000-4000-8000-000000000003';
const S=(n:number)=>`bbbbbbbb-0000-4000-8000-${String(n).padStart(12,'0')}`;
// Raw table row (for the mock ctx) and the EntityKeysRow shape listEntityKeys returns (for packFromRows).
const key=(entity_id:string,in_scope=true,over:Record<string,unknown>={})=>({entity_id,lei:null,usci:null,cninfo_org_id:null,cik:null,names_zh:['合成'],names_en:[`Co ${entity_id.slice(-1)}`],aliases:['alias'],home_market:'US',in_scope,cohort:'first',provenance:{},missing:['lei','usci','cninfo_org_id','cik'],updated_at:'2026-09-01T00:00:00Z',...over});
const keyRow=(entity_id:string,in_scope=true,lei:string|null=null)=>({entity_id,keys:{lei,usci:null,cninfo_org_id:null,cik:null},names_zh:['合成'],names_en:[`Co ${entity_id.slice(-1)}`],aliases:['alias'],home_market:'US',in_scope,cohort:'first',provenance:{},missing:(lei?['usci','cninfo_org_id','cik']:['lei','usci','cninfo_org_id','cik']) as any,updated_at:'2026-09-01T00:00:00Z'});
const sec=(id:string,entity_id:string,code:string,primary=true,valid_to:string|null=null)=>({id,entity_id,exchange_code:code,mic:'XNYS',isin:null,market:'US',security_type:'common',is_primary:primary,valid_from:'2020-01-01',valid_to,provenance:{}});
const src=(n:number,entity_ids:string[],over:Record<string,unknown>={})=>{const raw=`Filing ${n} text.`;return {id:S(n),source_type:'FILING',title:`Filing ${n}`,url:null,author:null,published_at:null,ingested_at:'2026-09-01T00:00:00.000Z',raw_text:raw,content_hash:sha(raw),trust_level:'HIGH',entity_ids,metadata:{},event_time:null,available_at:`2026-09-${String(n).padStart(2,'0')}T00:00:00.000Z`,source_version:'1',cluster_id:null,cluster_first:null,origin_type:null,market:'US',permission:'public',...over};};

describe('packFromRows',()=>{
 const entityKeys=[
  {...keyRow(E2),securities:[sec('s2',E2,'BBB')]},
  {...keyRow(E1,true,'5493001KJTIIGC8Y1R12'),securities:[sec('s1b',E1,'AAA.OLD',false,'2021-01-01'),sec('s1c',E1,'AAAX',false),sec('s1a',E1,'AAA')]},
  {...keyRow(E3,false),securities:[sec('s3',E3,'CCC')]},
 ];
 const rows=[
  src(3,[E1,E3]),
  src(1,[E1]),
  src(2,[E2],{permission:'private'}),
  src(4,[E2],{permission:'licensed'}),
  src(5,[E2],{metadata:{s4_controlled_copy:true}}),
  src(6,[E2],{source_type:'NOTE'}),
  src(7,[E2],{source_type:'MANUAL'}),
  src(8,[E2],{origin_type:'private_observation'}),
  src(9,[E3]),
  src(10,[E2],{content_hash:'0'.repeat(64)}),
  src(11,[E2],{available_at:new Date('2026-09-11T00:00:00Z')}),
 ];
 const built=()=>packFromRows({entityKeys,sources:rows,generated_at:'2026-09-26T12:00:00.000Z',producer_commit:'abcdef1'});

 it('keeps in-scope companies sorted by entity_id with current tickers, primary first',()=>{
  const {pack}=built();
  expect(pack.companies.map(c=>c.entity_id)).toEqual([E1,E2]);
  expect(pack.companies[0]).toMatchObject({lei:'5493001KJTIIGC8Y1R12',tickers:['AAA','AAAX'],names_en:['Co 1'],names_zh:['合成'],aliases:['alias'],home_market:'US',cohort:'first'});
  expect(pack.entity_table_version).toMatch(/^[0-9a-f]{64}$/);
 });

 it('keeps only public, non-controlled, non-owner sources bound to in-scope companies, sorted by available_at then id',()=>{
  const {pack,stats}=built();
  expect(pack.sources.map(s=>s.id)).toEqual([S(1),S(3),S(11)]);
  // Out-of-scope entity ids are trimmed; the in-scope binding survives.
  expect(pack.sources[1]!.entity_ids).toEqual([E1]);
  expect(pack.sources[2]!.available_at).toBe('2026-09-11T00:00:00.000Z');
  expect(pack.sources[0]).toMatchObject({source_version:'1',source_type:'FILING',trust_level:'HIGH',market:'US',content_hash:sha('Filing 1 text.'),raw_text:'Filing 1 text.'});
  expect(pack.sources.some(s=>'permission' in s || 'metadata' in s)).toBe(false);
  expect(stats).toEqual({companies:2,sources:3,skipped:{not_public:2,controlled_copy:1,owner_material:2,private_origin:1,no_in_scope_entity:1,content_hash_mismatch:1}});
 });

 it('produces a stable pack_hash independent of input order',()=>{
  const a=built().pack;
  const b=packFromRows({entityKeys:[...entityKeys].reverse(),sources:[...rows].reverse(),generated_at:'2026-09-26T12:00:00.000Z',producer_commit:'abcdef1'}).pack;
  expect(a.pack_hash).toBe(b.pack_hash);
  expect(a.pack_hash).toBe(computePackHash(a));
  expect(computePackHash({...a,producer_commit:'1234567'})).not.toBe(a.pack_hash);
  expect(canonicalJson({b:1,a:[{d:null,c:'x'}]})).toBe('{"a":[{"c":"x","d":null}],"b":1}');
 });

 it('matches the cross-repo golden hash pinned in Osborn-brain tests/wiki/source-pack.test.ts',()=>{
  expect(computePackHash({schema_name:'alpha-wiki-source-pack',schema_version:'1.0',generated_at:'2026-09-26T00:00:00.000Z',producer_commit:'abcdef1',entity_table_version:'0'.repeat(64),pack_hash:'ignored',
   companies:[{entity_id:E1,names_en:['Golden Co'],names_zh:['金'],aliases:[],home_market:'US',lei:null,tickers:['GLD'],cohort:'g'}],
   sources:[{id:S(1),source_version:'1',source_type:'FILING',origin_type:null,title:'T',url:null,author:null,published_at:null,event_time:null,available_at:'2026-09-01T00:00:00.000Z',market:'US',trust_level:'HIGH',entity_ids:[E1],cluster_id:null,cluster_first:null,content_hash:'c'.repeat(64),raw_text:'héllo 世界 "q"'}]}))
   .toBe('132f65c918af34b7beb1c51dc46e3466d75f683455842b487965acbcf2421092');
 });
});

describe('buildWikiSourcePack',()=>{
 it('reads entity keys, securities and public sources through the ctx',async()=>{
  const {ctx}=makeMockCtx({
   research_entity_keys:[key(E1),key(E3,false)],
   research_entity_securities:[sec('s1',E1,'AAA'),sec('s3',E3,'CCC')],
   research_source_documents:[src(1,[E1]),src(2,[E1],{permission:'private'}),src(3,[E3])],
  });
  const {pack,stats}=await buildWikiSourcePack(ctx,{producerCommit:'abcdef1',now:()=>'2026-09-26T12:00:00.000Z'});
  expect(pack.schema_name).toBe('alpha-wiki-source-pack');
  expect(pack.companies.map(c=>c.entity_id)).toEqual([E1]);
  expect(pack.sources.map(s=>s.id)).toEqual([S(1)]);
  expect(stats.sources).toBe(1);
  expect(pack.generated_at).toBe('2026-09-26T12:00:00.000Z');
 });
});
