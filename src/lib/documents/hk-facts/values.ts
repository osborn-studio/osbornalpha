// Cell values (spec §7.5 step 5): parsePresented (decimal.ts) reads `1,234` / `(1,234)` / `12.34`
// and the lone dashes – - — (no value for that period: no candidate, never 0); value = presented ×
// scale by decimal-string arithmetic (scaleDecimal), never a float. Sign rules: cost_of_revenue and
// income_tax shown negative → absolute value, sign_flip; income_tax under a credit label (credit /
// 抵免 / 沖回, e.g. "Income tax credit 所得稅沖回") is a negative expense → −|x| whatever the printed
// sign (`10,185` and `(10,185)` both give −10185000; 0 stays 0), and sign_flip records only an actual
// change of sign (codex plan round 1 P1-3); net_change_in_cash shown positive under a
// decrease-only label (減少/减少/decrease without 增加/increase) → negated, sign_flip; everything else as
// presented (cash flows keep their printed sign).
import {negate,parsePresented,scaleDecimal} from '../decimal';
import type {Scale} from './scale';

export type CellValue={kind:'value';presented:string;value:string}|{kind:'dash'}|{kind:'invalid'};
export function cellValue(text:string,scale:Scale):CellValue{
 const p=parsePresented(text);
 if(p==='dash')return {kind:'dash'};
 if(p===null)return {kind:'invalid'};
 const v=scaleDecimal(p.digits,scale);
 return {kind:'value',presented:text,value:p.negative&&v!=='0'?negate(v):v};
}
const ABS_IF_NEGATIVE=new Set(['cost_of_revenue','income_tax']);
const DECREASE=/減少|减少|decrease/i,INCREASE=/增加|increase/i,CREDIT=/credit|抵免|沖回|冲回/i;
export function applySign(concept:string,value:string,label:string):{value:string;sign_flip:boolean}{
 const negative=value.startsWith('-');
 if(concept==='income_tax'&&CREDIT.test(label)){const v=negative||value==='0'?value:negate(value);return {value:v,sign_flip:v!==value};}
 if(ABS_IF_NEGATIVE.has(concept)&&negative)return {value:negate(value),sign_flip:true};
 if(concept==='net_change_in_cash'&&DECREASE.test(label)&&!INCREASE.test(label)&&!negative&&value!=='0')return {value:negate(value),sign_flip:true};
 return {value,sign_flip:false};
}
