// src/lib/facts/memory-facts-db.ts
// In-memory FactsDb for unit tests (spec §4.8, §11.1). It reproduces the SQL functions' rules so
// sync/plan/derive unit tests see the same behaviour as the database: scope rows and leases
// (claim / renew / expiry against an injectable clock), run lifecycle (begin abandons staged runs:
// mark → delete facts → prune empty gen-0 filings), the append-only status transitions, publish
// (staged→ok, conflict disposition derived from OPEN same_day_conflict items, mapping_gen
// activation with regression check, state_rev + 1), quarantine membership merge, resolve/promote
// eligibility, stale metric rejection, and the read_facts envelope (generation filter per filing,
// disclosure_seq / is_current / is_revision over ok rows, key ranking and limit, 10,000-row cap).
// dq_quarantine items live in the TableClient passed in (default: a fresh memoryTableClient) so
// plan-1 quarantine() and this db see the same rows in one test. Validation of a stageFacts batch
// happens before any row is written (one SQL statement). value_text = value as given (PostgreSQL
// would normalise e.g. 1e5; callers pass canonical decimals, §6.2).
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {Row,TableClient} from '../db/table-client';
import {READ_FACTS_CAP,assertAllStaged,conflictFromItem,conflictPrefix,linkPatch} from './db';
import {FactsDbError} from './types';
import type {FactRow,FactsDb,FilingRow,Market,MetricRow,RunStatus,ScopeRow} from './types';

export interface MemoryRun{run_id:string;issuer_id:string;market:Market;batch_id:string;mapping_gen:number;status:RunStatus;manifest:string[];started_at:string;published_at:string|null}
export interface MemoryFactsDb extends FactsDb{
 tables:TableClient;
 /** Fixes "now" for leases and timestamps; null returns to the wall clock. */
 setNow(iso:string|null):void;
 expireLease(issuer:string,market:Market):void;
 runs():MemoryRun[];filings():FilingRow[];facts():FactRow[];metrics():MetricRow[];scope():ScopeRow[];
}

const canon=(s:string)=>{
 let t=s.trim();let neg=false;
 if(t.startsWith('-')){neg=true;t=t.slice(1);}else if(t.startsWith('+'))t=t.slice(1);
 const [i0,f0='']=t.split('.');
 const i=i0.replace(/^0+(?=\d)/,'')||'0';const f=f0.replace(/0+$/,'');
 const out=f?`${i}.${f}`:i;
 return out==='0'?'0':(neg?'-':'')+out;
};
/** numeric equality on decimal strings without exponent: sign of zero, leading and trailing zeros ignored. */
export function numericEquals(a:string,b:string):boolean{return canon(a)===canon(b);}

const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer'] as const satisfies readonly (keyof FactsDb)[];
/** Compile-time check: ASYNC_METHODS must cover every FactsDb method. */
export type AsyncMethodsComplete=[Exclude<keyof FactsDb,typeof ASYNC_METHODS[number]>] extends [never]?true:never;
export const asyncMethodsComplete:AsyncMethodsComplete=true;   // type error here ⇒ a FactsDb method is missing from ASYNC_METHODS
const sk=(issuer:string,market:Market)=>`${issuer}|${market}`;
type KeyPart=Pick<FactRow,'concept'|'period_start'|'period_end'|'consolidation'|'unit'>;
const keyOf=(f:KeyPart)=>[f.concept,f.period_start??'',f.period_end,f.consolidation,f.unit].join('|');
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clone=<T>(v:T):T=>structuredClone(v);
const unknown=(message:string)=>new FactsDbError('unknown',message);

export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantine:['id']})):MemoryFactsDb{
 const scope=new Map<string,ScopeRow>();
 const runs=new Map<string,MemoryRun>();
 const filings=new Map<string,FilingRow>();
 const facts=new Map<string,FactRow>();
 let lastStamp='';
 let metrics:MetricRow[]=[];
 let fixedNow:string|null=null;
 const now=()=>fixedNow??new Date().toISOString();
 // created_at of one stageFacts call: one value per call (SQL now() = transaction start), strictly increasing across calls
 const stamp=()=>{const t=now();if(t>lastStamp){lastStamp=t;}else{lastStamp=new Date(Date.parse(lastStamp)+1).toISOString();}return lastStamp;};
 const scopeOf=(issuer:string,market:Market)=>scope.get(sk(issuer,market));
 const bump=(issuer:string,market:Market)=>{const s=scopeOf(issuer,market);if(s)s.state_rev+=1;};
 const leaseCheck=(issuer:string,market:Market,batch:string)=>{
  const s=scopeOf(issuer,market);
  if(!s||s.lease_batch_id!==batch||s.lease_until===null||s.lease_until<=now())throw new FactsDbError('lease_lost');
  return s;
 };
 const runLock=(runId:string)=>{
  const r=runs.get(runId);if(!r)throw unknown('run_not_found');
  leaseCheck(r.issuer_id,r.market,r.batch_id);
  if(r.status==='published')throw new FactsDbError('run_published');
  if(r.status==='abandoned')throw new FactsDbError('run_abandoned');
  return r;
 };
 const abandon=(r:MemoryRun,prune:boolean)=>{
  r.status='abandoned';
  for(const [id,f] of facts)if(f.run_id===r.run_id)facts.delete(id);
  if(prune)for(const [id,g] of filings)if(g.run_id===r.run_id&&g.mapping_gen===0&&![...facts.values()].some(f=>f.filing_id===id))filings.delete(id);
 };
 const items=(match:Row)=>tables.select('dq_quarantine',{table_name:'financial_facts',...match});
 const idsOf=(row:Row)=>{const p=row.payload as {fact_ids?:unknown}|undefined;return Array.isArray(p?.fact_ids)?p.fact_ids.filter((x):x is string=>typeof x==='string'):[];};
 const chosenOf=(row:Row)=>{const d=row.detail as {chosen_fact_ids?:unknown}|undefined;return Array.isArray(d?.chosen_fact_ids)?d.chosen_fact_ids.filter((x):x is string=>typeof x==='string'):[];};
 const runIdOf=(row:Row)=>{const p=row.payload as {run_id?:unknown}|undefined;return typeof p?.run_id==='string'?p.run_id:null;};
 /** Does this same_day_conflict item dispute the row's (K, available_date)? Matched on payload.key like the SQL (round-1 #3). */
 const disputes=(item:Row,f:FactRow)=>{
  const k=(item.payload as {key?:Record<string,string|null>}|undefined)?.key;
  return !!k&&k.issuer_id===f.issuer_id&&k.market===f.market&&k.concept===f.concept&&(k.period_start??'')===(f.period_start??'')&&k.period_end===f.period_end&&k.consolidation===f.consolidation&&k.unit===f.unit&&k.available_date===f.available_date;
 };
 // promote_quarantined eligibility (§4.5): quarantined, run published, filing on the row's
 // generation, not referenced by any OPEN item, its (K, date) not disputed by any OPEN
 // same_day_conflict item, and chosen by every RESOLVED conflict that lists it.
 const promote=async(issuer:string,market:Market,ids:string[])=>{
  const open=await items({status:'open'});
  const resolvedConflicts=(await items({reason_code:'same_day_conflict'})).filter(i=>i.status!=='open');
  let n=0;
  for(const id of new Set(ids)){
   const f=facts.get(id);
   if(!f||f.issuer_id!==issuer||f.market!==market||f.status!=='quarantined')continue;
   if(runs.get(f.run_id)?.status!=='published')continue;
   if(filings.get(f.filing_id)?.mapping_gen!==f.mapping_gen)continue;
   if(open.some(i=>idsOf(i).includes(id)))continue;
   if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
   if(resolvedConflicts.some(i=>idsOf(i).includes(id)&&!chosenOf(i).includes(id)))continue;
   f.status='ok';n++;
  }
  return n;
 };
 const byDisclosure=(a:FactRow,b:FactRow)=>cmp(a.available_date,b.available_date)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id);
 // key ranking of read_facts: period_end desc, concept, period_start desc nulls last, consolidation, unit
 const keyOrder=(a:KeyPart,b:KeyPart)=>cmp(b.period_end,a.period_end)||cmp(a.concept,b.concept)
  ||(a.period_start===b.period_start?0:a.period_start===null?1:b.period_start===null?-1:cmp(b.period_start,a.period_start))
  ||cmp(a.consolidation,b.consolidation)||cmp(a.unit,b.unit);

 const raw:MemoryFactsDb={
  tables,
  setNow:iso=>{fixedNow=iso===null?null:new Date(iso).toISOString();},
  expireLease:(issuer,market)=>{const s=scopeOf(issuer,market);if(s&&s.lease_until!==null)s.lease_until='1970-01-01T00:00:00.000Z';},
  // Inspection helpers below are test-only and bypass the mutex (they read the maps synchronously).
  runs:()=>clone([...runs.values()]),filings:()=>clone([...filings.values()]),facts:()=>clone([...facts.values()]),metrics:()=>clone(metrics),scope:()=>clone([...scope.values()]),

  async claimLease(issuer,market,batch,ttl){
   if(!Number.isInteger(ttl)||ttl<1)throw unknown('invalid_ttl');
   const s=scopeOf(issuer,market);if(!s)return false;
   if(s.lease_batch_id===null||(s.lease_until!==null&&s.lease_until<=now())||s.lease_batch_id===batch){
    s.lease_batch_id=batch;s.lease_until=new Date(Date.parse(now())+ttl*1000).toISOString();return true;
   }
   return false;
  },
  async beginRun(issuer,market,batch,mappingGen){
   if(!Number.isInteger(mappingGen)||mappingGen<1)throw unknown('invalid_mapping_gen');
   leaseCheck(issuer,market,batch);
   for(const r of runs.values())if(r.issuer_id===issuer&&r.market===market&&r.status==='staged')abandon(r,true);
   const run_id=randomUUID();
   runs.set(run_id,{run_id,issuer_id:issuer,market,batch_id:batch,mapping_gen:mappingGen,status:'staged',manifest:[],started_at:now(),published_at:null});
   return run_id;
  },
  async stageFilings(run,input){
   const r=runLock(run);const out=new Map<string,string>();
   const pending:FilingRow[]=[];   // validate the whole batch first (existing rows and rows pending in this call), write after the loop
   for(const row of input){
    const same=(g:FilingRow)=>g.source===row.source&&g.source_ref===row.sourceRef;
    const existing=[...filings.values()].find(same)??pending.find(same);
    if(existing){if(existing.issuer_id===r.issuer_id&&existing.market===r.market)out.set(row.sourceRef,existing.filing_id);continue;}
    if(filings.has(row.filing_id)||pending.some(g=>g.filing_id===row.filing_id))throw new FactsDbError('duplicate_key','filings_pkey');
    pending.push({filing_id:row.filing_id,issuer_id:r.issuer_id,market:r.market,source:row.source,origin:row.origin,form_type:row.formType,fiscal_year:row.fiscalYear,fiscal_period:row.fiscalPeriod,period_end:row.periodEnd,available_date:row.availableDate,source_ref:row.sourceRef,url:row.url,document_ref:null,document_url:null,link_attempts:0,mapping_gen:0,run_id:run,created_at:now()});
    out.set(row.sourceRef,row.filing_id);
   }
   for(const g of pending)filings.set(g.filing_id,g);
   return assertAllStaged(input,out);
  },
  async stageFacts(run,input){
   const r=runLock(run);const at=stamp();
   const existingKeys=new Set([...facts.values()].filter(f=>f.issuer_id===r.issuer_id).map(f=>`${keyOf(f)}|${f.filing_id}|${f.mapping_gen}`));
   const fresh:FactRow[]=[];
   for(const row of input){
    if((row.period_start===null)!==(row.duration==='INSTANT'))throw unknown('financial_facts_instant');
    if(row.period_start!==null&&!(row.period_start<row.period_end))throw unknown('financial_facts_period');
    const candidate=`${keyOf(row)}|${row.filing_id}|${r.mapping_gen}`;
    if(existingKeys.has(candidate))continue;   // FKs are checked on inserted rows only (Postgres)
    const g=filings.get(row.filing_id);
    if(!g||g.issuer_id!==r.issuer_id||g.market!==r.market)throw unknown('financial_facts_filing_fkey');
    if(g.available_date!==row.available_date)throw unknown('financial_facts_filing_date_fkey');
    if(facts.has(row.fact_id)||fresh.some(f=>f.fact_id===row.fact_id))throw new FactsDbError('duplicate_key','financial_facts_pkey');
    existingKeys.add(candidate);
    fresh.push({fact_id:row.fact_id,issuer_id:r.issuer_id,market:r.market,filing_id:row.filing_id,run_id:run,concept:row.concept,source_concept:row.source_concept,statement:row.statement,period_start:row.period_start,period_end:row.period_end,duration:row.duration,value:row.value,value_text:row.value,unit:row.unit,consolidation:row.consolidation,available_date:row.available_date,mapping_gen:r.mapping_gen,mapping_version:row.mapping_version,status:'staged',raw_hash:row.raw_hash,created_at:at});
   }
   for(const f of fresh)facts.set(f.fact_id,f);
   return fresh.length;
  },
  async quarantineFacts(run,factIds,itemId){
   runLock(run);
   const [it]=await tables.select('dq_quarantine',{id:itemId,status:'open'},{limit:1});
   if(!it)throw unknown('item_not_open');
   let n=0;
   for(const id of new Set(factIds)){const f=facts.get(id);if(f&&f.run_id===run&&f.status==='staged'){f.status='quarantined';n++;}}
   const merged=[...idsOf(it)];for(const id of factIds)if(!merged.includes(id))merged.push(id);
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{payload:{...(it.payload as Record<string,unknown>),fact_ids:merged}});
   return n;
  },
  async publishRun(run,manifest,expectedRev){
   const r=runLock(run);
   if(expectedRev!==undefined&&(scopeOf(r.issuer_id,r.market)?.state_rev??0)!==expectedRev)throw new FactsDbError('stale_plan');
   const mine=manifest.filter(id=>{const g=filings.get(id);return !!g&&g.issuer_id===r.issuer_id&&g.market===r.market;});
   if(mine.some(id=>filings.get(id)!.mapping_gen>r.mapping_gen))throw new FactsDbError('mapping_gen_regression');
   let n=0;
   for(const f of facts.values())if(f.run_id===run&&f.status==='staged'){f.status='ok';n++;}
   const runIds=new Set([...facts.values()].filter(f=>f.run_id===run).map(f=>f.fact_id));
   for(const it of await items({status:'open',reason_code:'same_day_conflict'})){
    const ids=idsOf(it);if(!ids.some(id=>runIds.has(id)))continue;
    for(const id of ids){const f=facts.get(id);if(f&&f.status==='ok'&&f.issuer_id===r.issuer_id&&f.market===r.market)f.status='quarantined';}
   }
   for(const id of mine){const g=filings.get(id)!;if(g.mapping_gen<r.mapping_gen)g.mapping_gen=r.mapping_gen;}
   r.status='published';r.published_at=now();r.manifest=[...manifest];
   bump(r.issuer_id,r.market);
   return n;
  },
  async abandonRun(run){
   const r=runs.get(run);if(!r)throw unknown('run_not_found');
   leaseCheck(r.issuer_id,r.market,r.batch_id);
   if(r.status==='published')throw new FactsDbError('run_published');
   if(r.status==='abandoned')return;
   abandon(r,false);
  },
  async releaseLease(issuer,market,batch,outcome,nextDue){
   if(outcome!=='success'&&outcome!=='failed')throw unknown('invalid_outcome');
   const s=scopeOf(issuer,market);
   if(!s||s.lease_batch_id!==batch)throw new FactsDbError('lease_lost');
   const t=now();
   Object.assign(s,{lease_until:null,lease_batch_id:null,last_attempt_at:t,last_success_at:outcome==='success'?t:s.last_success_at,last_batch_id:batch,last_status:outcome,next_due_at:new Date(nextDue).toISOString()});
  },
  async resolveFactsQuarantine(itemId,chosen,resolvedBy){
   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
   if(!it||it.status!=='open'||it.table_name!=='financial_facts')throw unknown('item_not_open');
   const ids=idsOf(it);
   const existing=ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f);
   const runId=runIdOf(it);
   const anchor=existing[0]??(runId!==null?runs.get(runId):undefined);
   // run_pending: any member row's run still staged, or the anchor run itself (the only run an
   // item without fact rows has; spec §7.3, round-1 #10). Single-threaded, so no re-read is needed.
   if(existing.some(f=>runs.get(f.run_id)?.status==='staged'))throw new FactsDbError('run_pending');
   if(runId!==null&&runs.get(runId)?.status==='staged')throw new FactsDbError('run_pending');
   let picked:string[];
   if(it.reason_code==='same_day_conflict'){picked=[...chosen];if(picked.some(id=>!ids.includes(id)))throw unknown('invalid_chosen');
    // spec 7.3: the chosen rows (those still existing) must all carry the same numeric value
    const chosenRows=picked.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f);
    if(chosenRows.some(f=>!numericEquals(f.value,chosenRows[0].value)))throw unknown('invalid_chosen');}
   else picked=ids;
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:now(),detail:{...((it.detail as Record<string,unknown>|undefined)??{}),chosen_fact_ids:picked}});
   let promoted=0;
   if(anchor){promoted=await promote(anchor.issuer_id,anchor.market,picked);bump(anchor.issuer_id,anchor.market);}
   return {promoted,skipped:picked.length-promoted};
  },
  async replaceMetrics(issuer,market,basedOnRev,input){
   const rev=scopeOf(issuer,market)?.state_rev??0;
   if(rev!==basedOnRev)throw new FactsDbError('stale_computation');
   const pk=(m:MetricRow)=>[m.metric,m.period_start,m.period_end,m.input_unit,m.basis,m.formula_version].join('|');
   if(new Set(input.map(pk)).size!==input.length)throw new FactsDbError('duplicate_key','financial_metrics_pkey');
   metrics=metrics.filter(m=>!(m.issuer_id===issuer&&m.market===market)).concat(input.map(m=>({...clone(m),issuer_id:issuer,market,based_on_rev:basedOnRev})));
   return input.length;
  },
  async readFacts(issuer,market,o){
   const stateRev=scopeOf(issuer,market)?.state_rev??0;
   const base=[...facts.values()].filter(f=>f.issuer_id===issuer&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
    &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&filings.get(f.filing_id)?.mapping_gen===f.mapping_gen);
   const groups=new Map<string,FactRow[]>();
   for(const f of base)if(f.status==='ok'){const k=keyOf(f);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(f);}
   const out:FactRow[]=[];
   for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
   for(const f of base)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
   const heads=new Map<string,FactRow>();for(const f of out)if(!heads.has(keyOf(f)))heads.set(keyOf(f),f);
   const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
   const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
   picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
   if(picked.length>READ_FACTS_CAP)return {stateRev,rows:[],truncated:true};
   return {stateRev,rows:picked,truncated:false};
  },
  async factsByIds(ids){return [...new Set(ids)].sort().map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).map(f=>clone(f));},   // deduped, ordered by fact_id
  async openConflicts(issuer,market){
   const prefix=conflictPrefix(issuer,market);
   const rows=(await items({status:'open',reason_code:'same_day_conflict'})).filter(i=>String(i.natural_key).startsWith(prefix));
   rows.sort((a,b)=>cmp(String(a.created_at),String(b.created_at))||cmp(String(a.id),String(b.id)));
   return rows.map(i=>conflictFromItem({id:String(i.id),natural_key:String(i.natural_key),payload:(i.payload as Record<string,unknown>|undefined)??{}}));
  },
  async filingsOfIssuer(issuer,market,opts){
   const rows=[...filings.values()].filter(g=>g.issuer_id===issuer&&g.market===market&&(opts.from===undefined||g.available_date>=opts.from)&&(opts.to===undefined||g.available_date<=opts.to)&&(!opts.unlinkedOnly||g.document_ref===null));
   rows.sort((a,b)=>cmp(b.available_date,a.available_date)||cmp(a.filing_id,b.filing_id));
   return clone(opts.limit===undefined?rows:rows.slice(0,opts.limit));   // no implicit cap: complete-set read (round-1 #7)
  },
  async updateFilingLink(filingId,patch){
   const p=linkPatch(patch);const g=filings.get(filingId);if(!g)return;
   Object.assign(g,p);
  },
  async reconcileScope(market,input){
   let n=0;
   for(const row of input){
    const k=sk(row.issuer_id,market);const s=scope.get(k);
    if(!s){scope.set(k,{issuer_id:row.issuer_id,market,reasons:[...row.reasons],priority:row.priority,fetch_key:row.fetch_key,next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});n++;continue;}
    if(JSON.stringify(s.reasons)!==JSON.stringify(row.reasons)||s.priority!==row.priority||s.fetch_key!==row.fetch_key){s.reasons=[...row.reasons];s.priority=row.priority;s.fetch_key=row.fetch_key;n++;}
   }
   return n;
  },
  async scopeDue(market,at,limit){
   if(limit<1)return [];
   const rows=[...scope.values()].filter(s=>s.market===market&&s.priority>0&&s.next_due_at<=new Date(at).toISOString());
   rows.sort((a,b)=>cmp(a.next_due_at,b.next_due_at)||(b.priority-a.priority)||cmp(a.issuer_id,b.issuer_id));
   return clone(rows.slice(0,limit));
  },
  async scopeRows(market,issuerIds){
   const want=new Set(issuerIds);
   return clone([...scope.values()].filter(s=>s.market===market&&want.has(s.issuer_id)).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
  },
  async scopeAll(market){
   return clone([...scope.values()].filter(s=>s.market===market).sort((a,b)=>cmp(a.issuer_id,b.issuer_id)));
  },
  async metricsOfIssuer(issuer,market,formulaVersion){
   const rows=metrics.filter(m=>m.issuer_id===issuer&&m.market===market&&m.formula_version===formulaVersion);
   rows.sort((a,b)=>cmp(a.metric,b.metric)||cmp(a.period_end,b.period_end)||cmp(a.period_start,b.period_start)||cmp(a.input_unit,b.input_unit)||cmp(a.basis,b.basis));
   return clone(rows);
  },
 };
 // Every FactsDb method (reads included) runs through one promise chain per instance, so no operation
 // observes or interleaves with another's partial writes across awaits (SQL: one transaction each).
 let chain:Promise<unknown>=Promise.resolve();
 const serialize=<A extends unknown[],T>(fn:(...a:A)=>Promise<T>)=>(...a:A):Promise<T>=>{const next=chain.then(()=>fn(...a));chain=next.catch(()=>undefined);return next;};
 const db={...raw} as MemoryFactsDb;
 for(const k of ASYNC_METHODS){
  const f=raw[k] as unknown as (...a:unknown[])=>Promise<unknown>;
  (db as unknown as Record<string,unknown>)[k]=serialize(f);
 }
 return db;
}
