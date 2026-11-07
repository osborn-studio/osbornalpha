// src/lib/industry/run-aggregation.ts
// runIndustryAggregation (spec §5.4 steps 1–7, §4.6 history_class, §4.10 readiness gate, V6 one
// envelope per issuer per run, U4 dependencies, U6 activation time). Sequence:
//  1. code_version required (else rejected, nothing written); startBatch(industry-agg,
//     industry.agg.<scheme>); classification codes at `level` (optionally filtered by opts.codes);
//     expected grid; every (code, period_end) group's members (membershipCandidates → membersAtPure,
//     knownBy = facts_as_of) and unresolved records; history_class = point_in_time only when every
//     member row is provenance.availability 'evidenced' AND its source record resolved 'as_of',
//     else reconstruction (all v1 sw2021 runs);
//  2. state fingerprint = FactsDb.scopeAll('CN') (state_rev and last_success_at per issuer, read once;
//     fingerprint_at = the client time of that read, orchestration metadata only); previous active
//     run, its rows and manifests → per-group reuse decision; createMetricRun (reused_from_run = the
//     previous active run when at least one group is reused);
//  3. readiness gate: >= READINESS_MIN_PERCENT of the run's member issuers (every member of every
//     group) have last_success_at → else coverage {facts_scope_ready:false} + failRun
//     facts_scope_not_ready;
//  4. per code, per period_end: a reused group copies the manifest's cells and its
//     member_state_revs (dependencies); a recomputed group reads each member's envelope at most once
//     per run (cached until the last code that needs it), derives, computes, builds and self-checks
//     the manifest (replayFromManifest; mismatching cells → missing:manifest_mismatch + quarantine),
//     uploads it when a cell is ok (failure → manifest_upload_failed), and records one dependency
//     per member with that envelope's stateRev;
//  5. setMetricRunCoverage, stageMetricRows (updated_at null), stageRunDependencies (whole cells per
//     call), activateMetricRun; obsolete_run / dependency_regression / incomplete_run /
//     dependencies_incomplete → failRun with that code;
//  6. any other error after the run exists → failRun(<code>) (rows stay, invisible);
//  7. recordAttempt(industry.agg.<scheme>, weekly) and finishBatch.
// Reuse conditions (all): previous active run has the same facts_as_of, knowledge_date,
// history_class, method_version, config_hash, formula_version; its rows of the group carry exactly one
// manifest hash and no manifest_mismatch; the manifest's members and unresolved records equal the
// current ones (canonical JSON, statuses and windows included) and every member_state_revs entry
// equals the current state_rev (an issuer without a scope row counts as 0). code_version is not a
// reuse key: reused rows keep the manifest's code_version inside the manifest.
import type {TableClient} from '../db/table-client';
import {currentSecurities} from '../facts/scope';
import {industryKeysetAll as keysetAll} from './keyset';
import type {TriggeredBy,BatchCounts,BatchError,BatchStatus} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {FORMULA_VERSION,deriveMetrics} from '../facts/derive';
import type {FactsDb,FilingRow,ScopeRow} from '../facts/types';
import {computeAggregateCell} from './aggregate';
import type {IssuerFacts} from './aggregate';
import {canonicalJson} from './canonical-json';
import {buildAggregateManifest,encodeManifest} from './manifest';
import type {ManifestHeader} from './manifest';
import {membersAtPure} from './memberships';
import {AGG_CONCEPTS,CONFIG_HASH,DEFAULT_HISTORY_START,METHOD_VERSION,READINESS_MIN_PERCENT,assertDay,cellKey,expectedGrid,isFinancialNode} from './method';
import {replayFromManifest} from './replay';
import type {ReplayResult} from './replay';
import {IndustryDbError} from './types';
import type {AggregateManifest,HistoryClass,IndustryDb,IndustryDeps,ManifestMember,ManifestUnresolved,MembershipRow,MetricCellRow,MetricRunRow,RunDependency,Scheme,SchemeVersion,SourceMembershipRow,StagedMetricCell} from './types';

export interface AggregationOptions{
 scheme:Extract<Scheme,'sw2021'>;version:Extract<SchemeVersion,'2021'>;level:number;factsAsOf:string;
 historyStart?:string;
 /** Codes whose groups are always recomputed; every other group is reused when possible, else recomputed. The published grid is always every code at `level` (a filtered run never shrinks the active dataset). */
 codes?:string[];
 triggeredBy?:TriggeredBy;
}
export interface AggregationReceipt{
 status:'active'|'failed'|'rejected';code?:string;
 batchId:string|null;batchStatus:BatchStatus|null;runId:string|null;generation:number|null;activatedAt:string|null;
 historyClass:HistoryClass|null;groups:number;reusedGroups:number;cells:{ok:number;missing:number};manifestMismatches:number;truncatedIssuers:string[];
}
/** Test seam: replaces the manifest self-check (default replayFromManifest). */
export interface AggregationHooks{replay?:(m:AggregateManifest)=>ReplayResult}

export class AggregationError extends Error{constructor(public code:string,message?:string){super(message??code);this.name='AggregationError';}}
const ACTIVATION_CODES=new Set(['obsolete_run','dependency_regression','incomplete_run','dependencies_incomplete']);
const STAGE_CHUNK=500;
const DEPENDENCY_CHUNK=2000;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const errCode=(e:unknown)=>e instanceof AggregationError||e instanceof IndustryDbError?e.code:'compute_failed';
const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,300);

interface Group{code:string;period_end:string;key:string;members:ManifestMember[];memberRows:MembershipRow[];unresolved:ManifestUnresolved[];financial:boolean}
interface Reuse{hash:string;manifest:AggregateManifest}

function memberOf(row:MembershipRow,src:SourceMembershipRow|undefined):ManifestMember{
 const p=row.provenance;
 return {issuer_id:row.issuer_id,ticker:src?.ts_code??null,valid_from:row.valid_from,valid_to:row.valid_to,available_date:row.available_date,valid_to_available_date:row.valid_to_available_date,
  source_membership_id:row.source_membership_id,raw_hash:typeof p.raw_hash==='string'?p.raw_hash:null,locator:p.locator&&typeof p.locator==='object'?structuredClone(p.locator as Record<string,unknown>):null,resolution_method:src?.resolution.method??null};
}
const sortMembers=(xs:ManifestMember[])=>[...xs].sort((a,b)=>cmp(a.issuer_id,b.issuer_id)||cmp(a.valid_from,b.valid_from));
const sortUnresolved=(xs:ManifestUnresolved[])=>[...xs].sort((a,b)=>cmp(a.ts_code,b.ts_code)||cmp(a.in_date,b.in_date)||cmp(a.source_membership_id,b.source_membership_id));

/** One (code, period_end) group: point-in-time members (one row per issuer, latest valid_from) and unresolved records (spec §4.6, §5.2). */
async function loadGroup(db:Pick<IndustryDb,'membershipCandidates'|'unresolvedOf'>,q:{scheme:Scheme;version:SchemeVersion;level:number;code:string;periodEnd:string;knownBy:string},financial:boolean,sources:ReadonlyMap<string,SourceMembershipRow>):Promise<Group>{
 const mq={scheme:q.scheme,version:q.version,code:q.code,level:q.level,on:q.periodEnd,knownBy:q.knownBy};
 // one row per issuer per (code, date) is a database invariant (exclusion constraint), so no per-issuer dedup here
 const memberRows=membersAtPure(await db.membershipCandidates({scheme:q.scheme,version:q.version,code:q.code,level:q.level,on:q.periodEnd}),mq);
 return {code:q.code,period_end:q.periodEnd,key:cellKey(q.code,q.periodEnd),financial,memberRows,
  members:sortMembers(memberRows.map(r=>memberOf(r,r.source_membership_id===null?undefined:sources.get(r.source_membership_id)))),
  unresolved:sortUnresolved(await db.unresolvedOf({code:q.code,level:q.level,on:q.periodEnd,knownBy:q.knownBy}))};
}
/**
 * The readiness denominator (spec §4.10): the industry facts universe, independent of the run grid = issuers resolved from
 * CURRENT source memberships (historical members included) ∪ issuers owning an active `a_stock` ticker ∪ the run's own members,
 * minus merged issuers. An issuer without a scope row (or without last_success_at) counts as unready.
 */
async function factsUniverse(tables:TableClient,db:Pick<IndustryDb,'currentSourceMemberships'>,today:string,runMembers:string[]):Promise<string[]>{
 const ids=new Set<string>(runMembers);
 for(const s of await db.currentSourceMemberships({}))if(s.issuer_id)ids.add(s.issuer_id);
 const owner=new Map<string,string>();
 for(const s of await currentSecurities(tables,today))if(typeof s.issuer_id==='string'&&s.issuer_id)owner.set(String(s.ticker).trim().toUpperCase().replace(/\//g,'.'),s.issuer_id);
 for(const m of await keysetAll(tables,'security_universe_memberships',{universe:'a_stock',is_active:true},{},'ticker',['ticker'])){
  const id=owner.get(String(m.ticker).trim().toUpperCase().replace(/\//g,'.'));if(id)ids.add(id);
 }
 for(const i of await keysetAll(tables,'issuers',{status:'merged'},{},'issuer_id',['issuer_id']))ids.delete(String(i.issuer_id));
 return [...ids].sort(cmp);
}
/** One issuer's envelope (V6: the caller guarantees at most one read per issuer per run) and its derived metrics. */
async function readIssuerFacts(facts:Pick<FactsDb,'readFacts'>,id:string,asOf:string):Promise<IssuerFacts>{
 const env=await facts.readFacts(id,'CN',{concepts:[...AGG_CONCEPTS],asOf,history:true});
 if(env.rows.some(r=>r.issuer_id!==id||r.market!=='CN'))throw new AggregationError('envelope_scope_mismatch',id);
 return {issuer_id:id,stateRev:env.stateRev,truncated:env.truncated,rows:env.truncated?[]:env.rows,derived:env.truncated?[]:deriveMetrics(env.rows,{market:'CN',asOf,basedOnRev:env.stateRev})};
}
/** The computation of one group, shared by runIndustryAggregation and buildCellManifest: cells, roles, manifest. */
async function computeGroup(header:ManifestHeader,g:Group,issuers:ReadonlyMap<string,IssuerFacts>,filingsOf:(ids:string[])=>Promise<ReadonlyMap<string,FilingRow>>):Promise<{manifest:AggregateManifest;memberStateRevs:{issuer_id:string;state_rev:number}[]}>{
 const ids=g.members.map(x=>x.issuer_id);
 const result=computeAggregateCell({code:g.code,period_end:g.period_end,financial:g.financial,members:ids,nUnresolved:new Set(g.unresolved.map(u=>u.ts_code)).size,issuers});
 const memberStateRevs=ids.map(id=>({issuer_id:id,state_rev:issuers.get(id)!.stateRev}));
 const manifest=buildAggregateManifest({header,members:g.members,unresolved:g.unresolved,memberStateRevs,result,filings:await filingsOf([...new Set(result.facts.map(f=>f.issuer_id))])});
 return {manifest,memberStateRevs};
}

export interface CellManifestQuery{scheme:Scheme;version:SchemeVersion;level:number;code:string;periodEnd:string;factsAsOf:string;knowledgeDate:string;historyClass:HistoryClass}
/**
 * Spec §5.5 replay mode=recompute: the manifest of ONE (code, period_end) group recomputed now from the
 * current database (members as known by factsAsOf, the issuers' current envelopes), through the same
 * loadGroup / readIssuerFacts / computeGroup path as runIndustryAggregation. Writes nothing (no upload,
 * no index row, no run). `db` needs service-role reads (source records for ticker/resolution method).
 */
export async function buildCellManifest(deps:{db:Pick<IndustryDb,'classificationTree'|'currentSourceMemberships'|'membershipCandidates'|'unresolvedOf'>;facts:Pick<FactsDb,'readFacts'|'filingsOfIssuer'>;codeVersion:string|null},q:CellManifestQuery):Promise<AggregateManifest>{
 assertDay('periodEnd',q.periodEnd);assertDay('factsAsOf',q.factsAsOf);assertDay('knowledgeDate',q.knowledgeDate);
 const tree=await deps.db.classificationTree(q.scheme,q.version);
 const sources=new Map((await deps.db.currentSourceMemberships({})).map(x=>[x.id,x]));
 const g=await loadGroup(deps.db,{scheme:q.scheme,version:q.version,level:q.level,code:q.code,periodEnd:q.periodEnd,knownBy:q.factsAsOf},isFinancialNode(q.code,tree),sources);
 const issuers=new Map<string,IssuerFacts>();
 for(const x of g.members)issuers.set(x.issuer_id,await readIssuerFacts(deps.facts,x.issuer_id,q.factsAsOf));
 const filingsOf=async(ids:string[])=>{const out=new Map<string,FilingRow>();for(const id of ids)for(const f of await deps.facts.filingsOfIssuer(id,'CN',{}))out.set(f.filing_id,f);return out;};
 const header:ManifestHeader={scheme:q.scheme,version:q.version,code:q.code,level:q.level,period_end:q.periodEnd,facts_as_of:q.factsAsOf,knowledge_date:q.knowledgeDate,history_class:q.historyClass,
  method_version:METHOD_VERSION,config_hash:CONFIG_HASH,formula_version:FORMULA_VERSION,code_version:deps.codeVersion??'unknown'};
 return (await computeGroup(header,g,issuers,filingsOf)).manifest;
}

function reusable(prev:MetricRunRow,header:{facts_as_of:string;history_class:HistoryClass},rows:MetricCellRow[]|undefined):string|null{
 if(prev.facts_as_of!==header.facts_as_of||prev.knowledge_date!==header.facts_as_of||prev.history_class!==header.history_class||prev.method_version!==METHOD_VERSION||prev.config_hash!==CONFIG_HASH||prev.formula_version!==FORMULA_VERSION)return null;
 if(!rows||rows.length===0||rows.some(r=>r.missing_reason==='manifest_mismatch'))return null;
 const hashes=new Set(rows.filter(r=>r.status==='ok').map(r=>r.manifest_hash));
 if(hashes.size!==1)return null;
 const [h]=[...hashes];return h??null;
}
const rowOf=(code:string,periodEnd:string,c:AggregateManifest['cells'][number],hash:string|null):StagedMetricCell=>({
 code,metric:c.metric,period_start:c.period_start,period_end:periodEnd,duration:c.duration,status:c.status,missing_reason:c.status==='missing'?c.missing_reason??null:null,
 value:c.status==='ok'?c.value_text??null:null,unit:c.unit,n_members:c.n_members,n_with_data:c.n_with_data,n_unresolved:c.n_unresolved,manifest_hash:c.status==='ok'?hash:null});

/** `factsUniverse` replaces the readiness denominator (default: the database-global computation of `factsUniverse()`); tests that share a database with other suites inject their own issuers. */
export type AggregationDeps=IndustryDeps&{factsUniverse?:()=>Promise<Set<string>>};
export async function runIndustryAggregation(deps:AggregationDeps,opts:AggregationOptions,hooks:AggregationHooks={}):Promise<AggregationReceipt>{
 const receipt:AggregationReceipt={status:'rejected',batchId:null,batchStatus:null,runId:null,generation:null,activatedAt:null,historyClass:null,groups:0,reusedGroups:0,cells:{ok:0,missing:0},manifestMismatches:0,truncatedIssuers:[]};
 assertDay('factsAsOf',opts.factsAsOf);
 const historyStart=opts.historyStart??DEFAULT_HISTORY_START;assertDay('historyStart',historyStart);
 if(!Number.isInteger(opts.level)||opts.level<1||opts.level>4)throw new Error('invalid_level');
 if(!deps.codeVersion)return {...receipt,code:'code_version_missing'};
 const {tables,db,facts,manifests}=deps;const codeVersion=deps.codeVersion;
 const dataset=`industry.agg.${opts.scheme}`;
 const {batchId}=await startBatch(tables,{producer:'industry-agg',dataset,toolVersions:{method:METHOD_VERSION,config:CONFIG_HASH,formula:FORMULA_VERSION},codeVersion,triggeredBy:opts.triggeredBy??'script'});
 receipt.batchId=batchId;
 const errors:BatchError[]=[];let counts:BatchCounts=emptyCounts();
 let runId:string|null=null;let ok=false;
 try{
  // ---- 1. grid, members, history class ----
  const tree=await db.classificationTree(opts.scheme,opts.version);
  const codes=tree.filter(r=>r.level===opts.level).map(r=>r.code).sort(cmp);
  if(codes.length===0||(opts.codes!==undefined&&!opts.codes.some(c=>codes.includes(c))))throw new AggregationError('no_classifications');
  const forced=new Set(opts.codes??[]);
  // activation replaces the whole active level, so the grid is the full publication grid: every code at the level and
  // at least the active run's history (a shortened historyStart never drops active periods)
  const prev=await db.activeMetricRun(opts.scheme,opts.version,opts.level);
  const prevStart=prev?.expected_grid.period_ends[0];
  const grid=expectedGrid(codes,prevStart!==undefined&&prevStart<historyStart?prevStart:historyStart,opts.factsAsOf);
  const sources=new Map((await db.currentSourceMemberships({})).map(s=>[s.id,s]));
  const groups:Group[]=[];
  for(const code of grid.codes){
   const financial=isFinancialNode(code,tree);
   for(const pe of grid.period_ends){
    const g=await loadGroup(db,{scheme:opts.scheme,version:opts.version,level:opts.level,code,periodEnd:pe,knownBy:opts.factsAsOf},financial,sources);
    groups.push(g);
   }
  }
  const allMembers=groups.flatMap(g=>g.memberRows);
  const historyClass:HistoryClass=allMembers.length>0&&allMembers.every(r=>r.provenance.availability==='evidenced'&&r.source_membership_id!==null&&sources.get(r.source_membership_id)?.resolution.method==='as_of')?'point_in_time':'reconstruction';
  receipt.historyClass=historyClass;receipt.groups=groups.length;
  // ---- 2. fingerprint, previous run, reuse plan, run header ----
  const scope=await facts.scopeAll('CN');const fingerprintAt=deps.now().toISOString();
  const scopeOf=new Map<string,ScopeRow>(scope.map(s=>[s.issuer_id,s]));
  const revOf=(id:string)=>scopeOf.get(id)?.state_rev??0;
  const reuse=new Map<string,Reuse>();
  if(prev){
   const prevRows=new Map<string,MetricCellRow[]>();
   for(const r of await db.metricRowsOfRun(prev.run_id,{codes:grid.codes,periodEnds:grid.period_ends})){const k=cellKey(r.code,r.period_end);const l=prevRows.get(k);if(l)l.push(r);else prevRows.set(k,[r]);}
   const loaded=new Map<string,AggregateManifest|null>();
   for(const g of groups){
    if(forced.has(g.code))continue;
    const hash=reusable(prev,{facts_as_of:opts.factsAsOf,history_class:historyClass},prevRows.get(g.key));
    if(hash===null)continue;
    if(!loaded.has(hash))loaded.set(hash,await manifests.get(hash).catch(()=>null));
    const m=loaded.get(hash);
    if(!m||m.code!==g.code||m.period_end!==g.period_end||m.level!==opts.level||m.facts_as_of!==opts.factsAsOf||m.history_class!==historyClass||m.config_hash!==CONFIG_HASH||m.method_version!==METHOD_VERSION||m.formula_version!==FORMULA_VERSION)continue;
    if(canonicalJson(m.members)!==canonicalJson(g.members)||canonicalJson(m.unresolved)!==canonicalJson(g.unresolved))continue;
    const ids=new Set(g.members.map(x=>x.issuer_id));
    if(m.member_state_revs.length!==ids.size||m.member_state_revs.some(x=>!ids.has(x.issuer_id)||x.state_rev!==revOf(x.issuer_id)))continue;
    reuse.set(g.key,{hash,manifest:m});
   }
  }
  receipt.reusedGroups=reuse.size;
  const run=await db.createMetricRun({scheme:opts.scheme,version:opts.version,level:opts.level,facts_as_of:opts.factsAsOf,knowledge_date:opts.factsAsOf,history_class:historyClass,
   method_version:METHOD_VERSION,config_hash:CONFIG_HASH,formula_version:FORMULA_VERSION,code_version:codeVersion,expected_grid:grid,fingerprint_at:fingerprintAt,
   reused_from_run:reuse.size>0&&prev?prev.run_id:null,batch_id:batchId});
  runId=run.runId;receipt.runId=run.runId;receipt.generation=run.generation;
  // ---- 3. readiness gate ----
  const universe=deps.factsUniverse?[...await deps.factsUniverse()].sort(cmp):await factsUniverse(tables,db,deps.now().toISOString().slice(0,10),allMembers.map(r=>r.issuer_id));
  const readyN=universe.filter(id=>scopeOf.get(id)?.last_success_at!=null).length;
  const ready=universe.length>0&&readyN*100>=READINESS_MIN_PERCENT*universe.length;
  if(!ready){
   await db.setMetricRunCoverage(run.runId,{facts_scope_ready:false,universe:universe.length,ready:readyN,min_percent:READINESS_MIN_PERCENT});
   throw new AggregationError('facts_scope_not_ready',`${readyN}/${universe.length}`);
  }
  // ---- 4. cells ----
  const lastUse=new Map<string,number>();
  grid.codes.forEach((code,i)=>{for(const g of groups)if(g.code===code&&!reuse.has(g.key))for(const x of g.members)lastUse.set(x.issuer_id,i);});
  const envelopes=new Map<string,IssuerFacts>();const envRev=new Map<string,number>();const filingCache=new Map<string,Map<string,FilingRow>>();
  const truncated=new Set<string>();
  const envelope=async(id:string)=>{
   let f=envelopes.get(id);if(f)return f;
   if(envRev.has(id))throw new AggregationError('envelope_evicted',id);   // never read twice in one run (V6)
   f=await readIssuerFacts(facts,id,opts.factsAsOf);
   if(f.truncated)truncated.add(id);
   envelopes.set(id,f);envRev.set(id,f.stateRev);return f;
  };
  const filingsOf=async(ids:string[])=>{
   const out=new Map<string,FilingRow>();
   for(const id of ids){
    let m=filingCache.get(id);
    if(!m){m=new Map((await facts.filingsOfIssuer(id,'CN',{})).map(g=>[g.filing_id,g]));filingCache.set(id,m);}
    for(const [k,v] of m)out.set(k,v);
   }
   return out;
  };
  const staged:StagedMetricCell[]=[];const dependencies:RunDependency[]=[];
  for(const [i,code] of grid.codes.entries()){
   for(const g of groups.filter(x=>x.code===code)){
    const r=reuse.get(g.key);
    if(r){
     for(const c of r.manifest.cells)staged.push(rowOf(g.code,g.period_end,c,r.hash));
     for(const x of r.manifest.member_state_revs)dependencies.push({cell_key:g.key,issuer_id:x.issuer_id,state_rev:x.state_rev});
     for(const x of r.manifest.roles)if(x.reason==='read_truncated')truncated.add(x.issuer_id);
     counts.duplicates+=r.manifest.cells.length;continue;
    }
    const ids=g.members.map(x=>x.issuer_id);
    const issuers=new Map<string,IssuerFacts>();
    for(const id of ids)issuers.set(id,await envelope(id));
    const {manifest,memberStateRevs}=await computeGroup({scheme:opts.scheme,version:opts.version,code:g.code,level:opts.level,period_end:g.period_end,facts_as_of:opts.factsAsOf,knowledge_date:opts.factsAsOf,
      history_class:historyClass,method_version:METHOD_VERSION,config_hash:CONFIG_HASH,formula_version:FORMULA_VERSION,code_version:codeVersion},g,issuers,filingsOf);
    const check=(hooks.replay??replayFromManifest)(manifest);
    const cellIds=new Set(manifest.cells.map(c=>`${c.metric}:${c.duration}:${c.period_start}`));
    const bad=new Set<string>();
    for(const m of check.mismatches){
     const id=m.startsWith('unexpected_cell:')?m.slice('unexpected_cell:'.length):m;
     if(cellIds.has(id))bad.add(id);
     else throw new AggregationError('manifest_mismatch',`${g.key}:${m}`.slice(0,200));   // not attributable to a stored cell (e.g. missing_cell:): the manifest cannot be trusted
    }
    let hash:string|null=null;
    if(manifest.cells.some(c=>c.status==='ok'&&!bad.has(`${c.metric}:${c.duration}:${c.period_start}`))){
     try{hash=(await manifests.put('aggregate',encodeManifest(manifest).canonical)).hash;}
     catch(e){throw new AggregationError('manifest_upload_failed',errMsg(e));}
    }
    for(const c of manifest.cells){
     const id=`${c.metric}:${c.duration}:${c.period_start}`;
     if(bad.has(id)){
      staged.push({...rowOf(g.code,g.period_end,c,null),status:'missing',missing_reason:'manifest_mismatch',value:null,manifest_hash:null});
      await quarantine(tables,{dataset,table:'industry_metrics',naturalKey:`${run.runId}:${g.code}:${g.period_end}:${id}`,reasonCode:'manifest_mismatch',detail:{run_id:run.runId,code:g.code,period_end:g.period_end,cell:id},batchId});
      counts.quarantined++;receipt.manifestMismatches++;
     }else{staged.push(rowOf(g.code,g.period_end,c,hash));counts.inserted++;}
    }
    for(const x of memberStateRevs)dependencies.push({cell_key:g.key,issuer_id:x.issuer_id,state_rev:x.state_rev});
   }
   for(const [id,last] of lastUse)if(last<=i){envelopes.delete(id);filingCache.delete(id);}   // free memory; envRev keeps the revision
  }
  counts.fetched=staged.length;
  receipt.cells={ok:staged.filter(r=>r.status==='ok').length,missing:staged.filter(r=>r.status==='missing').length};
  receipt.truncatedIssuers=[...truncated].sort(cmp);
  // ---- 5. coverage, stage, activate ----
  const summary={facts_scope_ready:true,universe:universe.length,ready:readyN,history_class:historyClass,groups:groups.length,reused_groups:reuse.size,cells_ok:receipt.cells.ok,cells_missing:receipt.cells.missing,
   manifest_mismatch:receipt.manifestMismatches,read_truncated:receipt.truncatedIssuers.slice(0,100),read_truncated_count:truncated.size};
  await db.setMetricRunCoverage(run.runId,summary);
  for(let k=0;k<staged.length;k+=STAGE_CHUNK)await db.stageMetricRows(run.runId,staged.slice(k,k+STAGE_CHUNK));
  // whole cells per call: the function checks each cell's dependency set against its members
  const depsOf=new Map<string,RunDependency[]>();
  for(const d of dependencies){const l=depsOf.get(d.cell_key);if(l)l.push(d);else depsOf.set(d.cell_key,[d]);}
  let part:RunDependency[]=[];
  for(const g of groups){
   const rows=depsOf.get(g.key)??[];
   if(part.length>0&&part.length+rows.length>DEPENDENCY_CHUNK){await db.stageRunDependencies(run.runId,'aggregate',part);part=[];}
   part.push(...rows);
  }
  if(part.length>0)await db.stageRunDependencies(run.runId,'aggregate',part);
  if(truncated.size>0)errors.push({code:'coverage_summary',key:'read_truncated',message:JSON.stringify({issuers:receipt.truncatedIssuers.slice(0,20),n:truncated.size})});
  errors.push({code:'coverage_summary',key:run.runId,message:JSON.stringify({ok:receipt.cells.ok,missing:receipt.cells.missing,reused_groups:reuse.size})});
  try{receipt.activatedAt=(await db.activateMetricRun(run.runId)).activatedAt;}
  catch(e){if(e instanceof IndustryDbError&&ACTIVATION_CODES.has(e.code))throw new AggregationError(e.code,e.message);throw e;}
  receipt.status='active';ok=true;
 }catch(e){
  const code=errCode(e);
  receipt.status='failed';receipt.code=code;
  if(runId!==null){try{await db.failRun('aggregate',runId,code);}catch(f){errors.push({code:'fail_run_failed',key:runId,message:errMsg(f)});}}
  errors.push({code,key:runId??undefined,message:errMsg(e)});
  counts={...emptyCounts(),failed:1};
 }finally{
  try{await recordAttempt(tables,dataset,{ok,cadence:'weekly',now:deps.now(),detail:{run_id:runId,status:receipt.status,code:receipt.code??null,cells:receipt.cells,reused_groups:receipt.reusedGroups}});}
  catch(e){errors.push({code:'freshness_failed',message:errMsg(e)});}
  receipt.batchStatus=await finishBatch(tables,batchId,{counts,errors},deps.now());
 }
 return receipt;
}
