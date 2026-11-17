// Licence validation, confirmation, and public switch service tests (spec §4.1, §8.2).
import {describe,expect,it} from 'vitest';
import {ADMIN_ID,LICENCE_INPUT,memoryCoreDeps,seedLicence} from './testing';
import {confirmLicence,createLicence,licenceConfirmed,parseLicenceInput,patchLicence,processingAllowed,setPublicEnabled} from './licences';

describe('parseLicenceInput',()=>{
 it('accepts a full create body and defaults booleans to false',()=>{
  const {allows_llm_processing:_a,allows_public_metadata:_b,allows_public_snippets:_c,allows_public_summary:_d,allows_public_target_price:_e,...rest}=LICENCE_INPUT;
  const v=parseLicenceInput(rest as unknown as Record<string,unknown>,'create');
  expect(v).toMatchObject({allows_llm_processing:false,allows_public_target_price:false,snippet_max_chars:300,valid_to:null,evidence_path:null});
 });
 it.each([
  [{snippet_max_chars:501},'invalid_licence:snippet_max_chars'],[{snippet_max_chars:0},'invalid_licence:snippet_max_chars'],
  [{source_label:'x'.repeat(121)},'invalid_licence:source_label'],[{licence_kind:'pirate'},'invalid_licence:licence_kind'],
  [{valid_from:'2026-02-30'},'invalid_licence:valid_from'],[{valid_to:'2025-12-31'},'invalid_licence:valid_to'],
  [{evidence_path:'reports/x.pdf'},'invalid_licence:evidence_path'],[{unknown:1},'invalid_licence:unknown'],
 ])('rejects %o',(patch,code)=>{
  expect(()=>parseLicenceInput({...LICENCE_INPUT,...patch} as Record<string,unknown>,'create')).toThrow(expect.objectContaining({code,status:400}));
 });
 it('patch mode requires at least one key and checks only what is present',()=>{
  expect(()=>parseLicenceInput({},'patch')).toThrow(expect.objectContaining({code:'invalid_licence:empty'}));
  expect(parseLicenceInput({holder:'New holder'},'patch')).toEqual({holder:'New holder'});
 });
});

describe('licence services',()=>{
 it('create → confirm → material patch clears confirmation → reconfirm with the new version',async()=>{
  const d=memoryCoreDeps();
  const row=await createLicence(d,LICENCE_INPUT,ADMIN_ID);
  expect(licenceConfirmed(row,'2026-11-06')).toBe(false);
  await expect(confirmLicence(d,row.licence_id,row.version+1,ADMIN_ID)).rejects.toMatchObject({code:'version_mismatch',status:409,extra:{current_version:row.version}});
  const c=await confirmLicence(d,row.licence_id,row.version,ADMIN_ID);
  expect(licenceConfirmed(c,'2026-11-06')).toBe(true);expect(processingAllowed(c,'2026-11-06')).toBe(true);
  const p=await patchLicence(d,row.licence_id,{snippet_max_chars:100},ADMIN_ID);
  expect(p.material).toBe(true);expect(p.licence.version).toBe(row.version+1);expect(licenceConfirmed(p.licence,'2026-11-06')).toBe(false);
  const again=await confirmLicence(d,row.licence_id,p.licence.version,ADMIN_ID);expect(licenceConfirmed(again,'2026-11-06')).toBe(true);
  const audits=(d.tables as unknown as {rows(t:string):{action:string}[]}).rows('research_audit_log').map(r=>r.action);
  expect(audits).toEqual(['broker_research.licence_create','broker_research.licence_confirm','broker_research.licence_patch','broker_research.licence_confirm']);
 });
 it('validity window and the processing flag gate processing',async()=>{
  const d=memoryCoreDeps();
  const l=await seedLicence(d.db,{patch:{allows_llm_processing:false,valid_from:'2026-01-01',valid_to:'2026-06-30'}});
  expect(licenceConfirmed(l,'2026-06-30')).toBe(true);expect(licenceConfirmed(l,'2026-07-01')).toBe(false);
  expect(processingAllowed(l,'2026-03-01')).toBe(false);
 });
 it('patch of an unknown licence is 404; valid_to before valid_from (merged with stored) is 400',async()=>{
  const d=memoryCoreDeps();const l=await seedLicence(d.db);
  await expect(patchLicence(d,'00000000-0000-4000-8000-0000000000ff',{holder:'x'},ADMIN_ID)).rejects.toMatchObject({code:'licence_not_found',status:404});
  await expect(patchLicence(d,l.licence_id,{valid_to:'2025-01-01'},ADMIN_ID)).rejects.toMatchObject({code:'invalid_licence:valid_to'});
 });
 it('setPublicEnabled writes the flag and an audit row',async()=>{
  const d=memoryCoreDeps();
  expect((await setPublicEnabled(d,true,ADMIN_ID)).public_enabled).toBe(true);
  expect((await d.db.getSettings()).updated_by).toBe(ADMIN_ID);
 });
});
