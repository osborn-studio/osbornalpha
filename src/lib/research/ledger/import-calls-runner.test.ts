import {describe,expect,it,vi} from 'vitest';
import {runImportCallsCli} from '../../../../scripts/import-calls-runner';
describe('operator import lifecycle without files/environment/modules/DB',()=>{
 it('refuses invalid arguments before any loader work',async()=>{
  const prepare=vi.fn(),stdout=vi.fn(),stderr=vi.fn();
  expect(await runImportCallsCli(['--scorecard','/synthetic-secret'],{prepare,stdout,stderr})).toBe(2);
  expect(prepare).not.toHaveBeenCalled();expect(stdout).not.toHaveBeenCalled();expect(stderr.mock.calls.flat().join()).not.toContain('/synthetic-secret');
 });
 it.each(['module','file','database','cleanup'])('redacts %s errors and attempts registered cleanup',async stage=>{
  const close=vi.fn(async()=>{if(stage==='cleanup')throw new Error('/synthetic-secret cleanup');});
  const stdout=vi.fn(),stderr=vi.fn();
  const code=await runImportCallsCli(['fixture.jsonl'],{stdout,stderr,prepare:async(_,register)=>{
   register(close);if(stage==='module')throw new Error('/synthetic-secret module');
   return async()=>{if(stage!=='cleanup')throw new Error('/synthetic-secret call-XYZ');return {fixture:true};};
  }});
  expect(code).toBe(1);expect(close).toHaveBeenCalledTimes(1);expect(stdout).not.toHaveBeenCalled();
  expect(stderr).toHaveBeenCalledTimes(1);expect(stderr.mock.calls.flat().join()).not.toMatch(/synthetic-secret|call-XYZ/);
 });
 it('handles loader failure before cleanup registration without output or raw error',async()=>{
  const stdout=vi.fn(),stderr=vi.fn();
  expect(await runImportCallsCli(['fixture.jsonl'],{stdout,stderr,prepare:async()=>{throw new Error('/synthetic-secret');}})).toBe(1);
  expect(stdout).not.toHaveBeenCalled();expect(stderr.mock.calls.flat().join()).not.toContain('synthetic-secret');
 });
 it('emits success only after cleanup and retains explicit dry-run in prepared options',async()=>{
  const order:string[]=[],stderr=vi.fn();
  const code=await runImportCallsCli(['--dry-run','fixture.jsonl'],{stderr,stdout:value=>{order.push('output');expect(JSON.parse(value)).toEqual({synthetic:true});},prepare:async(options,register)=>{
   expect(options.dryRun).toBe(true);register(async()=>{order.push('close');});return async()=>{order.push('work');return {synthetic:true};};
  }});
  expect(code).toBe(0);expect(order).toEqual(['work','close','output']);expect(stderr).not.toHaveBeenCalled();
 });
});
