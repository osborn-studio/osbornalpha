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
// Plan 3: topology (setTopology / setMerge / setDissolved), lineage reads with cross-issuer suppression,
// lineage metrics, acceptance, candidate adoption, restore, lineage verdicts and the reconcile cursor,
// mirroring 20261107091000 (the cursor, cycles and results live in the TableClient so run.ts and this
// db see the same rows). Known differences from SQL: the plan-1 "open securities" trigger is not modelled
// (only pg tests it), no research_audit_log rows are written, unknown issuers count as active.
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {Row,TableClient} from '../db/table-client';
import {READ_FACTS_CAP,assertAllStaged,conflictFromItem,conflictPrefix,lineageRevsFrom,linkPatch} from './db';
import {factKey} from './keys';
import {FactsDbError} from './types';
import type {FactCandidate,FactRow,FactsDb,FilingRow,LineageConflict,LineageRev,Market,MetricRow,ReadFactsLineageResult,ReadFactsOptions,RunStatus,ScopeRow} from './types';
import type {ApplyReconcileOutcome,Fence,PendingMember,ReconcileResultInput} from '../dq/reconcile/types';
import {DATASETS} from '../dq/datasets';   // dataset strings only from the registry (datasets.test.ts literal scan)

export interface MemoryRun{run_id:string;issuer_id:string;market:Market;batch_id:string;mapping_gen:number;status:RunStatus;manifest:string[];started_at:string;published_at:string|null}
export interface MemoryTopology{status:'active'|'merged'|'dissolved';merged_into:string|null}
export interface MemoryFactsDb extends FactsDb{
 tables:TableClient;
 /** Fixes "now" for leases and timestamps; null returns to the wall clock. */
 setNow(iso:string|null):void;
 expireLease(issuer:string,market:Market):void;
 runs():MemoryRun[];filings():FilingRow[];facts():FactRow[];metrics():MetricRow[];scope():ScopeRow[];
 /** Test helper: issuer topology (memory has no issuers table). Unknown issuers are active with no merged_into. */
 setTopology(entries:Record<string,MemoryTopology>):void;
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

const ASYNC_METHODS=['claimLease','beginRun','stageFilings','stageFacts','quarantineFacts','publishRun','abandonRun','releaseLease','resolveFactsQuarantine','replaceMetrics','readFacts','factsByIds','openConflicts','filingsOfIssuer','updateFilingLink','reconcileScope','scopeDue','scopeRows','scopeAll','metricsOfIssuer','targetOf','lineageOf','stateRevs','readFactsLineage','readFilingFacts','replaceMetricsLineage','findFilingBySourceRef','filingsForCalendar','setFilingAcceptance','adoptCandidate','restoreReconciled','resolveLineageConflict','claimReconcileMember','applyReconcileResult','completeReconcileMember','failReconcileMember','openReconcileCycle','setMerge','setDissolved'] as const satisfies readonly (keyof FactsDb)[];
/** Compile-time check: ASYNC_METHODS must cover every FactsDb method. */
export type AsyncMethodsComplete=[Exclude<keyof FactsDb,typeof ASYNC_METHODS[number]>] extends [never]?true:never;
export const asyncMethodsComplete:AsyncMethodsComplete=true;   // type error here ⇒ a FactsDb method is missing from ASYNC_METHODS
const FACT_ROW_REASONS=['same_day_conflict','identity_bs','identity_gp'];
const sk=(issuer:string,market:Market)=>`${issuer}|${market}`;
type KeyPart=Pick<FactRow,'concept'|'period_start'|'period_end'|'consolidation'|'unit'>;
const keyOf=(f:KeyPart)=>[f.concept,f.period_start??'',f.period_end,f.consolidation,f.unit].join('|');
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clone=<T>(v:T):T=>structuredClone(v);
const unknown=(message:string)=>new FactsDbError('unknown',message);

export function memoryFactsDb(tables:TableClient=memoryTableClient({dq_quarantine:['id']})):MemoryFactsDb{
 const scope=new Map<string,ScopeRow>();
 const scopeConfirmed=new Map<string,string>();   // = fact_sync_scope.scope_confirmed_at: set only by reconcile (change or active confirmation)
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
 // ---- plan 3 helpers
 const topo=new Map<string,MemoryTopology>();
 const topoOf=(id:string):MemoryTopology=>topo.get(id)??{status:'active',merged_into:null};
 const referrers=(id:string)=>[...topo.entries()].filter(([,t])=>t.merged_into===id).map(([k])=>k).sort(cmp);
 const lineageMembers=(t:string)=>[t,...referrers(t)];
 const MARKETS:readonly Market[]=['CN','US'];
 const ensureScope=(issuer:string,market:Market)=>{
  const k=sk(issuer,market);if(scope.has(k))return;
  scope.set(k,{issuer_id:issuer,market,reasons:[],priority:0,fetch_key:'topology',next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
  scopeConfirmed.set(k,now());
 };
 const visible=(f:FactRow)=>filings.get(f.filing_id)?.mapping_gen===f.mapping_gen;
 const detailOf=(row:Row)=>(row.detail??{}) as Record<string,unknown>;
 const listOf=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
 const batchRow=async(id:string)=>(await tables.select('ingest_batches',{batch_id:id},{limit:1}))[0];
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const isDate=(s:unknown):s is string=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(`${s}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;};
 const NUMERIC=/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
 /** The persisted plan-2 FactCandidate (camelCase), validated like adopt_candidate; null = invalid_candidate. */
 const candidateOf=(x:unknown):FactCandidate|null=>{
  if(!x||typeof x!=='object'||Array.isArray(x))return null;
  const c=x as Record<string,unknown>;
  const str=(k:string,max:number)=>typeof c[k]==='string'&&(c[k] as string).length>=1&&(c[k] as string).length<=max;
  if(!str('concept',64)||!str('sourceConcept',256)||!str('unit',16)||!str('rawHash',128)||!str('filingRef',100000))return null;
  if(!['IS','BS','CF','DEI'].includes(String(c.statement))||!['3M','6M','9M','12M','INSTANT'].includes(String(c.duration))||!['consolidated','parent'].includes(String(c.consolidation)))return null;
  if(!isDate(c.periodEnd)||!(c.periodStart===null||isDate(c.periodStart)))return null;
  if(typeof c.value!=='string'||!/^-?[0-9]+(\.[0-9]+)?$/.test(c.value))return null;
  if((c.periodStart===null)!==(c.duration==='INSTANT'))return null;
  if(c.periodStart!==null&&!((c.periodStart as string)<(c.periodEnd as string)))return null;
  return c as unknown as FactCandidate;
 };
 const disputesKey=(item:Row,lineage:string[],market:Market,k:KeyPart,date:string)=>{
  const p=(item.payload as {key?:Record<string,string|null>}|undefined)?.key;
  return !!p&&typeof p.issuer_id==='string'&&lineage.includes(p.issuer_id)&&p.market===market&&p.concept===k.concept&&(p.period_start??'')===(k.period_start??'')&&p.period_end===k.period_end&&p.consolidation===k.consolidation&&p.unit===k.unit&&p.available_date===date;
 };
 const OUTCOMES=['compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'];
 const ACTIONS=['record','quarantine_left','review_item','lineage_item'];
 const validResult=(r:ReconcileResultInput):boolean=>{
  if(!r||typeof r!=='object'||typeof r.natural_key!=='string'||r.natural_key.length<1||r.natural_key.length>400)return false;
  if(!['numeric','text','date'].includes(r.kind)||!OUTCOMES.includes(r.outcome)||typeof r.passed!=='boolean'||!ACTIONS.includes(r.action))return false;
  if(typeof r.left_source!=='string'||typeof r.right_source!=='string'||!r.detail||typeof r.detail!=='object'||Array.isArray(r.detail))return false;
  if(typeof r.tolerance!=='string'||!NUMERIC.test(r.tolerance)||[r.left_value,r.right_value,r.abs_diff,r.rel_diff].some(v=>v!==null&&v!==undefined&&!NUMERIC.test(v)))return false;
  if(r.passed&&r.outcome!=='compared')return false;   // a pass is only meaningful for a compared pair of values
  if(r.left_fact_id!==undefined&&!UUID.test(r.left_fact_id))return false;
  if(r.action==='quarantine_left'&&r.left_fact_id===undefined)return false;
  if((r.action==='review_item'||r.action==='lineage_item')&&(!r.item||typeof r.item.natural_key!=='string'||r.item.natural_key.length<1||r.item.natural_key.length>512||!r.item.payload||typeof r.item.payload!=='object'))return false;
  return true;
 };
 const cursorKey=(f:{pair:string;cycle_id:string;issuer_id:string;market:Market})=>({pair:f.pair,cycle_id:f.cycle_id,issuer_id:f.issuer_id,market:f.market});
 const fenceLock=async(f:Fence)=>{
  const [c]=await tables.select('dq_reconcile_cursor',cursorKey(f),{limit:1});
  if(!c||c.state!=='claimed'||c.claimed_by!==f.batch_id||Number(c.attempts)!==f.attempt||typeof c.claim_until!=='string'||c.claim_until<=now())throw new FactsDbError('fence_failed');
  return c;
 };
 /** The member's frozen expected natural keys (cycle members[].expected_keys: {naturalKey,…} or bare strings); null when the member is not in the cycle. */
 const frozenKeys=async(f:Fence):Promise<string[]|null>=>{
  const [y]=await tables.select('dq_reconcile_cycles',{pair:f.pair,cycle_id:f.cycle_id},{limit:1});
  const members=Array.isArray(y?.members)?y.members as {issuer_id?:unknown;market?:unknown;expected_keys?:unknown}[]:[];
  const m=members.find(x=>typeof x.issuer_id==='string'&&UUID.test(x.issuer_id)&&x.issuer_id.toLowerCase()===f.issuer_id.toLowerCase()&&x.market===f.market&&Array.isArray(x.expected_keys));
  if(!m)return null;
  return (m.expected_keys as unknown[]).map(k=>typeof k==='string'?k:String((k as {naturalKey?:unknown}).naturalKey));
 };
 // set_merge's registration: one {issuer_id:T, market, source:S} per market (CN, US), deduped by the whole entry (plan audit Q2)
 const registerPending=async(target:string,source:string)=>{
  const cycles=(await tables.select('dq_reconcile_cycles',{pair:'facts.lineage_same_day'}))
   .sort((a,b)=>Number(b.status==='running')-Number(a.status==='running')||cmp(String(b.started_at),String(a.started_at)));
  const c=cycles[0];if(!c)return;
  const d=detailOf(c);const list=Array.isArray(d.pending_members)?[...(d.pending_members as PendingMember[])]:[];
  for(const m of MARKETS)if(!list.some(x=>x.issuer_id===target&&x.market===m&&x.source===source))list.push({issuer_id:target,market:m,source});
  await tables.update('dq_reconcile_cycles',{pair:String(c.pair),cycle_id:String(c.cycle_id)},{detail:{...d,pending_members:list}});
 };
 const pendingKey=(p:{issuer_id:unknown;market:unknown;source?:unknown})=>`${String(p.issuer_id)}:${String(p.market)}:${String(p.source)}`;
 // promote_quarantined eligibility (§4.5 + plan 3 T6): quarantined, run published, filing on the
 // row's generation, not referenced by any OPEN item, its (K, date) not disputed by an OPEN
 // same_day_conflict, chosen by every RESOLVED same_day_conflict and lineage_conflict that lists it
 // (lineage: payload members and the rows it quarantined), and no reconcile_mismatch referencing it
 // unless that one is resolved_accept with latest_result.passed = true.
 const promote=async(issuer:string,market:Market,ids:string[])=>{
  const all=await items({});
  const open=all.filter(i=>i.status==='open');
  const resolvedConflicts=all.filter(i=>i.reason_code==='same_day_conflict'&&i.status!=='open');
  const lineageVerdicts=all.filter(i=>i.reason_code==='lineage_conflict'&&i.status!=='open');
  const mismatches=all.filter(i=>i.reason_code==='reconcile_mismatch');
  const passing=(i:Row)=>i.status==='resolved_accept'&&(detailOf(i).latest_result as {passed?:unknown}|undefined)?.passed===true;
  let n=0;
  for(const id of new Set(ids)){
   const f=facts.get(id);
   if(!f||f.issuer_id!==issuer||f.market!==market||f.status!=='quarantined')continue;
   if(runs.get(f.run_id)?.status!=='published')continue;
   if(!visible(f))continue;
   if(open.some(i=>idsOf(i).includes(id)))continue;
   if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
   if(resolvedConflicts.some(i=>idsOf(i).includes(id)&&!chosenOf(i).includes(id)))continue;
   if(lineageVerdicts.some(i=>(idsOf(i).includes(id)||listOf(detailOf(i).quarantined_fact_ids).includes(id))&&!chosenOf(i).includes(id)))continue;
   if(mismatches.some(i=>idsOf(i).includes(id)&&!passing(i)))continue;
   f.status='ok';n++;
  }
  return n;
 };
 // read_facts_lineage: the read_facts rules over a member set; with more than one member, ok rows of
 // one (K, available_date) from different issuers with different values leave the sequences and go to conflicts.
 const readLineage=(members:string[],market:Market,o:ReadFactsOptions):ReadFactsLineageResult=>{
  const set=[...new Set(members)].sort(cmp);const inSet=new Set(set);
  const stateRevs:LineageRev[]=set.map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));
  const base=[...facts.values()].filter(f=>inSet.has(f.issuer_id)&&f.market===market&&o.concepts.includes(f.concept)&&f.available_date<=o.asOf
   &&(o.from===undefined||f.period_end>=o.from)&&(o.to===undefined||f.period_end<=o.to)&&(f.status==='ok'||o.includeNonOk===true)&&visible(f));
  const conflicts:LineageConflict[]=[];const excluded=new Set<string>();
  if(set.length>1){
   const byDay=new Map<string,FactRow[]>();
   for(const f of base)if(f.status==='ok'){const k=`${keyOf(f)}|${f.available_date}`;const g=byDay.get(k);if(g)g.push(f);else byDay.set(k,[f]);}
   for(const g of byDay.values()){
    if(new Set(g.map(f=>f.issuer_id)).size<2||g.every(f=>numericEquals(f.value,g[0].value)))continue;
    for(const f of g)excluded.add(f.fact_id);
    const f0=g[0];
    conflicts.push({key:{concept:f0.concept,period_start:f0.period_start,period_end:f0.period_end,consolidation:f0.consolidation,unit:f0.unit},available_date:f0.available_date,fact_ids:g.map(f=>f.fact_id).sort(cmp)});
   }
   const s=(v:string|null|undefined)=>v??'';
   conflicts.sort((a,b)=>cmp(a.available_date,b.available_date)||cmp(s(a.key.concept),s(b.key.concept))||cmp(s(a.key.period_end),s(b.key.period_end))||cmp(s(a.key.period_start),s(b.key.period_start))||cmp(s(a.key.consolidation),s(b.key.consolidation))||cmp(s(a.key.unit),s(b.key.unit)));
  }
  const eligible=base.filter(f=>!excluded.has(f.fact_id));
  const groups=new Map<string,FactRow[]>();
  for(const f of eligible)if(f.status==='ok'){const k=keyOf(f);if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(f);}
  const out:FactRow[]=[];
  for(const g of groups.values()){g.sort(byDisclosure);g.forEach((f,i)=>out.push({...clone(f),disclosure_seq:i+1,is_current:i===g.length-1,is_revision:i>0&&!numericEquals(f.value,g[i-1].value)}));}
  for(const f of eligible)if(f.status!=='ok')out.push({...clone(f),disclosure_seq:undefined,is_current:false,is_revision:false});
  const heads=new Map<string,FactRow>();for(const f of out)if(!heads.has(keyOf(f)))heads.set(keyOf(f),f);
  const rank=new Map([...heads.entries()].sort((a,b)=>keyOrder(a[1],b[1])).map(([k],i)=>[k,i+1] as const));
  const picked=out.filter(f=>(o.history===true||f.is_current===true)&&(o.limit===undefined||rank.get(keyOf(f))!<=o.limit));
  picked.sort((a,b)=>rank.get(keyOf(a))!-rank.get(keyOf(b))!||byDisclosure(a,b));
  if(picked.length>READ_FACTS_CAP)return {stateRevs,lineage:set,rows:[],conflicts,truncated:true};
  return {stateRevs,lineage:set,rows:picked,conflicts,truncated:false};
 };
 // replace_financial_metrics_lineage: member set = current lineage, every rev equal, else stale_computation.
 const replaceLineage=(issuer:string,market:Market,basedOn:LineageRev[],input:MetricRow[])=>{
  const norm=lineageRevsFrom(basedOn);
  if(norm.length===0||new Set(norm.map(x=>x.issuer_id)).size!==norm.length||!norm.some(x=>x.issuer_id===issuer)||norm.some(x=>!Number.isInteger(x.state_rev)||x.state_rev<0))throw unknown('invalid_based_on');
  if(norm.some(x=>!scopeOf(x.issuer_id,market)))throw new FactsDbError('scope_missing');
  if(topoOf(issuer).status!=='active')throw new FactsDbError('stale_computation');   // a merged / dissolved issuer is no materialisation target
  if([...lineageMembers(issuer)].sort(cmp).join(',')!==norm.map(x=>x.issuer_id).join(','))throw new FactsDbError('stale_computation');
  if(norm.some(x=>scopeOf(x.issuer_id,market)!.state_rev!==x.state_rev))throw new FactsDbError('stale_computation');
  const pk=(m:MetricRow)=>[m.metric,m.period_start,m.period_end,m.input_unit,m.basis,m.formula_version].join('|');
  if(new Set(input.map(pk)).size!==input.length)throw new FactsDbError('duplicate_key','financial_metrics_pkey');
  const rev=scopeOf(issuer,market)!.state_rev;
  metrics=metrics.filter(m=>!(m.issuer_id===issuer&&m.market===market)).concat(input.map(m=>({...clone(m),issuer_id:issuer,market,based_on_rev:rev,based_on_lineage:norm.map(x=>({...x}))})));
  return input.length;
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
    pending.push({filing_id:row.filing_id,issuer_id:r.issuer_id,market:r.market,source:row.source,origin:row.origin,form_type:row.formType,fiscal_year:row.fiscalYear,fiscal_period:row.fiscalPeriod,period_end:row.periodEnd,available_date:row.availableDate,source_ref:row.sourceRef,url:row.url,document_ref:null,document_url:null,link_attempts:0,mapping_gen:0,run_id:run,created_at:now(),accepted_at:null,acceptance_source:null});
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
   if(!it)throw new FactsDbError('item_not_open');
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
   if(!it||it.status!=='open'||it.table_name!=='financial_facts')throw new FactsDbError('item_not_open');
   // migration two: these two reasons close only through restoreReconciled / resolveLineageConflict
   if(it.reason_code==='reconcile_mismatch'||it.reason_code==='lineage_conflict')throw new FactsDbError('use_dedicated_resolver');
   const ids=idsOf(it);
   const existing=ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f);
   const runId=runIdOf(it);
   const anchor=existing[0]??(runId!==null?runs.get(runId):undefined);
   // run_pending: any member row's run still staged, or the anchor run itself (the only run an
   // item without fact rows has; spec §7.3, round-1 #10). Single-threaded, so no re-read is needed.
   if(existing.some(f=>runs.get(f.run_id)?.status==='staged'))throw new FactsDbError('run_pending');
   if(runId!==null&&runs.get(runId)?.status==='staged')throw new FactsDbError('run_pending');
   let picked:string[];
   if(it.reason_code==='same_day_conflict'){picked=[...chosen];if(picked.some(id=>!ids.includes(id)))throw new FactsDbError('invalid_chosen');
    // spec 7.3: the chosen rows (those still existing) must all carry the same numeric value
    const chosenRows=picked.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f);
    if(chosenRows.some(f=>!numericEquals(f.value,chosenRows[0].value)))throw new FactsDbError('invalid_chosen');}
   else picked=ids;
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:now(),detail:{...((it.detail as Record<string,unknown>|undefined)??{}),chosen_fact_ids:picked,...(FACT_ROW_REASONS.includes(String(it.reason_code))?{hook:{stage:'materialize',state:'pending',at:now()}}:{})}});
   let promoted=0;
   if(anchor){promoted=await promote(anchor.issuer_id,anchor.market,picked);bump(anchor.issuer_id,anchor.market);}
   return {promoted,skipped:picked.length-promoted,chosenFactIds:picked};
  },
  async replaceMetrics(issuer,market,basedOnRev,input){
   // plan-2 contract: no scope row ⇒ rev 0 (a non-zero rev is stale); rev 0 without a row is scope_missing (as in SQL)
   if(!scopeOf(issuer,market)){if(basedOnRev!==0)throw new FactsDbError('stale_computation');throw new FactsDbError('scope_missing');}
   if(!Number.isInteger(basedOnRev)||basedOnRev<0)throw new FactsDbError('stale_computation');
   return replaceLineage(issuer,market,[{issuer_id:issuer,state_rev:basedOnRev}],input);
  },
  async readFacts(issuer,market,o){const r=readLineage([issuer],market,o);return {stateRev:r.stateRevs[0].state_rev,rows:r.rows,truncated:r.truncated};},
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
  async reconcileScope(market,input,snapshotAt){
   let n=0;const snap=snapshotAt===undefined?null:new Date(snapshotAt).toISOString();
   for(const row of input){
    const k=sk(row.issuer_id,market);const s=scope.get(k);
    if(!s){scopeConfirmed.set(k,now());scope.set(k,{issuer_id:row.issuer_id,market,reasons:[...row.reasons],priority:row.priority,fetch_key:row.fetch_key,next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});n++;continue;}
    if(JSON.stringify(s.reasons)!==JSON.stringify(row.reasons)||s.priority!==row.priority||s.fetch_key!==row.fetch_key){
     // A retirement of a still-active row is refused when a newer reconcile changed it after the sources were read.
     if(snap!==null&&row.priority===0&&s.priority>0&&(scopeConfirmed.get(k)??'')>snap)continue;
     s.reasons=[...row.reasons];s.priority=row.priority;s.fetch_key=row.fetch_key;scopeConfirmed.set(k,now());n++;
    }
    else if(row.priority>0&&s.priority>0)scopeConfirmed.set(k,now());   // unchanged active row: confirmed, not counted
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
  setTopology:entries=>{for(const [id,t] of Object.entries(entries))topo.set(id,{...t});},
  async targetOf(issuer){return topoOf(issuer).merged_into??issuer;},
  async lineageOf(target){return lineageMembers(target);},
  async stateRevs(issuers,market){return [...new Set(issuers)].sort(cmp).map(i=>({issuer_id:i,state_rev:scopeOf(i,market)?.state_rev??0}));},
  async readFactsLineage(issuers,market,o){return readLineage(issuers,market,o);},
  async readFilingFacts(filingId,includeNonOk){
   const rows=[...facts.values()].filter(f=>f.filing_id===filingId&&(f.status==='ok'||includeNonOk));
   rows.sort((a,b)=>(a.mapping_gen-b.mapping_gen)||cmp(a.concept,b.concept)||cmp(a.period_end,b.period_end)||cmp(a.period_start??'',b.period_start??'')||cmp(a.unit,b.unit)||cmp(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id));
   return rows.map(f=>({...clone(f),run_status:runs.get(f.run_id)?.status??'abandoned'}));
  },
  async replaceMetricsLineage(issuer,market,basedOn,input){return replaceLineage(issuer,market,basedOn,input);},
  async findFilingBySourceRef(source,sourceRef){const g=[...filings.values()].find(x=>x.source===source&&x.source_ref===sourceRef);return g?clone(g):null;},
  async filingsForCalendar(issuer,market,o){
   const rows=[...filings.values()].filter(g=>g.issuer_id===issuer&&g.market===market&&g.period_end!==null&&g.period_end>=o.fromPeriodEnd);
   rows.sort((a,b)=>cmp(a.period_end!,b.period_end!)||cmp(a.available_date,b.available_date)||cmp(a.filing_id,b.filing_id));
   return rows.map(g=>({...clone(g),run_status:(runs.get(g.run_id)?.status??'abandoned') as RunStatus}));
  },
  async setFilingAcceptance(filingId,acceptedAt,source){
   if(source!=='sec_submissions'||!acceptedAt||Number.isNaN(Date.parse(acceptedAt)))throw unknown('invalid_acceptance');
   const g=filings.get(filingId);if(!g)throw new FactsDbError('filing_not_found');
   if(g.source!=='edgar')throw unknown('invalid_acceptance');
   const iso=new Date(acceptedAt).toISOString();
   if(g.accepted_at===null){g.accepted_at=iso;g.acceptance_source=source;return true;}
   if(g.accepted_at===iso&&g.acceptance_source===source)return false;
   throw new FactsDbError('acceptance_conflict');
  },
  async adoptCandidate(itemId,index,batchId,expectedRev,resolvedBy){
   if(!resolvedBy)throw unknown('invalid_resolver');
   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
   if(!it||it.status!=='open')throw new FactsDbError('item_not_open');
   if(it.table_name!=='financial_facts'||it.reason_code!=='ambiguous_value'||(it.dataset!==DATASETS.facts('US')&&it.dataset!==DATASETS.facts('CN')))throw new FactsDbError('invalid_choice');
   const cands=(it.payload as {candidates?:unknown}|undefined)?.candidates;
   if(!Array.isArray(cands)||!Number.isInteger(index)||index<0||index>=cands.length)throw new FactsDbError('invalid_choice');
   const c=candidateOf(cands[index]);if(!c)throw new FactsDbError('invalid_candidate');
   const market:Market=it.dataset===DATASETS.facts('US')?'US':'CN';const source=market==='US'?'edgar':'tushare';
   const g=[...filings.values()].find(x=>x.source===source&&x.source_ref===c.filingRef);
   if(!g||g.market!==market)throw new FactsDbError('filing_not_found');
   const anchor=runIdOf(it);const r=anchor!==null&&UUID.test(anchor)?runs.get(anchor):undefined;
   if(!r)throw new FactsDbError('generation_moved');
   const gen=r.mapping_gen;const nkGen=Number(/:([0-9]+)$/.exec(String(it.natural_key))?.[1]??Number.NaN);
   if(nkGen!==gen||g.mapping_gen!==gen||gen<=0||r.market!==g.market)throw new FactsDbError('generation_moved');
   let versions=new Set([...facts.values()].filter(f=>f.run_id===r.run_id).map(f=>f.mapping_version));
   if(versions.size===0)versions=new Set([...facts.values()].filter(f=>f.filing_id===g.filing_id&&f.mapping_gen===gen).map(f=>f.mapping_version));
   if(versions.size!==1)throw new FactsDbError('replay_required');
   const b=await batchRow(batchId);
   if(!b||b.status!=='running'||b.dataset!==it.dataset)throw new FactsDbError('batch_mismatch');
   const t=topoOf(g.issuer_id).merged_into??g.issuer_id;const lin=lineageMembers(t);
   if(lin.some(i=>!scopeOf(i,g.market)))throw new FactsDbError('scope_missing');
   if(!lin.includes(g.issuer_id)||topoOf(t).status!=='active')throw new FactsDbError('lineage_changed');
   const s=scopeOf(g.issuer_id,g.market);if(!s)throw new FactsDbError('scope_missing');
   if(s.state_rev!==expectedRev)throw new FactsDbError('stale_evaluation');
   const k:KeyPart={concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,consolidation:c.consolidation,unit:c.unit};
   if([...facts.values()].some(f=>f.issuer_id===g.issuer_id&&keyOf(f)===keyOf(k)&&f.filing_id===g.filing_id&&f.mapping_gen===gen))throw new FactsDbError('duplicate');
   const open=await items({status:'open'});
   const okClash=[...facts.values()].some(f=>lin.includes(f.issuer_id)&&f.market===g.market&&f.status==='ok'&&visible(f)&&keyOf(f)===keyOf(k)&&f.available_date===g.available_date&&!numericEquals(f.value,c.value));
   const disputed=open.some(i=>i.reason_code==='same_day_conflict'&&disputesKey(i,lin,g.market,k,g.available_date))
    ||open.some(i=>i.reason_code==='lineage_conflict'&&i.natural_key===`${t}:${factKey(k)}:${g.available_date}`);
   if(okClash||disputed)throw new FactsDbError('conflict_exists');
   const run_id=randomUUID(),fact_id=randomUUID(),t0=now();
   runs.set(run_id,{run_id,issuer_id:g.issuer_id,market:g.market,batch_id:batchId,mapping_gen:gen,status:'published',manifest:[],started_at:t0,published_at:t0});
   facts.set(fact_id,{fact_id,issuer_id:g.issuer_id,market:g.market,filing_id:g.filing_id,run_id,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,duration:c.duration,
    value:c.value,value_text:c.value,unit:c.unit,consolidation:c.consolidation,available_date:g.available_date,mapping_gen:gen,mapping_version:[...versions][0],status:'ok',raw_hash:c.rawHash,created_at:stamp()});
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:t0,
    detail:{...detailOf(it),chosen_candidate_index:index,adopted_fact_id:fact_id,run_id,issuer_id:g.issuer_id,market:g.market,batch_id:batchId,hook:{stage:'materialize',state:'pending',at:t0}}});
   bump(g.issuer_id,g.market);
   return {factId:fact_id,runId:run_id,issuerId:g.issuer_id,market:g.market};
  },
  async restoreReconciled(itemId,batchId,hashNow,resolvedBy){
   if(!resolvedBy)throw unknown('invalid_resolver');
   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
   if(!it||it.status!=='open'||it.table_name!=='financial_facts'||it.reason_code!=='reconcile_mismatch')throw new FactsDbError('item_not_open');
   const b=await batchRow(batchId);if(!b||b.status!=='running')throw new FactsDbError('batch_mismatch');
   const latest=(detailOf(it).latest_result??{}) as {passed?:unknown;inputs_hash?:unknown};
   if(latest.passed!==true||!hashNow||latest.inputs_hash!==hashNow)throw new FactsDbError('not_passing');
   const ids=idsOf(it);
   const first=ids.map(id=>facts.get(id)).filter((f):f is FactRow=>!!f).sort((a,b)=>cmp(a.fact_id,b.fact_id))[0];
   const d=detailOf(it);
   const issuer=first?.issuer_id??(typeof d.issuer_id==='string'&&UUID.test(d.issuer_id)?d.issuer_id:null);
   const market=(first?.market??d.market) as Market;
   const t0=now();
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:t0,detail:{...d,restored_by_batch:batchId,chosen_fact_ids:ids,hook:{stage:'materialize',state:'pending',at:t0}}});
   const before=new Set(ids.filter(id=>facts.get(id)?.status==='quarantined'));
   let promoted=0;
   if(issuer!==null){promoted=await promote(issuer,market,ids);bump(issuer,market);}
   const skipped=[...ids].sort(cmp).flatMap(id=>{const f=facts.get(id);if(!f)return [{fact_id:id,reason:'missing'}];if(!before.has(id))return [{fact_id:id,reason:'not_quarantined'}];return f.status==='ok'?[]:[{fact_id:id,reason:'ineligible'}];});
   return {promoted,skipped};
  },
  async resolveLineageConflict(itemId,keep,batchId,resolvedBy){
   if(!resolvedBy)throw unknown('invalid_resolver');
   const [it]=await tables.select('dq_quarantine',{id:itemId},{limit:1});
   if(!it||it.status!=='open')throw new FactsDbError('item_not_open');
   if(it.table_name!=='financial_facts'||it.reason_code!=='lineage_conflict'||(it.dataset!==DATASETS.facts('US')&&it.dataset!==DATASETS.facts('CN')))throw new FactsDbError('invalid_choice');
   const b=await batchRow(batchId);if(!b||b.status!=='running')throw new FactsDbError('batch_mismatch');
   const parts=String(it.natural_key).split(':');
   if(parts.length!==7)throw new FactsDbError('invalid_choice');
   const [t,concept,ps,pe,cons,unit,date]=parts;
   if(!UUID.test(t)||(ps!==''&&!isDate(ps))||!isDate(pe)||!isDate(date))throw new FactsDbError('invalid_choice');
   const market:Market=it.dataset===DATASETS.facts('US')?'US':'CN';
   const lin=lineageMembers(t);
   if(lin.some(i=>!scopeOf(i,market)))throw new FactsDbError('scope_missing');
   if(topoOf(t).status!=='active')throw new FactsDbError('target_not_active');
   const ids=idsOf(it);
   if(!ids.includes(keep))throw new FactsDbError('invalid_choice');
   if(ids.some(id=>{const f=facts.get(id);return !!f&&!lin.includes(f.issuer_id);}))throw new FactsDbError('lineage_changed');
   const k:KeyPart={concept,period_start:ps===''?null:ps,period_end:pe,consolidation:cons,unit};
   const hit=[...facts.values()].filter(f=>lin.includes(f.issuer_id)&&f.market===market&&f.status==='ok'&&visible(f)&&keyOf(f)===keyOf(k)&&f.available_date===date);
   if(!hit.some(f=>f.fact_id===keep))throw new FactsDbError('unresolved');                     // the kept row must be the one visible ok row left; nothing written
   const others=hit.filter(f=>f.fact_id!==keep);
   for(const f of others)f.status='quarantined';
   const t0=now();
   await tables.update('dq_quarantine',{id:itemId,status:'open'},{status:'resolved_accept',resolved_by:resolvedBy,resolved_at:t0,
    detail:{...detailOf(it),chosen_fact_ids:[keep],quarantined_fact_ids:others.map(f=>f.fact_id).sort(cmp),issuer_id:t,market,batch_id:batchId,hook:{stage:'materialize',state:'pending',at:t0}}});
   for(const i of lin)bump(i,market);
   return {quarantined:others.length};
  },
  async claimReconcileMember(pair,cycleId,issuer,market,batchId){
   const key={pair,cycle_id:cycleId,issuer_id:issuer,market};
   const [c]=await tables.select('dq_reconcile_cursor',key,{limit:1});
   const [y]=await tables.select('dq_reconcile_cycles',{pair,cycle_id:cycleId},{limit:1});
   if(!c||!y||y.status!=='running')return null;
   const t=now();const attempts=Number(c.attempts);
   const claimable=c.state==='pending'||(c.state==='claimed'&&typeof c.claim_until==='string'&&c.claim_until<t)||(c.state==='failed'&&attempts<3);
   if(!claimable)return null;
   await tables.update('dq_reconcile_cursor',key,{state:'claimed',claimed_by:batchId,claim_until:new Date(Date.parse(t)+600_000).toISOString(),attempts:attempts+1,last_error:null});
   return {pair,cycle_id:cycleId,issuer_id:issuer,market,batch_id:batchId,attempt:attempts+1};
  },
  async applyReconcileResult(fence,r){
   const c=await fenceLock(fence);
   if(!validResult(r))throw new FactsDbError('invalid_result');
   const frozen=await frozenKeys(fence);
   if(frozen===null||!frozen.includes(r.natural_key))throw new FactsDbError('invalid_result');   // the key must belong to the member's frozen expected set
   const [existing]=await tables.select('dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,natural_key:r.natural_key},{limit:1});
   if(existing){
    if(existing.issuer_id!==fence.issuer_id||existing.market!==fence.market)throw new FactsDbError('invalid_result');
    const d=detailOf(existing);return {reused:true,reconciliationId:String(existing.id),itemId:typeof d.item_id==='string'?d.item_id:null,quarantined:0,materialize:null};
   }
   const rid=randomUUID();const t0=now();const dataset=DATASETS.facts(fence.market);
   const latest={passed:r.passed,reconciliation_id:rid,at:t0,inputs_hash:r.inputs_hash??null};
   const f=r.left_fact_id===undefined?undefined:facts.get(r.left_fact_id);
   if(r.left_fact_id!==undefined&&(!f||f.issuer_id!==fence.issuer_id||f.market!==fence.market))throw new FactsDbError('invalid_result');
   let itemId:string|null=null;let quarantined:0|1=0;let mat:ApplyReconcileOutcome['materialize']=null;
   // a failing compare on a published left row that is ok OR already quarantined opens the reconcile_mismatch item (so a later
   // generic promotion stays blocked); only an ok row changes visibility
   if(r.action==='quarantine_left'&&r.outcome==='compared'&&r.passed===false&&f&&(f.status==='ok'||f.status==='quarantined')&&runs.get(f.run_id)?.status==='published'){
    const nk=`${fence.pair}:${r.natural_key}:${f.fact_id}`;
    if(nk.length>512)throw new FactsDbError('invalid_result');
    const [hit]=await tables.select('dq_quarantine',{dataset,table_name:'financial_facts',natural_key:nk,reason_code:'reconcile_mismatch',status:'open'},{limit:1});
    const wasOk=f.status==='ok';
    const hook={stage:'materialize',state:'pending',at:t0};
    if(hit){itemId=String(hit.id);await tables.update('dq_quarantine',{id:itemId},{detail:{...detailOf(hit),reconciliation_id:rid,latest_result:latest,...(wasOk?{hook}:{})}});}
    else{
     itemId=randomUUID();
     await tables.insert('dq_quarantine',{id:itemId,dataset,table_name:'financial_facts',natural_key:nk,reason_code:'reconcile_mismatch',
      detail:{pair:fence.pair,reconciliation_id:rid,inputs_hash:r.inputs_hash??null,latest_result:latest,issuer_id:fence.issuer_id,market:fence.market,...(wasOk?{hook}:{})},
      payload:{key:{issuer_id:f.issuer_id,market:f.market,concept:f.concept,period_start:f.period_start,period_end:f.period_end,consolidation:f.consolidation,unit:f.unit,available_date:f.available_date},
       fact_ids:[f.fact_id],left_value:r.left_value,right_value:r.right_value,right_locator:(r.detail.right as {locator?:unknown}|undefined)?.locator??null},
      batch_id:fence.batch_id,status:'open',resolved_by:null,resolved_at:null,created_at:t0});
    }
    if(wasOk){f.status='quarantined';quarantined=1;bump(fence.issuer_id,fence.market);mat={issuerId:fence.issuer_id,market:fence.market};}
   }else if(f&&f.status==='quarantined'&&r.outcome==='compared'){
    const hits=(await items({status:'open',reason_code:'reconcile_mismatch'})).filter(i=>detailOf(i).pair===fence.pair&&idsOf(i).includes(f.fact_id)).sort((a,b)=>cmp(String(a.id),String(b.id)));
    for(const i of hits)await tables.update('dq_quarantine',{id:String(i.id)},{detail:{...detailOf(i),latest_result:latest}});
    itemId=hits[0]?String(hits[0].id):null;
   }
   if((r.action==='review_item'||r.action==='lineage_item')&&r.item){
    const reason=r.action==='review_item'?'reconcile_review':'lineage_conflict';
    const [hit]=await tables.select('dq_quarantine',{dataset,table_name:'financial_facts',natural_key:r.item.natural_key,reason_code:reason,status:'open'},{limit:1});
    if(hit)itemId=String(hit.id);
    else{
     itemId=randomUUID();
     await tables.insert('dq_quarantine',{id:itemId,dataset,table_name:'financial_facts',natural_key:r.item.natural_key,reason_code:reason,
      detail:{...(r.item.detail??{}),pair:fence.pair,reconciliation_id:rid,issuer_id:fence.issuer_id,market:fence.market},payload:r.item.payload,
      batch_id:fence.batch_id,status:'open',resolved_by:null,resolved_at:null,created_at:t0});
    }
   }
   await tables.insert('dq_reconciliations',{id:rid,dataset:`reconcile.${fence.pair}`,left_source:r.left_source,right_source:r.right_source,natural_key:r.natural_key,left_value:r.left_value,right_value:r.right_value,
    abs_diff:r.abs_diff,rel_diff:r.rel_diff,tolerance:r.tolerance,passed:r.passed,batch_id:fence.batch_id,pair:fence.pair,kind:r.kind,outcome:r.outcome,detail:{...r.detail,item_id:itemId,inputs_hash:r.inputs_hash??null},
    cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market,attempt:Number(c.attempts),created_at:t0});
   return {reused:false,reconciliationId:rid,itemId,quarantined,materialize:mat};
  },
  async completeReconcileMember(fence){
   const c=await fenceLock(fence);
   const rows=await tables.select('dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market});
   const counts={compared_passed:rows.filter(x=>x.outcome==='compared'&&x.passed===true).length,compared_failed:rows.filter(x=>x.outcome==='compared'&&x.passed!==true).length,not_compared:rows.filter(x=>x.outcome!=='compared').length};
   if(counts.compared_passed+counts.compared_failed+counts.not_compared!==Number(c.expected))throw new FactsDbError('member_incomplete');
   // exact coverage of the frozen key set: every frozen key has an accepted result and nothing else does
   const keys=await frozenKeys(fence);const have=new Set(rows.map(x=>String(x.natural_key)));
   if(keys===null||keys.some(k=>!have.has(k))||[...have].some(k=>!keys.includes(k)))throw new FactsDbError('member_incomplete');
   await tables.update('dq_reconcile_cursor',cursorKey(fence),{state:'done',done_at:now(),claim_until:null,...counts});
   return counts;
  },
  async failReconcileMember(fence,error){
   await fenceLock(fence);
   await tables.update('dq_reconcile_cursor',cursorKey(fence),{state:'failed',claim_until:null,last_error:String(error??'unknown').slice(0,2000)});
  },
  // mirrors open_reconcile_cycle (plan audit Q2): running cycle → returned unchanged; else validate, insert
  // the cycle row and one pending cursor per member, and remove exactly the listed pending entries.
  async openReconcileCycle(i){
   const cycles=await tables.select('dq_reconcile_cycles',{pair:i.pair});
   const running=cycles.find(c=>c.status==='running');
   if(running)return {created:false,cycle:running,transferred:[]};
   const mk=(x:{issuer_id:unknown;market:unknown})=>`${String(x.issuer_id)}:${String(x.market)}`;
   if(!Array.isArray(i.members)||!Array.isArray(i.pending)||i.members.some(m=>typeof m.issuer_id!=='string'||!UUID.test(m.issuer_id)||(m.market!=='US'&&m.market!=='CN')||!Array.isArray(m.expected_keys))
    ||i.pending.some(p=>typeof p.source!=='string'))throw new FactsDbError('invalid_members');
   // issuer ids are frozen as canonical (lower-case) uuid text
   const members=i.members.map(m=>({...m,issuer_id:m.issuer_id.toLowerCase()}));
   const memberKeys=new Set(members.map(mk));
   const nks=members.flatMap(m=>m.expected_keys.map(k=>typeof k==='string'?k:(k as {naturalKey?:unknown}).naturalKey));
   // natural keys are unique across the whole cycle (results are accepted per pair, cycle, natural key)
   if(memberKeys.size!==members.length||nks.some(k=>typeof k!=='string')||new Set(nks).size!==nks.length
    ||i.pending.some(p=>!memberKeys.has(mk({issuer_id:String(p.issuer_id).toLowerCase(),market:p.market}))))throw new FactsDbError('invalid_members');
   const row={pair:i.pair,cycle_id:i.cycleId,started_at:i.startedAt,finished_at:null,members,status:'running',
    expected_total:members.reduce((n,m)=>n+m.expected_keys.length,0),compared_passed:0,compared_failed:0,not_compared:0,exec_failed_members:0,detail:{}};
   await tables.insert('dq_reconcile_cycles',row);
   for(const m of members)await tables.insert('dq_reconcile_cursor',{pair:i.pair,cycle_id:i.cycleId,issuer_id:m.issuer_id,market:m.market,expected:m.expected_keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
   const listed=new Set(i.pending.map(pendingKey));
   const from:string[]=[];const moved:PendingMember[]=[];
   for(const c of [...cycles].sort((a,b)=>cmp(String(a.cycle_id),String(b.cycle_id)))){
    const d=detailOf(c);if(!Array.isArray(d.pending_members))continue;
    const list=d.pending_members as PendingMember[];
    const take=list.filter(p=>listed.has(pendingKey(p)));if(take.length===0)continue;
    await tables.update('dq_reconcile_cycles',{pair:i.pair,cycle_id:String(c.cycle_id)},{detail:{...d,pending_members:list.filter(p=>!listed.has(pendingKey(p))),pending_consumed_by:i.cycleId}});
    from.push(String(c.cycle_id));moved.push(...take);
   }
   const detail={pending_merged_from:from,pending_transferred:moved};
   await tables.update('dq_reconcile_cycles',{pair:i.pair,cycle_id:i.cycleId},{detail});
   return {created:true,cycle:{...row,detail},transferred:moved};
  },
  async setMerge(source,target,resolvedBy){
   if(!source||!target||source===target)throw unknown('invalid_merge');
   if(!resolvedBy)throw unknown('invalid_resolver');
   if(topoOf(source).status!=='active')throw new FactsDbError('source_not_active');
   if(topoOf(target).status!=='active')throw unknown('merge_target_not_active');
   const set=[...new Set([source,target,...referrers(source),...referrers(target)])];
   for(const i of set)for(const m of MARKETS)ensureScope(i,m);
   const refs=referrers(source);
   for(const r of refs)topo.set(r,{...topoOf(r),merged_into:target});
   topo.set(source,{status:'merged',merged_into:target});
   for(const i of set)for(const m of MARKETS)bump(i,m);
   await registerPending(target,source);
   return {repointed:refs.length};
  },
  async setDissolved(issuer,resolvedBy){
   if(!resolvedBy)throw unknown('invalid_resolver');
   if(referrers(issuer).length>0)throw new FactsDbError('has_referrers');
   if(topoOf(issuer).status!=='active')throw new FactsDbError('source_not_active');
   for(const m of MARKETS)ensureScope(issuer,m);
   topo.set(issuer,{status:'dissolved',merged_into:null});
   for(const m of MARKETS)bump(issuer,m);
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
