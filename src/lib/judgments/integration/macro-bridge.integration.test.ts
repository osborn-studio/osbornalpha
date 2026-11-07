// PG17 bridge: real macro RPC rows and publication, SQL-backed MacroReadApi, F4 producer/settlement and route projection.
// S4 creates the database. This suite uses the F4 claim mutex because claimOne/claimDue are global across suites.
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {pgTableClient,typeParsers} from '../../db/pg-table-client';
import {startBatch} from '../../dq/batches';
import {CATALOG_VERSION,MACRO_CATALOG} from '../../macro/catalog';
import {observationFromRow,publishArgs,regimeFromRow,selectEligibleHistoryAsOf,snapshotFromRow} from '../../macro/db';
import type {MacroDb} from '../../macro/db';
import {macroReadApi} from '../../macro/read-api';
import {publishRegion} from '../../macro/snapshots';
import {macroJudgmentsEnabled} from '../../macro/flags';
import type {ObservationRow} from '../../macro/types';
import {GET} from '../../../app/api/judgments/[id]/route';
import {cardLite,judgmentDetailOf} from '../../macro/strategy/f4-client';
import {digest,inputsHash} from '../canonical';
import {judgmentDetailPayload} from '../detail-payload';
import {withClaimLock} from '../db-contract';
import {formulaHashOf} from '../formula-hash';
import {pgJudgmentInputsDb} from '../inputs-db';
import {macroRegimeV1} from '../methodologies/macro-regime.v1';
import {pgJudgmentsDb} from '../pg-judgments-db';
import {produce} from '../produce';
import {methodologyRowOf} from '../registry';
import {macroRegimeReplayResolver} from '../resolvers/macro';
import {settleOne} from '../settle';

const routeReads=vi.hoisted(()=>({current:null as import('../public-reads').PublicReads|null}));
vi.mock('../public-reads',async importOriginal=>{const actual=await importOriginal<typeof import('../public-reads')>();return {...actual,publicReads:()=>{if(!routeReads.current)throw new Error('missing PG route dependencies');return routeReads.current;}};});
const enabled=!!process.env.S4_TEST_STATE;
const CODE='abcdef1';
const AT='2026-10-01T00:00:00.000Z';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const weighted=['US_DFF','US_DGS10','US_DTWEXBGS','US_CPI_YOY'] as const; // 65% of US weight
const parents=['US_FEDFUNDS_EFF_D','US_DGS10_D','US_DTWEXBGS_D','US_CPI_INDEX'] as const;

describe.skipIf(!enabled)('macro ↔ F4 bridge on PG17',()=>{
 let pool:Pool;
 beforeAll(()=>{const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));pool=new Pool({connectionString:state.adminUrl,max:8,types:typeParsers});});
 afterAll(async()=>{await pool?.end();});
 const rows=async(sql:string,args:unknown[]=[])=>((await pool.query(sql,args)).rows as Record<string,unknown>[]);
 const one=async(sql:string,args:unknown[]=[])=>rows(sql,args).then(r=>r[0]);
 const observations=async(ids:string[]):Promise<ObservationRow[]>=>ids.length?(await rows('select * from public.macro_observations where observation_id=any($1::uuid[])',[ids])).map(observationFromRow):[];
 const receipts=async(ids:string[])=>{
  const out:Record<string,{status:string;finished_at:string|null}>={};
  if(ids.length)for(const r of await rows('select batch_id,status,finished_at from public.ingest_batches where batch_id=any($1::uuid[])',[ids]))out[String(r.batch_id)]={status:String(r.status),finished_at:r.finished_at===null?null:new Date(String(r.finished_at)).toISOString()};
  return out;
 };
 const candidates=async(series:string,to:string,cutoff:string)=>
  (await rows(`select o.* from public.macro_observations o join public.ingest_batches b on b.batch_id=o.batch_id
   where o.series_id=$1 and o.period_end<=$2::date and o.available_at<=$3::timestamptz and o.status='ok'
   and b.status in ('success','partial') and (b.finished_at<=$3::timestamptz or b.finished_at is null) order by o.period_end desc,o.version desc`,[series,to,cutoff])).map(observationFromRow);
 const macroDb=():MacroDb=>({
  observationsByIds:observations,
  batchFinishedAt:async ids=>{const found=await receipts(ids);return Object.fromEntries(ids.map(id=>[id,['success','partial'].includes(found[id]?.status)?found[id].finished_at:null]));},
  versionsOf:async(s,p)=>(await rows('select * from public.macro_observations where series_id=$1 and period_end=$2::date order by version',[s,p])).map(observationFromRow),
  eligibleHistoryAsOf:async(s,o)=>selectEligibleHistoryAsOf(await candidates(s,o.to,o.asOf),o.asOf,o.maxRows,observations,receipts),
  eligibleHistory:async(s,o)=>{
   const out:ObservationRow[]=[];let after:string|null=null;
   for(;;){
    const part:ObservationRow[]=(await rows('select * from public.macro_eligible_history($1,$2::date,$3::date,$4::timestamptz,$5::uuid,$6::date,1000)',[s,o.from??null,o.to??null,o.asOf??null,o.includeBatch??null,after])).map(observationFromRow);
    out.push(...part);if(out.length>o.maxRows)throw new Error(`eligible_history:${s}:>${o.maxRows}`);
    if(part.length<1000)return out;after=part.at(-1)!.period_end;
   }
  },
  latestEligible:async(ids,o={})=>ids.length?(await rows('select * from public.macro_latest_eligible_observations($1::text[],$2::timestamptz,$3::date,$4::uuid)',[ids,o.asOf??null,o.periodEndLte??null,o.includeBatch??null])).map(observationFromRow):[],
  publishState:async region=>{const r=(await one('select revision,input_revision from public.macro_publish_state where region=$1',[region]))!;return {revision:Number(r.revision),inputRevision:Number(r.input_revision)};},
  publishSnapshot:async p=>{const a=publishArgs(p);const r=(await one(`select public.publish_macro_snapshot($1,$2,$3,$4::date,$5,$6,$7::uuid[],$8::uuid[],$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17) v`,[a.p_region,a.p_expected_revision,a.p_expected_input_revision,a.p_as_of,a.p_methodology_version,a.p_catalog_version,a.p_observation_ids,a.p_history_ids,JSON.stringify(a.p_catalog_counts),JSON.stringify(a.p_regime),JSON.stringify(a.p_contributions),a.p_rules_version,a.p_uncovered_weight,a.p_publish_key,a.p_batch_id,a.p_owner_token,a.p_finish_token]))!;return r.v as {snapshot_id:string;revision:number;replayed:boolean};},
  recordFailedSnapshot:async p=>String((await one('select public.record_failed_macro_snapshot($1,$2::date,$3,$4,$5) v',[p.region,p.asOf,p.methodologyVersion,p.catalogVersion,p.reason]))!.v),
  snapshot:async id=>{const r=await one('select * from public.macro_snapshots where snapshot_id=$1',[id]);return r?snapshotFromRow(r):null;},
  snapshotsSince:async(marker,limit)=>(await rows('select * from public.macro_snapshots where ($1::timestamptz is null or (created_at,snapshot_id)>($1::timestamptz,$2::uuid)) and status<>\'failed\' order by created_at,snapshot_id limit $3',[marker?.created_at??null,marker?.snapshot_id??null,limit])).map(snapshotFromRow),
  regimeOf:async id=>{const r=await one('select * from public.macro_regime_results where snapshot_id=$1',[id]);return r?regimeFromRow(r):null;},
 } as MacroDb);

 it('publishes once, freezes input hashes, replays cutoff evidence, and parses F4 detail',async()=>{
  await withClaimLock(pool,async()=>{
   // The canonical catalog is idempotent and shared by all macro suites.
   await pool.query("select public.macro_upsert_catalog($1,'macro-regime-rules/1.0',$2::jsonb)",[CATALOG_VERSION,JSON.stringify(MACRO_CATALOG)]);
   const batch=randomUUID();
   await pool.query("insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ts-fred','macro.fred')",[batch]);
   for(const period of ['2026-06-30','2026-09-30'])for(let i=0;i<parents.length;i++){
    const body=`${batch}:${period}:${parents[i]}`;const hash=sha(body);
    const retrieval=(await one(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',1,'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE','fred.stlouisfed.org',200,$3,$4,'{"node":"22"}'::jsonb,null) v`,[hash,`fred_csv/${hash}.csv`,AT,batch]))!.v;
    const value=i===2?(period==='2026-06-30'?'100':'110'):[4,3,0,300][i];
    const native={series_id:parents[i],period_end:period,value_text:String(value),available_at:AT,revisable:i===3,retrieval_id:retrieval,locator:{kind:'csv_row',line:2,column:1}};
    const write=(await one('select public.macro_write_observations($1,$2,$3::jsonb,null) v',[batch,CODE,JSON.stringify([native])]))!.v as {inserted:number};
    expect(write.inserted).toBe(1);
    const parent=(await one('select observation_id from public.macro_observations where batch_id=$1 and series_id=$2 and period_end=$3::date',[batch,parents[i],period]))!;
    const derived={series_id:weighted[i],period_end:period,value_text:String(i===3?3:value),available_at:AT,revisable:i===3,derived_from:[parent.observation_id],transform:i===3?'yoy_from_index@1':'month_end@1'};
    expect(((await one('select public.macro_write_observations($1,$2,$3::jsonb,null) v',[batch,CODE,JSON.stringify([derived])]))!.v as {inserted:number}).inserted).toBe(1);
   }
   await pool.query("select public.macro_finalize_batch($1,null,null,'success',$2::jsonb,'[]'::jsonb,now())",[batch,JSON.stringify({fetched:16,inserted:16,duplicates:0,versioned:0,quarantined:0,failed:0})]);
   const macro=macroDb();const api=macroReadApi(macro,{judgments:macroJudgmentsEnabled({MACRO_JUDGMENTS_ENABLED:'1'})});
   const receipt=await publishRegion({db:macro,env:{MACRO_JUDGMENTS_ENABLED:'1'}},'US','2026-10-01',{publishKey:`ingest:${batch}`});
   expect(receipt.status,receipt.status==='failed'?receipt.reason:JSON.stringify(receipt)).toBe('published');if(receipt.status!=='published')return;
   expect(receipt.regime).toBe('classified');
   const snapshot=(await api.snapshot(receipt.snapshot_id))!;expect(snapshot.observation_ids.length).toBeGreaterThan(0);
   const judgments=pgJudgmentsDb(pool),tables=pgTableClient(pool),inputsDb=pgJudgmentInputsDb(pool,api);
   // The isolated registry alias shares v1's full definition and formula hash; formulaHashOf includes id, so normalize only the alias when hashing.
   // CI has no PostgREST server, and the SQL test ports exercise the same PG functions as production.
   const method={...macroRegimeV1,id:`ztest_macro_${randomUUID().replaceAll('-','').slice(0,12)}`};
   const hashes=formulaHashOf({...method,id:macroRegimeV1.id});expect(hashes.formula_hash).toBe(formulaHashOf(macroRegimeV1).formula_hash);expect(method.gather).toBe(macroRegimeV1.gather);expect(method.compute).toBe(macroRegimeV1.compute);expect(method.condition).toBe(macroRegimeV1.condition);await judgments.syncMethodology(methodologyRowOf(method,hashes,{publishable:true,code_version:CODE}),'script','PG17 bridge test method');
   const {batchId}=await startBatch(tables,{producer:'ts-judgments',dataset:'judgments.produce.macro_regime'});
   const work=[{subject:{type:'macro_region' as const,key:'US'},asOf:snapshot.as_of,binding:{snapshot_id:snapshot.snapshot_id}}];
   const deps={db:judgments,inputsDb,tables,resolverOf:()=>macroRegimeReplayResolver,batchId,codeVersion:CODE};
   const first=await produce(method,work,deps);const again=await produce(method,work,{...deps,db:pgJudgmentsDb(pool),inputsDb:pgJudgmentInputsDb(pool,macroReadApi(macroDb(),{judgments:macroJudgmentsEnabled({MACRO_JUDGMENTS_ENABLED:'1'})}))});
   expect(first.items[0].status,JSON.stringify(first.errors)).toBe('inserted');expect(again.items[0].status,JSON.stringify(again.errors)).toBe('duplicate');
   const id=first.items[0].judgment_id!;const judgment=(await judgments.getJudgment(id))!;
   expect(again.items[0].judgment_id).toBe(id);
   expect((await rows('select judgment_id from public.judgments where methodology_id=$1 and methodology_version=$2 and inputs @> $3::jsonb',[method.id,method.version,JSON.stringify([{kind:'macro_snapshot',ref:{snapshot_id:snapshot.snapshot_id}}])]))).toHaveLength(1);
   expect(judgment.abstained).toBe(false);expect(judgment.inputs_hash).toBe(inputsHash(judgment.inputs));
   const frozen=judgment.inputs.find(x=>x.kind==='macro_snapshot')!;
   expect(frozen.ref).toEqual({snapshot_id:snapshot.snapshot_id});
   expect(frozen.snapshot).toMatchObject({snapshot_id:snapshot.snapshot_id,observation_ids:snapshot.observation_ids,primary_state:snapshot.regime!.primary_state});
   expect(frozen.hash).toBe(digest(frozen.snapshot));
   expect(judgment.inputs.filter(x=>x.kind==='macro_observation')).toHaveLength(snapshot.observation_ids.length);
   for(const input of judgment.inputs.filter(x=>x.kind==='macro_observation')){
    expect(input.hash).toBe(digest(input.snapshot));
    const observation=await api.observation(`${input.ref.series_id}:${input.ref.period_end}:${input.ref.vintage_id}`);
    expect(observation).not.toBeNull();expect(input.snapshot).toMatchObject(observation!);
   }
   // The target is 2027-01 with 30 grace days, so settle_by is after 2027-02-01.
   // Finalize the newer vintage after the actual cutoff to keep it out of historical replay.
   const cutoff=judgment.settle_by!;
   const lateAt=new Date(Date.parse(cutoff)+86_400_000).toISOString();
   const lateBatch=randomUUID(),lateHash=sha(`late:${lateBatch}`);
   await pool.query("insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ts-fred','macro.fred')",[lateBatch]);
   const lateRetrieval=(await one(`select public.macro_put_retrieval($1,$2,'fred_csv','text/csv',1,'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE','fred.stlouisfed.org',200,$3,$4,'{"node":"22"}'::jsonb,null) v`,[lateHash,`fred_csv/${lateHash}.csv`,AT,lateBatch]))!.v;
   const lateNative={series_id:'US_CPI_INDEX',period_end:'2026-09-30',value_text:'305',available_at:AT,revisable:true,retrieval_id:lateRetrieval,locator:{kind:'csv_row',line:2,column:1}};
   expect(((await one('select public.macro_write_observations($1,$2,$3::jsonb,null) v',[lateBatch,CODE,JSON.stringify([lateNative])]))!.v as {versioned:number}).versioned).toBe(1);
   const parent=(await one('select observation_id from public.macro_observations where batch_id=$1 and series_id=$2',[lateBatch,'US_CPI_INDEX']))!;
   const lateDerived={series_id:'US_CPI_YOY',period_end:'2026-09-30',value_text:'5',available_at:AT,revisable:true,derived_from:[parent.observation_id],transform:'yoy_from_index@1'};
   expect(((await one('select public.macro_write_observations($1,$2,$3::jsonb,null) v',[lateBatch,CODE,JSON.stringify([lateDerived])]))!.v as {versioned:number}).versioned).toBe(1);
   await pool.query("select public.macro_finalize_batch($1,null,null,'success',$2::jsonb,'[]'::jsonb,$3::timestamptz)",[lateBatch,JSON.stringify({fetched:2,inserted:0,duplicates:0,versioned:2,quarantined:0,failed:0}),lateAt]);
   const batchReceipts=await receipts([batch,lateBatch]);
   const firstAt=batchReceipts[batch]?.finished_at,secondAt=batchReceipts[lateBatch]?.finished_at;
   const receiptOrder=`cutoff=${cutoff}, first receipt=${firstAt}, late receipt=${secondAt}`;
   expect(firstAt!==null&&firstAt!==undefined&&secondAt!==null&&secondAt!==undefined&&Date.parse(firstAt)<=Date.parse(cutoff)&&Date.parse(cutoff)<Date.parse(secondAt),receiptOrder).toBe(true);
   // The resolver uses the real SQL eligible-history selector at the judgment's cutoff vintage.
   const replay=await macroRegimeReplayResolver.resolve({judgment,cutoff,now:cutoff,inputsDb,signal:new AbortController().signal});
   expect(replay.status).toBe('resolved');if(replay.status!=='resolved')return;
   const historical=await api.classifyAsOf('US',snapshot.as_of.slice(0,7),cutoff,'v1.0');
   expect(replay.evidence.observation_refs).toEqual(expect.arrayContaining(historical.observation_refs));
   expect(historical.observation_refs.find(x=>x.series_id==='US_CPI_YOY')?.vintage_id,receiptOrder).toBe('1');
   const later=await api.classifyAsOf('US',snapshot.as_of.slice(0,7),new Date(Date.parse(lateAt)+86_400_000).toISOString(),'v1.0');
   expect(later.observation_refs.find(x=>x.series_id==='US_CPI_YOY')?.vintage_id).toBe('2');
   const settlementBatch=await startBatch(tables,{producer:'ts-judgments',dataset:'judgments.settle'});
   const claimed=await judgments.claimOne(id,600);expect(claimed.status).toBe('claimed');if(claimed.status!=='claimed')return;
   const settleNow=new Date(Date.parse(cutoff)+1000).toISOString();
   const outcome=await settleOne({deps:{db:judgments,inputsDb,tables,codeVersion:CODE,actor:'cron',triggeredBy:'script'},batchId:settlementBatch.batchId,
    now:settleNow,signal:new AbortController().signal,preview:false},
    {...claimed.row,leased_until:new Date(Date.parse(cutoff)+600_000).toISOString()},judgment,0);
   expect(outcome.item.action).toBe('settled');
   const stored=await judgments.settlementsOf([id]);expect(stored).toHaveLength(1);expect(stored[0].evidence).toMatchObject(replay.evidence);
   const {label_available_at:labelAvailableAt,observed_at:observedAt}=stored[0].evidence;
   expect(typeof labelAvailableAt==='string'&&!Number.isNaN(Date.parse(labelAvailableAt))&&new Date(labelAvailableAt).toISOString()===labelAvailableAt).toBe(true);
   expect(typeof observedAt==='string'&&!Number.isNaN(Date.parse(observedAt))&&new Date(observedAt).toISOString()===observedAt).toBe(true);
   expect(observedAt).toBe(settleNow);
   expect(Date.parse(labelAvailableAt as string)).toBeLessThanOrEqual(Date.parse(cutoff));
   const storedRefs=stored[0].evidence.observation_refs as typeof historical.observation_refs;
   expect(storedRefs).toEqual(expect.arrayContaining(historical.observation_refs));
   const storedCpi=storedRefs.filter(ref=>ref.series_id==='US_CPI_YOY'&&ref.period_end==='2026-09-30');
   expect(storedCpi.length).toBeGreaterThan(0);
   expect(storedCpi.every(ref=>ref.vintage_id==='1'),receiptOrder).toBe(true);
   for(const ref of storedRefs){
    expect(Date.parse(ref.available_at)).toBeLessThanOrEqual(Date.parse(cutoff));
    if('batch_id' in ref&&typeof ref.batch_id==='string'){
     const batchReceipt=(await receipts([ref.batch_id]))[ref.batch_id]?.finished_at;
     if(batchReceipt!==null&&batchReceipt!==undefined)expect(Date.parse(batchReceipt)).toBeLessThanOrEqual(Date.parse(cutoff));
    }
   }
   // CI has no PostgREST or Next server: GET runs directly over F4's PG SQL port.
   routeReads.current={db:judgments,settlements:async()=>judgments.settlementsOf([id]),judgmentLocator:async()=>null,recentSettlements:async()=>[]};
   const response=await GET(new Request(`https://alpha.example/api/judgments/${id}`),{params:Promise.resolve({id})});
   expect(response.status).toBe(200);const payload=await response.json();const detail=judgmentDetailOf(payload);const lite=cardLite(payload.card);
   const projected=await judgmentDetailPayload(routeReads.current,id,{view:'latest',asOf:null},new Date().toISOString());
   expect(projected).not.toBeNull();expect(projected?.judgment.inputs).toEqual(payload.judgment.inputs);
   expect(detail.selected).toBe(snapshot.regime!.primary_state);expect(lite.selected).toBe(detail.selected);
   expect(payload.judgment.inputs).toHaveLength(judgment.inputs.length);
   expect(detail.inputs.every(x=>Object.keys(x.ref).length>0&&Object.keys(x.snapshot).length>0)).toBe(true);
   expect(detail.settlements[0].evidence).toMatchObject({observation_refs:expect.any(Array)});
  });
 },180000);
});
