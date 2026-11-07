// src/lib/evals/kinds/dual-source.test.ts
import {describe,expect,it} from 'vitest';
import {compareWithinTolerance} from '../compare';
import {EvalError} from '../errors';
import {canonicalDecimal} from '../../facts/json-numbers';
import {summarize} from '../summary';
import {RELDIFF_CONFORMANCE,dualSourceSummaryContext,evaluateDualSource,observationKeyString,runDualSource,upstreamOutcomeOf} from './dual-source';
import type {ObservationKey,PairObservation,PairRegistration,PairSource} from './dual-source';

const reg=(p:Partial<PairRegistration>={}):PairRegistration=>({pair_id:'us.companyfacts_vs_ixbrl',module:'facts',left:{source:'edgar.companyfacts',upstream:'sec.xbrl'},right:{source:'edgar.ixbrl',upstream:'sec.filing_html'},independence:'same_upstream_independent_extraction',tolerance:{rel:'0.005'},...p});
const key=(p:Partial<ObservationKey>={}):ObservationKey=>({issuer:'11111111-1111-4111-8111-111111111111',concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',consolidation:'consolidated',unit:'USD',...p});
const side=(value:string,p:Record<string,string>={})=>({fact_id:'f-left',value_text:value,source_ref:'0009990601-24-000001',raw_hash:'h'.repeat(8),available_date:'2024-11-01',...p});
const obs=(p:Partial<PairObservation>={}):PairObservation=>({key:key(),left:side('1000'),right:side('1004',{fact_id:'f-right',available_date:'2024-11-05'}),upstream_outcome:'compared',...p});
const KEY=observationKeyString(key());

// plan 3 decimal.ts::relDiff reference (|l−r| / max(|l|,|r|,1), 10 places, round half away from zero) — test-only, F6 never uses it
const dec=(s:string)=>{const neg=s.startsWith('-');const b=neg?s.slice(1):s;const [i,f='']=b.split('.');return {n:(neg?-1n:1n)*BigInt(i+f),s:f.length};};
function plan3RelDiff(l:string,r:string):string{
 const a=dec(l),b=dec(r);const s=Math.max(a.s,b.s);
 const x=a.n*10n**BigInt(s-a.s),y=b.n*10n**BigInt(s-b.s);const abs=(v:bigint)=>v<0n?-v:v;
 const den=[abs(x),abs(y),10n**BigInt(s)].reduce((m,v)=>v>m?v:m);
 const q=(abs(x-y)*10n**11n)/den;const r10=(q+5n)/10n;
 const t=r10.toString().padStart(11,'0');
 return canonicalDecimal(`${t.slice(0,-10)}.${t.slice(-10)}`);
}

describe('evaluateDualSource',()=>{
 it('compares both value_text at the registration tolerance',()=>{
  const r=evaluateDualSource(reg(),[obs(),obs({key:key({concept:'cash',period_start:null,duration:'INSTANT'}),right:side('1006',{fact_id:'f-right'})})]);
  const [cash,rev]=r.cases;
  expect(rev).toMatchObject({case_id:`us.companyfacts_vs_ixbrl:${KEY}`,outcome:{result:'pass'},left:'1000',right:'1004',tolerance:'0.005',required:true});
  expect(rev.detail).toMatchObject({as_of:'2024-11-05',compared:'pass',left:{fact_id:'f-left',source_ref:'0009990601-24-000001',raw_hash:'hhhhhhhh',available_date:'2024-11-01'}});
  expect(cash.outcome).toEqual({result:'fail',reason:'value'});
  expect(r.trend).toEqual({pass:1,fail:1});
  expect(r.evidenceClass).toBe('truth');
 });
 it('the observation key includes period_start and duration',()=>{
  const r=evaluateDualSource(reg(),[obs(),obs({key:key({period_start:'2024-06-30',duration:'3M'})})]);
  expect(r.cases.length).toBe(2);
  expect(new Set(r.cases.map(c=>c.case_id)).size).toBe(2);
  expect(KEY).toBe('11111111-1111-4111-8111-111111111111:revenue:2023-10-01:2024-09-28:12M:consolidated:USD');
 });
 it('non-comparison upstream outcomes never pass',()=>{
  const map:Record<string,unknown>={left_missing:{result:'missing'},right_missing:{result:'missing'},incomplete_gold:{result:'missing'},left_unlinked:{result:'read_error',reason:'filing_not_linked'},
   left_ambiguous:{result:'read_error',reason:'read_failed'},right_ambiguous:{result:'read_error',reason:'read_failed'},unsupported:{result:'read_error',reason:'read_failed'},legacy:{result:'read_error',reason:'read_failed'},whatever:{result:'read_error',reason:'read_failed'}};
  for(const [o,want] of Object.entries(map)){
   expect(upstreamOutcomeOf(o)).toEqual(want);
   const [c]=evaluateDualSource(reg(),[obs({upstream_outcome:o})]).cases;
   expect(c.outcome).toEqual(want);
   expect(c.detail.upstream_outcome).toBe(o);
  }
  expect(upstreamOutcomeOf('compared')).toBeNull();
  expect(evaluateDualSource(reg(),[obs({right:null})]).cases[0].outcome).toEqual({result:'read_error',reason:'read_failed'});
  expect(evaluateDualSource(reg(),[obs({left:side('12,5')})]).cases[0].outcome).toEqual({result:'read_error',reason:'read_failed'});
 });
 it('same_feed → adapter_check; duplicate keys → fail(ambiguous); truncated read → one read_error(truncated) case',()=>{
  expect(evaluateDualSource(reg({independence:'same_feed'}),[obs()]).evidenceClass).toBe('adapter_check');
  expect(evaluateDualSource(reg(),[obs(),obs()]).cases).toMatchObject([{outcome:{result:'fail',reason:'ambiguous'}}]);
  const t=evaluateDualSource(reg(),[obs()],{truncated:true});
  expect(t.cases.map(c=>c.outcome.result)).toEqual(['pass','read_error']);
  expect(t.cases[1]).toMatchObject({case_id:'us.companyfacts_vs_ixbrl:__truncated__',outcome:{result:'read_error',reason:'truncated'}});
 });
 it('a disposed fail is handled only with matching natural_key, resolved status and chosen_fact_ids (if present) containing a compared fact',()=>{
  const fail=(d:PairObservation['disposition'])=>evaluateDualSource(reg(),[obs({right:side('2000',{fact_id:'f-right'}),disposition:d})]).cases[0];
  const ok=fail({quarantine_id:'q1',natural_key:KEY,status:'resolved_accept',chosen_fact_ids:['f-right']});
  expect(ok.outcome).toEqual({result:'pass'});
  expect(ok.detail).toMatchObject({compared:'fail',disposition:{quarantine_id:'q1',handled:true}});
  expect(fail({quarantine_id:'q1',natural_key:KEY,status:'resolved_reject'}).outcome).toEqual({result:'pass'});   // no chosen_fact_ids → status + key suffice
  for(const [d,why] of [[{quarantine_id:'q1',natural_key:`${KEY}:x`,status:'resolved_accept'},'natural_key'],[{quarantine_id:'q1',natural_key:KEY,status:'open'},'status'],[{quarantine_id:'q1',natural_key:KEY,status:'resolved_accept',chosen_fact_ids:['other']},'chosen_fact_ids'],[{quarantine_id:'q1',natural_key:KEY,status:'resolved_accept',chosen_fact_ids:[]},'chosen_fact_ids']] as [PairObservation['disposition'],string][]){
   const c=fail(d);
   expect(c.outcome).toEqual({result:'fail',reason:'value'});
   expect(c.detail).toMatchObject({disposition:{handled:false,why}});
  }
  const s=summarize([ok],dualSourceSummaryContext(evaluateDualSource(reg(),[])));
  expect(s.correctness.fail).toBe(0);
 });
 it('summary: max_fail 0, evidence class carried; invalid registration is gold_invalid',()=>{
  const r=evaluateDualSource(reg({independence:'same_feed'}),[obs()]);
  expect(summarize(r.cases,dualSourceSummaryContext(r))).toMatchObject({gate:'pass',evidence_class:'adapter_check',thresholds:{max_fail:0}});
  for(const bad of [reg({tolerance:{rel:'1'}}),reg({tolerance:{rel:'-0.1'}}),reg({independence:'cousins' as PairRegistration['independence']}),reg({pair_id:''})]){
   expect(()=>evaluateDualSource(bad,[])).toThrow(EvalError);
  }
 });
});

const source=(p:Partial<PairSource>={}):PairSource=>({observations:async()=>({rows:[obs()],truncated:false}),...p});
describe('runDualSource',()=>{
 it('reads the registration and observations through the injected source',async()=>{
  const r=await runDualSource(source(),reg().pair_id,[reg()]);
  expect(r.cases.map(c=>c.outcome.result)).toEqual(['pass']);
 });
 it('unregistered pair → gold_invalid; a write-capable source is refused before any read',async()=>{
  await expect(runDualSource(source(),'nope',[reg()])).rejects.toMatchObject({code:'gold_invalid'});
  await expect(runDualSource(source(),reg().pair_id)).rejects.toMatchObject({code:'gold_invalid'});   // F6_PAIRS is empty until plan 3
  let read=false;
  const writable={...source({registration:async()=>{read=true;return reg();}}),upsertResult:async()=>undefined} as unknown as PairSource;
  await expect(runDualSource(writable,reg().pair_id,[reg()])).rejects.toMatchObject({code:'gold_invalid',detail:{reason:'pair_source_write_capable'}});
  expect(read).toBe(false);
 });
});

describe('relDiff conformance: plan 3 rounds half away from zero, F6 truncates (display only)',()=>{
 it('three pinned vectors',()=>{
  expect(RELDIFF_CONFORMANCE.length).toBe(3);
  for(const v of RELDIFF_CONFORMANCE){
   expect(canonicalDecimal(compareWithinTolerance(v.left,v.right,'0').relDiff)).toBe(v.f6);
   expect(plan3RelDiff(v.left,v.right)).toBe(v.plan3);
   expect(v.plan3).not.toBe(v.f6);
  }
 });

 it('the F6 registration decides: a source claiming independent_publication for an F6 same_feed pair still yields adapter_check',async()=>{
  const f6=reg({independence:'same_feed'});
  const lying=source({registration:async()=>reg({independence:'independent_publication'})});
  await expect(runDualSource(lying,f6.pair_id,[f6])).rejects.toMatchObject({code:'gold_invalid',detail:{reason:'registration_mismatch'}});
  const echo=source({registration:async()=>f6});
  expect((await runDualSource(echo,f6.pair_id,[f6])).evidenceClass).toBe('adapter_check');
  expect((await runDualSource(source(),f6.pair_id,[f6])).evidenceClass).toBe('adapter_check');
 });
 it('observations outside the registration key scope are read_error(read_failed) with detail.reason out_of_scope',()=>{
  const scoped=reg({scope:{concepts:['revenue'],durations:['12M'],units:['USD'],consolidations:['consolidated']}});
  const r=evaluateDualSource(scoped,[obs(),obs({key:key({concept:'cash'})}),obs({key:key({unit:'EUR'})})]);
  expect(r.cases.map(c=>c.outcome.result).sort()).toEqual(['pass','read_error','read_error']);
  expect(r.cases.filter(c=>c.detail.reason==='out_of_scope').length).toBe(2);
 });
});
