import {describe,expect,it} from 'vitest';
import {assessGoldAdmission} from './admission';
import {LEGACY_PLAN2_PATH,loadGoldSet,loadLock} from './load';
import type {GoldSet} from '../types';

const SYNTHETIC='src/lib/evals/fixtures/gold/facts/synthetic-us.json';
// In-memory mutation exercises the contract only; it is not human gold or a licence claim.
const candidate=():GoldSet=>{
 const s=structuredClone(loadGoldSet(SYNTHETIC));
 return {...s,cases:s.cases.map(c=>({...c,provenance_kind:'transcribed',recorded_by:'owner'}))};
};
const lockOf=(s:GoldSet)=>({files:[{path:s.path,sha256:s.sha256,version:s.version,format:s.format}]});

describe('gold dataset contract admission',()=>{
 it('rejects the repository legacy set with per-case evidence gaps',()=>{
  const r=assessGoldAdmission(loadGoldSet(LEGACY_PLAN2_PATH),loadLock());
  expect(r.ok).toBe(false);
  expect(r.findings.map(f=>f.code)).toEqual(expect.arrayContaining(['legacy_format','not_ready','pending_case','provenance_gaps']));
  expect(r.cases.some(c=>c.pending&&c.provenance_gaps.includes('source.sha256'))).toBe(true);
 });
 it('rejects synthetic data even when schema and lock checks pass',()=>{
  const r=assessGoldAdmission(loadGoldSet(SYNTHETIC),loadLock());
  expect(r.ok).toBe(false);expect(r.findings.map(f=>f.code)).toContain('synthetic_case');
 });
 it('accepts a valid contract while explicitly withholding evidence authentication',()=>{
  const s=candidate(),r=assessGoldAdmission(s,lockOf(s));
  expect(r).toMatchObject({ok:true,scope:'dataset_contract_only',set:{sha256:s.sha256},findings:[]});
  expect(r.not_verified).toContain('source_bytes_and_transcription_accuracy');
  expect(r.not_verified).toContain('release_manifest_and_production_readiness');
 });
 it('rejects empty and all-retracted sets, restricted artifacts and mismatched locks',()=>{
  const s=candidate();
  expect(assessGoldAdmission({...s,cases:[]},lockOf(s)).findings.map(f=>f.code)).toContain('empty_population');
  const retracted={...s,cases:s.cases.map(c=>({...c,retracted:{at:'2026-11-07',by:'owner',reason:'synthetic test'}}))};
  expect(assessGoldAdmission(retracted,lockOf(s)).findings.map(f=>f.code)).toContain('empty_population');
  expect(assessGoldAdmission({...s,artifact_class:'restricted'},lockOf(s)).findings.map(f=>f.code)).toContain('restricted_license_pending');
  expect(assessGoldAdmission(s,{files:[]}).findings.map(f=>f.code)).toContain('gold_lock_mismatch');
 });
});
