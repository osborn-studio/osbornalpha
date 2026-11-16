import {spawnSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';

// No inherited credentials or env-file; even a parser regression can only reach the token gate.
const cli=(args:string[])=>spawnSync(process.execPath,['--import','tsx','scripts/industry/sync.ts',...args],{
 cwd:process.cwd(),env:{NODE_ENV:'test',PATH:process.env.PATH,TSX_DISABLE_CACHE:'1'},encoding:'utf8',timeout:10000,
});

describe('industry sync CLI operation bounds',()=>{
 it.each([false,true])('rejects the ignored SW --limit before the credential gate (%j)',mode=>{
  const r=cli(['--job','memberships-sw','--l1','801120.SI','--limit','1',...(mode?['--apply']:[])]);
  expect(r.error).toBeUndefined();expect(r.status).toBe(2);
  expect(r.stderr).toContain('--limit is only supported by');
  expect(r.stderr).not.toContain('tushare_unavailable');expect(r.stdout).toBe('');
 });
 it('explains the SW apply scope before any dependency construction',()=>{
  const r=cli(['--job','memberships-sw','--l1','801120.SI','--apply']);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('classifications=all SW2021');
  expect(r.stderr).toContain('source L1=801120.SI');
  expect(r.stderr).toContain('resolver=global');
  expect(r.stderr).toContain('job deadline=none');
  expect(r.stderr).toContain('tushare_unavailable');
  expect(r.stderr.indexOf('memberships-sw operation plan')).toBeLessThan(r.stderr.indexOf('tushare_unavailable'));
 });
 it('explains that dry-run is a source-only stored-classification plan',()=>{
  const r=cli(['--job','memberships-sw']);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('dry-run=source plan from stored classifications only');
  expect(r.stderr).toContain('source L1=all stored L1');
  expect(r.stderr).toContain('does not execute or estimate the global resolver');
 });
});
