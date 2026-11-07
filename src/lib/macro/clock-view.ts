// Frozen regime projection and reconciliation (P5 draft 8 §§3.3–3.4). Pure; rules are lookup only.
import type {ObservationRow,SnapshotRecord,RegimeRecord,Region,RegimeContribution} from './types';
import type {Regime} from './judgment-contract';
import type {ClockView,ClockMeta,ClockDiagnostic,ClockStatus,RegimeStatus,F4Match,MethodManifest,ClockObs,ClockRow,DisplayRow,QuadrantView} from './clock-contract';
import {CLOCK_VIEW_VERSION} from './clock-contract';
import {RULES,RULES_VERSION,METHODOLOGY_VERSION,regionWeights,pickStates} from './regime';
import {CATALOG_VERSION,catalogById} from './catalog';
import {changeOf} from './views';
import {shiftMonthEnd} from './periods';
import {REGIMES} from './judgment-contract';
export interface ClockInput{snapshot:SnapshotRecord;observations:ObservationRow[];regimeRecord:(RegimeRecord&{method_manifest?:MethodManifest|null})|null;f4:()=>Promise<F4Match>;now?:string}
export type GateResult={ok:true}|{ok:false;status:'version_unsupported'|'integrity_error'|'record_missing';diagnostics:ClockDiagnostic[]};
const pass=():GateResult=>({ok:true});
const reject=(status:Exclude<GateResult,{ok:true}>['status']):GateResult=>({ok:false,status,diagnostics:[]});
const r6=(x:number)=>Math.round(x*1e6)/1e6;
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
const zero=():Record<Regime,number>=>({recovery:0,overheat:0,stagflation:0,recession:0});
const support=(c:RegimeContribution,q:Regime)=>c.support[q]??0;
const obsDto=(o:ObservationRow):ClockObs=>({observation_id:o.observation_id,period_end:o.period_end,value_text:o.value_text,version:o.version});
const ordered=(a:ObservationRow,b:ObservationRow)=>a.period_end.localeCompare(b.period_end)||a.version-b.version;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function bySeries(observations:ObservationRow[]):Map<string,ObservationRow[]>{
 const out=new Map<string,ObservationRow[]>();for(const o of observations){const a=out.get(o.series_id)??[];a.push(o);out.set(o.series_id,a);}for(const a of out.values())a.sort(ordered);return out;
}
function roles(a:ObservationRow[]):{latest:ObservationRow|null;prev:ObservationRow|null;prev3m:ObservationRow|null;valid:boolean}{
 const latest=a.at(-1)??null;if(!latest)return {latest:null,prev:null,prev3m:null,valid:true};
 const rest=a.slice(0,-1),prev=rest.at(-1)??null,prev3m=rest.find(x=>x.period_end===shiftMonthEnd(latest.period_end,-3))??null;
 return {latest,prev,prev3m,valid:rest.every(x=>x===prev||x===prev3m)};
}
export function gateSnapshot(snapshot:SnapshotRecord):GateResult{
 return snapshot.catalog_version===CATALOG_VERSION&&snapshot.methodology_version===METHODOLOGY_VERSION?pass():reject('version_unsupported');
}
export function gateObservations(snapshot:SnapshotRecord,observations:ObservationRow[]):GateResult{
 const by=bySeries(observations);
 return observations.length===snapshot.observation_ids.length&&new Set(observations.map(x=>x.observation_id)).size===observations.length&&!observations.some(o=>!snapshot.observation_ids.includes(o.observation_id))&&![...by.values()].some(a=>a.length>3||new Set(a.map(x=>x.period_end)).size!==a.length||!roles(a).valid)?pass():reject('integrity_error');
}
export function gateRecord(rec:ClockInput['regimeRecord']):GateResult{
 return !rec?reject('record_missing'):rec.rules_version!==RULES_VERSION?reject('version_unsupported'):pass();
}
/** Checks storage without evaluating any rule predicate. Invariant order is part of the contract. */
export function reconcileStorage(args:{region:Region;observations:ObservationRow[];rec:RegimeRecord&{method_manifest?:MethodManifest|null};snapshotCatalogVersion?:string}):{ok:true;matchedWeight:number;n:number}|{ok:false;diagnostics:ClockDiagnostic[]}{
 const {region,observations,rec}=args,W=regionWeights(region),D=sum(Object.values(W)),C=rec.contributions,by=bySeries(observations),byId=new Map(observations.map(x=>[x.observation_id,x])),seen=new Set<string>();
 const fail=(n:number,ids:string[],delta?:number):{ok:false;diagnostics:ClockDiagnostic[]}=>{console.error('[macro-clock] reconcile',{snapshot_id:rec.snapshot_id,invariant:n,delta,ids});return {ok:false,diagnostics:[{code:`invariant_${n}`,ids}]};};
 for(const c of C){const def=catalogById(c.series_id),o=byId.get(c.observation_id),latest=by.get(c.series_id)?.at(-1);
  if(seen.has(c.series_id)||!Object.hasOwn(W,c.series_id)||def?.status!=='active'||!o||o.series_id!==c.series_id||o.observation_id!==latest?.observation_id)return fail(1,[c.series_id,c.observation_id]);seen.add(c.series_id);
 }
 for(const c of C){if(c.weight!==W[c.series_id]||REGIMES.some(q=>c.contribution[q]!==r6(c.weight*support(c,q))))return fail(2,[c.series_id]);}
 const matchedWeight=sum(C.map(c=>c.weight));
 if(matchedWeight+rec.uncovered_weight!==D||(rec.regime!==null&&rec.regime.coverage!==r6(matchedWeight/D)))return fail(4,[]);
 for(const c of C){const type=catalogById(c.series_id)?.type,rule=type?RULES[type].find(r=>r.id===c.rule_id):null;
  if(!rule||REGIMES.some(q=>(rule.support[q]??0)!==support(c,q)))return fail(8,[c.series_id,c.rule_id]);
 }
 const m=rec.method_manifest;
 if(m){
  const expected=[...Object.keys(W),...by.keys()].filter((id,i,a)=>a.indexOf(id)===i),rowIds=m.rows.map(r=>r.series_id);
  if(m.version!=='macro-method-manifest/1'||m.weights_version!==METHODOLOGY_VERSION||m.rules_version!==rec.rules_version||m.catalog_version!==(args.snapshotCatalogVersion??CATALOG_VERSION)||m.denominator!==D||new Set(rowIds).size!==rowIds.length||!same([...rowIds].sort(),expected.sort()))return fail(9,rowIds);
  const contrib=new Map(C.map(c=>[c.series_id,c]));
  for(const row of m.rows){const id=row.series_id,def=catalogById(id),a=by.get(id)??[],r=roles(a),scored=Object.hasOwn(W,id),hit=contrib.get(id);
   const state=def?.status==='missing'?'missing':def?.status==='restricted'?'restricted':hit?'matched':a.length?'not_matched':'no_data';
   if(!def||def.role!=='indicator'||row.display_only===scored||row.weight!==(scored?W[id]:0)||row.type!==def.type||row.unit!==def.unit||row.change_kind!==def.changeKind||!same(row.name,def.name)||!same(row.reason,def.reason??null)||row.state!==state||row.matched!==Boolean(hit)||row.latest_observation_id!==r.latest?.observation_id&&row.latest_observation_id!==null||row.prev_observation_id!==r.prev?.observation_id&&row.prev_observation_id!==null||row.prev3m_observation_id!==r.prev3m?.observation_id&&row.prev3m_observation_id!==null)return fail(9,[id]);
   if(row.latest_observation_id!==(state==='missing'||state==='restricted'?null:r.latest?.observation_id??null)||row.prev_observation_id!==(state==='missing'||state==='restricted'?null:r.prev?.observation_id??null)||row.prev3m_observation_id!==(state==='missing'||state==='restricted'?null:r.prev3m?.observation_id??null))return fail(9,[id]);
   if(hit){if(row.rule_id!==hit.rule_id||!row.support||!row.contribution||REGIMES.some(q=>row.support![q]!==support(hit,q)||row.contribution![q]!==hit.contribution[q]))return fail(9,[id]);}
   else if(row.rule_id!==null||row.support!==null||row.contribution!==null)return fail(9,[id]);
   if(!scored&&(row.matched||row.rule_id!==null||row.support!==null||row.contribution!==null))return fail(9,[id]);
  }
 }
 const R=rec.regime;if(R){const tol=(C.length+1)/1e6,S=zero();for(const c of C)for(const q of REGIMES)S[q]+=c.contribution[q];
  for(const q of REGIMES)if(Math.abs(S[q]-R.scores[q])>tol)return fail(3,[q],S[q]-R.scores[q]);
  const total=sum(REGIMES.map(q=>S[q]));if(total<=0)return fail(5,[]);
  const N=zero();for(const q of REGIMES)N[q]=S[q]/total;
  const p=pickStates(N);if(REGIMES.some(q=>Math.abs(r6(N[q])-R.norm[q])>2e-6)||p.primary!==R.primary_state||p.secondary!==R.secondary_state||Math.abs(r6(100*(N[p.primary]-(p.secondary?N[p.secondary]:0)))-R.margin_pp)>1e-4)return fail(5,[]);
  const growth={num:0,w:0},inflation={num:0,w:0};for(const c of C){const type=catalogById(c.series_id)?.type,s=(q:Regime)=>support(c,q);
   if(type==='pmi'||type==='labor_rate'||type==='growth_yoy'){growth.num+=c.weight*(s('recovery')+s('overheat')-s('stagflation')-s('recession'));growth.w+=c.weight;}
   if(type==='inflation_yoy'){inflation.num+=c.weight*(s('overheat')+s('stagflation')-s('recovery')-s('recession'));inflation.w+=c.weight;}
  }
  if(R.growth_axis!==(growth.w?r6(growth.num/growth.w):null)||R.inflation_axis!==(inflation.w?r6(inflation.num/inflation.w):null))return fail(6,[]);
 }
 return {ok:true,matchedWeight,n:C.length};
}
export function regimeStatusOf(rec:RegimeRecord|null,region:Region,storageOk:boolean):RegimeStatus{
 if(!rec||!storageOk)return 'unknown';if(rec.regime)return 'classified';const D=sum(Object.values(regionWeights(region)));return (D-rec.uncovered_weight)/D<.6?'coverage_below_threshold':'zero_score';
}
export function clockMeta(snapshot:SnapshotRecord,rec:RegimeRecord|null,status:ClockStatus,diagnostics:ClockDiagnostic[],f4?:F4Match):ClockMeta{
 const meta:ClockMeta['f4']={judgment_id:null,lifecycle:null,abstain_reason:null,earlier_snapshot_id:null,methodology_version:null};
 if(f4?.status==='earlier'){meta.judgment_id=f4.judgment_id;meta.earlier_snapshot_id=f4.earlier_snapshot_id;}
 if(f4?.status==='ineligible'){meta.judgment_id=f4.judgment_id;meta.lifecycle=f4.lifecycle;meta.abstain_reason=f4.abstain_reason;}
 if(f4?.status==='card'){meta.judgment_id=f4.judgment_id;meta.lifecycle=f4.card.lifecycle;meta.methodology_version=f4.card.methodology.version;}
 return {version:CLOCK_VIEW_VERSION,status,snapshot:{id:snapshot.snapshot_id,region:snapshot.region,as_of:snapshot.as_of,created_at:snapshot.created_at,catalog_version:snapshot.catalog_version,methodology_version:snapshot.methodology_version,rules_version:rec?.rules_version??null},regime_status:regimeStatusOf(rec,snapshot.region,status!=='reconcile_failed'),f4:meta,diagnostics};
}
const decimal=/^-?\d+(\.\d+)?$/;
function project(input:ClockInput,matchedWeight:number,n:number){
 const {snapshot,observations}=input,rec=input.regimeRecord!,R=rec.regime!,W=regionWeights(snapshot.region),by=bySeries(observations),C=new Map(rec.contributions.map(c=>[c.series_id,c]));
 const rows:ClockRow[]=Object.entries(W).map(([id,weight])=>{
  const def=catalogById(id)!,a=by.get(id)??[],m=rec.method_manifest?.rows.find(r=>r.series_id===id),c=C.get(id),state=m?.state??(def.status==='missing'?'missing':def.status==='restricted'?'restricted':c?'matched':a.length?'not_matched':'no_data'),rr=roles(a),latest=state==='missing'||state==='restricted'?null:rr.latest;
  const comparisons=latest?a.slice(0,-1).map(o=>({ ...obsDto(o),roles:[...(o===rr.prev?['prev' as const]:[]),...(o===rr.prev3m?['prev3m' as const]:[])]})):[];
  const prev=rr.prev,rule=c&&def.type?RULES[def.type].find(x=>x.id===c.rule_id):null,ruleSupport=zero();if(rule)for(const q of REGIMES)ruleSupport[q]=rule.support[q]??0;
  return {series_id:id,name:m?.name??def.name,type:def.type!,unit:m?.unit??def.unit,change_kind:m?.change_kind??def.changeKind,weight,state,latest:latest?obsDto(latest):null,comparisons,inputs_present:{prev:comparisons.some(x=>x.roles.includes('prev')),prev3m:comparisons.some(x=>x.roles.includes('prev3m'))},display_change:latest&&prev&&decimal.test(latest.value_text)&&decimal.test(prev.value_text)?changeOf(def.changeKind,latest.value_text,prev.value_text):null,rule:rule?{id:rule.id,label:rule.label,support:ruleSupport}:null,contribution:m?.contribution??c?.contribution??null,reason:m?.reason??def.reason??null};
 });
 const display_only_rows:DisplayRow[]=(rec.method_manifest?.rows??[]).filter(r=>r.display_only).map(r=>({series_id:r.series_id,name:r.name,unit:r.unit,latest:r.latest_observation_id?obsDto(observations.find(o=>o.observation_id===r.latest_observation_id)!):null}));
 const quadrants:QuadrantView[]=REGIMES.map(q=>({regime:q,score:R.scores[q],norm:R.norm[q],rank:q===R.primary_state?'primary':q===R.secondary_state?'secondary':'other',drivers:rows.filter(r=>(r.contribution?.[q]??0)>0).map(r=>({series_id:r.series_id,name:r.name,contribution:r.contribution![q],weight:r.weight,support:r.rule?.support[q]??0})).sort((a,b)=>b.contribution-a.contribution||b.weight-a.weight||a.series_id.localeCompare(b.series_id)).slice(0,3)}));
 return {rows,display_only_rows,quadrants,summary:{primary:R.primary_state,secondary:R.secondary_state,margin_pp:R.margin_pp,coverage:R.coverage,matched_weight:matchedWeight,denominator:sum(Object.values(W)),uncovered_weight:rec.uncovered_weight,growth_axis:R.growth_axis,inflation_axis:R.inflation_axis,scores:R.scores,norm:R.norm,tolerance:(n+1)/1e6}};
}
export async function buildClockView(input:ClockInput):Promise<ClockView>{
 const {snapshot,observations,regimeRecord:rec}=input;
 const out=(status:Exclude<ClockStatus,'ok'>,diagnostics:ClockDiagnostic[]=[],f4?:F4Match):ClockView=>({...clockMeta(snapshot,rec,status,diagnostics,f4),status});
 const snap=gateSnapshot(snapshot);if(!snap.ok)return out(snap.status,snap.diagnostics);
 const obs=gateObservations(snapshot,observations);if(!obs.ok)return out(obs.status,obs.diagnostics);
 const record=gateRecord(rec);if(!record.ok)return out(record.status,record.diagnostics);
 const storage=reconcileStorage({region:snapshot.region,observations,rec:rec!,snapshotCatalogVersion:snapshot.catalog_version});if(!storage.ok)return out('reconcile_failed',storage.diagnostics);
 let match:F4Match;try{match=await input.f4();}catch{match={status:'unavailable',reason:'exception'};}
 if(match.status==='unavailable')return out('f4_unavailable');if(match.status==='none')return out('f4_none');
 if(match.status==='earlier')return out('f4_earlier',[],match);
 if(match.status==='ineligible')return out('f4_ineligible',[],match);
 const R=rec!.regime,claim=match.claim;
 if(!R||claim.selected!==R.primary_state||claim.catalog_version!==snapshot.catalog_version||REGIMES.some(q=>!Number.isFinite(claim.distribution[q])||Math.abs(claim.distribution[q]-R.norm[q])>1e-6)||claim.margin_pp===null||Math.abs(claim.margin_pp-r6(100*(R.norm[R.primary_state]-(R.secondary_state?R.norm[R.secondary_state]:0))))>1e-6)return out('f4_mismatch',[{code:'invariant_7',ids:[match.judgment_id]}],match);
 return {...clockMeta(snapshot,rec,'ok',[],match),status:'ok',card:match.card,...project(input,storage.matchedWeight,storage.n)};
}
