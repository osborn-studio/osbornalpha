// src/lib/company/evidence-index.test.ts
import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {decodeCompanyFacts,parseCompanyFacts} from '@/lib/facts/providers/edgar-companyfacts';
import {parseTushareStatements} from '@/lib/facts/providers/tushare-statements';
import {SYNTHETIC_DIR,loadTushareFixtures} from '@/lib/facts/providers/tushare-fixtures';
import {budgetFor,snapshotOf} from '@/lib/facts/providers/shared';
import {memorySnapshotStore,metaPath,snapshotPath} from '@/lib/facts/snapshot-store';
import type {FactCandidate,FactRow,RawSnapshot} from '@/lib/facts/types';
import {buildEvidenceIndex,edgarPointer,memorySnapshotObjectStore,resolvePointer,supabaseSnapshotObjectStore,tusharePointer} from './evidence-index';
import type {ParsedSnapshot,ParsedSnapshotCache,ResolvedCandidate,SnapshotObjectStore} from './evidence-index';
import {ISSUER,factRow,filingSummary,resetBuilders} from './test-builders';
import {EVIDENCE_INDEX_VERSION} from './types';
import type {FilingSummary} from './types';

type Located=FactCandidate&{locator:string};
const AAPL=new Uint8Array(readFileSync(new URL('../facts/fixtures/edgar/CIK0000320193.trimmed.json',import.meta.url)));
const budget=()=>budgetFor(60_000);
async function stored(snaps:RawSnapshot[],source:'edgar'|'tushare'){
 const store=memorySnapshotStore();
 for(const s of snaps)await store.put(s,snapshotPath(source,ISSUER,s.sha256),budget());
 return store;
}
/** Fact rows exactly as sync would store them from these candidates. */
function factsFrom(cands:Located[],market:'US'|'CN',source:'edgar'|'tushare'){
 const filings=new Map<string,FilingSummary>();
 const rows:FactRow[]=cands.map(c=>{
  let f=filings.get(c.filingRef);
  if(!f){f=filingSummary({sourceRef:c.filingRef,source,citation:source==='edgar'?'edgar':'pending'});filings.set(c.filingRef,f);}
  return factRow(f,{market,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,duration:c.duration,unit:c.unit,value:c.value,raw_hash:c.rawHash});
 });
 return {rows,filings:[...filings.values()]};
}
beforeEach(()=>resetBuilders());

describe('json pointers',()=>{
 it('EDGAR locator → escaped pointer; Tushare locator → row pointer + field',()=>{
  expect(edgarPointer('facts.us-gaap.EarningsPerShareBasic.units.USD/shares[12](accn=x,start=2023-01-01,end=2023-12-31)')).toBe('/facts/us-gaap/EarningsPerShareBasic/units/USD~1shares/12');
  expect(edgarPointer('facts.dei.EntityCommonStockSharesOutstanding.units.shares[0](accn=x,start=,end=2024-01-01)')).toBe('/facts/dei/EntityCommonStockSharesOutstanding/units/shares/0');
  expect(edgarPointer('garbage')).toBeNull();
  expect(tusharePointer('income:rt1:p1[end_date=20231231,ann=20240403,update_flag=1,row=0]','income.sell_exp+admin_exp')).toEqual({pointer:'/data/items/0',field:'sell_exp+admin_exp'});
  expect(tusharePointer('income:rt1:p1[end_date=20231231,ann=20240403,update_flag=1,row=17]','income.total_revenue')).toEqual({pointer:'/data/items/17',field:'total_revenue'});
  expect(tusharePointer('nope','income.total_revenue')).toBeNull();
  expect(resolvePointer({a:{'b/c':[1,{d:2}]}},'/a/b~1c/1/d')).toBe(2);
  expect(resolvePointer({a:[1]},'/a/5')).toBeUndefined();
 });
});

describe('buildEvidenceIndex — EDGAR',()=>{
 const snap=snapshotOf(AAPL,{source:'edgar',url:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',fetched_at:'2026-11-05T05:15:53.573Z'});
 const parsed=parseCompanyFacts(snap,{sinceYear:2019});
 const cands=parsed.candidates as Located[];
 it('indexes every matching ok fact with the parser locator, an escaped pointer that resolves to the value, and sidecar provenance',async()=>{
  const store=await stored([snap],'edgar');
  const pick=[...cands.slice(0,40),...cands.filter(c=>c.unit==='USD/share').slice(0,3)];
  const {rows,filings}=factsFrom(pick,'US','edgar');
  const res=await buildEvidenceIndex({reader:memorySnapshotObjectStore(store.objects)},{issuerId:ISSUER,market:'US',rows,filings});
  expect(res.rows).toHaveLength(rows.length);
  expect(res.stats).toMatchObject({objects:1,facts:rows.length,indexed:rows.length,unmatched:0,multiMatch:0,valueMismatch:0,pointerUnresolved:0});
  const doc=decodeCompanyFacts(AAPL);
  for(const r of res.rows){
   const fact=rows.find(x=>x.fact_id===r.fact_id)!;
   const cand=pick.find(c=>c.rawHash===fact.raw_hash)!;
   expect(r).toMatchObject({raw_hash:fact.raw_hash,snapshot_sha256:snap.sha256,snapshot_path:snapshotPath('edgar',ISSUER,snap.sha256),hash_locator:cand.locator,field:null,source:'edgar',url:snap.meta.url,captured_at:'2026-11-05T05:15:53.573Z',http_status:200,index_version:EVIDENCE_INDEX_VERSION});
   expect((resolvePointer(doc,r.json_pointer) as {val:string}).val).toBe(fact.value_text);
  }
  expect(res.rows.some(r=>r.json_pointer.includes('/units/USD~1shares/'))).toBe(true);
  expect(res.rows.map(r=>r.fact_id)).toEqual([...res.rows.map(r=>r.fact_id)].sort());
 });
 it('never guesses: wrong value, wrong filing, foreign raw_hash, other concept, non-ok status → no row',async()=>{
  const store=await stored([snap],'edgar');
  const {rows,filings}=factsFrom(cands.slice(0,5),'US','edgar');
  const other=filingSummary({sourceRef:'0000000000-00-000000'});
  const bad=[{...rows[0],value:'1',value_text:'1'},{...rows[1],filing_id:other.filingId},{...rows[2],raw_hash:'f'.repeat(64)},{...rows[3],concept:'cost_of_revenue'},{...rows[4],status:'quarantined' as const}];
  const res=await buildEvidenceIndex({reader:memorySnapshotObjectStore(store.objects)},{issuerId:ISSUER,market:'US',rows:bad,filings:[...filings,other]});
  expect(res.rows).toEqual([]);
  expect(res.stats).toMatchObject({facts:4,valueMismatch:1,unmatched:3});
 });
 it('object faults: tampered bytes, missing sidecar, unparseable bytes, wrong source → no rows; other issuers\' objects are not read',async()=>{
  const store=await stored([snap],'edgar');
  const {rows,filings}=factsFrom(cands.slice(0,3),'US','edgar');
  const path=snapshotPath('edgar',ISSUER,snap.sha256);
  const tampered=new Map(store.objects);tampered.set(path,new TextEncoder().encode('{"cik":1,"facts":{}}'));
  expect((await buildEvidenceIndex({reader:memorySnapshotObjectStore(tampered)},{issuerId:ISSUER,market:'US',rows,filings})).stats).toMatchObject({hashMismatch:1,indexed:0});
  const noMeta=new Map(store.objects);noMeta.delete(metaPath(path));
  expect((await buildEvidenceIndex({reader:memorySnapshotObjectStore(noMeta)},{issuerId:ISSUER,market:'US',rows,filings})).stats).toMatchObject({missingSidecar:1,indexed:0});
  const junk=snapshotOf(new TextEncoder().encode('{"not":"companyfacts"}'),{source:'edgar'});
  const junkStore=await stored([junk],'edgar');
  expect((await buildEvidenceIndex({reader:memorySnapshotObjectStore(junkStore.objects)},{issuerId:ISSUER,market:'US',rows,filings})).stats).toMatchObject({parseFailed:1,indexed:0});
  const wrongSource=new Map(store.objects);wrongSource.set(metaPath(path),JSON.stringify({...snap.meta,source:'tushare',sha256:snap.sha256}));
  expect((await buildEvidenceIndex({reader:memorySnapshotObjectStore(wrongSource)},{issuerId:ISSUER,market:'US',rows,filings})).stats).toMatchObject({hashMismatch:1,indexed:0});
  const elsewhere=new Map<string,string|Uint8Array>();for(const [k,v] of store.objects)elsewhere.set(k.replace(ISSUER,'22222222-2222-4222-8222-222222222222'),v);
  expect((await buildEvidenceIndex({reader:memorySnapshotObjectStore(elsewhere)},{issuerId:ISSUER,market:'US',rows,filings})).stats).toMatchObject({objects:0,indexed:0,unmatched:3});
 });
 it('a cache shared across calls (stale retry) avoids re-downloading',async()=>{
  const store=await stored([snap],'edgar');
  const reader=memorySnapshotObjectStore(store.objects);const get=vi.spyOn(reader,'get');
  const {rows,filings}=factsFrom(cands.slice(0,3),'US','edgar');
  const cache=new Map();
  const a=await buildEvidenceIndex({reader},{issuerId:ISSUER,market:'US',rows,filings,cache});
  const b=await buildEvidenceIndex({reader},{issuerId:ISSUER,market:'US',rows,filings,cache});
  expect(get).toHaveBeenCalledTimes(1);expect(b.rows).toEqual(a.rows);
 });
});

describe('buildEvidenceIndex — Tushare (synthetic 600519.SH)',()=>{
 const snaps=loadTushareFixtures('600519.SH',SYNTHETIC_DIR);
 const cands=snaps.flatMap(s=>{const p=parseTushareStatements([s],{sinceYear:2000});return [...p.candidates,...p.ambiguous.flatMap(a=>a.candidates),...p.oddDuration] as Located[];});
 it('indexes per-snapshot candidates; row pointer + field (sum concepts a+b); one raw_hash shared by several concepts still matches each concept only once',async()=>{
  const store=await stored(snaps,'tushare');
  const {rows,filings}=factsFrom(cands,'CN','tushare');
  const res=await buildEvidenceIndex({reader:memorySnapshotObjectStore(store.objects)},{issuerId:ISSUER,market:'CN',rows,filings});
  expect(res.stats).toMatchObject({objects:snaps.length,indexed:rows.length,multiMatch:0,valueMismatch:0,pointerUnresolved:0});
  for(const r of res.rows){expect(r.json_pointer).toMatch(/^\/data\/items\/\d+$/);expect(r.source).toBe('tushare');expect(r.api).toMatch(/^(income|balancesheet|cashflow)$/);expect(JSON.stringify(r.params??{})).not.toMatch(/token/i);}
  const sga=res.rows.find(r=>rows.find(x=>x.fact_id===r.fact_id)!.concept==='sga_expense');
  expect(sga?.field).toBe('sell_exp+admin_exp');
  const byHash=new Map<string,number>();for(const x of rows)byHash.set(x.raw_hash,(byHash.get(x.raw_hash)??0)+1);
  expect([...byHash.values()].some(n=>n>1)).toBe(true);   // the shared-raw_hash case is exercised
 });
 it('swapping the concept of a shared-raw_hash row does not match (full key, not hash alone)',async()=>{
  const store=await stored(snaps,'tushare');
  const {rows,filings}=factsFrom(cands.filter(c=>c.concept==='revenue').slice(0,1),'CN','tushare');
  const swapped=[{...rows[0],concept:'revenue_operating'}];
  const res=await buildEvidenceIndex({reader:memorySnapshotObjectStore(store.objects)},{issuerId:ISSUER,market:'CN',rows:swapped,filings});
  expect(res.rows).toEqual([]);expect(res.stats.unmatched).toBe(1);
 });
});

describe('rows satisfy company_evidence_check constraints',()=>{
 it('scrubs token keys at any depth and nulls a captured_at without a zone',async()=>{
  const snap=snapshotOf(AAPL,{source:'edgar',url:'https://data.sec.gov/x.json',fetched_at:'2026-11-05 05:15:53',params:{a:1,Token:'t',nested:{api_key:'k',deep:[{secret:'s',ok:2}],keep:3}}});
  const cs=parseCompanyFacts(snap,{sinceYear:2019}).candidates as Located[];
  const store=await stored([snap],'edgar');
  const {rows,filings}=factsFrom(cs.slice(0,2),'US','edgar');
  const res=await buildEvidenceIndex({reader:memorySnapshotObjectStore(store.objects)},{issuerId:ISSUER,market:'US',rows,filings});
  expect(res.rows).toHaveLength(2);
  for(const r of res.rows){
   expect(r.params).toEqual({a:1,nested:{deep:[{ok:2}],keep:3}});
   expect(r.captured_at).toBeNull();
  }
 });
});

describe('buildEvidenceIndex — fault accounting',()=>{
 const SHA='d'.repeat(64);const PATH=`edgar/${ISSUER}/${SHA}.json`;
 const cand=(o:Partial<ResolvedCandidate>={}):ResolvedCandidate=>({concept:'revenue',sourceConcept:'us-gaap.Revenues',filingRef:'ref-1',periodStart:'2023-01-01',periodEnd:'2023-12-31',unit:'USD',value:'100',locator:'L',pointer:'/facts/x',field:null,resolved:'100',...o});
 function seeded(c:ResolvedCandidate[],extra:string[]=[]){
  const mk=(path:string):ParsedSnapshot=>({path,sha256:path.slice(-69,-5),meta:{source:'edgar',fetched_at:'2026-11-05T00:00:00Z',http_status:200},byHash:new Map([['H',c]])});
  const cache:ParsedSnapshotCache=new Map([[PATH,mk(PATH)],...extra.map(e=>[e,mk(e)] as [string,ParsedSnapshot])]);
  const objects=new Map<string,string>([[PATH,'x'],...extra.map(e=>[e,'x'] as [string,string])]);
  const f=filingSummary({sourceRef:'ref-1',source:'edgar'});
  const fact=factRow(f,{raw_hash:'H',concept:'revenue',source_concept:'us-gaap.Revenues',period_start:'2023-01-01',period_end:'2023-12-31',unit:'USD',value:'100',});
  return {cache,reader:memorySnapshotObjectStore(objects),f,fact};
 }
 const run=(x:ReturnType<typeof seeded>,filings=[x.f],rows=[x.fact])=>buildEvidenceIndex({reader:x.reader},{issuerId:ISSUER,market:'US',rows,filings,cache:x.cache});
 it('baseline seeded row is indexed',async()=>{const x=seeded([cand()]);expect((await run(x)).stats).toMatchObject({indexed:1});});
 it('multiMatch: the same full key in two snapshots writes no row',async()=>{
  const x=seeded([cand()],[`edgar/${ISSUER}/${'e'.repeat(64)}.json`]);
  const r=await run(x);expect(r.rows).toEqual([]);expect(r.stats).toMatchObject({multiMatch:1,indexed:0});
 });
 it('pointerUnresolved: re-resolved value differs / pointer missing',async()=>{
  for(const c of [cand({resolved:'999'}),cand({resolved:null}),cand({pointer:null})]){
   const r=await run(seeded([c]));expect(r.rows).toEqual([]);expect(r.stats).toMatchObject({pointerUnresolved:1});
  }
 });
 it('valueMismatch when the parser value differs from the fact',async()=>{const r=await run(seeded([cand({value:'1'})]));expect(r.stats).toMatchObject({valueMismatch:1,indexed:0});});
 it('filing of another source is unmatched, never indexed',async()=>{
  const x=seeded([cand()]);const other={...x.f,source:'tushare' as const};
  const r=await run(x,[other]);expect(r.rows).toEqual([]);expect(r.stats).toMatchObject({unmatched:1});
 });
 it('missingObject (listed but absent) and storageError (reader throws) are counted apart',async()=>{
  const base:SnapshotObjectStore=memorySnapshotObjectStore(new Map([[PATH,'x']]));
  const x=seeded([cand()]);
  const absent=await buildEvidenceIndex({reader:{...base,get:async()=>null}},{issuerId:ISSUER,market:'US',rows:[x.fact],filings:[x.f]});
  expect(absent.stats).toMatchObject({objects:1,missingObject:1,storageError:0,indexed:0});
  const broken=await buildEvidenceIndex({reader:{...base,get:async()=>{throw new Error('snapshot_download_failed');}}},{issuerId:ISSUER,market:'US',rows:[x.fact],filings:[x.f]});
  expect(broken.stats).toMatchObject({missingObject:0,storageError:1,indexed:0});
 });
 it('Tushare ambiguous candidates are indexed (the synthetic set has one)',async()=>{
  const snaps=loadTushareFixtures('600519.SH',SYNTHETIC_DIR);
  const amb=snaps.flatMap(s=>parseTushareStatements([s],{sinceYear:2000}).ambiguous.flatMap(a=>a.candidates)) as Located[];
  expect(amb.length).toBeGreaterThan(0);
  const store=await stored(snaps,'tushare');
  const {rows,filings}=factsFrom(amb,'CN','tushare');
  const res=await buildEvidenceIndex({reader:memorySnapshotObjectStore(store.objects)},{issuerId:ISSUER,market:'CN',rows,filings});
  expect(res.stats).toMatchObject({indexed:rows.length});
 });
});

describe('supabaseSnapshotObjectStore',()=>{
 const name=(i:number)=>`${i.toString(16).padStart(64,'0')}.json`;
 function fake(pages:{data:{name:string}[]|null;error:{message:string;statusCode?:string}|null}[],downloads:Record<string,{data:Blob|null;error:{message:string;statusCode?:string}|null}>={}){
  const list=vi.fn(async()=>pages.shift()??{data:[],error:null});
  const download=vi.fn(async(p:string)=>downloads[p]??{data:null,error:{message:'Object not found',statusCode:'404'}});
  return {admin:{storage:{from:()=>({list,download})}} as never,list,download};
 }
 it('pages at 1000, keeps data objects only, ascending, folder without trailing slash',async()=>{
  const p1=Array.from({length:1000},(_,i)=>({name:name(i)}));
  const p2=[{name:name(1000)},{name:`${name(5).slice(0,-5)}.meta.json`},{name:'readme.txt'}];
  const f=fake([{data:p1,error:null},{data:p2,error:null}]);
  const out=await supabaseSnapshotObjectStore(f.admin).list(`edgar/${ISSUER}/`);
  expect(out).toHaveLength(1001);expect(out[0]).toBe(`edgar/${ISSUER}/${name(0)}`);expect([...out].sort()).toEqual(out);
  expect(f.list).toHaveBeenCalledTimes(2);
  expect(f.list.mock.calls[0]).toEqual([`edgar/${ISSUER}`,{limit:1000,offset:0,sortBy:{column:'name',order:'asc'}}]);
  expect((f.list.mock.calls[1] as unknown[])[1]).toMatchObject({offset:1000});
 });
 it('list error → snapshot_list_failed without response content',async()=>{
  const f=fake([{data:null,error:{message:'secret detail'}}]);
  await expect(supabaseSnapshotObjectStore(f.admin).list('edgar/x/')).rejects.toThrow(/^snapshot_list_failed$/);
 });
 it('get: not found → null, bytes returned, other errors → snapshot_download_failed; meta parses sidecar or null',async()=>{
  const ok=new Blob([new TextEncoder().encode('{"source":"edgar"}')]);
  const f=fake([],{'a.json':{data:ok,error:null},'a.meta.json':{data:ok,error:null},'bad.json':{data:null,error:{message:'boom',statusCode:'500'}},'c.meta.json':{data:new Blob(['not json']),error:null}});
  const s=supabaseSnapshotObjectStore(f.admin);
  expect(await s.get('missing.json')).toBeNull();
  expect(new TextDecoder().decode((await s.get('a.json'))!)).toBe('{"source":"edgar"}');
  await expect(s.get('bad.json')).rejects.toThrow(/^snapshot_download_failed$/);
  expect(await s.meta('a.json')).toEqual({source:'edgar'});
  expect(await s.meta('c.json')).toBeNull();
  const f400=fake([],{'x.json':{data:null,error:{message:'Bad Request',statusCode:'400'}}});
  await expect(supabaseSnapshotObjectStore(f400.admin).get('x.json')).rejects.toThrow(/^snapshot_download_failed$/);
 });
});

describe('Tushare duplicate field names',()=>{
 it('a row whose field name appears twice in data.fields is not indexed',async()=>{
  const snaps=loadTushareFixtures('600519.SH',SYNTHETIC_DIR);
  const target=snaps.find(s=>JSON.parse(new TextDecoder().decode(s.bytes)).data?.fields?.includes('total_revenue'))!;
  const text=new TextDecoder().decode(target.bytes).replace('"oper_cost"','"total_revenue"');
  const dup=snapshotOf(new TextEncoder().encode(text),{...target.meta});
  const store=await stored([dup],'tushare');
  const {rows,filings}=factsFrom((parseTushareStatements([dup],{sinceYear:2000}).candidates as Located[]).filter(c=>c.sourceConcept.endsWith('.total_revenue')).slice(0,1),'CN','tushare');
  expect(rows).toHaveLength(1);
  const res=await buildEvidenceIndex({reader:memorySnapshotObjectStore(store.objects)},{issuerId:ISSUER,market:'CN',rows,filings});
  expect(res.stats).toMatchObject({pointerUnresolved:1,indexed:0});
 });
});
