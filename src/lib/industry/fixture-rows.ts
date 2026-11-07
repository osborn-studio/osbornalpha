// src/lib/industry/fixture-rows.ts
// Row builders and an in-memory read-side IndustryDb shared by the read-side unit tests (Task 15–19)
// and the E2E fixture mode (Task 20). All values are synthetic layout data; production reads never
// use this module (public-deps.ts only reaches it under INDUSTRY_E2E_FIXTURES=1 outside production).
import type {FactRow} from '../facts/types';
import type {ReadDb,ReadDeps} from './read';
import type {AggregateManifest,ClassificationRow,FreshnessRow,MembershipRow,MetricCellRow,MetricRunRow,ValuationCellRow,ValuationRunRow} from './types';

export const RUN_ID='11111111-1111-4111-8111-111111111111';
export const ISSUER_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ISSUER_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const BATCH='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const HASH='e'.repeat(64);

export const classRow=(p:Partial<ClassificationRow>={}):ClassificationRow=>({scheme:'sw2021',version:'2021',code:'801120.SI',level:1,name_zh:'食品饮料',name_en:null,parent_code:null,attributes:{},...p});

export const runRow=(p:Partial<MetricRunRow>={}):MetricRunRow=>({
 run_id:RUN_ID,scheme:'sw2021',version:'2021',level:1,generation:3,facts_as_of:'2026-11-03',knowledge_date:'2026-11-03',
 history_class:'reconstruction',method_version:'industry-agg/1.0',config_hash:'c'.repeat(64),formula_version:'facts-derive/1.0',code_version:'d'.repeat(40),
 expected_grid:{codes:['801080.SI','801120.SI'],period_ends:['2023-12-31','2024-03-31','2024-06-30','2024-09-30','2024-12-31','2025-03-31','2025-06-30','2025-09-30','2025-12-31'],metrics:['revenue_sum','gross_margin','member_count']},
 fingerprint_at:'2026-11-03T02:00:00.000Z',reused_from_run:null,batch_id:BATCH,status:'active',coverage_summary:{},
 created_at:'2026-11-03T02:00:00.000Z',activated_at:'2026-11-03T03:10:00.000Z',...p,
});

export const cellRow=(p:Partial<MetricCellRow>={}):MetricCellRow=>({
 run_id:RUN_ID,code:'801120.SI',metric:'gross_margin',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',
 status:'ok',missing_reason:null,value:'0.478',unit:'ratio',n_members:10,n_with_data:9,n_unresolved:0,manifest_hash:HASH,
 updated_at:'2026-11-03T03:10:00.000Z',...p,
});
/** A missing cell: no value, no manifest, a reason (CHECKs of industry_metrics). */
export const missingCell=(p:Partial<MetricCellRow>={}):MetricCellRow=>cellRow({status:'missing',missing_reason:'financial_excluded',value:null,manifest_hash:null,n_with_data:0,...p});

export const membershipRow=(p:Partial<MembershipRow>={}):MembershipRow=>({
 membership_id:'dddddddd-dddd-4ddd-8ddd-dddddddddd01',issuer_id:ISSUER_A,scheme:'sw2021',version:'2021',code:'801120.SI',level:1,
 valid_from:'2021-07-30',valid_to:null,available_date:'2021-07-30',valid_to_available_date:null,source:'tushare:index_member_all',
 source_membership_id:'ffffffff-ffff-4fff-8fff-ffffffffff01',batch_id:BATCH,status:'ok',superseded_by:null,
 provenance:{availability:'effective_date_assumed',source_membership_id:'ffffffff-ffff-4fff-8fff-ffffffffff01',raw_hash:'41c0d2e7',locator:{page:1,row:12}},...p,
});

export const factRow=(p:Partial<FactRow>={}):FactRow=>({
 fact_id:'99999999-9999-4999-8999-999999999901',issuer_id:ISSUER_A,market:'CN',filing_id:'88888888-8888-4888-8888-888888888801',run_id:'r',
 concept:'revenue',source_concept:'total_revenue',statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',
 value:'170899000000',value_text:'170899000000',unit:'CNY',consolidation:'consolidated',available_date:'2026-04-03',mapping_gen:1,
 mapping_version:'facts-map/1',status:'ok',raw_hash:'h1',created_at:'2026-04-03T00:00:00Z',...p,
});

export const valuationRunRow=(p:Partial<ValuationRunRow>={}):ValuationRunRow=>({
 run_id:'22222222-2222-4222-8222-222222222222',scheme:'sw2021',version:'2021',level:1,generation:1,method_version:'industry-val/1.0',
 config_hash:'c'.repeat(64),formula_version:'facts-derive/1.0',code_version:'d'.repeat(40),expected_dates:['2026-10-30'],comparator_basis:'ttm',
 recompute_from:'2025-10-01',carried_from_run:null,fingerprint_at:'2026-10-31T02:00:00.000Z',batch_id:BATCH,status:'active',
 reconciliation:{},created_at:'2026-10-31T02:00:00.000Z',published_at:'2026-10-31T03:00:00.000Z',activated_at:'2026-10-31T03:20:00.000Z',...p,
});
export const valuationRow=(p:Partial<ValuationCellRow>={}):ValuationCellRow=>({
 run_id:'22222222-2222-4222-8222-222222222222',scheme:'sw2021',version:'2021',code:'801120.SI',trade_date:'2026-10-30',metric:'pe_ttm',
 status:'ok',missing_reason:null,value:'24.8',facts_as_of:'2026-10-30',n_members:10,n_with_data:10,n_unresolved:0,mcap_coverage:'0.971',
 manifest_hash:HASH,updated_at:'2026-10-31T03:20:00.000Z',series_qualified:true,published:true,...p,
});

/** Layout-only manifest for read-model/route/component tests, which mock replayFromManifest; its counts do NOT replay.
 *  Consistent, replayable manifests live in e2e-fixture.ts (Codex plan audit round 1 #8). */
export const manifestOf=(p:Partial<AggregateManifest>={}):AggregateManifest=>({
 schema:'industry-manifest/2',kind:'aggregate',scheme:'sw2021',version:'2021',code:'801120.SI',level:1,period_end:'2025-12-31',
 facts_as_of:'2026-11-03',knowledge_date:'2026-11-03',history_class:'reconstruction',method_version:'industry-agg/1.0',config_hash:'c'.repeat(64),
 formula_version:'facts-derive/1.0',code_version:'d'.repeat(40),
 members:[{issuer_id:ISSUER_A,ticker:'600519.SH',valid_from:'2021-07-30',valid_to:null,available_date:'2021-07-30',valid_to_available_date:null,source_membership_id:'ffffffff-ffff-4fff-8fff-ffffffffff01',raw_hash:'41c0d2e7',locator:{page:1,row:12},resolution_method:'today'}],
 unresolved:[],member_state_revs:[{issuer_id:ISSUER_A,state_rev:4}],
 facts:[
  {issuer_id:ISSUER_A,concept:'revenue_operating',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',fact_id:'f-rev-op',value_text:'100',unit:'CNY',consolidation:'consolidated',available_date:'2026-04-03',mapping_gen:1,filing_id:'g1',source_ref:'600519.SH:20251231:1:20260403',raw_hash:'h1',citation:'pending'},
  {issuer_id:ISSUER_A,concept:'cost_of_revenue',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',fact_id:'f-cost',value_text:'52.2',unit:'CNY',consolidation:'consolidated',available_date:'2026-04-03',mapping_gen:1,filing_id:'g1',source_ref:'600519.SH:20251231:1:20260403',raw_hash:'h2',citation:'pending'},
  {issuer_id:ISSUER_A,concept:'revenue',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',fact_id:'f-rev',value_text:'110',unit:'CNY',consolidation:'consolidated',available_date:'2026-04-03',mapping_gen:1,filing_id:'g1',source_ref:'600519.SH:20251231:1:20260403',raw_hash:'h3',citation:'pending'},
 ],
 derived:[],
 roles:[{issuer_id:ISSUER_A,metric:'gross_margin',duration:'12M',role:'included'},{issuer_id:ISSUER_A,metric:'revenue_sum',duration:'12M',role:'included'}],
 cells:[
  {metric:'gross_margin',duration:'12M',period_start:'2025-01-01',status:'ok',value_text:'0.478',n_members:10,n_with_data:9,n_unresolved:0,unit:'ratio'},
  {metric:'revenue_sum',duration:'12M',period_start:'2025-01-01',status:'ok',value_text:'110',n_members:10,n_with_data:9,n_unresolved:0,unit:'CNY'},
 ],
 warnings:[],...p,
});

export interface StubData{public?:ReadonlySet<string>;tree?:ClassificationRow[];runs?:MetricRunRow[];cells?:MetricCellRow[];memberships?:MembershipRow[];freshness?:FreshnessRow[];valuationRuns?:ValuationRunRow[];valuations?:ValuationCellRow[]}
/** Read-side IndustryDb over arrays; `public` plays the RLS licence gate (default: both schemes public). */
export function stubIndustryDb(d:StubData):ReadDb{
 const pub=d.public??new Set(['scheme:sw2021:2021','scheme:sic:sec-current']);
 const runs=d.runs??[],cells=d.cells??[],members=d.memberships??[];
 const db:ReadDb={
  isDatasetPublic:async k=>pub.has(k),
  classificationTree:async(s,v)=>(d.tree??[]).filter(r=>r.scheme===s&&r.version===v),
  freshness:async()=>d.freshness??[],
  activeMetricRun:async(s,v,l)=>runs.find(r=>r.scheme===s&&r.version===v&&r.level===l&&r.status==='active')??null,
  metricRun:async id=>runs.find(r=>r.run_id===id)??null,
  metricRunVisible:async id=>{const r=runs.find(x=>x.run_id===id);return !!r&&r.status==='active'&&pub.has(`scheme:${r.scheme}:${r.version}`);},
  metricRowsOfRun:async(id,f={})=>cells.filter(c=>c.run_id===id&&(!f.codes||f.codes.includes(c.code))&&(!f.metrics||f.metrics.includes(c.metric))&&(!f.periodEnds||f.periodEnds.includes(c.period_end))&&(!f.durations||f.durations.includes(c.duration))),
  activeValuationRun:async(s,v,l)=>(d.valuationRuns??[]).find(r=>r.scheme===s&&r.version===v&&r.level===l&&r.status==='active')??null,
  publishedValuations:async(id,f)=>(d.valuations??[]).filter(r=>r.run_id===id&&r.published&&(!f.codes||f.codes.includes(r.code))&&(!f.from||r.trade_date>=f.from)&&(!f.to||r.trade_date<=f.to)),
  membershipCandidates:async q=>members.filter(m=>m.scheme===q.scheme&&m.version===q.version&&m.code===q.code&&m.level===q.level&&m.valid_from<=q.on),
  membershipsOfIssuer:async(i,q)=>members.filter(m=>m.issuer_id===i&&(!q.scheme||m.scheme===q.scheme)&&(!q.on||m.valid_from<=q.on)),
 };
 return db;
}

/** ReadDeps around a stub db; unresolved counts, issuer cards and facts are overridable. */
export function readDepsOf(db:ReadDb,p:Partial<ReadDeps>={}):ReadDeps{
 return {db,unresolved:{unresolvedCount:async()=>0},issuers:async()=>new Map(),now:new Date('2026-11-05T08:00:00.000Z'),preview:false,...p};
}
