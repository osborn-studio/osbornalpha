// src/lib/industry/memory-industry-db.ts
// In-memory IndustryDb for unit tests (spec §4.9). It reproduces the SQL functions of migrations
// 20261111090000/20261111091000 so orchestrator tests see the database's behaviour: licence gate,
// classification nodes (insert-only, conflicts returned), source-record upsert (same key: duplicate
// or superseded + new current, `changed`), apply_industry_memberships (issuer-scoped, all-or-nothing:
// supersede via the superseded_by chain → close → insert with duplicate/conflict/overlap, resolution
// bookkeeping), the per-level exclusion over ok rows, apply_sic_memberships, fetch events and
// apply_observations (natural-key receipts, compare with the current observation, supersede then
// insert, mark_revised/official_revised quarantine items, atomic per call), metric runs (generation,
// building-only staging, completeness/dependency/obsolete/regression checks, one activation instant
// for run and rows), manifest index with the GC grace window, pruning, state fingerprint (from the
// injected FactsDb.scopeAll), freshness (dq_freshness rows named industry.* in the injected
// TableClient) and the unresolved-record count. Every method runs through one promise chain per
// instance (SQL: one transaction each); a failing call leaves no partial state (observation writes include
// their quarantine items: if filing one fails the whole call rolls back and a retry is idempotent). Foreign keys
// of the SQL schema are mirrored against the injected tables once those hold rows: issuers (issuer_not_found),
// stocks_universe (mark tickers), ingest_batches (invalid_batch), judgments (pruneRuns skips referenced runs).
// Decimal strings are
// stored as given (callers pass canonical decimals); market_cap is close × total_share with
// PostgreSQL's result scale (sum of the input scales).
import {createHash,randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {Row,TableClient} from '../db/table-client';
import type {FactsDb} from '../facts/types';
import {MANIFEST_GC_GRACE_SECONDS,distinctTsCodes,levelColumn,sameClassification} from './db';
import {DEFAULT_LICENSES} from './licenses';
import {IndustryDbError} from './types';
import type {
 AggDuration,AggMetric,ApplyMembershipsResult,ClassificationRow,CorrectWindowsResult,FreshnessRow,IndustryDb,LicenseStatus,ManifestGcClaim,ManifestUnresolved,MarkInput,MarkRow,MembershipRow,
 MetricCellRow,MetricRunRow,ObservationResult,OfficialInput,RunDependency,RunKind,SourceMembershipRow,StagedMetricCell,ValuationCellRow,ValuationRunRow,
} from './types';

export interface MemoryOfficialRow{observation_id:string;scheme:string;version:string;code:string;trade_date:string;metric:string;fetch_event_id:string;value:string;observed_at:string;source:string;upstream:string;raw_hash:string;locator:Record<string,unknown>;batch_id:string;status:'ok'|'superseded';supersedes:string|null}
export interface MemoryIndustryDb extends IndustryDb{
 tables:TableClient;
 /** Fixes "now" (observed_at, activation, manifest age); null returns to the wall clock. */
 setNow(iso:string|null):void;
 /** Test-only: a valuation run and its rows as the (deferred) valuation pipeline would leave them. */
 seedValuationRun(run:ValuationRunRow,rows:ValuationCellRow[]):void;
 /** Test-only: register a licence key (the SQL function refuses keys the migration did not insert). */
 seedLicense(key:string,status:LicenseStatus):void;
 classifications():ClassificationRow[];sources():SourceMembershipRow[];memberships():MembershipRow[];marks():MarkRow[];officials():MemoryOfficialRow[];
 metricRuns():MetricRunRow[];metricCells():MetricCellRow[];manifests():{manifest_hash:string;kind:RunKind;byte_length:number;created_at:string}[];
}

const ASYNC_METHODS=['upsertClassifications','classificationTree','setDatasetLicense','isDatasetPublic','upsertSourceMemberships','currentSourceMemberships','recordResolutionError',
 'applyMemberships','applySicMembership','membershipCandidates','membershipsOfIssuer','beginFetchEvent','retryFetchEvent','applyObservations','currentMarksOn',
 'createMetricRun','setMetricRunCoverage','stageMetricRows','stageRunDependencies','activateMetricRun','failRun','activeMetricRun','metricRun','metricRowsOfRun','runDependencies',
 'activeValuationRun','publishedValuations','registerManifest','manifestObjectPath','manifestGcCandidates','deleteManifestIndex','pruneRuns','stateFingerprint','freshness','metricRunVisible',
 'correctMembershipWindows',
 'unresolvedCount','unresolvedOf'] as const satisfies readonly (keyof IndustryDb)[];
/** Compile-time check: ASYNC_METHODS must cover every IndustryDb method. */
export type AsyncMethodsComplete=[Exclude<keyof IndustryDb,typeof ASYNC_METHODS[number]>] extends [never]?true:never;
export const asyncMethodsComplete:AsyncMethodsComplete=true;

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const clone=<T>(v:T):T=>structuredClone(v);
const fail=(code:ConstructorParameters<typeof IndustryDbError>[0],message?:string):never=>{throw new IndustryDbError(code,message);};
const unknown=(message:string):never=>fail('unknown',message);
/** [from, to) windows, null = open end. */
const overlaps=(a:{valid_from:string;valid_to:string|null},b:{valid_from:string;valid_to:string|null})=>a.valid_from<(b.valid_to??'9999-12-31')&&b.valid_from<(a.valid_to??'9999-12-31');
/** PostgreSQL trim_scale(numeric)::text for a canonical decimal string. */
export function trimScale(s:string):string{
 let t=s.trim();let neg=false;
 if(t.startsWith('-')){neg=true;t=t.slice(1);}else if(t.startsWith('+'))t=t.slice(1);
 const [i0,f0='']=t.split('.');
 const i=i0.replace(/^0+(?=\d)/,'')||'0';const f=f0.replace(/0+$/,'');
 const out=f?`${i}.${f}`:i;
 return out==='0'?'0':(neg?'-':'')+out;
}
const decEq=(a:string,b:string)=>trimScale(a)===trimScale(b);
const decSign=(s:string)=>{const t=trimScale(s);return t==='0'?0:t.startsWith('-')?-1:1;};
/** numeric × numeric as PostgreSQL prints it: result scale = scale(a) + scale(b). */
export function mulDecimalText(a:string,b:string):string{
 const parse=(s:string)=>{let t=s.trim();let neg=false;if(t.startsWith('-')){neg=true;t=t.slice(1);}else if(t.startsWith('+'))t=t.slice(1);const [i,f='']=t.split('.');return {neg,digits:BigInt((i||'0')+f),scale:f.length};};
 const x=parse(a),y=parse(b);const scale=x.scale+y.scale;let p=x.digits*y.digits;const neg=(x.neg!==y.neg)&&p!==0n;if(p<0n)p=-p;
 let s=p.toString().padStart(scale+1,'0');
 if(scale>0)s=`${s.slice(0,s.length-scale)}.${s.slice(s.length-scale)}`;
 return (neg?'-':'')+s;
}
const sha256=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const AGG_METRICS=['revenue_sum','net_income_parent_sum','gross_margin','roe','revenue_yoy','net_income_yoy','member_count'];
const MISSING=['empty_set','zero_denominator','no_members','financial_excluded','unresolved_over_limit','manifest_mismatch'];
const VAL_METRICS=['pe_ttm','pe_static','pb','market_cap'];
/** Completeness of activate_industry_metric_run per (metric, duration); true = December 31 period ends only (= method.ts::cellSpecs, Task 10). */
const REQUIRED_DURATIONS:Record<AggMetric,readonly (readonly [AggDuration,boolean])[]>={revenue_sum:[['3M',false],['12M',true]],net_income_parent_sum:[['3M',false],['12M',true]],
 gross_margin:[['12M',true]],roe:[['TTM',false]],revenue_yoy:[['3M',false],['12M',true]],net_income_yoy:[['3M',false],['12M',true]],member_count:[['INSTANT',false]]};

export function memoryIndustryDb(opts:{tables?:TableClient;facts?:Pick<FactsDb,'scopeAll'>}={}):MemoryIndustryDb{
 const tables=opts.tables??memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset']});
 interface State{
  licences:Map<string,LicenseStatus>;classes:Map<string,ClassificationRow>;sources:Map<string,SourceMembershipRow>;memberships:Map<string,MembershipRow>;
  events:Map<string,{job:string;params:Record<string,unknown>;batch_id:string;attempt:number;started_at:string}>;
  receipts:Map<string,{payload_hash:string;outcome:string;observation_id:string|null}>;marks:Map<string,MarkRow>;officials:Map<string,MemoryOfficialRow>;
  manifests:Map<string,{manifest_hash:string;kind:RunKind;byte_length:number;created_at:string;object_path:string;gc_claimed_at:string|null;gc_claim:string|null}>;
  runs:Map<string,MetricRunRow>;cells:Map<string,Map<string,MetricCellRow>>;deps:Map<string,Map<string,RunDependency>>;
  vruns:Map<string,ValuationRunRow>;vcells:Map<string,ValuationCellRow[]>;
 }
 let st:State={licences:new Map(Object.entries(DEFAULT_LICENSES)),classes:new Map(),sources:new Map(),memberships:new Map(),events:new Map(),receipts:new Map(),
  marks:new Map(),officials:new Map(),manifests:new Map(),runs:new Map(),cells:new Map(),deps:new Map(),vruns:new Map(),vcells:new Map()};
 let fixedNow:string|null=null;let last='';
 const now=()=>fixedNow??new Date().toISOString();
 /** Strictly increasing instants within one instance (SQL clock_timestamp()). */
 const tick=()=>{const t=now();last=t>last?t:new Date(Date.parse(last)+1).toISOString();return last;};
 /** FK mirror: a table without rows is not authoritative (unit tests that do not seed it); once populated the key must exist. */
 const registered=async(table:string,match:Row)=>(await tables.count(table,{}))===0||(await tables.count(table,match))>0;
 /** Candidate member of a cell (= industry_candidate_members / memberships.ts::isMemberAt, spec K3). */
 const candidateIssuers=(s:State,r:{scheme:string;version:string;level:number},code:string,on:string,knownBy:string)=>new Set(okRows(s).filter(m=>m.scheme===r.scheme&&m.version===r.version&&m.level===r.level&&m.code===code
  &&m.available_date<=knownBy&&m.valid_from<=on&&(m.valid_to===null||(m.valid_to_available_date!==null&&m.valid_to_available_date>knownBy)||m.valid_to>on)).map(m=>m.issuer_id));
 const sameSet=(a:Set<string>,b:Set<string>)=>a.size===b.size&&[...a].every(x=>b.has(x));
 const classKey=(s:string,v:string,c:string)=>`${s}|${v}|${c}`;
 const depKey=(kind:RunKind,run:string)=>`${kind}|${run}`;
 /** Runs fn on a copy of the state and installs it only when fn returns (SQL: the call is one transaction). */
 const atomic=async<T>(fn:(s:State)=>T|Promise<T>):Promise<T>=>{const draft=clone(st);const out=await fn(draft);st=draft;return out;};

 const checkMembership=(s:State,m:MembershipRow)=>{
  const cls=s.classes.get(classKey(m.scheme,m.version,m.code));
  if(!cls)unknown('issuer_industry_memberships_scheme_version_code_fkey');
  if(cls!.level!==m.level)unknown('issuer_industry_memberships_classification_level_fkey');
  if(m.valid_to!==null&&m.valid_to<=m.valid_from)unknown('issuer_industry_memberships_window');
  if((m.valid_to===null)!==(m.valid_to_available_date===null))unknown('issuer_industry_memberships_to_available_pair');
  if(m.valid_to_available_date!==null&&m.valid_to_available_date<m.valid_from)unknown('issuer_industry_memberships_to_available_after');
 };
 const okRows=(s:State)=>[...s.memberships.values()].filter(m=>m.status==='ok');
 const insertMembership=(s:State,m:MembershipRow)=>{
  checkMembership(s,m);
  const ok=okRows(s);
  if(ok.some(o=>o.issuer_id===m.issuer_id&&o.scheme===m.scheme&&o.version===m.version&&o.code===m.code&&o.valid_from===m.valid_from))unknown('issuer_industry_memberships_ok_key');
  if(ok.some(o=>o.issuer_id===m.issuer_id&&o.scheme===m.scheme&&o.version===m.version&&o.level===m.level&&overlaps(o,m)))fail('membership_overlap',`membership_overlap: ${m.issuer_id} ${m.scheme} level ${m.level} from ${m.valid_from}`);
  s.memberships.set(m.membership_id,m);
 };
 const sortMemberships=(rows:MembershipRow[])=>rows.sort((a,b)=>cmp(a.scheme,b.scheme)||cmp(a.version,b.version)||a.level-b.level||cmp(a.valid_from,b.valid_from)||cmp(a.membership_id,b.membership_id));
 const lockRun=(s:State,run:string)=>{const r=s.runs.get(run);if(!r)unknown('run_not_found');return r!;};
 const unreferenced=(s:State,hash:string)=>![...s.cells.values()].some(m=>[...m.values()].some(c=>c.manifest_hash===hash))&&![...s.vcells.values()].some(rows=>rows.some(c=>c.manifest_hash===hash));
 const oldEnough=(created:string)=>Date.parse(created)<=Date.parse(now())-MANIFEST_GC_GRACE_SECONDS*1000;
 const quarantineAfter=async(items:{dataset:string;table:string;key:string;reason:string;detail:Record<string,unknown>;batch:string}[])=>{
  for(const q of items){
   const open=await tables.select('dq_quarantine',{dataset:q.dataset,table_name:q.table,natural_key:q.key,reason_code:q.reason,status:'open'});
   if(open.length)continue;
   await tables.insert('dq_quarantine',{id:randomUUID(),dataset:q.dataset,table_name:q.table,natural_key:q.key,reason_code:q.reason,detail:q.detail,payload:{},batch_id:q.batch,status:'open',resolved_by:null,resolved_at:null,created_at:now()});
  }
 };
 const unresolvedOf=(q:{code:string;level:number;on:string;knownBy:string}):ManifestUnresolved[]=>{
  const col=levelColumn(q.level);
  return [...st.sources.values()].filter(r=>r.status==='current'&&r.issuer_id===null&&r[col]===q.code&&r.in_date<=q.on&&r.in_date<=q.knownBy&&(r.out_date===null||r.out_date>=q.on))
   .sort((a,b)=>cmp(a.ts_code,b.ts_code)||cmp(a.in_date,b.in_date)||cmp(a.id,b.id))
   .map(r=>({ts_code:r.ts_code,in_date:r.in_date,out_date:r.out_date,source_membership_id:r.id}));
 };

 const applySicRow=(batch:string,issuer:string,observed:string,code:string,provenance:Record<string,unknown>)=>atomic(s=>{
    const node=s.classes.get(classKey('sic','sec-current',code));
    if(!node)unknown(`unknown_sic_code: ${code}`);
    const cur=okRows(s).filter(m=>m.issuer_id===issuer&&m.scheme==='sic'&&m.version==='sec-current'&&m.valid_to===null).sort((a,b)=>cmp(b.valid_from,a.valid_from))[0];
    let outcome:'inserted'|'duplicate'|'changed'='inserted';
    if(cur){
     if(cur.code===code)return 'duplicate' as const;
     if(cur.valid_from>=observed)fail('same_day_change',`same_day_change: issuer ${issuer} sic ${cur.code} -> ${code} on ${observed}`);
     cur.valid_to=observed;cur.valid_to_available_date=observed;outcome='changed';
    }
    insertMembership(s,{membership_id:randomUUID(),issuer_id:issuer,scheme:'sic',version:'sec-current',code,level:node!.level,valid_from:observed,valid_to:null,available_date:observed,
     valid_to_available_date:null,source:'sec:submissions',source_membership_id:null,batch_id:batch,status:'ok',superseded_by:null,provenance:{...clone(provenance),availability:'observed'} as MembershipRow['provenance']});
    return outcome;
   });

 const raw:MemoryIndustryDb={
  tables,
  setNow:iso=>{fixedNow=iso===null?null:new Date(iso).toISOString();},
  seedValuationRun:(run,rows)=>{st.vruns.set(run.run_id,clone(run));st.vcells.set(run.run_id,clone(rows));},
  seedLicense:(key,status)=>{st.licences.set(key,status);},
  classifications:()=>clone([...st.classes.values()]),sources:()=>clone([...st.sources.values()]),memberships:()=>clone([...st.memberships.values()]),
  marks:()=>clone([...st.marks.values()]),officials:()=>clone([...st.officials.values()]),metricRuns:()=>clone([...st.runs.values()]),
  metricCells:()=>clone([...st.cells.values()].flatMap(m=>[...m.values()])),manifests:()=>clone([...st.manifests.values()]),

  upsertClassifications:(_batch,input)=>atomic(s=>{
   let inserted=0,unchanged=0;const conflicts:ClassificationRow[]=[];
   const fresh:ClassificationRow[]=[];
   for(const r of input){
    const e=s.classes.get(classKey(r.scheme,r.version,r.code));
    if(e){if(sameClassification(e,r))unchanged++;else conflicts.push(clone(r));continue;}
    if(!fresh.some(f=>f.scheme===r.scheme&&f.version===r.version&&f.code===r.code))fresh.push(r);
   }
   fresh.sort((a,b)=>a.level-b.level||cmp(a.code,b.code));
   for(const r of fresh){
    if(r.name_zh===null&&r.name_en===null)unknown('industry_classifications_has_name');
    if(r.parent_code!==null&&!s.classes.has(classKey(r.scheme,r.version,r.parent_code)))unknown('industry_classifications_parent_fkey');
    s.classes.set(classKey(r.scheme,r.version,r.code),{...clone(r),attributes:clone(r.attributes??{})});inserted++;
   }
   return {inserted,unchanged,conflicts};
  }),
  async classificationTree(scheme,version){return clone([...st.classes.values()].filter(r=>r.scheme===scheme&&r.version===version).sort((a,b)=>a.level-b.level||cmp(a.code,b.code)));},
  async setDatasetLicense(key,status,by){
   if(status!=='internal'&&status!=='public')unknown('invalid_status');
   if(!by||!by.trim())unknown('invalid_decided_by');
   if(!st.licences.has(key))unknown('invalid_dataset_key');
   st.licences.set(key,status);
  },
  async isDatasetPublic(key){return st.licences.get(key)==='public';},

  upsertSourceMemberships:(batch,input)=>atomic(s=>{
   let inserted=0,superseded=0,duplicates=0;const changed:{old_id:string;new_id:string;nullToDate:boolean}[]=[];
   const rows=[...input].sort((a,b)=>cmp(a.source,b.source)||cmp(a.ts_code,b.ts_code)||cmp(a.l3_code,b.l3_code)||cmp(a.in_date,b.in_date));
   for(const x of rows){
    const cur=[...s.sources.values()].find(r=>r.status==='current'&&r.source===x.source&&r.ts_code===x.ts_code&&r.l3_code===x.l3_code&&r.in_date===x.in_date);
    if(cur&&cur.name===x.name&&cur.l1_code===x.l1_code&&cur.l2_code===x.l2_code&&cur.out_date===x.out_date){duplicates++;continue;}
    const id=randomUUID();
    if(cur){
     cur.status='superseded';cur.superseded_by=id;superseded++;
     changed.push({old_id:cur.id,new_id:id,nullToDate:cur.out_date===null&&x.out_date!==null&&cur.name===x.name&&cur.l1_code===x.l1_code&&cur.l2_code===x.l2_code});
    }else inserted++;
    s.sources.set(id,{id,scheme:'sw2021',version:'2021',source:x.source,ts_code:x.ts_code,name:x.name,l1_code:x.l1_code,l2_code:x.l2_code,l3_code:x.l3_code,in_date:x.in_date,out_date:x.out_date,
     observed_at:new Date(x.observed_at).toISOString(),batch_id:batch,raw_hash:x.raw_hash,locator:clone(x.locator),status:'current',superseded_by:null,issuer_id:null,resolution:{},resolution_error:null});
   }
   return {inserted,superseded,duplicates,changed};
  }),
  async currentSourceMemberships(o){
   return clone([...st.sources.values()].filter(r=>r.status==='current'&&(o.l1Code===undefined||r.l1_code===o.l1Code)&&(!o.unresolvedOnly||r.issuer_id===null))
    .sort((a,b)=>cmp(a.ts_code,b.ts_code)||cmp(a.l3_code,b.l3_code)||cmp(a.in_date,b.in_date)||cmp(a.id,b.id)));
  },
  async recordResolutionError(ids,error){
   if(!error||typeof error.code!=='string'||!error.code)unknown('invalid_error');
   let n=0;for(const id of new Set(ids)){const r=st.sources.get(id);if(r&&r.status==='current'&&r.issuer_id===null){r.resolution_error=clone(error);n++;}}
   return n;
  },

  applyMemberships:(batch,issuer,scheme,version,input,sourceIds,resolution)=>atomic(async s=>{
   if(!Array.isArray(input))unknown('invalid_rows');
   if(resolution!==null&&resolution!==undefined&&(typeof resolution!=='object'||Array.isArray(resolution)))unknown('invalid_resolution');
   if(!await registered('issuers',{issuer_id:issuer}))unknown('issuer_not_found');
   for(const id of sourceIds){
    const m=s.sources.get(id);
    if(!m||m.status!=='current'||m.scheme!==scheme||(m.issuer_id!==null&&m.issuer_id!==issuer))fail('membership_conflict','membership_conflict: source records must be current, of the scheme, and unresolved or resolved to this issuer');
   }
   // 1 preallocate
   const targets=input.map((t,ord)=>({...clone(t),membership_id:randomUUID(),ord}));
   // 2 supersede (transitive predecessors of the given records)
   const old=new Set<string>();let frontier=[...sourceIds];
   while(frontier.length){const next:string[]=[];for(const r of s.sources.values())if(r.superseded_by!==null&&frontier.includes(r.superseded_by)&&!old.has(r.id)){old.add(r.id);next.push(r.id);}frontier=next;}
   // successor = the target of the same source lineage (the current descendant of the old row's record) and level
   const heir=(origin:string):string|null=>{let cur=s.sources.get(origin)?.superseded_by??null;const seen=new Set<string>();
    while(cur!==null&&!sourceIds.includes(cur)&&!seen.has(cur)){seen.add(cur);cur=s.sources.get(cur)?.superseded_by??null;}
    return cur!==null&&sourceIds.includes(cur)?cur:null;};
   let superseded=0;const succ=new Set<string>();
   for(const m of [...s.memberships.values()]){
    if(m.issuer_id!==issuer||m.scheme!==scheme||m.version!==version||m.status!=='ok'||m.source_membership_id===null||!old.has(m.source_membership_id))continue;
    const h=heir(m.source_membership_id);
    const t=h===null?undefined:targets.find(x=>x.level===m.level&&(x.provenance as Record<string,unknown>).source_membership_id===h);if(!t)continue;
    m.status='superseded';m.superseded_by=t.membership_id;superseded++;succ.add(t.membership_id);
   }
   // 3 close / 4 insert
   let inserted=0,closed=0,duplicates=0;const ids:string[]=[];const used=new Set<string>();
   for(const t of targets){
    const ex=okRows(s).find(e=>e.issuer_id===issuer&&e.scheme===scheme&&e.version===version&&e.code===t.code&&e.valid_from===t.valid_from);
    if(ex){
     if(ex.valid_to===null&&t.valid_to!==null&&ex.level===t.level){
      if(t.valid_to<=ex.valid_from||t.valid_to_available_date===null||t.valid_to_available_date<ex.valid_from)unknown('append_only: issuer_industry_memberships valid_to may only go from null to a date after valid_from');
      ex.valid_to=t.valid_to;ex.valid_to_available_date=t.valid_to_available_date;closed++;ids.push(ex.membership_id);used.add(t.membership_id);
     }else if(ex.level===t.level&&ex.valid_to===t.valid_to&&ex.available_date===t.available_date&&ex.valid_to_available_date===t.valid_to_available_date&&ex.source===t.source){
      duplicates++;ids.push(ex.membership_id);used.add(t.membership_id);
     }else fail('membership_conflict',`membership_conflict: ${issuer} ${scheme} ${t.code} level ${t.level} from ${t.valid_from} differs from the stored row`);
     continue;
    }
    const prov=t.provenance as Record<string,unknown>;
    insertMembership(s,{membership_id:t.membership_id,issuer_id:issuer,scheme,version,code:t.code,level:t.level,valid_from:t.valid_from,valid_to:t.valid_to,
     available_date:t.available_date,valid_to_available_date:t.valid_to_available_date,source:t.source,source_membership_id:typeof prov.source_membership_id==='string'&&prov.source_membership_id?prov.source_membership_id:null,
     batch_id:batch,status:'ok',superseded_by:null,provenance:clone(t.provenance)});
    inserted++;ids.push(t.membership_id);
   }
   if([...succ].some(id=>used.has(id)))fail('membership_conflict','membership_conflict: a superseded row would point at a replacement that was not inserted');
   // 5 resolution bookkeeping
   for(const id of sourceIds){const r=s.sources.get(id)!;r.issuer_id=issuer;r.resolution={...clone(resolution??{}),membership_ids:[...ids]};r.resolution_error=null;}
   return {inserted,closed,superseded,duplicates,membership_ids:ids} as ApplyMembershipsResult;
  }),
  correctMembershipWindows:(batch,issuer,scheme,version,sourceId,input)=>atomic(async s=>{
   if(!Array.isArray(input))unknown('invalid_rows');
   if(!await registered('issuers',{issuer_id:issuer}))unknown('issuer_not_found');
   const src=s.sources.get(sourceId);
   if(!src||src.status!=='current'||src.scheme!==scheme||src.issuer_id!==issuer)fail('membership_conflict',`membership_conflict: source record ${sourceId} is not current and resolved to issuer ${issuer}`);
   let inserted=0,superseded=0,duplicates=0,quarantined=0;const ids:string[]=[];
   for(const t of input){
    if((t.provenance as Record<string,unknown>).source_membership_id!==sourceId)fail('membership_conflict','membership_conflict: correction targets must carry the source record');
    const old=okRows(s).find(m=>m.issuer_id===issuer&&m.scheme===scheme&&m.version===version&&m.source_membership_id===sourceId&&m.level===t.level&&m.code===t.code&&m.valid_from===t.valid_from);
    if(!old)fail('membership_conflict',`membership_conflict: no ok row of source ${sourceId} at level ${t.level} from ${t.valid_from}`);
    if(t.valid_to!==null&&t.valid_to<=old!.valid_from){   // empty corrected window (R3-1): quarantine, no successor
     old!.status='quarantined';old!.provenance={...old!.provenance,quarantine:{reason:'membership_after_delist',valid_to:t.valid_to,batch_id:batch}};
     quarantined++;ids.push(old!.membership_id);continue;
    }
    if(old!.valid_to===t.valid_to&&old!.valid_to_available_date===t.valid_to_available_date){duplicates++;ids.push(old!.membership_id);continue;}
    const id=randomUUID();
    old!.status='superseded';old!.superseded_by=id;
    insertMembership(s,{membership_id:id,issuer_id:issuer,scheme,version,code:old!.code,level:old!.level,valid_from:old!.valid_from,valid_to:t.valid_to,available_date:old!.available_date,
     valid_to_available_date:t.valid_to_available_date,source:t.source,source_membership_id:sourceId,batch_id:batch,status:'ok',superseded_by:null,provenance:clone(t.provenance)});
    superseded++;inserted++;ids.push(id);
   }
   return {inserted,closed:0,superseded,duplicates,quarantined,membership_ids:ids} as CorrectWindowsResult;
  }),
  // lease fence (Codex round 2 R2-3): the scope row (in `tables`) must still be leased to fence.leaseBatch and unexpired
  async applySicMembership(batch,issuer,observed,code,provenance,fence){
   if(!observed)unknown('invalid_rows');
   const notObject=(v:unknown)=>v!==null&&v!==undefined&&(typeof v!=='object'||Array.isArray(v));
   if(notObject(provenance)||notObject(fence.secSubmissions))unknown('invalid_provenance');
   if(!await registered('issuers',{issuer_id:issuer}))unknown('issuer_not_found');
   const [lease]=await tables.select('industry_sync_scope',{issuer_id:issuer,job:'sic'},{limit:1});
   if(!lease||lease.lease_batch_id!==fence.leaseBatch||lease.lease_until==null||Date.parse(String(lease.lease_until))<=Date.parse(now()))fail('lease_lost');
   const outcome=code===null?'none' as const:await applySicRow(batch,issuer,observed,code,provenance);
   if(fence.secSubmissions!=null){
    const [iss]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
    if(iss){const prov=(iss.provenance&&typeof iss.provenance==='object'?iss.provenance:{}) as Record<string,unknown>;await tables.update('issuers',{issuer_id:issuer},{provenance:{...prov,sec_submissions:clone(fence.secSubmissions)},updated_at:now()});}
   }
   return outcome;
  },
  async membershipCandidates(q){
   return clone([...st.memberships.values()].filter(m=>m.scheme===q.scheme&&m.version===q.version&&m.code===q.code&&m.level===q.level&&m.valid_from<=q.on)
    .sort((a,b)=>cmp(a.issuer_id,b.issuer_id)||cmp(a.valid_from,b.valid_from)||cmp(a.membership_id,b.membership_id)));
  },
  async membershipsOfIssuer(issuer,q){
   return clone(sortMemberships([...st.memberships.values()].filter(m=>m.issuer_id===issuer&&(q.scheme===undefined||m.scheme===q.scheme)
    &&(q.on===undefined||(m.valid_from<=q.on&&(m.valid_to===null||m.valid_to>q.on))))));
  },

  async beginFetchEvent(job,params,batch){
   if(!params||typeof params!=='object'||Array.isArray(params))unknown('invalid_params');
   const id=randomUUID();st.events.set(id,{job,params:clone(params),batch_id:batch,attempt:1,started_at:now()});return id;
  },
  async retryFetchEvent(id){const e=st.events.get(id);if(!e)unknown('fetch_event_not_found');e!.attempt++;},
  async applyObservations(kind:'marks'|'official',fetchEventId:string,input:unknown[]):Promise<ObservationResult>{
   if(kind!=='marks'&&kind!=='official')unknown('invalid_kind');
   if(!Array.isArray(input))unknown('invalid_rows');
   const items:Parameters<typeof quarantineAfter>[0]=[];
   // the quarantine items are filed inside the atomic section: if filing fails nothing of the call is installed (a retry is idempotent: one open item per key)
   return atomic(async s=>{
    const ev=s.events.get(fetchEventId);if(!ev)unknown('fetch_event_not_found');
    let inserted=0,duplicates=0,superseded=0;
    const keyOf=(x:MarkInput|OfficialInput)=>kind==='marks'?`${(x as MarkInput).ticker}:${x.trade_date}`:`${(x as OfficialInput).scheme}:${(x as OfficialInput).version}:${(x as OfficialInput).code}:${x.trade_date}:${(x as OfficialInput).metric}`;
    const rows=[...(input as (MarkInput|OfficialInput)[])].sort((a,b)=>cmp(keyOf(a),keyOf(b)));
    for(const x of rows){
     const key=keyOf(x);const at=now();
     let hash:string;let status:'ok'|'quarantined'='ok';
     if(kind==='marks'){
      const m=x as MarkInput;status=m.status??'ok';
      if(status!=='ok'&&status!=='quarantined')unknown('invalid_status');
      hash=sha256(`${trimScale(m.close)}|${trimScale(m.total_share)}|${status}|${m.free_share==null?'':trimScale(m.free_share)}`);
     }else hash=sha256(trimScale((x as OfficialInput).value));
     const rk=`${fetchEventId}|${kind}|${key}`;const rc=s.receipts.get(rk);
     if(rc){if(rc.payload_hash!==hash)fail('fetch_event_payload_changed',`fetch_event_payload_changed: ${kind} ${key} in event ${fetchEventId}`);duplicates++;continue;}
     let outcome:'inserted'|'duplicate'|'superseded_previous';let obsId:string;
     if(kind==='marks'){
      const m=x as MarkInput;
      const cur=status==='ok'?[...s.marks.values()].find(r=>r.ticker===m.ticker&&r.trade_date===m.trade_date&&r.status==='ok'):undefined;
      const sameFree=(cur?.free_share??null)===null||(m.free_share??null)===null?(cur?.free_share??null)===(m.free_share??null):decEq(cur!.free_share!,m.free_share!);
      if(cur&&decEq(cur.close,m.close)&&decEq(cur.total_share,m.total_share)&&sameFree){outcome='duplicate';obsId=cur.observation_id;duplicates++;}
      else{
       // table constraints apply to rows that are actually inserted (after the receipt and current-observation comparison)
       if(decSign(m.close)<=0)unknown('security_marks_close_check');
       if(decSign(m.total_share)<=0)unknown('security_marks_total_share_check');
       if(m.free_share!=null&&decSign(m.free_share)<=0)unknown('security_marks_free_share_check');
       if(!await registered('stocks_universe',{ticker:m.ticker}))unknown('security_marks_ticker_fkey');
       if(cur)cur.status='superseded';
       obsId=randomUUID();
       s.marks.set(obsId,{observation_id:obsId,ticker:m.ticker,trade_date:m.trade_date,fetch_event_id:fetchEventId,observed_at:at,close:m.close,total_share:m.total_share,free_share:m.free_share??null,
        market_cap:mulDecimalText(m.close,m.total_share),source:m.source,upstream:m.upstream,raw_hash:m.raw_hash,locator:clone(m.locator),batch_id:ev!.batch_id,status,supersedes:cur?.observation_id??null});
       if(cur){outcome='superseded_previous';superseded++;items.push({dataset:'industry.marks',table:'security_marks',key,reason:'mark_revised',detail:{previous:cur.observation_id,current:obsId,fetch_event_id:fetchEventId},batch:ev!.batch_id});}
       else{outcome='inserted';inserted++;}   // a 'quarantined' input is stored as evidence and counted here, like the SQL function
      }
     }else{
      const o=x as OfficialInput;
      const cur=[...s.officials.values()].find(r=>r.scheme===o.scheme&&r.version===o.version&&r.code===o.code&&r.trade_date===o.trade_date&&r.metric===o.metric&&r.status==='ok');
      if(cur&&decEq(cur.value,o.value)){outcome='duplicate';obsId=cur.observation_id;duplicates++;}
      else{
       if(cur)cur.status='superseded';
       obsId=randomUUID();
       s.officials.set(obsId,{observation_id:obsId,scheme:o.scheme,version:o.version,code:o.code,trade_date:o.trade_date,metric:o.metric,fetch_event_id:fetchEventId,value:o.value,observed_at:at,
        source:o.source,upstream:o.upstream,raw_hash:o.raw_hash,locator:clone(o.locator),batch_id:ev!.batch_id,status:'ok',supersedes:cur?.observation_id??null});
       if(cur){outcome='superseded_previous';superseded++;items.push({dataset:'industry.official',table:'industry_official_valuations',key,reason:'official_revised',detail:{previous:cur.observation_id,current:obsId,fetch_event_id:fetchEventId},batch:ev!.batch_id});}
       else{outcome='inserted';inserted++;}
      }
     }
     s.receipts.set(rk,{payload_hash:hash,outcome,observation_id:obsId});
    }
    await quarantineAfter(items);
    return {inserted,duplicates,superseded};
   });
  },
  async currentMarksOn(tradeDate,tickers){
   const want=new Set(tickers);
   return clone([...st.marks.values()].filter(m=>m.trade_date===tradeDate&&m.status==='ok'&&want.has(m.ticker)).sort((a,b)=>cmp(a.ticker,b.ticker)));
  },

  createMetricRun:row=>atomic(async s=>{
   if(!row.batch_id||!await registered('ingest_batches',{batch_id:row.batch_id}))unknown('invalid_batch');
   const generation=Math.max(0,...[...s.runs.values()].filter(r=>r.scheme===row.scheme&&r.version===row.version&&r.level===row.level).map(r=>r.generation))+1;
   const run_id=randomUUID();
   s.runs.set(run_id,{...clone(row),fingerprint_at:new Date(row.fingerprint_at).toISOString(),run_id,generation,status:'building',coverage_summary:{},created_at:now(),activated_at:null});
   s.cells.set(run_id,new Map());
   return {runId:run_id,generation};
  }),
  async setMetricRunCoverage(run,summary){
   if(!summary||typeof summary!=='object'||Array.isArray(summary))unknown('invalid_summary');
   const r=lockRun(st,run);if(r.status!=='building')fail('run_not_building');r.coverage_summary=clone(summary);
  },
  stageMetricRows:(run,input)=>atomic(s=>{
   const r=lockRun(s,run);if(r.status!=='building')fail('run_not_building');
   const cells=s.cells.get(run)!;
   // manifests.lock_for_reference looks at every referenced hash before any row is written
   for(const c of input as StagedMetricCell[])if(c.manifest_hash!==null&&s.manifests.get(c.manifest_hash)?.gc_claimed_at!=null)fail('manifest_gc_in_progress');
   const seen=new Set<string>();
   for(const c of input as StagedMetricCell[]){
    if(!AGG_METRICS.includes(c.metric))unknown('industry_metrics_metric_check');
    if(c.missing_reason!==null&&!MISSING.includes(c.missing_reason))unknown('industry_metrics_missing_reason_check');
    if((c.status==='ok')!==(c.value!==null))unknown('industry_metrics_ok_value');
    if((c.status==='ok')!==(c.manifest_hash!==null))unknown('industry_metrics_ok_manifest');
    if((c.status==='missing')!==(c.missing_reason!==null))unknown('industry_metrics_missing_reason');
    if(c.manifest_hash!==null&&!s.manifests.has(c.manifest_hash))unknown('industry_metrics_manifest_hash_fkey');
    // one INSERT … ON CONFLICT cannot affect a row twice (SQLSTATE 21000)
    const key=`${c.code}|${c.metric}|${c.period_start}|${c.period_end}`;
    if(seen.has(key))unknown('on_conflict_cardinality');
    seen.add(key);
    cells.set(key,{...clone(c),run_id:run,updated_at:null});
   }
   return input.length;
  }),
  stageRunDependencies:(run,kind,input)=>atomic(s=>{
   if(kind==='aggregate'){const r=lockRun(s,run);if(r.status!=='building')fail('run_not_building');}
   else if(kind==='valuation'){const v=s.vruns.get(run);if(!v)unknown('run_not_found');if(v!.status!=='building')fail('run_not_building');}
   else unknown('invalid_kind');
   const k=depKey(kind,run);const m=s.deps.get(k)??new Map<string,RunDependency>();s.deps.set(k,m);
   const seen=new Set<string>();
   for(const d of input){
    const key=`${d.cell_key}|${d.issuer_id}`;
    if(seen.has(key))unknown('on_conflict_cardinality');
    seen.add(key);
    m.set(key,{cell_key:d.cell_key,issuer_id:d.issuer_id,state_rev:Number(d.state_rev)});
   }
   return input.length;
  }),
  activateMetricRun:run=>atomic(s=>{
   const r=lockRun(s,run);if(r.status!=='building')fail('run_not_building');
   const cells=[...s.cells.get(run)!.values()];
   for(const code of r.expected_grid.codes)for(const pe of r.expected_grid.period_ends)for(const metric of r.expected_grid.metrics)
    for(const [duration,decOnly] of REQUIRED_DURATIONS[metric]??[]){   // a metric the grid names but the method does not know has no required cells (SQL: join finds nothing)
     if(decOnly&&pe.slice(5)!=='12-31')continue;
     if(!cells.some(c=>c.code===code&&c.metric===metric&&c.duration===duration&&c.period_end===pe))fail('incomplete_run');
    }
   const deps=[...(s.deps.get(depKey('aggregate',run))?.values()??[])];
   const perCell=new Map<string,number>();const cellAt=new Map<string,{code:string;pe:string}>();
   for(const c of cells){const k=`${c.code}:${c.period_end}`;perCell.set(k,Math.max(perCell.get(k)??0,c.n_members));cellAt.set(k,{code:c.code,pe:c.period_end});}
   for(const [k,n] of perCell)if(deps.filter(d=>d.cell_key===k).length!==n)fail('dependencies_incomplete');
   // the dependency issuers of each cell equal its candidate members known by facts_as_of (both directions); no dependency of a cell without rows
   for(const [k,{code,pe}] of cellAt)if(!sameSet(new Set(deps.filter(d=>d.cell_key===k).map(d=>d.issuer_id)),candidateIssuers(s,r,code,pe,r.facts_as_of)))fail('dependencies_incomplete');
   if(deps.some(d=>!cellAt.has(d.cell_key)))fail('dependencies_incomplete');
   const active=[...s.runs.values()].find(a=>a.scheme===r.scheme&&a.version===r.version&&a.level===r.level&&a.status==='active');
   if(active){
    if(r.generation<=active.generation||r.facts_as_of<active.facts_as_of)fail('obsolete_run');
    const mine=new Map(deps.map(d=>[`${d.cell_key}|${d.issuer_id}`,d.state_rev]));
    for(const o of s.deps.get(depKey('aggregate',active.run_id))?.values()??[]){const n=mine.get(`${o.cell_key}|${o.issuer_id}`);if(n!==undefined&&n<o.state_rev)fail('dependency_regression');}
    active.status='superseded';
   }
   const t=tick();
   r.status='active';r.activated_at=t;
   for(const c of cells)c.updated_at=t;
   return {activatedAt:t};
  }),
  async failRun(kind,run,reason){
   if(kind!=='aggregate'&&kind!=='valuation')unknown('invalid_kind');
   if(kind==='aggregate'){
    const r=lockRun(st,run);if(r.status!=='building')fail('illegal_transition',`illegal_transition: aggregate run ${run} is ${r.status}`);
    r.status='failed';r.coverage_summary={...r.coverage_summary,failure_reason:reason};
   }else{
    const v=st.vruns.get(run);if(!v)unknown('run_not_found');
    if(v!.status!=='building'&&v!.status!=='published')fail('illegal_transition',`illegal_transition: valuation run ${run} is ${v!.status}`);
    v!.status='failed';v!.reconciliation={...v!.reconciliation,failure_reason:reason};
   }
  },
  async activeMetricRun(scheme,version,level){const r=[...st.runs.values()].find(x=>x.scheme===scheme&&x.version===version&&x.level===level&&x.status==='active');return r?clone(r):null;},
  async metricRun(run){const r=st.runs.get(run);return r?clone(r):null;},
  async metricRowsOfRun(run,filter={}){
   return clone([...(st.cells.get(run)?.values()??[])].filter(c=>(!filter.codes||filter.codes.includes(c.code))&&(!filter.metrics||filter.metrics.includes(c.metric))
    &&(!filter.periodEnds||filter.periodEnds.includes(c.period_end))&&(!filter.durations||filter.durations.includes(c.duration)))
    .sort((a,b)=>cmp(a.code,b.code)||cmp(a.metric,b.metric)||cmp(a.period_end,b.period_end)||cmp(a.period_start,b.period_start)));
  },
  async runDependencies(kind,run){return clone([...(st.deps.get(depKey(kind,run))?.values()??[])].sort((a,b)=>cmp(a.cell_key,b.cell_key)||cmp(a.issuer_id,b.issuer_id)));},

  async activeValuationRun(scheme,version,level){const r=[...st.vruns.values()].find(x=>x.scheme===scheme&&x.version===version&&x.level===level&&x.status==='active');return r?clone(r):null;},
  async publishedValuations(run,filter){
   return clone((st.vcells.get(run)??[]).filter(c=>c.published&&VAL_METRICS.includes(c.metric)&&(!filter.codes||filter.codes.includes(c.code))&&(filter.from===undefined||c.trade_date>=filter.from)&&(filter.to===undefined||c.trade_date<=filter.to))
    .sort((a,b)=>cmp(a.code,b.code)||cmp(a.metric,b.metric)||cmp(a.trade_date,b.trade_date)));
  },

  async registerManifest(hash,kind,byteLength){
   if(!/^[0-9a-f]{64}$/.test(hash))unknown('industry_manifests_manifest_hash_check');
   if(!(byteLength>0))unknown('industry_manifests_byte_length_check');
   const e=st.manifests.get(hash);
   if(e){if(e.gc_claimed_at!==null)fail('manifest_gc_in_progress');e.created_at=now();return false;}
   st.manifests.set(hash,{manifest_hash:hash,kind,byte_length:byteLength,created_at:now(),object_path:`sha256/${hash}/${randomUUID()}.json.gz`,gc_claimed_at:null,gc_claim:null});return true;
  },
  async manifestObjectPath(hash){return st.manifests.get(hash)?.object_path??null;},
  async manifestGcCandidates(limit){
   if(!Number.isInteger(limit)||limit<1)unknown('invalid_limit');
   const t=now();const staleClaim=(c:string|null)=>c===null||Date.parse(c)<=Date.parse(t)-3_600_000;
   const picked=[...st.manifests.values()].filter(m=>oldEnough(m.created_at)&&staleClaim(m.gc_claimed_at)&&unreferenced(st,m.manifest_hash))
    .sort((a,b)=>cmp(a.created_at,b.created_at)||cmp(a.manifest_hash,b.manifest_hash)).slice(0,limit);
   for(const m of picked){m.gc_claimed_at=t;m.gc_claim=randomUUID();}   // claim (tombstone) with a fresh token: see put_industry_manifest
   return picked.map(m=>({hash:m.manifest_hash,objectPath:m.object_path,claim:m.gc_claim!})) as ManifestGcClaim[];
  },
  async deleteManifestIndex(claims){
   let n=0;for(const c of claims){const m=st.manifests.get(c.hash);if(m&&m.gc_claim===c.claim&&m.gc_claimed_at!==null&&oldEnough(m.created_at)&&unreferenced(st,c.hash)){st.manifests.delete(c.hash);n++;}}
   return n;
  },
  async pruneRuns(keep){
   if(!Number.isInteger(keep)||keep<1)unknown('invalid_keep');
   // runs cited by an F4 judgment (when that table exists and holds rows; conservative text match on the run id, like the SQL function) are never pruned
   const judgments=(await tables.select('judgments',{})).map(j=>JSON.stringify(j));
   const cited=(id:string)=>judgments.some(j=>j.includes(id));
   let n=0;
   const families=new Map<string,MetricRunRow[]>();
   for(const r of st.runs.values())if(r.status==='superseded'){const k=`${r.scheme}|${r.version}|${r.level}`;families.set(k,[...(families.get(k)??[]),r]);}
   for(const rows of families.values())for(const r of rows.sort((a,b)=>b.generation-a.generation).slice(keep)){if(cited(r.run_id))continue;st.runs.delete(r.run_id);st.cells.delete(r.run_id);st.deps.delete(depKey('aggregate',r.run_id));n++;}
   const vfam=new Map<string,ValuationRunRow[]>();
   for(const r of st.vruns.values())if(r.status==='superseded'){const k=`${r.scheme}|${r.version}|${r.level}`;vfam.set(k,[...(vfam.get(k)??[]),r]);}
   for(const rows of vfam.values())for(const r of rows.sort((a,b)=>b.generation-a.generation).slice(keep)){if(cited(r.run_id))continue;st.vruns.delete(r.run_id);st.vcells.delete(r.run_id);st.deps.delete(depKey('valuation',r.run_id));n++;}
   for(const r of st.runs.values())if(r.reused_from_run!==null&&!st.runs.has(r.reused_from_run))r.reused_from_run=null;   // FK on delete set null
   for(const r of st.vruns.values())if(r.carried_from_run!==null&&!st.vruns.has(r.carried_from_run))r.carried_from_run=null;
   return n;
  },
  async stateFingerprint(market){
   const rows=opts.facts?await opts.facts.scopeAll(market):[];
   return {takenAt:tick(),revs:new Map(rows.map(r=>[r.issuer_id,r.state_rev]))};
  },
  async freshness():Promise<FreshnessRow[]>{
   const rows=(await tables.select('dq_freshness',{})).filter(r=>String(r.dataset).startsWith('industry.'));
   return rows.map(r=>({dataset:String(r.dataset),status:r.status as FreshnessRow['status'],last_ok_at:r.last_ok_at===null||r.last_ok_at===undefined?null:new Date(String(r.last_ok_at)).toISOString()}))
    .sort((a,b)=>cmp(a.dataset,b.dataset));
  },
  async metricRunVisible(run){const r=st.runs.get(run);return !!r&&r.status==='active'&&st.licences.get(`scheme:${r.scheme}:${r.version}`)==='public';},
  async unresolvedCount(q){return distinctTsCodes(unresolvedOf(q));},
  async unresolvedOf(q){return unresolvedOf(q);},
 };
 // Every IndustryDb method runs through one promise chain per instance, so no call observes another's partial work.
 let chain:Promise<unknown>=Promise.resolve();
 const serialize=<A extends unknown[],T>(fn:(...a:A)=>Promise<T>)=>(...a:A):Promise<T>=>{const next=chain.then(()=>fn(...a));chain=next.catch(()=>undefined);return next;};
 const db={...raw} as MemoryIndustryDb;
 for(const k of ASYNC_METHODS){
  const f=raw[k] as unknown as (...a:unknown[])=>Promise<unknown>;
  (db as unknown as Record<string,unknown>)[k]=serialize(f);
 }
 return db;
}
