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
 it('counts exact remaining prerequisites in the actual 50-case legacy population',()=>{
  const r=assessGoldAdmission(loadGoldSet(LEGACY_PLAN2_PATH),loadLock());
  expect(r.population).toBe(50);
  expect(r.prerequisites).toEqual({pending_cases:50,synthetic_cases:0,provenance_gap_cases:50,
   provenance_gaps:{canonical:48,printed:50,recorded_at:50,recorded_by:50,reviewed_by:50,
    'source.document_id':50,'source.locator':50,'source.sha256':50,'source.url':49}});
 });
 it('counts active cases once per gap and excludes retracted evidence',()=>{
  const s=candidate();
  s.cases=s.cases.slice(0,3);
  s.cases[0]={...s.cases[0],pending:true,provenance_kind:'synthetic',provenance_gaps:['printed','printed','source.sha256']};
  s.cases[1]={...s.cases[1],provenance_gaps:['printed']};
  s.cases[2]={...s.cases[0],case_id:'retracted',retracted:{at:'2026-11-07',by:'owner',reason:'synthetic test'}};
  const r=assessGoldAdmission(s,lockOf(s));
  expect(r.population).toBe(2);
  expect(r.prerequisites).toEqual({pending_cases:1,synthetic_cases:1,provenance_gap_cases:2,
   provenance_gaps:{printed:2,'source.sha256':1}});
  expect(r.cases.map(c=>c.case_id)).not.toContain('retracted');
 });
 it('reports no case prerequisites for empty populations without passing admission',()=>{
  const s={...candidate(),cases:[]},r=assessGoldAdmission(s,lockOf(s));
  expect(r.prerequisites).toEqual({pending_cases:0,synthetic_cases:0,provenance_gap_cases:0,provenance_gaps:{}});
  expect(r.ok).toBe(false);
 });
 it('rejects synthetic data even when schema and lock checks pass',()=>{
  const r=assessGoldAdmission(loadGoldSet(SYNTHETIC),loadLock());
  expect(r.ok).toBe(false);expect(r.findings.map(f=>f.code)).toContain('synthetic_case');
  expect(r.prerequisites.synthetic_cases).toBe(10);
 });
 it('accepts a valid contract while explicitly withholding evidence authentication',()=>{
  const s=candidate(),r=assessGoldAdmission(s,lockOf(s));
  expect(r).toMatchObject({ok:true,scope:'dataset_contract_only',set:{sha256:s.sha256},findings:[]});
  expect(r.prerequisites).toEqual({pending_cases:0,synthetic_cases:0,provenance_gap_cases:0,provenance_gaps:{}});
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
