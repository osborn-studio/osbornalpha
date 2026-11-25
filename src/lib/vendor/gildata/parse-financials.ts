// SW quarter-end financial evidence. Decimal text and row indices refer to the original wire order.
import {GildataParseError} from './envelope';
import {checkedTables} from './markdown-table';
export const FINANCIALS_API_NAME='行业财务分析',FINANCIALS_PARSER_VERSION='gildata-sw-l1-financials/1',SCHEME_LABEL='申万行业分类';
export const FINANCIALS_COLUMNS=[
 '行业代码','行业名称','行业分类','截止日期',
 '上市证券数量(只)','行业营业收入TTM(万元)','行业营业收入(万元)','行业营业成本(万元)',
 '行业营业利润TTM(万元)','行业营业利润(万元)','行业净利润TTM(万元)','行业净利润(万元)',
 '行业归属母公司的净利润TTM(万元)','行业归属母公司的净利润(万元)','行业净资产(万元)','行业总资产(万元)',
 '行业总股本(万股)','每股收益_均值(元)','净资产收益率_平均(%)','净资产收益率_摊薄(%)',
 '净资产收益率_TTM(%)','净资产收益率_扣除,平均(%)','净资产收益率_扣除,摊薄(%)','总资产净利率_平均(%)',
 '总资产净利率_摊薄(%)','总资产净利率_TTM(%)','销售毛利率(%)','销售毛利率_TTM(%)',
 '销售净利率(%)','销售净利率_TTM(%)','销售净利率_扣除(%)','财务费用/营业收入TTM(%)',
 '销售费用/营业总收入(%)','销售费用/营业总收入_TTM(%)','销售期间费用率(%)','营业总成本/营业总收入(%)',
 '投入资本回报率(%)','流动比率(%)','速动比率(%)','利息保障倍数(倍)',
 '经营现金流利息保障倍数(倍)','归属母公司股东的净利润同比增长(%)','毛利润同比增长率(%)','存货周转率(次)',
 '存货周转天数(天)','应收账款周转率(次)','应收账款周转天数(天)','应收款项周转率(次)',
 '总资产周转率(次)','经营现金净流量/营业总收入(%)','资产负债率(%)','有形资产净值/总资产(%)',
 '对外投资/所有者权益(%)','预收账款/营业收入TTM(%)','应收账款/营业收入TTM(%)','应付职工薪酬(万元)',
 '人均创收(万元/人)','人均创利(万元/人)','人均薪酬(万元/人)','行业薪酬利润比(%)',
] as const;
export const FINANCIAL_METRICS=[
 {metric:'member_count',column:'上市证券数量(只)',duration:'INSTANT',unit:'count'},
 {metric:'revenue_cum',column:'行业营业收入(万元)',duration:'YTD',unit:'cny_10k'},
 {metric:'revenue_ttm',column:'行业营业收入TTM(万元)',duration:'TTM',unit:'cny_10k'},
 {metric:'net_income_parent_cum',column:'行业归属母公司的净利润(万元)',duration:'YTD',unit:'cny_10k'},
 {metric:'net_income_parent_ttm',column:'行业归属母公司的净利润TTM(万元)',duration:'TTM',unit:'cny_10k'},
 {metric:'net_income_parent_yoy',column:'归属母公司股东的净利润同比增长(%)',duration:'YTD',unit:'pct'},
 {metric:'net_assets',column:'行业净资产(万元)',duration:'INSTANT',unit:'cny_10k'},
 {metric:'roe_avg',column:'净资产收益率_平均(%)',duration:'YTD',unit:'pct'},
 {metric:'roe_ttm',column:'净资产收益率_TTM(%)',duration:'TTM',unit:'pct'},
 {metric:'gross_margin',column:'销售毛利率(%)',duration:'YTD',unit:'pct'},
 {metric:'gross_margin_ttm',column:'销售毛利率_TTM(%)',duration:'TTM',unit:'pct'},
 {metric:'ocf_to_revenue',column:'经营现金净流量/营业总收入(%)',duration:'YTD',unit:'pct'},
] as const;
type Duration=typeof FINANCIAL_METRICS[number]['duration'];
interface Locator{block:number;row:number;column:string}
export interface VendorObservation{
 metric:string;periodStart:string;periodEnd:string;duration:Duration;status:'ok'|'missing';missingReason:null|'vendor_not_provided';
 valueText:string|null;unit:string;locator:Locator|null;
}
export interface FinancialsParse{
 canonicalSha256:string;apiNames:string[];classification:{gildataCode:string;nameZh:string;schemeLabel:string};
 periods:string[];observations:VendorObservation[];
}
interface Scope{gildataCode:string;nameZh:string;fromYear:number;toYear:number;today:string}
const quarterEnds=['03-31','06-30','09-30','12-31'];
function periodStart(end:string,duration:Duration){
 if(duration==='INSTANT')return end;
 if(duration==='YTD')return end.slice(0,4)+'-01-01';
 const date=new Date(end+'T00:00:00Z');
 date.setUTCFullYear(date.getUTCFullYear()-1);
 date.setUTCDate(date.getUTCDate()+1);
 return date.toISOString().slice(0,10);
}
const metrics=FINANCIAL_METRICS.map(m=>({...m,index:FINANCIALS_COLUMNS.indexOf(m.column)}));
export function parseSwL1Financials(bytes:Uint8Array,expect:Scope):FinancialsParse{
 const {canonicalSha256,apiNames,tables}=checkedTables(bytes,FINANCIALS_API_NAME,FINANCIALS_COLUMNS);
 const {fromYear,toYear,today,nameZh,gildataCode}=expect;
 const cutoff=Date.parse(today);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||!Number.isFinite(cutoff)||new Date(cutoff).toISOString().slice(0,10)!==today)
  throw new GildataParseError('request_mismatch','date_out_of_range');
 if(!Number.isInteger(fromYear)||!Number.isInteger(toYear)||fromYear<2016||toYear>2100||fromYear>toYear)
  throw new GildataParseError('request_mismatch','date_out_of_range');
 const dates=new Map<string,{cells:string[];block:number;row:number}>();
 for(const rows of tables)for(const [code,name,scheme,end] of rows){
  if(code!==gildataCode||name!==nameZh||scheme!==SCHEME_LABEL)throw new GildataParseError('request_mismatch','industry_mismatch');
  if(!/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(end)||Number(end.slice(0,4))<fromYear||Number(end.slice(0,4))>toYear)
   throw new GildataParseError('request_mismatch','date_out_of_range');
 }
 tables.forEach((rows,block)=>rows.forEach((cells,row)=>{
  const end=cells[3],prev=dates.get(end);
  if(prev&&cells.some((v,i)=>v!==prev.cells[i]))throw new GildataParseError('parse_failed','conflicting_duplicate');
  if(!prev)dates.set(end,{cells,block,row});
 }));
 const periods:string[]=[];
 for(let year=fromYear;year<=toYear;year++)for(const quarter of quarterEnds){
  const end=`${year}-${quarter}`;
  if(end>today)continue;
  if(!dates.has(end)&&cutoff-Date.parse(end)>200*86400000)throw new GildataParseError('request_mismatch','period_missing');
  periods.push(end);
 }
 for(const {cells} of dates.values())for(const {metric,index} of metrics){
  const value=cells[index],pattern=metric==='member_count'?/^\d+$/:/^-?\d+(\.\d+)?$/;
  if(value!=='-'&&!pattern.test(value))throw new GildataParseError('parse_failed','invalid_number');
 }
 const observations:VendorObservation[]=[];
 for(const periodEnd of periods){
  const source=dates.get(periodEnd);
  for(const {metric,column,duration,unit,index} of metrics){
   const cell=source?.cells[index]??'-',missing=cell==='-';
   observations.push({metric,periodStart:periodStart(periodEnd,duration),periodEnd,duration,unit,
    status:missing?'missing':'ok',missingReason:missing?'vendor_not_provided':null,valueText:missing?null:cell,
    locator:source?{block:source.block,row:source.row,column}:null});
  }
 }
 return {canonicalSha256,apiNames,classification:{gildataCode,nameZh,schemeLabel:SCHEME_LABEL},periods,observations};
}
export function replayFinancialCell(bytes:Uint8Array,locator:Locator,metric:string):string|null{
 const {tables}=checkedTables(bytes,FINANCIALS_API_NAME,FINANCIALS_COLUMNS);
 const mapping=metrics.find(m=>m.metric===metric&&m.column===locator.column);
 const row=tables[locator.block]?.[locator.row];
 if(!mapping||!row)throw new GildataParseError('parse_failed','invalid_locator');
 const value=row[mapping.index];
 return value==='-'?null:value;
}
