// src/lib/documents/sources/edgar.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {EDGAR_FILES_VERIFIED,edgarAdapter} from './edgar';
import {makeDocBudget,politeHttp} from './shared';
import type {DocScopeRow} from '../types';

const fx=(n:string)=>readFileSync(new URL(`../../research/ingest/__fixtures__/collectors/${n}`,import.meta.url),'utf8');
const budget=makeDocBudget(null);
const NOW=new Date('2026-11-06T00:00:00Z');
const scope=(o:Partial<DocScopeRow>={}):DocScopeRow=>({issuer_id:'i',source:'edgar',reasons:[],priority:10,fetch_key:'0001321655',backfill_cursor:{},backfill_done:false,poll_cursor:{},next_due_at:NOW.toISOString(),lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:NOW.toISOString(),...o});
function http(routes:Record<string,string>){
 const urls:string[]=[];
 return {urls,http:politeHttp({fetch:async u=>{urls.push(String(u));const body=routes[String(u)];return body===undefined?new Response('',{status:404}):new Response(body);},sleep:async()=>{}})};
}
const SUB='https://data.sec.gov/submissions/CIK0001321655.json';

describe('edgarAdapter',()=>{
 it('is recent-only with a coverage gap until files[] is verified (spec §15 q1)',()=>{
  expect(EDGAR_FILES_VERIFIED).toBe(false);
  const a=edgarAdapter({http:politeHttp()});
  expect(a.coverageGap).toBe('edgar_files_unverified');
  expect(a.segments(scope(),'backfill',2016,NOW)).toEqual([{id:'recent',from:'2016-01-01',to:'2026-11-06'}]);
  expect(edgarAdapter({http:politeHttp(),filesVerified:true}).segments(scope(),'backfill',2016,NOW).map(s=>s.id)).toEqual(['history','recent']);
  expect(edgarAdapter({http:politeHttp(),filesVerified:true}).coverageGap).toBeNull();
  expect(a.segments(scope({backfill_done:true,last_success_at:'2026-11-05T03:30:00.000Z'}),'poll',2016,NOW)[0].id).toBe('poll:2026-11-04');
 });
 it('lists the recorded submissions: default forms only, sorted, with source_ref, URL and the required index asset',async()=>{
  const {http:h,urls}=http({[SUB]:fx('edgar-submissions-1321655.json')});
  const rows=await edgarAdapter({http:h}).list(scope(),{id:'recent',from:'2016-01-01',to:'2026-11-06'},budget);
  expect(urls).toEqual([SUB]);
  expect(rows.map(r=>[r.form_type,r.source_ref])).toEqual([
   ['8-K','0001321655-26-000033/pltr-20260603.htm'],
   ['8-K','0001321655-26-000039/pltr-20260803.htm'],
   ['10-Q','0001321655-26-000041/pltr-20260630.htm'],
  ]);
  expect(rows[2]).toMatchObject({source_url:'https://www.sec.gov/Archives/edgar/data/1321655/000132165526000041/pltr-20260630.htm',published_at:'2026-08-03T22:06:38.000Z',precision:'instant',
   assets:[{role:'filing_index',filename:'index.json',url:'https://www.sec.gov/Archives/edgar/data/1321655/000132165526000041/index.json',required:true}]});
 });
 it('filters by the segment window on the acceptance instant and honours extra forms',async()=>{
  const {http:h}=http({[SUB]:fx('edgar-submissions-1321655.json')});
  const a=edgarAdapter({http:h,forms:['10-Q','4']});
  const rows=await a.list(scope(),{id:'poll:2026-08-03',from:'2026-08-03',to:'2026-08-03'},budget);
  expect(rows.map(r=>r.form_type)).toEqual(['10-Q']);
  expect((await a.list(scope(),{id:'poll:2026-09-17',from:'2026-09-17',to:'2026-09-18'},budget)).map(r=>r.form_type)).toEqual(['4']);
 });
 it('history segment (verified mode) reads each files[] page with the recent shape; malformed pages are layout_changed',async()=>{
  const sub=JSON.parse(fx('edgar-submissions-1321655.json'));
  sub.filings.files=[{name:'CIK0001321655-submissions-001.json',filingFrom:'2015-01-01',filingTo:'2019-12-31'},{name:'CIK0001321655-submissions-002.json',filingFrom:'2005-01-01',filingTo:'2014-12-31'}];
  const page={accessionNumber:['0001321655-19-000001'],acceptanceDateTime:['2019-02-26T21:00:00.000Z'],form:['10-K'],primaryDocument:['pltr-10k.htm'],primaryDocDescription:['10-K'],filingDate:['2019-02-26']};
  const {http:h,urls}=http({[SUB]:JSON.stringify(sub),'https://data.sec.gov/submissions/CIK0001321655-submissions-001.json':JSON.stringify(page)});
  const rows=await edgarAdapter({http:h,filesVerified:true}).list(scope(),{id:'history',from:'2016-01-01',to:'2026-11-06'},budget);
  expect(rows.map(r=>r.source_ref)).toEqual(['0001321655-19-000001/pltr-10k.htm']);
  expect(urls).not.toContain('https://data.sec.gov/submissions/CIK0001321655-submissions-002.json');   // ends before the window
  const bad=http({[SUB]:JSON.stringify({filings:{recent:{}}})});
  await expect(edgarAdapter({http:bad.http}).list(scope(),{id:'recent',from:'2016-01-01',to:'2026-11-06'},budget)).rejects.toThrow('layout_changed');
  await expect(edgarAdapter({http:bad.http}).list(scope({fetch_key:'1321655'}),{id:'recent',from:'2016-01-01',to:'2026-11-06'},budget)).rejects.toThrow('invalid_fetch_key');
 });
 it('assetsFromIndex names the *_htm.xml XBRL instance as an optional asset (assumed index.json shape)',()=>{
  const a=edgarAdapter({http:politeHttp()});
  const listed={source_ref:'0001321655-26-000041/pltr-20260630.htm',source_url:'u',title:'t',form_type:'10-Q',published_at:'2026-08-03T22:06:38.000Z',precision:'instant' as const,
   assets:[{role:'filing_index' as const,filename:'index.json',url:'https://www.sec.gov/Archives/edgar/data/1321655/000132165526000041/index.json',required:true}]};
  const idx=new TextEncoder().encode(JSON.stringify({directory:{item:[{name:'pltr-20260630.htm'},{name:'pltr-20260630_htm.xml'},{name:'R1.htm'}]}}));
  expect(a.assetsFromIndex!(listed,idx)).toEqual([{role:'xbrl_instance',filename:'pltr-20260630_htm.xml',url:'https://www.sec.gov/Archives/edgar/data/1321655/000132165526000041/pltr-20260630_htm.xml',required:false}]);
  expect(a.assetsFromIndex!(listed,new TextEncoder().encode('{}'))).toEqual([]);
 });
});
