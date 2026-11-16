// Real PostgreSQL transaction semantics, not evidence of the production timeout cause.
// Complements #168's large-body replay: these cases establish a specific uncommitted-insert
// blocker before cancellation/rollback. No HTTP gateway or production payload is involved.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {testManifest} from './db-contract';
import {canonicalJson,sha256Hex} from './hash';
import type {StrategyManifest} from './contract';

const PUT=`select public.macro_put_manifest($1,$2::jsonb,$3,$4,$5,$6,$7) id`;
const hash=(body:StrategyManifest)=>sha256Hex(canonicalJson(body));
const put=async(client:PoolClient,body:StrategyManifest)=>
 (await client.query<{id:string}>(PUT,[body.kind,canonicalJson(body),hash(body),body.cutoff,
  body.method_version,body.code_version,body.catalog_version])).rows[0].id;
const fixture=()=>{
 const body=testManifest('cycle_table');
 body.inputs=[0,1].map(i=>({series_id:'US_DGS10_D',role:'col:US_DGS10_D:history',
  observation_id:randomUUID(),period_end:`2026-11-0${i+1}`,value_text:`${i}.123456789`,version:1,
  available_at:body.cutoff,source:{kind:'history' as const,as_of:body.cutoff}}));
 return body;
};

describe.skipIf(!process.env.S4_TEST_STATE)('macro_put_manifest uncommitted insert locks on local PostgreSQL',()=>{
 let pool:Pool;
 beforeAll(()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  if(!['127.0.0.1','localhost','[::1]'].includes(new URL(state.adminUrl).hostname)){
   throw new Error('Manifest lock tests require a disposable loopback database');
  }
  pool=new Pool({connectionString:state.adminUrl,max:4,connectionTimeoutMillis:5000,statement_timeout:10000});
 });
 afterAll(async()=>{await pool?.end();});

 // A bounded series of database observations, not a delay used as evidence of blocking.
 // Filter by the exact waiter PID and verify the exact holder with pg_blocking_pids.
 async function waitForInsertLock(observer:PoolClient,waiterPid:number,holderPid:number){
  const deadline=performance.now()+5000;
  while(performance.now()<deadline){
   const {rows}=await observer.query(`select state,wait_event_type,wait_event,
    $2::int=any(pg_blocking_pids(pid)) blocked_by_holder
    from pg_stat_activity where pid=$1 and query like '%macro_put_manifest%'`,[waiterPid,holderPid]);
   const row=rows[0];
   if(row?.state==='active'&&row.wait_event_type==='Lock'&&row.blocked_by_holder){
    expect(row.wait_event).toBe('transactionid');
    return;
   }
  }
  throw new Error('Did not observe the manifest insert waiting on its uncommitted holder');
 }
 async function rows(client:PoolClient,body:StrategyManifest){
  return (await client.query(`select manifest_id,kind,body,manifest_hash,cutoff,
   method_version,code_version,catalog_version from public.macro_strategy_manifests where manifest_hash=$1`,[hash(body)])).rows;
 }
 async function assertStored(client:PoolClient,body:StrategyManifest,id:string){
  const stored=await rows(client,body);
  expect(stored).toEqual([{manifest_id:id,kind:body.kind,body,manifest_hash:hash(body),cutoff:new Date(body.cutoff),
   method_version:body.method_version,code_version:body.code_version,catalog_version:body.catalog_version}]);
  expect(sha256Hex(canonicalJson(stored[0].body))).toBe(stored[0].manifest_hash);
 }
 async function beginService(client:PoolClient){
  await client.query('begin; set local role service_role');
 }

 for(const cancel of [true,false]){
  it(cancel?'cancels a same-hash waiter without partial provenance, then retries after rollback':
   'persists complete provenance when an observed same-hash blocker rolls back',async()=>{
   const holder=await pool.connect(),waiter=await pool.connect(),observer=await pool.connect();
   let pending:Promise<{id:string}|{error:unknown}>|undefined;
   try{
    const holderPid=(await holder.query('select pg_backend_pid() pid')).rows[0].pid;
    const waiterPid=(await waiter.query('select pg_backend_pid() pid')).rows[0].pid;
    const body=fixture();
    await beginService(holder);
    const rolledBackId=await put(holder,body);
    await assertStored(holder,body,rolledBackId);
    expect(await rows(observer,body)).toEqual([]);
    await beginService(waiter);
    // Attach the rejection handler immediately so a failed observation cannot leak a rejection.
    pending=put(waiter,body).then(id=>({id}),error=>({error}));
    await waitForInsertLock(observer,waiterPid,holderPid);
    expect(await rows(observer,body)).toEqual([]);
    if(cancel){
     expect((await observer.query('select pg_cancel_backend($1) canceled',[waiterPid])).rows[0].canceled).toBe(true);
     const result=await pending;
     expect(result).toHaveProperty('error');
     if(!('error' in result))throw new Error('Expected the blocked insert to be canceled');
     expect(result.error).toMatchObject({code:'57014',message:'canceling statement due to user request'});
     // Cancellation aborts the transaction; explicitly roll it back before reusing the connection.
     await expect(waiter.query('select 1')).rejects.toMatchObject({code:'25P02'});
     await waiter.query('rollback');
     expect(await rows(observer,body)).toEqual([]);
     await assertStored(holder,body,rolledBackId);
    }
    await holder.query('rollback');
    let id:string;
    if(cancel){
     expect(await rows(observer,body)).toEqual([]);
     await beginService(waiter);
     id=await put(waiter,body);
    }else{
     const result=await pending;
     if('error' in result)throw result.error;
     id=result.id;
    }
    expect(id).not.toBe(rolledBackId);
    await assertStored(waiter,body,id);
    await waiter.query('commit');
    await assertStored(observer,body,id);
    await beginService(waiter);
    expect(await put(waiter,body)).toBe(id);
    const changed=structuredClone(body);
    changed.inputs.at(-1)!.value_text='999.123456789';
    // Keep the original hash to verify cancellation/rollback did not weaken conflict validation.
    await expect(waiter.query(PUT,[changed.kind,canonicalJson(changed),hash(body),changed.cutoff,
     changed.method_version,changed.code_version,changed.catalog_version])).rejects.toMatchObject({message:'payload_conflict'});
    await waiter.query('rollback');
    await assertStored(observer,body,id);
   }finally{
    // Release the blocker first so even a failed assertion cannot strand the pending query.
    await holder.query('rollback');
    await pending;
    await waiter.query('rollback');
    holder.release();waiter.release();observer.release();
   }
  },30000);
 }

 it('commits a different hash while the first insert remains uncommitted',async()=>{
  const holder=await pool.connect(),other=await pool.connect(),observer=await pool.connect();
  try{
   const body=fixture(),different=structuredClone(body);
   different.inputs.at(-1)!.value_text='222.987654321';
   expect(hash(different)).not.toBe(hash(body));
   await beginService(holder);
   const rolledBackId=await put(holder,body);
   await beginService(other);
   const id=await put(other,different);
   await other.query('commit');
   // The independent insert completed before the holder was released.
   await assertStored(holder,body,rolledBackId);
   expect(await rows(observer,body)).toEqual([]);
   await assertStored(observer,different,id);
   await holder.query('rollback');
   expect(await rows(observer,body)).toEqual([]);
   await assertStored(observer,different,id);
  }finally{
   await holder.query('rollback');await other.query('rollback');
   holder.release();other.release();observer.release();
  }
 },30000);
});
