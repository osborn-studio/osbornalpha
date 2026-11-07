// src/lib/evals/kinds/extraction.test.ts
// Hand-computed fixtures (spec §11.1). Boxes of one size slide along y: for two w×h boxes offset by d in y,
// inter = w·(h−d), union = 2·w·h − inter, so IoU = (h−d)/(h+d).
//  Adversarial D1 (3 pages), field revenue (decimal):
//   L1 '100' p1 [0,10,10,20]   L2 '100' p1 [0,13,10,23]   L3 '200' p2 [0,10,10,20]   L4 '300' p3 [100,100,200,120]
//   P1 '100' p1 [0,11,10,21]   P2 '100.00' p1 [0,8,10,18]   P3 '200' p3 [0,10,10,20] (wrong page)   P4 '301' p3 [100,100,200,120]   P5 '999' p1 [300,300,310,310]
//   step-1 edges: (L1,P1) IoU 9/11, (L1,P2) 8/12, (L2,P1) 8/12; (L2,P2) d=5 → 5/15 < 0.5 (no edge).
//   Greedy by IoU takes (L1,P1) and strands L2 → 1 TP; the maximum matching is {(L1,P2),(L2,P1)} → TP 2.
//   step 2: (L3,P3) value-equal, mislocated → FP_citation + FN; (L4,P4) value ≠ → FP + FN; P5 unpaired → FP.
//   revenue: TP 2, FP 3 (1 citation), FN 2, support 4 → P = 2/5 = 0.4, R = 2/4 = 0.5 → fail.
//   net_income: one label, zero predictions → P = 0 (prediction count 0, support > 0), R = 0 → fail.
//   fiscal_year_end (date): 50×10 boxes, d = 1 → 9/11 → TP → P = R = 1 → pass.
//   company_name (text): 'Acme  Corp' vs 'Ａｃｍｅ Corp' (NFKC + whitespace) same box → TP → pass.
//   auditor: predicted only → skipped(zero_support).
//  Crossed D2 (2 pages), total_assets '500', 100×20 boxes:
//   A p1 [0,0,100,20]   B p2 [0,10,100,30]   X p1 [0,6,100,26]   Y p2 [0,4,100,24]
//   same page: (A,X) d=6 → 14/26 ≥ 0.5, (B,Y) d=6 → 14/26; across pages (coordinates only): (A,Y) d=4 → 16/24, (B,X) d=4 → 16/24 — higher, but never eligible → 2 TP.
//  All-parsed D3: label '10' p1 [0,0,10,10], prediction '11' same box → TP 0, FP 1, FN 1 → fail.
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {summarize} from '../summary';
import {evaluateExtraction,extractionSummaryContext,matchGroup,overlap,valuesEqual} from './extraction';
import type {BBox,ExtractionGold,ExtractionLabel,ExtractionOutput,PredictedField} from './extraction';

const GOLD={format:'f6' as const,ready:true,pending:0,provenance_gaps:0};
const D1='a'.repeat(64),D2='b'.repeat(64),D3='c'.repeat(64),D4='d'.repeat(64);
let n=0;
const label=(doc:string,field:string,value:string,page:number,bbox:BBox,value_type:ExtractionLabel['value_type']='decimal'):ExtractionLabel=>({label_id:`l${++n}`,document_sha256:doc,field,occurrence:n,value_type,value,locator:{page,bbox},recorded_by:'owner',reviewed_by:'expert-1'});
const pred=(field:string,value:string,page:number,bbox:BBox):PredictedField=>({field,value,page,bbox});
const doc=(sha:string,page_count:number)=>({document_sha256:sha,page_count,bbox_space:'pdf_points_top_left' as const});

const L1=label(D1,'revenue','100',1,[0,10,10,20]),L2=label(D1,'revenue','100',1,[0,13,10,23]),L3=label(D1,'revenue','200',2,[0,10,10,20]),L4=label(D1,'revenue','300',3,[100,100,200,120]);
const P1=pred('revenue','100',1,[0,11,10,21]),P2=pred('revenue','100.00',1,[0,8,10,18]),P3=pred('revenue','200',3,[0,10,10,20]),P4=pred('revenue','301',3,[100,100,200,120]),P5=pred('revenue','999',1,[300,300,310,310]);
const adversarial:ExtractionGold={documents:[doc(D1,3)],labels:[L1,L2,L3,L4,
 label(D1,'net_income','50',1,[0,50,10,60]),
 label(D1,'fiscal_year_end','2024-12-31',1,[10,200,60,210],'date'),
 label(D1,'company_name','Acme  Corp',1,[10,300,110,320],'text')]};
const adversarialOut:ExtractionOutput[]=[{document_sha256:D1,status:'parsed',fields:[P1,P2,P3,P4,P5,
 pred('fiscal_year_end','2024-12-31',1,[10,201,60,211]),pred('company_name','Ａｃｍｅ Corp',1,[10,300,110,320]),pred('auditor','KPMG',1,[0,400,50,410])]}];

const A=label(D2,'total_assets','500',1,[0,0,100,20]),B=label(D2,'total_assets','500',2,[0,10,100,30]);
const X=pred('total_assets','500',1,[0,6,100,26]),Y=pred('total_assets','500',2,[0,4,100,24]);
const crossed:ExtractionGold={documents:[doc(D2,2)],labels:[A,B]};
const crossedOut:ExtractionOutput[]=[{document_sha256:D2,status:'parsed',fields:[X,Y]}];

describe('geometry and values',()=>{
 it('overlap gives exact inter/union; the hand-computed IoUs hold',()=>{
  expect(overlap(L1.locator.bbox,P1.bbox)).toEqual({inter:90,union:110});
  expect(overlap(L2.locator.bbox,P2.bbox)).toEqual({inter:50,union:150});
  expect(overlap(A.locator.bbox,X.bbox)).toEqual({inter:1400,union:2600});
  expect(overlap(B.locator.bbox,X.bbox)).toEqual({inter:1600,union:2400});
  expect(overlap([0,0,1,1],[5,5,6,6])).toEqual({inter:0,union:2});
 });
 it('decimal via compareWithinTolerance rel 0, text NFKC + whitespace, date ISO only, enum exact',()=>{
  expect(valuesEqual('decimal','100','100.00')).toBe(true);
  expect(valuesEqual('decimal','100','100.01')).toBe(false);
  expect(valuesEqual('decimal','1,000','1000')).toBe(false);
  expect(valuesEqual('text','Acme  Corp','Ａｃｍｅ Corp')).toBe(true);
  expect(valuesEqual('date','2024-12-31','2024-12-31')).toBe(true);
  expect(valuesEqual('date','2024-12-31','12/31/2024')).toBe(false);
  expect(valuesEqual('enum','FY','fy')).toBe(false);
 });
});

describe('matchGroup',()=>{
 it('step 1 takes the maximum matching (greedy-by-IoU would strand L2); step 2 classifies the rest',()=>{
  expect(matchGroup([L1,L2,L3,L4],[P1,P2,P3,P4,P5])).toEqual({tp:[[0,1],[1,0]],citation:[[2,2]],mismatch:[[3,3]],unpairedPredictions:[4],unpairedLabels:[]});
 });
 it('same value across pages with crossed coordinates: two TP, never a cross-page match',()=>{
  expect(matchGroup([A,B],[X,Y])).toEqual({tp:[[0,0],[1,1]],citation:[],mismatch:[],unpairedPredictions:[],unpairedLabels:[]});
 });
 it('deterministic: prediction order does not change the counts',()=>{
  const m=matchGroup([L1,L2,L3,L4],[P5,P4,P3,P2,P1]);
  expect([m.tp.length,m.citation.length,m.mismatch.length,m.unpairedPredictions.length,m.unpairedLabels.length]).toEqual([2,1,1,1,0]);
 });
});

describe('tie-breaks and robustness',()=>{
 const idOf=(ls:ExtractionLabel[],ps:PredictedField[],[l,p]:[number,number])=>JSON.stringify([ls[l].value,ls[l].locator,ps[p].value,ps[p].page,ps[p].bbox]);
 it('2x2 with every edge eligible: the higher-IoU pairing wins, whatever the prediction order',()=>{
  const La=label(D1,'f','1',1,[0,0,10,10]),Lb=label(D1,'f','1',1,[0,2,10,12]);
  const Pa=pred('f','1',1,[0,0,10,10]),Pb=pred('f','1',1,[0,2,10,12]);
  expect(matchGroup([La,Lb],[Pa,Pb]).tp).toEqual([[0,0],[1,1]]);
  expect(matchGroup([La,Lb],[Pb,Pa]).tp).toEqual([[0,1],[1,0]]);
 });
 it('step 2: an equal-value cross-page prediction is the citation, the different-value same-box one is only a FP',()=>{
  const L=label(D1,'f','5',1,[0,0,10,10]);
  const Pq=pred('f','5',2,[300,300,310,310]),Pr=pred('f','6',1,[0,0,10,10]);
  expect(matchGroup([L],[Pq,Pr])).toEqual({tp:[],citation:[[0,0]],mismatch:[],unpairedPredictions:[1],unpairedLabels:[]});
  expect(matchGroup([L],[Pr,Pq])).toEqual({tp:[],citation:[[0,1]],mismatch:[],unpairedPredictions:[0],unpairedLabels:[]});
 });
 it('permuted inputs give the same pairs (by identity), not just the same counts',()=>{
  const ls=[L1,L2,L3,L4],ps=[P1,P2,P3,P4,P5];
  const ids=(l:ExtractionLabel[],p:PredictedField[])=>{const m=matchGroup(l,p);return [m.tp,m.citation,m.mismatch].map(g=>g.map(x=>idOf(l,p,x)).sort());};
  const base=ids(ls,ps);
  expect(ids([L4,L3,L2,L1],[P5,P4,P3,P2,P1])).toEqual(base);
  expect(ids([L2,L4,L1,L3],[P3,P1,P5,P2,P4])).toEqual(base);
 });
 it('invalid boxes sort after valid ones in step 2 and never match in step 1; non-string values are unequal, not a TypeError',()=>{
  const L=label(D1,'f','5',1,[0,0,10,10]);
  const bad=pred('f','6',1,[9,9,1,1]),good=pred('f','6',1,[300,300,310,310]);
  expect(matchGroup([L],[bad,good]).mismatch).toEqual([[0,1]]);
  expect(valuesEqual('decimal','1',5 as unknown as string)).toBe(false);
  expect(valuesEqual('text','a',null as unknown as string)).toBe(false);
  expect(matchGroup([L],[pred('f',5 as unknown as string,1,[0,0,10,10])]).mismatch).toEqual([[0,0]]);
 });
 it('invalid dates never throw: unequal when predicted',()=>{
  expect(valuesEqual('date','2025-13-01','2025-13-01')).toBe(false);
  expect(valuesEqual('date','2025-02-30','2025-02-30')).toBe(false);
 });
});

describe('evaluateExtraction',()=>{
 it('adversarial fixture: per-field TP/FP/FP_citation/FN, P/R, zero support skipped; gate fail',()=>{
  const r=evaluateExtraction(adversarial,adversarialOut);
  expect(r.fields.revenue).toEqual({field:'revenue',tp:2,fp:3,fp_citation:1,fn:2,support:4,predictions:5,precision:'0.4',recall:'0.5',passed:false});
  expect(r.fields.net_income).toMatchObject({tp:0,fp:0,fn:1,support:1,predictions:0,precision:'0',recall:'0',passed:false});
  expect(r.fields.fiscal_year_end).toMatchObject({tp:1,precision:'1',recall:'1',passed:true});
  expect(r.fields.company_name).toMatchObject({tp:1,passed:true});
  expect(r.cases.map(c=>[c.case_id,c.outcome])).toEqual([
   ['auditor',{result:'skipped',reason:'zero_support'}],['company_name',{result:'pass'}],['fiscal_year_end',{result:'pass'}],
   ['net_income',{result:'fail',reason:'value'}],['revenue',{result:'fail',reason:'value'}]]);
  const rev=r.cases.find(c=>c.case_id==='revenue')!;
  expect(rev.detail).toMatchObject({tp:2,fp:3,fp_citation:1,fn:2,support:4,precision:'0.4',recall:'0.5'});
  const s=summarize(r.cases,extractionSummaryContext(GOLD));
  expect(s).toMatchObject({correctness:{pass:2,fail:2},coverage:{skipped:1},gate:'fail'});
 });
 it('crossed two-page fixture → 2 TP, field passes, gate pass',()=>{
  const r=evaluateExtraction(crossed,crossedOut);
  expect(r.fields.total_assets).toMatchObject({tp:2,fp:0,fn:0,precision:'1',recall:'1',passed:true});
  expect(summarize(r.cases,extractionSummaryContext(GOLD)).gate).toBe('pass');
 });
 it('every document parsed but TP = 0 → gate fail (not incomplete)',()=>{
  const g:ExtractionGold={documents:[doc(D3,1)],labels:[label(D3,'revenue','10',1,[0,0,10,10])]};
  const r=evaluateExtraction(g,[{document_sha256:D3,status:'parsed',fields:[pred('revenue','11',1,[0,0,10,10])]}]);
  expect(r.fields.revenue).toMatchObject({tp:0,fp:1,fn:1,passed:false});
  const s=summarize(r.cases,extractionSummaryContext(GOLD));
  expect(s.execution.read_error).toBe(0);
  expect(s.gate).toBe('fail');
 });
 it('an unparseable or missing document makes each field it carries labels for a read_error → incomplete',()=>{
  const g:ExtractionGold={documents:[doc(D3,1),doc(D4,1)],labels:[label(D3,'revenue','10',1,[0,0,10,10]),label(D4,'cash','5',1,[0,0,10,10])]};
  const r=evaluateExtraction(g,[{document_sha256:D3,status:'unparseable',error:'pdf_encrypted'}]);
  expect(r.cases.map(c=>[c.case_id,c.outcome])).toEqual([['cash',{result:'read_error',reason:'read_failed'}],['revenue',{result:'read_error',reason:'read_failed'}]]);
  expect(summarize(r.cases,extractionSummaryContext(GOLD)).gate).toBe('incomplete');
 });
 it('a broken document with no labels still makes every field a read_error listing all broken documents → incomplete',()=>{
  const g:ExtractionGold={documents:[doc(D3,1),doc(D4,1)],labels:[label(D3,'revenue','10',1,[0,0,10,10])]};
  const r=evaluateExtraction(g,[{document_sha256:D3,status:'parsed',fields:[pred('revenue','10',1,[0,0,10,10]),pred('extra','1',1,[0,0,1,1])]},{document_sha256:D4,status:'unparseable',error:'pdf_encrypted'}]);
  expect(r.cases.map(c=>[c.case_id,c.outcome,c.detail])).toEqual([['extra',{result:'read_error',reason:'read_failed'},{documents:[D4]}],['revenue',{result:'read_error',reason:'read_failed'},{documents:[D4]}]]);
  expect(summarize(r.cases,extractionSummaryContext(GOLD)).gate).toBe('incomplete');
  const missing=evaluateExtraction(g,[{document_sha256:D3,status:'parsed',fields:[]}]);   // D4 has no output at all
  expect(missing.cases.every(c=>c.outcome.result==='read_error')).toBe(true);
 });
 it('the summary gold block comes from the caller',()=>{
  const g={format:'legacy_plan2' as const,ready:false,pending:2,provenance_gaps:1};
  expect(extractionSummaryContext(g).gold).toEqual(g);
 });
 it('invalid gold is gold_invalid',()=>{
  expect(()=>evaluateExtraction({documents:[doc(D3,1)],labels:[label(D3,'fy','2025-13-01',1,[0,0,1,1],'date')]},[])).toThrow(EvalError);   // invalid gold date
  const bad=(g:ExtractionGold)=>{try{evaluateExtraction(g,[]);return 'ok';}catch(e){return e instanceof EvalError?e.code:'other';}};
  expect(bad({documents:[doc(D3,1)],labels:[label(D3,'fy','2025-13-01',1,[0,0,1,1],'date')]})).toBe('gold_invalid');
  expect(bad({documents:[doc(D3,1)],labels:[label(D3,'revenue','1',2,[0,0,1,1])]})).toBe('gold_invalid');   // page > page_count
  expect(bad({documents:[doc(D3,1)],labels:[label(D3,'revenue','1',1,[5,0,1,1])]})).toBe('gold_invalid');   // x0 ≥ x1
  expect(bad({documents:[doc(D3,1)],labels:[label(D4,'revenue','1',1,[0,0,1,1])]})).toBe('gold_invalid');   // unknown document
  const l=label(D3,'revenue','1',1,[0,0,1,1]);
  expect(bad({documents:[doc(D3,1)],labels:[l,{...l}]})).toBe('gold_invalid');   // duplicate label_id
 });
});
