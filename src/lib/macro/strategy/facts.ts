// src/lib/macro/strategy/facts.ts
// Facts (spec 2026-11-07 §6.1, macro-facts/1). A fact is a template id plus slots; every number lives in a slot as
// {value_text,unit} and is rendered by explain-render.ts, never written by a model. Every explanation binds to one
// 'explain_facts' manifest (the claim RPC requires that kind):
// - snapshot subject: buildSnapshotFactsManifest pins the requested snapshot (§4.5 "快照解读的清单": its region fixed,
//   cutoff = its created_at, peer = snapshotUpTo(peer, cutoff)) and freezes level / prev values, the spread inputs and the
//   policy events through manifestBuilder; snapshotFacts derives the facts from those inputs alone.
// - review subject: reviewFactsManifest wraps the stored review manifest of an immutable result (same frozen inputs,
//   kind 'explain_facts', params naming result_id and the review manifest); the facts are that result's ReviewFacts.
// Either way the exact fact list given to the model is frozen into body.facts before hashing, and explanationFacts reads
// only that list: an explanation's model input is rebuilt from its manifest alone. Percent changes are kept as the exact
// ratio (unit 'pct_ratio', value '<to>/<from>') and rounded once when rendered. No judgment field is read or produced
// (spec §7.7).
import type {ChangeKind,Fact,MacroSeriesDef,Region,ReviewFacts,ReviewResult,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {VERSIONS} from './contract';
import {inputRole,manifestBuilder,pinSnapshots} from './manifest';
import {pctRatio,sign,subtract,toBp} from './numeric';
import {readPolicyEvents} from './policy-events';
import type {StrategyReadPort} from './port';

/** The one derived node of a snapshot explanation: US 10Y minus CN 10Y, same period_end required (spec §5.1). */
export const SPREAD={id:'spread_us_cn_10y',a:'US_DGS10',b:'CN_CGB_10Y'} as const;
export const LEVEL_PURPOSE='level';export const SPREAD_PURPOSE='spread';
/** Indicators of a region that carry level facts: monthly / quarterly, and not the derive.from source of another row
 *  (raw indices and daily natives are evidence for the derived series, not facts of their own). */
export function levelIndicators<T extends Pick<MacroSeriesDef,'id'|'region'|'role'|'period'|'derive'>>(catalog:readonly T[],region:Region):T[]{
 const sources=new Set(catalog.flatMap(d=>d.derive?[d.derive.from]:[]));
 return catalog.filter(d=>d.region===region&&d.role==='indicator'&&d.period!=='day'&&!sources.has(d.id));
}
/** P1 typed change of one series: bp → exact toBp(to − from); pp / points → exact difference; pct → the exact ratio
 *  '<to>/<from>' (unit 'pct_ratio', rounded once at render) — null when the base is not positive. */
export function typedChange(kind:ChangeKind,from:string,to:string):{value_text:string;unit:string}|null{
 if(kind==='pct')return sign(from)<=0?null:{value_text:pctRatio(to,from),unit:'pct_ratio'};
 const d=subtract(to,from);
 return kind==='bp'?{value_text:toBp(d),unit:'bp'}:{value_text:d,unit:kind};
}
export function eventFact(e:StrategyPolicyEvent):Fact{
 return {fact_id:`evt:${e.effective_date}`,kind:'policy_event',template:'policy_event',
  slots:{date:e.effective_date,upper_from:{value_text:e.upper_from,unit:'pct'},upper_to:{value_text:e.upper_to,unit:'pct'},
   lower_from:{value_text:e.lower_from,unit:'pct'},lower_to:{value_text:e.lower_to,unit:'pct'},change:{value_text:e.change_bp,unit:'bp'}},
  period_end:e.effective_date,source_inputs:[...e.evidence]};
}
/** null = unknown or failed snapshot (the caller answers 404). */
export async function buildSnapshotFactsManifest(port:StrategyReadPort,snapshotId:string,codeVersion:string):Promise<StrategyManifest|null>{
 const pin=await pinSnapshots(port,snapshotId);
 if(!pin)return null;
 const region:Region=pin.snapshots.US?.snapshot_id===snapshotId?'US':'CN';
 const b=manifestBuilder(port,pin.cutoff);
 await b.useSnapshots(pin.snapshots);
 for(const d of levelIndicators(port.catalog(),region)){b.def(d.id);if(d.status==='active')await b.snapshotValue(d.id,LEVEL_PURPOSE,['prev']);}
 for(const id of [SPREAD.a,SPREAD.b])if(b.def(id)?.status==='active')await b.snapshotValue(id,SPREAD_PURPOSE);
 const {events,gaps}=await readPolicyEvents(b);
 const m=b.build({kind:'explain_facts',params:{subject_kind:'snapshot',snapshot_id:snapshotId,region},methodVersion:VERSIONS.facts,codeVersion,extra:{events,gaps}});
 return {...m,facts:snapshotFacts(m)};
}
/** Facts of a snapshot explanation: current level and typed change per indicator, the spread node, the latest policy event. */
export function snapshotFacts(m:StrategyManifest):Fact[]{
 if(m.kind!=='explain_facts'||m.params.subject_kind!=='snapshot')throw new Error(`not_snapshot_facts_manifest:${m.kind}`);
 const by=new Map(m.inputs.map(i=>[i.role,i]));const out:Fact[]=[];
 for(const d of m.catalog){
  const l=by.get(inputRole(LEVEL_PURPOSE,d.id,'latest'));if(!l)continue;
  out.push({fact_id:`obs:${d.id}`,kind:'level',template:'level',slots:{series:d.id,period:l.period_end,value:{value_text:l.value_text,unit:d.unit}},series_id:d.id,period_end:l.period_end,source_inputs:[l.role]});
  const p=by.get(inputRole(LEVEL_PURPOSE,d.id,'prev'));const c=p?typedChange(d.changeKind,p.value_text,l.value_text):null;
  if(p&&c)out.push({fact_id:`chg:${d.id}`,kind:'change',template:'change',slots:{series:d.id,prev_period:p.period_end,period:l.period_end,change:c},series_id:d.id,period_end:l.period_end,source_inputs:[p.role,l.role]});
 }
 const a=by.get(inputRole(SPREAD_PURPOSE,SPREAD.a,'latest'));const b=by.get(inputRole(SPREAD_PURPOSE,SPREAD.b,'latest'));
 if(a&&b&&a.period_end===b.period_end)out.push({fact_id:`node:${SPREAD.id}`,kind:'derived',template:'derived_spread',
  slots:{a:SPREAD.a,b:SPREAD.b,period:a.period_end,a_value:{value_text:a.value_text,unit:'pct'},b_value:{value_text:b.value_text,unit:'pct'},value:{value_text:subtract(a.value_text,b.value_text),unit:'pp_level'}},
  period_end:a.period_end,source_inputs:[a.role,b.role]});
 const events=[...(m.events??[])].sort((x,y)=>x.effective_date<y.effective_date?-1:x.effective_date>y.effective_date?1:0);
 const last=events[events.length-1];if(last)out.push(eventFact(last));
 return out;
}
/** Review explanation manifest: the stored review manifest's frozen content re-keyed as 'explain_facts' for that immutable
 *  result, with the result's facts frozen in body.facts. */
export function reviewFactsManifest(review:StoredManifest,result:ReviewResult,codeVersion:string):StrategyManifest{
 if(review.body.kind!=='review'||review.manifest_id!==result.manifest_id)throw new Error('review_manifest_mismatch');
 return {...review.body,kind:'explain_facts',params:{...review.body.params,subject_kind:'review',result_id:result.result_id,review_manifest_id:review.manifest_id},
  facts:flattenReviewFacts(result.facts),method_version:VERSIONS.facts,code_version:codeVersion};
}
/** The exact fact list of an explanation: body.facts of its 'explain_facts' manifest, nothing else. */
export function explanationFacts(m:StrategyManifest):Fact[]{
 if(m.kind!=='explain_facts'||!Array.isArray(m.facts))throw new Error(`not_explain_facts_manifest:${m.kind}`);
 return m.facts;
}
/** Review explanation facts: the seven sections in spec §6.2 order. */
export function flattenReviewFacts(f:ReviewFacts):Fact[]{
 return [...f.releases,...f.revisions,...f.timeliness,...f.policy_events,...f.episode_changes,...f.asset_moves,...f.coverage];
}
