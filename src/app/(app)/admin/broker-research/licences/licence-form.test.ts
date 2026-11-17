// src/app/(app)/admin/broker-research/licences/licence-form.test.ts
import {describe,expect,it} from 'vitest';
import {emptyLicenceForm,toLicenceInput,validateLicenceForm} from './licence-form';

describe('licence form',()=>{
 it('validates labels, N ≤ 500 and dates',()=>{
  expect(validateLicenceForm(emptyLicenceForm('2026-11-06'))).toEqual(expect.arrayContaining(['source_label','holder','terms_summary']));
  const ok={...emptyLicenceForm('2026-11-06'),source_label:'Synthetic',holder:'Owner',terms_summary:'Terms'};
  expect(validateLicenceForm(ok)).toEqual([]);
  expect(validateLicenceForm({...ok,snippet_max_chars:'501'})).toEqual(['snippet_max_chars']);
  expect(validateLicenceForm({...ok,snippet_max_chars:'abc'})).toEqual(['snippet_max_chars']);
  expect(validateLicenceForm({...ok,valid_to:'2026-01-01',valid_from:'2026-02-01'})).toEqual(['valid_to']);
  expect(validateLicenceForm({...ok,source_label:'x'.repeat(121)})).toEqual(['source_label']);
 });
 it('serialises to LicenceInput with nulls for empty optionals',()=>{
  const f={...emptyLicenceForm('2026-11-06'),source_label:' Synthetic ',holder:'Owner',terms_summary:'Terms',allows_public_metadata:true};
  expect(toLicenceInput(f)).toMatchObject({source_label:'Synthetic',evidence_path:null,valid_to:null,snippet_max_chars:1,allows_public_metadata:true,allows_public_target_price:false});
 });
});

it('matches the existing licence route: a positive cap, real dates and private evidence paths',()=>{
 const f={...emptyLicenceForm('2026-11-06'),source_label:'Synthetic',holder:'Owner',terms_summary:'Terms'};
 expect(Number(f.snippet_max_chars)).toBeGreaterThanOrEqual(1);
 expect(validateLicenceForm({...f,snippet_max_chars:'0'})).toContain('snippet_max_chars');
 expect(validateLicenceForm({...f,valid_from:'2026-02-30'})).toContain('valid_from');
 expect(validateLicenceForm({...f,evidence_path:'https://public.example/report.pdf'})).toContain('evidence_path');
 expect(validateLicenceForm({...f,evidence_path:`licences/${'a'.repeat(64)}.pdf`})).toEqual([]);
});
