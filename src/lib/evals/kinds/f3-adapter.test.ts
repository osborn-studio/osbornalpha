import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import type {DocumentsDb} from '@/lib/documents/types';
import {adaptF3Document,toExtractionOutput} from './f3-adapter';
import {evaluateExtraction} from './extraction';

const sha='a'.repeat(64);
const doc={document_id:'d',source:'hkexnews',source_ref:'r',source_version:1,content_sha256:sha,permission:'public',status:'extracted',current_extraction_id:'e',mime:'application/pdf'};
const ext={extraction_id:'e',document_id:'d',page_count:1,has_text_layer:true};
const page={extraction_id:'e',page_no:1,text:'Revenue 123',text_hash:createHash('sha256').update('Revenue 123').digest('hex'),height:842,width:595};
const citation={citation_id:'c',document_id:'d',extraction_id:'e',page_no:1,char_start:8,char_end:11,snippet:'123',text_hash:createHash('sha256').update('Revenue 123').digest('hex'),bbox:{x0:10,y0:100,x1:30,y1:110}};
const candidate={candidate_id:'k',document_id:'d',extraction_id:'e',kind:'financial_fact',status:'confirmed',payload:{concept:'revenue',value:'123'},citations:{value:'c'}};
function fake(over:Record<string,unknown>={}):DocumentsDb{return {documentById:async()=>doc,documentVersions:async()=>({rows:[],nextCursor:null}),extractionById:async()=>ext,pagesOf:async()=>[page],candidatesOf:async()=>({rows:[candidate],nextCursor:null}),citationsByIds:async()=>[citation],...over} as unknown as DocumentsDb;}

describe('F3 extraction adapter',()=>{
 it('keeps the candidate value and one-based page, and flips PDF bottom-left Y to top-left',async()=>{
  expect(await adaptF3Document(fake(),'d')).toEqual({status:'parsed',document_sha256:sha,fields:[{field:'revenue',value:'123',page:1,bbox:[10,732,30,742]}]});
 });
 it('excludes private and superseded documents',async()=>{
  expect(await adaptF3Document(fake({documentById:async()=>({...doc,permission:'private'})}),'d')).toMatchObject({status:'excluded',reason:'permission'});
  expect(await adaptF3Document(fake({documentVersions:async()=>({rows:[{...doc,document_id:'new',source_version:2}],nextCursor:null})}),'d')).toMatchObject({status:'excluded',reason:'superseded'});
 });
 it('marks a missing page as whole-document read_error',async()=>{
  const row=await adaptF3Document(fake({pagesOf:async()=>[]}),'d');
  expect(row).toMatchObject({status:'read_error',reason:'missing_page'});
  const output=toExtractionOutput(row)!;
  expect(evaluateExtraction({documents:[{document_sha256:sha,page_count:1,bbox_space:'pdf_points_top_left'}],labels:[{label_id:'l',document_sha256:sha,field:'revenue',occurrence:1,value_type:'decimal',value:'123',locator:{page:1,bbox:[10,732,30,742]},recorded_by:'test',reviewed_by:'test'}]},[output]).cases[0].outcome.result).toBe('read_error');
 });
});
