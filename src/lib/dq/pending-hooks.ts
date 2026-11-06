// src/lib/dq/pending-hooks.ts
// Unfinished materialisations (plan 3 spec §4.6, U2): (a) RESOLVED facts.* items whose hook is
// pending or failed, plus accepted plan-3 visibility verdicts (adoption, restore, lineage) with no
// hook at all; (b) OPEN reconcile_mismatch items whose hook is pending or failed (a reconciliation
// quarantine stays open until a human decides). The target is the item's persisted issuer/market
// (hookTarget); the CURRENT topology maps it to T(i), so a merge after the verdict still lands on
// the right target; one materialize per (T, market), then every item's hook is written done /
// failed. Items without a usable target are reported (untargeted), never guessed. Read-complete
// (selectAll pages to exhaustion); never throws per target.
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {materialize as realMaterialize} from '../facts/derive';
import {FactsDbError} from '../facts/types';
import type {FactsDb,Market} from '../facts/types';
import {FACT_ROW_REASONS,VERDICT_REASONS,hookTarget,writeHookCas} from './facts-resolver';
import type {HookState} from './facts-resolver';

export interface PendingHookItem{id:string;reason:string;status:string;issuer:string;market:Market;
 /** hook.at the scan observed (the compare-and-set fence of the done / failed write); null = the item had no hook */
 hookAt:string|null}
/** failed = targets whose materialize failed; hookWriteFailed = items whose hook write was rejected (materialization may have succeeded); skippedStale = items a newer pending hook superseded while we materialised (left to their owner / the next scan) */
export interface PendingHookReport{items:number;targets:{target:string;market:Market;state:'done'|'failed';message?:string;items:string[]}[];failed:number;hookWriteFailed:number;skippedStale:number;untargeted:string[]}
export interface PendingHookDeps{db:FactsDb;tables:TableClient;now?:()=>Date;materialize?:typeof realMaterialize}

const hookState=(r:Row)=>((r.detail??{}) as {hook?:{state?:unknown}}).hook?.state;
const hasHook=(r:Row)=>((r.detail??{}) as {hook?:unknown}).hook!==undefined;
const isVerdict=(r:Row)=>{
 const d=(r.detail??{}) as Record<string,unknown>;const reason=String(r.reason_code);
 return reason==='ambiguous_value'?typeof d.adopted_fact_id==='string':reason==='reconcile_mismatch'?typeof d.restored_by_batch==='string':reason==='lineage_conflict'?Array.isArray(d.chosen_fact_ids):false;
};

export async function findPendingHooks(tables:TableClient):Promise<{items:PendingHookItem[];untargeted:string[]}>{
 const items:PendingHookItem[]=[];const untargeted:string[]=[];
 const take=(r:Row)=>{const t=hookTarget(r);if(!t){untargeted.push(String(r.id));return;}const at=((r.detail??{}) as {hook?:{at?:unknown}}).hook?.at;items.push({id:String(r.id),reason:String(r.reason_code),status:String(r.status),issuer:t.issuer,market:t.market,hookAt:typeof at==='string'?at:null});};
 for(const reason of [...FACT_ROW_REASONS,...VERDICT_REASONS])for(const status of ['resolved_accept','resolved_reject']){
  for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:reason,status},'id')){
   const st=hookState(r);
   if(st==='pending'||st==='failed'||(!hasHook(r)&&status==='resolved_accept'&&isVerdict(r)))take(r);
  }
 }
 for(const r of await selectAll(tables,'dq_quarantine',{table_name:'financial_facts',reason_code:'reconcile_mismatch',status:'open'},'id')){
  const st=hookState(r);if(st==='pending'||st==='failed')take(r);
 }
 return {items,untargeted};
}

export async function runPendingHooks(deps:PendingHookDeps):Promise<PendingHookReport>{
 const now=deps.now??(()=>new Date());const run=deps.materialize??realMaterialize;
 const {items,untargeted}=await findPendingHooks(deps.tables);
 const groups=new Map<string,{target:string;market:Market;items:PendingHookItem[]}>();
 for(const it of items){
  const target=await deps.db.targetOf(it.issuer);
  const k=`${target}|${it.market}`;const g=groups.get(k)??{target,market:it.market,items:[]};g.items.push(it);groups.set(k,g);
 }
 const report:PendingHookReport={items:items.length,targets:[],failed:0,hookWriteFailed:0,skippedStale:0,untargeted};
 const ordered=[...groups.values()].sort((a,b)=>a.target<b.target?-1:a.target>b.target?1:a.market<b.market?-1:a.market>b.market?1:0);
 for(const g of ordered){
  let hook:HookState;
  try{await run(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:now().toISOString()};}
  catch(e){
   console.error('[pending-hooks] materialize',e instanceof Error?e.message:String(e));
   hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
  }
  for(const it of g.items){
   const w=await writeHookCas(deps.tables,it.id,hook,it.hookAt??undefined);
   if(w.result==='stale')report.skippedStale++;else if(w.result==='write_failed')report.hookWriteFailed++;
  }
  if(hook.state==='failed')report.failed++;
  report.targets.push({target:g.target,market:g.market,state:hook.state,...(hook.message!==undefined?{message:hook.message}:{}),items:g.items.map(i=>i.id)});
 }
 return report;
}
