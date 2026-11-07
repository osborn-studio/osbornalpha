// src/lib/company/db-contract.ts
// Shared CompanyDb contract (spec §4.6, §4.7, §0 #64 #70, §0.1 items 2–3): the same scenarios run against
// memoryCompanyDb (db.test.ts) and pgCompanyDb (company-research.integration.test.ts), so the in-memory
// rules the unit tests rely on are exactly the SQL functions' rules. Not a test file: it registers
// describe/it only when called. Fact streams are built with the landed FactsDb write API (reconcile →
// lease → run → stage → publish); events are built here the way Part B's deriveIssuerEvents must build them.
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {factInsert,filingInsert} from '../facts/db-contract';
import type {FactInsert,FactRow,FactsDb,FilingInsert,FilingRow} from '../facts/types';
import {eventIdOf,payloadHashOf,sha256Utf8} from './canonical';
import {MAX_COMPANY_WATCHES} from './db';
import {CompanyDbError} from './types';
import type {CompanyDb,CoverageInput,EventInput,EvidenceIndexRow,Market} from './types';

export interface CompanyContractHarness{
 db:CompanyDb;facts:FactsDb;
 issuer(name?:string):Promise<string>;
 user():Promise<string>;
 /** A running ingest batch with code_version 'test-sha' and tool_versions {node:'test'}. */
 batch(producer?:'company-digest'|'facts-sync'):Promise<string>;
 close?():Promise<void>;
}
export const coverageInput=(o:Partial<CoverageInput>={}):CoverageInput=>({filings_count:1,facts_count:1,concepts_covered:1,earliest_period_end:'2023-12-31',latest_period_end:'2023-12-31',
 latest_available_date:'2024-02-01',citation_summary:{linked:0,pending:0,edgar:1},scope_last_success_at:null,scope_last_status:null,...o});
/** filing_published exactly as replace_company_digest validates it (factCount = visible facts of the filing). */
export function filingPublishedOf(g:FilingRow,factCount:number):EventInput{
 return {kind:'filing_published',natural_key:g.filing_id,occurred_on:g.available_date,period_end:g.period_end,concept:null,filing_id:g.filing_id,meta:{},
  payload:{formType:g.form_type,fiscalYear:g.fiscal_year,fiscalPeriod:g.fiscal_period,periodEnd:g.period_end,availableDate:g.available_date,sourceRef:g.source_ref,factCount}};
}
/** fact_revised for an adjacent pair of one natural key (INSTANT periodStart = periodEnd); relChange only when from ≠ 0. */
export function factRevisedOf(f:FactRow,t:FactRow,relChange?:string):EventInput{
 const ps=t.period_start??t.period_end;
 const payload:Record<string,unknown>={concept:t.concept,statement:t.statement,periodStart:ps,periodEnd:t.period_end,duration:t.duration,consolidation:'consolidated',unit:t.unit,
  from:{factId:f.fact_id,value:f.value_text,filingId:f.filing_id,availableDate:f.available_date},to:{factId:t.fact_id,value:t.value_text,filingId:t.filing_id,availableDate:t.available_date}};
 if(relChange!==undefined)payload.relChange=relChange;
 return {kind:'fact_revised',natural_key:`${t.concept}:${ps}:${t.period_end}:consolidated:${t.unit}:${t.available_date}`,occurred_on:t.available_date,period_end:t.period_end,concept:t.concept,filing_id:t.filing_id,payload,meta:{}};
}
/** 'code:message' of a CompanyDbError rejection, 'resolved' when it did not reject. */
const codeOf=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof CompanyDbError?`${e.code}:${e.message}`:`not_company_db_error:${String(e)}`);
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
interface Spec{filing?:Partial<FilingInsert>;facts?:Partial<FactInsert>[]}

export function companyDbContract(label:string,setup:()=>Promise<CompanyContractHarness>):void{
 describe(label,()=>{
  let h:CompanyContractHarness;let db:CompanyDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const ready=async(market:Market='US')=>{
   const iss=await h.issuer();const fb=await h.batch('facts-sync');
   expect(await h.facts.reconcileScope(market,[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(1);
   return {iss,fb};
  };
  /** One published run (state_rev + 1): the filings and their facts, in spec order. */
  const publish=async(iss:string,fb:string,specs:Spec[])=>{
   expect(await h.facts.claimLease(iss,'US',fb,600)).toBe(true);
   const run=await h.facts.beginRun(iss,'US',fb,1);
   const filings=specs.map(s=>filingInsert(iss,s.filing??{}));
   await h.facts.stageFilings(run,filings);
   const facts=specs.map((s,i)=>(s.facts??[]).map(o=>factInsert(iss,filings[i],o)));
   const flat=facts.flat();
   if(flat.length)expect(await h.facts.stageFacts(run,flat)).toBe(flat.length);
   await h.facts.publishRun(run,filings.map(f=>f.filing_id));
   return {filings,facts};
  };
  const filingRow=async(iss:string,id:string)=>(await h.facts.filingsOfIssuer(iss,'US',{})).find(g=>g.filing_id===id)!;
  const fp=async(iss:string,f:FilingInsert,n:number)=>filingPublishedOf(await filingRow(iss,f.filing_id),n);
  const fact=async(id:string)=>(await h.facts.factsByIds([id]))[0];
  const fr=async(from:string,to:string,rel:string)=>factRevisedOf(await fact(from),await fact(to),rel);
  const attempt=(iss:string)=>db.beginAttempt(iss,'US',new Date());
  const idOf=(iss:string,e:EventInput)=>eventIdOf(iss,'US',e.kind,e.natural_key);

  it('replace: server-computed ids and hashes, coverage and digest state; eventsOfIssuer / coverageOf / digestState read them back',async()=>{
   const {iss,fb}=await ready();const b=await h.batch();
   const {filings,facts}=await publish(iss,fb,[{facts:[{value:'90'}]},{filing:{availableDate:'2024-05-01'},facts:[{value:'110'}]}]);
   const a=await attempt(iss);expect(await attempt(iss)).toBe(a+1);
   const evs=[await fp(iss,filings[0],1),await fp(iss,filings[1],1),await fr(facts[0][0].fact_id,facts[1][0].fact_id,'0.2222222222')];
   expect(await db.replaceDigest(iss,'US',b,a+1,randomUUID(),1,false,evs,coverageInput({filings_count:2,facts_count:2}))).toEqual({upserted:3,changed:3,retired:0,revived:0});
   const {rows,nextCursor}=await db.eventsOfIssuer(iss,'US',{limit:10});
   expect(nextCursor).toBeNull();
   const want=evs.map(e=>({kind:e.kind,natural_key:e.natural_key,event_id:idOf(iss,e),payload_hash:payloadHashOf(e.payload),occurred_on:e.occurred_on}))
    .sort((x,y)=>x.occurred_on<y.occurred_on?1:x.occurred_on>y.occurred_on?-1:x.event_id<y.event_id?-1:1);
   expect(rows.map(r=>({kind:r.kind,natural_key:r.natural_key,event_id:r.event_id,payload_hash:r.payload_hash,occurred_on:r.occurred_on}))).toEqual(want);
   expect(rows[0]).toMatchObject({issuer_id:iss,market:'US',based_on_rev:1,retired_at:null,payload_changed_at:null,rebuild_batch_id:b});
   expect(rows.every(r=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.first_seen_at))).toBe(true);
   expect(rows.find(r=>r.kind==='fact_revised')!.payload).toEqual(evs[2].payload);
   expect(await db.coverageOf([iss])).toEqual([expect.objectContaining({issuer_id:iss,market:'US',filings_count:2,facts_count:2,based_on_rev:1,citation_summary:{linked:0,pending:0,edgar:1},rebuild_batch_id:b})]);
   expect(await db.digestState(iss,'US')).toMatchObject({digested_rev:1,attempt_seq:a+1,last_attempt_id:a+1,last_success_attempt_id:a+1,last_failed_attempt_id:null,last_status:'success',consecutive_failures:0,swept_at:null});
   expect(await db.digestState(randomUUID(),'US')).toBeNull();
  });

  it('replace refuses unknown_stream, stale_computation, stale_attempt and invalid_event; unknown attempts and wrong batches are internal',async()=>{
   const {iss,fb}=await ready();const b=await h.batch();
   const {filings,facts}=await publish(iss,fb,[{facts:[{value:'100.50'}]}]);
   const other=await ready();const o=await publish(other.iss,other.fb,[{facts:[{}]}]);
   const ev=await fp(iss,filings[0],1);
   expect(await codeOf(db.beginAttempt(randomUUID(),'US',new Date()))).toMatch(/^unknown_stream:/);
   const a1=await attempt(iss);const a2=await attempt(iss);
   const r=(n:number,events:EventInput[],x:{rev?:number;batch?:string;issuer?:string}={})=>db.replaceDigest(x.issuer??iss,'US',x.batch??b,n,randomUUID(),x.rev??1,false,events,coverageInput());
   expect(await codeOf(r(1,[],{issuer:randomUUID(),rev:0}))).toMatch(/^unknown_stream:/);
   expect(await codeOf(r(a2,[ev],{rev:0}))).toMatch(/^stale_computation:/);
   expect(await codeOf(r(a2+1,[ev]))).toMatch(/^internal:invalid_attempt/);
   expect(await codeOf(r(a2,[ev],{batch:await h.batch('facts-sync')}))).toMatch(/^internal:invalid_batch/);
   expect(await codeOf(r(a2,[{...ev,extra:1} as unknown as EventInput]))).toBe('invalid_event:invalid_event: event: unexpected key');
   expect(await codeOf(r(a2,[await fp(other.iss,o.filings[0],1)]))).toMatch(/^invalid_event:invalid_event: filing_id: filing not in this stream/);
   const later=await publish(iss,fb,[{filing:{availableDate:'2024-05-01'},facts:[{value:'120'}]}]);
   const rev=await fr(facts[0][0].fact_id,later.facts[0][0].fact_id,'0.1940298507');
   const bad={...rev,payload:{...rev.payload,from:{...(rev.payload.from as Record<string,unknown>),value:'100.5'}}};
   const a3=await attempt(iss);
   expect(await codeOf(r(a3,[bad],{rev:2}))).toMatch(/^invalid_event:invalid_event: payload\.from: value differs/);
   expect(await r(a3,[ev,rev],{rev:2})).toMatchObject({upserted:2,changed:2});
   expect(await codeOf(r(a1,[ev],{rev:2}))).toMatch(/^stale_attempt:/);
  });

  it('rebuilds: a late intermediate disclosure changes one edge; tombstone and revival keep first_seen_at; payload_changed_at only on a hash change; sweep writes swept_at',async()=>{
   const {iss,fb}=await ready();const b=await h.batch();
   const s1=await publish(iss,fb,[{filing:{availableDate:'2024-01-01'},facts:[{value:'90'}]},{filing:{availableDate:'2024-03-01'},facts:[{value:'110'}]}]);
   const [A,C]=[s1.facts[0][0].fact_id,s1.facts[1][0].fact_id];
   const fA=await fp(iss,s1.filings[0],1);const fC=await fp(iss,s1.filings[1],1);const ac=await fr(A,C,'0.2222222222');
   const go=async(rev:number,events:EventInput[],sweep=false)=>db.replaceDigest(iss,'US',b,await attempt(iss),randomUUID(),rev,sweep,events,coverageInput());
   const byKey=async()=>new Map((await db.eventsOfIssuer(iss,'US',{limit:100})).rows.map(r=>[`${r.kind}|${r.natural_key}`,r]));
   expect(await go(1,[fA,fC,ac])).toEqual({upserted:3,changed:3,retired:0,revived:0});
   const first=await byKey();
   await pause(15);
   const s2=await publish(iss,fb,[{filing:{availableDate:'2024-02-01'},facts:[{value:'100'}]}]);const B=s2.facts[0][0].fact_id;
   const fB=await fp(iss,s2.filings[0],1);const ab=await fr(A,B,'0.1111111111');const bc=await fr(B,C,'0.1000000000');
   expect(bc.natural_key).toBe(ac.natural_key);
   expect(await go(2,[fA,fB,fC,ab,bc])).toEqual({upserted:5,changed:3,retired:0,revived:0});
   const second=await byKey();const edge=`fact_revised|${ac.natural_key}`;
   expect(second.get(edge)!.first_seen_at).toBe(first.get(edge)!.first_seen_at);
   expect(second.get(edge)!.payload_changed_at).not.toBeNull();
   expect(second.get(`filing_published|${fA.natural_key}`)!.payload_changed_at).toBeNull();
   expect(second.get(`fact_revised|${ab.natural_key}`)!.first_seen_at>first.get(edge)!.first_seen_at).toBe(true);
   expect(await go(2,[fA,fB,ab,bc])).toEqual({upserted:4,changed:0,retired:1,revived:0});
   expect((await byKey()).has(`filing_published|${fC.natural_key}`)).toBe(false);
   expect(await go(2,[fA,fB,fC,ab,bc],true)).toEqual({upserted:5,changed:0,retired:0,revived:1});
   expect((await byKey()).get(`filing_published|${fC.natural_key}`)!.first_seen_at).toBe(first.get(`filing_published|${fC.natural_key}`)!.first_seen_at);
   expect((await db.digestState(iss,'US'))!.swept_at).not.toBeNull();
  });

  it('markDigestFailed (§0 #70): duplicates and older reports are ignored; backoff 1h·2^n capped at 24h; completion orders (e) and (f); backlog',async()=>{
   const T=new Date('2030-01-01T00:00:00.000Z');const b=await h.batch();
   const {iss,fb}=await ready();await publish(iss,fb,[{facts:[{}]}]);
   expect(await codeOf(db.markDigestFailed(randomUUID(),'US',1,T))).toMatch(/^unknown_stream:/);
   expect(await codeOf(db.markDigestFailed(iss,'US',1,T))).toMatch(/^internal:invalid_attempt/);
   const a1=await db.beginAttempt(iss,'US',T);
   const before=(await db.backlog()).failedStreams;
   expect(await db.markDigestFailed(iss,'US',a1,T)).toBe(true);
   expect(await db.markDigestFailed(iss,'US',a1,T)).toBe(false);
   expect(await db.digestState(iss,'US')).toMatchObject({last_failed_attempt_id:1,consecutive_failures:1,last_status:'failed',next_attempt_at:'2030-01-01T01:00:00.000Z',last_attempt_at:'2030-01-01T00:00:00.000Z'});
   expect((await db.backlog()).failedStreams).toBe(before+1);
   const a2=await db.beginAttempt(iss,'US',T);const a3=await db.beginAttempt(iss,'US',T);
   expect(await db.markDigestFailed(iss,'US',a3,T)).toBe(true);
   expect(await db.markDigestFailed(iss,'US',a2,T)).toBe(false);
   expect(await db.digestState(iss,'US')).toMatchObject({last_failed_attempt_id:3,consecutive_failures:2,next_attempt_at:'2030-01-01T02:00:00.000Z'});
   for(let i=0;i<6;i++)expect(await db.markDigestFailed(iss,'US',await db.beginAttempt(iss,'US',T),T)).toBe(true);
   expect((await db.digestState(iss,'US'))!.next_attempt_at).toBe('2030-01-02T00:00:00.000Z');   // capped at 24 h
   // (e) attempts 1, 2 begin; 2 fails; 1 succeeds → recorded, failure kept, swept_at not advanced
   const E=await ready();const se=await publish(E.iss,E.fb,[{facts:[{}]}]);
   const e1=await db.beginAttempt(E.iss,'US',T);const e2=await db.beginAttempt(E.iss,'US',T);
   expect(await db.markDigestFailed(E.iss,'US',e2,T)).toBe(true);
   await db.replaceDigest(E.iss,'US',b,e1,randomUUID(),1,true,[await fp(E.iss,se.filings[0],1)],coverageInput());
   expect(await db.digestState(E.iss,'US')).toMatchObject({digested_rev:1,last_success_attempt_id:1,last_failed_attempt_id:2,last_status:'failed',consecutive_failures:1,swept_at:null,next_attempt_at:'2030-01-01T01:00:00.000Z'});
   // (f) attempts 1, 2 begin; 2 succeeds; 1 reports failure → ignored
   const F=await ready();await publish(F.iss,F.fb,[{facts:[{}]}]);
   const f1=await db.beginAttempt(F.iss,'US',T);const f2=await db.beginAttempt(F.iss,'US',T);
   await db.replaceDigest(F.iss,'US',b,f2,randomUUID(),1,false,[],coverageInput());
   expect(await db.markDigestFailed(F.iss,'US',f1,T)).toBe(false);
   expect(await db.digestState(F.iss,'US')).toMatchObject({last_success_attempt_id:2,last_failed_attempt_id:null,last_status:'success',consecutive_failures:0});
  });

  it('digestDue / sweepDue select and order streams',async()=>{
   const b=await h.batch();
   const s1=await ready();await publish(s1.iss,s1.fb,[{facts:[{}]}]);
   const s2=await ready();await publish(s2.iss,s2.fb,[{facts:[{}]}]);await publish(s2.iss,s2.fb,[{filing:{availableDate:'2024-05-01'},facts:[{}]}]);
   const s3=await ready();await publish(s3.iss,s3.fb,[{facts:[{}]}]);
   await db.replaceDigest(s3.iss,'US',b,await attempt(s3.iss),randomUUID(),1,false,[],coverageInput());
   const mine=new Set([s1.iss,s2.iss,s3.iss]);
   const now=new Date(Date.now()+60_000);
   expect((await db.digestDue(now,100000)).filter(d=>mine.has(d.issuerId))).toEqual([{issuerId:s2.iss,market:'US',stateRev:2,digestedRev:0},{issuerId:s1.iss,market:'US',stateRev:1,digestedRev:0}]);
   expect(await db.digestDue(now,0)).toEqual([]);
   const sweep=async(older:Date)=>(await db.sweepDue(older,now,100000)).filter(d=>mine.has(d.issuerId)).map(d=>d.issuerId);
   expect(await sweep(new Date(Date.now()-3600_000))).toEqual([s1.iss,s2.iss,s3.iss].sort());
   await db.replaceDigest(s3.iss,'US',b,await attempt(s3.iss),randomUUID(),1,true,[],coverageInput());
   expect(await sweep(new Date(Date.now()-3600_000))).toEqual([s1.iss,s2.iss].sort());
   expect(await sweep(new Date(Date.now()+3600_000))).toEqual([...[s1.iss,s2.iss].sort(),s3.iss]);
  });

  it('replaceEvidence verifies rows and replaces the stream; evidenceOf batches by 100 and returns visible facts only',async()=>{
   const {iss,fb}=await ready();const b=await h.batch();
   /** Evidence fence: a fresh attempt and the stream's current state_rev (one publish below → 1) unless overridden. */
   const ev=async(rows:EvidenceIndexRow[],o:{issuer?:string;rev?:number;attempt?:number}={})=>db.replaceEvidence(o.issuer??iss,'US',o.attempt??await db.beginAttempt(iss,'US',new Date()),o.rev??1,rows);
   const sha='a'.repeat(64);const loc=(i:number)=>`us-gaap/Revenues/USD/${i}`;const rh=(i:number)=>sha256Utf8(`${sha}\n${loc(i)}`);
   const s=await publish(iss,fb,[{facts:[{raw_hash:rh(0)},{concept:'net_income_parent',raw_hash:rh(1)}]}]);
   const [f0,f1]=s.facts[0].map(f=>f.fact_id);
   const row=(id:string,i:number,o:Partial<EvidenceIndexRow>={}):EvidenceIndexRow=>({fact_id:id,raw_hash:rh(i),snapshot_sha256:sha,snapshot_path:`edgar/${iss}/${sha}.json`,hash_locator:loc(i),
    json_pointer:`/facts/us-gaap/Revenues/units/USD/${i}`,field:null,source:'edgar',api:null,url:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json',params:{cik:'0000000001'},
    captured_at:'2024-02-02T00:00:00.000Z',http_status:200,page:null,index_version:'company-evidence/1',...o});
   expect(await ev([row(f0,0),row(f1,1)])).toEqual({upserted:2,deleted:0});
   expect(await codeOf(ev([row(f0,1)]))).toMatch(/^invalid_evidence:invalid_evidence: raw_hash: differs/);
   expect(await codeOf(ev([row(f0,0,{params:{api_token:'x'}})]))).toMatch(/^invalid_evidence:invalid_evidence: params: must not carry a token/);
   expect(await codeOf(ev([row(f0,0,{snapshot_path:`edgar/${randomUUID()}/${sha}.json`})]))).toMatch(/^invalid_evidence:invalid_evidence: snapshot_path/);
   expect(await codeOf(ev([],{issuer:randomUUID(),attempt:1}))).toMatch(/^unknown_stream:/);
   expect(await codeOf(ev([row(f0,0)],{rev:2}))).toMatch(/^stale_computation:/);   // fence: the facts moved
   const old=await attempt(iss);const newer=await attempt(iss);
   await db.replaceDigest(iss,'US',b,newer,randomUUID(),1,false,[],coverageInput());
   expect(await codeOf(ev([row(f0,0)],{attempt:old}))).toMatch(/^stale_attempt:/);   // fence: a newer attempt already succeeded
   expect(await db.evidenceOf([f0,f1]).then(m=>m.size)).toBe(2);                     // refused writes changed nothing
   const m=await db.evidenceOf([f0,f1,...Array.from({length:148},()=>randomUUID())]);
   expect([...m.keys()].sort()).toEqual([f0,f1].sort());
   expect(m.get(f0)).toEqual({...row(f0,0),run_id:expect.any(String),code_version:'test-sha',tool_versions:{node:'test'},mapping_version:'facts-map/1'});
   expect(await ev([row(f1,1)])).toEqual({upserted:1,deleted:1});
   expect([...(await db.evidenceOf([f0,f1])).keys()]).toEqual([f1]);
   expect((await db.evidenceOf([])).size).toBe(0);
  });

  it('eventsOfIssuer pages by (occurred_on desc, event_id) with filters; eventsOfIssuers pages by (first_seen_at desc, event_id desc); bad queries are invalid_read',async()=>{
   const b=await h.batch();
   const mk=async()=>{
    const {iss,fb}=await ready();
    const s=await publish(iss,fb,[{facts:[{}]},{filing:{availableDate:'2024-05-01'},facts:[{value:'120'}]},{filing:{availableDate:'2024-08-01'},facts:[{value:'130'}]}]);
    const evs=[await fp(iss,s.filings[0],1),await fp(iss,s.filings[1],1),await fp(iss,s.filings[2],1),await fr(s.facts[0][0].fact_id,s.facts[1][0].fact_id,'0.2000000000')];
    await db.replaceDigest(iss,'US',b,await attempt(iss),randomUUID(),1,false,evs,coverageInput());
    return {iss,ids:evs.map(e=>idOf(iss,e))};
   };
   const x=await mk();await pause(15);const y=await mk();
   const all=(await db.eventsOfIssuer(x.iss,'US',{limit:100})).rows;
   expect(all).toHaveLength(4);
   const pages:string[]=[];let cursor:string|null=null;
   do{const p:{rows:{event_id:string}[];nextCursor:string|null}=await db.eventsOfIssuer(x.iss,'US',{limit:1,cursor});pages.push(...p.rows.map(r=>r.event_id));cursor=p.nextCursor;}while(cursor);
   expect(pages).toEqual(all.map(r=>r.event_id));
   expect((await db.eventsOfIssuer(x.iss,'US',{limit:100,kinds:['fact_revised']})).rows.map(r=>r.kind)).toEqual(['fact_revised']);
   expect((await db.eventsOfIssuer(x.iss,'US',{limit:100,since:'2024-05-01',until:'2024-05-31'})).rows.map(r=>r.occurred_on)).toEqual(['2024-05-01','2024-05-01']);
   const inbox:string[]=[];cursor=null;
   do{const p:{rows:{event_id:string}[];nextCursor:string|null}=await db.eventsOfIssuers([x.iss,y.iss],{limit:3,cursor});inbox.push(...p.rows.map(r=>r.event_id));cursor=p.nextCursor;}while(cursor);
   const desc=(ids:string[])=>[...ids].sort().reverse();
   expect(inbox).toEqual([...desc(y.ids),...desc(x.ids)]);   // y first seen later; one replace shares first_seen_at → event_id desc
   expect((await db.eventsOfIssuers([x.iss],{limit:100,kinds:['filing_published']})).rows).toHaveLength(3);
   expect(await db.eventsOfIssuers([],{limit:10})).toEqual({rows:[],nextCursor:null});
   for(const bad of ['nope',Buffer.from('["2024-01-01","x"]').toString('base64url')])expect(await codeOf(db.eventsOfIssuer(x.iss,'US',{limit:1,cursor:bad}))).toMatch(/^invalid_read:/);
   expect(await codeOf(db.eventsOfIssuers([x.iss],{limit:1,cursor:'nope'}))).toMatch(/^invalid_read:/);
   for(const limit of [0,501,1.5])expect(await codeOf(db.eventsOfIssuer(x.iss,'US',{limit}))).toMatch(/^invalid_read:/);
   expect(await codeOf(db.eventsOfIssuer(x.iss,'US',{limit:1,since:'2024-1-1'}))).toMatch(/^invalid_read:/);
  });

  it('coverageOf and listCoverage: filters, three sorts, totals, paging',async()=>{
   const b=await h.batch();
   const mk=async(name:string,lad:string|null,lpe:string|null)=>{
    const iss=await h.issuer(name);
    await h.facts.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);
    await db.replaceDigest(iss,'US',b,await attempt(iss),randomUUID(),0,false,[],coverageInput({latest_available_date:lad,latest_period_end:lpe}));
    return iss;
   };
   const B=await mk('ZZ List B','2024-05-01','2024-03-31');const A=await mk('ZZ List A','2024-02-01','2023-12-31');const C=await mk('ZZ List C',null,null);
   const ids=[A,B,C];
   const page=(sort:'latest_available_date'|'latest_period_end'|'name',offset=0,limit=10)=>db.listCoverage({issuerIds:ids},sort,{offset,limit});
   expect((await page('latest_available_date')).rows.map(r=>r.issuer_id)).toEqual([B,A,C]);
   expect((await page('latest_period_end')).rows.map(r=>r.issuer_id)).toEqual([B,A,C]);
   expect((await page('name')).rows.map(r=>r.issuer_id)).toEqual([A,B,C]);
   const n=await page('name',1,1);expect({ids:n.rows.map(r=>r.issuer_id),total:n.total}).toEqual({ids:[B],total:3});
   expect((await db.listCoverage({issuerIds:ids,market:'CN'},'name',{offset:0,limit:10})).total).toBe(0);
   expect((await db.coverageOf([C,A])).map(r=>r.issuer_id)).toEqual([A,C].sort());
   expect(await codeOf(page('name',0,201))).toMatch(/^invalid_read:/);
  });

  it('watches: created once, 200 per user with existing keys passing, patch, delete; users are isolated',async()=>{
   const u=await h.user();const v=await h.user();
   const ids:string[]=[];for(let i=0;i<=MAX_COMPANY_WATCHES;i++)ids.push(await h.issuer(`ZZ Watch ${i}`));
   const w=await db.upsertWatch(u,ids[0]);
   expect(w).toMatchObject({created:true,row:{user_id:u,issuer_id:ids[0],note:null,muted:false}});
   expect(await db.upsertWatch(u,ids[0])).toEqual({created:false,row:w.row});
   for(const id of ids.slice(1,MAX_COMPANY_WATCHES))expect((await db.upsertWatch(u,id)).created).toBe(true);
   expect(await codeOf(db.upsertWatch(u,ids[MAX_COMPANY_WATCHES]))).toMatch(/^watch_limit:/);
   expect((await db.upsertWatch(u,ids[5])).created).toBe(false);
   expect(await db.watchesOf(u)).toHaveLength(MAX_COMPANY_WATCHES);
   expect(await db.watchesOf(v)).toEqual([]);
   expect((await db.upsertWatch(v,ids[0])).created).toBe(true);
   expect((await db.watchesOf(v)).map(x=>x.user_id)).toEqual([v]);
   await pause(5);
   const p=await db.patchWatch(u,ids[0],{note:'thesis',muted:true});
   expect(p).toMatchObject({user_id:u,issuer_id:ids[0],note:'thesis',muted:true,created_at:w.row.created_at});
   expect(p!.updated_at>w.row.updated_at).toBe(true);
   expect((await db.watchesOf(u))[0].issuer_id).toBe(ids[0]);                   // most recently updated first
   expect(await db.patchWatch(u,ids[0],{})).toEqual(p);                          // empty patch reads the row
   expect(await db.patchWatch(u,ids[MAX_COMPANY_WATCHES],{note:'x'})).toBeNull();
   expect(await db.patchWatch(v,ids[1],{muted:true})).toBeNull();               // not v's watch
   expect(await db.deleteWatch(u,ids[1])).toBe(true);
   expect(await db.deleteWatch(u,ids[1])).toBe(false);
   expect(await db.deleteWatch(v,ids[2])).toBe(false);
  },120000);

  it('receipts: markRead counts new receipts, refuses foreign or unwatched events; readEventIds is per user; unwatching clears receipts',async()=>{
   const b=await h.batch();const u=await h.user();const v=await h.user();
   const mk=async()=>{
    const {iss,fb}=await ready();
    const s=await publish(iss,fb,[{facts:[{}]},{filing:{availableDate:'2024-05-01'},facts:[{value:'2'}]}]);
    const evs=[await fp(iss,s.filings[0],1),await fp(iss,s.filings[1],1)];
    await db.replaceDigest(iss,'US',b,await attempt(iss),randomUUID(),1,false,evs,coverageInput());
    return {iss,ids:evs.map(e=>idOf(iss,e))};
   };
   const x=await mk();const y=await mk();
   await db.upsertWatch(u,x.iss);await db.upsertWatch(u,y.iss);await db.upsertWatch(v,x.iss);
   expect(await db.markRead(u,x.iss,[x.ids[0],x.ids[0]])).toEqual({inserted:1});
   expect(await db.markRead(u,x.iss,x.ids)).toEqual({inserted:1});
   expect(await db.markRead(u,x.iss,[])).toEqual({inserted:0});
   expect(await codeOf(db.markRead(u,x.iss,[y.ids[0]]))).toMatch(/^invalid_read:/);   // event of another issuer
   expect(await codeOf(db.markRead(v,y.iss,[y.ids[0]]))).toMatch(/^invalid_read:/);   // v does not watch y
   expect(await codeOf(db.markRead(u,x.iss,['not-an-id']))).toMatch(/^invalid_read:/);
   expect([...await db.readEventIds(u,[...x.ids,...y.ids])].sort()).toEqual([...x.ids].sort());
   expect([...await db.readEventIds(v,x.ids)]).toEqual([]);
   expect(await db.deleteWatch(u,x.iss)).toBe(true);
   expect((await db.readEventIds(u,x.ids)).size).toBe(0);
  });
 });
}
