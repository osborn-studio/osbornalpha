// src/lib/industry/e2e-fixture.test.ts
import {describe,expect,it} from 'vitest';
import {E2E_TAMPERED,e2eCells,fixtureReadDeps,fixtureReplayDeps} from './e2e-fixture';
import {constituentsView,industryDetailView,industryListView,replayView} from './read';
import type {AggDuration,AggMetric} from './types-us';

describe('E2E fixture is self-consistent (Codex round 1 #8)',()=>{
 it('every ok cell replays from its own manifest to the stored value; only the tampered cell does not',async()=>{
  const deps=fixtureReplayDeps(new Date('2026-11-05T08:00:00.000Z'));
  const ok=e2eCells().filter(c=>c.status==='ok');
  expect(new Set(ok.map(c=>c.manifest_hash)).size).toBe(9);                         // one manifest per (code, period_end) group: 3 codes × 3 years
  const results=[];
  for(const c of ok){
   const v=await replayView(deps,{scheme:'sw2021',version:'2021',code:c.code,runId:c.run_id,metric:c.metric as AggMetric,duration:c.duration as AggDuration,periodEnd:c.period_end,mode:'original'});
   if(v.state!=='ok'||v.mode!=='original')throw new Error(`${c.code} ${c.metric} ${c.period_end}: ${v.state}`);
   results.push([`${c.code}:${c.period_end}:${c.metric}`,v.reproduced]);
  }
  const tampered=`${E2E_TAMPERED.code}:${E2E_TAMPERED.periodEnd}:${E2E_TAMPERED.metric}`;
  expect(results.filter(([,r])=>!r).map(([k])=>k)).toEqual([tampered]);
  expect(e2eCells().find(c=>c.code==='801120.SI'&&c.period_end==='2025-12-31'&&c.metric==='gross_margin')).toMatchObject({value:'0.478',n_members:2,n_with_data:2});
  expect(e2eCells().find(c=>c.code==='801780.SI'&&c.period_end==='2025-12-31'&&c.metric==='gross_margin')).toMatchObject({status:'missing',missing_reason:'financial_excluded'});
 });
});

it('SIC fixture snapshot exposes passing and too-small industries and original replay reproduces',async()=>{
 const now=new Date('2026-11-16T08:00:00Z');
 const deps=fixtureReadDeps(now);
 const v=await industryListView(deps,{scheme:'sic',version:'sec-current',level:1,metric:'revenue_sum',duration:'12M',periods:3});
 if(v.state!=='ok'||v.kind!=='aggregate')throw new Error(v.state);
 expect(v.header).toMatchObject({membershipOn:'2026-11-03',methodVersion:'industry-agg-us/1.1'});
 expect(v.cells.find(c=>c.code==='3674')).toMatchObject({nMembers:6,display:'value',unit:'USD'});
 expect(v.cells.find(c=>c.code==='7372')).toMatchObject({nMembers:2,display:'members'});
 const detail=await industryDetailView(deps,{scheme:'sic',version:'sec-current',code:'3674',metrics:['revenue_sum'],durations:['12M'],window:'all'});
 expect(detail).toMatchObject({aggregated:true,members:{count:6,unresolved:0},valuation:{state:'not_enabled'}});
 for(const [code,count] of [['3674',6],['7372',2]] as const){
  expect(await constituentsView(deps,{scheme:'sic',version:'sec-current',code,on:v.header.membershipOn!,page:1,pageSize:100})).toMatchObject({state:'ok',total:count,currentOnly:true,unresolvedCount:0});
 }
 for(const cell of v.cells){
  const result=await replayView(fixtureReplayDeps(now),{scheme:'sic',version:'sec-current',code:cell.code,runId:v.header.runId,metric:cell.metric,duration:cell.duration,periodEnd:cell.periodEnd,mode:'original'});
  expect(result).toMatchObject({state:'ok',mode:'original',reproduced:true});
 }
});
