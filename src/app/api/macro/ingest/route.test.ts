// src/app/api/macro/ingest/route.test.ts
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import type {MacroDeps} from '@/lib/macro/deps';
import {evidencePath} from '@/lib/macro/evidence';
import {MacroDbError} from '@/lib/macro/db';
import {memoryMacroDb} from '@/lib/macro/memory-db';
import {parserFor} from '@/lib/macro/parsers';
import type {EvidenceInput} from '@/lib/macro/types';

const mocks=vi.hoisted(()=>({deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/macro/deps',()=>({productionMacroDeps:mocks.deps}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
// Typed loosely (Record) so cases can resolve other receipts (stale / failed) or reject (fenced); 4 params like publishRegion.
const publishMock=vi.hoisted(()=>vi.fn(async(_deps:unknown,region:string,_today?:string,_opts?:unknown):Promise<Record<string,unknown>>=>({status:'published',region,snapshot_id:'s-1',revision:1,observation_count:0,regime:'null',uncovered_weight:0,attempts:1,hook:'skipped',replayed:false})));
vi.mock('@/lib/macro/snapshots',()=>({publishRegion:publishMock}));

import {POST} from './route';

// Real CN evidence recorded in Task 8.
interface FixtureFile{series_id:string;file:string;url:string;status:number;content_type:string;fetched_at:string;sha256:string}
const manifest:{files:FixtureFile[]}=JSON.parse(readFileSync(new URL('../../../../lib/macro/fixtures/cn/manifest.json',import.meta.url),'utf8'));
const claimsBySeries:Record<string,{series_id:string;period_label:string;value_text:string}[]>=JSON.parse(readFileSync(new URL('../../../../lib/macro/fixtures/cn/claims.json',import.meta.url),'utf8'));
const evidenceOf=(f:FixtureFile)=>({series_id:f.series_id,sha256:f.sha256,url:f.url,status:f.status,content_type:f.content_type,fetched_at:f.fetched_at,
 bytes_b64:readFileSync(new URL(`../../../../lib/macro/fixtures/cn/${f.file}`,import.meta.url)).toString('base64')});
const ALL_EVIDENCE=manifest.files.map(evidenceOf);
// The collector now trims SAFE claims to the first date of the HTML (b503e32); the recorded claims.json predates that, so trim the same way.
const SAFE_FIRST=Math.min(...manifest.files.filter(f=>f.series_id==='CN_USDCNY_CP_D').flatMap(f=>parserFor(f.series_id)!.parse(new Uint8Array(readFileSync(new URL(`../../../../lib/macro/fixtures/cn/${f.file}`,import.meta.url)))).map(p=>Date.parse(p.periodEnd))));
const ALL_CLAIMS=Object.values(claimsBySeries).flat().filter(c=>c.series_id!=='CN_USDCNY_CP_D'||Date.parse(c.period_label)>=SAFE_FIRST);
const RECORDED=new Date(Math.max(...manifest.files.map(f=>Date.parse(f.fetched_at)))+60_000);

const SECRET='ingest-secret';
const post=(body:unknown,headers:Record<string,string>={authorization:`Bearer ${SECRET}`})=>POST(new Request('https://alpha.example/api/macro/ingest',{method:'POST',headers:{'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
const original=process.env.MACRO_INGEST_SECRET;
function fakeEvidence(){const puts:EvidenceInput[]=[];return {puts,async put(e:EvidenceInput){puts.push(e);return {objectPath:evidencePath(e.adapter,e.sha256,e.contentType),status:'stored' as const};}};}

let deps:MacroDeps,mem:ReturnType<typeof memoryMacroDb>,tables:ReturnType<typeof memoryTableClient>,evidence:ReturnType<typeof fakeEvidence>,clock:Date;
beforeEach(()=>{
 vi.clearAllMocks();process.env.MACRO_INGEST_SECRET=SECRET;clock=RECORDED;tokens.clear();
 tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset']});evidence=fakeEvidence();mem=memoryMacroDb({tables});   // tables: finalizeBatch / recordFreshness (第 6 稿)
 deps={db:mem,evidence,tables,codeVersion:'b'.repeat(40),now:()=>clock,fetch:(()=>{throw new Error('no fetch in ingest');}) as unknown as typeof fetch,sleep:async()=>{}};
 mocks.deps.mockImplementation(()=>deps);mocks.codeVersion.mockReturnValue('b'.repeat(40));
});
afterEach(()=>{if(original===undefined)delete process.env.MACRO_INGEST_SECRET;else process.env.MACRO_INGEST_SECRET=original;});

/** owner tokens by batch id (第 5 稿 P1-3): every chunk / finish body carries the token its start returned. */
const tokens=new Map<string,string>();
const NO_TOKEN='00000000-0000-4000-8000-000000000000';
const startBatch=async(extra:Record<string,unknown>={})=>{
 const res=await post({action:'start',tool_versions:{akshare:'1.20.35',python:'3.12.13',collector:'macro-collect/1'},...extra});expect(res.status).toBe(200);
 const body=await res.json() as {batch_id:string;owner_token:string};
 expect(body.owner_token).toMatch(/^[0-9a-f-]{36}$/);tokens.set(body.batch_id,body.owner_token);
 return body.batch_id;
};
const chunkBody=(batch_id:string,seq=0,total=1,evidence=ALL_EVIDENCE,claims=ALL_CLAIMS)=>({action:'chunk',batch_id,owner_token:tokens.get(batch_id)??NO_TOKEN,seq,total,evidence,claims});
const finishBody=(batch_id:string,total=1,series_outcomes:{series_id:string;ok:boolean;code?:string}[]=[])=>({action:'finish',batch_id,owner_token:tokens.get(batch_id)??NO_TOKEN,total,series_outcomes});
/** Every fixture series reported ok. */
const OK=[...new Set(manifest.files.map(f=>f.series_id))].map(series_id=>({series_id,ok:true}));
// public reads hide rows of unfinished batches (landed since the plan): tests read the twin's ok rows directly
const history=async(id:string)=>mem.allObservations().filter(o=>o.series_id===id&&o.status==='ok').sort((a,b)=>a.period_end<b.period_end?-1:a.period_end>b.period_end?1:0);

describe('POST /api/macro/ingest — auth and body',()=>{
 it('is unavailable without MACRO_INGEST_SECRET and rejects a wrong bearer before building deps',async()=>{
  delete process.env.MACRO_INGEST_SECRET;
  expect((await post({action:'start',tool_versions:{a:'1'}})).status).toBe(503);
  process.env.MACRO_INGEST_SECRET=SECRET;
  expect((await post({action:'start',tool_versions:{a:'1'}},{authorization:'Bearer wrong'})).status).toBe(401);
  expect((await post({action:'start',tool_versions:{a:'1'}},{})).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();
 });
 it('rejects bodies over 4 MB, non-JSON and schema violations',async()=>{
  expect((await post('x'.repeat(4*1024*1024+1))).status).toBe(413);
  expect((await post('{nope')).status).toBe(400);
  const res=await post({action:'chunk',batch_id:'x',seq:0,total:1,evidence:[],claims:[]});
  expect(res.status).toBe(400);expect((await res.json()).error.code).toMatch(/^invalid_body:/);
  expect(mocks.deps).not.toHaveBeenCalled();
 });
});

describe('POST /api/macro/ingest — protocol',()=>{
 it('start takes the lease and returns an owner token: a second start is refused (its own batch finishes rejected); after 2 h the stale run is aborted',async()=>{
  const id=await startBatch();
  expect(tables.rows('ingest_batches')).toEqual([expect.objectContaining({batch_id:id,producer:'py-akshare',dataset:'macro.akshare',status:'running',triggered_by:'script'})]);
  expect(tables.rows('ingest_batches')[0].tool_versions).toMatchObject({akshare:'1.20.35',ingest:'macro-ingest/1'});
  expect(await mem.ingestRun(id)).toMatchObject({dataset:'macro.akshare',state:'open'});
  const again=await post({action:'start',tool_versions:{akshare:'1.20.35'}});
  expect(again.status).toBe(409);expect((await again.json()).error).toMatchObject({code:'batch_running',batch_id:id});
  expect(tables.rows('ingest_batches').filter(b=>b.status==='rejected')).toHaveLength(1);
  mem.setNow(new Date(Date.now()+3*3600_000).toISOString());                                     // the lease clock is the DB's (SQL now())
  const later=await post({action:'start',tool_versions:{akshare:'1.20.35'}});
  expect(later.status).toBe(200);
  expect(tables.rows('ingest_batches').find(b=>b.batch_id===id)).toMatchObject({status:'failed',errors:[{code:'aborted'}]});
  expect(await mem.ingestRun(id)).toMatchObject({state:'aborted',progress:{aborted:{reason:'max_age'}}});
  const stale=await post(chunkBody(id));                                                         // the old owner is fenced, not merely refused
  expect(stale.status).toBe(409);expect((await stale.json()).error.code).toBe('fenced');
 });
 it('two concurrent starts → exactly one batch holds the lease',async()=>{
  const res=await Promise.all([post({action:'start',tool_versions:{a:'1'}}),post({action:'start',tool_versions:{a:'1'}})]);
  expect(res.map(r=>r.status).sort()).toEqual([200,409]);
  expect(tables.rows('ingest_batches').map(b=>b.status).sort()).toEqual(['rejected','running']);
 });
 it('a chunk re-parses the evidence bytes in TS, writes every CN series and agrees with all located claims',async()=>{
  const id=await startBatch();
  const res=await post(chunkBody(id));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.status).toBe('accepted');
  expect(body.counts.failed).toBe(0);expect(body.counts.quarantined).toBe(0);
  expect(body.counts.inserted).toBe(body.counts.fetched);
  expect(evidence.puts.map(e=>e.sha256).sort()).toEqual(manifest.files.map(f=>f.sha256).sort());
  expect((await history('CN_PMI_MFG')).find(o=>o.period_end==='2026-10-31')?.value_text).toBe('49.3');
  const row=(await history('CN_CGB_10Y_D')).find(o=>o.period_end==='2026-11-05')!;
  expect(row.value_text).toBe('1.6038');expect(row.locator).toMatchObject({kind:'html_cell'});
  const ret=await deps.db.retrieval(row.retrieval_id!);
  expect(ret).toMatchObject({fetch_host:'yield.chinabond.com.cn',batch_id:id});
  expect(ret!.tool_versions).toMatchObject({akshare:'1.20.35',parser:'chinabond-history/1'});
 });
 it('a repeated seq returns the stored receipt and re-runs nothing',async()=>{
  const id=await startBatch();
  const first=await (await post(chunkBody(id))).json();const puts=evidence.puts.length;
  const res=await post(chunkBody(id));
  expect(await res.json()).toEqual({status:'duplicate',batch_id:id,seq:0,counts:first.counts,errors:first.errors});
  expect(evidence.puts.length).toBe(puts);
  expect(await deps.db.chunksOf(id)).toHaveLength(1);
 });
 it('two identical chunks in parallel are ingested once; a chunk still processing answers 409 chunk_in_progress',async()=>{
  const id=await startBatch();
  const res=await Promise.all([post(chunkBody(id)),post(chunkBody(id))]);
  const bodies=await Promise.all(res.map(r=>r.json()));
  expect(bodies.filter(b=>b.status==='accepted')).toHaveLength(1);
  expect(res.map(r=>r.status).every(s=>s===200||s===409)).toBe(true);
  expect(evidence.puts).toHaveLength(ALL_EVIDENCE.length);                                       // one ingestion
  expect((await (await post(finishBody(id))).json()).batch_id).toBe(id);                         // releases the lease
  const next=await startBatch();
  expect(await mem.claimChunk(next,0,1,tokens.get(next)!)).toEqual({status:'claimed'});             // another request holds seq 0
  const busy=await post(chunkBody(next));
  expect(busy.status).toBe(409);expect((await busy.json()).error.code).toBe('chunk_in_progress');
 });
 it('refuses the whole chunk when any evidence hash does not match, before any write',async()=>{
  const id=await startBatch();
  const tampered=[{...ALL_EVIDENCE[0],sha256:'0'.repeat(64)},...ALL_EVIDENCE.slice(1)];
  const res=await post(chunkBody(id,0,1,tampered));
  expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('sha256_mismatch');
  expect(evidence.puts).toEqual([]);expect(await deps.db.chunksOf(id)).toEqual([]);
 });
 it('quarantines a value whose AKShare claim disagrees (adapter_mismatch) and does not write it',async()=>{
  const id=await startBatch();
  const pmiClaims=claimsBySeries.CN_PMI_MFG;
  const target=pmiClaims[0];
  const claims=ALL_CLAIMS.map(c=>c===target?{...c,value_text:(Number(c.value_text)+0.1).toFixed(1)}:c);
  const body=await (await post(chunkBody(id,0,1,ALL_EVIDENCE,claims))).json();
  expect(body.counts.quarantined).toBe(1);
  expect(tables.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:'macro.akshare',table_name:'macro_observations',reason_code:'adapter_mismatch',batch_id:id})]);
  const key=String(tables.rows('dq_quarantine')[0].natural_key);
  const [sid,pe]=key.split('|');
  expect(sid).toBe('CN_PMI_MFG');
  expect((await history('CN_PMI_MFG')).some(o=>o.period_end===pe)).toBe(false);
 });
 it('claims without a parsed raw value are never quarantined; finish counts them once per batch (distinct keys), not per chunk',async()=>{
  const id=await startBatch();
  const extra={...claimsBySeries.CN_PMI_MFG[0],period_label:'1999年1月',value_text:'50.0'};   // no such month in the recorded bytes
  const pmi=ALL_EVIDENCE.filter(e=>e.series_id==='CN_PMI_MFG'),rest=ALL_EVIDENCE.filter(e=>e.series_id!=='CN_PMI_MFG');
  // the collector repeats a series' claims in every chunk that carries its evidence: send the PMI evidence twice
  const a=await (await post(chunkBody(id,0,3,pmi,[...ALL_CLAIMS,extra]))).json();
  await post(chunkBody(id,1,3,pmi,[...ALL_CLAIMS,extra]));
  await post(chunkBody(id,2,3,rest,ALL_CLAIMS));
  expect(a.counts.quarantined).toBe(0);
  expect(a.errors.some((e:{code:string})=>e.code==='skipped_summary')).toBe(false);              // never in a chunk receipt
  expect(tables.rows('dq_quarantine')).toEqual([]);
  const body=await (await post(finishBody(id,3))).json();
  const info=body.errors.filter((e:{code:string})=>e.code==='skipped_summary');
  expect(info).toEqual([{code:'skipped_summary',key:'unlocated_claims',message:'1 claims without a located raw value'}]);   // the 1999 claim, counted once
  expect(tables.rows('ingest_batches')[0].errors).toEqual(expect.arrayContaining([expect.objectContaining({code:'skipped_summary',key:'unlocated_claims'})]));
 });
 it('does not parse evidence from another host or path, nor evidence with an implausible fetched_at',async()=>{
  const id=await startBatch();
  const pmi=ALL_EVIDENCE.find(e=>e.series_id==='CN_PMI_MFG')!;
  const moved={...pmi,url:'https://mirror.example.com/dg/website/publicrelease/web/external/stream/esData'};
  const tree={...pmi,url:'https://data.stats.gov.cn/dg/website/publicrelease/web/external/new/queryIndexTreeAsync?pid=&code=1'};
  const future={...pmi,fetched_at:new Date(RECORDED.getTime()+3600_000).toISOString()};
  const body=await (await post(chunkBody(id,0,1,[moved,tree,future],[]))).json();
  expect(body.counts).toMatchObject({failed:3,inserted:0});
  expect(body.errors).toEqual([{code:'evidence_not_allowed',key:'CN_PMI_MFG'},{code:'evidence_not_allowed',key:'CN_PMI_MFG'},{code:'fetched_at_out_of_range',key:'CN_PMI_MFG'}]);
  expect(evidence.puts).toEqual([]);
 });
 it('finish requires every chunk, then sums counts, derives CN, finishes the batch and records freshness',async()=>{
  const id=await startBatch();
  const half=Math.ceil(ALL_EVIDENCE.length/2);
  const first=ALL_EVIDENCE.slice(0,half),second=ALL_EVIDENCE.slice(half);
  await post(chunkBody(id,0,2,first,ALL_CLAIMS));
  const early=await post(finishBody(id,2));
  expect(early.status).toBe(409);expect((await early.json()).error).toMatchObject({code:'chunks_incomplete',missing:[1]});
  await post(chunkBody(id,1,2,second,ALL_CLAIMS));
  const res=await post(finishBody(id,2,manifest.files.map(f=>({series_id:f.series_id,ok:true})).filter((o,i,a)=>a.findIndex(x=>x.series_id===o.series_id)===i)));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.status).toBe('success');expect(body.counts.failed).toBe(0);
  expect(tables.rows('ingest_batches')[0]).toMatchObject({batch_id:id,status:'success'});
  expect(tables.rows('dq_freshness')).toEqual([expect.objectContaining({dataset:'macro.akshare',expected_cadence:'daily',consecutive_errors:0,detail:{batch_id:id,batch_status:'success',failed_series:[]}})]);
  expect(await mem.ingestRun(id)).toMatchObject({state:'finished'});
  expect(await (await post(finishBody(id,2))).json()).toEqual(body);                             // a repeat replays the stored receipt
  expect((await history('CN_CPI_YOY')).find(o=>o.period_end==='2026-09-30')).toMatchObject({value_text:'0.9',transform:'index_minus_100@1',batch_id:id});
  expect((await history('CN_GDP_YOY')).find(o=>o.period_end==='2026-09-30')?.value_text).toBe('4.5');
  expect((await history('CN_CGB_10Y')).length).toBeGreaterThan(0);
  const late=await post(chunkBody(id,0,2,first,[]));
  expect(late.status).toBe(409);expect((await late.json()).error.code).toBe('batch_not_running');
 });
 it('refuses a total that differs from earlier chunks and unknown batches',async()=>{
  const id=await startBatch();
  await post(chunkBody(id,0,2,ALL_EVIDENCE.slice(0,1),[]));
  const res=await post(chunkBody(id,1,3,ALL_EVIDENCE.slice(1,2),[]));
  expect(res.status).toBe(409);expect((await res.json()).error.code).toBe('chunk_total_mismatch');
  const unknown=await post(finishBody('00000000-0000-4000-8000-00000000abcd'));
  expect(unknown.status).toBe(404);
 });
 it('a failed CN source travels as series_outcomes: the batch is partial and collection freshness records it (第 4 稿 P2-2)',async()=>{
  const id=await startBatch();
  await post(chunkBody(id));
  const body=await (await post(finishBody(id,1,[{series_id:'CN_PMI_MFG',ok:true},{series_id:'CN_M2_YOY',ok:false,code:'collect_runtimeerror'}]))).json();
  expect(body.status).toBe('partial');
  expect(body.counts.failed).toBe(1);
  expect(body.errors).toContainEqual({code:'collect_runtimeerror',key:'CN_M2_YOY'});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:0,detail:{batch_status:'partial',failed_series:['CN_M2_YOY']}});
 });
 it('every series failed: a finish with total 0 closes the batch as failed and counts an error attempt',async()=>{
  const id=await startBatch();
  const body=await (await post(finishBody(id,0,[{series_id:'CN_PMI_MFG',ok:false,code:'collect_timeout'}]))).json();
  expect(body).toMatchObject({status:'failed',counts:{fetched:0,failed:1}});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1});
 });
 it('a failed freshness write commits nothing: derivation and finalize never run twice and the retry records exactly one attempt (第 6 稿 P1-1)',async()=>{
  const id=await startBatch();
  await post(chunkBody(id));
  const upsert=tables.upsert.bind(tables);let broken=true;
  tables.upsert=async(t,r,c)=>{if(t==='dq_freshness'&&broken){broken=false;throw new Error('freshness down');}return upsert(t,r,c);};
  const first=await post(finishBody(id,1,OK));
  expect(first.status).toBe(500);
  expect(tables.rows('ingest_batches')[0]).toMatchObject({status:'success'});                    // finalizeBatch already happened
  expect(await mem.ingestRun(id)).toMatchObject({state:'finishing',progress:{derived:expect.any(Object),batch_finished:{status:'success'}}});
  expect((await mem.ingestRun(id))!.progress.freshness_recorded).toBeUndefined();                  // no checkpoint without the write
  const derivedRows=(await history('CN_CPI_YOY')).length;
  const second=await post(finishBody(id,1,OK));
  expect(second.status).toBe(200);
  expect(await second.json()).toMatchObject({batch_id:id,status:'success'});
  expect((await history('CN_CPI_YOY')).length).toBe(derivedRows);
  expect(tables.rows('dq_freshness')).toEqual([expect.objectContaining({dataset:'macro.akshare',consecutive_errors:0,status:'fresh'})]);   // recorded once, not lost
  expect(await mem.ingestRun(id)).toMatchObject({state:'finished',progress:{freshness_recorded:{ok:true,status:'fresh'}}});
 });
 for(const crashAt of ['derived','batch_finished','freshness'] as const){
  it(`crash right after the side effect of '${crashAt}', before the response: the retry completes and repeats nothing (第 5 稿 P1-4, 第 6 稿 P1-1)`,async()=>{
   const id=await startBatch();await post(chunkBody(id));
   let armed=true;
   if(crashAt==='freshness'){
    // the freshness transaction committed (upsert + checkpoint), then the lambda died before answering
    const fresh=mem.recordFreshness.bind(mem);
    mem.recordFreshness=async(b,input,fence)=>{const r=await fresh(b,input,fence);if(armed){armed=false;throw new Error('lambda killed');}return r;};
   }else{
    const record=mem.recordFinishStep.bind(mem);
    mem.recordFinishStep=async(b,name,data,fence)=>{if(armed&&name===crashAt){armed=false;throw new Error('lambda killed');}return record(b,name,data,fence);};
   }
   expect((await post(finishBody(id,1,OK))).status).toBe(500);
   const derivedRows=(await history('CN_CPI_YOY')).length;
   const second=await post(finishBody(id,1,OK));
   expect(second.status).toBe(200);expect(await second.json()).toMatchObject({batch_id:id,status:'success'});
   expect((await history('CN_CPI_YOY')).length).toBe(derivedRows);                                // re-derivation wrote duplicates only
   expect(tables.rows('ingest_batches').find(b=>b.batch_id===id)).toMatchObject({status:'success'});   // finished once (finalizeBatch read it back)
   expect(tables.rows('dq_freshness')).toEqual([expect.objectContaining({dataset:'macro.akshare',consecutive_errors:0})]);   // one attempt, never two
   expect(await mem.ingestRun(id)).toMatchObject({state:'finished'});
  });
 }
 it('concurrent finish: another owner is fenced; two finishes of the owner leave exactly one finisher; every step happens once (第 5 稿 P1-4)',async()=>{
  const id=await startBatch();await post(chunkBody(id));
  const intruder=await post({...finishBody(id,1,OK),owner_token:'00000000-0000-4000-8000-00000000dead'});
  expect(intruder.status).toBe(409);expect((await intruder.json()).error.code).toBe('fenced');
  const res=await Promise.all([post(finishBody(id,1,OK)),post(finishBody(id,1,OK))]);
  const out=await Promise.all(res.map(async r=>({status:r.status,body:await r.json()})));
  expect(out.some(o=>o.status===200)).toBe(true);
  for(const o of out)if(o.status!==200)expect([o.status,o.body.error.code]).toEqual([409,'fenced']);   // the older finisher, fenced at its next step
  expect(tables.rows('ingest_batches').find(b=>b.batch_id===id)).toMatchObject({status:'success'});
  expect(tables.rows('dq_freshness')).toEqual([expect.objectContaining({consecutive_errors:0})]);
  expect(await mem.ingestRun(id)).toMatchObject({state:'finished'});
  expect(await (await post(finishBody(id,1,OK))).json()).toMatchObject({batch_id:id,status:'success'});   // replay
 });
 it('takeover restart: a crash after observation writes leaves the chunk processing; start {takeover} after the processing timeout aborts it; the paused worker is fenced; the new batch succeeds; the old batch is failed (第 5 稿 P1-3/P2-1)',async()=>{
  const old=await startBatch();
  const complete=mem.completeChunk.bind(mem);let crash=true;
  mem.completeChunk=async(b,seq,result,token)=>{if(crash){crash=false;throw new Error('lambda killed');}return complete(b,seq,result,token);};
  expect((await post(chunkBody(old))).status).toBe(500);                                         // rows written, completeChunk never ran
  expect((await history('CN_PMI_MFG')).some(o=>o.batch_id===old)).toBe(true);
  expect(await mem.latestEligible(['CN_PMI_MFG'])).toEqual([]);                                  // a running batch is never eligible
  const stuck=await post(chunkBody(old));
  expect(stuck.status).toBe(409);expect((await stuck.json()).error.code).toBe('chunk_in_progress');
  const early=await post({action:'start',tool_versions:{a:'1'},takeover:true});                  // stalled for less than 10 minutes: busy
  expect(early.status).toBe(409);expect((await early.json()).error.code).toBe('batch_running');
  mem.setNow(new Date(Date.now()+11*60_000).toISOString());                                        // the lease clock is the DB's
  const fresh=await startBatch({takeover:true});
  expect(tables.rows('ingest_batches').find(b=>b.batch_id===old)).toMatchObject({status:'failed',errors:[{code:'aborted'}]});
  expect(await mem.ingestRun(old)).toMatchObject({state:'aborted',progress:{aborted:{by:fresh,reason:'stalled_chunk'}}});
  for(const late of [chunkBody(old),finishBody(old,1,OK)]){                                        // the paused old worker wakes up
   const r=await post(late);expect(r.status).toBe(409);expect((await r.json()).error.code).toBe('fenced');
  }
  expect((await post(chunkBody(fresh))).status).toBe(200);                                       // the whole collection again, new batch
  const body=await (await post(finishBody(fresh,1,OK))).json();
  expect(body.status).toBe('success');
  expect((await mem.latestEligible(['CN_PMI_MFG']))[0].batch_id).toBe(fresh);
 });
 it('every source failed after a previously populated successful run: no derivation, batch failed, freshness ok:false (第 5 稿 P2-2)',async()=>{
  const first=await startBatch();await post(chunkBody(first));
  expect((await (await post(finishBody(first,1,OK))).json()).status).toBe('success');
  const id=await startBatch();
  const body=await (await post(finishBody(id,0,OK.map(o=>({series_id:o.series_id,ok:false,code:'collect_timeout'}))))).json();
  expect(body).toMatchObject({status:'failed',native_counts:{inserted:0,duplicates:0,versioned:0},derived_counts:{fetched:0,duplicates:0}});
  expect(body.errors).toContainEqual({code:'no_native_outcomes'});
  expect(await mem.ingestRun(id)).toMatchObject({state:'finished',progress:{derived:{skipped:'no_native_outcomes'}}});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1,detail:{batch_status:'failed'}});
 });
 it('a chunk aborted by an unbindable quarantined row stores its committed outcomes once; finish forces the batch failed (四轮 P2-2)',async()=>{
  const id=await startBatch();
  // a later-dated different PMI value (another, finished batch) makes the chunk's 2026-10 value a stored stale_delivery whose
  // dq_quarantine item the memory db never sees → the link fails after the writes committed
  const seedBatch='00000000-0000-4000-8000-0000000000ee',sha='e'.repeat(64);
  mem.setBatchStatus(seedBatch,'running');   // the twin needs a declared running batch for writes
  const r=await mem.putRetrieval({sha256:sha,object_path:`akshare/${sha}.json`,adapter:'akshare',content_type:'application/json',byte_length:1},
   {fetch_url:'https://data.stats.gov.cn/x',fetch_host:'data.stats.gov.cn',http_status:200,fetched_at:RECORDED.toISOString(),batch_id:seedBatch,tool_versions:{}});
  await mem.writeObservations(seedBatch,'seed',[{series_id:'CN_PMI_MFG',period_end:'2026-10-31',value_text:'99',available_at:RECORDED.toISOString(),revisable:false,retrieval_id:r,locator:{kind:'json_pointer',pointer:'/x'}}]);
  mem.setBatchStatus(seedBatch,'success');   // finished: its rows are eligible
  const res=await post(chunkBody(id));
  expect(res.status).toBe(500);expect((await res.json()).error.code).toBe('quarantine_link_failed');
  const [c]=await mem.chunksOf(id);
  const mine=mem.allObservations().filter(o=>o.batch_id===id);
  expect(c.state).toBe('done');
  expect([c.counts.inserted,c.counts.quarantined]).toEqual([mine.filter(o=>o.status==='ok').length,mine.filter(o=>o.status==='quarantined').length]);   // = committed rows
  expect(c.native_usable).toBe(c.counts.inserted);
  expect(c.errors[0]).toMatchObject({code:'quarantine_link_failed'});
  expect(await (await post(chunkBody(id))).json()).toMatchObject({status:'duplicate',counts:c.counts});   // merged once: a retry reads it back
  const body=await (await post(finishBody(id,1,OK))).json();
  expect(body).toMatchObject({status:'failed',native_counts:c.counts});
  expect(tables.rows('ingest_batches').find(b=>b.batch_id===id)).toMatchObject({status:'failed',counts:body.counts});
  expect(await mem.latestEligible(['CN_PMI_MFG'])).toMatchObject([{batch_id:seedBatch}]);              // the failed batch's rows never publish
 });
 it('a rejected-only redelivery after a populated run is not usable data: no derivation, no_native_outcomes, freshness ok:false (第 6 稿 P2-1)',async()=>{
  const first=await startBatch();await post(chunkBody(first));
  expect((await (await post(finishBody(first,1,OK))).json()).status).toBe('success');
  const derivedBefore=(await history('CN_CPI_YOY')).length;
  // every value of the next collection was rejected earlier: the RPC inserts nothing and reports previously_rejected under
  // duplicates (that write rule is pinned in Task 1 / Task 3; here the route's gate is under test)
  const write=mem.writeObservations.bind(mem);
  mem.writeObservations=async(b,c,rows,t)=>rows.some(r=>'derived_from' in r)?write(b,c,rows,t):{inserted:0,duplicates:rows.length,versioned:0,quarantined:0,
   conflicts:rows.map(r=>({series_id:r.series_id,period_end:r.period_end,reason:'previously_rejected' as const,value_text:r.value_text,current_value_text:null,observation_id:'00000000-0000-4000-8000-0000000000cd'}))};
  const id=await startBatch();
  const chunk=await (await post(chunkBody(id))).json();
  expect(chunk.counts.duplicates).toBe(chunk.counts.fetched);expect(chunk.counts.inserted).toBe(0);
  expect((await mem.chunksOf(id))[0].native_usable).toBe(0);                                        // duplicates, but zero usable rows
  const body=await (await post(finishBody(id,1,OK))).json();
  expect(body).toMatchObject({status:'partial',native_usable:0,derived_counts:{fetched:0,inserted:0,duplicates:0}});   // shared DQ rule: duplicates landed → partial
  expect(body.errors).toContainEqual({code:'no_native_outcomes'});
  expect(await mem.ingestRun(id)).toMatchObject({state:'finished',progress:{derived:{skipped:'no_native_outcomes'},freshness_recorded:{ok:false}}});
  expect((await history('CN_CPI_YOY')).length).toBe(derivedBefore);                                  // no re-derivation from old history
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'macro.akshare',consecutive_errors:1,detail:{batch_id:id,batch_status:'partial'}});
 });

 it('evidence URLs compare host (with port) and reject userinfo (Task 9)',async()=>{
  const id=await startBatch();
  const pmi=ALL_EVIDENCE.find(e=>e.series_id==='CN_PMI_MFG')!;
  const u=new URL(pmi.url);
  const bad=[{...pmi,url:`${u.protocol}//user:pw@${u.host}${u.pathname}`},{...pmi,url:`${u.protocol}//${u.hostname}:8443${u.pathname}`}];
  const body=await (await post(chunkBody(id,0,1,bad,[]))).json();
  expect(body.errors).toEqual([{code:'evidence_not_allowed',key:'CN_PMI_MFG'},{code:'evidence_not_allowed',key:'CN_PMI_MFG'}]);
  expect(evidence.puts).toEqual([]);
 });
 it('T9-1: hash-verified bytes the parser rejects are still stored with a retrieval; the chunk error carries the retrieval id',async()=>{
  const id=await startBatch();
  const pmi=ALL_EVIDENCE.find(e=>e.series_id==='CN_PMI_MFG')!;
  const junk=new TextEncoder().encode('<html>not json</html>');
  const {createHash}=await import('node:crypto');
  const bad={...pmi,bytes_b64:Buffer.from(junk).toString('base64'),sha256:createHash('sha256').update(junk).digest('hex')};
  const res=await post(chunkBody(id,0,1,[bad],[]));
  expect(res.status).toBe(200);
  expect((await res.json()).errors).toEqual([{code:'parse_failed',key:'CN_PMI_MFG'}]);
  expect(evidence.puts.map(e=>e.sha256)).toEqual([bad.sha256]);
  const [c]=await mem.chunksOf(id);
  expect(c.counts.failed).toBe(1);
  expect(c.errors).toEqual([{code:'parse_failed',key:'CN_PMI_MFG',message:expect.stringMatching(/^retrieval [0-9a-f-]{36}: nbs_bad_json$/)}]);
  const rid=/^retrieval ([0-9a-f-]{36}):/.exec(c.errors[0].message!)![1];
  expect(await deps.db.retrieval(rid)).toMatchObject({sha256:bad.sha256,batch_id:id,fetch_host:'data.stats.gov.cn'});
 });
 it('T9-2/T9-3: derived counts and series_outcomes are frozen with the derived checkpoint; a resume reuses them and a changed payload is a 409',async()=>{
  const id=await startBatch();await post(chunkBody(id));
  const record=mem.recordFinishStep.bind(mem);let armed=true;
  mem.recordFinishStep=async(b,name,data,fence)=>{if(armed&&name==='batch_finished'){armed=false;throw new Error('lambda killed');}return record(b,name,data,fence);};
  expect((await post(finishBody(id,1,OK))).status).toBe(500);                                    // derived is checkpointed, batch_finished is not
  const prog=(await mem.ingestRun(id))!.progress.derived as {counts:{inserted:number};usable:number;series_outcomes:unknown[]};
  expect(prog.counts.inserted).toBeGreaterThan(0);expect(prog.usable).toBe(prog.counts.inserted);expect(prog.series_outcomes).toEqual(OK);
  const changed=OK.map((o,i)=>i===0?{...o,ok:false,code:'collect_timeout'}:o);
  const conflict=await post(finishBody(id,1,changed));
  expect(conflict.status).toBe(409);expect((await conflict.json()).error.code).toBe('finish_payload_conflict');
  expect(await mem.ingestRun(id)).toMatchObject({state:'finishing'});                             // the refused retry changed nothing
  const res=await post(finishBody(id,1,[...OK].reverse()));                                       // same outcomes, any order
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.status).toBe('success');
  expect(body.derived_counts.inserted).toBe(prog.counts.inserted);                                // the persisted counts, not duplicates from a recompute
  expect(body.derived_counts.duplicates).toBe(0);
 });
 it('a failed claimIngest finalizes the freshly started batch as failed (no orphan running batch)',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>undefined);
  mem.claimIngest=async()=>{throw new Error('lease db down');};
  const res=await post({action:'start',tool_versions:{a:'1'}});
  expect(res.status).toBe(500);
  expect(tables.rows('ingest_batches')).toEqual([expect.objectContaining({status:'failed',errors:[{code:'claim_failed'}]})]);
  log.mockRestore();
 });
});

describe('POST /api/macro/ingest — Task 11 publication',()=>{
 const DATE=expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/);
 const fenceOf=(id:string,finishToken:unknown)=>({batchId:id,ownerToken:tokens.get(id),finishToken});
 it('a successful finish publishes CN once with the publish key and the owner + finish fence; start and chunk never publish',async()=>{
  const id=await startBatch();
  await post(chunkBody(id));
  expect(publishMock).not.toHaveBeenCalled();
  const res=await post(finishBody(id,1,OK));
  expect(res.status).toBe(200);
  expect(publishMock).toHaveBeenCalledTimes(1);
  expect(publishMock).toHaveBeenCalledWith(expect.anything(),'CN',DATE,{publishKey:`ingest:${id}`,fence:fenceOf(id,expect.stringMatching(/^[0-9a-f-]{36}$/))});
  expect((await res.json()).publish).toMatchObject({status:'published',region:'CN'});
 });
 it('resumption after publication: a crash at the receipt step does not publish again and the stored receipt replays (第 4 稿 P2-4)',async()=>{
  const id=await startBatch();await post(chunkBody(id));
  const record=mem.recordFinishStep.bind(mem);let armed=true;
  mem.recordFinishStep=async(b,name,data,fence)=>{if(armed&&name==='receipt'){armed=false;throw new Error('lambda killed');}return record(b,name,data,fence);};
  expect((await post(finishBody(id,1,OK))).status).toBe(500);
  const second=await post(finishBody(id,1,OK));
  expect(second.status).toBe(200);
  const body=await second.json();
  expect(body.publish.status).toBe('published');
  expect(publishMock).toHaveBeenCalledTimes(1);
  expect(await mem.ingestRun(id)).toMatchObject({state:'finished'});
  expect(await (await post(finishBody(id,1,OK))).json()).toEqual(body);
 });
 it('a crash right after the publish, before its checkpoint, retries with the identical key and fence (第 5 稿 P1-4)',async()=>{
  const id=await startBatch();await post(chunkBody(id));
  const record=mem.recordFinishStep.bind(mem);let armed=true;
  mem.recordFinishStep=async(b,name,data,fence)=>{if(armed&&name==='published'){armed=false;throw new Error('lambda killed');}return record(b,name,data,fence);};
  expect((await post(finishBody(id,1,OK))).status).toBe(500);
  expect((await post(finishBody(id,1,OK))).status).toBe(200);
  expect(publishMock).toHaveBeenCalledTimes(2);
  const [first,second]=publishMock.mock.calls;
  expect(first[3]).toMatchObject({publishKey:`ingest:${id}`,fence:{batchId:id,ownerToken:tokens.get(id)}});
  expect((second[3] as {publishKey:string}).publishKey).toBe((first[3] as {publishKey:string}).publishKey);
  expect((second[3] as {fence:{batchId:string;ownerToken:string}}).fence).toMatchObject({batchId:id,ownerToken:tokens.get(id)});
 });
 it('a retryable publication failure keeps the run finishing (503 publish_pending); the retry publishes and records freshness once (第 5 稿 P1-5)',async()=>{
  const id=await startBatch();await post(chunkBody(id));
  publishMock.mockResolvedValueOnce({status:'stale',region:'CN',attempts:2});
  const first=await post(finishBody(id,1,OK));
  expect(first.status).toBe(503);expect((await first.json()).error).toMatchObject({code:'publish_pending',publish:'stale'});
  const run=await mem.ingestRun(id);
  expect(run).toMatchObject({state:'finishing'});
  expect(run!.progress.attempts).toHaveLength(1);expect(run!.progress.attempts![0]).toMatchObject({status:'stale'});
  expect(run!.progress.published).toBeUndefined();
  const second=await post(finishBody(id,1,OK));
  expect(second.status).toBe(200);expect((await second.json()).publish.status).toBe('published');
  expect(publishMock).toHaveBeenCalledTimes(2);
  expect(publishMock.mock.calls[1][3]).toMatchObject({fence:{batchId:id,finishToken:expect.stringMatching(/^[0-9a-f-]{36}$/)}});
  expect(tables.rows('dq_freshness')).toHaveLength(1);
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:0});
 });
 it('a finish without native outcomes skips publication (terminal, checkpointed) and never calls publishRegion',async()=>{
  const id=await startBatch();
  const body=await (await post(finishBody(id,0,OK.map(o=>({series_id:o.series_id,ok:false,code:'collect_timeout'}))))).json();
  expect(body.publish).toEqual({status:'skipped',region:'CN',reason:'no_native_outcomes'});
  expect(publishMock).not.toHaveBeenCalled();
 });
 it('a fenced publish answers 409 fenced and records no published step',async()=>{
  const id=await startBatch();await post(chunkBody(id));
  publishMock.mockRejectedValueOnce(new MacroDbError('fenced'));
  const res=await post(finishBody(id,1,OK));
  expect(res.status).toBe(409);expect((await res.json()).error.code).toBe('fenced');
  expect((await mem.ingestRun(id))!.progress.published).toBeUndefined();
 });
 it('a rejected-only redelivery after a populated run is skipped as no_native_outcomes and never published (第 6 稿 P2-1)',async()=>{
  const first=await startBatch();await post(chunkBody(first));
  expect((await post(finishBody(first,1,OK))).status).toBe(200);
  publishMock.mockClear();
  const write=mem.writeObservations.bind(mem);
  mem.writeObservations=async(b,c,rows,t)=>rows.some(r=>'derived_from' in r)?write(b,c,rows,t):{inserted:0,duplicates:rows.length,versioned:0,quarantined:0,
   conflicts:rows.map(r=>({series_id:r.series_id,period_end:r.period_end,reason:'previously_rejected' as const,value_text:r.value_text,current_value_text:null,observation_id:'00000000-0000-4000-8000-0000000000cd'}))};
  const id=await startBatch();await post(chunkBody(id));
  const body=await (await post(finishBody(id,1,OK))).json();
  expect(body.publish).toEqual({status:'skipped',region:'CN',reason:'no_native_outcomes'});
  expect(publishMock).not.toHaveBeenCalled();
 });
});
