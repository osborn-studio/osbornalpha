// Topic state and drift vocabulary (spec §4.1, X7).
import type {ResearchState} from '@/components/research-ui';
import type {Resolved,ResolveState} from '@/lib/evidence/resolve';
import type {Drift} from '@/lib/topics/types';
export type TopicBadgeModel=(
 |{kind:'ok';atPublication?:boolean}
 |{kind:'shared';state:ResearchState}
 |{kind:'local';key:string;shape:'dashed'|'dotted'|'solid';tone:'neutral'|'warn'}
)&{reasonKey?:string|null};
export function stateBadge(state:ResolveState,reason:string|null):TopicBadgeModel{
 const reasonKey=state==='ok'||!reason?null:`reasons.${reason}`;
 if(state==='ok')return {kind:'ok',reasonKey};
 if(state==='unsupported')return {kind:'local',key:'states.unsupported',shape:'dashed',tone:'neutral',reasonKey};
 return {kind:'shared',state:state==='not_served'?'notServed':state,reasonKey};
}
export function driftBadge(drift:Drift|null):TopicBadgeModel|null{
 if(drift===null||drift==='unchanged')return null;
 if(drift==='revised'||drift==='retracted')return {kind:'shared',state:drift};
 return {kind:'local',key:`drift.${drift}`,shape:drift==='newer_period'?'solid':drift==='now_withheld'?'dotted':'dashed',tone:drift==='newer_period'?'warn':'neutral'};
}
export function basisBadge(basis:Resolved['basis']):TopicBadgeModel|null{
 return basis==='reconstruction'?{kind:'shared',state:'reconstructed'}:null;
}
