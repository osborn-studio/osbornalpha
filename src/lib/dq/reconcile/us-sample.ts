// src/lib/dq/reconcile/us-sample.ts
// US iXBRL sample manifest (spec §5.3; schema 'us-ixbrl-sample/1'). The manifest freezes members and expected
// keys of us.companyfacts_vs_ixbrl. Expected keys are the UNION of two independent sources: (a) plan 2's
// companyfacts adapter on the accession's raw snapshot (candidates, ambiguous and odd-duration entries of that
// accession), (b) the iXBRL parser on the primary document (filer entity only, tag in FACT_CONCEPTS, unit kind
// and period nature matching the concept, period end >= sinceYear-01-01, highest-priority tag per key). A key
// from one source only is still expected — at run time it becomes left_missing or right_missing and exposes
// the adapter's or parser's gap instead of shrinking the denominator. Each side needs >= 4 keys. pickSample is
// the §5.3 selection: required (plan-2 gold) tickers, the rest at equal steps in ticker order up to n, then
// quota swaps (>= 3 NYSE, >= 3 Nasdaq, >= 2 fiscal year end not 12-31, >= 2 not large accelerated); a quota
// that cannot be met is reported, never faked.
import {FACT_CONCEPTS,conceptById} from '../../facts/concepts';
import {parseCompanyFacts,tagsOf} from '../../facts/providers/edgar-companyfacts';
import type {ConceptDef,FactCandidate,ParseResult,RawSnapshot} from '../../facts/types';
import {unitKindOf} from '../../facts/units';
import {parseInlineXbrl} from './ixbrl';
import type {IxbrlDocument} from './ixbrl';
import {sha256Hex} from './pair-support';

export const US_SAMPLE_SCHEMA='us-ixbrl-sample/1';
export const US_SAMPLE_PATH='src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json';
export const MIN_KEYS_PER_SIDE=4;
export type KeyOrigin='left'|'right'|'both';
export interface SampleKey{concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:KeyOrigin}
export interface SampleFiling{accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;raw_sha256:string;doc_sha256:string;expected_keys:SampleKey[]}
export interface SampleIssuer{cik:string;ticker:string;regime:'10-K'|'20-F';filings:SampleFiling[]}
export interface UsSample{schema:typeof US_SAMPLE_SCHEMA;generated_at:string;selection:string;issuers:SampleIssuer[]}
type KeyCore=Omit<SampleKey,'origin'>;

export const usNaturalKey=(cik:string,accn:string,k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${cik}:${accn}:${k.concept}:${k.period_start??''}:${k.period_end}:${k.unit}`;
const kk=(k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${k.concept}|${k.period_start??''}|${k.period_end}|${k.unit}`;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const TAG_CONCEPT=(()=>{const m=new Map<string,ConceptDef>();for(const c of FACT_CONCEPTS)for(const t of tagsOf(c))if(!m.has(t))m.set(t,c);return m;})();

/** The context entity is the SEC CIK of the filer (identifier compared without leading zeros). */
export const entityIs=(entity:string,cik:string):boolean=>entity.startsWith('http://www.sec.gov/CIK#')&&entity.slice(entity.indexOf('#')+1).replace(/^0+/,'')===cik.replace(/^0+/,'');

export function companyfactsKeys(parse:ParseResult,accn:string):Map<string,KeyCore>{
 const out=new Map<string,KeyCore>();
 const add=(c:FactCandidate)=>{if(c.filingRef!==accn)return;const k={concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,unit:c.unit,source_concept:c.sourceConcept};if(!out.has(kk(k)))out.set(kk(k),k);};
 parse.candidates.forEach(add);parse.ambiguous.forEach(a=>a.candidates.forEach(add));parse.oddDuration.forEach(add);
 return out;
}
export function ixbrlKeys(doc:IxbrlDocument,cik:string,sinceDate:string):Map<string,KeyCore>{
 const out=new Map<string,KeyCore>();
 for(const f of doc.facts){
  if(!entityIs(f.entity,cik))continue;
  const c=TAG_CONCEPT.get(f.name);
  if(!c||unitKindOf(f.unit)!==c.unitKind||(c.nature==='duration')!==(f.periodStart!==null)||f.periodEnd<sinceDate)continue;
  const k={concept:c.id,period_start:f.periodStart,period_end:f.periodEnd,unit:f.unit,source_concept:f.name};
  const prev=out.get(kk(k));
  if(!prev||tagsOf(c).indexOf(f.name)<tagsOf(c).indexOf(prev.source_concept))out.set(kk(k),k);
 }
 return out;
}

export interface BuildFilingInput{cik:string;accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;companyfacts:RawSnapshot;doc:Uint8Array;doc_sha256?:string;sinceYear:number}
export function buildSampleFiling(i:BuildFilingInput):SampleFiling{
 const left=companyfactsKeys(parseCompanyFacts(i.companyfacts,{sinceYear:i.sinceYear}),i.accn);
 const right=ixbrlKeys(parseInlineXbrl(new TextDecoder('utf-8').decode(i.doc)),i.cik,`${i.sinceYear}-01-01`);
 const keys:SampleKey[]=[];
 for(const [k,v] of left)keys.push({...v,origin:right.has(k)?'both':'left'});
 for(const [k,v] of right)if(!left.has(k))keys.push({...v,origin:'right'});
 keys.sort((a,b)=>cmp(kk(a),kk(b)));
 const nLeft=keys.filter(k=>k.origin!=='right').length,nRight=keys.filter(k=>k.origin!=='left').length;
 if(nLeft<MIN_KEYS_PER_SIDE||nRight<MIN_KEYS_PER_SIDE)throw new Error(`sample_side_too_small:${i.accn}:left=${nLeft}:right=${nRight}`);
 return {accn:i.accn,form:i.form,period_end:i.period_end,primary_document:i.primary_document,doc_url:i.doc_url,is_inline_xbrl:i.is_inline_xbrl,submissions_category:i.submissions_category,raw_sha256:i.companyfacts.sha256,doc_sha256:i.doc_sha256??sha256Hex(i.doc),expected_keys:keys};
}

const DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,ACCN=/^\d{10}-\d{2}-\d{6}$/;
export function validateUsSample(json:unknown):{ok:true;sample:UsSample}|{ok:false;errors:string[]}{
 const errors:string[]=[];const e=(m:string)=>{errors.push(m);};
 const s=json as Partial<UsSample>|null;
 if(!s||typeof s!=='object')return {ok:false,errors:['not_an_object']};
 if(s.schema!==US_SAMPLE_SCHEMA)e('schema');
 if(typeof s.generated_at!=='string'||Number.isNaN(Date.parse(s.generated_at)))e('generated_at');
 if(typeof s.selection!=='string'||s.selection==='')e('selection');
 if(!Array.isArray(s.issuers)||s.issuers.length===0)return {ok:false,errors:[...errors,'issuers']};
 const nks=new Set<string>();
 s.issuers.forEach((iss,ii)=>{
  const at=`issuers[${ii}]`;
  if(typeof iss?.cik!=='string'||!/^[1-9]\d{0,9}$/.test(iss.cik))e(`${at}.cik`);
  if(typeof iss?.ticker!=='string'||iss.ticker==='')e(`${at}.ticker`);
  if(iss?.regime!=='10-K'&&iss?.regime!=='20-F')e(`${at}.regime`);
  if(!Array.isArray(iss?.filings)||iss.filings.length===0){e(`${at}.filings`);return;}
  iss.filings.forEach((f,fi)=>{
   const fa=`${at}.filings[${fi}]`;
   if(typeof f?.accn!=='string'||!ACCN.test(f.accn))e(`${fa}.accn`);
   if(typeof f?.form!=='string'||f.form==='')e(`${fa}.form`);
   if(f?.period_end!==null&&!(typeof f?.period_end==='string'&&DATE.test(f.period_end)))e(`${fa}.period_end`);
   if(typeof f?.primary_document!=='string'||f.primary_document==='')e(`${fa}.primary_document`);
   if(typeof f?.doc_url!=='string'||!f.doc_url.startsWith(`https://www.sec.gov/Archives/edgar/data/${iss.cik}/`)||/[?#@]/.test(f.doc_url))e(`${fa}.doc_url`);
   if(f?.is_inline_xbrl!==null&&typeof f?.is_inline_xbrl!=='boolean')e(`${fa}.is_inline_xbrl`);
   if(f?.submissions_category!==null&&typeof f?.submissions_category!=='string')e(`${fa}.submissions_category`);
   if(typeof f?.raw_sha256!=='string'||!SHA.test(f.raw_sha256))e(`${fa}.raw_sha256`);
   if(typeof f?.doc_sha256!=='string'||!SHA.test(f.doc_sha256))e(`${fa}.doc_sha256`);
   if(!Array.isArray(f?.expected_keys)){e(`${fa}.expected_keys`);return;}
   let nl=0,nr=0;
   f.expected_keys.forEach((k,ki)=>{
    const ka=`${fa}.expected_keys[${ki}]`;
    const def=typeof k?.concept==='string'?conceptById(k.concept):undefined;
    if(!def)e(`${ka}.concept`);
    if(k?.period_start!==null&&!(typeof k?.period_start==='string'&&DATE.test(k.period_start)))e(`${ka}.period_start`);
    if(typeof k?.period_end!=='string'||!DATE.test(k.period_end))e(`${ka}.period_end`);
    if(typeof k?.unit!=='string'||k.unit==='')e(`${ka}.unit`);
    if(typeof k?.source_concept!=='string'||k.source_concept==='')e(`${ka}.source_concept`);
    if(k?.origin!=='left'&&k?.origin!=='right'&&k?.origin!=='both')e(`${ka}.origin`);
    if(k?.origin!=='right')nl++;if(k?.origin!=='left')nr++;
    const nk=usNaturalKey(String(iss.cik),String(f.accn),k);
    if(nks.has(nk))e(`${ka}: duplicate ${nk}`);nks.add(nk);
   });
   if(nl<MIN_KEYS_PER_SIDE||nr<MIN_KEYS_PER_SIDE)e(`${fa}: fewer than ${MIN_KEYS_PER_SIDE} keys per side (left=${nl}, right=${nr})`);
  });
 });
 return errors.length>0?{ok:false,errors}:{ok:true,sample:s as UsSample};
}

export interface SampleCandidate{ticker:string;cik:string;exchange:string|null;fiscalYearEnd:string|null;acceleration:'large_accelerated'|'accelerated'|'non_accelerated'|null}
const QUOTAS:readonly {name:string;min:number;test:(c:SampleCandidate)=>boolean}[]=[
 {name:'nyse',min:3,test:c=>c.exchange==='NYSE'},
 {name:'nasdaq',min:3,test:c=>c.exchange!==null&&c.exchange.toLowerCase()==='nasdaq'},
 {name:'fye_not_1231',min:2,test:c=>c.fiscalYearEnd!==null&&c.fiscalYearEnd!=='1231'},
 {name:'not_large_accelerated',min:2,test:c=>c.acceleration!==null&&c.acceleration!=='large_accelerated'},
];
export function pickSample(candidates:readonly SampleCandidate[],required:readonly string[],n=30):{picked:SampleCandidate[];unmet:string[]}{
 const sorted=[...candidates].sort((a,b)=>cmp(a.ticker,b.ticker));
 const req=new Set(required);
 const picked=sorted.filter(c=>req.has(c.ticker));
 const others=sorted.filter(c=>!req.has(c.ticker));
 const k=Math.max(0,Math.min(n-picked.length,others.length));
 for(let i=0;i<k;i++)picked.push(others[Math.floor(i*others.length/k)]);
 const count=(q:typeof QUOTAS[number])=>picked.filter(q.test).length;
 for(const q of QUOTAS){
  while(count(q)<q.min){
   const incoming=sorted.find(c=>!picked.includes(c)&&q.test(c));
   if(!incoming)break;
   if(picked.length<n){picked.push(incoming);continue;}
   const out=[...picked.keys()].reverse().find(i=>!req.has(picked[i].ticker)&&!q.test(picked[i])&&QUOTAS.every(o=>o===q||!o.test(picked[i])||count(o)>o.min));
   if(out===undefined)break;
   picked.splice(out,1,incoming);
  }
 }
 return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:QUOTAS.filter(q=>count(q)<q.min).map(q=>q.name)};
}
