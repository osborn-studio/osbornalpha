// Variant responses are built from public synthetic fixtures, including overlapping blocks.
import {it,expect} from 'vitest';
import financial from './fixtures/financials-270000.json';
import bank from './fixtures/financials-480000.json';
import membership from './fixtures/members-270000.json';
import empty from './fixtures/empty.json';
import {FINANCIALS_COLUMNS,parseSwL1Financials,replayFinancialCell} from './parse-financials';
import {parseSwL1Members} from './parse-members';

const encode=(s:string)=>new TextEncoder().encode(s);
const scope={gildataCode:'270000',nameZh:'电子',fromYear:2024,toYear:2025,today:'2026-11-24'};
type Block={api_name:string;table_markdown:string};
function variant(f:{response_text:string},edit:(b:Block,lines:string[])=>Block[]){
 const rpc=JSON.parse(f.response_text),part=rpc.result.content[0],inner=JSON.parse(part.text);
 const block=inner.results[0];
 inner.results=edit(block,block.table_markdown.split('\n'));
 part.text=JSON.stringify(inner);
 return encode(JSON.stringify(rpc));
}
const table=(b:Block,lines:string[])=>({...b,table_markdown:lines.join('\n')});
const parse=(bytes:Uint8Array)=>parseSwL1Financials(bytes,scope);
const failure=(outcome:string,reason:string)=>expect.objectContaining({outcome,reason});
it('stages eight quarters and twelve metrics with exact dates and replayable decimals',()=>{
 const bytes=variant(financial,(b,lines)=>{
  expect(lines[0].slice(1,-1).split('|')).toEqual(FINANCIALS_COLUMNS);
  return [table(b,lines.map(s=>s.replace('5011.55','5011.50')))];
 });
 const result=parse(bytes);
 expect(result.periods).toHaveLength(8);
 expect(result.periods).toEqual([...result.periods].sort());
 expect(result.observations).toHaveLength(96);
 const q4=result.observations.filter(o=>o.periodEnd==='2025-12-31');
 expect(q4.map(o=>o.metric)).toEqual(['member_count','revenue_cum','revenue_ttm','net_income_parent_cum','net_income_parent_ttm','net_income_parent_yoy','net_assets','roe_avg','roe_ttm','gross_margin','gross_margin_ttm','ocf_to_revenue']);
 expect(q4[0]).toMatchObject({periodStart:'2025-12-31',duration:'INSTANT',unit:'count'});
 expect(q4[1]).toMatchObject({periodStart:'2025-01-01',duration:'YTD'});
 expect(q4[2]).toMatchObject({periodStart:'2025-01-01',valueText:'5011.50',duration:'TTM',unit:'cny_10k'});
 expect(result.observations.find(o=>o.periodEnd==='2025-06-30'&&o.metric==='roe_ttm')?.periodStart).toBe('2024-07-01');
 for(const o of result.observations)expect(replayFinancialCell(bytes,o.locator!,o.metric)).toBe(o.valueText);
});
it('keeps locators on vendor missing cells',()=>{
 const bytes=encode(bank.response_text);
 const result=parseSwL1Financials(bytes,{...scope,nameZh:'银行',gildataCode:'480000'});
 expect(result.observations.some(o=>o.status==='missing')).toBe(true);
 for(const o of result.observations){
  if(o.status==='missing')expect(o).toMatchObject({missingReason:'vendor_not_provided',valueText:null});
  expect(replayFinancialCell(bytes,o.locator!,o.metric)).toBe(o.valueText);
 }
});
it('deduplicates identical rows in wire order across shuffled blocks',()=>{
 const bytes=variant(financial,(b,lines)=>[table(b,[...lines.slice(0,2),...lines.slice(5)]),table(b,lines.slice(0,7))]);
 const result=parse(bytes);
 expect(result.observations.map(o=>({...o,locator:null}))).toEqual(parse(encode(financial.response_text)).observations.map(o=>({...o,locator:null})));
 for(const o of result.observations)expect(replayFinancialCell(bytes,o.locator!,o.metric)).toBe(o.valueText);
 expect(result.observations.find(o=>o.periodEnd==='2025-12-31')?.locator?.block).toBe(1);
});
it.each([
 ['parse_failed','conflicting_duplicate',(b:Block,l:string[])=>[b,table(b,[...l.slice(0,2),l[2].replace('5011.55','5011.50')])]],
 ['parse_failed','unexpected_columns',(b:Block)=>[table(b,[b.table_markdown.replace('截止日期','日期')])]],
 ['request_mismatch','unexpected_api_name',(b:Block)=>[b,{...b,api_name:'unrelated'}]],
 ['request_mismatch','date_out_of_range',(b:Block)=>[table(b,[b.table_markdown.replace('2025-12-31','2025-12-30')])]],
 ['request_mismatch','date_out_of_range',(b:Block)=>[table(b,[b.table_markdown.replace('2025-12-31','2023-12-31')])]],
 ['parse_failed','invalid_number',(b:Block)=>[table(b,[b.table_markdown.replace('5011.55','5,011.55')])]],
 ['parse_failed','invalid_number',(b:Block)=>[table(b,[b.table_markdown.replace('|100|','|100.0|')])]],
] as const)('financials %s %s',(outcome,reason,edit)=>{
 expect(()=>parse(variant(financial,edit))).toThrow(failure(outcome,reason));
});
it('checks industry and zero results',()=>{
 expect(()=>parse(encode(bank.response_text))).toThrow(failure('request_mismatch','industry_mismatch'));
 expect(()=>parse(encode(empty.response_text))).toThrow(failure('request_mismatch','empty_response'));
});
it('stages a missing quarter through day 200, then rejects the gap',()=>{
 const bytes=variant(financial,(b,l)=>[table(b,l.filter(s=>!s.includes('2025-12-31')))]);
 const result=parseSwL1Financials(bytes,{...scope,today:'2026-07-19'});
 const missing=result.observations.filter(o=>o.periodEnd==='2025-12-31');
 expect(missing).toHaveLength(12);
 for(const o of missing)expect(o).toMatchObject({locator:null,status:'missing',missingReason:'vendor_not_provided',valueText:null});
 expect(()=>parseSwL1Financials(bytes,{...scope,today:'2026-07-20'})).toThrow(failure('request_mismatch','period_missing'));
});
const members=(bytes:Uint8Array)=>parseSwL1Members(bytes,scope);
it('returns six sorted codes, keeping the first locator for duplicate names',()=>{
 const bytes=variant(membership,b=>[b,b]);
 const result=members(bytes);
 expect(result.members).toHaveLength(6);
 const codes=result.members.map(m=>m.securityCode);
 expect(codes).toEqual([...codes].sort());
 expect(result.members.every(m=>m.locator.block===0)).toBe(true);
});
it.each([
 ['电子','银行','request_mismatch','industry_mismatch'],['一级行业','一级','request_mismatch','industry_mismatch'],
 ['申万行业分类','其他','request_mismatch','industry_mismatch'],['000101','000101.SZ','parse_failed','invalid_security'],
 ['样本股份甲','','parse_failed','invalid_security'],['股票名称','名称','parse_failed','unexpected_columns'],
] as const)('checks member field %s',(old,value,outcome,reason)=>{
 expect(()=>members(variant(membership,b=>[table(b,[b.table_markdown.replace(old,value)])]))).toThrow(failure(outcome,reason));
});
it('rejects conflicting members, unexpected blocks and empty responses',()=>{
 expect(()=>members(variant(membership,b=>[b,table(b,[b.table_markdown.replace('样本股份甲','changed')])]))).toThrow(failure('parse_failed','conflicting_duplicate'));
 expect(()=>members(encode(financial.response_text))).toThrow(failure('request_mismatch','unexpected_api_name'));
 expect(()=>members(encode(empty.response_text))).toThrow(failure('request_mismatch','empty_response'));
});
it('rejects invalid calendar cutoffs before classifying absent quarters',()=>{
 for(const today of ['2026-02-30','invalid']){
  expect(()=>parseSwL1Financials(encode(financial.response_text),{...scope,today})).toThrow(failure('request_mismatch','date_out_of_range'));
 }
});
it('checks the metric against its recorded column at replay',()=>{
 const bytes=encode(financial.response_text);
 const observation=parse(bytes).observations[0];
 expect(()=>replayFinancialCell(bytes,observation.locator!,'revenue_cum')).toThrow(failure('parse_failed','invalid_locator'));
});
