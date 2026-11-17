import {NextResponse} from 'next/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {PRESETS,PRESETS_VERSION} from '@/components/macro/correlation-presets';
import {prepareAnalysis} from '@/lib/macro/analysis-service';
import {dataHash,inputsHash,freezeInputs} from '@/lib/macro/analysis-spec';
import {CATALOG_VERSION,catalogById} from '@/lib/macro/catalog';
import {AnalysisError,CORRELATION_VERSION,type FrozenInputs} from '@/lib/macro/correlation';
import {MacroDbError} from '@/lib/macro/db';
import {EVENTS_VERSION} from '@/lib/macro/events';
import type {PresetCard,PresetsResponse} from '@/lib/macro/preset-contract';
import {presetRequestId} from '@/lib/macro/preset-request-id';
import {PresetsMemo} from '@/lib/macro/presets-memo';
import {requireSessionUser,macroRouteDeps,errorResponse} from '@/lib/macro/route-helpers';
export const dynamic='force-dynamic';
const memo=new PresetsMemo<PresetsResponse>();
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
 const auth=await requireSessionUser();if(!auth.ok)return auth.response;
 const params=new URL(req.url).searchParams;const region=params.get('region');
 if(params.getAll('region').length!==1||(region!=='US'&&region!=='CN'))return errorResponse('invalid_parameter:region','region must be US or CN',400);
 let cv:string|null;try{cv=resolveCodeVersion({allowGit:false});}catch{cv=null;}
 if(!cv)return errorResponse('code_version_unavailable','no verifiable code version; analysis not run',503);
 const codeVersion=cv;
 try{
  const {db}=macroRouteDeps();const snapshot=await db.activeSnapshot(region);
  if(!snapshot)return NextResponse.json({cards:[],reason:'no_published_snapshot'},{headers});
  const cutoff=snapshot.created_at;
  const key=[region,snapshot.snapshot_id,CATALOG_VERSION,CORRELATION_VERSION,EVENTS_VERSION,PRESETS_VERSION,codeVersion].join('|');
  const {value,hit}=await memo.get(key,async()=>{
   const computed_at=new Date().toISOString();
   const cards=await Promise.all(PRESETS.filter(p=>p.region===region).map(async(p):Promise<PresetCard>=>{
    const request_id=presetRequestId(p.id);const spec={...p.form,request_id};
    const base={preset_id:p.id,run_id:null,request_id,kind:spec.kind,spec,method_version:CORRELATION_VERSION,code_version:codeVersion,created_at:computed_at};
    try{
     const prepared=await prepareAnalysis({db},spec,{cutoff,codeVersion,history:'eligible_as_of'});
     return {...base,inputs:prepared.inputs,inputs_hash:prepared.inputs_hash,data_hash:prepared.data_hash,results:prepared.results,
      status:prepared.failure?'failed':'ok',error:prepared.failure?`${prepared.failure.code}: ${prepared.failure.message}`:null};
    }catch(e){
     // Missing/restricted catalog entries are failures, never replaced with another series.
     const indicator=catalogById(spec.indicator_id),asset=catalogById(spec.asset_id);
     const inputs:FrozenInputs=indicator&&asset?freezeInputs({indicator,asset,indicatorRows:[],assetRows:[],cutoff,catalogVersion:CATALOG_VERSION}):{
      indicator:{series_id:spec.indicator_id,source_series_id:indicator?.aliasOf??spec.indicator_id,change_kind:indicator?.changeKind??'pp',observations:[]},
      asset:{series_id:spec.asset_id,source_series_id:asset?.aliasOf??spec.asset_id,change_kind:asset?.changeKind??'pp',observations:[]},cutoff,catalog_version:CATALOG_VERSION};
     const error=e instanceof AnalysisError?`${e.code}: ${e.message}`:e instanceof MacroDbError&&e.code==='truncated'?'input_truncated':'read_failed';
     return {...base,inputs,inputs_hash:inputsHash(inputs),data_hash:dataHash(inputs),results:null,error,status:'failed'};
    }
   }));
   return {region,snapshot_id:snapshot.snapshot_id,cutoff,computed_at,code_version:codeVersion,method_version:CORRELATION_VERSION,presets_version:PRESETS_VERSION,catalog_version:CATALOG_VERSION,cards};
  },value=>!value.cards.some(card=>card.error==='read_failed'));
  return NextResponse.json(value,{headers:{...headers,'X-Macro-Presets-Memo':hit?'hit':'miss'}});
 }catch{return errorResponse('read_failed','macro presets could not be read',503);}
}
