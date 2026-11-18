// Topic spec §7.2: industry ratios are percentages; other units reuse macro formatting.
import {formatSlot,roundDecimal,type Locale} from '@/lib/macro/strategy/explain-render';
export function formatTopicSlot(slot:{value_text:string;unit:string},locale:Locale):string{
 if(slot.unit!=='ratio')return formatSlot(slot,locale);
 const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(slot.value_text);
 if(!match)throw new Error(`invalid_decimal:${slot.value_text}`);
 const fraction=(match[3]??'').padEnd(2,'0');
 const percent=`${match[1]}${match[2]}${fraction.slice(0,2)}.${fraction.slice(2)||'0'}`;
 return `${roundDecimal(percent,1)}%`;
}
