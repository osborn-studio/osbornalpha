import {describe,expect,it} from 'vitest';
import type {ReportRow} from './report';
import {applyIsotonic,crossFittedEce,isotonicFit,wilson} from './calibration';

const row=(over:Partial<ReportRow>):ReportRow=>({source_id:'s1',backend:'jev',question_id:'Q2',selected:'support',confidence:0.8,abstained:false,latency_ms:100,cost_micros:10,distribution:{support:0.8,weaken:0.2},label:'support',...over});

describe('isotonicFit (PAV)',()=>{
 it('pools adjacent violators into a monotone step function',()=>{
  const fit=isotonicFit([{score:0.1,hit:0},{score:0.2,hit:1},{score:0.3,hit:0},{score:0.9,hit:1},{score:0.95,hit:1}]);
  const ps=fit.segments.map(s=>s.p);
  for(let i=1;i<ps.length;i++)expect(ps[i]).toBeGreaterThanOrEqual(ps[i-1]!);
  // 0.2 (hit) followed by 0.3 (miss) violates monotonicity: pooled to 0.5; equal-p neighbours merge.
  expect(fit.segments).toEqual([{x_min:0.1,x_max:0.1,p:0},{x_min:0.2,x_max:0.3,p:0.5},{x_min:0.9,x_max:0.95,p:1}]);
 });
 it('reproduces perfectly calibrated bins and clamps outside the fitted range',()=>{
  const points=[...Array(10)].flatMap((_,i)=>[{score:0.2,hit:i<2?1:0},{score:0.7,hit:i<7?1:0}]);
  const fit=isotonicFit(points);
  expect(applyIsotonic(fit,0.2)).toBeCloseTo(0.2,6);
  expect(applyIsotonic(fit,0.7)).toBeCloseTo(0.7,6);
  expect(applyIsotonic(fit,0.45)).toBeCloseTo(0.45,6); // linear interpolation between segments
  expect(applyIsotonic(fit,0.0)).toBeCloseTo(0.2,6);
  expect(applyIsotonic(fit,1.0)).toBeCloseTo(0.7,6);
  expect(isotonicFit([]).segments).toEqual([]);
 });
});

describe('wilson',()=>{
 it('matches reference intervals and handles empty samples',()=>{
  const w=wilson(90,100);
  expect(w.low).toBeCloseTo(0.8256,3);expect(w.high).toBeCloseTo(0.9448,3);
  expect(wilson(0,0)).toEqual({low:null,high:null});
  expect(wilson(0,10).low).toBe(0);
 });
});

describe('crossFittedEce',()=>{
 it('reduces ECE for an over-confident but rankable backend and is null under 30 labels',()=>{
  // Confidence 0.95 but only 60% correct; confidence 0.6 but 100% correct: isotonic fixes both.
  const rows:ReportRow[]=[];
  for(let i=0;i<50;i++)rows.push(row({confidence:0.95,label:i%5<3?'support':'weaken'}));
  for(let i=0;i<50;i++)rows.push(row({confidence:0.6,label:'support'}));
  const out=crossFittedEce(rows);
  expect(out.before).toBeGreaterThan(0.25);
  expect(out.after).not.toBeNull();
  expect(out.after!).toBeLessThan(out.before!);
  expect(crossFittedEce(rows.slice(0,20)).after).toBeNull();
 });
});

import {classMetrics,evaluateStopRules,proposeThresholds} from './calibration';

const q1=(p:number,label:string|null,backend='jev',abstained=false):ReportRow=>row({question_id:'Q1',backend,confidence:null,distribution:{true:p,false:1-p},selected:abstained?null:p>0.6?'true':p<0.4?'false':null,abstained:abstained||(p>=0.4&&p<=0.6),label});
const q2=(conf:number,selected:string,label:string|null,backend='jev'):ReportRow=>row({question_id:'Q2',backend,confidence:conf,selected:conf<0.6?null:selected,abstained:conf<0.6,distribution:{[selected]:0.5+conf/2},label});

describe('classMetrics',()=>{
 it('reports important recall (abstentions are misses), false-support rate and intervals per backend',()=>{
  const rows=[
   q1(0.9,'true'),q1(0.8,'true'),q1(0.5,'true'),q1(0.2,'true'),q1(0.1,'false'),q1(0.95,'false'),
   q2(0.9,'support','support'),q2(0.9,'support','weaken'),q2(0.9,'weaken','weaken'),q2(0.3,'support','weaken'),q2(0.8,'support',null),
   q1(0.9,'true','rule'),
  ];
  const m=classMetrics(rows);
  const jev=m.find(b=>b.backend==='jev')!;
  expect(jev.important_recall).toMatchObject({k:2,n:4,rate:0.5});
  expect(jev.important_recall.low).toBeGreaterThan(0);expect(jev.important_recall.high).toBeLessThan(1);
  expect(jev.false_support).toMatchObject({k:1,n:3});
  expect(jev.false_support.rate).toBeCloseTo(1/3,6);
  expect(jev.questions.find(q=>q.question_id==='Q1')).toMatchObject({n:6,labeled:6});
  expect(jev.questions.find(q=>q.question_id==='Q2')?.ece_after).toBeNull();
  const rule=m.find(b=>b.backend==='rule')!;
  expect(rule.important_recall).toMatchObject({k:1,n:1,rate:1});
  expect(rule.false_support).toMatchObject({k:0,n:0,rate:null});
 });
});

describe('proposeThresholds',()=>{
 it('finds Q1 thresholds meeting recall ≥ 0.9 and abstention ≤ 30% when feasible, and reports infeasibility otherwise',()=>{
  const rows:ReportRow[]=[];
  // 40 relevant materials scored high (0.75–0.95), 40 irrelevant scored low (0.05–0.3): a clean separation.
  for(let i=0;i<40;i++){rows.push(q1(0.75+(i%5)*0.05,'true'));rows.push(q1(0.05+(i%6)*0.05,'false'));}
  const out=proposeThresholds(rows).find(p=>p.question_id==='Q1')!;
  expect(out.status).toBe('proposed');
  expect(out.proposed).toMatchObject({relevant_above:expect.any(Number),irrelevant_below:expect.any(Number)});
  expect(out.proposed!.relevant_above).toBeLessThan(0.75);
  expect(out.proposed!.irrelevant_below).toBeGreaterThan(0.3);
  expect(out.metrics).toMatchObject({recall:1,abstain_rate:0});
  expect(out.current).toEqual({irrelevant_below:0.4,relevant_above:0.6});
  // Hopeless scores: recall and precision cannot both be met.
  const noisy:ReportRow[]=[];
  for(let i=0;i<60;i++)noisy.push(q1(0.5+((i*7)%10-5)*0.01,i%2?'true':'false'));
  const bad=proposeThresholds(noisy).find(p=>p.question_id==='Q1')!;
  expect(['infeasible','proposed']).toContain(bad.status);
  if(bad.status==='infeasible')expect(bad.metrics.recall).toBeDefined();
 });
 it('proposes Q2 min_confidence keeping false-support ≤ 5% with the widest coverage, and flags insufficient labels',()=>{
  const rows:ReportRow[]=[];
  for(let i=0;i<30;i++)rows.push(q2(0.9,'support','support'));
  for(let i=0;i<10;i++)rows.push(q2(0.7,'support',i<8?'support':'weaken'));
  for(let i=0;i<10;i++)rows.push(q2(0.62,'support','weaken'));
  const q2p=proposeThresholds(rows).find(p=>p.question_id==='Q2')!;
  expect(q2p.status).toBe('proposed');
  expect(q2p.proposed!.min_confidence).toBeGreaterThanOrEqual(0.7);
  expect(q2p.metrics.false_support_rate).toBeLessThanOrEqual(0.05);
  expect(proposeThresholds(rows.slice(0,10)).find(p=>p.question_id==='Q2')!.status).toBe('insufficient_labels');
  expect(proposeThresholds(rows).find(p=>p.question_id==='Q1')!.status).toBe('insufficient_labels');
 });
});

describe('evaluateStopRules (§10.3)',()=>{
 const metric=(backend:string,over:Record<string,unknown>={})=>({backend,labels:400,important_recall:{k:90,n:100,rate:0.9,low:0.83,high:0.94},false_support:{k:2,n:100,rate:0.02,low:0,high:0.07},
  questions:[{question_id:'Q1',n:100,labeled:100,decided:100,accuracy:0.9,abstain_rate:0.1,ece_before:0.05,ece_after:0.03},{question_id:'Q2',n:100,labeled:100,decided:100,accuracy:0.88,abstain_rate:0.2,ece_before:0.05,ece_after:0.03}],...over}) as any;
 it('keeps jev on Q3/Q4 only when recall or false-support break, and never concludes on thin evidence',()=>{
  const verdicts=evaluateStopRules([metric('jev',{important_recall:{k:80,n:100,rate:0.8,low:0.7,high:0.87}})]);
  expect(verdicts.find(v=>v.rule==='jev_q3q4_only')).toMatchObject({triggered:true});
  const thin=evaluateStopRules([metric('jev',{labels:12,important_recall:{k:8,n:12,rate:0.67,low:0.39,high:0.86}})]);
  expect(thin.find(v=>v.rule==='jev_q3q4_only')).toMatchObject({triggered:false,status:'insufficient_evidence'});
 });
 it('does not introduce jev when rule or deepseek is within 3 points with fewer abstentions',()=>{
  const verdicts=evaluateStopRules([metric('jev'),metric('rule',{questions:[{question_id:'Q1',n:100,labeled:100,decided:100,accuracy:0.89,abstain_rate:0.0,ece_before:0.1,ece_after:null},{question_id:'Q2',n:100,labeled:100,decided:100,accuracy:0.87,abstain_rate:0.05,ece_before:0.1,ece_after:null}]})]);
  expect(verdicts.find(v=>v.rule==='do_not_introduce_jev')).toMatchObject({triggered:true});
 });
 it('switches to the local probe after 300 labels when it is within 2 points, and flags a >5 point drift against a baseline',()=>{
  const verdicts=evaluateStopRules([metric('jev'),metric('local_probe',{questions:[{question_id:'Q1',n:100,labeled:100,decided:100,accuracy:0.89,abstain_rate:0.1,ece_before:0.05,ece_after:0.03},{question_id:'Q2',n:100,labeled:100,decided:100,accuracy:0.87,abstain_rate:0.2,ece_before:0.05,ece_after:0.03}]})],
   {metrics:[metric('jev',{questions:[{question_id:'Q1',n:100,labeled:100,decided:100,accuracy:0.8,abstain_rate:0.1,ece_before:0.05,ece_after:0.03},{question_id:'Q2',n:100,labeled:100,decided:100,accuracy:0.88,abstain_rate:0.2,ece_before:0.05,ece_after:0.03}]})]});
  expect(verdicts.find(v=>v.rule==='switch_local_probe')).toMatchObject({triggered:true});
  expect(verdicts.find(v=>v.rule==='lock_version_recalibrate')).toMatchObject({triggered:true});
 });
});

import {buildCalibrationArtifact,renderCalibrationMarkdown,runCalibrationCli} from './calibration';
import {mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

describe('artifact, markdown and CLI runner',()=>{
 const rows=()=>{const out:ReportRow[]=[];for(let i=0;i<40;i++){out.push(q1(0.75+(i%5)*0.05,'true'));out.push(q1(0.05+(i%6)*0.05,'false'));out.push(q2(0.9,'support','support'));}return out;};
 it('builds a deterministic artifact with metrics, proposals and verdicts',()=>{
  const a=buildCalibrationArtifact({rows:rows(),since:null,generatedAt:'2026-09-26T00:00:00.000Z',baseline:null});
  expect(a).toMatchObject({schema_name:'alpha-calibration-report',schema_version:'1.0',question_set_version:'v1.0',generated_at:'2026-09-26T00:00:00.000Z',rows:120,labeled:120});
  expect(a.metrics.map(m=>m.backend)).toEqual(['jev']);
  expect(a.proposals.find(p=>p.question_id==='Q1')?.status).toBe('proposed');
  expect(a.stop_rules.map(v=>v.rule)).toEqual(['jev_q3q4_only','do_not_introduce_jev','switch_local_probe','lock_version_recalibrate']);
  expect(JSON.stringify(a)).toBe(JSON.stringify(buildCalibrationArtifact({rows:rows(),since:null,generatedAt:'2026-09-26T00:00:00.000Z',baseline:null})));
  const md=renderCalibrationMarkdown(a);
  for(const h of ['## 类① 指标','## 阈值重拟','## 停止 / 换后端']) expect(md).toContain(h);
  expect(md).toContain('important_recall');
  expect(md).not.toMatch(/undefined/);
 });
 it('the runner validates arguments, writes dated json + md files and never prints row content',async()=>{
  const dir=mkdtempSync(path.join(realpathSync(tmpdir()),'calib-'));
  try{
   const load=async()=>rows();
   expect(await runCalibrationCli([],{load})).toMatchObject({exitCode:2});
   expect(await runCalibrationCli(['--out','relative'],{load})).toMatchObject({exitCode:2});
   expect(await runCalibrationCli(['--out',dir,'--since','yesterday'],{load})).toMatchObject({exitCode:2});
   const ok=await runCalibrationCli(['--out',dir],{load,now:()=>'2026-09-26T05:06:07.000Z'});
   expect(ok.exitCode).toBe(0);
   const summary=JSON.parse(ok.output);
   expect(summary).toMatchObject({rows:120,labeled:120,json:path.join(dir,'2026-09-26.json'),markdown:path.join(dir,'2026-09-26.md')});
   expect(readFileSync(path.join(dir,'2026-09-26.md'),'utf8')).toContain('## 阈值重拟');
   const again=await runCalibrationCli(['--out',dir,'--baseline',path.join(dir,'2026-09-26.json')],{load,now:()=>'2026-09-27T00:00:00.000Z'});
   expect(again.exitCode).toBe(0);
   expect(JSON.parse(readFileSync(path.join(dir,'2026-09-27.json'),'utf8')).stop_rules.find((v:any)=>v.rule==='lock_version_recalibrate')).toMatchObject({status:'evaluated',triggered:false});
   expect(ok.output).not.toContain('support');
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});

describe('Codex round 1 regressions',()=>{
 it('pools equal scores before PAV so the fit is order-independent',()=>{
  expect(applyIsotonic(isotonicFit([{score:0.8,hit:0},{score:0.8,hit:1}]),0.8)).toBeCloseTo(0.5,6);
  expect(applyIsotonic(isotonicFit([{score:0.8,hit:1},{score:0.8,hit:0}]),0.8)).toBeCloseTo(0.5,6);
  expect(isotonicFit([{score:0.8,hit:1},{score:0.8,hit:0}]).segments).toEqual([{x_min:0.8,x_max:0.8,p:0.5}]);
 });
 it('evaluates Q3/Q4 thresholds with the runtime fallback prediction instead of abstentions',()=>{
  // Below the threshold the runtime answers "unknown"; a label of "unknown" is then a hit, not an abstention.
  const q3=(i:number,conf:number,selected:string,label:string):ReportRow=>row({question_id:'Q3',source_id:`m${i}`,confidence:conf,selected,abstained:false,distribution:{[selected]:0.5+conf/2},label});
  const rows:ReportRow[]=[];
  for(let i=0;i<20;i++)rows.push(q3(i,0.9,'filing_or_regulator','filing_or_regulator'));
  for(let i=0;i<20;i++)rows.push(q3(100+i,0.4,'analyst_or_media','unknown'));
  const p=proposeThresholds(rows).find(x=>x.question_id==='Q3')!;
  expect(p.status).toBe('proposed');
  expect(p.proposed!.min_confidence).toBeGreaterThan(0.4);
  expect(p.metrics.accuracy).toBe(1);
  expect(p.metrics).not.toHaveProperty('coverage');
 });
 it('gates stop verdicts on the compared samples, not only on jev totals',()=>{
  const metric=(backend:string,labels:number,q:Array<[string,number,number|null]>)=>({backend,labels,important_recall:{k:90,n:100,rate:0.9,low:0.83,high:0.94},false_support:{k:2,n:100,rate:0.02,low:0,high:0.07},
   questions:q.map(([id,labeled,acc])=>({question_id:id,n:labeled,labeled,decided:labeled,accuracy:acc,abstain_rate:0.1,ece_before:null,ece_after:null}))}) as any;
  const v=evaluateStopRules([metric('jev',400,[['Q1',200,0.9],['Q4',200,0.9]]),metric('local_probe',1,[['Q4',1,1]])]);
  expect(v.find(x=>x.rule==='switch_local_probe')).toMatchObject({triggered:false,status:'insufficient_evidence'});
  const thinQ1=evaluateStopRules([{...metric('jev',400,[['Q4',400,0.9]]),important_recall:{k:2,n:3,rate:0.67,low:0.2,high:0.94},false_support:{k:0,n:2,rate:0,low:0,high:0.66}}]);
  expect(thinQ1.find(x=>x.rule==='jev_q3q4_only')).toMatchObject({triggered:false,status:'insufficient_evidence'});
  const drift=evaluateStopRules([metric('jev',400,[['Q1',200,0.9]])],{metrics:[metric('jev',5,[['Q1',5,0.6]])]});
  expect(drift.find(x=>x.rule==='lock_version_recalibrate')).toMatchObject({triggered:false,status:'insufficient_evidence'});
 });
 it('deduplicates material-level Q3 judgments before calibration',()=>{
  const dup:ReportRow[]=[];
  for(let i=0;i<30;i++)dup.push(row({question_id:'Q3',source_id:'same',confidence:0.9,selected:'filing_or_regulator',label:'filing_or_regulator',distribution:{filing_or_regulator:0.9}}));
  const m=classMetrics(dup)[0]!.questions.find(q=>q.question_id==='Q3')!;
  expect(m.labeled).toBe(1);
  expect(m.ece_after).toBeNull();
  expect(proposeThresholds(dup).find(p=>p.question_id==='Q3')!.status).toBe('insufficient_labels');
 });
 it('persists per backend × question isotonic fits in the artifact',()=>{
  const rows:ReportRow[]=[];
  for(let i=0;i<40;i++){rows.push(q1(0.75+(i%5)*0.05,'true'));rows.push(q1(0.05+(i%6)*0.05,'false'));}
  const a=buildCalibrationArtifact({rows,since:null,generatedAt:'2026-09-26T00:00:00.000Z',baseline:null});
  expect(a.fits).toEqual([expect.objectContaining({backend:'jev',question_id:'Q1',labeled:80})]);
  expect(a.fits[0]!.segments.length).toBeGreaterThan(0);
  expect(renderCalibrationMarkdown(a)).toContain('## Isotonic 拟合');
 });
});

describe('Codex round 2 regressions',()=>{
 it('keeps score-less abstentions as unavoidable misses when proposing Q1 thresholds',()=>{
  const rows:ReportRow[]=[];
  for(let i=0;i<30;i++)rows.push(q1(0.9,'true'));
  for(let i=0;i<30;i++)rows.push(row({question_id:'Q1',confidence:null,distribution:{},selected:null,abstained:true,label:'true'}));
  const p=proposeThresholds(rows).find(x=>x.question_id==='Q1')!;
  expect(p.status).toBe('infeasible');
  expect(p.metrics.recall).toBeCloseTo(0.5,6);
  expect(p.metrics.abstain_rate).toBeCloseTo(0.5,6);
  // Fitting needs 30 usable scores, not 30 labels.
  const thin=[...rows.slice(0,10),...rows.slice(30)];
  expect(proposeThresholds(thin).find(x=>x.question_id==='Q1')!.status).toBe('insufficient_labels');
 });
 it('evaluates the two jev stop conditions independently',()=>{
  const m=(recall:{k:number;n:number},fs:{k:number;n:number})=>({backend:'jev',labels:400,important_recall:{...recall,rate:recall.n?recall.k/recall.n:null,low:0,high:1},false_support:{...fs,rate:fs.n?fs.k/fs.n:null,low:0,high:1},questions:[]}) as any;
  // Recall clearly broken with ample evidence, Q2 thin: still a verdict.
  expect(evaluateStopRules([m({k:50,n:100},{k:0,n:3})]).find(v=>v.rule==='jev_q3q4_only')).toMatchObject({triggered:true,status:'evaluated'});
  // Recall fine with ample evidence, Q2 thin: cannot conclude that neither fails.
  expect(evaluateStopRules([m({k:95,n:100},{k:0,n:3})]).find(v=>v.rule==='jev_q3q4_only')).toMatchObject({triggered:false,status:'insufficient_evidence'});
  // Both ample and fine.
  expect(evaluateStopRules([m({k:95,n:100},{k:1,n:100})]).find(v=>v.rule==='jev_q3q4_only')).toMatchObject({triggered:false,status:'evaluated'});
 });
 it('gates accuracy comparisons on decided labels, not on labels that were abstentions',()=>{
  const metric=(backend:string,decided:number,acc:number)=>({backend,labels:400,important_recall:{k:90,n:100,rate:0.9,low:0.83,high:0.94},false_support:{k:2,n:100,rate:0.02,low:0,high:0.07},
   questions:[{question_id:'Q4',n:400,labeled:100,decided,accuracy:acc,abstain_rate:0.5,ece_before:null,ece_after:null}]}) as any;
  const v=evaluateStopRules([metric('jev',100,0.9),metric('local_probe',1,1)]);
  expect(v.find(x=>x.rule==='switch_local_probe')).toMatchObject({triggered:false,status:'insufficient_evidence'});
  const rows:ReportRow[]=[];
  for(let i=0;i<40;i++)rows.push(q2(0.9,'support','support'));
  for(let i=0;i<40;i++)rows.push(q2(0.3,'support','support'));
  expect(classMetrics(rows)[0]!.questions.find(q=>q.question_id==='Q2')).toMatchObject({labeled:80,decided:40});
 });
});
