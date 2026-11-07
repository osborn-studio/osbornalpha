// src/lib/macro/analysis-spec.ts
// Request validation and input freezing for POST /api/macro/analyses (spec §7, §8, §0.2 M18/M22). ajv checks the
// shape, then the catalog decides which series may be paired. Frozen inputs keep only (observation_id,
// period_end, value_text), ascending, plus the series actually read. inputs_hash is the SHA-256 of canonical JSON
// (sorted keys). Server-only (node:crypto).
import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {catalogById} from './catalog';
import {EVENT_NS,WINDOWS,type AnalysisSpec,type FrozenInputs} from './correlation';
import type {PolicyEvent} from './events';
import type {MacroSeriesDef,ObservationRow} from './types';
const UUID='^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const validateShape=new Ajv({strict:true,allErrors:true}).compile({
 type:'object',additionalProperties:false,required:['request_id','kind','indicator_id','asset_id','lag','window'],
 properties:{
  request_id:{type:'string',pattern:UUID},
  kind:{type:'string',enum:['change','level','rolling','event_window']},
  indicator_id:{type:'string',minLength:1,maxLength:64},
  asset_id:{type:'string',minLength:1,maxLength:64},
  lag:{type:'integer',minimum:-12,maximum:12},
  window:{type:'string',enum:[...WINDOWS]},
  event_n:{type:'integer',enum:[...EVENT_NS]},
 },
});
export interface FieldError{field:string;code:string}
export type ValidatedRequest={ok:true;spec:AnalysisSpec;indicator:MacroSeriesDef;asset:MacroSeriesDef}|{ok:false;errors:FieldError[]};
export function validateAnalysisRequest(body:unknown):ValidatedRequest{
 if(!validateShape(body))return {ok:false,errors:(validateShape.errors??[]).map(e=>{
  const p=e.params as {missingProperty?:string;additionalProperty?:string};
  return {field:e.instancePath.replace(/^\//,'')||p.missingProperty||p.additionalProperty||'body',code:e.keyword};
 })};
 const spec=body as AnalysisSpec;const errors:FieldError[]=[];
 const ind=catalogById(spec.indicator_id),asset=catalogById(spec.asset_id);
 if(!ind||ind.role!=='indicator')errors.push({field:'indicator_id',code:'not_indicator'});
 else if(ind.status!=='active')errors.push({field:'indicator_id',code:'not_active'});
 else if(ind.period!=='month')errors.push({field:'indicator_id',code:'not_monthly'});
 if(!asset||asset.role!=='asset')errors.push({field:'asset_id',code:'not_asset'});
 else if(asset.status!=='active')errors.push({field:'asset_id',code:'not_active'});
 else if(asset.period!=='month')errors.push({field:'asset_id',code:'not_monthly'});
 if(spec.kind==='event_window'){
  if(spec.event_n===undefined)errors.push({field:'event_n',code:'required'});
  if(ind&&!(ind.region==='US'&&ind.type==='policy_rate'))errors.push({field:'indicator_id',code:'event_window_requires_us_policy_rate'});
  if(spec.lag!==0)errors.push({field:'lag',code:'must_be_zero_for_event_window'});
 }else if(spec.event_n!==undefined)errors.push({field:'event_n',code:'only_for_event_window'});
 if(errors.length||!ind||!asset)return {ok:false,errors};
 return {ok:true,spec,indicator:ind,asset};
}
const frozenObs=(rows:readonly ObservationRow[])=>rows.map(r=>({observation_id:r.observation_id,period_end:r.period_end,value_text:r.value_text})).sort((a,b)=>a.period_end.localeCompare(b.period_end));
export function freezeInputs(a:{indicator:MacroSeriesDef;asset:MacroSeriesDef;indicatorRows:readonly ObservationRow[];assetRows:readonly ObservationRow[];events?:readonly PolicyEvent[];cutoff:string;catalogVersion:string}):FrozenInputs{
 const inputs:FrozenInputs={
  indicator:{series_id:a.indicator.id,source_series_id:a.indicator.aliasOf??a.indicator.id,change_kind:a.indicator.changeKind,observations:frozenObs(a.indicatorRows)},
  asset:{series_id:a.asset.id,source_series_id:a.asset.aliasOf??a.asset.id,change_kind:a.asset.changeKind,observations:frozenObs(a.assetRows)},
  cutoff:a.cutoff,catalog_version:a.catalogVersion,
 };
 if(a.events)inputs.events=a.events.map(e=>({effective_date:e.effective_date,change_bp:e.change_bp,evidence:[...e.evidence]}));
 return inputs;
}
/** JSON with object keys sorted at every level; arrays keep their order; undefined members are dropped. */
export function canonicalJson(v:unknown):string{
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 const o=v as Record<string,unknown>;
 return `{${Object.keys(o).sort().filter(k=>o[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}
export const inputsHash=(inputs:FrozenInputs):string=>createHash('sha256').update(canonicalJson(inputs)).digest('hex');
