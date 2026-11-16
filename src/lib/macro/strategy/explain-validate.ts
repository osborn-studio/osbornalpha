// src/lib/macro/strategy/explain-validate.ts
// Explanation validator macro-explain-validator/1 (spec 2026-11-07 §6.3 "校验", draft 3 N10). A LEXICAL policy, not a
// semantic proof: it guarantees the model text holds no recognisable numeral token, forbidden term or regime term; it
// does not guarantee a hypothesis is right (the panel header says so). Steps: parse → ajv structure (counts, lengths) →
// every fact_id known → NFKC → numeral / forbidden_term / regime_term checks per text. Every failure (code, section,
// index, matched fragment) goes to the run row; the projection keeps only the code set. This file and its test are the
// only places allowed to spell the forbidden terms (spec §12, forbidden-terms scan exclusion).
import Ajv from 'ajv';
import {VERSIONS} from './contract';

export const VALIDATOR_VERSION=VERSIONS.validator;
export type FailureCode='parse'|'schema'|'unknown_fact'|'numeral'|'forbidden_term'|'regime_term';
export interface ValidationFailure{code:FailureCode;section:'output'|'points'|'counterpoints';index:number|null;match:string|null}
export interface ModelOutput{points:{fact_ids:string[];hypothesis:string}[];counterpoints:{fact_ids:string[];text:string}[]}
export type ValidationResult={ok:true;output:ModelOutput;failures:[]}|{ok:false;codes:FailureCode[];failures:ValidationFailure[]};

/** Chinese terms match as substrings; English terms on word boundaries, case-insensitive (spaces match any whitespace). */
export const FORBIDDEN_TERMS:readonly string[]=['概率','置信','胜率','把握','可能性为','赔率','将会','必然','一定会',
 'probability','probable','confidence','likelihood','odds','win rate','chance of','will rise','will fall','will increase','will decrease','is going to'];
/** v1 explanations carry no judgment, so the four regime names are always rejected (spec §6.3 step 6, §7.7). */
export const REGIME_TERMS:readonly string[]=['复苏','过热','滞胀','衰退','recovery','overheat','overheating','stagflation','recession'];

const CN_NUMERAL='[〇零一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟]+';
const EN_NUMBER_WORDS=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen',
 'sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','million','billion',
 'half','double','twice','triple','dozen'];
/** Numeral rules, applied to NFKC-normalised text. */
export const NUMERAL_PATTERNS:readonly RegExp[]=[
 /[\p{Nd}\p{No}]/u,                                               // any Unicode decimal / other digit (full-width and circled forms fold or match here)
 /[%‰‱]/u,
 /(?<![A-Za-z])(?:bps?|pp)(?![A-Za-z])/i,                         // bp / bps / pp as standalone letters (also after a digit)
 /基点|百分点|百分之/u,
 new RegExp(`第${CN_NUMERAL}`,'u'),                               // ordinal: 第二
 new RegExp(`${CN_NUMERAL}(?:个百分点|基点|[个次年月日周倍成点%])`,'u'),   // quantity context: 三个月, 两倍, 三成
 new RegExp(`\\b(?:${EN_NUMBER_WORDS.join('|')})\\b`,'i'),
];
const escapeRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const termPattern=(t:string):RegExp=>/^[\x00-\x7f]+$/.test(t)?new RegExp(`\\b${t.split(' ').map(escapeRe).join('\\s+')}\\b`,'i'):new RegExp(escapeRe(t),'u');
const FORBIDDEN_PATTERNS=FORBIDDEN_TERMS.map(termPattern);
const REGIME_PATTERNS=REGIME_TERMS.map(termPattern);

const item=(textKey:'hypothesis'|'text')=>({type:'object',additionalProperties:false,required:['fact_ids',textKey],properties:{
 fact_ids:{type:'array',minItems:1,maxItems:4,items:{type:'string',minLength:1,maxLength:160}},[textKey]:{type:'string',minLength:1,maxLength:240}}});
const validateShape=new Ajv({strict:true,allErrors:false}).compile<{points:ModelOutput['points'];counterpoints?:ModelOutput['counterpoints']}>({type:'object',additionalProperties:false,required:['points'],properties:{
 points:{type:'array',minItems:1,maxItems:6,items:item('hypothesis')},counterpoints:{type:'array',minItems:0,maxItems:6,items:item('text')}}});

/** Model content → JSON value; a surrounding ```json fence is tolerated, nothing else. */
export function parseModelContent(content:string):unknown{
 const t=content.trim();const fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
 try{return JSON.parse(fenced?fenced[1]:t);}catch{return undefined;}
}
/** Every distinct matched fragment of each rule family in one text (already NFKC-normalised by the caller), families in
 *  the order numeral, forbidden_term, regime_term; within a family, pattern order then position (spec §6.3: all failure items). */
export function lexicalFailures(text:string):{code:'numeral'|'forbidden_term'|'regime_term';match:string}[]{
 const out:{code:'numeral'|'forbidden_term'|'regime_term';match:string}[]=[];
 const all=(code:'numeral'|'forbidden_term'|'regime_term',ps:readonly RegExp[])=>{
  const seen=new Set<string>();
  for(const p of ps)for(const m of text.matchAll(new RegExp(p.source,p.flags.includes('g')?p.flags:`${p.flags}g`)))if(!seen.has(m[0])){seen.add(m[0]);out.push({code,match:m[0]});}
 };
 all('numeral',NUMERAL_PATTERNS);all('forbidden_term',FORBIDDEN_PATTERNS);all('regime_term',REGIME_PATTERNS);
 return out;
}
export function validateExplanation(raw:unknown,factIds:ReadonlySet<string>):ValidationResult{
 const fail=(failures:ValidationFailure[]):ValidationResult=>({ok:false,codes:[...new Set(failures.map(x=>x.code))].sort(),failures});
 if(raw===undefined)return fail([{code:'parse',section:'output',index:null,match:null}]);
 if(!validateShape(raw))return fail([{code:'schema',section:'output',index:null,match:validateShape.errors?.[0]?.instancePath||null}]);
 const output:ModelOutput={points:raw.points,counterpoints:raw.counterpoints??[]};
 const failures:ValidationFailure[]=[];
 const sections:[ 'points'|'counterpoints',{fact_ids:string[];text:string}[]][]=[['points',output.points.map(p=>({fact_ids:p.fact_ids,text:p.hypothesis}))],['counterpoints',output.counterpoints]];
 for(const [section,items] of sections)items.forEach((x,index)=>{
  for(const id of x.fact_ids)if(!factIds.has(id))failures.push({code:'unknown_fact',section,index,match:id});
  for(const l of lexicalFailures(x.text.normalize('NFKC')))failures.push({...l,section,index});
 });
 return failures.length?fail(failures):{ok:true,output,failures:[]};
}
