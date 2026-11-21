import {afterEach,describe,expect,it,vi} from 'vitest';
import * as merge from './extract/merge';
import {runExtract} from './extract/run';
import {pipelineExtraction} from './fixtures/pipeline';
import {sha256Hex} from './hash';
import {fakeF3Port} from './ports/f3';
import {replayFromSnapshot} from './replay';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedLicence,seedParsed} from './testing';
import type {PublicationRow} from './types';

async function publication(){
 const d=memoryBrokerDeps({f3:fakeF3Port(({sha256})=>{
  const artifact=pipelineExtraction(sha256);
  artifact.pages[2].text=artifact.pages[0].text;
  return artifact;
 })});
 const doc=await seedParsed(d,(await seedLicence(d.db)).licence_id);
 const ex=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
 const f=(await d.db.listFields(ex.reportId)).find(r=>r.field==='institution')!;
 const value={value_text:f.value_text,value_num:f.value_num,value_currency:f.value_currency,value_unit:f.value_unit,value_date:f.value_date};
 const row={field_id:f.field_id,field:f.field,target_key:f.target_key,occurrence:f.occurrence,status:'confirmed',extractor:f.extractor,
  parse_run_id:f.parse_run_id,run_id:f.run_id,artifact_hash:(await d.db.getRun(f.parse_run_id!))!.artifact_hash,page:f.page,char_start:f.char_start,char_end:f.char_end,
  value_source_text:f.value_source_text,value_source_sha256:sha256Hex(f.value_source_text!),framed:false,extracted:value,value};
 const replay=(...fields:typeof row[])=>replayFromSnapshot(d,{publication_id:'p',report_id:ex.reportId,snapshot:{fields}} as unknown as PublicationRow);
 return {row,replay};
}
afterEach(()=>{vi.restoreAllMocks();});
describe('strict publication replay',()=>{
 it('rejects a candidate on a different page with the same text and offsets',async()=>{
  const {row,replay}=await publication();
  expect((await replay({...row,page:3})).mismatches).toEqual([{field_id:row.field_id,check:'candidate_missing'}]);
 });
 it.each(['llm:other@registry',`human:${ADMIN_ID}`])('rejects a changed extractor label %s',async extractor=>{
  const {row,replay}=await publication();
  expect((await replay({...row,extractor})).mismatches).toEqual([{field_id:row.field_id,check:'extractor_mismatch'}]);
 });
 it('reports incomplete evidence and excludes it from checked',async()=>{
  const {row,replay}=await publication();
  expect(await replay({...row,char_end:null})).toMatchObject({ok:false,eligible:1,checked:0,mismatches:[{field_id:row.field_id,check:'evidence_incomplete'}]});
 });
 it('rejects a reproduced candidate whose source differs from the frozen source',async()=>{
  const {row,replay}=await publication();
  const build=merge.buildCandidateRows;
  // Isolate source drift from page, span and typed value drift.
  vi.spyOn(merge,'buildCandidateRows').mockImplementation((m,o)=>build(m,o).map(c=>({...c,value_source_text:'changed'})));
  expect((await replay(row)).mismatches).toEqual([{field_id:row.field_id,check:'candidate_source'}]);
 });
 it('counts all eligible rows of a clean publication, including framed and human rows',async()=>{
  const {row,replay}=await publication();
  expect(await replay(row,{...row,field_id:'framed',framed:true},{...row,field_id:'human',extractor:`human:${ADMIN_ID}`,run_id:null},
   {...row,field_id:'absent',status:'absent',page:null,char_start:null,char_end:null})).toMatchObject({eligible:3,checked:3,ok:true,mismatches:[]});
 });
});
