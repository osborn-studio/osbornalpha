// src/lib/industry/providers/sec-sic.test.ts
import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {SIC_CODE_LIST_URL,fetchSicCodeTable,fetchSubmissionsSic,fixtureSecFetch,normalizeCik10,padSic,parseSicCodeTable,parseSubmissionsSic,secFixture,submissionsUrl} from './sec-sic';

const enc=(o:unknown)=>new TextEncoder().encode(JSON.stringify(o));

describe('recorded SEC fixtures (2026-11-06, trimmed; full-response sha256 in _recorded)',()=>{
 it('submissions: AAPL 3571/0926, MSFT 7372/0630, NVDA 3674/0131',()=>{
  expect(parseSubmissionsSic(secFixture('submissions-0000320193.json'))).toEqual({cik:'320193',name:'Apple Inc.',sic:'3571',sicRaw:'3571',sicDescription:'Electronic Computers',fiscalYearEnd:'0926'});
  expect(parseSubmissionsSic(secFixture('submissions-0000789019.json'))).toMatchObject({cik:'789019',sic:'7372',sicDescription:'Services-Prepackaged Software',fiscalYearEnd:'0630'});
  expect(parseSubmissionsSic(secFixture('submissions-0001045810.json'))).toMatchObject({cik:'1045810',sic:'3674',sicDescription:'Semiconductors & Related Devices',fiscalYearEnd:'0131'});
 });
 it('SIC table: header skipped, three-digit codes left-padded, entities decoded, cell attributes tolerated',()=>{
  const {rows,rejected}=parseSicCodeTable(new TextDecoder().decode(secFixture('sic-codes.html')));
  expect(rejected).toEqual([]);
  expect(rows.map(r=>r.code)).toEqual(['0100','0200','0700','0900','3570','3571','3674','6770','7372','9995']);
  expect(rows[0]).toEqual({code:'0100',office:'Industrial Applications and Services',title:'AGRICULTURAL PRODUCTION-CROPS'});
  expect(rows.find(r=>r.code==='3674')!.title).toBe('SEMICONDUCTORS & RELATED DEVICES');
  expect(rows.find(r=>r.code==='9995')).toEqual({code:'9995',office:'Office of Real Estate & Construction',title:'NON-OPERATING ESTABLISHMENTS'});
 });
});

describe('parsers',()=>{
 it('empty, zero or malformed sic → null with the raw value kept; bad fiscalYearEnd → null',()=>{
  expect(parseSubmissionsSic(enc({cik:'0000000001',sic:'',fiscalYearEnd:'1231'}))).toMatchObject({cik:'1',sic:null,sicRaw:'',fiscalYearEnd:'1231'});
  expect(parseSubmissionsSic(enc({cik:'1',sic:'0000'}))).toMatchObject({sic:null,sicRaw:'0000'});
  expect(parseSubmissionsSic(enc({cik:'1',sic:'100',fiscalYearEnd:'12'}))).toMatchObject({sic:'0100',fiscalYearEnd:null});
  expect(()=>parseSubmissionsSic(enc({sic:'100'}))).toThrow('submissions_no_cik');
  expect(()=>parseSubmissionsSic(new TextEncoder().encode('<html>'))).toThrow('submissions_json_invalid');
 });
 it('padSic / normalizeCik10',()=>{
  expect(padSic('100')).toBe('0100');expect(padSic(' 3571 ')).toBe('3571');expect(padSic('12345')).toBeNull();expect(padSic('abc')).toBeNull();
  expect(normalizeCik10('320193')).toBe('0000320193');expect(()=>normalizeCik10('0')).toThrow('invalid_cik');expect(()=>normalizeCik10('12a')).toThrow('invalid_cik');
  expect(submissionsUrl('320193')).toBe('https://data.sec.gov/submissions/CIK0000320193.json');
 });
 it('SIC table: missing table throws; malformed and duplicate rows are rejected',()=>{
  expect(()=>parseSicCodeTable('<p>no table</p>')).toThrow('sic_table_not_found');
  const html='<table><tr><td>SIC Code</td><td>Office</td><td>Industry Title</td></tr><tr><td>100</td><td>O</td><td>A</td></tr><tr><td>0100</td><td>O</td><td>B</td></tr><tr><td>x</td><td>O</td><td>C</td></tr><tr><td>200</td><td>O</td></tr></table>';
  expect(parseSicCodeTable(html)).toEqual({rows:[{code:'0100',office:'O',title:'A'}],rejected:['duplicate_0100','row_3','row_4']});
 });
});

describe('fetchers',()=>{
 it('declare the User-Agent (EDGAR_USER_AGENT or DEFAULT_USER_AGENT) and hash the response bytes',async()=>{
  const seen:string[]=[];
  const inner=fixtureSecFetch();
  const f=(async(u:RequestInfo|URL,init?:RequestInit)=>{seen.push(String((init?.headers as Record<string,string>)['User-Agent']));return inner(u,init);}) as typeof fetch;
  const r=await fetchSubmissionsSic('320193',{fetch:f,now:()=>new Date('2026-11-08T02:00:00.000Z')});
  expect(r).toMatchObject({kind:'ok',url:'https://data.sec.gov/submissions/CIK0000320193.json',fetchedAt:'2026-11-08T02:00:00.000Z',rawHash:createHash('sha256').update(secFixture('submissions-0000320193.json')).digest('hex')});
  vi.stubEnv('EDGAR_USER_AGENT','Custom UA x@y.z');
  const t=await fetchSicCodeTable({fetch:f});
  vi.unstubAllEnvs();
  expect(t).toMatchObject({kind:'ok',url:SIC_CODE_LIST_URL});
  expect(t.kind==='ok'&&t.rows.length).toBe(10);
  expect(seen).toEqual([DEFAULT_USER_AGENT,'Custom UA x@y.z']);
 });
 it('404 → not_found; 429/503/network → unavailable',async()=>{
  expect(await fetchSubmissionsSic('1',{fetch:fixtureSecFetch()})).toEqual({kind:'not_found',url:submissionsUrl('1'),status:404});
  expect(await fetchSubmissionsSic('320193',{fetch:fixtureSecFetch({[submissionsUrl('320193')]:()=>new Response('',{status:429})})})).toMatchObject({kind:'unavailable',status:429});
  expect(await fetchSicCodeTable({fetch:fixtureSecFetch({[SIC_CODE_LIST_URL]:()=>new Response('',{status:503})})})).toMatchObject({kind:'unavailable',status:503});
  expect(await fetchSubmissionsSic('320193',{fetch:(async()=>{throw new TypeError('fetch failed');}) as unknown as typeof fetch})).toMatchObject({kind:'unavailable',status:null});
 });
});
