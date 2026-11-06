// src/lib/documents/db.test.ts
// memoryDocumentsDb against the shared contract, memory-only rules (injectable clock, validation
// before any write), and the supabaseDocumentsDb wiring (rpc names and arguments, chunking, cursor
// codec, envelope and row normalisation, error mapping, approval_revoked outcome) over a stub client.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {REFS_CHUNK,WRITE_MAX,approvalFromRow,canonTs,tsSortKey,chunk,decodeCursor,documentFromRow,encodeCursor,supabaseDocumentsDb,toDocumentsDbError} from './db';
import {docInsert,documentsDbContract,extractionInsert,pageInsert} from './db-contract';
import {memoryDocumentsDb} from './memory-documents-db';
import {DocumentsDbError,EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from './types';

documentsDbContract('memoryDocumentsDb contract',async()=>{
 const db=memoryDocumentsDb();
 return {db,issuerId:randomUUID(),issuer:async()=>randomUUID(),batchId:async()=>randomUUID(),user:async()=>randomUUID(),
  expire:async(kind,key,source)=>{if(kind==='sync')db.expireSyncLease(key,source!);else if(kind==='extract')db.expireExtractLease(key);else db.expireCandidatesLease(key);},
  abandonPublication:async(candidate,gen)=>{const p=db._raw.publications.get(`${candidate}|${gen}`);if(p)p.state='abandoned';}};
});

describe('memoryDocumentsDb specifics',()=>{
 it('expires every lease kind against the injected clock',async()=>{
  const db=memoryDocumentsDb();const iss=randomUUID();const b1=randomUUID();const b2=randomUUID();
  db.setNow('2026-01-01T00:00:00.000Z');
  await db.reconcileScope('hkexnews',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'00268'}]);
  expect(await db.claimSyncLease(iss,'hkexnews',b1,60)).toBe(true);
  db.setNow('2026-01-01T00:00:59.000Z');expect(await db.claimSyncLease(iss,'hkexnews',b2,60)).toBe(false);
  db.setNow('2026-01-01T00:01:00.000Z');expect(await db.claimSyncLease(iss,'hkexnews',b2,60)).toBe(true);
  await expect(db.insertDocumentVersion(iss,'hkexnews',b1,docInsert(),[])).rejects.toMatchObject({code:'lease_lost'});
  const {document_id}=await db.insertDocumentVersion(iss,'hkexnews',b2,docInsert(),[]);
  expect(await db.claimExtractLease(document_id,b2,30)).toBe(true);
  expect(db.documents()[0]).toMatchObject({extract_lease_until:'2026-01-01T00:01:30.000Z',extract_attempts:1});
  db.setNow('2026-01-01T00:01:30.000Z');
  await expect(db.finishExtract(document_id,b2,extractionInsert(1),[pageInsert(1,'x')])).rejects.toMatchObject({code:'lease_lost'});
  expect(await db.claimExtractLease(document_id,b1,30)).toBe(true);
  expect(db.documents()[0].extract_attempts).toBe(2);
 });
 it('validates a whole call before writing: a bad page leaves no extraction, a bad asset leaves no document',async()=>{
  const db=memoryDocumentsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('edgar',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'0000000001'}]);await db.claimSyncLease(iss,'edgar',b,600);
  await expect(db.insertDocumentVersion(iss,'edgar',b,docInsert({source:'edgar',market:'US',language:'en'}),[{role:'filing_index',filename:'i.json',source_url:'u',content_sha256:'bad',bytes:1,mime:'application/json',storage_path:'p',acquisition:{}}])).rejects.toMatchObject({code:'invalid_input'});
  expect(db.documents()).toEqual([]);expect(db.assets()).toEqual([]);
  const {document_id}=await db.insertDocumentVersion(iss,'edgar',b,docInsert({source:'edgar',market:'US',language:'en'}),[]);
  await db.claimExtractLease(document_id,b,600);
  await expect(db.finishExtract(document_id,b,extractionInsert(2),[pageInsert(1,'a'),pageInsert(2,'b',{char_count:5})])).rejects.toMatchObject({code:'invalid_input'});
  expect(db.extractions()).toEqual([]);expect(db.pages()).toEqual([]);
  expect(db.documents()[0]).toMatchObject({status:'stored',extract_lease_batch_id:b});
 });
 it('returns copies: mutating a returned row does not change the store',async()=>{
  const db=memoryDocumentsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('hkexnews',[{issuer_id:iss,reasons:['a'],priority:1,fetch_key:'00268'}]);await db.claimSyncLease(iss,'hkexnews',b,600);
  const {document_id}=await db.insertDocumentVersion(iss,'hkexnews',b,docInsert(),[]);
  const row=(await db.documentById(document_id))!;row.title='changed';(row.acquisition as {http_status?:number}).http_status=500;
  expect((await db.documentById(document_id))!).toMatchObject({title:'二零二五年年報',acquisition:{http_status:200}});
  (await db.scopeRows('hkexnews',[iss]))[0].reasons.push('x');
  expect((await db.scopeRows('hkexnews',[iss]))[0].reasons).toEqual(['a']);
 });
});

describe('cursor codec and chunking',()=>{
 it('round-trips the sort key and refuses anything else as invalid_input',()=>{
  const c=encodeCursor(['2026-01-01T00:00:00.123456+00:00','b3c1e9d0-0000-4000-8000-000000000001']);
  expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeCursor(c)).toEqual(['2026-01-01T00:00:00.123456+00:00','b3c1e9d0-0000-4000-8000-000000000001']);
  expect(decodeCursor(encodeCursor([3]))).toEqual([3]);
  for(const bad of ['%%%',encodeCursor([]),Buffer.from('{"a":1}').toString('base64url'),Buffer.from('[null]').toString('base64url')])expect(()=>decodeCursor(bad)).toThrow(DocumentsDbError);
 });
 it('chunks without an empty tail',()=>{
  expect(chunk([1,2,3,4,5],2)).toEqual([[1,2],[3,4],[5]]);
  expect(chunk([],2)).toEqual([]);
 });
});

describe('toDocumentsDbError',()=>{
 it('maps SQLSTATE and the code-as-first-word convention',()=>{
  expect(toDocumentsDbError({message:'lease_lost',code:'55P03'})).toMatchObject({name:'DocumentsDbError',code:'lease_lost'});
  expect(toDocumentsDbError({message:'canceling statement due to lock timeout',code:'55P03'}).code).toBe('lease_lost');
  for(const c of ['not_eligible','revision_exists','approval_revoked','not_publishable','decided','already_staged','not_found'] as const)expect(toDocumentsDbError({message:c,code:'P0001'}).code).toBe(c);
  expect(toDocumentsDbError({message:'invalid_citation: snippet',code:'22023'})).toMatchObject({code:'invalid_citation',message:'invalid_citation: snippet'});
  expect(toDocumentsDbError({message:'new row for relation "extraction_approvals" violates check constraint "ea_threshold"',code:'23514'}).code).toBe('invalid_input');
  expect(toDocumentsDbError({message:'invalid input syntax for type uuid',code:'22P02'}).code).toBe('invalid_input');
  expect(toDocumentsDbError({message:'duplicate key value',code:'23505'}).code).toBe('unknown');
  expect(toDocumentsDbError({message:'boom'}).code).toBe('unknown');
  const e=new DocumentsDbError('decided');expect(toDocumentsDbError(e)).toBe(e);
 });
});

// ---------------------------------------------------------------- supabaseDocumentsDb over a stub client
type Call={fn:string;args:Record<string,unknown>};
function stub(answers:Record<string,(args:Record<string,unknown>)=>unknown>,tables:Record<string,unknown[]>={}){
 const calls:Call[]=[];const queries:{table:string;ops:[string,unknown[]][]}[]=[];
 const client={
  rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});const a=answers[fn];if(!a)return {data:null,error:{message:`no stub for ${fn}`}};const r=a(args);return r instanceof Error?{data:null,error:{message:r.message,code:'P0001'}}:{data:r,error:null};},
  from:(table:string)=>{
   const q={table,ops:[] as [string,unknown[]][]};queries.push(q);
   const builder:Record<string,unknown>={};
   for(const op of ['select','eq','gt','lte','in','is','or','order','limit','insert','update'])builder[op]=(...a:unknown[])=>{q.ops.push([op,a]);return builder;};
   builder.maybeSingle=()=>Promise.resolve({data:(tables[table]??[])[0]??null,error:null});
   builder.single=()=>Promise.resolve({data:(tables[table]??[])[0]??null,error:null});
   builder.then=(res:(v:unknown)=>unknown,rej:(e:unknown)=>unknown)=>Promise.resolve({data:tables[table]??[],error:null}).then(res,rej);
   return builder;
  },
 };
 return {db:supabaseDocumentsDb(client as unknown as SupabaseClient),calls,queries};
}
const pgDocRow={document_id:'d1',issuer_id:'i1',source:'hkexnews',market:'HK',source_ref:'r_c',source_version:1,supersedes_document_id:null,observed_replacement:false,form_type:null,doc_class:'annual_report',
 classifier_gen:1,title:'t',language:'zh',source_url:'u',content_sha256:'a'.repeat(64),bytes:'1024',mime:'application/pdf',storage_path:'blobs/x.pdf',acquisition:{http_status:200},
 published_at:'2026-03-20 09:00:00.123456+00',published_at_precision:'instant',available_at:'2026-03-20T09:00:00.123456+00:00',available_date:'2026-03-20',fiscal_year:2025,fiscal_period:'FY',
 period_end:'2025-12-31',filing_source_ref:null,permission:'public',owner_user_id:null,license_ref:null,status:'stored',current_extraction_id:null,extract_lease_until:null,
 extract_lease_batch_id:null,extract_attempts:0,batch_id:'b1',code_version:'c',created_at:'2026-03-20T09:00:01+00:00'};

describe('supabaseDocumentsDb wiring',()=>{
 it('calls each write function with p_* arguments; requestExtract passes the current versions',async()=>{
  const {db,calls}=stub({
   claim_document_sync_lease:()=>true,insert_document_version:()=>({outcome:'inserted',document_id:'d1'}),finish_document_extract:()=>'e1',request_document_extract:()=>null,
   reconcile_document_sync_scope:()=>2,decide_candidate:()=>({status:'confirmed'}),request_candidates_regen:()=>3,publish_citations:()=>1,insert_citation:()=>'c1',
  });
  expect(await db.claimSyncLease('i','hkexnews','b',600)).toBe(true);
  const doc=docInsert();
  expect(await db.insertDocumentVersion('i','hkexnews','b',doc,[])).toEqual({outcome:'inserted',document_id:'d1'});
  expect(await db.finishExtract('d','b',extractionInsert(1),[pageInsert(1,'x')])).toBe('e1');
  await db.requestExtract('d','actor');
  expect(await db.reconcileScope('hkexnews',[])).toBe(2);
  expect(await db.decideCandidate('c',{kind:'auto',approval_id:'a'})).toEqual({status:'confirmed'});
  expect(await db.requestCandidatesRegen({source:'hkexnews',issuer_id:undefined},'actor')).toBe(3);
  expect(calls.map(c=>c.fn)).toEqual(['claim_document_sync_lease','insert_document_version','finish_document_extract','request_document_extract','reconcile_document_sync_scope','decide_candidate','request_candidates_regen']);
  expect(calls[0].args).toEqual({p_issuer:'i',p_source:'hkexnews',p_batch:'b',p_ttl:600});
  expect(calls[1].args).toMatchObject({p_issuer:'i',p_source:'hkexnews',p_batch:'b',p_assets:[]});expect(calls[1].args.p_doc).toEqual(doc);
  expect(calls[3].args).toEqual({p_document:'d',p_actor:'actor',p_extractor_version:EXTRACTOR_VERSION,p_table_algo_version:TABLE_ALGO_VERSION});
  expect(calls[5].args).toEqual({p_candidate:'c',p_decision:{kind:'auto',approval_id:'a'}});
  expect(calls[6].args).toEqual({p_filter:{source:'hkexnews'},p_actor:'actor'});
 });
 it('turns the committed approval_revoked outcome into a DocumentsDbError and maps raised errors',async()=>{
  const {db}=stub({stage_candidate_publication:a=>a.p_pub_gen===1?{outcome:'approval_revoked'}:{outcome:'staged'},finish_candidates:()=>new Error('lease_lost')});
  await expect(db.stageCandidatePublication('c',1,'r','f')).rejects.toMatchObject({name:'DocumentsDbError',code:'approval_revoked'});
  await expect(db.stageCandidatePublication('c',2,'r','f')).resolves.toBeUndefined();
  await expect(db.finishCandidates('e','b','done')).rejects.toMatchObject({code:'lease_lost'});
 });
 it('candidate writes are ONE rpc each (no chunking, F3 review) and refuse more than WRITE_MAX rows before any call; source refs are still chunked; an empty write still makes one call so the lease is checked',async()=>{
  const {db,calls}=stub({insert_candidates:a=>({inserted:(a.p_rows as unknown[]).length}),write_candidate_checks:a=>({written:(a.p_rows as unknown[]).length,inherited:1}),known_source_refs:a=>(a.p_refs as string[]).filter(r=>r.endsWith('7'))});
  const rows=(n:number)=>Array.from({length:n},(_,i)=>({kind:'field',natural_key:String(i)}) as never);
  expect(await db.insertCandidates('e','b',rows(WRITE_MAX))).toEqual({inserted:WRITE_MAX});
  expect(await db.writeCandidateChecks('e','b',[])).toEqual({written:0,inherited:1});
  await expect(db.insertCandidates('e','b',rows(WRITE_MAX+1))).rejects.toMatchObject({code:'invalid_input'});
  await expect(db.writeCandidateChecks('e','b',rows(WRITE_MAX+1))).rejects.toMatchObject({code:'invalid_input'});
  const refs=Array.from({length:REFS_CHUNK+3},(_,i)=>`r${i}`);
  expect([...await db.knownSourceRefs('i','cninfo',refs)].length).toBe(refs.filter(r=>r.endsWith('7')).length);
  expect(calls.map(c=>[c.fn,(c.args.p_rows??c.args.p_refs) as unknown[]]).map(([f,r])=>[f,(r as unknown[]).length])).toEqual([['insert_candidates',WRITE_MAX],['write_candidate_checks',0],['known_source_refs',REFS_CHUNK],['known_source_refs',3]]);
 });
 it('readDocuments sends the SQL cursor object and returns an opaque next cursor; rows are normalised',async()=>{
  const {db,calls}=stub({read_documents:()=>({rows:[pgDocRow],row_count:1,next_cursor:{available_at:'2026-03-20T09:00:00.123456+00:00',document_id:'d1'}})});
  const p=await db.readDocuments('i',{asOf:'2026-04-01',limit:1});
  expect(p.rows[0]).toMatchObject({bytes:1024,published_at:'2026-03-20T09:00:00.123456Z',available_at:'2026-03-20T09:00:00.123456Z',created_at:'2026-03-20T09:00:01.000Z'});
  expect(decodeCursor(p.nextCursor!)).toEqual(['2026-03-20T09:00:00.123456+00:00','d1']);
  await db.readDocuments('i',{asOf:'2026-04-01',limit:1,cursor:p.nextCursor,source:'hkexnews',allVersions:true});
  expect(calls[1].args).toEqual({p_issuer:'i',p_as_of:'2026-04-01',p_source:'hkexnews',p_doc_class:null,p_from:null,p_to:null,p_cursor:{available_at:'2026-03-20T09:00:00.123456+00:00',document_id:'d1'},p_limit:1,p_all_versions:true});
  await expect(db.readDocuments('i',{asOf:'2026-04-01',limit:1001})).rejects.toMatchObject({code:'invalid_input'});
 });
 it('approvalsFor reads unrevoked rows with limit + 1 and refuses more than the limit',async()=>{
  const row={approval_id:'a',extractor_ref:'r',extractor_version:'v',table_algo_version:'t',code_version:'c',concepts:['revenue'],gold_sha256:'g',precision:0.96,recall:'0.970',report_path:'p',approved_by:'u',approved_at:'2026-01-01T00:00:00+00:00',revoked_at:null};
  const {db,queries}=stub({},{extraction_approvals:[row,row]});
  await expect(db.approvalsFor('r',{limit:1})).rejects.toMatchObject({code:'too_many_approvals'});
  expect(queries[0].ops).toContainEqual(['is',['revoked_at',null]]);expect(queries[0].ops).toContainEqual(['limit',[2]]);
  expect((await db.approvalsFor('r',{limit:5}))[0]).toMatchObject({precision:'0.96',recall:'0.97',approved_at:'2026-01-01T00:00:00.000Z'});
  const sel=queries[0].ops.find(o=>o[0]==='select')![1][0] as string;   // numeric columns come back as text: no digit lost
  expect(sel).toContain('precision::text');expect(sel).toContain('recall::text');
 });
 it('approvalFromRow keeps every digit of a text numeric and maps a NULL concept to null, not "null"',()=>{
  const a=approvalFromRow({approval_id:'a',extractor_ref:'r',extractor_version:'v',table_algo_version:'t',code_version:'c',concepts:['revenue',null],gold_sha256:'g',precision:'0.9500000000000000001',recall:'1.000',report_path:'p',approved_by:'u',approved_at:'2026-01-01T00:00:00+00:00',revoked_at:null});
  expect(a.concepts).toEqual(['revenue',null]);expect(a.precision).toBe('0.9500000000000000001');expect(a.recall).toBe('1');
 });
 it('extractionsOf refuses a cursor that is not (timestamp, uuid) before building the filter; scopeAll pages by keyset, not offset',async()=>{
  const {db,queries}=stub({},{document_extractions:[]});
  for(const bad of [['2026-01-01T00:00:00Z','x)'],['x),or(1=1','b3c1e9d0-0000-4000-8000-000000000001'],[5,'b3c1e9d0-0000-4000-8000-000000000001']])
   await expect(db.extractionsOf('d1',{limit:5,cursor:encodeCursor(bad as (string|number)[])})).rejects.toMatchObject({code:'invalid_input'});
  expect(queries).toHaveLength(0);
  await db.extractionsOf('d1',{limit:5,cursor:encodeCursor(['2026-01-01T00:00:00.123456+00:00','b3c1e9d0-0000-4000-8000-000000000001'])});
  expect(queries).toHaveLength(1);
  const mk=(n:number,from:number)=>Array.from({length:n},(_,i)=>({issuer_id:`i${String(from+i).padStart(5,'0')}`,source:'hkexnews',priority:1,fetch_key:'k',reasons:[],next_due_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}));
  const answers=[mk(1000,0),mk(3,1000)];const ops:[string,unknown[]][][]=[];
  const client={from:()=>{const q:[string,unknown[]][]=[];ops.push(q);const b:Record<string,unknown>={};
   for(const op of ['select','eq','gt','order','limit'])b[op]=(...a:unknown[])=>{q.push([op,a]);return b;};
   b.then=(res:(v:unknown)=>unknown)=>Promise.resolve({data:answers[ops.length-1],error:null}).then(res);return b;}};
  const all=await supabaseDocumentsDb(client as unknown as SupabaseClient).scopeAll('hkexnews');
  expect(all).toHaveLength(1003);
  expect(ops[0].some(o=>o[0]==='gt')).toBe(false);
  expect(ops[1]).toContainEqual(['gt',['issuer_id','i00999']]);
  expect(ops.flat().some(o=>o[0]==='range')).toBe(false);
 });
 it('P2-1: limit + 1 look-ahead reads never ask PostgREST for more than its 1,000-row ceiling, so pagination and overflow stay correct',async()=>{
  const versions=Array.from({length:1001},(_,i)=>({...pgDocRow,document_id:`d${i+1}`,source_version:i+1}));
  const {db,queries}=stub({},{disclosure_documents:versions});
  const limitOf=(k:number)=>queries[k].ops.find(o=>o[0]==='limit')![1][0] as number;
  const page=await db.documentVersions('cninfo','r_c',{limit:1000});
  expect(limitOf(0)).toBe(1000);                                    // 999 + the look-ahead row: within max_rows = 1000, so the look-ahead survives …
  expect(page.rows).toHaveLength(999);expect(page.nextCursor).not.toBeNull();   // … and the page knows there is more
  await db.extractionsOf('d1',{limit:1000});
  expect(limitOf(1)).toBe(1000);
  await expect(db.approvalsFor('r',{limit:1000})).rejects.toMatchObject({code:'invalid_input'});
  expect(queries).toHaveLength(2);                                  // refused before any request
 });
 it('documentFromRow normalises pg text, PostgREST json and to_jsonb rows alike',()=>{
  const a=documentFromRow(pgDocRow);const b=documentFromRow({...pgDocRow,bytes:1024,published_at:'2026-03-20T09:00:00.123456+00:00'});
  expect(a).toEqual(b);expect(a.acquisition).toEqual({http_status:200});expect(a.fiscal_year).toBe(2025);
 });
});

// F3 recheck N1 + Task 3 review: canonTs defines the writer grammar; tsSortKey orders across widths and the epoch
describe('canonTs / tsSortKey',()=>{
 it('keeps up to 6 fractional digits, trimming to 3 when the sub-millisecond part is zero',()=>{
  expect(canonTs('2026-03-20T09:00:00Z')).toBe('2026-03-20T09:00:00.000Z');
  expect(canonTs('2026-03-20 09:00:00.1+00')).toBe('2026-03-20T09:00:00.100Z');
  expect(canonTs('2026-03-20T09:00:00.000001Z')).toBe('2026-03-20T09:00:00.000001Z');
  expect(canonTs('2026-03-20T17:00:00.123456+08:00')).toBe('2026-03-20T09:00:00.123456Z');
 });
 it('rounds beyond microseconds half-to-even, carrying across seconds',()=>{
  expect(canonTs('2026-03-20T09:00:00.1234565Z')).toBe('2026-03-20T09:00:00.123456Z');   // tie, 6 is even
  expect(canonTs('2026-03-20T09:00:00.1234575Z')).toBe('2026-03-20T09:00:00.123458Z');   // tie, 7 is odd
  expect(canonTs('2026-03-20T09:00:00.12345651Z')).toBe('2026-03-20T09:00:00.123457Z');
  expect(canonTs('2026-03-20T09:00:59.9999995Z')).toBe('2026-03-20T09:01:00.000Z');       // tie, 999999 is odd, carries
 });
 it('pre-1970 sub-millisecond values floor, never print negative digits',()=>{
  expect(canonTs('1969-12-31T23:59:59.123456Z')).toBe('1969-12-31T23:59:59.123456Z');
  expect(canonTs('1969-12-31T15:59:59.999999-08:00')).toBe('1969-12-31T23:59:59.999999Z');
  expect(canonTs('1969-12-31T23:59:59.999999Z')).toBe('1969-12-31T23:59:59.999999Z');
  expect(canonTs('1970-01-01T00:00:00.000001Z')).toBe('1970-01-01T00:00:00.000001Z');
  const k=['1970-01-01T00:00:00.000001Z','1969-12-31T23:59:59.999999Z','1970-01-01T00:00:00Z','1969-12-31T23:59:59.5Z'].map(x=>tsSortKey(x)!);
  expect([...k].sort()).toEqual([k[3],k[1],k[2],k[0]]);
 });
 it('rejects what PostgreSQL would read in the session zone or differently',()=>{
  for(const bad of ['2026-03-20T09:00:00','2026-03-20','2026-03-20 09:00','2026-02-31T00:00:00Z','2026-03-20T09:00:60Z','2026-13-01T00:00:00Z','0999-01-01T00:00:00Z','10000-01-01T00:00:00Z','not a time',''])expect(canonTs(bad),bad).toBeNull();
  expect(canonTs('0099-03-20T00:00:00Z')).toBeNull();   // year < 1000 is out of the supported range; Date.UTC would have said 1999
 });
 it('sort keys order .123Z before .123456Z before .124Z',()=>{
  const k=['2026-03-20T09:00:00.124Z','2026-03-20T09:00:00.123456Z','2026-03-20T09:00:00.123Z'].map(x=>tsSortKey(x)!);
  expect([...k].sort()).toEqual([k[2],k[1],k[0]]);
 });
 it('Task 3 recheck N1: the row reader accepts any year PostgreSQL stores (0001–9999, UTC); writers keep 1000–9999',()=>{
  expect(documentFromRow({...pgDocRow,published_at:'0999-03-20 00:00:00+00'}).published_at).toBe('0999-03-20T00:00:00.000Z');
  expect(documentFromRow({...pgDocRow,published_at:'0001-01-01 00:00:00+00'}).published_at).toBe('0001-01-01T00:00:00.000Z');
  expect(documentFromRow({...pgDocRow,published_at:'0999-03-20 08:00:00+08'}).published_at).toBe('0999-03-20T00:00:00.000Z');
  expect(canonTs('0999-03-20T00:00:00Z')).toBeNull();
  expect(()=>documentFromRow({...pgDocRow,published_at:'0000-01-01 00:00:00+00'})).toThrow();
 });
 it('Task 3 recheck N2/N3: memory validates timestamps at entry, before any state change or duplicate return',async()=>{
  const db=memoryDocumentsDb();const iss=randomUUID();const b=randomUUID();db.setNow('2026-01-01T00:00:00.000Z');
  await db.reconcileScope('hkexnews',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'00268'}]);
  await db.claimSyncLease(iss,'hkexnews',b,600);
  for(const bad of ['2026-02-31T00:00:00Z','','2026-01-01T00:00:00'])
   await expect(db.releaseSyncLease(iss,'hkexnews',b,'success',bad)).rejects.toMatchObject({code:'invalid_input'});
  expect(db.scope()[0]).toMatchObject({lease_batch_id:b,last_status:null,last_success_at:null});   // nothing changed
  const doc=docInsert();
  await db.insertDocumentVersion(iss,'hkexnews',b,doc,[]);
  await expect(db.insertDocumentVersion(iss,'hkexnews',b,{...doc,published_at:'2026-03-20T09:00:00'},[])).rejects.toMatchObject({code:'invalid_input'});   // a duplicate would otherwise return first
  await expect(db.insertDocumentVersion(iss,'hkexnews',b,{...doc,available_at:'nope'},[])).rejects.toMatchObject({code:'invalid_input'});
  const owner=randomUUID();const up=docInsert({source:'upload',source_url:null,permission:'private',owner_user_id:owner});
  await db.insertUploadDocument(owner,up);
  await expect(db.insertUploadDocument(owner,{...up,published_at:'bad'})).rejects.toMatchObject({code:'invalid_input'});
 });
 it('the row mapper refuses an unparsable timestamp with a DocumentsDbError, never a RangeError',()=>{
  expect(()=>documentFromRow({...pgDocRow,published_at:'garbage'})).toThrowError(expect.objectContaining({code:'unknown',message:'bad_timestamp'}));
 });
});
