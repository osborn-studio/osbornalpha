import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {MACRO_CATALOG} from '../catalog';
import {FredParseError,parseFredCsv} from './fred-csv';

const enc=(s:string)=>new TextEncoder().encode(s);
const day={seriesId:'US_DGS10_D',code:'DGS10',period:'day' as const};

describe('parseFredCsv (synthetic)',()=>{
 it('keeps the value text losslessly and locates each value by 1-based line, column 1',()=>{
  const pts=parseFredCsv(enc('observation_date,DGS10\n2026-10-01,5.24\n2026-10-02,4.00\n2026-10-05,0.10000000000000001\n'),day);
  expect(pts).toEqual([
   {seriesId:'US_DGS10_D',periodEnd:'2026-10-01',valueText:'5.24',locator:{kind:'csv_row',line:2,column:1}},
   {seriesId:'US_DGS10_D',periodEnd:'2026-10-02',valueText:'4',locator:{kind:'csv_row',line:3,column:1}},
   {seriesId:'US_DGS10_D',periodEnd:'2026-10-05',valueText:'0.10000000000000001',locator:{kind:'csv_row',line:4,column:1}},
  ]);
 });
 it('skips empty and "." values (missing stays missing) without shifting line numbers',()=>{
  const pts=parseFredCsv(enc('observation_date,DGS10\n2025-01-17,4.61\n2025-01-20,\n2025-01-21,.\n2025-01-22,4.57\n'),day);
  expect(pts.map(p=>[p.periodEnd,p.valueText,p.locator])).toEqual([
   ['2025-01-17','4.61',{kind:'csv_row',line:2,column:1}],['2025-01-22','4.57',{kind:'csv_row',line:5,column:1}],
  ]);
 });
 it('maps monthly and quarterly first-of-period dates to period ends and rejects mid-period dates',()=>{
  const m=parseFredCsv(enc('observation_date,CPIAUCSL\n2024-02-01,310.326\n2026-09-01,336.298\n'),{seriesId:'US_CPI_INDEX',code:'CPIAUCSL',period:'month'});
  expect(m.map(p=>p.periodEnd)).toEqual(['2024-02-29','2026-09-30']);
  const q=parseFredCsv(enc('observation_date,GDPC1\n2026-07-01,1\n'),{seriesId:'X',code:'GDPC1',period:'quarter'});
  expect(q[0].periodEnd).toBe('2026-09-30');
  expect(()=>parseFredCsv(enc('observation_date,CPIAUCSL\n2026-09-15,1\n'),{seriesId:'X',code:'CPIAUCSL',period:'month'})).toThrow('bad_period_start');
  expect(()=>parseFredCsv(enc('observation_date,GDPC1\n2026-08-01,1\n'),{seriesId:'X',code:'GDPC1',period:'quarter'})).toThrow('bad_period_start');
 });
 it('accepts CRLF, a BOM and no trailing newline',()=>{
  const pts=parseFredCsv(enc('﻿observation_date,DGS10\r\n2026-10-01,5.24\r\n2026-10-02,5.28'),day);
  expect(pts.map(p=>p.valueText)).toEqual(['5.24','5.28']);
  expect(pts[1].locator).toEqual({kind:'csv_row',line:3,column:1});
 });
 it('returns every row of a duplicated date so the write RPC can report conflicting_rows',()=>{
  const pts=parseFredCsv(enc('observation_date,DGS10\n2026-10-01,5.24\n2026-10-01,5.25\n'),day);
  expect(pts.map(p=>[p.periodEnd,p.valueText,p.locator.kind==='csv_row'?p.locator.line:0])).toEqual([['2026-10-01','5.24',2],['2026-10-01','5.25',3]]);
 });
 it('fails closed on any structural surprise',()=>{
  const bad:[string,string][]=[
   ['DATE,DGS10\n2026-10-01,1\n','bad_header'],
   ['observation_date,DGS2\n2026-10-01,1\n','bad_header'],
   ['observation_date,DGS10\n2026-10-01,1,2\n','bad_row'],
   ['observation_date,DGS10\n2026-10-01\n','bad_row'],
   ['observation_date,DGS10\n2026/10/01,1\n','bad_date'],
   ['observation_date,DGS10\n2026-02-30,1\n','bad_date'],
   ['observation_date,DGS10\n2026-10-01,1e999\n','bad_value'],
   ['observation_date,DGS10\n2026-10-01,NaN\n','bad_value'],
   ['observation_date,DGS10\n2026-10-01,1E3\n','bad_value'],
   ['observation_date,DGS10\n2026-10-01,0x1\n','bad_value'],
   ['','bad_header'],
  ];
  for(const [csv,code] of bad){
   let err:unknown;try{parseFredCsv(enc(csv),day);}catch(e){err=e;}
   expect(err,csv).toBeInstanceOf(FredParseError);expect((err as FredParseError).code,csv).toBe(code);
  }
  expect(()=>parseFredCsv(new Uint8Array([0x6f,0xff,0xfe]),day)).toThrow('bad_encoding');
  expect(()=>parseFredCsv(enc('observation_date,x\n'),{...day,code:'x'})).toThrow('bad_code');
 });
});

// Real fixtures recorded by scripts/macro/record-fred-fixtures.ts (cosd=2015-01-01). The expected rows below were read
// from FRED on 2026-11-06 with the same URLs; Step 3 says how to confirm them against the recorded files.
interface ManifestEntry{code:string;series_id:string;url:string;fetched_at:string;sha256:string;content_type:string;http_status:number}
const manifest:ManifestEntry[]=JSON.parse(readFileSync(new URL('../fixtures/fred/manifest.json',import.meta.url),'utf8'));
const fixture=(code:string)=>new Uint8Array(readFileSync(new URL(`../fixtures/fred/${code}.csv`,import.meta.url)));
const defOf=(code:string)=>{const d=MACRO_CATALOG.find(x=>x.source?.adapter==='fred_csv'&&x.source.seriesKey===code&&!x.derive&&!x.aliasOf);if(!d)throw new Error(`no def for ${code}`);return d;};
const parse=(code:string)=>{const d=defOf(code);return parseFredCsv(fixture(code),{seriesId:d.id,code,period:d.period});};
const row=(code:string,periodEnd:string)=>parse(code).find(p=>p.periodEnd===periodEnd);

describe('parseFredCsv (recorded fixtures)',()=>{
 it('has one fixture per active native FRED series, each matching its manifest hash and URL',()=>{
  const want=MACRO_CATALOG.filter(d=>d.source?.adapter==='fred_csv'&&d.status==='active'&&!d.derive&&!d.aliasOf).map(d=>d.source!.seriesKey).sort();
  expect(manifest.map(m=>m.code).sort()).toEqual(want);
  for(const m of manifest){
   expect(createHash('sha256').update(fixture(m.code)).digest('hex'),m.code).toBe(m.sha256);
   expect(m.url).toBe(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${m.code}&cosd=2015-01-01`);
   expect(m.http_status).toBe(200);
   expect(parse(m.code).length,m.code).toBeGreaterThan(100);
  }
 });
 it('reads exact value texts and lines of known rows',()=>{
  const cases:[string,string,string,number][]=[
   ['DFF','2015-01-01','0.06',2],['DFF','2020-03-16','0.25',1903],
   ['DFEDTARL','2015-01-01','0',2],                                     // raw "0.00"
   ['DFEDTARU','2020-03-16','0.25',1903],
   ['DGS10','2015-01-02','2.12',2],['DGS10','2020-03-16','0.73',1358],
   ['DTWEXBGS','2015-01-02','102.9027',2],
   ['DCOILWTICO','2020-04-20','-36.98',1383],                           // a negative price is data, not an error
   ['CPIAUCSL','2020-04-30','256.032',65],['UNRATE','2020-04-30','14.8',65],
   ['PPIFIS','2015-01-31','110.1',2],['PPIFIS','2020-04-30','116.6',65], // raw "110.100" / "116.600"
  ];
  for(const [code,pe,value,line] of cases){
   const p=row(code,pe);
   expect(p,`${code} ${pe}`).toBeDefined();
   expect(p!.valueText,`${code} ${pe}`).toBe(value);
   expect(p!.locator,`${code} ${pe}`).toEqual({kind:'csv_row',line,column:1});
  }
 });
 it('leaves holiday and shutdown gaps missing',()=>{
  expect(row('DGS10','2025-01-20')).toBeUndefined();     // MLK day: "2025-01-20,"
  expect(row('CPIAUCSL','2025-10-31')).toBeUndefined();  // 2025 shutdown: "2025-10-01,"
  expect(row('UNRATE','2025-10-31')).toBeUndefined();
 });
});
