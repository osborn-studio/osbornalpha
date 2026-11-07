// src/lib/documents/hk-facts/eval-offline.test.ts
// offlineHkCandidates on the committed synthetic annual layout (plan F3 Task 18): the generator and the
// deterministic checks, without any database, agree with SYNTHETIC_ANCHORS.
import {describe,expect,it} from 'vitest';
import {SYNTHETIC_ANCHORS,syntheticAnnualPages} from '../fixtures/hkex/synthetic-annual';
import type {FinancialFactPayload,PagesJson} from '../types';
import {offlineHkCandidates,scoredRows} from './eval';

const SHA='c'.repeat(64);
const pagesJson=():PagesJson=>({extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'t',content_sha256:SHA,has_text_layer:true,pages:syntheticAnnualPages()});
describe('offlineHkCandidates on the synthetic annual layout',()=>{
 it('produces every anchor with checks_passed and the anchor value',async()=>{
  const r=await offlineHkCandidates(pagesJson(),{content_sha256:SHA,source_ref:'synthetic'});
  for(const a of SYNTHETIC_ANCHORS){
   const c=r.candidates.find(x=>x.natural_key===a.natural_key);
   expect(c,a.natural_key).toBeDefined();
   expect((c!.payload as FinancialFactPayload).value,a.natural_key).toBe(a.value);
   const res=r.results.find(x=>x.candidate_id===c!.candidate_id)!;
   expect(res.checks_passed,`${a.natural_key} ${JSON.stringify(res.checks.filter(x=>x.passed===false))}`).toBe(true);
  }
  const rows=scoredRows(SHA,r.candidates,r.results);
  expect(rows.length).toBe(r.candidates.length);
  expect(rows.every(x=>x.document_sha256===SHA)).toBe(true);
 });
});
