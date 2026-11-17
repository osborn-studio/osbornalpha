import type {SourceDrawerInput} from '@/components/research-ui/source-drawer/types';
/** A group has no single observation value or provenance. Exact refs remain in the transform slot. */
export function evidencePairInput(title:string):SourceDrawerInput {
 return {variant:'ok',payload:{
  kind:'macro_observation',identity:{id:'',label:title},
  source:{publisher:'',adapter:'',url:null,locator:null,evidence_sha256:null},
  times:{period:'',available_at:'',ingested_at:null},
  transform:{code_version:null,mapping_version:null,method_version:null},
  licence:{status:'',note_key:''},attribution_key:'',links:{module_href:'/macro?tab=methodology'},
 },extras:{title,mark:'fact'}};
}
