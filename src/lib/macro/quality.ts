// src/lib/macro/quality.ts
// Macro validation thresholds (spec §4.4 "规则校验", §0.2 M8), version macro-rules/1. Wraps the shared
// dq rules (rangeRule / jumpRule / unitRule; never modified here). This is the ONLY place where an
// observation's value_text becomes a JS number (the other is regime.ts input): Number() on the
// canonical decimal text, used only to compare against thresholds — the stored value stays the text.
// Profile choice: "上年同月=100" indices, CNY per 100 USD and USD/bbl by unit; PMI by type (NBS PMI
// carries unit 'index'); other index levels (base-period indices) by unit; 'pct' by type.
// Jump limits exist only where a large relative move signals a unit/scale error rather than a real
// event (rates, yields, fx fixings, index levels, PMI); yoy rates, unemployment and oil prices have
// range checks only, so a real crisis value (UNRATE 14.8, WTI −36.98) is never quarantined.
import {jumpRule,rangeRule,unitRule} from '../dq/rules';
import type {RuleResult} from '../dq/rules';
import type {MacroSeriesDef,SeriesType} from './types';

export const MACRO_RULES_VERSION='macro-rules/1';
export const KNOWN_UNITS=['pct','index','index_1982_84_100','index_2009_11_100','index_prev_year_100','cny_per_100usd','usd_per_bbl'] as const;
export interface QualityProfile{min:number;max:number;maxRelJump:number|null}
const BY_UNIT:Record<string,QualityProfile>={
 index_prev_year_100:{min:50,max:200,maxRelJump:0.3},
 cny_per_100usd:{min:400,max:1000,maxRelJump:0.1},
 usd_per_bbl:{min:-100,max:1000,maxRelJump:null},
};
const PMI:QualityProfile={min:0,max:100,maxRelJump:0.5};
const INDEX_LEVEL:QualityProfile={min:0,max:100000,maxRelJump:0.5};
const INDEX_UNITS=new Set(['index','index_1982_84_100','index_2009_11_100']);
const PCT_BY_TYPE:Record<SeriesType,QualityProfile>={
 policy_rate:{min:-5,max:30,maxRelJump:3},
 bond_yield:{min:-5,max:30,maxRelJump:1},
 pmi:{min:0,max:100,maxRelJump:0.5},
 inflation_yoy:{min:-50,max:100,maxRelJump:null},
 liquidity_yoy:{min:-50,max:100,maxRelJump:null},
 growth_yoy:{min:-100,max:500,maxRelJump:null},   // CN exports yoy reached +154.9% (2021-02)
 labor_rate:{min:0,max:100,maxRelJump:null},
 risk_index:{min:0,max:200,maxRelJump:null},
 fx:{min:-50,max:100,maxRelJump:null},
 asset_price:{min:-100,max:1000,maxRelJump:null},
};
/** pct with no type (event sources: fed target bounds) is rate-like. */
const PCT_UNTYPED:QualityProfile={min:-5,max:30,maxRelJump:null};

export function profileOf(def:Pick<MacroSeriesDef,'unit'|'type'>):QualityProfile|null{
 if(Object.hasOwn(BY_UNIT,def.unit))return BY_UNIT[def.unit];
 if(def.type==='pmi'&&(def.unit==='index'||def.unit==='pct'))return PMI;
 if(INDEX_UNITS.has(def.unit))return INDEX_LEVEL;
 if(def.unit==='pct')return def.type?PCT_BY_TYPE[def.type]:PCT_UNTYPED;
 return null;
}

const CANONICAL=/^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
const num=(t:string|null)=>t===null?null:Number(t);
/** Validates one native point against its series profile. prevValueText = the previous accepted value of the same series (or null). */
export function validatePoint(def:Pick<MacroSeriesDef,'unit'|'type'>,valueText:string,prevValueText:string|null):{passed:boolean;failed:RuleResult[];version:string}{
 const results:RuleResult[]=[unitRule('macro.unit',def.unit,KNOWN_UNITS)];
 if(!CANONICAL.test(valueText)){
  results.push({ruleId:'macro.canonical',passed:false,detail:{reason:'not_canonical'}});
  const failed=results.filter(r=>!r.passed);
  return {passed:false,failed,version:MACRO_RULES_VERSION};
 }
 const p=profileOf(def);
 const v=num(valueText);
 if(p){
  results.push(rangeRule('macro.range',v,p.min,p.max));
  if(p.maxRelJump!==null)results.push(jumpRule('macro.jump',v,num(prevValueText),p.maxRelJump));
 }
 const failed=results.filter(r=>!r.passed);
 return {passed:failed.length===0,failed,version:MACRO_RULES_VERSION};
}
