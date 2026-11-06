// src/lib/dq/filer-categories.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {applicableCategory,computeExpectations} from './calendar';
import type {FilerCategoryRow} from './calendar';
import {coverOf,latestTenKs,parseFilerCategory,submissionsView,syncFilerCategories} from './filer-categories';
import type {SubmissionsView} from './filer-categories';
import {memoryRawStore} from './raw-store';
import type {Budget,FactsDb,ScopeRow} from '../facts/types';

const ISSUER='00000000-0000-4000-8000-0000000000f1';
const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
/** Minimal inline-XBRL 10-K cover: namespaces declared, dei facts as ix:nonNumeric. */
const cover=(category:string|null,periodEnd='2024-12-31')=>`<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:dei="http://xbrl.sec.gov/dei/2023" xmlns:xbrli="http://www.xbrl.org/2003/instance"><body>
<ix:header><ix:resources><xbrli:context id="c1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>${periodEnd}</xbrli:endDate></xbrli:period></xbrli:context></ix:resources></ix:header>
<p>Annual report for the fiscal year ended <ix:nonNumeric name="dei:DocumentPeriodEndDate" contextRef="c1">${periodEnd}</ix:nonNumeric></p>
${category===null?'':`<p>Filer category: <ix:nonNumeric name="dei:EntityFilerCategory" contextRef="c1">${category}</ix:nonNumeric></p>`}
</body></html>`;
const entry=(accn:string,filingDate:string,reportDate:string,p:Partial<SubmissionsView['entries'][number]>={})=>({accessionNumber:accn,filingDate,reportDate,form:'10-K',primaryDocument:`${accn}.htm`,isInlineXBRL:true,...p});

describe('parseFilerCategory (dei:EntityFilerCategory cover text)',()=>{
 it.each([
  ['Large Accelerated Filer','large_accelerated',null],
  ['Large accelerated filer','large_accelerated',null],
  ['Accelerated Filer','accelerated',null],
  ['Non-accelerated Filer','non_accelerated',null],
  ['Non-Accelerated Filer','non_accelerated',null],
  ['Smaller Reporting Accelerated Filer','accelerated',true],
  ['Non-accelerated Filer  Smaller Reporting Company','non_accelerated',true],
 ])('%s → %s (SRC %s)',(raw,acceleration,src)=>{expect(parseFilerCategory(raw)).toEqual({acceleration,smaller_reporting:src});});
 it.each(['Smaller Reporting Company','Emerging Growth Company','','—'])('%j alone → no usable category',raw=>{expect(parseFilerCategory(raw)).toBeNull();});
});

describe('cover and 10-K selection',()=>{
 it('reads dei values from the inline XBRL cover',()=>{
  expect(coverOf(cover('Large Accelerated Filer'))).toEqual({category:'Large Accelerated Filer',periodEnd:'2024-12-31'});
  expect(coverOf(cover(null))).toEqual({category:null,periodEnd:'2024-12-31'});
 });
 it('takes the latest 3 original 10-Ks by filing date, never amendments',()=>{
  const v:SubmissionsView={cik10:'0000000001',sha256:'s',category:null,fiscalYearEnd:'1231',entries:[
   entry('a1','2022-02-20','2021-12-31'),entry('a2','2023-02-20','2022-12-31'),entry('a3','2024-02-20','2023-12-31'),entry('a4','2025-02-20','2024-12-31'),
   entry('a5','2025-03-01','2024-12-31',{form:'10-K/A'}),entry('a6','2025-04-01','2025-03-31',{form:'10-Q'})]};
  expect(latestTenKs(v).map(e=>e.accessionNumber)).toEqual(['a4','a3','a2']);
 });
});

describe('N−1 applicability (Rule 12b-2)',()=>{
 const row=(fy:number,acceleration:FilerCategoryRow['acceleration']):FilerCategoryRow=>({issuer_id:ISSUER,fiscal_year:fy,acceleration,smaller_reporting:null,category_raw:acceleration,source:'ixbrl_dei',accession:`x-${fy}`,evidence_sha256:'e',as_of:'2026-11-01'});
 it('fiscal year N uses the FY N−1 cover; the FY N cover is ignored for N',()=>{
  expect(applicableCategory([row(2025,'accelerated'),row(2026,'large_accelerated')],2026)?.acceleration).toBe('accelerated');
 });
 it('no FY N−1 cover → the calendar has no rule for FY N',()=>{
  const rows=computeExpectations({profile:{issuer_id:ISSUER,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:null,as_of:'2026-11-01'},categories:[row(2026,'large_accelerated')],filings:[],upstream:{lookup:'ok',us:[]},today:'2026-11-05'});
  expect(rows.every(r=>r.deadline_state==='no_rule'&&r.due_rule==='none.no_category_for_fy/1')).toBe(true);
 });
});

describe('syncFilerCategories',()=>{
 const scopeRow=(issuer:string,cik:string,priority=10):ScopeRow=>({issuer_id:issuer,market:'US',reasons:['t'],priority,fetch_key:cik,next_due_at:'2026-01-01T00:00:00Z',lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
 const OTHER='00000000-0000-4000-8000-0000000000f2';
 function harness(docs:Record<string,string>,view:SubmissionsView|Error){
  const tables=memoryTableClient({issuer_filer_categories:['issuer_id','fiscal_year'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
  const raw=memoryRawStore();
  const urls:string[]=[];
  const deps={tables,raw,db:{scopeAll:async()=>[scopeRow(ISSUER,'0000000001'),scopeRow(OTHER,'0000000002',0)]} as Pick<FactsDb,'scopeAll'>,
   submissions:async(cik:string)=>{if(view instanceof Error)throw view;expect(cik).toBe('0000000001');return view;},
   fetchDocument:async(url:string)=>{urls.push(url);const name=url.split('/').at(-1)!;const d=docs[name];if(d===undefined)throw new Error('404');return new TextEncoder().encode(d);},
   now:()=>new Date('2026-11-05T03:00:00Z'),budget:budget(),codeVersion:'c'.repeat(40)};
  return {deps,tables,raw,urls};
 }
 const view:SubmissionsView={cik10:'0000000001',sha256:'sub-sha',category:'Large accelerated filer',fiscalYearEnd:'1231',entries:[
  entry('0000000001-25-000010','2025-02-20','2024-12-31'),entry('0000000001-24-000010','2024-02-21','2023-12-31'),entry('0000000001-23-000010','2023-02-22','2022-12-31'),entry('0000000001-22-000010','2022-02-23','2021-12-31')]};
 const docs={'0000000001-25-000010.htm':cover('Large Accelerated Filer','2024-12-31'),'0000000001-24-000010.htm':cover('Accelerated Filer','2023-12-31'),'0000000001-23-000010.htm':cover('Smaller Reporting Company','2022-12-31')};
 it('writes one row per usable cover with the stored document hash, skips SRC-only covers, records sec.filer_category, and only scope priority>0',async()=>{
  const {deps,tables,raw,urls}=harness(docs,view);
  const r=await syncFilerCategories(deps,{limit:25,dryRun:false,triggeredBy:'script'});
  expect(urls).toEqual(['https://www.sec.gov/Archives/edgar/data/1/000000000125000010/0000000001-25-000010.htm','https://www.sec.gov/Archives/edgar/data/1/000000000124000010/0000000001-24-000010.htm','https://www.sec.gov/Archives/edgar/data/1/000000000123000010/0000000001-23-000010.htm']);
  const stored=tables.rows('issuer_filer_categories').sort((a,b)=>Number(a.fiscal_year)-Number(b.fiscal_year));
  expect(stored.map(s=>[s.fiscal_year,s.acceleration,s.category_raw,s.accession])).toEqual([[2023,'accelerated','Accelerated Filer','0000000001-24-000010'],[2024,'large_accelerated','Large Accelerated Filer','0000000001-25-000010']]);
  expect([...raw.objects.keys()].filter(k=>!k.endsWith('.meta.json'))).toHaveLength(3);   // each document also has an immutable .meta.json sidecar
  for(const s of stored)expect([...raw.objects.keys()].some(k=>k.includes(String(s.evidence_sha256)))).toBe(true);
  expect(r.counts).toMatchObject({fetched:2,inserted:2,failed:0});
  expect(r.status).toBe('success');
  expect(r.errors).toContainEqual({code:'skipped_summary',key:'filer-categories',message:JSON.stringify({category_unusable:1})});
  const rec=tables.rows('dq_reconciliations');
  expect(rec).toHaveLength(1);
  expect(rec[0]).toMatchObject({pair:'sec.filer_category',kind:'text',outcome:'compared',passed:true,natural_key:'0000000001:0000000001-25-000010',left_value:null,right_value:null});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'dq.filer-categories',status:'fresh'});
 });
 it('a cover that disagrees with submissions category records passed=false (record only, nothing else changes)',async()=>{
  const {deps,tables}=harness(docs,{...view,category:'Non-accelerated filer'});
  const r=await syncFilerCategories(deps,{limit:25,dryRun:false,triggeredBy:'script'});
  expect(tables.rows('dq_reconciliations')[0].passed).toBe(false);
  expect(r.rows).toHaveLength(2);
 });
 it('dry run writes nothing; an unavailable submissions fetch fails that issuer',async()=>{
  const dry=harness(docs,view);
  const r=await syncFilerCategories(dry.deps,{limit:25,dryRun:true,triggeredBy:'script'});
  expect(r.status).toBe('dry_run');expect(r.rows).toHaveLength(2);
  expect(dry.tables.rows('issuer_filer_categories')).toHaveLength(0);expect(dry.tables.rows('ingest_batches')).toHaveLength(0);expect(dry.tables.rows('dq_reconciliations')).toHaveLength(0);
  const down=harness(docs,new Error('sec_unavailable'));
  const f=await syncFilerCategories(down.deps,{limit:25,dryRun:false,triggeredBy:'script'});
  expect(f.status).toBe('failed');expect(f.errors[0]).toMatchObject({code:'sec_unavailable',key:ISSUER});
 });
 it('a missing document is a failed document, the others still land; non-inline 10-Ks are skipped',async()=>{
  const {deps}=harness({'0000000001-25-000010.htm':docs['0000000001-25-000010.htm']},{...view,entries:[...view.entries.slice(0,2),entry('0000000001-23-000010','2023-02-22','2022-12-31',{isInlineXBRL:false})]});
  const r=await syncFilerCategories(deps,{limit:25,dryRun:false,triggeredBy:'script'});
  expect(r.counts).toMatchObject({fetched:2,inserted:1,failed:1});
  expect(r.status).toBe('partial');
  expect(r.errors).toContainEqual({code:'document_unavailable',key:`${ISSUER}:0000000001-24-000010`});
  expect(r.errors).toContainEqual({code:'skipped_summary',key:'filer-categories',message:JSON.stringify({not_inline_xbrl:1})});
 });
 it('submissionsView keeps only the fields the calendar reads',()=>{
  const parsed={cik:'1',name:'X',category:'Accelerated filer',fiscalYearEnd:'0630',tickers:['X'],tickerPositions:[0],exchanges:[],formerNames:[],files:[],
   filings:[{accessionNumber:'a',filingDate:'2025-08-01',reportDate:'',acceptanceDateTime:null,form:'10-K',primaryDocument:'a.htm',isInlineXBRL:true,page:'main'},
    {accessionNumber:'b',filingDate:'2025-05-01',reportDate:null,acceptanceDateTime:null,form:'10-Q',primaryDocument:null,isInlineXBRL:null,page:'main'}]};
  expect(submissionsView({cik:'1',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'s',path:'sec-submissions/s.json'},pages:[],parsed,complete:true}))
   .toEqual({cik10:'0000000001',sha256:'s',category:'Accelerated filer',fiscalYearEnd:'0630',entries:[{accessionNumber:'a',filingDate:'2025-08-01',reportDate:null,form:'10-K',primaryDocument:'a.htm',isInlineXBRL:true},
    {accessionNumber:'b',filingDate:'2025-05-01',reportDate:null,form:'10-Q',primaryDocument:'',isInlineXBRL:false}]});
 });
});
