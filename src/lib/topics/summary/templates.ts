import {unitKindOf} from '@/lib/facts/units';
import {formatTopicSlot} from '@/components/topics/format';
import {registerTemplates,TEMPLATES,type Locale,type Renderer} from '@/lib/macro/strategy/explain-render';
import zh from '../../../../messages/zh/topics.json';
import en from '../../../../messages/en/topics.json';

const copy={zh:zh.summaryTemplates,en:en.summaryTemplates};
type Template=Exclude<keyof typeof zh.summaryTemplates,'reconstruction'>;
function localized(id:Template):Record<Locale,Renderer>{
 const render:Renderer=c=>{
  const text=copy[c.locale][id].replace(/\{(\w+)\}/g,(_,key:string)=>{
   switch(key){
    case 'name':return c.name('series');
    case 'company':case 'industry':case 'metric':case 'concept':return c.name(key);
    case 'value':return c.num(key,(slot,locale)=>{
     const value=formatTopicSlot(slot,locale);
     return id==='fact_value'&&unitKindOf(slot.unit)?`${value} ${slot.unit}`:value;
    });
    default:return c.str(key);
   }
  });
  return id==='industry_value'&&c.has('basis')&&c.str('basis')==='reconstruction'?text+copy[c.locale].reconstruction:text;
 };
 return {zh:render,en:render};
}
registerTemplates('topic',{
 'topic.macro_level':localized('macro_level'),'topic.macro_change':TEMPLATES.change,
 'topic.fact_value':localized('fact_value'),'topic.industry_value':localized('industry_value'),
 'topic.citation':localized('citation'),'topic.judgment_ref':localized('judgment_ref'),
});
