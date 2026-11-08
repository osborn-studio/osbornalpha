import {randomUUID} from 'node:crypto';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {describe,it,expect,vi} from 'vitest';
import {factsHandler} from '@/lib/company/handlers/facts';
import {deriveIssuerEvents} from '@/lib/company/events';
import {drawerRows} from '@/components/company/drawer-model';
import {US,emptySnapshot,makeDeps,realFact,realRecord,seededTables,summary} from '@/lib/company/route-test-kit';
import type {FactSeriesResponse} from '@/lib/company/client';
import type {FactRow} from '@/lib/facts/types';
import type {RouteCtx} from '@/lib/company/route';

// Adapted from the independent wave188 audit reproduction; applyGate stays real.
type ComparabilityChange=Partial<Pick<FactRow,'statement'|'duration'>>;
async function read(change:ComparabilityChange,missing=false,returnToOriginal=false){
 const deps=makeDeps(await seededTables());
 const db=memoryFactsDb();
 await db.reconcileScope('US',[{issuer_id:US,reasons:[],priority:1,fetch_key:'audit'}]);
 const batch=randomUUID();await db.claimLease(US,'US',batch,60);
 const run=await db.beginRun(US,'US',batch,1);
 const filings=[];
 for(const [i,patch] of [{},change,returnToOriginal?{}:change].entries()){
  const filingId=randomUUID(),date=`2024-0${i+2}-01`;
  await db.stageFilings(run,[{filing_id:filingId,issuer_id:US,sourceRef:filingId,market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-09-30',availableDate:date,url:'https://www.sec.gov/audit'}]);
  const f=realFact({fact_id:randomUUID(),filing_id:filingId,run_id:run,value:String(100+i*10),value_text:String(100+i*10),available_date:date,...patch});
  await db.stageFacts(run,[{...f,consolidation:'consolidated'}]);
  filings.push(summary({filingId,availableDate:date}));
 }
 await db.publishRun(run,filings.map(f=>f.filingId));
 deps.facts=db;
 const snap=await db.readFacts(US,'US',{concepts:['revenue'],history:true,asOf:'2025-01-31'});
 const rows=snap.rows;
 vi.mocked(deps.company.evidenceOf).mockImplementation(async ids=>new Map(rows.filter(f=>ids.includes(f.fact_id)&&!deps.noEvidence.has(f.fact_id)).map(f=>[f.fact_id,{...realRecord(f),run_id:f.run_id}])));if(missing)deps.noEvidence.add(rows[1].fact_id);
 vi.mocked(deps.snapshot).mockResolvedValue(emptySnapshot({...snap,filings}));
 const ctx:RouteCtx={mode:'public',admin:false,now:new Date('2025-01-31'),today:'2025-01-31',asOf:'2025-01-31',asOfGiven:true,issuer:{issuerId:US,ticker:'AAPL',market:'US',tickerAsOf:'2025-01-31',validFromMethod:'curated'},params:new Map(Object.entries({concept:'revenue',periodStart:'2022-09-25',periodEnd:'2023-09-30',unit:'USD'})),deps,userId:null};
 const result=await factsHandler(ctx,new Request('https://audit.invalid'));
 if(result instanceof Response)throw Error('unexpected Response');
 const body=result.body as FactSeriesResponse;
 return {body,events:deriveIssuerEvents({rows,filings,cutoff:ctx.asOf}),drawer:drawerRows(body,0)};
}

describe('facts disclosure delta comparability',()=>{
 it('control: comparable eligible revisions retain exact delta',async()=>{
  const {body,events,drawer}=await read({});
  expect(events.filter(e=>e.kind==='fact_revised')).toHaveLength(2);
  expect(body.series.slice(1).map(e=>e.kind==='fact'?e.delta:null)).toEqual(['10','10']);
  expect(drawer[1].revision.kind).toBe('diff');
 });
 it('control: withheld middle disclosure breaks the delta chain',async()=>{
  const {body}=await read({},true);
  expect(body.series[1].kind).toBe('withheld');
  expect(body.series[2]).toMatchObject({kind:'fact',delta:null,relChange:null});
 });
 it.each([{duration:'9M' as const},{statement:'CF' as const}])('does not display an incompatible revision delta: %j',async change=>{
  const {body,events,drawer}=await read(change);
  expect(events.filter(e=>e.kind==='fact_revised')).toHaveLength(1);
  // SQL and #186 suppress the first edge; the drawer must not advertise it as a comparable revision.
  expect(body.series[1]).toMatchObject({kind:'fact',delta:null,relChange:null});
  expect(drawer[1].revision.kind).not.toBe('diff');
  expect(body.series[2]).toMatchObject({kind:'fact',delta:'10',relChange:'0.0909090909'});
  expect(drawer[2].revision).toMatchObject({kind:'diff',abs:'+10'});
 });
 it.each([{duration:'9M' as const},{statement:'CF' as const}])('does not bridge an incompatible middle disclosure when semantics return: %j',async change=>{
  const {body,events,drawer}=await read(change,false,true);
  expect(events.filter(e=>e.kind==='fact_revised')).toEqual([]);
  expect(body.series.slice(1)).toEqual([
   expect.objectContaining({kind:'fact',delta:null,relChange:null}),
   expect.objectContaining({kind:'fact',delta:null,relChange:null}),
  ]);
  expect(drawer.slice(1).map(r=>r.revision.kind)).toEqual(['withheld','withheld']);
 });
});
