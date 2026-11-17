// Shared read/freeze/compute path. Callers own authentication, idempotency and persistence.
import {freezeInputs,inputsHash,dataHash,validateAnalysisRequest} from './analysis-spec';
import {CATALOG_VERSION} from './catalog';
import {AnalysisError,runAnalysis,type AnalysisSpec,type AnalysisResult} from './correlation';
import type {MacroDb} from './db';
import {derivePolicyEvents,US_TARGET_UPPER_ID,US_TARGET_LOWER_ID,type PolicyEvent} from './events';
import {explainResult} from './explain';
import type {Bilingual} from './types';
export type AnalysisDeps={db:Pick<MacroDb,'seriesHistory'|'eligibleHistoryAsOf'>};
export async function prepareAnalysis(deps:AnalysisDeps,spec:AnalysisSpec,options:{cutoff:string;codeVersion:string;history:'as_of'|'eligible_as_of'}){
 const v=validateAnalysisRequest(spec);
 if(!v.ok)throw new AnalysisError('invalid_inputs',v.errors.map(e=>`${e.field}:${e.code}`).join(', '));
 const {indicator,asset}=v;const {cutoff,codeVersion,history}=options;
 const read=(id:string,maxRows:number)=>history==='as_of'
  ?deps.db.seriesHistory(id,{asOf:cutoff,maxRows})
  :deps.db.eligibleHistoryAsOf(id,{to:cutoff.slice(0,10),asOf:cutoff,maxRows});
 const [indicatorRows,assetRows]=await Promise.all([read(indicator.aliasOf??indicator.id,5000),read(asset.aliasOf??asset.id,5000)]);
 let events:PolicyEvent[]|undefined;
 if(spec.kind==='event_window'){
  const [upper,lower]=await Promise.all([read(US_TARGET_UPPER_ID,20000),read(US_TARGET_LOWER_ID,20000)]);
  events=derivePolicyEvents(upper,lower);
 }
 const inputs=freezeInputs({indicator,asset,indicatorRows,assetRows,events,cutoff,catalogVersion:CATALOG_VERSION});
 let results:(AnalysisResult&{explanation:Bilingual})|null=null;let failure:AnalysisError|null=null;
 try{const r=runAnalysis(spec,inputs,codeVersion);results={...r,explanation:explainResult(r,{indicator:indicator.name,asset:asset.name})};}
 catch(e){
  if(e instanceof AnalysisError)failure=e;
  else{console.error('[macro] analysis input invalid',e instanceof Error?e.message:String(e));failure=new AnalysisError('analysis_input_invalid','analysis inputs could not be computed');}
 }
 return {inputs,inputs_hash:inputsHash(inputs),data_hash:dataHash(inputs),results,failure};
}
