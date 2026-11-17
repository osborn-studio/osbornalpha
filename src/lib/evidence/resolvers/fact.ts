// Topic spec §4.1 / §5.4 financial facts behind the company gate (X19).
import {digestOf,missing,type EvidenceResolver,type Resolved} from '../resolve';
import type {EvidenceSources} from '../sources';
export function factResolver(sources:EvidenceSources):EvidenceResolver<'financial_fact'>{
 return {kind:'financial_fact',code_version:'evidence-fact/1',
  async resolve(refs,ctx){
   const infos=await sources.facts.facts(refs.map(r=>r.id));
   const rows=infos.map(i=>i.row).filter(r=>String(r.market)!=='HK');
   const publicGate=await sources.facts.eligibility(rows,{admin:false});
   const gate=ctx.audience==='admin'?await sources.facts.eligibility(rows,{admin:true}):publicGate;
   return Promise.all(refs.map(async ref=>{
    const info=infos.find(i=>i.row.fact_id===ref.id);if(!info)return missing(ref,'not_found');
    const {row,issuer,filing}=info,label=issuer.name,identity={id:row.fact_id,label:label[ctx.locale]};
    const blocked=(state:Resolved['state'],reason:string):Resolved=>({...missing(ref,reason,label),state,drawer:{kind:'financial_fact',identity,reason}});
    if(String(row.market)==='HK')return blocked('not_served','hk_not_served');
    if(row.status==='quarantined')return blocked('retracted','quarantined');
    if(row.status==='staged')return missing(ref,'not_found');
    if(row.available_date>new Date(ref.as_of).toISOString().slice(0,10))return missing(ref,'not_yet_available');
    const eligible=gate.get(row.fact_id);
    if(!eligible?.ok)return blocked('withheld',eligible?.reason??'evidence_incomplete');
    const fact={template:'topic.fact_value',slots:{company:label[ctx.locale],concept:row.concept,period:row.period_end,duration:row.duration,value:{value_text:row.value_text,unit:row.unit}}};
    return {...missing(ref,''),state:'ok',reason:null,display:{label,fact,period:row.period_end,available_at:row.available_date},
     drawer:{kind:'financial_fact',identity,source:{publisher:info.publisher,adapter:filing?.form_type??'',url:filing?.url??null,locator:`${row.concept} · ${row.source_concept}`,evidence_sha256:null},
      times:{period:row.period_end,available_at:row.available_date,ingested_at:row.created_at},transform:{code_version:null,mapping_version:row.mapping_version,method_version:null},
      licence:{status:'public',note_key:row.market==='US'?'facts:sec':'facts:cninfo'},attribution_key:row.market==='US'?'facts:sec':'facts:cninfo',links:{module_href:issuer.ticker?`/stock/${issuer.ticker}`:'/intel/companies'}},
     digest:digestOf(fact,identity),freshness:await sources.freshness(row.market==='US'?'facts.us':'facts.cn',ctx.now),
     ...(ctx.audience==='admin'&&!publicGate.get(row.fact_id)?.ok?{admin_only:true as const}:{})} satisfies Resolved;
   }));
  },
  async latestIdentity(ref){
   const [info]=await sources.facts.facts([ref.id]);if(!info)return null;
   const row=info.row,base={object_id:row.fact_id,value:null,newer_period:null};
   if(String(row.market)==='HK')return {...base,state:'missing',reason:'hk_not_served'};
   if(row.status==='quarantined')return {...base,state:'retracted',reason:'quarantined'};
   if(row.status!=='ok')return {...base,state:'missing',reason:'not_found'};
   const gate=(await sources.facts.eligibility([row],{admin:false})).get(row.fact_id);
   if(!gate?.ok)return {...base,state:'withheld',reason:gate?.reason??'evidence_incomplete'};
   const current=await sources.facts.current(row);if(!current)return {...base,state:'missing',reason:'not_found'};
   const eligible=(await sources.facts.eligibility([current],{admin:false})).get(current.fact_id);
   const period=await sources.facts.newerPeriodEnd(row);
   return {state:'ok',reason:null,object_id:current.fact_id,value:eligible?.ok&&current.status==='ok'?{value_text:current.value_text,unit:current.unit,period:current.period_end,available_at:current.available_date}:null,newer_period:period&&period>row.period_end?period:null};
  },
 };
}
