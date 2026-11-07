// src/lib/judgments/registry.ts
// The methodology registry (spec §4). REGISTRY lists every method module the system may register
// judgments with; Task 19 appends macroRegimeV1. Test-only methods (testing/*, e.g.
// synthetic_fact_metric@v1) are never listed. judgment_methodologies mirrors REGISTRY through
// scripts/judgments/sync-methodologies.ts; methodologyRowOf maps a module + its hashes (formula-hash.ts)
// to the row sync_methodology writes. No fs / typescript imports here: app code may import this file.
import type {Methodology,MethodologyRow} from './types';

export const REGISTRY:readonly Methodology[]=[];
export interface MethodologyHashes{doc_sha256:string;implementation_sha256:string;deps_sha256:string;formula_hash:string}
export type MethodologySyncRow=Omit<MethodologyRow,'created_at'|'synced_at'>;
export function upstreamOf(m:Pick<Methodology,'upstream'>):Record<string,string>{
 return Object.fromEntries(Object.entries(m.upstream??{}).filter((e):e is [string,string]=>typeof e[1]==='string'));
}
export function methodologyRowOf(m:Methodology,h:MethodologyHashes,meta:{publishable:boolean;code_version:string}):MethodologySyncRow{
 return {methodology_id:m.id,version:m.version,judgment_type:m.judgment_type,kind:m.kind,producer_kind:m.producer_kind,subject_types:[...m.subject_types],input_kinds:[...m.input_kinds],markets:m.markets?[...m.markets]:null,
  title_zh:m.title.zh,title_en:m.title.en,doc_path:m.doc,doc_sha256:h.doc_sha256,implementation_sha256:h.implementation_sha256,params:{...m.params},params_json:m.params_json?structuredClone(m.params_json):{},
  horizon:{...m.horizon},upstream:upstreamOf(m),deps_sha256:h.deps_sha256,formula_hash:h.formula_hash,status:m.status,publishable:meta.publishable,code_version:meta.code_version};
}
export function findMethodology(registry:readonly Methodology[],id:string,version:string):Methodology|null{
 return registry.find(m=>m.id===id&&m.version===version)??null;
}
