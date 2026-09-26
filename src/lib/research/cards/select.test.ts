import {describe,expect,it} from 'vitest';
import {selectCards} from './select';
import type {ThesisEvidence,EvidenceItem} from './evidence';

const item=(source_id:string,unfamiliar=false):EvidenceItem=>({source_id,source_version:'1',judgment_ids:[],origin:'unknown',host:'h',unfamiliar,direction:'support'});
const te=(thesis_id:string,support:number,counter:number,unfamiliar=0):ThesisEvidence=>({thesis_id,
 support:Array.from({length:support},(_,i)=>item(`${thesis_id}-s${i}`,i<unfamiliar)),
 counter:Array.from({length:counter},(_,i)=>({...item(`${thesis_id}-c${i}`),direction:'counter'})),
 independent_sources:support+counter,unfamiliar_hosts:unfamiliar?['x']:[]});

describe('selectCards',()=>{
 it('takes up to four evidence cards by volume plus the counter card for the thesis with most counter-evidence',()=>{
  const out=selectCards([te('t1',5,0),te('t2',4,2),te('t3',3,0),te('t4',2,0),te('t5',1,0),te('t6',1,1)]);
  expect(out.cards.map(c=>`${c.kind}:${c.thesis_id}`)).toEqual(['evidence:t2','evidence:t1','evidence:t3','evidence:t4','counter:t2']); // t2 has 6 items, t1 has 5
  expect(out.counter_card).toBe('counter_evidence');
 });
 it('falls back to the thesis with unfamiliar sources when nobody has counter-evidence',()=>{
  const out=selectCards([te('t1',3,0),te('t2',2,0,1)]);
  expect(out.cards.map(c=>`${c.kind}:${c.thesis_id}`)).toEqual(['evidence:t1','evidence:t2','counter:t2']);
  expect(out.counter_card).toBe('unfamiliar_source');
 });
 it('emits no counter card when there is neither, and never more than five cards',()=>{
  const out=selectCards([te('t1',1,0),te('t2',1,0)]);
  expect(out.cards).toHaveLength(2);expect(out.counter_card).toBe('none');
  const many=selectCards(Array.from({length:9},(_,i)=>te(`t${i}`,9-i,i===8?1:0)));
  expect(many.cards).toHaveLength(5);
  expect(many.cards.filter(c=>c.kind==='counter')).toHaveLength(1);
 });
 it('returns nothing for no evidence',()=>{
  expect(selectCards([])).toEqual({cards:[],counter_card:'none'});
 });
});
