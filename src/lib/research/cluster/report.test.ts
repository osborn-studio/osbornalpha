import {describe,expect,it} from 'vitest';
import {SAMPLE_COLUMNS,buildSampleRows,parseCsv,pickSample,summarizeLabels,toCsv,wilson} from './report';

describe('wilson',()=>{
 it('gives the textbook 95% interval and handles the empty sample',()=>{
  const w=wilson(90,100);
  expect(w.low).toBeCloseTo(0.8256,3);expect(w.high).toBeCloseTo(0.9448,3);
  expect(wilson(0,0)).toEqual({low:0,high:1});
  expect(wilson(0,10).low).toBe(0);expect(wilson(10,10).high).toBe(1);
 });
});

describe('csv round trip',()=>{
 it('quotes commas, quotes and newlines, and parses them back',()=>{
  const rows=[{a:'x,y',b:'say "hi"',c:'line1\nline2'},{a:'',b:'plain',c:'中文'}];
  const text=toCsv(['a','b','c'],rows);
  expect(text.split('\n')[0]).toBe('a,b,c');
  expect(parseCsv(text)).toEqual(rows);
 });
});

describe('pickSample',()=>{
 const src=(i:number,cluster:string)=>({id:`s${i}`,title:`t${i}`,url:null,cluster_id:cluster,cluster_first:i%2===0,entity_ids:[] as string[]});
 it('takes half from multi-member clusters when available and is deterministic for a seed',()=>{
  const multi=Array.from({length:10},(_,i)=>src(i,`c${Math.floor(i/2)}`));
  const single=Array.from({length:20},(_,i)=>src(100+i,`z${i}`));
  const a=pickSample([...multi,...single],10,7),b=pickSample([...multi,...single],10,7);
  expect(a.map(s=>s.id)).toEqual(b.map(s=>s.id));
  expect(a).toHaveLength(10);
  expect(a.filter(s=>s.cluster_id.startsWith('c'))).toHaveLength(5);
  expect(new Set(a.map(s=>s.id)).size).toBe(10);
 });
 it('falls back to singletons when there are too few duplicates, and never exceeds the population',()=>{
  const rows=[src(1,'c0'),src(2,'c0'),src(3,'z1'),src(4,'z2')];
  const out=pickSample(rows,10,1);
  expect(out).toHaveLength(4);
 });
});

describe('buildSampleRows',()=>{
 it('emits the labeling columns with cluster size, a peer title, aligned and ambiguous entities, and empty label cells',()=>{
  const a={id:'a',title:'A title',url:'https://x/a',cluster_id:'c',cluster_first:true,entity_ids:['e1']};
  const b={id:'b',title:'B title',url:null,cluster_id:'c',cluster_first:false,entity_ids:[]};
  const rows=buildSampleRows([a],[a,b],{a:[{entity_id:'e1',status:'aligned'},{entity_id:'e2',status:'ambiguous'}]},{e1:'Hundsun',e2:'RoyalFlush'});
  expect(Object.keys(rows[0])).toEqual([...SAMPLE_COLUMNS]);
  expect(rows[0]).toMatchObject({source_id:'a',cluster_size:'2',cluster_peer_title:'B title',aligned_entities:'Hundsun',ambiguous_candidates:'RoyalFlush',label_cluster_correct:'',label_alignment_correct:''});
 });
});

describe('summarizeLabels',()=>{
 it('counts y/n per label column, ignores blanks, and reports Wilson intervals',()=>{
  const labeled=[{label_cluster_correct:'y',label_alignment_correct:'y'},{label_cluster_correct:'Y',label_alignment_correct:'n'},{label_cluster_correct:'n',label_alignment_correct:''},{label_cluster_correct:'',label_alignment_correct:'y'}];
  const s=summarizeLabels(labeled);
  expect(s.cluster).toMatchObject({correct:2,labeled:3,rate:2/3});
  expect(s.alignment).toMatchObject({correct:2,labeled:3});
  expect(s.cluster.ci.low).toBeGreaterThan(0);expect(s.cluster.ci.high).toBeLessThan(1);
  expect(s.sample_size).toBe(4);
 });
});
