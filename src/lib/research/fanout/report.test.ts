import {describe,expect,it} from 'vitest';
import {summarize,type ReportRow} from './report';

const row=(over:Partial<ReportRow>):ReportRow=>({source_id:'s1',backend:'jev',question_id:'Q2',selected:'support',confidence:0.8,abstained:false,latency_ms:100,cost_micros:10,distribution:{support:0.8,weaken:0.2},label:null,...over});

describe('summarize (§10.1 class ① metrics)',()=>{
 it('computes accuracy over labeled non-abstained rows, abstain rate over all rows, and latency percentiles',()=>{
  const rows=[
   row({label:'support'}),row({label:'weaken',selected:'support',confidence:0.9,latency_ms:300}),row({abstained:true,selected:null,confidence:0.5,label:'support',latency_ms:50}),
   row({label:null,latency_ms:200}),
  ];
  const m=summarize(rows).find(x=>x.backend==='jev'&&x.question_id==='Q2')!;
  expect(m).toMatchObject({n:4,labeled:3,abstain_rate:0.25,accuracy:0.5,p50_latency_ms:150,p95_latency_ms:285}); // linear interpolation over [50,100,200,300]
  expect(m.cost_micros_per_1k).toBe(10_000);
 });
 it('returns null accuracy and ECE when nothing is labeled, but still counts and prices the rows',()=>{
  const m=summarize([row({}),row({abstained:true,selected:null})])[0];
  expect(m).toMatchObject({n:2,labeled:0,accuracy:null,ece:null,abstain_rate:0.5});
 });
 it('computes ECE from confidence bins for choices and from P(true) for nouls',()=>{
  // Two perfectly calibrated bins: confidence 0.9 correct, confidence 0.3 wrong → |acc−conf| weighted.
  const rows=[row({confidence:0.9,label:'support'}),row({confidence:0.9,label:'support'}),row({confidence:0.3,label:'weaken',selected:'support'})];
  const m=summarize(rows)[0];
  expect(m.ece).toBeCloseTo((2/3)*Math.abs(1-0.9)+(1/3)*Math.abs(0-0.3),6);
  const nouls=[row({question_id:'Q1',selected:'true',confidence:null,distribution:{true:0.95,false:0.05},label:'true'}),row({question_id:'Q1',selected:'false',confidence:null,distribution:{true:0.1,false:0.9},label:'true'})];
  const n=summarize(nouls)[0];
  expect(n.ece).toBeCloseTo(0.5*Math.abs(1-0.95)+0.5*Math.abs(1-0.1),6);
 });
 it('deduplicates material-level Q3 by (source_id, backend) and groups by backend × question',()=>{
  const rows=[row({question_id:'Q3',source_id:'s1'}),row({question_id:'Q3',source_id:'s1'}),row({question_id:'Q3',source_id:'s2'}),row({question_id:'Q1',backend:'rule'})];
  const out=summarize(rows);
  expect(out.map(x=>`${x.backend}:${x.question_id}:${x.n}`).sort()).toEqual(['jev:Q3:2','rule:Q1:1']);
 });
});
