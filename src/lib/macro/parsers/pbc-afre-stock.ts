// Offline research candidate only; deliberately absent from the active parser registry.
import {createHash} from 'node:crypto';
import {canonical} from '../decimal';
import {isIsoDate,monthEnd} from '../periods';

export const PBC_AFRE_STOCK_PARSER_VERSION='pbc-afre-stock-article/4';
export const PBC_AFRE_STOCK_SOURCE_URL='https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/5837468/index.html';
// Exact live-verified publications only; URL timestamps can reflect site migration.
const VERIFIED_ARTICLES=new Map<string,{year:string;month:string;publishedOn:string;title?:string}>([
 [PBC_AFRE_STOCK_SOURCE_URL,{year:'2025',month:'8',publishedOn:'2025-09-12'}],
 ['https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/2025092212554883949/index.html',{year:'2025',month:'7',publishedOn:'2025-08-13'}],
 ['https://www.pbc.gov.cn/diaochatongjisi/116219/116225/2026101417073743604/index.html',
  {year:'2026',month:'9',publishedOn:'2026-10-14',title:'2026年前三季度金融统计数据报告'}],
]);
export class PbcAfreStockParseError extends Error{
 constructor(readonly code:string){super(code);this.name='PbcAfreStockParseError';}
}
function fail(code:string):never{throw new PbcAfreStockParseError(code);}
export interface PbcAfreStockCandidate{
 seriesId:'CN_AFRE_STOCK_YOY';periodEnd:string;valueText:string;unit:'percent';revisable:true;
 publishedOn:string;retrievedAt:string;sourceUrl:string;sha256:string;parserVersion:string;
 /** UTF-16 offsets into the fatal-UTF8-decoded input; NOT an ingest Locator. */
 valueRange:{start:number;end:number};
}
/** Verified monthly-article grammar. No fetch, rights grant, registry binding or observation write. */
export function parsePbcAfreStockArticle(bytes:Uint8Array,receipt:{sourceUrl:string;retrievedAt:string}):PbcAfreStockCandidate{
 const source=VERIFIED_ARTICLES.get(receipt.sourceUrl);
 if(!source)fail('pbc_unverified_source');
 if(bytes.byteLength===0||bytes.byteLength>262144)fail('pbc_size');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.retrievedAt)||!Number.isFinite(Date.parse(receipt.retrievedAt))||new Date(receipt.retrievedAt).toISOString()!==receipt.retrievedAt)fail('pbc_retrieved_at');
 let html:string;
 try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return fail('pbc_encoding');}
 // Mask inert content without changing UTF-16 offsets into original evidence.
 html=html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,m=>' '.repeat(m.length));
 const meta=(name:string):string=>{
  const tags=[...html.matchAll(/<meta\b[^>]*>/gi)].filter(m=>m[0].includes(name));
  if(tags.length!==1)fail('pbc_metadata');
  const value=new RegExp(`^<meta\\s+name="${name}"\\s+content="([^"]*)"\\s*/?>$`,'i').exec(tags[0][0]);
  if(!value)fail('pbc_metadata');
  return value[1];
 };
 const expectedTitle=source.title??`${source.year}年${source.month}月社会融资规模存量统计数据报告`;
 if(meta('ArticleTitle')!==expectedTitle)fail('pbc_title');
 const periodEnd=monthEnd(Number(source.year),Number(source.month));
 const publishedOn=meta('PubDate');
 if(publishedOn!==source.publishedOn||!isIsoDate(publishedOn)||publishedOn<=periodEnd||publishedOn>receipt.retrievedAt.slice(0,10))fail('pbc_publication');
 // Require exactly one stock headline paragraph, even when an alternative value is malformed.
 const allParagraphs=[...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)];
 // The combined report adds plain strong section headings. Never unwrap inline
 // markup or a stock headline: concealed/encoded duplicate candidates must fail.
 const sectionHeading=(body:string)=>source.title!==undefined
  &&/^<strong>[一二三四五六七八九十]+、[^<&]*<\/strong>$/.test(body)
  &&!body.includes('社会融资规模存量为');
 if(allParagraphs.some(m=>/[<&]/.test(m[1])&&!sectionHeading(m[1])))fail('pbc_unsupported_markup');
 const paragraphs=allParagraphs.filter(m=>/社会融资规模存量为/.test(m[1]));
 if(paragraphs.length!==1)fail('pbc_headline_count');
 const paragraph=paragraphs[0];
 const headline=/^初步统计，(\d{4})年([1-9]|1[0-2])月末社会融资规模存量为[0-9]+(?:\.[0-9]+)?万亿元，同比(增长|下降)([0-9]+(?:\.[0-9]+)?)%。(?:其中，[\s\S]*)?$/.exec(paragraph[1]);
 if(!headline||headline[1]!==source.year||headline[2]!==source.month)fail('pbc_headline');
 const valueText=canonical((headline[3]==='下降'?'-':'')+headline[4]);
 const relative=paragraph[0].indexOf('>')+1+paragraph[1].indexOf('同比'+headline[3])+('同比'+headline[3]).length;
 const start=paragraph.index!+relative;
 return {seriesId:'CN_AFRE_STOCK_YOY',periodEnd,valueText,unit:'percent',revisable:true,publishedOn,
  sourceUrl:receipt.sourceUrl,retrievedAt:receipt.retrievedAt,
  sha256:createHash('sha256').update(bytes).digest('hex'),parserVersion:PBC_AFRE_STOCK_PARSER_VERSION,
  valueRange:{start,end:start+headline[4].length}};
}
