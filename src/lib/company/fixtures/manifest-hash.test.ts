// spec §0 #72: hash maintenance must never mutate acceptance expectations.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';

it('checks hashes, writes only sha256, rejects unknown arguments',()=>{
 const root=mkdtempSync(join(tmpdir(),'company-manifest-'));
 const script=resolve('scripts/company/manifest-hash.ts');
 const run=(...args:string[])=>spawnSync(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),script,...args],{cwd:root,encoding:'utf8'});
 try{
  mkdirSync(join(root,'src/lib/company/fixtures'),{recursive:true});
  writeFileSync(join(root,'fixture.json'),'{}');
  const path=join(root,'src/lib/company/fixtures/manifest.json');
  const manifest={fixtures:[{id:'fixture',path:'fixture.json',sha256:'pending'}],expectations:[{status:'pending',expected:{value:'pending'}}]};
  writeFileSync(path,JSON.stringify(manifest));
  expect(run().status).toBe(1);
  expect(run('--write').status).toBe(0);
  expect(JSON.parse(readFileSync(path,'utf8'))).toEqual({...manifest,fixtures:[{...manifest.fixtures[0],sha256:createHash('sha256').update('{}').digest('hex')}]});
  expect(run().status).toBe(0);
  expect(run('--bad').status).toBe(2);
 }finally{rmSync(root,{recursive:true,force:true});}
});
