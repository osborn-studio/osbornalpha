import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {allowedUnits,unitKindOf} from '../../facts/units';
import {SYNTHETIC_NAMES,buildPagesJson,syntheticPagesJson} from '../fixtures/hkex/_synthetic/build';
import type {LineSpec as PageSpecLine} from '../fixtures/hkex/_synthetic/build';
import {EXTRACTOR_VERSION,HK_EXTRACTOR_REF,HK_LABEL_GEN,HK_RULES_VERSION,TABLE_ALGO_VERSION} from '../types';
import type {CandidateInsert,CandidateRow,DocClass,DocumentRow,ExtractionRow,FactCitations,FinancialFactPayload,PagesJson} from '../types';
import {citationIdsOf,runHkChecks} from './checks';
import type {CitationCheck} from './checks';
import {canonicalJson,generateHkCandidates,naturalKey} from './generate';
import type {CiteInput} from './generate';
import {cpSlice} from './locate';

const DIR='src/lib/documents/fixtures/hkex/_synthetic';
const EXT_ID='00000000-0000-4000-8000-0000000000e1';
const fixture=(name:string)=>JSON.parse(readFileSync(`${DIR}/${name}.json`,'utf8')) as PagesJson;
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
function docRow(docClass:DocClass,language:'zh'|'en'):DocumentRow{
 return {document_id:'00000000-0000-4000-8000-0000000000d1',issuer_id:'00000000-0000-4000-8000-0000000000a1',source:'hkexnews',market:'HK',source_ref:'2026032000001_c',source_version:1,supersedes_document_id:null,observed_replacement:false,
  form_type:'年報',doc_class:docClass,classifier_gen:1,title:'年報',language,source_url:'https://www1.hkexnews.hk/x.pdf',content_sha256:'c'.repeat(64),bytes:1,mime:'application/pdf',storage_path:`blobs/${'c'.repeat(64)}.pdf`,
  acquisition:{},published_at:'2026-03-20T09:00:00.000Z',published_at_precision:'instant',available_at:'2026-03-20T09:00:00.000Z',available_date:'2026-03-20',fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',filing_source_ref:null,
  permission:'public',owner_user_id:null,license_ref:null,status:'extracted',current_extraction_id:EXT_ID,extract_lease_until:null,extract_lease_batch_id:null,extract_attempts:1,batch_id:'00000000-0000-4000-8000-0000000000b1',code_version:'test',created_at:'2026-03-20T10:00:00.000Z'};
}
function extRow():ExtractionRow{
 return {extraction_id:EXT_ID,document_id:'00000000-0000-4000-8000-0000000000d1',extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:'test',has_text_layer:true,page_count:6,pages_json_path:'extractions/x/y.pages.json',
  pages_json_sha256:'e'.repeat(64),candidates_role:'primary',candidates_status:'pending',candidates_attempts:1,candidates_lease_until:null,candidates_lease_batch_id:null,batch_id:'00000000-0000-4000-8000-0000000000b1',created_at:'2026-03-20T10:00:00.000Z'};
}
/** Generates with a fake cite that hands out ids per distinct range and resolves ids back to snippets. */
async function run(name:string|PagesJson,docClass:DocClass='annual_report',language:'zh'|'en'='zh'){
 const json=typeof name==='string'?fixture(name):name;const ids=new Map<string,string>();const calls:CiteInput[]=[];
 const cite=async(i:CiteInput)=>{calls.push(i);const k=`${i.page_no}:${i.char_start}:${i.char_end}`;if(!ids.has(k))ids.set(k,`cit-${ids.size+1}`);return ids.get(k)!;};
 const snippet=(id:string)=>{const k=[...ids].find(([,v])=>v===id)?.[0];if(!k)throw new Error(`unknown citation ${id}`);const [p,s,e]=k.split(':').map(Number);return cpSlice(json.pages.find(x=>x.page_no===p)!.text,s,e);};
 const out=await generateHkCandidates(json,{document:docRow(docClass,language),extraction:extRow(),cite});
 const where=(id:string)=>{const k=[...ids].find(([,v])=>v===id)?.[0];if(!k)throw new Error(`unknown citation ${id}`);const [page_no,start,end]=k.split(':').map(Number);const lines=json.pages.find(x=>x.page_no===page_no)!.lines;
  const at=(o:number)=>lines.find(l=>l.char_start<=o&&o<l.char_end)?.index??null;return {page_no,line_start:at(start),line_end:at(end-1)};};
 return {...out,calls,snippet,where,by:new Map(out.candidates.map(c=>[c.natural_key,c]))};
}
const pay=(c:CandidateInsert|undefined)=>c!.payload as FinancialFactPayload;
const cits=(c:CandidateInsert|undefined)=>c!.citations as FactCitations;
const infoOf=(info:{code:string;key?:string;message?:string}[])=>[...info].sort((a,b)=>a.code<b.code?-1:1);

describe('synthetic fixtures',()=>{
 it('the committed JSON equals the builder output, and every line and cell offset slices to its own text',()=>{
  for(const name of SYNTHETIC_NAMES){
   const json=fixture(name);
   expect(json).toEqual(syntheticPagesJson(name));
   for(const p of json.pages){
    for(const l of p.lines)expect(cpSlice(p.text,l.char_start,l.char_end)).toBe(l.text);
    for(const t of p.tables)for(const c of t.cells)expect(cpSlice(p.text,c.char_start,c.char_end)).toBe(c.text);
   }
  }
 });
});

describe('generateHkCandidates (spec §7.5)',()=>{
 it('annual report (traditional Chinese): 35 candidates across IS/BS/CF, no info',async()=>{
  const r=await run('annual-zh');
  expect(r.info).toEqual([]);
  expect(r.candidates).toHaveLength(35);
  for(const c of r.candidates){
   expect(c).toMatchObject({kind:'financial_fact',extractor_kind:'rule',extractor_ref:HK_EXTRACTOR_REF});
   const p=pay(c);
   expect(c.natural_key).toBe(naturalKey(p));
   expect(allowedUnits(unitKindOf(p.unit)!)).toContain(p.unit);
   expect(r.snippet(cits(c).value)).toBe(p.presented);
   expect(cits(c).period.map(x=>x.role)).toEqual(['statement_title','statement_title','column_header']);
   expect(p.consolidation).toBe('consolidated');
  }
  const rev25=r.by.get('revenue:2025-01-01:2025-12-31:12M:CNY');
  expect(pay(rev25)).toEqual({concept:'revenue',statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',value:'1234567000',presented:'1,234,567',unit:'CNY',scale:'1000',sign_flip:false,
   period_derivation:{rule:'title_duration',title_date:'2025-12-31',column_text:'二零二五年'},consolidation:'consolidated'});
  expect([cits(rev25).label,cits(rev25).unit,...cits(rev25).period.map(x=>x.citation_id)].map(r.snippet)).toEqual(['收益','人民幣千元 人民幣千元','綜合損益表','截至二零二五年十二月三十一日止年度','二零二五年']);
  expect(pay(r.by.get('revenue:2024-01-01:2024-12-31:12M:CNY'))).toMatchObject({value:'1000000000',period_derivation:{rule:'title_year_substitution',title_date:'2025-12-31',column_text:'二零二四年'}});
  expect(r.snippet(cits(r.by.get('revenue:2024-01-01:2024-12-31:12M:CNY')).period[2].citation_id)).toBe('二零二四年');
  expect(pay(r.by.get('cost_of_revenue:2025-01-01:2025-12-31:12M:CNY'))).toMatchObject({value:'734567000',presented:'(734,567)',sign_flip:true});
  expect(pay(r.by.get('income_tax:2024-01-01:2024-12-31:12M:CNY'))).toMatchObject({value:'25000000',sign_flip:true});
  expect(pay(r.by.get('net_income_parent:2025-01-01:2025-12-31:12M:CNY'))).toMatchObject({value:'160000000'});
  expect(pay(r.by.get('eps_basic:2025-01-01:2025-12-31:12M:CNY/share'))).toMatchObject({value:'0.32',scale:'1',unit:'CNY/share'});
  expect(r.snippet(cits(r.by.get('eps_basic:2025-01-01:2025-12-31:12M:CNY/share')).unit)).toBe('人民幣元');
  expect(r.by.has('eps_diluted:2025-01-01:2025-12-31:12M:CNY/share')).toBe(true);
  expect(r.by.has('eps_diluted:2024-01-01:2024-12-31:12M:CNY/share')).toBe(false);          // dash cell: no candidate, never 0
  expect(pay(r.by.get('total_assets::2025-12-31:INSTANT:CNY'))).toMatchObject({period_start:null,duration:'INSTANT',value:'2000000000',period_derivation:{rule:'title_instant'}});
  expect(pay(r.by.get('total_assets::2024-12-31:INSTANT:CNY'))).toMatchObject({period_derivation:{rule:'title_year_substitution'}});   // annual BS, year-only header
  expect(pay(r.by.get('equity_parent::2025-12-31:INSTANT:CNY'))).toMatchObject({value:'1100000000'});
  expect(pay(r.by.get('investing_cash_flow:2025-01-01:2025-12-31:12M:CNY'))).toMatchObject({value:'-120000000',sign_flip:false});
  expect(pay(r.by.get('net_change_in_cash:2025-01-01:2025-12-31:12M:CNY'))).toMatchObject({value:'50000000',sign_flip:false});
  expect(r.candidates[0].input_snapshot).toEqual({content_sha256:'c'.repeat(64),pages_json_sha256:'e'.repeat(64),page_nos:[3,4,5],extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:'test',hk_label_gen:HK_LABEL_GEN,hk_rules_version:HK_RULES_VERSION});
 });
 it('cites every distinct range once and fingerprints {natural_key, payload, four snippet kinds} deterministically',async()=>{
  const a=await run('annual-zh');const b=await run('annual-zh');
  expect(a.calls.length).toBe(new Set(a.calls.map(i=>`${i.page_no}:${i.char_start}:${i.char_end}`)).size);
  expect(a.calls.every(i=>i.char_end>i.char_start)).toBe(true);
  expect(a.candidates.map(c=>c.fingerprint)).toEqual(b.candidates.map(c=>c.fingerprint));
  const c=a.by.get('revenue:2025-01-01:2025-12-31:12M:CNY')!;
  expect(c.fingerprint).toBe(sha(canonicalJson({natural_key:c.natural_key,payload:c.payload,snippets:{value:'1,234,567',label:'收益',unit:'人民幣千元 人民幣千元',period:['綜合損益表','截至二零二五年十二月三十一日止年度','二零二五年']}})));
  expect(new Set(a.candidates.map(x=>x.fingerprint)).size).toBe(a.candidates.length);
  expect(canonicalJson({b:1,a:[{d:null,c:'x'}]})).toBe('{"a":[{"c":"x","d":null}],"b":1}');
 });
 it('interim report in English (comparison role): six months, HK$\'000, EPS in HK cents, BS full-date comparison column',async()=>{
  const r=await run('interim-en','interim_report','en');
  expect(r.info).toEqual([]);
  expect(r.candidates).toHaveLength(22);
  expect(pay(r.by.get('revenue:2025-01-01:2025-06-30:6M:HKD'))).toMatchObject({value:'500000000',scale:'1000',period_derivation:{rule:'title_duration',title_date:'2025-06-30',column_text:'2025'}});
  expect(pay(r.by.get('revenue:2024-01-01:2024-06-30:6M:HKD'))).toMatchObject({value:'450000000',period_derivation:{rule:'title_year_substitution'}});
  expect(pay(r.by.get('net_income_parent:2025-01-01:2025-06-30:6M:HKD'))).toMatchObject({value:'85000000'});
  expect(pay(r.by.get('eps_basic:2025-01-01:2025-06-30:6M:HKD/share'))).toMatchObject({value:'0.1234',presented:'12.34',scale:'0.01'});
  expect(r.snippet(cits(r.by.get('eps_basic:2025-01-01:2025-06-30:6M:HKD/share')).unit)).toBe('HK cents');
  expect(pay(r.by.get('eps_diluted:2024-01-01:2024-06-30:6M:HKD/share'))).toMatchObject({value:'0.1045'});
  expect(pay(r.by.get('total_assets::2025-06-30:INSTANT:HKD'))).toMatchObject({period_derivation:{rule:'title_instant',column_text:'30 June 2025'}});
  expect(pay(r.by.get('total_assets::2024-12-31:INSTANT:HKD'))).toMatchObject({value:'2900000000',period_derivation:{rule:'column_date',column_text:'31 December 2024'}});
  expect([...r.by.keys()].some(k=>k.startsWith('operating_cash_flow'))).toBe(false);          // no cash flow statement in the fixture
 });
 it("interim report: '港元' alone gives no multiplier (no IS candidate); '千港元' is HKD × 1000; a year-only interim BS header yields the main column only",async()=>{
  const r=await run('interim-zh-bs-years','interim_report');
  expect([...r.by.keys()].sort()).toEqual(['equity_total::2025-06-30:INSTANT:HKD','total_assets::2025-06-30:INSTANT:HKD','total_liabilities::2025-06-30:INSTANT:HKD']);
  expect(pay(r.by.get('total_assets::2025-06-30:INSTANT:HKD'))).toMatchObject({value:'1500000000',scale:'1000'});
  expect(infoOf(r.info)).toEqual([{code:'period_unparsed',key:EXT_ID,message:'BS:interim_year_only'},{code:'unit_ambiguous',key:EXT_ID,message:'IS:no_multiplier'}]);
 });
 it('bilingual interim (0268-shaped): both scripts per page, label-only attribution row, EPS sub-unit below the heading, two-line CF labels, tax credit',async()=>{
  const r=await run('interim-bilingual','interim_report');
  expect(r.info).toEqual([]);
  expect(r.candidates).toHaveLength(32);
  expect([...r.by.keys()].some(k=>k.includes('comprehensive'))).toBe(false);
  const rev=r.by.get('revenue:2026-01-01:2026-06-30:6M:CNY');
  expect(pay(rev)).toMatchObject({value:'3625422000',presented:'3,625,422',scale:'1000',period_derivation:{rule:'title_duration',title_date:'2026-06-30',column_text:'二零二六年'}});
  expect([cits(rev).label,cits(rev).unit,...cits(rev).period.map(x=>x.citation_id)].map(r.snippet)).toEqual(['Revenue from contracts with customers 與客戶之間的合同產生的收入','Notes RMB’000 RMB’000','CONDENSED CONSOLIDATED INTERIM INCOME STATEMENT','For the six months ended 30 June 2026','二零二六年']);
  expect(pay(r.by.get('income_tax:2026-01-01:2026-06-30:6M:CNY'))).toMatchObject({value:'-10185000',presented:'10,185',sign_flip:true});
  expect(pay(r.by.get('net_income:2025-01-01:2025-06-30:6M:CNY'))).toMatchObject({value:'-109105000',presented:'(109,105)'});
  expect(pay(r.by.get('net_income_parent:2026-01-01:2026-06-30:6M:CNY'))).toMatchObject({value:'54497000'});
  const eps=r.by.get('eps_basic:2025-01-01:2025-06-30:6M:CNY/share');
  expect(pay(eps)).toMatchObject({value:'-0.0278',presented:'(2.78)',scale:'0.01'});
  expect(r.snippet(cits(eps).unit)).toBe('RMB cents');
  expect(pay(r.by.get('eps_diluted:2026-01-01:2026-06-30:6M:CNY/share'))).toMatchObject({value:'0.0155'});
  expect(pay(r.by.get('total_assets::2025-12-31:INSTANT:CNY'))).toMatchObject({value:'14586089000',period_derivation:{rule:'column_date',column_text:'31 December 2025'}});
  const op=r.by.get('operating_cash_flow:2026-01-01:2026-06-30:6M:CNY');
  expect(pay(op)).toMatchObject({value:'142450000'});
  expect(r.snippet(cits(op).label)).toBe('Net cash inflow/(outflow) from 經營活動產生╱（所用）淨現金\noperating activities');   // two-line label cited as one range
  expect(pay(r.by.get('net_change_in_cash:2026-01-01:2026-06-30:6M:CNY'))).toMatchObject({value:'-129836000',sign_flip:false});
  expect(pay(r.by.get('cash::2026-06-30:INSTANT:CNY'))).toMatchObject({value:'1563484000',period_derivation:{rule:'title_instant'}});
 });
 it('generation (R2-P2-1, R2-P1-1): currency and multiplier on separate lines replay; a 仙 EPS cites its table currency, and a payload changed to USD/share is blocked',async()=>{
  const json=buildPagesJson('split-unit',[{page_no:1,lines:['綜合損益表','截至二零二五年十二月三十一日止年度',{header:['二零二五年','二零二四年']},{header:['人民幣','人民幣']},{header:['千元','千元']},
   {label:'收益',values:['1,000','900']},'每股盈利（仙）',{label:'基本',values:['12.34','10.50']}]}]);
  const r=await run(json);
  const rev=r.by.get('revenue:2025-01-01:2025-12-31:12M:CNY');
  expect(pay(rev)).toMatchObject({value:'1000000',scale:'1000'});
  expect(r.snippet(cits(rev).unit)).toBe('人民幣 人民幣\n千元 千元');                          // one range spanning both evidence lines
  const eps=r.by.get('eps_basic:2025-01-01:2025-12-31:12M:CNY/share');
  expect(pay(eps)).toMatchObject({value:'0.1234',unit:'CNY/share',scale:'0.01'});
  expect(r.snippet(cits(eps).unit)).toBe('仙');
  expect(r.snippet(cits(eps).unit_currency!)).toBe('人民幣 人民幣\n千元 千元');
  // replay through runHkChecks: the generated candidates pass value_replays, a payload forged to USD/share is blocked (scale_mismatch)
  const verify=new Map<string,CitationCheck|null>();
  for(const c of r.candidates)for(const id of citationIdsOf(c.citations as FactCitations))verify.set(id,{integrity:'ok',currentExtraction:true,snippet:r.snippet(id),...r.where(id)});
  const asRow=(c:CandidateInsert,over:Partial<FinancialFactPayload>={}):CandidateRow=>({candidate_id:`cand-${c.natural_key}`,document_id:'d',extraction_id:EXT_ID,...c,payload:{...c.payload,...over},checks:[],checks_passed:false,status:'candidate',decision_kind:null,decided_by:null,approval_id:null,decided_at:null,inherited_from:null,batch_id:'b',created_at:'2026-03-20T10:00:00.000Z'});
  const replays=(c:CandidateRow)=>runHkChecks([c],{verify,priorFacts:[],enCandidates:[],annual:true})[0].checks.find(x=>x.check==='value_replays')!;
  expect(replays(asRow(rev!)).passed).toBe(true);
  expect(replays(asRow(eps!)).passed).toBe(true);
  const forged=replays(asRow(eps!,{unit:'USD/share'}));
  expect(forged).toMatchObject({passed:false,detail:{reason:'scale_mismatch',recorded:{unit:'USD/share'},evidence:{unit:'CNY/share'}}});
  expect(replays(asRow(rev!,{scale:'1000000',value:'1000000000'})).passed).toBe(false);
 });

 it('committed table shape (tables/1.0 after the Task 9 review): wrapped and glued-on lines are extra col-0 cells of the row, results equal the plain shape',async()=>{
  const plain=fixture('interim-bilingual');
  // glue every text-only line directly above a table row (up to two) into that row as an extra col-0 cell, the way extract/tables.ts does
  const glued:PagesJson={...plain,pages:plain.pages.map(pg=>({...pg,tables:pg.tables.map(t=>{
   const inTable=new Set(pg.tables.flatMap(x=>x.cells.map(c=>c.line_index)));const cells=[...t.cells];
   for(const [lineIndex,row] of [...new Set(t.cells.map(c=>c.line_index))].map(li=>[li,t.cells.find(c=>c.line_index===li)!.row] as const)){
    for(let k=lineIndex-1;k>=lineIndex-2&&k>=0;k--){
     const l=pg.lines[k];
     if(inTable.has(k))break;
     cells.push({row,col:0,text:l.text,bbox:null,line_index:k,char_start:l.char_start,char_end:l.char_end,numeric:false});inTable.add(k);
    }
   }
   return {...t,cells};
  })}))};
  expect(glued.pages.flatMap(pg=>pg.tables.flatMap(t=>t.cells)).length).toBeGreaterThan(plain.pages.flatMap(pg=>pg.tables.flatMap(t=>t.cells)).length);
  const a=await run(plain,'interim_report'),b=await run(glued,'interim_report');
  expect(b.info).toEqual([]);
  expect(b.candidates).toHaveLength(32);
  expect(b.candidates.map(c=>c.natural_key)).toEqual(a.candidates.map(c=>c.natural_key));
  expect(b.candidates.map(c=>pay(c).value)).toEqual(a.candidates.map(c=>pay(c).value));
  expect(b.snippet(cits(b.by.get('operating_cash_flow:2026-01-01:2026-06-30:6M:CNY')).label)).toBe('Net cash inflow/(outflow) from 經營活動產生╱（所用）淨現金\noperating activities');
  expect(b.snippet(cits(b.by.get('eps_basic:2025-01-01:2025-06-30:6M:CNY/share')).unit)).toBe('RMB cents');
  expect(b.snippet(cits(b.by.get('eps_basic:2025-01-01:2025-06-30:6M:CNY/share')).label)).toBe('– Basic －基本');   // the glued heading lines do not leak into the label
 });

 const stmt=(kind:'IS'|'BS'|'CF',lines:PageSpecLine[],unit="RMB'000")=>buildPagesJson('probe',[{page_no:1,lines:kind==='IS'?['Consolidated Statement of Profit or Loss','For the year ended 31 December 2025',{header:['2025','2024']},{header:[unit,unit]},...lines]
  :kind==='BS'?['Consolidated Statement of Financial Position','As at 31 December 2025',{header:['2025','2024']},{header:[unit,unit]},...lines]
  :['Consolidated Statement of Cash Flows','For the year ended 31 December 2025',{header:['2025','2024']},{header:[unit,unit]},...lines]}]);
 /** Appends a trailing label cell (a bilingual translation after the numbers) to the LAST line of the single page. */
 const withTrailing=(json:PagesJson,text:string):PagesJson=>{
  const pg=json.pages[0];const l=pg.lines[pg.lines.length-1];const n=Array.from(text).length;const start=l.char_end+1;
  const t=pg.tables[pg.tables.length-1];const row=Math.max(...t.cells.map(c=>c.row));
  const line={...l,text:`${l.text} ${text}`,char_end:start+n,items:[...l.items,{text,x0:600,x1:630,y:l.y,h:10,char_start:start,char_end:start+n}]};
  const cell={row,col:t.col_count,text,bbox:{x0:600,y0:l.y,x1:630,y1:l.y+10},line_index:l.index,char_start:start,char_end:start+n,numeric:false};
  return {...json,pages:[{...pg,text:`${pg.text} ${text}`,lines:[...pg.lines.slice(0,-1),line],tables:[...pg.tables.slice(0,-1),{...t,cells:[...t.cells,cell]}]}]};
 };
 it('a trailing bilingual cell is read with the leading label: a different concept or a sign word makes the row label_ambiguous; an agreeing translation is not cited',async()=>{
  const is=(last:PageSpecLine)=>stmt('IS',[{label:'Revenue',values:['1,000','900']},last]);
  const conflict=await run(withTrailing(is({label:'Gross profit',values:['100','90']}),'收益'),'annual_report','en');
  expect(conflict.by.has('gross_profit:2025-01-01:2025-12-31:12M:CNY')).toBe(false);
  expect(conflict.by.has('revenue:2025-01-01:2025-12-31:12M:CNY')).toBe(true);
  expect(conflict.info).toEqual([{code:'label_ambiguous',key:EXT_ID,message:'IS:row:Gross profit'}]);
  const agree=await run(withTrailing(is({label:'Gross profit',values:['100','90']}),'毛利'),'annual_report','en');
  expect(agree.info).toEqual([]);
  expect(agree.snippet(cits(agree.by.get('gross_profit:2025-01-01:2025-12-31:12M:CNY')).label)).toBe('Gross profit');
  const sign=await run(withTrailing(is({label:'Income tax',values:['10','20']}),'所得稅沖回'),'annual_report','en');
  expect([...sign.by.keys()].some(k=>k.startsWith('income_tax'))).toBe(false);
  expect(sign.info).toEqual([{code:'label_ambiguous',key:EXT_ID,message:'IS:row:Income tax'}]);
 });
 it('a continuation that changes the meaning blocks the candidate (below: never cited; above: contiguous label text only)',async()=>{
  const tax=await run(stmt('IS',[{label:'Revenue',values:['1,000','900']},{label:'Income tax',values:['10','20']},'credit']),'annual_report','en');
  expect([...tax.by.keys()].some(k=>k.startsWith('income_tax'))).toBe(false);          // would have been +10000
  expect(tax.info).toEqual([{code:'label_ambiguous',key:EXT_ID,message:'IS:row:Income tax'}]);
  const eq=await run(stmt('BS',[{label:'Total assets',values:['300','280']},{label:'Total equity',values:['100','90']},'and liabilities']),'annual_report','en');
  expect([...eq.by.keys()].some(k=>k.startsWith('equity_total'))).toBe(false);
  expect(eq.by.has('total_assets::2025-12-31:INSTANT:CNY')).toBe(true);
  const low=await run(stmt('IS',[{label:'Gross profit',values:['5','4']},'unrelated text',{label:'Revenue',values:['1,000','900']}]),'annual_report','en');
  expect(low.by.has('gross_profit:2025-01-01:2025-12-31:12M:CNY')).toBe(false);          // lower-case text directly below reads as a continuation that names nothing: not clean
  expect(low.info).toEqual([{code:'label_ambiguous',key:EXT_ID,message:'IS:row:Gross profit'}]);
  expect(low.by.has('revenue:2025-01-01:2025-12-31:12M:CNY')).toBe(true);                 // Revenue starts a label: the text above it is not its continuation
  // a capitalised line is a heading or the next label, never attached to a row by proximity: nothing blocked, nothing cited from it
  const cap=await run(stmt('IS',[{label:'Gross profit',values:['5','4']},'Unrelated heading',{label:'Revenue',values:['1,000','900']}]),'annual_report','en');
  expect(cap.info).toEqual([]);
  expect(cap.snippet(cits(cap.by.get('revenue:2025-01-01:2025-12-31:12M:CNY')).label)).toBe('Revenue');
 });
 it('a two-line label (label-only line directly above) is cited as one contiguous range without numbers; below-only text never makes a label',async()=>{
  const above=await run(stmt('CF',['Net cash inflow/(outflow) from',{label:'operating activities',values:['10','20']},{label:'Net cash used in financing activities',values:['(5)','(6)']}]),'annual_report','en');
  const op=above.by.get('operating_cash_flow:2025-01-01:2025-12-31:12M:CNY');
  expect(pay(op)).toMatchObject({value:'10000'});
  expect(above.snippet(cits(op).label)).toBe('Net cash inflow/(outflow) from\noperating activities');
  expect(above.info).toEqual([]);
  const below=await run(stmt('CF',[{label:'Net cash inflow/(outflow) from',values:['10','20']},'operating activities',{label:'Net cash used in financing activities',values:['(5)','(6)']}]),'annual_report','en');
  expect([...below.by.keys()].some(k=>k.startsWith('operating_cash_flow'))).toBe(false);   // the label exists only through text below the numbers
  expect(below.by.has('financing_cash_flow:2025-01-01:2025-12-31:12M:CNY')).toBe(true);   // a capitalised label starts afresh: the orphan line above is not its continuation
  expect(below.info).toEqual([{code:'label_ambiguous',key:EXT_ID,message:'CF:row:Net cash inflow/(outflow) from'}]);
 });
 it('EPS currency and sub-unit are resolved across all the evidence lines (T14-02, T14-04, T14-05)',async()=>{
  const eps=(head:PageSpecLine[],unit="HK$'000")=>stmt('IS',[{label:'Revenue',values:['1,000','900']},...head,{label:'Basic',values:['12','10']}],unit);
  const key='eps_basic:2025-01-01:2025-12-31:12M:';
  const adj=await run(eps(['Earnings per share (RMB)','(cents)']),'annual_report','en');
  expect(pay(adj.by.get(`${key}CNY/share`))).toMatchObject({value:'0.12',unit:'CNY/share',scale:'0.01'});
  expect(adj.snippet(cits(adj.by.get(`${key}CNY/share`)).unit)).toBe('RMB)\n(cents');          // one range over both lines
  expect(cits(adj.by.get(`${key}CNY/share`)).unit_currency).toBeUndefined();
  const far=await run(eps(['Earnings per share (RMB)','a line between','(cents)']),'annual_report','en');
  expect(pay(far.by.get(`${key}CNY/share`))).toMatchObject({value:'0.12'});
  expect(far.snippet(cits(far.by.get(`${key}CNY/share`)).unit)).toBe('cents');
  expect(far.snippet(cits(far.by.get(`${key}CNY/share`)).unit_currency!)).toBe('RMB');
  const us=await run(eps(['Earnings per share (US cents)'],"RMB'000"),'annual_report','en');
  expect(pay(us.by.get(`${key}USD/share`))).toMatchObject({value:'0.12',unit:'USD/share'});
  expect(us.snippet(cits(us.by.get(`${key}USD/share`)).unit)).toBe('US cents');
  expect(cits(us.by.get(`${key}USD/share`)).unit_currency).toBeUndefined();
  expect([...us.by.keys()].some(k=>k.endsWith('CNY/share'))).toBe(false);
  const bare=await run(eps(['每股盈利（分）'],'人民幣千元'),'annual_report','en');
  expect(pay(bare.by.get(`${key}CNY/share`))).toMatchObject({value:'0.12',scale:'0.01'});
  expect(bare.snippet(cits(bare.by.get(`${key}CNY/share`)).unit)).toBe('（分）');
  expect(bare.snippet(cits(bare.by.get(`${key}CNY/share`)).unit_currency!)).toContain('人民幣千元');
  const eur=await run(eps(['Earnings per share (EUR cents)']),'annual_report','en');
  expect([...eur.by.keys()].some(k=>k.startsWith('eps_'))).toBe(false);
  expect(eur.info).toEqual([{code:'unit_ambiguous',key:EXT_ID,message:'IS:eps_basic:eps_qualifier:EUR'}]);
  const mixed=await run(eps(['Earnings per share (HK cents, RMB)']),'annual_report','en');
  expect([...mixed.by.keys()].some(k=>k.startsWith('eps_'))).toBe(false);
  expect(mixed.info).toEqual([{code:'unit_ambiguous',key:EXT_ID,message:'IS:eps_basic:eps_currencies:CNY,HKD'}]);
 });
 it('balance-sheet dates staggered over two header lines are all placed (Codex review P2)',async()=>{
  const json=buildPagesJson('stagger',[{page_no:1,lines:['Consolidated Statement of Financial Position','As at 31 December 2025',{header:['31 December 2025','']},{header:['','31 December 2024']},{header:["RMB'000","RMB'000"]},
   {label:'Total assets',values:['3,000','2,900']},{label:'Total liabilities',values:['1,000','950']}]}]);
  const r=await run(json,'annual_report','en');
  expect(r.info).toEqual([]);
  expect([...r.by.keys()].sort()).toEqual(['total_assets::2024-12-31:INSTANT:CNY','total_assets::2025-12-31:INSTANT:CNY','total_liabilities::2024-12-31:INSTANT:CNY','total_liabilities::2025-12-31:INSTANT:CNY']);
  expect(pay(r.by.get('total_assets::2024-12-31:INSTANT:CNY'))).toMatchObject({value:'2900000',period_derivation:{rule:'column_date',column_text:'31 December 2024'}});
 });
 it('tax credit labels (P1-3): positive, parenthesised and zero amounts all become −|x|; sign_flip only when the printed sign changes',async()=>{
  const isPage=(page_no:number,tax:[string,string])=>({page_no,lines:['Consolidated Statement of Profit or Loss','For the year ended 31 December 2025',{header:['2025','2024'] as [string,string]},{header:["RMB'000","RMB'000"] as [string,string]},
   {label:'Revenue',values:['1,000','900'] as [string,string]},{label:'Income tax credit',values:tax}]});
  const a=await run(buildPagesJson('tax-credit-a',[isPage(1,['(10,185)','24,458'])]),'annual_report','en');
  expect(pay(a.by.get('income_tax:2025-01-01:2025-12-31:12M:CNY'))).toMatchObject({value:'-10185000',presented:'(10,185)',sign_flip:false});
  expect(pay(a.by.get('income_tax:2024-01-01:2024-12-31:12M:CNY'))).toMatchObject({value:'-24458000',presented:'24,458',sign_flip:true});
  const b=await run(buildPagesJson('tax-credit-b',[isPage(1,['0','(0)'])]),'annual_report','en');
  expect(pay(b.by.get('income_tax:2025-01-01:2025-12-31:12M:CNY'))).toMatchObject({value:'0',presented:'0',sign_flip:false});
  expect(pay(b.by.get('income_tax:2024-01-01:2024-12-31:12M:CNY'))).toMatchObject({value:'0',presented:'(0)',sign_flip:false});
 });
 it('edge cases: not consolidated, non-consecutive statement pages, conflicting duplicate labels (identical duplicates kept once), dash cells',async()=>{
  const r=await run('edge-cases');
  expect([...r.by.keys()].sort()).toEqual(['cash::2024-12-31:INSTANT:CNY','equity_total::2024-12-31:INSTANT:CNY','equity_total::2025-12-31:INSTANT:CNY','total_liabilities::2024-12-31:INSTANT:CNY','total_liabilities::2025-12-31:INSTANT:CNY']);
  expect(pay(r.by.get('cash::2024-12-31:INSTANT:CNY'))).toMatchObject({value:'250000',presented:'250'});
  expect(infoOf(r.info)).toEqual([{code:'label_ambiguous',key:EXT_ID,message:'BS:total_assets'},{code:'locate_ambiguous',key:EXT_ID,message:'CF:3,5'},{code:'not_consolidated',key:EXT_ID,message:'IS:p1'}]);
 });
});
