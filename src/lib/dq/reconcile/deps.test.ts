// src/lib/dq/reconcile/deps.test.ts
import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({hash:vi.fn()}));
vi.mock('./pairs',async importOriginal=>({...(await importOriginal<typeof import('./pairs')>()),inputsHashNow:mocks.hash}));
import {REPO_FILE_PREFIXES,readRepoFileFromDisk,restoreInputsHashNow} from './deps';

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
