// src/lib/evals/kinds/extraction.ts
// extraction_gold (spec §11.1, §3.3 extraction rows). NOT enabled (§16 D8: restricted-artifact licence
// pending; kinds/registry.ts). Pure field-level precision/recall over F3 labels and predictions.
// Matching per group (document_sha256, field), two deterministic steps:
//  1. Eligible pairs = same page, IoU ≥ 0.5 (2·inter ≥ union, no division), equal value (decimal:
//     compareWithinTolerance rel 0; text: NFKC + collapsed whitespace; date: ISO YYYY-MM-DD only; enum:
//     exact). Edges are totally ordered by (IoU desc via cross-multiplication; label bbox lexicographic asc;
//     prediction bbox asc; label index; prediction index). M = maximum matching size (Kuhn augmenting
//     paths); then edges are tried in that order and kept iff chosen + 1 + max matching of the remaining
//     graph = M: the result is the lexicographically first MAXIMUM matching → TP.
//  2. Remaining labels × remaining predictions, ordered by (value equal first; same-page IoU desc, a
//     cross-page pair counts IoU 0; label bbox; prediction bbox; label index; prediction index), paired
//     greedily one-to-one: equal value → FP_citation (counted in FP) + FN; different → FP + FN; unpaired
//     prediction → FP; unpaired label → FN.
// Per field across documents: P = TP/(TP+FP) (0 when there are no predictions and support > 0), R =
// TP/(TP+FN); pass ⇔ P ≥ 0.95 and R ≥ 0.95 (integer comparison 100·TP ≥ 95·den). Support 0 →
// skipped(zero_support). If ANY declared gold document (labelled or not) is unparseable or missing,
// every field → read_error(read_failed) listing all broken documents (→ incomplete). A prediction with invalid geometry never matches in step 1.
// Outputs for documents outside the gold set are ignored.
import {compareWithinTolerance} from '../compare';
import {EvalError} from '../errors';
import type {CaseOutcome,CaseReport,Summary,SummaryContext} from '../types';
import {ratioText} from './ratio';

export type ExtractionValueType='text'|'decimal'|'date'|'enum';
export type BBox=[number,number,number,number];
export interface ExtractionDocumentSpec{document_sha256:string;page_count:number;bbox_space:'pdf_points_top_left'}
export interface ExtractionLabel{label_id:string;document_sha256:string;field:string;occurrence:number;value_type:ExtractionValueType;value:string;locator:{page:number;bbox:BBox};recorded_by:string;reviewed_by:string}
export interface ExtractionGold{documents:ExtractionDocumentSpec[];labels:ExtractionLabel[]}
export interface PredictedField{field:string;value:string;page:number;bbox:BBox}
export type ExtractionOutput={document_sha256:string;status:'parsed';fields:PredictedField[]}|{document_sha256:string;status:'unparseable';error:string};
/** Indices into the group's label / prediction arrays. */
export interface GroupMatch{tp:[number,number][];citation:[number,number][];mismatch:[number,number][];unpairedPredictions:number[];unpairedLabels:number[]}
export interface FieldMetrics{field:string;tp:number;fp:number;fp_citation:number;fn:number;support:number;predictions:number;precision:string;recall:string;passed:boolean}
export interface ExtractionEvaluation{cases:CaseReport[];fields:Record<string,FieldMetrics>}

const VALUE_TYPES=new Set(['text','decimal','date','enum']);
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
interface Overlap{inter:number;union:number}
export function overlap(a:BBox,b:BBox):Overlap{
 const w=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])),h=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 const inter=w*h,area=(x:BBox)=>(x[2]-x[0])*(x[3]-x[1]);
 return {inter,union:area(a)+area(b)-inter};
}
const halfOrMore=(o:Overlap)=>o.union>0&&2*o.inter>=o.union;
/** > 0 when x has the higher IoU. */
const iouCmp=(x:Overlap,y:Overlap)=>x.inter*y.union-y.inter*x.union;
const bboxCmp=(a:BBox,b:BBox)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]||a[3]-b[3];
const validBox=(b:unknown):b is BBox=>Array.isArray(b)&&b.length===4&&b.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&b[0]<b[2]&&b[1]<b[3];
const normText=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
const isIsoDate=(s:unknown):s is string=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const t=Date.parse(`${s}T00:00:00Z`);return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s;};

export function valuesEqual(type:ExtractionValueType,a:string,b:string):boolean{
 if(typeof a!=='string'||typeof b!=='string')return false;
 switch(type){
  case 'decimal':try{return compareWithinTolerance(a.trim(),b.trim(),'0').passed;}catch{return false;}
  case 'date':{const x=a.trim(),y=b.trim();return isIsoDate(x)&&isIsoDate(y)&&x===y;}
  case 'text':return normText(a)===normText(b);
  case 'enum':return a.trim()===b.trim();
 }
}

interface Edge{l:number;p:number;o:Overlap}
function maxMatching(edges:Edge[],blockedL:Set<number>,blockedP:Set<number>):number{
 const adj=new Map<number,number[]>();
 for(const e of edges){if(blockedL.has(e.l)||blockedP.has(e.p))continue;const a=adj.get(e.l)??[];a.push(e.p);adj.set(e.l,a);}
 const owner=new Map<number,number>();
 const augment=(l:number,seen:Set<number>):boolean=>{
  for(const p of adj.get(l)??[]){
   if(seen.has(p))continue;seen.add(p);
   const cur=owner.get(p);
   if(cur===undefined||augment(cur,seen)){owner.set(p,l);return true;}
  }
  return false;
 };
 let n=0;
 for(const l of [...adj.keys()].sort((a,b)=>a-b))if(augment(l,new Set()))n++;
 return n;
}

export function matchGroup(labels:ExtractionLabel[],preds:PredictedField[]):GroupMatch{
 const edges:Edge[]=[];
 labels.forEach((L,l)=>preds.forEach((P,p)=>{
  if(L.locator.page!==P.page||!validBox(P.bbox))return;
  const o=overlap(L.locator.bbox,P.bbox);
  if(halfOrMore(o)&&valuesEqual(L.value_type,L.value,P.value))edges.push({l,p,o});
 }));
 edges.sort((x,y)=>iouCmp(y.o,x.o)||bboxCmp(labels[x.l].locator.bbox,labels[y.l].locator.bbox)||bboxCmp(preds[x.p].bbox,preds[y.p].bbox)||x.l-y.l||x.p-y.p);
 const M=maxMatching(edges,new Set(),new Set());
 const usedL=new Set<number>(),usedP=new Set<number>();const tp:[number,number][]=[];
 for(const e of edges){
  if(tp.length===M)break;
  if(usedL.has(e.l)||usedP.has(e.p))continue;
  usedL.add(e.l);usedP.add(e.p);
  if(tp.length+1+maxMatching(edges,usedL,usedP)===M)tp.push([e.l,e.p]);
  else{usedL.delete(e.l);usedP.delete(e.p);}
 }
 const restL=labels.map((_,i)=>i).filter(i=>!usedL.has(i)),restP=preds.map((_,i)=>i).filter(i=>!usedP.has(i));
 const pairs=restL.flatMap(l=>restP.map(p=>{
  const L=labels[l],P=preds[p];
  const o:Overlap=L.locator.page===P.page&&validBox(P.bbox)?overlap(L.locator.bbox,P.bbox):{inter:0,union:1};
  return {l,p,o,eq:valuesEqual(L.value_type,L.value,P.value)};
 }));
 pairs.sort((x,y)=>Number(y.eq)-Number(x.eq)||iouCmp(y.o,x.o)||Number(!validBox(preds[x.p].bbox))-Number(!validBox(preds[y.p].bbox))||bboxCmp(labels[x.l].locator.bbox,labels[y.l].locator.bbox)||(validBox(preds[x.p].bbox)&&validBox(preds[y.p].bbox)?bboxCmp(preds[x.p].bbox,preds[y.p].bbox):0)||x.l-y.l||x.p-y.p);
 const doneL=new Set<number>(),doneP=new Set<number>();const citation:[number,number][]=[],mismatch:[number,number][]=[];
 for(const q of pairs){
  if(doneL.has(q.l)||doneP.has(q.p))continue;
  doneL.add(q.l);doneP.add(q.p);(q.eq?citation:mismatch).push([q.l,q.p]);
 }
 return {tp,citation,mismatch,unpairedPredictions:restP.filter(p=>!doneP.has(p)),unpairedLabels:restL.filter(l=>!doneL.has(l))};
}

function validateGold(g:ExtractionGold):Map<string,ExtractionDocumentSpec>{
 const bad=(f:string):never=>{throw new EvalError('gold_invalid',`extraction gold: ${f}`,{field:f});};
 const docs=new Map<string,ExtractionDocumentSpec>();
 for(const d of g.documents){
  if(!/^[0-9a-f]{64}$/.test(d.document_sha256)||docs.has(d.document_sha256))bad(`document ${d.document_sha256}`);
  if(!Number.isSafeInteger(d.page_count)||d.page_count<1||d.bbox_space!=='pdf_points_top_left')bad(`document ${d.document_sha256} page_count/bbox_space`);
  docs.set(d.document_sha256,d);
 }
 const ids=new Set<string>();
 for(const l of g.labels){
  if(!l.label_id||ids.has(l.label_id))bad(`label_id ${l.label_id}`);ids.add(l.label_id);
  const d=docs.get(l.document_sha256);if(!d)bad(`label ${l.label_id}: unknown document`);
  if(!l.field||!Number.isSafeInteger(l.occurrence)||l.occurrence<1||!VALUE_TYPES.has(l.value_type)||typeof l.value!=='string')bad(`label ${l.label_id}: field/occurrence/value`);
  if(!Number.isSafeInteger(l.locator.page)||l.locator.page<1||l.locator.page>d!.page_count||!validBox(l.locator.bbox))bad(`label ${l.label_id}: locator`);
  if(l.value_type==='date'&&!isIsoDate(l.value))bad(`label ${l.label_id}: date value`);
  if(!l.recorded_by||!l.reviewed_by)bad(`label ${l.label_id}: recorded_by/reviewed_by`);
 }
 return docs;
}

export function evaluateExtraction(gold:ExtractionGold,outputs:ExtractionOutput[]):ExtractionEvaluation{
 const docs=validateGold(gold);
 const out=new Map<string,ExtractionOutput>();
 for(const o of outputs)if(docs.has(o.document_sha256))out.set(o.document_sha256,out.has(o.document_sha256)?{document_sha256:o.document_sha256,status:'unparseable',error:'duplicate_output'}:o);
 const parsedFields=(sha:string):PredictedField[]=>{const o=out.get(sha);return o&&o.status==='parsed'?o.fields:[];};
 const fieldNames=new Set<string>(gold.labels.map(l=>l.field));
 for(const sha of docs.keys())for(const p of parsedFields(sha))fieldNames.add(p.field);
 const brokenDocs=[...docs.keys()].filter(sha=>out.get(sha)?.status!=='parsed').sort(cmp);
 const cases:CaseReport[]=[];const fields:Record<string,FieldMetrics>={};
 const rep=(field:string,outcome:CaseOutcome,detail:Record<string,unknown>):CaseReport=>({case_id:field,required:true,outcome,left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail});
 for(const field of [...fieldNames].sort(cmp)){
  const labels=gold.labels.filter(l=>l.field===field);
  const labelDocs=[...new Set(labels.map(l=>l.document_sha256))].sort(cmp);
  if(brokenDocs.length>0){cases.push(rep(field,{result:'read_error',reason:'read_failed'},{documents:brokenDocs}));continue;}
  const predDocs=[...docs.keys()].filter(sha=>parsedFields(sha).some(p=>p.field===field));
  const predictions=predDocs.reduce((n,sha)=>n+parsedFields(sha).filter(p=>p.field===field).length,0);
  if(labels.length===0){cases.push(rep(field,{result:'skipped',reason:'zero_support'},{support:0,predictions}));continue;}
  let tp=0,fp=0,cit=0,fn=0;
  for(const sha of [...new Set([...labelDocs,...predDocs])].sort(cmp)){
   const m=matchGroup(labels.filter(l=>l.document_sha256===sha),parsedFields(sha).filter(p=>p.field===field));
   tp+=m.tp.length;cit+=m.citation.length;
   fp+=m.citation.length+m.mismatch.length+m.unpairedPredictions.length;
   fn+=m.citation.length+m.mismatch.length+m.unpairedLabels.length;
  }
  const passed=tp+fp>0&&100*tp>=95*(tp+fp)&&100*tp>=95*(tp+fn);
  const metrics:FieldMetrics={field,tp,fp,fp_citation:cit,fn,support:labels.length,predictions,
   precision:tp+fp===0?'0':ratioText(BigInt(tp),BigInt(tp+fp),4),recall:ratioText(BigInt(tp),BigInt(tp+fn),4),passed};
  fields[field]=metrics;
  const detail={tp,fp,fp_citation:cit,fn,support:labels.length,predictions,precision:metrics.precision,recall:metrics.recall};
  cases.push(rep(field,passed?{result:'pass'}:{result:'fail',reason:'value'},detail));
 }
 return {cases,fields};
}

/** The gold block comes from the caller (goldBlockOf(set)); thresholds are the §11.1 field gate (max_fail 0). */
export const extractionSummaryContext=(gold:Summary['gold']):SummaryContext=>({thresholds:{max_fail:0,min_coverage_optional:'0.95'},gold,subset:false,evidenceClass:'truth'});
