// src/lib/macro/strategy/db-contract.ts
// Shared StrategyDb contract (spec §4.4, plan 2026-11-07 Task 3): the same cases run against memoryStrategyDb
// (db.test.ts) and strategyDbOver(pg transport) on real PostgreSQL (strategy.integration.test.ts), so the memory rules
// the unit tests rely on are the SQL functions' rules. Not a test file: it registers describe/it only when called.
// Months are unique per call (`monthBase` + counter) so cases never share a review pointer on a shared database.
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './hash';
import type {ManifestKind,RenderedExplanation,ReviewFacts,StrategyManifest} from './contract';
import {StrategyDbError} from './db';
import type {StrategyDb} from './db';

export interface StrategyDbHarness{
 db:StrategyDb;
 /** Sets the identity the 'session' reads run under (RLS user). */
 asUser(userId:string):void;
 /** Makes the claim of `explanationId` look `minutes` older (memory: advances the clock; pg: moves claimed_at back). */
 ageClaim(explanationId:string,minutes:number):Promise<void>;
 close?():Promise<void>;
}
/** Minimal valid manifest body of `kind`; `salt` makes the identity unique. */
export function testManifest(kind:ManifestKind,o:{salt?:string;cutoff?:string}={}):StrategyManifest{
 return {kind,params:{salt:o.salt??randomUUID()},cutoff:o.cutoff??'2026-11-03T00:00:00.000Z',snapshots:{US:null,CN:null},catalog:[],reads:[],inputs:[],
  catalog_version:'macro-catalog/fixture-1',method_version:kind==='review'?'macro-review/1':'macro-facts/1',code_version:'test-code'};
}
export function testFacts(month:string,cutoff='2026-11-03T00:00:00.000Z'):ReviewFacts{
 return {region:'US',month,cutoff,baseline_cutoff:'2026-10-03T00:00:00.000Z',snapshot_id:null,baseline_snapshot_id:null,baseline_missing:true,
  releases:[],revisions:[],timeliness:[],policy_events:[],episode_changes:[],asset_moves:[],coverage:[]};
}
const RENDERED:RenderedExplanation={facts:[{fact_id:'f1',text:'事实句'}],hypotheses:[{text:'假设句',fact_ids:['f1']}],counterpoints:[]};
/** A finalizeUsageRun body as llm-deps.ts builds it (stored verbatim on the run row). */
const PAYLOAD={status:'completed',provider:'test-provider',model:'test-model',inputTokens:3,cacheHitInputTokens:0,cacheMissInputTokens:3,outputTokens:2,costMicrormb:5,pricingVersion:'p1',usdCnyMicros:7_100_000,usageEstimated:false,byo:false};
/** StrategyDbError code of a rejection, 'resolved' when it did not reject. */
const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof StrategyDbError?e.code:`not_strategy_db_error:${String(e)}`);

export function strategyDbContract(label:string,setup:()=>Promise<StrategyDbHarness>,monthBase:number):void{
 describe(label,()=>{
  let h:StrategyDbHarness;let db:StrategyDb;let seq=0;
  const month=()=>{const n=monthBase*12+seq++;return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;};
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const review=async(m:string,o:{cutoff?:string;expected:number;salt?:string})=>{
   const stored=await db.putManifest(testManifest('review',{salt:o.salt,cutoff:o.cutoff}));
   return {stored,out:await db.publishReview({region:'US',month:m,expectedGeneration:o.expected,cutoff:o.cutoff??'2026-11-03T00:00:00.000Z',status:'ok',manifestId:stored.manifest_id,
    manifestHash:stored.manifest_hash,facts:testFacts(m,o.cutoff),methodVersion:'macro-review/1',codeVersion:'test-code'})};
  };
  const claim=async(o:{user?:string;request?:string;payload?:string;manifestId?:string}={})=>{
   const manifestId=o.manifestId??(await db.putManifest(testManifest('explain_facts'))).manifest_id;
   const args={userId:o.user??randomUUID(),requestId:o.request??randomUUID(),payloadHash:o.payload??'a'.repeat(64),subjectKind:'review' as const,subjectId:'subject-1',locale:'zh' as const,manifestId};
   return {args,out:await db.claimExplanation(args)};
  };
  const finish=(id:string,state:'accepted'|'rejected'|'failed',raw:unknown,o:{failureCodes?:string[];finalizePayload?:Record<string,unknown>}={})=>db.finishExplanation({explanationId:id,state,provider:'test-provider',model:'test-model',
   promptVersion:'macro-explain-prompt/1',validatorVersion:'macro-explain-validator/1',rawOutput:raw,validation:{ok:state==='accepted'},rendered:state==='accepted'?RENDERED:null,
   failureCodes:o.failureCodes??(state==='accepted'?[]:['numeral']),accounting:{tokens:10},finalizePayload:o.finalizePayload??null});

  it('putManifest: identity is sha256 of the canonical body; idempotent; any field change is a new manifest; anon read; unknown → null',async()=>{
   const body=testManifest('transmission');
   const a=await db.putManifest(body);
   expect(a.manifest_hash).toBe(sha256Hex(canonicalJson(body)));
   expect(a.body).toEqual(body);
   expect(sha256Hex(canonicalJson(a.body))).toBe(a.manifest_hash);                  // storage round-trip: the stored body reproduces its hash
   expect(await code(db.putManifest({...body,params:{salt:Array(1) as unknown as string}}))).not.toBe('resolved');   // a sparse array would store as [null] under another hash
   const reordered=Object.fromEntries(Object.entries(body).reverse()) as unknown as typeof body;   // same content, other key order
   expect((await db.putManifest(reordered)).manifest_id).toBe(a.manifest_id);
   const b=await db.putManifest({...body,cutoff:'2026-11-02T00:00:00.000Z'});
   expect(b.manifest_id).not.toBe(a.manifest_id);
   expect(await db.manifest(a.manifest_id)).toEqual(a);
   expect(await db.manifest(randomUUID())).toBeNull();
   expect(await db.manifest('not-a-uuid')).toBeNull();
  });

  it('publishReview: absent pointer = generation 0, replayed before stale, A→B→A advances to the original A result, older cutoff is stale',async()=>{
   const m=month();
   expect(await db.reviewCurrent('US',m)).toBeNull();
   const {stored:mA,out:a1}=await review(m,{expected:1,salt:'A'});
   expect(a1).toMatchObject({outcome:'stale',generation:0});                       // absent pointer is generation 0
   expect(await db.reviewCurrent('US',m)).toBeNull();
   const {out:a2}=await review(m,{expected:0,salt:'A'});
   expect(a2).toEqual({result_id:a1.result_id,generation:1,outcome:'advanced'});   // the stale call already stored the immutable result
   const cur=await db.reviewCurrent('US',m);
   expect(cur).toMatchObject({generation:1,cutoff:'2026-11-03T00:00:00.000Z',result:{result_id:a1.result_id,region:'US',month:m,status:'ok',manifest_id:mA.manifest_id,manifest_hash:mA.manifest_hash}});
   expect(cur!.result.facts).toEqual(testFacts(m));
   expect(await review(m,{expected:0,salt:'A'})).toMatchObject({out:{result_id:a1.result_id,generation:1,outcome:'replayed'}});   // replayed wins over a stale expectation
   const {out:b0}=await review(m,{expected:0,salt:'B'});
   expect(b0).toMatchObject({outcome:'stale',generation:1});
   const {out:b1}=await review(m,{expected:1,salt:'B'});
   expect(b1).toMatchObject({outcome:'advanced',generation:2});
   expect(b1.result_id).not.toBe(a1.result_id);
   const {out:a3}=await review(m,{expected:2,salt:'A'});
   expect(a3).toEqual({result_id:a1.result_id,generation:3,outcome:'advanced'});   // A→B→A: pointer moves back to the same immutable A row
   const {out:old}=await review(m,{expected:3,salt:'C',cutoff:'2026-11-02T00:00:00.000Z'});
   expect(old).toMatchObject({outcome:'stale',generation:3});
   expect((await db.reviewCurrent('US',m))!.result.result_id).toBe(a1.result_id);
  });

  it('publishReview: unknown manifest, wrong hash or a non-review manifest → not_found',async()=>{
   const m=month();const r=await db.putManifest(testManifest('review'));const t=await db.putManifest(testManifest('transmission'));
   const base={region:'US' as const,month:m,expectedGeneration:0,cutoff:'2026-11-03T00:00:00.000Z',status:'ok' as const,facts:testFacts(m),methodVersion:'macro-review/1',codeVersion:'test-code'};
   expect(await code(db.publishReview({...base,manifestId:randomUUID(),manifestHash:r.manifest_hash}))).toBe('not_found');
   expect(await code(db.publishReview({...base,manifestId:r.manifest_id,manifestHash:'f'.repeat(64)}))).toBe('not_found');
   expect(await code(db.publishReview({...base,manifestId:t.manifest_id,manifestHash:t.manifest_hash}))).toBe('not_found');
   expect(await db.reviewCurrent('US',m)).toBeNull();
  });

  it('publishReview: the cutoff must equal the manifest cutoff (cutoff_mismatch) and the expected generation must be a number (invalid_argument); nothing is stored',async()=>{
   const m=month();const r=await db.putManifest(testManifest('review',{cutoff:'2026-11-03T00:00:00.000Z'}));
   const base={region:'US' as const,month:m,expectedGeneration:0,cutoff:'2026-11-03T00:00:00.000Z',status:'ok' as const,manifestId:r.manifest_id,manifestHash:r.manifest_hash,facts:testFacts(m),methodVersion:'macro-review/1',codeVersion:'test-code'};
   expect(await code(db.publishReview({...base,cutoff:'2026-11-04T00:00:00.000Z'}))).toBe('cutoff_mismatch');   // later than the frozen evidence
   expect(await code(db.publishReview({...base,cutoff:'2026-11-02T00:00:00.000Z'}))).toBe('cutoff_mismatch');   // earlier too
   expect(await code(db.publishReview({...base,expectedGeneration:null as unknown as number}))).toBe('invalid_argument');
   expect(await code(db.publishReview({...base,expectedGeneration:undefined as unknown as number}))).toBe('invalid_argument');
   expect(await db.reviewCurrent('US',m)).toBeNull();
   expect(await db.reviewIndex('US',1000).then(x=>x.filter(i=>i.month===m))).toEqual([]);
   expect(await db.publishReview(base)).toMatchObject({outcome:'advanced',generation:1});   // the matching cutoff still publishes (same instant, other spelling)
   expect(await db.publishReview({...base,expectedGeneration:1,cutoff:'2026-11-03T08:00:00+08:00'})).toMatchObject({outcome:'replayed',generation:1});
  });

  it('reviewIndex: newest month first, limited, with status and generation; recordReviewAttempt accepts failed',async()=>{
   const m1=month(),m2=month();
   await review(m1,{expected:0});await review(m2,{expected:0});
   const idx=await db.reviewIndex('US',1000);
   const mine=idx.filter(x=>x.month===m1||x.month===m2);
   expect(mine.map(x=>[x.month,x.status,x.generation])).toEqual([[m2,'ok',1],[m1,'ok',1]]);
   expect(idx.map(x=>x.month)).toEqual([...idx.map(x=>x.month)].sort().reverse());
   expect(await db.reviewIndex('US',1)).toHaveLength(1);
   await expect(db.recordReviewAttempt('US',m1,'failed',{stage:'manifest',message:'boom'})).resolves.toBeUndefined();
  });

  it('claimExplanation: claimed once with an RPC-made id and audit key; repeat → existing; other payload → payload_conflict; bad manifest → not_found',async()=>{
   const {args,out}=await claim();
   expect(out.outcome).toBe('claimed');
   expect(out.usage_audit_key).toBe(`${out.explanation_id}`);
   expect(out.projection).toMatchObject({explanation_id:out.explanation_id,subject_kind:'review',subject_id:'subject-1',locale:'zh',manifest_id:args.manifestId,state:'running',rendered:null,failure_codes:[],finished_at:null});
   expect(await db.runOf(args.userId,args.requestId)).toEqual({explanation_id:out.explanation_id,payload_hash:args.payloadHash,state:'running'});
   expect(await db.runOf(args.userId,randomUUID())).toBeNull();
   const again=await db.claimExplanation(args);
   expect(again).toMatchObject({outcome:'existing',explanation_id:out.explanation_id,usage_audit_key:out.usage_audit_key});
   expect(await code(db.claimExplanation({...args,payloadHash:'b'.repeat(64)}))).toBe('payload_conflict');
   const review=await db.putManifest(testManifest('review'));
   expect(await code(db.claimExplanation({...args,requestId:randomUUID(),manifestId:review.manifest_id}))).toBe('not_found');
   expect(await code(db.claimExplanation({...args,requestId:randomUUID(),manifestId:randomUUID()}))).toBe('not_found');
  });

  it('claimExplanation: a running claim older than five minutes becomes abandoned (projection failed); four minutes is still running',async()=>{
   const young=await claim();
   await h.ageClaim(young.out.explanation_id,4);
   expect((await db.claimExplanation(young.args)).projection.state).toBe('running');
   const old=await claim();
   await h.ageClaim(old.out.explanation_id,6);
   const again=await db.claimExplanation(old.args);
   expect(again).toMatchObject({outcome:'existing',explanation_id:old.out.explanation_id,projection:{state:'failed',failure_codes:['abandoned']}});
   expect(again.projection.finished_at).not.toBeNull();
   expect((await db.runOf(old.args.userId,old.args.requestId))!.state).toBe('abandoned');
   await db.recordCompletion({explanationId:old.out.explanation_id,rawOutput:{points:[]},finalizePayload:PAYLOAD});   // late completion: run row only
   const late=await finish(old.out.explanation_id,'accepted',{points:[]});
   expect(late).toMatchObject({state:'failed',failure_codes:['abandoned'],rendered:null});
   expect((await db.runOf(old.args.userId,old.args.requestId))!.state).toBe('abandoned');
   await expect(db.markFinalized(old.out.explanation_id)).resolves.toBeUndefined();   // abandoned runs with late accounting are settled too
  });

  it('finishExplanation: running → accepted; same state and raw output is idempotent; other raw or state → invalid_transition; unknown → not_found',async()=>{
   const {out}=await claim();
   const p=await finish(out.explanation_id,'accepted',{points:[1]});
   expect(p).toMatchObject({state:'accepted',rendered:RENDERED,failure_codes:[],provider:'test-provider',model:'test-model',prompt_version:'macro-explain-prompt/1',validator_version:'macro-explain-validator/1'});
   expect(p.finished_at).not.toBeNull();
   expect(await finish(out.explanation_id,'accepted',{points:[1]})).toEqual(p);
   expect(await code(finish(out.explanation_id,'accepted',{points:[2]}))).toBe('invalid_transition');
   expect(await code(finish(out.explanation_id,'rejected',{points:[1]}))).toBe('invalid_transition');
   expect(await code(finish(randomUUID(),'failed',null))).toBe('not_found');
  });

  it('finishExplanation: a running row with a recorded completion only accepts the recorded raw output (null included); the record stays untouched',async()=>{
   const a=await claim();
   await db.recordCompletion({explanationId:a.out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD});
   expect(await code(finish(a.out.explanation_id,'failed',{content:'other'}))).toBe('invalid_transition');
   expect(await code(finish(a.out.explanation_id,'failed',null))).toBe('invalid_transition');
   expect(await db.runDetail(a.out.explanation_id)).toMatchObject({state:'running',raw_output:{content:'x'},finalize_payload:PAYLOAD});
   expect(await finish(a.out.explanation_id,'accepted',{content:'x'})).toMatchObject({state:'accepted'});
   const b=await claim();   // provider threw: recorded raw output is null
   await db.recordCompletion({explanationId:b.out.explanation_id,rawOutput:null,finalizePayload:{...PAYLOAD,status:'failed'}});
   expect(await code(finish(b.out.explanation_id,'failed',{content:'late'}))).toBe('invalid_transition');
   expect(await finish(b.out.explanation_id,'failed',null,{failureCodes:['provider_error']})).toMatchObject({state:'failed',failure_codes:['provider_error']});
   const c=await claim();   // without a recorded completion the finish supplies the output
   expect(await finish(c.out.explanation_id,'rejected',{content:'z'})).toMatchObject({state:'rejected'});
  });

  it('finishExplanation: rejected and failed keep failure codes and no rendered body',async()=>{
   const r=await claim();
   expect(await finish(r.out.explanation_id,'rejected','raw text 3%',{failureCodes:['numeral','forbidden_term']})).toMatchObject({state:'rejected',rendered:null,failure_codes:['numeral','forbidden_term']});
   const f=await claim();
   expect(await finish(f.out.explanation_id,'failed',null,{failureCodes:['usage_audit_unavailable']})).toMatchObject({state:'failed',rendered:null,failure_codes:['usage_audit_unavailable']});
   expect((await db.runOf(f.args.userId,f.args.requestId))!.state).toBe('failed');
  });

   it('recordCompletion: running or abandoned; same values → no-op; another payload or output, or a final row without one → invalid_transition',async()=>{
   const {out}=await claim();
   await expect(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD})).resolves.toBeUndefined();
   await expect(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD})).resolves.toBeUndefined();
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'y'},finalizePayload:PAYLOAD}))).toBe('invalid_transition');
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:{...PAYLOAD,status:'failed'}}))).toBe('invalid_transition');
   expect(await finish(out.explanation_id,'accepted',{content:'x'})).toMatchObject({state:'accepted'});
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD}))).toBe('invalid_transition');   // a terminal row rejects even identical values
   const done=await claim();await finish(done.out.explanation_id,'failed',null);
   expect(await code(db.recordCompletion({explanationId:done.out.explanation_id,rawOutput:null,finalizePayload:PAYLOAD}))).toBe('invalid_transition');
   expect(await code(db.recordCompletion({explanationId:randomUUID(),rawOutput:null,finalizePayload:PAYLOAD}))).toBe('not_found');
  });

  it('recordCompletion: a missing, non-object or status-less finalize payload is refused and nothing is recorded',async()=>{
   const {out}=await claim();
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:null as unknown as Record<string,unknown>}))).toBe('invalid_transition');
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:{provider:'p'}}))).toBe('rpc_failed');          // no status
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:{status:'unknown'}}))).toBe('rpc_failed');
   expect(await code(db.recordCompletion({explanationId:out.explanation_id,rawOutput:{content:'x'},finalizePayload:[{status:'completed'}] as unknown as Record<string,unknown>}))).toBe('rpc_failed');
   expect(await db.runDetail(out.explanation_id)).toMatchObject({state:'running',raw_output:null,finalize_payload:null});
  });

  it('markFinalized: needs a recorded finalize payload, then any state (running after a failed finish, final); idempotent; unknown → not_found',async()=>{
   const {out}=await claim();
   expect(await code(db.markFinalized(out.explanation_id))).toBe('invalid_transition');
   await finish(out.explanation_id,'failed',null);
   expect(await code(db.markFinalized(out.explanation_id))).toBe('invalid_transition');   // final, nothing recorded
   const r=await claim();
   await db.recordCompletion({explanationId:r.out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD});
   await expect(db.markFinalized(r.out.explanation_id)).resolves.toBeUndefined();          // still running: finish failed, payload settled
   await finish(r.out.explanation_id,'accepted',{content:'x'});
   await expect(db.markFinalized(r.out.explanation_id)).resolves.toBeUndefined();
   expect(await code(db.markFinalized(randomUUID()))).toBe('not_found');
  });

  it('finishExplanation stores the finalize payload when none was recorded; a recorded payload is never overwritten',async()=>{
   const a=await claim();
   await finish(a.out.explanation_id,'accepted',{content:'x'},{finalizePayload:PAYLOAD});   // recordCompletion failed during the request
   expect(await db.runDetail(a.out.explanation_id)).toMatchObject({state:'accepted',finalize_payload:PAYLOAD,finalized:false});
   await expect(db.markFinalized(a.out.explanation_id)).resolves.toBeUndefined();
   expect((await db.runDetail(a.out.explanation_id))!.finalized).toBe(true);
   const b=await claim();
   await db.recordCompletion({explanationId:b.out.explanation_id,rawOutput:{content:'y'},finalizePayload:PAYLOAD});
   await finish(b.out.explanation_id,'accepted',{content:'y'},{finalizePayload:{...PAYLOAD,pricingVersion:'p2'}});
   expect((await db.runDetail(b.out.explanation_id))!.finalize_payload).toEqual(PAYLOAD);
  });

  it('recoverableRuns scans only the oldest 50 running rows before it looks for recorded completions',async()=>{
   const user=randomUUID();
   const manifestId=(await db.putManifest(testManifest('explain_facts'))).manifest_id;
   for(let i=0;i<50;i++){const c=await claim({user,manifestId});await h.ageClaim(c.out.explanation_id,0);}   // 50 older rows without a completion
   const late=await claim({user,manifestId});
   await db.recordCompletion({explanationId:late.out.explanation_id,rawOutput:{content:'late'},finalizePayload:PAYLOAD});
   expect(await db.recoverableRuns(user,10)).toEqual([]);                           // the 51st running row is beyond the scan cap
  });

  it('a running row with a recorded raw output is never abandoned; runDetail and recoverableRuns expose it for recovery',async()=>{
   const user=randomUUID();
   const rec=await claim({user});const bare=await claim({user});const done=await claim({user});
   await db.recordCompletion({explanationId:rec.out.explanation_id,rawOutput:{content:'x'},finalizePayload:PAYLOAD});
   await db.recordCompletion({explanationId:done.out.explanation_id,rawOutput:{content:'z'},finalizePayload:PAYLOAD});
   await finish(done.out.explanation_id,'accepted',{content:'z'});
   await h.ageClaim(rec.out.explanation_id,6);await h.ageClaim(bare.out.explanation_id,6);
   expect((await db.claimExplanation(rec.args)).projection.state).toBe('running');
   expect(await db.expireExplanations(user)).toBe(1);                              // only the row without a completion
   expect((await db.runOf(user,bare.args.requestId))!.state).toBe('abandoned');
   expect(await db.recoverableRuns(user,3)).toEqual([rec.out.explanation_id]);
   expect(await db.recoverableRuns(randomUUID(),3)).toEqual([]);
   expect(await db.runDetail(rec.out.explanation_id)).toEqual({explanation_id:rec.out.explanation_id,user_id:user,state:'running',locale:'zh',manifest_id:rec.args.manifestId,
    usage_audit_key:rec.out.usage_audit_key,raw_output:{content:'x'},finalize_payload:PAYLOAD,finalized:false});
   expect(await db.runDetail(randomUUID())).toBeNull();
   expect(await db.runDetail('not-a-uuid')).toBeNull();
  });

  it('expireExplanations: only the user\'s running claims older than five minutes → abandoned, projection failed {abandoned}',async()=>{
   const user=randomUUID();
   const old=await claim({user});const other=await claim();
   await h.ageClaim(old.out.explanation_id,6);await h.ageClaim(other.out.explanation_id,6);
   const young=await claim({user});                                             // claimed after the clock moved: not stale
   expect(await db.expireExplanations(user)).toBe(1);
   expect((await db.runOf(user,old.args.requestId))!.state).toBe('abandoned');
   expect((await db.runOf(user,young.args.requestId))!.state).toBe('running');
   expect((await db.runOf(other.args.userId,other.args.requestId))!.state).toBe('running');
   h.asUser(user);
   const mine=await db.explanationsOf('session','review','subject-1',20);
   expect(mine.find(p=>p.explanation_id===old.out.explanation_id)).toMatchObject({state:'failed',failure_codes:['abandoned']});
   expect(await db.expireExplanations(user)).toBe(0);
   expect(await db.expireExplanations('not-a-uuid')).toBe(0);
  });

  it('explanationsOf: the session user sees only their own projections of the subject, limited',async()=>{
   const userA=randomUUID(),userB=randomUUID();
   const manifestId=(await db.putManifest(testManifest('explain_facts'))).manifest_id;
   const a1=await claim({user:userA,manifestId});const a2=await claim({user:userA,manifestId});await claim({user:userB,manifestId});
   h.asUser(userA);
   const mine=(await db.explanationsOf('session','review','subject-1',20)).map(p=>p.explanation_id).sort();
   expect(mine).toEqual([a1.out.explanation_id,a2.out.explanation_id].sort());
   expect(await db.explanationsOf('session','review','subject-1',1)).toHaveLength(1);
   expect(await db.explanationsOf('session','snapshot','subject-1',20)).toEqual([]);
   h.asUser(randomUUID());
   expect(await db.explanationsOf('session','review','subject-1',20)).toEqual([]);
  });
 });
}
