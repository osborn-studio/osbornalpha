// C7 private server-side snippet slicing and approval (spec §4.7).
import {beforeEach,describe,expect,it} from 'vitest';
import {runExtract} from './extract/run';
import {PAGES} from './fixtures/pipeline';
import {runParse} from './parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {MemoryDeps} from './testing';
import {approveSnippet,createSnippet,rejectSnippet} from './snippets';
async function ready(d:MemoryDeps,patch={}){const l=await seedLicence(d.db,{patch}),doc=await seedDocument(d,l.licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});return (await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).reportId;}
const at=(t:string)=>{const s=PAGES[0].indexOf(t);return {page:1,charStart:s,charEnd:s+t.length};};
describe('snippets',()=>{let d:MemoryDeps;beforeEach(()=>{d=memoryBrokerDeps();});
 it('slices on the server and approves',async()=>{const id=await ready(d),s=await createSnippet(d,id,{purpose:'rating',targetKey:null,fieldId:null,...at('Rating: Overweight')},ADMIN_ID);expect(await d.db.getSnippet(s.snippetId)).toMatchObject({text:'Rating: Overweight',status:'draft'});await approveSnippet(d,s.snippetId,ADMIN_ID);expect((await d.db.getSnippet(s.snippetId))!.status).toBe('approved');});
 it('validates length, page, span and supplied verbatim text',async()=>{const id=await ready(d,{snippet_max_chars:10}),base={purpose:'risk' as const,targetKey:null,fieldId:null};await expect(createSnippet(d,id,{...base,...at('Rating: Overweight')},ADMIN_ID)).rejects.toMatchObject({code:'snippet_too_long'});await expect(createSnippet(d,id,{...base,page:9,charStart:0,charEnd:2},ADMIN_ID)).rejects.toMatchObject({code:'snippet_page'});await expect(createSnippet(d,id,{...base,page:1,charStart:PAGES[0].length-2,charEnd:PAGES[0].length+2},ADMIN_ID)).rejects.toMatchObject({code:'snippet_cross_page'});await expect(createSnippet(d,id,{...base,...at('Rating'),text:'Rizks'},ADMIN_ID)).rejects.toMatchObject({code:'snippet_not_verbatim'});});
 it('rejects restricted target value on approval',async()=>{const id=await ready(d,{allows_public_target_price:false}),s=await createSnippet(d,id,{purpose:'target',targetKey:null,fieldId:null,...at('Price target: US$120.00')},ADMIN_ID);await expect(approveSnippet(d,s.snippetId,ADMIN_ID)).rejects.toMatchObject({code:'restricted_value',status:409});expect((await d.db.getSnippet(s.snippetId))!.status).toBe('rejected');await rejectSnippet(d,s.snippetId,ADMIN_ID);});
 it('rejects percent-suffixed target price at approval',async()=>{const id=await ready(d,{allows_public_target_price:false}),doc=await d.db.getDocument((await d.db.getReport(id))!.document_id);const snippetId=await d.db.insertSnippet({report_id:id,target_key:null,purpose:'target',parse_run_id:doc!.current_parse_run_id!,page:1,char_start:0,char_end:15,text:'120% fair value',field_id:null,disclosure_check:null,created_by:ADMIN_ID});await expect(approveSnippet(d,snippetId,ADMIN_ID)).rejects.toMatchObject({code:'restricted_value',status:409});expect((await d.db.getSnippet(snippetId))!.status).toBe('rejected');});
});
