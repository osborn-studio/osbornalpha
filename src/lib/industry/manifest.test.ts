// src/lib/industry/manifest.test.ts
import {describe,it,expect} from 'vitest';
import {gzipSync} from 'node:zlib';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {FactRow,FilingRow,MetricRow} from '../facts/types';
import {canonicalJson,sha256Hex} from './canonical-json';
import type {AggregateCellResult} from './aggregate';
import {MANIFEST_BUCKET,buildAggregateManifest,decodeManifest,encodeManifest,gcManifests,isManifestObjectPath,memoryManifestStore,supabaseManifestStore} from './manifest';
import type {BuildManifestInput} from './manifest';
import {memoryIndustryDb} from './memory-industry-db';
import type {IndustryDb} from './types';

const I1='00000000-0000-4000-8000-000000000001',I2='00000000-0000-4000-8000-000000000002';
const fact=(id:string,issuer:string,concept:string,filing:string,o:Partial<FactRow>={}):FactRow=>({fact_id:id,issuer_id:issuer,market:'CN',filing_id:filing,run_id:'r',concept,source_concept:'income.revenue',statement:'IS',period_start:'2024-01-01',period_end:'2024-12-31',duration:'12M',value:'1000.50',value_text:'1000.50',unit:'CNY',consolidation:'consolidated',available_date:'2025-03-28',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:`raw-${id}`,created_at:'2025-03-29T00:00:00.000Z',is_current:true,...o});
const filing=(id:string,issuer:string,o:Partial<FilingRow>={}):FilingRow=>({filing_id:id,issuer_id:issuer,market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2024,fiscal_period:'FY',period_end:'2024-12-31',available_date:'2025-03-28',source_ref:`600001.SH:20241231:1:20250328`,url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2025-03-29T00:00:00.000Z',...o});
const derived:MetricRow={issuer_id:I1,market:'CN',metric:'q_single_revenue',period_start:'2024-10-01',period_end:'2024-12-31',duration:'3M',value:'300.25',unit:'CNY',input_unit:'CNY',basis:'cn_standard',formula_version:'facts-derive/1.0',
 inputs:[{fact_id:'f-12m',concept:'revenue',filing_id:'g1',available_date:'2025-03-28',ytd_rule:'never_revised',quarter:['2024-10-01','2024-12-31']},{fact_id:'f-9m',concept:'revenue',filing_id:'g0',available_date:'2024-10-30',ytd_rule:'never_revised',quarter:['2024-10-01','2024-12-31']}],based_on_rev:4,as_of:'2025-05-15'};
const result=():AggregateCellResult=>({
 cells:[{metric:'revenue_sum',duration:'3M',period_start:'2024-10-01',status:'ok',value_text:'300.25',n_members:2,n_with_data:1,n_unresolved:0,unit:'CNY'},{metric:'member_count',duration:'INSTANT',period_start:'2024-12-31',status:'ok',value_text:'2',n_members:2,n_with_data:2,n_unresolved:0,unit:'count'},{metric:'revenue_sum',duration:'12M',period_start:'2024-01-01',status:'missing',missing_reason:'empty_set',n_members:2,n_with_data:0,n_unresolved:0,unit:'CNY'}],
 roles:[{issuer_id:I2,metric:'revenue_sum',duration:'3M',role:'excluded',reason:'missing_concept'},{issuer_id:I1,metric:'revenue_sum',duration:'3M',role:'included'},{issuer_id:I1,metric:'member_count',duration:'INSTANT',role:'included'}],
 facts:[fact('f-9m',I1,'revenue','g0',{period_end:'2024-09-30',duration:'9M'}),fact('f-12m',I1,'revenue','g1'),fact('f-x',I2,'revenue','g-missing')],
 derived:[derived],warnings:['zz','aa','zz'],
});
const input=():BuildManifestInput=>({
 header:{scheme:'sw2021',version:'2021',code:'801120.SI',level:1,period_end:'2024-12-31',facts_as_of:'2025-05-15',knowledge_date:'2025-05-15',history_class:'reconstruction',method_version:'industry-agg/1.0',config_hash:'c'.repeat(64),formula_version:'facts-derive/1.0',code_version:'abc123'},
 members:[{issuer_id:I2,ticker:'000002.SZ',valid_from:'2021-12-13',valid_to:null,available_date:'2021-12-13',valid_to_available_date:null,source_membership_id:'s2',raw_hash:'r2',locator:{row:2},resolution_method:'today'},{issuer_id:I1,ticker:'600001.SH',valid_from:'2021-12-13',valid_to:null,available_date:'2021-12-13',valid_to_available_date:null,source_membership_id:'s1',raw_hash:'r1',locator:{row:1},resolution_method:'today'}],
 unresolved:[{ts_code:'600999.SH',in_date:'2022-01-01',out_date:null,source_membership_id:'u2'},{ts_code:'000999.SZ',in_date:'2021-12-13',out_date:'2023-01-01',source_membership_id:'u1'}],
 memberStateRevs:[{issuer_id:I2,state_rev:3},{issuer_id:I1,state_rev:4}],
 result:result(),
 filings:new Map([['g0',filing('g0',I1,{source_ref:'600001.SH:20240930:1:20241030',document_ref:'cninfo:123'})],['g1',filing('g1',I1)]]),
});
const fakeDb=()=>{const index=new Map<string,{kind:string;bytes:number;path:string}>();const calls:string[]=[];let k=0;
 const db:Pick<IndustryDb,'registerManifest'|'manifestObjectPath'|'manifestGcCandidates'|'deleteManifestIndex'>={
  async registerManifest(h,kind,bytes){calls.push(`register:${h.slice(0,8)}`);if(index.has(h))return false;index.set(h,{kind,bytes,path:`sha256/${h}/00000000-0000-4000-8000-${String(++k).padStart(12,'0')}.json.gz`});return true;},
  async manifestObjectPath(h){return index.get(h)?.path??null;},
  async manifestGcCandidates(limit){calls.push(`candidates:${limit}`);return [...index].slice(0,limit).map(([hash,v])=>({hash,objectPath:v.path,claim:`claim-${hash.slice(0,4)}`}));},
  async deleteManifestIndex(cs){calls.push(`delete:${cs.length}`);let n=0;for(const c of cs)if(index.delete(c.hash))n++;return n;},
 };return {db,index,calls};};

describe('buildAggregateManifest',()=>{
 it('sorts every array by its total order, keeps MetricRow.inputs verbatim and resolves source_ref/citation through the filings map',()=>{
  const m=buildAggregateManifest(input());
  expect(m).toMatchObject({schema:'industry-manifest/2',kind:'aggregate',scheme:'sw2021',version:'2021',code:'801120.SI',level:1,period_end:'2024-12-31',facts_as_of:'2025-05-15',knowledge_date:'2025-05-15',history_class:'reconstruction',code_version:'abc123'});
  expect(m.members.map(x=>x.issuer_id)).toEqual([I1,I2]);
  expect(m.unresolved.map(x=>x.ts_code)).toEqual(['000999.SZ','600999.SH']);
  expect(m.member_state_revs).toEqual([{issuer_id:I1,state_rev:4},{issuer_id:I2,state_rev:3}]);
  expect(m.facts.map(f=>f.fact_id)).toEqual(['f-9m','f-12m','f-x']);   // same issuer, concept and period_start: period_end decides
  expect(m.roles.map(r=>`${r.metric}:${r.duration}:${r.issuer_id===I1?1:2}`)).toEqual(['member_count:INSTANT:1','revenue_sum:3M:1','revenue_sum:3M:2']);
  expect(m.cells.map(c=>`${c.metric}:${c.duration}`)).toEqual(['member_count:INSTANT','revenue_sum:12M','revenue_sum:3M']);
  expect(m.derived[0].inputs).toEqual(derived.inputs);
  expect(m.derived[0]).not.toHaveProperty('based_on_rev');
  const f12=m.facts.find(f=>f.fact_id==='f-12m')!,f9=m.facts.find(f=>f.fact_id==='f-9m')!,fx=m.facts.find(f=>f.fact_id==='f-x')!;
  expect(f12).toMatchObject({value_text:'1000.5',source_ref:'600001.SH:20241231:1:20250328',citation:'pending',raw_hash:'raw-f-12m',mapping_gen:1,filing_id:'g1',available_date:'2025-03-28'});
  expect(f9).toMatchObject({citation:'linked',source_ref:'600001.SH:20240930:1:20241030'});
  expect(fx).toMatchObject({source_ref:null,citation:null});
  expect(m.warnings).toEqual(['aa','filing_not_found:g-missing','zz']);
 });
});

describe('buildAggregateManifest total orders and inputs',()=>{
 it('members tie-break on (issuer_id, valid_from, source_membership_id, ticker) regardless of input order',()=>{
  const base=input();const mk=(sm:string|null,t:string|null)=>({...base.members[0],issuer_id:I1,valid_from:'2021-12-13',source_membership_id:sm,ticker:t});
  const rows=[mk('s9','B'),mk('s1','Z'),mk('s1','A'),mk(null,'Q')];
  const a=buildAggregateManifest({...base,members:rows}).members.map(x=>`${x.source_membership_id}:${x.ticker}`);
  const b=buildAggregateManifest({...base,members:[...rows].reverse()}).members.map(x=>`${x.source_membership_id}:${x.ticker}`);
  expect(a).toEqual(['null:Q','s1:A','s1:Z','s9:B']);expect(b).toEqual(a);
 });
 it('rejects a duplicate issuer_id in member_state_revs',()=>{
  expect(()=>buildAggregateManifest({...input(),memberStateRevs:[{issuer_id:I1,state_rev:1},{issuer_id:I1,state_rev:2}]})).toThrow(`duplicate_member_state_rev:${I1}`);
 });
 it("maps a filing from source 'edgar' to citation 'edgar'",()=>{
  const base=input();
  const m=buildAggregateManifest({...base,filings:new Map([['g0',filing('g0',I1,{source:'edgar'})],['g1',filing('g1',I1)]])});
  expect(m.facts.find(f=>f.fact_id==='f-9m')!.citation).toBe('edgar');
 });
});

describe('encode / decode / stores / gc',()=>{
 it('encodes canonical JSON, hashes the uncompressed bytes, and decodes only matching canonical content',()=>{
  const m=buildAggregateManifest(input());
  const e=encodeManifest(m);
  expect(e.canonical).toBe(canonicalJson(m));
  expect(e.hash).toBe(sha256Hex(e.canonical));
  expect(decodeManifest(e.gzip,e.hash)).toEqual(m);
  expect(()=>decodeManifest(e.gzip,'0'.repeat(64))).toThrow('manifest_hash_mismatch');
  expect(()=>decodeManifest(new Uint8Array(gzipSync(Buffer.from(JSON.stringify(m,null,1)))))).toThrow('manifest_not_canonical');
  expect(()=>decodeManifest(new Uint8Array(gzipSync(Buffer.from(canonicalJson({...m,schema:'x'})))))).toThrow('unsupported_manifest');
  expect(isManifestObjectPath(`sha256/${e.hash}/00000000-0000-4000-8000-000000000001.json.gz`,e.hash)).toBe(true);
  expect(isManifestObjectPath(`sha256/${e.hash}.json.gz`,e.hash)).toBe(false);
 });
 it('memory store: put is idempotent and registers the index row; get verifies; non-canonical input is refused',async()=>{
  const {db,index}=fakeDb();
  const store=memoryManifestStore(db);
  const e=encodeManifest(buildAggregateManifest(input()));
  expect(await store.put('aggregate',e.canonical)).toEqual({hash:e.hash,existed:false});
  expect(await store.put('aggregate',e.canonical)).toEqual({hash:e.hash,existed:true});
  expect(index.get(e.hash)).toMatchObject({kind:'aggregate',bytes:store.objects.get(index.get(e.hash)!.path)!.byteLength});
  expect(await store.get(e.hash)).toEqual(JSON.parse(e.canonical));
  await expect(store.put('aggregate',JSON.stringify(JSON.parse(e.canonical),null,2))).rejects.toThrow('manifest_not_canonical');
  await expect(store.get('f'.repeat(64))).rejects.toThrow('manifest_not_found');
  await expect(store.get('../x')).rejects.toThrow('invalid_manifest_hash');
  store.objects.delete(index.get(e.hash)!.path);   // index row present, object gone
  await expect(store.get(e.hash)).rejects.toThrow('manifest_not_found');
 });
 it('supabase store: registers FIRST, then uploads gzip at the incarnation path with upsert:false; 409 = existed; other errors fail',async()=>{
  const {db,calls,index}=fakeDb();
  const objects=new Map<string,Uint8Array>();const ops:string[]=[];let failUpload:string|null=null;let failRemove=false;
  const client={storage:{from:(b:string)=>{expect(b).toBe(MANIFEST_BUCKET);return {
   async upload(path:string,body:Uint8Array,o:{contentType:string;upsert:boolean}){ops.push(`upload:${path.slice(0,15)}:${o.contentType}:${o.upsert}`);calls.push('upload');
    if(failUpload)return {error:{message:failUpload,statusCode:'500'}};if(objects.has(path))return {error:{message:'The resource already exists',statusCode:'409'}};objects.set(path,body);return {error:null};},
   async download(path:string){const b=objects.get(path);return b?{data:new Blob([Buffer.from(b)]),error:null}:{data:null,error:{message:'not found'}};},
   async remove(paths:string[]){ops.push(`remove:${paths.length}`);if(failRemove)return {data:null,error:{message:'boom'}};for(const p of paths)objects.delete(p);return {data:[],error:null};},
  };}}} as unknown as SupabaseClient;
  const store=supabaseManifestStore(client,db);
  const e=encodeManifest(buildAggregateManifest(input()));
  expect(await store.put('aggregate',e.canonical)).toEqual({hash:e.hash,existed:false});
  expect(calls.slice(0,2)).toEqual([`register:${e.hash.slice(0,8)}`,'upload']);
  expect(ops[0]).toBe('upload:sha256/'+e.hash.slice(0,8)+':application/gzip:false');
  expect(objects.has(index.get(e.hash)!.path)).toBe(true);
  expect(await store.put('aggregate',e.canonical)).toEqual({hash:e.hash,existed:true});
  expect(await store.get(e.hash)).toEqual(JSON.parse(e.canonical));
  failUpload='quota';
  const other=encodeManifest({...buildAggregateManifest(input()),code:'801780.SI'});
  await expect(store.put('aggregate',other.canonical)).rejects.toThrow('manifest_upload_failed:quota');
  const obj={hash:e.hash,objectPath:index.get(e.hash)!.path};
  failRemove=true;
  expect(await store.remove([obj])).toEqual({removed:[],failed:[e.hash]});
  failRemove=false;
  expect(await store.remove([obj])).toEqual({removed:[e.hash],failed:[]});
  await expect(store.get(e.hash)).rejects.toThrow('manifest_not_found');
 });
 it('gcManifests: candidates → bucket remove → index delete; failed removals keep their index rows',async()=>{
  const {db,index,calls}=fakeDb();
  const store=memoryManifestStore(db);
  const a=encodeManifest(buildAggregateManifest(input())),b=encodeManifest({...buildAggregateManifest(input()),code:'801780.SI'});
  await store.put('aggregate',a.canonical);await store.put('aggregate',b.canonical);
  const failing={...store,async remove(os:{hash:string;objectPath:string}[]){const r=await store.remove(os.filter(o=>o.hash!==b.hash));return {removed:r.removed,failed:os.filter(o=>o.hash===b.hash).map(o=>o.hash)};}};
  const pathA=index.get(a.hash)!.path;
  calls.length=0;
  const r=await gcManifests({db,manifests:failing},10);
  expect(r).toEqual({candidates:2,removed:[a.hash],failed:[b.hash],deleted:1});
  expect(calls).toEqual(['candidates:10','delete:1']);
  expect([...index.keys()]).toEqual([b.hash]);
  expect(store.objects.has(pathA)).toBe(false);
  expect(await gcManifests({db,manifests:store},10)).toEqual({candidates:1,removed:[b.hash],failed:[],deleted:1});
  expect(await gcManifests({db,manifests:store},10)).toEqual({candidates:0,removed:[],failed:[],deleted:0});
  await expect(gcManifests({db,manifests:store},0)).rejects.toThrow('invalid_limit');
 });
 it('GC race on memoryIndustryDb (Codex round 1 #4): a hash claimed by GC cannot be re-put before deletion; afterwards a put registers anew and re-uploads',async()=>{
  const mdb=memoryIndustryDb();const store=memoryManifestStore(mdb);
  const e=encodeManifest(buildAggregateManifest(input()));
  mdb.setNow('2026-11-01T00:00:00.000Z');
  await store.put('aggregate',e.canonical);
  mdb.setNow('2026-11-03T00:00:00.000Z');
  const claims=await mdb.manifestGcCandidates(10);
  expect(claims.map(c=>c.hash)).toEqual([e.hash]);                                                    // selected = claimed
  await expect(store.put('aggregate',e.canonical)).rejects.toMatchObject({code:'manifest_gc_in_progress'});   // refused before any upload
  expect(await gcManifests({db:{manifestGcCandidates:async()=>claims,deleteManifestIndex:c=>mdb.deleteManifestIndex(c)},manifests:store},10)).toEqual({candidates:1,removed:[e.hash],failed:[],deleted:1});
  expect(store.objects.has(claims[0].objectPath)).toBe(false);
  expect(await store.put('aggregate',e.canonical)).toEqual({hash:e.hash,existed:false});
  expect(await store.get(e.hash)).toEqual(JSON.parse(e.canonical));
 });
 it('stale collector after a reclaim (Codex round 2 R2-1): reclaim → delete → re-upload → the old collector deletes; the new incarnation survives',async()=>{
  const mdb=memoryIndustryDb();const store=memoryManifestStore(mdb);
  const e=encodeManifest(buildAggregateManifest(input()));
  mdb.setNow('2026-11-01T00:00:00.000Z');
  await store.put('aggregate',e.canonical);
  mdb.setNow('2026-11-03T00:00:00.000Z');
  const a=await mdb.manifestGcCandidates(10);                    // collector A claims, then pauses before its storage delete
  mdb.setNow('2026-11-03T02:00:00.000Z');
  const b=await mdb.manifestGcCandidates(10);                    // A's claim is stale (> 1 h): collector B reclaims
  expect(b.map(c=>c.hash)).toEqual([e.hash]);expect(b[0].claim).not.toBe(a[0].claim);
  expect(await gcManifests({db:{manifestGcCandidates:async()=>b,deleteManifestIndex:c=>mdb.deleteManifestIndex(c)},manifests:store},10)).toMatchObject({deleted:1});
  await store.put('aggregate',e.canonical);                     // a writer registers and re-uploads: a NEW incarnation path
  const fresh=(await mdb.manifestObjectPath(e.hash))!;
  expect(fresh).not.toBe(a[0].objectPath);
  // collector A resumes: it can only delete the incarnation it claimed, and its index delete is fenced by its token
  expect(await gcManifests({db:{manifestGcCandidates:async()=>a,deleteManifestIndex:c=>mdb.deleteManifestIndex(c)},manifests:store},10)).toEqual({candidates:1,removed:[e.hash],failed:[],deleted:0});
  expect(store.objects.has(fresh)).toBe(true);
  expect(await store.get(e.hash)).toEqual(JSON.parse(e.canonical));
 });
});
