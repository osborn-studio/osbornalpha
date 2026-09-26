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
