// src/lib/macro/strategy/transmission.ts
// Live transmission flow (spec 2026-11-07 §5.1, macro-transmission/1). buildTransmissionManifest freezes the two active
// snapshots, the latest value of every observed / derived node series (snapshot row first, else latestObservations asOf
// cutoff), the catalog projection, the P1 rules projection (playbook triggers), the playbook watch names and the requested
// region in params ({region}: each region is its own manifest identity). buildTransmission is a pure view over the stored
// manifest and reads the region from its params: observed → the 'node:<series>:latest' input; catalog
// missing / restricted → that state with the catalog reason; derived spread → exact a − b when both inputs share a
// period_end, else 'missing' with the reason; edges are always mechanism assumptions.
import {VERSIONS} from './contract';
import type {Bilingual,FrozenSeriesDef,NodeView,Region,Stage,StoredManifest,StrategyManifest,TransmissionView} from './contract';
import {PLAYBOOKS_V1} from './data/playbooks-v1';
import {TRANSMISSION_V1} from './data/transmission-v1';
import {frozenDef,inputRole,inputsWithRole,latestCutoff,manifestBuilder,readState,toObsRef} from './manifest';
import {subtract} from './numeric';
import type {PlaybookDef} from './playbooks';
import type {StrategyReadPort} from './port';

export type NodeDef=
 |{kind:'observed';id:string;seriesId:string}
 |{kind:'derived';id:string;op:'spread';a:string;b:string;unit:'pp';label:Bilingual}
 |{kind:'assumption';id:string;text:Bilingual}
 |{kind:'not_in_catalog';id:string;label:Bilingual;reason:Bilingual};
export interface StageDef{stage:Stage;label:Bilingual;nodes:NodeDef[];edgeToNext:{text:Bilingual}|null}
export const NODE_PURPOSE='node';
const NO_OBS:Bilingual={zh:'截止时无观测',en:'No observation at the cutoff'};
const TRUNCATED:Bilingual={zh:'读取被截断',en:'Read truncated'};
const NOT_IN_CATALOG:Bilingual={zh:'目录中没有该序列',en:'Series not in the catalog'};
const CATALOG_STATE:Record<'missing'|'restricted',Bilingual>={missing:{zh:'目录标记为缺失',en:'Marked missing in the catalog'},restricted:{zh:'目录标记为受限',en:'Marked restricted in the catalog'}};

/** Series actually read for a node series id: an asset view reads its aliasOf target. */
const readSeries=(d:FrozenSeriesDef)=>d.aliasOf??d.id;

/** The region frozen in a transmission manifest's params. */
export function regionParam(m:StrategyManifest):Region{
 const r=m.params.region;
 if(r!=='US'&&r!=='CN')throw new Error('invalid_manifest_params:region');
 return r;
}
export async function buildTransmissionManifest(port:StrategyReadPort,o:{now:Date;codeVersion:string;region:Region;stages?:Record<Region,StageDef[]>;playbooks?:readonly PlaybookDef[]}):Promise<StrategyManifest|null>{
 const stages=o.stages??TRANSMISSION_V1,playbooks=o.playbooks??PLAYBOOKS_V1;
 const snapshots={US:await port.activeSnapshot('US'),CN:await port.activeSnapshot('CN')};
 if(!snapshots.US&&!snapshots.CN)return null;   // page: "no published snapshot yet"
 const b=manifestBuilder(port,latestCutoff(snapshots,o.now));
 await b.useSnapshots(snapshots);
 const done=new Set<string>();
 const readNodeSeries=async(id:string)=>{
  const d=b.def(id);if(!d||d.status!=='active')return;
  const target=readSeries(d);b.def(target);
  if(done.has(target))return;done.add(target);
  await b.snapshotValue(target,NODE_PURPOSE);
 };
 for(const region of ['US','CN'] as const)for(const st of stages[region])for(const n of st.nodes){
  if(n.kind==='observed')await readNodeSeries(n.seriesId);
  else if(n.kind==='derived'){await readNodeSeries(n.a);await readNodeSeries(n.b);}
 }
 for(const p of playbooks)for(const id of p.watch)b.def(id);
 return b.build({kind:'transmission',params:{region:o.region},methodVersion:VERSIONS.transmission,codeVersion:o.codeVersion,extra:{rules:port.rules()}});
}

function latestInput(m:StrategyManifest,seriesId:string){return inputsWithRole(m,inputRole(NODE_PURPOSE,seriesId,'latest'))[0]??null;}
function observedNode(m:StrategyManifest,n:Extract<NodeDef,{kind:'observed'}>):NodeView{
 const d=frozenDef(m,n.seriesId);
 if(!d)return {id:n.id,state:'not_in_catalog',label:{zh:n.seriesId,en:n.seriesId},value_text:null,unit:null,period_end:null,inputs:[],reason:NOT_IN_CATALOG};
 const base={id:n.id,label:d.name,unit:d.unit};
 if(d.status!=='active')return {...base,state:d.status,value_text:null,period_end:null,inputs:[],reason:d.reason??CATALOG_STATE[d.status]};
 const target=readSeries(d);
 const i=latestInput(m,target);
 if(!i)return {...base,state:'missing',value_text:null,period_end:null,inputs:[],reason:readState(m,target,NODE_PURPOSE)==='truncated'?TRUNCATED:NO_OBS};
 return {...base,state:'observed',value_text:i.value_text,period_end:i.period_end,inputs:[toObsRef(i)],reason:null};
}
function derivedNode(m:StrategyManifest,n:Extract<NodeDef,{kind:'derived'}>):NodeView{
 const base={id:n.id,label:n.label,unit:n.unit,value_text:null,period_end:null};
 for(const id of [n.a,n.b]){
  const d=frozenDef(m,id);
  if(!d)return {...base,state:'missing',inputs:[],reason:{zh:`缺少输入：${id}（目录中没有该序列）`,en:`Missing input: ${id} (not in the catalog)`}};
  if(d.status==='restricted')return {...base,state:'restricted',inputs:[],reason:d.reason??CATALOG_STATE.restricted};
  if(d.status==='missing')return {...base,state:'missing',inputs:[],reason:d.reason??CATALOG_STATE.missing};
 }
 const a=latestInput(m,n.a),b=latestInput(m,n.b);
 if(!a||!b){
  const ids=[!a?n.a:null,!b?n.b:null].filter((x):x is string=>x!==null).join(', ');
  return {...base,state:'missing',inputs:[a,b].flatMap(x=>x?[toObsRef(x)]:[]),reason:{zh:`缺少输入：${ids}`,en:`Missing input: ${ids}`}};
 }
 if(a.period_end!==b.period_end)return {...base,state:'missing',inputs:[toObsRef(a),toObsRef(b)],
  reason:{zh:`两条输入数据期不同：${n.a}=${a.period_end}，${n.b}=${b.period_end}`,en:`Inputs have different periods: ${n.a}=${a.period_end}, ${n.b}=${b.period_end}`}};
 return {...base,state:'derived',value_text:subtract(a.value_text,b.value_text),period_end:a.period_end,inputs:[toObsRef(a),toObsRef(b)],reason:null};
}
export function nodeView(m:StrategyManifest,n:NodeDef):NodeView{
 switch(n.kind){
  case 'observed':return observedNode(m,n);
  case 'derived':return derivedNode(m,n);
  case 'assumption':return {id:n.id,state:'assumption',label:n.text,value_text:null,unit:null,period_end:null,inputs:[],reason:null};
  case 'not_in_catalog':return {id:n.id,state:'not_in_catalog',label:n.label,value_text:null,unit:null,period_end:null,inputs:[],reason:n.reason};
 }
}
export function buildTransmission(stored:StoredManifest,stages:Record<Region,StageDef[]>=TRANSMISSION_V1):TransmissionView{
 const m=stored.body;
 if(m.kind!=='transmission')throw new Error(`manifest_kind_mismatch:${m.kind}`);
 const region=regionParam(m);
 return {version:VERSIONS.transmission,region,manifest_id:stored.manifest_id,cutoff:m.cutoff,
  snapshots:{US:m.snapshots.US?.snapshot_id??null,CN:m.snapshots.CN?.snapshot_id??null},catalog_version:m.catalog_version,
  stages:stages[region].map(st=>({stage:st.stage,label:st.label,nodes:st.nodes.map(n=>nodeView(m,n)),edge:st.edgeToNext?{text:st.edgeToNext.text,kind:'assumption' as const}:null}))};
}
