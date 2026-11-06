// src/lib/dq/reconcile/lineage.integration.test.ts
// Spec §9.3 (critical): facts.lineage_same_day on real PostgreSQL. Two synthetic issuers disclose FY2023
// revenue on the same day with different values; after set_merge(source → target) the lineage read reports the
// conflict and suppresses the current value; the pair writes a failed result and a lineage_conflict item;
// resolve_lineage_conflict keeps the target's row (the other is quarantined), the conflict disappears, the kept
// value is current again with its recorded issuer, and materialize writes metrics whose based_on_lineage holds
// both members' state revisions.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../../db/pg-table-client';
import type {TableClient} from '../../db/table-client';
import {MAPPING_GEN} from '../../facts/concepts';
import {FORMULA_VERSION,materialize} from '../../facts/derive';
import {pgFactsDb} from '../../facts/pg-facts-db';
import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {ProviderError,snapshotOf} from '../../facts/providers/shared';
import {memorySnapshotStore} from '../../facts/snapshot-store';
import {runFactsSync} from '../../facts/sync';
import type {FactsDb,RawSnapshot} from '../../facts/types';
import {startBatch} from '../batches';
import {memoryRawStore} from '../raw-store';
import {lineageSameDayPair} from './pair-lineage';
import {runReconcile} from './run';

const enabled=!!process.env.S4_TEST_STATE;
const PAIR='facts.lineage_same_day' as const;
const ADMIN=randomUUID();
const S={ticker:'ZQLS',cik:'9990011',name:'ZQ Lineage Source',accn:'0009990011-24-000001',revenue:1000};
const T={ticker:'ZQLT',cik:'9990012',name:'ZQ Lineage Target',accn:'0009990012-24-000001',revenue:1200};
const doc=(x:typeof S,withNetIncome:boolean)=>new TextEncoder().encode(JSON.stringify({cik:Number(x.cik),entityName:x.name,facts:{'us-gaap':{
 Revenues:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:x.revenue,accn:x.accn,fy:2023,fp:'FY',form:'10-K',filed:'2024-02-15'}]}},
 ...(withNetIncome?{NetIncomeLoss:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:120,accn:x.accn,fy:2023,fp:'FY',form:'10-K',filed:'2024-02-15'}]}}}:{}),
}}}));
const K='revenue:2023-01-01:2023-12-31:consolidated:USD';

describe.skipIf(!enabled)('facts.lineage_same_day on real PostgreSQL (§9.3)',()=>{
 let admin:Pool;let db:FactsDb;let tables:TableClient;let s='';let t='';
 const q=(text:string,values:unknown[]=[])=>admin.query(text,values).then(r=>r.rows);
 const today=()=>new Date().toISOString().slice(0,10);
 const factOf=async(issuer:string)=>(await q(`select fact_id from public.financial_facts where issuer_id=$1 and concept='revenue'`,[issuer]))[0].fact_id as string;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});db=pgFactsDb(admin);tables=pgTableClient(admin);
  expect((await q(`select count(*)::int as n from public.dq_reconcile_cycles where pair=$1 and status='running'`,[PAIR]))[0].n,'a foreign running cycle of this pair (contract note 14)').toBe(0);
  // set_merge audits into research_audit_log, whose user_id references auth.users: the resolver must exist (Task 8a's user fixture; plan audit P11)
  await q(`insert into auth.users(id,email) values($1,$2) on conflict (id) do nothing`,[ADMIN,`${ADMIN}@lineage.test`]);
  const provision=async(x:typeof S)=>{
   await q(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[x.ticker,x.name]);
   await q(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),x.name,x.cik]);
   const id=(await q(`select issuer_id from public.issuers where cik=$1`,[x.cik]))[0].issuer_id as string;
   await q(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[id,x.ticker]);
   return id;
  };
  s=await provision(S);t=await provision(T);
  await db.reconcileScope('US',[{issuer_id:s,reasons:['test'],priority:10,fetch_key:S.cik.padStart(10,'0')},{issuer_id:t,reasons:['test'],priority:10,fetch_key:T.cik.padStart(10,'0')}]);
  await q(`update public.fact_sync_scope set next_due_at='2999-01-01' where issuer_id = any($1::uuid[])`,[[s,t]]);
  const bytes=new Map([[S.cik.padStart(10,'0'),doc(S,false)],[T.cik.padStart(10,'0'),doc(T,true)]]);
  const sync=await runFactsSync({db,tables,storage:memorySnapshotStore(),
   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{const b=bytes.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10)});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
   now:()=>new Date(),deadline:null,codeVersion:'test'},{market:'US',limit:10,issuerIds:[s,t],dryRun:false,triggeredBy:'script',mappingGen:MAPPING_GEN});
  expect(sync.detail).toMatchObject({published:2,failed:0});
 },120_000);
 afterAll(async()=>{
  if(db&&s&&t)await db.reconcileScope('US',[{issuer_id:s,reasons:[],priority:0,fetch_key:S.cik.padStart(10,'0')},{issuer_id:t,reasons:[],priority:0,fetch_key:T.cik.padStart(10,'0')}]).catch(()=>{});
  await admin?.end();
 });

 it('set_merge → the lineage read reports the same-day conflict and suppresses the current value',async()=>{
  await q(`update public.issuer_securities set valid_to=current_date, valid_to_method='curated' where issuer_id=$1 and valid_to is null`,[s]);
  expect(await db.setMerge(s,t,ADMIN)).toEqual({repointed:0});
  const lineage=await db.lineageOf(t);
  expect(lineage).toEqual([t,s]);
  const env=await db.readFactsLineage(lineage,'US',{concepts:['revenue','net_income_parent'],asOf:today()});
  expect(env.conflicts).toHaveLength(1);
  expect(new Set(env.conflicts[0].fact_ids)).toEqual(new Set([await factOf(s),await factOf(t)]));
  expect(env.rows.filter(r=>r.concept==='revenue'&&r.is_current)).toEqual([]);
  expect(env.rows.filter(r=>r.concept==='net_income_parent'&&r.is_current).map(r=>r.value)).toEqual(['120']);
 });

 it('the pair writes a failed numeric result and one lineage_conflict item; resolve_lineage_conflict restores one current value; metrics carry both lineage revisions',async()=>{
  const r=await runReconcile({db,tables,raw:memoryRawStore(),fetch:(async()=>{throw new Error('no network');}) as unknown as typeof fetch,readRepoFile:async()=>{throw new Error('no repo file');},
   now:()=>new Date(),deadline:null,codeVersion:'test',pairs:{[PAIR]:lineageSameDayPair({targets:[t]})}},{pair:PAIR,triggeredBy:'script',issuerIds:[t]});
  expect(r.members).toEqual([expect.objectContaining({issuerId:t,market:'US',outcome:'done',counts:{compared_passed:0,compared_failed:1,not_compared:0}})]);
  const nk=`${t}:${K}:2024-02-15`;
  const [row]=await q(`select kind,outcome,passed,left_value::text as l,right_value::text as r from public.dq_reconciliations where pair=$1 and natural_key=$2`,[PAIR,nk]);
  expect(row).toMatchObject({kind:'numeric',outcome:'compared',passed:false});
  expect(new Set([row.l,row.r])).toEqual(new Set(['1000','1200']));
  const items=await q(`select id,status,dataset,payload from public.dq_quarantine where reason_code='lineage_conflict' and natural_key=$1`,[nk]);
  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({status:'open',dataset:'facts.us'});
  const keep=await factOf(t);
  const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset:'facts.us'});
  expect(await db.resolveLineageConflict(items[0].id,keep,batchId,ADMIN)).toEqual({quarantined:1});
  expect((await q(`select status,detail from public.dq_quarantine where id=$1`,[items[0].id]))[0]).toMatchObject({status:'resolved_accept',detail:expect.objectContaining({chosen_fact_ids:[keep]})});
  expect((await q(`select status from public.financial_facts where fact_id=$1`,[await factOf(s)]))[0].status).toBe('quarantined');
  const env=await db.readFactsLineage([t,s],'US',{concepts:['revenue'],asOf:today()});
  expect(env.conflicts).toEqual([]);
  expect(env.rows.filter(x=>x.is_current).map(x=>[x.issuer_id,x.value])).toEqual([[t,'1200']]);
  await materialize(db,t,'US');
  const revs=(await db.stateRevs([t,s],'US')).sort((a,b)=>a.issuer_id<b.issuer_id?-1:1);
  const metrics=await db.metricsOfIssuer(t,'US',FORMULA_VERSION);
  expect(metrics.find(m=>m.metric==='net_margin'&&m.duration==='12M')?.value).toBe('0.1');
  for(const m of metrics)expect([...m.based_on_lineage].sort((a,b)=>a.issuer_id<b.issuer_id?-1:1)).toEqual(revs);
 },120_000);
});
