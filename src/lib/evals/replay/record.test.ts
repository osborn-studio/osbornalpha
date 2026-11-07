// src/lib/evals/replay/record.test.ts
import {cpSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection} from '../types';
import type {FrozenReplayCase,ReplayFile} from './fixture';
import {parseLedger} from './ledger';
import type {LedgerPolicy} from './ledger';
import {applyRecording} from './record';
import {diffProjections} from '../projections/facts';
import {sealSetupFromPaths} from './setup';
import type {FrozenSetupPathsDraft} from './setup';

const C1='1'.repeat(40),C2='2'.repeat(40),S='5'.repeat(64),AT='2026-11-06T00:00:00.000Z';
const P0:Projection={module:'facts',rows:[{concept:'revenue',value_text:'100'}]};
const P1:Projection={module:'facts',rows:[{concept:'revenue',value_text:'101'}]};
const request={issuer:{market:'US' as const,cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'};
const setup={setup_sha256:S,today:'2026-11-06',initial_state:'empty_after_migrations'};
const draftFile=():ReplayFile=>({schema_version:1,module:'facts',mode:'frozen',cases:[{case_id:'c1',request,setup:{today:'2026-11-06'},recorded:null,expected:null}]});
const recordedFile=():ReplayFile=>({schema_version:1,module:'facts',mode:'frozen',cases:[{case_id:'c1',request,setup,recorded:{code_version:C1,at:AT},expected:{projection_hash:projectionHash(P0),projection:P0}}]});
const CHANGED=diffProjections(P0,P1);
const entry=(p:Record<string,unknown>={})=>({ledger_id:'L9',case_id:'c1',mode:'frozen',changed_fields:CHANGED,before_hash:projectionHash(P0),after_hash:projectionHash(P1),from_code:C1,to_code:C2,from_setup_sha256:S,to_setup_sha256:S,
 reason_code:'bug_fixed',evidence:{pr:7,regression_test:'src/lib/facts/derive.test.ts::y'},added_by:'claude-code',added_at:AT,approved_by:'owner',approval_ref:'https://github.com/osborn-studio/OsbornAlpha/pull/7#pullrequestreview-9',approved_at:AT,...p});
const POLICY:LedgerPolicy={recorders:[{id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}]};
const parse=(r:unknown)=>parseLedger(r,POLICY);
const refusal=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof EvalError?e.code:`other:${String(e)}`;}};
const input=(projection:Projection,p:Record<string,unknown>={})=>({case_id:'c1',projection,setup,code_version:C2,at:'2026-11-07T00:00:00.000Z',...p});

describe('applyRecording',()=>{
 it('records a draft: sealed setup, recorded code/at, expected hash + projection; the input file is not mutated',()=>{
  const f=draftFile();
  const r=applyRecording(f,input(P0),{ledger:[]});
  expect(r.action).toBe('recorded');
  expect(r.projection_hash).toBe(projectionHash(P0));
  expect(r.file.cases[0]).toEqual({case_id:'c1',request,setup,recorded:{code_version:C2,at:'2026-11-07T00:00:00.000Z'},expected:{projection_hash:projectionHash(P0),projection:P0}});
  expect(f.cases[0].expected).toBeNull();
 });
 it('an unchanged projection leaves the recorded case untouched',()=>{
  const f=recordedFile();
  const r=applyRecording(f,input(P0),{ledger:[]});
  expect(r.action).toBe('unchanged');
  expect(r.file).toEqual(recordedFile());
 });
 it('a changed projection without --supersede is refused (replay_rerecord_refused) — e.g. a case that replays as unexplained_diff',()=>{
  expect(refusal(()=>applyRecording(recordedFile(),input(P1),{ledger:[]}))).toBe('replay_rerecord_refused');
 });
 it('--supersede with an approved entry for this case/mode/before/after → superseded, history appended, setup kept',()=>{
  const r=applyRecording(recordedFile(),input(P1),{supersede:'L9',ledger:parse([entry()])});
  expect(r.action).toBe('superseded');
  const c=r.file.cases[0] as FrozenReplayCase;
  expect(c.expected.projection_hash).toBe(projectionHash(P1));
  expect(c.setup).toEqual(setup);
  expect(c.supersessions).toEqual([{ledger_id:'L9',before_hash:projectionHash(P0),after_hash:projectionHash(P1),at:'2026-11-07T00:00:00.000Z'}]);
 });
 it('--supersede refusals: unknown id, self-approved, other case, other mode, before ≠ recorded, after ≠ new, on a draft',()=>{
  const sup=(e:Record<string,unknown>)=>refusal(()=>applyRecording(recordedFile(),input(P1),{supersede:String(e.ledger_id),ledger:parse([e])}));
  expect(refusal(()=>applyRecording(recordedFile(),input(P1),{supersede:'nope',ledger:parse([entry()])}))).toBe('replay_rerecord_refused');
  expect(sup(entry({added_by:'owner'}))).toBe('replay_rerecord_refused');
  expect(sup(entry({case_id:'c2'}))).toBe('replay_rerecord_refused');
  const live=entry({mode:'live',from_state_rev:1,to_state_rev:2});delete (live as Record<string,unknown>).from_setup_sha256;delete (live as Record<string,unknown>).to_setup_sha256;
  expect(sup(live)).toBe('replay_rerecord_refused');
  expect(sup(entry({before_hash:'c'.repeat(64)}))).toBe('replay_rerecord_refused');
  expect(sup(entry({after_hash:'c'.repeat(64)}))).toBe('replay_rerecord_refused');
  expect(refusal(()=>applyRecording(draftFile(),input(P0),{supersede:'L9',ledger:parse([entry()])}))).toBe('replay_rerecord_refused');
 });
 it('P1-5: --supersede needs a full ledger hit — wrong code versions, wrong setup pair or wrong changed_fields are refused',()=>{
  const sup=(e:Record<string,unknown>)=>refusal(()=>applyRecording(recordedFile(),input(P1),{supersede:'L9',ledger:parse([e])}));
  expect(sup(entry())).toBe('ok');
  expect(sup(entry({from_code:'3'.repeat(40)}))).toBe('replay_rerecord_refused');
  expect(sup(entry({to_code:'3'.repeat(40)}))).toBe('replay_rerecord_refused');
  expect(sup(entry({to_setup_sha256:'6'.repeat(64)}))).toBe('replay_rerecord_refused');
  expect(sup(entry({changed_fields:['facts[x].value_text']}))).toBe('replay_rerecord_refused');
  expect(sup(entry({changed_fields:[...CHANGED,'facts[y].unit']}))).toBe('replay_rerecord_refused');
 });
 it('unknown case → gold_invalid; frozen draft without setup → gold_invalid; live needs state_rev; bad code version → code_version_missing',()=>{
  expect(refusal(()=>applyRecording(draftFile(),input(P0,{case_id:'zz'}),{ledger:[]}))).toBe('gold_invalid');
  expect(refusal(()=>applyRecording(draftFile(),input(P0,{setup:undefined}),{ledger:[]}))).toBe('gold_invalid');
  const liveDraft:ReplayFile={schema_version:1,module:'facts',mode:'live',cases:[{case_id:'c1',request,recorded:null,expected:null}]};
  expect(refusal(()=>applyRecording(liveDraft,input(P0,{setup:undefined}),{ledger:[]}))).toBe('gold_invalid');
  expect(applyRecording(liveDraft,input(P0,{setup:undefined,state_rev:4}),{ledger:[]}).file.cases[0].recorded).toEqual({code_version:C2,at:'2026-11-07T00:00:00.000Z',state_rev:4});
  expect(refusal(()=>applyRecording(draftFile(),input(P0,{code_version:'HEAD'}),{ledger:[]}))).toBe('code_version_missing');
 });
});

describe('applyRecording: a setup transition (config change -> new setup_sha256), end to end',()=>{
 const base=JSON.parse(readFileSync('src/lib/evals/fixtures/replay/f6-base.setup.json','utf8')) as Record<string,unknown>;
 const draftOf=():FrozenSetupPathsDraft=>{
  const d:Record<string,unknown>={...base,issuer_seed:{path:(base.issuer_seed as {path:string}).path},fixture_manifest:(base.fixture_manifest as {path:string}[]).map(f=>({path:f.path}))};
  for(const k of ['config_sha256','setup_sha256'])delete d[k];
  return d as unknown as FrozenSetupPathsDraft;
 };
 const withRoot=<T,>(f:(root:string)=>T):T=>{
  const root=mkdtempSync(join(tmpdir(),'f6-setup-transition-'));
  try{
   cpSync('src/lib/evals/fixtures',join(root,'src/lib/evals/fixtures'),{recursive:true});
   cpSync('src/lib/facts',join(root,'src/lib/facts'),{recursive:true});
   return f(root);
  }finally{rmSync(root,{recursive:true,force:true});}
 };
 it('a changed config seals a new setup; --supersede matches on the OLD recorded setup, saves the candidate setup and the new expectation',()=>{
  withRoot(root=>{
   const oldSetup=sealSetupFromPaths(draftOf(),root);
   writeFileSync(join(root,'src/lib/facts/rules.ts'),`${readFileSync(join(root,'src/lib/facts/rules.ts'),'utf8')}\n// config change\n`);
   const newSetup=sealSetupFromPaths(draftOf(),root);
   expect(newSetup.setup_sha256).not.toBe(oldSetup.setup_sha256);
   expect(newSetup.config_sha256).not.toBe(oldSetup.config_sha256);
   const file=():ReplayFile=>({schema_version:1,module:'facts',mode:'frozen',cases:[{case_id:'c1',request,setup:oldSetup as never,recorded:{code_version:C1,at:AT},expected:{projection_hash:projectionHash(P0),projection:P0}}]});
   const e=(p:Record<string,unknown>={})=>entry({from_setup_sha256:oldSetup.setup_sha256,to_setup_sha256:newSetup.setup_sha256,...p});
   const inp=input(P1,{setup:newSetup as never});
   // without --supersede the changed projection is refused
   expect(refusal(()=>applyRecording(file(),inp,{ledger:[]}))).toBe('replay_rerecord_refused');
   // an entry for old->old (the setup pair does not match the candidate) is refused
   expect(refusal(()=>applyRecording(file(),inp,{supersede:'L9',ledger:parse([e({to_setup_sha256:oldSetup.setup_sha256})])}))).toBe('replay_rerecord_refused');
   // an entry whose from-setup is not the recorded one is refused
   expect(refusal(()=>applyRecording(file(),inp,{supersede:'L9',ledger:parse([e({from_setup_sha256:newSetup.setup_sha256})])}))).toBe('replay_rerecord_refused');
   const r=applyRecording(file(),inp,{supersede:'L9',ledger:parse([e()])});
   expect(r.action).toBe('superseded');
   const c=r.file.cases[0] as FrozenReplayCase;
   expect(c.setup).toEqual(newSetup);
   expect(c.expected.projection_hash).toBe(projectionHash(P1));
   expect(c.supersessions?.[0]).toMatchObject({ledger_id:'L9',before_hash:projectionHash(P0),after_hash:projectionHash(P1)});
   // setup-only change (same projection): refused without an approved entry, accepted with one
   const same=input(P0,{setup:newSetup as never});
   expect(refusal(()=>applyRecording(file(),same,{ledger:[]}))).toBe('replay_rerecord_refused');
   const so=e({before_hash:projectionHash(P0),after_hash:projectionHash(P0),changed_fields:['projection']});
   expect((applyRecording(file(),same,{supersede:'L9',ledger:parse([so])}).file.cases[0] as FrozenReplayCase).setup).toEqual(newSetup);
  });
 });
});
