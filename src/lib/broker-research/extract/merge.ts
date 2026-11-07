// Chunk merge (spec §6.2, MERGE_VERSION) and candidate-row assembly for broker_extract_commit.
// Candidate identity = (target_key, field, occurrence). Equal typed values collapse; distinct
// values remain in one conflict group without an automatic selection. Confidence is display only.
import type {CandidateFieldInput,FieldName} from '../types';
import {parseBrokerTicker} from '../tickers';
import {LOCATE_VERSION,MERGE_VERSION,TYPED_VERSION} from '../versions';
import {locateQuote,type PageText} from './locate';
import type {DocumentExtraction,Evidence,ExtractionScope,TargetExtraction} from './schema';
import {toTyped} from './typed';

export interface ChunkExtraction{chunk:number;extraction:DocumentExtraction}
export interface MergedCandidate{target_key:string|null;field:FieldName;occurrence:number;evidence:Evidence;merged_from:number[];conflict_group:string|null;normalized:string}
export interface MergedTarget{target_key:string;tickers_as_stated:string[];exchange_hint:string|null}
export interface MergeResult{version:string;scope:ExtractionScope|null;scopes:ExtractionScope[];targets:MergedTarget[];candidates:MergedCandidate[]}

const REPORT_FIELDS:readonly [Exclude<keyof DocumentExtraction,'scope'|'analysts'|'targets'>,FieldName][]=[['institution','institution'],['published_date','published_date'],['title','title'],['sector','sector'],['valuation_method','valuation_method'],['wacc','wacc'],['terminal_growth','terminal_growth'],['terminal_value_share','terminal_value_share']];
const TARGET_FIELDS:readonly [Exclude<keyof TargetExtraction,'ticker'|'exchange_hint'>,FieldName][]=[['rating','rating'],['target_price','target_price'],['target_currency','target_currency'],['target_horizon_months','target_horizon'],['price_at_report','price_at_report'],['price_currency','price_currency'],['price_as_of_date','price_as_of_date'],['upside_stated','upside_stated']];
const CURRENCY_FIELDS:readonly FieldName[]=['target_currency','price_currency'];
const BY_VALUE:readonly FieldName[]=['analyst','ticker'];

const squash=(s:string)=>s.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
/** Comparison key of a value: typed components when conversion succeeds, else squashed text. */
export function normalizedValue(field:FieldName,value:string):string{
 if(BY_VALUE.includes(field))return squash(value);
 const t=toTyped(field,value);
 if(t.failure!==null||(t.value.value_num===null&&t.value.value_date===null&&t.value.value_currency===null))return `text:${squash(value)}`;
 return `typed:${t.value.value_num??''}|${t.value.value_date??''}|${t.value.value_currency??''}|${t.value.value_unit??''}`;
}
export const conflictGroupId=(targetKey:string|null,field:FieldName,occurrence:number)=>`conflict:${targetKey??'-'}:${field}:${occurrence}`;

interface Entry{target_key:string|null;field:FieldName;evidence:Evidence;chunk:number;seq:number}

export function mergeChunks(chunks:ChunkExtraction[]):MergeResult{
 const ordered=[...chunks].sort((x,y)=>x.chunk-y.chunk);
 if(new Set(ordered.map(c=>c.chunk)).size!==ordered.length)throw new Error('duplicate_chunk');
 const entries:Entry[]=[];const targets=new Map<string,MergedTarget>();const scopes:ExtractionScope[]=[];
 let seq=0;
 const add=(target_key:string|null,field:FieldName,evidence:Evidence|undefined,chunk:number)=>{if(evidence)entries.push({target_key,field,evidence,chunk,seq:seq++});};
 for(const {chunk,extraction:x} of ordered){
  if(!scopes.includes(x.scope))scopes.push(x.scope);
  for(const [k,f] of REPORT_FIELDS)add(null,f,x[k],chunk);
  for(const a of x.analysts)add(null,'analyst',a,chunk);
  for(const t of x.targets){
   const key=parseBrokerTicker(t.ticker.value,t.exchange_hint).targetKey;
   const mt=targets.get(key)??{target_key:key,tickers_as_stated:[],exchange_hint:null};
   if(!mt.tickers_as_stated.includes(t.ticker.value))mt.tickers_as_stated.push(t.ticker.value);
   if(mt.exchange_hint===null&&t.exchange_hint)mt.exchange_hint=t.exchange_hint;
   targets.set(key,mt);
   add(key,'ticker',t.ticker,chunk);
   for(const [k,f] of TARGET_FIELDS)add(key,f,t[k],chunk);
  }
 }
 // Group by (target_key, field) in first-appearance order, then by normalized value.
 const groups=new Map<string,Map<string,Entry[]>>();
 for(const e of entries){
  const gk=JSON.stringify([e.target_key,e.field]);
  const g=groups.get(gk)??new Map<string,Entry[]>();
  const nk=normalizedValue(e.field,e.evidence.value);
  g.set(nk,[...(g.get(nk)??[]),e]);
  groups.set(gk,g);
 }
 const candidates:MergedCandidate[]=[];
 for(const g of groups.values()){
  const values=[...g.entries()];
  const conflicted=values.length>1&&!BY_VALUE.includes(values[0][1][0].field);
  values.forEach(([normalized,list],i)=>{
   const best=[...list].sort((x,y)=>x.evidence.page-y.evidence.page||x.chunk-y.chunk||x.seq-y.seq)[0];
   const occurrence=conflicted?1:BY_VALUE.includes(best.field)?i+1:1;
   candidates.push({target_key:best.target_key,field:best.field,occurrence,evidence:best.evidence,
    merged_from:[...new Set(list.map(e=>e.chunk))].sort((x,y)=>x-y),
    conflict_group:conflicted?conflictGroupId(best.target_key,best.field,1):null,normalized});
  });
 }
 return {version:MERGE_VERSION,scope:scopes.length===1?scopes[0]:null,scopes,targets:[...targets.values()],candidates};
}

export interface CandidateRowOptions{pages:PageText;extractor:string;resolutions?:ReadonlyMap<string,Record<string,unknown>>}
/** Locate and type each candidate (spec §5.2, §5.3); unlocated quotes stay private in detail. */
export function buildCandidateRows(merge:MergeResult,opts:CandidateRowOptions):CandidateFieldInput[]{
 return merge.candidates.map(c=>{
  const ev=c.evidence;
  const loc=locateQuote(opts.pages,ev.page,ev.quote);
  const typed=toTyped(c.field,ev.value,CURRENCY_FIELDS.includes(c.field)?ev.quote:undefined);
  const located=loc.status==='located';
  const detail:Record<string,unknown>={merge:MERGE_VERSION,locate:LOCATE_VERSION,typed:TYPED_VERSION,merged_from:c.merged_from};
  if(loc.status==='located'&&loc.multiple_hits)detail.multiple_hits=loc.multiple_hits;
  if(loc.status==='unverified'){detail.locate_failure=loc.reason;detail.quote=ev.quote;}
  if(typed.failure)detail.typed_failure=typed.failure;
  const resolution=c.field==='ticker'&&c.target_key!==null?opts.resolutions?.get(c.target_key):undefined;
  return {
   target_key:c.target_key,field:c.field,occurrence:c.occurrence,...typed.value,
   page:ev.page,char_start:located?loc.char_start:null,char_end:located?loc.char_end:null,value_source_text:located?ev.quote:null,
   extractor:opts.extractor,extractor_confidence:ev.confidence,conflict_group:c.conflict_group,detail,
   status:located?'extracted':'unverified',...(resolution?{resolution}:{}),
  };
 });
}
