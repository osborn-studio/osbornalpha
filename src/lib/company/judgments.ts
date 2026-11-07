// Company consumer of F4's public list route. A malformed wire card is never rendered.
import type {AnyCard} from '@/components/judgments/view-model';
import {visiblePercent} from '@/components/judgments/view-model';
import {PUBLIC_INPUT_KINDS} from '@/lib/judgments/types';

export type JudgmentCardDto=AnyCard;
export type JudgmentsCheck={ok:true;cards:JudgmentCardDto[]}|{ok:false;reason:'view_mismatch'|'asof_mismatch'|'post_cutoff'|'malformed'};
export function judgmentsUrl(issuerId:string,asOf:string|null):string{
 const q=new URLSearchParams({subject_type:'issuer',subject_key:issuerId,view:asOf?'as_known':'latest'});
 if(asOf)q.set('asOf',asOf);
 return `/api/judgments?${q.toString()}`;
}
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const bi=(v:unknown)=>obj(v)&&str(v.zh)&&str(v.en);
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const maybeNum=(v:unknown)=>v===null||num(v);
const ts=(v:unknown)=>str(v)&&!Number.isNaN(Date.parse(v));
const day=(v:unknown)=>str(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const one=(v:unknown,values:readonly string[])=>typeof v==='string'&&values.includes(v);
export const safeHref=(v:unknown):v is string=>str(v)&&(/^\/(?!\/)/.test(v)||/^https:\/\//i.test(v));
const target=(v:unknown)=>obj(v)&&(
 (v.kind==='date'&&day(v.date))||(v.kind==='period'&&str(v.period))||
 (v.kind==='session_index'&&day(v.base_date)&&num(v.n))||
 (v.kind==='fiscal_period'&&day(v.period_end)&&obj(v.calendar)&&day(v.calendar.anchor_period_end)&&v.calendar.months===3&&typeof v.extrapolated==='boolean'));
const condition=(v:unknown)=>v===null||(obj(v)&&bi(v.text)&&obj(v.horizon)&&one(v.horizon.unit,['trading_sessions','calendar_days','calendar_months','fiscal_quarters'])&&num(v.horizon.n)&&target(v.target)&&one(v.label_policy,['first_observed','cutoff_vintage'])&&ts(v.settle_after)&&ts(v.settle_by));
const realized=(v:unknown)=>v===null||(obj(v)&&(str(v.value)||num(v.value)||typeof v.value==='boolean')&&(v.label===undefined||str(v.label))&&(v.unit===null||str(v.unit))&&(v.from===null||day(v.from))&&(v.to===null||day(v.to))&&one(v.label_policy,['first_observed','cutoff_vintage']));
function validSettlement(v:unknown):boolean{
 if(v===null)return true;
 return obj(v)&&one(v.kind,['settled','void','withdrawn','reopened'])&&(v.outcome===null||one(v.outcome,['hit','miss']))&&realized(v.realized)&&ts(v.settled_at)&&bi(v.evidence_summary);
}
function validSummary(v:unknown):boolean{
 if(v===null)return true;
 if(!obj(v)||!num(v.n_independent)||!num(v.n_total)||!num(v.threshold_n)||!maybeNum(v.brier)||!maybeNum(v.brier_skill)||!maybeNum(v.ece_raw_holdout)||!ts(v.valid_until)||!safeHref(v.href))return false;
 if(v.hit_rate!==null&&!(obj(v.hit_rate)&&num(v.hit_rate.rate)&&maybeNum(v.hit_rate.low)&&maybeNum(v.hit_rate.high)))return false;
 return ['accuracy','coverage','spearman'].every(k=>v[k]===undefined||maybeNum(v[k]))&&(v.computed_at===undefined||ts(v.computed_at));
}
function validDisplay(v:unknown):boolean{
 if(!obj(v)||!bi(v.headline)||!(v.percent===undefined||v.percent===null||num(v.percent)))return false;
 if(!(v.value===null||str(v.value)||num(v.value)||Array.isArray(v.value)&&v.value.length===2&&v.value.every(num)))return false;
 if(v.band!==undefined&&!one(v.band,['low','mid','high']))return false;
 if(v.scale!==undefined&&!(obj(v.scale)&&num(v.scale.min)&&num(v.scale.max)))return false;
 if(v.dims!==undefined&&!(Array.isArray(v.dims)&&v.dims.every(x=>obj(x)&&str(x.id)&&bi(x.label)&&maybeNum(x.value)&&typeof x.coverage==='boolean')))return false;
 return v.nominal_coverage===undefined||num(v.nominal_coverage);
}
function validInput(v:unknown):boolean{
 return obj(v)&&one(v.kind,PUBLIC_INPUT_KINDS)&&obj(v.ref)&&ts(v.available_at)&&obj(v.origin)&&str(v.origin.publisher)&&str(v.origin.adapter)&&str(v.origin.locator)&&(v.origin.transform===undefined||str(v.origin.transform))&&(v.href===null||safeHref(v.href));
}
function normalizeCard(v:unknown):JudgmentCardDto|null{
 if(!obj(v)||!str(v.judgment_id)||!obj(v.subject)||v.subject.type!=='issuer'||!str(v.subject.key)||!str(v.judgment_type)||!one(v.kind,['probability','categorical','score','interval'])||!one(v.lifecycle,['abstained','open','settled','void','withdrawn'])||!(v.outcome===null||one(v.outcome,['hit','miss']))||!one(v.calibration,['insufficient','failed','calibrated','evaluated'])||typeof v.retrospective!=='boolean'||!day(v.as_of)||!ts(v.registered_at))return null;
 if(!obj(v.methodology)||!str(v.methodology.id)||!str(v.methodology.version)||!bi(v.methodology.title)||!safeHref(v.methodology.href)||!validDisplay(v.display)||!condition(v.condition)||!validSettlement(v.settlement)||!validSummary(v.calibration_summary)||!Array.isArray(v.inputs)||!v.inputs.every(validInput))return null;
 if(v.abstain_reason!==undefined&&!str(v.abstain_reason))return null;
 if(v.missing!==undefined&&!(Array.isArray(v.missing)&&v.missing.every(str)))return null;
 if(v.merged_from!==undefined&&!str(v.merged_from))return null;
 if(v.source!==undefined)return null; // the public list route never carries owner-only cards
 if(v.lifecycle==='settled'&&v.outcome===null)return null;
 const display=v.display as Record<string,unknown>;
 if(v.calibration!=='calibrated'&&display.percent!=null)return null;
 if(v.kind!=='probability'&&display.percent!=null)return null;
 return v as unknown as JudgmentCardDto;
}
export function checkJudgmentsResponse(body:unknown,asOf:string|null):JudgmentsCheck{
 if(!obj(body)||!obj(body.subject)||body.subject.type!=='issuer'||!str(body.subject.key)||!Array.isArray(body.cards))return {ok:false,reason:'malformed'};
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
