// src/lib/evals/kinds/registry-resume.test.ts
import {describe,expect,it} from 'vitest';
import {runCli} from '../cli/run-cli';
import type {CliDeps} from '../cli/run-cli';

describe('assertKindEnabled gates --resume',()=>{
 it('--resume of a disabled kind is refused with exit 2 before buildDeps is ever called',async()=>{
  let built=0;const err:string[]=[];
  const deps={buildDeps:async()=>{built++;throw new Error('must not connect');}} as unknown as CliDeps;
  const code=await runCli(['--kind','dual_source','--module','facts','--mode','report','--write-db','--resume','run-x'],{stdout:()=>{},stderr:l=>err.push(l)},deps);
  expect(code).toBe(2);expect(built).toBe(0);expect(err.join('')).toContain('kind_not_enabled');
 });
});
