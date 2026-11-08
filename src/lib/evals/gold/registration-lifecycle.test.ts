// All values and identities here are synthetic test contracts, never accepted human gold.
import {spawn,spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {GOLD_DIR,LOCK_PATH,RECORDERS_PATH,checkLock,loadGoldSet,loadLock} from './load';
import {assessGoldAdmission} from './admission';

const repo=process.cwd(),loader=join(repo,'node_modules/tsx/dist/loader.mjs');
const candidate=`${GOLD_DIR}/facts/synthetic-lifecycle-contract.json`;
const roots:string[]=[];
function setup(){
 const scratch=process.env.OSSTACK_SCRATCH_ROOT??join(tmpdir(),'osstack');
 mkdirSync(scratch,{recursive:true});
 const root=mkdtempSync(join(scratch,'f6-registration-lifecycle-'));roots.push(root);
 mkdirSync(join(root,GOLD_DIR,'facts'),{recursive:true});
 const recorders=JSON.parse(readFileSync(join(repo,RECORDERS_PATH),'utf8'));
 recorders.recorders=['test-recorder','test-reviewer'].map(id=>({...recorders.recorders[0],id}));
 writeFileSync(join(root,RECORDERS_PATH),JSON.stringify(recorders));
 const raw=JSON.parse(readFileSync(join(repo,GOLD_DIR,'facts/synthetic-us.json'),'utf8'));
 raw.set_id='facts/synthetic-lifecycle-contract';raw.review_required=true;
 for(const c of raw.cases){
  c.provenance_kind='transcribed';c.recorded_by='test-recorder';
  c.reviewed_by='test-reviewer';c.reviewed_at='2026-11-07';
  c.notes='SYNTHETIC TEST CONTRACT ONLY; no human transcription or acceptance.';
 }
 const save=()=>writeFileSync(join(root,candidate),JSON.stringify(raw));save();
 writeFileSync(join(root,LOCK_PATH),JSON.stringify({files:[]}));
 for(const dir of ['replay','edgar','issuers'])cpSync(join(repo,'src/lib/evals/fixtures',dir),join(root,'src/lib/evals/fixtures',dir),{recursive:true});
 for(const file of ['concepts.ts','units.ts','rules.ts']){mkdirSync(join(root,'src/lib/facts'),{recursive:true});cpSync(join(repo,'src/lib/facts',file),join(root,'src/lib/facts',file));}
 const cli=(script:string,args:string[])=>spawnSync(process.execPath,['--import',loader,join(repo,'scripts/evals',script),...args],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,TSX_TSCONFIG_PATH:join(repo,'tsconfig.json'),VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),S4_TEST_STATE:''}});
 return {root,raw,save,register:()=>cli('lock-gold.ts',[candidate]),run:()=>cli('run.ts',['--kind','official_reconciliation','--module','facts','--mode','ci','--set',candidate])};
}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});

describe('synthetic registration lifecycle through real operator CLIs',()=>{
 it('requires review, registers exact bytes, versions edits, and refuses stale runner bytes',()=>{
  const {root,raw,save,register,run}=setup();
  raw.cases[0].reviewed_by=null;raw.cases[0].reviewed_at=null;save();
  expect(register().status).toBe(1);expect(loadLock(root).files).toEqual([]);
  raw.cases[0].reviewed_by='test-recorder';raw.cases[0].reviewed_at='2026-11-07';save();
  expect(register().status).toBe(1);expect(loadLock(root).files).toEqual([]);
  raw.cases[0].reviewed_by='test-reviewer';save();
  const registered=register();expect(registered.status,registered.stderr).toBe(0);
  expect(JSON.parse(registered.stdout)).toMatchObject({changed:true,scope:'integrity_lock_only',not_verified:expect.arrayContaining(['recorder_identity_and_independent_pr_approval'])});
  expect(assessGoldAdmission(loadGoldSet(candidate,root),loadLock(root)).ok).toBe(true);
  expect(JSON.parse(register().stdout).changed).toBe(false);
  const matching=run();expect(matching.status,matching.stderr).toBe(0);
  expect(JSON.parse(matching.stdout)).toMatchObject({gate:'pass',mode:'ci',db:'skipped'});
  raw.cases[0].notes+=' Edited synthetic note.';save();
  const stale=run();expect(stale.status,stale.stderr).toBe(2);
  expect(JSON.parse(stale.stderr).error).toBe('gold_lock_mismatch');
  expect(register().status).toBe(1);
  raw.version=2;save();expect(register().status).toBe(1); // missing version history
  raw.history=[{version:2,changed_at:'2026-11-07',changed_by:'test-recorder',reason:'Synthetic lifecycle revision',fields:['cases[0].notes']}];save();
  expect(register().status).toBe(0);checkLock(loadGoldSet(candidate,root),loadLock(root));
  raw.version=1;raw.history=[];save();expect(register().status).toBe(1);
 });
 it.each(['duplicate','unknown_field','entry_unknown_field','malformed_entry','invalid_sha','wrong_version','invalid_json'])('runner refuses a %s lock before creating reports',kind=>{
  const {root,register,run}=setup();expect(register().status).toBe(0);
  const lock=loadLock(root);
  const corrupt=kind==='duplicate'?{files:[...lock.files,{...lock.files[0],sha256:'0'.repeat(64)}]}:
   kind==='unknown_field'?{...lock,accepted:true}:
   kind==='entry_unknown_field'?{files:[{...lock.files[0],accepted:true}]}:
   kind==='invalid_sha'?{files:[{...lock.files[0],sha256:'NOT-SHA256'}]}:
   kind==='wrong_version'?{files:[{...lock.files[0],version:'1'}]}:
   {files:[...lock.files,{path:'bad.json'}]};
  const bytes=kind==='invalid_json'?'{':JSON.stringify(corrupt);
  writeFileSync(join(root,LOCK_PATH),bytes);
  const result=run();expect(result.status,result.stderr).toBe(2);
  expect(JSON.parse(result.stderr).error).toBe('gold_invalid');
  expect(readFileSync(join(root,LOCK_PATH),'utf8')).toBe(bytes);
  expect(result.stdout).toBe('');expect(existsSync(join(root,'reports/evals'))).toBe(false);
 });
 it('serializes overlapping real registrations without losing either entry',async()=>{
  const {root,register}=setup();
  const other=`${GOLD_DIR}/facts/second-synthetic-contract.json`;
  const raw=JSON.parse(readFileSync(join(root,candidate),'utf8'));raw.set_id='facts/second-synthetic-contract';
  writeFileSync(join(root,other),JSON.stringify(raw));
  // Pause the real first updater after staging/fsync, with its exclusive pending file held.
  const holder=join(root,'hold-registration.mjs'),release=join(root,'release');
  writeFileSync(holder,`import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const original=fs.fsyncSync;
fs.fsyncSync=(fd)=>{original(fd);process.stdout.write('staged\\n');
 const deadline=Date.now()+10000;
 while(!fs.existsSync(${JSON.stringify(release)})){if(Date.now()>deadline)throw Error('release_timeout');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}
};syncBuiltinESMExports();
const {updateGoldLock}=await import(${JSON.stringify(join(repo,'src/lib/evals/gold/update-lock.ts'))});
process.stdout.write(JSON.stringify(updateGoldLock(${JSON.stringify(other)}))+'\\n');`);
  const child=spawn(process.execPath,['--import',loader,holder],{cwd:root,stdio:['ignore','pipe','pipe']});
  let output='',errors='';child.stderr.on('data',b=>{errors+=b;});
  const done=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  try{
   await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`registration did not stage: ${errors}`)),12000);
    child.stdout.on('data',b=>{output+=b;if(output.includes('staged\n')){clearTimeout(timer);resolve();}});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error(`early registration exit ${code}: ${errors}`));});
   });
   const pending=readFileSync(join(root,`${LOCK_PATH}.pending`));
   expect(register().status).toBe(1);
   expect(readFileSync(join(root,`${LOCK_PATH}.pending`))).toEqual(pending);
   expect(loadLock(root).files).toEqual([]);
   writeFileSync(release,'release');expect(await done,errors).toBe(0);
   expect(loadLock(root).files.map(f=>f.path)).toEqual([other]);
   const winner=loadLock(root).files[0];
   expect(register().status).toBe(0);
   expect(loadLock(root).files.map(f=>f.path).sort()).toEqual([other,candidate].sort());
   expect(loadLock(root).files[0]).toEqual(winner);
   for(const path of [other,candidate])checkLock(loadGoldSet(path,root),loadLock(root));
   expect(existsSync(join(root,`${LOCK_PATH}.pending`))).toBe(false);
  }finally{writeFileSync(release,'release');if(child.exitCode===null)child.kill();await done;}
 },20000);
});
