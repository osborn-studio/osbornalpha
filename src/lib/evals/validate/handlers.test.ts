// src/lib/evals/validate/handlers.test.ts
// The --expert / --audit / --manifest flags of scripts/evals/validate.ts, and the two templates.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {validateExpertRecord} from './expert';
import {f6Handlers,manifestFindings} from './handlers';
import {validateManifest} from './manifest';
import type {ManifestDeps} from './manifest';

const noDb:ManifestDeps={readAt:()=>null,lockAt:()=>({files:[]}),loadSetAt:()=>{throw new Error('no set');},isAncestor:()=>true,originRepo:()=>null};
const h=f6Handlers(process.cwd(),()=>noDb);
const codes=async(flag:string,args:string[])=>(await h[flag](args)).map(f=>f.code);

describe('f6Handlers',()=>{
 it('registers --audit and --expert only (--manifest is manifestHandler, the one implementation)',()=>expect(Object.keys(h).sort()).toEqual(['--audit','--expert']));
 it('--audit validates a directory and honours --release',async()=>{
  expect(await codes('--audit',['docs/audits/2026-11-04-evals-gold-sets'])).toEqual([]);
  expect(await codes('--audit',['docs/audits/2026-11-04-evals-gold-sets','--release'])).toEqual(['audit_release_open_verify']);
  expect(await codes('--audit',['docs/audits/does-not-exist'])).toEqual(['audit_index_missing']);
 });
 it('reports a missing argument as cli_usage',async()=>{
  for(const flag of ['--audit','--expert']){expect(await codes(flag,[])).toEqual(['cli_usage']);expect(await codes(flag,['--release'])).toEqual(['cli_usage']);}
 });
 it('--expert / --manifest report unreadable files',async()=>{
  expect(await codes('--expert',['docs/evals/nope.json'])).toEqual(['expert_invalid']);
  expect((await manifestFindings(process.cwd(),'docs/evals/nope.json',noDb)).map(f=>f.code)).toEqual(['manifest_invalid']);
 });
 it('--manifest without database access fails closed',async()=>{
  expect((await manifestFindings(process.cwd(),'docs/evals/templates/release-manifest.template.json',noDb)).map(f=>f.code)).toContain('manifest_no_db');
 });
 it('P2: --expert without database access fails closed (expert_run_unverified)',async()=>{
  expect(await codes('--expert',['docs/evals/templates/expert-sampling.template.json'])).toEqual(['expert_set_unresolved','expert_run_unverified']);
 });
});

describe('templates',()=>{
 const read=(f:string)=>JSON.parse(readFileSync(`docs/evals/templates/${f}`,'utf8')) as Record<string,unknown>;
 it('expert-sampling.template.json has the §8 shape (only the population set is unresolved)',()=>{
  expect(validateExpertRecord(read('expert-sampling.template.json'),null).map(f=>f.code)).toEqual(['expert_set_unresolved']);
 });
 it('release-manifest.template.json has the §10 shape (fails only on missing evidence and database access)',async()=>{
  const found=(await validateManifest(read('release-manifest.template.json'),noDb)).map(f=>f.code);
  expect(found).not.toContain('manifest_invalid');
  expect(found).not.toContain('manifest_waiver_invalid');
  expect(found).not.toContain('manifest_gold_approval');
  expect(found).toContain('manifest_no_db');
 });
});

describe('validate/cli.ts HANDLERS (Task 12 entries)',()=>{
 it('the three flags are table entries after Task 3\'s four, --release only on --expert/--audit',async()=>{
  const {HANDLERS}=await import('./cli');
  expect(HANDLERS.map(x=>[x.flag,x.modifiers??[]])).toEqual([['--gold',[]],['--lock',[]],['--gold-diff',[]],['--redact',[]],['--expert',['--release']],['--audit',['--release']],['--manifest',['--online']],['--availability',[]]]);
 });
 it('runValidate --audit <dir> --release: exit 1 with the finding in checks.audit.findings',async()=>{
  const {runValidate}=await import('./cli');
  const r=await runValidate(['--audit','docs/audits/2026-11-04-evals-gold-sets','--release']);
  expect(r.exitCode).toBe(1);
  expect((r.output.checks.audit.findings as {code:string}[]).map(f=>f.code)).toEqual(['audit_release_open_verify']);
  expect((await runValidate(['--audit','docs/audits/2026-11-04-evals-gold-sets'])).exitCode).toBe(0);
 });
});
