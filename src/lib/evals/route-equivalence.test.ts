// src/lib/evals/route-equivalence.test.ts
// Spec §5.3.2 / §13.1: the replay projection computed over the database path (projections/facts.ts) equals
// the projection computed from the PUBLIC route handlers' JSON for the same request, on one in-memory
// FactsDb. The routes have no injectable deps: publicClients() (src/lib/facts/public-route.ts) builds its
// FactsDb with supabaseFactsDb (src/lib/facts/db.ts) over getAnonSupabase (src/lib/supabase/anon.ts) and
// resolves tickers through resolveIssuer (src/lib/entities/resolve.ts) — those three modules are mocked.
import {beforeEach,describe,expect,it,vi} from 'vitest';

const shared=vi.hoisted(()=>({db:null as unknown,issuer:'11111111-1111-4111-8111-111111111111'}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({rpc:async()=>({data:null,error:{message:'not used by asOf reads'}})})}));
vi.mock('@/lib/facts/db',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/facts/db')>(),supabaseFactsDb:()=>shared.db}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),
 resolveIssuer:async(_c:unknown,q:{ticker?:string;cik?:string})=>q.ticker==='ZZEVA'||q.cik==='9990601'
  ?{issuer_id:shared.issuer,status:'active',names:{zh:null,en:'F6 Eval A'},identifiers:{cik:'9990601',lei:null,usci:null},securities:[{ticker:'ZZEVA',isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null}]}
  :null}));

import {GET as factsGET} from '@/app/api/facts/[ticker]/route';
import {GET as metricsGET} from '@/app/api/facts/[ticker]/metrics/route';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {projectionHash} from './canonical-json';
import {projectFactsRouteBody,projectMetricsRouteBody,projectRequest} from './projections/facts';
import type {FactsRouteBody,MetricsRouteBody,ProjectionDeps} from './projections/facts';
import {ZZEVA_CIK,ZZEVA_ISSUER,publishFilings,seedZzeva} from './test-support/memory-facts';
import type {ReplayRequest} from './types';

const TODAY=new Date().toISOString().slice(0,10);
type Handler=(req:Request,ctx:{params:Promise<{ticker:string}>})=>Promise<Response>;
const call=async(handler:Handler,path:string,qs:string):Promise<unknown>=>{
 const res=await handler(new Request(`https://alpha.example/api/facts/ZZEVA${path}?${qs}`),{params:Promise.resolve({ticker:'ZZEVA'})});
 expect(res.status).toBe(200);
 return res.json();
};
let deps:ProjectionDeps;
beforeEach(async()=>{
 expect(shared.issuer).toBe(ZZEVA_ISSUER);
 const db=memoryFactsDb();await seedZzeva(db);shared.db=db;
 deps={db,resolve:async s=>s.cik===ZZEVA_CIK?{issuerId:ZZEVA_ISSUER,market:'US'}:null};
});

describe('replay projection: database path == public route response',()=>{
 const issuer={market:'US' as const,cik:ZZEVA_CIK};
 it('facts, history, with and without durations',async()=>{
  for(const [request,qs] of [
   [{issuer,concepts:['revenue','cash'],asOf:'2025-06-30',durations:['12M','INSTANT']},'concepts=revenue,cash&asOf=2025-06-30&history=1&durations=12M,INSTANT&limit=1000'],
   [{issuer,concepts:['revenue','cash'],asOf:'2025-06-30'},'concepts=revenue,cash&asOf=2025-06-30&history=1&limit=1000'],
   [{issuer,concepts:['revenue'],asOf:'2024-12-31'},'concepts=revenue&asOf=2024-12-31&history=1&limit=1000'],
  ] as [ReplayRequest,string][]){
   const viaDb=await projectRequest(deps,request,TODAY);
   const viaRoute=projectFactsRouteBody(await call(factsGET,'',qs) as FactsRouteBody);
   expect(viaRoute).toEqual(viaDb);
   expect(projectionHash(viaRoute)).toBe(projectionHash(viaDb));
  }
  const full=await projectRequest(deps,{issuer,concepts:['revenue','cash'],asOf:'2025-06-30'},TODAY);
  expect(full.rows.length).toBe(6);
  expect(full.rows.some(r=>r.is_revision===true)).toBe(true);   // the comparison covers a revision
 });
 it('metrics at asOf: live derive + inputs joined (route: metrics, then factIds evidence for the inputs)',async()=>{
  const request:ReplayRequest={issuer,concepts:[],metrics:['gross_margin','revenue_yoy'],asOf:'2025-06-30'};
  const viaDb=await projectRequest(deps,request,TODAY);
  const body=await call(metricsGET,'/metrics','metrics=gross_margin,revenue_yoy&asOf=2025-06-30&limit=1000') as MetricsRouteBody;
  const ids=[...new Set(body.metrics.flatMap(m=>m.inputs.map(i=>i.fact_id)))];
  expect(ids.length).toBeGreaterThan(0);
  const evidence=await call(factsGET,'',`factIds=${ids.join(',')}`) as FactsRouteBody;
  const viaRoute=projectMetricsRouteBody(body,evidence);
  expect(viaRoute).toEqual(viaDb);
  expect(viaDb.rows.map(r=>r.metric)).toEqual(['gross_margin','revenue_yoy']);
 });
 it('metrics whose inputs carry quarter tuples (q_single, TTM) hash the same on both paths',async()=>{
  const q=(start:string,end:string,v:string)=>({concept:'revenue',period_start:start,period_end:end,duration:'3M' as const,value:v});
  await publishFilings(deps.db as ReturnType<typeof memoryFactsDb>,ZZEVA_ISSUER,[
   {sourceRef:'0009990601-24-000010',formType:'10-Q',availableDate:'2024-05-01',facts:[q('2024-01-01','2024-03-30','90000000000')]},
   {sourceRef:'0009990601-24-000011',formType:'10-Q',availableDate:'2024-08-01',facts:[q('2024-03-31','2024-06-29','85000000000')]},
   {sourceRef:'0009990601-24-000012',formType:'10-K',availableDate:'2024-11-02',facts:[q('2024-06-30','2024-09-28','94000000000')]}]);
  const request:ReplayRequest={issuer,concepts:[],metrics:['q_single_revenue','ttm_revenue'],asOf:'2025-06-30'};
  const viaDb=await projectRequest(deps,request,TODAY);
  const body=await call(metricsGET,'/metrics','metrics=q_single_revenue,ttm_revenue&asOf=2025-06-30&limit=1000') as MetricsRouteBody;
  expect(body.metrics.some(m=>m.inputs.some(i=>Array.isArray(i.quarter)))).toBe(true);   // the real route shape is a [start,end] tuple
  const ids=[...new Set(body.metrics.flatMap(m=>m.inputs.map(i=>i.fact_id)))];
  const evidence=await call(factsGET,'',`factIds=${ids.join(',')}`) as FactsRouteBody;
  const viaRoute=projectMetricsRouteBody(body,evidence);
  expect(viaDb.rows.map(r=>r.metric)).toContain('ttm_revenue');
  expect(viaDb.rows.some(r=>(r.inputs as {quarter?:string}[]).some(i=>i.quarter?.includes('~')))).toBe(true);
  expect(viaRoute).toEqual(viaDb);
  expect(projectionHash(viaRoute)).toBe(projectionHash(viaDb));
 });
});
