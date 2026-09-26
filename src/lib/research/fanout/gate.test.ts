import {describe,expect,it} from 'vitest';
import {applyRelevanceGate} from './gate';
import type {BackendAnswer} from './backends/types';

const T='11111111-1111-4111-8111-111111111111',U='33333333-3333-4333-8333-333333333333';
const a=(thesis_id:string,question_id:BackendAnswer['question_id'],distribution:Record<string,number>,selected:string|null,abstained=false):BackendAnswer=>({thesis_id,question_id,distribution,selected,confidence:0.9,abstained});

describe('applyRelevanceGate',()=>{
 it('abstains Q2/Q4/Q5 for a thesis whose Q1 is not relevant, keeps Q3 and relevant theses untouched',()=>{
  const answers=[a(T,'Q1',{true:0.1,false:0.9},'false'),a(T,'Q2',{support:0.9,weaken:0.1},'support'),a(T,'Q4',{completed:1},'completed'),a(T,'Q5',{true:1},'true'),a(T,'Q3',{unknown:1},'unknown'),
   a(U,'Q1',{true:0.9,false:0.1},'true'),a(U,'Q2',{support:0.9,weaken:0.1},'support')];
  const out=applyRelevanceGate(answers);
  const f=(t:string,q:string)=>out.find(x=>x.thesis_id===t&&x.question_id===q)!;
  for(const q of ['Q2','Q4','Q5']) expect(f(T,q)).toMatchObject({abstained:true,selected:null});
  expect(f(T,'Q2').distribution).toEqual({support:0.9,weaken:0.1}); // evidence kept for the ledger
  expect(f(T,'Q3')).toMatchObject({selected:'unknown',abstained:false});
  expect(f(U,'Q2')).toMatchObject({selected:'support',abstained:false});
  expect(out).toHaveLength(answers.length);
 });
 it('treats an abstained or missing Q1 as not relevant',()=>{
  const out=applyRelevanceGate([a(T,'Q1',{true:0.5,false:0.5},null,true),a(T,'Q2',{support:1},'support'),a(U,'Q2',{support:1},'support')]);
  expect(out.filter(x=>x.question_id==='Q2').every(x=>x.abstained&&x.selected===null)).toBe(true);
 });
});
