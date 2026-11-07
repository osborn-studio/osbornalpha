// src/lib/documents/extract/pages-json.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {assemblePage,buildPagesJson,cpLength,cpSlice,normalizeText,pageInsertsOf,parseRecordedFixture,serializePagesJson,sha256Hex} from './pages-json';
import {EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from '../types';
import type {PageLayout} from '../types';

const SHA='a'.repeat(64);
const piece=(text:string,x0:number,spaceBefore=false)=>({text,x0,x1:x0+10,y:100,h:10,spaceBefore});
const page=(no:number,t:string):PageLayout=>{const {text,lines}=assemblePage(t?[{y:1,pieces:[piece(t,0)]}]:[]);return {page_no:no,width:612,height:792,text,lines,tables:[]};};

describe('code points',()=>{
 it('cpLength / cpSlice count 𠀋 and 😀 as one each, unlike UTF-16 length/slice',()=>{
  const s='𠀋😀 Revenue';
  expect(cpLength(s)).toBe(10);
  expect(s.length).toBe(12);
  expect(cpSlice(s,3,10)).toBe('Revenue');
  expect(cpSlice(s,0,1)).toBe('𠀋');
  expect(cpSlice(s,1,2)).toBe('😀');
 });
 it('normalizeText: NFKC, whitespace folded (U+3000, NBSP, tabs), trimmed',()=>{
  expect(normalizeText('　ＡＢＣ\t  １２３ ﬁ ')).toBe('ABC 123 fi');
  expect(normalizeText(' \n ')).toBe('');
 });
});

describe('normalizeText review fixes',()=>{
 it('strips C0 controls except whitespace and replaces lone surrogates with U+FFFD',()=>{
  expect(normalizeText('a\u0000b\u0007c\u001fd\te\nf\u007f')).toBe('abcd e f');
  expect(normalizeText('x\ud800y\udc00z')).toBe('x\ufffdy\ufffdz');
  expect(normalizeText('𠀋😀')).toBe('𠀋😀');   // a valid pair is kept
 });
});

describe('canonical serialisation',()=>{
 it('sorts keys at every level, so construction order does not change bytes or hash',()=>{
  const a={...page(1,'x'),lines:page(1,'x').lines};
  const reordered=JSON.parse(JSON.stringify(a,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v)) as PageLayout;
  const x=buildPagesJson({content_sha256:SHA,code_version:'c',has_text_layer:true,pages:[a]});
  const y=buildPagesJson({content_sha256:SHA,code_version:'c',has_text_layer:true,pages:[reordered]});
  expect(y.sha256).toBe(x.sha256);
  expect(new TextDecoder().decode(x.bytes).startsWith('{"code_version"')).toBe(true);
  expect(new TextDecoder().decode(x.bytes)).toContain('"items":[{"char_end":1,"char_start":0,');
 });
});

describe('assemblePage',()=>{
 it('records page offsets while concatenating; rows joined by \\n, spaceBefore only between pieces',()=>{
  const {text,lines}=assemblePage([{y:200,pieces:[piece('𠀋😀',0,true),piece('Revenue',30,true)]},{y:180,pieces:[]},{y:150,pieces:[piece('Total',0),piece('1,234',50)]}]);
  expect(text).toBe('𠀋😀 Revenue\nTotal1,234');
  expect(lines.map(l=>[l.index,l.char_start,l.char_end,l.x0,l.x1])).toEqual([[0,0,10,0,40],[1,11,21,0,60]]);
  expect(lines[0].items.map(i=>[i.char_start,i.char_end])).toEqual([[0,2],[3,10]]);
 });
});

describe('buildPagesJson / pageInsertsOf',()=>{
 it('stamps the versions, hashes the exact serialised bytes, and is deterministic',()=>{
  const a=buildPagesJson({content_sha256:SHA,code_version:'c'.repeat(40),has_text_layer:true,pages:[page(1,'𠀋😀 Revenue'),page(2,'')]});
  const b=buildPagesJson({content_sha256:SHA,code_version:'c'.repeat(40),has_text_layer:true,pages:[page(1,'𠀋😀 Revenue'),page(2,'')]});
  expect(a.json).toMatchObject({extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,content_sha256:SHA,has_text_layer:true});
  expect(a.sha256).toBe(createHash('sha256').update(a.bytes).digest('hex'));
  expect(a.sha256).toBe(b.sha256);
  expect(new TextDecoder().decode(a.bytes)).toBe(serializePagesJson(a.json));
  expect(sha256Hex(new TextEncoder().encode(serializePagesJson(JSON.parse(new TextDecoder().decode(a.bytes)))))).toBe(a.sha256);   // parse → serialise is byte-stable
 });
 it('page rows: char_count in code points, text_hash = sha256(utf8(text)), line_count, has_tables',()=>{
  const {json}=buildPagesJson({content_sha256:SHA,code_version:'x',has_text_layer:true,pages:[page(1,'𠀋😀 Revenue'),page(2,'')]});
  const rows=pageInsertsOf(json);
  expect(rows[0]).toEqual({page_no:1,text:'𠀋😀 Revenue',text_hash:createHash('sha256').update('𠀋😀 Revenue','utf8').digest('hex'),char_count:10,width:612,height:792,line_count:1,has_tables:false});
  expect(rows[1]).toMatchObject({page_no:2,text:'',char_count:0,line_count:0});
 });
});

describe('parseRecordedFixture',()=>{
 it('returns the pages.json bytes and hash a test uses as the extraction output; rejects inconsistent headers',()=>{
  const {json,sha256}=buildPagesJson({content_sha256:SHA,code_version:'x',has_text_layer:true,pages:[page(1,'a')]});
  const file={recorded_at:'2026-11-06T00:00:00.000Z',source_url:'https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf',source_ref:'2026090300863_c',content_sha256:SHA,bytes:1,page_count:1,extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,pages_json:json};
  expect(parseRecordedFixture(JSON.stringify(file,null,1)).pagesJsonSha256).toBe(sha256);
  expect(()=>parseRecordedFixture(JSON.stringify({...file,page_count:2}))).toThrow('invalid_fixture');
  expect(()=>parseRecordedFixture(JSON.stringify({...file,content_sha256:'b'.repeat(64)}))).toThrow('invalid_fixture');
  // --pages subset: page_count describes the whole PDF, stored pages keep their numbers
  expect(()=>parseRecordedFixture(JSON.stringify({...file,extractor_version:'docs-extract/0.9'}))).toThrow('invalid_fixture');
  expect(()=>parseRecordedFixture(JSON.stringify({...file,table_algo_version:'tables/0.1'}))).toThrow('invalid_fixture');
  expect(()=>parseRecordedFixture(JSON.stringify({...file,pages_json:{...json,extractor_version:'other'}}))).toThrow('invalid_fixture');
  expect(parseRecordedFixture(JSON.stringify({...file,page_count:84,pages_subset:true})).fixture.page_count).toBe(84);
  expect(()=>parseRecordedFixture(JSON.stringify({...file,page_count:0,pages_subset:true}))).toThrow('invalid_fixture');
 });
});
