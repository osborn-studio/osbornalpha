// src/lib/dq/rules.ts
// Pure validation rules (spec §5.2). Each returns a RuleResult; callers quarantine on failure.
export const RULES_VERSION='dq-rules/1.0';
export interface RuleResult{ruleId:string;passed:boolean;detail?:Record<string,unknown>}
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);

export function rangeRule(ruleId:string,value:unknown,min:number,max:number):RuleResult{
 if(!num(value))return {ruleId,passed:false,detail:{value:value??null,reason:'not_a_number'}};
 return value>=min&&value<=max?{ruleId,passed:true}:{ruleId,passed:false,detail:{value,min,max}};
}
/** |left − right − expected| ≤ tolerance × max(|left|,|right|,1). "gross = revenue − cost" is identityRule(revenue, cost, tol, {expected: gross}). */
export function identityRule(ruleId:string,left:unknown,right:unknown,tolerance:number,opts:{expected?:number}={}):RuleResult{
 if(!num(left)||!num(right))return {ruleId,passed:false,detail:{left:left??null,right:right??null,reason:'not_a_number'}};
 const diff=Math.abs(left-right-(opts.expected??0));
 const scale=Math.max(Math.abs(left),Math.abs(right),1);
 return diff<=tolerance*scale?{ruleId,passed:true}:{ruleId,passed:false,detail:{left,right,expected:opts.expected??0,diff,tolerance}};
}
/** Relative jump |cur − prev| / max(|prev|,1) must be ≤ maxRelJump. No previous value → pass. */
export function jumpRule(ruleId:string,current:unknown,previous:unknown,maxRelJump:number):RuleResult{
 if(!num(current))return {ruleId,passed:false,detail:{value:current??null,reason:'not_a_number'}};
 if(!num(previous))return {ruleId,passed:true};
 const rel=Math.abs(current-previous)/Math.max(Math.abs(previous),1);
 return rel<=maxRelJump?{ruleId,passed:true}:{ruleId,passed:false,detail:{current,previous,rel,maxRelJump}};
}
export function runRules(results:RuleResult[]):{passed:boolean;failed:RuleResult[];version:string}{
 const failed=results.filter(r=>!r.passed);
 return {passed:failed.length===0,failed,version:RULES_VERSION};
}
