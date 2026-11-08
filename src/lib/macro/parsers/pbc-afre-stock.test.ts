import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {catalogById} from '../catalog';
import {parserFor} from './index';
import {parsePbcAfreStockArticle} from './pbc-afre-stock';

const html=readFileSync(new URL('./fixtures/pbc-afre-stock-2025-08.html',import.meta.url),'utf8');
const receipt={sourceUrl:'https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/5837468/index.html',retrievedAt:'2026-11-08T13:00:00.000Z'};
const bytes=(s:string)=>new TextEncoder().encode(s);
const parse=(s=html,r=receipt)=>parsePbcAfreStockArticle(bytes(s),r);
describe('offline PBOC AFRE stock article candidate',()=>{
 it('reads publisher stock YoY in percent, with month end and separate publication/retrieval provenance',()=>{
  const result=parse();
  expect(result).toMatchObject({seriesId:'CN_AFRE_STOCK_YOY',periodEnd:'2025-08-31',valueText:'8.8',unit:'percent',revisable:true,publishedOn:'2025-09-12',...receipt,sha256:createHash('sha256').update(bytes(html)).digest('hex')});
  expect(html.slice(result.valueRange.start,result.valueRange.end)).toBe('8.8');
 });
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
