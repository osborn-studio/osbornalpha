// Recorded real Tushare disclosure_date responses (2026-11-06, verification.md "CN disclosure_date 真实响应核对"):
// parseDisclosureDate must read every recorded row, and actual_date must equal the announcement date the plan-2
// income rt1 fixtures record for the same period (the semantic check behind CN_DISCLOSURE_VERIFIED).
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {DISCLOSURE_FIELDS,parseDisclosureDate} from './calendar-sync';

const DIR=join(__dirname,'fixtures/tushare');
const FACTS=join(__dirname,'../facts/fixtures/tushare');
const load=(ts:string)=>{
 const bytes=readFileSync(join(DIR,`disclosure_date.${ts}.json`));
 const meta=JSON.parse(readFileSync(join(DIR,`disclosure_date.${ts}.meta.json`),'utf8')) as {api:string;params:{ts_code:string};fields:string;sha256:string;code:number};
 const data=(JSON.parse(bytes.toString('utf8')) as {data:{fields:string[];items:unknown[][]}}).data;
 return {bytes,meta,data};
};
const iso=(s:string)=>`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
/** income rt1 (original publication) ann_date by end_date, from the plan-2 fixture. */
function incomeAnn(ts:string):Map<string,string[]>{
 const file=readdirSync(FACTS).sort().find(f=>f.startsWith(`${ts}.`)&&f.includes('.income.rt1.')&&!f.endsWith('.meta.json'))!;
 const d=(JSON.parse(readFileSync(join(FACTS,file),'utf8')) as {data:{fields:string[];items:unknown[][]}}).data;
 const e=d.fields.indexOf('end_date'),a=d.fields.indexOf('ann_date');
 const m=new Map<string,string[]>();
 for(const it of d.items)m.set(String(it[e]),[...(m.get(String(it[e]))??[]),String(it[a])]);
 return m;
}

describe.each(['600519.SH','000333.SZ'])('recorded disclosure_date %s',ts=>{
 const {bytes,meta,data}=load(ts);
 it('is a verbatim recording: sha256 matches the meta, field list is DISCLOSURE_FIELDS, no secrets',()=>{
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(meta.sha256);
  expect(meta).toMatchObject({api:'disclosure_date',params:{ts_code:ts},fields:DISCLOSURE_FIELDS,code:0});
  expect(data.fields.join(',')).toBe(DISCLOSURE_FIELDS);
  // no secrets in either file: no "token" key/text, and (when the secret is loaded) never its value
  for(const text of [bytes.toString('utf8'),JSON.stringify(meta)]){
   expect(text).not.toMatch(/token/i);
   if(process.env.TUSHARE_TOKEN)expect(text).not.toContain(process.env.TUSHARE_TOKEN);
  }
 });
 it('parseDisclosureDate reads every recorded row into ISO dates',()=>{
  const rows=parseDisclosureDate(data);
  expect(rows).toHaveLength(data.items.length);
  expect(rows.length).toBeGreaterThan(40);
  for(const r of rows){
   expect(r.end_date).toMatch(/^\d{4}-(03-31|06-30|09-30|12-31)$/);
   expect(r.pre_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   expect(r.actual_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   expect(r.ann_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   if(r.modify_date!==null)expect(r.modify_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  expect(new Set(rows.map(r=>r.end_date)).size).toBe(rows.length);   // one row per period end
 });
 it('actual_date is the announcement date of the periodic report: equals the earliest income rt1 ann_date for every period both files cover',()=>{
  const ann=incomeAnn(ts);
  const rows=parseDisclosureDate(data);
  let compared=0;
  for(const r of rows){
   const a=ann.get(r.end_date.replaceAll('-',''));
   if(!a)continue;
   compared++;
   expect([...new Set(a.map(iso))].sort()[0],r.end_date).toBe(r.actual_date);   // earliest rt1 ann_date = original publication
  }
  expect(compared).toBeGreaterThanOrEqual(40);
 });
});
