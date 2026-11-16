import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,symlinkSync,fsyncSync,existsSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {spawnSync} from 'node:child_process';

vi.mock('node:fs',async original=>{const fs=await original<typeof import('node:fs')>();return {...fs,fsyncSync:vi.fn(fs.fsyncSync)};});
import {updateGoldLock} from './update-lock';
import {GOLD_DIR,LEGACY_PLAN2_PATH,LOCK_PATH,RECORDERS_PATH,loadLock,loadGoldSet,checkLock} from './load';

const roots:string[]=[];
const path=`${GOLD_DIR}/facts/test-only.json`;
// Synthetic contract fixtures in isolated temp repositories; never human or production evidence.
function setup(){
 const scratch=process.env.OSSTACK_SCRATCH_ROOT??join(tmpdir(),'osstack');
 mkdirSync(scratch,{recursive:true});
 const root=mkdtempSync(join(scratch,'f6-lock-test-'));roots.push(root);
 mkdirSync(join(root,GOLD_DIR,'facts'),{recursive:true});
 writeFileSync(join(root,RECORDERS_PATH),readFileSync(RECORDERS_PATH));
 const raw=JSON.parse(readFileSync(`${GOLD_DIR}/facts/synthetic-us.json`,'utf8'));
 raw.set_id='facts/test-only';
 for(const c of raw.cases){c.provenance_kind='transcribed';c.recorded_by='owner';}
 writeFileSync(join(root,path),JSON.stringify(raw));
 const unrelated={path:'other.json',sha256:'a'.repeat(64),version:1,format:'f6'};
 writeFileSync(join(root,LOCK_PATH),JSON.stringify({files:[unrelated]}));
 return {root,raw,unrelated,save:()=>writeFileSync(join(root,path),JSON.stringify(raw))};
}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
describe('human gold integrity lock update',()=>{
 it('registers exact candidate bytes, preserves unrelated entries and is idempotent',()=>{
  const {root,unrelated}=setup();
  expect(updateGoldLock(path,root)).toMatchObject({changed:true,scope:'integrity_lock_only',not_verified:expect.arrayContaining(['recorder_identity_and_independent_pr_approval'])});
  checkLock(loadGoldSet(path,root),loadLock(root));
  expect(loadLock(root).files[0]).toEqual(unrelated);
  const bytes=readFileSync(join(root,LOCK_PATH),'utf8'),before=statSync(join(root,LOCK_PATH));
  expect(updateGoldLock(path,root).changed).toBe(false);
  expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe(bytes);
  expect(statSync(join(root,LOCK_PATH)).mtimeMs).toBe(before.mtimeMs);
  expect(statSync(join(root,LOCK_PATH)).ino).toBe(before.ino);
 });
 it('requires a higher version for changed bytes and never decreases a version',()=>{
  const {root,raw,save}=setup();updateGoldLock(path,root);
  raw.cases[0].notes='Changed test notes';save();
  const bytes=readFileSync(join(root,LOCK_PATH),'utf8');
  expect(()=>updateGoldLock(path,root)).toThrow('version_must_increase');
  expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe(bytes);
  raw.version=2;raw.history=[{version:2,changed_at:'2026-11-07',changed_by:'owner',reason:'Test revision',fields:['cases[0].notes']}];save();
  expect(updateGoldLock(path,root).changed).toBe(true);
  raw.version=1;raw.history=[];save();
  expect(()=>updateGoldLock(path,root)).toThrow('version_must_increase');
 });
 it.each(['synthetic','restricted','empty','invalid','review_missing'])('refuses %s without changing the lock',kind=>{
  const {root,raw,save}=setup();
  if(kind==='synthetic')for(const c of raw.cases){c.provenance_kind='synthetic';c.recorded_by='synthetic';}
  if(kind==='restricted')raw.artifact_class='restricted';
  if(kind==='empty'){raw.cases=[];raw.optional_cases=[];}
  if(kind==='invalid')raw.cases[0].source.sha256='bad';
  if(kind==='review_missing')raw.review_required=true;
  save();const bytes=readFileSync(join(root,LOCK_PATH),'utf8');
  expect(()=>updateGoldLock(path,root)).toThrow();
  expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe(bytes);
 });
 it('rejects pending legacy gold and permits only a higher-version F6 migration at its original path',()=>{
  const {root,raw}=setup();
  mkdirSync(join(root,'src/lib/facts/fixtures/gold'),{recursive:true});
  writeFileSync(join(root,LEGACY_PLAN2_PATH),readFileSync(LEGACY_PLAN2_PATH));
  writeFileSync(join(root,LOCK_PATH),JSON.stringify({files:[{path:LEGACY_PLAN2_PATH,sha256:'a'.repeat(64),version:1,format:'legacy_plan2'}]}));
  const before=readFileSync(join(root,LOCK_PATH),'utf8');
  expect(()=>updateGoldLock(LEGACY_PLAN2_PATH,root)).toThrow('candidate_not_admissible');
  expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe(before);
  writeFileSync(join(root,LEGACY_PLAN2_PATH),JSON.stringify(raw));
  expect(()=>updateGoldLock(LEGACY_PLAN2_PATH,root)).toThrow('version_must_increase');
  raw.version=2;raw.history=[{version:2,changed_at:'2026-11-07',changed_by:'owner',reason:'Test migration',fields:['format']}];
  writeFileSync(join(root,LEGACY_PLAN2_PATH),JSON.stringify(raw));
  expect(updateGoldLock(LEGACY_PLAN2_PATH,root).changed).toBe(true);
  checkLock(loadGoldSet(LEGACY_PLAN2_PATH,root),loadLock(root));
 });
 it('fails closed for an invalid lock or an in-progress writer',()=>{
  const {root}=setup();
  writeFileSync(join(root,`${LOCK_PATH}.pending`),'other writer');
  expect(()=>updateGoldLock(path,root)).toThrow();
  expect(readFileSync(join(root,`${LOCK_PATH}.pending`),'utf8')).toBe('other writer');
  rmSync(join(root,`${LOCK_PATH}.pending`));
  writeFileSync(join(root,LOCK_PATH),'{}');
  expect(()=>updateGoldLock(path,root)).toThrow();
  expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe('{}');
 });
 it.each(['candidate','recorders','lock'])('refuses external %s edits before committing',input=>{
  const {root}=setup(),lockBefore=readFileSync(join(root,LOCK_PATH),'utf8');
  const target=input==='candidate'?path:input==='recorders'?RECORDERS_PATH:LOCK_PATH;
  vi.mocked(fsyncSync).mockImplementationOnce(()=>{writeFileSync(join(root,target),'{}');});
  expect(()=>updateGoldLock(path,root)).toThrow('inputs_changed');
  if(input!=='lock')expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe(lockBefore);
  else expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe('{}');
  expect(existsSync(join(root,`${LOCK_PATH}.pending`))).toBe(false);
 });
 it.each(['../escape.json','/tmp/outside.json',`${GOLD_DIR}/facts/../facts/test-only.json`,LOCK_PATH,RECORDERS_PATH])('rejects unsafe candidate path %s',candidate=>{
  const {root}=setup(),before=readFileSync(join(root,LOCK_PATH),'utf8');
  expect(()=>updateGoldLock(candidate,root)).toThrow();
  expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe(before);
 });
 it('fails closed when lock metadata is missing',()=>{
  const {root}=setup();rmSync(join(root,LOCK_PATH));
  expect(()=>updateGoldLock(path,root)).toThrow();
  expect(existsSync(join(root,LOCK_PATH))).toBe(false);
 });
 it('runs the actual CLI with explicit integrity scope and failure exit codes',()=>{
  const {root}=setup();
  const cli=join(process.cwd(),'scripts/evals/lock-gold.ts');
  const loader=join(process.cwd(),'node_modules/tsx/dist/loader.mjs');
  const run=(args:string[])=>spawnSync(process.execPath,['--import',loader,cli,...args],{cwd:root,encoding:'utf8'});
  const good=run([path]);expect(good.status,good.stderr).toBe(0);
  expect(JSON.parse(good.stdout)).toMatchObject({changed:true,scope:'integrity_lock_only'});
  expect(run([]).status).toBe(2);
  expect(run(['../outside.json']).status).toBe(1);
 });
 it('does not replace a symlinked lock',()=>{
  const {root}=setup(),outside=join(root,'external-lock.json');
  writeFileSync(outside,readFileSync(join(root,LOCK_PATH)));
  rmSync(join(root,LOCK_PATH));symlinkSync(outside,join(root,LOCK_PATH));
  expect(()=>updateGoldLock(path,root)).toThrow('lock_symlink');
 });
});
