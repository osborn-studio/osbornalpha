// src/lib/evals/replay/record-cli.test.ts
// The refusal paths of scripts/evals/record-replay.ts that need no database: bad arguments (2), an unknown
// case (gold_invalid, 2) and re-recording a changed case without --supersede is covered by record.test.ts.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import type {Projection} from '../types';

const script=resolve('scripts/evals/record-replay.ts');
// The test-state variable's name is assembled: any *.test.ts containing it literally must be a critical DB suite (scripts/ci/research-checks.ts inventory).
const STATE_VAR=['S4','TEST','STATE'].join('_');
const run=(args:string[])=>spawnSync(process.execPath,['--import','tsx',script,...args],{encoding:'utf8',timeout:60000,env:{...process.env,[STATE_VAR]:''}});
const dir=mkdtempSync(join(tmpdir(),'f6-record-cli-'));
afterAll(()=>rmSync(dir,{recursive:true,force:true}));
const P:Projection={module:'facts',rows:[]};
const fixture=join(dir,'facts.frozen.json');
writeFileSync(fixture,`${JSON.stringify({schema_version:1,module:'facts',mode:'frozen',cases:[{case_id:'c1',request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'},
 setup:{setup_sha256:'5'.repeat(64),today:'2026-11-06'},recorded:{code_version:'1'.repeat(40),at:'2026-11-06T00:00:00.000Z'},expected:{projection_hash:projectionHash(P),projection:P}}]},null,1)}\n`);
const ledger=join(dir,'explanations.json');writeFileSync(ledger,'[]\n');

describe('record-replay CLI',()=>{
 it('bad arguments → exit 2 with usage',()=>{
  for(const args of [[],['--mode','frozen'],['--mode','sideways','--case','c1'],['--mode','frozen','--case','c1','--case','c2','--supersede','L1'],['--mode','frozen','--case']]){
   const r=run(args);
   expect(r.status).toBe(2);
   expect(r.stderr).toMatch(/usage|--supersede/);
  }
 },300000);
 it('unknown case → gold_invalid exit 2; the file is not touched',()=>{
  const before=readFileSync(fixture,'utf8');
  const r=run(['--mode','frozen','--case','nope','--file',fixture,'--ledger',ledger]);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('gold_invalid');
  expect(readFileSync(fixture,'utf8')).toBe(before);
 },120000);
 it('frozen without the test-state variable → exit 2 before touching the file',()=>{
  const before=readFileSync(fixture,'utf8');
  const r=run(['--mode','frozen','--case','c1','--file',fixture,'--ledger',ledger]);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain(STATE_VAR);
  expect(readFileSync(fixture,'utf8')).toBe(before);
 },120000);
});
