// src/lib/evals/cli/run-replay.test.ts
import {describe,expect,it} from 'vitest';
import {projectionHash,sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection,ReplayRequest} from '../types';
import {setupSha256} from '../replay/setup';
import {parseRunArgs,runCli} from './run-cli';
import type {CliDeps} from './run-cli';
import {LEDGER_PATH,defaultReplayBackend,replayFileOf,replayRunner} from './run-replay';
import type {ReplayBackend,ReplayBackendFactory} from './run-replay';

const P:Projection={module:'facts',rows:[{concept:'revenue',value_text:'383285000000',available_date:'2023-11-03'}]};
const P2:Projection={module:'facts',rows:[{concept:'revenue',value_text:'383285000001',available_date:'2023-11-03'}]};
const REQ:ReplayRequest={issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2024-06-30'};
const SETUP_BODY={initial_state:'empty_after_migrations',today:'2026-11-20'};
const SETUP={...SETUP_BODY,setup_sha256:setupSha256(SETUP_BODY as unknown as Parameters<typeof setupSha256>[0])};
const rec={code_version:'c'.repeat(40),at:'2026-11-20T00:00:00.000Z'};
const frozenFile={schema_version:1,module:'facts',mode:'frozen',cases:['f-1','f-2'].map(case_id=>({case_id,request:REQ,setup:SETUP,recorded:rec,expected:{projection_hash:projectionHash(P),projection:P}}))};
const liveFile={schema_version:1,module:'facts',mode:'live',cases:[{case_id:'l-1',request:REQ,recorded:{...rec,state_rev:5},expected:{projection_hash:projectionHash(P),projection:P}}]};
const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const FILES:Record<string,Uint8Array>={[replayFileOf('facts','frozen')]:enc(frozenFile),[replayFileOf('facts','live')]:enc(liveFile),[LEDGER_PATH]:enc([])};

function cli(over:Partial<CliDeps>={}):CliDeps{
 return {buildDeps:async()=>{throw new Error('replay does not use buildDeps');},loadSet:()=>{throw new Error('no gold set');},loadLock:()=>({files:[]}),
  version:()=>({sha:'d'.repeat(40),dirty:false}),now:()=>new Date('2026-11-21T00:00:00.000Z'),
  writeReport:r=>({json:`reports/evals/${r.run_id}.json`,md:null,sha256:'b'.repeat(64)}),persist:async()=>{},
  readFile:p=>{const b=FILES[p];if(!b)throw new Error(`ENOENT ${p}`);return b;},...over};
}
function fake(o:{projection?:Projection;check?:'ok'|'mismatch'}={}):{factory:ReplayBackendFactory;opened:{mode:string;privileged:boolean}[]}{
 const opened:{mode:string;privileged:boolean}[]=[];
 const factory:ReplayBackendFactory=async(mode,privileged)=>{
  opened.push({mode,privileged});
  const project=async()=>o.projection??P;
  const b:ReplayBackend={environment:{db_host:null,app_origin:null,db_state_rev:null},store:null,close:async()=>{},
   frozen:async()=>({check:o.check==='mismatch'?{ok:false,mismatch:['fixture_manifest:x']}:{ok:true,setupSha256:SETUP.setup_sha256},project}),
   project,stateRev:async()=>5};
  return b;
 };
 return {factory,opened};
}
const args=(...extra:string[])=>parseRunArgs(['--kind','replay_consistency','--module','facts',...extra]);

describe('replay_consistency runner (run.ts --kind replay_consistency)',()=>{
 it('ci = frozen over the committed file: identical → pass, exit 0; the report names the replay file and its byte hash',async()=>{
  const f=fake();
  const {outcome}=await replayRunner(f.factory,{})(args('--mode','ci'),cli());
  expect(f.opened).toEqual([{mode:'frozen',privileged:false}]);
  expect(outcome.exitCode).toBe(0);
  const r=outcome.report;
  expect(r).toMatchObject({kind:'replay_consistency',module:'facts',mode:'ci',privileged:false,set:{id:'replay/facts.frozen',version:1,path:replayFileOf('facts','frozen'),sha256:sha256Hex(FILES[replayFileOf('facts','frozen')])}});
  expect(r.cases.map(c=>c.outcome)).toEqual([{result:'identical'},{result:'identical'}]);
  expect(r.summary).toMatchObject({gate:'pass',population:2,evidence_class:'truth'});
 });
 it('a changed projection without a ledger entry → unexplained_diff, exit 1; a setup mismatch → read_error, exit 3',async()=>{
  const diff=await replayRunner(fake({projection:P2}).factory,{})(args('--mode','ci'),cli());
  expect(diff.outcome.exitCode).toBe(1);
  expect(diff.outcome.report.cases[0].outcome).toEqual({result:'unexplained_diff',reason:'diff'});
  const bad=await replayRunner(fake({check:'mismatch'}).factory,{})(args('--mode','ci'),cli());
  expect(bad.outcome.report.cases[0].outcome).toEqual({result:'read_error',reason:'setup_mismatch'});expect(bad.outcome.exitCode).toBe(3);
 });
 it('P1-6: a tampered second case (same declared setup_sha256) is read_error(setup_mismatch); the first still replays',async()=>{
  const tampered={...frozenFile,cases:[frozenFile.cases[0],{...frozenFile.cases[1],setup:{...SETUP,today:'2026-11-21'}}]};
  const f=fake();
  const {outcome}=await replayRunner(f.factory,{})(args('--mode','ci'),cli({readFile:p=>p===replayFileOf('facts','frozen')?enc(tampered):FILES[p]}));
  expect(outcome.report.cases.map(c=>[c.case_id,c.outcome])).toEqual([['f-1',{result:'identical'}],['f-2',{result:'read_error',reason:'setup_mismatch'}]]);
  expect(outcome.report.cases[1].detail.mismatch).toEqual(['setup_sha256']);
 });
 it('--case makes a subset: the other cases are skipped(subset), exit 3',async()=>{
  const {outcome}=await replayRunner(fake().factory,{})(args('--mode','ci','--case','f-1'),cli());
  expect(outcome.report.cases.map(c=>[c.case_id,c.outcome.result])).toEqual([['f-1','identical'],['f-2','skipped']]);
  expect(outcome.exitCode).toBe(3);
 });
 it('report = live: unprivileged difference → unexplained_diff(no_hints), exit 1; --write-db opens a privileged backend',async()=>{
  const f=fake({projection:P2});
  const live=await replayRunner(f.factory,{})(args('--mode','report'),cli());
  expect(live.outcome.report.cases[0].outcome).toEqual({result:'unexplained_diff',reason:'no_hints'});expect(live.outcome.exitCode).toBe(1);
  await replayRunner(f.factory,{})(args('--mode','report','--write-db'),cli());
  expect(f.opened).toEqual([{mode:'live',privileged:false},{mode:'live',privileged:true}]);
 });
 it('refusals before any backend opens: --http, dirty report, a file of the other mode, unknown --case; frozen without a test database',async()=>{
  const f=fake();
  const code=async(p:Promise<unknown>)=>{try{await p;return 'none';}catch(e){return e instanceof EvalError?e.code:'other';}};
  expect(await code(replayRunner(f.factory,{})(args('--mode','ci','--http'),cli()))).toBe('kind_not_enabled');
  expect(await code(replayRunner(f.factory,{})(args('--mode','report'),cli({version:()=>({sha:'d'.repeat(40),dirty:true})})))).toBe('dirty_tree');
  expect(await code(replayRunner(f.factory,{})(args('--mode','report','--set',replayFileOf('facts','frozen')),cli()))).toBe('gold_invalid');
  expect(await code(replayRunner(f.factory,{})(args('--mode','ci','--case','nope'),cli()))).toBe('gold_invalid');
  expect(f.opened).toEqual([]);
  expect(await code(replayRunner(defaultReplayBackend,{})(args('--mode','ci'),cli()))).toBe('kind_not_enabled');
 });
 it('runCli dispatches replay_consistency to this runner (a refusal surfaces as exit 2)',async()=>{
  const err:string[]=[];
  expect(await runCli(['--kind','replay_consistency','--module','facts','--mode','ci','--http'],{stdout:()=>{},stderr:l=>err.push(l)},cli())).toBe(2);
  expect(JSON.parse(err[0])).toMatchObject({error:'kind_not_enabled'});
 });
});
