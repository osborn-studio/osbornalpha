import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {verifyMigrationHistory} from '../../../scripts/ci/migration-history';
const now = new Date('2026-10-04T10:00:00.000Z');
const files = ['20260101000000_first.sql','20260201000000_second.sql','20260301000000_third.sql'].map(file=>({file,sha256:'a'.repeat(64)}));
const history = () => ({schema_version:1,project_ref:'synthetic-project',captured_at:now.toISOString(),versions:['20260101000000','20260201000000']});
const check=(input:unknown)=>verifyMigrationHistory(files,input,'synthetic-project',now);
describe('offline migration history comparison',()=>{
 it('only lists the unapplied suffix and never requests reapplying recorded migrations',()=>{
  const r=check(history());expect(r.pending).toEqual(['20260301000000_third.sql']);expect(r.appliedCount).toBe(2);expect(r.productionSqlEquivalence).toBe('not_verified');expect(r.authorizesExecution).toBe(false);
 });
 it('accepts an exact complete history',()=>expect(check({...history(),versions:files.map(f=>f.file.slice(0,14))}).pending).toEqual([]));
 it.each([
  ['unknown version',{...history(),versions:['20250101000000']}],
  ['gap',{...history(),versions:['20260101000000','20260301000000']}],
  ['order',{...history(),versions:['20260201000000','20260101000000']}],
  ['duplicate',{...history(),versions:['20260101000000','20260101000000']}],
  ['empty',{...history(),versions:[]}],
  ['wrong project',{...history(),project_ref:'different-project'}],
  ['missing timestamp',{...history(),captured_at:undefined}],
  ['stale',{...history(),captured_at:'2026-10-02T10:00:00.000Z'}],
  ['future',{...history(),captured_at:'2026-10-04T10:01:00.000Z'}],
  ['unknown fields',{...history(),statements:['private SQL must not be emitted']}],
  ['numeric version',{...history(),versions:[20260101000000]}],
 ])('rejects %s',(_name,input)=>expect(()=>check(input)).toThrow());
 it('rejects malformed local inventory, not just remote data',()=>{
  expect(()=>verifyMigrationHistory([...files,files[0]],history(),'synthetic-project',now)).toThrow();
  expect(()=>verifyMigrationHistory([...files].reverse(),history(),'synthetic-project',now)).toThrow();
 });
});

import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrationInventory} from '../../../scripts/ci/research-checks';
it('CLI emits only a comparison, and rejects malformed input without echoing sensitive contents',()=>{
 const directory=mkdtempSync(join(tmpdir(),'alpha-history-'));const path=join(directory,'input.json');
 const args=['node_modules/tsx/dist/cli.mjs','scripts/ci/check-migration-history.ts',path,'synthetic-project'];
 try{
  const raw=JSON.stringify({...history(),captured_at:new Date().toISOString(),versions:migrationInventory().map(m=>m.file.slice(0,14))},null,2);writeFileSync(path,raw);
  const output=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
  expect(output.inputSha256).toBe(createHash('sha256').update(raw).digest('hex'));
  expect(output.pending).toEqual([]);expect(output.authorizesExecution).toBe(false);
  for(const bad of ['DO-NOT-ECHO invalid JSON',JSON.stringify({...history(),statements:['DO-NOT-ECHO']}),'DO-NOT-ECHO'+'x'.repeat(1048577)]){
   writeFileSync(path,bad);const result=spawnSync(process.execPath,args,{encoding:'utf8'});
   expect(result.status).toBe(1);expect(result.stdout).toBe('');expect(result.stderr).not.toContain('DO-NOT-ECHO');expect(result.stderr).not.toContain(path);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});
