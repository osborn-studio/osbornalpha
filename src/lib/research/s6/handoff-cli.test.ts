import {it,expect} from 'vitest';
import {spawnSync,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const script=resolve('scripts/s6/check-market-handoff.ts');
const run=(file:string)=>spawnSync(process.execPath,['--import','tsx',script,file],{encoding:'utf8',timeout:5000});
it('CLI distinguishes complete, incomplete, invalid and oversized without exposing input',()=>{
 const dir=mkdtempSync(join(tmpdir(),'alpha-market-cli-'));
 try{
  let r=run('docs/handoffs/alpha-s6/market-interface/split.synthetic.json');expect(r.status).toBe(0);expect(JSON.parse(r.stdout).accepted_for_evaluation).toBe(false);
  r=run('docs/handoffs/alpha-s6/market-interface/missing.synthetic.json');expect(r.status).toBe(2);
  expect(run(join(dir,'missing.json')).status).toBe(3);
  const file=join(dir,'invalid.json');writeFileSync(file,'PRIVATE BODY');r=run(file);expect(r.status).toBe(1);expect(r.stdout).not.toContain('PRIVATE BODY');
  writeFileSync(file,' '.repeat(2*1024*1024+1));r=run(file);expect(r.status).toBe(1);expect(JSON.parse(r.stdout).code).toBe('input_limit');
  const pipe=join(dir,'pipe');execFileSync('mkfifo',[pipe]);expect(run(pipe).status).toBe(3);
  const link=join(dir,'link.json');symlinkSync(file,link);expect(run(link).status).toBe(3);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

it('shared inventory rejects traversal, empty inventories and symlinks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'alpha-shared-cli-'));
 try{
  mkdirSync(join(dir,'docs/handoffs/alpha-s7'),{recursive:true});
  const manifest=join(dir,'docs/handoffs/alpha-s7/manifest.json');
  const verify=()=>spawnSync(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),resolve('scripts/s7/verify-handoff.ts')],{cwd:dir,encoding:'utf8'});
  const put=(files:unknown[])=>writeFileSync(manifest,JSON.stringify({schema_version:'alpha-shared-handoff/1.0',files}));
  put([]);expect(verify().status).toBe(1);
  put([{path:'../outside',sha256:'0'.repeat(64),size_bytes:0}]);expect(verify().status).toBe(1);
  writeFileSync(join(dir,'actual'),'safe');put([{path:'actual',sha256:'0'.repeat(64),size_bytes:4}]);const tampered=verify();expect(tampered.status).toBe(1);expect(tampered.stderr).toContain('actual');symlinkSync(join(dir,'actual'),join(dir,'link'));
  put([{path:'link',sha256:'0'.repeat(64),size_bytes:4}]);const result=verify();expect(result.status).toBe(1);expect(result.stderr).toContain('symlink refused');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
