import {decDiv} from '@/lib/industry/decimal';
import type {VendorCell} from '@/lib/industry/vendor/page-read';

type DisplayCell=Pick<VendorCell,'unit'|'metric'|'valueText'|'missingReason'>;

export function formatCell(cell:DisplayCell,locale:'zh'|'en',t:(key:string)=>string,alwaysSigned=false){
 const {unit,valueText}=cell;
 if(valueText===null)return `${t('cnList.missing')} · ${t(`missing.${cell.missingReason??'vendor_not_provided'}`)}`;
 const digits=unit==='pct'?1:unit==='count'?0:2;
 const rounded=decDiv(valueText,unit==='cny_10k'?'10000':'1',digits)!;
 const [whole,fraction='']=rounded.replace(/^-/,'').split('.');
 const number=digits?`${whole}.${fraction.padEnd(digits,'0')}`:whole;
 const signed=unit==='pct'&&(alwaysSigned||cell.metric.endsWith('_yoy'));
 const sign=valueText.startsWith('-')?'−':signed?'+':'';
 const suffix=unit==='pct'?'%':unit==='count'?'':locale==='zh'?' 亿元':' CNY 100m';
 return sign+number+suffix;
}
