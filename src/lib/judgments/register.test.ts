// src/lib/judgments/register.test.ts
// spec §14.1 register.test.ts: same input → same id; claim not in the id; duplicate vs
// idempotency_conflict on the FULL normalised payload (producer_ref / kind / target / horizon /
// label_policy); rebuilt snapshot mismatch; lookahead with the macro snapshot's available_at = max of
// its observations; abstained with empty inputs; nonce (human retry same id, model new run_id new id);
// 23505 reread; plus the seeded property test (200 runs).
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import type {TableClient} from '@/lib/db/table-client';
import {canonicalize,digest,inputsHash} from './canonical';
import {judgmentIdOf} from './contract';
import {JudgmentError} from './errors';
import {memoryJudgmentsDb} from './memory-judgments-db';
import {REGISTRY} from './registry';
import {RegisterDeferred,nonceOf,normalizedPayload,registerJudgment,samePayload} from './register';
import type {RegisterDeps,RegisterInput} from './register';
import type {CategoricalClaim,Condition,Input,JudgmentInsert,JudgmentsDb,Methodology,Subject,Target} from './types';
import type {ResolverLookup} from './register';
import {FIXTURE_ASOF,FIXTURE_RESOLVERS,fixtureInputsDb,fixtureModelMethod,fixtureRegimeMethod} from './testing/fixture-methods';
import {batchTables,spyRegister,syncTestMethod,withSubjects} from './testing/db-helpers';

const BATCH='00000000-0000-4000-8000-00000000b001';
const US:Subject={type:'macro_region',key:'US'};
const ACTOR={actor:'test' as const};
const code=(p:Promise<unknown>)=>p.then(()=>'ok',(e:unknown)=>e instanceof JudgmentError?e.code:`other:${String(e)}`);
async function setup(o:{db?:(t:TableClient)=>JudgmentsDb}={}){
 const tables=await batchTables(BATCH);
 const db=o.db?o.db(tables):withSubjects(memoryJudgmentsDb({tables}));
 for(const m of [fixtureRegimeMethod,fixtureModelMethod,{...fixtureRegimeMethod,id:'fixture_draft',status:'draft' as const}])await syncTestMethod(db,m);
 const deps:RegisterDeps={db,inputsDb:fixtureInputsDb(),tables,resolverOf:FIXTURE_RESOLVERS};
 return {db,tables,deps};
}
async function evaluated(m:Methodology<CategoricalClaim>,snapshotId:string,asOf=FIXTURE_ASOF){
 const db=fixtureInputsDb();const item={subject:US,asOf,observedAt:new Date().toISOString(),binding:{snapshot_id:snapshotId}};
 const g=await m.gather(item,db);if(!Array.isArray(g))throw new Error(`gather abstained: ${g.reason}`);
 const target=await m.resolveTarget(item,g,db);if('abstained' in target)throw new Error('target abstained');
 const out=m.compute(US,g);if(out.abstained)throw new Error('compute abstained');
 return {inputs:g,outcome:out,condition:m.condition(US,g,out.claim),target:target as Target};
}
const req=(m:Methodology,e:Awaited<ReturnType<typeof evaluated>>,o:Partial<RegisterInput>={}):RegisterInput=>({methodology:m,subject:US,asOf:FIXTURE_ASOF,producerRef:{},inputs:e.inputs,outcome:e.outcome,condition:e.condition,target:e.target,codeVersion:'abcdef0',batchId:BATCH,...o});

describe('registerJudgment: identity, duplicate and conflict (spec §6.1, §6.2)',()=>{
 it('the same input twice → the same id; the second is a duplicate and does not reach the RPC',async()=>{
  let spy!:ReturnType<typeof spyRegister>;const {deps}=await setup({db:t=>(spy=spyRegister(withSubjects(memoryJudgmentsDb({tables:t})))).db});
  const e=await evaluated(fixtureRegimeMethod,'s-a');
  const a=await registerJudgment(ACTOR,req(fixtureRegimeMethod,e),deps);
  const b=await registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,inputs:[...e.inputs].reverse()}),deps);
  expect([a.duplicate,b.duplicate,b.judgment_id]).toEqual([false,true,a.judgment_id]);
  expect(spy.calls()).toBe(1);
  expect(a.judgment_id).toBe(judgmentIdOf({subject_type:'macro_region',subject_key:'US',judgment_type:'macro_regime',methodology_id:'fixture_regime',methodology_version:'v1',as_of:FIXTURE_ASOF,inputs_hash:inputsHash(e.inputs),producer_nonce:''}));
  const row=(await deps.db.getJudgment(a.judgment_id))!;
  expect(row).toMatchObject({abstained:false,label_policy:'cutoff_vintage',target:{kind:'period',period:'2027-01'},settle_after:'2027-02-01T00:00:00.000Z',settle_by:'2027-03-03T00:00:00.000Z',inputs_hash:inputsHash(e.inputs)});
  expect(row.inputs.map(x=>x.kind)).toEqual(['macro_observation','macro_observation','macro_snapshot']);   // stored sorted
  expect(await deps.db.queueRow(a.judgment_id)).toMatchObject({settle_after:'2027-02-01T00:00:00.000Z',label_policy:'cutoff_vintage'});
 });
 it('claim is not part of the id: a different claim on the same inputs → idempotency_conflict, quarantined under that id',async()=>{
  const {deps,tables}=await setup();
  const e=await evaluated(fixtureRegimeMethod,'s-a');
  const a=await registerJudgment(ACTOR,req(fixtureRegimeMethod,e),deps);
  const mc=e.condition;if(mc.resolver!=='macro_regime_replay')throw new Error(`fixture condition is ${mc.resolver}, expected macro_regime_replay`);
  const driftedCondition:Condition={...mc,predicate:{op:'eq',rhs:'overheat'}};
  const drifted:Awaited<ReturnType<typeof evaluated>>={...e,outcome:{abstained:false,claim:{...e.outcome.claim,selected:'overheat'}},condition:driftedCondition};
  const err=await registerJudgment(ACTOR,req(fixtureRegimeMethod,drifted),deps).catch(x=>x);
  expect(err).toBeInstanceOf(JudgmentError);expect(err.code).toBe('idempotency_conflict');expect(err.message).toContain(a.judgment_id);
  const q=tables.rows('dq_quarantine');
  expect(q).toHaveLength(1);
  expect(q[0]).toMatchObject({dataset:'judgments',table_name:'judgments',natural_key:a.judgment_id,reason_code:'idempotency_conflict',status:'open',batch_id:BATCH});
  expect((q[0].payload as {registered:{claim:{selected:string}};attempted:{claim:{selected:string}}}).registered.claim.selected).toBe('recovery');
  expect((q[0].payload as {attempted:{claim:{selected:string}}}).attempted.claim.selected).toBe('overheat');
 });
 it('the comparison covers producer_ref and label_policy (via register) and kind / target / horizon (normalised payload)',async()=>{
  const {deps}=await setup();
  const e=await evaluated(fixtureModelMethod,'s-a');
  const ref1={model:'m1',prompt_sha256:'a'.repeat(64),run_id:'run-1'};
  const a=await registerJudgment(ACTOR,req(fixtureModelMethod,e,{producerRef:ref1}),deps);
  expect(await code(registerJudgment(ACTOR,req(fixtureModelMethod,e,{producerRef:{...ref1,model:'m2'}}),deps))).toBe('idempotency_conflict');
  const r=await evaluated(fixtureRegimeMethod,'s-b');
  await registerJudgment(ACTOR,req(fixtureRegimeMethod,r),deps);
  const relabelled:Methodology<CategoricalClaim>={...fixtureRegimeMethod,params:{grace_days:30,label_policy:'first_observed'}};
  expect(await code(registerJudgment(ACTOR,req(relabelled,r),deps))).toBe('idempotency_conflict');
  const row=a.row;
  expect(samePayload(row,{...row,code_version:'other00',batch_id:'00000000-0000-4000-8000-00000000b002',retrospective_hint:{label_available_at:'2026-01-01T00:00:00.000Z'}})).toBe(true);
  expect(samePayload(row,{...row,kind:'probability'})).toBe(false);
  expect(samePayload(row,{...row,target:{kind:'period',period:'2027-02'}})).toBe(false);
  expect(samePayload(row,{...row,horizon:{unit:'calendar_months',n:4}})).toBe(false);
  expect(samePayload(row,{...row,label_policy:'first_observed'})).toBe(false);
  expect(samePayload(row,{...row,producer_ref:{}})).toBe(false);
  expect(Object.keys(normalizedPayload(row))).not.toContain('code_version');
 });
 it('23505 on insert → reread: the same payload is a duplicate, a different winner is idempotency_conflict',async()=>{
  const racing=(db:JudgmentsDb,mutate:(r:JudgmentInsert)=>JudgmentInsert):JudgmentsDb=>new Proxy(db,{get:(t,k,rcv)=>k==='registerJudgment'
   ?async(row:JudgmentInsert,q:Parameters<JudgmentsDb['registerJudgment']>[1])=>{await t.registerJudgment(mutate(row),q);throw Object.assign(new Error('duplicate key value violates unique constraint "judgments_pkey"'),{code:'23505'});}
   :Reflect.get(t,k,rcv)});
  const e=await evaluated(fixtureRegimeMethod,'s-a');
  const same=await setup({db:t=>racing(withSubjects(memoryJudgmentsDb({tables:t})),r=>r)});
  expect(await registerJudgment(ACTOR,req(fixtureRegimeMethod,e),same.deps)).toMatchObject({duplicate:true});
  const other=await setup({db:t=>racing(withSubjects(memoryJudgmentsDb({tables:t})),r=>({...r,claim:{...(r.claim as CategoricalClaim),distribution:{recovery:0.41,overheat:0.29,stagflation:0.2,recession:0.1}}}))});
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e),other.deps))).toBe('idempotency_conflict');
  expect(other.tables.rows('dq_quarantine')).toHaveLength(1);
 });
});

describe('registerJudgment: inputs (spec §3.5, §3.7, §6.2 step 1)',()=>{
 it('a rebuilt snapshot that differs → input_snapshot_mismatch (with or without a recomputed hash)',async()=>{
  const {deps}=await setup();const e=await evaluated(fixtureRegimeMethod,'s-a');
  const i=e.inputs.findIndex(x=>x.kind==='macro_snapshot');
  const s=e.inputs[i] as Extract<Input,{kind:'macro_snapshot'}>;
  const edited={...s,snapshot:{...s.snapshot,coverage:0.95}};
  const swap=(x:Input)=>e.inputs.map((y,j)=>j===i?x:y);
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,inputs:swap({...edited,hash:digest(edited.snapshot)})}),deps))).toBe('input_snapshot_mismatch');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,inputs:swap(edited)}),deps))).toBe('input_snapshot_mismatch');
 });
 it('kind outside the method / whitelist, duplicate refs and unknown origins are refused before any rebuild',async()=>{
  const {deps}=await setup();const e=await evaluated(fixtureRegimeMethod,'s-a');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,inputs:[...e.inputs,{...e.inputs[0],kind:'financial_fact'} as Input]}),deps))).toBe('input_not_allowed');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,inputs:[...e.inputs,{...e.inputs[0],kind:'legacy_fill'} as Input]}),deps))).toBe('input_not_allowed');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,inputs:[...e.inputs,e.inputs[0]]}),deps))).toBe('input_not_allowed');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,inputs:e.inputs.map((x,j)=>j===0?{...x,origin:{...x.origin,publisher:'someone else'}}:x)}),deps))).toBe('input_origin_unknown');
 });
 it('lookahead: the macro snapshot is available when its LAST observation is (not at created_at)',async()=>{
  const {deps}=await setup();
  const late=await evaluated(fixtureRegimeMethod,'s-late');
  expect(late.inputs.find(x=>x.kind==='macro_snapshot')!.available_at).toBe('2026-10-17T12:30:00.000Z');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,late),deps))).toBe('lookahead');
  const next=await evaluated(fixtureRegimeMethod,'s-late','2026-10-17');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,next,{asOf:'2026-10-17'}),deps))).toBe('ok');
 });
 it('an abstained judgment registers with empty inputs and no queue row',async()=>{
  const {deps}=await setup();
  const r=await registerJudgment(ACTOR,{methodology:fixtureRegimeMethod,subject:US,asOf:FIXTURE_ASOF,producerRef:{},inputs:[],outcome:{abstained:true,reason:'binding_missing',missing:['snapshot_id']},condition:null,target:null,codeVersion:'abcdef0',batchId:BATCH},deps);
  expect(r).toMatchObject({abstained:true,duplicate:false});
  expect(await deps.db.getJudgment(r.judgment_id)).toMatchObject({abstained:true,abstain_reason:'binding_missing',inputs:[],claim:null,condition:null,target:null,settle_after:null});
  expect(await deps.db.queueRow(r.judgment_id)).toBeNull();
 });
});

describe('registerJudgment: gates (spec §6.2, §13)',()=>{
 it('methodology, subject, code_version and dry-run rules',async()=>{
  const {deps}=await setup();const e=await evaluated(fixtureRegimeMethod,'s-a');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e,{codeVersion:'abc'}),deps))).toBe('code_version_missing');
  expect(await code(registerJudgment(ACTOR,req({...fixtureRegimeMethod,id:'never_synced'},e),deps))).toBe('methodology_unavailable');
  const draft={...fixtureRegimeMethod,id:'fixture_draft',status:'draft' as const};
  expect(await code(registerJudgment(ACTOR,req(draft,e),deps))).toBe('methodology_unavailable');
  const dry=await registerJudgment({actor:'test',dryRun:true},req(draft,e),deps);
  expect(dry).toMatchObject({dry_run:true,duplicate:false});expect(await deps.db.getJudgment(dry.judgment_id)).toBeNull();
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e,{subject:{type:'issuer',key:'00000000-0000-4000-8000-0000000000aa'}}),deps))).toBe('subject_type_not_public');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e,{subject:{type:'security',key:'US:AAPL'}}),deps))).toBe('subject_type_not_public');
  const missing=await setup({db:t=>withSubjects(memoryJudgmentsDb({tables:t}),()=> 'missing')});
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e),missing.deps))).toBe('subject_missing');
  const inactive=await setup({db:t=>withSubjects(memoryJudgmentsDb({tables:t}),()=> 'inactive')});
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e),inactive.deps))).toBe('subject_inactive');
 });
 it('claim, condition and target checks',async()=>{
  const {deps}=await setup();const e=await evaluated(fixtureRegimeMethod,'s-a');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,outcome:{abstained:false,claim:{} as CategoricalClaim}}),deps))).toBe('invalid_claim');
  // Narrow the union before replacing the predicate: spreading a Condition union with a new predicate is not a Condition (TS2322).
  const mc=e.condition;if(mc.resolver!=='macro_regime_replay')throw new Error(`fixture condition is ${mc.resolver}, expected macro_regime_replay`);
  const wrongRhs:Condition={...mc,predicate:{op:'eq',rhs:'recession'}};
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,condition:wrongRhs}),deps))).toBe('invalid_condition');
  // Deliberately ill-typed fixture (macro params under a private resolver): the unsafe boundary is this one explicit cast.
  const wrongResolver=({...mc,resolver:'recommendation_hit'} as unknown) as Condition;
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,condition:wrongResolver}),deps))).toBe('invalid_condition');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,target:{kind:'period',period:'2027-02'}}),deps))).toBe('invalid_condition');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e,{condition:null}),deps))).toBe('invalid_condition');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e),{...deps,resolverOf:()=>null}))).toBe('invalid_condition');
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,e),{...deps,resolverOf:n=>({...FIXTURE_RESOLVERS(n)!,validateParams:()=>false})}))).toBe('invalid_condition');
 });
});

describe('registerJudgment: review round 1 (R-01, R-03, retrospective hint)',()=>{
 const ISSUER:Subject={type:'issuer',key:'00000000-0000-4000-8000-0000000000aa'};
 const fiscalTarget=(anchor:string):Target=>({kind:'fiscal_period',period_end:'2026-12-31',calendar:{anchor_period_end:anchor,months:3},extrapolated:false});
 const fiscal=(recomputed:Target|'abstain'):Methodology<CategoricalClaim>=>({...fixtureRegimeMethod,id:'fixture_fiscal',subject_types:['issuer'],horizon:{unit:'fiscal_quarters',n:1},
  resolveTarget:async()=>recomputed==='abstain'?{abstained:true,reason:'target_unresolvable',missing:['published_filing']}:recomputed});
 it('R-01: a submitted target that differs from the recomputed one (invented fiscal calendar) → invalid_condition',async()=>{
  const m=fiscal(fiscalTarget('2026-09-30'));const {deps}=await setup();await syncTestMethod(deps.db,m);
  const e=await evaluated(fixtureRegimeMethod,'s-a');
  expect(await code(registerJudgment(ACTOR,req(m,e,{subject:ISSUER,target:fiscalTarget('2026-06-30')}),deps))).toBe('invalid_condition');
  expect(await code(registerJudgment(ACTOR,req(m,e,{subject:ISSUER,target:fiscalTarget('2026-09-30')}),deps))).toBe('ok');
 });
 it('R-01: resolveTarget abstaining at registration → registered as abstained target_unresolvable, no queue row',async()=>{
  const m=fiscal('abstain');const {deps}=await setup();await syncTestMethod(deps.db,m);
  const e=await evaluated(fixtureRegimeMethod,'s-a');
  const r=await registerJudgment(ACTOR,req(m,e,{subject:ISSUER,target:fiscalTarget('2026-06-30')}),deps);
  expect(r.abstained).toBe(true);
  expect(await deps.db.getJudgment(r.judgment_id)).toMatchObject({abstained:true,abstain_reason:'target_unresolvable',claim:null,condition:null,target:null,settle_after:null});
  expect(await deps.db.queueRow(r.judgment_id)).toBeNull();
 });
 it('R-03: margin_pp:undefined is an omission, never a throw; it differs from a registered margin_pp (conflict + quarantine); an identical claim is a duplicate',async()=>{
  const {deps,tables}=await setup();const e=await evaluated(fixtureRegimeMethod,'s-a');
  const a=await registerJudgment(ACTOR,req(fixtureRegimeMethod,e),deps);
  expect((e.outcome.claim as CategoricalClaim).margin_pp).toBeDefined();
  const omitted:Awaited<ReturnType<typeof evaluated>>={...e,outcome:{abstained:false,claim:{...e.outcome.claim,margin_pp:undefined}}};
  expect(await code(registerJudgment(ACTOR,req(fixtureRegimeMethod,omitted),deps))).toBe('idempotency_conflict');
  expect(tables.rows('dq_quarantine')).toHaveLength(1);
  expect(await registerJudgment(ACTOR,req(fixtureRegimeMethod,{...e,outcome:{abstained:false,claim:{...e.outcome.claim}}}),deps)).toMatchObject({duplicate:true,judgment_id:a.judgment_id});
  // a first registration with the undefined member stores the omission
  const b=await setup();
  const first=await registerJudgment(ACTOR,req(fixtureRegimeMethod,omitted),b.deps);
  expect(first.duplicate).toBe(false);
  expect(Object.keys((await b.deps.db.getJudgment(first.judgment_id))!.claim as object)).not.toContain('margin_pp');
  expect(await registerJudgment(ACTOR,req(fixtureRegimeMethod,omitted),b.deps)).toMatchObject({duplicate:true});
 });
 it('retrospective: RegisterResult carries the db verdict and a resolver labelAvailableAt reaches retrospective_hint',async()=>{
  const {deps}=await setup();const e=await evaluated(fixtureRegimeMethod,'s-a');
  const label='2026-01-02T00:00:00.000Z';
  const resolverOf:ResolverLookup=n=>({...FIXTURE_RESOLVERS(n)!,labelAvailableAt:()=>label});
  const r=await registerJudgment(ACTOR,req(fixtureRegimeMethod,e),{...deps,resolverOf});
  expect(r.row.retrospective_hint).toEqual({label_available_at:label});
  expect(r.retrospective).toBe(true);
  expect(r.retrospective).toBe((await deps.db.getJudgment(r.judgment_id))!.retrospective);
  const fresh=await setup();
  const none=await registerJudgment({actor:'test',dryRun:true},req(fixtureRegimeMethod,e),fresh.deps);
  expect(none.row.retrospective_hint).toEqual({label_available_at:null});expect(none.retrospective).toBeNull();
 });
});

describe('producer nonce (spec §3.6)',()=>{
 it('rule → empty; human is stable across retries; third_party is document:version; bad refs are refused',()=>{
  expect(nonceOf('rule',{})).toBe('');
  const human={analyst_id:'a1',source_record:{table:'recommendations',id:'r1'}};
  expect(nonceOf('human',human)).toBe('a1:recommendations:r1');expect(nonceOf('human',structuredClone(human))).toBe(nonceOf('human',human));
  const idWith=(nonce:string)=>judgmentIdOf({subject_type:'issuer',subject_key:'00000000-0000-4000-8000-0000000000aa',judgment_type:'recommendation_call',methodology_id:'recommendation_call',methodology_version:'v1',as_of:'2026-11-01',inputs_hash:'0'.repeat(64),producer_nonce:nonce});
  expect(idWith(nonceOf('human',human))).toBe(idWith(nonceOf('human',structuredClone(human))));
  expect(nonceOf('third_party',{institution:'x',document_id:'d1',version_hash:'h1'})).toBe('d1:h1');
  expect(()=>nonceOf('rule',{x:1} as never)).toThrow(JudgmentError);
  expect(()=>nonceOf('model',{model:'m',prompt_sha256:'p',run_id:''})).toThrow(JudgmentError);
 });
 it('model: the same run_id converges on one id, a new run_id is a new judgment',async()=>{
  const {deps}=await setup();const e=await evaluated(fixtureModelMethod,'s-a');
  const ref=(run_id:string)=>({model:'m1',prompt_sha256:'a'.repeat(64),run_id});
  const a=await registerJudgment(ACTOR,req(fixtureModelMethod,e,{producerRef:ref('run-1')}),deps);
  const again=await registerJudgment(ACTOR,req(fixtureModelMethod,e,{producerRef:ref('run-1')}),deps);
  const b=await registerJudgment(ACTOR,req(fixtureModelMethod,e,{producerRef:ref('run-2')}),deps);
  expect(again).toMatchObject({duplicate:true,judgment_id:a.judgment_id});
  expect(b.judgment_id).not.toBe(a.judgment_id);expect(b.duplicate).toBe(false);
 });
});

// Seeded PRNG (mulberry32) + Fisher–Yates: deterministic shuffles for the property test.
const rng=(seed:number)=>()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
const shuffle=<T>(xs:readonly T[],r:()=>number)=>{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
describe('property (spec §14.1): rule methods are deterministic and the id ignores input order',()=>{
 it('200 seeded shuffles per case: compute / condition byte-identical on repeat, id unchanged',async()=>{
  const cases:{m:Methodology;subject:Subject;inputs:Input[];asOf:string}[]=[];
  for(const s of ['s-a','s-b']){const e=await evaluated(fixtureRegimeMethod,s);cases.push({m:fixtureRegimeMethod,subject:US,inputs:e.inputs,asOf:FIXTURE_ASOF});}
  // Every REGISTRY rule method with a committed public replay fixture (Task 13 / 19 add files; this test picks them up).
  const dir='fixtures/judgments/replay';
  if(existsSync(dir))for(const f of readdirSync(dir).filter(x=>x.endsWith('.json')).sort()){
   const fx=JSON.parse(readFileSync(join(dir,f),'utf8')) as {judgment:{methodology_id:string;methodology_version:string;subject_type:Subject['type'];subject_key:string;inputs:Input[];as_of:string;abstained:boolean}};
   const m=REGISTRY.find(x=>x.id===fx.judgment.methodology_id&&x.version===fx.judgment.methodology_version);
   if(m&&m.producer_kind==='rule'&&!fx.judgment.abstained)cases.push({m,subject:{type:fx.judgment.subject_type,key:fx.judgment.subject_key},inputs:fx.judgment.inputs,asOf:fx.judgment.as_of});
  }
  for(const c of cases){
   const base=c.m.compute(c.subject,c.inputs);if(base.abstained)throw new Error(`${c.m.id} abstains on its fixture`);
   const baseCond=canonicalize(c.m.condition(c.subject,c.inputs,base.claim));
   const idOf=(xs:Input[])=>judgmentIdOf({subject_type:c.subject.type,subject_key:c.subject.key,judgment_type:c.m.judgment_type,methodology_id:c.m.id,methodology_version:c.m.version,as_of:c.asOf,inputs_hash:inputsHash(xs),producer_nonce:''});
   const baseId=idOf(c.inputs);
   for(let seed=1;seed<=200;seed++){
    const perm=shuffle(c.inputs,rng(seed));
    const a=c.m.compute(c.subject,perm),b=c.m.compute(c.subject,perm);
    expect(canonicalize(a)).toBe(canonicalize(b));expect(canonicalize(a)).toBe(canonicalize(base));
    if(!a.abstained)expect(canonicalize(c.m.condition(c.subject,perm,a.claim))).toBe(baseCond);
    expect(idOf(perm)).toBe(baseId);
   }
  }
 });
});

describe('T12 r3 conflict mutation cancellation',()=>{
 it.each([false,true])('guards conflict quarantine, unique recovery=%s',async recovery=>{
  const {deps,tables,db}=await setup();const e=await evaluated(fixtureRegimeMethod,'s-a');
  const original=await registerJudgment(ACTOR,req(fixtureRegimeMethod,e),deps);
  const ac=new AbortController();let reads=0;
  const drift={...e,outcome:{abstained:false as const,claim:{...e.outcome.claim,distribution:{recovery:0.5,overheat:0.2,stagflation:0.2,recession:0.1}}}};
  const d=new Proxy(db,{get:(x,k,r)=>{
   if(k==='getJudgment')return async()=>{if(recovery&&reads++===0)return null;ac.abort();return db.getJudgment(original.judgment_id);};
   if(k==='registerJudgment')return async()=>{throw {code:'23505'};};
   return Reflect.get(x,k,r);
  }});
  await expect(registerJudgment(ACTOR,req(fixtureRegimeMethod,drift),{...deps,db:d,signal:ac.signal})).rejects.toBeInstanceOf(RegisterDeferred);
  expect(tables.rows('dq_quarantine')).toHaveLength(0);
 });
});
