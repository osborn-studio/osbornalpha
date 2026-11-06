// src/lib/evals/validate/cli.test.ts
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {GOLD_DIR,LOCK_PATH,RECORDERS_PATH} from '../gold/load';
import {HANDLERS,findingsCheck,runValidate} from './cli';
import type {ValidateHandler} from './cli';

describe('runValidate on the repository',()=>{
 it('--gold --lock --redact pass on the repo\'s own fixtures (exit 0)',async()=>{
  const {exitCode,output}=await runValidate(['--redact','--lock','--gold']);
  expect(output.checks.gold).toMatchObject({ok:true,errors:[]});
  expect(output.checks.lock).toMatchObject({ok:true,errors:[]});
  expect(output.checks.redact).toMatchObject({ok:true,findings:[]});
  expect(Object.keys(output.checks)).toEqual(['gold','lock','redact']);
  expect(exitCode).toBe(0);
 });
 it('--gold-diff HEAD is clean',async()=>{
  expect(await runValidate(['--gold-diff','HEAD'])).toMatchObject({exitCode:0,output:{ok:true,checks:{gold_diff:{ok:true,changed:[],violations:[]}}}});
 });
 it('usage errors exit 2',async()=>{
  expect((await runValidate([])).exitCode).toBe(2);
  expect(await runValidate(['--nope'])).toMatchObject({exitCode:2,output:{error:'unknown argument --nope'}});
  expect(await runValidate(['--gold-diff'])).toMatchObject({exitCode:2,output:{error:'--gold-diff needs a value'}});
  expect(await runValidate(['--gold','--gold'])).toMatchObject({exitCode:2,output:{error:'duplicate flag --gold'}});
  expect(await runValidate(['--gold','--release'])).toMatchObject({exitCode:2,output:{error:'unknown argument --release'}});
 });
 it('an unknown base is a failed check (exit 1), not a crash',async()=>{
  expect(await runValidate(['--gold-diff','0'.repeat(40)])).toMatchObject({exitCode:1,output:{checks:{gold_diff:{ok:false,error:{code:'gold_diff_violation',reason:'base_not_found'}}}}});
 });
 it('handlers are a flag table: a new validator is one more entry (Task 12)',async()=>{
  const extra:ValidateHandler={flag:'--always-fails',name:'always_fails',takesValue:true,run:(_root,value)=>({ok:false,value})};
  const r=await runValidate(['--always-fails','v','--gold'],{handlers:[...HANDLERS,extra]});
  expect(r.exitCode).toBe(1);
  expect(r.output.checks).toMatchObject({gold:{ok:true},always_fails:{ok:false,value:'v'}});
 });
 it('modifiers after a flag value reach the handler as a set; async handlers are awaited',async()=>{
  const seen:string[][]=[];
  const extra:ValidateHandler={flag:'--probe',name:'probe',takesValue:true,modifiers:['--release'],run:async(_root,value,mods)=>{seen.push([value!,...mods]);return findingsCheck([]);}};
  expect(await runValidate(['--probe','x','--release'],{handlers:[extra]})).toMatchObject({exitCode:0,output:{checks:{probe:{ok:true,findings:[]}}}});
  expect(await runValidate(['--probe','y'],{handlers:[extra]})).toMatchObject({exitCode:0});
  expect(seen).toEqual([['x','--release'],['y']]);
 });
});

describe('runValidate on a temp repository with violations',()=>{
 const root=mkdtempSync(join(tmpdir(),'f6-validate-'));
 afterAll(()=>rmSync(root,{recursive:true,force:true}));
 const g=(...args:string[])=>execFileSync('git',['-c','user.name=f6-test','-c','user.email=f6-test@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null',...args],{cwd:root,stdio:['ignore','pipe','pipe']}).toString('utf8').trim();
 const write=(path:string,text:string)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),text);};
 it('reports gold, lock, diff and redact failures together with exit 1',async()=>{
  g('init','-q','-b','main');
  write(RECORDERS_PATH,JSON.stringify({version:1,recorders:[{id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}]}));
  write(LOCK_PATH,JSON.stringify({files:[]}));
  write(`${GOLD_DIR}/facts/bad.json`,JSON.stringify({schema_version:1,set_id:'facts/bad',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code'],review_required:false,tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],cases:[{case_id:'X'}]}));
  g('add','-A');g('commit','-q','-m','c1');
  const c1=g('rev-parse','HEAD');
  g('rm','-q',`${GOLD_DIR}/facts/bad.json`);g('commit','-q','-m','c2');
  write('docs/evals/2026-11-06/x.md','postgres://u:p@h/db');
  const {exitCode,output}=await runValidate(['--gold','--lock','--gold-diff',c1,'--redact'],{root});
  expect(exitCode).toBe(1);
  expect(output.checks.gold.ok).toBe(true);
  expect(output.checks.gold_diff).toMatchObject({ok:false,violations:[{code:'set_deleted',path:`${GOLD_DIR}/facts/bad.json`}]});
  expect(output.checks.redact).toMatchObject({ok:false,findings:[{path:'docs/evals/2026-11-06/x.md',rule:'postgres_url',line:1}]});
  write(`${GOLD_DIR}/facts/bad.json`,'{"schema_version":1}');
  const again=await runValidate(['--gold','--lock'],{root});
  expect(again.output.checks.gold.ok).toBe(false);
  expect(again.output.checks.lock).toMatchObject({ok:false});
 });
});
