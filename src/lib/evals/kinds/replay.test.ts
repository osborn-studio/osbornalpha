// src/lib/evals/kinds/replay.test.ts
import {describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import {ProjectionError} from '../projections/facts';
import type {FrozenReplayCase,LiveReplayCase} from '../replay/fixture';
import {parseLedger} from '../replay/ledger';
import type {LedgerPolicy} from '../replay/ledger';
import type {LedgerEntry} from '../replay/ledger';
import {summarize} from '../summary';
import type {Hint,Projection,ReplayRequest} from '../types';
import {evaluateReplay,replaySummaryContext} from './replay';
import type {ReplayContext} from './replay';

const C1='1'.repeat(40),C2='2'.repeat(40),S1='5'.repeat(64),SRC='0009990601-24-000001';
const row=(value:string,seq=1)=>({concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',consolidation:'consolidated',unit:'USD',value_text:value,available_date:'2024-11-01',source_ref:SRC,disclosure_seq:seq,is_current:true,is_revision:false});
const P0:Projection={module:'facts',rows:[row('100')]};
const P1:Projection={module:'facts',rows:[row('101')]};
const P2:Projection={module:'facts',rows:[row('101',2)]};
const ID=`facts[revenue/2023-10-01..2024-09-28/12M/USD/consolidated/2024-11-01/${SRC}]`;
const request:ReplayRequest={issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'};
const frozen=(p:Partial<FrozenReplayCase>={}):FrozenReplayCase=>({case_id:'f1',request,setup:{setup_sha256:S1,today:'2026-11-06'},recorded:{code_version:C1,at:'2026-11-06T00:00:00.000Z'},expected:{projection_hash:projectionHash(P0),projection:P0},...p});
const live=(p:Partial<LiveReplayCase>={}):LiveReplayCase=>({case_id:'l1',request,recorded:{code_version:C1,at:'2026-11-06T00:00:00.000Z',state_rev:12},expected:{projection_hash:projectionHash(P0),projection:P0},...p});
const frozenEntry=(p:Record<string,unknown>={})=>({ledger_id:'L1',case_id:'f1',mode:'frozen',changed_fields:[`${ID}.value_text`],before_hash:projectionHash(P0),after_hash:projectionHash(P1),from_code:C1,to_code:C2,from_setup_sha256:S1,to_setup_sha256:S1,
 reason_code:'bug_fixed',evidence:{pr:1,regression_test:'src/lib/facts/derive.test.ts::x'},added_by:'claude-code',added_at:'2026-11-06T00:00:00Z',approved_by:'owner',approval_ref:'https://github.com/osborn-studio/OsbornAlpha/pull/1#pullrequestreview-1',approved_at:'2026-11-06T01:00:00Z',...p});
const liveEntry=(p:Record<string,unknown>={})=>{
 const e:Record<string,unknown>=frozenEntry({case_id:'l1',mode:'live',from_state_rev:12,to_state_rev:15,reason_code:'late_filing',evidence:{}});
 delete e.from_setup_sha256;delete e.to_setup_sha256;return Object.assign(e,p);
};
const POLICY:LedgerPolicy={recorders:[{id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}]};
const ledger=(...raw:Record<string,unknown>[]):LedgerEntry[]=>parseLedger(raw,POLICY);
const returns=(p:Projection)=>async()=>p;
const fctx=(p:Partial<ReplayContext>={}):ReplayContext=>({mode:'frozen',evaluatorCodeVersion:C2,checkSetup:async()=>({ok:true,setupSha256:S1}),...p});
const lctx=(p:Partial<ReplayContext>={}):ReplayContext=>({mode:'live',evaluatorCodeVersion:C2,stateRev:async()=>15,...p});
const HINT:Hint={kind:'late_fact',ref:'fact:abc',at:'2026-11-07T00:00:00Z'};
const outcome=async(...a:Parameters<typeof evaluateReplay>)=>(await evaluateReplay(...a))[0].outcome;

describe('evaluateReplay frozen',()=>{
 it('identical when the projection hash is unchanged; the report carries hashes, no values',async()=>{
  const [r]=await evaluateReplay([frozen()],returns(P0),[],fctx());
  expect(r).toMatchObject({case_id:'f1',required:true,outcome:{result:'identical'},left:null,right:null,tolerance:'0',provenance:null});
  expect(r.detail).toMatchObject({before_hash:projectionHash(P0),after_hash:projectionHash(P0),from_code:C1,to_code:C2});
 });
 it('setup mismatch (reported, or a recomputed setup_sha256 ≠ recorded) → read_error(setup_mismatch) before projecting',async()=>{
  const never=async():Promise<Projection>=>{throw new Error('projected');};
  const [a]=await evaluateReplay([frozen()],never,[],fctx({checkSetup:async()=>({ok:false,mismatch:['fixture_manifest[0].sha256']})}));
  expect(a.outcome).toEqual({result:'read_error',reason:'setup_mismatch'});
  expect(a.detail.mismatch).toEqual(['fixture_manifest[0].sha256']);
  const [b]=await evaluateReplay([frozen()],never,[],fctx({checkSetup:async()=>({ok:true,setupSha256:'6'.repeat(64)})}));
  expect(b.outcome).toEqual({result:'read_error',reason:'setup_mismatch'});
  expect(b.detail.mismatch).toEqual(['setup_sha256']);
 });
 it('diff without a ledger entry → unexplained_diff(diff) with the changed fields',async()=>{
  const [r]=await evaluateReplay([frozen()],returns(P1),[],fctx());
  expect(r.outcome).toEqual({result:'unexplained_diff',reason:'diff'});
  expect(r.detail.changed_fields).toEqual([`${ID}.value_text`]);
 });
 it('ledger: exact hit → explained_diff; partial → partial_ledger; self-approved → ledger_self_approved; stale after_hash → diff',async()=>{
  expect(await outcome([frozen()],returns(P1),ledger(frozenEntry()),fctx())).toEqual({result:'explained_diff',ledger_ids:['L1']});
  expect(await outcome([frozen()],returns(P2),ledger(frozenEntry({after_hash:projectionHash(P2)})),fctx())).toEqual({result:'unexplained_diff',reason:'partial_ledger'});
  expect(await outcome([frozen()],returns(P1),ledger(frozenEntry({added_by:'owner'})),fctx())).toEqual({result:'unexplained_diff',reason:'ledger_self_approved'});
  expect(await outcome([frozen()],returns(P2),ledger(frozenEntry()),fctx())).toEqual({result:'unexplained_diff',reason:'diff'});
  expect(await outcome([frozen()],returns(P1),ledger(frozenEntry({to_code:'3'.repeat(40)})),fctx())).toEqual({result:'unexplained_diff',reason:'diff'});
  expect(await outcome([frozen()],returns(P1),ledger(liveEntry({case_id:'f1'})),fctx())).toEqual({result:'unexplained_diff',reason:'diff'});
 });
 it('frozen never yields data_drift even when a hint reader is present',async()=>{
  expect(await outcome([frozen()],returns(P1),[],fctx({hints:async()=>[HINT]}))).toEqual({result:'unexplained_diff',reason:'diff'});
 });
 it('projection failures: ProjectionError reason, anything else read_failed',async()=>{
  expect(await outcome([frozen()],async()=>{throw new ProjectionError('projection_join_missing');},[],fctx())).toEqual({result:'read_error',reason:'projection_join_missing'});
  expect(await outcome([frozen()],async()=>{throw new Error('connection reset');},[],fctx())).toEqual({result:'read_error',reason:'read_failed'});
 });
 it('throwing checkSetup / stateRev / hints → read_error(read_failed)',async()=>{
  const boom=async():Promise<never>=>{throw new Error('boom');};
  expect(await outcome([frozen()],returns(P0),[],fctx({checkSetup:boom}))).toEqual({result:'read_error',reason:'read_failed'});
  expect(await outcome([live()],returns(P0),[],lctx({stateRev:boom}))).toEqual({result:'read_error',reason:'read_failed'});   // identical path is not exempt
  expect(await outcome([live()],returns(P1),[],lctx({hints:boom}))).toEqual({result:'read_error',reason:'read_failed'});
 });
 it('frozen without checkSetup is a programming error',async()=>{
  await expect(evaluateReplay([frozen()],returns(P0),[],{mode:'frozen',evaluatorCodeVersion:C2})).rejects.toThrow(/checkSetup/);
 });
});

describe('evaluateReplay live',()=>{
 it('identical',async()=>{expect(await outcome([live()],returns(P0),[],lctx())).toEqual({result:'identical'});});
 it('privileged hints: data_drift with [] (no entry) or with the matching ledger ids',async()=>{
  expect(await outcome([live()],returns(P1),[],lctx({hints:async()=>[HINT]}))).toEqual({result:'data_drift',ledger_ids:[],hints:[HINT]});
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx({hints:async()=>[HINT]}))).toEqual({result:'data_drift',ledger_ids:['L1'],hints:[HINT]});
 });
 it('privileged without hints: ledger hit → explained_diff, else unexplained_diff(diff)',async()=>{
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx({hints:async()=>[]}))).toEqual({result:'explained_diff',ledger_ids:['L1']});
  expect(await outcome([live()],returns(P1),[],lctx({hints:async()=>[]}))).toEqual({result:'unexplained_diff',reason:'diff'});
 });
 it('data_drift with a ledger miss records the miss reason; live state_rev is reported on identical too and comes from the projection when given',async()=>{
  const [a]=await evaluateReplay([live()],returns(P1),ledger(liveEntry({added_by:'owner'})),lctx({hints:async()=>[HINT]}));
  expect(a.outcome).toMatchObject({result:'data_drift',ledger_ids:[]});
  expect(a.detail.unexplained_reason).toBe('ledger_self_approved');
  const [b]=await evaluateReplay([live()],returns(P0),[],lctx());
  expect(b.detail).toMatchObject({from_state_rev:12,to_state_rev:15});
  const withRev=async()=>({projection:P1,stateRev:15});
  expect(await outcome([live()],withRev,ledger(liveEntry()),lctx({stateRev:async()=>99}))).toEqual({result:'explained_diff',ledger_ids:['L1']});
  const [c]=await evaluateReplay([live()],async()=>({projection:P0,stateRev:21}),[],lctx());
  expect(c.detail.to_state_rev).toBe(21);
 });
 it('unprivileged (no hint reader): no_hints unless the ledger hits; the hint reader gets recorded.at',async()=>{
  expect(await outcome([live()],returns(P1),[],lctx())).toEqual({result:'unexplained_diff',reason:'no_hints'});
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx())).toEqual({result:'explained_diff',ledger_ids:['L1']});
  expect(await outcome([live()],returns(P1),ledger(liveEntry({added_by:'owner'})),lctx())).toEqual({result:'unexplained_diff',reason:'ledger_self_approved'});
  const since:string[]=[];
  await evaluateReplay([live()],returns(P1),[],lctx({hints:async(_r,s)=>{since.push(s);return [];}}));
  expect(since).toEqual(['2026-11-06T00:00:00.000Z']);
 });
 it('the live ledger tuple includes from/to_state_rev',async()=>{
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx({stateRev:async()=>16}))).toEqual({result:'unexplained_diff',reason:'no_hints'});
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx({stateRev:async()=>null}))).toEqual({result:'unexplained_diff',reason:'no_hints'});
 });
 it('summary reduction: identical / explained / data_drift with ids pass; data_drift [] and unexplained count as unexplained_diff',async()=>{
  const lg=ledger(liveEntry({case_id:'b'}));
  const run=async(c:LiveReplayCase,p:Projection,ctx:ReplayContext)=>(await evaluateReplay([c],returns(p),lg,ctx))[0];
  const mixed=[await run(live({case_id:'a'}),P0,lctx()),await run(live({case_id:'b'}),P1,lctx()),await run(live({case_id:'c'}),P1,lctx({hints:async()=>[HINT]})),await run(live({case_id:'d'}),P1,lctx())];
  expect(mixed.map(r=>r.outcome.result)).toEqual(['identical','explained_diff','data_drift','unexplained_diff']);
  const s=summarize(mixed,replaySummaryContext(false));
  expect(s.correctness).toMatchObject({pass:2,unexplained_diff:2});
  expect(s.gate).toBe('fail');
  const all=await evaluateReplay([live({case_id:'a'}),live({case_id:'e'})],returns(P0),[],lctx());
  expect(summarize(all,replaySummaryContext(false)).gate).toBe('pass');
  expect(summarize(all,replaySummaryContext(true)).gate).toBe('incomplete');   // --case subset
 });
});

describe('frozen ledger-backed explained_diff through the shared reducer',()=>{
 it('an approved exact ledger hit is explained_diff and counts as a pass; an unapproved sibling fails the gate',async()=>{
  const lg=ledger(frozenEntry());
  const ok=await evaluateReplay([frozen({case_id:'f1'}),frozen({case_id:'f2'})],returns(P0),lg,fctx());
  expect(ok.map(r=>r.outcome.result)).toEqual(['identical','identical']);
  const rs=await evaluateReplay([frozen()],returns(P1),lg,fctx());
  expect(rs[0].outcome).toEqual({result:'explained_diff',ledger_ids:['L1']});
  const s=summarize(rs,replaySummaryContext(false));
  expect(s.correctness).toMatchObject({pass:1,unexplained_diff:0,fail:0});
  expect(s.gate).toBe('pass');
  const mixed=[...rs,...await evaluateReplay([frozen({case_id:'f2'})],returns(P1),lg,fctx())];   // f2 has no entry
  expect(mixed.map(r=>r.outcome.result)).toEqual(['explained_diff','unexplained_diff']);
  expect(summarize(mixed,replaySummaryContext(false)).gate).toBe('fail');
 });
});

