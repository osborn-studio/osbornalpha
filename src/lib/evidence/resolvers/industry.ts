// Topic spec §4.1 / §5.4 industry cells (X18).
import {DATASETS} from '../../dq/datasets';
import {parseIndustryId} from '../ref';
import {digestOf,missing,type EvidenceResolver,type Resolved} from '../resolve';
import type {EvidenceSources} from '../sources';
export function industryResolver(sources:EvidenceSources):EvidenceResolver<'industry_metric'>{
 return {kind:'industry_metric',code_version:'evidence-industry/1',
  async resolve(refs,ctx){return Promise.all(refs.map(async ref=>{
   const key=parseIndustryId(ref.id);if(!key)return missing(ref,'not_found');
   const cell=await sources.industry.cell(key);if(!cell)return missing(ref,'not_found');
   const {run,row,label}=cell,identity={id:ref.id,label:label[ctx.locale]};
   if(run.status==='building'||run.status==='failed'||!run.activated_at||Date.parse(run.activated_at)>Date.parse(ref.as_of))return missing(ref,'run_not_active');
   const isPublic=await sources.industry.datasetPublic(run.scheme,run.version);
   if(!isPublic&&ctx.audience==='public')return {...missing(ref,'unlicensed',label),state:'withheld',drawer:{kind:'industry_metric',identity,reason:'unlicensed'}};
   if(!row)return missing(ref,'not_found');
   if(row.status==='missing'||row.value_text===null)return missing(ref,row.missing_reason??'not_found');
   const fact={template:'topic.industry_value',slots:{industry:key.code,metric:key.metric,period:key.period_end,value:{value_text:row.value_text,unit:row.unit},n_with_data:String(row.n_with_data),n_members:String(row.n_members)}};
   return {...missing(ref,''),state:'ok',reason:null,basis:run.history_class,display:{label,fact,period:key.period_end,available_at:run.activated_at},
    drawer:{kind:'industry_metric',identity,source:{publisher:'OsbornAlpha industry aggregates',adapter:`${run.scheme} · gen ${run.generation}`,url:null,locator:`${key.code} · ${key.metric} · ${key.period_end}`,evidence_sha256:null},
     times:{period:key.period_end,available_at:run.activated_at,ingested_at:null},transform:{code_version:run.code_version,mapping_version:null,method_version:run.method_version},
     licence:{status:'public',note_key:`industry:dataset:${run.scheme}`},attribution_key:`industry:${run.scheme}`,links:{module_href:`/intel/industries/${key.code}?scheme=${run.scheme}`}},
    digest:digestOf(fact,identity),freshness:await sources.freshness(DATASETS.industry.aggregate(run.scheme),ctx.now),...(!isPublic?{admin_only:true as const}:{})} satisfies Resolved;
  }));},
  async latestIdentity(ref){
   const key=parseIndustryId(ref.id);if(!key)return null;
   const cell=await sources.industry.cell(key);if(!cell)return null;
   const {run}=cell,base={object_id:ref.id,value:null,newer_period:null};
   if(!await sources.industry.datasetPublic(run.scheme,run.version))return {...base,state:'withheld',reason:'unlicensed'};
   if(run.status==='building'||run.status==='failed'||!run.activated_at)return {...base,state:'missing',reason:'run_not_active'};
   const active=await sources.industry.activeCell(run.scheme,run.version,run.level,key);
   if(!active||active.value_text===null)return {...base,state:'missing',reason:'not_found'};
   const period=await sources.industry.latestPeriodEnd(run.scheme,run.version,run.level,key.code,key.metric);
   return {state:'ok',reason:null,object_id:`${active.run_id}:${key.code}:${key.metric}:${key.period_start}:${key.period_end}`,value:{value_text:active.value_text,unit:active.unit,period:key.period_end,available_at:active.activated_at},newer_period:period&&period>key.period_end?period:null};
  },
 };
}
