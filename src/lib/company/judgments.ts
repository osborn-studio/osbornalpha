// Company consumer of F4's public list route. A malformed wire card is never rendered.
import type {AnyCard} from '@/components/judgments/view-model';
import type {JudgmentsListResponse,WireCard} from '@/components/judgments/api-types';
import {visiblePercent} from '@/components/judgments/view-model';
import type {Bilingual,CalibrationState,Horizon,InputKind,Origin,Realized,Subject,Target} from '@/lib/judgments/types';
import {validateSubject} from '@/lib/judgments/contract';
import {JUDGMENT_TYPES} from '@/lib/judgments/route-utils';

export type JudgmentCardDto=AnyCard;
export type JudgmentsCheck={ok:true;cards:JudgmentCardDto[]}|{ok:false;reason:'view_mismatch'|'asof_mismatch'|'post_cutoff'|'malformed'};
export function judgmentsUrl(issuerId:string,asOf:string|null):string{
 const q=new URLSearchParams({subject_type:'issuer',subject_key:issuerId,view:asOf?'as_known':'latest'});
 if(asOf)q.set('asOf',asOf);
 return `/api/judgments?${q.toString()}`;
}
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const bi=(v:unknown)=>keys(v,BILINGUAL_KEYS)&&str(v.zh)&&str(v.en);
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const maybeNum=(v:unknown)=>v===null||num(v);
const ts=(v:unknown)=>str(v)&&!Number.isNaN(Date.parse(v));
const day=(v:unknown)=>str(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const one=(v:unknown,values:readonly string[])=>typeof v==='string'&&values.includes(v);
const keys=(v:unknown,fields:Record<string,true>):v is Record<string,any>=>obj(v)&&Object.keys(v).every(k=>k in fields);
const optional=(v:unknown,check:(v:unknown)=>boolean)=>v===undefined||check(v);
const nullable=(v:unknown,check:(v:unknown)=>boolean)=>v===null||check(v);
const BILINGUAL_KEYS={zh:true,en:true} satisfies Record<keyof Bilingual,true>;
const SUBJECT_KEYS={type:true,key:true} satisfies Record<keyof Subject,true>;
const HORIZON_KEYS={unit:true,n:true} satisfies Record<keyof Horizon,true>;
const ORIGIN_KEYS={publisher:true,adapter:true,locator:true,transform:true} satisfies Record<keyof Origin,true>;
const REALIZED_KEYS={value:true,label:true,unit:true,from:true,to:true,label_policy:true} satisfies Record<keyof Realized,true>;
const METHODOLOGY_KEYS={id:true,version:true,title:true,href:true} satisfies Record<keyof WireCard['methodology'],true>;
const DISPLAY_KEYS={headline:true,percent:true,value:true,scale:true,dims:true,band:true,nominal_coverage:true} satisfies Record<keyof WireCard['display'],true>;
const SCALE_KEYS={min:true,max:true} satisfies Record<keyof NonNullable<WireCard['display']['scale']>,true>;
const DIM_KEYS={id:true,label:true,value:true,coverage:true} satisfies Record<keyof NonNullable<WireCard['display']['dims']>[number],true>;
const SUMMARY_KEYS={n_independent:true,n_total:true,threshold_n:true,brier:true,brier_skill:true,ece_raw_holdout:true,valid_until:true,computed_at:true,hit_rate:true,accuracy:true,coverage:true,spearman:true,href:true} satisfies Record<keyof NonNullable<WireCard['calibration_summary']>,true>;
const HIT_RATE_KEYS={rate:true,low:true,high:true} satisfies Record<keyof NonNullable<NonNullable<WireCard['calibration_summary']>['hit_rate']>,true>;
const CONDITION_KEYS={text:true,horizon:true,target:true,label_policy:true,settle_after:true,settle_by:true} satisfies Record<keyof NonNullable<WireCard['condition']>,true>;
const SETTLEMENT_KEYS={kind:true,outcome:true,realized:true,settled_at:true,evidence_summary:true} satisfies Record<keyof NonNullable<WireCard['settlement']>,true>;
const INPUT_KEYS={kind:true,ref:true,available_at:true,origin:true,href:true} satisfies Record<keyof WireCard['inputs'][number],true>;
const CARD_KEYS={judgment_id:true,subject:true,judgment_type:true,kind:true,lifecycle:true,outcome:true,calibration:true,retrospective:true,as_of:true,registered_at:true,methodology:true,display:true,condition:true,settlement:true,calibration_summary:true,inputs:true,abstain_reason:true,missing:true,merged_from:true} satisfies Record<keyof WireCard,true>;
const ENVELOPE_KEYS={codeVersion:true,subject:true,view:true,asOf:true,cards:true} satisfies Record<keyof JudgmentsListResponse,true>;
const CALIBRATION={insufficient:true,failed:true,calibrated:true,evaluated:true,self_assessed:true} satisfies Record<CalibrationState,true>;
const INPUT_KINDS={financial_fact:true,financial_metric:true,macro_observation:true,macro_snapshot:true,price_bar:true,table_rows:true,judgment:true,legacy_fill:true,document_span:true} satisfies Record<InputKind,true>;
const validSubject=(v:unknown)=>{if(!keys(v,SUBJECT_KEYS)||v.type!=='issuer')return false;try{validateSubject(v);return true;}catch{return false;}};
export const safeHref=(v:unknown):v is string=>str(v)&&(/^\/(?!\/)/.test(v)||/^https:\/\//i.test(v));
const target=(v:unknown):boolean=>{
 if(!obj(v))return false;
 switch(v.kind as Target['kind']){
  case 'date':return keys(v,{kind:true,date:true} satisfies Record<keyof Extract<Target,{kind:'date'}>,true>)&&day(v.date);
  case 'period':return keys(v,{kind:true,period:true} satisfies Record<keyof Extract<Target,{kind:'period'}>,true>)&&str(v.period);
  case 'session_index':return keys(v,{kind:true,base_date:true,n:true} satisfies Record<keyof Extract<Target,{kind:'session_index'}>,true>)&&day(v.base_date)&&num(v.n);
  case 'fiscal_period':return keys(v,{kind:true,period_end:true,calendar:true,extrapolated:true} satisfies Record<keyof Extract<Target,{kind:'fiscal_period'}>,true>)&&day(v.period_end)&&keys(v.calendar,{anchor_period_end:true,months:true} satisfies Record<keyof Extract<Target,{kind:'fiscal_period'}>['calendar'],true>)&&day(v.calendar.anchor_period_end)&&v.calendar.months===3&&typeof v.extrapolated==='boolean';
  default:return false;
 }
};
const condition=(v:unknown)=>nullable(v,x=>keys(x,CONDITION_KEYS)&&bi(x.text)&&keys(x.horizon,HORIZON_KEYS)&&one(x.horizon.unit,['trading_sessions','calendar_days','calendar_months','fiscal_quarters'])&&num(x.horizon.n)&&target(x.target)&&one(x.label_policy,['first_observed','cutoff_vintage'])&&ts(x.settle_after)&&ts(x.settle_by));
const realized=(v:unknown)=>nullable(v,x=>keys(x,REALIZED_KEYS)&&(str(x.value)||num(x.value)||typeof x.value==='boolean')&&optional(x.label,str)&&nullable(x.unit,str)&&nullable(x.from,day)&&nullable(x.to,day)&&one(x.label_policy,['first_observed','cutoff_vintage']));
function validSettlement(v:unknown):boolean{
 if(v===null)return true;
 return keys(v,SETTLEMENT_KEYS)&&one(v.kind,['settled','void','withdrawn','reopened'])&&nullable(v.outcome,x=>one(x,['hit','miss']))&&realized(v.realized)&&ts(v.settled_at)&&bi(v.evidence_summary);
}
function validSummary(v:unknown):boolean{
 if(v===null)return true;
 if(!keys(v,SUMMARY_KEYS)||!num(v.n_independent)||!num(v.n_total)||!num(v.threshold_n)||!maybeNum(v.brier)||!maybeNum(v.brier_skill)||!maybeNum(v.ece_raw_holdout)||!ts(v.valid_until)||!safeHref(v.href))return false;
 if(v.hit_rate!==null&&!(keys(v.hit_rate,HIT_RATE_KEYS)&&num(v.hit_rate.rate)&&maybeNum(v.hit_rate.low)&&maybeNum(v.hit_rate.high)))return false;
 return ['accuracy','coverage','spearman'].every(k=>optional(v[k],maybeNum))&&optional(v.computed_at,ts);
}
function validDisplay(v:unknown):boolean{
 if(!keys(v,DISPLAY_KEYS)||!bi(v.headline)||!optional(v.percent,maybeNum))return false;
 if(!(v.value===null||str(v.value)||num(v.value)||Array.isArray(v.value)&&v.value.length===2&&v.value.every(num)&&v.value[0]<=v.value[1]))return false;
 if(v.band!==undefined&&!one(v.band,['low','mid','high']))return false;
 if(v.scale!==undefined&&!(keys(v.scale,SCALE_KEYS)&&num(v.scale.min)&&num(v.scale.max)&&v.scale.min<v.scale.max))return false;
 if(v.dims!==undefined&&!(Array.isArray(v.dims)&&v.dims.every(x=>keys(x,DIM_KEYS)&&str(x.id)&&bi(x.label)&&maybeNum(x.value)&&typeof x.coverage==='boolean')))return false;
 return v.nominal_coverage===undefined||num(v.nominal_coverage);
}
function validInput(v:unknown):boolean{
 return keys(v,INPUT_KEYS)&&one(v.kind,Object.keys(INPUT_KINDS))&&obj(v.ref)&&ts(v.available_at)&&keys(v.origin,ORIGIN_KEYS)&&str(v.origin.publisher)&&str(v.origin.adapter)&&str(v.origin.locator)&&optional(v.origin.transform,str)&&nullable(v.href,safeHref);
}
function normalizeCard(v:unknown):JudgmentCardDto|null{
 if(!keys(v,CARD_KEYS)||!str(v.judgment_id)||!validSubject(v.subject)||!one(v.judgment_type,JUDGMENT_TYPES)||!one(v.kind,['probability','categorical','score','interval'])||!one(v.lifecycle,['abstained','open','settled','void','withdrawn','pending_fill'])||!nullable(v.outcome,x=>one(x,['hit','miss']))||!one(v.calibration,Object.keys(CALIBRATION))||typeof v.retrospective!=='boolean'||!day(v.as_of)||!ts(v.registered_at))return null;
 if(!keys(v.methodology,METHODOLOGY_KEYS)||!str(v.methodology.id)||!str(v.methodology.version)||!bi(v.methodology.title)||!safeHref(v.methodology.href)||!validDisplay(v.display)||!condition(v.condition)||!validSettlement(v.settlement)||!validSummary(v.calibration_summary)||!Array.isArray(v.inputs)||!v.inputs.every(validInput))return null;
 if(v.abstain_reason!==undefined&&!str(v.abstain_reason))return null;
 if(v.missing!==undefined&&!(Array.isArray(v.missing)&&v.missing.every(str)))return null;
 if(v.merged_from!==undefined&&!str(v.merged_from))return null;
 if(v.lifecycle==='settled'&&v.outcome===null)return null;
 const display=v.display as Record<string,unknown>;
 if(v.calibration!=='calibrated'&&display.percent!=null)return null;
 if(v.kind!=='probability'&&display.percent!=null)return null;
 return v as unknown as JudgmentCardDto;
}
export function checkJudgmentsResponse(body:unknown,asOf:string|null):JudgmentsCheck{
 if(!keys(body,ENVELOPE_KEYS)||!validSubject(body.subject)||!nullable(body.codeVersion,str)||!Array.isArray(body.cards))return {ok:false,reason:'malformed'};
 if(body.view!==(asOf?'as_known':'latest'))return {ok:false,reason:'view_mismatch'};
 if(body.asOf!==asOf)return {ok:false,reason:'asof_mismatch'};
 const cards:JudgmentCardDto[]=[];
 for(const raw of body.cards){const card=normalizeCard(raw);if(!card||card.subject.key!==body.subject.key&&card.merged_from!==card.subject.key)return {ok:false,reason:'malformed'};cards.push(card);}
 if(asOf){
  const cutoff=`${asOf}T23:59:59.999Z`;
  const late=(v:string|undefined|null)=>v!==undefined&&v!==null&&(!ts(v)||new Date(v).toISOString()>cutoff);
  if(cards.some(c=>late(c.registered_at)||late(c.settlement?.settled_at)||late((c.calibration_summary as typeof c.calibration_summary&{computed_at?:string})?.computed_at)))return {ok:false,reason:'post_cutoff'};
 }
 return {ok:true,cards};
}
/** Company adds a lifecycle gate to F4's kind/calibration/finite-number rule. */
export function displayPercent(card:JudgmentCardDto):number|null{
 return card.lifecycle==='open'||card.lifecycle==='settled'?visiblePercent(card):null;
}

/** Preserve company's lifecycle rule while F4 owns the rendering. */
export function companyJudgmentCard(card:JudgmentCardDto):JudgmentCardDto{
 return {...card,display:{...card.display,percent:displayPercent(card)}};
}
