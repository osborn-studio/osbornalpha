// src/lib/documents/citations.test.ts
import {describe,expect,it} from 'vitest';
import {cite,citationView,integrityOf,verify} from './citations';
import {memoryDocumentsDb} from './memory-documents-db';
import {seedExtraction,seedPublicDocument,seedUpload,withOverride,OWNER_A} from './test-seed';
import {DocumentsDbError} from './types';
import type {DocumentsDb} from './types';

const PAGE1='𠀋😀 Revenue 1,234\nCost (100)';
const bytes=(s:string)=>new TextEncoder().encode(s);
async function setup(){
 const db=memoryDocumentsDb();
 const doc=await seedPublicDocument(db,bytes('%PDF-a'));
 const ext=await seedExtraction(db,doc,[PAGE1,'第二頁'],{extractorVersion:'docs-extract/0.9'});
 return {db,doc,ext};
}
const base=(doc:string,ext:string)=>({document_id:doc,extraction_id:ext,page_no:1,created_by:'extractor' as const,created_ref:'hk-facts/1/hk-facts/1.0'});
const code=async(p:Promise<unknown>)=>{try{await p;return null;}catch(e){return e instanceof DocumentsDbError?e.code:String(e);}};

describe('cite',()=>{
 it('slices code points: 3..10 is "Revenue" although the UTF-16 index of R is 5',async()=>{
  const {db,doc,ext}=await setup();
  const id=await cite(db,{...base(doc,ext),char_start:3,char_end:10});
  const c=(await db.citationById(id))!;
  expect(c).toMatchObject({snippet:'Revenue',char_start:3,char_end:10,page_no:1,visibility:'internal',bbox:null});
  expect(PAGE1.indexOf('Revenue')).toBe(5);
  const [page]=await db.pagesOf(ext,[1]);
  expect(c.text_hash).toBe(page.text_hash);
  expect((await db.citationById(await cite(db,{...base(doc,ext),char_start:0,char_end:2})))!.snippet).toBe('𠀋😀');
 });
 it('rejects out-of-range, empty or whitespace-only spans, a missing page and a foreign extraction',async()=>{
  const {db,doc,ext}=await setup();
  const len=Array.from(PAGE1).length;
  expect(await code(cite(db,{...base(doc,ext),char_start:0,char_end:len+1}))).toBe('invalid_citation');
  expect(await code(cite(db,{...base(doc,ext),char_start:5,char_end:5}))).toBe('invalid_citation');
  expect(await code(cite(db,{...base(doc,ext),char_start:-1,char_end:2}))).toBe('invalid_citation');
  expect(await code(cite(db,{...base(doc,ext),char_start:2,char_end:3}))).toBe('invalid_citation');   // ' '
  expect(await code(cite(db,{...base(doc,ext),page_no:9,char_start:0,char_end:1}))).toBe('invalid_citation');
  const other=await seedPublicDocument(db,bytes('%PDF-b'),{source_ref:'2026090300864_c'});
  expect(await code(cite(db,{...base(other,ext),char_start:0,char_end:1}))).toBe('invalid_citation');
  expect(await cite(db,{...base(doc,ext),char_start:0,char_end:len})).toMatch(/^[0-9a-f-]{36}$/);
 });
});

describe('verify / citationView',()=>{
 it('ok and current; after a re-extraction the old citation stays ok but is no longer current',async()=>{
  const {db,doc,ext}=await setup();
  const id=await cite(db,{...base(doc,ext),char_start:3,char_end:10,bbox:{x0:1,y0:2,x1:3,y1:4}});
  expect(await verify(db,id)).toEqual({integrity:'ok',currentExtraction:true});
  await db.requestExtract(doc,OWNER_A);
  const ext2=await seedExtraction(db,doc,[PAGE1]);
  expect(ext2).not.toBe(ext);
  expect(await verify(db,id)).toEqual({integrity:'ok',currentExtraction:false});
  const view=(await citationView(db,(await db.citationById(id))!))!;
  expect(view).toMatchObject({citationId:id,documentId:doc,extractionId:ext,pageNo:1,charStart:3,charEnd:10,bbox:{x0:1,y0:2,x1:3,y1:4},snippet:'Revenue',integrity:'ok',currentExtraction:false,createdBy:'extractor',
   document:{title:'2025 年報',sourceUrl:expect.stringContaining('hkexnews'),publishedAt:'2026-09-03T08:30:00.000Z',availableAt:'2026-09-03T08:30:00.000Z',docClass:'annual_report',language:'zh'}});
  expect(await verify(db,'00000000-0000-4000-8000-000000000000')).toBeNull();
 });
 it('corrupt when the stored page text no longer hashes to the recorded text_hash or no longer slices to the snippet',async()=>{
  const {db,doc,ext}=await setup();
  const id=await cite(db,{...base(doc,ext),char_start:3,char_end:10});
  const tampered=withOverride<DocumentsDb>(db,{pagesOf:async(e,n)=>(await db.pagesOf(e,n)).map(p=>({...p,text:p.text.replace('Revenue','Revenux')}))});
  expect(await verify(tampered,id)).toEqual({integrity:'corrupt',currentExtraction:true});
  const c=(await db.citationById(id))!;
  expect(integrityOf(undefined,c)).toBe('corrupt');
 });
 it('citationView is null when the document is not visible through the given db',async()=>{
  const {db,doc,ext}=await setup();
  const c=(await db.citationById(await cite(db,{...base(doc,ext),char_start:3,char_end:10})))!;
  expect(await citationView(withOverride<DocumentsDb>(db,{documentById:async()=>null}),c)).toBeNull();
 });
});

describe('publish_citations (contract behaviour the read routes rely on)',()=>{
 it('only human/module citations of public documents can be made public',async()=>{
  const {db,doc,ext}=await setup();
  const extractor=await cite(db,{...base(doc,ext),char_start:3,char_end:10});
  const human=await cite(db,{...base(doc,ext),char_start:3,char_end:10,created_by:'human',created_ref:OWNER_A});
  expect(await code(db.publishCitations([extractor]))).toBe('not_publishable');
  expect(await db.publishCitations([human])).toBe(1);
  expect((await db.citationById(human))!.visibility).toBe('public');
  const up=await seedUpload(db,OWNER_A,bytes('%PDF-up'));
  const upExt=await seedExtraction(db,up,['licensed text']);
  const mine=await cite(db,{document_id:up,extraction_id:upExt,page_no:1,char_start:0,char_end:8,created_by:'module',created_ref:'foreign-research'});
  expect(await code(db.publishCitations([mine]))).toBe('not_publishable');
 });
});
