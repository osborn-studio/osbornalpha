// src/lib/macro/ingest-schema.test.ts
import {describe,expect,it} from 'vitest';
import {parseIngestBody} from './ingest-schema';

const B='00000000-0000-4000-8000-000000000001',T='00000000-0000-4000-8000-0000000000aa';
const ev={series_id:'CN_PMI_MFG',sha256:'a'.repeat(64),url:'https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData',status:200,content_type:'application/json;charset=UTF-8',fetched_at:'2026-11-06T05:00:00.123Z',bytes_b64:'e30='};
const cl={series_id:'CN_PMI_MFG',period_label:'2026年10月',value_text:'49.3'};
const chunk={action:'chunk',batch_id:B,owner_token:T,seq:0,total:1,evidence:[ev],claims:[cl]};
const err=(v:unknown)=>{const r=parseIngestBody(v);return r.ok?'ok':r.error;};

describe('parseIngestBody',()=>{
 it('accepts the three actions',()=>{
  expect(parseIngestBody({action:'start',tool_versions:{akshare:'1.20.35',python:'3.12.13'}})).toEqual({ok:true,body:{action:'start',tool_versions:{akshare:'1.20.35',python:'3.12.13'}}});
  expect(parseIngestBody({action:'start',tool_versions:{a:'1'},takeover:true})).toEqual({ok:true,body:{action:'start',tool_versions:{a:'1'},takeover:true}});   // restart (第 5 稿 P2-1)
  expect(parseIngestBody(chunk)).toEqual({ok:true,body:chunk});
  expect(parseIngestBody({...chunk,claims:[]}).ok).toBe(true);
  const outcomes=[{series_id:'CN_PMI_MFG',ok:true},{series_id:'CN_M2_YOY',ok:false,code:'collect_runtimeerror'}];
  expect(parseIngestBody({action:'finish',batch_id:B,owner_token:T,total:3,series_outcomes:outcomes})).toEqual({ok:true,body:{action:'finish',batch_id:B,owner_token:T,total:3,series_outcomes:outcomes}});
  expect(parseIngestBody({action:'finish',batch_id:B,owner_token:T,total:0,series_outcomes:[outcomes[1]]}).ok).toBe(true);   // every series failed: no chunks
 });
 it('rejects unknown actions, unknown or missing keys and wrong types',()=>{
  expect(err(null)).toBe('invalid_body:root');
  expect(err({action:'publish'})).toBe('invalid_body:action');
  expect(err({action:'start',tool_versions:{akshare:'1'},extra:1})).toBe('invalid_body:root.extra');
  expect(err({action:'start',tool_versions:{}})).toBe('invalid_body:tool_versions');
  expect(err({action:'start',tool_versions:{'bad key':'1'}})).toBe('invalid_body:tool_versions.bad key');
  expect(err({action:'start',tool_versions:{a:'1'},takeover:false})).toBe('invalid_body:takeover');
  const fin=(o:Record<string,unknown>)=>({action:'finish',batch_id:B,owner_token:T,total:1,series_outcomes:[],...o});
  expect(err(fin({batch_id:'not-a-uuid'}))).toBe('invalid_body:batch_id');
  expect(err(fin({owner_token:'nope'}))).toBe('invalid_body:owner_token');
  expect(err({action:'finish',batch_id:B,total:1,series_outcomes:[]})).toBe('invalid_body:root.owner_token');   // every finish is fenced (第 5 稿 P1-3)
  expect(err(Object.fromEntries(Object.entries(chunk).filter(([k])=>k!=='owner_token')))).toBe('invalid_body:root.owner_token');
  expect(err(fin({total:-1}))).toBe('invalid_body:total');
  expect(err({action:'finish',batch_id:B,owner_token:T,series_outcomes:[]})).toBe('invalid_body:root.total');
  expect(err({action:'finish',batch_id:B,owner_token:T,total:1})).toBe('invalid_body:root.series_outcomes');
  expect(err(fin({series_outcomes:[{series_id:'CN_A',ok:false}]}))).toBe('invalid_body:series_outcomes[0].code');
  expect(err(fin({series_outcomes:[{series_id:'CN_A',ok:true,code:'x'}]}))).toBe('invalid_body:series_outcomes[0].code');
  expect(err(fin({series_outcomes:[{series_id:'CN_A',ok:'yes'}]}))).toBe('invalid_body:series_outcomes[0].ok');
  expect(err(fin({series_outcomes:[{series_id:'CN_A',ok:true},{series_id:'CN_A',ok:true}]}))).toBe('invalid_body:series_outcomes');
 });
 it('validates chunk numbering, sizes and every evidence and claim field',()=>{
  expect(err({...chunk,seq:1,total:1})).toBe('invalid_body:seq');
  expect(err({...chunk,seq:1.5})).toBe('invalid_body:seq');
  expect(err({...chunk,evidence:[]})).toBe('invalid_body:evidence');
  expect(err({...chunk,evidence:Array(51).fill(ev)})).toBe('invalid_body:evidence');
  const bad:[Record<string,unknown>,string][]=[
   [{series_id:'US_DGS10_D'},'series_id'],[{sha256:'A'.repeat(64)},'sha256'],[{url:'http://data.stats.gov.cn/x'},'url'],[{url:'not a url'},'url'],
   [{status:99},'status'],[{fetched_at:'2026-11-06 05:00:00'},'fetched_at'],[{fetched_at:'2026-13-40T00:00:00Z'},'fetched_at'],
   [{bytes_b64:'e30'},'bytes_b64'],[{bytes_b64:'e3$='},'bytes_b64'],[{content_type:''},'content_type'],
  ];
  for(const [patch,field] of bad)expect(err({...chunk,evidence:[{...ev,...patch}]}),field).toBe(`invalid_body:evidence[0].${field}`);
  expect(err({...chunk,evidence:[{...ev,extra:1}]})).toBe('invalid_body:evidence[0].extra');
  expect(err({...chunk,claims:[{...cl,value_text:'49,3'}]})).toBe('invalid_body:claims[0].value_text');
  expect(err({...chunk,claims:[{...cl,value_text:'NaN'}]})).toBe('invalid_body:claims[0].value_text');
  expect(err({...chunk,claims:[{...cl,period_label:''}]})).toBe('invalid_body:claims[0].period_label');
 });
});
