// src/lib/judgments/resolvers/facts.test.ts
// F4 Task 11 (spec §7.3 row 2, §7.6 S04, §14.1 fact_metric bullets): plan 2's memoryFactsDb seeded through its
// public write path, the §12.2 derive composition at the cutoff, full natural-key match, yoy, cutoff visibility,
// truncated reads, ambiguous candidates with their derivation envelopes, and the choose_fact override.
import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {FORMULA_VERSION} from '@/lib/facts/derive';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import type {MemoryFactsDb} from '@/lib/facts/memory-facts-db';
import {FactsDbError} from '@/lib/facts/types';
import type {MetricRow} from '@/lib/facts/types';
import {digest} from '../canonical';
import {conditionJudgment,factsBackedDerive,stubInputsDb} from '../testing/fixtures';
import type {FactMetricParams,JudgmentInputsDb,QuarantineOverride,ResolveContext} from '../types';
import {derivationRowOf,factMetricResolver,factsAsOfDate,operandReproduces} from './facts';
import type {FactCandidate,FactOperand} from './facts';

interface Seed{period_start:string;period_end:string;value:string;available_date:string}
/** One published run: a filing per available date, 3M consolidated USD revenue facts (plan 2 write path). */
async function seedFacts(facts:MemoryFactsDb,issuer:string,rows:Seed[]):Promise<void>{
 await facts.reconcileScope('US',[{issuer_id:issuer,reasons:['test'],priority:10,fetch_key:'0000000001'}]);
 const batch=randomUUID();
 expect(await facts.claimLease(issuer,'US',batch,600)).toBe(true);
 const run=await facts.beginRun(issuer,'US',batch,1);
 const ref=(d:string)=>`zz-${issuer}-${d}`;
 const dates=[...new Set(rows.map(r=>r.available_date))];
 const ids=await facts.stageFilings(run,dates.map(d=>({filing_id:randomUUID(),issuer_id:issuer,sourceRef:ref(d),market:'US',source:'edgar',origin:'sec',formType:'10-Q',fiscalYear:Number(d.slice(0,4)),fiscalPeriod:'Q3',periodEnd:null,availableDate:d,url:null})));
 await facts.stageFacts(run,rows.map(r=>({fact_id:randomUUID(),issuer_id:issuer,market:'US',filing_id:ids.get(ref(r.available_date))!,concept:'revenue',source_concept:'Revenues',statement:'IS',
  period_start:r.period_start,period_end:r.period_end,duration:'3M',value:r.value,unit:'USD',consolidation:'consolidated',available_date:r.available_date,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h'})));
 await facts.publishRun(run,[...ids.values()]);
}
const Q3={period_start:'2025-07-01',period_end:'2025-09-30'},PRIOR={period_start:'2024-07-01',period_end:'2024-09-30'};
const NOW='2026-03-02T04:00:00.000Z';
async function setup(rows:Seed[]=[{...Q3,value:'1000',available_date:'2025-10-30'},{...PRIOR,value:'800',available_date:'2024-10-30'}]){
 const facts=memoryFactsDb();const issuer=randomUUID();
 await seedFacts(facts,issuer,rows);
 const params=(over:Partial<FactMetricParams>={}):FactMetricParams=>({issuer_id:issuer,market:'US',metric:'q_single_revenue',...Q3,duration:'3M',unit:'USD',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION,compare:'value',...over});
 const derive=factsBackedDerive(facts);
 return {facts,issuer,params,derive,inputsDb:stubInputsDb({deriveMetricsAsOf:derive})};
}
const judgmentOf=(p:FactMetricParams)=>conditionJudgment({resolver:'fact_metric',params:p,predicate:{op:'>',rhs:900},text:{zh:'单季营收高于 900',en:'quarterly revenue above 900'}},
 {kind:'fiscal_period',period_end:p.period_end,calendar:{anchor_period_end:'2025-06-30',months:3},extrapolated:false});
const ctxOf=(p:FactMetricParams,inputsDb:JudgmentInputsDb,cutoff=NOW):ResolveContext=>({judgment:judgmentOf(p),cutoff,now:NOW,inputsDb,signal:new AbortController().signal});
/** inputsDb whose derive result is the real one with `edit` applied (duplicate rows for the ambiguity cases). */
const edited=(derive:JudgmentInputsDb['deriveMetricsAsOf'],edit:(ms:MetricRow[])=>MetricRow[])=>stubInputsDb({deriveMetricsAsOf:async(...a)=>{const r=await derive(...a);return {...r,metrics:edit(r.metrics)};}});
const isQ=(m:MetricRow,end:string)=>m.metric==='q_single_revenue'&&m.period_end===end;

describe('fact_metric resolver',()=>{
 it('compare=value: derived at the cutoff and matched on the full natural key; evidence names facts, filings, dates, state_rev',async()=>{
  const {facts,issuer,params,inputsDb}=await setup();
  const r=await factMetricResolver.resolve(ctxOf(params(),inputsDb));
  if(r.status!=='resolved')throw new Error(JSON.stringify(r));
  expect(r).toMatchObject({value:1000,unit:'USD',from:'2025-07-01',to:'2025-09-30',label_available_at:'2025-10-30T23:59:59.999Z'});
  const fact=facts.facts().find(f=>f.period_end==='2025-09-30')!;
  const env=await facts.readFacts(issuer,'US',{concepts:['revenue'],asOf:'2026-03-01',history:true});
  const key={issuer_id:issuer,market:'US',metric:'q_single_revenue',...Q3,duration:'3M',unit:'USD',input_unit:'USD',basis:'us_standard',formula_version:FORMULA_VERSION};
  const {operands,...rest}=r.evidence as Record<string,unknown>&{operands:FactOperand[]};
  // NOW is 04:00Z on 2026-03-02: that day has not ended, so the derive date is 2026-03-01 (P1-07).
  expect(rest).toEqual({metric_keys:[key],fact_ids:[fact.fact_id],filing_ids:[fact.filing_id],available_dates:['2025-10-30'],value_texts:['1000'],mapping_gen:[1],state_rev:env.stateRev,cutoff:NOW,as_of:'2026-03-01',formula_version:FORMULA_VERSION,compare:'value'});
  // P1-06: the operand is frozen in the §3.5 financial_metric snapshot shape and replays from its own rows.
  expect(operands).toHaveLength(1);
  expect(operands[0]).toMatchObject({role:'current',key,value_text:'1000',derivation:{formula_version:FORMULA_VERSION,as_of:'2026-03-01',state_rev:env.stateRev}});
  expect(operands[0].lineage.map(i=>i.fact_id)).toEqual([fact.fact_id]);
  expect(operands[0].derivation.rows.map(x=>x.period_end)).toEqual(['2024-09-30','2025-09-30']);
  expect(operandReproduces(operands[0])).toBe(true);
  expect(operandReproduces({...operands[0],value_text:'1001'})).toBe(false);
  expect(operandReproduces({...operands[0],derivation:{...operands[0].derivation,rows:operands[0].derivation.rows.filter(x=>x.period_end!=='2025-09-30')}})).toBe(false);
 });
 it('cutoff availability is end of the UTC day: a fact available today is not eligible before midnight (P1-07)',async()=>{
  expect(factsAsOfDate('2025-10-30T12:00:00.000Z')).toBe('2025-10-29');
  expect(factsAsOfDate('2025-10-30T23:59:59.998Z')).toBe('2025-10-29');
  expect(factsAsOfDate('2025-10-30T23:59:59.999Z')).toBe('2025-10-30');
  expect(factsAsOfDate('2025-10-31T00:00:00.000Z')).toBe('2025-10-30');
  const {params,inputsDb}=await setup();   // Q3 available_date 2025-10-30
  expect(await factMetricResolver.resolve(ctxOf(params(),inputsDb,'2025-10-30T12:00:00.000Z'))).toEqual({status:'pending',reason:'not_reported'});
  expect(await factMetricResolver.resolve(ctxOf(params(),inputsDb,'2025-10-30T23:59:59.998Z'))).toEqual({status:'pending',reason:'not_reported'});
  const atMidnight=await factMetricResolver.resolve(ctxOf(params(),inputsDb,'2025-10-31T00:00:00.000Z'));
  expect(atMidnight).toMatchObject({status:'resolved',value:1000,label_available_at:'2025-10-30T23:59:59.999Z',evidence:{as_of:'2025-10-30'}});
 });
 it('compare=yoy: (current − prior) / |prior| with prior = same key 350–380 days earlier; label = latest input availability',async()=>{
  const {params,inputsDb}=await setup();
  const r=await factMetricResolver.resolve(ctxOf(params({compare:'yoy'}),inputsDb));
  expect(r).toMatchObject({status:'resolved',value:0.25,unit:'ratio',label_available_at:'2025-10-30T23:59:59.999Z',evidence:{value_texts:['1000','800'],available_dates:['2024-10-30','2025-10-30'],compare:'yoy'}});
  if(r.status!=='resolved')throw new Error(r.status);
  const ops=(r.evidence as {operands:FactOperand[]}).operands;
  expect(ops.map(o=>[o.role,o.value_text,o.key.period_end])).toEqual([['current','1000','2025-09-30'],['prior','800','2024-09-30']]);   // BOTH yoy operands frozen (P1-06)
  expect(ops.every(operandReproduces)).toBe(true);
 });
 it('not visible at the cutoff or not reported yet → Pending(not_reported); a key differing in any field never matches',async()=>{
  const {params,inputsDb}=await setup();
  expect(await factMetricResolver.resolve(ctxOf(params(),inputsDb,'2025-10-29T12:00:00.000Z'))).toEqual({status:'pending',reason:'not_reported'});
  expect(await factMetricResolver.resolve(ctxOf(params({period_start:'2025-10-01',period_end:'2025-12-31'}),inputsDb))).toEqual({status:'pending',reason:'not_reported'});
  for(const over of [{basis:'cn_standard'},{input_unit:'CNY'},{duration:'TTM'},{unit:'pure'},{period_start:'2025-06-30'}] as Partial<FactMetricParams>[])
   expect({over,r:(await factMetricResolver.resolve(ctxOf(params(over),inputsDb))).status}).toEqual({over,r:'pending'});
 });
 it('yoy without a prior year → Unavailable(prior_missing); a zero prior → Unavailable(prior_zero)',async()=>{
  const a=await setup([{...Q3,value:'1000',available_date:'2025-10-30'}]);
  expect(await factMetricResolver.resolve(ctxOf(a.params({compare:'yoy'}),a.inputsDb))).toEqual({status:'unavailable',failure:'prior_missing'});
  const b=await setup([{...Q3,value:'1000',available_date:'2025-10-30'},{...PRIOR,value:'0',available_date:'2024-10-30'}]);
  expect(await factMetricResolver.resolve(ctxOf(b.params({compare:'yoy'}),b.inputsDb))).toEqual({status:'unavailable',failure:'prior_zero'});
 });
 it('truncated read (thrown read_truncated or a truncated envelope) → Unavailable(truncated); another formula version → Unavailable(unsupported_formula_version)',async()=>{
  const {params,inputsDb,derive}=await setup();
  const thrown=stubInputsDb({deriveMetricsAsOf:async()=>{throw new FactsDbError('read_truncated');}});
  expect(await factMetricResolver.resolve(ctxOf(params(),thrown))).toEqual({status:'unavailable',failure:'truncated'});
  const flagged=stubInputsDb({deriveMetricsAsOf:async(...a)=>{const r=await derive(...a);return {...r,envelope:{...r.envelope,truncated:true}};}});
  expect(await factMetricResolver.resolve(ctxOf(params(),flagged))).toEqual({status:'unavailable',failure:'truncated'});
  expect(await factMetricResolver.resolve(ctxOf(params({formula_version:'facts-derive/0.9'}),inputsDb))).toEqual({status:'unavailable',failure:'unsupported_formula_version'});
  const boom=stubInputsDb({deriveMetricsAsOf:async()=>{throw new Error('db down');}});
  await expect(factMetricResolver.resolve(ctxOf(params(),boom))).rejects.toThrow('db down');
 });
 it('two rows for one key → Inconsistent(ambiguous_fact): candidates carry key, value_text, realised value, lineage and the §3.5 derivation envelope',async()=>{
  const {params,derive}=await setup();
  const dup=edited(derive,ms=>[...ms,{...ms.find(m=>isQ(m,'2025-09-30'))!,value:'1001'}]);
  const r=await factMetricResolver.resolve(ctxOf(params(),dup));
  if(r.status!=='inconsistent')throw new Error(r.status);
  expect(r.reason_code).toBe('settlement_ambiguous_fact');
  const cands=r.detail.candidates as FactCandidate[];
  expect(cands.map(c=>[c.role,c.value_text,c.realized_value])).toEqual([['current','1000',1000],['current','1001',1001]]);
  for(const c of cands){
   expect(c.counterpart).toBeNull();                                                      // compare=value: one operand
   expect(c.derivation).toMatchObject({formula_version:FORMULA_VERSION,as_of:'2026-03-01'});
   expect(c.derivation.rows.map(x=>x.period_end)).toEqual(['2024-09-30','2025-09-30']);   // [period_start − 400 d, period_end], sorted
   expect(Object.keys(c.derivation.rows[0]).sort()).toEqual(['available_date','concept','consolidation','created_at','disclosure_seq','duration','fact_id','filing_id','is_current','is_revision','issuer_id','mapping_gen','market','period_end','period_start','status','unit','value_text']);
   expect(c.label_available_at).toBe('2025-10-30T23:59:59.999Z');
  }
  expect(r.evidence).toMatchObject({role:'current',candidate_digests:cands.map(c=>digest(c)),cutoff:NOW,formula_version:FORMULA_VERSION});
  expect(r.evidence_hash).toBe(digest(r.evidence));
 });
 it('yoy: an ambiguous prior yields prior candidates with their own realised yoy; both sides ambiguous → Unavailable(ambiguous_both)',async()=>{
  const {params,derive}=await setup();
  const dupPrior=edited(derive,ms=>[...ms,{...ms.find(m=>isQ(m,'2024-09-30'))!,value:'801'}]);
  const r=await factMetricResolver.resolve(ctxOf(params({compare:'yoy'}),dupPrior));
  if(r.status!=='inconsistent')throw new Error(r.status);
  const priorCands=r.detail.candidates as FactCandidate[];
  expect(priorCands.map(c=>[c.role,c.realized_value])).toEqual([['prior',0.25],['prior',(1000-801)/801]]);
  // P1-06: each prior candidate carries the CURRENT operand fully frozen, so its ratio is replayable on its own.
  for(const c of priorCands){
   expect(c.counterpart).toMatchObject({role:'current',value_text:'1000',key:{period_end:'2025-09-30'}});
   expect(operandReproduces(c.counterpart!)).toBe(true);
  }
  const both=edited(derive,ms=>[...ms,{...ms.find(m=>isQ(m,'2024-09-30'))!,value:'801'},{...ms.find(m=>isQ(m,'2025-09-30'))!,value:'1001'}]);
  expect(await factMetricResolver.resolve(ctxOf(params({compare:'yoy'}),both))).toEqual({status:'unavailable',failure:'ambiguous_both'});
 });
 it('fromOverride(choose_fact) settles from the chosen candidate alone; other verdicts throw override_mismatch',async()=>{
  const {params,derive}=await setup();
  const p=params();
  const r=await factMetricResolver.resolve(ctxOf(p,edited(derive,ms=>[...ms,{...ms.find(m=>isQ(m,'2025-09-30'))!,value:'1001'}])));
  if(r.status!=='inconsistent')throw new Error(r.status);
  const cands=r.detail.candidates as FactCandidate[];
  const asOverride=(chosen:FactCandidate):QuarantineOverride=>({reason_code:'settlement_ambiguous_fact',resolution:{kind:'choose_fact',chosen:chosen as unknown as Record<string,unknown>},evidence_hash:r.evidence_hash,resolved_by:'9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',at:NOW,cutoff:NOW});
  const o=asOverride(cands[0]);
  expect(factMetricResolver.fromOverride(judgmentOf(p),o)).toMatchObject({status:'resolved',value:1000,unit:'USD',label_available_at:'2025-10-30T23:59:59.999Z',
   evidence:{chosen_digest:digest(cands[0]),cutoff:'2026-03-01',override:{reason_code:'settlement_ambiguous_fact',evidence_hash:r.evidence_hash}}});
  const codeOf=(f:()=>unknown)=>{try{f();}catch(e){return (e as {code?:string}).code;}return 'no_throw';};
  // P1-06: the stored value is never trusted. The injected '1001' row is not what deriveMetrics yields from its frozen rows.
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(p),asOverride(cands[1])))).toBe('override_mismatch');
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(p),asOverride({...cands[0],realized_value:1001})))).toBe('override_mismatch');
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(p),asOverride({...cands[0],derivation:{...cands[0].derivation,rows:[]}})))).toBe('override_mismatch');
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(p),{...o,resolution:{kind:'accept_refetched',evidence_hash:'x',evidence:{}}}))).toBe('override_mismatch');
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(p),{...o,resolution:{kind:'choose_fact',chosen:{value_text:'1'}}}))).toBe('override_mismatch');
  // yoy: a prior candidate settles from its own frozen operand + the frozen current counterpart; tampering the counterpart is caught.
  const py=params({compare:'yoy'});
  const ry=await factMetricResolver.resolve(ctxOf(py,edited(derive,ms=>[...ms,{...ms.find(m=>isQ(m,'2024-09-30'))!,value:'801'}])));
  if(ry.status!=='inconsistent')throw new Error(ry.status);
  const pc=(ry.detail.candidates as FactCandidate[])[0];
  expect(factMetricResolver.fromOverride(judgmentOf(py),asOverride(pc))).toMatchObject({status:'resolved',value:0.25,unit:'ratio'});
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(py),asOverride({...pc,counterpart:{...pc.counterpart!,value_text:'1100'}})))).toBe('override_mismatch');
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(py),asOverride({...pc,counterpart:null})))).toBe('override_mismatch');
 });
 it('derivationRowOf keeps exactly the kernel-read fields (drops value, run_id, source_concept, statement, mapping_version, raw_hash)',async()=>{
  const {facts,issuer}=await setup();
  const env=await facts.readFacts(issuer,'US',{concepts:['revenue'],asOf:'2026-03-02',history:true});
  const d=derivationRowOf(env.rows[0]);
  for(const k of ['value','run_id','source_concept','statement','mapping_version','raw_hash'])expect(k in d).toBe(false);
  expect(d).toMatchObject({fact_id:env.rows[0].fact_id,value_text:env.rows[0].value_text,disclosure_seq:1,is_current:true,is_revision:false});
 });
 it('S-02: fromOverride requires every operand derived at factsAsOfDate(override.cutoff) from rows available by then (both yoy sides)',async()=>{
  const {params,derive}=await setup();
  const codeOf=(f:()=>unknown)=>{try{f();}catch(e){return (e as {code?:string}).code;}return 'no_throw';};
  const mk=(chosen:FactCandidate,cutoff:string):QuarantineOverride=>({reason_code:'settlement_ambiguous_fact',resolution:{kind:'choose_fact',chosen:chosen as unknown as Record<string,unknown>},evidence_hash:'h',resolved_by:'r',at:NOW,cutoff});
  const p=params();
  const r=await factMetricResolver.resolve(ctxOf(p,edited(derive,ms=>[...ms,{...ms.find(m=>isQ(m,'2025-09-30'))!,value:'1001'}])));
  if(r.status!=='inconsistent')throw new Error(r.status);
  const c0=(r.detail.candidates as FactCandidate[])[0];
  expect(factMetricResolver.fromOverride(judgmentOf(p),mk(c0,NOW)).status).toBe('resolved');
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(p),mk(c0,'2025-11-05T00:00:00.000Z')))).toBe('override_mismatch');   // frozen as_of is not the cutoff's derive date
  // consistent as_of but a row published after the override cutoff
  const early='2025-10-30T00:00:00.000Z';
  const rows=c0.derivation.rows;
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(p),mk({...c0,derivation:{...c0.derivation,as_of:factsAsOfDate(early),rows}},early)))).toBe('override_mismatch');
  // yoy counterpart carries the same duty
  const py=params({compare:'yoy'});
  const ry=await factMetricResolver.resolve(ctxOf(py,edited(derive,ms=>[...ms,{...ms.find(m=>isQ(m,'2024-09-30'))!,value:'801'}])));
  if(ry.status!=='inconsistent')throw new Error(ry.status);
  const pc=(ry.detail.candidates as FactCandidate[])[0];
  expect(factMetricResolver.fromOverride(judgmentOf(py),mk(pc,NOW)).status).toBe('resolved');
  expect(codeOf(()=>factMetricResolver.fromOverride(judgmentOf(py),mk({...pc,counterpart:{...pc.counterpart!,derivation:{...pc.counterpart!.derivation,as_of:'2025-10-29'}}},NOW)))).toBe('override_mismatch');
 });
 it('prior_zero only when every candidate prior is zero; a zero prior next to a non-zero one is left out of the candidates',async()=>{
  const {params,derive}=await setup();
  const zeroPlus=edited(derive,ms=>[...ms,{...ms.find(m=>isQ(m,'2024-09-30'))!,value:'0'}]);
  const r=await factMetricResolver.resolve(ctxOf(params({compare:'yoy'}),zeroPlus));
  if(r.status!=='inconsistent')throw new Error(JSON.stringify(r));
  expect((r.detail.candidates as FactCandidate[]).map(c=>[c.role,c.value_text,c.realized_value])).toEqual([['prior','800',0.25]]);
  const allZero=edited(derive,ms=>ms.map(m=>isQ(m,'2024-09-30')?{...m,value:'0'}:m));
  expect(await factMetricResolver.resolve(ctxOf(params({compare:'yoy'}),allZero))).toEqual({status:'unavailable',failure:'prior_zero'});
 });
 it('S2-04: the ordinary path applies the override-path availability checks: a row available after the cutoff, or a foreign as_of, is Unavailable(data_after_cutoff)',async()=>{
  const {facts,issuer,params,derive}=await setup();
  const CUT='2026-01-01T00:00:00.000Z';
  const late=(over:'row'|'as_of')=>stubInputsDb({deriveMetricsAsOf:async(...a)=>{
   const r=await derive(...a);
   if(over==='as_of')return r;
   const base=r.envelope.rows.find(x=>x.period_end==='2025-09-30')!;
   const extra={...base,fact_id:randomUUID(),period_start:'2025-04-01',period_end:'2025-06-30',available_date:'2026-02-01'};
   return {...r,envelope:{...r.envelope,rows:[...r.envelope.rows,extra]}};
  }});
  void facts;void issuer;
  expect(await factMetricResolver.resolve(ctxOf(params(),late('row'),CUT))).toEqual({status:'unavailable',failure:'data_after_cutoff'});
  expect(await factMetricResolver.resolve(ctxOf(params({compare:'yoy'}),late('row'),CUT))).toEqual({status:'unavailable',failure:'data_after_cutoff'});
  // candidates too
  const dup=stubInputsDb({deriveMetricsAsOf:async(...a)=>{const r=await derive(...a);
   const base=r.envelope.rows.find(x=>x.period_end==='2025-09-30')!;
   return {metrics:[...r.metrics,{...r.metrics.find(m=>isQ(m,'2025-09-30'))!,value:'1001'}],envelope:{...r.envelope,rows:[...r.envelope.rows,{...base,fact_id:randomUUID(),period_start:'2025-04-01',period_end:'2025-06-30',available_date:'2026-02-01'}]}};}});
  expect(await factMetricResolver.resolve(ctxOf(params(),dup,CUT))).toEqual({status:'unavailable',failure:'data_after_cutoff'});
  // the same data at a later cutoff is fine
  expect((await factMetricResolver.resolve(ctxOf(params(),late('row'),'2026-03-02T00:00:00.000Z'))).status).toBe('resolved');
 });
});
