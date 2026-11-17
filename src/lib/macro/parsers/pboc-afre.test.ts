// WP-D Task 3: offline PBOC stock-table excerpts, A3 layout, and fail-closed cells.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import iconv from 'iconv-lite';
import {describe,expect,it} from 'vitest';
import {canonical} from '../decimal';
import {monthEnd} from '../periods';
import {htmlTables} from './html-table';
import {parsePbcAfreStockArticle} from './pbc-afre-stock';
import {PBOC_AFRE_PARSER_VERSION,PbocAfreParseError,afreDecoderLabel,parseAfreStockYoy} from './pboc-afre';

const FIX=join(process.cwd(),'src/lib/macro/fixtures/cn-http');
const manifest=JSON.parse(readFileSync(join(FIX,'manifest.json'),'utf8')) as {files:{file:string;excerpt_sha256:string}[]};
const S={seriesId:'CN_AFRE_STOCK_YOY'};
const utf=(s:string)=>new TextEncoder().encode(s);
const bytesOf=(file:string)=>{
 const b=new Uint8Array(readFileSync(join(FIX,file)));
 expect(createHash('sha256').update(b).digest('hex')).toBe(manifest.files.find(f=>f.file===file)?.excerpt_sha256);
 return b;
};
const codeOf=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return (e as {code?:string}).code??String(e);}};
const doc=(months:string[],growth:string[],opts:{title?:string;sub?:string[];stock?:string;extra?:string;prefix?:string}={})=>utf(`<html><head><meta charset="utf-8"></head><body><table>
<tr><td>${opts.title??'社会融资规模存量统计表'}</td></tr>
<tr><td></td>${months.map(m=>`<td>${m}</td>`).join('')}</tr>
<tr><td>项目</td>${(opts.sub??months.flatMap(()=>['存量','增速（%）'])).map(c=>`<td>${c}</td>`).join('')}</tr>
<tr><td>${opts.stock??'社会融资规模存量 AFRE（stock）'}</td>${(opts.prefix??'')}${growth.flatMap(g=>['<td>100</td>',`<td>${g}</td>`]).join('')}</tr>${opts.extra??''}</table></body></html>`);
const pairs=(b:Uint8Array)=>parseAfreStockYoy(b,S).map(p=>[p.periodEnd,p.valueText]);

describe('PBOC AFRE stock table excerpts',()=>{
 it.each([
  [2015,'gb18030',[['2015-03-31','13.1'],['2015-06-30','12'],['2015-09-30','12.5'],['2015-12-31','12.5']]],
  [2019,'utf-8',['10.9','10.6','11.2','10.8','11','11.2','10.8','10.7','10.7','10.6','10.7','10.7'].map((v,i)=>[monthEnd(2019,i+1),v])],
  [2024,'gb18030',['9.5','9','8.7','8.3','8.4','8.1','8.2','8.1','8','7.8','7.8','8'].map((v,i)=>[monthEnd(2024,i+1),v])],
  [2026,'gb18030',['8.2','8.2','7.9','7.8','7.7','7.4','7.4','7.2','7.1'].map((v,i)=>[monthEnd(2026,i+1),v])],
 ] as const)('reads %i exact periods and growth values', (year,label,expected)=>{
  const b=bytesOf(`CN_AFRE_STOCK-${year}.htm`);
  expect(afreDecoderLabel(b)).toBe(label);
  expect(pairs(b)).toEqual(expected);
  const points=parseAfreStockYoy(b,S);
  const tables=htmlTables(new TextDecoder(label,{fatal:true}).decode(b));
  const p=points[points.length-1],l=p.locator;
  if(l.kind!=='html_cell')throw new Error('locator');
  expect(canonical(tables[l.table].rows[l.row][l.cell].trim())).toBe(p.valueText);
 });
 it('keeps 2025 values aligned with the existing verified article parser',()=>{
  const b=bytesOf('CN_AFRE_STOCK-2025.htm');
  const table=parseAfreStockYoy(b,S);
  expect(table).toHaveLength(12);
  const last=table[11],l=last.locator;
  if(l.kind!=='html_cell')throw new Error('locator');
  expect(canonical(htmlTables(new TextDecoder(afreDecoderLabel(b)!,{fatal:true}).decode(b))[l.table].rows[l.row][l.cell].trim())).toBe(last.valueText);
  const articles=[
   ['2025-07','https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/2025092212554883949/index.html'],
   ['2025-08','https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/5837468/index.html'],
   ['2026-09','https://www.pbc.gov.cn/diaochatongjisi/116219/116225/2026101417073743604/index.html'],
  ];
  for(const [period,url] of articles){
   const [year,month]=period.split('-').map(Number);
   const article=readFileSync(new URL(`./fixtures/pbc-afre-stock-${period}.html`,import.meta.url));
   const candidate=parsePbcAfreStockArticle(new Uint8Array(article),{sourceUrl:url,retrievedAt:'2026-11-16T00:00:00.000Z'});
   const stock=year===2025?table:parseAfreStockYoy(bytesOf('CN_AFRE_STOCK-2026.htm'),S);
   expect(stock.find(p=>p.periodEnd===candidate.periodEnd)?.valueText).toBe(candidate.valueText);
   expect(candidate.periodEnd).toBe(monthEnd(year,month));
  }
 });
 it('keeps growth-cell locators when pairs start after a spacer and skips blank values',()=>{
  const b=doc(['2026.1','2026.2','2026.3'],['8.20','-',''],{sub:['spacer','存量','增速（%）','存量','增速（%）','存量','增速（%）'],prefix:'<td>spacer</td>'});
  expect(parseAfreStockYoy(b,S)).toEqual([{seriesId:S.seriesId,periodEnd:'2026-01-31',valueText:'8.2',locator:{kind:'html_cell',table:0,row:3,cell:3}}]);
 });
 it('round-trips the real 2024 gb2312 excerpt without changing text, points or locators',()=>{
  const original=bytesOf('CN_AFRE_STOCK-2024.htm');
  expect(afreDecoderLabel(original)).toBe('gb18030');
  const text=new TextDecoder('gb18030',{fatal:true}).decode(original);
  const roundTrip=new Uint8Array(iconv.encode(text,'gb2312'));
  expect(new TextDecoder('gb18030',{fatal:true}).decode(roundTrip)).toBe(text);
  expect(parseAfreStockYoy(roundTrip,S)).toEqual(parseAfreStockYoy(original,S));
 });
});

describe('PBOC AFRE stock table rejects invalid evidence',()=>{
 it.each([
  ['missing title',doc(['2026.1'],['8.2'],{title:'其他表'}),'afre_title_missing'],
  ['duplicate title',utf(new TextDecoder().decode(doc(['2026.1'],['8.2']))+'<table><tr><td>社会融资规模存量统计表</td></tr></table>'),'afre_title_missing'],
  ['interior blank month',doc(['2026.1','','2026.3'],['8.2','8.1','7.9']),'afre_bad_month'],
  ['bad month',doc(['2026.13'],['8.2']),'afre_bad_month'],
  ['bad later month',doc(['2026.1','2026.13'],['8.2','8.1']),'afre_bad_month'],
  ['duplicate month',doc(['2026.1','2026.01'],['8.2','8.1']),'afre_bad_month'],
  ['bad quarter',doc(['2015.Q5'],['8.2']),'afre_bad_month'],
  ['year outside range',doc(['1999.1'],['8.2']),'afre_bad_month'],
  ['header mismatch',doc(['2026.1'],['8.2'],{sub:['存量','同比']}),'afre_header_mismatch'],
  ['too few pairs',doc(['2026.1','2026.2'],['8.2','8.1'],{sub:['存量','增速(%)']}),'afre_header_mismatch'],
  ['bad value',doc(['2026.1'],['8,2']),'afre_bad_value'],
  ['duplicate stock row',doc(['2026.1'],['8.2'],{extra:'<tr><td>社会融资规模存量</td><td>100</td><td>8.3</td></tr>'}),'afre_row_ambiguous'],
  ['missing stock row',doc(['2026.1'],['8.2'],{stock:'人民币贷款'}),'afre_row_missing'],
  ['unsupported charset',utf('<meta charset=iso-8859-1>'),'afre_bad_encoding'],
  ['missing charset',utf('<table></table>'),'afre_bad_encoding'],
  ['invalid utf8',new Uint8Array([...utf('<meta charset=utf-8>'),255]),'afre_bad_encoding'],
 ] as const)('%s',(_name,b,code)=>expect(codeOf(()=>parseAfreStockYoy(b,S))).toBe(code));
 it('exports its version and typed error',()=>{
  expect(PBOC_AFRE_PARSER_VERSION).toBe('pboc-afre-stock/1');
  expect(new PbocAfreParseError('x')).toMatchObject({name:'PbocAfreParseError',code:'x'});
 });
});

describe.skipIf(!process.env.WPD_RAW_EVIDENCE_DIR)('opt-in full evidence replay',()=>{
 it('parses each local raw stock table against optional truth',()=>{
  const dir=process.env.WPD_RAW_EVIDENCE_DIR!;
  const truth=process.env.WPD_AFRE_TRUTH?JSON.parse(readFileSync(process.env.WPD_AFRE_TRUTH,'utf8')) as Record<string,{points:[string,string][]}>:null;
  const files=readdirSync(dir).filter(f=>/^CN_AFRE_STOCK-\d{4}\.htm$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  for(const file of files){
   const actual=pairs(new Uint8Array(readFileSync(join(dir,file))));
   const year=file.slice(14,18);
   if(truth){
    expect(truth[year],file).toBeDefined();
    expect(actual,file).toEqual(truth[year].points.filter(([,v])=>v!==''&&v!=='-').map(([ym,v])=>{
     const [y,m]=ym.split('-').map(Number);return [monthEnd(y,m),canonical(v)];
    }));
   }else expect(actual.length,file).toBeGreaterThan(0);
  }
 });
});
