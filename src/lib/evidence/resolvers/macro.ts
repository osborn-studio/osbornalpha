// Topic spec §4.1 / §5.4 macro observation resolution (X5).
import {digestOf,missing,type EvidenceResolver,type Resolved} from '../resolve';
import type {EvidenceSources} from '../sources';
export function macroResolver(sources:EvidenceSources):EvidenceResolver<'macro_observation'>{
 return {kind:'macro_observation',code_version:'evidence-macro/1',
  async resolve(refs,ctx){
   const rows=await sources.macro.rows(refs.map(r=>r.id));
   const retrievals=await sources.macro.retrievals([...new Set(rows.flatMap(r=>r.retrieval_id?[r.retrieval_id]:[]))]);
   return Promise.all(refs.map(async ref=>{
    const row=rows.find(r=>r.observation_id===ref.id);
    if(!row)return missing(ref,'not_found');
    if(ref.locator&&(ref.locator.series_id!==row.series_id||ref.locator.period_end!==row.period_end))return missing(ref,'locator_mismatch');
    const series=sources.macro.series(row.series_id);
    if(!series||series.status==='missing')return missing(ref,'catalog_missing');
    const label={zh:`${series.id} · ${series.name.zh}`,en:`${series.id} · ${series.name.en}`};
    const identity={id:row.observation_id,label:label[ctx.locale]};
    const blocked=(state:Resolved['state'],reason:string):Resolved=>({...missing(ref,reason,label),state,drawer:{kind:'macro_observation',identity,reason}});
    if(row.status!=='ok')return blocked('retracted',row.status);
    if(Date.parse(row.available_at)>Date.parse(ref.as_of))return blocked('missing','not_yet_available');
    const restriction=series.status==='restricted'?'catalog_restricted':series.rights==='third_party'?'licence_unconfirmed':null;
    if(restriction&&ctx.audience==='public')return blocked('withheld',restriction);
    const fact={template:'topic.macro_level',slots:{series:series.id,period:row.period_end,value:{value_text:row.value_text,unit:series.unit}}};
    const retrieval=row.retrieval_id?retrievals.get(row.retrieval_id):undefined;
    return {...missing(ref,'',label),state:'ok',reason:null,display:{label,fact,period:row.period_end,available_at:row.available_at},
     drawer:{kind:'macro_observation',identity,source:{publisher:series.publisher[ctx.locale],adapter:series.adapter,url:retrieval?.fetch_url??null,locator:row.locator?JSON.stringify(row.locator):null,evidence_sha256:retrieval?.sha256??null},
      times:{period:row.period_end,available_at:row.available_at,ingested_at:row.ingested_at},transform:{code_version:row.code_version,mapping_version:null,method_version:null},
      licence:{status:series.rights,note_key:`macro:rights:${series.rights}`},attribution_key:'macro:attribution',links:{module_href:`/macro/${series.id}`}},
     digest:digestOf(fact,identity),freshness:await sources.freshness(series.dataset,ctx.now),...(restriction?{admin_only:true as const}:{})} satisfies Resolved;
   }));
  },
  async latestIdentity(ref){
   const [row]=await sources.macro.rows([ref.id]);if(!row)return null;
   const base={object_id:row.observation_id,value:null,newer_period:null};
   if(row.status!=='ok')return {...base,state:'retracted',reason:row.status};
   const series=sources.macro.series(row.series_id);
   if(!series||series.status==='missing')return {...base,state:'missing',reason:'catalog_missing'};
   if(series.status==='restricted'||series.rights==='third_party')return {...base,state:'withheld',reason:series.status==='restricted'?'catalog_restricted':'licence_unconfirmed'};
   const latest=(await sources.macro.versions(row.series_id,row.period_end)).filter(r=>r.status==='ok').sort((a,b)=>b.version-a.version)[0];
   if(!latest)return {...base,state:'missing',reason:'not_found'};
   const period=await sources.macro.latestPeriodEnd(row.series_id);
   return {state:'ok',reason:null,object_id:latest.observation_id,value:{value_text:latest.value_text,unit:series.unit,period:latest.period_end,available_at:latest.available_at},newer_period:period&&period>row.period_end?period:null};
  },
 };
}
