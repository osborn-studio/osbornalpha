// src/lib/evals/gold/schema.ts
// F6 gold-set contract (spec §4.1–§4.3, §4.6). parseGoldSetF6 checks every rule and throws ONE
// EvalError('gold_invalid') whose detail.errors lists every violation as '<json path>: <code>'.
// The runner never generates, infers or corrects gold values (§4.6): canonical.value is recomputed
// from printed only to be compared, never substituted. Phase scope: targets are facts (module 'facts')
// or metrics (module 'metrics'); other modules are rejected until their adapters exist (§5.6).
// Synthetic sets (provenance_kind 'synthetic', ci only) use recorded_by 'synthetic' and no reviewer;
// a set never mixes synthetic and transcribed cases (the runner refuses synthetic sets in report).
import {conceptById,isConceptId} from '../../facts/concepts';
import {FORMULA_VERSION,metricNames} from '../../facts/derive';
import {CURRENCIES} from '../../facts/units';
import type {Duration} from '../../facts/types';
import {canonicalDecimal} from '../../facts/json-numbers';
import {formatDecimal,parseDecimalParts} from '../compare';
import {EvalError} from '../errors';
import type {CaseSource,CaseTarget,DocumentId,EvalModule,GoldCase,GoldHistoryEntry,GoldSet,RecordersFile,Scale,UnitSpec} from '../types';

export const SCALES:readonly Scale[]=['1','1000','1000000','1000000000'];
export const EVAL_MODULES:readonly EvalModule[]=['facts','metrics','macro','industry','company','foreign_research'];
const DURATIONS:readonly Duration[]=['3M','6M','9M','12M','INSTANT'];
const CURRENCY=new Set<string>(CURRENCIES);
const DATE_SHAPE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Real calendar date (round-trips through Date UTC), not just the YYYY-MM-DD shape. */
const DATE={test:(s:string)=>DATE_SHAPE.test(s)&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s};
/** Metric durations the derive layer emits (derive.ts emit(): 3M single quarters, ratio rows keep the source duration, TTM). */
const METRIC_DURATIONS:readonly string[]=['3M','6M','9M','12M','INSTANT','TTM'];
/** Bases derive.ts emits (derive.ts:110-111): std = us_standard|cn_standard, plus CN capex_incl_intangibles → cn_incl_intangibles; CN fcf cn_incl_intangibles (line 136); CN borrowings_total cn_incl_bonds (line 145). */
const METRIC_BASES:Record<'US'|'CN',readonly string[]>={US:['us_standard'],CN:['cn_standard','cn_incl_intangibles','cn_incl_bonds']};
/** Provenance accepts a calendar date or an ISO timestamp with an explicit zone. */
export function isProvenanceDate(v:unknown):v is string{
 if(typeof v!=='string'||!DATE.test(v.slice(0,10)))return false;
 if(v.length===10)return true;
 return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)&&Number.isFinite(Date.parse(v));
}
const TIMESTAMP={test:isProvenanceDate};
const HEX64=/^[0-9a-f]{64}$/;
const SET_ID=/^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_.-]*)+$/;
const ACCESSION=/^\d{10}-\d{2}-\d{6}$/;
const SET_KEYS=new Set(['schema_version','set_id','version','module','artifact_class','module_implementers','review_required','tolerance','thresholds','optional_cases','history','cases']);
/** §4.6: the 30-company set needs a second reviewer on every case (Codex plan round 1 P2-3). */
export const REVIEW_REQUIRED_PREFIXES:readonly string[]=['facts/plan3'];
const CASE_KEYS=new Set(['case_id','subject','target','expect','printed','canonical','binding','source','provenance_kind','recorded_by','recorded_at','reviewed_by','reviewed_at','retracted','notes']);
const FACT_KEYS=new Set(['type','concept','period_start','period_end','duration','consolidation','unit']);
const METRIC_KEYS=new Set(['type','metric','period_start','period_end','duration','basis','input_unit','formula_version','unit']);
const SOURCE_KEYS=new Set(['document_type','document_id','url','sha256','available_date','locator']);

/** Facts unit string of a UnitSpec (§4.3); null for macro-only kinds (index, count, percent_points). */
export function unitOfSpec(u:UnitSpec):string|null{
 switch(u.kind){
  case 'currency':return u.currency;
  case 'shares':return 'shares';
  case 'per_share':return `${u.currency}/share`;
  case 'ratio':return 'pure';
  default:return null;
 }
}
/** Inverse of unitOfSpec for facts unit strings ('USD', 'shares', 'USD/share', 'pure'); null when not a facts unit. */
export function specOfUnit(unit:string):UnitSpec|null{
 if(unit==='shares')return {kind:'shares'};
 if(unit==='pure')return {kind:'ratio'};
 if(CURRENCY.has(unit))return {kind:'currency',currency:unit};
 const m=/^([A-Z]{3})\/share$/.exec(unit);
 return m&&CURRENCY.has(m[1])?{kind:'per_share',currency:m[1]}:null;
}

/**
 * §4.3: parse printed.text (thousands separators '1,234'; '(1,234)' and '-1,234' negative; '12.5%' for
 * ratio = 0.125) × scale → canonical decimal. Returns null when the text is not a printed number.
 */
export function canonicalFromPrinted(text:string,scale:Scale,unit:UnitSpec):string|null{
 try{return canonicalFromPrintedUnsafe(text,scale,unit);}catch{return null;}
}
function canonicalFromPrintedUnsafe(text:string,scale:Scale,unit:UnitSpec):string|null{
 let t=text.trim(),neg=false,percent=false;
 const paren=/^\((.*)\)$/.exec(t);
 if(paren){neg=true;t=paren[1].trim();}
 else if(t.startsWith('-')){neg=true;t=t.slice(1);}
 if(t.endsWith('%')){
  if(unit.kind!=='ratio')return null;
  percent=true;t=t.slice(0,-1);
 }
 if(!/^([1-9]\d{0,2}(,\d{3})+|0|[1-9]\d*)(\.\d+)?$/.test(t))return null;
 const {unscaled,scale:fracDigits}=parseDecimalParts(t.replace(/,/g,''));
 const value=unscaled*BigInt(scale)*(neg?-1n:1n);
 return formatDecimal(value,fracDigits+(percent?2:0));
}

type J=Record<string,unknown>;
const isObj=(v:unknown):v is J=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const isStr=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const isInt=(v:unknown,min:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const isDecimal=(v:unknown):v is string=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v);

/** Non-negative decimal string below 1 (or ≤ 1 when inclusiveOne). */
function isUnitFraction(v:unknown,inclusiveOne:boolean):v is string{
 if(!isDecimal(v))return false;
 const {unscaled,scale}=parseDecimalParts(v);
 const one=10n**BigInt(scale);
 return inclusiveOne?unscaled<=one:unscaled<one;
}
/** §4.3 tolerance: decimal string, 0 ≤ rel < 1. */
export const isRelTolerance=(v:unknown):v is string=>isUnitFraction(v,false);

export function parseGoldSetF6(raw:unknown,meta:{path:string;sha256:string},recorders:RecordersFile):GoldSet{
 const errors:string[]=[];
 const err=(at:string,code:string)=>{errors.push(`${at}: ${code}`);};
 const fail=()=>new EvalError('gold_invalid',`${meta.path}: ${errors.length} rule violation(s)`,{path:meta.path,errors});
 if(!isObj(raw)){err('$','not_an_object');throw fail();}
 for(const k of Object.keys(raw))if(!SET_KEYS.has(k))err(k,'unknown_key');
 if(raw.schema_version!==1)err('schema_version','must_be_1');
 if(typeof raw.set_id!=='string'||!SET_ID.test(raw.set_id))err('set_id','invalid');
 if(!isInt(raw.version,1))err('version','integer_>=_1');
 const mod=raw.module as EvalModule;
 if(!EVAL_MODULES.includes(mod))err('module','invalid');
 else if(mod!=='facts'&&mod!=='metrics')err('module','unsupported_in_this_phase');
 if(raw.artifact_class!=='public'&&raw.artifact_class!=='restricted')err('artifact_class','invalid');
 const implementers=Array.isArray(raw.module_implementers)&&raw.module_implementers.length>0&&raw.module_implementers.every(isStr)?raw.module_implementers as string[]:null;
 if(!implementers)err('module_implementers','non_empty_string_array');
 else if(implementers.some(id=>!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(id))||new Set(implementers).size!==implementers.length)err('module_implementers','unique_canonical_identities_required');
 if(typeof raw.review_required!=='boolean')err('review_required','boolean_required');
 else if(!raw.review_required&&typeof raw.set_id==='string'&&REVIEW_REQUIRED_PREFIXES.some(p=>(raw.set_id as string).startsWith(p)))err('review_required','must_be_true_for_this_set');
 const tolerance=isObj(raw.tolerance)?raw.tolerance:null;
 if(!tolerance||Object.keys(tolerance).join()!=='rel'||!isRelTolerance(tolerance.rel))err('tolerance','must_be_{rel}_with_0<=rel<1');
 const th=isObj(raw.thresholds)?raw.thresholds:null;
 if(!th||Object.keys(th).sort().join()!=='max_fail,min_coverage_optional'||!isInt(th.max_fail,0)||!isUnitFraction(th.min_coverage_optional,true))
  err('thresholds','must_be_{max_fail>=0,0<=min_coverage_optional<=1}');
 const optional=Array.isArray(raw.optional_cases)&&raw.optional_cases.every(isStr)?raw.optional_cases as string[]:null;
 if(!optional)err('optional_cases','string_array');
 else if(new Set(optional).size!==optional.length)err('optional_cases','duplicate');
 const byId=new Map(recorders.recorders.map(r=>[r.id,r]));
 const history=parseHistory(raw.history,raw.version,err,byId);
 const rawCases=Array.isArray(raw.cases)?raw.cases:null;
 if(!rawCases)err('cases','array');
 const cases:GoldCase[]=[];
 const caseIdx:number[]=[];
 const ids=new Set<string>();
 const kinds=new Set<string>();
 (rawCases??[]).forEach((c,i)=>{
  const at=`cases[${i}]`;
  const parsed=parseCase(c,at,{module:mod,implementers:implementers??[],byId,err});
  if(!parsed)return;
  if(ids.has(parsed.case_id))err(`${at}.case_id`,'duplicate');
  ids.add(parsed.case_id);kinds.add(parsed.provenance_kind);
  cases.push({...parsed,required:!(optional??[]).includes(parsed.case_id)});caseIdx.push(i);
 });
 if(raw.review_required===true)for(const [k,c] of cases.entries())if(c.reviewed_by===null||c.reviewed_by===c.recorded_by)err(`cases[${caseIdx[k]}].reviewed_by`,'required_by_review_required');
 for(const id of optional??[])if(!ids.has(id))err('optional_cases',`unknown_case:${id}`);
 if(kinds.size>1)err('cases','mixed_provenance_kind');
 if(errors.length>0)throw fail();
 return {
  schema_version:1,format:'f6',set_id:raw.set_id as string,version:raw.version as number,module:mod,artifact_class:raw.artifact_class as GoldSet['artifact_class'],
  module_implementers:implementers!,review_required:raw.review_required as boolean,tolerance:{rel:tolerance!.rel as string},
  thresholds:{max_fail:th!.max_fail as number,min_coverage_optional:th!.min_coverage_optional as string},
  optional_cases:optional!,history,cases,ready:true,path:meta.path,sha256:meta.sha256,
 };
}

function parseHistory(v:unknown,version:unknown,err:(at:string,code:string)=>void,byId:Map<string,unknown>):GoldHistoryEntry[]{
 if(!Array.isArray(v)){err('history','array');return [];}
 const out:GoldHistoryEntry[]=[];
 let last=0;
 v.forEach((h,i)=>{
  const at=`history[${i}]`;
  if(!isObj(h)||!isInt(h.version,2)||!isStr(h.changed_at)||!TIMESTAMP.test(h.changed_at)||!isStr(h.changed_by)||!isStr(h.reason)||!Array.isArray(h.fields)||h.fields.length===0||!h.fields.every(isStr)){err(at,'must_be_{version>=2,changed_at,changed_by,reason,fields[]}');return;}
  if(!byId.has(h.changed_by))err(`${at}.changed_by`,`not_in_recorders:${h.changed_by}`);
  if(h.version<=last)err(`${at}.version`,'not_increasing');
  if(typeof version==='number'&&h.version>version)err(`${at}.version`,'above_set_version');
  last=h.version;
  out.push({version:h.version,changed_at:h.changed_at,changed_by:h.changed_by,reason:h.reason,fields:h.fields as string[]});
 });
 if(typeof version==='number'&&version>1&&!out.some(h=>h.version===version))err('history','missing_entry_for_current_version');
 return out;
}

interface CaseCtx{module:EvalModule;implementers:string[];byId:Map<string,RecordersFile['recorders'][number]>;err:(at:string,code:string)=>void}
type ParsedCase=Omit<GoldCase,'required'>;

function parseCase(c:unknown,at:string,x:CaseCtx):ParsedCase|null{
 const {err}=x;
 if(!isObj(c)){err(at,'not_an_object');return null;}
 for(const k of Object.keys(c))if(!CASE_KEYS.has(k))err(`${at}.${k}`,'unknown_key');
 const caseId=typeof c.case_id==='string'&&c.case_id.length>=1&&c.case_id.length<=512?c.case_id:null;
 if(!caseId)err(`${at}.case_id`,'string_1..512');
 // subject (§4.6: never issuer_id)
 const subj=isObj(c.subject)?c.subject:null;
 if(!subj)err(`${at}.subject`,'required');
 else{
  if('issuer_id' in subj)err(`${at}.subject.issuer_id`,'forbidden');
  for(const k of Object.keys(subj))if(!['market','cik','ticker','issuer_id'].includes(k))err(`${at}.subject.${k}`,'unknown_key');
  if(subj.market!=='US'&&subj.market!=='CN')err(`${at}.subject.market`,'US_or_CN');
  if(!isStr(subj.cik)&&!isStr(subj.ticker))err(`${at}.subject`,'cik_or_ticker_required');
  if(subj.cik!==undefined&&(typeof subj.cik!=='string'||!/^\d{1,10}$/.test(subj.cik)))err(`${at}.subject.cik`,'digits');
 }
 const target=parseTarget(c.target,`${at}.target`,x,subj&&(subj.market==='US'||subj.market==='CN')?subj.market:null);
 // expect / printed / canonical
 if(c.expect!=='present'&&c.expect!=='missing')err(`${at}.expect`,'present_or_missing');
 let printed:GoldCase['printed'],canonical:GoldCase['canonical'];
 if(c.expect==='missing'){
  if('printed' in c)err(`${at}.printed`,'forbidden_when_missing');
  if('canonical' in c)err(`${at}.canonical`,'forbidden_when_missing');
 }else if(c.expect==='present'){
  const p=isObj(c.printed)?c.printed:null;
  if(!p||!isStr(p.text)||typeof p.unit_label!=='string'||!SCALES.includes(p.scale as Scale)||Object.keys(p).length!==3){
   err(`${at}.printed`,'must_be_{text,unit_label,scale}');
   if(p&&!SCALES.includes(p.scale as Scale))err(`${at}.printed.scale`,'not_in_whitelist');
  }else printed={text:p.text,unit_label:p.unit_label,scale:p.scale as Scale};
  const canonShape=isObj(c.canonical)&&Object.keys(c.canonical).join()==='value';
  if(!canonShape)err(`${at}.canonical`,'must_be_{value}');
  const cv=canonShape&&typeof (c.canonical as J).value==='string'?(c.canonical as J).value as string:null;
  let canon:string|null=null;
  if(cv!==null){try{canon=canonicalDecimal(cv);}catch{canon=null;}}
  if(!canonShape){/* reported above */}
  else if(canon===null)err(`${at}.canonical.value`,'decimal_string_required');
  else if(canon!==cv)err(`${at}.canonical.value`,`not_canonical:${canon}`);
  else canonical={value:canon};
  if(printed&&canon!==null&&target){
   const recomputed=canonicalFromPrinted(printed.text,printed.scale,target.unit);
   if(recomputed===null)err(`${at}.printed.text`,'unparseable');
   else if(recomputed!==canon)err(`${at}.canonical.value`,`does_not_match_printed:${recomputed}`);
  }
  if(printed&&target?.unit.kind==='ratio'&&printed.scale!=='1')err(`${at}.printed.scale`,'ratio_requires_scale_1');
 }
 // binding / source
 if(c.binding!=='document'&&c.binding!=='current')err(`${at}.binding`,'document_or_current');
 const source=parseSource(c.source,`${at}.source`,c,x);
 if(target?.type==='metric'&&c.binding!=='current')err(`${at}.binding`,'metric_requires_current_binding');
 if(c.binding==='document'&&source&&!source.document_id)err(`${at}.source.document_id`,'required_for_document_binding');
 if(c.binding==='current'&&source&&!source.available_date)err(`${at}.source.available_date`,'required_for_current_binding');
 if(source?.document_id&&subj){
  if(source.document_id.kind==='edgar_accession'&&subj.market!=='US')err(`${at}.source.document_id`,'edgar_accession_requires_US');
  if(source.document_id.kind==='cninfo_announcement'&&subj.market!=='CN')err(`${at}.source.document_id`,'cninfo_announcement_requires_CN');
 }
 // provenance (§4.6)
 const kind=c.provenance_kind;
 if(kind!=='transcribed'&&kind!=='synthetic')err(`${at}.provenance_kind`,'transcribed_or_synthetic');
 const person=(v:unknown,field:string,required:boolean)=>{
  if(v===null||v===undefined){if(required)err(`${at}.${field}`,'required');return;}
  if(typeof v!=='string'){err(`${at}.${field}`,'string');return;}
  const r=x.byId.get(v);
  if(!r)err(`${at}.${field}`,`not_in_recorders:${v}`);
  else if(!r.modules.includes(x.module))err(`${at}.${field}`,`recorder_not_for_module:${v}`);
  if(x.implementers.includes(v))err(`${at}.${field}`,`is_module_implementer:${v}`);
 };
 if(kind==='synthetic'){
  if(c.recorded_by!=='synthetic')err(`${at}.recorded_by`,'must_be_synthetic_for_synthetic_cases');
  if(c.reviewed_by!==null&&c.reviewed_by!==undefined)err(`${at}.reviewed_by`,'must_be_null_for_synthetic_cases');
 }else{
  person(c.recorded_by,'recorded_by',true);
  person(c.reviewed_by,'reviewed_by',false);
  if(isStr(c.reviewed_by)&&c.reviewed_by===c.recorded_by)err(`${at}.reviewed_by`,'same_as_recorded_by');
 }
 if(typeof c.recorded_at!=='string'||!TIMESTAMP.test(c.recorded_at))err(`${at}.recorded_at`,'date_or_timestamp_required');
 const reviewed=c.reviewed_by!==null&&c.reviewed_by!==undefined;
 if(reviewed&&(typeof c.reviewed_at!=='string'||!TIMESTAMP.test(c.reviewed_at)))err(`${at}.reviewed_at`,'required_with_reviewed_by');
 if(!reviewed&&c.reviewed_at!==null&&c.reviewed_at!==undefined)err(`${at}.reviewed_at`,'forbidden_without_reviewed_by');
 // retraction / notes
 let retracted:GoldCase['retracted']=null;
 if(c.retracted!==null&&c.retracted!==undefined){
  const r=isObj(c.retracted)?c.retracted:null;
  if(!r||typeof r.at!=='string'||!TIMESTAMP.test(r.at)||!isStr(r.by)||!isStr(r.reason))err(`${at}.retracted`,'must_be_null_or_{at,by,reason}');
  else{person(r.by,'retracted.by',true);retracted={at:r.at,by:r.by,reason:r.reason};}
 }
 if(c.notes!==undefined&&typeof c.notes!=='string')err(`${at}.notes`,'string');
 if(!caseId||!subj||!target||!source)return null;
 const asOf=source.available_date??null;
 return {
  case_id:caseId,subject:{market:subj.market as 'US'|'CN',...(isStr(subj.cik)?{cik:subj.cik}:{}),...(isStr(subj.ticker)?{ticker:subj.ticker}:{})},
  target,expect:c.expect as GoldCase['expect'],...(printed?{printed}:{}),...(canonical?{canonical}:{}),
  binding:c.binding as GoldCase['binding'],as_of:asOf,source,provenance_kind:kind as GoldCase['provenance_kind'],
  recorded_by:String(c.recorded_by),recorded_at:typeof c.recorded_at==='string'?c.recorded_at:null,
  reviewed_by:isStr(c.reviewed_by)?c.reviewed_by:null,reviewed_at:typeof c.reviewed_at==='string'?c.reviewed_at:null,
  retracted,notes:typeof c.notes==='string'?c.notes:'',pending:false,provenance_gaps:[],
 };
}

function parseUnit(v:unknown,at:string,err:CaseCtx['err']):UnitSpec|null{
 if(!isObj(v)){err(at,'required');return null;}
 const keys=Object.keys(v).sort().join();
 switch(v.kind){
  case 'currency':case 'per_share':
   if(keys!=='currency,kind'||typeof v.currency!=='string'||!CURRENCY.has(v.currency)){err(at,`${v.kind}_requires_iso_currency`);return null;}
   return {kind:v.kind,currency:v.currency};
  case 'shares':case 'ratio':case 'index':case 'count':case 'percent_points':
   if(keys!=='kind'){err(at,'unexpected_fields');return null;}
   return {kind:v.kind};
  default:err(`${at}.kind`,'invalid');return null;
 }
}

function parseTarget(v:unknown,at:string,x:CaseCtx,market:'US'|'CN'|null):CaseTarget|null{
 const {err}=x;
 if(!isObj(v)){err(at,'required');return null;}
 const unit=parseUnit(v.unit,`${at}.unit`,err);
 if(unit&&unitOfSpec(unit)===null)err(`${at}.unit`,'not_a_facts_unit');
 if(typeof v.period_end!=='string'||!DATE.test(v.period_end))err(`${at}.period_end`,'date');
 if(v.type==='fact'){
  for(const k of Object.keys(v))if(!FACT_KEYS.has(k))err(`${at}.${k}`,'unknown_key');
  if(x.module!=='facts')err(`${at}.type`,'fact_target_requires_module_facts');
  const def=typeof v.concept==='string'&&isConceptId(v.concept)?conceptById(v.concept):undefined;
  if(!def)err(`${at}.concept`,'not_in_CONCEPT_IDS');
  if(!('period_start' in v))err(`${at}.period_start`,'required_(null_for_instant)');
  else if(v.period_start!==null&&(typeof v.period_start!=='string'||!DATE.test(v.period_start)))err(`${at}.period_start`,'date_or_null');
  if(!DURATIONS.includes(v.duration as Duration))err(`${at}.duration`,'invalid');
  if(v.consolidation!=='consolidated')err(`${at}.consolidation`,'must_be_consolidated');
  if(def){
   const instant=def.nature==='instant';
   if(instant&&(v.duration!=='INSTANT'||v.period_start!==null))err(at,'instant_concept_requires_INSTANT_and_null_period_start');
   if(!instant&&(v.duration==='INSTANT'||typeof v.period_start!=='string'))err(at,'duration_concept_requires_period_start_and_duration');
   const want=def.unitKind==='money'?'currency':def.unitKind;
   if(unit&&unit.kind!==want)err(`${at}.unit.kind`,`concept_${def.id}_expects_${want}`);
  }
  if(typeof v.period_start==='string'&&typeof v.period_end==='string'&&v.period_start>=v.period_end)err(at,'period_start_must_precede_period_end');
  if(!def||!unit||typeof v.period_end!=='string'||!DURATIONS.includes(v.duration as Duration)||!('period_start' in v))return null;
  return {type:'fact',concept:def.id,period_start:v.period_start as string|null,period_end:v.period_end,duration:v.duration as Duration,consolidation:'consolidated',unit};
 }
 if(v.type==='metric'){
  for(const k of Object.keys(v))if(!METRIC_KEYS.has(k))err(`${at}.${k}`,'unknown_key');
  if(x.module!=='metrics')err(`${at}.type`,'metric_target_requires_module_metrics');
  for(const k of ['metric','duration','basis','input_unit','formula_version'])if(!isStr(v[k]))err(`${at}.${k}`,'required');
  if(isStr(v.metric)&&market&&!metricNames(market).includes(v.metric))err(`${at}.metric`,'not_in_metricNames');
  if(isStr(v.duration)&&!METRIC_DURATIONS.includes(v.duration))err(`${at}.duration`,'invalid');
  if(isStr(v.basis)&&market&&!METRIC_BASES[market].includes(v.basis))err(`${at}.basis`,'not_emitted_by_derive');
  if(isStr(v.input_unit)&&specOfUnit(v.input_unit)===null)err(`${at}.input_unit`,'not_a_facts_unit');
  if(isStr(v.formula_version)&&v.formula_version!==FORMULA_VERSION)err(`${at}.formula_version`,'not_FORMULA_VERSION');
  if(typeof v.period_start==='string'&&typeof v.period_end==='string'){
   // derive.ts:138-145: INSTANT metrics (borrowings_total) have period_start === period_end.
   if(v.duration==='INSTANT'){if(v.period_start!==v.period_end)err(at,'instant_metric_requires_equal_period_dates');}
   else if(v.period_start>=v.period_end)err(at,'period_start_must_precede_period_end');
  }
  if(typeof v.period_start!=='string'||!DATE.test(v.period_start))err(`${at}.period_start`,'date');
  if(!unit||!isStr(v.metric)||!isStr(v.duration)||!isStr(v.basis)||!isStr(v.input_unit)||!isStr(v.formula_version)||typeof v.period_start!=='string'||typeof v.period_end!=='string')return null;
  return {type:'metric',metric:v.metric,period_start:v.period_start,period_end:v.period_end,duration:v.duration,basis:v.basis,input_unit:v.input_unit,formula_version:v.formula_version,unit};
 }
 err(`${at}.type`,'fact_or_metric');
 return null;
}

function parseSource(v:unknown,at:string,c:J,x:CaseCtx):CaseSource|null{
 const {err}=x;
 if(!isObj(v)){err(at,'required');return null;}
 for(const k of Object.keys(v))if(!SOURCE_KEYS.has(k))err(`${at}.${k}`,'unknown_key');
 let ok=true;
 if(!isStr(v.document_type)){err(`${at}.document_type`,'required');ok=false;}
 if(typeof v.url!=='string'||!/^https:\/\/[^\s]+$/.test(v.url)){err(`${at}.url`,'https_url_required');ok=false;}
 if(typeof v.sha256!=='string'||!HEX64.test(v.sha256)){err(`${at}.sha256`,'64_lowercase_hex_required');ok=false;}
 if(v.available_date!==undefined&&(typeof v.available_date!=='string'||!DATE.test(v.available_date))){err(`${at}.available_date`,'date');ok=false;}
 let documentId:DocumentId|undefined;
 if(v.document_id!==undefined){
  const d=isObj(v.document_id)?v.document_id:null;
  const kinds=['edgar_accession','cninfo_announcement','file_sha256','official_release'];
  if(!d||!kinds.includes(d.kind as string)||!isStr(d.value)||Object.keys(d).length!==2){err(`${at}.document_id`,'must_be_{kind,value}');ok=false;}
  else{
   if(d.kind==='edgar_accession'&&!ACCESSION.test(d.value as string)){err(`${at}.document_id.value`,'accession_format');ok=false;}
   if(d.kind==='cninfo_announcement'&&!/^\d+$/.test(d.value as string)){err(`${at}.document_id.value`,'digits');ok=false;}
   if(d.kind==='file_sha256'||d.kind==='official_release'){err(`${at}.document_id.kind`,'not_a_facts_document');ok=false;}
   documentId={kind:d.kind as DocumentId['kind'],value:d.value as string};
  }
 }
 let locator:Record<string,string|number>|undefined;
 if(v.locator!==undefined){
  const l=isObj(v.locator)?v.locator:null;
  // HTML row/table labels and printed page names (e.g. F-28) remain supported.
  const meaningful=l&&Object.entries(l).length>0&&Object.entries(l).every(([key,value])=>
   key.trim().length>0&&((typeof value==='string'&&value.trim().length>0)||(typeof value==='number'&&Number.isFinite(value))));
  const page=l?.page;
  const numericPage=typeof page==='number'?page:typeof page==='string'&&/^[+-]?\d+(\.\d+)?$/.test(page)?Number(page):null;
  if(!meaningful||(numericPage!==null&&(!Number.isSafeInteger(numericPage)||numericPage<=0))){err(`${at}.locator`,'non_empty_object_of_string_or_number');ok=false;}
  else locator=l as Record<string,string|number>;
 }
 if(c.expect==='present'&&v.locator===undefined){err(`${at}.locator`,'required_for_present');ok=false;}
 if(!ok)return null;
 return {document_type:v.document_type as string,...(documentId?{document_id:documentId}:{}),url:v.url as string,sha256:v.sha256 as string,
  ...(typeof v.available_date==='string'?{available_date:v.available_date}:{}),...(locator?{locator}:{})};
}
