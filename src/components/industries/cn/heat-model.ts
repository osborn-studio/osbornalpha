import {decAbs,decCmp} from '@/lib/industry/decimal';

export function heatStep(value:string|null){
 if(value===null)return 'missing';
 const sign=decCmp(value,'0');
 if(!sign)return 'zero';
 const magnitude=decAbs(value);
 const step=decCmp(magnitude,'5')<0?1:decCmp(magnitude,'15')<0?2:decCmp(magnitude,'30')<=0?3:4;
 return `${sign>0?'p':'n'}${step}`;
}
