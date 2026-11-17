// Topic spec §4.1 / §5.4 judgment references.
import {lifecycleOf} from '@/lib/judgments/display';
import {digestOf,missing,type EvidenceResolver,type Resolved} from '../resolve';
import type {EvidenceSources} from '../sources';
export function judgmentResolver(sources:EvidenceSources):EvidenceResolver<'judgment'>{
 return {kind:'judgment',code_version:'evidence-judgment/1',
  async resolve(refs,ctx){return Promise.all(refs.map(async ref=>{
   const item=await sources.judgments.judgment(ref.id);if(!item)return missing(ref,'not_found');
   const {envelope,method}=item,j=envelope.judgment;
   if(Date.parse(j.registered_at)>Date.parse(ref.as_of))return missing(ref,'not_yet_registered');
   if(!method?.publishable)return {...missing(ref,'method_not_publishable'),state:'withheld'};
   if(lifecycleOf(envelope)==='withdrawn')return {...missing(ref,'withdrawn'),state:'retracted'};
   const label={zh:method.title_zh,en:method.title_en},identity={id:ref.id,label:label[ctx.locale]};
   const fact={template:'topic.judgment_ref',slots:{method:`${j.methodology_id}@${j.methodology_version}`}};
   return {...missing(ref,''),state:'ok',reason:null,display:{label,fact,period:j.as_of,available_at:j.registered_at},
    drawer:{kind:'judgment',identity,source:{publisher:'OsbornAlpha',adapter:j.producer_kind,url:null,locator:`${j.methodology_id}@${j.methodology_version}`,evidence_sha256:method.formula_hash},
     times:{period:j.as_of,available_at:j.registered_at,ingested_at:j.created_at},transform:{code_version:j.code_version,mapping_version:null,method_version:j.methodology_version},
     licence:{status:'public',note_key:'judgments:method'},attribution_key:'judgments:method',links:{module_href:`/intel/methods/${j.methodology_id}/${j.methodology_version}`}},
    digest:digestOf(fact,identity)} satisfies Resolved;
  }));},
  async latestIdentity(ref){
   const item=await sources.judgments.judgment(ref.id);if(!item)return null;
   const base={object_id:ref.id,value:null,newer_period:null};
   if(!item.method?.publishable)return {...base,state:'withheld',reason:'method_not_publishable'};
   if(lifecycleOf(item.envelope)==='withdrawn')return {...base,state:'retracted',reason:'withdrawn'};
   return {...base,state:'ok',reason:null};
  },
 };
}
