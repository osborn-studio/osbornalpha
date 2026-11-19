import {renderFact,type Locale} from '@/lib/macro/strategy/explain-render';
import type {EvidenceRef} from '@/lib/evidence/ref';
import {catalogById} from '@/lib/macro/catalog';
import type {Fact} from '@/lib/macro/strategy/contract';
import {typedChange} from '@/lib/macro/strategy/facts';
import type {TopicSnapshot} from '../types';
import './templates';

export interface TopicFact extends Fact{evidence:EvidenceRef[];refs:number[]}
export function topicFacts(snapshot:Pick<TopicSnapshot,'evidence'>):{facts:TopicFact[];incomparable:{a:number;b:number}[]}{
 const facts:TopicFact[]=[],incomparable:{a:number;b:number}[]=[];
 const observations:{ordinal:number;ref:EvidenceRef;series:string;period:string;value:{value_text:string;unit:string}}[]=[];
 for(const {ordinal,ref,resolved} of [...snapshot.evidence].sort((a,b)=>a.ordinal-b.ordinal)){
  if(resolved.state!=='ok'||resolved.admin_only||ref.kind==='judgment')continue;
  const fact=resolved.display.fact;
  if(!fact)continue;
  const slots={...fact.slots,...(resolved.basis?{basis:resolved.basis}:{})};
  facts.push({fact_id:`ev:${ordinal}`,kind:'level',template:fact.template,slots,refs:[ordinal],evidence:[ref],source_inputs:[]});
  const {series,period,value}=fact.slots;
  if(ref.kind==='macro_observation'&&typeof series==='string'&&typeof period==='string'&&value&&typeof value!=='string'){
   observations.push({ordinal,ref,series,period,value});
  }
 }
 for(const [index,a] of observations.entries()){
  const kind=catalogById(a.series)?.changeKind;
  for(const b of observations.slice(index+1)){
   if(a.series!==b.series)continue;
   const change=kind&&a.value.unit===b.value.unit?typedChange(kind,a.value.value_text,b.value.value_text):null;
   if(!change){incomparable.push({a:a.ordinal,b:b.ordinal});continue;}
   facts.push({fact_id:`pair:${a.ordinal}:${b.ordinal}`,kind:'change',template:'topic.macro_change',
    slots:{series:a.series,prev_period:a.period,period:b.period,change},refs:[a.ordinal,b.ordinal],evidence:[a.ref,b.ref],source_inputs:[]});
  }
 }
 return {facts,incomparable};
}

export function factSentences(facts:readonly TopicFact[],locale:Locale){
 return facts.map(f=>({fact_id:f.fact_id,refs:f.refs,text:renderFact(f,locale,id=>catalogById(id)?.name??null)}));
}
