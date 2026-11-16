// src/lib/macro/strategy/policy-response.ts
// Fed policy → US/China asset response matrix (spec 2026-11-07 §5.3, macro-policy-response/1). Descriptive statistics of
// event windows, never a forecast.
// - anchor: the merged US policy events frozen in the manifest (§5.4); direction = sign(change_bp).
// - window N ∈ {1,3,6}: event month m → base = month end of m−1, end = month end of m+N−1 (exactly N month-end intervals,
//   effective month included). 2022-03-16, N=3 → base 2022-02 month end, end 2022-05 month end.
// - change: pct = (end/base − 1) × 100 (base ≤ 0 → non_positive_base); bp = toBp(end − base), exact. A spread endpoint is
//   the exact difference of the two same-month inputs and carries both input observations.
// - eligibility per dimension and N: both endpoints present (else missing_endpoint) and every month end in between present
//   (else incomplete_window). Independence: eligible events sorted by effective date and scanned ACROSS directions; windows
//   are CLOSED month ranges [m−1, m+N−1], so an event whose base month is on or before the last selected end month
//   (base ≤ lastEnd, a shared endpoint month included) is excluded as overlap. P2 differs: one asset, one direction per set.
// - cell: n ≥ 5 → median and type-7 quartiles (full precision, *_raw); 1 ≤ n < 5 → events only; n = 0 → insufficient.
//   QE/QT row: missing (no Fed balance-sheet series in the catalog). Restricted / missing catalog rows → whole column state.
// buildPolicyResponseManifest freezes the events, every dimension's monthly history asOf cutoff, the catalog projection and
// the window N and the complete dimension definitions in params ({window, dims}); buildPolicyResponse reads both from the
// manifest and nothing else (no caller override), so each N and each dimension set is its own manifest identity.
// pct change_text is the exact ratio '<end>/<base>' (rounded once at display).
// Event and dimension histories load concurrently.
import {VERSIONS} from './contract';
import {canonicalJson} from './hash';
import type {Bilingual,Cell,EndpointRef,EventRow,ExclusionReason,ObsRef,PolicyResponseView,ResponseDim,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {RESPONSE_DIMS_V1,type ResponseDimDef} from './data/response-dims-v1';
import {addMonthsYm,frozenDef,inputRole,inputsWithRole,latestCutoff,manifestBuilder,monthOf,readState,toObsRef} from './manifest';
import {pctChange,pctRatio,quartiles,sign,subtract,toBp} from './numeric';
import {EVENTS_PURPOSE,readPolicyEvents} from './policy-events';
import {responseSentences} from './policy-response-explain';
import type {StrategyReadPort} from './port';

export const DIM_PURPOSE='dim';
export const RESPONSE_WINDOWS=[1,3,6] as const;
export const MIN_STATS_N=5;
const QE_QT_MISSING:Bilingual={zh:'目录无联储资产负债表序列',en:'No Fed balance-sheet series in the catalog'};
const HISTORY_TRUNCATED:Bilingual={zh:'历史读取被截断（history_truncated）',en:'History read truncated (history_truncated)'};
const EVENTS_TRUNCATED:Bilingual={zh:'政策事件序列读取被截断',en:'Policy event source read truncated'};
const NOT_IN_CATALOG:Bilingual={zh:'目录中没有该序列',en:'Series not in the catalog'};
const CATALOG_STATE:Record<'missing'|'restricted',Bilingual>={missing:{zh:'目录标记为缺失',en:'Marked missing in the catalog'},restricted:{zh:'目录标记为受限',en:'Marked restricted in the catalog'}};
const dimSeries=(d:ResponseDimDef):string[]=>d.kind==='series'?[d.series!]:d.kind==='spread'?[d.a!,d.b!]:[];

/** The window N frozen in a policy_response manifest's params. */
export function windowParam(m:StrategyManifest):1|3|6{
 const w=m.params.window;
 if(w!==1&&w!==3&&w!==6)throw new Error('invalid_manifest_params:window');
 return w;
}
/** The dimension definitions frozen in a policy_response manifest's params (canonical JSON text, hashed with the body). */
export function dimsParam(m:StrategyManifest):readonly ResponseDimDef[]{
 const t=m.params.dims;
 if(typeof t!=='string')throw new Error('invalid_manifest_params:dims');
 let v:unknown;
 try{v=JSON.parse(t);}catch{throw new Error('invalid_manifest_params:dims');}
 if(!Array.isArray(v)||v.some(d=>!d||typeof d!=='object'||typeof d.id!=='string'||(d.unit!=='pct'&&d.unit!=='bp')||!['series','spread','not_in_catalog'].includes(d.kind)))throw new Error('invalid_manifest_params:dims');
 return v as ResponseDimDef[];
}
export async function buildPolicyResponseManifest(port:StrategyReadPort,o:{now:Date;codeVersion:string;window:1|3|6;dims?:readonly ResponseDimDef[];snapshots?:{US:import('./contract').SnapshotRecord|null;CN:import('./contract').SnapshotRecord|null}}):Promise<StrategyManifest>{
 const dims=o.dims??RESPONSE_DIMS_V1;
 const pair=o.snapshots?null:await Promise.all([port.activeSnapshot('US'),port.activeSnapshot('CN')]);
 const snapshots=o.snapshots??{US:pair![0],CN:pair![1]};
 const b=manifestBuilder(port,latestCutoff(snapshots,o.now));
 await b.useSnapshots(snapshots,{loadRows:false});
 const done=new Set<string>();
 const histories:Promise<unknown>[]=[];
 for(const d of dims)for(const id of dimSeries(d)){
  const def=b.def(id);
  if(!def||def.status!=='active'||done.has(id))continue;
  done.add(id);histories.push(b.history(id,DIM_PURPOSE,'month_end'));
 }
 const [{events,gaps}]=await Promise.all([readPolicyEvents(b),...histories]);
 return b.build({kind:'policy_response',params:{window:o.window,dims:canonicalJson(dims)},methodVersion:VERSIONS.response,codeVersion:o.codeVersion,extra:{events,gaps}});
}

type Point={period_end:string;value_text:string;inputs:ObsRef[]};
type DimData={blocked:Exclude<Cell,{status:'stats'|'events_only'|'insufficient'}>|null;kind:ResponseDim['kind'];points:Map<string,Point>};
function dimData(m:StrategyManifest,d:ResponseDimDef):DimData{
 const none=new Map<string,Point>();
 if(d.kind==='not_in_catalog')return {blocked:{status:'not_in_catalog',reason:d.reason??NOT_IN_CATALOG},kind:'not_in_catalog',points:none};
 for(const id of dimSeries(d)){
  const def=frozenDef(m,id);
  if(!def)return {blocked:{status:'not_in_catalog',reason:NOT_IN_CATALOG},kind:'not_in_catalog',points:none};
  if(def.status==='restricted')return {blocked:{status:'restricted',reason:def.reason??CATALOG_STATE.restricted},kind:'restricted',points:none};
  if(def.status==='missing')return {blocked:{status:'missing',reason:def.reason??CATALOG_STATE.missing},kind:d.kind,points:none};
  if(readState(m,id,DIM_PURPOSE)==='truncated')return {blocked:{status:'missing',reason:HISTORY_TRUNCATED},kind:d.kind,points:none};
 }
 if(m.reads.some(r=>r.purpose===EVENTS_PURPOSE&&r.state==='truncated'))return {blocked:{status:'missing',reason:EVENTS_TRUNCATED},kind:d.kind,points:none};
 const byMonth=(id:string)=>new Map(inputsWithRole(m,inputRole(DIM_PURPOSE,id,'month_end')).map(i=>[monthOf(i.period_end),i]));
 const points=new Map<string,Point>();
 if(d.kind==='series'){for(const [ym,i] of byMonth(d.series!))points.set(ym,{period_end:i.period_end,value_text:i.value_text,inputs:[toObsRef(i)]});}
 else{
  const a=byMonth(d.a!),b=byMonth(d.b!);
  for(const [ym,x] of a){const y=b.get(ym);if(y)points.set(ym,{period_end:x.period_end,value_text:subtract(x.value_text,y.value_text),inputs:[toObsRef(x),toObsRef(y)]});}
 }
 return {blocked:null,kind:d.kind,points};
}
const endpoint=(p:Point|undefined):EndpointRef|null=>p?{period_end:p.period_end,value_text:p.value_text,inputs:p.inputs}:null;
interface Scored{row:EventRow;dir:'hike'|'cut';baseM:string;endM:string}
function scoreEvent(e:StrategyPolicyEvent,unit:'pct'|'bp',points:Map<string,Point>,window:number):Scored{
 const m0=monthOf(e.effective_date),baseM=addMonthsYm(m0,-1),endM=addMonthsYm(m0,window-1);
 const base=points.get(baseM),end=points.get(endM);
 const dir=sign(e.change_bp)>0?'hike':'cut';
 const row=(exclusion:ExclusionReason|null,change_raw:number|null,change_text:string|null):EventRow=>
  ({effective_date:e.effective_date,change_bp:e.change_bp,basis:e.basis,base:endpoint(base),end:endpoint(end),change_raw,change_text,selected:false,exclusion});
 if(!base||!end)return {row:row('missing_endpoint',null,null),dir,baseM,endM};
 for(let k=1;k<window;k++)if(!points.has(addMonthsYm(baseM,k)))return {row:row('incomplete_window',null,null),dir,baseM,endM};
 if(unit==='pct'){
  if(sign(base.value_text)<=0)return {row:row('non_positive_base',null,null),dir,baseM,endM};
  return {row:row(null,pctChange(end.value_text,base.value_text),pctRatio(end.value_text,base.value_text)),dir,baseM,endM};
 }
 const text=toBp(subtract(end.value_text,base.value_text));
 return {row:row(null,Number(text),text),dir,baseM,endM};
}
function directionCell(unit:'pct'|'bp',rows:EventRow[]):Cell{
 const sel=rows.filter(r=>r.selected).map(r=>r.change_raw as number);
 if(sel.length>=MIN_STATS_N){const q=quartiles(sel);return {status:'stats',n:sel.length,median_raw:q.median,q1_raw:q.q1,q3_raw:q.q3,unit,events:rows};}
 if(sel.length>0)return {status:'events_only',n:sel.length,unit,events:rows};
 return {status:'insufficient',unit,events:rows};
}
export function buildPolicyResponse(stored:StoredManifest):PolicyResponseView{
 const m=stored.body;
 if(m.kind!=='policy_response')throw new Error(`manifest_kind_mismatch:${m.kind}`);
 const window=windowParam(m),dims=dimsParam(m);
 const events=(m.events??[]).filter(e=>sign(e.change_bp)!==0).sort((a,b)=>a.effective_date<b.effective_date?-1:a.effective_date>b.effective_date?1:0);
 const viewDims:ResponseDim[]=[];
 const cells:Record<'hike'|'cut'|'qe_qt',Record<string,Cell>>={hike:{},cut:{},qe_qt:{}};
 for(const d of dims){
  const data=dimData(m,d);
  const keys=[...data.points.keys()].sort();
  viewDims.push({id:d.id,label:d.label,unit:d.unit,kind:data.kind,...(d.series?{series:d.series}:{}),...(d.a?{a:d.a,b:d.b}:{}),
   coverage:{from:keys.length?data.points.get(keys[0])!.period_end:null,to:keys.length?data.points.get(keys[keys.length-1])!.period_end:null}});
  if(data.blocked){cells.hike[d.id]=data.blocked;cells.cut[d.id]=data.blocked;cells.qe_qt[d.id]=data.blocked;continue;}
  const scored=events.map(e=>scoreEvent(e,d.unit,data.points,window));
  let lastEnd:string|null=null;
  for(const s of scored){
   if(s.row.exclusion)continue;
   if(lastEnd!==null&&s.baseM<=lastEnd){s.row.exclusion='overlap';continue;}   // closed month ranges: a shared endpoint month overlaps
   s.row.selected=true;lastEnd=s.endM;
  }
  for(const dir of ['hike','cut'] as const)cells[dir][d.id]=directionCell(d.unit,scored.filter(s=>s.dir===dir).map(s=>s.row));
  cells.qe_qt[d.id]={status:'missing',reason:QE_QT_MISSING};
 }
 const rows:PolicyResponseView['rows']=[{direction:'hike',cells:cells.hike},{direction:'cut',cells:cells.cut},{direction:'qe_qt',cells:cells.qe_qt}];
 return {version:VERSIONS.response,window,manifest_id:stored.manifest_id,cutoff:m.cutoff,dims:viewDims,rows,sentences:responseSentences({window,dims:viewDims,rows})};
}
