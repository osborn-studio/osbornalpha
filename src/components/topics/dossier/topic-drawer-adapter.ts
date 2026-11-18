// Unified source drawer mapping (topic spec §6.4, D8).
import {formatTopicSlot} from '../format';
import type {EvidenceDetailDto} from '@/lib/topics/public-dto';
import type {SourceDrawerAdapter,DrawerText} from '@/components/research-ui';
export const topicDrawerInput:SourceDrawerAdapter<{detail:EvidenceDetailDto;locale:'zh'|'en';text:DrawerText}>=({detail,locale,text})=>{
 const e=detail.evidence,kind=e.kind,identity={id:detail.drawer?.identity.id??String(e.ordinal),label:e.label[locale]},reason=e.reason??(detail.drawer&&'reason' in detail.drawer?detail.drawer.reason:null)??e.drift??'unknown';
 if(e.masked||e.state==='retracted')return {variant:'retracted',kind,identity,retraction:{category:text(`reasons.${reason}`),at:null}};
 if(e.state==='withheld'||e.drift==='now_withheld')return {variant:'withheld',kind,identity,reason:{code:reason,text:text(`reasons.${reason}`)}};
 if(e.state!=='ok'||!detail.drawer||!('source' in detail.drawer))throw new Error('drawer_unavailable');
 const payload=detail.drawer,slot=e.fact?.slots.value,value=slot&&typeof slot!=='string'?formatTopicSlot(slot,locale):'';
 if(e.drift==='revised'&&e.current)return {variant:'revised',payload,revised:{frozen:{value,available_at:e.available_at??''},current:{value:formatTopicSlot(e.current,locale),available_at:e.current.available_at}}};
 return {variant:'ok',payload,extras:{mark:kind==='judgment'?'judgment':'fact',value,period:e.period??''}};
};
