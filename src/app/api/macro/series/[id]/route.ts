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
import type {MacroSeriesDef,ObservationRow} from '@/lib/macro/types';

export const dynamic='force-dynamic';
const PARAMS=['from','to','asOf','transform'] as const;
const TRANSFORMS=['raw','yoy','diff'] as const;
const MAX_POINTS=600;
const DAILY_DEFAULT_DAYS=730;

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
 const base={catalogVersion:CATALOG_VERSION,def,seriesRead:source.id,transform:q.transform,provenance};
 if(source.status!=='active')return okJson({...base,...empty,observations:[]});
 try{
  const deps=macroRouteDeps();
  const today=new Date().toISOString().slice(0,10);
  const from=q.from??(source.period==='day'?new Date(Date.parse(`${q.to??today}T00:00:00Z`)-DAILY_DEFAULT_DAYS*86_400_000).toISOString().slice(0,10):undefined);
  let rows:ObservationRow[];
  try{rows=await deps.db.seriesHistory(source.id,{from,to:q.to,asOf:q.asOf,maxRows:MAX_POINTS});}
  catch(e){if(e instanceof MacroDbError&&e.code==='truncated')return errorResponse('too_many_points',`more than ${MAX_POINTS} points; narrow from/to`,400);throw e;}
  if(q.transform==='diff')rows=rows.slice(1).map((r,i)=>({...r,value_text:subtract(r.value_text,rows[i].value_text)}));
  const sha=await shaOfRetrievals(deps.db,[...new Set(rows.map(r=>r.retrieval_id).filter((x):x is string=>x!==null))]);
  const observations=rows.map(r=>({observation_id:r.observation_id,period_end:r.period_end,value_text:r.value_text,version:r.version,available_at:r.available_at,
   availability_basis:r.availability_basis,retrieval_id:r.retrieval_id,evidence_sha256:r.retrieval_id?sha.get(r.retrieval_id)??null:null,locator:r.locator,
   derived_from:r.derived_from,transform:r.transform}));
  const extras=await seriesExtras(deps.db,def,{asOf:q.asOf});
  return okJson({...base,...extras,observations});
 }catch(e){
  if(e instanceof MacroDbError&&e.code==='truncated')return errorResponse('input_truncated','series history exceeds the read limit',422);
  return failureResponse(e,'macro-series');
 }
}
