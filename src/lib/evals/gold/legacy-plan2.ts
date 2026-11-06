// src/lib/evals/gold/legacy-plan2.ts
// Read-only adapter for plan 2's gold file src/lib/facts/fixtures/gold/plan2.json (spec §0 R5-1, §4.6
// legacy exception). It adopts the file without copying it: version / ready / required, entry identity
// and '<pending>' state are kept; nothing is inferred — no document binding, printed value, hash,
// locator structure or reviewer. Every F6 provenance field an entry lacks is listed in provenance_gaps,
// so §3.2 rule 1 keeps a legacy set incomplete until it is migrated to the f6 format. It throws
// EvalError('gold_invalid') only for a structurally invalid file; pending entries and gaps never throw.
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import type {Duration} from '../../facts/types';
import {EvalError} from '../errors';
import type {GoldCase,GoldSet} from '../types';
import {specOfUnit} from './schema';

export const LEGACY_SET_ID='facts/plan2';
export const LEGACY_IMPLEMENTERS:readonly string[]=['claude-code','codex'];
const PENDING='<pending>';
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const DURATIONS:readonly Duration[]=['3M','6M','9M','12M','INSTANT'];
type J=Record<string,unknown>;
const isObj=(v:unknown):v is J=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const blank=(v:unknown)=>v===undefined||v===null||(typeof v==='string'&&(v.trim()===''||v===PENDING));

export function parseLegacyPlan2(raw:unknown,meta:{path:string;sha256:string}):GoldSet{
 const bad=(at:string,code:string):never=>{throw new EvalError('gold_invalid',`${meta.path}: ${at}: ${code}`,{path:meta.path,errors:[`${at}: ${code}`]});};
 if(!isObj(raw))return bad('$','not_an_object');
 if(typeof raw.version!=='number'||!Number.isSafeInteger(raw.version)||raw.version<1)bad('version','integer_>=_1');
 if(typeof raw.ready!=='boolean')bad('ready','boolean');
 const req=isObj(raw.required)?raw.required:null;
 if(!req||typeof req.US!=='boolean'||typeof req.CN!=='boolean')bad('required','{US:boolean,CN:boolean}');
 if(!Array.isArray(raw.entries))bad('entries','array');
 const cases:GoldCase[]=[];
 const ids=new Set<string>();
 (raw.entries as unknown[]).forEach((e,i)=>{
  const at=`entries[${i}]`;
  if(!isObj(e))bad(at,'not_an_object');
  const entry=e as J;
  const issuer=isObj(entry.issuer)?entry.issuer:null;
  if(!issuer||typeof issuer.ticker!=='string'||issuer.ticker===''||(issuer.market!=='US'&&issuer.market!=='CN'))bad(`${at}.issuer`,'{ticker,market:US|CN}');
  const market=issuer!.market as 'US'|'CN',ticker=issuer!.ticker as string;
  const def=typeof entry.concept==='string'?conceptById(entry.concept):undefined;
  if(!def)bad(`${at}.concept`,'not_in_CONCEPT_IDS');
  if(typeof entry.period_end!=='string'||!DATE.test(entry.period_end))bad(`${at}.period_end`,'date');
  if(entry.duration!==undefined&&!DURATIONS.includes(entry.duration as Duration))bad(`${at}.duration`,'invalid');
  const duration:Duration=(entry.duration as Duration|undefined)??(def!.nature==='instant'?'INSTANT':'12M');
  const unit=typeof entry.unit==='string'?specOfUnit(entry.unit):null;
  if(!unit)bad(`${at}.unit`,'not_a_facts_unit');
  if(typeof entry.value!=='string')bad(`${at}.value`,'string');
  let canonical:GoldCase['canonical'];
  if(entry.value!==PENDING){
   try{canonical={value:canonicalDecimal(entry.value as string)};}catch{bad(`${at}.value`,'decimal_or_<pending>');}
  }
  if(entry.as_of!==undefined&&entry.as_of!==null&&(typeof entry.as_of!=='string'||!DATE.test(entry.as_of)))bad(`${at}.as_of`,'date_or_null');
  if(entry.source!==undefined&&!isObj(entry.source))bad(`${at}.source`,'object');
  const src=(entry.source??{}) as J;
  for(const k of ['document','page_or_row','url'])if(src[k]!==undefined&&typeof src[k]!=='string')bad(`${at}.source.${k}`,'string');
  if(typeof entry.recorded_by!=='string')bad(`${at}.recorded_by`,'string');
  if(entry.recorded_at!==undefined&&entry.recorded_at!==null&&typeof entry.recorded_at!=='string')bad(`${at}.recorded_at`,'string_or_null');
  const caseId=`${ticker}/${def!.id}/${entry.period_end}/${duration}/${entry.unit}`;
  if(ids.has(caseId))bad(`${at}`,`duplicate_case:${caseId}`);
  ids.add(caseId);
  const recordedBy=entry.recorded_by as string;
  const pending=recordedBy===PENDING||entry.value===PENDING;
  const gaps=[
   'source.document_id','source.sha256',
   ...(blank(src.url)?['source.url']:[]),
   ...(blank(src.page_or_row)?['source.locator']:[]),
   'printed',
   ...(canonical?[]:['canonical']),
   ...(recordedBy===PENDING||recordedBy.trim()===''?['recorded_by']:[]),
   ...(blank(entry.recorded_at)?['recorded_at']:[]),
   'reviewed_by',
  ];
  cases.push({
   case_id:caseId,subject:{market,ticker},
   target:{type:'fact',concept:def!.id,period_end:entry.period_end as string,duration,consolidation:'consolidated',unit:unit!},
   expect:'present',...(canonical?{canonical}:{}),binding:'current',as_of:(entry.as_of as string|null|undefined)??null,
   source:{document_type:'unspecified',url:blank(src.url)?'':src.url as string,...(blank(src.page_or_row)?{}:{locator:{page_or_row:src.page_or_row as string}})},
   provenance_kind:'transcribed',recorded_by:recordedBy,recorded_at:blank(entry.recorded_at)?null:entry.recorded_at as string,
   reviewed_by:null,reviewed_at:null,retracted:null,notes:typeof src.document==='string'?src.document:'',
   required:market==='US'?req!.US as boolean:req!.CN as boolean,pending,provenance_gaps:gaps,
  });
 });
 return {
  schema_version:1,format:'legacy_plan2',set_id:LEGACY_SET_ID,version:raw.version as number,module:'facts',artifact_class:'public',
  module_implementers:[...LEGACY_IMPLEMENTERS],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},
  optional_cases:cases.filter(c=>!c.required).map(c=>c.case_id),history:[],review_required:false,cases,ready:raw.ready as boolean,path:meta.path,sha256:meta.sha256,
 };
}
