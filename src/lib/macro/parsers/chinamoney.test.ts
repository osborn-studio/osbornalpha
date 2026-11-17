// LprHis excerpt and synthetic parser contract (WP-D Task 2, P5 §5.3). Full-byte replay is opt-in and offline.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {canonical} from '../decimal';
import {ChinamoneyParseError,CHINAMONEY_PARSER_VERSION,parseLprHis} from './chinamoney';

const FIX=join(process.cwd(),'src/lib/macro/fixtures/cn-http');
const manifest=JSON.parse(readFileSync(join(FIX,'manifest.json'),'utf8')) as {files:{file:string;excerpt_sha256:string}[]};
const bytesOf=(file:string)=>{
 const bytes=new Uint8Array(readFileSync(join(FIX,file)));
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.files.find(f=>f.file===file)?.excerpt_sha256);
 return bytes;
};
const enc=(o:unknown)=>new TextEncoder().encode(JSON.stringify(o));
const doc=(records:unknown[],data:Record<string,unknown>={})=>enc({head:{rep_code:'200'},data:{startDateCN:'2026-01-01',endDateCN:'2026-12-31',baseCurveCfgList:['1Y','5Y'],message:'',...data},records});
const codeOf=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return (e as {code?:string}).code??String(e);}};
const Q1={seriesId:'CN_LPR_1Y_Q',field:'1Y' as const,firstPeriod:'2019-08-20'};

describe('parseLprHis (excerpt bytes)',()=>{
 it('2019: five reform-era quotes ascending; earlier daily rows and missing 5Y values excluded',()=>{
  const bytes=bytesOf('CN_LPR_Q-2019.json');
  const one=parseLprHis(bytes,Q1);
  expect(one.map(p=>[p.periodEnd,p.valueText])).toEqual([['2019-08-20','4.25'],['2019-09-20','4.2'],['2019-10-21','4.2'],['2019-11-20','4.15'],['2019-12-20','4.15']]);
  expect(one.map(p=>p.locator)).toEqual([4,3,2,1,0].map(i=>({kind:'json_pointer',pointer:`/records/${i}/1Y`})));
  expect(one.map(p=>p.seriesId)).toEqual(Array(5).fill('CN_LPR_1Y_Q'));
  const five=parseLprHis(bytes,{...Q1,seriesId:'CN_LPR_5Y_Q',field:'5Y'});
  expect(five.map(p=>[p.periodEnd,p.valueText])).toEqual([['2019-08-20','4.85'],['2019-09-20','4.85'],['2019-10-21','4.85'],['2019-11-20','4.8'],['2019-12-20','4.8']]);
  expect(five.map(p=>p.locator)).toEqual([4,3,2,1,0].map(i=>({kind:'json_pointer',pointer:`/records/${i}/5Y`})));
 });
 it('2026: three excerpt quotes through October, with exact value text and pointers',()=>{
  const bytes=bytesOf('CN_LPR_Q-2026.json');
  for(const [field,seriesId,value] of [['1Y','CN_LPR_1Y_Q','3'],['5Y','CN_LPR_5Y_Q','3.5']] as const){
   const pts=parseLprHis(bytes,{...Q1,seriesId,field});
   expect(pts.map(p=>[p.periodEnd,p.valueText,p.locator])).toEqual([
    ['2026-08-20',value,{kind:'json_pointer',pointer:`/records/2/${field}`}],
    ['2026-09-20',value,{kind:'json_pointer',pointer:`/records/1/${field}`}],
    ['2026-10-20',value,{kind:'json_pointer',pointer:`/records/0/${field}`}],
   ]);
  }
 });
});

// Read JSON pointers independently of the parser, including RFC 6901 token unescaping.
const atPointer=(root:unknown,pointer:string):unknown=>{
 if(!pointer.startsWith('/'))throw new Error('bad pointer');
 return pointer.slice(1).split('/').reduce<unknown>((node,token)=>{
  const key=token.replace(/~1/g,'/').replace(/~0/g,'~');
  if(!node||typeof node!=='object'||!(key in node))throw new Error('missing pointer');
  return (node as Record<string,unknown>)[key];
 },root);
};

describe.skipIf(!process.env.WPD_RAW_EVIDENCE_DIR)('parseLprHis (opt-in offline raw-evidence replay)',()=>{
 it('re-reads every point and counts eligible records in every yearly response',()=>{
  const dir=process.env.WPD_RAW_EVIDENCE_DIR!;
  const files=readdirSync(dir).filter(f=>/^CN_LPR_Q-\d{4}\.json$/.test(f)).sort();
  expect(files.length).toBeGreaterThan(0);
  for(const file of files){
   const bytes=new Uint8Array(readFileSync(join(dir,file)));
   const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as {records:Record<string,unknown>[]};
   for(const field of ['1Y','5Y'] as const){
    const points=parseLprHis(bytes,{...Q1,field});
    const eligible=raw.records.filter(r=>typeof r.showDateCN==='string'&&r.showDateCN>='2019-08-20'&&r[field]!==undefined&&r[field]!==null&&r[field]!==''&&r[field]!=='---');
    expect(points.length,`${file} ${field}`).toBe(eligible.length);
    for(const point of points){
     expect(point.locator.kind).toBe('json_pointer');
     if(point.locator.kind!=='json_pointer')throw new Error('bad locator');
     const value=atPointer(raw,point.locator.pointer);
     expect(typeof value).toBe('string');
     expect(canonical(value as string),`${file} ${point.periodEnd} ${field}`).toBe(point.valueText);
    }
   }
  }
 });
});

describe('parseLprHis (synthetic)',()=>{
 it('keeps a duplicate date with the same value once and refuses conflicting values',()=>{
  const row=(date:string,value:string)=>({'1Y':value,'5Y':'3.50',showDateEN:'x',showDateCN:date});
  expect(parseLprHis(doc([row('2026-02-24','3.00'),row('2026-02-24','3.00'),row('2026-01-20','3.10')]),Q1).map(p=>[p.periodEnd,p.valueText])).toEqual([['2026-01-20','3.1'],['2026-02-24','3']]);
  expect(codeOf(()=>parseLprHis(doc([row('2026-02-24','3.00'),row('2026-02-24','3.05')]),Q1))).toBe('lpr_conflicting_rows');
 });
 it('fails closed on refused window, unsuccessful reply, missing tenor, bad value, date, and JSON',()=>{
  expect(codeOf(()=>parseLprHis(doc([],{message:'只提供一年历史数据查询及下载'}),Q1))).toBe('lpr_window_refused');
  expect(codeOf(()=>parseLprHis(enc({head:{rep_code:'500'},data:{message:''},records:[]}),Q1))).toBe('lpr_unsuccessful');
  expect(codeOf(()=>parseLprHis(doc([],{baseCurveCfgList:['1Y']}),{...Q1,field:'5Y'}))).toBe('lpr_tenor_missing');
  expect(codeOf(()=>parseLprHis(doc([{'1Y':'3,0','5Y':'3.5',showDateCN:'2026-01-20'}]),Q1))).toBe('lpr_bad_value');
  expect(codeOf(()=>parseLprHis(doc([{'1Y':'3.0','5Y':'3.5',showDateCN:'20 Jan 2026'}]),Q1))).toBe('lpr_bad_date');
  expect(codeOf(()=>parseLprHis(new TextEncoder().encode('<html>'),Q1))).toBe('lpr_bad_json');
  expect(parseLprHis(doc([]),Q1)).toEqual([]);
  expect(new ChinamoneyParseError('x').name).toBe('ChinamoneyParseError');
  expect(CHINAMONEY_PARSER_VERSION).toBe('chinamoney-lprhis/1');
 });
});
