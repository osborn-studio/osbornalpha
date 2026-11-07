// src/lib/industry/pg-industry-db.ts
// TEST-ONLY IndustryDb over node-postgres that calls the same SQL functions supabaseIndustryDb calls
// through rpc, so the shared contract and the offline integration tests (Task 14) exercise the real
// schema: locks, triggers, exclusion constraints, generations, receipts. Nothing in src/app imports
// this. date/timestamptz come back as text (pg-table-client typeParsers), jsonb is parsed, numeric and
// bigint arrive as strings; every row goes through the db.ts normalisers (decimals from *_text,
// timestamps in toISOString() form) and errors through toIndustryDbError, exactly like the Supabase
// adapter. The pool's role is whatever the caller connected as (tests use the admin role).
import type {Pool} from 'pg';
import {chunkIds} from '../facts/db';
import type {PgErrorLike} from '../facts/db';
import {ident,typeParsers} from '../db/pg-table-client';
import {
 DEPS_CHUNK,STAGE_CHUNK,addObservations,applyResult,classificationFromTable,correctResult,delistingFromTable,dependencyFromTable,lineageResult,planDelistings,distinctTsCodes,fingerprintFromJson,freshnessFromJson,gcClaimsFromJson,levelColumn,
 markFromTable,membershipFromTable,metricCellFromTable,metricRunFromTable,newRunArgs,observationResult,sameClassification,sourceArgs,sourceFromTable,
 stagedCellArgs,toIndustryDbError,unresolvedFromTable,upsertSourceResult,valuationCellFromTable,valuationRunFromTable,
} from './db';
import type {ClassificationRow,DelistingInput,IndustryDb,ObservationResult} from './types';

const parts=<T>(rows:T[],size:number):T[][]=>{if(rows.length===0)return [[]];const out:T[][]=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out;};

export function pgIndustryDb(pool:Pool):IndustryDb{
 const run=async(text:string,values:unknown[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){throw toIndustryDbError(e as PgErrorLike);}
 };
 const fn=async<T>(call:string,values:unknown[]):Promise<T>=>(await run(`select ${call} as v`,values)).rows[0].v as T;
 const rel=(table:string)=>`${ident('public')}.${ident(table)}`;
 const unresolvedOf=async(q:{code:string;level:number;on:string;knownBy:string})=>{
  const col=ident(levelColumn(q.level));
  return (await run(`select s.id, s.ts_code, s.in_date, s.out_date from ${rel('industry_source_memberships')} s
   where s.status = 'current' and s.issuer_id is null and s.${col} = $1 and s.in_date <= $2::date and s.in_date <= $3::date and (s.out_date is null or s.out_date >= $2::date)
   and not exists (select 1 from ${rel('industry_security_delistings')} d where d.ts_code = s.ts_code and d.delist_date <= $2::date)
   order by s.ts_code, s.in_date, s.id`,[q.code,q.on,q.knownBy])).rows.map(unresolvedFromTable);
 };
 const db:IndustryDb={
  async upsertClassifications(_batch,input){
   let inserted=0,unchanged=0;const conflicts:ClassificationRow[]=[];
   const groups=new Map<string,ClassificationRow[]>();
   for(const r of input){const k=`${r.scheme}\u0000${r.version}`;groups.set(k,[...(groups.get(k)??[]),r]);}
   for(const group of groups.values()){
    const existing=new Map((await db.classificationTree(group[0].scheme,group[0].version)).map(r=>[r.code,r]));
    const fresh:ClassificationRow[]=[];
    for(const r of group){
     const e=existing.get(r.code);
     if(!e){if(!fresh.some(f=>f.code===r.code))fresh.push(r);continue;}
     if(sameClassification(e,r))unchanged++;else conflicts.push(r);
    }
    fresh.sort((a,b)=>a.level-b.level||(a.code<b.code?-1:a.code>b.code?1:0));
    for(const r of fresh){
     await run(`insert into ${rel('industry_classifications')} (scheme, version, code, level, name_zh, name_en, parent_code, attributes) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [r.scheme,r.version,r.code,r.level,r.name_zh,r.name_en,r.parent_code,JSON.stringify(r.attributes??{})]);
     inserted++;
    }
   }
   return {inserted,unchanged,conflicts};
  },
  async classificationTree(scheme,version){
   return (await run(`select * from ${rel('industry_classifications')} where scheme = $1 and version = $2 order by level, code`,[scheme,version])).rows.map(classificationFromTable);
  },
  async setDatasetLicense(key,status,by,note){await fn('public.set_industry_dataset_license($1,$2,$3,$4)',[key,status,by,note]);},
  isDatasetPublic:key=>fn<boolean>('public.industry_dataset_is_public($1)',[key]),
  async upsertSourceMemberships(batch,input){
   const out={inserted:0,superseded:0,duplicates:0,changed:[] as {old_id:string;new_id:string;nullToDate:boolean}[]};
   for(const part of parts(input,STAGE_CHUNK)){
    if(part.length===0)continue;
    const r=upsertSourceResult(await fn<unknown>('public.upsert_industry_source_memberships($1,$2::jsonb)',[batch,JSON.stringify(sourceArgs(part))]));
    out.inserted+=r.inserted;out.superseded+=r.superseded;out.duplicates+=r.duplicates;out.changed.push(...r.changed);
   }
   return out;
  },
  async currentSourceMemberships(opts){
   const values:unknown[]=[];let where=`status = 'current'`;
   if(opts.l1Code!==undefined){values.push(opts.l1Code);where+=` and l1_code = $${values.length}`;}
   if(opts.unresolvedOnly)where+=` and issuer_id is null`;
   return (await run(`select * from ${rel('industry_source_memberships')} where ${where} order by ts_code, l3_code, in_date, id`,values)).rows.map(sourceFromTable);
  },
  async recordResolutionError(ids,error){return Number(await fn<unknown>('public.record_industry_source_resolution_error($1::uuid[],$2::jsonb)',[ids,JSON.stringify(error)]));},
  async applyMemberships(batch,issuer,scheme,version,input,sourceIds,resolution){
   return applyResult(await fn<unknown>('public.apply_industry_memberships($1,$2,$3,$4,$5::jsonb,$6::uuid[],$7::jsonb)',[batch,issuer,scheme,version,JSON.stringify(input),sourceIds,JSON.stringify(resolution)]));
  },
  async correctMembershipWindows(batch,issuer,scheme,version,sourceId,rows){return correctResult(await fn<unknown>('public.correct_industry_membership_windows($1,$2,$3,$4,$5,$6::jsonb)',[batch,issuer,scheme,version,sourceId,JSON.stringify(rows)]));},
  async quarantineMembershipLineage(batch,scheme,version,sourceIds,reason){return lineageResult(await fn<unknown>('public.quarantine_industry_membership_lineage($1,$2,$3,$4::uuid[],$5)',[batch,scheme,version,sourceIds,reason]));},
  async delistings(){return (await run(`select * from ${rel('industry_security_delistings')} order by ts_code`,[])).rows.map(delistingFromTable);},
  async upsertDelistings(batch,input){
   const {insert,update,result}=planDelistings(new Map((await db.delistings()).map(r=>[r.ts_code,r])),input);
   const vals=(r:DelistingInput)=>[r.ts_code,r.delist_date,r.list_status,r.observed_at,batch,r.raw_hash];
   for(const r of insert)await run(`insert into ${rel('industry_security_delistings')} (ts_code, delist_date, list_status, observed_at, batch_id, raw_hash) values ($1,$2::date,$3,$4::timestamptz,$5,$6)`,vals(r));
   for(const r of update)await run(`update ${rel('industry_security_delistings')} set delist_date=$2::date, list_status=$3, observed_at=$4::timestamptz, batch_id=$5, raw_hash=$6 where ts_code=$1`,vals(r));
   return result;
  },
  async applySicMembership(batch,issuer,observed,code,provenance,fence){
   return (await fn<{outcome:'inserted'|'duplicate'|'changed'|'none'}>(`public.apply_sic_memberships($1,$2,'sec-current',$3::date,$4,$5::jsonb,$6,$7::jsonb)`,[batch,issuer,observed,code,JSON.stringify(provenance),fence.leaseBatch,fence.secSubmissions==null?null:JSON.stringify(fence.secSubmissions)])).outcome;
  },
  async membershipCandidates(q){
   return (await run(`select * from ${rel('issuer_industry_memberships')} where scheme = $1 and version = $2 and code = $3 and level = $4 and valid_from <= $5::date order by issuer_id, valid_from, membership_id`,
    [q.scheme,q.version,q.code,q.level,q.on])).rows.map(membershipFromTable);
  },
  async membershipsOfIssuer(issuer,q){
   const values:unknown[]=[issuer];let where='issuer_id = $1';
   if(q.scheme!==undefined){values.push(q.scheme);where+=` and scheme = $${values.length}`;}
   if(q.on!==undefined){values.push(q.on);where+=` and valid_from <= $${values.length}::date and (valid_to is null or valid_to > $${values.length}::date)`;}
   return (await run(`select * from ${rel('issuer_industry_memberships')} where ${where} order by scheme, version, level, valid_from, membership_id`,values)).rows.map(membershipFromTable);
  },
  beginFetchEvent:(job,params,batch)=>fn<string>('public.begin_industry_fetch_event($1,$2::jsonb,$3)',[job,JSON.stringify(params),batch]),
  async retryFetchEvent(id){await fn('public.retry_industry_fetch_event($1)',[id]);},
  async applyObservations(kind:'marks'|'official',fetchEventId:string,input:unknown[]){
   let out:ObservationResult={inserted:0,duplicates:0,superseded:0};
   for(const part of parts(input,STAGE_CHUNK)){
    if(part.length===0)continue;
    out=addObservations(out,observationResult(await fn<unknown>('public.apply_observations($1,$2,$3::jsonb)',[kind,fetchEventId,JSON.stringify(part)])));
   }
   return out;
  },
  async currentMarksOn(tradeDate,tickers){
   const out=[];
   for(const part of chunkIds([...new Set(tickers)]))out.push(...(await run(`select * from ${rel('security_marks')} where trade_date = $1::date and status = 'ok' and ticker = any($2::text[]) order by ticker`,[tradeDate,part])).rows.map(markFromTable));
   return out.sort((a,b)=>a.ticker<b.ticker?-1:a.ticker>b.ticker?1:0);
  },
  async createMetricRun(row){
   const x=await fn<{run_id:string;generation:number|string}>('public.create_industry_metric_run($1::jsonb)',[JSON.stringify(newRunArgs(row))]);
   return {runId:String(x.run_id),generation:Number(x.generation)};
  },
  async setMetricRunCoverage(r,summary){await fn('public.set_industry_metric_run_coverage($1,$2::jsonb)',[r,JSON.stringify(summary)]);},
  async stageMetricRows(r,input){let n=0;for(const part of parts(input,STAGE_CHUNK))n+=Number(await fn<unknown>('public.stage_industry_metrics($1,$2::jsonb)',[r,JSON.stringify(stagedCellArgs(part))]));return n;},
  async stageRunDependencies(r,kind,input){let n=0;for(const part of parts(input,DEPS_CHUNK))n+=Number(await fn<unknown>('public.stage_industry_run_dependencies($1,$2,$3::jsonb)',[r,kind,JSON.stringify(part)]));return n;},
  async activateMetricRun(r){const x=await fn<{activated_at:string}>('public.activate_industry_metric_run($1)',[r]);return {activatedAt:new Date(x.activated_at).toISOString()};},
  async failRun(kind,r,reason){await fn('public.fail_industry_run($1,$2,$3)',[kind,r,reason]);},
  async activeMetricRun(scheme,version,level){
   const rows=(await run(`select * from ${rel('industry_metric_runs')} where scheme = $1 and version = $2 and level = $3 and status = 'active'`,[scheme,version,level])).rows;
   return rows[0]?metricRunFromTable(rows[0]):null;
  },
  async metricRun(r){const rows=(await run(`select * from ${rel('industry_metric_runs')} where run_id = $1`,[r])).rows;return rows[0]?metricRunFromTable(rows[0]):null;},
  async metricRowsOfRun(r,filter={}){
   const values:unknown[]=[r];let where='run_id = $1';
   if(filter.codes){values.push(filter.codes);where+=` and code = any($${values.length}::text[])`;}
   if(filter.metrics){values.push(filter.metrics);where+=` and metric = any($${values.length}::text[])`;}
   if(filter.periodEnds){values.push(filter.periodEnds);where+=` and period_end = any($${values.length}::date[])`;}
   if(filter.durations){values.push(filter.durations);where+=` and duration = any($${values.length}::text[])`;}
   return (await run(`select * from ${rel('industry_metrics')} where ${where} order by code, metric, period_end, period_start`,values)).rows.map(metricCellFromTable);
  },
  async runDependencies(kind,r){
   return (await run(`select cell_key, issuer_id, state_rev from ${rel('industry_run_dependencies')} where run_kind = $1 and run_id = $2 order by cell_key, issuer_id`,[kind,r])).rows.map(dependencyFromTable);
  },
  async activeValuationRun(scheme,version,level){
   const rows=(await run(`select * from ${rel('industry_valuation_runs')} where scheme = $1 and version = $2 and level = $3 and status = 'active'`,[scheme,version,level])).rows;
   return rows[0]?valuationRunFromTable(rows[0]):null;
  },
  async publishedValuations(r,filter){
   const values:unknown[]=[r];let where='run_id = $1 and published';
   if(filter.codes){values.push(filter.codes);where+=` and code = any($${values.length}::text[])`;}
   if(filter.from!==undefined){values.push(filter.from);where+=` and trade_date >= $${values.length}::date`;}
   if(filter.to!==undefined){values.push(filter.to);where+=` and trade_date <= $${values.length}::date`;}
   return (await run(`select * from ${rel('industry_valuations')} where ${where} order by code, metric, trade_date`,values)).rows.map(valuationCellFromTable);
  },
  registerManifest:(hash,kind,byteLength)=>fn<boolean>('public.put_industry_manifest($1,$2,$3)',[hash,kind,byteLength]),
  async manifestObjectPath(hash){return ((await run(`select object_path from ${rel('industry_manifests')} where manifest_hash = $1`,[hash])).rows[0]?.object_path as string|undefined)??null;},
  async manifestGcCandidates(limit){return gcClaimsFromJson(await fn<unknown>('public.gc_industry_manifest_candidates($1)',[limit]));},
  async deleteManifestIndex(claims){return Number(await fn<unknown>('public.delete_industry_manifests($1::jsonb)',[JSON.stringify(claims)]));},
  async pruneRuns(keep){return Number(await fn<unknown>('public.prune_industry_runs($1)',[keep]));},
  async stateFingerprint(market){return fingerprintFromJson(await fn<unknown>('public.industry_state_fingerprint($1)',[market]));},
  async freshness(){return freshnessFromJson(await fn<unknown>('public.industry_freshness()',[]));},
  metricRunVisible:r=>fn<boolean>('public.industry_metric_run_visible($1)',[r]),
  async unresolvedCount(q){return distinctTsCodes(await unresolvedOf(q));},
  unresolvedOf,
 };
 return db;
}
