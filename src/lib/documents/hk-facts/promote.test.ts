// src/lib/documents/hk-facts/promote.test.ts
import {describe,expect,it,vi} from 'vitest';
import {HEARTBEAT_MS} from '../lease';
import type {Market} from '../../facts/types';
import {EXTRACTOR_VERSION,HK_EXTRACTOR_REF,HK_PUB_GEN,TABLE_ALGO_VERSION} from '../types';
import type {CitationRole} from '../types';
import {hkFilingSourceRef,hkRawHash,runHkFactsSync} from './promote';
import type {PromoteDeps} from './promote';
import {buildCheckContext,runHkChecks} from './checks';
import {ADMIN,CODE,FY25,ISSUER,NOW,allCandidatesOf,candidatesDepsOf,confirm,hkHarness,naturalKeyOf,seedExtraction,seedHkCandidates,seedHkExtraction} from './test-support';
import type {HkHarness,SeedFact} from './test-support';

const run=async(h:HkHarness,over:Partial<PromoteDeps>={},pubGen?:number)=>
 (await runHkFactsSync({...candidatesDepsOf(h),...over},{issuerIds:[ISSUER],batchId:await h.batch(),triggeredBy:'script',...(pubGen===undefined?{}:{pubGen})}))[0];
const okFacts=(h:HkHarness)=>h.facts.facts().filter(f=>f.status==='ok');
async function confirmedDoc(h:HkHarness,facts:readonly SeedFact[]=FY25,sourceRef='2026032500001_c'){
 const ex=await seedHkExtraction(h,{sourceRef,facts});const ids=await seedHkCandidates(h,ex);await confirm(h,ids.values());return {ex,ids};
}
const dead=async():Promise<never>=>{throw new Error('process died');};

describe('runHkFactsSync',()=>{
 it('publishes the active set as HK facts: filing, binding, evidence, raw_hash locator, promoted candidates, released lease',async()=>{
  const h=hkHarness();const {ex}=await confirmedDoc(h);
  const o=await run(h);
  expect(o).toMatchObject({outcome:'published',staged:6,counts:{fetched:6,inserted:6,duplicates:0,quarantined:0,failed:0}});
  expect(o.finish).toEqual({published:6,still_staged:0,abandoned:0});
  const facts=okFacts(h);
  expect(facts).toHaveLength(6);
  for(const f of facts)expect(f).toMatchObject({market:'HK',mapping_gen:HK_PUB_GEN,mapping_version:HK_EXTRACTOR_REF,available_date:'2026-03-25',consolidation:'consolidated'});
  const rev=facts.find(f=>f.concept==='revenue')!;
  expect(rev).toMatchObject({value:'6256000',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',unit:'CNY',source_concept:'收益'});
  const filings=h.facts.filings();
  expect(filings).toHaveLength(1);
  expect(filings[0]).toMatchObject({source:'hkex',origin:'hkex',market:'HK',source_ref:hkFilingSourceRef(ex.document),form_type:'annual',fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',available_date:'2026-03-25',mapping_gen:HK_PUB_GEN});
  expect(hkFilingSourceRef(ex.document)).toBe('hkex:2026032500001_c:v1');
  expect(await h.port.hkFilingOfDocument(ex.document.document_id)).toMatchObject({filing_id:filings[0].filing_id,mapping_gen:HK_PUB_GEN});
  const ev=await h.port.citationsOfFact(rev.fact_id);
  const roles=(r:CitationRole)=>ev.filter(e=>e.role===r).length;
  expect([roles('value'),roles('label'),roles('unit'),roles('period')]).toEqual([1,1,1,2]);
  const value=(await h.docs.citationById(ev.find(e=>e.role==='value')!.citation_id))!;
  expect(value.snippet).toBe('6256000');
  expect(rev.raw_hash).toBe(hkRawHash(ex.document.content_sha256,value));
  expect(rev.raw_hash).toMatch(new RegExp(`^hkex:${ex.document.content_sha256.slice(0,16)}:${ex.extractionId}:p1:c\\d+-\\d+$`));
  expect(h.docs.candidates().every(c=>c.status==='promoted')).toBe(true);
  expect(h.docs.publications().every(p=>p.state==='published'&&p.pub_gen===HK_PUB_GEN&&p.run_id===o.runId)).toBe(true);
  expect(h.facts.scope().find(s=>s.issuer_id===ISSUER)).toMatchObject({lease_batch_id:null,last_status:'success',fetch_key:'00268'});
 });
 it('stages only the active set: rejected, undecided, failing and English (comparison) candidates stay out',async()=>{
  const h=hkHarness();
  const zh=await seedHkExtraction(h,{sourceRef:'2026032500002_c',facts:FY25});
  const ids=await seedHkCandidates(h,zh,{passed:f=>f.concept!=='equity_total'});
  await expect(h.docs.decideCandidate(ids.get(naturalKeyOf(FY25[5]))!,{kind:'human',decided_by:ADMIN,status:'confirmed'})).rejects.toMatchObject({code:'not_eligible'});
  await confirm(h,[ids.get(naturalKeyOf(FY25[0]))!]);
  await h.docs.decideCandidate(ids.get(naturalKeyOf(FY25[1]))!,{kind:'human',decided_by:ADMIN,status:'rejected'});
  const en=await seedHkExtraction(h,{sourceRef:'2026032500002_e',language:'en',facts:[FY25[2]]});
  await confirm(h,(await seedHkCandidates(h,en)).values());
  const o=await run(h);
  expect(o).toMatchObject({outcome:'published',staged:1});
  expect(okFacts(h).map(f=>f.concept)).toEqual(['revenue']);
  expect(h.facts.filings().map(f=>f.source_ref)).toEqual([hkFilingSourceRef(zh.document)]);
 });
 it('a second confirmation in the same generation stages only the new candidate; the filing keeps its generation',async()=>{
  const h=hkHarness();
  const ex=await seedHkExtraction(h,{sourceRef:'2026032500003_c',facts:FY25});const ids=await seedHkCandidates(h,ex);
  await confirm(h,[ids.get(naturalKeyOf(FY25[0]))!]);
  expect(await run(h)).toMatchObject({outcome:'published',staged:1});
  await confirm(h,[ids.get(naturalKeyOf(FY25[3]))!]);
  const second=await run(h);
  expect(second).toMatchObject({outcome:'published',staged:1,counts:{fetched:1,inserted:1}});
  expect(okFacts(h).map(f=>f.concept).sort()).toEqual(['revenue','total_assets']);
  expect(h.facts.filings()).toHaveLength(1);expect(h.facts.filings()[0].mapping_gen).toBe(HK_PUB_GEN);
  const pubs=h.docs.publications();
  expect(pubs).toHaveLength(2);expect(new Set(pubs.map(p=>p.run_id)).size).toBe(2);
 });
 it('nothing to publish: abandons its run and releases the lease',async()=>{
  const h=hkHarness();
  const o=await run(h);
  expect(o).toMatchObject({outcome:'skipped',code:'nothing_to_publish'});
  expect(h.facts.runs().map(r=>r.status)).toEqual(['abandoned']);
  expect(await h.port.claimLease(ISSUER,await h.batch(),60)).toBe(true);
 });
 it('a lease held by another batch skips the issuer without any write',async()=>{
  const h=hkHarness();await confirmedDoc(h);
  await h.port.ensureHkScope(ISSUER,'00268');
  expect(await h.port.claimLease(ISSUER,await h.batch(),600)).toBe(true);
  expect(await run(h)).toMatchObject({outcome:'skipped',code:'leased'});
  expect(h.facts.runs()).toEqual([]);expect(h.docs.publications()).toEqual([]);
 });
 it('an issuer without an HKEX stock code fails as scope_unresolved',async()=>{
  const h=hkHarness({issuers:[{issuer_id:ISSUER,code:null}]});
  expect(await run(h)).toMatchObject({outcome:'failed',code:'scope_unresolved',counts:{failed:1}});
  expect(h.facts.scope()).toEqual([]);
 });
 it('publishHkRun refuses incomplete evidence: run and publications abandoned, nothing ok; the next run re-stages the abandoned rows',async()=>{
  const h=hkHarness();await confirmedDoc(h);
  const port={...h.port,insertFactCitations:(r:string,rows:{fact_id:string;citation_id:string;role:CitationRole}[])=>h.port.insertFactCitations(r,rows.filter(x=>x.role!=='unit'))};
  const o=await run(h,{port});
  expect(o).toMatchObject({outcome:'failed',code:'evidence_incomplete'});
  expect(okFacts(h)).toEqual([]);
  expect(h.facts.runs().map(r=>r.status)).toEqual(['abandoned']);
  expect(h.docs.publications().map(p=>p.state)).toEqual(Array(6).fill('abandoned'));
  expect(h.docs.candidates().every(c=>c.status==='confirmed')).toBe(true);
  const again=await run(h);
  expect(again.outcome).toBe('published');
  expect(h.docs.publications().every(p=>p.state==='published'&&p.run_id===again.runId)).toBe(true);
 });
 it('stale_plan: never publishes the old plan; abandons, releases, and the next run re-reads and publishes',async()=>{
  const h=hkHarness();await confirmedDoc(h);
  const port={...h.port,readFacts:async(i:string,opts:Parameters<typeof h.port.readFacts>[1])=>{const r=await h.port.readFacts(i,opts);return {...r,stateRev:r.stateRev+1};}};
  const o=await run(h,{port});
  expect(o).toMatchObject({outcome:'failed',code:'stale_plan'});
  expect(okFacts(h)).toEqual([]);
  expect(h.docs.publications().every(p=>p.state==='abandoned')).toBe(true);
  expect(h.facts.scope().find(s=>s.issuer_id===ISSUER)).toMatchObject({lease_batch_id:null,last_status:'failed'});
  expect((await run(h)).outcome).toBe('published');
 });
 it('plan_inconsistent when stageFacts inserts fewer rows than planned; read_truncated when the snapshot is truncated',async()=>{
  const h=hkHarness();await confirmedDoc(h);
  const short=await run(h,{port:{...h.port,stageFacts:async(r,rows)=>(await h.port.stageFacts(r,rows))-1}});
  expect(short).toMatchObject({outcome:'failed',code:'plan_inconsistent'});
  expect(h.docs.publications()).toEqual([]);
  const cut=await run(h,{port:{...h.port,readFacts:async()=>({stateRev:0,rows:[],truncated:true})}});
  expect(cut).toMatchObject({outcome:'failed',code:'read_truncated'});
  expect(h.facts.runs().every(r=>r.status==='abandoned')).toBe(true);
  expect(okFacts(h)).toEqual([]);
 });
 it('mixed outcome (spec §12 example 10): a same-day replacement parks one row, finish reports 3/1/0, accepting the item publishes it on the next run',async()=>{
  const h=hkHarness();
  await confirmedDoc(h,[FY25[0]],'2026032500005_c');
  expect((await run(h)).outcome).toBe('published');
  const v2=await seedHkExtraction(h,{sourceRef:'2026032500005_c',bytesTag:'v2',facts:[{...FY25[0],value:'6256999'},FY25[3],FY25[4],FY25[5]]});
  expect(v2.document.source_version).toBe(2);
  await confirm(h,(await seedHkCandidates(h,v2)).values());
  const o=await run(h);
  expect(o.outcome).toBe('published');
  expect(o.finish).toEqual({published:3,still_staged:1,abandoned:0});
  expect(o.counts).toMatchObject({fetched:4,inserted:3,quarantined:1});
  const revs=h.facts.facts().filter(f=>f.concept==='revenue');
  expect(revs.map(f=>[f.value,f.status]).sort()).toEqual([['6256000','quarantined'],['6256999','quarantined']]);
  const v2Rev=h.docs.candidates().find(c=>c.document_id===v2.document.document_id&&c.natural_key===naturalKeyOf(FY25[0]))!;
  expect(v2Rev.status).toBe('confirmed');
  expect(h.docs.publications().find(p=>p.candidate_id===v2Rev.candidate_id)!.state).toBe('staged');
  const item=h.tables.rows('dq_quarantine').find(r=>r.dataset==='facts.hk'&&r.reason_code==='same_day_conflict')!;
  expect(item).toMatchObject({table_name:'financial_facts',status:'open'});
  const chosen=revs.find(f=>f.value==='6256999')!.fact_id;
  await h.port.resolveHkFactsQuarantine(String(item.id),[chosen],ADMIN);
  expect(h.facts.facts().find(f=>f.fact_id===chosen)!.status).toBe('ok');
  const next=await run(h);
  expect(next).toMatchObject({outcome:'skipped',code:'nothing_to_publish'});
  expect(h.docs.publications().filter(p=>p.state==='staged')).toEqual([]);
  expect((await h.docs.candidateById(v2Rev.candidate_id))!.status).toBe('promoted');
 });
 it('step 0a: a published run whose publications were never finished is finished by the next run',async()=>{
  const h=hkHarness();await confirmedDoc(h);
  const o=await run(h,{port:{...h.port,finishCandidatePublications:dead}});
  expect(o.outcome).toBe('published');
  expect(o.errors.map(e=>e.code)).toContain('finish_failed');
  expect(h.docs.publications().every(p=>p.state==='staged')).toBe(true);
  const next=await run(h);
  expect(next).toMatchObject({outcome:'skipped',code:'nothing_to_publish'});
  expect(h.docs.publications().every(p=>p.state==='published')).toBe(true);
  expect(h.docs.candidates().every(c=>c.status==='promoted')).toBe(true);
 });
 it('steps 0a–0c: a crashed staged run of an earlier batch is abandoned by beginRun (never abandonRun) and its publications re-staged',async()=>{
  const h=hkHarness();await confirmedDoc(h);
  const crashed=await run(h,{port:{...h.port,insertFactCitations:dead,abandonRun:dead,abandonCandidatePublications:dead,releaseLease:dead}});
  expect(crashed.outcome).toBe('failed');
  const oldRun=crashed.runId!;
  expect(h.facts.runs().find(r=>r.run_id===oldRun)!.status).toBe('staged');
  expect(h.docs.publications().every(p=>p.state==='staged'&&p.run_id===oldRun)).toBe(true);
  h.facts.expireLease(ISSUER,'HK' as unknown as Market);
  let abandonedOld=0;
  const watched={...h.port,abandonRun:async(r:string)=>{if(r===oldRun)abandonedOld++;return h.port.abandonRun(r);}};
  const o=await run(h,{port:watched});
  expect(abandonedOld).toBe(0);
  expect(o.outcome).toBe('published');
  expect(h.facts.runs().find(r=>r.run_id===oldRun)!.status).toBe('abandoned');
  const pubs=h.docs.publications();
  expect(pubs).toHaveLength(6);
  for(const p of pubs)expect(p).toMatchObject({state:'published',run_id:o.runId});
 });
 it('step 0a: staged publications of a run another batch already abandoned are abandoned, then re-staged',async()=>{
  const h=hkHarness();await confirmedDoc(h);
  const crashed=await run(h,{port:{...h.port,insertFactCitations:dead,abandonRun:dead,abandonCandidatePublications:dead,releaseLease:dead}});
  h.facts.expireLease(ISSUER,'HK' as unknown as Market);
  const other=await h.batch();
  expect(await h.port.claimLease(ISSUER,other,600)).toBe(true);
  await h.port.beginRun(ISSUER,other,HK_PUB_GEN);                     // a foreign batch took over: the crashed run is abandoned, its publications still staged
  await h.port.releaseLease(ISSUER,other,'failed',NOW);
  expect(await h.port.runStatus(crashed.runId!)).toBe('abandoned');
  expect(h.docs.publications().every(p=>p.state==='staged')).toBe(true);
  const o=await run(h);
  expect(o.outcome).toBe('published');
  expect(h.docs.publications().every(p=>p.state==='published'&&p.run_id===o.runId)).toBe(true);
 });
 it('a publication-generation bump re-publishes under the new generation and hides a zero-output filing (spec §12 example 9, R5-13)',async()=>{
  const h=hkHarness();
  await confirmedDoc(h,[FY25[0]],'2026032500007_c');
  const half:SeedFact={concept:'revenue',statement:'IS',period_start:'2025-01-01',period_end:'2025-06-30',duration:'6M',value:'3000000'};
  const b=await seedHkExtraction(h,{sourceRef:'2025082500008_c',docClass:'interim_report',periodEnd:'2025-06-30',availableAt:'2025-08-25T08:30:00.000Z',facts:[half],extractorVersion:'docs-extract/0.9'});
  await confirm(h,(await seedHkCandidates(h,b)).values());
  expect((await run(h)).outcome).toBe('published');
  const gen1=okFacts(h);expect(gen1).toHaveLength(2);
  // B re-extracted under the current extractor; its new version produced no candidates at all (zero output)
  await h.docs.requestExtract(b.document.document_id,ADMIN);
  await seedHkCandidates(h,await seedExtraction(h,b.document.document_id,[]));
  const next=HK_PUB_GEN+1;
  expect(await h.port.zeroOutputDocuments(ISSUER,next)).toContain(b.document.document_id);   // literal condition (d) may also list A; promotion takes the union with the active documents
  expect((await h.port.promotionDue(next,10)).map(x=>x.issuerId)).toEqual([ISSUER]);
  const o=await run(h,{},next);
  expect(o.outcome).toBe('published');
  expect(h.facts.filings().map(f=>f.mapping_gen)).toEqual([next,next]);
  const visible=await h.port.readFacts(ISSUER,{concepts:['revenue'],asOf:'2026-11-06',history:true});
  expect(visible.rows.map(r=>[r.period_end,r.mapping_gen])).toEqual([['2025-12-31',next]]);
  expect((await h.port.factsByIds(gen1.map(f=>f.fact_id))).every(f=>f.status==='ok'&&f.mapping_gen===HK_PUB_GEN)).toBe(true);
  expect(await h.port.promotionDue(next,10)).toEqual([]);
 });
 it('a revoked approval of an auto-decided candidate fails the stage step and abandons the run',async()=>{
  const h=hkHarness();
  const ex=await seedHkExtraction(h,{sourceRef:'2026032500009_c',facts:[FY25[0]]});const [id]=(await seedHkCandidates(h,ex)).values();
  const approval=await h.docs.insertApproval({extractor_ref:HK_EXTRACTOR_REF,extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:CODE,concepts:['revenue'],
   gold_sha256:'a'.repeat(64),precision:'0.97',recall:'0.96',report_path:'docs/audits/eval.json',approved_by:ADMIN});
  await h.docs.decideCandidate(id,{kind:'auto',approval_id:approval});
  await h.docs.revokeApproval(approval);
  const o=await run(h);
  expect(o).toMatchObject({outcome:'failed',code:'approval_revoked'});
  expect(okFacts(h)).toEqual([]);
  expect(h.facts.runs().every(r=>r.status==='abandoned')).toBe(true);
  // Part A: the reversion to 'candidate' is committed before the adapter throws approval_revoked
  expect(await h.docs.candidateById(id)).toMatchObject({status:'candidate',decision_kind:null,approval_id:null});
  expect(h.docs.publications().every(p=>p.state!=='staged')).toBe(true);
 });
 it('P1-4: a zero-output document that switches to a new extraction between selection and publish → stale_plan, no generation advance; the next run replans',async()=>{
  const h=hkHarness();
  await confirmedDoc(h,[FY25[0]],'2026032500010_c');
  const half:SeedFact={concept:'revenue',statement:'IS',period_start:'2025-01-01',period_end:'2025-06-30',duration:'6M',value:'3000000'};
  const b=await seedHkExtraction(h,{sourceRef:'2025082500011_c',docClass:'interim_report',periodEnd:'2025-06-30',availableAt:'2025-08-25T08:30:00.000Z',facts:[half],extractorVersion:'docs-extract/0.9'});
  await confirm(h,(await seedHkCandidates(h,b)).values());
  expect((await run(h)).outcome).toBe('published');
  await h.docs.requestExtract(b.document.document_id,ADMIN);
  await seedHkCandidates(h,await seedExtraction(h,b.document.document_id,[],'docs-extract/0.95'));   // zero output (an intermediate extractor, so a later re-extraction is allowed)
  const next=HK_PUB_GEN+1;const before=h.facts.filings().map(f=>[f.filing_id,f.mapping_gen]);const gen1=okFacts(h).map(f=>f.fact_id).sort();
  let switched='';
  const racing={...h.port,publishHkRun:async(...a:Parameters<typeof h.port.publishHkRun>)=>{
   expect(a[5].map(z=>z.document_id)).toContain(b.document.document_id);
   await h.docs.requestExtract(b.document.document_id,ADMIN);                                    // another worker re-extracts B: new extraction, candidates pending
   switched=(await seedExtraction(h,b.document.document_id,[half])).extractionId;
   return h.port.publishHkRun(...a);
  }};
  const o=await run(h,{port:racing},next);
  expect(o).toMatchObject({outcome:'failed',code:'stale_plan'});
  expect((await h.docs.extractionById(switched))!.candidates_status).toBe('pending');
  expect(h.facts.filings().map(f=>[f.filing_id,f.mapping_gen])).toEqual(before);               // no generation advance
  expect(okFacts(h).map(f=>f.fact_id).sort()).toEqual(gen1);                                    // nothing hidden, nothing new
  expect(h.facts.runs().filter(r=>r.status==='staged')).toEqual([]);
  expect(h.facts.scope().find(s=>s.issuer_id===ISSUER)).toMatchObject({lease_batch_id:null,last_status:'failed'});
 });
 it('P2-7: a lease taken over between phases is lease_lost with nothing staged; a phase without budget is deadline_hit',async()=>{
  const h=hkHarness();await confirmedDoc(h);
  const OTHER=await h.batch();
  const port={...h.port,readFacts:async(i:string,opts:Parameters<typeof h.port.readFacts>[1])=>{
   const r=await h.port.readFacts(i,opts);
   h.facts.expireLease(ISSUER,'HK' as unknown as Market);                     // planning outlived the lease …
   expect(await h.port.claimLease(ISSUER,OTHER,600)).toBe(true);             // … and another batch took the issuer
   return r;
  }};
  const o=await run(h,{port});
  expect(o).toMatchObject({outcome:'failed',code:'lease_lost'});
  expect(h.facts.filings()).toEqual([]);expect(h.facts.facts()).toEqual([]);expect(h.docs.publications()).toEqual([]);
  expect(h.facts.scope().find(s=>s.issuer_id===ISSUER)).toMatchObject({lease_batch_id:OTHER});
  const g=hkHarness();await confirmedDoc(g);
  let clock=Date.parse(NOW);
  const slow={...g.port,readFacts:async(i:string,opts:Parameters<typeof g.port.readFacts>[1])=>{clock+=50_000;return g.port.readFacts(i,opts);}};   // 15 s left after planning
  const late=await run(g,{port:slow,now:()=>new Date(clock),deadline:new Date(clock+65_000)});
  expect(late).toMatchObject({outcome:'failed',code:'deadline_hit'});
  expect(g.facts.runs().every(r=>r.status==='abandoned')).toBe(true);
  expect(g.docs.publications()).toEqual([]);
  expect(g.facts.scope().find(s=>s.issuer_id===ISSUER)).toMatchObject({lease_batch_id:null,last_status:'failed'});
 });
 it('R3-P2-1: a heartbeat renewal delayed past the end of the promotion leaves the scope released',async()=>{
  vi.useFakeTimers();
  try{
   const h=hkHarness();await confirmedDoc(h);
   let planning=false;let first=true;const late:boolean[]=[];
   const port={...h.port,
    renewLease:async(i:string,b:string,t:number)=>{if(first){first=false;await new Promise(r=>setTimeout(r,3*HEARTBEAT_MS));}const ok=await h.port.renewLease(i,b,t);late.push(ok);return ok;},   // the first (heartbeat) renewal hangs past the drain bound
    readFacts:async(i:string,opts:Parameters<typeof h.port.readFacts>[1])=>{planning=true;await new Promise(r=>setTimeout(r,HEARTBEAT_MS+1_000));return h.port.readFacts(i,opts);}};
   const p=run(h,{port});
   for(let i=0;i<5000&&!planning;i++)await Promise.resolve();
   await vi.advanceTimersByTimeAsync(HEARTBEAT_MS+1_000);                      // beat at 120 s hangs; planning ends at 121 s; the release waits at most drainMs (120 s) for it
   await vi.advanceTimersByTimeAsync(HEARTBEAT_MS+10_000);                     // drain bound passed: released at ~241 s
   const o=await p;
   expect(o.outcome).toBe('published');
   expect(h.facts.scope().find(s=>s.issuer_id===ISSUER)).toMatchObject({lease_batch_id:null});
   await vi.advanceTimersByTimeAsync(3*HEARTBEAT_MS);                          // the hung renewal finally reaches the database, after the release …
   expect(late.at(-1)).toBe(false);                                            // … and the holder-only renewal refuses
   expect(h.facts.scope().find(s=>s.issuer_id===ISSUER)).toMatchObject({lease_batch_id:null,lease_until:null,last_status:'success'});   // still released
  }finally{vi.useRealTimers();}
 });
 it('R3-P1-1: a 仙 EPS that inherits the table currency passes the checks and publishes with exactly one unit and one unit_currency citation',async()=>{
  const h=hkHarness();
  const eps:SeedFact={concept:'eps_basic',statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'0.0155',presented:'1.55',unit:'CNY/share',cents:true};
  const {ex}=await confirmedDoc(h,[FY25[0],eps],'2026032500014_c');
  const cands=await allCandidatesOf(h,ex.extractionId);
  const ctx=await buildCheckContext(candidatesDepsOf(h),ex.document,(await h.docs.extractionById(ex.extractionId))!,cands,'2026-11-06');
  for(const r of runHkChecks(cands,ctx))expect({id:r.candidate_id,passed:r.checks_passed}).toEqual({id:r.candidate_id,passed:true});
  expect((await run(h)).outcome).toBe('published');
  const f=okFacts(h).find(x=>x.concept==='eps_basic')!;
  expect(f).toMatchObject({value:'0.0155',unit:'CNY/share'});
  const ev=await h.port.citationsOfFact(f.fact_id);
  expect(ev.map(e=>e.role).sort()).toEqual(['label','period','period','unit','unit_currency','value']);
  expect((await h.docs.citationById(ev.find(e=>e.role==='unit')!.citation_id))!.snippet).toBe('仙');
  expect((await h.docs.citationById(ev.find(e=>e.role==='unit_currency')!.citation_id))!.snippet).toBe('單位：元 幣種：人民幣');
  const rev=okFacts(h).find(x=>x.concept==='revenue')!;
  expect((await h.port.citationsOfFact(rev.fact_id)).some(e=>e.role==='unit_currency')).toBe(false);
 });
 it('R1-P2-7 round 2: a long planning step is covered by timer renewals; a takeover during it is lease_lost with nothing staged',async()=>{
  vi.useFakeTimers();
  try{
   const h=hkHarness();await confirmedDoc(h);
   const OTHER=await h.batch();let planning=false;let renewals=0;
   const port={...h.port,
    renewLease:async(i:string,b:string,t:number)=>{renewals++;return h.port.renewLease(i,b,t);},
    readFacts:async(i:string,opts:Parameters<typeof h.port.readFacts>[1])=>{planning=true;await new Promise(r=>setTimeout(r,3*600_000));return h.port.readFacts(i,opts);}};
   const p=run(h,{port});
   for(let i=0;i<5000&&!planning;i++)await Promise.resolve();
   expect(planning).toBe(true);
   const before=renewals;
   await vi.advanceTimersByTimeAsync(HEARTBEAT_MS*2);
   expect(renewals-before).toBe(2);
   h.facts.expireLease(ISSUER,'HK' as unknown as Market);
   expect(await h.port.claimLease(ISSUER,OTHER,600)).toBe(true);
   await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
   const o=await p;
   expect(o).toMatchObject({outcome:'failed',code:'lease_lost'});
   await vi.advanceTimersByTimeAsync(3*600_000);                               // the abandoned planning resumes …
   expect(h.facts.filings()).toEqual([]);expect(h.facts.facts()).toEqual([]);expect(h.docs.publications()).toEqual([]);   // … and stages nothing
   expect(h.facts.scope().find(s=>s.issuer_id===ISSUER)).toMatchObject({lease_batch_id:OTHER});
  }finally{vi.useRealTimers();}
 });
 it('P2-6: issuers whose only staged work waits on an owner quarantine decision are not due, so a later issuer is not starved by a limit-1 batch',async()=>{
  const B='00000000-0000-4000-8000-0000000000a2';
  const h=hkHarness({issuers:[{issuer_id:ISSUER,code:'00268'},{issuer_id:B,code:'00700'}]});
  const runFor=async(issuer:string)=>(await runHkFactsSync(candidatesDepsOf(h),{issuerIds:[issuer],batchId:await h.batch(),triggeredBy:'script'}))[0];
  // ISSUER: a same-day replacement leaves one link staged behind a quarantined fact (spec §12 example 10)
  await confirmedDoc(h,[FY25[0]],'2026032500012_c');
  expect((await runFor(ISSUER)).outcome).toBe('published');
  const v2=await seedHkExtraction(h,{sourceRef:'2026032500012_c',bytesTag:'v2',facts:[{...FY25[0],value:'6256999'}]});
  await confirm(h,(await seedHkCandidates(h,v2)).values());
  expect(await runFor(ISSUER)).toMatchObject({outcome:'published',finish:{published:0,still_staged:1,abandoned:0}});
  // B: an ordinary confirmed candidate, created after ISSUER's wait began
  const bx=await seedHkExtraction(h,{issuerId:B,sourceRef:'2026032600013_c',facts:[FY25[0]]});
  await confirm(h,(await seedHkCandidates(h,bx)).values());
  expect((await h.port.promotionDue(HK_PUB_GEN,1)).map(x=>x.issuerId)).toEqual([B]);         // batch 1 (limit 1): ISSUER's quarantine wait does not take the slot
  expect((await runFor(B)).outcome).toBe('published');
  expect(await h.port.promotionDue(HK_PUB_GEN,1)).toEqual([]);                                  // batch 2: nothing actionable while the decision is unchanged
  const item=h.tables.rows('dq_quarantine').find(r=>r.dataset==='facts.hk'&&r.reason_code==='same_day_conflict')!;
  const chosen=h.facts.facts().find(f=>f.concept==='revenue'&&f.issuer_id===ISSUER&&f.value==='6256999')!.fact_id;
  await h.port.resolveHkFactsQuarantine(String(item.id),[chosen],ADMIN);
  expect((await h.port.promotionDue(HK_PUB_GEN,1)).map(x=>x.issuerId)).toEqual([ISSUER]);   // batch 3: the decision changed, the link is actionable again
  expect(await runFor(ISSUER)).toMatchObject({outcome:'skipped',code:'nothing_to_publish'});
  expect(await h.port.promotionDue(HK_PUB_GEN,10)).toEqual([]);
 });
});
