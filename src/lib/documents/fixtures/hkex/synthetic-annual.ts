// src/lib/documents/fixtures/hkex/synthetic-annual.ts
// SYNTHETIC extraction layout for the orchestration layer of sync-hk.integration.test.ts (plan F3
// Task 18, spec §11.3): the three consolidated primary statements of a fictitious FY2025 annual
// report in the pages.json shape of spec §7.2 — normalised (NFKC) text, lines with code-point
// offsets, one table per page (label cell col 0, value cells cols 1–2) whose header block
// (company line carrying the supplementary-plane 𠀋, statement title, period line, unit line, year
// row) is kept as header_lines. It stands in for extractPdf's output on synthetic bytes; it is NOT
// a recording of a real filing (the real 0268.HK layout is recorded by record-fixture.ts).
// Offsets come from Array.from, never UTF-16 indexes. Conventions follow Task 14's generator
// (spec §7.5): every line carries its items; the year row's tokens sit over the value columns (period.ts maps header years by x); amounts are RMB thousands;
// brackets are negatives. SYNTHETIC_ANCHORS are what the generator must produce (× 1000; cost of
// sales and income tax as absolute values, cash flows as presented).
import type {LayoutCell,LayoutItem,LayoutLine,LayoutTable,PageLayout} from '../../types';

export const SYNTHETIC_SOURCE_REF='2026032599001_c';
const COL_X0=[50,300,420] as const;
const cp=(s:string)=>Array.from(s).length;
type Row=readonly [label:string,y2025:string,y2024:string];
interface Statement{title:string;period:string;rows:readonly Row[]}
const STATEMENTS:readonly Statement[]=[
 {title:'綜合損益表',period:'截至二零二五年十二月三十一日止年度',rows:[['收益','6,256,000','5,679,000'],['銷售成本','(2,100,000)','(1,950,000)'],['毛利','4,156,000','3,729,000'],
  ['經營溢利','300,000','250,000'],['所得稅開支','(50,000)','(40,000)'],['年內溢利','250,000','210,000']]},
 {title:'綜合財務狀況表',period:'於二零二五年十二月三十一日',rows:[['現金及現金等價物','1,500,000','1,200,000'],['資產總值','20,000,000','18,000,000'],['負債總額','8,000,000','7,500,000'],['權益總額','12,000,000','10,500,000']]},
 {title:'綜合現金流量表',period:'截至二零二五年十二月三十一日止年度',rows:[['經營活動所得現金淨額','900,000','800,000'],['投資活動所用現金淨額','(500,000)','(400,000)'],
  ['融資活動所用現金淨額','(100,000)','(150,000)'],['現金及現金等價物增加淨額','300,000','250,000']]},
];
function page(page_no:number,s:Statement):PageLayout{
 const head=['金蝶國際𠀋軟件集團有限公司(合成夾具)',s.title,s.period,'人民幣千元','2025 2024'];
 const lines:LayoutLine[]=[];const cells:LayoutCell[]=[];let pos=0;
 const span=(col:number)=>({x0:COL_X0[col],x1:COL_X0[col]+(col===0?220:90)});
 // one line from its items (C-1): items carry x and code-point offsets; the line text joins them with spaces
 const push=(index:number,parts:{text:string;x0:number;x1:number}[]):LayoutItem[]=>{
  const y=780-index*18;const items:LayoutItem[]=[];let off=pos;
  for(const p of parts){const n=cp(p.text);items.push({text:p.text,x0:p.x0,x1:p.x1,y,h:10,char_start:off,char_end:off+n});off+=n+1;}
  const text=parts.map(p=>p.text).join(' ');const n=cp(text);
  lines.push({index,y,x0:Math.min(...parts.map(p=>p.x0)),x1:Math.max(...parts.map(p=>p.x1)),text,char_start:pos,char_end:pos+n,items});
  pos+=n+1;return items;
 };
 head.forEach((text,index)=>{
  if(index===head.length-1)push(index,['2025','2024'].map((t,i)=>({text:t,...span(i+1)})));   // the year row sits over the two value columns
  else push(index,[{text,x0:COL_X0[0],x1:400}]);
 });
 s.rows.forEach((r,k)=>{
  const index=head.length+k;
  push(index,r.map((t,col)=>({text:t,...span(col)}))).forEach((it,col)=>cells.push({row:k,col,text:it.text,bbox:{x0:it.x0,y0:it.y,x1:it.x1,y1:it.y+10},line_index:index,char_start:it.char_start,char_end:it.char_end,numeric:col>0}));
 });
 const table:LayoutTable={header_lines:lines.slice(0,head.length),cells,row_count:s.rows.length,col_count:3,col_x0:[...COL_X0]};
 return {page_no,width:595,height:842,text:lines.map(l=>l.text).join('\n'),lines,tables:[table]};
}
/** Fresh objects on every call. */
export function syntheticAnnualPages():PageLayout[]{return STATEMENTS.map((s,i)=>page(i+1,s));}
export const SYNTHETIC_ANCHORS:readonly {natural_key:string;value:string}[]=[
 {natural_key:'revenue:2025-01-01:2025-12-31:12M:CNY',value:'6256000000'},
 {natural_key:'cost_of_revenue:2025-01-01:2025-12-31:12M:CNY',value:'2100000000'},
 {natural_key:'gross_profit:2025-01-01:2025-12-31:12M:CNY',value:'4156000000'},
 {natural_key:'total_assets::2025-12-31:INSTANT:CNY',value:'20000000000'},
 {natural_key:'operating_cash_flow:2025-01-01:2025-12-31:12M:CNY',value:'900000000'},
 {natural_key:'investing_cash_flow:2025-01-01:2025-12-31:12M:CNY',value:'-500000000'},
 {natural_key:'revenue:2024-01-01:2024-12-31:12M:CNY',value:'5679000000'},
];
