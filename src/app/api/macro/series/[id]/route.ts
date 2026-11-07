// src/app/api/macro/series/[id]/route.ts
// GET /api/macro/series/[id]?from&to&asOf&transform (spec §3.3, §8): catalog-whitelisted history,
// at most 600 points, asOf ⇒ available_at ≤ asOf, transform raw | yoy (declared yoy derivation only)
// | diff (exact decimal). cycles/events/assetsByCycle are placeholders filled by Task 14.
import {CATALOG_VERSION,MACRO_CATALOG,catalogById} from '@/lib/macro/catalog';
import {CYCLES_VERSION} from '@/lib/macro/cycles';
import {MacroDbError} from '@/lib/macro/db';
import {EVENTS_VERSION} from '@/lib/macro/events';
import {subtract} from '@/lib/macro/decimal';
import {ParamError,asOfParam,dateParam,enumParam,errorResponse,failureResponse,macroRouteDeps,okJson,paramErrorResponse,readParams,requireSessionUser,shaOfRetrievals} from '@/lib/macro/route-helpers';
import {seriesExtras} from '@/lib/macro/series-extras';
import {resolveClosure} from '@/lib/macro/views';
import type {MacroSeriesDef,ObservationRow} from '@/lib/macro/types';

export const dynamic='force-dynamic';
const PARAMS=['from','to','asOf','transform'] as const;
const TRANSFORMS=['raw','yoy','diff'] as const;
const MAX_POINTS=600;
const DAILY_DEFAULT_DAYS=730;
const DIFF_VERSION='macro-diff/1';
const DAY_MS=86_400_000;
const dayShift=(d:string,days:number)=>new Date(Date.parse(`${d}T00:00:00Z`)+days*DAY_MS).toISOString().slice(0,10);

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireSessionUser();if(!auth.ok)return auth.response;
 const {id}=await params;
 const def=catalogById(id);
 if(!def)return errorResponse('unknown_series','series is not in the catalog',404);
 let q:{from?:string;to?:string;asOf?:string;transform:typeof TRANSFORMS[number]};
 try{
  const p=readParams(new URL(req.url),PARAMS);
  q={from:dateParam(p,'from'),to:dateParam(p,'to'),asOf:asOfParam(p),transform:enumParam(p,'transform',TRANSFORMS,'raw')};
  if(q.from&&q.to&&q.from>q.to)throw new ParamError('from');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 let source:MacroSeriesDef=def.aliasOf?(catalogById(def.aliasOf)??def):def;
 if(q.transform==='yoy'){
  const y=MACRO_CATALOG.find(d=>d.derive?.kind==='yoy_from_index'&&d.derive.from===source.id);
  if(!y)return errorResponse('invalid_parameter:transform','series declares no yoy derivation',400);
  source=y;
 }
 const provenance={publisher:source.source?.publisher??null,via:source.source?.via??null,fetch_host:source.source?.fetchHost??null,adapter:source.source?.adapter??null,
  series_key:source.source?.seriesKey??null,rights:source.source?.rights??null,attribution:source.source?.attribution??null,
  transform:source.derive?`${source.derive.kind}@1`:null,derived_from_series:source.derive?.from??null};
 // Task 14: detail extras (spec §3.3, §6). Inactive series have no observations, so their extras are empty.
 const empty={cycles:[],insufficient:[],events:[],calendar:[],assetsByCycle:[],eventsVersion:EVENTS_VERSION,cyclesVersion:CYCLES_VERSION};
 const exposed=process.env.MACRO_JUDGMENTS_ENABLED==='1'?def:(({weight:_w,...rest})=>rest)(def);
 const base={catalogVersion:CATALOG_VERSION,def:exposed,seriesRead:source.id,transform:q.transform,provenance};
 if(source.status!=='active')return okJson({...base,...empty,provenance:{...provenance,ancestors:[]},observations:[]});
 try{
  const deps=macroRouteDeps();
  const today=new Date().toISOString().slice(0,10);
  const anchor=q.to??q.asOf?.slice(0,10)??today;   // the implicit window never depends on the wall clock when the query names its own date
  const from=q.from??(source.period==='day'?dayShift(anchor,-DAILY_DEFAULT_DAYS):undefined);
  let rows:ObservationRow[];
  try{rows=await deps.db.seriesHistory(source.id,{from,to:q.to,asOf:q.asOf,maxRows:MAX_POINTS});}
  catch(e){if(e instanceof MacroDbError&&e.code==='truncated')return errorResponse('too_many_points',`more than ${MAX_POINTS} points; narrow from/to`,400);throw e;}
  type Out={observation_id:string|null;period_end:string;value_text:string;version:number|null;available_at:string;availability_basis:'first_seen'|null;retrieval_id:string|null;
   evidence_sha256:string|null;locator:ObservationRow['locator'];derived_from:string[]|null;transform:string|null;code_version:string|null;
   computed?:{kind:'diff';version:string;inputs:[string,string]}};
  let sources=rows;                                   // the stored rows the response is built from
  let computed:{cur:ObservationRow;prev:ObservationRow;value:string}[]=[];
  if(q.transform==='diff'){
   // One preceding eligible observation so the first requested period keeps its difference (T13-4), then trim to the range.
   let all=rows;
   if(from){
    const [before]=await deps.db.latestObservations([source.id],{asOf:q.asOf,periodEndLte:dayShift(from,-1)});
    if(before&&before.period_end<from)all=[before,...rows];
   }
   computed=all.slice(1).map((cur,i)=>({cur,prev:all[i],value:subtract(cur.value_text,all[i].value_text)}))
    .filter(c=>(!from||c.cur.period_end>=from)&&(!q.to||c.cur.period_end<=q.to));
   sources=[...new Map(computed.flatMap(c=>[c.prev,c.cur]).map(r=>[r.observation_id,r])).values()];
  }
  // Derived series (and diffs): the exact native ancestor versions behind the returned rows, one batched closure read (T13-2).
  let ancestors:Out[]=[];
  const closure=source.derive||q.transform==='diff'?await resolveClosure(deps.db,sources):new Map<string,ObservationRow>();
  const natives=[...closure.values()].filter(r=>r.retrieval_id!==null).sort((a,b)=>a.series_id<b.series_id?-1:a.series_id>b.series_id?1:a.period_end<b.period_end?-1:a.period_end>b.period_end?1:a.version-b.version);
  const sha=await shaOfRetrievals(deps.db,[...new Set([...rows,...natives].map(r=>r.retrieval_id).filter((x):x is string=>x!==null))]);
  const project=(r:ObservationRow):Out=>({observation_id:r.observation_id,period_end:r.period_end,value_text:r.value_text,version:r.version,available_at:r.available_at,
   availability_basis:r.availability_basis,retrieval_id:r.retrieval_id,evidence_sha256:r.retrieval_id?sha.get(r.retrieval_id)??null:null,locator:r.locator,
   derived_from:r.derived_from,transform:r.transform,code_version:r.code_version});
  ancestors=natives.map(r=>({...project(r),series_id:r.series_id}) as Out);
  const observations:Out[]=q.transform==='diff'
   ?computed.map(c=>({observation_id:null,period_end:c.cur.period_end,value_text:c.value,version:null,available_at:c.cur.available_at,availability_basis:c.cur.availability_basis,
     retrieval_id:null,evidence_sha256:null,locator:null,derived_from:null,transform:null,code_version:null,
     computed:{kind:'diff' as const,version:DIFF_VERSION,inputs:[c.prev.observation_id,c.cur.observation_id] as [string,string]}}))
   :rows.map(project);
  const extras=await seriesExtras(deps.db,def,{asOf:q.asOf});
  return okJson({...base,provenance:{...provenance,ancestors},...extras,observations});
 }catch(e){
  if(e instanceof MacroDbError&&e.code==='truncated')return errorResponse('input_truncated','series history exceeds the read limit',422);
  return failureResponse(e,'macro-series');
 }
}
