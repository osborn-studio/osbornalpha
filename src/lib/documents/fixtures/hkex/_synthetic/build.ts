// src/lib/documents/fixtures/hkex/_synthetic/build.ts
// Deterministic synthetic HK pages.json fixtures (plan F3 Task 14; spec §11.1 hk-facts tests). A
// fixture is a list of page specs: a string is a plain line (one item at the label x), a HeaderSpec
// a header line whose tokens sit right-aligned over the two value columns (optional lead over the
// notes column — the x positions period.ts maps header years/dates by), a RowSpec a table body row
// (label, optional note number, two values right-aligned to the value columns; '' = no item; both
// values '' = a label-only row, the shape extract/tables.ts gives sub-headings such as
// "Profit attributable to:" inside a table). Every line carries its items (LayoutItem, contract
// change C-1). The builder lays lines out top-down, computes code-point offsets for every line,
// item and cell, groups consecutive rows into tables whose header block is every non-row line since
// the previous table (or the page top), and numbers columns like extract/tables.ts: col 0 is the
// label cell, numeric columns 1..k by right edge (notes column first); col_x0[0] is the label x.
// scripts/documents/write-synthetic-fixtures.ts writes the JSON files next to this module;
// generate.test.ts checks that the committed files equal this builder's output.
import {createHash} from 'node:crypto';
import {EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from '../../../types';
import type {LayoutCell,LayoutLine,LayoutTable,PageLayout,PagesJson} from '../../../types';

export interface RowSpec{label:string;note?:string;values:[string,string]}
/** A header line: tokens right-aligned over the two value columns ('' = none), an optional lead right-aligned over the notes column. */
export interface HeaderSpec{header:[string,string];lead?:string}
export type LineSpec=string|RowSpec|HeaderSpec;
export interface PageSpec{page_no:number;lines:LineSpec[]}
const CHAR_W=6,LABEL_X=50,NOTE_RIGHT=320,VALUE_RIGHT=[420,500],TOP=800,LINE_H=14,ITEM_H=10;
const cpLen=(s:string)=>Array.from(s).length;
interface Part{text:string;x0:number;x1:number;numeric:boolean}
interface Item extends Part{char_start:number;char_end:number}
const isRow=(ls:LineSpec):ls is RowSpec=>typeof ls!=='string'&&'values' in ls;
const right=(text:string,x1:number,numeric:boolean):Part=>({text,x0:x1-cpLen(text)*CHAR_W,x1,numeric});

export function buildPage(spec:PageSpec):PageLayout{
 const lines:LayoutLine[]=[];const rows=new Map<number,Item[]>();let offset=0;
 spec.lines.forEach((ls,index)=>{
  const y=TOP-index*LINE_H;const parts:Part[]=[];
  if(typeof ls==='string')parts.push({text:ls,x0:LABEL_X,x1:LABEL_X+cpLen(ls)*CHAR_W,numeric:false});
  else if(isRow(ls)){
   parts.push({text:ls.label,x0:LABEL_X,x1:LABEL_X+cpLen(ls.label)*CHAR_W,numeric:false});
   if(ls.note!==undefined)parts.push(right(ls.note,NOTE_RIGHT,true));
   ls.values.forEach((v,i)=>{if(v!=='')parts.push(right(v,VALUE_RIGHT[i],true));});
  }else{
   if(ls.lead!==undefined)parts.push(right(ls.lead,NOTE_RIGHT,false));
   ls.header.forEach((v,i)=>{if(v!=='')parts.push(right(v,VALUE_RIGHT[i],false));});
  }
  const items:Item[]=[];let c=offset;
  for(const p of parts){items.push({...p,char_start:c,char_end:c+cpLen(p.text)});c+=cpLen(p.text)+1;}
  const text=parts.map(p=>p.text).join(' ');const n=cpLen(text);
  lines.push({index,y,x0:Math.min(...parts.map(p=>p.x0)),x1:Math.max(...parts.map(p=>p.x1)),text,char_start:offset,char_end:offset+n,
   items:items.map(it=>({text:it.text,x0:it.x0,x1:it.x1,y,h:ITEM_H,char_start:it.char_start,char_end:it.char_end}))});
  if(isRow(ls))rows.set(index,items);
  offset+=n+1;
 });
 const tables:LayoutTable[]=[];let headerFrom=0;
 for(let i=0;i<spec.lines.length;){
  if(!rows.has(i)){i++;continue;}
  let j=i;while(rows.has(j))j++;
  const body=Array.from({length:j-i},(_,k)=>i+k);
  const anchors=[...new Set(body.flatMap(k=>rows.get(k)!.filter(it=>it.numeric).map(it=>it.x1)))].sort((a,b)=>a-b);
  const cells:LayoutCell[]=[];
  body.forEach((k,row)=>{for(const it of rows.get(k)!){const y=lines[k].y;cells.push({row,col:it.numeric?anchors.indexOf(it.x1)+1:0,text:it.text,bbox:{x0:it.x0,y0:y,x1:it.x1,y1:y+ITEM_H},line_index:k,char_start:it.char_start,char_end:it.char_end,numeric:it.numeric});}});
  const col_x0=[LABEL_X,...anchors.map(a=>Math.min(...cells.filter(c=>c.numeric&&c.bbox!==null&&c.bbox.x1===a).map(c=>c.bbox!.x0)))];
  tables.push({header_lines:lines.slice(headerFrom,i),cells,row_count:j-i,col_count:anchors.length+1,col_x0});
  headerFrom=j;i=j;
 }
 return {page_no:spec.page_no,width:595,height:842,text:lines.map(l=>l.text).join('\n'),lines,tables};
}
export function buildPagesJson(name:string,pages:PageSpec[]):PagesJson{
 return {extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:'synthetic',content_sha256:createHash('sha256').update(`synthetic:${name}`).digest('hex'),has_text_layer:true,pages:pages.map(buildPage)};
}
const row=(label:string,a:string,b:string,note?:string):RowSpec=>note===undefined?{label,values:[a,b]}:{label,note,values:[a,b]};
const hdr=(a:string,b:string,lead?:string):HeaderSpec=>lead===undefined?{header:[a,b]}:{header:[a,b],lead};
const labelRow=(label:string):RowSpec=>({label,values:['','']});
export const SYNTHETIC_NAMES=['annual-zh','interim-en','interim-zh-bs-years','edge-cases','interim-bilingual'] as const;
export type SyntheticName=typeof SYNTHETIC_NAMES[number];
export const SYNTHETIC:Record<SyntheticName,PageSpec[]>={
 // Traditional Chinese annual report: IS (with attribution and EPS sections, a dash cell), BS, CF; a notes page that must not be located.
 'annual-zh':[
  {page_no:3,lines:['綜合損益表','截至二零二五年十二月三十一日止年度',hdr('二零二五年','二零二四年','附註'),hdr('人民幣千元','人民幣千元'),
   row('收益','1,234,567','1,000,000','5'),row('銷售成本','(734,567)','(600,000)'),row('毛利','500,000','400,000'),row('經營溢利','200,000','150,000'),
   row('所得稅開支','(30,000)','(25,000)','9'),row('年內溢利','170,000','125,000'),
   '以下人士應佔：',row('本公司擁有人','160,000','120,000'),row('非控股權益','10,000','5,000'),
   '每股盈利（人民幣元）',row('基本','0.32','0.24'),row('攤薄','0.31','–')]},
  {page_no:4,lines:['綜合財務狀況表','於二零二五年十二月三十一日',hdr('二零二五年','二零二四年','附註'),hdr('人民幣千元','人民幣千元'),
   row('現金及現金等價物','300,000','250,000'),row('資產總值','2,000,000','1,800,000'),row('負債總額','800,000','750,000'),
   row('本公司擁有人應佔權益','1,100,000','1,000,000'),row('權益總額','1,200,000','1,050,000')]},
  {page_no:5,lines:['綜合現金流量表','截至二零二五年十二月三十一日止年度',hdr('二零二五年','二零二四年'),hdr('人民幣千元','人民幣千元'),
   row('經營活動所得現金淨額','250,000','200,000'),row('投資活動所用現金淨額','(120,000)','(100,000)'),row('融資活動所用現金淨額','(80,000)','(60,000)'),
   row('現金及現金等價物增加淨額','50,000','40,000')]},
  {page_no:6,lines:['綜合損益表附註','5 收益',hdr('二零二五年','二零二四年'),row('銷售貨品','1,000,000','900,000')]},
 ],
 // English interim report: six months, HK$'000, EPS in HK cents; BS with full-date column headers; no cash flow statement.
 'interim-en':[
  {page_no:2,lines:['Consolidated Statement of Profit or Loss','For the six months ended 30 June 2025',hdr('2025','2024','Notes'),hdr("HK$'000","HK$'000"),
   row('Revenue','500,000','450,000','4'),row('Cost of sales','(300,000)','(280,000)'),row('Gross profit','200,000','170,000'),
   row('Income tax expense','(20,000)','(18,000)'),row('Profit for the period','90,000','80,000'),
   'Profit for the period attributable to:',row('Owners of the Company','85,000','76,000'),row('Non-controlling interests','5,000','4,000'),
   'Earnings per share (HK cents)',row('Basic','12.34','10.50'),row('Diluted','12.30','10.45')]},
  {page_no:3,lines:['Consolidated Statement of Financial Position','As at 30 June 2025',hdr('30 June 2025','31 December 2024'),hdr("HK$'000","HK$'000"),
   row('Total assets','3,000,000','2,900,000'),row('Total liabilities','1,000,000','950,000'),row('Total equity','2,000,000','1,950,000')]},
 ],
 // Traditional Chinese interim: IS unit '港元' only (no multiplier → unit_ambiguous); BS '千港元' with year-only headers (comparison → period_unparsed).
 'interim-zh-bs-years':[
  {page_no:2,lines:['簡明綜合損益表','截至二零二五年六月三十日止六個月',hdr('二零二五年','二零二四年'),hdr('港元','港元'),row('收益','800,000','700,000'),row('期內溢利','100,000','90,000')]},
  {page_no:3,lines:['簡明綜合財務狀況表','於二零二五年六月三十日',hdr('二零二五年','二零二四年'),hdr('千港元','千港元'),
   row('資產總值','1,500,000','1,400,000'),row('負債總額','500,000','450,000'),row('權益總額','1,000,000','950,000')]},
 ],
 // Annual: IS not consolidated; BS with conflicting duplicate total assets, an identical duplicate liabilities row and a dash; CF on pages 3 and 5 only.
 'edge-cases':[
  {page_no:1,lines:['損益表','截至二零二五年十二月三十一日止年度',hdr('二零二五年','二零二四年'),hdr('人民幣千元','人民幣千元'),row('收益','100','90'),row('年內溢利','10','9')]},
  {page_no:2,lines:['綜合財務狀況表','於二零二五年十二月三十一日',hdr('二零二五年','二零二四年'),hdr('人民幣千元','人民幣千元'),
   row('現金及現金等價物','–','250'),row('資產總值','2,000','1,800'),row('資產總值','2,100','1,800'),row('負債總額','800','750'),row('權益總額','1,200','1,050'),row('負債總額','800','750')]},
  {page_no:3,lines:['綜合現金流量表','截至二零二五年十二月三十一日止年度',hdr('二零二五年','二零二四年'),hdr('人民幣千元','人民幣千元'),row('經營活動所得現金淨額','50','40')]},
  {page_no:4,lines:['五年財務概要',hdr('二零二五年','二零二四年'),row('收益','100','90')]},
  {page_no:5,lines:['綜合現金流量表（續）',hdr('二零二五年','二零二四年'),row('現金及現金等價物增加淨額','5','4')]},
 ],
 // Bilingual interim report shaped like the recorded 0268.HK 2026 interim (HKEXnews 2026090300863_c.pdf: one
 // file, English and Traditional Chinese on the same pages): titles in both scripts with 簡明/中期 and
 // Condensed/Interim; label cells carrying both scripts; a label-only attribution row inside the table;
 // EPS sub-unit on a line below the EPS heading; two-line CF labels whose numbers sit on the second
 // line; a separate statement of comprehensive income (page 46) that must not be read as the IS;
 // BS full-date headers over the value columns. Values are illustrative, not the recorded ones.
 'interim-bilingual':[
  {page_no:44,lines:['CONDENSED CONSOLIDATED INTERIM STATEMENT OF FINANCIAL POSITION','簡明綜合中期財務狀況表','As at 30 June 2026','於二零二六年六月三十日',
   hdr('30 June 2026','31 December 2025'),hdr('二零二六年','二零二五年'),hdr('六月三十日','十二月三十一日'),hdr('RMB’000','RMB’000','Notes'),hdr('人民幣千元','人民幣千元','附註'),
   row('Cash and cash equivalents 現金及現金等價物','1,563,484','1,694,936'),row('Total assets 總資產','13,903,111','14,586,089'),
   row('Total liabilities 總負債','5,920,307','6,377,368'),row('Total equity 總權益','7,982,804','8,208,721')]},
  {page_no:45,lines:['CONDENSED CONSOLIDATED INTERIM INCOME STATEMENT','簡明綜合中期利潤表','For the six months ended 30 June 2026','截至二零二六年六月三十日止六個月',
   hdr('2026','2025'),hdr('二零二六年','二零二五年'),hdr('RMB’000','RMB’000','Notes'),hdr('人民幣千元','人民幣千元','附註'),
   row('Revenue from contracts with customers 與客戶之間的合同產生的收入','3,625,422','3,192,499','13'),row('Cost of sales 銷售成本','(1,169,510)','(1,097,158)','14'),
   row('Gross profit 毛利','2,455,912','2,095,341'),row('Income tax credit 所得稅沖回','10,185','24,458','16'),row('Profit/(loss) for the period 當期盈利╱（虧損）','48,145','(109,105)'),
   labelRow('Profit/(loss) attributable to: 應佔當期盈利╱（虧損）：'),row('Owners of the Company 本公司權益持有人','54,497','(97,738)'),row('Non-controlling interests 非控制性權益','(6,352)','(11,367)'),
   'Earnings/(losses) per share for 本公司權益持有人應佔','(expressed in RMB cents per share) （以每股人民幣分計）',
   row('– Basic －基本','1.55','(2.78)','17'),row('– Diluted －稀釋','1.55','(2.78)','17')]},
  {page_no:46,lines:['CONDENSED CONSOLIDATED INTERIM STATEMENT OF COMPREHENSIVE INCOME','簡明綜合中期綜合收益表','For the six months ended 30 June 2026','截至二零二六年六月三十日止六個月',
   hdr('2026','2025'),hdr('二零二六年','二零二五年'),hdr('RMB’000','RMB’000'),hdr('人民幣千元','人民幣千元'),
   row('Profit/(loss) for the period 當期盈利╱（虧損）','48,145','(109,105)'),row('Total comprehensive income/(loss) for the period 當期總綜合收益╱（虧損）','45,568','(104,183)')]},
  {page_no:47,lines:['CONDENSED CONSOLIDATED INTERIM CASH FLOW STATEMENT','簡明綜合中期現金流量表','For the six months ended 30 June 2026','截至二零二六年六月三十日止六個月',
   hdr('2026','2025'),hdr('二零二六年','二零二五年'),hdr('RMB’000','RMB’000'),hdr('人民幣千元','人民幣千元'),
   'Net cash inflow/(outflow) from 經營活動產生╱（所用）淨現金',row('operating activities','142,450','(18,215)'),
   row('Net cash inflow from investing activities 投資活動產生淨現金','257,729','456,075'),row('Net cash outflow from financing activities 融資活動所用淨現金','(530,015)','(292,745)'),
   'Net (decrease)/increase in cash and cash 現金及現金等價物淨（減少）╱增加',row('equivalents','(129,836)','145,115')]},
 ],
};
export const syntheticPagesJson=(name:SyntheticName):PagesJson=>buildPagesJson(name,SYNTHETIC[name]);
