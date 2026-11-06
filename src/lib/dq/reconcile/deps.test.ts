// src/lib/dq/reconcile/deps.test.ts
import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({hash:vi.fn()}));
vi.mock('./pairs',async importOriginal=>({...(await importOriginal<typeof import('./pairs')>()),inputsHashNow:mocks.hash}));
import {spawnSync} from 'node:child_process';
import {REPO_FILE_PREFIXES,cnPairEnabled,readRepoFileFromDisk,restoreInputsHashNow} from './deps';

describe('restoreInputsHashNow (quarantine route + admin dashboard, spec §5.6)',()=>{
 it('passes the hash through; known data gaps become inputs_unavailable, an unobtainable current right side current_evidence_unavailable (plan audit P2); anything else is rethrown',async()=>{
  const fn=restoreInputsHashNow({} as SupabaseClient);   // the factories only capture the client
  const item={id:'q',detail:{pair:'us.companyfacts_vs_gold'}};
  mocks.hash.mockResolvedValueOnce('h1');expect(await fn(item)).toBe('h1');
  for(const code of ['pair_not_registered','left_fact_missing','no_latest_result']){mocks.hash.mockRejectedValueOnce(new Error(code));expect(await fn(item)).toEqual({unavailable:'inputs_unavailable'});}
  mocks.hash.mockRejectedValueOnce(new Error('current_evidence_unavailable'));expect(await fn(item)).toEqual({unavailable:'current_evidence_unavailable'});
  mocks.hash.mockRejectedValueOnce(new Error('db down'));await expect(fn(item)).rejects.toThrow('db down');
 });
});

describe('readRepoFileFromDisk',()=>{
 it('reads an allowed repo file as bytes',async()=>{
  const b=await readRepoFileFromDisk('src/lib/facts/fixtures/gold/plan2.json');
  expect(new TextDecoder().decode(b)).toContain('"entries"');
  expect(REPO_FILE_PREFIXES).toEqual(['src/lib/dq/fixtures/gold/','src/lib/facts/fixtures/gold/']);
 });
 it('refuses absolute paths, traversal and anything outside the gold fixture directories',async()=>{
  for(const p of ['/etc/passwd','src/lib/dq/fixtures/gold/../../../../package.json','package.json','src/lib/dq/reconcile/run.ts','src/lib/dq/fixtures/gold/x.ts'])
   await expect(readRepoFileFromDisk(p),p).rejects.toThrow('repo_file_not_allowed');
 });
});

describe('CN gate (FACTS_CN_ENABLED)',()=>{
 it('cnPairEnabled: non-CN pairs always, cn.* only with FACTS_CN_ENABLED=1',()=>{
  expect(cnPairEnabled('facts.lineage_same_day',{})).toBe(true);
  expect(cnPairEnabled('cn.tushare_vs_cninfo_pdf_gold',{})).toBe(false);
  expect(cnPairEnabled('cn.tushare_vs_cninfo_pdf_gold',{FACTS_CN_ENABLED:'true'})).toBe(false);
  expect(cnPairEnabled('cn.tushare_vs_cninfo_pdf_gold',{FACTS_CN_ENABLED:'1'})).toBe(true);
 });
 const run=(env:Record<string,string>,args:string[])=>spawnSync('npx',['tsx','scripts/dq/reconcile.ts',...args],{encoding:'utf8',env:{...process.env,FACTS_CN_ENABLED:'',...env},timeout:60_000});
 it('scripts/dq/reconcile.ts refuses --apply for a cn.* pair unless enabled, before building production deps; the enabled run gets past the gate',()=>{
  const off=run({},['--pair','cn.tushare_vs_cninfo_pdf_gold','--apply']);
  expect(off.status).toBe(2);expect(off.stderr).toContain('cn_disabled');
  const on=run({FACTS_CN_ENABLED:'1'},['--pair','cn.tushare_vs_cninfo_pdf_gold','--apply']);
  expect(on.status).toBe(2);expect(on.stderr).not.toContain('cn_disabled');expect(on.stderr).toContain('registered:');   // CN pair is not registered until Task 16a: the next check answers
  const dry=run({},['--pair','cn.tushare_vs_cninfo_pdf_gold']);
  expect(dry.stderr).not.toContain('cn_disabled');   // a dry run needs no gate
 },120_000);
});
