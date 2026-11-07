// src/lib/documents/extract/run.test.ts
import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {HEARTBEAT_MS} from '../lease';
import {memoryTableClient} from '../../db/memory-table-client';
import {memoryDocumentsDb} from '../memory-documents-db';
import {memoryObjectStore} from '../object-store';
import {seedPublicDocument,withOverride} from '../test-seed';
import {EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from '../types';
import type {ObjectStore,PageLayout} from '../types';
import {runDocumentsExtract,MIN_DOC_MS} from './run';
import type {ExtractDeps} from './run';
import {assemblePage,parseRecordedFixture,pageInsertsOf,sha256Hex} from './pages-json';
import {extractHtml} from './html';
import {ExtractTimeout} from './pdf';

const CODE='c'.repeat(40);
const enc=(s:string)=>new TextEncoder().encode(s);
const layoutPage=(no:number,text:string):PageLayout=>{const a=assemblePage(text?[{y:700,pieces:[{text,x0:0,x1:10,y:700,h:10,spaceBefore:false}]}]:[]);return {page_no:no,width:595,height:842,text:a.text,lines:a.lines,tables:[]};};

function harness(over:Partial<ExtractDeps>={}){
 const db=memoryDocumentsDb();const store=memoryObjectStore();
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id']});
 const calls:string[]=[];
 const deps:ExtractDeps={db,tables,store,now:()=>new Date(),deadline:null,codeVersion:CODE,
  extractPdf:async(bytes)=>{calls.push(new TextDecoder().decode(bytes));return {pages:[layoutPage(1,'𠀋😀 綜合損益表'),layoutPage(2,'')],hasTextLayer:true};},
  extractHtml,...over};
 return {db,store,tables,deps,calls};
}
const run=(deps:ExtractDeps,o:Partial<Parameters<typeof runDocumentsExtract>[1]>={})=>runDocumentsExtract(deps,{limit:10,dryRun:false,triggeredBy:'script',...o});

describe('runDocumentsExtract',()=>{
 it('extracts a stored PDF: pages.json stored under its content hash, version + pages written, batch success, freshness ok',async()=>{
  const {db,store,tables,deps}=harness();
  const pdf=enc('%PDF-one');
  const doc=await seedPublicDocument(db,pdf,{},store);
  const r=await run(deps);
  expect(r).toMatchObject({status:'success',idle:false,counts:{fetched:1,inserted:1,failed:0}});
  expect(r.documents).toEqual([{documentId:doc,outcome:'extracted',pageCount:2,extractionId:expect.any(String)}]);
  const d=(await db.documentById(doc))!;
  expect(d).toMatchObject({status:'extracted',current_extraction_id:r.documents[0].extractionId,extract_lease_until:null,extract_attempts:1});
  const e=(await db.extractionById(d.current_extraction_id!))!;
  expect(e).toMatchObject({extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:CODE,has_text_layer:true,page_count:2,candidates_role:'primary',candidates_status:'pending'});
  const blob=store.objects().get(e.pages_json_path)!.bytes;
  expect(e.pages_json_path).toBe(`extractions/${sha256Hex(pdf)}/${e.pages_json_sha256}.pages.json`);
  expect(sha256Hex(blob)).toBe(e.pages_json_sha256);
  const json=JSON.parse(new TextDecoder().decode(blob));
  expect(json).toMatchObject({extractor_version:EXTRACTOR_VERSION,content_sha256:sha256Hex(pdf),code_version:CODE,has_text_layer:true});
  expect(await db.pagesOf(e.extraction_id,[1,2])).toEqual(pageInsertsOf(json).map(p=>({...p,extraction_id:e.extraction_id})));
  expect((await db.pagesOf(e.extraction_id,[1]))[0].char_count).toBe(8);   // code points: 𠀋😀 + space + 5 hanzi (UTF-16 length 10)
  const [batch]=(tables as ReturnType<typeof memoryTableClient>).rows('ingest_batches');
  expect(batch).toMatchObject({producer:'documents-extract',dataset:'documents.extract',status:'success',code_version:CODE,tool_versions:{extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION}});
  expect((tables as ReturnType<typeof memoryTableClient>).rows('dq_freshness')[0]).toMatchObject({dataset:'documents.extract',consecutive_errors:0});
 });
 it('HTML goes through extractHtml (no pdf.js); a document without text is no_text_layer and an info skip',async()=>{
  const {db,store,deps,calls}=harness({extractPdf:async()=>({pages:[layoutPage(1,'')],hasTextLayer:false})});
  const html=await seedPublicDocument(db,enc('<p>one</p><hr/><p>two</p>'),{source:'edgar',market:'US',source_ref:'0001-26-1/x.htm',mime:'text/html',language:'en'},store);
  const scan=await seedPublicDocument(db,enc('%PDF-scan'),{source_ref:'2026090300865_c'},store);
  const r=await run(deps);
  expect(calls).toEqual([]);
  expect(r.status).toBe('success');
  expect(r.counts).toMatchObject({fetched:2,inserted:2});
  expect((await db.documentById(html))!.status).toBe('extracted');
  expect((await db.extractionById((await db.documentById(html))!.current_extraction_id!))!).toMatchObject({page_count:2,candidates_role:'none',candidates_status:'n/a'});
  expect((await db.documentById(scan))!.status).toBe('no_text_layer');
  expect(r.errors).toContainEqual({code:'skipped_summary',key:scan,message:'no_text_layer'});
 });
 it('extractor errors call failExtract; the third claim turns the document extract_failed and it is never picked again',async()=>{
  const {db,store,deps}=harness({extractPdf:async()=>{throw new Error('bad xref');}});
  const doc=await seedPublicDocument(db,enc('%PDF-bad'),{},store);
  for(let k=1;k<=3;k++){
   const r=await run(deps);
   expect(r).toMatchObject({status:'failed',counts:{fetched:1,failed:1}});
   expect(r.errors).toContainEqual({code:'extract_error',key:doc,message:'bad xref'});
  }
  expect((await db.documentById(doc))!).toMatchObject({status:'extract_failed',extract_attempts:3});
  const idle=await run(deps);
  expect(idle).toMatchObject({idle:true,status:'success',documents:[]});
 });
 it('P2-7: an extraction that outlives its lease while another batch takes over gets lease_lost and writes nothing',async()=>{
  const h=harness();
  const doc=await seedPublicDocument(h.db,enc('%PDF-long'),{},h.store);
  const OTHER=randomUUID();
  const r=await run({...h.deps,extractPdf:async()=>{
   h.db.expireExtractLease(doc);                                               // the 600 s lease ran out during a long extraction …
   expect(await h.db.claimExtractLease(doc,OTHER,600)).toBe(true);           // … and another batch claimed the document
   return {pages:[layoutPage(1,'綜合損益表')],hasTextLayer:true};
  }});
  expect(r.documents).toEqual([{documentId:doc,outcome:'failed',code:'lease_lost'}]);
  expect(r.counts).toMatchObject({fetched:1,failed:1,inserted:0});
  expect([...h.store.objects().keys()].some(k=>k.startsWith('extractions/'))).toBe(false);   // no pages.json
  expect(await h.db.documentById(doc)).toMatchObject({status:'stored',current_extraction_id:null,extract_lease_batch_id:OTHER});
  expect(h.db.extractions()).toEqual([]);
  // the holder renews: an extraction that outlives an untaken lease still finishes
  const g=harness();
  const d2=await seedPublicDocument(g.db,enc('%PDF-slow-but-alone'),{},g.store);
  const r2=await run({...g.deps,extractPdf:async()=>{g.db.expireExtractLease(d2);return {pages:[layoutPage(1,'x')],hasTextLayer:true};}});
  expect(r2.documents[0]).toMatchObject({documentId:d2,outcome:'extracted'});
 });
 it('R1-P2-7 round 2: the lease is renewed on a timer during a long extraction; a takeover stops it with lease_lost and nothing written',async()=>{
  vi.useFakeTimers();
  try{
   const h=harness();
   const doc=await seedPublicDocument(h.db,enc('%PDF-very-long'),{},h.store);
   let started=false;const renew=h.db.renewExtractLease;let renewals=0;
   const db={...h.db,renewExtractLease:async(d:string,b:string,t:number)=>{renewals++;return renew(d,b,t);}};
   const p=run({...h.deps,db,extractPdf:()=>{started=true;return new Promise(()=>{});}});   // pdf.js busy far longer than the lease
   for(let i=0;i<1000&&!started;i++)await Promise.resolve();
   expect(started).toBe(true);
   await vi.advanceTimersByTimeAsync(HEARTBEAT_MS*3);
   expect(renewals).toBe(3);
   expect((await h.db.documentById(doc))!.extract_lease_until).not.toBeNull();
   h.db.expireExtractLease(doc);
   const OTHER=randomUUID();expect(await h.db.claimExtractLease(doc,OTHER,600)).toBe(true);   // another batch takes over
   await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
   const r=await p;
   expect(r.documents).toEqual([{documentId:doc,outcome:'failed',code:'lease_lost'}]);
   expect([...h.store.objects().keys()].some(k=>k.startsWith('extractions/'))).toBe(false);
   expect(h.db.extractions()).toEqual([]);
   expect(await h.db.documentById(doc)).toMatchObject({status:'stored',extract_lease_batch_id:OTHER});
  }finally{vi.useRealTimers();}
 });
 for(const setup of ['worker_missing','worker_stale'] as const)it(`R5-P2-1: a ${setup} preflight fails the batch as ${setup} before any claim — no attempt consumed, the document stays due`,async()=>{
  const h=harness();
  const doc=await seedPublicDocument(h.db,enc('%PDF-needs-the-worker'),{},h.store);
  let claims=0;const claim=h.db.claimExtractLease;
  const deps={...h.deps,db:{...h.db,claimExtractLease:async(d:string,b:string,t:number)=>{claims++;return claim(d,b,t);}},preflight:()=>setup};
  const r=await run(deps);
  expect(r).toMatchObject({status:'failed',documents:[],counts:{failed:1,fetched:0}});
  expect(r.errors).toEqual([expect.objectContaining({code:setup})]);
  expect(claims).toBe(0);
  expect(await h.db.documentById(doc)).toMatchObject({status:'stored',extract_attempts:0,extract_lease_batch_id:null});
  expect(h.calls).toEqual([]);
  const dry=await run(deps,{dryRun:true});
  expect(dry).toMatchObject({status:'dry_run',documents:[],errors:[{code:setup,message:'setup'}]});
  expect((await run(h.deps)).documents).toEqual([expect.objectContaining({documentId:doc,outcome:'extracted'})]);   // once ready, the same document extracts
 });
 it('extract_timeout, content hash mismatch, missing object and unsupported MIME are coded failures',async()=>{
  const {db,store,tables,deps}=harness({extractPdf:async()=>{throw new ExtractTimeout();}});
  const slow=await seedPublicDocument(db,enc('%PDF-slow'),{},store);
  const swapped=await seedPublicDocument(db,enc('%PDF-real'),{source_ref:'2026090300866_c'});
  store.objects().set((await db.documentById(swapped))!.storage_path,{bytes:enc('%PDF-other'),mime:'application/pdf'});   // the committed store refuses a mismatching put, so swap the stored object directly
  const missing=await seedPublicDocument(db,enc('%PDF-missing'),{source_ref:'2026090300867_c'});
  const json=await seedPublicDocument(db,enc('{}'),{source_ref:'2026090300868_c',mime:'application/json'},store);
  const r=await run(deps);
  const byDoc=Object.fromEntries(r.documents.map(d=>[d.documentId,d.code]));
  expect(byDoc).toEqual({[slow]:'extract_timeout',[swapped]:'content_hash_mismatch',[missing]:'object_get_failed',[json]:'unsupported_mime'});
  expect(r.counts).toMatchObject({fetched:4,failed:4,inserted:0});
  for(const id of [slow,missing,json])expect((await db.documentById(id))!).toMatchObject({status:'stored',extract_lease_until:null});
  // T10 review: a hash mismatch is terminal on first sight (extract_failed, no retries) and parked in quarantine
  expect((await db.documentById(swapped))!).toMatchObject({status:'extract_failed',extract_lease_until:null});
  expect((tables as ReturnType<typeof memoryTableClient>).rows('dq_quarantine')).toEqual([expect.objectContaining({reason_code:'content_hash_mismatch',natural_key:swapped,status:'open'})]);
  expect(await db.storedDue(10)).not.toContainEqual(expect.objectContaining({document_id:swapped}));
 });
 it('a pages.json put failure neither fails nor finishes: the lease is left to expire and the attempt stays counted',async()=>{
  const {db,store,deps}=harness();
  const doc=await seedPublicDocument(db,enc('%PDF-put'),{},store);
  const broken=withOverride<ObjectStore>(store,{put:async(p:string)=>{if(p.startsWith('extractions/'))throw new Error('storage down');return 'created';}});
  const r=await run({...deps,store:broken});
  expect(r.documents).toEqual([{documentId:doc,outcome:'failed',code:'object_put_failed'}]);
  const d=(await db.documentById(doc))!;
  expect(d).toMatchObject({status:'stored',extract_attempts:1,current_extraction_id:null});
  expect(d.extract_lease_until).not.toBeNull();
  expect(await db.storedDue(10)).toEqual([]);   // leased: not due until the lease expires
  db.expireExtractLease(doc);
  expect((await run(deps)).documents[0]).toMatchObject({outcome:'extracted'});
  expect((await db.documentById(doc))!.extract_attempts).toBe(2);
 });
 it('a claim held by another batch is skipped without any write',async()=>{
  const {db,store,deps}=harness();
  const doc=await seedPublicDocument(db,enc('%PDF-held'),{},store);
  const other=randomUUID();
  const due=await db.storedDue(10);
  expect(await db.claimExtractLease(doc,other,600)).toBe(true);
  const r=await run({...deps,db:withOverride(db,{storedDue:async()=>due})});
  expect(r.documents).toEqual([{documentId:doc,outcome:'skipped',code:'leased_or_exhausted'}]);
  expect(r.counts.fetched).toBe(0);
  expect(r.status).toBe('success');
 });
 it('documentIds: only listed documents that are still stored; others reported as info skips',async()=>{
  const {db,store,deps}=harness();
  const a=await seedPublicDocument(db,enc('%PDF-a'),{},store);
  const b=await seedPublicDocument(db,enc('%PDF-b'),{source_ref:'2026090300869_c'},store);
  await run(deps,{documentIds:[a]});
  expect((await db.documentById(b))!.status).toBe('stored');
  const again=await run(deps,{documentIds:[a]});
  expect(again.errors).toContainEqual({code:'skipped_summary',key:a,message:'not_stored:extracted'});
  expect(again.idle).toBe(false);                                              // idle only on the storedDue path
 });
 it('deadline: under MIN_DOC_MS left, nothing is claimed and deadline_hit is reported',async()=>{
  const {db,store,deps}=harness();
  await seedPublicDocument(db,enc('%PDF-late'),{},store);
  const now=new Date();
  const r=await run({...deps,now:()=>now,deadline:new Date(now.getTime()+MIN_DOC_MS-1)});
  expect(r.errors.map(e=>e.code)).toEqual(['deadline_hit']);
  expect(r.counts.fetched).toBe(0);
  expect(r.status).toBe('success');
 });
 it('dry run: no batch, no claim, no writes; page counts reported. Apply without a code version is refused',async()=>{
  const {db,store,tables,deps}=harness();
  const doc=await seedPublicDocument(db,enc('%PDF-dry'),{},store);
  const r=await run(deps,{dryRun:true});
  expect(r).toMatchObject({batchId:null,status:'dry_run',documents:[{documentId:doc,outcome:'planned',pageCount:2}]});
  expect((tables as ReturnType<typeof memoryTableClient>).rows('ingest_batches')).toEqual([]);
  expect((await db.documentById(doc))!).toMatchObject({status:'stored',extract_attempts:0});
  expect([...store.objects().keys()].filter(k=>k.startsWith('extractions/'))).toEqual([]);
  await expect(run({...deps,codeVersion:null})).rejects.toThrow('code_version_unavailable');
  await expect(run(deps,{limit:0})).rejects.toThrow('invalid_limit');
 });
 it('the pages.json bytes written equal what parseRecordedFixture re-serialises (fixture hashes are the real ones)',async()=>{
  const {db,store,deps}=harness();
  const pdf=enc('%PDF-fixture');
  const doc=await seedPublicDocument(db,pdf,{},store);
  await run(deps);
  const e=(await db.extractionById((await db.documentById(doc))!.current_extraction_id!))!;
  const json=JSON.parse(new TextDecoder().decode(store.objects().get(e.pages_json_path)!.bytes));
  const file={recorded_at:'2026-11-06T00:00:00.000Z',source_url:'https://x/y_c.pdf',source_ref:'y_c',content_sha256:sha256Hex(pdf),bytes:pdf.length,page_count:2,extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,pages_json:json};
  expect(parseRecordedFixture(JSON.stringify(file,null,1)).pagesJsonSha256).toBe(e.pages_json_sha256);
 });
 it('T10 review: dry run shares the integrity check — a swapped object is content_hash_mismatch and the extractor is never called',async()=>{
  const {db,store,deps,calls}=harness();
  const swapped=await seedPublicDocument(db,enc('%PDF-real'),{},store);
  store.objects().set((await db.documentById(swapped))!.storage_path,{bytes:enc('%PDF-other'),mime:'application/pdf'});
  const r=await run(deps,{dryRun:true});
  expect(r.documents).toEqual([{documentId:swapped,outcome:'failed',code:'content_hash_mismatch'}]);
  expect(calls).toEqual([]);
  expect((await db.documentById(swapped))!).toMatchObject({status:'stored',extract_attempts:0});
 });
 it('T10 review: anything thrown after startBatch finishes the batch as failed, records a failed freshness attempt and rethrows',async()=>{
  const {db,tables,deps}=harness();
  const rows=tables as ReturnType<typeof memoryTableClient>;
  const broken=withOverride(db,{storedDue:async()=>{throw new Error('rpc down');}});
  await expect(run({...deps,db:broken})).rejects.toThrow('rpc down');
  expect(rows.rows('ingest_batches')[0]).toMatchObject({status:'failed'});
  expect(rows.rows('dq_freshness')[0]).toMatchObject({dataset:'documents.extract',consecutive_errors:1});
  // the explicit-id lookup is covered the same way
  const lookup=withOverride(db,{documentById:async()=>{throw new Error('lookup down');}});
  await expect(run({...deps,db:lookup},{documentIds:['00000000-0000-4000-8000-000000000001']})).rejects.toThrow('lookup down');
  expect(rows.rows('ingest_batches')[1]).toMatchObject({status:'failed'});
 });
 describe('T10 review: external calls are bounded by the remaining budget',()=>{
  const budgeted=(h:ReturnType<typeof harness>,over:Partial<ExtractDeps>={})=>{
   const t0=Date.now();
   return {...h.deps,now:()=>new Date(Date.now()),deadline:new Date(t0+MIN_DOC_MS+30_000),...over};   // 120 s total: the stalled call is cut at 100 s, 20 s stay for finalization
  };
  it('a stalled storage read ends the document as object_get_failed in time; failExtract and the batch finalization still happen',async()=>{
   vi.useFakeTimers();
   try{
    const h=harness();const doc=await seedPublicDocument(h.db,enc('%PDF-stall-get'),{},h.store);
    const stalled=withOverride<ObjectStore>(h.store,{get:()=>new Promise<Uint8Array>(()=>{})});
    const t0=Date.now();let endedAt=Infinity;
    const p=run(budgeted(h,{store:stalled})).then(r=>{endedAt=Date.now();return r;});
    await vi.advanceTimersByTimeAsync(110_000);
    const r=await p;
    expect(endedAt-t0).toBeLessThanOrEqual(100_000+1_000);                       // cut at deadline − reserve, not at the 120 s deadline
    expect(r.documents).toEqual([{documentId:doc,outcome:'failed',code:'object_get_failed'}]);
    expect(r.counts).toMatchObject({fetched:1,failed:1});
    expect(r.status).toBe('failed');
    expect(await h.db.documentById(doc)).toMatchObject({status:'stored',extract_lease_until:null,extract_attempts:1});   // failExtract released the lease
    expect((h.tables as ReturnType<typeof memoryTableClient>).rows('ingest_batches')[0]).toMatchObject({status:'failed'});
   }finally{vi.useRealTimers();}
  });
  it('a stalled upload ends the document as object_put_failed in time and leaves the lease to expire; the batch is finalized',async()=>{
   vi.useFakeTimers();
   try{
    const h=harness();const doc=await seedPublicDocument(h.db,enc('%PDF-stall-put'),{},h.store);
    const stalled=withOverride<ObjectStore>(h.store,{put:()=>new Promise<'created'>(()=>{})});
    const p=run(budgeted(h,{store:stalled}));
    await vi.advanceTimersByTimeAsync(110_000);
    const r=await p;
    expect(r.documents).toEqual([{documentId:doc,outcome:'failed',code:'object_put_failed'}]);
    expect(await h.db.documentById(doc)).toMatchObject({status:'stored',current_extraction_id:null,extract_attempts:1});
    expect((await h.db.documentById(doc))!.extract_lease_until).not.toBeNull();
    expect((h.tables as ReturnType<typeof memoryTableClient>).rows('ingest_batches')[0]).toMatchObject({status:'failed'});
   }finally{vi.useRealTimers();}
  });
 });
});
