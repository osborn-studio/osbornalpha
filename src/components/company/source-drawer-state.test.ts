import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {citationCurrency,readSignedFile,selectCitation,verifyPage,validDetail} from './source-drawer-state';
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const document={documentId:'d',issuerId:'i',source:'edgar',sourceRef:'r',sourceVersion:1,availableDate:'2026-04-01',currentExtractionId:'e2'};
const detail={documentId:'d',issuerId:'i',source:'edgar',sourceRef:'r',sourceVersion:1,availableDate:'2026-04-01',currentExtractionId:'e2',status:'extracted'};
const citation={citationId:'c1',documentId:'d',extractionId:'e1',pageNo:1};
describe('source drawer evidence gates',()=>{
 it('validates every binding field against detail',()=>{
  expect(validDetail(document,detail)).toBe(true);
  expect(validDetail(document,{...detail,sourceVersion:2})).toBe(false);
  expect(validDetail(document,{...detail,status:'extract_failed'})).toBe(false);
 });
 it('requires exactly one citation for the bound document',()=>{
  expect(selectCitation([citation], 'd')).toEqual({status:'ok',citation});
  expect(selectCitation([], 'd')).toEqual({status:'missing'});
  expect(selectCitation([citation,{...citation,citationId:'c2'}], 'd')).toEqual({status:'ambiguous'});
 });
 it('checks both stored citation hash and page route hash against freshly hashed text',async()=>{
  const page={documentId:'d',extractionId:'e1',pageNo:1,text:'abc',textHash:hash('abc')};
  expect(await verifyPage(page,{...citation,textHash:hash('abc'),snippet:'b',charStart:1,charEnd:2,integrity:'ok'},async t=>hash(t))).toBe('ok');
  expect(await verifyPage(page,{...citation,textHash:hash('other'),snippet:'b',charStart:1,charEnd:2,integrity:'ok'},async t=>hash(t))).toBe('failed');
  expect(await verifyPage(page,{...citation,textHash:hash('abc'),snippet:'b',charStart:1,charEnd:2,integrity:'ok'},async()=>{throw Error('digest failed');})).toBe('failed');
 });
 it('labels an older extraction superseded and never current',()=>{
  expect(citationCurrency({extractionId:'e1',currentExtraction:false},'e2')).toBe('superseded');
  expect(citationCurrency({extractionId:'e1',currentExtraction:true},'e2')).toBe('invalid');
 });
 it('consumes the file route signed URL JSON and classifies login and failures',async()=>{
  const future='2030-01-01T00:05:00Z';
  expect(await readSignedFile(new Response(JSON.stringify({url:'https://files.example/a',expiresAt:future}),{status:200}),Date.parse('2030-01-01T00:00:00Z'))).toEqual({status:'ok',url:'https://files.example/a'});
  expect(await readSignedFile(new Response(null,{status:401}),0)).toEqual({status:'login'});
  expect(await readSignedFile(new Response(null,{status:404}),0)).toEqual({status:'failed'});
  expect(await readSignedFile(new Response(JSON.stringify({url:'https://files.example/a',expiresAt:'2000-01-01T00:00:00Z'}),{status:200}),Date.now())).toEqual({status:'failed'});
 });
});
