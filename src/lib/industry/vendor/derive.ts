import {decCmp,decDiv,decMul,decSub} from '../decimal';
export const YOY_FORMULA_ID='yoy/1';
export type MissingReason='not_in_run'|'vendor_not_provided'|'no_prior_period'|'invalid_denominator';
type Input={status:'missing'|'ok';valueText:string|null;missingReason?:MissingReason|null};
export function deriveYoy(current:Input,base:Input|null):{status:'ok';valueText:string}|{status:'missing';reason:MissingReason}{
 if(current.status==='missing')return {status:'missing',reason:current.missingReason??'vendor_not_provided'};
 if(!base)return {status:'missing',reason:'no_prior_period'};
 if(base.status==='missing')return {status:'missing',reason:base.missingReason??'vendor_not_provided'};
 if(decCmp(base.valueText!,'0')<=0)return {status:'missing',reason:'invalid_denominator'};
 // Scale the exact difference before dividing to avoid double rounding at the half.
 return {status:'ok',valueText:decDiv(decMul(decSub(current.valueText!,base.valueText!),'100'),base.valueText!,2)!};
}
