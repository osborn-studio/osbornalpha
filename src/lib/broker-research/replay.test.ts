// src/lib/broker-research/replay.test.ts
import {describe,expect,it} from 'vitest';
import {replayFromSnapshot} from './replay';
import {effectiveValue} from './effective';
import {runExtract} from './extract/run';
import {sha256Hex} from './hash';
import {runParse} from './parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {FieldRow,PublicationRow} from './types';

/** Snapshot rows in the shape broker_report_publish writes (A2): spans, artifact_hash, frozen source text + its hash,
 * framing provenance, the extracted and the effective value. */
const snap=(f:FieldRow,artifactHash:string|null,status=f.status)=>({field_id:f.field_id,target_key:f.target_key,field:f.field,occurrence:f.occurrence,status,extractor:f.extractor,
 parse_run_id:f.parse_run_id,run_id:f.run_id,artifact_hash:artifactHash,page:f.page,char_start:f.char_start,char_end:f.char_end,
 value_source_text:f.value_source_text,value_source_sha256:f.value_source_text===null?null:sha256Hex(f.value_source_text),framed:f.detail.framed===true,
 extracted:{value_text:f.value_text,value_num:f.value_num,value_currency:f.value_currency,value_unit:f.value_unit,value_date:f.value_date},value:effectiveValue(f)});
async function extracted(){
 const d=memoryBrokerDeps();const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
 await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
 const ex=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
 const run=(await d.db.getRun(ex.runId))!;const parse=(await d.db.getRun(run.parse_run_id!))!;
 const rows=(await d.db.listFields(ex.reportId)).filter(f=>f.status==='extracted');
 const pub={publication_id:'p',report_id:ex.reportId,snapshot:{report:{report_id:ex.reportId},fields:rows.map(f=>snap(f,parse.artifact_hash,'confirmed'))},snapshot_hash:'h'} as unknown as PublicationRow;
 return {d,ex,parse,rows,pub};
}
describe('replayFromSnapshot',()=>{
 it('rebuilds candidates from stored responses and verifies every span against the artifact; flags a shifted span',async()=>{
  const {d,ex,parse,rows,pub}=await extracted();
  const ok=await replayFromSnapshot(d,pub);
  expect(ok.mismatches).toEqual([]);expect(ok.ok).toBe(true);expect(ok.checked).toBe(rows.length);
  const shifted={...snap(rows[0],parse.artifact_hash,'confirmed'),char_start:rows[0].char_start!+1};
  const r=await replayFromSnapshot(d,{...pub,snapshot:{report:{report_id:ex.reportId},fields:[shifted]}} as unknown as PublicationRow);
  expect(r.ok).toBe(false);expect(r.mismatches[0]).toMatchObject({field_id:rows[0].field_id,check:'span_verbatim'});
 const tampered={...snap(rows[0],parse.artifact_hash,'confirmed'),value_source_sha256:'0'.repeat(64)};
 expect((await replayFromSnapshot(d,{...pub,snapshot:{report:{report_id:ex.reportId},fields:[tampered]}} as unknown as PublicationRow)).mismatches[0]).toMatchObject({check:'snapshot_source'});
 });
 it('detects a changed typed candidate value in the frozen snapshot',async()=>{
  const {d,ex,parse,rows,pub}=await extracted();
  const numeric=rows.find(f=>f.value_num!==null)!;
  const row=snap(numeric,parse.artifact_hash,'confirmed');
  const altered={...row,extracted:{...row.extracted,value_num:'999999'}};
  const result=await replayFromSnapshot(d,{...pub,snapshot:{report:{report_id:ex.reportId},fields:[altered]}} as unknown as PublicationRow);
 expect(result.mismatches).toContainEqual({field_id:numeric.field_id,check:'candidate_value'});
 });
 it('reports an unreadable stored response as a mismatch',async()=>{
  const {d,ex,rows,pub}=await extracted();
  const run=(await d.db.getRun(rows[0].run_id!))!;
  d.storage.objects.set(run.response_path!,{bytes:new TextEncoder().encode('{'),contentType:'application/json'});
  const result=await replayFromSnapshot(d,pub);
  expect(result.ok).toBe(false);
  expect(result.mismatches).toContainEqual({field_id:rows[0].field_id,check:'response_unreadable'});
  expect(ex.reportId).toBe(pub.report_id);
 });
 it('does not silently skip a malformed stored call during replay',async()=>{
  const {d,rows,pub}=await extracted();const run=(await d.db.getRun(rows[0].run_id!))!;
  const raw=JSON.parse(d.storage.text(run.response_path!)!) as {calls:{content:string|null}[]};
  raw.calls.push({content:'not json'});
  d.storage.objects.set(run.response_path!,{bytes:new TextEncoder().encode(JSON.stringify(raw)),contentType:'application/json'});
  const result=await replayFromSnapshot(d,pub);
  expect(result.mismatches).toContainEqual({field_id:rows[0].field_id,check:'response_unreadable'});
 });
 it('reports a malformed response envelope as unreadable',async()=>{
  const {d,rows,pub}=await extracted();const run=(await d.db.getRun(rows[0].run_id!))!;
  d.storage.objects.set(run.response_path!,{bytes:new TextEncoder().encode('{"calls":{}}'),contentType:'application/json'});
  expect((await replayFromSnapshot(d,pub)).mismatches).toContainEqual({field_id:rows[0].field_id,check:'response_unreadable'});
 });
 it('replays an old publication from its snapshot only: editing the same field afterwards (new span, framed) changes nothing (P-R1-10)',async()=>{
  const {d,ex,rows,pub}=await extracted();
  const before=await replayFromSnapshot(d,pub);expect(before.ok).toBe(true);
  // the next revision edits the same live row: different span + framing provenance (allowed on a draft)
  const f=rows.find(x=>x.char_start!==null&&x.char_end!==null&&x.char_end-x.char_start>1)!;
  await d.db.fieldReview(f.field_id,'confirm',{page:f.page,char_start:f.char_start!,char_end:f.char_end!-1,value_source_text:f.value_source_text!.slice(0,-1),detail:{framed:true}},ADMIN_ID);
  expect((await d.db.listFields(ex.reportId)).find(x=>x.field_id===f.field_id)).toMatchObject({char_end:f.char_end!-1,detail:expect.objectContaining({framed:true})});
  const after=await replayFromSnapshot(d,pub);
  expect(after).toEqual(before);
 });
});
