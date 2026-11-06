// src/lib/documents/sync.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryDocumentsDb} from './memory-documents-db';
import {blobPath,memoryObjectStore} from './object-store';
import {DocumentsSyncError,availableDateOf,runDocumentsSync} from './sync';
import type {SyncDeps,SyncOptions} from './sync';
import type {FetchBytes,FetchedBytes,Listed,ListedAsset,Segment,SourceAdapter} from './sources/shared';
import type {ListedSource} from './types';

const NOW_ISO='2026-11-06T02:00:00.000Z';const NOW=new Date(NOW_ISO);
const H='44444444-4444-4444-8444-444444444444';const M='55555555-5555-4555-8555-555555555555';
const OPS='00000000-0000-4000-8000-0000000000aa';   // a batch id used to edit the scope row the way an earlier run left it
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const pdfBytes=(tag:string)=>new TextEncoder().encode(`%PDF-1.7 ${tag}`);
const item=(ref:string,day:string,o:Partial<Listed>={}):Listed=>({source_ref:ref,source_url:`https://www1.hkexnews.hk/listedco/${ref}.pdf`,title:'二零二六年中期報告',form_type:'[中期/半年度報告]',headline:'財務報表 - [中期/半年度報告]',published_at:`${day}T08:38:00.000Z`,precision:'instant',...o});

interface FakeAdapter extends SourceAdapter{lists:Record<string,Listed[]|Error>;segs:{backfill:Segment[];poll:Segment[]};listed:string[]}
function adapter(source:ListedSource='hkexnews',o:{gap?:string|null;fromIndex?:(l:Listed,b:Uint8Array)=>ListedAsset[]}={}):FakeAdapter{
 const a:FakeAdapter={
  source,coverageGap:o.gap??null,listed:[],
  lists:{},segs:{backfill:[{id:'y2025',from:'2025-01-01',to:'2025-12-31'},{id:'y2026',from:'2026-01-01',to:'2026-11-06'}],poll:[{id:'poll:2026-11-05',from:'2026-11-05',to:'2026-11-06'}]},
  segments:(_s,mode)=>a.segs[mode],
  async list(_s,seg){a.listed.push(seg.id);const l=a.lists[seg.id]??[];if(l instanceof Error)throw l;return l;},
 };
 if(o.fromIndex)a.assetsFromIndex=o.fromIndex;
 return a;
}
type Answer=FetchedBytes|'too_large'|'not_found'|Error;
function fetcher(){
 const answers=new Map<string,Answer[]>();const calls:string[]=[];
 const ok=(bytes:Uint8Array,mime='application/pdf',fetchedAt=NOW_ISO):FetchedBytes=>({bytes,mime,status:200,headers:{'content-type':mime,'content-length':String(bytes.length)},fetchedAt});
 const fetch:FetchBytes=async url=>{calls.push(url);const q=answers.get(url);if(!q||q.length===0)throw new Error(`no answer for ${url}`);const a=q.length>1?q.shift()!:q[0];if(a instanceof Error)throw a;return a;};
 return {fetch,calls,ok,set:(url:string,...a:Answer[])=>{answers.set(url,a);}};
}
async function setup(o:{source?:ListedSource;gap?:string|null;fromIndex?:(l:Listed,b:Uint8Array)=>ListedAsset[];deadline?:Date|null;codeVersion?:string|null}={}){
 const source=o.source??'hkexnews';
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],issuers:['issuer_id']});
 await tables.insert('issuers',{issuer_id:H,cik:'1321655',hkex_stock_code_primary:'00268',cninfo_org_id:null,status:'active'});
 await tables.insert('issuers',{issuer_id:M,cik:null,hkex_stock_code_primary:'09999',cninfo_org_id:null,status:'merged',merged_into:H});
 const db=memoryDocumentsDb();db.setNow(NOW_ISO);
 await db.reconcileScope(source,[{issuer_id:H,reasons:['cohort'],priority:10,fetch_key:source==='edgar'?'0001321655':'00268'}]);
 const store=memoryObjectStore();const a=adapter(source,o);const f=fetcher();
 const deps:SyncDeps={db,tables,store,adapter:a,fetchBytes:f.fetch,now:()=>NOW,deadline:o.deadline===undefined?null:o.deadline,codeVersion:o.codeVersion===undefined?'a'.repeat(40):o.codeVersion,userAgent:'OsbornAlpha test ua'};
 const run=(x:Partial<SyncOptions>={})=>runDocumentsSync(deps,{source,limit:25,issuerIds:[H],sinceYear:2025,dryRun:false,triggeredBy:'script',...x});
 const scopeRow=()=>db.scope().find(s=>s.issuer_id===H&&s.source===source)!;
 const quarantined=()=>tables.rows('dq_quarantine');
 return {tables,db,store,a,f,deps,run,scopeRow,quarantined,source};
}
const backfillLists=(s:Awaited<ReturnType<typeof setup>>)=>{
 s.a.lists={y2025:[item('2025082500100_c','2025-08-25')],y2026:[item('2026031900200_c','2026-03-19'),item('2026090300863_c','2026-09-03')],'poll:2026-11-05':[item('2026090300863_c','2026-09-03')]};
 for(const l of [...(s.a.lists.y2025 as Listed[]),...(s.a.lists.y2026 as Listed[])])s.f.set(l.source_url,s.f.ok(pdfBytes(l.source_ref)));
};

describe('runDocumentsSync — backfill, idempotence, versions',()=>{
 it('first run inserts every listed PDF, stores it content-addressed, completes backfill and schedules a day later',async()=>{
  const s=await setup();backfillLists(s);
  const r=await s.run();
  expect(r.status).toBe('success');
  expect(r.counts).toMatchObject({fetched:3,inserted:3,duplicates:0,versioned:0,failed:0});
  expect(r.issuers[0]).toMatchObject({issuerId:H,fetchKey:'00268',outcome:'success'});
  const docs=s.db.documents();
  expect(docs).toHaveLength(3);
  const d=docs.find(x=>x.source_ref==='2026090300863_c')!;
  const bytes=pdfBytes('2026090300863_c');
  expect(d).toMatchObject({issuer_id:H,source:'hkexnews',market:'HK',source_version:1,observed_replacement:false,doc_class:'interim_report',classifier_gen:1,language:'zh',
   content_sha256:sha(bytes),bytes:bytes.length,mime:'application/pdf',storage_path:blobPath(sha(bytes),'application/pdf'),published_at:'2026-09-03T08:38:00.000Z',published_at_precision:'instant',
   available_at:'2026-09-03T08:38:00.000Z',available_date:'2026-09-03',permission:'public',owner_user_id:null,batch_id:r.batchId,code_version:'a'.repeat(40),
   acquisition:{fetched_at:NOW_ISO,http_status:200,content_type:'application/pdf',content_length:bytes.length,etag:null,last_modified:null,user_agent:'OsbornAlpha test ua'}});
  expect(s.store.objects().has(d.storage_path)).toBe(true);
  expect(s.scopeRow()).toMatchObject({backfill_done:true,backfill_cursor:{},last_status:'success',lease_until:null,next_due_at:'2026-11-07T02:00:00.000Z'});
  const [batch]=s.tables.rows('ingest_batches');
  expect(batch).toMatchObject({producer:'documents-sync',dataset:'documents.hkexnews',status:'success',triggered_by:'script',tool_versions:{classifier_gen:'1',source:'hkexnews'}});
  expect(s.tables.rows('dq_freshness')[0]).toMatchObject({dataset:'documents.hkexnews',consecutive_errors:0});
 });
 it('second run (poll, refetch off): every listed item is a known duplicate, no download, no new row, cursor cleared',async()=>{
  const s=await setup();backfillLists(s);
  const first=await s.run();
  const calls=s.f.calls.length;
  const second=await s.run({refetch:false});
  expect(s.a.listed.at(-1)).toBe('poll:2026-11-05');
  expect(second.counts).toMatchObject({fetched:1,inserted:0,duplicates:1});
  expect(s.f.calls.length).toBe(calls);
  expect(s.db.documents()).toHaveLength(first.counts.inserted);
  expect(s.scopeRow()).toMatchObject({backfill_done:true,poll_cursor:{}});
 });
 it('re-running the same backfill reports duplicates equal to the first run inserts, the cursor never moving back',async()=>{
  const s=await setup();backfillLists(s);
  const first=await s.run();
  await s.db.claimSyncLease(H,'hkexnews',OPS,600);
  await s.db.advanceCursor(H,'hkexnews',OPS,'backfill',null,false,true);   // operator reset: replay the whole backfill
  await s.db.releaseSyncLease(H,'hkexnews',OPS,'success',NOW_ISO);
  const calls=s.f.calls.length;
  const again=await s.run({refetch:false});
  expect(again.counts).toMatchObject({inserted:0,versioned:0,duplicates:first.counts.inserted});
  expect(s.f.calls.length).toBe(calls);
  expect(s.db.documents()).toHaveLength(first.counts.inserted);
  expect(s.scopeRow().backfill_done).toBe(true);
 });
 it('hkexnews refetches known items by default: same bytes → duplicate; new bytes → a new version visible from the fetch instant',async()=>{
  const s=await setup();backfillLists(s);
  await s.run();
  const url=item('2026090300863_c','2026-09-03').source_url;
  s.f.set(url,s.f.ok(pdfBytes('2026090300863_c')));
  const same=await s.run();
  expect(same.counts).toMatchObject({fetched:1,duplicates:1,inserted:0,versioned:0});
  s.f.set(url,s.f.ok(pdfBytes('2026090300863_c replaced'),'application/pdf','2026-11-06T02:00:05.000Z'));
  const changed=await s.run();
  expect(changed.counts).toMatchObject({versioned:1});
  const versions=s.db.documents().filter(d=>d.source_ref==='2026090300863_c').sort((a,b)=>a.source_version-b.source_version);
  expect(versions.map(v=>v.source_version)).toEqual([1,2]);
  expect(versions[1]).toMatchObject({supersedes_document_id:versions[0].document_id,observed_replacement:true,published_at:'2026-09-03T08:38:00.000Z',available_at:'2026-11-06T02:00:05.000Z',available_date:'2026-11-06'});
  expect(s.store.objects().has(versions[0].storage_path)).toBe(true);
 });
});

describe('runDocumentsSync — cursor, item cap, deadline',()=>{
 it('known items do not count against maxPerIssuer; the cursor stops at the first new item over the cap and the issuer is due now',async()=>{
  const s=await setup();
  const all=['a1','a2','a3','b1','b2','b3'].map((r,i)=>item(r,`2026-0${i+1}-01`));
  s.a.lists={y2025:[],y2026:all.slice(0,3)};
  for(const l of all)s.f.set(l.source_url,s.f.ok(pdfBytes(l.source_ref)));
  await s.run({maxPerIssuer:50});
  // reset to backfill over a longer list: three known + three new
  s.a.lists.y2026=all;
  await s.db.claimSyncLease(H,'hkexnews',OPS,600);
  await s.db.advanceCursor(H,'hkexnews',OPS,'backfill',null,false,true);   // operator reset
  await s.db.releaseSyncLease(H,'hkexnews',OPS,'success',NOW_ISO);
  const r=await s.run({maxPerIssuer:2,refetch:false});
  expect(r.counts).toMatchObject({duplicates:3,inserted:2});
  expect(r.issuers[0]).toMatchObject({outcome:'success',code:'item_limit'});
  expect(s.scopeRow()).toMatchObject({backfill_done:false,backfill_cursor:{segment:'y2026',last_ref:'b2',settled:[],attempts:{}},next_due_at:NOW_ISO});
  const rest=await s.run({maxPerIssuer:2,refetch:false});
  expect(rest.counts).toMatchObject({inserted:1,duplicates:0});
  expect(s.scopeRow().backfill_done).toBe(true);
 });
 it('resumes inside a segment from the stored checkpoint (a settled ref is not fetched again); an unknown segment id restarts from the first segment',async()=>{
  const s=await setup();backfillLists(s);
  await s.db.claimSyncLease(H,'hkexnews',OPS,600);
  await s.db.advanceCursor(H,'hkexnews',OPS,'backfill',{segment:'y2026',last_ref:'2026031900200_c',settled:['2026031900200_c'],attempts:{},seq:1},false);
  await s.db.releaseSyncLease(H,'hkexnews',OPS,'success',NOW_ISO);
  const r=await s.run();
  expect(s.a.listed).toEqual(['y2026']);
  expect(r.counts.inserted).toBe(1);
  expect(s.db.documents().map(d=>d.source_ref)).toEqual(['2026090300863_c']);
  const t=await setup();backfillLists(t);
  await t.db.claimSyncLease(H,'hkexnews',OPS,600);
  await t.db.advanceCursor(H,'hkexnews',OPS,'backfill',{segment:'y2019',last_ref:'x',settled:[],attempts:{x:2},seq:7},false);
  await t.db.releaseSyncLease(H,'hkexnews',OPS,'success',NOW_ISO);
  await t.run();
  expect(t.a.listed).toEqual(['y2025','y2026']);
  expect(t.db.documents()).toHaveLength(3);
 });
 it('stops starting items under the item budget (deadline_hit, cursor kept, due now) and starts no issuer under 90 s',async()=>{
  const s=await setup({deadline:new Date(NOW.getTime()+20_000)});backfillLists(s);
  const r=await s.run();
  expect(r.errors).toEqual([{code:'deadline_hit',message:JSON.stringify({not_started:1})}]);
  expect(r.issuers).toEqual([]);
  expect(r.status).toBe('success');
  const t=await setup({deadline:new Date(NOW.getTime()+100_000)});backfillLists(t);
  let clock=NOW.getTime();t.deps.now=()=>new Date(clock);
  const list=t.a.list.bind(t.a);t.a.list=async(sc,seg,b)=>{clock+=80_000;return list(sc,seg,b);};   // listing takes 80 s: 20 s left
  const r2=await t.run();
  expect(r2.issuers[0]).toMatchObject({outcome:'success',code:'deadline_hit'});
  expect(r2.errors.map(e=>e.code)).toContain('deadline_hit');
  expect(t.db.documents()).toHaveLength(0);
  expect(t.scopeRow()).toMatchObject({backfill_cursor:{},backfill_done:false,last_status:'success',next_due_at:'2026-11-06T02:01:20.000Z'});   // nothing started: due again at once
 });
 it('P2-5: resumes by source_ref — a removal before the checkpoint skips nothing, an insertion before it is still fetched, retries stay with their source_ref',async()=>{
  const s=await setup();
  const [A,B,C,X,Y]=['r-a','r-b','r-c','r-x','r-y'].map((r,i)=>item(r,`2026-0${i+1}-01`));
  for(const l of [A,B,C,X,Y])s.f.set(l.source_url,s.f.ok(pdfBytes(l.source_ref)));
  const refs=()=>s.db.documents().map(d=>d.source_ref).sort();
  s.a.lists={y2025:[],y2026:[A,B,C]};
  expect((await s.run({maxPerIssuer:1,refetch:false})).issuers[0]).toMatchObject({outcome:'success',code:'item_limit'});
  expect(s.scopeRow().backfill_cursor).toMatchObject({segment:'y2026',last_ref:'r-a'});
  s.a.lists.y2026=[B,C];                                                      // A left the listing: an ordinal 1 would now skip B
  await s.run({maxPerIssuer:1,refetch:false});
  expect(refs()).toEqual(['r-a','r-b']);
  s.a.lists.y2026=[X,B,C];                                                    // X inserted before the checkpoint
  s.f.set(C.source_url,new Error('ECONNRESET'));
  const r3=await s.run({maxPerIssuer:5,refetch:false});
  expect(refs()).toEqual(['r-a','r-b','r-x']);
  expect(r3.issuers[0]).toMatchObject({outcome:'failed',code:'fetch_failed'});
  expect(s.scopeRow().backfill_cursor).toMatchObject({segment:'y2026',attempts:{'r-c':1}});
  s.a.lists.y2026=[X,B,Y,C];                                                  // another insertion ahead of the failing item: its retry count stays with r-c
  await s.run({maxPerIssuer:5,refetch:false});
  expect(refs()).toEqual(['r-a','r-b','r-x','r-y']);
  expect(s.scopeRow().backfill_cursor).toMatchObject({last_ref:'r-y',attempts:{'r-c':2}});
  await s.run({maxPerIssuer:5,refetch:false});
  expect(s.quarantined()).toEqual([expect.objectContaining({natural_key:'hkexnews:r-c',reason_code:'document_fetch_exhausted'})]);
  expect(s.quarantined()[0].payload).toMatchObject({attempts:3});
  expect(s.scopeRow()).toMatchObject({backfill_done:true,backfill_cursor:{}});
 });
 it('P2-4: a batch that finished the backfill between our selection and our claim is not regressed — the row is reread under our lease',async()=>{
  const s=await setup();backfillLists(s);
  const OTHER='00000000-0000-4000-8000-0000000000bb';
  const claim=s.db.claimSyncLease;let raced=false;
  s.deps.db={...s.db,claimSyncLease:async(i,src,b,ttl)=>{
   if(!raced&&b!==OTHER){
    raced=true;                                                               // selection already read backfill_done=false
    expect(await claim(i,src,OTHER,600)).toBe(true);
    await s.db.advanceCursor(i,src,OTHER,'backfill',null,true);
    await s.db.releaseSyncLease(i,src,OTHER,'success',NOW_ISO);
   }
   return claim(i,src,b,ttl);
  }};
  const r=await s.run();
  expect(r.issuers[0]).toMatchObject({outcome:'success'});
  expect(s.a.listed).toEqual(['poll:2026-11-05']);                             // poll mode from the reread row, not a stale backfill
  expect(s.scopeRow()).toMatchObject({backfill_done:true,backfill_cursor:{},poll_cursor:{}});
 });
});

describe('runDocumentsSync — item failures',()=>{
 it('fetch failures do not advance; the third quarantines document_fetch_exhausted and advances',async()=>{
  const s=await setup();backfillLists(s);
  const bad=item('2025082500100_c','2025-08-25').source_url;
  s.f.set(bad,new Error('ECONNRESET'));
  const r1=await s.run();
  expect(r1.status).toBe('failed');
  expect(r1.issuers[0]).toMatchObject({outcome:'failed',code:'fetch_failed'});
  expect(r1.errors[0]).toMatchObject({code:'fetch_failed',key:`${H}:2025082500100_c`});
  expect(s.scopeRow()).toMatchObject({backfill_cursor:{segment:'y2025',last_ref:null,settled:[],attempts:{'2025082500100_c':1},seq:1},last_status:'failed',next_due_at:'2026-11-06T08:00:00.000Z'});
  await s.run();
  expect(s.scopeRow().backfill_cursor).toEqual({segment:'y2025',last_ref:null,settled:[],attempts:{'2025082500100_c':2},seq:2});
  const r3=await s.run();
  expect(r3.counts).toMatchObject({quarantined:1,inserted:2,failed:0});
  expect(r3.status).toBe('success');
  expect(s.quarantined()).toEqual([expect.objectContaining({dataset:'documents.hkexnews',table_name:'disclosure_documents',natural_key:'hkexnews:2025082500100_c',reason_code:'document_fetch_exhausted',status:'open'})]);
  expect(s.quarantined()[0].payload).toMatchObject({url:bad,attempts:3,last_error:{code:'fetch_failed',message:'ECONNRESET'}});
  expect(s.scopeRow().backfill_done).toBe(true);
 });
 it('too_large and unexpected_mime quarantine and advance; 404 is a skipped_summary and advances',async()=>{
  const s=await setup();backfillLists(s);
  const [a,b,c]=[item('2025082500100_c','2025-08-25'),item('2026031900200_c','2026-03-19'),item('2026090300863_c','2026-09-03')].map(x=>x.source_url);
  s.f.set(a,'too_large');s.f.set(b,s.f.ok(new TextEncoder().encode('<html>blocked</html>'),'application/pdf'));s.f.set(c,'not_found');
  const r=await s.run();
  expect(r.counts).toMatchObject({fetched:2,quarantined:2,inserted:0,failed:0});
  expect(r.status).toBe('success');
  expect(s.quarantined().map(q=>q.reason_code).sort()).toEqual(['document_too_large','unexpected_mime']);
  expect(r.errors).toContainEqual({code:'skipped_summary',key:`${H}:document_missing`,message:'{"document_missing":1}'});
  expect(s.db.documents()).toEqual([]);expect(s.store.objects().size).toBe(0);
  expect(s.scopeRow().backfill_done).toBe(true);
 });
 it('an HTML error page served as HTTP 200 for a .pdf URL (HKEX answers a missing _e file this way) is quarantined unexpected_mime, never stored',async()=>{
  const s=await setup();backfillLists(s);
  const url=item('2026090300863_c','2026-09-03').source_url.replace(/_c\.pdf$/,'_e.pdf');
  const e=item('2026090300863_e','2026-09-03');expect(e.source_url).toBe(url);
  s.a.lists={...s.a.lists,y2026:[...(s.a.lists.y2026 as Listed[]),e]};
  s.f.set(url,s.f.ok(new TextEncoder().encode('<!DOCTYPE html><html><body>HKEXnews error</body></html>'),'text/html'));
  const r=await s.run();
  expect(s.quarantined().map(q=>q.reason_code)).toEqual(['unexpected_mime']);
  expect(r.counts).toMatchObject({quarantined:1,inserted:3,failed:0});
  expect(s.db.documents().some(d=>d.source_ref==='2026090300863_e')).toBe(false);
  expect([...s.store.objects().values()].every(o=>o.mime==='application/pdf')).toBe(true);
 });
 it('an object put failure writes no row and does not advance',async()=>{
  const s=await setup();backfillLists(s);
  s.deps.store={...s.store,put:async()=>{throw new Error('storage 500');}};
  const r=await s.run();
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'object_put_failed'});
  expect(s.db.documents()).toEqual([]);
  expect(s.scopeRow().backfill_cursor).toEqual({segment:'y2025',last_ref:null,settled:[],attempts:{'2025082500100_c':1},seq:1});
 });
 it('a list failure stops the issuer without moving the cursor (list_failed)',async()=>{
  const s=await setup();backfillLists(s);
  s.a.lists.y2025=new Error('layout_changed: result table not found');
  const r=await s.run();
  expect(r.status).toBe('failed');
  expect(r.errors[0]).toMatchObject({code:'list_failed',key:`${H}:y2025`});
  expect(s.scopeRow()).toMatchObject({backfill_cursor:{},last_status:'failed'});
 });
});

describe('runDocumentsSync — EDGAR assets and coverage',()=>{
 const edgarItem=(o:Partial<Listed>={}):Listed=>({source_ref:'0001321655-26-000041/pltr-20260630.htm',source_url:'https://www.sec.gov/Archives/edgar/data/1321655/000132165526000041/pltr-20260630.htm',title:'10-Q',form_type:'10-Q',published_at:'2026-08-03T22:06:38.000Z',precision:'instant',
  assets:[{role:'filing_index',filename:'index.json',url:'https://www.sec.gov/Archives/edgar/data/1321655/000132165526000041/index.json',required:true}],...o});
 const XBRL='https://www.sec.gov/Archives/edgar/data/1321655/000132165526000041/pltr-20260630_htm.xml';
 const fromIndex=():ListedAsset[]=>[{role:'xbrl_instance',filename:'pltr-20260630_htm.xml',url:XBRL,required:false}];
 async function edgarSetup(){
  const s=await setup({source:'edgar',gap:'edgar_files_unverified',fromIndex});
  s.a.segs.backfill=[{id:'recent',from:'2025-01-01',to:'2026-11-06'}];
  s.a.lists={recent:[edgarItem()]};
  s.f.set(edgarItem().source_url,s.f.ok(new TextEncoder().encode('<html>10-Q</html>'),'text/html'));
  s.f.set(edgarItem().assets![0].url,s.f.ok(new TextEncoder().encode('{"directory":{"item":[]}}'),'application/json'));
  return s;
 }
 it('stores the main document with its index and XBRL instance in one insert; New York calendar date',async()=>{
  const s=await edgarSetup();
  s.f.set(XBRL,s.f.ok(new TextEncoder().encode('<xbrl/>'),'text/xml'));
  const r=await s.run();
  expect(r.counts.inserted).toBe(1);
  const [d]=s.db.documents();
  expect(d).toMatchObject({market:'US',doc_class:'quarterly_report',filing_source_ref:'0001321655-26-000041',language:'en',mime:'text/html',available_date:'2026-08-03'});
  expect(s.db.assets().map(a=>[a.role,a.filename,a.mime])).toEqual([['filing_index','index.json','application/json'],['xbrl_instance','pltr-20260630_htm.xml','application/xml']]);
  expect(s.store.objects().size).toBe(3);
 });
 it('an oversized or missing XBRL instance is skipped (xbrl_skipped); a failing index blocks the item',async()=>{
  const s=await edgarSetup();
  s.f.set(XBRL,'too_large');
  const r=await s.run();
  expect(r.counts.inserted).toBe(1);
  expect(r.errors).toContainEqual({code:'skipped_summary',key:`${H}:xbrl_skipped`,message:'{"xbrl_skipped":1}'});
  expect(s.db.assets().map(a=>a.role)).toEqual(['filing_index']);
  const t=await edgarSetup();
  t.f.set(edgarItem().assets![0].url,'not_found');
  const r2=await t.run();
  expect(r2.issuers[0]).toMatchObject({outcome:'failed',code:'asset_fetch_failed'});
  expect(t.db.documents()).toEqual([]);
  expect(t.scopeRow().backfill_cursor).toEqual({segment:'recent',last_ref:null,settled:[],attempts:{'0001321655-26-000041/pltr-20260630.htm':1},seq:1});
 });
 it('with a coverage gap the finished backfill is not marked done: cursor reset, coverage_summary, due in a day',async()=>{
  const s=await edgarSetup();s.f.set(XBRL,'not_found');
  const r=await s.run();
  expect(r.errors).toContainEqual({code:'coverage_summary',key:H,message:JSON.stringify({gap:'edgar_files_unverified',segments:['recent']})});
  expect(r.status).toBe('success');
  expect(s.scopeRow()).toMatchObject({backfill_done:false,backfill_cursor:{},next_due_at:'2026-11-07T02:00:00.000Z'});
  const again=await s.run({refetch:false});
  expect(again.counts).toMatchObject({duplicates:1,inserted:0});
  expect(again.issuers[0]).toMatchObject({outcome:'success'});                  // the restart is an explicit reset (recheck N1), never cursor_regression
  expect(s.scopeRow()).toMatchObject({backfill_done:false,backfill_cursor:{}});
 });
 it('rejects a document MIME the source does not allow',async()=>{
  const s=await edgarSetup();
  s.f.set(edgarItem().source_url,s.f.ok(new TextEncoder().encode('plain'),'text/plain'));
  await s.run();
  expect(s.quarantined().map(q=>q.reason_code)).toEqual(['unexpected_mime']);
 });
});

describe('runDocumentsSync — leases, batches, dry run',()=>{
 it('a lease held by another batch is skipped_summary(leased); a merged issuer is skipped',async()=>{
  const s=await setup();backfillLists(s);
  await s.db.claimSyncLease(H,'hkexnews','00000000-0000-4000-8000-0000000000ff',600);
  const r=await s.run();
  expect(r.issuers[0]).toMatchObject({outcome:'skipped',code:'leased'});
  expect(r.errors).toEqual([{code:'skipped_summary',key:`${H}:leased`,message:'{"leased":1}'}]);
  expect(s.db.documents()).toEqual([]);
  const t=await setup();
  await t.db.reconcileScope('hkexnews',[{issuer_id:M,reasons:['cohort'],priority:10,fetch_key:'09999'}]);
  const r2=await t.run({issuerIds:[M]});
  expect(r2.issuers[0]).toMatchObject({outcome:'skipped',code:'issuer_merged'});
 });
 it('a lease lost mid-run fails the issuer with no further database call for it',async()=>{
  const s=await setup();backfillLists(s);
  const orig=s.f.fetch;let n=0;
  s.deps.fetchBytes=async(u,b,m)=>{if(n++===1){s.db.expireSyncLease(H,'hkexnews');await s.db.claimSyncLease(H,'hkexnews','00000000-0000-4000-8000-0000000000ee',600);}return orig(u,b,m);};
  const r=await s.run();
  expect(r.issuers[0]).toMatchObject({outcome:'failed',code:'lease_lost'});
  expect(s.db.documents()).toHaveLength(1);
  expect(s.scopeRow()).toMatchObject({lease_batch_id:'00000000-0000-4000-8000-0000000000ee',last_status:null});
 });
 it('offline: every list fails → batch failed, no documents or objects; two runs make freshness error',async()=>{
  const s=await setup();
  s.a.lists={y2025:new Error('fetch failed'),y2026:new Error('fetch failed')};
  const r=await s.run();
  expect(r.status).toBe('failed');
  expect(s.db.documents()).toEqual([]);expect(s.store.objects().size).toBe(0);
  await s.run();
  expect(s.tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:2,status:'error'});
 });
 it('scheduled path: reconciles the scope, then nothing due is an idle success heartbeat',async()=>{
  const s=await setup();
  await s.tables.insert('research_entity_keys',{user_id:'u',entity_id:'e',in_scope:true,issuer_id:H});
  backfillLists(s);
  const r=await s.run({issuerIds:undefined});
  expect(r.issuers.map(i=>i.issuerId)).toEqual([H]);
  const idle=await s.run({issuerIds:undefined});
  expect(idle).toMatchObject({status:'success',idle:true,issuers:[]});
  expect(s.tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:0});
 });
 it('explicit issuer without a scope row is seeded (reasons explicit); an unresolvable one is scope_unresolved',async()=>{
  const s=await setup();backfillLists(s);
  const X='99999999-9999-4999-8999-999999999999';
  const r=await s.run({issuerIds:[X]});
  expect(r.issuers[0]).toMatchObject({issuerId:X,outcome:'failed',code:'scope_unresolved'});
  expect(r.status).toBe('failed');
  const t=await setup({source:'cninfo'});
  await t.tables.update('issuers',{issuer_id:H},{cninfo_org_id:'gssh0600570'});
  await t.tables.insert('issuer_securities',{issuer_id:H,ticker:'600570.SH',is_primary:true,valid_from:'2003-12-16',valid_to:null});
  t.a.lists={};
  const fresh=memoryDocumentsDb();fresh.setNow(NOW_ISO);t.deps.db=fresh;
  await t.run();
  expect(fresh.scope()).toEqual([expect.objectContaining({issuer_id:H,source:'cninfo',reasons:['explicit'],fetch_key:'600570,gssh0600570',backfill_done:true})]);
 });
 it('refuses to apply without a code version, before any batch',async()=>{
  const s=await setup({codeVersion:null});
  await expect(s.run()).rejects.toThrow(DocumentsSyncError);
  await expect(s.run()).rejects.toThrow('code_version_unavailable');
  expect(s.tables.rows('ingest_batches')).toEqual([]);
 });
 it('dry run: fetches and plans, writes nothing (no batch, lease, cursor, object, quarantine, document)',async()=>{
  const s=await setup({codeVersion:null});backfillLists(s);
  s.f.set(item('2025082500100_c','2025-08-25').source_url,'too_large');
  const before=s.scopeRow();
  const r=await s.run({dryRun:true});
  expect(r).toMatchObject({batchId:null,status:'dry_run'});
  expect(r.counts).toMatchObject({fetched:3,inserted:2,quarantined:1});
  expect(r.issuers[0].outcome).toBe('planned');
  expect(s.tables.rows('ingest_batches')).toEqual([]);expect(s.tables.rows('dq_freshness')).toEqual([]);expect(s.quarantined()).toEqual([]);
  expect(s.db.documents()).toEqual([]);expect(s.store.objects().size).toBe(0);
  expect(s.scopeRow()).toEqual(before);
 });
});

it('availableDateOf: New York for EDGAR, UTC+8 for cninfo/HKEX',()=>{
 expect(availableDateOf('edgar','2026-08-04T02:00:00.000Z')).toBe('2026-08-03');
 expect(availableDateOf('hkexnews','2026-08-03T16:30:00.000Z')).toBe('2026-08-04');
 expect(availableDateOf('cninfo','2026-09-08T16:00:00.000Z')).toBe('2026-09-09');
});
