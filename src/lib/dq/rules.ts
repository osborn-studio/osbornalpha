// src/lib/dq/rules.ts
// Pure validation rules (spec §5.2). Each returns a RuleResult; callers quarantine on failure.
// Invalid rule parameters fail the rule with reason 'invalid_params' instead of throwing, so a
// misconfigured rule quarantines rows rather than silently passing them.
export const RULES_VERSION='dq-rules/1.0';
export interface RuleResult{ruleId:string;passed:boolean;detail?:Record<string,unknown>}
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const nonNegative=(v:unknown):v is number=>num(v)&&v>=0;
/**
 * Renders an arbitrary input for a RuleResult detail without ever calling String() on objects
 * (which can throw, e.g. {toString:null}): strings, numbers and booleans as-is, null for
 * null/undefined, '[non-primitive]' otherwise.
 */
const renderValue=(v:unknown)=>v==null?null:typeof v==='string'||typeof v==='number'||typeof v==='boolean'?v:'[non-primitive]';
const invalid=(ruleId:string,params:Record<string,unknown>):RuleResult=>({ruleId,passed:false,detail:{...params,reason:'invalid_params'}});

/** Inclusive min ≤ value ≤ max. Infinite bounds are allowed (open range); NaN bounds or min > max are invalid_params. */
export function rangeRule(ruleId:string,value:unknown,min:number,max:number):RuleResult{
 if(typeof min!=='number'||typeof max!=='number'||Number.isNaN(min)||Number.isNaN(max)||min>max)return invalid(ruleId,{min,max});
 if(!num(value))return {ruleId,passed:false,detail:{value:value??null,reason:'not_a_number'}};
 return value>=min&&value<=max?{ruleId,passed:true}:{ruleId,passed:false,detail:{value,min,max}};
}

/**
 * |left − right − expected| ≤ tolerance × max(|left|,|right|,1). "gross = revenue − cost" is
 * identityRule(revenue, cost, tol, {expected: gross}). Evaluated in scaled space
 * |left/scale − right/scale − expected/scale| ≤ tolerance so values near Number.MAX_VALUE cannot
 * overflow to Infinity. The scale floor of 1 assumes unit-scale data (currency units, counts):
 * for values far below 1 (e.g. ratios in 1e-6) the tolerance becomes absolute and very loose.
 */
export function identityRule(ruleId:string,left:unknown,right:unknown,tolerance:number,opts:{expected?:number}={}):RuleResult{
 const expected=opts.expected??0;
 if(!nonNegative(tolerance)||!num(expected))return invalid(ruleId,{tolerance,expected});
 if(!num(left)||!num(right))return {ruleId,passed:false,detail:{left:left??null,right:right??null,reason:'not_a_number'}};
 const scale=Math.max(Math.abs(left),Math.abs(right),1);
 const relDiff=Math.abs(left/scale-right/scale-expected/scale);
 if(relDiff<=tolerance)return {ruleId,passed:true};
 const diff=relDiff*scale;
 return {ruleId,passed:false,detail:{left,right,expected,diff:Number.isFinite(diff)?diff:null,relDiff,tolerance}};
}

/**
 * Relative jump |cur − prev| / max(|prev|,1) must be ≤ maxRelJump. Only a null/undefined previous
 * value counts as missing (→ pass); any other non-finite previous fails with previous_not_a_number.
 * Failure details render inputs via renderValue (non-finite numeric previous as 'NaN'/'Infinity'),
 * so non-primitive inputs never throw.
 * Computed in scaled space so extreme values cannot overflow. The scale floor of 1 assumes
 * unit-scale data, as in identityRule.
 */
export function jumpRule(ruleId:string,current:unknown,previous:unknown,maxRelJump:number):RuleResult{
 if(!nonNegative(maxRelJump))return invalid(ruleId,{maxRelJump});
 if(!num(current))return {ruleId,passed:false,detail:{current:renderValue(current),reason:'not_a_number'}};
 if(previous===null||previous===undefined)return {ruleId,passed:true};
 if(!num(previous))return {ruleId,passed:false,detail:{current,previous:typeof previous==='number'?String(previous):renderValue(previous),reason:'previous_not_a_number'}};
 const scale=Math.max(Math.abs(previous),1);
 const rel=Math.abs(current/scale-previous/scale);
 return rel<=maxRelJump?{ruleId,passed:true}:{ruleId,passed:false,detail:{current,previous,rel,maxRelJump}};
}

/**
 * The unit must be a string listed in `allowed` (exact, case-sensitive match: 'CNY' ≠ 'cny').
 * Anything else fails with reason 'invalid_unit'; detail.unit is renderValue(unit).
 * An empty or non-string `allowed` list is invalid_params.
 */
export function unitRule(ruleId:string,unit:unknown,allowed:readonly string[]):RuleResult{
 if(!Array.isArray(allowed)||allowed.length===0||allowed.some(a=>typeof a!=='string'))return invalid(ruleId,{allowed:Array.isArray(allowed)?[...allowed]:null});
 if(typeof unit==='string'&&allowed.includes(unit))return {ruleId,passed:true};
 return {ruleId,passed:false,detail:{unit:renderValue(unit),allowed:[...allowed],reason:'invalid_unit'}};
}

export function runRules(results:RuleResult[]):{passed:boolean;failed:RuleResult[];version:string}{
 const failed=results.filter(r=>!r.passed);
 return {passed:failed.length===0,failed,version:RULES_VERSION};
}
