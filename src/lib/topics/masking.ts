// Topic read-time masking (spec §5.4, A5b); frozen snapshots remain unchanged.
import type {Resolved} from '@/lib/evidence/resolve';
import type {DriftRow,RenderedSummary,TopicSnapshot} from './types';
import type {PublicEvidence} from './public-dto';
import {maskExcerpts} from './excerpts';
import type {PublicLicenceStatusRow} from './database-types';
export function maskedEntries(entries:TopicSnapshot['entries'],rows:PublicLicenceStatusRow[]){
 return maskExcerpts(entries,new Map(rows.map(l=>[l.licence_id,l.status])));
}
export const MASKING_DRIFTS=['retracted','now_withheld'] as const;
export function maskSnapshot(snapshot:TopicSnapshot,drift:ReadonlyMap<number,DriftRow>,view:'current'|'version'|'replay'):
 {evidence:PublicEvidence[];drawers:Map<number,Resolved['drawer']>;summary:(RenderedSummary&{hidden_points:number})|null}{
 const drawers=new Map<number,Resolved['drawer']>(),maskedOrdinals=new Set<number>();
 const evidence=snapshot.evidence.map((e):PublicEvidence=>{
  const r=e.resolved,d=drift.get(e.ordinal);
  const masked=d?.drift==='retracted'||d?.drift==='now_withheld';
  const visibleDrift=d&&d.drift!=='unchanged'&&(masked||view!=='replay')?d.drift:null;
  const c=!masked&&visibleDrift?d?.current_identity:null;
  const current=c&&c.value_text!==null&&c.unit!==null&&c.period!==null&&c.available_at!==null?
   {value_text:c.value_text,unit:c.unit,period:c.period,available_at:c.available_at}:null;
  if(masked)maskedOrdinals.add(e.ordinal);
  drawers.set(e.ordinal,masked?{kind:e.ref.kind,identity:structuredClone(r.drawer?.identity??{id:e.ref.id,label:r.display.label.zh}),reason:d!.drift}:structuredClone(r.drawer));
  return {ordinal:e.ordinal,section_key:e.section_key,kind:e.ref.kind,state:r.state,reason:r.reason,basis:r.basis,
   label:structuredClone(r.display.label),fact:masked?null:structuredClone(r.display.fact),period:r.display.period,available_at:r.display.available_at,
   drift:visibleDrift,masked,current};
 });
 let summary:(RenderedSummary&{hidden_points:number})|null=null;
 if(snapshot.summary){
  const frozen=structuredClone(snapshot.summary);
  const hiddenFacts=new Set(frozen.facts.filter(f=>f.refs.some(n=>maskedOrdinals.has(n))).map(f=>f.fact_id));
  for(const n of maskedOrdinals)hiddenFacts.add(`ev:${n}`);
  const visible=(p:RenderedSummary['points'][number])=>!p.fact_ids.some(id=>hiddenFacts.has(id))&&!p.refs.some(n=>maskedOrdinals.has(n));
  const points=frozen.points.filter(visible),counterpoints=frozen.counterpoints.filter(visible);
  summary={...frozen,facts:frozen.facts.map(f=>({...f,text:hiddenFacts.has(f.fact_id)?'':f.text})),points,counterpoints,
   hidden_points:frozen.points.length-points.length+frozen.counterpoints.length-counterpoints.length};
 }
 return {evidence,drawers,summary};
}
