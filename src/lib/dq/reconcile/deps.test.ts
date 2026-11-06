// src/lib/dq/reconcile/deps.test.ts
import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({hash:vi.fn()}));
vi.mock('./pairs',async importOriginal=>({...(await importOriginal<typeof import('./pairs')>()),inputsHashNow:mocks.hash}));
import {REPO_FILE_PREFIXES,cnPairEnabled,parseReconcileArgs,readRepoFileFromDisk,restoreInputsHashNow} from './deps';

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
 it('parseReconcileArgs: --apply of a cn.* pair is refused unless enabled; enabled and dry runs pass the gate; bad arguments exit 2',()=>{
  const cn='cn.tushare_vs_cninfo_pdf_gold';
  const reg={[cn]:{},'facts.lineage_same_day':{}};
  expect(parseReconcileArgs(['--pair',cn,'--apply'],{},reg)).toEqual({exit:2,message:expect.stringContaining('cn_disabled')});
  expect(parseReconcileArgs(['--pair',cn,'--apply'],{FACTS_CN_ENABLED:'0'},reg)).toMatchObject({exit:2});
  expect(parseReconcileArgs(['--pair',cn,'--apply'],{FACTS_CN_ENABLED:'1'},reg)).toEqual({pair:cn,apply:true,tickers:[]});
  expect(parseReconcileArgs(['--pair',cn],{},reg)).toEqual({pair:cn,apply:false,tickers:[]});   // dry run: no gate
  expect(parseReconcileArgs(['--pair','facts.lineage_same_day','--issuer','AAPL','--issuer','MSFT','--apply'],{},reg)).toEqual({pair:'facts.lineage_same_day',apply:true,tickers:['AAPL','MSFT']});
  for(const argv of [[],['--pair'],['--pair','bogus'],['--pair','facts.lineage_same_day','--wat'],['--issuer','AAPL']])expect(parseReconcileArgs(argv,{},reg),argv.join(' ')).toEqual({exit:2,message:expect.stringContaining('usage:')});
  const unreg=parseReconcileArgs(['--pair','us.companyfacts_vs_gold'],{},{});
  expect(unreg).toEqual({exit:2,message:expect.stringContaining('registered:')});
 });
});
