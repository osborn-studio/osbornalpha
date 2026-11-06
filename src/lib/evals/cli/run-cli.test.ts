// src/lib/evals/cli/run-cli.test.ts
import {describe,expect,it} from 'vitest';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {fakeReader,gcase,gset,readRow} from '../kinds/official-test-support';
import type {FakeReaderOptions} from '../kinds/official-test-support';
import type {EvalStore} from '../store';
import type {EvalReport,EvalRunRow,GoldLock,GoldSet} from '../types';
import type {RunDeps} from './deps';
import {USAGE,UsageError,parseRunArgs,runCli} from './run-cli';
import type {CliDeps,CliIo} from './run-cli';

const SET=gset([gcase()]);
const lockOf=(s:GoldSet):GoldLock=>({files:[{path:s.path,sha256:s.sha256,version:s.version,format:s.format}]});
const OFFICIAL=['--kind','official_reconciliation','--module','facts','--set',SET.path];
interface Harness{deps:CliDeps;io:CliIo;out:string[];err:string[];written:EvalReport[];persisted:{ref:string;sha256:string;opts:unknown;report:EvalReport}[];built:{mode:string;privileged:boolean}[]}
function harness(o:{set?:GoldSet;lock?:GoldLock;reader?:FakeReaderOptions;over?:Partial<CliDeps>;store?:EvalStore}={}):Harness{
 const out:string[]=[],err:string[]=[],written:EvalReport[]=[],persisted:Harness['persisted']=[],built:Harness['built']=[];
 const set=o.set??SET;
 const deps:CliDeps={
  buildDeps:async(mode,privileged)=>{built.push({mode,privileged});const run:RunDeps={reader:fakeReader({...o.reader,...(privileged?{privileged:{}}:{})}),environment:{db_host:null,app_origin:null,db_state_rev:null},store:privileged?(o.store??({} as EvalStore)):null,close:async()=>{}};return run;},
  loadSet:()=>set,loadLock:()=>o.lock??lockOf(set),version:()=>({sha:'a'.repeat(40),dirty:false}),now:()=>new Date('2026-11-20T00:00:00.000Z'),
  writeReport:r=>{written.push(r);return {json:`reports/evals/${r.run_id}.json`,md:null,sha256:'b'.repeat(64)};},
  persist:async(_store,report,files,opts)=>{persisted.push({...files,opts,report});},
  readFile:()=>new Uint8Array(),
  ...o.over};
 return {deps,io:{stdout:l=>out.push(l),stderr:l=>err.push(l)},out,err,written,persisted,built};
}
const receipt=(h:Harness)=>JSON.parse(h.out[0]) as Record<string,unknown>;
const errorOf=(h:Harness)=>(JSON.parse(h.err[0]) as {error:string}).error;

describe('parseRunArgs (spec §7.1 flags)',()=>{
 it('parses every flag of an official run',()=>{
  expect(parseRunArgs([...OFFICIAL,'--mode','report','--write-db','--verify-artifacts','--verify-sources','--out','/tmp/x','--limit','5','--case','a','--case','b'])).toEqual({kind:'official_reconciliation',module:'facts',set:SET.path,mode:'report',writeDb:true,verifyArtifacts:true,verifySources:true,out:'/tmp/x',limit:5,caseIds:['a','b'],http:false});
 });
 it.each<[string[],string]>([
  [['--kind','nope','--module','facts','--mode','ci'],'--kind'],
  [['--kind','official_reconciliation','--module','facts','--mode','ci'],'--set is required'],
  [[...OFFICIAL,'--mode','staging'],'--mode'],
  [[...OFFICIAL,'--module','planets','--mode','ci'],'--module'],
  [[...OFFICIAL,'--mode','ci','--write-db'],'--write-db needs --mode report'],
  [[...OFFICIAL,'--mode','report','--verify-artifacts'],'need --write-db'],
  [[...OFFICIAL,'--mode','report','--resume','r1'],'--resume needs --write-db'],
  [[...OFFICIAL,'--mode','ci','--http'],'--http'],
  [[...OFFICIAL,'--mode','ci','--pair','p1'],'--pair'],
  [[...OFFICIAL,'--mode','ci','--limit','0'],'--limit'],
  [[...OFFICIAL,'--mode','ci','--bogus'],'unknown argument'],
  [[...OFFICIAL,'--mode'],'needs a value'],
 ])('refuses %j',(argv,message)=>{expect(()=>parseRunArgs(argv)).toThrow(UsageError);expect(()=>parseRunArgs(argv)).toThrow(message);});
});

describe('runCli (spec §7.1, §3.2 exit codes, §6.3 order, §14)',()=>{
 it('ci: report written, one JSON receipt line, exit = the gate (pass → 0), nothing persisted',async()=>{
  const h=harness();
  expect(await runCli([...OFFICIAL,'--mode','ci'],h.io,h.deps)).toBe(0);
  expect(h.built).toEqual([{mode:'ci',privileged:false}]);
  expect(h.written).toHaveLength(1);expect(h.persisted).toEqual([]);expect(h.out).toHaveLength(1);
  expect(receipt(h)).toMatchObject({run_id:h.written[0].run_id,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,gate:'pass',exit_code:0,report:`reports/evals/${h.written[0].run_id}.json`,report_sha256:'b'.repeat(64),db:'skipped'});
 });
 it('a failing gate still writes the report and exits 1; --case makes the run a subset (incomplete → 3)',async()=>{
  const fail=harness({reader:{rows:()=>[readRow({value_text:'999'})]}});
  expect(await runCli([...OFFICIAL,'--mode','ci'],fail.io,fail.deps)).toBe(1);
  expect(receipt(fail)).toMatchObject({gate:'fail',exit_code:1});expect(fail.written).toHaveLength(1);
  const sub=harness();
  expect(await runCli([...OFFICIAL,'--mode','ci','--case',gcase().case_id],sub.io,sub.deps)).toBe(3);
  expect(sub.written[0].summary.execution.subset).toBe(true);
 });
 it('refusals exit 2 before any connection: synthetic in report, lock mismatch, dirty report, module mismatch, a kind without a runner',async()=>{
  const syn=harness({set:gset([gcase({provenance_kind:'synthetic',recorded_by:'synthetic'})])});
  expect(await runCli([...OFFICIAL,'--mode','report'],syn.io,syn.deps)).toBe(2);
  expect(errorOf(syn)).toBe('synthetic_in_report');expect(syn.built).toEqual([]);
  const lock=harness({lock:{files:[]}});
  expect(await runCli([...OFFICIAL,'--mode','ci'],lock.io,lock.deps)).toBe(2);
  expect(errorOf(lock)).toBe('gold_lock_mismatch');expect(lock.built).toEqual([]);
  const dirty=harness({over:{version:()=>({sha:'a'.repeat(40),dirty:true})}});
  expect(await runCli([...OFFICIAL,'--mode','report'],dirty.io,dirty.deps)).toBe(2);expect(errorOf(dirty)).toBe('dirty_tree');
  const mod=harness();
  expect(await runCli(['--kind','official_reconciliation','--module','metrics','--set',SET.path,'--mode','ci'],mod.io,mod.deps)).toBe(2);expect(errorOf(mod)).toBe('gold_invalid');
  const kind=harness();
  expect(await runCli(['--kind','extraction_gold','--module','company','--mode','ci'],kind.io,kind.deps)).toBe(2);
  expect(errorOf(kind)).toBe('kind_not_enabled');expect(kind.built).toEqual([]);
 });
 it('a usage error exits 2 and prints the usage',async()=>{
  const h=harness();
  expect(await runCli(['--mode','ci'],h.io,h.deps)).toBe(2);
  expect(h.err.join('\n')).toContain(USAGE);expect(h.out).toEqual([]);
 });
 it('--write-db: privileged deps; persistRun runs after the report file, with its ref and sha256',async()=>{
  const h=harness();
  expect(await runCli([...OFFICIAL,'--mode','report','--write-db','--verify-artifacts'],h.io,h.deps)).toBe(0);
  expect(h.built).toEqual([{mode:'report',privileged:true}]);
  expect(h.persisted).toEqual([{ref:`reports/evals/${h.written[0].run_id}.json`,sha256:'b'.repeat(64),opts:{triggeredBy:'script'},report:h.written[0]}]);
  expect(receipt(h)).toMatchObject({privileged:true,db:'written'});
  expect(h.written[0].provenance.verified).toEqual({artifacts:true,sources:false});
 });
 it('report or store failures exit 1; a failed report write never reaches the store',async()=>{
  const store=harness({over:{persist:async()=>{throw new EvalError('store_write_failed','insert failed');}}});
  expect(await runCli([...OFFICIAL,'--mode','report','--write-db'],store.io,store.deps)).toBe(1);
  expect(errorOf(store)).toBe('store_write_failed');expect(store.out).toEqual([]);
  const report=harness({over:{writeReport:()=>{throw new Error('EACCES');}}});
  expect(await runCli([...OFFICIAL,'--mode','report','--write-db'],report.io,report.deps)).toBe(1);
  expect(errorOf(report)).toBe('report_write_failed');expect(report.persisted).toEqual([]);
 });
 it('--resume re-enters persistRun from the stored row and the report file it names (§6.3 step 5); an unknown run is resume_mismatch',async()=>{
  const first=harness();
  await runCli([...OFFICIAL,'--mode','ci'],first.io,first.deps);
  const report=first.written[0];
  const bytes=new TextEncoder().encode(JSON.stringify(report));
  const row={run_id:report.run_id,report_ref:'docs/evals/2026-11-20/facts-official_reconciliation-x.json'} as EvalRunRow;
  const store={getRun:async(id:string)=>id===report.run_id?row:null} as unknown as EvalStore;
  const h=harness({store,over:{readFile:p=>{expect(p).toBe(row.report_ref);return bytes;}}});
  expect(await runCli(['--kind','official_reconciliation','--module','facts','--mode','report','--write-db','--resume',report.run_id],h.io,h.deps)).toBe(0);
  expect(h.persisted).toEqual([{ref:row.report_ref,sha256:sha256Hex(bytes),opts:{triggeredBy:'script',resume:true},report:JSON.parse(JSON.stringify(report))}]);
  expect(receipt(h)).toMatchObject({run_id:report.run_id,db:'written',report:row.report_ref});
  const unknown=harness({store});
  expect(await runCli(['--kind','official_reconciliation','--module','facts','--mode','report','--write-db','--resume','00000000-0000-4000-8000-000000000000'],unknown.io,unknown.deps)).toBe(2);
  expect(errorOf(unknown)).toBe('resume_mismatch');
 });
});
