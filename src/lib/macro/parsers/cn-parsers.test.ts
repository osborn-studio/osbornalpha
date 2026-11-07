// src/lib/macro/parsers/cn-parsers.test.ts
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {collectableOf} from '../catalog';
import {equals} from '../decimal';
import {ChinabondParseError,parseChinabondHistory} from './chinabond';
import {htmlTables} from './html-table';
import {claimPeriodEnd,parserFor} from './index';
import {NbsParseError,parseNbsEsData} from './nbs';
import {parseSafeCentralParity} from './safe';

const enc=(s:string)=>new TextEncoder().encode(s);
const codeOf=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return (e as {code?:string}).code??String(e);}};

// ---------------------------------------------------------------- NBS (structure copied from the 2026-11-06 esData response)
const nbsDoc=(data:unknown,extra:Record<string,unknown>={})=>enc(JSON.stringify({data,success:true,state:20000,message:'成功',...extra}));
const v=(i_showname:string,value:unknown,extra:Record<string,unknown>={})=>({i_showname,_name:'x',value,da:'000000000000',da_name:'全国',du_name:'%',...extra});
const pmi={seriesId:'CN_PMI_MFG',indicator:'制造业采购经理指数(%)',period:'month' as const};

describe('parseNbsEsData',()=>{
 it('selects the indicator by whitespace-free i_showname, keeps string values losslessly and skips unreleased ""',()=>{
  const pts=parseNbsEsData(nbsDoc([
   {code:'202611MM',name:'2026年11月',values:[v('制造业采购经理指数 (%) ',''),v('生产指数 (%) ','')]},
   {code:'202610MM',name:'2026年10月',values:[v('生产指数 (%) ','49.8'),v('制造业采购经理指数 (%) ','49.30')]},
   {code:'202602MM',name:'2026年2月',values:[v('制造业采购经理指数 (%) ','35.7')]},
  ]),pmi);
  expect(pts).toEqual([
   {seriesId:'CN_PMI_MFG',periodEnd:'2026-10-31',valueText:'49.3',locator:{kind:'json_pointer',pointer:'/data/1/values/1/value'}},
   {seriesId:'CN_PMI_MFG',periodEnd:'2026-02-28',valueText:'35.7',locator:{kind:'json_pointer',pointer:'/data/2/values/0/value'}},
  ]);
 });
 it('maps quarter codes YYYY0QSS to quarter ends',()=>{
  const pts=parseNbsEsData(nbsDoc([{code:'202603SS',name:'2026年第三季度',values:[v('国内生产总值指数 (上年同期=100) 当季值','104.5'),v('国内生产总值指数 (上年同期=100) 累计值','104.6')]}]),
   {seriesId:'CN_GDP_INDEX',indicator:'国内生产总值指数(上年同期=100)当季值',period:'quarter'});
  expect(pts.map(p=>[p.periodEnd,p.valueText])).toEqual([['2026-09-30','104.5']]);
 });
 it('ignores non-national rows and fails closed on surprises',()=>{
  expect(parseNbsEsData(nbsDoc([{code:'202610MM',values:[v('制造业采购经理指数 (%) ','1',{da:'110000000000'})]}]),pmi)).toEqual([]);
  expect(codeOf(()=>parseNbsEsData(nbsDoc([{code:'202610MM',values:[v('制造业采购经理指数 (%) ',49.3)]}]),pmi))).toBe('nbs_value_not_string');
  expect(codeOf(()=>parseNbsEsData(nbsDoc([{code:'202610MM',values:[v('制造业采购经理指数(%)','1'),v('制造业采购经理指数 (%) ','2')]}]),pmi))).toBe('nbs_ambiguous');
  expect(codeOf(()=>parseNbsEsData(nbsDoc([{code:'202603SS',values:[]}]),pmi))).toBe('nbs_period_code');
  expect(codeOf(()=>parseNbsEsData(nbsDoc([{code:'202613MM',values:[]}]),pmi))).toBe('nbs_period_code');
  expect(codeOf(()=>parseNbsEsData(nbsDoc([],{success:false}),pmi))).toBe('nbs_unsuccessful');
  expect(codeOf(()=>parseNbsEsData(enc('<html>'),pmi))).toBe('nbs_bad_json');
  expect(codeOf(()=>parseNbsEsData(nbsDoc([{code:'202610MM',values:[v('制造业采购经理指数 (%) ','4,9')]}]),pmi))).toBe('nbs_bad_value');
  expect(new NbsParseError('x').name).toBe('NbsParseError');
 });
});

// ---------------------------------------------------------------- ChinaBond (structure copied from the 2026-11-06 historyQuery page)
const cbHtml=(rows:string)=>enc(`<html><body><table width="100%"><tr><td>曲线名称</td><td><select><option>全部</option></select></td></tr></table>
<table  border="0" cellspacing="0" cellpadding="0">\r\n<tr>\r\n<td><!-- 曲线名称 -->曲线名称</td>\r\n<td><!-- 日期 -->日期</td>\r\n<td>3<!-- 月 -->月</td><td>6<!-- 月 -->月</td><td>1<!-- 年 -->年</td><td>3<!-- 年 -->年</td><td>5<!-- 年 -->年</td><td>7<!-- 年 -->年</td><td>10<!-- 年 -->年</td><td>30<!-- 年 -->年</td>\r\n</tr>
${rows}</table></body></html>`);
const cbRow=(curve:string,date:string,ten:string)=>`<tr>\r\n\t<td style="text-align: left">${curve}</td>\r\n\t<td>${date}</td><td>1.1612</td><td>1.1652</td><td>1.1710</td><td>1.2397</td><td>1.3236</td><td>1.4161</td><td>${ten}</td><td>2.0425</td>\r\n</tr>`;
const cgb={seriesId:'CN_CGB_10Y_D',curve:'中债国债收益率曲线',column:'10年'};

describe('parseChinabondHistory',()=>{
 it('reads the tenor column of the requested curve from the data table with html_cell locators',()=>{
  const pts=parseChinabondHistory(cbHtml(cbRow('中债国债收益率曲线','2026-11-05','1.6038')+cbRow('中债中短期票据收益率曲线(AAA)','2026-11-05','1.9135')+cbRow('中债国债收益率曲线','2026-11-04','1.6100')),cgb);
  expect(pts).toEqual([
   {seriesId:'CN_CGB_10Y_D',periodEnd:'2026-11-05',valueText:'1.6038',locator:{kind:'html_cell',table:1,row:1,cell:8}},
   {seriesId:'CN_CGB_10Y_D',periodEnd:'2026-11-04',valueText:'1.61',locator:{kind:'html_cell',table:1,row:3,cell:8}},
  ]);
 });
 it('skips an empty tenor cell and fails closed on a missing table or a bad date/value',()=>{
  expect(parseChinabondHistory(cbHtml(cbRow('中债国债收益率曲线','2026-11-05','')),cgb)).toEqual([]);
  expect(codeOf(()=>parseChinabondHistory(enc('<table><tr><td>x</td></tr></table>'),cgb))).toBe('chinabond_no_table');
  expect(codeOf(()=>parseChinabondHistory(cbHtml(cbRow('中债国债收益率曲线','2026/11/05','1.6')),cgb))).toBe('chinabond_bad_date');
  expect(codeOf(()=>parseChinabondHistory(cbHtml(cbRow('中债国债收益率曲线','2026-11-05','n/a')),cgb))).toBe('chinabond_bad_value');
  expect(new ChinabondParseError('x').code).toBe('x');
 });
});

// ---------------------------------------------------------------- SAFE (structure copied from the 2026-11-06 RMBQuery.do page)
const safeHtml=(rows:string)=>enc(`<!DOCTYPE html ><html><body><table width="98%"><tr><td><table><tr><td>查询</td></tr></table></td></tr></table>
<table class="list" id="InfoTable" width="100%">\r\n<tr>\r\n<th width="12%" class="table_head" id="comtemplatename" >日期</th>
<th width="8%" class="table_head">\r\n<!-- <s:property  value="currency"/>&nbsp; -->\r\n美元\r\n</th><th width="8%" class="table_head">\r\n<!-- x -->\r\n欧元\r\n</th></tr>
<tr>\r\n<td width="8%" align="center"  >\r\n<s:if test="RMBDataList[#stat.index][#stat1.index]==null">-</s:if>\r\n<s:else><s:property />&nbsp;</s:else>\r\n</td>\r\n</tr>
${rows}</table></body></html>`);
const safeRow=(date:string,usd:string,eur='751.91')=>`<tr>\r\n<td width="8%" align="center">\r\n${date}\r\n</td>\r\n<td td width="8%" align="center" >\r\n${usd}\r\n</td>\r\n<td td width="8%" align="center" >\r\n${eur}\r\n</td>\r\n</tr>`;

describe('parseSafeCentralParity',()=>{
 it('reads the USD column of InfoTable in CNY per 100 USD, skipping the template row and "-" cells',()=>{
  const pts=parseSafeCentralParity(safeHtml(safeRow('2026-11-06','671.68')+safeRow('2026-11-05','671.560')+safeRow('2026-11-04','-')),{seriesId:'CN_USDCNY_CP_D',column:'美元'});
  expect(pts).toEqual([
   {seriesId:'CN_USDCNY_CP_D',periodEnd:'2026-11-06',valueText:'671.68',locator:{kind:'html_cell',table:2,row:2,cell:1}},
   {seriesId:'CN_USDCNY_CP_D',periodEnd:'2026-11-05',valueText:'671.56',locator:{kind:'html_cell',table:2,row:3,cell:1}},
  ]);
 });
 it('fails closed without the table or on a non-decimal value',()=>{
  expect(codeOf(()=>parseSafeCentralParity(enc('<table><tr><th>x</th></tr></table>'),{seriesId:'X',column:'美元'}))).toBe('safe_no_table');
  expect(codeOf(()=>parseSafeCentralParity(safeHtml(safeRow('2026-11-06','6.7l')),{seriesId:'X',column:'美元'}))).toBe('safe_bad_value');
 });
});

describe('strict plain-decimal values (no exponents or garbage)',()=>{
 const bad=['1e3','1E-2','+1.5','.5','1.','0x10','1_000','1 2','Infinity','NaN'];
 it('rejects them in NBS, ChinaBond and SAFE',()=>{
  for(const x of bad){
   expect(codeOf(()=>parseNbsEsData(nbsDoc([{code:'202610MM',values:[v('制造业采购经理指数 (%) ',x)]}]),pmi)),`nbs ${x}`).toBe('nbs_bad_value');
   expect(codeOf(()=>parseChinabondHistory(cbHtml(cbRow('中债国债收益率曲线','2026-11-05',x)),cgb)),`cb ${x}`).toBe('chinabond_bad_value');
   expect(codeOf(()=>parseSafeCentralParity(safeHtml(safeRow('2026-11-06',x)),{seriesId:'X',column:'美元'})),`safe ${x}`).toBe('safe_bad_value');
  }
 });
 it('still accepts plain and negative decimals',()=>{
  expect(parseNbsEsData(nbsDoc([{code:'202610MM',values:[v('制造业采购经理指数 (%) ','-0.5')]}]),pmi)[0].valueText).toBe('-0.5');
 });
});

describe('htmlTables',()=>{
 it('numbers tables by start tag, keeps nested tables apart and decodes cell text',()=>{
  const t=htmlTables('<table><tr><td>a<!-- c -->b</td><td><table><tr><td>in</td></tr></table></td></tr><tr><th>&nbsp;x &amp; y&#33;</th></tr></table>');
  expect(t.map(x=>x.index)).toEqual([0,1]);
  expect(t[1].rows).toEqual([['in']]);
  expect(t[0].rows[0][0]).toBe('ab');expect(t[0].rows[1]).toEqual(['x & y!']);
 });
});

describe('claimPeriodEnd and parserFor',()=>{
 it('maps AKShare column labels to period ends',()=>{
  expect(claimPeriodEnd('2026年9月','month')).toBe('2026-09-30');
  expect(claimPeriodEnd('2024年2月','month')).toBe('2024-02-29');
  expect(claimPeriodEnd('2026年第三季度','quarter')).toBe('2026-09-30');
  expect(claimPeriodEnd('2026-11-05','day')).toBe('2026-11-05');
  for(const [l,p] of [['2026年13月','month'],['2026年第五季度','quarter'],['2026-02-30','day'],['2026年9月','day']] as const)expect(claimPeriodEnd(l,p),l).toBeNull();
 });
 it('has a parser for every active native akshare series and none for anything else',()=>{
  for(const d of collectableOf('akshare'))expect(parserFor(d.id),d.id).not.toBeNull();
  for(const id of ['CN_CPI_YOY','CN_CGB10Y','CN_LPR_1Y','CN_CSI300','US_DGS10_D','NOPE'])expect(parserFor(id),id).toBeNull();
 });
});

// ---------------------------------------------------------------- recorded fixtures (Task 8)
interface FixtureFile{series_id:string;file:string;url:string;status:number;content_type:string;fetched_at:string;sha256:string}
const manifest:{files:FixtureFile[]}=JSON.parse(readFileSync(new URL('../fixtures/cn/manifest.json',import.meta.url),'utf8'));
const claims:Record<string,{series_id:string;period_label:string;value_text:string}[]>=JSON.parse(readFileSync(new URL('../fixtures/cn/claims.json',import.meta.url),'utf8'));
const bytesOf=(f:FixtureFile)=>new Uint8Array(readFileSync(new URL(`../fixtures/cn/${f.file}`,import.meta.url)));
const parsedOf=(id:string)=>manifest.files.filter(f=>f.series_id===id).flatMap(f=>parserFor(id)!.parse(bytesOf(f)));

describe('CN parsers on recorded official responses',()=>{
 it('has evidence for every CN series, hashes match, URLs are on the official host and path',()=>{
  expect([...new Set(manifest.files.map(f=>f.series_id))].sort()).toEqual(collectableOf('akshare').map(d=>d.id).sort());
  for(const f of manifest.files){
   const p=parserFor(f.series_id)!;
   expect(createHash('sha256').update(bytesOf(f)).digest('hex'),f.file).toBe(f.sha256);
   const u=new URL(f.url);
   expect(u.host,f.file).toBe(p.spec.fetch_host);expect(u.pathname,f.file).toBe(p.spec.evidence_path);expect(f.status).toBe(200);
   expect(p.parse(bytesOf(f)).length,f.file).toBeGreaterThan(0);
  }
 });
 it('agrees with every AKShare claim it can locate (decimal equality); only SAFE XLSX-history claims may be unlocated',()=>{
  for(const [sid,list] of Object.entries(claims)){
   const p=parserFor(sid)!;
   const byPeriod=new Map(parsedOf(sid).map(x=>[x.periodEnd,x.valueText]));
   let located=0;
   for(const c of list){
    const pe=claimPeriodEnd(c.period_label,p.spec.period);
    expect(pe,`${sid} ${c.period_label}`).not.toBeNull();
    const got=byPeriod.get(pe!);
    if(got===undefined){expect(sid,`${sid} ${c.period_label} unlocated`).toBe('CN_USDCNY_CP_D');continue;}
    expect(equals(got,c.value_text),`${sid} ${pe}: parsed ${got} vs claim ${c.value_text}`).toBe(true);
    located++;
   }
   expect(located,sid).toBeGreaterThan(0);
  }
 });
 it('reads known values exactly (recorded 2026-11-06)',()=>{
  const known:[string,string,string][]=[
   ['CN_PMI_MFG','2026-10-31','49.3'],['CN_PMI_MFG','2026-09-30','50.1'],['CN_CPI_INDEX','2026-09-30','100.9'],['CN_PPI_INDEX','2026-09-30','105'],
   ['CN_GDP_INDEX','2026-09-30','104.5'],['CN_M2_YOY','2026-09-30','7.2'],['CN_EXPORT_YOY','2026-09-30','36.3'],
   ['CN_CGB_10Y_D','2026-11-05','1.6038'],['CN_USDCNY_CP_D','2026-11-05','671.56'],
  ];
  for(const [sid,pe,value] of known)expect(parsedOf(sid).find(p=>p.periodEnd===pe)?.valueText,`${sid} ${pe}`).toBe(value);
 });
});
