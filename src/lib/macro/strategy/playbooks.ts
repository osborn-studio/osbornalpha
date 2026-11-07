// src/lib/macro/strategy/playbooks.ts
// Playbook library (spec 2026-11-07 §5.2, macro-playbooks/1) and the pure "F4 判定" mark selection (§5.2 N12).
// Triggers = rows of the frozen P1 rules projection with support[regime] > 0, ordered by support desc then rule_id asc;
// support is a rule parameter, rendered as "规则支持度 0.x", never as a percentage. Cards render only static text and rule
// parameters — no F4 field, distribution, margin or hit rate. selectF4Mark marks a playbook only when the F4 card is
// macro_regime@v1, open or settled, and its macro_snapshot input is the snapshot the transmission manifest shows; a card on
// another snapshot yields snapshot_match:false (no highlight, "F4 判定对应较早快照 <as_of>"). Nothing here classifies or
// scores: the regime on a mark is F4's own selected class.
import type {Bilingual,F4Mark,F4Summary,PlaybookView,Region,Regime,RulesView,StrategyManifest} from './contract';
import {PLAYBOOKS_V1} from './data/playbooks-v1';
import type {F4CardLite,F4JudgmentDetail} from './f4-types';
import {frozenDef} from './manifest';
export interface PlaybookDef{regime:Regime;title:Bilingual;mechanism:Bilingual[];implications:{favored:Bilingual[];disfavored:Bilingual[]};watch:string[]}

export function playbookTriggers(rules:RulesView,regime:Regime):PlaybookView['triggers']{
 return rules.rows.flatMap(r=>{const s=r.support[regime];return s!==undefined&&s>0?[{rule_id:r.rule_id,type:r.type,condition:r.condition,support:s}]:[];})
  .sort((a,b)=>b.support-a.support||(a.rule_id<b.rule_id?-1:a.rule_id>b.rule_id?1:0));
}
/** Playbook cards for one region from the transmission manifest (rules + frozen catalog names; watch filtered to the region). */
export function buildPlaybooks(m:StrategyManifest,region:Region,defs:readonly PlaybookDef[]=PLAYBOOKS_V1):PlaybookView[]{
 const rules=m.rules??{rulesVersion:'',rows:[]};
 return defs.map(p=>({regime:p.regime,title:p.title,triggers:playbookTriggers(rules,p.regime),mechanism:p.mechanism,implications:p.implications,
  watch:p.watch.flatMap(id=>{const d=frozenDef(m,id);return d&&d.region===region?[{series_id:id,name:d.name}]:[];})}));
}

const MARKABLE_LIFECYCLES=new Set(['open','settled']);
const methodHref=(id:string,version:string)=>`/intel/methods/${encodeURIComponent(id)}/${encodeURIComponent(version)}`;
/** Pure mark selection (§5.2). card / detail come from F4 read endpoints; snapshotId = the manifest's snapshot of that region. null = nothing to show. */
export function selectF4Mark(a:{card:F4CardLite|null;detail:F4JudgmentDetail|null;snapshotId:string|null}):{mark:F4Mark;summary:F4Summary}|null{
 const c=a.card;
 if(!c)return null;
 if(c.methodology.id!=='macro_regime'||c.methodology.version!=='v1')return null;
 if(!MARKABLE_LIFECYCLES.has(c.lifecycle))return null;
 const match=a.snapshotId!==null&&a.detail!==null&&a.detail.judgment_id===c.judgment_id
  &&a.detail.inputs.some(i=>i.kind==='macro_snapshot'&&i.ref.snapshot_id===a.snapshotId);
 const latest=c.lifecycle==='settled'&&a.detail&&a.detail.judgment_id===c.judgment_id?[...a.detail.settlements].sort((x,y)=>x.settled_at<y.settled_at?1:x.settled_at>y.settled_at?-1:0)[0]:undefined;
 const outcome=latest?.outcome==='hit'||latest?.outcome==='miss'?latest.outcome:null;
 return {
  mark:{regime:match?c.selected:null,judgment_id:c.judgment_id,snapshot_match:match,as_of:c.as_of},
  summary:{judgment_id:c.judgment_id,selected:c.selected,lifecycle:c.lifecycle,outcome,calibration:c.calibration,methodology:{...c.methodology},as_of:c.as_of,href:methodHref(c.methodology.id,c.methodology.version)},
 };
}
