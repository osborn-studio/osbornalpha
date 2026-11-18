// Topic spec §7.2, A9: summary citations and read-time masking.
import {describe,expect,it} from 'vitest';
import type {RenderedSummary} from '@/lib/topics/types';
import {summaryModel} from './summary-model';
const summary:RenderedSummary&{hidden_points:number}={facts:[{fact_id:'ev:1',text:'Rate is 4%.',refs:[1]},{fact_id:'ev:2',text:'',refs:[2]}],points:[{text:'Funding conditions may tighten.',fact_ids:['ev:1'],refs:[1]}],counterpoints:[{text:'Demand may remain resilient.',fact_ids:['ev:1'],refs:[1]}],incomparable:[{a:1,b:2}],hidden_points:2,prompt_version:'v1',validator_version:'v1',provider:'fixture',model:'fixture'};
describe('summary panel model',()=>{
 it('keeps non-empty refs on every sentence and masks removed facts',()=>{
  const m=summaryModel(summary);
  for(const sentence of [...m.facts,...m.points,...m.counterpoints])expect(sentence.refs.length).toBeGreaterThan(0);
  expect(m.facts[1]).toEqual({fact_id:'ev:2',text:'',refs:[2],noticeKey:'summary.masked'});
  expect(m.hidden_points).toBe(2);expect(m.incomparable).toEqual([{a:1,b:2}]);
  for(const point of [...m.points,...m.counterpoints])expect(point.text).not.toMatch(/\d/);
 });
});
