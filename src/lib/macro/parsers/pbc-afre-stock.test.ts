import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {catalogById} from '../catalog';
import {parserFor} from './index';
import {parsePbcAfreStockArticle} from './pbc-afre-stock';

const html=readFileSync(new URL('./fixtures/pbc-afre-stock-2025-08.html',import.meta.url),'utf8');
const julyHtml=readFileSync(new URL('./fixtures/pbc-afre-stock-2025-07.html',import.meta.url),'utf8');
const septemberHtml=readFileSync(new URL('./fixtures/pbc-afre-stock-2026-09.html',import.meta.url),'utf8');
const septemberUrl='https://www.pbc.gov.cn/diaochatongjisi/116219/116225/2026101417073743604/index.html';
const julyUrl='https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/2025092212554883949/index.html';
const receipt={sourceUrl:'https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/5837468/index.html',retrievedAt:'2026-11-08T13:00:00.000Z'};
const bytes=(s:string)=>new TextEncoder().encode(s);
const parse=(s=html,r=receipt)=>parsePbcAfreStockArticle(bytes(s),r);
describe('offline PBOC AFRE stock article candidate',()=>{
 it('reads September month-end stock from the exact verified 2026 combined report',()=>{
  const result=parse(septemberHtml,{sourceUrl:septemberUrl,retrievedAt:'2026-11-09T04:44:45.829Z'});
  expect(result).toMatchObject({seriesId:'CN_AFRE_STOCK_YOY',periodEnd:'2026-09-30',publishedOn:'2026-10-14',
   valueText:'7.1',unit:'percent',revisable:true,sourceUrl:septemberUrl,
   sha256:createHash('sha256').update(bytes(septemberHtml)).digest('hex')});
  expect(septemberHtml.slice(result.valueRange.start,result.valueRange.end)).toBe('7.1');
 });
 it.each([
  ['flow substituted for stock',septemberHtml.replaceAll('社会融资规模存量为','社会融资规模增量为')],
  ['flow heading only',septemberHtml.replace(/<p>初步统计[^<]*<\/p>/,'')],
  ['changed title',septemberHtml.replace('2026年前三季度金融统计数据报告','2026年9月金融统计数据报告')],
  ['changed publication',septemberHtml.replace('2026-10-14','2026-10-15')],
  ['changed month',septemberHtml.replace('2026年9月末','2026年8月末')],
  ['inline stock headline',septemberHtml.replace('同比增长7.1%。','同比<strong>增长</strong>7.1%。')],
  ['strong duplicate stock headline',septemberHtml+'<p><strong>初步统计，2026年9月末社会融资规模存量为468.17万亿元，同比增长7.2%。</strong></p>'],
  ['section-prefixed stock duplicate',septemberHtml+'<p><strong>三、初步统计，2026年9月末社会融资规模存量为468.17万亿元，同比增长7.2%。</strong></p>'],
  ['encoded strong duplicate',septemberHtml+'<p><strong>&#31038;会融资规模存量为468.17万亿元</strong></p>'],
 ])('rejects 2026 %s',(_label,s)=>expect(()=>parse(s,{...receipt,sourceUrl:septemberUrl})).toThrow());
 it('binds the combined report to its exact URL and ignores conflicting receipt metadata',()=>{
  expect(()=>parse(septemberHtml)).toThrow();
  expect(()=>parse(html,{...receipt,sourceUrl:septemberUrl})).toThrow();
  expect(()=>parse(septemberHtml,{...receipt,sourceUrl:septemberUrl+'?alias=1'})).toThrow();
  const result=parsePbcAfreStockArticle(bytes(septemberHtml),{...receipt,sourceUrl:septemberUrl,
   periodEnd:'2026-08-31',valueText:'27.46',unit:'trillion',seriesId:'CN_M2_YOY',available_at:'2026-10-14'} as typeof receipt);
  expect(result).toMatchObject({periodEnd:'2026-09-30',valueText:'7.1',unit:'percent',seriesId:'CN_AFRE_STOCK_YOY'});
  expect(result).not.toHaveProperty('available_at');
 });
 it('reads publisher stock YoY in percent, with month end and separate publication/retrieval provenance',()=>{
  const result=parse();
  expect(result).toMatchObject({seriesId:'CN_AFRE_STOCK_YOY',periodEnd:'2025-08-31',valueText:'8.8',unit:'percent',revisable:true,publishedOn:'2025-09-12',...receipt,sha256:createHash('sha256').update(bytes(html)).digest('hex')});
  expect(html.slice(result.valueRange.start,result.valueRange.end)).toBe('8.8');
 });
 it('reads the verified July report with its original publication date despite a migrated URL',()=>{
  const result=parse(julyHtml,{...receipt,sourceUrl:julyUrl});
  expect(result).toMatchObject({seriesId:'CN_AFRE_STOCK_YOY',periodEnd:'2025-07-31',publishedOn:'2025-08-13',valueText:'9',unit:'percent',sourceUrl:julyUrl,sha256:createHash('sha256').update(bytes(julyHtml)).digest('hex')});
  expect(julyHtml.slice(result.valueRange.start,result.valueRange.end)).toBe('9');
 });
 it.each([
  [julyHtml,julyUrl,'2025-07-31','2025-08-13','9'],
  [html,receipt.sourceUrl,'2025-08-31','2025-09-12','8.8'],
 ])('keeps validated article fields when a receipt carries unrelated admission metadata', (s,sourceUrl,periodEnd,publishedOn,valueText)=>{
  // A structurally compatible receipt can also carry stale downstream fields.
  const widerReceipt={...receipt,sourceUrl,seriesId:'CN_M2_YOY',periodEnd:'2025-09-30',
   valueText:'123',unit:'fraction',revisable:false,publishedOn:'2025-09-22',
   available_at:'2025-08-13T00:00:00Z',availability_basis:'published'};
  const result=parsePbcAfreStockArticle(bytes(s),widerReceipt);
  expect(result).toEqual({seriesId:'CN_AFRE_STOCK_YOY',periodEnd,valueText,unit:'percent',revisable:true,
   publishedOn,sourceUrl,retrievedAt:receipt.retrievedAt,
   sha256:createHash('sha256').update(bytes(s)).digest('hex'),parserVersion:'pbc-afre-stock-article/4',
   valueRange:{start:s.indexOf('同比增长')+'同比增长'.length,end:s.indexOf('同比增长')+'同比增长'.length+valueText.length}});
 });
 it.each([
  ['July bytes under August URL',julyHtml,receipt.sourceUrl],
  ['August bytes under July URL',html,julyUrl],
  ['unverified monthly URL',julyHtml,julyUrl.replace('83949','83948')],
  ['URL query alias',julyHtml,julyUrl+'?month=7'],
  ['changed July publication',julyHtml.replace('2025-08-13','2025-08-14'),julyUrl],
  ['changed August publication',html.replace('2025-09-12','2025-09-13'),receipt.sourceUrl],
  ['migrated path date as publication',julyHtml.replace('2025-08-13','2025-09-22'),julyUrl],
  ['July headline month mismatch',julyHtml.replace('7月末','8月末'),julyUrl],
  ['July flow title',julyHtml.replaceAll('存量','增量'),julyUrl],
  ['July duplicate headline',julyHtml+'<p>初步统计，2025年7月末社会融资规模存量为431.26万亿元，同比增长8.8%。</p>',julyUrl],
  ['July encoded duplicate',julyHtml+'<p>初步统计，2025年7月末&#31038;会融资规模存量为431.26万亿元，同比增长8.8%。</p>',julyUrl],
 ])('rejects %s',(_label,s,sourceUrl)=>expect(()=>parse(s,{...receipt,sourceUrl})).toThrow());
 it('uses the headline rather than component growth or a recomputation from balances',()=>{
  expect(parse(html.replace('8.8%。','8.8%。其中，人民币贷款余额同比增长6.6%。')).valueText).toBe('8.8');
  expect(parse(html.replace('433.66','433.65')).valueText).toBe('8.8');
 });
 it('retains changed values as distinct evidence without assigning ingest versions or backdating availability',()=>{
  const original=parse(),revision=parse(html.replace('8.8%','8.7%'),{...receipt,retrievedAt:'2026-11-09T13:00:00.000Z'});
  expect(revision.valueText).toBe('8.7');expect(revision.sha256).not.toBe(original.sha256);
  expect(revision.retrievedAt).toBe('2026-11-09T13:00:00.000Z');expect(revision.publishedOn).toBe(original.publishedOn);
 });
 it('ignores commented/script markup while preserving evidence offsets',()=>{
  const s='<!-- <p>社会融资规模存量为0</p> --><script>\"<p>社会融资规模存量为0</p>\"</script>'+html;
  const result=parse(s);expect(s.slice(result.valueRange.start,result.valueRange.end)).toBe('8.8');
 });
 it('locates value in paragraph text even with a growth-label attribute',()=>{
  const s=html.replace('<p>','<p title=\"同比增长\">');const result=parse(s);
  expect(s.slice(result.valueRange.start,result.valueRange.end)).toBe('8.8');
 });
 it('supports explicit headline decline without changing percent units',()=>{
  expect(parse(html.replace('同比增长8.8','同比下降0.8')).valueText).toBe('-0.8');
 });
 it.each([
  ['pseudo metadata',html.replace('name=\"ArticleTitle\"','data-name=\"ArticleTitle\"')],
  ['pseudo content',html.replace('content=\"2025年','data-content=\"2025年')],
  ['encoded duplicate',html+'<p>初步统计，2025年8月末&#31038;会融资规模存量为433.66万亿元，同比增长9.1%。</p>'],
  ['inline duplicate',html+'<p>初步统计，2025年8月末社会<span>融资</span>规模存量为433.66万亿元，同比增长9.1%。</p>'],
  ['flow',html.replaceAll('存量','增量')],
  ['month mismatch',html.replace('2025年8月末','2025年7月末')],
  ['different article period',html.replaceAll('8月','9月')],
  ['invalid month',html.replaceAll('8月','13月')],
  ['component only',html.replace('社会融资规模存量为','人民币贷款余额为')],
  ['unit mismatch',html.replace('万亿元','亿元')],
  ['percentage points',html.replace('8.8%','8.8个百分点')],
  ['missing value',html.replace('8.8','--')],
  ['ambiguous headline',html+'<p>初步统计，2025年8月末社会融资规模存量为433.66万亿元，同比增长9.1%。</p>'],
  ['duplicate metadata',html+'<meta name="PubDate" content="2025-09-13">'],
  ['impossible publication',html.replace('2025-09-12','2025-02-30')],
  ['publication before period',html.replace('2025-09-12','2025-07-12')],
  ['encoded markup',html.replace('同比增长','同比<span>增长</span>')],
 ])('rejects %s',(_label,s)=>expect(()=>parse(s)).toThrow());
 it('rejects unverified origins, future publication relative to retrieval, malformed encoding and oversized inputs',()=>{
  expect(()=>parse(html,{...receipt,sourceUrl:receipt.sourceUrl.replace('www.pbc.gov.cn','evil.example')})).toThrow();
  expect(()=>parse(html,{...receipt,retrievedAt:'2025-09-11T00:00:00.000Z'})).toThrow();
  expect(()=>parse(html,{...receipt,retrievedAt:'yesterday'})).toThrow();
  expect(()=>parsePbcAfreStockArticle(new Uint8Array([255]),receipt)).toThrow();
  expect(()=>parse(' '.repeat(262145))).toThrow();
 });
 it('remains missing and disconnected from the active parser registry',()=>{
  expect(catalogById('CN_AFRE_STOCK_YOY')?.status).toBe('missing');
  expect(parserFor('CN_AFRE_STOCK_YOY')).toBeNull();
 });
});
